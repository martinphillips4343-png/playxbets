"""
Cricket Data Service - Smart API Integration with Quota Management
==================================================================
- CricketData API integration
- 100 requests/day quota management
- Smart scheduling based on live matches
- In-memory caching (15 min TTL)
- Automatic quota reset every 24 hours
- Real-time live match status updates
- API limit handling (429 responses)
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
DAILY_QUOTA_LIMIT = 2000
QUOTA_WARNING_THRESHOLD = 0.9  # 90% = 90 requests

# Cache TTL in seconds - OPTIMIZED FOR REAL-TIME LIVE UPDATES
CACHE_TTL_LIVE = 2  # 2 seconds for live data - near instant updates
CACHE_TTL_SCHEDULED = 300  # 5 minutes for scheduled matches
CACHE_TTL_FALLBACK = 60  # 1 minute fallback when API unavailable

# Polling intervals (in seconds for live, minutes for idle)
POLL_INTERVAL_LIVE_SECONDS = 2  # Every 2 seconds when live matches exist
POLL_INTERVAL_IDLE = 30  # Every 30 min when no live matches

# API rate limit handling
RATE_LIMIT_RETRY_SECONDS = 10  # Wait 10 seconds after 429
RATE_LIMIT_COOLDOWN_UNTIL = None  # Track when we can retry after 429


# ==================== IN-MEMORY CACHE ====================
class InMemoryCache:
    """Simple in-memory cache with TTL support and fallback mechanism"""
    
    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._fallback_cache: Dict[str, Any] = {}  # Stores last valid data for fallback
    
    def get(self, key: str, allow_expired: bool = False) -> Optional[Any]:
        if key in self._cache:
            item = self._cache[key]
            if datetime.now(timezone.utc) < item["expires_at"]:
                return item["value"]
            elif allow_expired:
                # Return expired data as fallback
                return item["value"]
            else:
                # Keep in fallback cache before deleting
                self._fallback_cache[key] = item["value"]
                del self._cache[key]
        
        # Try fallback cache if main cache miss
        if allow_expired and key in self._fallback_cache:
            return self._fallback_cache[key]
        
        return None
    
    def set(self, key: str, value: Any, ttl_seconds: int = 600):
        self._cache[key] = {
            "value": value,
            "expires_at": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
            "created_at": datetime.now(timezone.utc)
        }
        # Also update fallback cache
        self._fallback_cache[key] = value
    
    def delete(self, key: str):
        if key in self._cache:
            del self._cache[key]
    
    def clear(self):
        self._cache = {}
        # Keep fallback cache for emergency use
    
    def get_fallback(self, key: str) -> Optional[Any]:
        """Get data from fallback cache (last known good data)"""
        return self._fallback_cache.get(key)
    
    def get_stats(self) -> Dict:
        now = datetime.now(timezone.utc)
        valid_count = sum(1 for item in self._cache.values() if now < item["expires_at"])
        return {
            "total_keys": len(self._cache),
            "valid_keys": valid_count,
            "fallback_keys": len(self._fallback_cache)
        }


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
                    elif isinstance(reset_time, datetime) and reset_time.tzinfo is None:
                        reset_time = reset_time.replace(tzinfo=timezone.utc)
                    
                    now = datetime.now(timezone.utc)
                    if reset_time and now >= reset_time:
                        await self._reset_quota()
                        return await self.get_status()
                    
                    last_req = doc.get("last_request_time")
                    if isinstance(last_req, datetime) and last_req.tzinfo is None:
                        last_req = last_req.replace(tzinfo=timezone.utc)
                    
                    self._quota_status = QuotaStatus(
                        requests_made=doc.get("requests_made", 0),
                        quota_limit=doc.get("quota_limit", DAILY_QUOTA_LIMIT),
                        reset_time=reset_time or (now + timedelta(days=1)),
                        last_request_time=last_req,
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
        self._rate_limited_until: Optional[datetime] = None
        self._last_api_error: Optional[str] = None
        self._api_available = True
    
    def _make_cache_key(self, endpoint: str, params: Dict = None) -> str:
        key_str = endpoint
        if params:
            key_str += json.dumps(params, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    def _is_rate_limited(self) -> bool:
        """Check if we're in rate limit cooldown"""
        if self._rate_limited_until is None:
            return False
        if datetime.now(timezone.utc) >= self._rate_limited_until:
            self._rate_limited_until = None
            self._api_available = True
            logger.info("Rate limit cooldown expired, API available again")
            return False
        return True
    
    async def _api_request(self, endpoint: str, params: Dict = None, use_cache: bool = True, cache_ttl: int = CACHE_TTL_LIVE) -> Optional[Dict]:
        cache_key = self._make_cache_key(endpoint, params)
        
        # Check cache first
        if use_cache:
            cached_data = cache.get(cache_key)
            if cached_data:
                logger.debug(f"Cache HIT: {endpoint}")
                return cached_data
        
        # Check rate limit status
        if self._is_rate_limited():
            logger.warning(f"API rate limited, serving fallback cache for {endpoint}")
            fallback = cache.get(cache_key, allow_expired=True)
            if fallback:
                return fallback
            return None
        
        # Check quota
        can_request = await self.quota_manager.can_make_request()
        if not can_request:
            logger.error("Quota exceeded - serving fallback cache if available")
            return cache.get(cache_key, allow_expired=True)
        
        url = f"{self.base_url}/{endpoint}"
        request_params = {"apikey": self.api_key}
        if params:
            request_params.update(params)
        
        try:
            await self.quota_manager.increment_request()
            response = requests.get(url, params=request_params, timeout=8)
            
            # Handle rate limiting (429)
            if response.status_code == 429:
                logger.warning("API rate limit reached (429). Entering cooldown...")
                self._rate_limited_until = datetime.now(timezone.utc) + timedelta(seconds=RATE_LIMIT_RETRY_SECONDS)
                self._api_available = False
                self._last_api_error = "Rate limit exceeded"
                # Return fallback data
                return cache.get(cache_key, allow_expired=True)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    cache.set(cache_key, data, cache_ttl)
                    self._api_available = True
                    self._last_api_error = None
                    logger.info(f"API success: {endpoint}")
                    return data
                else:
                    error_msg = data.get('reason', 'Unknown error')
                    logger.error(f"API error: {error_msg}")
                    self._last_api_error = error_msg
            else:
                logger.error(f"API HTTP {response.status_code}")
                self._last_api_error = f"HTTP {response.status_code}"
                
        except requests.exceptions.Timeout:
            logger.error(f"API timeout: {endpoint}")
            self._last_api_error = "Timeout"
        except requests.exceptions.RequestException as e:
            logger.error(f"API error: {e}")
            self._last_api_error = str(e)
        
        # Return fallback data on any error
        fallback = cache.get(cache_key, allow_expired=True)
        if fallback:
            logger.info(f"Serving fallback cache for {endpoint}")
            return fallback
        
        return None
    
    def _is_match_truly_live(self, match: Dict) -> bool:
        """
        Determine if a match is truly live using STRICT criteria.
        Returns True ONLY if match is actively in progress.
        
        STRICT RULE: matchStarted MUST be True AND matchEnded MUST be False
        """
        # Check matchStarted and matchEnded flags FIRST - these are authoritative
        match_started = match.get("matchStarted")
        match_ended = match.get("matchEnded")
        
        # STRICT: matchStarted must be explicitly True (not None, not missing)
        if match_started is not True:
            return False
        
        # STRICT: matchEnded must be False or not set
        if match_ended is True:
            return False
        
        # Double-check status field
        status = str(match.get("status", "")).lower()
        if status in ["completed", "finished", "ended", "abandoned", "cancelled", "no result", "match over"]:
            return False
        
        # Only return True if matchStarted=True AND matchEnded!=True
        return True
    
    def _is_match_upcoming(self, match: Dict) -> bool:
        """Check if match is upcoming (not started yet)"""
        match_started = match.get("matchStarted", False)
        match_ended = match.get("matchEnded", False)
        status = str(match.get("status", "")).lower()
        
        if match_started or match_ended:
            return False
        
        if status in ["completed", "finished", "ended", "abandoned", "cancelled"]:
            return False
        
        return True
    
    def _is_match_completed(self, match: Dict) -> bool:
        """Check if match is completed/finished"""
        status = str(match.get("status", "")).lower()
        match_ended = match.get("matchEnded", False)
        
        if match_ended:
            return True
        
        if status in ["completed", "finished", "ended", "abandoned", "cancelled", "no result"]:
            return True
        
        return False
    
    async def get_live_matches(self) -> List[Dict]:
        """Get only currently live matches with strict filtering"""
        data = await self._api_request("currentMatches", cache_ttl=CACHE_TTL_LIVE)
        if data and data.get("data"):
            matches = data["data"]
            # Strict filtering: only truly live matches
            live = [m for m in matches if self._is_match_truly_live(m)]
            self._live_matches_exist = len(live) > 0
            logger.info(f"Live matches found: {len(live)} out of {len(matches)} total")
            return live
        self._live_matches_exist = False
        return []
    
    async def get_upcoming_matches(self) -> List[Dict]:
        """Get only upcoming matches"""
        data = await self._api_request("matches", cache_ttl=CACHE_TTL_SCHEDULED)
        if data and data.get("data"):
            return [m for m in data["data"] if self._is_match_upcoming(m)]
        return []
    
    async def get_all_matches(self) -> Dict[str, List[Dict]]:
        """Get categorized matches with proper status filtering"""
        live = await self.get_live_matches()
        upcoming = await self.get_upcoming_matches()
        return {
            "live": live,
            "upcoming": upcoming,
            "total": len(live) + len(upcoming),
            "api_available": self._api_available,
            "last_error": self._last_api_error
        }
    
    def has_live_matches(self) -> bool:
        return self._live_matches_exist
    
    def is_api_available(self) -> bool:
        return self._api_available and not self._is_rate_limited()
    
    async def get_service_status(self) -> Dict:
        quota = await self.quota_manager.get_status()
        return {
            "service": "cricket_data_service",
            "api_configured": bool(self.api_key),
            "api_available": self._api_available,
            "rate_limited": self._is_rate_limited(),
            "rate_limited_until": self._rate_limited_until.isoformat() if self._rate_limited_until else None,
            "last_error": self._last_api_error,
            "quota": quota.to_dict(),
            "cache": cache.get_stats(),
            "has_live_matches": self._live_matches_exist,
            "poll_interval_min": POLL_INTERVAL_LIVE_SECONDS if self._live_matches_exist else POLL_INTERVAL_IDLE
        }
    
    async def transform_for_frontend(self, matches: List[Dict]) -> List[Dict]:
        """Transform API data to frontend format with proper status handling"""
        transformed = []
        for m in matches:
            try:
                # Parse date
                date_str = m.get("dateTimeGMT") or m.get("date")
                try:
                    commence_time = datetime.fromisoformat(date_str.replace("Z", "+00:00")) if date_str else datetime.now(timezone.utc)
                except (ValueError, AttributeError):
                    commence_time = datetime.now(timezone.utc)
                
                # Extract teams
                teams = m.get("teams", [])
                home_team = teams[0] if len(teams) > 0 else "Team A"
                away_team = teams[1] if len(teams) > 1 else "Team B"
                
                # Determine format
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
                
                # STRICT status determination
                if self._is_match_truly_live(m):
                    status = "live"
                elif self._is_match_completed(m):
                    status = "completed"
                else:
                    status = "scheduled"
                
                # Build match object
                match_obj = {
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
                    "hasTieMarket": status == "live" and fmt in ["t20", "odi"],
                    "format": fmt,
                    "score": m.get("score", []),
                    "venue": m.get("venue", ""),
                    "matchStarted": m.get("matchStarted", False),
                    "matchEnded": m.get("matchEnded", False),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                
                transformed.append(match_obj)
            except Exception as e:
                logger.error(f"Transform error: {e}")
        return transformed


def create_cricket_service(db=None) -> CricketDataService:
    if not CRICKET_API_KEY:
        logger.warning("CRICKETDATA_API_KEY not set!")
    return CricketDataService(db)
