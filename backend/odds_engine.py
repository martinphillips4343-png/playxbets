"""
ExchangeOddsEngine - Betfair-style exchange odds with smooth movement,
deterministic liquidity, dynamic spreads, and implied probability correction.

Key principles:
1. Remove bookmaker overround → fair exchange price
2. Smooth EMA-based movement — no sudden jumps
3. Dynamic spread based on volatility (0.01–0.03)
4. Deterministic liquidity derived from match context, NOT random
5. Proper Betfair tick sizes for order book levels
6. Weighted average across multiple bookmaker feeds
"""

import math
import time
import hashlib
import threading
import logging
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Betfair tick increments by price range
BETFAIR_TICKS = [
    (2.0, 0.01),
    (3.0, 0.02),
    (4.0, 0.05),
    (6.0, 0.10),
    (10.0, 0.20),
    (20.0, 0.50),
    (30.0, 1.00),
    (50.0, 2.00),
    (100.0, 5.00),
    (1001.0, 10.00),
]

# Sharp bookmaker keys — weighted higher in averaging
SHARP_BOOKS = {"betfair_ex_uk", "pinnacle", "betfair", "matchbook", "smarkets"}


def betfair_tick(price: float) -> float:
    """Return the Betfair tick size for a given price."""
    for upper, tick in BETFAIR_TICKS:
        if price < upper:
            return tick
    return 10.0


def round_to_tick(price: float, direction: str = "nearest") -> float:
    """Round a price to the nearest valid Betfair tick."""
    tick = betfair_tick(price)
    if direction == "down":
        return round(math.floor(price / tick) * tick, 2)
    elif direction == "up":
        return round(math.ceil(price / tick) * tick, 2)
    return round(round(price / tick) * tick, 2)


def tick_up(price: float, steps: int = 1) -> float:
    """Move price up by N ticks."""
    p = price
    for _ in range(steps):
        t = betfair_tick(p)
        p = round(p + t, 2)
    return p


def tick_down(price: float, steps: int = 1) -> float:
    """Move price down by N ticks."""
    p = price
    for _ in range(steps):
        t = betfair_tick(p)
        p = round(max(1.01, p - t), 2)
    return p


def deterministic_hash(seed: str) -> float:
    """Return a deterministic float 0.0-1.0 from a string seed."""
    h = hashlib.md5(seed.encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


class BookmakerOddsEngine:
    """
    Exchange-style odds engine:
    - Removes overround via implied probability correction
    - Smooth EMA movement (no jumps)
    - Dynamic spread based on volatility
    - Deterministic liquidity from match context
    - Proper Betfair tick-based order book
    - Weighted average across multiple bookmaker feeds
    - Exposure tracking & dynamic adjustment
    - Session market generation
    - Event-driven market suspension
    """

    SMOOTHING_ALPHA = 0.2       # EMA factor: lower = smoother
    MIN_ODDS = 1.01
    MAX_ODDS = 100.0
    EXPOSURE_ADJUSTMENT_FACTOR = 0.02
    DEFAULT_MARGIN = 0.07
    MIN_MARGIN = 0.05
    MAX_MARGIN = 0.10
    BASE_VOLUME = 25000         # Base liquidity unit

    def __init__(self):
        self._lock = threading.Lock()
        # Exposure tracking
        self._exposure: Dict[str, Dict[str, float]] = {}
        # Raw odds history for smoothing
        self._raw_odds: Dict[str, Dict] = {}
        # Smoothed odds (EMA-filtered)
        self._smoothed: Dict[str, Dict] = {}
        # Volatility tracker: stores recent deltas
        self._volatility: Dict[str, List[float]] = {}
        # Score state for event detection
        self._score_state: Dict[str, Dict] = {}
        self._market_status: Dict[str, Dict] = {}

    # ==================== WEIGHTED AVERAGE NORMALIZATION ====================

    def normalize_from_bookmakers(self, bookmakers_data: List[Dict],
                                   home_team: str, away_team: str) -> Tuple[float, float]:
        """
        Compute weighted-average odds from multiple bookmaker feeds.
        Sharp books (Betfair, Pinnacle) get weight 2, others get weight 1.
        Returns (fair_home, fair_away) with overround removed.
        """
        home_prices = []
        away_prices = []
        home_weights = []
        away_weights = []

        for bk in bookmakers_data:
            bk_key = bk.get("key", "").lower()
            weight = 2.0 if bk_key in SHARP_BOOKS else 1.0

            for mkt in bk.get("markets", []):
                if mkt.get("key") != "h2h":
                    continue
                for outcome in mkt.get("outcomes", []):
                    price = outcome.get("price")
                    if not price or price <= 1.0:
                        continue
                    name = outcome.get("name", "")
                    if self._teams_match(name, home_team):
                        home_prices.append(price)
                        home_weights.append(weight)
                    elif self._teams_match(name, away_team):
                        away_prices.append(price)
                        away_weights.append(weight)

        if not home_prices or not away_prices:
            return (0.0, 0.0)

        # Weighted average
        wavg_home = sum(p * w for p, w in zip(home_prices, home_weights)) / sum(home_weights)
        wavg_away = sum(p * w for p, w in zip(away_prices, away_weights)) / sum(away_weights)

        # Remove overround → fair odds
        return self._remove_overround(wavg_home, wavg_away)

    @staticmethod
    def _teams_match(name_a: str, name_b: str) -> bool:
        """Simple fuzzy team matching."""
        if not name_a or not name_b:
            return False
        a, b = name_a.lower().strip(), name_b.lower().strip()
        if a == b:
            return True
        if a in b or b in a:
            return True
        a_words = a.split()
        b_words = b.split()
        if a_words and b_words and len(a_words[0]) > 3 and a_words[0] == b_words[0]:
            return True
        return False

    # ==================== IMPLIED PROBABILITY CORRECTION ====================

    @staticmethod
    def _remove_overround(home_odds: float, away_odds: float) -> Tuple[float, float]:
        """
        Convert bookmaker odds → probability → normalize to 100% → fair odds.
        Removes the bookmaker margin to get true exchange prices.
        """
        if home_odds <= 1 or away_odds <= 1:
            return (home_odds, away_odds)

        prob_home = 1.0 / home_odds
        prob_away = 1.0 / away_odds
        total = prob_home + prob_away

        if total <= 0:
            return (home_odds, away_odds)

        # Normalize to exactly 100%
        prob_home /= total
        prob_away /= total

        fair_home = round(1.0 / prob_home, 4)
        fair_away = round(1.0 / prob_away, 4)

        return (
            max(1.01, fair_home),
            max(1.01, fair_away),
        )

    # ==================== SMOOTH EMA MOVEMENT ====================

    def _smooth_odds(self, match_id: str, new_home: float, new_away: float) -> Tuple[float, float]:
        """
        Apply EMA smoothing: new = old + (target - old) * alpha.
        First call for a match uses the raw value directly.
        """
        with self._lock:
            prev = self._smoothed.get(match_id)

            if prev is None:
                # First data point — accept as-is
                self._smoothed[match_id] = {
                    "home": new_home, "away": new_away,
                    "ts": time.monotonic()
                }
                return (new_home, new_away)

            old_home = prev["home"]
            old_away = prev["away"]
            alpha = self.SMOOTHING_ALPHA

            smoothed_home = old_home + (new_home - old_home) * alpha
            smoothed_away = old_away + (new_away - old_away) * alpha

            # Track volatility (absolute delta before smoothing)
            delta = abs(new_home - old_home) + abs(new_away - old_away)
            vol_list = self._volatility.setdefault(match_id, [])
            vol_list.append(delta)
            if len(vol_list) > 20:
                self._volatility[match_id] = vol_list[-20:]

            self._smoothed[match_id] = {
                "home": smoothed_home, "away": smoothed_away,
                "ts": time.monotonic()
            }

            return (smoothed_home, smoothed_away)

    def _get_volatility(self, match_id: str) -> float:
        """Return average recent volatility for a match (0.0 = stable)."""
        vol_list = self._volatility.get(match_id, [])
        if not vol_list:
            return 0.0
        return sum(vol_list) / len(vol_list)

    # ==================== DYNAMIC SPREAD ====================

    def _dynamic_spread_ticks(self, match_id: str) -> int:
        """
        Spread in tick-steps based on volatility.
        Stable match → 1 tick, volatile → 2-3 ticks.
        """
        vol = self._get_volatility(match_id)
        if vol > 0.15:
            return 3
        if vol > 0.05:
            return 2
        return 1

    # ==================== DETERMINISTIC LIQUIDITY ====================

    def _generate_liquidity(self, match_id: str, odds_val: float,
                            level: int, side: str) -> float:
        """
        Deterministic liquidity based on:
        - Lower odds → higher liquidity (more popular outcome)
        - Level 0 (best) → most liquidity, deeper levels → less
        - Match ID seed for consistency across polls
        """
        # Base = inversely proportional to odds
        base = self.BASE_VOLUME * (1.0 / max(odds_val, 1.1))

        # Level decay: level 0 = 100%, level 1 = 65%, level 2 = 40%
        level_factors = [1.0, 0.65, 0.40]
        factor = level_factors[min(level, 2)]

        # Deterministic jitter ±15% from hash
        seed = f"{match_id}_{side}_{level}"
        jitter = 0.85 + deterministic_hash(seed) * 0.30  # 0.85 to 1.15

        raw = base * factor * jitter
        # Round to nearest 100
        return round(max(500, raw) / 100) * 100

    # ==================== CORE ODDS METHODS ====================

    def apply_margin(self, home_odds: float, away_odds: float,
                     margin: float = None) -> Tuple[float, float, float, float]:
        """
        Kept for backward compatibility.
        Now: removes overround, then applies exchange spread.
        Returns: (home_back, home_lay, away_back, away_lay)
        """
        if not home_odds or not away_odds or home_odds <= 1 or away_odds <= 1:
            return (home_odds, home_odds, away_odds, away_odds)

        fair_home, fair_away = self._remove_overround(home_odds, away_odds)
        hb = round_to_tick(fair_home, "down")
        ab = round_to_tick(fair_away, "down")
        hb = max(self.MIN_ODDS, min(self.MAX_ODDS, hb))
        ab = max(self.MIN_ODDS, min(self.MAX_ODDS, ab))
        hl = tick_up(hb, 1)
        al = tick_up(ab, 1)
        return (hb, hl, ab, al)

    def _calculate_lay(self, back_odds: float, spread_ticks: int = 1) -> float:
        """Calculate lay odds by stepping up N ticks from back."""
        if not back_odds or back_odds <= 1:
            return back_odds
        return tick_up(back_odds, spread_ticks)

    def _verify_no_arbitrage(self, hb: float, hl: float, ab: float, al: float):
        """Verify no arbitrage opportunity exists."""
        if hb and ab and hb > 1 and ab > 1:
            total = (1.0 / hb) + (1.0 / ab)
            if total < 1.0:
                logger.warning(f"Arbitrage detected! hb={hb}, ab={ab}, total_prob={total:.4f}")

    # ==================== EXPOSURE TRACKING ====================

    def record_bet(self, match_id: str, team: str, amount: float,
                   bet_type: str, home_team: str, away_team: str):
        with self._lock:
            if match_id not in self._exposure:
                self._exposure[match_id] = {
                    "home_back_total": 0.0, "home_lay_total": 0.0,
                    "away_back_total": 0.0, "away_lay_total": 0.0,
                    "last_update": time.monotonic()
                }
            exp = self._exposure[match_id]
            is_home = self._teams_match(team, home_team)
            key = f"{'home' if is_home else 'away'}_{bet_type}_total"
            exp[key] = exp.get(key, 0.0) + amount
            exp["last_update"] = time.monotonic()

    def get_exposure(self, match_id: str) -> Dict:
        with self._lock:
            return dict(self._exposure.get(match_id, {
                "home_back_total": 0, "home_lay_total": 0,
                "away_back_total": 0, "away_lay_total": 0,
            }))

    # ==================== DYNAMIC ODDS ADJUSTMENT ====================

    def get_adjusted_odds(self, match_id: str, raw_home: float, raw_away: float,
                          margin: float = None) -> Tuple[float, float, float, float]:
        """
        Full pipeline: remove overround → smooth → exposure adjust → spread.
        Returns: (home_back, home_lay, away_back, away_lay)
        """
        # Store raw
        with self._lock:
            self._raw_odds[match_id] = {
                "raw_home": raw_home, "raw_away": raw_away,
                "last_update": time.monotonic()
            }

        # Step 1: Remove overround → fair price
        fair_home, fair_away = self._remove_overround(raw_home, raw_away)

        # Step 2: Smooth via EMA
        smooth_home, smooth_away = self._smooth_odds(match_id, fair_home, fair_away)

        # Step 3: Round to Betfair ticks
        hb = round_to_tick(smooth_home, "down")
        ab = round_to_tick(smooth_away, "down")
        hb = max(self.MIN_ODDS, min(self.MAX_ODDS, hb))
        ab = max(self.MIN_ODDS, min(self.MAX_ODDS, ab))

        # Step 4: Exposure-based adjustment
        exp = self.get_exposure(match_id)
        home_total = exp.get("home_back_total", 0) + exp.get("home_lay_total", 0)
        away_total = exp.get("away_back_total", 0) + exp.get("away_lay_total", 0)
        total = home_total + away_total

        if total > 0:
            imbalance = (home_total - away_total) / total
            if abs(imbalance) > 0.05:
                adjustment = imbalance * self.EXPOSURE_ADJUSTMENT_FACTOR * max(hb, ab)
                hb = round_to_tick(max(self.MIN_ODDS, hb - adjustment), "down")
                ab = round_to_tick(max(self.MIN_ODDS, ab + adjustment), "down")

        # Step 5: Dynamic spread for lay
        spread_ticks = self._dynamic_spread_ticks(match_id)
        hl = self._calculate_lay(hb, spread_ticks)
        al = self._calculate_lay(ab, spread_ticks)

        self._verify_no_arbitrage(hb, hl, ab, al)
        return (hb, hl, ab, al)

    def calculate_house_profit(self, match_id: str, home_back: float, away_back: float) -> Dict:
        exp = self.get_exposure(match_id)
        hb_total = exp.get("home_back_total", 0)
        ab_total = exp.get("away_back_total", 0)
        home_payout = hb_total * (home_back - 1)
        home_profit = ab_total - home_payout
        away_payout = ab_total * (away_back - 1)
        away_profit = hb_total - away_payout
        return {
            "home_wins_profit": round(home_profit, 2),
            "away_wins_profit": round(away_profit, 2),
            "balanced": home_profit >= 0 or away_profit >= 0,
            "needs_adjustment": home_profit > 0 and away_profit > 0
        }

    # ==================== FULL ODDS OBJECT BUILDER ====================

    def build_odds_object(self, match_id: str, raw_home: float, raw_away: float,
                          bookmaker_name: str = "PlayXBets",
                          all_bookmakers: List[Dict] = None,
                          home_team: str = "", away_team: str = "") -> Dict:
        """
        Build a complete exchange-style odds object.
        If all_bookmakers is provided, uses weighted average normalization first.
        """
        # Step 1: If multiple bookmakers available, weighted-average normalize
        if all_bookmakers and home_team and away_team:
            norm_home, norm_away = self.normalize_from_bookmakers(
                all_bookmakers, home_team, away_team
            )
            if norm_home > 1 and norm_away > 1:
                raw_home = norm_home
                raw_away = norm_away

        # Step 2: Full pipeline (overround removal + smooth + exposure adjust + spread)
        hb, hl, ab, al = self.get_adjusted_odds(match_id, raw_home, raw_away)

        # Step 3: Build 3-level order book with proper ticks
        spread_ticks = self._dynamic_spread_ticks(match_id)

        home_back_levels = [hb, tick_down(hb, 1), tick_down(hb, 2)]
        away_back_levels = [ab, tick_down(ab, 1), tick_down(ab, 2)]
        home_lay_levels = [hl, tick_up(hl, 1), tick_up(hl, 2)]
        away_lay_levels = [al, tick_up(al, 1), tick_up(al, 2)]

        # Step 4: Deterministic liquidity
        hb_sizes = [self._generate_liquidity(match_id, home_back_levels[i], i, "hb") for i in range(3)]
        hl_sizes = [self._generate_liquidity(match_id, home_lay_levels[i], i, "hl") for i in range(3)]
        ab_sizes = [self._generate_liquidity(match_id, away_back_levels[i], i, "ab") for i in range(3)]
        al_sizes = [self._generate_liquidity(match_id, away_lay_levels[i], i, "al") for i in range(3)]

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
            "home_back_sizes": hb_sizes,
            "home_lay_sizes": hl_sizes,
            "away_back_sizes": ab_sizes,
            "away_lay_sizes": al_sizes,
            "bookmakers": [{
                "name": bookmaker_name,
                "home_back": round((hb - 1) * 100),
                "home_lay": round((hl - 1) * 100),
                "away_back": round((ab - 1) * 100),
                "away_lay": round((al - 1) * 100),
                "home_size": int(sum(hb_sizes)),
                "away_size": int(sum(ab_sizes)),
                "min_bet": 100,
                "max_bet": "15L",
            }],
            "bookmaker": bookmaker_name,
            "margin_applied": True,
            "last_update": datetime.now(timezone.utc).isoformat(),
        }

    # ==================== SCORE STATE & EVENT DETECTION ====================

    def update_score(self, match_id: str, runs: int, wickets: int, overs: float,
                     fours: int = 0, sixes: int = 0) -> Optional[str]:
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
                wicket_diff = wickets - prev.get("wickets", 0)
                six_diff = sixes - prev.get("sixes", 0)
                four_diff = fours - prev.get("fours", 0)
                run_diff = runs - prev.get("runs", 0)
                if wicket_diff > 0:
                    detected_event = "wicket"
                elif six_diff > 0 or run_diff == 6:
                    detected_event = "six"
                elif four_diff > 0 or run_diff == 4:
                    detected_event = "four"
                if detected_event:
                    new_state["last_event"] = detected_event
                    new_state["event_time"] = now_ts
                    new_state["suspended"] = True
                    logger.info(f"Match {match_id}: Event '{detected_event}' "
                                f"(runs {prev.get('runs',0)}->{runs}, w {prev.get('wickets',0)}->{wickets})")
                else:
                    if prev.get("suspended") and (now_ts - prev.get("event_time", 0)) < 5:
                        new_state["suspended"] = True
                        new_state["last_event"] = prev.get("last_event")
                        new_state["event_time"] = prev.get("event_time", now_ts)
            self._score_state[match_id] = new_state
            return detected_event

    def get_market_status(self, match_id: str) -> Dict:
        with self._lock:
            state = self._score_state.get(match_id, {})
            now_ts = time.monotonic()
            event_time = state.get("event_time", 0)
            is_suspended = state.get("suspended", False)
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
        markets = []
        market_status = self.get_market_status(match_id)
        is_suspended = market_status.get("suspended", False)
        last_event = market_status.get("last_event")
        home_short = home_team[:3].upper() if home_team else "HOM"
        away_short = away_team[:3].upper() if away_team else "AWY"
        run_rate = current_runs / current_overs if current_overs > 0 else 7.5
        total_overs = 50 if match_format == "odi" else 20

        # Over Runs Markets
        over_targets = [10, 20, 30, 40, 50] if match_format == "odi" else [6, 10, 15, 20]
        for ov in over_targets:
            if current_overs > 0 and ov <= current_overs:
                markets.append({
                    "name": f"{ov} over runs {home_short}({home_short} vs {away_short})adv",
                    "type": "over_runs", "target_overs": ov, "completed": True,
                    "suspended": True, "no_value": None, "yes_value": None,
                    "no_odds": None, "yes_odds": None,
                })
                continue
            projected = (current_runs + (ov - current_overs) * run_rate) if current_overs > 0 else ov * run_rate
            projected = round(projected)
            line = projected
            yes_prob = 0.50
            margin = self.DEFAULT_MARGIN
            yes_margined = max(0.01, min(0.99, yes_prob * (1 + margin / 2)))
            no_margined = max(0.01, min(0.99, (1 - yes_prob) * (1 + margin / 2)))
            yes_odds = round(max(self.MIN_ODDS, 1.0 / yes_margined), 2)
            no_odds = round(max(self.MIN_ODDS, 1.0 / no_margined), 2)
            markets.append({
                "name": f"{ov} over runs {home_short}({home_short} vs {away_short})adv",
                "type": "over_runs", "target_overs": ov, "completed": False,
                "suspended": is_suspended,
                "ball_running": is_suspended and last_event in ("four", "six", "wicket"),
                "no_value": line - 1, "yes_value": line,
                "no_odds": no_odds, "yes_odds": yes_odds,
                "projected": projected, "run_rate": round(run_rate, 2),
            })

        # Fours Market
        fours_per_over = current_fours / current_overs if current_overs > 0 else 1.2
        remaining_overs = max(0, total_overs - current_overs)
        projected_fours = current_fours + round(fours_per_over * remaining_overs)
        for target in self._get_fours_targets(current_fours, projected_fours, total_overs):
            prob_yes = self._calc_target_probability(current_fours, target, projected_fours)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)
            markets.append({
                "name": f"Total Match Fours {target}+", "type": "fours",
                "target": target, "current": current_fours, "completed": False,
                "suspended": is_suspended and last_event == "four",
                "ball_running": is_suspended and last_event == "four",
                "no_value": no_val, "yes_value": yes_val,
                "no_odds": no_odds, "yes_odds": yes_odds,
            })

        # Sixes Market
        sixes_per_over = current_sixes / current_overs if current_overs > 0 else 0.6
        projected_sixes = current_sixes + round(sixes_per_over * remaining_overs)
        for target in self._get_sixes_targets(current_sixes, projected_sixes, total_overs):
            prob_yes = self._calc_target_probability(current_sixes, target, projected_sixes)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)
            markets.append({
                "name": f"Total Match Sixes {target}+", "type": "sixes",
                "target": target, "current": current_sixes, "completed": False,
                "suspended": is_suspended and last_event == "six",
                "ball_running": is_suspended and last_event == "six",
                "no_value": no_val, "yes_value": yes_val,
                "no_odds": no_odds, "yes_odds": yes_odds,
            })

        # Wicket Market
        wickets_per_over = current_wickets / current_overs if current_overs > 0 else 0.5
        projected_wickets = current_wickets + round(wickets_per_over * remaining_overs)
        for target in self._get_wicket_targets(current_wickets, projected_wickets):
            prob_yes = self._calc_target_probability(current_wickets, target, projected_wickets)
            no_val, yes_val, no_odds, yes_odds = self._session_odds_from_prob(prob_yes, target)
            markets.append({
                "name": f"Fall of {target}th Wicket Under", "type": "wickets",
                "target": target, "current": current_wickets,
                "completed": current_wickets >= target,
                "suspended": is_suspended and last_event == "wicket",
                "ball_running": is_suspended and last_event == "wicket",
                "no_value": no_val, "yes_value": yes_val,
                "no_odds": no_odds, "yes_odds": yes_odds,
            })
        return markets

    def _get_fours_targets(self, current: int, projected: int, total_overs: int) -> List[int]:
        base = max(current + 2, projected - 4)
        step = 3 if total_overs > 30 else 2
        return [base + i * step for i in range(3)]

    def _get_sixes_targets(self, current: int, projected: int, total_overs: int) -> List[int]:
        base = max(current + 1, projected - 3)
        step = 2 if total_overs > 30 else 1
        return [base + i * step for i in range(3)]

    def _get_wicket_targets(self, current: int, projected: int) -> List[int]:
        targets = []
        for w in range(max(1, current + 1), min(11, current + 4)):
            targets.append(w)
        return targets[:3]

    def _calc_target_probability(self, current: int, target: int, projected: int) -> float:
        if current >= target:
            return 0.95
        if projected <= 0:
            return 0.3
        diff = target - current
        expected_remaining = projected - current
        if expected_remaining <= 0:
            return 0.2
        ratio = diff / expected_remaining
        prob = 1.0 / (1.0 + math.exp(3 * (ratio - 0.5)))
        return max(0.05, min(0.95, prob))

    def _session_odds_from_prob(self, prob_yes: float, target: int) -> Tuple:
        margin = self.DEFAULT_MARGIN
        prob_no = 1.0 - prob_yes
        yes_margined = max(0.01, min(0.99, prob_yes * (1 + margin / 2)))
        no_margined = max(0.01, min(0.99, prob_no * (1 + margin / 2)))
        yes_odds = round(max(self.MIN_ODDS, 1.0 / yes_margined), 2)
        no_odds = round(max(self.MIN_ODDS, 1.0 / no_margined), 2)
        return (target - 1, target, no_odds, yes_odds)

    # ==================== RE-APPLY ON SERVE ====================

    def reapply_odds_for_serving(self, match_id: str, odds_dict: Dict) -> Dict:
        """
        Re-process stored odds through the exchange engine when serving to clients.
        Applies smoothing, exposure adjustment, and regenerates order book.
        """
        if not odds_dict or not isinstance(odds_dict, dict):
            return odds_dict

        raw_home = odds_dict.get("raw_home") or odds_dict.get("home_back") or odds_dict.get("home")
        raw_away = odds_dict.get("raw_away") or odds_dict.get("away_back") or odds_dict.get("away")
        if not raw_home or not raw_away:
            return odds_dict

        has_exchange_lay = odds_dict.get("exchange_lay", False)

        # Full pipeline: overround removal + smooth + exposure adjust
        hb, hl, ab, al = self.get_adjusted_odds(match_id, raw_home, raw_away)

        odds_dict["home"] = hb
        odds_dict["away"] = ab
        odds_dict["home_back"] = hb
        odds_dict["away_back"] = ab

        if not has_exchange_lay:
            odds_dict["home_lay"] = hl
            odds_dict["away_lay"] = al

        # Rebuild order book with proper ticks
        spread_ticks = self._dynamic_spread_ticks(match_id)

        odds_dict["home_back_levels"] = [hb, tick_down(hb, 1), tick_down(hb, 2)]
        odds_dict["away_back_levels"] = [ab, tick_down(ab, 1), tick_down(ab, 2)]

        if not has_exchange_lay:
            odds_dict["home_lay_levels"] = [hl, tick_up(hl, 1), tick_up(hl, 2)]
            odds_dict["away_lay_levels"] = [al, tick_up(al, 1), tick_up(al, 2)]

        # Deterministic liquidity
        odds_dict["home_back_sizes"] = [
            self._generate_liquidity(match_id, odds_dict["home_back_levels"][i], i, "hb") for i in range(3)
        ]
        odds_dict["away_back_sizes"] = [
            self._generate_liquidity(match_id, odds_dict["away_back_levels"][i], i, "ab") for i in range(3)
        ]
        odds_dict["home_lay_sizes"] = [
            self._generate_liquidity(match_id, odds_dict.get("home_lay_levels", [hl])[min(i, len(odds_dict.get("home_lay_levels", [hl]))-1)], i, "hl") for i in range(3)
        ]
        odds_dict["away_lay_sizes"] = [
            self._generate_liquidity(match_id, odds_dict.get("away_lay_levels", [al])[min(i, len(odds_dict.get("away_lay_levels", [al]))-1)], i, "al") for i in range(3)
        ]

        odds_dict["margin_applied"] = True
        return odds_dict


# ==================== SINGLETON INSTANCE ====================
odds_engine = BookmakerOddsEngine()
