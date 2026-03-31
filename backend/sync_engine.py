"""
PlayXBets Sync Engine — Centralized Data Layer, Monitoring & Smart Orchestration.

Provides:
1. TTL-based in-memory cache with delta update detection
2. API sync validation report (CricketData vs Odds API)
3. Performance monitoring (latency, success rates, WS events)
4. Smart polling coordination with dedup + retry
"""

import time
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger("sync_engine")


class PerformanceMonitor:
    """Tracks API latency, sync rates, WebSocket events, data mismatches."""

    def __init__(self):
        self._api_calls: List[dict] = []  # last 200 entries
        self._ws_events: List[dict] = []  # last 200 entries
        self._sync_results: List[dict] = []  # last 100 entries
        self._errors: List[dict] = []  # last 100 entries
        self._max_entries = 200

    def record_api_call(self, source: str, latency_ms: float, success: bool, detail: str = ""):
        entry = {
            "source": source,
            "latency_ms": round(latency_ms, 1),
            "success": success,
            "detail": detail,
            "ts": datetime.now(timezone.utc).isoformat()
        }
        self._api_calls.append(entry)
        if len(self._api_calls) > self._max_entries:
            self._api_calls = self._api_calls[-self._max_entries:]

    def record_ws_event(self, event_type: str, clients: int, matches_pushed: int):
        entry = {
            "type": event_type,
            "clients": clients,
            "matches_pushed": matches_pushed,
            "ts": datetime.now(timezone.utc).isoformat()
        }
        self._ws_events.append(entry)
        if len(self._ws_events) > self._max_entries:
            self._ws_events = self._ws_events[-self._max_entries:]

    def record_sync(self, total: int, synced: int, unsynced: int, errors: int):
        entry = {
            "total": total, "synced": synced,
            "unsynced": unsynced, "errors": errors,
            "ts": datetime.now(timezone.utc).isoformat()
        }
        self._sync_results.append(entry)
        if len(self._sync_results) > 100:
            self._sync_results = self._sync_results[-100:]

    def record_error(self, source: str, error: str):
        self._errors.append({
            "source": source, "error": error[:200],
            "ts": datetime.now(timezone.utc).isoformat()
        })
        if len(self._errors) > 100:
            self._errors = self._errors[-100:]

    def get_stats(self) -> dict:
        now = datetime.now(timezone.utc)
        cutoff_5m = (now - timedelta(minutes=5)).isoformat()
        cutoff_1h = (now - timedelta(hours=1)).isoformat()

        recent_calls = [c for c in self._api_calls if c["ts"] > cutoff_5m]
        hourly_calls = [c for c in self._api_calls if c["ts"] > cutoff_1h]

        avg_latency_5m = 0
        if recent_calls:
            avg_latency_5m = round(sum(c["latency_ms"] for c in recent_calls) / len(recent_calls), 1)

        success_rate_1h = 0
        if hourly_calls:
            success_rate_1h = round(sum(1 for c in hourly_calls if c["success"]) / len(hourly_calls) * 100, 1)

        recent_ws = [e for e in self._ws_events if e["ts"] > cutoff_5m]
        recent_syncs = self._sync_results[-5:] if self._sync_results else []
        recent_errors = self._errors[-10:]

        return {
            "api": {
                "avg_latency_5min_ms": avg_latency_5m,
                "success_rate_1h_pct": success_rate_1h,
                "total_calls_5min": len(recent_calls),
                "total_calls_1h": len(hourly_calls),
                "by_source": self._group_by_source(recent_calls)
            },
            "websocket": {
                "events_5min": len(recent_ws),
                "total_matches_pushed": sum(e["matches_pushed"] for e in recent_ws) if recent_ws else 0
            },
            "sync": {
                "recent": recent_syncs
            },
            "errors": {
                "recent": recent_errors,
                "count_1h": len([e for e in self._errors if e["ts"] > cutoff_1h])
            },
            "timestamp": now.isoformat()
        }

    def _group_by_source(self, calls: List[dict]) -> dict:
        groups = defaultdict(lambda: {"count": 0, "avg_ms": 0, "success": 0})
        for c in calls:
            g = groups[c["source"]]
            g["count"] += 1
            g["avg_ms"] += c["latency_ms"]
            if c["success"]:
                g["success"] += 1
        for src, g in groups.items():
            if g["count"]:
                g["avg_ms"] = round(g["avg_ms"] / g["count"], 1)
                g["success_pct"] = round(g["success"] / g["count"] * 100, 1)
        return dict(groups)


class TTLCache:
    """In-memory TTL-based cache for match & odds data with delta detection."""

    def __init__(self, match_ttl_sec: float = 8.0, odds_ttl_sec: float = 15.0):
        self.match_ttl = match_ttl_sec
        self.odds_ttl = odds_ttl_sec
        # match_id -> {data: dict, updated_at: float, source: str}
        self._matches: Dict[str, dict] = {}
        self._odds: Dict[str, dict] = {}
        self._last_broadcast_hashes: Dict[str, str] = {}
        self._live_matches: List[dict] = []
        self._lock = asyncio.Lock()

    async def update_match(self, match_id: str, data: dict, source: str = "unknown") -> Optional[dict]:
        """Update match data. Returns delta dict if something changed, else None."""
        async with self._lock:
            now = time.monotonic()
            old = self._matches.get(match_id)

            entry = {"data": data, "updated_at": now, "source": source}
            self._matches[match_id] = entry

            if old is None:
                return {"type": "new", "match_id": match_id, "data": data}

            delta = self._compute_delta(old["data"], data)
            return delta if delta else None

    async def update_odds(self, match_id: str, odds: dict) -> Optional[dict]:
        """Update odds for a match. Returns delta if changed."""
        async with self._lock:
            now = time.monotonic()
            old = self._odds.get(match_id)
            self._odds[match_id] = {"data": odds, "updated_at": now}

            if old is None:
                return {"type": "new_odds", "match_id": match_id}

            if old["data"].get("home_back") != odds.get("home_back") or \
               old["data"].get("away_back") != odds.get("away_back"):
                return {
                    "type": "odds_change",
                    "match_id": match_id,
                    "old_home": old["data"].get("home_back"),
                    "new_home": odds.get("home_back"),
                    "old_away": old["data"].get("away_back"),
                    "new_away": odds.get("away_back")
                }
            return None

    async def set_live_matches(self, matches: List[dict]) -> bool:
        """Update live matches list. Returns True if the set changed."""
        async with self._lock:
            old_ids = {m.get("match_id") for m in self._live_matches}
            new_ids = {m.get("match_id") for m in matches}
            self._live_matches = matches
            return old_ids != new_ids

    def get_live_matches(self) -> List[dict]:
        return list(self._live_matches)

    def get_match(self, match_id: str) -> Optional[dict]:
        entry = self._matches.get(match_id)
        if entry:
            return entry["data"]
        return None

    def is_stale(self, match_id: str, category: str = "match") -> bool:
        """Check if cached data has expired its TTL."""
        store = self._matches if category == "match" else self._odds
        entry = store.get(match_id)
        if not entry:
            return True
        age = time.monotonic() - entry["updated_at"]
        ttl = self.match_ttl if category == "match" else self.odds_ttl
        return age > ttl

    def get_cache_stats(self) -> dict:
        return {
            "total_matches_cached": len(self._matches),
            "total_odds_cached": len(self._odds),
            "live_matches": len(self._live_matches),
            "match_ttl_sec": self.match_ttl,
            "odds_ttl_sec": self.odds_ttl
        }

    def _compute_delta(self, old: dict, new: dict) -> Optional[dict]:
        """Compute meaningful delta between old and new match data."""
        changes = {}
        for key in ("status", "score", "home_odds", "away_odds", "odds", "matchStarted", "matchEnded", "winner"):
            old_val = old.get(key)
            new_val = new.get(key)
            if old_val != new_val:
                changes[key] = {"old": old_val, "new": new_val}
        return {"type": "update", "match_id": new.get("match_id"), "changes": changes} if changes else None


class SmartPollCoordinator:
    """Prevents duplicate polling, enforces min intervals, tracks retries."""

    def __init__(self):
        # source -> last_poll_time (monotonic)
        self._last_poll: Dict[str, float] = {}
        self._retry_counts: Dict[str, int] = {}
        self._lock = asyncio.Lock()

    # Minimum intervals in seconds
    INTERVALS = {
        "odds_live": 2,           # Live matches odds: every 2s
        "odds_upcoming": 120,     # Upcoming matches odds: every 2 min
        "cricket_live": 2,        # Live cricket data: every 2s
        "cricket_upcoming": 120,  # Upcoming cricket data: every 2 min
        "live_check": 30,         # Completion check: every 30s (not needed as fast)
    }
    MAX_RETRIES = 3

    async def should_poll(self, source: str, has_live: bool = False) -> bool:
        """Returns True if enough time has passed since last poll for this source."""
        async with self._lock:
            now = time.monotonic()
            last = self._last_poll.get(source, 0)

            # Use shorter interval for live, longer for upcoming
            if has_live:
                interval = self.INTERVALS.get(source, 15)
            else:
                # For non-live, use the upcoming interval if available
                upcoming_key = source.replace("_live", "_upcoming")
                interval = self.INTERVALS.get(upcoming_key, self.INTERVALS.get(source, 60))

            return (now - last) >= interval

    async def mark_polled(self, source: str):
        async with self._lock:
            self._last_poll[source] = time.monotonic()
            self._retry_counts[source] = 0

    async def mark_failed(self, source: str) -> bool:
        """Mark a poll as failed. Returns True if retries exhausted."""
        async with self._lock:
            self._retry_counts[source] = self._retry_counts.get(source, 0) + 1
            return self._retry_counts[source] >= self.MAX_RETRIES

    def get_retry_count(self, source: str) -> int:
        return self._retry_counts.get(source, 0)

    def get_status(self) -> dict:
        now = time.monotonic()
        return {
            source: {
                "seconds_since_last_poll": round(now - ts, 1),
                "retry_count": self._retry_counts.get(source, 0)
            }
            for source, ts in self._last_poll.items()
        }


class SyncValidator:
    """Cross-references CricketData matches with Odds API data."""

    def __init__(self):
        self._cricket_matches: Dict[str, dict] = {}  # normalized_key -> match
        self._odds_matches: Dict[str, dict] = {}      # normalized_key -> event
        self._mismatches: List[dict] = []
        self._duplicates: List[dict] = []

    @staticmethod
    def _normalize_key(home: str, away: str) -> str:
        """Create a normalized lookup key from team names."""
        h = home.lower().strip().replace("royal challengers bengaluru", "royal challengers bangalore")
        a = away.lower().strip().replace("royal challengers bengaluru", "royal challengers bangalore")
        parts = sorted([h, a])
        return f"{parts[0]}|{parts[1]}"

    def register_cricket_matches(self, matches: List[dict]):
        """Register matches from CricketData API."""
        self._cricket_matches.clear()
        for m in matches:
            key = self._normalize_key(m.get("home_team", ""), m.get("away_team", ""))
            if key in self._cricket_matches:
                self._duplicates.append({"source": "cricket", "key": key, "match_id": m.get("match_id")})
            self._cricket_matches[key] = m

    def register_odds_events(self, events: List[dict]):
        """Register events from Odds API."""
        self._odds_matches.clear()
        for e in events:
            key = self._normalize_key(e.get("home_team", ""), e.get("away_team", ""))
            if key in self._odds_matches:
                self._duplicates.append({"source": "odds", "key": key, "event_id": e.get("id")})
            self._odds_matches[key] = e

    def generate_report(self) -> dict:
        """Generate comprehensive sync report."""
        cricket_keys = set(self._cricket_matches.keys())
        odds_keys = set(self._odds_matches.keys())

        synced = cricket_keys & odds_keys
        cricket_only = cricket_keys - odds_keys
        odds_only = odds_keys - cricket_keys

        # Check time mismatches for synced matches
        time_mismatches = []
        for key in synced:
            cm = self._cricket_matches[key]
            om = self._odds_matches[key]
            cm_time = cm.get("commence_time")
            om_time = om.get("commence_time")
            if cm_time and om_time:
                try:
                    from server import ensure_utc
                    ct1 = ensure_utc(cm_time)
                    ct2 = ensure_utc(om_time)
                    if ct1 and ct2 and abs((ct1 - ct2).total_seconds()) > 3600:
                        time_mismatches.append({
                            "key": key,
                            "cricket_time": str(cm_time),
                            "odds_time": str(om_time),
                            "diff_hours": round(abs((ct1 - ct2).total_seconds()) / 3600, 1)
                        })
                except Exception:
                    pass

        missing_odds = []
        for key in cricket_only:
            m = self._cricket_matches[key]
            missing_odds.append({
                "home_team": m.get("home_team"),
                "away_team": m.get("away_team"),
                "status": m.get("status"),
                "league": m.get("league", "")[:50]
            })

        incorrect_mappings = []
        for key in odds_only:
            e = self._odds_matches[key]
            incorrect_mappings.append({
                "home_team": e.get("home_team"),
                "away_team": e.get("away_team"),
                "sport_title": e.get("sport_title", ""),
                "event_id": e.get("id", "")[:20]
            })

        total = len(cricket_keys | odds_keys)
        return {
            "summary": {
                "total_unique_matches": total,
                "synced_matches": len(synced),
                "cricket_only": len(cricket_only),
                "odds_only": len(odds_only),
                "duplicates": len(self._duplicates),
                "time_mismatches": len(time_mismatches)
            },
            "missing_odds": missing_odds[:20],
            "unmapped_odds_events": incorrect_mappings[:20],
            "time_mismatches": time_mismatches[:10],
            "duplicates": self._duplicates[:10],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }


# Module-level singletons
monitor = PerformanceMonitor()
cache = TTLCache(match_ttl_sec=3.0, odds_ttl_sec=5.0)
coordinator = SmartPollCoordinator()
sync_validator = SyncValidator()
