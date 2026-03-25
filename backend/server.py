from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ODDS_API_KEY = os.getenv("ODDS_API_KEY", "187430fb4c5f437e8c3692bd64d6900a")
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
    model_config = ConfigDict(extra="ignore")
    match_id: str
    sport: str
    league: str
    home_team: str
    away_team: str
    commence_time: datetime
    home_odds: Optional[float] = None
    away_odds: Optional[float] = None
    odds_draw: Optional[float] = None  # Draw odds for soccer matches
    status: str = "scheduled"  # scheduled, live, completed
    winner: Optional[str] = None
    # Cricket-specific fields
    has_tv: bool = False  # Live TV available
    has_fancy: bool = False  # Fancy markets available
    has_bookmaker: bool = False  # Bookmaker available
    format: Optional[str] = None  # t20, odi, test, t10
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
    @staticmethod
    async def fetch_sports_data():
        """Fetch cricket and football matches from The Odds API"""
        sports = ["cricket", "soccer"]
        all_matches = []
        
        for sport in sports:
            try:
                url = f"{ODDS_API_BASE}/sports/{sport}/odds"
                params = {
                    "apiKey": ODDS_API_KEY,
                    "regions": "us,uk",
                    "markets": "h2h",
                    "oddsFormat": "decimal"
                }
                
                response = requests.get(url, params=params, timeout=10)
                if response.status_code == 200:
                    events = response.json()
                    
                    for event in events:
                        # Extract odds
                        home_odds = None
                        away_odds = None
                        draw_odds = None
                        
                        if event.get("bookmakers"):
                            bookmaker = event["bookmakers"][0]
                            if bookmaker.get("markets"):
                                market = bookmaker["markets"][0]
                                outcomes = market.get("outcomes", [])
                                
                                # Iterate through outcomes and match by name
                                # Soccer outcomes: team names + "Draw"
                                # Cricket outcomes: just team names
                                home_team_lower = event.get("home_team", "").lower()
                                away_team_lower = event.get("away_team", "").lower()
                                
                                for outcome in outcomes:
                                    name = outcome.get("name", "")
                                    name_lower = name.lower()
                                    price = outcome.get("price")
                                    
                                    if name_lower == home_team_lower:
                                        home_odds = price
                                    elif name_lower == away_team_lower:
                                        away_odds = price
                                    elif name_lower == "draw" or name_lower == "tie":
                                        draw_odds = price
                                
                                # Fallback for home/away if name matching didn't work
                                if home_odds is None:
                                    for outcome in outcomes:
                                        if outcome.get("name", "").lower() not in ["draw", "tie"]:
                                            home_odds = outcome.get("price")
                                            break
                                            
                                if away_odds is None:
                                    for outcome in outcomes:
                                        if outcome.get("name", "").lower() not in ["draw", "tie"] and outcome.get("price") != home_odds:
                                            away_odds = outcome.get("price")
                                            break
                        
                        match_data = {
                            "match_id": event["id"],
                            "sport": sport,
                            "league": event.get("sport_title", "Unknown"),
                            "home_team": event["home_team"],
                            "away_team": event["away_team"],
                            "commence_time": datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00")),
                            "home_odds": home_odds,
                            "away_odds": away_odds,
                            "odds_draw": draw_odds,  # Draw odds for soccer matches
                            "status": "scheduled",
                            "updated_at": datetime.now(timezone.utc)
                        }
                        
                        # Upsert to prevent duplicates
                        await db.matches.update_one(
                            {"match_id": match_data["match_id"]},
                            {"$set": match_data},
                            upsert=True
                        )
                        all_matches.append(match_data)
                
                logger.info(f"Fetched {len(all_matches)} {sport} matches")
            except Exception as e:
                logger.error(f"Error fetching {sport} data: {e}")
        
        return all_matches

    @staticmethod
    async def manual_refresh():
        """Manual trigger for cron job"""
        return await OddsService.fetch_sports_data()

# ==================== CRON SCHEDULER ====================
scheduler = BackgroundScheduler()

async def scheduled_odds_fetch():
    """Scheduled task to fetch odds - runs once daily at Indian midnight"""
    try:
        logger.info("Running scheduled odds fetch at Indian midnight (00:00:01 IST)...")
        await OddsService.fetch_sports_data()
        
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

def start_scheduler():
    """Start the scheduler - runs daily at Indian midnight (00:00:01 AM IST = 18:30:01 UTC previous day)"""
    # IST is UTC+5:30, so Indian midnight (00:00:01 IST) = 18:30:01 UTC (previous day)
    
    # Football/Soccer odds - once daily at Indian midnight
    scheduler.add_job(
        scheduled_odds_fetch,
        'cron',
        hour=18,
        minute=30,
        second=1,
        id='fetch_odds_job',
        replace_existing=True
    )
    
    # Cricket data - smart polling every 30 minutes (within quota limits)
    scheduler.add_job(
        run_cricket_poll,
        IntervalTrigger(minutes=30),
        id='fetch_cricket_job',
        replace_existing=True
    )
    
    scheduler.start()
    logger.info("Scheduler started:")
    logger.info("  - Football/Soccer: Daily at 00:00:01 AM IST (18:30:01 UTC)")
    logger.info("  - Cricket: Every 30 minutes (smart polling with quota management)")


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
    """Smart polling function that adjusts frequency based on live matches"""
    global cricket_scheduler_running
    service = get_cricket_service()
    
    try:
        logger.info("=== Cricket Smart Poll ===")
        data = await service.get_all_matches()
        
        live_transformed = await service.transform_for_frontend(data.get("live", []))
        upcoming_transformed = await service.transform_for_frontend(data.get("upcoming", []))
        
        # Store matches
        for match in live_transformed + upcoming_transformed:
            match["updated_at"] = datetime.now(timezone.utc)
            await db.matches.update_one(
                {"match_id": match["match_id"]},
                {"$set": match},
                upsert=True
            )
        
        status = await service.get_service_status()
        logger.info(f"Cricket poll complete. Live: {len(live_transformed)}, Upcoming: {len(upcoming_transformed)}, Quota: {status['quota']['requests_made']}/{status['quota']['quota_limit']}")
        
    except Exception as e:
        logger.error(f"Cricket poll error: {e}")

def run_cricket_poll():
    """Wrapper to run async poll in sync context"""
    asyncio.run(smart_cricket_poll())

# ==================== USER ROUTES ====================
@api_router.get("/matches", response_model=List[Match])
async def get_matches(sport: Optional[str] = None):
    """
    Get only LIVE and UPCOMING matches.
    Strictly filters out old/past matches.
    """
    query = {
        # Exclude completed matches
        "status": {"$nin": ["completed", "ended", "finished"]}
    }
    
    if sport:
        query["sport"] = sport
    
    matches = await db.matches.find(query, {"_id": 0}).sort("commence_time", 1).to_list(1000)
    
    # Get current time in UTC
    now = datetime.now(timezone.utc)
    
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
                
                # Only include if match is in the FUTURE (upcoming)
                if ct > now:
                    filtered_matches.append(m)
                    
            except Exception as e:
                # Skip matches with unparseable dates
                logger.warning(f"Could not parse commence_time for match: {e}")
                continue
    
    return [Match(**m) for m in filtered_matches]

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
@app.websocket("/ws/cricket-micro")
async def cricket_micro_websocket(websocket: WebSocket):
    await cricket_ws_endpoint(websocket)

@app.websocket("/ws/cricket-micro/{match_id}")
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
