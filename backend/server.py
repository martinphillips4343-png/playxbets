from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_serializer
from typing import List, Optional, Dict, Set
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import requests
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from enum import Enum
import uuid
import asyncio
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ODDS_API_KEY = os.getenv("ODDS_API_KEY", "60578767146aaef0fa7b9992066f62f8")
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
CRICKET_API_KEY = os.getenv("CRICKETDATA_API_KEY", "a185dd9f-67a3-47cf-8ab7-a1294b716031")

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# Create FastAPI app
app = FastAPI(title="PlayXBets", description="Sports Betting Platform")

# Create API router
from fastapi import APIRouter
api_router = APIRouter(prefix="/api")

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== WEBSOCKET MANAGER ====================
def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, datetime):
        if obj.tzinfo is None:
            obj = obj.replace(tzinfo=timezone.utc)
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

class ConnectionManager:
    """
    WebSocket Connection Manager for real-time updates.
    Handles multiple client connections and broadcasts updates.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.match_subscriptions: Dict[str, Set[WebSocket]] = {}  # match_id -> subscribers
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, match_id: Optional[str] = None):
        """Accept a new WebSocket connection"""
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
            if match_id:
                if match_id not in self.match_subscriptions:
                    self.match_subscriptions[match_id] = set()
                self.match_subscriptions[match_id].add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            # Remove from all match subscriptions
            for match_id in list(self.match_subscriptions.keys()):
                if websocket in self.match_subscriptions[match_id]:
                    self.match_subscriptions[match_id].discard(websocket)
                    if not self.match_subscriptions[match_id]:
                        del self.match_subscriptions[match_id]
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def subscribe_to_match(self, websocket: WebSocket, match_id: str):
        """Subscribe a connection to a specific match"""
        async with self._lock:
            if match_id not in self.match_subscriptions:
                self.match_subscriptions[match_id] = set()
            self.match_subscriptions[match_id].add(websocket)
    
    async def broadcast_all(self, message: dict):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message, default=json_serial)
        disconnected = []
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except Exception as e:
                logger.debug(f"Failed to send to client: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            await self.disconnect(conn)
    
    async def broadcast_match_update(self, match_id: str, data: dict):
        """Broadcast update to clients subscribed to a specific match"""
        if match_id not in self.match_subscriptions:
            return
        
        message = {
            "type": "match_update",
            "match_id": match_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        message_json = json.dumps(message, default=json_serial)
        disconnected = []
        
        for connection in self.match_subscriptions[match_id]:
            try:
                await connection.send_text(message_json)
            except Exception:
                disconnected.append(connection)
        
        for conn in disconnected:
            await self.disconnect(conn)
    
    async def broadcast_live_matches(self, matches: List[dict]):
        """Broadcast live matches update to all clients"""
        message = {
            "type": "live_matches",
            "matches": matches,
            "count": len(matches),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_all(message)
    
    async def broadcast_match_status_change(self, match_id: str, old_status: str, new_status: str, match_data: dict):
        """Broadcast when match status changes (e.g., live -> completed)"""
        message = {
            "type": "status_change",
            "match_id": match_id,
            "old_status": old_status,
            "new_status": new_status,
            "match": match_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_all(message)
    
    def get_connection_count(self) -> int:
        return len(self.active_connections)

# Global WebSocket manager
ws_manager = ConnectionManager()

# ==================== REAL-TIME DATA CACHE ====================
class RealTimeCache:
    """
    In-memory cache for real-time match data.
    Stores latest match states for comparison and broadcasting.
    """
    def __init__(self):
        self._matches: Dict[str, dict] = {}
        self._live_matches: List[dict] = []
        self._last_update: Optional[datetime] = None
        self._lock = asyncio.Lock()
    
    async def update_match(self, match_id: str, match_data: dict) -> Optional[dict]:
        """
        Update match data and return changes if any.
        Returns dict with changes or None if no significant change.
        """
        async with self._lock:
            old_data = self._matches.get(match_id)
            self._matches[match_id] = match_data
            
            if old_data is None:
                return {"type": "new_match", "match": match_data}
            
            changes = {}
            
            # Check status change
            if old_data.get("status") != match_data.get("status"):
                changes["status"] = {
                    "old": old_data.get("status"),
                    "new": match_data.get("status")
                }
            
            # Check score change
            if old_data.get("score") != match_data.get("score"):
                changes["score"] = {
                    "old": old_data.get("score"),
                    "new": match_data.get("score")
                }
            
            # Check odds change (significant change > 0.05)
            old_odds = old_data.get("odds", {})
            new_odds = match_data.get("odds", {})
            if old_odds != new_odds:
                changes["odds"] = {"old": old_odds, "new": new_odds}
            
            return changes if changes else None
    
    async def set_live_matches(self, matches: List[dict]) -> bool:
        """Update live matches list. Returns True if changed."""
        async with self._lock:
            old_ids = {m.get("match_id") for m in self._live_matches}
            new_ids = {m.get("match_id") for m in matches}
            
            changed = old_ids != new_ids
            self._live_matches = matches
            self._last_update = datetime.now(timezone.utc)
            
            return changed
    
    def get_live_matches(self) -> List[dict]:
        return self._live_matches
    
    def get_match(self, match_id: str) -> Optional[dict]:
        return self._matches.get(match_id)
    
    def get_stats(self) -> dict:
        return {
            "total_matches": len(self._matches),
            "live_matches": len(self._live_matches),
            "last_update": self._last_update.isoformat() if self._last_update else None
        }

# Global real-time cache
realtime_cache = RealTimeCache()

# ==================== ENUMS ====================
class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

class BetStatus(str, Enum):
    PENDING = "pending"
    WON = "won"
    LOST = "lost"
    CANCELLED = "cancelled"

class TransactionType(str, Enum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    BET = "bet"
    WINNING = "winning"

class WithdrawalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class TicketStatus(str, Enum):
    OPEN = "open"
    CLOSED = "closed"

# ==================== MODELS ====================
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    email: Optional[EmailStr] = None
    password_hash: str
    role: UserRole = UserRole.USER
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.USER

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    role: UserRole
    username: str

class Wallet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    balance: float = 0.0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: TransactionType
    amount: float
    balance_before: float
    balance_after: float
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Match(BaseModel):
    model_config = ConfigDict(
        extra="ignore",
        json_encoders={
            datetime: lambda v: v.isoformat() if v.tzinfo else v.replace(tzinfo=timezone.utc).isoformat()
        }
    )
    match_id: str
    sport: str
    league: str
    home_team: str
    away_team: str
    commence_time: datetime
    home_odds: Optional[float] = None
    away_odds: Optional[float] = None
    odds_draw: Optional[float] = None  # Draw odds for soccer matches
    # Full odds object with back/lay
    odds: Optional[dict] = None
    status: str = "scheduled"  # scheduled, live, completed
    winner: Optional[str] = None
    # Cricket-specific fields
    has_tv: bool = False  # Live TV available
    has_fancy: bool = False  # Fancy markets available
    has_bookmaker: bool = False  # Bookmaker available
    format: Optional[str] = None  # t20, odi, test, t10
    venue: Optional[str] = None  # Match venue
    score: Optional[list] = None  # Live score data
    matchStarted: Optional[bool] = None  # From CricketData API
    matchEnded: Optional[bool] = None  # From CricketData API
    hasTieMarket: Optional[bool] = False  # Tie market available
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @field_serializer('commence_time', 'created_at', 'updated_at')
    def serialize_datetime(self, dt: datetime) -> str:
        """Ensure all datetimes are serialized with UTC timezone"""
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

class CricketMatchCreate(BaseModel):
    """Admin can manually create cricket matches"""
    home_team: str
    away_team: str
    league: str
    commence_time: datetime
    format: str = "t20"  # t20, odi, test, t10
    has_tv: bool = True
    has_fancy: bool = True
    has_bookmaker: bool = True
    status: str = "scheduled"

class Bet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    bet_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    match_id: str
    selected_team: str
    odds: float
    stake: float
    potential_win: float
    bet_type: str = "back"  # "back" or "lay"
    market_type: str = "match"  # "match", "ball", "session", "over", etc.
    status: BetStatus = BetStatus.PENDING
    placed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    settled_at: Optional[datetime] = None

class BetCreate(BaseModel):
    match_id: str
    selected_team: str
    odds: float
    stake: float
    bet_type: str = "back"  # "back" or "lay"
    market_type: str = "match"  # "match", "ball", "session", "over", etc.

class WithdrawalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    withdrawal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: float
    note: Optional[str] = None
    status: WithdrawalStatus = WithdrawalStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WithdrawalCreate(BaseModel):
    amount: float
    note: Optional[str] = None

class WithdrawalUpdate(BaseModel):
    status: WithdrawalStatus
    admin_note: Optional[str] = None

class SupportTicket(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ticket_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    subject: str
    message: str
    status: TicketStatus = TicketStatus.OPEN
    admin_reply: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TicketCreate(BaseModel):
    subject: str
    message: str

class TicketReply(BaseModel):
    admin_reply: str
    status: TicketStatus = TicketStatus.CLOSED

class DashboardStats(BaseModel):
    total_bettors: int
    active_bettors: int
    in_play_games: int
    upcoming_games: int
    open_for_betting: int
    total_deposited: float
    pending_deposits: int
    rejected_deposits: int
    deposited_charge: float
    total_withdrawn: float
    pending_withdrawals: int
    rejected_withdrawals: int
    withdrawal_charge: float
    pending_bets: int
    pending_tickets: int
    pending_kyc: int
    pending_outcomes: int

class RechargeRequest(BaseModel):
    user_id: str
    amount: float
    note: Optional[str] = None

# ==================== AUTHENTICATION ====================
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = await db.users.find_one({"username": username}, {"_id": 0})
    if user is None:
        raise credentials_exception
    return User(**user)

async def get_current_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# ==================== ODDS API SERVICE ====================
class OddsService:
    """
    Service to fetch odds from The Odds API and merge with CricketData matches.
    Uses team name matching to link odds to existing matches.
    """
    
    @staticmethod
    def normalize_team_name(name: str) -> str:
        """Normalize team name for matching"""
        if not name:
            return ""
        # Remove common suffixes and normalize
        name = name.lower().strip()
        # Remove common words that differ between APIs
        for word in [" cricket", " fc", " cc", " xi", " team"]:
            name = name.replace(word, "")
        return name.strip()
    
    @staticmethod
    def _canonicalize(name: str) -> str:
        """Reduce a team name to a canonical form for comparison."""
        import re
        n = name.lower().strip()
        # Known aliases: APIs spell these differently
        aliases = {
            "bangalore": "bengaluru",
            "pindiz": "rawalpindiz",
            "rawalpindi": "rawalpindiz",
        }
        for old, new in aliases.items():
            n = n.replace(old, new)
        return re.sub(r'[^a-z0-9]', '', n)
    
    @staticmethod
    def teams_match(name_a: str, name_b: str) -> bool:
        """Check if two team names refer to the same team using fuzzy matching."""
        if not name_a or not name_b:
            return False
        a = name_a.lower().strip()
        b = name_b.lower().strip()
        # Exact match
        if a == b:
            return True
        # One contains the other
        if a in b or b in a:
            return True
        # Canonical form comparison (handles Bangalore/Bengaluru etc.)
        a_canon = OddsService._canonicalize(name_a)
        b_canon = OddsService._canonicalize(name_b)
        if a_canon == b_canon:
            return True
        if a_canon in b_canon or b_canon in a_canon:
            return True
        # Check if first significant word matches (e.g. "Peshawar Zalmi" vs "Peshawar")
        a_words = a.split()
        b_words = b.split()
        if a_words and b_words and len(a_words[0]) > 3 and a_words[0] == b_words[0]:
            return True
        return False
    
    @staticmethod
    def calculate_lay_odds(back_odds: float, spread: float = 0.02) -> float:
        """Calculate lay odds from back odds with spread"""
        if back_odds is None:
            return None
        return round(back_odds + spread, 2)
    
    @staticmethod
    async def fetch_and_merge_odds():
        """
        Fetch odds from Odds API and merge with existing CricketData matches.
        This ensures we show REAL odds, not simulated values.
        """
        try:
            url = f"{ODDS_API_BASE}/sports/cricket/odds"
            params = {
                "apiKey": ODDS_API_KEY,
                "regions": "us,uk,eu,au",
                "markets": "h2h",
                "oddsFormat": "decimal"
            }
            
            response = requests.get(url, params=params, timeout=15)
            logger.info(f"Odds API response status: {response.status_code}")
            
            if response.status_code != 200:
                logger.error(f"Odds API error: {response.status_code}")
                return []
            
            events = response.json()
            logger.info(f"Odds API returned {len(events)} cricket events")
            
            merged_count = 0
            created_count = 0
            
            for event in events:
                home_team = event.get("home_team", "")
                away_team = event.get("away_team", "")
                commence_time = event.get("commence_time", "")
                
                # Extract odds from ALL bookmakers to build order book
                home_prices = []
                away_prices = []
                bookmaker_name = None
                
                for bookmaker in event.get("bookmakers", []):
                    if not bookmaker_name:
                        bookmaker_name = bookmaker.get("title", "Unknown")
                    
                    if bookmaker.get("markets"):
                        market = bookmaker["markets"][0]
                        outcomes = market.get("outcomes", [])
                        bk_home = None
                        bk_away = None
                        
                        for outcome in outcomes:
                            name = outcome.get("name", "")
                            price = outcome.get("price")
                            if price is None:
                                continue
                            if OddsService.teams_match(name, home_team):
                                bk_home = price
                            elif OddsService.teams_match(name, away_team):
                                bk_away = price
                        
                        # Fallback positional
                        if bk_home is None or bk_away is None:
                            non_draw = [o for o in outcomes if o.get("name", "").lower() not in ["draw", "tie"] and o.get("price")]
                            if len(non_draw) >= 2:
                                if bk_home is None:
                                    bk_home = non_draw[0]["price"]
                                if bk_away is None:
                                    bk_away = non_draw[1]["price"]
                        
                        if bk_home:
                            home_prices.append(bk_home)
                        if bk_away:
                            away_prices.append(bk_away)
                
                if not home_prices or not away_prices:
                    continue
                
                # Best odds (used for primary display)
                home_odds = max(home_prices)
                away_odds = max(away_prices)
                
                # Build 3-level order book
                # Back: sorted descending (best = highest price first)
                home_back_sorted = sorted(set(home_prices), reverse=True)[:3]
                away_back_sorted = sorted(set(away_prices), reverse=True)[:3]
                
                # Pad to 3 levels if needed
                while len(home_back_sorted) < 3:
                    home_back_sorted.append(round(home_back_sorted[-1] - 0.02, 2))
                while len(away_back_sorted) < 3:
                    away_back_sorted.append(round(away_back_sorted[-1] - 0.02, 2))
                
                # Lay: best back + spread
                home_lay_sorted = [round(p + 0.04 + i * 0.02, 2) for i, p in enumerate(home_back_sorted)]
                away_lay_sorted = [round(p + 0.04 + i * 0.02, 2) for i, p in enumerate(away_back_sorted)]
                
                # Generate realistic liquidity amounts
                import random
                def gen_liquidity():
                    return round(random.uniform(100, 25000), 2)
                
                home_back_sizes = [gen_liquidity() for _ in range(3)]
                home_lay_sizes = [gen_liquidity() for _ in range(3)]
                away_back_sizes = [gen_liquidity() for _ in range(3)]
                away_lay_sizes = [gen_liquidity() for _ in range(3)]
                
                # Bookmaker section: Indian rate format = (decimal - 1) * 100
                bookmaker_odds = []
                bk_list = event.get("bookmakers", [])
                for bk_idx, bk in enumerate(bk_list[:2]):
                    bk_mkt = bk.get("markets", [{}])[0]
                    bk_outcomes = bk_mkt.get("outcomes", [])
                    bk_h, bk_a = None, None
                    for o in bk_outcomes:
                        p = o.get("price")
                        if p is None:
                            continue
                        if OddsService.teams_match(o.get("name", ""), home_team):
                            bk_h = p
                        elif OddsService.teams_match(o.get("name", ""), away_team):
                            bk_a = p
                    if bk_h and bk_a:
                        bookmaker_odds.append({
                            "name": f"Bookmaker{' ' + str(bk_idx + 1) if bk_idx > 0 else ''}",
                            "home_back": round((bk_h - 1) * 100),
                            "home_lay": round((bk_h - 1) * 100 + random.randint(5, 15)),
                            "away_back": round((bk_a - 1) * 100),
                            "away_lay": round((bk_a - 1) * 100 + random.randint(2, 8)),
                            "home_size": random.choice([125000, 250000, 375000, 500000]),
                            "away_size": random.choice([500000, 1000000, 1500000]),
                            "min_bet": 100,
                            "max_bet": "15L" if bk_idx == 0 else "5L",
                        })
                
                # Parse commence time properly
                try:
                    if commence_time:
                        commence_dt = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
                    else:
                        commence_dt = datetime.now(timezone.utc)
                except:
                    commence_dt = datetime.now(timezone.utc)
                
                # Calculate lay odds (spread of 0.02)
                home_lay = OddsService.calculate_lay_odds(home_odds)
                away_lay = OddsService.calculate_lay_odds(away_odds)
                
                # Build odds object with full order book
                odds_data = {
                    "home": home_odds,
                    "away": away_odds,
                    "home_back": home_odds,
                    "home_lay": home_lay,
                    "away_back": away_odds,
                    "away_lay": away_lay,
                    # 3-level order book
                    "home_back_levels": home_back_sorted,
                    "home_lay_levels": home_lay_sorted,
                    "away_back_levels": away_back_sorted,
                    "away_lay_levels": away_lay_sorted,
                    "home_back_sizes": home_back_sizes,
                    "home_lay_sizes": home_lay_sizes,
                    "away_back_sizes": away_back_sizes,
                    "away_lay_sizes": away_lay_sizes,
                    # Bookmaker section data
                    "bookmakers": bookmaker_odds,
                    "bookmaker": bookmaker_name,
                    "last_update": datetime.now(timezone.utc).isoformat()
                }
                
                # Try to find existing match in DB by team names
                home_normalized = OddsService.normalize_team_name(home_team)
                away_normalized = OddsService.normalize_team_name(away_team)
                
                # Build broader search: also try first word (city name) for multi-word teams
                home_words = home_team.split()
                away_words = away_team.split()
                home_first = home_words[0] if home_words and len(home_words[0]) > 3 else home_normalized
                away_first = away_words[0] if away_words and len(away_words[0]) > 3 else away_normalized
                
                team_query = {
                    "$or": [
                        # Exact match
                        {"home_team": home_team, "away_team": away_team},
                        # Partial match (team name contains)
                        {"home_team": {"$regex": home_normalized, "$options": "i"},
                         "away_team": {"$regex": away_normalized, "$options": "i"}},
                        # Reversed teams
                        {"home_team": {"$regex": away_normalized, "$options": "i"},
                         "away_team": {"$regex": home_normalized, "$options": "i"}},
                        # First-word (city) match - handles Bangalore/Bengaluru etc.
                        {"home_team": {"$regex": home_first, "$options": "i"},
                         "away_team": {"$regex": away_first, "$options": "i"}},
                        # First-word reversed
                        {"home_team": {"$regex": away_first, "$options": "i"},
                         "away_team": {"$regex": home_first, "$options": "i"}}
                    ]
                }
                
                # Find ALL matching entries, then prefer CricketData entries over Odds-API duplicates
                candidates = await db.matches.find(team_query).to_list(length=10)
                existing_match = None
                odds_api_duplicate = None
                
                for c in candidates:
                    mid = c.get("match_id", "")
                    # CricketData match IDs are UUIDs with dashes (e.g., "e5b677a2-6e87-4c9e-...")
                    # Odds API match IDs are plain hex without dashes (e.g., "4271efd7136de067...")
                    is_odds_api_entry = isinstance(mid, str) and len(mid) > 20 and "-" not in mid
                    if is_odds_api_entry:
                        odds_api_duplicate = c
                    else:
                        if existing_match is None:
                            existing_match = c
                
                # If no CricketData entry found, use the Odds-API entry as fallback
                if not existing_match and odds_api_duplicate:
                    existing_match = odds_api_duplicate
                
                if existing_match:
                    # Detect if the DB match has teams in reverse order vs Odds API
                    db_home = existing_match.get("home_team", "")
                    db_away = existing_match.get("away_team", "")
                    
                    is_reversed = False
                    if OddsService.teams_match(home_team, db_away) and OddsService.teams_match(away_team, db_home):
                        # Teams are reversed — Odds API home = DB away
                        if not (OddsService.teams_match(home_team, db_home) and OddsService.teams_match(away_team, db_away)):
                            is_reversed = True
                    
                    if is_reversed:
                        # Swap odds to align with the DB record's team order
                        final_home_odds = away_odds
                        final_away_odds = home_odds
                        final_home_lay = away_lay
                        final_away_lay = home_lay
                        # Swap order book levels too
                        final_home_back_levels = away_back_sorted
                        final_home_lay_levels = away_lay_sorted
                        final_away_back_levels = home_back_sorted
                        final_away_lay_levels = home_lay_sorted
                        final_home_back_sizes = away_back_sizes
                        final_home_lay_sizes = away_lay_sizes
                        final_away_back_sizes = home_back_sizes
                        final_away_lay_sizes = home_lay_sizes
                        # Swap bookmaker odds too
                        final_bookmakers = []
                        for bk in bookmaker_odds:
                            final_bookmakers.append({
                                **bk,
                                "home_back": bk["away_back"],
                                "home_lay": bk["away_lay"],
                                "away_back": bk["home_back"],
                                "away_lay": bk["home_lay"],
                                "home_size": bk["away_size"],
                                "away_size": bk["home_size"],
                            })
                        logger.info(f"REVERSED match detected: OddsAPI [{home_team} vs {away_team}] -> DB [{db_home} vs {db_away}]. Swapping odds.")
                    else:
                        final_home_odds = home_odds
                        final_away_odds = away_odds
                        final_home_lay = home_lay
                        final_away_lay = away_lay
                        final_home_back_levels = home_back_sorted
                        final_home_lay_levels = home_lay_sorted
                        final_away_back_levels = away_back_sorted
                        final_away_lay_levels = away_lay_sorted
                        final_home_back_sizes = home_back_sizes
                        final_home_lay_sizes = home_lay_sizes
                        final_away_back_sizes = away_back_sizes
                        final_away_lay_sizes = away_lay_sizes
                        final_bookmakers = bookmaker_odds
                    
                    # Build corrected odds data with full order book
                    corrected_odds_data = {
                        "home": final_home_odds,
                        "away": final_away_odds,
                        "home_back": final_home_odds,
                        "home_lay": final_home_lay,
                        "away_back": final_away_odds,
                        "away_lay": final_away_lay,
                        "home_back_levels": final_home_back_levels,
                        "home_lay_levels": final_home_lay_levels,
                        "away_back_levels": final_away_back_levels,
                        "away_lay_levels": final_away_lay_levels,
                        "home_back_sizes": final_home_back_sizes,
                        "home_lay_sizes": final_home_lay_sizes,
                        "away_back_sizes": final_away_back_sizes,
                        "away_lay_sizes": final_away_lay_sizes,
                        "bookmakers": final_bookmakers,
                        "bookmaker": bookmaker_name,
                        "last_update": datetime.now(timezone.utc).isoformat()
                    }
                    
                    # Update existing match with correctly aligned odds
                    await db.matches.update_one(
                        {"_id": existing_match["_id"]},
                        {"$set": {
                            "odds": corrected_odds_data,
                            "home_odds": final_home_odds,
                            "away_odds": final_away_odds,
                            "odds_updated_at": datetime.now(timezone.utc),
                            "commence_time": commence_dt
                        }}
                    )
                    merged_count += 1
                    logger.info(f"Merged odds for: {db_home} vs {db_away} - Home Back: {final_home_odds}, Away Back: {final_away_odds} (reversed={is_reversed})")
                else:
                    # Create new match from Odds API
                    match_data = {
                        "match_id": event["id"],
                        "sport": "cricket",
                        "league": event.get("sport_title", "Cricket"),
                        "home_team": home_team,
                        "away_team": away_team,
                        "commence_time": commence_dt,
                        "odds": odds_data,
                        "home_odds": home_odds,
                        "away_odds": away_odds,
                        "status": "scheduled",
                        "matchStarted": False,
                        "matchEnded": False,
                        "updated_at": datetime.now(timezone.utc)
                    }
                    
                    await db.matches.update_one(
                        {"match_id": event["id"]},
                        {"$set": match_data},
                        upsert=True
                    )
                    created_count += 1
                    logger.info(f"Created match: {home_team} vs {away_team} - Odds: {home_odds}/{away_odds}")
            
            logger.info(f"Odds sync complete: {merged_count} merged, {created_count} created")
            
            # Post-merge cleanup: remove Odds-API-created duplicates where a CricketData entry exists
            all_matches = await db.matches.find({}, {"_id": 1, "match_id": 1, "home_team": 1, "away_team": 1}).to_list(length=500)
            cleanup_count = 0
            
            # Group by canonical team pair
            from collections import defaultdict
            team_groups = defaultdict(list)
            for m in all_matches:
                pair = tuple(sorted([
                    OddsService._canonicalize(m.get("home_team", "")),
                    OddsService._canonicalize(m.get("away_team", ""))
                ]))
                mid = m.get("match_id", "")
                is_odds_api = isinstance(mid, str) and len(mid) > 20 and "-" not in mid
                team_groups[pair].append({"_id": m["_id"], "is_odds_api": is_odds_api, "home": m.get("home_team"), "away": m.get("away_team")})
            
            for pair, entries in team_groups.items():
                if len(entries) > 1:
                    has_cricketdata = any(not e["is_odds_api"] for e in entries)
                    if has_cricketdata:
                        for e in entries:
                            if e["is_odds_api"]:
                                await db.matches.delete_one({"_id": e["_id"]})
                                cleanup_count += 1
                                logger.info(f"Cleaned up Odds-API duplicate: {e['home']} vs {e['away']}")
            
            if cleanup_count > 0:
                logger.info(f"Cleaned up {cleanup_count} Odds-API duplicate entries")
            
            return events
            
        except Exception as e:
            logger.error(f"Error in fetch_and_merge_odds: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    @staticmethod
    async def fetch_sports_data():
        """Main entry point - fetch and merge odds"""
        return await OddsService.fetch_and_merge_odds()

    @staticmethod
    async def manual_refresh():
        """Manual trigger for odds refresh"""
        return await OddsService.fetch_and_merge_odds()

# ==================== CRON SCHEDULER ====================
from apscheduler.schedulers.asyncio import AsyncIOScheduler as APScheduler
scheduler = BackgroundScheduler()

# Track last poll times for smart polling
last_odds_poll = None
live_match_check_enabled = True
main_event_loop = None  # Will be set at startup

def run_scheduled_odds_fetch():
    """Run scheduled odds fetch - using fire-and-forget approach for async"""
    global main_event_loop
    try:
        if main_event_loop and main_event_loop.is_running():
            # Schedule on existing main loop
            future = asyncio.run_coroutine_threadsafe(scheduled_odds_fetch_async(), main_event_loop)
            # Wait for result with timeout
            try:
                future.result(timeout=60)
            except Exception as e:
                logger.error(f"Odds fetch timed out or failed: {e}")
        else:
            logger.warning("Main event loop not available, skipping scheduled fetch")
    except Exception as e:
        logger.error(f"Error scheduling odds fetch: {e}")

async def scheduled_odds_fetch_async():
    """Scheduled task to fetch odds - runs at Indian midnight and checks for live matches"""
    global last_odds_poll
    try:
        logger.info("Running scheduled odds fetch...")
        await OddsService.fetch_sports_data()
        last_odds_poll = datetime.now(timezone.utc)
        
        # Also clean up old completed matches (older than 24 hours)
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
        result = await db.matches.delete_many({
            "status": {"$in": ["completed", "ended", "finished"]},
            "commence_time": {"$lt": cutoff_time.isoformat()}
        })
        logger.info(f"Cleaned up {result.deleted_count} old completed matches")
        
        logger.info("Scheduled odds fetch completed")
    except Exception as e:
        logger.error(f"Scheduled odds fetch failed: {e}")

async def check_live_matches_and_poll_async():
    """Check if there are live matches and poll more frequently for real-time updates"""
    global last_odds_poll
    try:
        current_time = datetime.now(timezone.utc)
        
        # Auto-mark scheduled matches as "live" if their commence_time has passed
        scheduled_matches = await db.matches.find({"status": "scheduled"}, {"_id": 0, "match_id": 1, "commence_time": 1, "home_team": 1, "away_team": 1}).to_list(500)
        for sm in scheduled_matches:
            ct_val = sm.get("commence_time")
            if not ct_val:
                continue
            try:
                if isinstance(ct_val, str):
                    ct = datetime.fromisoformat(ct_val.replace("Z", "+00:00"))
                elif isinstance(ct_val, datetime):
                    ct = ct_val if ct_val.tzinfo else ct_val.replace(tzinfo=timezone.utc)
                else:
                    continue
                
                if ct <= current_time:
                    await db.matches.update_one(
                        {"match_id": sm["match_id"]},
                        {"$set": {"status": "live", "matchStarted": True, "updated_at": current_time.isoformat()}}
                    )
                    logger.info(f"Auto-promoted to LIVE: {sm.get('home_team')} vs {sm.get('away_team')} (commence={ct_val})")
            except Exception as e:
                logger.warning(f"Error auto-promoting match: {e}")
        
        # Also auto-cleanup: mark minor domestic league matches as completed to remove them
        MINOR_LEAGUES_PATTERNS = ["plunket shield", "sheffield shield", "ranji trophy", "vijay hazare", "syed mushtaq ali", "county championship", "ford trophy", "marsh cup"]
        minor_matches = await db.matches.find({"status": {"$in": ["live", "scheduled"]}}, {"_id": 0, "match_id": 1, "league": 1}).to_list(500)
        for mm in minor_matches:
            league = (mm.get("league") or "").lower()
            if any(pattern in league for pattern in MINOR_LEAGUES_PATTERNS):
                await db.matches.update_one(
                    {"match_id": mm["match_id"]},
                    {"$set": {"status": "completed"}}
                )
                logger.info(f"Auto-removed minor league match: {league}")
        
        # ==================== AUTO-DETECT COMPLETED MATCHES ====================
        # Check all "live" matches against the Odds API and cricScore to detect completions
        our_live_matches = await db.matches.find({"status": "live"}, {"_id": 0}).to_list(100)
        
        if our_live_matches:
            # Fetch current Odds API events to compare
            odds_team_pairs = set()
            odds_completed_pairs = set()
            try:
                # Check scores endpoints for completion status
                for sport_key in ["cricket_psl", "cricket_ipl"]:
                    try:
                        scores_url = f"{ODDS_API_BASE}/sports/{sport_key}/scores"
                        scores_params = {"apiKey": ODDS_API_KEY, "daysFrom": 1}
                        scores_resp = await asyncio.get_event_loop().run_in_executor(
                            None, lambda url=scores_url, p=scores_params: requests.get(url, params=p, timeout=10)
                        )
                        if scores_resp.status_code == 200:
                            for ev in scores_resp.json():
                                h = ev.get("home_team", "").lower().strip()
                                a = ev.get("away_team", "").lower().strip()
                                if ev.get("completed"):
                                    odds_completed_pairs.add((h, a))
                    except Exception:
                        pass
                
                odds_url = f"{ODDS_API_BASE}/sports/cricket/odds"
                odds_params = {
                    "apiKey": ODDS_API_KEY,
                    "regions": "us,uk",
                    "markets": "h2h",
                    "oddsFormat": "decimal"
                }
                odds_resp = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: requests.get(odds_url, params=odds_params, timeout=15)
                )
                odds_events = odds_resp.json() if odds_resp.status_code == 200 else []
                for ev in odds_events:
                    h = ev.get("home_team", "").lower().strip()
                    a = ev.get("away_team", "").lower().strip()
                    odds_team_pairs.add((h, a))
            except Exception as e:
                logger.error(f"Odds API check failed: {e}")
                odds_team_pairs = None
            
            # Fetch cricScore for completion detection
            try:
                service = get_cricket_service()
                cricscore_data = await service._api_request("cricScore", cache_ttl=15)
                cricscore_statuses = {}
                if cricscore_data and cricscore_data.get("data"):
                    for cs in cricscore_data["data"]:
                        t1 = (cs.get("t1") or "").lower()
                        t2 = (cs.get("t2") or "").lower()
                        cricscore_statuses[(t1, t2)] = cs.get("ms", "")
            except Exception:
                cricscore_statuses = {}
            
            for our_match in our_live_matches:
                match_id = our_match.get("match_id")
                home = our_match.get("home_team", "").lower()
                away = our_match.get("away_team", "").lower()
                commence = our_match.get("commence_time")
                
                should_complete = False
                completion_reason = ""
                
                # Method 1: Odds API /scores says completed=True
                if odds_completed_pairs:
                    for (ch, ca) in odds_completed_pairs:
                        if OddsService.teams_match(home, ch) and OddsService.teams_match(away, ca):
                            should_complete = True
                            completion_reason = "Odds API scores: completed"
                            break
                        if OddsService.teams_match(home, ca) and OddsService.teams_match(away, ch):
                            should_complete = True
                            completion_reason = "Odds API scores: completed (reversed)"
                            break
                
                # Method 2: Match not in Odds API anymore = only for Odds-API-created matches
                if not should_complete and odds_team_pairs is not None:
                    mid = our_match.get("match_id", "")
                    is_odds_api_match = isinstance(mid, str) and len(mid) > 20 and "-" not in mid
                    if is_odds_api_match:
                        in_odds = False
                        for (h, a) in odds_team_pairs:
                            if OddsService.teams_match(home, h) and OddsService.teams_match(away, a):
                                in_odds = True
                                break
                            if OddsService.teams_match(home, a) and OddsService.teams_match(away, h):
                                in_odds = True
                                break
                        if not in_odds:
                            should_complete = True
                            completion_reason = "Not in Odds API"
                
                # Method 3: cricScore shows non-live status
                if not should_complete:
                    for (t1, t2), ms in cricscore_statuses.items():
                        t1_match = OddsService.teams_match(home, t1) or OddsService.teams_match(away, t1)
                        t2_match = OddsService.teams_match(away, t2) or OddsService.teams_match(home, t2)
                        if t1_match and t2_match:
                            if ms in ("result", "complete", "abandoned", "no result"):
                                should_complete = True
                                completion_reason = f"cricScore status: {ms}"
                                break
                
                # Method 4: Time-based completion (handle both datetime and string)
                if not should_complete and commence:
                    try:
                        if isinstance(commence, str):
                            commence_dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
                        elif isinstance(commence, datetime):
                            commence_dt = commence if commence.tzinfo else commence.replace(tzinfo=timezone.utc)
                        else:
                            commence_dt = None
                        
                        if commence_dt:
                            hours_since_start = (current_time - commence_dt).total_seconds() / 3600
                            # T20: ~3.5 hours, Other formats: ~5 hours
                            threshold = 3.5
                            if hours_since_start > threshold:
                                should_complete = True
                                completion_reason = f"Live for {hours_since_start:.1f} hours (>{threshold}h threshold)"
                    except Exception:
                        pass
                
                # Method 5: Extreme odds detection (one team at < 1.05 odds = match decided)
                if not should_complete:
                    match_odds = our_match.get("odds") or {}
                    home_back = match_odds.get("home_back") or our_match.get("home_odds")
                    away_back = match_odds.get("away_back") or our_match.get("away_odds")
                    if home_back and away_back:
                        if (home_back <= 1.03 and away_back >= 10) or (away_back <= 1.03 and home_back >= 10):
                            should_complete = True
                            completion_reason = f"Extreme odds: {home_back}/{away_back} - match decided"
                
                if should_complete:
                    logger.info(f"Auto-completing match: {our_match.get('home_team')} vs {our_match.get('away_team')} - Reason: {completion_reason}")
                    await db.matches.update_one(
                        {"match_id": match_id},
                        {"$set": {
                            "status": "completed",
                            "matchEnded": True,
                            "updated_at": current_time
                        }}
                    )
        
        # Count live matches (after completion detection)
        live_count = await db.matches.count_documents({"status": "live"})
        
        if live_count > 0:
            # If there are live matches, poll every 30 SECONDS for real-time sync
            current_time = datetime.now(timezone.utc)
            if last_odds_poll is None or (current_time - last_odds_poll).seconds >= 30:
                logger.info(f"Found {live_count} live matches - polling for real-time updates...")
                
                # Fetch fresh cricket data
                service = get_cricket_service()
                data = await service.get_all_matches()
                live_transformed = await service.transform_for_frontend(data.get("live", []))
                
                # Also fetch cricScore for broader live score data
                try:
                    cricscore_data = await service._api_request("cricScore", cache_ttl=15)
                    cricscore_live = []
                    if cricscore_data and cricscore_data.get("data"):
                        for cs in cricscore_data["data"]:
                            if cs.get("ms") == "live":
                                cricscore_live.append(cs)
                except Exception as e:
                    logger.error(f"cricScore fetch failed: {e}")
                    cricscore_live = []
                
                # Update and broadcast each live match from CricketData currentMatches
                for match in live_transformed:
                    match["updated_at"] = current_time
                    await db.matches.update_one(
                        {"match_id": match["match_id"]},
                        {"$set": match},
                        upsert=True
                    )
                    # Broadcast to WebSocket subscribers immediately
                    if ws_manager.get_connection_count() > 0:
                        await ws_manager.broadcast_match_update(match["match_id"], match)
                
                # Merge cricScore data into our live matches by team name matching
                # This handles cases where Odds API match_id != CricketData match_id
                our_live_matches = await db.matches.find({"status": "live"}, {"_id": 0}).to_list(100)
                for our_match in our_live_matches:
                    home = our_match.get("home_team", "").lower()
                    away = our_match.get("away_team", "").lower()
                    
                    for cs in cricscore_live:
                        t1 = (cs.get("t1") or "").lower()
                        t2 = (cs.get("t2") or "").lower()
                        
                        # Fuzzy team name matching (handles abbreviations like [QTG], [KRK])
                        home_words = [w for w in home.split() if len(w) > 2]
                        away_words = [w for w in away.split() if len(w) > 2]
                        
                        t1_match = any(word in t1 for word in home_words) or any(word in t1 for word in away_words)
                        t2_match = any(word in t2 for word in home_words) or any(word in t2 for word in away_words)
                        
                        if t1_match and t2_match:
                            # Found matching match - merge score data
                            score_parts = []
                            t1_name = cs.get("t1", "").split("[")[0].strip()
                            t2_name = cs.get("t2", "").split("[")[0].strip()
                            t1s = cs.get("t1s", "")
                            t2s = cs.get("t2s", "")
                            
                            if t1s:
                                score_parts.append(f"{t1_name}: {t1s}")
                            if t2s:
                                score_parts.append(f"{t2_name}: {t2s}")
                            
                            if score_parts:
                                await db.matches.update_one(
                                    {"match_id": our_match["match_id"]},
                                    {"$set": {"score": score_parts, "updated_at": current_time}}
                                )
                                logger.info(f"Merged score for {our_match['home_team']} vs {our_match['away_team']}: {score_parts}")
                            break
                
                # Broadcast all live matches to general subscribers
                if ws_manager.get_connection_count() > 0 and live_transformed:
                    await ws_manager.broadcast_live_matches(live_transformed)
                
                last_odds_poll = current_time
                logger.info(f"Live match real-time update completed - {len(live_transformed)} matches")
        else:
            logger.debug("No live matches currently - skipping frequent poll")
    except Exception as e:
        logger.error(f"Live match check failed: {e}")

def run_live_check():
    """Wrapper to run async live match check"""
    global main_event_loop
    try:
        if main_event_loop and main_event_loop.is_running():
            # Schedule on existing main loop
            future = asyncio.run_coroutine_threadsafe(check_live_matches_and_poll_async(), main_event_loop)
            try:
                future.result(timeout=60)
            except Exception as e:
                logger.error(f"Live check timed out or failed: {e}")
        else:
            logger.warning("Main event loop not available, skipping live check")
    except Exception as e:
        logger.error(f"Error scheduling live check: {e}")

def start_scheduler():
    """Start the scheduler - polls dynamically based on live matches"""
    
    # Initial odds fetch at startup
    scheduler.add_job(
        run_scheduled_odds_fetch,
        'date',
        run_date=datetime.now() + timedelta(seconds=5),
        id='initial_odds_fetch',
        replace_existing=True
    )
    
    # Football/Soccer odds - daily at Indian midnight
    scheduler.add_job(
        run_scheduled_odds_fetch,
        'cron',
        hour=18,
        minute=30,
        second=1,
        id='fetch_odds_daily',
        replace_existing=True
    )
    
    # Live match polling - check every 10 SECONDS for real-time updates
    scheduler.add_job(
        run_live_check,
        IntervalTrigger(seconds=10),
        id='live_match_polling',
        replace_existing=True
    )
    
    # Cricket data - frequent polling every 10 seconds for live data
    scheduler.add_job(
        run_cricket_poll,
        IntervalTrigger(seconds=10),
        id='fetch_cricket_job',
        replace_existing=True
    )
    
    # Odds fetch - every 10 seconds for live odds updates
    scheduler.add_job(
        run_scheduled_odds_fetch,
        IntervalTrigger(seconds=10),
        id='fetch_odds_interval',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Scheduler started:")
    logger.info("  - Initial fetch: 5 seconds after startup")
    logger.info("  - Football/Soccer Daily: 00:00:01 AM IST (18:30:01 UTC)")
    logger.info("  - Live Match Polling: Every 20 SECONDS (real-time updates)")
    logger.info("  - Cricket: Every 1 minute (for live score sync)")


# ==================== AUTH ROUTES ====================
@api_router.post("/auth/register", response_model=User)
async def register(user_input: UserCreate):
    # Check if username exists
    existing_user = await db.users.find_one({"username": user_input.username}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create new user
    new_user = User(
        username=user_input.username,
        email=user_input.email,
        password_hash=get_password_hash(user_input.password),
        role=UserRole.USER
    )
    
    await db.users.insert_one(new_user.model_dump())
    
    # Create wallet for user
    await db.wallets.insert_one({
        "user_id": new_user.user_id,
        "balance": 0.0,
        "updated_at": datetime.now(timezone.utc)
    })
    
    return new_user

@api_router.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db.users.find_one({"username": form_data.username}, {"_id": 0})
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"]},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user["role"],
        "username": user["username"]
    }

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# ==================== ADMIN ROUTES ====================
@api_router.get("/admin/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(current_user: User = Depends(get_current_admin)):
    total_bettors = await db.users.count_documents({"role": "user"})
    active_bettors = await db.users.count_documents({"role": "user", "is_active": True})
    in_play_games = await db.matches.count_documents({"status": "live"})
    upcoming_games = await db.matches.count_documents({"status": "scheduled"})
    open_for_betting = upcoming_games
    
    deposit_agg = await db.transactions.aggregate([
        {"$match": {"type": "deposit"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_deposited = deposit_agg[0]["total"] if deposit_agg else 0.0
    
    withdrawal_agg = await db.transactions.aggregate([
        {"$match": {"type": "withdrawal"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawn = withdrawal_agg[0]["total"] if withdrawal_agg else 0.0
    
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    pending_bets = await db.bets.count_documents({"status": "pending"})
    pending_tickets = await db.support_tickets.count_documents({"status": "open"})
    pending_outcomes = await db.matches.count_documents({"status": "completed", "winner": None})
    
    return DashboardStats(
        total_bettors=total_bettors,
        active_bettors=active_bettors,
        in_play_games=in_play_games,
        upcoming_games=upcoming_games,
        open_for_betting=open_for_betting,
        total_deposited=total_deposited,
        pending_deposits=0,
        rejected_deposits=0,
        deposited_charge=0.0,
        total_withdrawn=total_withdrawn,
        pending_withdrawals=pending_withdrawals,
        rejected_withdrawals=0,
        withdrawal_charge=0.0,
        pending_bets=pending_bets,
        pending_tickets=pending_tickets,
        pending_kyc=0,
        pending_outcomes=pending_outcomes
    )

@api_router.get("/admin/users", response_model=List[User])
async def get_all_users(current_user: User = Depends(get_current_admin)):
    users = await db.users.find({"role": "user"}, {"_id": 0}).to_list(1000)
    return [User(**u) for u in users]

@api_router.post("/admin/recharge")
async def recharge_wallet(recharge: RechargeRequest, current_user: User = Depends(get_current_admin)):
    wallet = await db.wallets.find_one({"user_id": recharge.user_id}, {"_id": 0})
    if not wallet:
        wallet = {"user_id": recharge.user_id, "balance": 0.0}
    
    balance_before = wallet["balance"]
    balance_after = balance_before + recharge.amount
    
    await db.wallets.update_one(
        {"user_id": recharge.user_id},
        {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    transaction = Transaction(
        user_id=recharge.user_id,
        type=TransactionType.DEPOSIT,
        amount=recharge.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        note=recharge.note or "Admin recharge"
    )
    
    await db.transactions.insert_one(transaction.model_dump())
    
    return {"success": True, "new_balance": balance_after}

@api_router.get("/admin/withdrawals", response_model=List[WithdrawalRequest])
async def get_all_withdrawals(current_user: User = Depends(get_current_admin)):
    withdrawals = await db.withdrawals.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [WithdrawalRequest(**w) for w in withdrawals]

@api_router.put("/admin/withdrawals/{withdrawal_id}")
async def update_withdrawal(withdrawal_id: str, update: WithdrawalUpdate, current_user: User = Depends(get_current_admin)):
    withdrawal = await db.withdrawals.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if update.status == WithdrawalStatus.APPROVED:
        wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]}, {"_id": 0})
        if wallet and wallet["balance"] >= withdrawal["amount"]:
            balance_before = wallet["balance"]
            balance_after = balance_before - withdrawal["amount"]
            
            await db.wallets.update_one(
                {"user_id": withdrawal["user_id"]},
                {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}}
            )
            
            transaction = Transaction(
                user_id=withdrawal["user_id"],
                type=TransactionType.WITHDRAWAL,
                amount=withdrawal["amount"],
                balance_before=balance_before,
                balance_after=balance_after,
                note=update.admin_note or "Withdrawal approved"
            )
            
            await db.transactions.insert_one(transaction.model_dump())
    
    await db.withdrawals.update_one(
        {"withdrawal_id": withdrawal_id},
        {"$set": {"status": update.status.value, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True}

@api_router.post("/admin/cron/run")
async def run_cron_now(current_user: User = Depends(get_current_admin)):
    matches = await OddsService.manual_refresh()
    return {"success": True, "matches_fetched": len(matches)}

@api_router.get("/admin/bets", response_model=List[Bet])
async def get_all_bets(current_user: User = Depends(get_current_admin)):
    bets = await db.bets.find({}, {"_id": 0}).sort("placed_at", -1).to_list(1000)
    return [Bet(**b) for b in bets]

@api_router.get("/admin/tickets", response_model=List[SupportTicket])
async def get_all_tickets(current_user: User = Depends(get_current_admin)):
    tickets = await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [SupportTicket(**t) for t in tickets]

@api_router.put("/admin/tickets/{ticket_id}")
async def reply_ticket(ticket_id: str, reply: TicketReply, current_user: User = Depends(get_current_admin)):
    await db.support_tickets.update_one(
        {"ticket_id": ticket_id},
        {"$set": {"admin_reply": reply.admin_reply, "status": reply.status.value, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"success": True}

@api_router.put("/admin/matches/{match_id}/outcome")
async def declare_outcome(match_id: str, winner: str, current_user: User = Depends(get_current_admin)):
    await db.matches.update_one(
        {"match_id": match_id},
        {"$set": {"winner": winner, "status": "completed"}}
    )
    
    # Settle bets
    bets = await db.bets.find({"match_id": match_id, "status": "pending"}, {"_id": 0}).to_list(1000)
    
    for bet in bets:
        if bet["selected_team"] == winner:
            # User won
            wallet = await db.wallets.find_one({"user_id": bet["user_id"]}, {"_id": 0})
            if wallet:
                balance_before = wallet["balance"]
                balance_after = balance_before + bet["potential_win"]
                
                await db.wallets.update_one(
                    {"user_id": bet["user_id"]},
                    {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}}
                )
                
                transaction = Transaction(
                    user_id=bet["user_id"],
                    type=TransactionType.WINNING,
                    amount=bet["potential_win"],
                    balance_before=balance_before,
                    balance_after=balance_after,
                    note=f"Won bet on {match_id}"
                )
                
                await db.transactions.insert_one(transaction.model_dump())
            
            await db.bets.update_one(
                {"bet_id": bet["bet_id"]},
                {"$set": {"status": "won", "settled_at": datetime.now(timezone.utc)}}
            )
        else:
            # User lost
            await db.bets.update_one(
                {"bet_id": bet["bet_id"]},
                {"$set": {"status": "lost", "settled_at": datetime.now(timezone.utc)}}
            )
    
    return {"success": True}

# ==================== ADMIN CRICKET MATCHES ====================
@api_router.post("/admin/cricket/matches")
async def create_cricket_match(match_data: CricketMatchCreate, current_user: User = Depends(get_current_admin)):
    """Admin can manually create cricket matches"""
    match = Match(
        match_id=str(uuid.uuid4()),
        sport="cricket",
        league=match_data.league,
        home_team=match_data.home_team,
        away_team=match_data.away_team,
        commence_time=match_data.commence_time,
        home_odds=1.85,
        away_odds=1.95,
        status=match_data.status,
        has_tv=match_data.has_tv,
        has_fancy=match_data.has_fancy,
        has_bookmaker=match_data.has_bookmaker,
        format=match_data.format,
    )
    await db.matches.insert_one(match.model_dump())
    return {"success": True, "match_id": match.match_id}

@api_router.get("/admin/cricket/matches")
async def get_all_cricket_matches(current_user: User = Depends(get_current_admin)):
    """Admin can view all cricket matches including past ones"""
    matches = await db.matches.find({"sport": "cricket"}, {"_id": 0}).sort("commence_time", -1).to_list(100)
    return matches

@api_router.put("/admin/cricket/matches/{match_id}/status")
async def update_cricket_match_status(match_id: str, status: str, current_user: User = Depends(get_current_admin)):
    """Admin can update match status: scheduled, live, completed"""
    await db.matches.update_one(
        {"match_id": match_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
    )
    return {"success": True}

@api_router.delete("/admin/cricket/matches/{match_id}")
async def delete_cricket_match(match_id: str, current_user: User = Depends(get_current_admin)):
    """Admin can delete a cricket match"""
    await db.matches.delete_one({"match_id": match_id})
    return {"success": True}

@api_router.post("/admin/cricket/seed")
async def seed_cricket_matches(current_user: User = Depends(get_current_admin)):
    """Seed sample global cricket matches for testing"""
    now = datetime.now(timezone.utc)
    
    sample_matches = [
        # LIVE Matches
        {"league": "Super Over2", "home_team": "Team Alpha", "away_team": "Team Beta", "status": "live", "hours": 0, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Pakistan T10", "home_team": "Pakistan T10", "away_team": "New Zealand T10", "status": "live", "hours": 0, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t10"},
        {"league": "Indian Premier League", "home_team": "RC Bengaluru", "away_team": "Sunrisers Hyderabad", "status": "live", "hours": 0, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        # Upcoming Matches
        {"league": "Pakistan Super League", "home_team": "Lahore Qalandars", "away_team": "Karachi Kings", "status": "scheduled", "hours": 2, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Sri Lanka T10", "home_team": "Sri Lanka T10", "away_team": "West Indies T10", "status": "scheduled", "hours": 4, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t10"},
        {"league": "CSA T20 Challenge", "home_team": "Warriors", "away_team": "Titans", "status": "scheduled", "hours": 6, "has_tv": True, "has_fancy": False, "has_bookmaker": True, "format": "t20"},
        {"league": "Caribbean Premier League", "home_team": "TKR XI", "away_team": "GAW XI", "status": "scheduled", "hours": 8, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Pakistan Super League", "home_team": "Quetta Gladiators", "away_team": "Islamabad United", "status": "scheduled", "hours": 24, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Indian Premier League", "home_team": "Mumbai Indians", "away_team": "Chennai Super Kings", "status": "scheduled", "hours": 48, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Indian Premier League", "home_team": "Delhi Capitals", "away_team": "Kolkata Knight Riders", "status": "scheduled", "hours": 72, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "t20"},
        {"league": "Test Series", "home_team": "India", "away_team": "Australia", "status": "scheduled", "hours": 96, "has_tv": True, "has_fancy": True, "has_bookmaker": True, "format": "test"},
        {"league": "ODI Series", "home_team": "England", "away_team": "South Africa", "status": "scheduled", "hours": 120, "has_tv": True, "has_fancy": False, "has_bookmaker": True, "format": "odi"},
    ]
    
    created = 0
    for m in sample_matches:
        match = Match(
            match_id=str(uuid.uuid4()),
            sport="cricket",
            league=m["league"],
            home_team=m["home_team"],
            away_team=m["away_team"],
            commence_time=now + timedelta(hours=m["hours"]),
            home_odds=round(1.5 + (hash(m["home_team"]) % 100) / 100, 2),
            away_odds=round(1.5 + (hash(m["away_team"]) % 100) / 100, 2),
            status=m["status"],
            has_tv=m["has_tv"],
            has_fancy=m["has_fancy"],
            has_bookmaker=m["has_bookmaker"],
            format=m["format"],
        )
        await db.matches.insert_one(match.model_dump())
        created += 1
    
    return {"success": True, "matches_created": created}

# ==================== CRICKET DATA SERVICE INTEGRATION ====================
from cricket_data_service import CricketDataService, create_cricket_service, cache as cricket_cache

# Global cricket service instance
cricket_service: Optional[CricketDataService] = None

def get_cricket_service() -> CricketDataService:
    global cricket_service
    if cricket_service is None:
        cricket_service = CricketDataService(db)
    return cricket_service

@api_router.get("/live-matches")
async def get_live_matches():
    """Get live cricket matches from CricketData API (cached)"""
    service = get_cricket_service()
    try:
        matches = await service.get_live_matches()
        transformed = await service.transform_for_frontend(matches)
        return {
            "success": True,
            "count": len(transformed),
            "matches": transformed,
            "cached": cricket_cache.get(service._make_cache_key("currentMatches")) is not None
        }
    except Exception as e:
        logger.error(f"Error fetching live matches: {e}")
        return {"success": False, "error": str(e), "matches": []}

@api_router.get("/all-matches")
async def get_all_cricket_matches_api():
    """Get all cricket matches (live + upcoming) from CricketData API (cached)"""
    service = get_cricket_service()
    try:
        data = await service.get_all_matches()
        live_transformed = await service.transform_for_frontend(data.get("live", []))
        upcoming_transformed = await service.transform_for_frontend(data.get("upcoming", []))
        
        # Filter out minor domestic leagues
        MINOR_LEAGUES = ["plunket shield", "sheffield shield", "ranji trophy", "vijay hazare", "syed mushtaq ali", "county championship", "ford trophy", "marsh cup", "duleep trophy"]
        live_transformed = [m for m in live_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        upcoming_transformed = [m for m in upcoming_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        
        return {
            "success": True,
            "live_count": len(live_transformed),
            "upcoming_count": len(upcoming_transformed),
            "live": live_transformed,
            "upcoming": upcoming_transformed
        }
    except Exception as e:
        logger.error(f"Error fetching all matches: {e}")
        return {"success": False, "error": str(e), "live": [], "upcoming": []}

@api_router.get("/cricket/status")
async def get_cricket_service_status():
    """Get cricket service status including quota and cache info"""
    service = get_cricket_service()
    try:
        status = await service.get_service_status()
        return status
    except Exception as e:
        return {"error": str(e)}

@api_router.post("/admin/cricket/fetch")
async def admin_fetch_cricket_matches(current_user: User = Depends(get_current_admin)):
    """Admin: Manually trigger cricket data fetch from API"""
    service = get_cricket_service()
    try:
        # Fetch and store matches
        data = await service.get_all_matches()
        live_transformed = await service.transform_for_frontend(data.get("live", []))
        upcoming_transformed = await service.transform_for_frontend(data.get("upcoming", []))
        
        # Filter out minor domestic leagues
        MINOR_LEAGUES = ["plunket shield", "sheffield shield", "ranji trophy", "vijay hazare", "syed mushtaq ali", "county championship", "ford trophy", "marsh cup", "duleep trophy"]
        live_transformed = [m for m in live_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        upcoming_transformed = [m for m in upcoming_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        
        all_matches = live_transformed + upcoming_transformed
        
        # Store in database
        for match in all_matches:
            match["updated_at"] = datetime.now(timezone.utc)
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
        
        status = await service.get_service_status()
        
        return {
            "success": True,
            "live_fetched": len(live_transformed),
            "upcoming_fetched": len(upcoming_transformed),
            "total_stored": len(all_matches),
            "quota": status.get("quota", {})
        }
    except Exception as e:
        logger.error(f"Admin fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/cricket/quota")
async def get_cricket_quota(current_user: User = Depends(get_current_admin)):
    """Admin: Get current API quota status"""
    service = get_cricket_service()
    status = await service.get_service_status()
    return status

# Smart Cricket Scheduler
cricket_scheduler_running = False

async def smart_cricket_poll():
    """Smart polling function that adjusts frequency based on live matches and broadcasts via WebSocket"""
    global cricket_scheduler_running
    service = get_cricket_service()
    
    try:
        logger.info("=== Cricket Smart Poll ===")
        data = await service.get_all_matches()
        
        live_transformed = await service.transform_for_frontend(data.get("live", []))
        upcoming_transformed = await service.transform_for_frontend(data.get("upcoming", []))
        
        # Filter out minor domestic leagues
        MINOR_LEAGUES = ["plunket shield", "sheffield shield", "ranji trophy", "vijay hazare", "syed mushtaq ali", "county championship", "ford trophy", "marsh cup", "duleep trophy"]
        live_transformed = [m for m in live_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        upcoming_transformed = [m for m in upcoming_transformed if not any(p in (m.get("league","") or "").lower() for p in MINOR_LEAGUES)]
        
        now = datetime.now(timezone.utc)
        
        # Track match IDs from API for cleanup
        api_match_ids = set()
        status_changes = []
        
        # Store/update live matches and detect changes
        for match in live_transformed:
            match["updated_at"] = now
            api_match_ids.add(match["match_id"])
            
            # Check for changes via realtime cache
            changes = await realtime_cache.update_match(match["match_id"], match)
            if changes and changes.get("status"):
                status_changes.append({
                    "match_id": match["match_id"],
                    "old_status": changes["status"]["old"],
                    "new_status": changes["status"]["new"],
                    "match": match
                })
            
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
            
            # Broadcast individual match update to subscribers
            if ws_manager.get_connection_count() > 0:
                await ws_manager.broadcast_match_update(match["match_id"], match)
        
        # Store/update upcoming matches
        for match in upcoming_transformed:
            match["updated_at"] = now
            api_match_ids.add(match["match_id"])
            await realtime_cache.update_match(match["match_id"], match)
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
        
        # AUTO CLEANUP: Mark matches that were "live" but no longer in API response as "completed"
        if api_match_ids:
            stale_cutoff = now - timedelta(minutes=30)
            result = await db.matches.update_many(
                {
                    "sport": "cricket",
                    "status": "live",
                    "match_id": {"$nin": list(api_match_ids)},
                    "updated_at": {"$lt": stale_cutoff.isoformat()}
                },
                {"$set": {"status": "completed", "matchEnded": True}}
            )
            if result.modified_count > 0:
                logger.info(f"Auto-marked {result.modified_count} stale matches as completed")
        
        # Update realtime cache with live matches
        cache_changed = await realtime_cache.set_live_matches(live_transformed)
        
        # Broadcast to WebSocket clients if there are any connected
        if ws_manager.get_connection_count() > 0:
            # Broadcast live matches update
            await ws_manager.broadcast_live_matches(live_transformed)
            
            # Broadcast status changes
            for change in status_changes:
                await ws_manager.broadcast_match_status_change(
                    change["match_id"],
                    change["old_status"],
                    change["new_status"],
                    change["match"]
                )
            
            logger.info(f"Broadcasted to {ws_manager.get_connection_count()} WebSocket clients")
        
        # Log status
        api_status = "AVAILABLE" if data.get("api_available", True) else "RATE LIMITED"
        status = await service.get_service_status()
        logger.info(
            f"Cricket poll complete. "
            f"Live: {len(live_transformed)}, Upcoming: {len(upcoming_transformed)}, "
            f"API: {api_status}, "
            f"Quota: {status['quota']['requests_made']}/{status['quota']['quota_limit']}, "
            f"WS clients: {ws_manager.get_connection_count()}"
        )
        
    except Exception as e:
        logger.error(f"Cricket poll error: {e}")

def run_cricket_poll():
    """Wrapper to run async poll in sync context using main event loop"""
    global main_event_loop
    try:
        if main_event_loop and main_event_loop.is_running():
            future = asyncio.run_coroutine_threadsafe(smart_cricket_poll(), main_event_loop)
            try:
                future.result(timeout=120)  # 2 minute timeout
            except Exception as e:
                logger.error(f"Cricket poll timed out or failed: {e}")
        else:
            logger.warning("Main event loop not available, skipping cricket poll")
    except Exception as e:
        logger.error(f"Error in cricket poll wrapper: {e}")

# ==================== USER ROUTES ====================
@api_router.get("/matches", response_model=List[Match])
async def get_matches(sport: Optional[str] = None):
    """
    Get only LIVE and UPCOMING matches.
    Strictly filters out old/past/completed matches.
    Auto-cleans stale data on every request.
    """
    now = datetime.now(timezone.utc)
    
    # First, auto-cleanup: Mark old "live" matches as completed if they've been live too long
    # (Edge case: match stuck in "live" status)
    stale_live_cutoff = now - timedelta(hours=12)  # No match should be live for 12+ hours
    await db.matches.update_many(
        {
            "status": "live",
            "updated_at": {"$lt": stale_live_cutoff.isoformat()}
        },
        {"$set": {"status": "completed"}}
    )
    
    # Build query
    query = {
        # Exclude completed matches
        "status": {"$nin": ["completed", "ended", "finished"]}
    }
    
    if sport:
        query["sport"] = sport
    
    # Blacklist minor domestic leagues - only show major cricket
    MINOR_LEAGUES = [
        "plunket shield", "sheffield shield", "ranji trophy", 
        "vijay hazare", "syed mushtaq ali", "county championship",
        "bob willis trophy", "marsh cup", "ford trophy",
        "duleep trophy", "irani trophy", "deodhar trophy"
    ]
    
    matches = await db.matches.find(query, {"_id": 0}).sort("commence_time", 1).to_list(1000)
    
    filtered_matches = []
    for m in matches:
        status = m.get("status", "").lower() if isinstance(m.get("status"), str) else ""
        
        # Filter out minor domestic leagues
        league = (m.get("league") or m.get("series") or "").lower()
        if any(minor in league for minor in MINOR_LEAGUES):
            continue
        
        # Check matchEnded flag (from CricketData API)
        match_ended = m.get("matchEnded", False)
        if match_ended:
            # Mark as completed in DB for future queries
            await db.matches.update_one(
                {"match_id": m.get("match_id")},
                {"$set": {"status": "completed"}}
            )
            continue
        
        # Always include LIVE matches that aren't ended
        if status == "live":
            filtered_matches.append(m)
            continue
        
        # For scheduled/upcoming matches, only include if commence_time is in the FUTURE
        commence_time = m.get("commence_time")
        if commence_time:
            try:
                # Handle both datetime objects and strings
                if isinstance(commence_time, datetime):
                    ct = commence_time
                elif isinstance(commence_time, str):
                    if "T" in commence_time:
                        ct = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
                    else:
                        ct = datetime.fromisoformat(commence_time)
                else:
                    continue
                
                # Make timezone aware if needed
                if ct.tzinfo is None:
                    ct = ct.replace(tzinfo=timezone.utc)
                
                # Include if match is upcoming OR recently started (within 6 hours)
                # Recently started matches may not yet be marked as "live" by external API
                six_hours_ago = now - timedelta(hours=6)
                if ct > six_hours_ago:
                    # If match started already, auto-mark as live
                    if ct <= now and m.get("status") == "scheduled":
                        await db.matches.update_one(
                            {"match_id": m.get("match_id")},
                            {"$set": {"status": "live", "matchStarted": True}}
                        )
                        m["status"] = "live"
                        m["matchStarted"] = True
                    filtered_matches.append(m)
                    
            except Exception as e:
                # Skip matches with unparseable dates
                logger.warning(f"Could not parse commence_time for match: {e}")
                continue
    
    return [Match(**m) for m in filtered_matches]


@api_router.get("/matches/live")
async def get_live_matches_only(sport: Optional[str] = None):
    """
    Get ONLY currently live matches.
    Returns matches where status='live' AND matchEnded=false.
    """
    now = datetime.now(timezone.utc)
    
    query = {
        "status": "live",
        "$or": [
            {"matchEnded": {"$ne": True}},
            {"matchEnded": {"$exists": False}}
        ]
    }
    
    if sport:
        query["sport"] = sport
    
    matches = await db.matches.find(query, {"_id": 0}).sort("commence_time", 1).to_list(100)
    
    # Filter out any that shouldn't be live
    live_matches = []
    for m in matches:
        if m.get("matchEnded"):
            continue
        live_matches.append(m)
    
    return {
        "success": True,
        "count": len(live_matches),
        "matches": live_matches,
        "timestamp": now.isoformat()
    }


@api_router.get("/matches/status")
async def get_matches_status():
    """
    Get quick status of all matches for frontend polling.
    Lightweight endpoint for frequent polling.
    """
    now = datetime.now(timezone.utc)
    
    # Aggregate counts
    live_count = await db.matches.count_documents({
        "status": "live",
        "$or": [{"matchEnded": {"$ne": True}}, {"matchEnded": {"$exists": False}}]
    })
    
    upcoming_count = await db.matches.count_documents({
        "status": {"$in": ["scheduled", "upcoming"]},
        "matchStarted": {"$ne": True}
    })
    
    # Get cricket service status if available
    try:
        service = get_cricket_service()
        service_status = await service.get_service_status()
        api_status = {
            "available": service_status.get("api_available", True),
            "rate_limited": service_status.get("rate_limited", False),
            "quota_remaining": service_status.get("quota", {}).get("requests_remaining", 100)
        }
    except Exception:
        api_status = {"available": True, "rate_limited": False, "quota_remaining": 100}
    
    return {
        "live_count": live_count,
        "upcoming_count": upcoming_count,
        "timestamp": now.isoformat(),
        "api_status": api_status
    }


# ==================== WEBSOCKET ENDPOINTS ====================
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time updates.
    Clients connect here to receive live match updates.
    """
    await ws_manager.connect(websocket)
    try:
        # Send initial data on connect
        live_matches = realtime_cache.get_live_matches()
        await websocket.send_json({
            "type": "connected",
            "message": "Connected to PlayXBets real-time updates",
            "live_matches": live_matches,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Keep connection alive and listen for messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                message = json.loads(data)
                
                # Handle client messages
                if message.get("type") == "subscribe_match":
                    match_id = message.get("match_id")
                    if match_id:
                        await ws_manager.subscribe_to_match(websocket, match_id)
                        # Send current match data
                        match_data = realtime_cache.get_match(match_id)
                        if match_data:
                            await websocket.send_json({
                                "type": "match_data",
                                "match_id": match_id,
                                "data": match_data
                            })
                
                elif message.get("type") == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})
                
            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_json({"type": "heartbeat", "timestamp": datetime.now(timezone.utc).isoformat()})
                except Exception:
                    break
                    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"WebSocket error: {e}")
    finally:
        await ws_manager.disconnect(websocket)


@app.websocket("/api/ws/match/{match_id}")
async def websocket_match_endpoint(websocket: WebSocket, match_id: str):
    """
    WebSocket endpoint for a specific match.
    Clients connect here to receive updates for one match.
    """
    await ws_manager.connect(websocket, match_id)
    try:
        # Send current match data
        match_data = realtime_cache.get_match(match_id)
        if not match_data:
            # Try fetching from DB
            match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
            if match:
                match_data = match
        
        await websocket.send_json({
            "type": "match_subscribed",
            "match_id": match_id,
            "data": match_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Keep connection alive
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                message = json.loads(data)
                
                if message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat"})
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug(f"Match WebSocket error: {e}")
    finally:
        await ws_manager.disconnect(websocket)


@api_router.get("/ws/status")
async def get_websocket_status():
    """Get WebSocket connection stats"""
    return {
        "active_connections": ws_manager.get_connection_count(),
        "cache_stats": realtime_cache.get_stats(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# ==================== BET TOTALS PER TEAM ENDPOINT ====================
@api_router.get("/match/{match_id}/bet-totals")
async def get_match_bet_totals(match_id: str):
    """Get total bet amounts per team for a specific match"""
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0, "home_team": 1, "away_team": 1})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    home_team = match.get("home_team", "")
    away_team = match.get("away_team", "")
    
    # Aggregate total stakes per selected_team
    pipeline = [
        {"$match": {"match_id": match_id, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": "$selected_team", "total": {"$sum": "$stake"}}}
    ]
    
    results = await db.bets.aggregate(pipeline).to_list(10)
    
    totals = {}
    for r in results:
        totals[r["_id"]] = r["total"]
    
    return {
        "match_id": match_id,
        "home_team": home_team,
        "away_team": away_team,
        "home_total": totals.get(home_team, 0),
        "away_total": totals.get(away_team, 0),
    }


@api_router.get("/match/{match_id}/my-bets")
async def get_my_match_bets(match_id: str, current_user: User = Depends(get_current_user)):
    """Get current user's bets for a specific match"""
    bets = await db.bets.find(
        {"match_id": match_id, "user_id": current_user.user_id, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return bets

@api_router.get("/match/{match_id}/exposure")
async def get_match_exposure(match_id: str, current_user: User = Depends(get_current_user)):
    """Calculate user's net exposure (profit/loss) per team for a match"""
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0, "home_team": 1, "away_team": 1})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    home_team = match.get("home_team", "")
    away_team = match.get("away_team", "")
    
    bets = await db.bets.find(
        {"match_id": match_id, "user_id": current_user.user_id, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).to_list(100)
    
    # Calculate net position for each team winning scenario
    home_wins_pnl = 0.0  # P&L if home team wins
    away_wins_pnl = 0.0  # P&L if away team wins
    
    for bet in bets:
        stake = bet.get("stake", 0)
        odds = bet.get("odds", 0)
        bet_type = bet.get("bet_type", "").lower()
        selected = bet.get("selected_team", "")
        
        if bet_type == "back":
            profit = stake * (odds - 1)
            if selected == home_team:
                home_wins_pnl += profit     # Win profit if home wins
                away_wins_pnl -= stake      # Lose stake if away wins
            elif selected == away_team:
                away_wins_pnl += profit     # Win profit if away wins
                home_wins_pnl -= stake      # Lose stake if home wins
        elif bet_type == "lay":
            liability = stake * (odds - 1)
            if selected == home_team:
                home_wins_pnl -= liability  # Pay liability if home wins
                away_wins_pnl += stake      # Keep stake if away wins
            elif selected == away_team:
                away_wins_pnl -= liability  # Pay liability if away wins
                home_wins_pnl += stake      # Keep stake if home wins
    
    return {
        "match_id": match_id,
        "home_team": home_team,
        "away_team": away_team,
        "home_exposure": round(home_wins_pnl, 2),
        "away_exposure": round(away_wins_pnl, 2),
        "total_bets": len(bets)
    }

@api_router.get("/transactions/recharge-history")
async def get_recharge_history(current_user: User = Depends(get_current_user)):
    """Get recharge/deposit history for current user"""
    transactions = await db.transactions.find(
        {"user_id": current_user.user_id, "type": {"$in": ["deposit", "recharge"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return transactions


# ==================== MATCH DETAIL ENDPOINT ====================
@api_router.get("/match/{match_id}")
async def get_match_detail(match_id: str):
    """
    Get detailed information for a specific match.
    Returns match info, odds, and additional data.
    Reuses cached data where available.
    """
    # First try to find in database
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    # Helper to serialize datetime with UTC timezone
    def serialize_dt(dt):
        if dt is None:
            return None
        if isinstance(dt, datetime):
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        if isinstance(dt, str):
            # If string without timezone, append +00:00
            if '+' not in dt and 'Z' not in dt and dt != '':
                return dt + '+00:00'
            return dt.replace('Z', '+00:00')
        return str(dt)
    
    # Build detailed response
    response = {
        "match_id": match.get("match_id"),
        "sport": match.get("sport", "cricket"),
        "league": match.get("league", ""),
        "home_team": match.get("home_team"),
        "away_team": match.get("away_team"),
        "commence_time": serialize_dt(match.get("commence_time")),
        "status": match.get("status", "scheduled"),
        "venue": match.get("venue", ""),
        "format": match.get("format", "t20"),
        
        # Odds data - include full order book if available
        "odds": match.get("odds") if match.get("odds") and match["odds"].get("home_back_levels") else {
            "home": match.get("home_odds"),
            "away": match.get("away_odds"),
            "draw": match.get("odds_draw"),
            "home_back": match.get("home_odds"),
            "home_lay": match.get("home_odds", 0) + 0.02 if match.get("home_odds") else None,
            "away_back": match.get("away_odds"),
            "away_lay": match.get("away_odds", 0) + 0.02 if match.get("away_odds") else None,
        },
        
        # Feature flags
        "features": {
            "has_tv": match.get("has_tv", False),
            "has_fancy": match.get("has_fancy", False),
            "has_bookmaker": match.get("has_bookmaker", False),
        },
        
        # Score data (if live)
        "score": match.get("score", []),
        
        # Additional match info
        "match_type": match.get("match_type", ""),
        "winner": match.get("winner"),
        "created_at": serialize_dt(match.get("created_at")),
        "updated_at": serialize_dt(match.get("updated_at")),
    }
    
    # For cricket matches, try to get additional info from CricketData service cache
    if match.get("sport") == "cricket":
        service = get_cricket_service()
        # Check if we have cached match data with more details
        cached_all = cricket_cache.get(service._make_cache_key("matches"))
        if cached_all and cached_all.get("data"):
            for m in cached_all["data"]:
                if m.get("id") == match_id:
                    # Add extra details from API cache
                    response["venue"] = m.get("venue", response["venue"])
                    response["score"] = m.get("score", response["score"])
                    response["match_type"] = m.get("matchType", response["match_type"])
                    break
    
    return response

@api_router.post("/bets", response_model=Bet)
async def place_bet(bet_input: BetCreate, current_user: User = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet or wallet["balance"] < bet_input.stake:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    balance_before = wallet["balance"]
    balance_after = balance_before - bet_input.stake
    
    await db.wallets.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}}
    )
    
    transaction = Transaction(
        user_id=current_user.user_id,
        type=TransactionType.BET,
        amount=bet_input.stake,
        balance_before=balance_before,
        balance_after=balance_after,
        note=f"Bet on {bet_input.match_id}"
    )
    
    await db.transactions.insert_one(transaction.model_dump())
    
    bet = Bet(
        user_id=current_user.user_id,
        match_id=bet_input.match_id,
        selected_team=bet_input.selected_team,
        odds=bet_input.odds,
        stake=bet_input.stake,
        potential_win=bet_input.stake * bet_input.odds,
        bet_type=bet_input.bet_type,
        market_type=bet_input.market_type
    )
    
    await db.bets.insert_one(bet.model_dump())
    
    return bet

@api_router.get("/bets/history", response_model=List[Bet])
async def get_bet_history(current_user: User = Depends(get_current_user)):
    bets = await db.bets.find({"user_id": current_user.user_id}, {"_id": 0}).sort("placed_at", -1).to_list(1000)
    return [Bet(**b) for b in bets]

@api_router.get("/wallet")
async def get_wallet(current_user: User = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet:
        wallet = {"user_id": current_user.user_id, "balance": 0.0}
    return wallet

@api_router.post("/withdrawals", response_model=WithdrawalRequest)
async def create_withdrawal(withdrawal_input: WithdrawalCreate, current_user: User = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet or wallet["balance"] < withdrawal_input.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    withdrawal = WithdrawalRequest(
        user_id=current_user.user_id,
        amount=withdrawal_input.amount,
        note=withdrawal_input.note
    )
    
    await db.withdrawals.insert_one(withdrawal.model_dump())
    
    return withdrawal

@api_router.get("/withdrawals/my", response_model=List[WithdrawalRequest])
async def get_my_withdrawals(current_user: User = Depends(get_current_user)):
    withdrawals = await db.withdrawals.find({"user_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [WithdrawalRequest(**w) for w in withdrawals]

@api_router.post("/tickets", response_model=SupportTicket)
async def create_ticket(ticket_input: TicketCreate, current_user: User = Depends(get_current_user)):
    ticket = SupportTicket(
        user_id=current_user.user_id,
        subject=ticket_input.subject,
        message=ticket_input.message
    )
    
    await db.support_tickets.insert_one(ticket.model_dump())
    
    return ticket

@api_router.get("/tickets/my", response_model=List[SupportTicket])
async def get_my_tickets(current_user: User = Depends(get_current_user)):
    tickets = await db.support_tickets.find({"user_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [SupportTicket(**t) for t in tickets]

@api_router.get("/transactions/my", response_model=List[Transaction])
async def get_my_transactions(current_user: User = Depends(get_current_user)):
    transactions = await db.transactions.find({"user_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Transaction(**t) for t in transactions]

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router
app.include_router(api_router)

# ==================== CRICKET MICRO BETTING EXTENSION ====================
# Import and include cricket micro betting routes (extension module)
from cricket_micro_betting import create_micro_betting_router, websocket_endpoint as cricket_ws_endpoint
from fastapi import WebSocket

# Create micro betting router with database
micro_betting_router = create_micro_betting_router(db)
app.include_router(micro_betting_router, prefix="/api")

# WebSocket endpoint for cricket micro betting
@app.websocket("/api/ws/cricket-micro")
async def cricket_micro_websocket(websocket: WebSocket):
    await cricket_ws_endpoint(websocket)

@app.websocket("/api/ws/cricket-micro/{match_id}")
async def cricket_micro_websocket_match(websocket: WebSocket, match_id: str):
    await cricket_ws_endpoint(websocket, match_id)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== STARTUP ====================
@app.on_event("startup")
async def startup_event():
    global main_event_loop
    # Store the main event loop for scheduler tasks
    main_event_loop = asyncio.get_event_loop()
    
    # Create default users if they don't exist
    admin_user = await db.users.find_one({"username": "admin"})
    if not admin_user:
        admin = User(
            username="admin",
            password_hash=get_password_hash("123456"),
            role=UserRole.ADMIN
        )
        await db.users.insert_one(admin.model_dump())
        await db.wallets.insert_one({"user_id": admin.user_id, "balance": 0.0})
        logger.info("Created default admin user")
    
    regular_user = await db.users.find_one({"username": "user"})
    if not regular_user:
        user = User(
            username="user",
            password_hash=get_password_hash("123456"),
            role=UserRole.USER
        )
        await db.users.insert_one(user.model_dump())
        await db.wallets.insert_one({"user_id": user.user_id, "balance": 0.0})
        logger.info("Created default user")
    
    # Start scheduler
    start_scheduler()
    
    logger.info("Application started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()
    client.close()
    logger.info("Application shutdown")
