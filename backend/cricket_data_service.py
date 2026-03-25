"""
Cricket Data Service - Smart API Integration with Quota Management
==================================================================
- CricketData API integration
- 100 requests/day quota management
- Smart scheduling based on live matches
- In-memory caching (15 min TTL)
- Automatic quota reset every 24 hours
"""

import os
import logging
import requests
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import hashlib
import json

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cricket_service")

# ==================== CONFIGURATION ====================
CRICKET_API_KEY = os.getenv("CRICKETDATA_API_KEY", "")
CRICKET_API_BASE = "https://api.cricapi.com/v1"

# Quota limits
DAILY_QUOTA_LIMIT = 100
QUOTA_WARNING_THRESHOLD = 0.9  # 90% = 90 requests

# Cache TTL in seconds
CACHE_TTL_LIVE = 600  # 10 minutes for live data
CACHE_TTL_SCHEDULED = 900  # 15 minutes for scheduled matches

# Polling intervals (in minutes)
POLL_INTERVAL_LIVE = 15  # Every 15 min when live matches exist
POLL_INTERVAL_IDLE = 60  # Every 60 min when no live matches


# ==================== IN-MEMORY CACHE ====================
class InMemoryCache:
    """Simple in-memory cache with TTL support"""
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
    
    def get(self, key: str) -> Optional[Any]:
        if key in self._cache:
            item = self._cache[key]
            if datetime.now(timezone.utc) < item["expires_at"]:
                return item["value"]
            else:
                del self._cache[key]
        return None
    
    def set(self, key: str, value: Any, ttl_seconds: int = 600):
        self._cache[key] = {
            "value": value,
            "expires_at": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
            "created_at": datetime.now(timezone.utc)
        }
    
    def delete(self, key: str):
        if key in self._cache:
            del self._cache[key]
    
    def clear(self):
        self._cache = {}
    
    def get_stats(self) -> Dict:
        now = datetime.now(timezone.utc)
        valid_count = sum(1 for item in self._cache.values() if now < item["expires_at"])
        return {"total_keys": len(self._cache), "valid_keys": valid_count}


# Global cache instance
cache = InMemoryCache()


# ==================== QUOTA MANAGER ====================
@dataclass
class QuotaStatus:
    requests_made: int = 0
    quota_limit: int = DAILY_QUOTA_LIMIT
    reset_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=1))
    last_request_time: Optional[datetime] = None
    is_quota_exceeded: bool = False
    
    @property
    def requests_remaining(self) -> int:
        return max(0, self.quota_limit - self.requests_made)
    
    @property
    def usage_percentage(self) -> float:
        return (self.requests_made / self.quota_limit) * 100
    
    @property
    def is_warning_threshold(self) -> bool:
        return self.requests_made >= (self.quota_limit * QUOTA_WARNING_THRESHOLD)
    
    def to_dict(self) -> Dict:
        return {
            "requests_made": self.requests_made,
            "requests_remaining": self.requests_remaining,
            "quota_limit": self.quota_limit,
            "usage_percentage": round(self.usage_percentage, 2),
            "reset_time": self.reset_time.isoformat(),
            "is_quota_exceeded": self.is_quota_exceeded,
            "is_warning_threshold": self.is_warning_threshold
        }


class QuotaManager:
    def __init__(self, db=None):
        self.db = db
        self._quota_status: Optional[QuotaStatus] = None
    
    async def get_status(self) -> QuotaStatus:
        if self.db is not None:
            try:
                doc = await self.db.api_quota.find_one({"api_name": "cricketdata"}, {"_id": 0})
                if doc:
                    reset_time = doc.get("reset_time")
                    if isinstance(reset_time, str):
                        reset_time = datetime.fromisoformat(reset_time.replace("Z", "+00:00"))
                    
                    now = datetime.now(timezone.utc)
                    if reset_time and now >= reset_time:
                        await self._reset_quota()
                        return await self.get_status()
                    
                    self._quota_status = QuotaStatus(
                        requests_made=doc.get("requests_made", 0),
                        quota_limit=doc.get("quota_limit", DAILY_QUOTA_LIMIT),
                        reset_time=reset_time or (now + timedelta(days=1)),
                        last_request_time=doc.get("last_request_time"),
                        is_quota_exceeded=doc.get("is_quota_exceeded", False)
                    )
                    return self._quota_status
            except Exception as e:
                logger.error(f"Error getting quota from DB: {e}")
        
        if not self._quota_status:
            self._quota_status = QuotaStatus()
        return self._quota_status
    
    async def _reset_quota(self):
        now = datetime.now(timezone.utc)
        tomorrow = now + timedelta(days=1)
        reset_time = tomorrow.replace(hour=18, minute=30, second=0, microsecond=0)
        
        if self.db is not None:
            try:
                await self.db.api_quota.update_one(
                    {"api_name": "cricketdata"},
                    {"$set": {"requests_made": 0, "reset_time": reset_time, "is_quota_exceeded": False, "last_reset": now}},
                    upsert=True
                )
            except Exception as e:
                logger.error(f"Error resetting quota: {e}")
        logger.info(f"Quota reset. Next reset at: {reset_time.isoformat()}")
    
    async def increment_request(self) -> bool:
        status = await self.get_status()
        if status.is_quota_exceeded or status.requests_remaining <= 0:
            logger.warning("API quota exceeded!")
            return False
        
        now = datetime.now(timezone.utc)
        new_count = status.requests_made + 1
        is_exceeded = new_count >= status.quota_limit
        
        if self.db is not None:
            try:
                await self.db.api_quota.update_one(
                    {"api_name": "cricketdata"},
                    {"$set": {"requests_made": new_count, "last_request_time": now, "is_quota_exceeded": is_exceeded, "quota_limit": DAILY_QUOTA_LIMIT, "reset_time": status.reset_time}},
                    upsert=True
                )
            except Exception as e:
                logger.error(f"Error incrementing quota: {e}")
        
        logger.info(f"API request #{new_count}/{status.quota_limit} ({status.usage_percentage:.1f}%)")
        return True
    
    async def can_make_request(self) -> bool:
        status = await self.get_status()
        return not status.is_quota_exceeded and status.requests_remaining > 0


# ==================== CRICKET DATA SERVICE ====================
class CricketDataService:
    def __init__(self, db=None):
        self.db = db
        self.quota_manager = QuotaManager(db)
        self.base_url = CRICKET_API_BASE
        self.api_key = CRICKET_API_KEY
        self._live_matches_exist = False
    
    def _make_cache_key(self, endpoint: str, params: Dict = None) -> str:
        key_str = endpoint
        if params:
            key_str += json.dumps(params, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    async def _api_request(self, endpoint: str, params: Dict = None, use_cache: bool = True, cache_ttl: int = CACHE_TTL_LIVE) -> Optional[Dict]:
        cache_key = self._make_cache_key(endpoint, params)
        if use_cache:
            cached_data = cache.get(cache_key)
            if cached_data:
                logger.info(f"Cache HIT: {endpoint}")
                return cached_data
        
        can_request = await self.quota_manager.can_make_request()
        if not can_request:
            logger.error("Quota exceeded - serving stale cache if available")
            return cache.get(cache_key)
        
        url = f"{self.base_url}/{endpoint}"
        request_params = {"apikey": self.api_key}
        if params:
            request_params.update(params)
        
        try:
            await self.quota_manager.increment_request()
            response = requests.get(url, params=request_params, timeout=15)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    cache.set(cache_key, data, cache_ttl)
                    logger.info(f"API success: {endpoint}")
                    return data
                else:
                    logger.error(f"API error: {data.get('reason', 'Unknown')}")
            else:
                logger.error(f"API HTTP {response.status_code}")
        except requests.exceptions.Timeout:
            logger.error(f"API timeout: {endpoint}")
        except requests.exceptions.RequestException as e:
            logger.error(f"API error: {e}")
        
        return None
    
    async def get_live_matches(self) -> List[Dict]:
        data = await self._api_request("currentMatches", cache_ttl=CACHE_TTL_LIVE)
        if data and data.get("data"):
            matches = data["data"]
            live = [m for m in matches if m.get("matchStarted") and not m.get("matchEnded")]
            self._live_matches_exist = len(live) > 0
            return live
        return []
    
    async def get_upcoming_matches(self) -> List[Dict]:
        data = await self._api_request("matches", cache_ttl=CACHE_TTL_SCHEDULED)
        if data and data.get("data"):
            return [m for m in data["data"] if not m.get("matchStarted")]
        return []
    
    async def get_all_matches(self) -> Dict[str, List[Dict]]:
        live = await self.get_live_matches()
        upcoming = await self.get_upcoming_matches()
        return {"live": live, "upcoming": upcoming, "total": len(live) + len(upcoming)}
    
    def has_live_matches(self) -> bool:
        return self._live_matches_exist
    
    async def get_service_status(self) -> Dict:
        quota = await self.quota_manager.get_status()
        return {
            "service": "cricket_data_service",
            "api_configured": bool(self.api_key),
            "quota": quota.to_dict(),
            "cache": cache.get_stats(),
            "has_live_matches": self._live_matches_exist,
            "poll_interval_min": POLL_INTERVAL_LIVE if self._live_matches_exist else POLL_INTERVAL_IDLE
        }
    
    async def transform_for_frontend(self, matches: List[Dict]) -> List[Dict]:
        transformed = []
        for m in matches:
            try:
                date_str = m.get("dateTimeGMT") or m.get("date")
                try:
                    commence_time = datetime.fromisoformat(date_str.replace("Z", "+00:00")) if date_str else datetime.now(timezone.utc)
                except:
                    commence_time = datetime.now(timezone.utc)
                
                teams = m.get("teams", [])
                home_team = teams[0] if len(teams) > 0 else "Team A"
                away_team = teams[1] if len(teams) > 1 else "Team B"
                
                name_lower = m.get("name", "").lower()
                if "t20" in name_lower or "ipl" in name_lower:
                    fmt = "t20"
                elif "test" in name_lower:
                    fmt = "test"
                elif "odi" in name_lower:
                    fmt = "odi"
                elif "t10" in name_lower:
                    fmt = "t10"
                else:
                    fmt = "t20"
                
                if m.get("matchStarted") and not m.get("matchEnded"):
                    status = "live"
                elif m.get("matchEnded"):
                    status = "completed"
                else:
                    status = "scheduled"
                
                transformed.append({
                    "match_id": m.get("id", str(hash(m.get("name", "")))),
                    "sport": "cricket",
                    "league": m.get("series", m.get("name", "Cricket")),
                    "home_team": home_team,
                    "away_team": away_team,
                    "commence_time": commence_time.isoformat(),
                    "status": status,
                    "has_tv": True,
                    "has_fancy": status == "live",
                    "has_bookmaker": True,
                    "format": fmt,
                    "score": m.get("score", []),
                    "venue": m.get("venue", ""),
                })
            except Exception as e:
                logger.error(f"Transform error: {e}")
        return transformed


def create_cricket_service(db=None) -> CricketDataService:
    if not CRICKET_API_KEY:
        logger.warning("CRICKETDATA_API_KEY not set!")
    return CricketDataService(db)
