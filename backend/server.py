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
import time
from pathlib import Path
from dotenv import load_dotenv
from enum import Enum
import uuid
import asyncio
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Sync engine — centralized cache, monitoring, coordination
from sync_engine import monitor, cache, coordinator, sync_validator

# Bookmaker odds engine — margin, exposure, dynamic adjustment, session markets
from odds_engine import odds_engine

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ODDS_API_KEY = os.getenv("ODDS_API_KEY")
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
CRICKET_API_KEY = os.getenv("CRICKETDATA_API_KEY")

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

# ==================== UTILITY: Datetime Normalization ====================
def ensure_utc(val) -> Optional[datetime]:
    """Convert any datetime/string value to timezone-aware UTC datetime.
    Returns None if conversion fails."""
    if val is None:
        return None
    try:
        if isinstance(val, datetime):
            return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val
        if isinstance(val, str):
            cleaned = val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except Exception:
        return None
    return None

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
# Using sync_engine.cache (TTLCache) as the centralized cache
# Alias for backward compatibility
realtime_cache = cache

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
    frozen_balance: float = 0.0  # Frozen for pending withdrawals
    exposure: float = 0.0  # Locked in active bets
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    transaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: TransactionType
    amount: float
    balance_before: float
    balance_after: float
    reference_id: Optional[str] = None
    description: Optional[str] = None
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

class P2PBetCreate(BaseModel):
    match_id: str
    selected_team: str
    stake: float

class WithdrawalRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    withdrawal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: Optional[str] = None
    amount: float
    account_holder: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    note: Optional[str] = None
    admin_note: Optional[str] = None
    status: WithdrawalStatus = WithdrawalStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WithdrawalCreate(BaseModel):
    amount: float
    account_holder: str
    bank_name: str
    account_number: str
    ifsc_code: str
    upi_id: Optional[str] = None
    note: Optional[str] = None

class WithdrawalUpdate(BaseModel):
    status: WithdrawalStatus
    admin_note: Optional[str] = None

class DepositStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class DepositRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    deposit_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    username: Optional[str] = None
    amount: float
    payment_method: str = "upi"  # upi, bank_transfer, cash
    transaction_ref: Optional[str] = None
    proof_screenshot: Optional[str] = None  # base64 encoded
    note: Optional[str] = None
    admin_note: Optional[str] = None
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DepositCreate(BaseModel):
    amount: float
    payment_method: str = "upi"
    transaction_ref: Optional[str] = None
    proof_screenshot: Optional[str] = None
    note: Optional[str] = None

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

def _extract_best_h2h_odds(bookmakers, home_team, away_team):
    """Extract h2h odds from the PRIMARY bookmaker (Betfair preferred, else first).
    Returns (first_team_name, first_team_odds, second_team_name, second_team_odds)
    in the exact order the bookmaker lists them (outcome order)."""
    # Prefer Betfair exchange, then any Betfair, then first bookmaker
    primary_bk = None
    for bk in (bookmakers or []):
        if bk.get("key") == "betfair_ex_uk":
            primary_bk = bk
            break
    if not primary_bk:
        for bk in (bookmakers or []):
            if "betfair" in bk.get("key", "").lower():
                primary_bk = bk
                break
    if not primary_bk and bookmakers:
        primary_bk = bookmakers[0]
    if not primary_bk:
        return None, None, None, None

    for mkt in primary_bk.get("markets", []):
        if mkt.get("key") != "h2h":
            continue
        outcomes = mkt.get("outcomes", [])
        if len(outcomes) >= 2:
            t1_name = outcomes[0].get("name", "")
            t1_odds = outcomes[0].get("price")
            t2_name = outcomes[1].get("name", "")
            t2_odds = outcomes[1].get("price")
            if t1_odds and t1_odds > 1 and t2_odds and t2_odds > 1:
                return t1_name, t1_odds, t2_name, t2_odds
    return None, None, None, None


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
    def calculate_lay_odds(back_odds: float) -> float:
        """Calculate lay odds using the bookmaker odds engine."""
        if back_odds is None:
            return None
        return odds_engine._calculate_lay(back_odds)
    
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
                "regions": "uk",
                "markets": "h2h",
                "oddsFormat": "decimal"
            }
            
            t0 = time.monotonic()
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: requests.get(url, params=params, timeout=15)
            )
            latency = (time.monotonic() - t0) * 1000
            monitor.record_api_call("odds_api_fetch", latency, response.status_code == 200)
            logger.info(f"Odds API response: {response.status_code} ({latency:.0f}ms)")
            
            if response.status_code != 200:
                logger.error(f"Odds API error: {response.status_code}")
                return []
            
            events = response.json()
            logger.info(f"Odds API returned {len(events)} cricket events")
            
            # Register for sync validation
            sync_validator.register_odds_events(events)
            
            merged_count = 0
            created_count = 0
            
            for event in events:
                home_team = event.get("home_team", "")
                away_team = event.get("away_team", "")
                commence_time = event.get("commence_time", "")
                
                # Priority: Use Betfair Exchange (betfair_ex_uk) for real Back/Lay odds
                betfair_ex = None
                fallback_bk = None
                for bookmaker in event.get("bookmakers", []):
                    if bookmaker.get("key") == "betfair_ex_uk":
                        betfair_ex = bookmaker
                        break
                    if not fallback_bk:
                        fallback_bk = bookmaker
                
                source_bk = betfair_ex or fallback_bk
                if not source_bk:
                    continue
                
                # Extract Back odds (h2h market)
                home_back_raw, away_back_raw = None, None
                home_lay_raw, away_lay_raw = None, None
                
                for mkt in source_bk.get("markets", []):
                    mkt_key = mkt.get("key", "")
                    for outcome in mkt.get("outcomes", []):
                        name = outcome.get("name", "")
                        price = outcome.get("price")
                        if price is None:
                            continue
                        is_home = OddsService.teams_match(name, home_team)
                        is_away = OddsService.teams_match(name, away_team)
                        
                        if mkt_key == "h2h":
                            if is_home:
                                home_back_raw = price
                            elif is_away:
                                away_back_raw = price
                        elif mkt_key == "h2h_lay":
                            if is_home:
                                home_lay_raw = price
                            elif is_away:
                                away_lay_raw = price
                
                # Fallback positional if team matching failed
                if home_back_raw is None or away_back_raw is None:
                    h2h_mkt = next((m for m in source_bk.get("markets", []) if m.get("key") == "h2h"), None)
                    if h2h_mkt:
                        non_draw = [o for o in h2h_mkt.get("outcomes", []) if o.get("name", "").lower() not in ["draw", "tie"] and o.get("price")]
                        if len(non_draw) >= 2:
                            if home_back_raw is None:
                                home_back_raw = non_draw[0]["price"]
                            if away_back_raw is None:
                                away_back_raw = non_draw[1]["price"]
                
                if not home_back_raw or not away_back_raw:
                    continue
                
                home_odds = home_back_raw
                away_odds = away_back_raw
                
                # Determine match_id for this event
                event_match_id = event.get("id", "")
                
                # Use ExchangeOddsEngine to build exchange-style odds object
                # Pass ALL bookmakers for weighted-average normalization
                odds_data = odds_engine.build_odds_object(
                    match_id=event_match_id,
                    raw_home=home_odds,
                    raw_away=away_odds,
                    bookmaker_name=source_bk.get("title", "Betfair Exchange"),
                    all_bookmakers=event.get("bookmakers", []),
                    home_team=home_team,
                    away_team=away_team,
                )

                # Store exact odds from primary bookmaker (Betfair preferred) + team order
                t1_name, t1_odds, t2_name, t2_odds = _extract_best_h2h_odds(event.get("bookmakers", []), home_team, away_team)
                if t1_odds and t2_odds:
                    odds_data["home"] = t1_odds
                    odds_data["away"] = t2_odds
                    odds_data["first_team"] = t1_name
                    odds_data["second_team"] = t2_name
                
                # If Betfair Exchange provided real lay odds, use them (with margin)
                if home_lay_raw and away_lay_raw:
                    odds_data["home_lay"] = home_lay_raw
                    odds_data["away_lay"] = away_lay_raw
                    # Update lay levels with real exchange data
                    odds_data["home_lay_levels"] = [
                        home_lay_raw,
                        round(home_lay_raw + 0.02, 2),
                        round(home_lay_raw + 0.04, 2),
                    ]
                    odds_data["away_lay_levels"] = [
                        away_lay_raw,
                        round(away_lay_raw + 0.02, 2),
                        round(away_lay_raw + 0.04, 2),
                    ]
                    odds_data["exchange_lay"] = True
                
                # Store raw API odds for reference
                odds_data["raw_home"] = home_odds
                odds_data["raw_away"] = away_odds
                odds_data["source"] = source_bk.get("key", "")
                odds_data["source_title"] = source_bk.get("title", "")
                
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
                        # Rebuild odds with swapped teams using the engine
                        corrected_odds_data = odds_engine.build_odds_object(
                            match_id=existing_match.get("match_id", event_match_id),
                            raw_home=away_odds,  # Swap: API away = DB home
                            raw_away=home_odds,  # Swap: API home = DB away
                            bookmaker_name=source_bk.get("title", "Betfair Exchange"),
                            all_bookmakers=event.get("bookmakers", []),
                            home_team=db_away,   # DB perspective: swapped
                            away_team=db_home,
                        )
                        # Overwrite with primary bookmaker odds + order
                        t1_name, t1_odds, t2_name, t2_odds = _extract_best_h2h_odds(event.get("bookmakers", []), home_team, away_team)
                        if t1_odds and t2_odds:
                            corrected_odds_data["home"] = t1_odds
                            corrected_odds_data["away"] = t2_odds
                            corrected_odds_data["first_team"] = t1_name
                            corrected_odds_data["second_team"] = t2_name
                        corrected_odds_data["raw_home"] = away_odds
                        corrected_odds_data["raw_away"] = home_odds
                        corrected_odds_data["source"] = odds_data.get("source", "")
                        corrected_odds_data["source_title"] = odds_data.get("source_title", "")
                        # Swap exchange lay data if present
                        if odds_data.get("exchange_lay"):
                            corrected_odds_data["home_lay"] = odds_data.get("away_lay")
                            corrected_odds_data["away_lay"] = odds_data.get("home_lay")
                            corrected_odds_data["exchange_lay"] = True
                        final_home_odds = away_odds
                        final_away_odds = home_odds
                        logger.info(f"REVERSED match detected: OddsAPI [{home_team} vs {away_team}] -> DB [{db_home} vs {db_away}]. Swapping odds.")
                    else:
                        corrected_odds_data = odds_data
                        final_home_odds = home_odds
                        final_away_odds = away_odds
                    
                    # Parse commence time properly
                    try:
                        if commence_time:
                            commence_dt = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
                        else:
                            commence_dt = datetime.now(timezone.utc)
                    except:
                        commence_dt = datetime.now(timezone.utc)
                    
                    # Update existing match with correctly aligned odds
                    await db.matches.update_one(
                        {"_id": existing_match["_id"]},
                        {"$set": {
                            "odds": corrected_odds_data,
                            "home_odds": final_home_odds,
                            "away_odds": final_away_odds,
                            "odds_updated_at": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc),
                            "commence_time": commence_dt if commence_dt.tzinfo else commence_dt.replace(tzinfo=timezone.utc)
                        }}
                    )
                    merged_count += 1
                    logger.info(f"Merged odds for: {db_home} vs {db_away} - Home Back: {corrected_odds_data.get('home_back')}, Away Back: {corrected_odds_data.get('away_back')} (reversed={is_reversed})")
                    
                    # Propagate odds to ALL duplicate matches with same teams (handles CricketData + OddsAPI dupes)
                    dupe_query = {
                        "_id": {"$ne": existing_match["_id"]},
                        "status": {"$nin": ["completed", "ended", "finished"]},
                        "$or": [
                            {"home_team": {"$regex": home_normalized, "$options": "i"},
                             "away_team": {"$regex": away_normalized, "$options": "i"}},
                            {"home_team": {"$regex": away_normalized, "$options": "i"},
                             "away_team": {"$regex": home_normalized, "$options": "i"}},
                            {"home_team": {"$regex": home_first, "$options": "i"},
                             "away_team": {"$regex": away_first, "$options": "i"}},
                            {"home_team": {"$regex": away_first, "$options": "i"},
                             "away_team": {"$regex": home_first, "$options": "i"}},
                        ]
                    }
                    dupes = await db.matches.find(dupe_query).to_list(length=10)
                    for dupe in dupes:
                        dupe_home = dupe.get("home_team", "")
                        dupe_away = dupe.get("away_team", "")
                        # Check if teams are reversed in the dupe
                        dupe_reversed = (
                            OddsService.teams_match(home_team, dupe_away) and
                            OddsService.teams_match(away_team, dupe_home) and
                            not (OddsService.teams_match(home_team, dupe_home) and OddsService.teams_match(away_team, dupe_away))
                        )
                        if dupe_reversed:
                            dupe_odds = odds_engine.build_odds_object(
                                match_id=dupe.get("match_id", ""),
                                raw_home=away_odds,
                                raw_away=home_odds,
                                bookmaker_name=source_bk.get("title", "Betfair Exchange") if source_bk else "PlayXBets",
                                all_bookmakers=event.get("bookmakers", []),
                                home_team=dupe_away,
                                away_team=dupe_home,
                            )
                            best_h, best_a = _extract_best_h2h_odds(event.get("bookmakers", []), home_team, away_team)
                            if best_h and best_a:
                                dupe_odds["home"] = best_a
                                dupe_odds["away"] = best_h
                            t1n, t1o, t2n, t2o = _extract_best_h2h_odds(event.get("bookmakers", []), home_team, away_team)
                            if t1o and t2o:
                                dupe_odds["home"] = t1o
                                dupe_odds["away"] = t2o
                                dupe_odds["first_team"] = t1n
                                dupe_odds["second_team"] = t2n
                            dupe_h = away_odds
                            dupe_a = home_odds
                        else:
                            dupe_odds = odds_engine.build_odds_object(
                                match_id=dupe.get("match_id", ""),
                                raw_home=home_odds,
                                raw_away=away_odds,
                                bookmaker_name=source_bk.get("title", "Betfair Exchange") if source_bk else "PlayXBets",
                                all_bookmakers=event.get("bookmakers", []),
                                home_team=dupe_home,
                                away_team=dupe_away,
                            )
                            t1n, t1o, t2n, t2o = _extract_best_h2h_odds(event.get("bookmakers", []), home_team, away_team)
                            if t1o and t2o:
                                dupe_odds["home"] = t1o
                                dupe_odds["away"] = t2o
                                dupe_odds["first_team"] = t1n
                                dupe_odds["second_team"] = t2n
                            dupe_h = home_odds
                            dupe_a = away_odds
                        
                        await db.matches.update_one(
                            {"_id": dupe["_id"]},
                            {"$set": {
                                "odds": dupe_odds,
                                "home_odds": dupe_h,
                                "away_odds": dupe_a,
                                "odds_updated_at": datetime.now(timezone.utc),
                                "updated_at": datetime.now(timezone.utc),
                            }}
                        )
                        logger.info(f"Propagated odds to dupe: {dupe_home} vs {dupe_away} (reversed={dupe_reversed})")
                else:
                    # Create new match from Odds API
                    # Parse commence time
                    try:
                        if commence_time:
                            commence_dt = datetime.fromisoformat(commence_time.replace("Z", "+00:00"))
                        else:
                            commence_dt = datetime.now(timezone.utc)
                    except:
                        commence_dt = datetime.now(timezone.utc)
                    
                    match_data = {
                        "match_id": event["id"],
                        "sport": "cricket",
                        "league": event.get("sport_title", "Cricket"),
                        "home_team": home_team,
                        "away_team": away_team,
                        "commence_time": commence_dt if commence_dt.tzinfo else commence_dt.replace(tzinfo=timezone.utc),
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
            
            # Record sync stats
            monitor.record_sync(
                total=len(events),
                synced=merged_count,
                unsynced=created_count,
                errors=len(events) - merged_count - created_count
            )
            
            # Post-merge dedup: remove duplicates where same teams exist with different match IDs
            all_matches = await db.matches.find(
                {"status": {"$nin": ["completed", "ended", "finished"]}},
                {"_id": 1, "match_id": 1, "home_team": 1, "away_team": 1, "score": 1}
            ).to_list(length=500)
            
            from collections import defaultdict
            team_groups = defaultdict(list)
            for m in all_matches:
                ht = OddsService.normalize_team_name(m.get("home_team", ""))
                at = OddsService.normalize_team_name(m.get("away_team", ""))
                pair = tuple(sorted([ht, at]))
                has_score = bool(m.get("score"))
                team_groups[pair].append({"_id": m["_id"], "match_id": m.get("match_id", ""), "has_score": has_score, "home": m.get("home_team"), "away": m.get("away_team")})
            
            cleanup_count = 0
            for pair, entries in team_groups.items():
                if len(entries) <= 1:
                    continue
                # Keep the entry with live scores (CricketData), delete the rest
                entries_with_score = [e for e in entries if e["has_score"]]
                keep = entries_with_score[0] if entries_with_score else entries[0]
                for e in entries:
                    if e["_id"] != keep["_id"]:
                        await db.matches.delete_one({"_id": e["_id"]})
                        cleanup_count += 1
                        logger.info(f"Dedup: removed {e['home']} vs {e['away']} (kept {keep['home']} vs {keep['away']})")
            
            if cleanup_count > 0:
                logger.info(f"Dedup: cleaned up {cleanup_count} duplicate entries")
            
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

# ==================== RETRY WRAPPER ====================
async def api_call_with_retry(func, source: str, max_retries: int = 3, timeout_sec: int = 15):
    """Execute an async API call with retry logic, timeout, and monitoring."""
    for attempt in range(1, max_retries + 1):
        t0 = time.monotonic()
        try:
            result = await asyncio.wait_for(func(), timeout=timeout_sec)
            latency = (time.monotonic() - t0) * 1000
            monitor.record_api_call(source, latency, True, f"attempt {attempt}")
            await coordinator.mark_polled(source)
            return result
        except asyncio.TimeoutError:
            latency = (time.monotonic() - t0) * 1000
            monitor.record_api_call(source, latency, False, f"timeout attempt {attempt}")
            monitor.record_error(source, f"Timeout after {timeout_sec}s (attempt {attempt})")
            logger.warning(f"[{source}] Timeout on attempt {attempt}/{max_retries}")
        except Exception as e:
            latency = (time.monotonic() - t0) * 1000
            monitor.record_api_call(source, latency, False, f"error attempt {attempt}: {str(e)[:80]}")
            monitor.record_error(source, str(e)[:200])
            logger.warning(f"[{source}] Error on attempt {attempt}/{max_retries}: {e}")

        if attempt < max_retries:
            await asyncio.sleep(0.5)  # Fast retry

    exhausted = await coordinator.mark_failed(source)
    if exhausted:
        logger.error(f"[{source}] All {max_retries} retries exhausted")
    return None

# ==================== SMART ORCHESTRATOR ====================
async def smart_orchestrator():
    """
    Single unified polling coordinator. Runs every 10 seconds.
    Decides WHAT to poll based on:
    - Whether live matches exist (fast poll) or not (slow poll)
    - Time since last successful poll per source
    - Deduplication via SmartPollCoordinator
    """
    try:
        current_time = datetime.now(timezone.utc)
        live_count = await db.matches.count_documents({"status": "live"})
        has_live = live_count > 0

        # ── Phase 1: Auto-promote scheduled → live ──
        scheduled_matches = await db.matches.find(
            {"status": "scheduled"},
            {"_id": 0, "match_id": 1, "commence_time": 1, "home_team": 1, "away_team": 1}
        ).to_list(500)
        for sm in scheduled_matches:
            ct = ensure_utc(sm.get("commence_time"))
            if ct and ct <= current_time:
                await db.matches.update_one(
                    {"match_id": sm["match_id"]},
                    {"$set": {"status": "live", "matchStarted": True, "updated_at": current_time}}
                )
                logger.info(f"Auto-promoted to LIVE: {sm.get('home_team')} vs {sm.get('away_team')}")
                has_live = True

        # ── Phase 2 & 3: Odds API + Cricket Data — RUN IN PARALLEL for speed ──
        poll_tasks = []
        if await coordinator.should_poll("odds_live", has_live):
            poll_tasks.append(api_call_with_retry(
                lambda: scheduled_odds_fetch_async(),
                source="odds_live",
                timeout_sec=20
            ))
        if await coordinator.should_poll("cricket_live", has_live):
            poll_tasks.append(api_call_with_retry(
                lambda: smart_cricket_poll(),
                source="cricket_live",
                timeout_sec=20
            ))
        if poll_tasks:
            await asyncio.gather(*poll_tasks, return_exceptions=True)

        # ── Phase 4: Live match completion detection ──
        if has_live and await coordinator.should_poll("live_check", True):
            await api_call_with_retry(
                lambda: detect_completed_matches(current_time),
                source="live_check",
                timeout_sec=30
            )

        # ── Phase 5: Cleanup old completed matches (every 5 min) ──
        if await coordinator.should_poll("cleanup", False):
            cutoff_time = current_time - timedelta(hours=24)
            result = await db.matches.delete_many({
                "status": {"$in": ["completed", "ended", "finished"]},
                "$or": [
                    {"commence_time": {"$lt": cutoff_time}},
                    {"commence_time": {"$lt": cutoff_time.isoformat()}}
                ]
            })
            if result.deleted_count:
                logger.info(f"Cleaned up {result.deleted_count} old completed matches")
            await coordinator.mark_polled("cleanup")

    except Exception as e:
        logger.error(f"Smart orchestrator error: {e}")
        monitor.record_error("orchestrator", str(e))

async def scheduled_odds_fetch_async():
    """Fetch odds from Odds API and merge into DB. Also fetch scores for live matches."""
    global last_odds_poll
    logger.info("Running scheduled odds fetch...")
    events = await OddsService.fetch_sports_data()
    last_odds_poll = datetime.now(timezone.utc)

    # Register for sync validation
    if events:
        sync_validator.register_odds_events(events)

    # Enrich live matches with score data from Odds API /scores endpoint
    try:
        for sport_key in ["cricket_ipl", "cricket_psl"]:
            scores_url = f"{ODDS_API_BASE}/sports/{sport_key}/scores"
            scores_params = {"apiKey": ODDS_API_KEY, "daysFrom": 1}
            scores_resp = await asyncio.get_event_loop().run_in_executor(
                None, lambda url=scores_url, p=scores_params: requests.get(url, params=p, timeout=10)
            )
            if scores_resp.status_code == 200:
                for ev in scores_resp.json():
                    scores = ev.get("scores")
                    if scores and not ev.get("completed"):
                        h = ev.get("home_team", "").lower().strip()
                        a = ev.get("away_team", "").lower().strip()
                        # Find matching DB match and update score
                        db_match = await db.matches.find_one({
                            "status": "live",
                            "home_team": {"$regex": h.split()[0] if h else "", "$options": "i"},
                            "away_team": {"$regex": a.split()[0] if a else "", "$options": "i"},
                        }, {"_id": 0, "match_id": 1})
                        if db_match:
                            await db.matches.update_one(
                                {"match_id": db_match["match_id"]},
                                {"$set": {"score": scores, "updated_at": datetime.now(timezone.utc)}}
                            )
                            # === EVENT DETECTION: Parse Odds API score for 4/6/Wicket suspend ===
                            try:
                                for sc in scores:
                                    sc_str = sc.get("score", "") if isinstance(sc, dict) else str(sc)
                                    if sc_str:
                                        import re as _re
                                        m = _re.match(r"(\d+)/(\d+)\s*(?:\((\d+\.?\d*)\))?", sc_str)
                                        if m:
                                            sr = int(m.group(1))
                                            sw = int(m.group(2))
                                            so = float(m.group(3)) if m.group(3) else 0
                                            event = odds_engine.update_score(
                                                match_id=db_match["match_id"],
                                                runs=sr, wickets=sw, overs=so,
                                                fours=0, sixes=0
                                            )
                                            if event:
                                                logger.info(f"SUSPEND EVENT (OddsAPI) for {h} vs {a}: {event}")
                                            break
                            except Exception:
                                pass
    except Exception as e:
        logger.debug(f"Score enrichment skipped: {e}")

    logger.info("Scheduled odds fetch completed")

async def detect_completed_matches(current_time: datetime):
    """Detect and mark completed matches using reliable signals only."""
    our_live_matches = await db.matches.find({"status": "live"}, {"_id": 0}).to_list(100)
    if not our_live_matches:
        return

    # Method 1: Odds API /scores — check IPL + PSL only (2 calls max)
    odds_completed_pairs = set()
    try:
        for sport_key in ["cricket_ipl", "cricket_psl"]:
            try:
                scores_url = f"{ODDS_API_BASE}/sports/{sport_key}/scores"
                scores_params = {"apiKey": ODDS_API_KEY, "daysFrom": 1}
                scores_resp = await asyncio.get_event_loop().run_in_executor(
                    None, lambda url=scores_url, p=scores_params: requests.get(url, params=p, timeout=10)
                )
                if scores_resp.status_code == 200:
                    for ev in scores_resp.json():
                        if ev.get("completed"):
                            h = ev.get("home_team", "").lower().strip()
                            a = ev.get("away_team", "").lower().strip()
                            odds_completed_pairs.add((h, a))
            except Exception:
                pass
    except Exception:
        pass

    for our_match in our_live_matches:
        match_id = our_match.get("match_id")
        home = our_match.get("home_team", "").lower()
        away = our_match.get("away_team", "").lower()
        commence = our_match.get("commence_time")
        should_complete = False
        completion_reason = ""

        # Signal 1: Odds API /scores says completed
        if odds_completed_pairs:
            for (ch, ca) in odds_completed_pairs:
                if (OddsService.teams_match(home, ch) and OddsService.teams_match(away, ca)) or \
                   (OddsService.teams_match(home, ca) and OddsService.teams_match(away, ch)):
                    should_complete = True
                    completion_reason = "Odds API scores: completed"
                    break

        # Signal 2: Time-based safety net — no cricket match runs >5 hours
        if not should_complete and commence:
            commence_dt = ensure_utc(commence)
            if commence_dt:
                hours = (current_time - commence_dt).total_seconds() / 3600
                if hours > 5.0:
                    should_complete = True
                    completion_reason = f"Live for {hours:.1f}h (>5h)"

        if should_complete:
            logger.info(f"Auto-completing: {our_match.get('home_team')} vs {our_match.get('away_team')} — {completion_reason}")
            await db.matches.update_one(
                {"match_id": match_id},
                {"$set": {"status": "completed", "matchEnded": True, "updated_at": current_time}}
            )

def run_smart_orchestrator():
    """Wrapper to run async orchestrator from sync scheduler context."""
    global main_event_loop
    try:
        if main_event_loop and main_event_loop.is_running():
            future = asyncio.run_coroutine_threadsafe(smart_orchestrator(), main_event_loop)
            try:
                future.result(timeout=90)
            except Exception as e:
                logger.error(f"Orchestrator timed out or failed: {e}")
        else:
            logger.warning("Main event loop not available")
    except Exception as e:
        logger.error(f"Error in orchestrator wrapper: {e}")

def start_scheduler():
    """Start the scheduler with API polling enabled."""

    # Initial fetch at startup
    scheduler.add_job(
        run_smart_orchestrator,
        'date',
        run_date=datetime.now() + timedelta(seconds=5),
        id='initial_fetch',
        replace_existing=True
    )

    # Orchestrator tick every 1s — actual API calls gated by coordinator intervals
    scheduler.add_job(
        run_smart_orchestrator,
        IntervalTrigger(seconds=1),
        id='smart_orchestrator',
        replace_existing=True
    )

    scheduler.start()
    logger.info("Scheduler started — Smart Orchestrator every 1s")


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
        wallet = {"user_id": recharge.user_id, "balance": 0.0, "frozen_balance": 0.0, "exposure": 0.0}
    
    balance_before = wallet.get("balance", 0)
    balance_after = balance_before + recharge.amount
    
    await db.wallets.update_one(
        {"user_id": recharge.user_id},
        {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)},
         "$setOnInsert": {"frozen_balance": 0.0, "exposure": 0.0}},
        upsert=True
    )
    
    transaction = Transaction(
        user_id=recharge.user_id,
        type=TransactionType.DEPOSIT,
        amount=recharge.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        description="Admin recharge",
        note=recharge.note or "Admin recharge"
    )
    
    await db.transactions.insert_one(transaction.model_dump())
    
    return {"success": True, "new_balance": balance_after}

# ==================== ADMIN DEPOSIT MANAGEMENT ====================
@api_router.get("/admin/deposits")
async def get_all_deposits(status: Optional[str] = None, current_user: User = Depends(get_current_admin)):
    """Get all deposit requests for admin review."""
    query = {}
    if status:
        query["status"] = status
    deposits = await db.deposits.find(query, {"_id": 0, "proof_screenshot": 0}).sort("created_at", -1).to_list(500)
    # Attach username
    for d in deposits:
        if not d.get("username"):
            user = await db.users.find_one({"user_id": d["user_id"]}, {"_id": 0, "username": 1})
            d["username"] = user.get("username", "Unknown") if user else "Unknown"
    return deposits

@api_router.get("/admin/deposits/{deposit_id}/proof")
async def get_deposit_proof(deposit_id: str, current_user: User = Depends(get_current_admin)):
    """Get deposit proof screenshot."""
    deposit = await db.deposits.find_one({"deposit_id": deposit_id}, {"_id": 0, "proof_screenshot": 1})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    return {"proof_screenshot": deposit.get("proof_screenshot")}

@api_router.post("/admin/deposits/{deposit_id}/approve")
async def approve_deposit(deposit_id: str, current_user: User = Depends(get_current_admin)):
    """Admin approves deposit → adds amount to user wallet."""
    deposit = await db.deposits.find_one({"deposit_id": deposit_id}, {"_id": 0})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Deposit already {deposit['status']}")
    
    # Add amount to wallet
    wallet = await db.wallets.find_one({"user_id": deposit["user_id"]}, {"_id": 0})
    balance_before = wallet.get("balance", 0) if wallet else 0
    balance_after = balance_before + deposit["amount"]
    
    await db.wallets.update_one(
        {"user_id": deposit["user_id"]},
        {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)},
         "$setOnInsert": {"frozen_balance": 0.0, "exposure": 0.0}},
        upsert=True
    )
    
    # Update deposit status
    await db.deposits.update_one(
        {"deposit_id": deposit_id},
        {"$set": {"status": "approved", "admin_note": f"Approved by {current_user.username}", "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Create transaction record
    transaction = Transaction(
        user_id=deposit["user_id"],
        type=TransactionType.DEPOSIT,
        amount=deposit["amount"],
        balance_before=balance_before,
        balance_after=balance_after,
        reference_id=deposit["deposit_id"],
        description=f"Deposit approved ({deposit.get('payment_method','upi')})",
        note=f"Ref: {deposit.get('transaction_ref', 'N/A')}"
    )
    await db.transactions.insert_one(transaction.model_dump())
    
    return {"success": True, "new_balance": balance_after}

@api_router.post("/admin/deposits/{deposit_id}/reject")
async def reject_deposit(deposit_id: str, current_user: User = Depends(get_current_admin)):
    """Admin rejects deposit request."""
    deposit = await db.deposits.find_one({"deposit_id": deposit_id}, {"_id": 0})
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Deposit already {deposit['status']}")
    
    await db.deposits.update_one(
        {"deposit_id": deposit_id},
        {"$set": {"status": "rejected", "admin_note": f"Rejected by {current_user.username}", "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True}

# ==================== ADMIN WITHDRAWAL MANAGEMENT ====================
@api_router.get("/admin/withdrawals")
async def get_all_withdrawals(status: Optional[str] = None, current_user: User = Depends(get_current_admin)):
    query = {}
    if status:
        query["status"] = status
    withdrawals = await db.withdrawals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for w in withdrawals:
        if not w.get("username"):
            user = await db.users.find_one({"user_id": w["user_id"]}, {"_id": 0, "username": 1})
            w["username"] = user.get("username", "Unknown") if user else "Unknown"
    return withdrawals

@api_router.put("/admin/withdrawals/{withdrawal_id}")
async def update_withdrawal(withdrawal_id: str, update: WithdrawalUpdate, current_user: User = Depends(get_current_admin)):
    withdrawal = await db.withdrawals.find_one({"withdrawal_id": withdrawal_id}, {"_id": 0})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Withdrawal already {withdrawal.get('status')}")
    
    wallet = await db.wallets.find_one({"user_id": withdrawal["user_id"]}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="User wallet not found")
    
    if update.status == WithdrawalStatus.APPROVED:
        # Deduct from balance (unfreeze + deduct)
        balance_before = wallet.get("balance", 0)
        balance_after = balance_before - withdrawal["amount"]
        frozen_after = max(0, wallet.get("frozen_balance", 0) - withdrawal["amount"])
        
        await db.wallets.update_one(
            {"user_id": withdrawal["user_id"]},
            {"$set": {"balance": balance_after, "frozen_balance": frozen_after, "updated_at": datetime.now(timezone.utc)}}
        )
        
        transaction = Transaction(
            user_id=withdrawal["user_id"],
            type=TransactionType.WITHDRAWAL,
            amount=withdrawal["amount"],
            balance_before=balance_before,
            balance_after=balance_after,
            reference_id=withdrawal["withdrawal_id"],
            description="Withdrawal approved and paid",
            note=update.admin_note or "Withdrawal approved"
        )
        await db.transactions.insert_one(transaction.model_dump())
    
    elif update.status == WithdrawalStatus.REJECTED:
        # Unfreeze the amount (return to available)
        frozen_after = max(0, wallet.get("frozen_balance", 0) - withdrawal["amount"])
        await db.wallets.update_one(
            {"user_id": withdrawal["user_id"]},
            {"$set": {"frozen_balance": frozen_after, "updated_at": datetime.now(timezone.utc)}}
        )
    
    await db.withdrawals.update_one(
        {"withdrawal_id": withdrawal_id},
        {"$set": {"status": update.status.value, "admin_note": update.admin_note, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True}

# ==================== ADMIN WALLET STATS ====================
@api_router.get("/admin/wallet/stats")
async def get_wallet_stats(current_user: User = Depends(get_current_admin)):
    """Dashboard stats: total deposits, withdrawals, pending counts."""
    total_deposits = await db.deposits.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawals = await db.withdrawals.aggregate([
        {"$match": {"status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    pending_deposits = await db.deposits.count_documents({"status": "pending"})
    pending_withdrawals = await db.withdrawals.count_documents({"status": "pending"})
    total_users = await db.users.count_documents({})
    
    # Sum all user balances
    total_balance = await db.wallets.aggregate([
        {"$group": {"_id": None, "total": {"$sum": "$balance"}}}
    ]).to_list(1)
    
    return {
        "total_deposits": total_deposits[0]["total"] if total_deposits else 0,
        "total_withdrawals": total_withdrawals[0]["total"] if total_withdrawals else 0,
        "pending_deposits": pending_deposits,
        "pending_withdrawals": pending_withdrawals,
        "total_users": total_users,
        "total_user_balance": total_balance[0]["total"] if total_balance else 0,
    }

@api_router.post("/admin/cron/run")
async def run_cron_now(current_user: User = Depends(get_current_admin)):
    matches = await OddsService.manual_refresh()
    return {"success": True, "matches_fetched": len(matches)}

@api_router.get("/admin/bets")
async def get_all_bets(
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    match_id: Optional[str] = None,
    period: Optional[str] = None,  # day, week, month
    current_user: User = Depends(get_current_admin)
):
    """Enhanced betting history with filters."""
    query = {}
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    if match_id:
        query["match_id"] = match_id
    if period:
        now = datetime.now(timezone.utc)
        if period == "day":
            query["placed_at"] = {"$gte": (now - timedelta(days=1)).isoformat()}
        elif period == "week":
            query["placed_at"] = {"$gte": (now - timedelta(weeks=1)).isoformat()}
        elif period == "month":
            query["placed_at"] = {"$gte": (now - timedelta(days=30)).isoformat()}

    bets = await db.bets.find(query, {"_id": 0}).sort("placed_at", -1).to_list(5000)

    # Enrich with user info and match names
    user_cache = {}
    match_cache = {}
    for b in bets:
        uid = b.get("user_id", "")
        if uid not in user_cache:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "username": 1, "email": 1})
            user_cache[uid] = u or {}
        b["username"] = user_cache[uid].get("username", uid[:8])

        mid = b.get("match_id", "")
        if mid not in match_cache:
            m = await db.matches.find_one({"match_id": mid}, {"_id": 0, "home_team": 1, "away_team": 1})
            match_cache[mid] = m or {}
        mc = match_cache[mid]
        b["match_name"] = f"{mc.get('home_team', '?')} vs {mc.get('away_team', '?')}" if mc else mid[:12]

    # Summary stats
    total_stake = sum(b.get("stake", 0) for b in bets)
    total_payout = sum(b.get("potential_win", 0) for b in bets if b.get("status") == "won")
    return {
        "bets": bets,
        "summary": {
            "total_bets": len(bets),
            "total_stake": round(total_stake, 2),
            "total_payout": round(total_payout, 2),
            "won": sum(1 for b in bets if b.get("status") == "won"),
            "lost": sum(1 for b in bets if b.get("status") == "lost"),
            "pending": sum(1 for b in bets if b.get("status") == "pending"),
        }
    }


from fastapi.responses import StreamingResponse
import io
import csv

@api_router.get("/admin/statements/download")
async def admin_statement_download(
    period: str = "day",
    current_user: User = Depends(get_current_admin)
):
    """Download platform-level betting statement as CSV (day/week/month)."""
    now = datetime.now(timezone.utc)
    if period == "week":
        start = now - timedelta(weeks=1)
    elif period == "month":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=1)

    bets = await db.bets.find(
        {"placed_at": {"$gte": start.isoformat()}},
        {"_id": 0}
    ).sort("placed_at", -1).to_list(10000)

    # Enrich
    user_cache = {}
    match_cache = {}
    for b in bets:
        uid = b.get("user_id", "")
        if uid not in user_cache:
            u = await db.users.find_one({"user_id": uid}, {"_id": 0, "username": 1})
            user_cache[uid] = (u or {}).get("username", uid[:8])
        b["username"] = user_cache[uid]
        mid = b.get("match_id", "")
        if mid not in match_cache:
            m = await db.matches.find_one({"match_id": mid}, {"_id": 0, "home_team": 1, "away_team": 1})
            match_cache[mid] = f"{(m or {}).get('home_team','?')} vs {(m or {}).get('away_team','?')}" if m else mid[:12]
        b["match_name"] = match_cache[mid]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "User", "Match", "Type", "Team", "Odds", "Stake", "Potential Win", "Status"])
    for b in bets:
        writer.writerow([
            b.get("placed_at", "")[:19],
            b.get("username", ""),
            b.get("match_name", ""),
            b.get("bet_type", "back"),
            b.get("selected_team", ""),
            b.get("odds", ""),
            b.get("stake", ""),
            b.get("potential_win", ""),
            b.get("status", ""),
        ])

    output.seek(0)
    filename = f"playxbets_statement_{period}_{now.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/statements/download")
async def user_statement_download(
    period: str = "day",
    current_user: User = Depends(get_current_user)
):
    """Download user's own betting statement as CSV (day/week/month)."""
    now = datetime.now(timezone.utc)
    if period == "week":
        start = now - timedelta(weeks=1)
    elif period == "month":
        start = now - timedelta(days=30)
    else:
        start = now - timedelta(days=1)

    bets = await db.bets.find(
        {"user_id": current_user.user_id, "placed_at": {"$gte": start.isoformat()}},
        {"_id": 0}
    ).sort("placed_at", -1).to_list(5000)

    # Enrich with match names
    match_cache = {}
    for b in bets:
        mid = b.get("match_id", "")
        if mid not in match_cache:
            m = await db.matches.find_one({"match_id": mid}, {"_id": 0, "home_team": 1, "away_team": 1})
            match_cache[mid] = f"{(m or {}).get('home_team','?')} vs {(m or {}).get('away_team','?')}" if m else mid[:12]
        b["match_name"] = match_cache[mid]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Match", "Type", "Team", "Odds", "Stake", "Potential Win", "Status"])
    for b in bets:
        writer.writerow([
            b.get("placed_at", "")[:19],
            b.get("match_name", ""),
            b.get("bet_type", "back"),
            b.get("selected_team", ""),
            b.get("odds", ""),
            b.get("stake", ""),
            b.get("potential_win", ""),
            b.get("status", ""),
        ])

    output.seek(0)
    filename = f"my_statement_{period}_{now.strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

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
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    await db.matches.update_one(
        {"match_id": match_id},
        {"$set": {"winner": winner, "status": "completed", "matchEnded": True}}
    )
    
    # Settle all pending bets for this match
    settled = await settle_match_bets(match_id, winner)
    
    # Also settle P2P bets
    p2p_settled = await settle_p2p_bets(match_id, winner)
    
    return {"success": True, **settled, "p2p": p2p_settled}


async def settle_match_bets(match_id: str, winner: str) -> dict:
    """Settle all pending bets for a completed match.
    Back bets win when selected_team == winner.
    Lay bets win when selected_team != winner."""
    bets = await db.bets.find({"match_id": match_id, "status": "pending"}, {"_id": 0}).to_list(1000)
    
    won_count = 0
    lost_count = 0
    total_payout = 0.0
    
    for bet in bets:
        bet_type = bet.get("bet_type", "back")
        selected = bet["selected_team"]
        
        # Determine win condition based on bet type
        if bet_type == "lay":
            is_winner = selected != winner  # Lay wins when selected team LOSES
        else:
            is_winner = selected == winner  # Back wins when selected team WINS
        
        if is_winner:
            # Credit winnings to user wallet
            wallet = await db.wallets.find_one({"user_id": bet["user_id"]}, {"_id": 0})
            if wallet:
                balance_before = wallet["balance"]
                payout = bet["potential_win"]
                balance_after = round(balance_before + payout, 2)
                
                await db.wallets.update_one(
                    {"user_id": bet["user_id"]},
                    {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}}
                )
                
                transaction = Transaction(
                    user_id=bet["user_id"],
                    type=TransactionType.WINNING,
                    amount=payout,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    note=f"Won {bet_type} bet on {match_id} - {selected}"
                )
                await db.transactions.insert_one(transaction.model_dump())
                total_payout += payout
            
            await db.bets.update_one(
                {"bet_id": bet["bet_id"]},
                {"$set": {"status": "won", "settled_at": datetime.now(timezone.utc)}}
            )
            won_count += 1
        else:
            # Bet lost - stake already deducted at placement
            await db.bets.update_one(
                {"bet_id": bet["bet_id"]},
                {"$set": {"status": "lost", "settled_at": datetime.now(timezone.utc)}}
            )
            lost_count += 1
    
    logger.info(f"Settled {len(bets)} bets for match {match_id}: {won_count} won, {lost_count} lost, total payout={total_payout}")
    return {"total_bets": len(bets), "won": won_count, "lost": lost_count, "total_payout": total_payout}


# ==================== P2P BETTING ENGINE ====================

async def run_p2p_matching(match_id: str, new_bet_id: str, selected_team: str):
    """Match a new bet against opposing pending bets (FIFO, partial matching)."""
    new_bet = await db.p2p_bets.find_one({"bet_id": new_bet_id}, {"_id": 0})
    if not new_bet or new_bet["unmatched_amount"] <= 0:
        return 0

    opposing_bets = await db.p2p_bets.find({
        "match_id": match_id,
        "selected_team": {"$ne": selected_team},
        "unmatched_amount": {"$gt": 0},
        "status": {"$in": ["pending", "partially_matched"]},
        "user_id": {"$ne": new_bet["user_id"]},
    }, {"_id": 0}).sort("placed_at", 1).to_list(100)

    total_matched = 0
    remaining = new_bet["unmatched_amount"]

    for opp in opposing_bets:
        if remaining <= 0:
            break
        match_amount = round(min(remaining, opp["unmatched_amount"]), 2)
        new_opp_matched = round(opp["matched_amount"] + match_amount, 2)
        new_opp_unmatched = round(opp["unmatched_amount"] - match_amount, 2)
        opp_status = "fully_matched" if new_opp_unmatched <= 0.01 else "partially_matched"

        await db.p2p_bets.update_one(
            {"bet_id": opp["bet_id"]},
            {"$set": {"matched_amount": new_opp_matched, "unmatched_amount": max(0, new_opp_unmatched), "status": opp_status},
             "$push": {"matches": {"counter_bet_id": new_bet_id, "amount": match_amount}}}
        )
        remaining = round(remaining - match_amount, 2)
        total_matched = round(total_matched + match_amount, 2)
        await db.p2p_bets.update_one(
            {"bet_id": new_bet_id},
            {"$push": {"matches": {"counter_bet_id": opp["bet_id"], "amount": match_amount}}}
        )

    new_matched = round(new_bet["matched_amount"] + total_matched, 2)
    new_unmatched = round(new_bet["unmatched_amount"] - total_matched, 2)
    new_status = "fully_matched" if new_unmatched <= 0.01 else ("partially_matched" if total_matched > 0 else "pending")

    await db.p2p_bets.update_one(
        {"bet_id": new_bet_id},
        {"$set": {"matched_amount": new_matched, "unmatched_amount": max(0, new_unmatched), "status": new_status}}
    )
    return total_matched


async def settle_p2p_bets(match_id: str, winner: str) -> dict:
    """Settle all P2P bets. Winners get 2x matched + unmatched refund. Losers get unmatched refund."""
    bets = await db.p2p_bets.find({
        "match_id": match_id,
        "status": {"$in": ["pending", "partially_matched", "fully_matched"]}
    }, {"_id": 0}).to_list(1000)

    won_count = lost_count = 0
    total_payout = 0.0

    for bet in bets:
        is_winner = odds_engine._teams_match(bet["selected_team"], winner)
        matched = bet.get("matched_amount", 0)
        unmatched = bet.get("unmatched_amount", 0)

        if is_winner:
            payout = round(matched * 2 + unmatched, 2)
            if payout > 0:
                wallet = await db.wallets.find_one({"user_id": bet["user_id"]}, {"_id": 0})
                if wallet:
                    bal_before = wallet["balance"]
                    bal_after = round(bal_before + payout, 2)
                    winnings_inc = matched  # Net profit = matched amount won from opponents
                    await db.wallets.update_one(
                        {"user_id": bet["user_id"]},
                        {"$set": {"balance": bal_after, "updated_at": datetime.now(timezone.utc)},
                         "$inc": {"exposure": -bet["stake"], "total_winnings": winnings_inc}}
                    )
                    await db.transactions.insert_one(Transaction(
                        user_id=bet["user_id"], type=TransactionType.WINNING,
                        amount=payout, balance_before=bal_before, balance_after=bal_after,
                        note=f"P2P bet won: {bet['selected_team']} (matched: {matched})"
                    ).model_dump())
                    total_payout += payout
            await db.p2p_bets.update_one({"bet_id": bet["bet_id"]}, {"$set": {"status": "won", "settled_at": datetime.now(timezone.utc)}})
            won_count += 1
        else:
            refund = round(unmatched, 2)
            if refund > 0:
                wallet = await db.wallets.find_one({"user_id": bet["user_id"]}, {"_id": 0})
                if wallet:
                    bal_before = wallet["balance"]
                    bal_after = round(bal_before + refund, 2)
                    await db.wallets.update_one(
                        {"user_id": bet["user_id"]},
                        {"$set": {"balance": bal_after, "updated_at": datetime.now(timezone.utc)},
                         "$inc": {"exposure": -bet["stake"]}}
                    )
                    await db.transactions.insert_one(Transaction(
                        user_id=bet["user_id"], type=TransactionType.WINNING,
                        amount=refund, balance_before=bal_before, balance_after=bal_after,
                        note=f"P2P bet refund (unmatched): {bet['selected_team']}"
                    ).model_dump())
                    total_payout += refund
            await db.p2p_bets.update_one({"bet_id": bet["bet_id"]}, {"$set": {"status": "lost", "settled_at": datetime.now(timezone.utc)}})
            lost_count += 1

    logger.info(f"P2P settled {len(bets)} bets for {match_id}: {won_count} won, {lost_count} lost, payout={total_payout}")
    return {"total_bets": len(bets), "won": won_count, "lost": lost_count, "total_payout": total_payout}


@api_router.post("/p2p/bet")
async def place_p2p_bet(bet_input: P2PBetCreate, current_user: User = Depends(get_current_user)):
    match = await db.matches.find_one({"match_id": bet_input.match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if match.get("status") == "completed" or match.get("matchEnded"):
        raise HTTPException(status_code=400, detail="Match has ended")

    market_status = odds_engine.get_market_status(bet_input.match_id)
    if market_status.get("suspended"):
        raise HTTPException(status_code=400, detail="Market is SUSPENDED. Try again shortly.")

    if bet_input.stake <= 0 or bet_input.stake > 10000000:
        raise HTTPException(status_code=400, detail="Invalid stake amount")

    odds_obj = match.get("odds", {})
    home_team = match.get("home_team", "")
    away_team = match.get("away_team", "")
    is_home = odds_engine._teams_match(bet_input.selected_team, home_team)
    is_away = odds_engine._teams_match(bet_input.selected_team, away_team)
    if not is_home and not is_away:
        raise HTTPException(status_code=400, detail="Invalid team selection")

    odds_at_time = odds_obj.get("home", odds_obj.get("home_back", 2.0)) if is_home else odds_obj.get("away", odds_obj.get("away_back", 2.0))

    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="No wallet found. Please deposit first.")
    available = wallet.get("balance", 0) - wallet.get("frozen_balance", 0) - wallet.get("exposure", 0)
    if available < bet_input.stake:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Available: {available:.2f}")

    bal_before = wallet["balance"]
    bal_after = round(bal_before - bet_input.stake, 2)
    await db.wallets.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"balance": bal_after, "updated_at": datetime.now(timezone.utc)},
         "$inc": {"exposure": bet_input.stake}}
    )
    await db.transactions.insert_one(Transaction(
        user_id=current_user.user_id, type=TransactionType.BET,
        amount=bet_input.stake, balance_before=bal_before, balance_after=bal_after,
        note=f"P2P bet on {bet_input.selected_team}"
    ).model_dump())

    bet_id = str(uuid.uuid4())
    await db.p2p_bets.insert_one({
        "bet_id": bet_id, "user_id": current_user.user_id, "username": current_user.username,
        "match_id": bet_input.match_id, "selected_team": bet_input.selected_team,
        "stake": bet_input.stake, "matched_amount": 0.0, "unmatched_amount": bet_input.stake,
        "odds_at_time": odds_at_time, "status": "pending", "matches": [],
        "placed_at": datetime.now(timezone.utc), "settled_at": None,
    })

    await run_p2p_matching(bet_input.match_id, bet_id, bet_input.selected_team)
    updated = await db.p2p_bets.find_one({"bet_id": bet_id}, {"_id": 0})

    return {
        "bet_id": bet_id, "selected_team": bet_input.selected_team,
        "stake": bet_input.stake, "odds_at_time": odds_at_time,
        "matched_amount": updated.get("matched_amount", 0),
        "unmatched_amount": updated.get("unmatched_amount", bet_input.stake),
        "status": updated.get("status", "pending"),
    }


@api_router.get("/p2p/bets/{match_id}/my")
async def get_my_p2p_bets(match_id: str, current_user: User = Depends(get_current_user)):
    bets = await db.p2p_bets.find(
        {"match_id": match_id, "user_id": current_user.user_id}, {"_id": 0}
    ).sort("placed_at", -1).to_list(50)
    return bets


@api_router.get("/p2p/pool/{match_id}")
async def get_p2p_pool(match_id: str):
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0, "home_team": 1, "away_team": 1})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    pipeline = [
        {"$match": {"match_id": match_id, "status": {"$nin": ["cancelled", "refunded"]}}},
        {"$group": {
            "_id": "$selected_team",
            "total_stake": {"$sum": "$stake"},
            "total_matched": {"$sum": "$matched_amount"},
            "total_unmatched": {"$sum": "$unmatched_amount"},
            "bet_count": {"$sum": 1},
        }}
    ]
    results = await db.p2p_bets.aggregate(pipeline).to_list(10)
    pool = {"home_team": match["home_team"], "away_team": match["away_team"]}
    for r in results:
        is_home = odds_engine._teams_match(r["_id"], match["home_team"])
        prefix = "home" if is_home else "away"
        pool[f"{prefix}_total"] = round(r["total_stake"], 2)
        pool[f"{prefix}_matched"] = round(r["total_matched"], 2)
        pool[f"{prefix}_pending"] = round(r["total_unmatched"], 2)
        pool[f"{prefix}_bets"] = r["bet_count"]
    return pool


@api_router.get("/admin/settlement/pending")
async def get_pending_settlements(current_user: User = Depends(get_current_admin)):
    """Get matches with unsettled bets (completed but no winner declared)"""
    # Matches that are completed/live with pending bets
    pending_bet_matches = await db.bets.distinct("match_id", {"status": "pending"})
    
    matches = []
    for mid in pending_bet_matches:
        match = await db.matches.find_one({"match_id": mid}, {"_id": 0})
        if match:
            bet_count = await db.bets.count_documents({"match_id": mid, "status": "pending"})
            total_stake = 0
            bets = await db.bets.find({"match_id": mid, "status": "pending"}, {"_id": 0, "stake": 1}).to_list(1000)
            total_stake = sum(b.get("stake", 0) for b in bets)
            matches.append({
                "match_id": mid,
                "home_team": match.get("home_team"),
                "away_team": match.get("away_team"),
                "status": match.get("status"),
                "league": match.get("league"),
                "winner": match.get("winner"),
                "pending_bets": bet_count,
                "total_stake": round(total_stake, 2)
            })
    
    return {"matches": matches, "total": len(matches)}


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
        
        # Register all cricket matches for sync validation
        sync_validator.register_cricket_matches(live_transformed + upcoming_transformed)
        
        now = datetime.now(timezone.utc)
        
        # Track match IDs from API for cleanup
        api_match_ids = set()
        status_changes = []
        
        # Store/update live matches and detect changes
        for match in live_transformed:
            match["updated_at"] = now
            api_match_ids.add(match["match_id"])
            
            # Check for changes via realtime cache (TTLCache with delta detection)
            changes = await realtime_cache.update_match(match["match_id"], match, source="cricket_api")
            if changes and isinstance(changes, dict) and changes.get("type") == "update":
                ch = changes.get("changes", {})
                if ch.get("status"):
                    status_changes.append({
                        "match_id": match["match_id"],
                        "old_status": ch["status"]["old"],
                        "new_status": ch["status"]["new"],
                        "match": match
                    })
            
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
            
            # === EVENT DETECTION: Parse score and call update_score for 4/6/Wicket suspend ===
            try:
                score_data = match.get("score", [])
                if score_data and isinstance(score_data, list):
                    active_innings = score_data[-1] if score_data else None
                    if active_innings and isinstance(active_innings, dict):
                        sr = int(active_innings.get("r", 0) or 0)
                        sw = int(active_innings.get("w", 0) or 0)
                        so = float(active_innings.get("o", 0) or 0)
                        event = odds_engine.update_score(
                            match_id=match["match_id"],
                            runs=sr, wickets=sw, overs=so,
                            fours=0, sixes=0
                        )
                        if event:
                            logger.info(f"SUSPEND EVENT detected for {match.get('home_team')} vs {match.get('away_team')}: {event}")
            except Exception as e:
                logger.debug(f"Score event detection error: {e}")
            
            # Broadcast individual match update to subscribers
            ws_count = ws_manager.get_connection_count()
            if ws_count > 0:
                await ws_manager.broadcast_match_update(match["match_id"], match)
                monitor.record_ws_event("match_update", ws_count, 1)
        
        # Store/update upcoming matches
        for match in upcoming_transformed:
            match["updated_at"] = now
            api_match_ids.add(match["match_id"])
            await realtime_cache.update_match(match["match_id"], match, source="cricket_api")
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
        
        # AUTO CLEANUP: Only mark CricketData-sourced live matches as completed
        # when CricketData API is actually returning data (non-empty api_match_ids)
        # AND the match is stale (not updated in 2+ hours)
        # Skip Odds-API-sourced matches (hex IDs without dashes)
        if api_match_ids and len(api_match_ids) >= 2:
            stale_cutoff = now - timedelta(hours=2)
            stale_live = await db.matches.find({
                "sport": "cricket",
                "status": "live",
                "match_id": {"$nin": list(api_match_ids)},
                "$or": [
                    {"updated_at": {"$lt": stale_cutoff}},
                    {"updated_at": {"$lt": stale_cutoff.isoformat()}}
                ]
            }, {"_id": 0, "match_id": 1, "home_team": 1, "away_team": 1}).to_list(100)

            # Only complete CricketData-sourced matches (UUID with dashes)
            cric_stale = [m for m in stale_live if "-" in m.get("match_id", "")]
            if cric_stale:
                cric_ids = [m["match_id"] for m in cric_stale]
                result = await db.matches.update_many(
                    {"match_id": {"$in": cric_ids}},
                    {"$set": {"status": "completed", "matchEnded": True}}
                )
                if result.modified_count > 0:
                    logger.info(f"Cricket cleanup: marked {result.modified_count} CricketData stale matches as completed")
        
        # Update realtime cache with live matches
        cache_changed = await realtime_cache.set_live_matches(live_transformed)
        
        # Broadcast to WebSocket clients if there are any connected
        ws_count = ws_manager.get_connection_count()
        if ws_count > 0:
            await ws_manager.broadcast_live_matches(live_transformed)
            monitor.record_ws_event("live_broadcast", ws_count, len(live_transformed))
            
            for change in status_changes:
                await ws_manager.broadcast_match_status_change(
                    change["match_id"],
                    change["old_status"],
                    change["new_status"],
                    change["match"]
                )
            
            logger.info(f"Broadcasted to {ws_count} WebSocket clients")
        
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
    
    # Build query — exclude completed/ended matches
    query = {
        "status": {"$nin": ["completed", "ended", "finished"]}
    }
    
    if sport:
        query["sport"] = sport
    
    matches = await db.matches.find(query, {"_id": 0}).sort("commence_time", 1).to_list(1000)
    
    filtered_matches = []
    for m in matches:
        status = m.get("status", "").lower() if isinstance(m.get("status"), str) else ""
        
        # Always include LIVE matches
        if status == "live":
            filtered_matches.append(m)
            continue
        
        # For scheduled/upcoming matches, only include if commence_time is in the FUTURE
        commence_time = m.get("commence_time")
        if commence_time:
            try:
                ct = ensure_utc(commence_time)
                if not ct:
                    continue
                
                # Include if match is upcoming OR recently started (within 6 hours)
                # Recently started matches may not yet be marked as "live" by external API
                six_hours_ago = now - timedelta(hours=6)
                if ct > six_hours_ago:
                    # If match started already, auto-mark as live
                    if ct <= now and m.get("status") == "scheduled":
                        await db.matches.update_one(
                            {"match_id": m.get("match_id")},
                            {"$set": {"status": "live", "matchStarted": True, "updated_at": now}}
                        )
                        m["status"] = "live"
                        m["matchStarted"] = True
                    filtered_matches.append(m)
                    
            except Exception as e:
                # Skip matches with unparseable dates
                logger.warning(f"Could not parse commence_time for match: {e}")
                continue
    
    # Post-process: apply bookmaker margin + exposure adjustment to all matches when serving
    for m in filtered_matches:
        odds = m.get("odds")
        if odds and isinstance(odds, dict):
            match_id = m.get("match_id", "")
            odds_engine.reapply_odds_for_serving(match_id, odds)

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
    
    # Filter and apply bookmaker margin + exposure adjustment
    live_matches = []
    for m in matches:
        if m.get("matchEnded"):
            continue
        odds = m.get("odds")
        if odds and isinstance(odds, dict):
            match_id = m.get("match_id", "")
            odds_engine.reapply_odds_for_serving(match_id, odds)
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
        "cache_stats": realtime_cache.get_cache_stats(),
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

# ==================== SESSION MARKETS ENDPOINT ====================
@api_router.get("/match/{match_id}/session-markets")
async def get_session_markets(match_id: str):
    """
    Get dynamically calculated session markets for a match.
    Returns over runs, fours, sixes, and wicket markets with proper YES/NO odds.
    All odds have bookmaker margin applied.
    """
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    home_team = match.get("home_team", "")
    away_team = match.get("away_team", "")
    match_format = match.get("format", "t20")
    
    # Parse current score data — use the LATEST/ONGOING innings, not the first
    current_runs = 0
    current_overs = 0.0
    current_wickets = 0
    current_fours = 0
    current_sixes = 0
    
    score_data = match.get("score", [])
    if score_data:
        # Use the LAST innings entry (most recent/ongoing)
        active_innings = score_data[-1] if score_data else None
        if active_innings:
            if isinstance(active_innings, str):
                import re
                m = re.match(r"(\d+)/(\d+)\s*\((\d+\.?\d*)\)", active_innings)
                if m:
                    current_runs = int(m.group(1))
                    current_wickets = int(m.group(2))
                    current_overs = float(m.group(3))
            elif isinstance(active_innings, dict):
                current_runs = int(active_innings.get("r", 0) or 0)
                current_wickets = int(active_innings.get("w", 0) or 0)
                current_overs = float(active_innings.get("o", 0) or 0)
    
    # Update score state in engine for event detection
    odds_engine.update_score(
        match_id=match_id,
        runs=current_runs,
        wickets=current_wickets,
        overs=current_overs,
        fours=current_fours,
        sixes=current_sixes
    )
    
    # Generate session markets
    markets = odds_engine.generate_session_markets(
        match_id=match_id,
        home_team=home_team,
        away_team=away_team,
        match_format=match_format,
        current_runs=current_runs,
        current_overs=current_overs,
        current_wickets=current_wickets,
        current_fours=current_fours,
        current_sixes=current_sixes
    )
    
    # Get market status
    market_status = odds_engine.get_market_status(match_id)
    
    return {
        "match_id": match_id,
        "markets": markets,
        "market_status": market_status,
        "score": {
            "runs": current_runs,
            "wickets": current_wickets,
            "overs": current_overs,
        },
        "is_live": match.get("status") == "live"
    }

# ==================== MARKET STATUS ENDPOINT ====================
@api_router.get("/match/{match_id}/market-status")
async def get_market_status(match_id: str):
    """
    Get current market suspension status for a match.
    Also refreshes score state from DB to ensure event detection works
    even if this endpoint is the only one being polled.
    """
    # Fetch latest score from DB and feed it to the engine for event detection
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0, "score": 1, "status": 1})
    if match and match.get("status") == "live":
        score_data = match.get("score", [])
        if score_data and isinstance(score_data, list):
            active_innings = score_data[-1] if score_data else None
            if active_innings:
                try:
                    if isinstance(active_innings, dict):
                        sr = int(active_innings.get("r", 0) or 0)
                        sw = int(active_innings.get("w", 0) or 0)
                        so = float(active_innings.get("o", 0) or 0)
                    elif isinstance(active_innings, str):
                        import re as _re
                        m = _re.match(r"(\d+)/(\d+)\s*(?:\((\d+\.?\d*)\))?", active_innings)
                        if m:
                            sr = int(m.group(1))
                            sw = int(m.group(2))
                            so = float(m.group(3)) if m.group(3) else 0
                        else:
                            sr, sw, so = 0, 0, 0
                    else:
                        sr, sw, so = 0, 0, 0
                    odds_engine.update_score(
                        match_id=match_id,
                        runs=sr, wickets=sw, overs=so,
                        fours=0, sixes=0
                    )
                except Exception:
                    pass

    status = odds_engine.get_market_status(match_id)
    return {
        "match_id": match_id,
        **status
    }

# ==================== TEST SUSPEND (Admin only) ====================
@api_router.post("/admin/match/{match_id}/test-suspend")
async def test_suspend_event(match_id: str, event_type: str = "four", current_user: User = Depends(get_current_admin)):
    """Admin-only: Simulate a suspend event for testing. event_type: four, six, wicket"""
    if event_type not in ("four", "six", "wicket"):
        raise HTTPException(status_code=400, detail="event_type must be four, six, or wicket")
    # Get current score from DB
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0, "score": 1})
    score_data = match.get("score", []) if match else []
    current_runs, current_wickets, current_overs = 100, 2, 10.0
    if score_data and isinstance(score_data, list):
        last = score_data[-1]
        if isinstance(last, dict):
            current_runs = int(last.get("r", 100) or 100)
            current_wickets = int(last.get("w", 2) or 2)
            current_overs = float(last.get("o", 10.0) or 10.0)
    # First ensure baseline exists
    odds_engine.update_score(match_id=match_id, runs=current_runs, wickets=current_wickets, overs=current_overs)
    import time; time.sleep(0.05)
    # Simulate the event with new score
    if event_type == "wicket":
        new_runs, new_wickets, new_overs = current_runs, current_wickets + 1, current_overs + 0.1
    elif event_type == "six":
        new_runs, new_wickets, new_overs = current_runs + 6, current_wickets, current_overs + 0.1
    else:
        new_runs, new_wickets, new_overs = current_runs + 4, current_wickets, current_overs + 0.1
    # Update DB score to match simulated state (prevents cricket poll from overwriting)
    if score_data and isinstance(score_data, list):
        new_score = list(score_data)
        last_inning = new_score[-1] if new_score else {}
        if isinstance(last_inning, dict):
            updated_inning = {**last_inning, "r": new_runs, "w": new_wickets, "o": new_overs}
            new_score[-1] = updated_inning
        else:
            new_score.append({"r": new_runs, "w": new_wickets, "o": new_overs, "inning": "Test"})
        await db.matches.update_one({"match_id": match_id}, {"$set": {"score": new_score}})
    odds_engine.update_score(match_id=match_id, runs=new_runs, wickets=new_wickets, overs=new_overs)
    new_status = odds_engine.get_market_status(match_id)
    return {"triggered": event_type, "market_status": new_status}
@api_router.get("/admin/match/{match_id}/house-profit")
async def get_house_profit(match_id: str, current_user: User = Depends(get_current_admin)):
    """
    Admin endpoint: Get house profit projections for each outcome.
    Shows whether the book is balanced.
    """
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    odds = match.get("odds", {})
    home_back = odds.get("home_back") or match.get("home_odds", 2.0)
    away_back = odds.get("away_back") or match.get("away_odds", 2.0)
    
    profit_data = odds_engine.calculate_house_profit(match_id, home_back, away_back)
    exposure_data = odds_engine.get_exposure(match_id)
    
    return {
        "match_id": match_id,
        "home_team": match.get("home_team", ""),
        "away_team": match.get("away_team", ""),
        "profit": profit_data,
        "exposure": exposure_data,
        "odds": {
            "home_back": home_back,
            "away_back": away_back,
        }
    }

# ==================== BOOKMAKER ODDS ENDPOINT ====================
@api_router.get("/match/{match_id}/bookmaker-odds")
async def get_bookmaker_odds(match_id: str):
    """
    Get current bookmaker odds with margin and exposure adjustment applied.
    Returns the full odds object recalculated in real-time.
    """
    match = await db.matches.find_one({"match_id": match_id}, {"_id": 0})
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    
    odds = match.get("odds", {})
    raw_home = odds.get("raw_home") or odds.get("home_back") or match.get("home_odds")
    raw_away = odds.get("raw_away") or odds.get("away_back") or match.get("away_odds")
    
    if not raw_home or not raw_away:
        return {"match_id": match_id, "odds": None, "message": "No odds available"}
    
    # Get margin-applied + exposure-adjusted odds
    hb, hl, ab, al = odds_engine.get_adjusted_odds(match_id, raw_home, raw_away)
    
    return {
        "match_id": match_id,
        "home_team": match.get("home_team", ""),
        "away_team": match.get("away_team", ""),
        "raw_odds": {"home": raw_home, "away": raw_away},
        "adjusted_odds": {
            "home_back": hb,
            "home_lay": hl,
            "away_back": ab,
            "away_lay": al,
        },
        "margin_applied": True,
        "exposure": odds_engine.get_exposure(match_id),
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
    
    # Calculate odds with bookmaker margin + exposure adjustment
    odds_obj = match.get("odds") if match.get("odds") and match["odds"].get("home_back_levels") else {
        "home": match.get("home_odds"),
        "away": match.get("away_odds"),
        "draw": match.get("odds_draw"),
        "home_back": match.get("home_odds"),
        "home_lay": OddsService.calculate_lay_odds(match.get("home_odds")),
        "away_back": match.get("away_odds"),
        "away_lay": OddsService.calculate_lay_odds(match.get("away_odds")),
    }
    if odds_obj and isinstance(odds_obj, dict):
        odds_engine.reapply_odds_for_serving(match_id, odds_obj)

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
        
        "odds": odds_obj,
        
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
    
    # Calculate the amount to deduct from wallet
    if bet_input.bet_type == "lay":
        # Lay bet: liability = stake * (odds - 1)
        deduction = round(bet_input.stake * (bet_input.odds - 1), 2)
        potential_win = round(bet_input.stake + deduction, 2)  # Get liability back + earn backer's stake
    else:
        # Back bet: deduct full stake
        deduction = bet_input.stake
        potential_win = round(bet_input.stake * bet_input.odds, 2)  # Total return including stake
    
    if not wallet:
        raise HTTPException(status_code=400, detail="No wallet found. Please deposit first.")
    
    # Check against available balance (balance - frozen - exposure), not raw balance
    available = wallet.get("balance", 0) - wallet.get("frozen_balance", 0) - wallet.get("exposure", 0)
    if available < deduction:
        raise HTTPException(status_code=400, detail=f"Insufficient available balance. Available: {available:.2f}, Required: {deduction:.2f}")
    
    balance_before = wallet["balance"]
    balance_after = round(balance_before - deduction, 2)
    
    await db.wallets.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"balance": balance_after, "updated_at": datetime.now(timezone.utc)}}
    )
    
    transaction = Transaction(
        user_id=current_user.user_id,
        type=TransactionType.BET,
        amount=deduction,
        balance_before=balance_before,
        balance_after=balance_after,
        note=f"{'Lay' if bet_input.bet_type == 'lay' else 'Back'} bet on {bet_input.match_id}"
    )
    
    await db.transactions.insert_one(transaction.model_dump())
    
    bet = Bet(
        user_id=current_user.user_id,
        match_id=bet_input.match_id,
        selected_team=bet_input.selected_team,
        odds=bet_input.odds,
        stake=bet_input.stake,
        potential_win=potential_win,
        bet_type=bet_input.bet_type,
        market_type=bet_input.market_type
    )
    
    await db.bets.insert_one(bet.model_dump())
    
    # Record bet in odds engine for exposure tracking and dynamic odds adjustment
    match_data = await db.matches.find_one({"match_id": bet_input.match_id}, {"_id": 0, "home_team": 1, "away_team": 1})
    if match_data:
        odds_engine.record_bet(
            match_id=bet_input.match_id,
            team=bet_input.selected_team,
            amount=bet_input.stake,
            bet_type=bet_input.bet_type,
            home_team=match_data.get("home_team", ""),
            away_team=match_data.get("away_team", "")
        )
    
    return bet

@api_router.get("/bets/history")
async def get_bet_history(
    status: Optional[str] = None,
    period: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """User's betting history with filters."""
    query = {"user_id": current_user.user_id}
    if status:
        query["status"] = status
    if period:
        now = datetime.now(timezone.utc)
        if period == "day":
            query["placed_at"] = {"$gte": (now - timedelta(days=1)).isoformat()}
        elif period == "week":
            query["placed_at"] = {"$gte": (now - timedelta(weeks=1)).isoformat()}
        elif period == "month":
            query["placed_at"] = {"$gte": (now - timedelta(days=30)).isoformat()}

    bets = await db.bets.find(query, {"_id": 0}).sort("placed_at", -1).to_list(5000)

    # Enrich with match names
    match_cache = {}
    for b in bets:
        mid = b.get("match_id", "")
        if mid not in match_cache:
            m = await db.matches.find_one({"match_id": mid}, {"_id": 0, "home_team": 1, "away_team": 1})
            match_cache[mid] = f"{(m or {}).get('home_team','?')} vs {(m or {}).get('away_team','?')}" if m else mid[:12]
        b["match_name"] = match_cache[mid]

    total_stake = sum(b.get("stake", 0) for b in bets)
    total_won = sum(b.get("potential_win", 0) for b in bets if b.get("status") == "won")
    total_lost = sum(b.get("stake", 0) for b in bets if b.get("status") == "lost")
    return {
        "bets": bets,
        "summary": {
            "total_bets": len(bets),
            "total_stake": round(total_stake, 2),
            "total_won": round(total_won, 2),
            "total_lost": round(total_lost, 2),
            "net_pnl": round(total_won - total_lost, 2),
        }
    }

@api_router.get("/wallet")
async def get_wallet(current_user: User = Depends(get_current_user)):
    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet:
        wallet = {"user_id": current_user.user_id, "balance": 0.0, "frozen_balance": 0.0, "exposure": 0.0}
    # Ensure all fields exist
    wallet.setdefault("frozen_balance", 0.0)
    wallet.setdefault("exposure", 0.0)
    wallet["available_balance"] = wallet["balance"] - wallet.get("frozen_balance", 0) - wallet.get("exposure", 0)
    
    # Calculate withdrawable_balance = total winnings - total approved/pending withdrawals
    winning_agg = await db.transactions.aggregate([
        {"$match": {"user_id": current_user.user_id, "type": "winning"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_winnings = winning_agg[0]["total"] if winning_agg else 0.0
    
    withdrawn_agg = await db.transactions.aggregate([
        {"$match": {"user_id": current_user.user_id, "type": "withdrawal"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawn = withdrawn_agg[0]["total"] if withdrawn_agg else 0.0
    
    # Pending withdrawal amounts (frozen but not yet deducted from transactions)
    pending_wd = await db.withdrawals.aggregate([
        {"$match": {"user_id": current_user.user_id, "status": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_pending_wd = pending_wd[0]["total"] if pending_wd else 0.0
    
    withdrawable = max(0.0, total_winnings - total_withdrawn - total_pending_wd)
    # Cap at available balance
    wallet["withdrawable_balance"] = round(min(withdrawable, max(0, wallet["available_balance"])), 2)
    wallet["total_winnings"] = round(total_winnings, 2)
    
    return wallet

@api_router.get("/transactions/my")
async def get_my_transactions(current_user: User = Depends(get_current_user)):
    """Get all transactions for current user."""
    transactions = await db.transactions.find(
        {"user_id": current_user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return transactions

# ==================== DEPOSIT ENDPOINTS ====================
@api_router.post("/deposits")
async def create_deposit_request(deposit_input: DepositCreate, current_user: User = Depends(get_current_user)):
    """User submits a deposit request (pending admin approval)."""
    if deposit_input.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if deposit_input.amount > 10000000:
        raise HTTPException(status_code=400, detail="Amount exceeds maximum limit")
    
    # Prevent duplicate pending requests (rate limit)
    recent = await db.deposits.find_one({
        "user_id": current_user.user_id,
        "status": "pending",
        "amount": deposit_input.amount,
        "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(minutes=5)}
    })
    if recent:
        raise HTTPException(status_code=429, detail="Duplicate request. Please wait before submitting again.")
    
    deposit = DepositRequest(
        user_id=current_user.user_id,
        username=current_user.username,
        amount=deposit_input.amount,
        payment_method=deposit_input.payment_method,
        transaction_ref=deposit_input.transaction_ref,
        proof_screenshot=deposit_input.proof_screenshot,
        note=deposit_input.note,
    )
    
    await db.deposits.insert_one(deposit.model_dump())
    
    return {"success": True, "deposit_id": deposit.deposit_id, "status": "pending", "message": "Deposit request submitted. Awaiting admin approval."}

@api_router.get("/deposits/my")
async def get_my_deposits(current_user: User = Depends(get_current_user)):
    """Get current user's deposit history."""
    deposits = await db.deposits.find({"user_id": current_user.user_id}, {"_id": 0, "proof_screenshot": 0}).sort("created_at", -1).to_list(200)
    return deposits

# ==================== WITHDRAWAL ENDPOINTS (ENHANCED) ====================
@api_router.post("/withdrawals")
async def create_withdrawal(withdrawal_input: WithdrawalCreate, current_user: User = Depends(get_current_user)):
    """User submits withdrawal with bank details. Amount is frozen until admin approval."""
    if withdrawal_input.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    wallet = await db.wallets.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="No wallet found")
    
    available = wallet.get("balance", 0) - wallet.get("frozen_balance", 0) - wallet.get("exposure", 0)
    if available < withdrawal_input.amount:
        raise HTTPException(status_code=400, detail=f"Insufficient available balance. Available: {available:.2f}")
    
    # Only winnings can be withdrawn - calculate withdrawable amount
    winning_agg = await db.transactions.aggregate([
        {"$match": {"user_id": current_user.user_id, "type": "winning"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_winnings = winning_agg[0]["total"] if winning_agg else 0.0
    
    withdrawn_agg = await db.transactions.aggregate([
        {"$match": {"user_id": current_user.user_id, "type": "withdrawal"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_withdrawn = withdrawn_agg[0]["total"] if withdrawn_agg else 0.0
    
    pending_wd = await db.withdrawals.aggregate([
        {"$match": {"user_id": current_user.user_id, "status": "pending"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    total_pending_wd = pending_wd[0]["total"] if pending_wd else 0.0
    
    withdrawable = max(0.0, total_winnings - total_withdrawn - total_pending_wd)
    withdrawable = min(withdrawable, available)
    
    if withdrawable < withdrawal_input.amount:
        raise HTTPException(status_code=400, detail=f"Only winning amounts can be withdrawn. Withdrawable: {withdrawable:.2f}")
    
    # Prevent duplicate pending requests
    recent = await db.withdrawals.find_one({
        "user_id": current_user.user_id,
        "status": "pending",
        "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(minutes=2)}
    })
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before submitting another withdrawal request.")
    
    # Validate bank details
    if not withdrawal_input.account_holder or not withdrawal_input.bank_name:
        raise HTTPException(status_code=400, detail="Account holder name and bank name are required")
    if not withdrawal_input.account_number or not withdrawal_input.ifsc_code:
        raise HTTPException(status_code=400, detail="Account number and IFSC code are required")
    
    withdrawal = WithdrawalRequest(
        user_id=current_user.user_id,
        username=current_user.username,
        amount=withdrawal_input.amount,
        account_holder=withdrawal_input.account_holder,
        bank_name=withdrawal_input.bank_name,
        account_number=withdrawal_input.account_number,
        ifsc_code=withdrawal_input.ifsc_code,
        upi_id=withdrawal_input.upi_id,
        note=withdrawal_input.note,
    )
    
    await db.withdrawals.insert_one(withdrawal.model_dump())
    
    # Freeze the amount
    await db.wallets.update_one(
        {"user_id": current_user.user_id},
        {"$inc": {"frozen_balance": withdrawal_input.amount}, "$set": {"updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True, "withdrawal_id": withdrawal.withdrawal_id, "status": "pending", "message": "Withdrawal request submitted. Amount frozen until admin approval."}

@api_router.get("/withdrawals/my")
async def get_my_withdrawals(current_user: User = Depends(get_current_user)):
    withdrawals = await db.withdrawals.find({"user_id": current_user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return withdrawals

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

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# ==================== MONITORING & SYNC ENDPOINTS ====================
@api_router.get("/monitoring/stats")
async def get_monitoring_stats():
    """Comprehensive monitoring: API latency, WS events, sync success rate, errors."""
    stats = monitor.get_stats()
    stats["cache"] = realtime_cache.get_cache_stats()
    stats["coordinator"] = coordinator.get_status()
    stats["websocket"]["active_connections"] = ws_manager.get_connection_count()
    return stats

@api_router.get("/admin/sync-report")
async def get_sync_report(current_user: User = Depends(get_current_admin)):
    """API Sync Validation Report — cross-references CricketData vs Odds API."""
    report = sync_validator.generate_report()

    # Also add DB-level stats
    total_db = await db.matches.count_documents({})
    live_db = await db.matches.count_documents({"status": "live"})
    scheduled_db = await db.matches.count_documents({"status": "scheduled"})
    completed_db = await db.matches.count_documents({"status": {"$in": ["completed", "ended", "finished"]}})
    with_odds = await db.matches.count_documents({"home_odds": {"$ne": None}})

    report["database"] = {
        "total_matches": total_db,
        "live": live_db,
        "scheduled": scheduled_db,
        "completed": completed_db,
        "with_odds": with_odds
    }
    return report

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
