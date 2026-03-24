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
import requests
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from enum import Enum
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ODDS_API_KEY = os.getenv("ODDS_API_KEY", "187430fb4c5f437e8c3692bd64d6900a")
ODDS_API_BASE = "https://api.the-odds-api.com/v4"

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
    status: str = "scheduled"
    winner: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
    scheduler.add_job(
        scheduled_odds_fetch,
        'cron',
        hour=18,
        minute=30,
        second=1,
        id='fetch_odds_job',
        replace_existing=True
    )
    scheduler.start()
    logger.info("Scheduler started - will run daily at 00:00:01 AM IST (18:30:01 UTC)")


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

# ==================== USER ROUTES ====================
@api_router.get("/matches", response_model=List[Match])
async def get_matches(sport: Optional[str] = None):
    """
    Get all live and upcoming matches.
    Filters out completed/ended matches automatically.
    """
    query = {
        # Exclude completed matches
        "status": {"$nin": ["completed", "ended", "finished"]}
    }
    
    if sport:
        query["sport"] = sport
    
    matches = await db.matches.find(query, {"_id": 0}).sort("commence_time", 1).to_list(1000)
    
    # Filter in Python to handle date comparison correctly
    now = datetime.now(timezone.utc)
    cutoff_time = now - timedelta(hours=4)
    
    filtered_matches = []
    for m in matches:
        # Keep live matches always
        if m.get("status") == "live":
            filtered_matches.append(m)
            continue
        
        # For non-live matches, check if they haven't started yet or started recently
        commence_time_str = m.get("commence_time", "")
        if commence_time_str:
            try:
                if "T" in commence_time_str:
                    commence_time = datetime.fromisoformat(commence_time_str.replace("Z", "+00:00"))
                else:
                    commence_time = datetime.fromisoformat(commence_time_str)
                
                # If match hasn't started yet, or started within last 4 hours
                if commence_time > cutoff_time:
                    filtered_matches.append(m)
            except:
                # If we can't parse the date, include the match
                filtered_matches.append(m)
        else:
            filtered_matches.append(m)
    
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
