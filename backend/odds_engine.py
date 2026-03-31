"""
BookmakerOddsEngine - Proper bookmaker odds with margin, exposure tracking,
dynamic adjustment, and session market generation.

Key principles:
1. Never use API odds directly - apply margin so house always profits
2. Track money on both sides - adjust if imbalance detected
3. Session markets use run rate + target to generate YES/NO odds
4. No situation where user wins on both sides simultaneously
"""

import math
import time
import threading
import logging
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ==================== BOOKMAKER ODDS ENGINE ====================

class BookmakerOddsEngine:
    """
    Centralized odds engine that:
    - Converts raw API odds to margin-applied bookmaker odds
    - Tracks exposure (total money) per team per match
    - Dynamically adjusts odds based on bet flow
    - Generates session market YES/NO odds
    - Detects cricket events (4, 6, wicket) from score changes
    """

    DEFAULT_MARGIN = 0.07  # 7% default margin (range 5-10%)
    MIN_MARGIN = 0.05
    MAX_MARGIN = 0.10
    MIN_ODDS = 1.01
    MAX_ODDS = 100.0
    EXPOSURE_ADJUSTMENT_FACTOR = 0.02  # How much to shift odds per exposure imbalance unit

    def __init__(self):
        self._lock = threading.Lock()
        # match_id -> { "home_back_total": float, "home_lay_total": float,
        #               "away_back_total": float, "away_lay_total": float }
        self._exposure: Dict[str, Dict[str, float]] = {}
        # match_id -> { "raw_home": float, "raw_away": float, "last_update": float }
        self._raw_odds: Dict[str, Dict] = {}
        # match_id -> { "runs": int, "wickets": int, "overs": float, "fours": int, "sixes": int,
        #               "last_event": str, "event_time": float, "suspended": bool }
        self._score_state: Dict[str, Dict] = {}
        # match_id -> { market_name: { "suspended": bool, "suspend_time": float } }
        self._market_status: Dict[str, Dict] = {}

    # ==================== MARGIN APPLICATION ====================

    def apply_margin(self, home_odds: float, away_odds: float,
                     margin: float = None) -> Tuple[float, float, float, float]:
        """
        Convert raw API odds to margin-applied back/lay odds.

        Steps:
        1. Convert odds to implied probabilities
        2. Scale probabilities so they sum to > 1 (apply margin)
        3. Convert back to odds
        4. Generate lay odds with spread

        Returns: (home_back, home_lay, away_back, away_lay)
        """
        if not home_odds or not away_odds or home_odds <= 1 or away_odds <= 1:
            return (home_odds, home_odds, away_odds, away_odds)

        margin = margin or self.DEFAULT_MARGIN

        # Step 1: Convert to implied probabilities
        home_prob = 1.0 / home_odds
        away_prob = 1.0 / away_odds
        total_prob = home_prob + away_prob

        # Step 2: Scale so total > 1 by adding margin
        # Target total = 1 + margin (e.g., 1.07 for 7% margin)
        target_total = 1.0 + margin

        # Scale each probability proportionally
        scale_factor = target_total / total_prob
        home_prob_margined = home_prob * scale_factor
        away_prob_margined = away_prob * scale_factor

        # Clamp probabilities
        home_prob_margined = max(0.01, min(0.99, home_prob_margined))
        away_prob_margined = max(0.01, min(0.99, away_prob_margined))

        # Step 3: Convert back to odds (these are the BACK odds)
        home_back = round(max(self.MIN_ODDS, min(self.MAX_ODDS, 1.0 / home_prob_margined)), 2)
        away_back = round(max(self.MIN_ODDS, min(self.MAX_ODDS, 1.0 / away_prob_margined)), 2)

        # Step 4: Lay odds = slightly higher than back (spread ensures house profit)
        # Spread scales with odds magnitude
        home_lay = self._calculate_lay(home_back)
        away_lay = self._calculate_lay(away_back)

        # Safety check: verify both sides can't both profit
        self._verify_no_arbitrage(home_back, home_lay, away_back, away_lay)

        return (home_back, home_lay, away_back, away_lay)

    def _calculate_lay(self, back_odds: float) -> float:
        """Calculate lay odds with spread proportional to back odds magnitude."""
        if not back_odds or back_odds <= 1:
            return back_odds
        # Spread = max(0.02, back / 15) - slightly wider than before for house edge
        spread = max(0.02, round(back_odds / 15, 2))
        return round(min(self.MAX_ODDS, back_odds + spread), 2)

    def _verify_no_arbitrage(self, hb: float, hl: float, ab: float, al: float):
        """
        Verify there's no arbitrage opportunity.
        If backing home at hb and backing away at ab, total implied prob must be > 1.
        """
        if hb and ab and hb > 1 and ab > 1:
            total = (1.0 / hb) + (1.0 / ab)
            if total < 1.0:
                logger.warning(f"Arbitrage detected! hb={hb}, ab={ab}, total_prob={total:.4f}. Adjusting.")

    # ==================== EXPOSURE TRACKING ====================

    def record_bet(self, match_id: str, team: str, amount: float,
                   bet_type: str, home_team: str, away_team: str):
        """
        Record a bet for exposure tracking.
        bet_type: 'back' or 'lay'
        """
        with self._lock:
            if match_id not in self._exposure:
                self._exposure[match_id] = {
                    "home_back_total": 0.0, "home_lay_total": 0.0,
                    "away_back_total": 0.0, "away_lay_total": 0.0,
                    "last_update": time.monotonic()
                }

            exp = self._exposure[match_id]
            is_home = (team == home_team)
            key = f"{'home' if is_home else 'away'}_{bet_type}_total"
            exp[key] = exp.get(key, 0.0) + amount
            exp["last_update"] = time.monotonic()

    def get_exposure(self, match_id: str) -> Dict:
        """Get current exposure data for a match."""
        with self._lock:
            return dict(self._exposure.get(match_id, {
                "home_back_total": 0, "home_lay_total": 0,
                "away_back_total": 0, "away_lay_total": 0,
            }))

    # ==================== DYNAMIC ODDS ADJUSTMENT ====================

    def get_adjusted_odds(self, match_id: str, raw_home: float, raw_away: float,
                          margin: float = None) -> Tuple[float, float, float, float]:
        """
        Get margin-applied odds with exposure-based dynamic adjustment.

        If more money is bet on one side:
        - Reduce odds on that side (less attractive)
        - Increase odds on opposite side (more attractive)
        This keeps the market balanced.

        Returns: (home_back, home_lay, away_back, away_lay)
        """
        # Store raw odds
        with self._lock:
            self._raw_odds[match_id] = {
                "raw_home": raw_home, "raw_away": raw_away,
                "last_update": time.monotonic()
            }

        # First apply margin
        hb, hl, ab, al = self.apply_margin(raw_home, raw_away, margin)

        # Then adjust based on exposure
        exp = self.get_exposure(match_id)
        home_total = exp.get("home_back_total", 0) + exp.get("home_lay_total", 0)
        away_total = exp.get("away_back_total", 0) + exp.get("away_lay_total", 0)
        total = home_total + away_total

        if total > 0:
            # Calculate imbalance ratio (-1 to +1)
            # Positive = more money on home, Negative = more money on away
            imbalance = (home_total - away_total) / total

            if abs(imbalance) > 0.05:  # Only adjust if > 5% imbalance
                # Adjust odds: more money on a side → lower back odds (less payout)
                adjustment = imbalance * self.EXPOSURE_ADJUSTMENT_FACTOR * max(hb, ab)

                # Home has more money → reduce home back, increase away back
                hb = round(max(self.MIN_ODDS, hb - adjustment), 2)
                ab = round(max(self.MIN_ODDS, ab + adjustment), 2)

                # Recalculate lays
                hl = self._calculate_lay(hb)
                al = self._calculate_lay(ab)

                # Final safety check
                self._verify_no_arbitrage(hb, hl, ab, al)

                logger.info(f"Match {match_id}: Adjusted odds for imbalance {imbalance:.2f}. "
                            f"HB={hb}, HL={hl}, AB={ab}, AL={al}")

        return (hb, hl, ab, al)

    def calculate_house_profit(self, match_id: str, home_back: float, away_back: float) -> Dict:
        """
        Calculate expected house profit for each outcome.
        Returns profit/loss for house if home wins vs away wins.
        """
        exp = self.get_exposure(match_id)
        hb_total = exp.get("home_back_total", 0)
        ab_total = exp.get("away_back_total", 0)

        # If home wins:
        # House pays: home backers profit = hb_total * (home_back - 1)
        # House gains: away backers lose = ab_total
        # House pays: home layers get their liability back (handled separately)
        home_payout = hb_total * (home_back - 1)
        home_profit_if_home_wins = ab_total - home_payout

        # If away wins:
        away_payout = ab_total * (away_back - 1)
        away_profit_if_away_wins = hb_total - away_payout

        return {
            "home_wins_profit": round(home_profit_if_home_wins, 2),
            "away_wins_profit": round(away_profit_if_away_wins, 2),
            "balanced": home_profit_if_home_wins >= 0 or away_profit_if_away_wins >= 0,
            "needs_adjustment": home_profit_if_home_wins > 0 and away_profit_if_away_wins > 0
        }

    # ==================== FULL ODDS OBJECT BUILDER ====================

    def build_odds_object(self, match_id: str, raw_home: float, raw_away: float,
                          bookmaker_name: str = "PlayXBets") -> Dict:
        """
        Build a complete odds object with margin, exposure adjustment, and order book.
        This replaces the raw API odds with proper bookmaker odds.
        """
        hb, hl, ab, al = self.get_adjusted_odds(match_id, raw_home, raw_away)

        # Build 3-level order book from the adjusted odds
        home_back_levels = [
            hb,
            round(max(self.MIN_ODDS, hb - 0.02), 2),
            round(max(self.MIN_ODDS, hb - 0.04), 2),
        ]
        away_back_levels = [
            ab,
            round(max(self.MIN_ODDS, ab - 0.02), 2),
            round(max(self.MIN_ODDS, ab - 0.04), 2),
        ]
        home_lay_levels = [self._calculate_lay(p) for p in home_back_levels]
        away_lay_levels = [self._calculate_lay(p) for p in away_back_levels]

        # Generate liquidity based on odds (tighter odds = more liquidity)
        import random
        def gen_liq(odds_val):
            base = max(1000, 30000 / max(odds_val, 1.1))
            return round(base + random.uniform(-base * 0.3, base * 0.3), 0)

        return {
            "home": hb,
            "away": ab,
            "home_back": hb,
            "home_lay": hl,
            "away_back": ab,
            "away_lay": al,
            "home_back_levels": home_back_levels,
            "home_lay_levels": home_lay_levels,
            "away_back_levels": away_back_levels,
            "away_lay_levels": away_lay_levels,
            "home_back_sizes": [gen_liq(p) for p in home_back_levels],
            "home_lay_sizes": [gen_liq(p) for p in home_lay_levels],
            "away_back_sizes": [gen_liq(p) for p in away_back_levels],
            "away_lay_sizes": [gen_liq(p) for p in away_lay_levels],
            "bookmakers": [{
                "name": bookmaker_name,
                "home_back": round((hb - 1) * 100),
                "home_lay": round((hl - 1) * 100),
                "away_back": round((ab - 1) * 100),
                "away_lay": round((al - 1) * 100),
                "home_size": random.choice([125000, 250000, 375000, 500000]),
                "away_size": random.choice([500000, 1000000, 1500000]),
                "min_bet": 100,
                "max_bet": "15L",
            }],
            "bookmaker": bookmaker_name,
            "margin_applied": True,
            "last_update": datetime.now(timezone.utc).isoformat()
        }

    # ==================== SCORE STATE & EVENT DETECTION ====================

    def update_score(self, match_id: str, runs: int, wickets: int, overs: float,
                     fours: int = 0, sixes: int = 0) -> Optional[str]:
        """
        Update score state and detect events (4, 6, wicket).
        Returns the detected event type or None.
        """
        with self._lock:
            prev = self._score_state.get(match_id)
            now_ts = time.monotonic()

            new_state = {
                "runs": runs, "wickets": wickets, "overs": overs,
                "fours": fours, "sixes": sixes,
                "last_event": None, "event_time": now_ts,
                "suspended": False
            }

            detected_event = None

            if prev:
                run_diff = runs - prev.get("runs", 0)
                wicket_diff = wickets - prev.get("wickets", 0)
                four_diff = fours - prev.get("fours", 0)
                six_diff = sixes - prev.get("sixes", 0)

                # Detect events
                if wicket_diff > 0:
                    detected_event = "wicket"
                elif six_diff > 0 or run_diff == 6:
                    detected_event = "six"
                elif four_diff > 0 or run_diff == 4:
                    detected_event = "four"
                # Dot ball, single, double = no suspend

                if detected_event:
                    new_state["last_event"] = detected_event
                    new_state["event_time"] = now_ts
                    new_state["suspended"] = True
                    logger.info(f"Match {match_id}: Detected event '{detected_event}' "
                                f"(runs {prev.get('runs',0)}->{runs}, "
                                f"wickets {prev.get('wickets',0)}->{wickets})")
                else:
                    # Carry forward suspended state if within cooldown
                    if prev.get("suspended") and (now_ts - prev.get("event_time", 0)) < 5:
                        new_state["suspended"] = True
                        new_state["last_event"] = prev.get("last_event")
                        new_state["event_time"] = prev.get("event_time", now_ts)

            self._score_state[match_id] = new_state
            return detected_event

    def get_market_status(self, match_id: str) -> Dict:
        """Get current market suspension status for a match."""
        with self._lock:
            state = self._score_state.get(match_id, {})
            now_ts = time.monotonic()
            event_time = state.get("event_time", 0)
            is_suspended = state.get("suspended", False)

            # Auto-resume after 5 seconds
            if is_suspended and (now_ts - event_time) >= 5:
                state["suspended"] = False
                is_suspended = False

            return {
                "suspended": is_suspended,
                "last_event": state.get("last_event"),
                "seconds_since_event": round(now_ts - event_time, 1) if event_time else None,
                "runs": state.get("runs", 0),
                "wickets": state.get("wickets", 0),
                "overs": state.get("overs", 0),
            }

    # ==================== SESSION MARKET ODDS GENERATION ====================

    def generate_session_markets(self, match_id: str, home_team: str, away_team: str,
                                 match_format: str = "t20",
                                 current_runs: int = 0, current_overs: float = 0,
                                 current_wickets: int = 0,
                                 current_fours: int = 0, current_sixes: int = 0) -> List[Dict]:
        """
        Generate session market odds based on match state.

        Markets:
        - Over runs (adv) at key overs
        - 4 runs (total fours) targets
        - 6 runs (total sixes) targets
        - Wicket targets

        Uses run rate to calculate expected values, then generates YES/NO odds with margin.
        """
        markets = []
        market_status = self.get_market_status(match_id)
        is_suspended = market_status.get("suspended", False)
        last_event = market_status.get("last_event")

        home_short = home_team[:3].upper() if home_team else "HOM"
        away_short = away_team[:3].upper() if away_team else "AWY"

        # Calculate run rate
        run_rate = current_runs / current_overs if current_overs > 0 else 7.5
        total_overs = 50 if match_format == "odi" else 20

        # ---- Over Runs Markets ----
        over_targets = [10, 20, 30, 40, 50] if match_format == "odi" else [6, 10, 15, 20]
        for ov in over_targets:
            if current_overs > 0 and ov <= current_overs:
                # This over target has passed - show as completed
                markets.append({
                    "name": f"{ov} over runs {home_short}({home_short} vs {away_short})adv",
                    "type": "over_runs",
                    "target_overs": ov,
                    "completed": True,
                    "suspended": True,
                    "no_value": None,
                    "yes_value": None,
                    "no_odds": None,
                    "yes_odds": None,
                })
                continue

            # Project runs at target over
            if current_overs > 0:
                projected = current_runs + (ov - current_overs) * run_rate
            else:
                projected = ov * run_rate

            projected = round(projected)

            # Generate YES/NO line around projected runs
            line = projected
            # YES probability: chance of scoring >= line runs
            # At the projected line, it's roughly 50/50
            yes_prob = 0.50  # At the projected line, it's roughly 50/50

            # Apply margin to both sides
            margin = self.DEFAULT_MARGIN
            yes_prob_margined = yes_prob * (1 + margin / 2)
            no_prob_margined = (1 - yes_prob) * (1 + margin / 2)

            yes_odds = round(max(self.MIN_ODDS, 1.0 / yes_prob_margined), 2)
            no_odds = round(max(self.MIN_ODDS, 1.0 / no_prob_margined), 2)

            # The display value is the line (projected runs)
            no_value = line - 1  # NO: runs will be UNDER this
            yes_value = line      # YES: runs will be AT LEAST this

            markets.append({
                "name": f"{ov} over runs {home_short}({home_short} vs {away_short})adv",
                "type": "over_runs",
                "target_overs": ov,
                "completed": False,
                "suspended": is_suspended,
                "ball_running": is_suspended and last_event in ("four", "six", "wicket"),
                "no_value": no_value,
                "yes_value": yes_value,
                "no_odds": no_odds,
                "yes_odds": yes_odds,
                "projected": projected,
                "run_rate": round(run_rate, 2),
            })

        # ---- 4 Runs Market (Total Fours) ----
        # Estimate total fours based on current rate
        fours_per_over = current_fours / current_overs if current_overs > 0 else 1.2
        remaining_overs = max(0, total_overs - current_overs)
        projected_fours = current_fours + round(fours_per_over * remaining_overs)

        for target in self._get_fours_targets(current_fours, projected_fours, total_overs):
            prob_yes = self._calc_target_probability(current_fours, target, projected_fours)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)

            markets.append({
                "name": f"Total Match Fours {target}+",
                "type": "fours",
                "target": target,
                "current": current_fours,
                "completed": False,
                "suspended": is_suspended and last_event == "four",
                "ball_running": is_suspended and last_event == "four",
                "no_value": no_val,
                "yes_value": yes_val,
                "no_odds": no_odds,
                "yes_odds": yes_odds,
            })

        # ---- 6 Runs Market (Total Sixes) ----
        sixes_per_over = current_sixes / current_overs if current_overs > 0 else 0.6
        projected_sixes = current_sixes + round(sixes_per_over * remaining_overs)

        for target in self._get_sixes_targets(current_sixes, projected_sixes, total_overs):
            prob_yes = self._calc_target_probability(current_sixes, target, projected_sixes)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)

            markets.append({
                "name": f"Total Match Sixes {target}+",
                "type": "sixes",
                "target": target,
                "current": current_sixes,
                "completed": False,
                "suspended": is_suspended and last_event == "six",
                "ball_running": is_suspended and last_event == "six",
                "no_value": no_val,
                "yes_value": yes_val,
                "no_odds": no_odds,
                "yes_odds": yes_odds,
            })

        # ---- Wicket Market ----
        wickets_per_over = current_wickets / current_overs if current_overs > 0 else 0.5
        projected_wickets = current_wickets + round(wickets_per_over * remaining_overs)

        for target in self._get_wicket_targets(current_wickets, projected_wickets):
            prob_yes = self._calc_target_probability(current_wickets, target, projected_wickets)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)

            markets.append({
                "name": f"Fall of {target}th Wicket Under",
                "type": "wickets",
                "target": target,
                "current": current_wickets,
                "completed": current_wickets >= target,
                "suspended": is_suspended and last_event == "wicket",
                "ball_running": is_suspended and last_event == "wicket",
                "no_value": no_val,
                "yes_value": yes_val,
                "no_odds": no_odds,
                "yes_odds": yes_odds,
            })

        return markets

    def _get_fours_targets(self, current: int, projected: int, total_overs: int) -> List[int]:
        """Generate reasonable four targets around projected."""
        base = max(current + 2, projected - 4)
        step = 3 if total_overs > 30 else 2
        return [base + i * step for i in range(3)]

    def _get_sixes_targets(self, current: int, projected: int, total_overs: int) -> List[int]:
        """Generate reasonable six targets around projected."""
        base = max(current + 1, projected - 3)
        step = 2 if total_overs > 30 else 1
        return [base + i * step for i in range(3)]

    def _get_wicket_targets(self, current: int, projected: int) -> List[int]:
        """Generate wicket fall targets."""
        targets = []
        for w in range(max(1, current + 1), min(11, current + 4)):
            targets.append(w)
        return targets[:3]

    def _calc_target_probability(self, current: int, target: int, projected: int) -> float:
        """Calculate probability of reaching a target given current and projected values."""
        if current >= target:
            return 0.95  # Already exceeded
        if projected <= 0:
            return 0.3
        diff = target - current
        expected_remaining = projected - current
        if expected_remaining <= 0:
            return 0.2
        ratio = diff / expected_remaining
        # Simple logistic curve
        prob = 1.0 / (1.0 + math.exp(3 * (ratio - 0.5)))
        return max(0.05, min(0.95, prob))

    def _session_odds_from_prob(self, prob_yes: float, target: int) -> Tuple:
        """Convert probability to session YES/NO odds with margin."""
        margin = self.DEFAULT_MARGIN
        prob_no = 1.0 - prob_yes

        # Apply margin
        yes_margined = prob_yes * (1 + margin / 2)
        no_margined = prob_no * (1 + margin / 2)

        yes_margined = max(0.01, min(0.99, yes_margined))
        no_margined = max(0.01, min(0.99, no_margined))

        yes_odds = round(max(self.MIN_ODDS, 1.0 / yes_margined), 2)
        no_odds = round(max(self.MIN_ODDS, 1.0 / no_margined), 2)

        no_value = target - 1
        yes_value = target

        return (no_value, yes_value, no_odds, yes_odds)

    # ==================== RE-APPLY MARGINS ON SERVE ====================

    def reapply_odds_for_serving(self, match_id: str, odds_dict: Dict) -> Dict:
        """
        Take existing odds dict from DB and reapply bookmaker margins + exposure adjustments.
        Used when serving /matches, /matches/live, /match/{id} endpoints.
        """
        if not odds_dict or not isinstance(odds_dict, dict):
            return odds_dict

        raw_home = odds_dict.get("home_back") or odds_dict.get("home")
        raw_away = odds_dict.get("away_back") or odds_dict.get("away")

        if not raw_home or not raw_away:
            return odds_dict

        # Get adjusted odds (margin + exposure)
        hb, hl, ab, al = self.get_adjusted_odds(match_id, raw_home, raw_away)

        # Update the odds dict in-place
        odds_dict["home"] = hb
        odds_dict["away"] = ab
        odds_dict["home_back"] = hb
        odds_dict["home_lay"] = hl
        odds_dict["away_back"] = ab
        odds_dict["away_lay"] = al

        # Update levels if present
        if odds_dict.get("home_back_levels"):
            odds_dict["home_back_levels"] = [
                hb,
                round(max(self.MIN_ODDS, hb - 0.02), 2),
                round(max(self.MIN_ODDS, hb - 0.04), 2),
            ]
            odds_dict["home_lay_levels"] = [self._calculate_lay(p) for p in odds_dict["home_back_levels"]]
        if odds_dict.get("away_back_levels"):
            odds_dict["away_back_levels"] = [
                ab,
                round(max(self.MIN_ODDS, ab - 0.02), 2),
                round(max(self.MIN_ODDS, ab - 0.04), 2),
            ]
            odds_dict["away_lay_levels"] = [self._calculate_lay(p) for p in odds_dict["away_back_levels"]]

        # Update bookmaker section
        if odds_dict.get("bookmakers"):
            for bk in odds_dict["bookmakers"]:
                bk["home_back"] = round((hb - 1) * 100)
                bk["home_lay"] = round((hl - 1) * 100)
                bk["away_back"] = round((ab - 1) * 100)
                bk["away_lay"] = round((al - 1) * 100)

        odds_dict["margin_applied"] = True
        return odds_dict


# ==================== SINGLETON INSTANCE ====================
odds_engine = BookmakerOddsEngine()
