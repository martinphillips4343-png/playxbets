from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import aiohttp
from enum import Enum


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Enums
class MatchStatus(str, Enum):
    LIVE = "live"
    SCHEDULED = "scheduled"
    COMPLETED = "completed"


class SportType(str, Enum):
    CRICKET = "cricket"
    SOCCER = "soccer"


# Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class Match(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    match_id: str
    sport: SportType
    team_home: str
    team_away: str
    score_home: Optional[int] = 0
    score_away: Optional[int] = 0
    status: MatchStatus
    league: str
    venue: str
    match_time: datetime
    odds_home: Optional[float] = None
    odds_draw: Optional[float] = None
    odds_away: Optional[float] = None


class Bet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    bet_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    match_id: str
    team_home: str
    team_away: str
    sport: SportType
    bet_type: str  # "home", "draw", "away"
    odds: float
    stake: float
    potential_return: float
    placed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "pending"  # pending, won, lost


class BetCreate(BaseModel):
    match_id: str
    team_home: str
    team_away: str
    sport: SportType
    bet_type: str
    odds: float
    stake: float


# Mock Data
MOCK_MATCHES = [
    # Cricket Matches
    Match(
        match_id="c001",
        sport=SportType.CRICKET,
        team_home="India",
        team_away="Pakistan",
        score_home=285,
        score_away=145,
        status=MatchStatus.LIVE,
        league="ICC World Cup",
        venue="Eden Gardens, Kolkata",
        match_time=datetime.now(timezone.utc),
        odds_home=1.65,
        odds_draw=None,
        odds_away=2.35
    ),
    Match(
        match_id="c002",
        sport=SportType.CRICKET,
        team_home="England",
        team_away="Australia",
        score_home=312,
        score_away=298,
        status=MatchStatus.LIVE,
        league="The Ashes",
        venue="Lord's Cricket Ground",
        match_time=datetime.now(timezone.utc),
        odds_home=1.85,
        odds_draw=None,
        odds_away=2.10
    ),
    Match(
        match_id="c003",
        sport=SportType.CRICKET,
        team_home="South Africa",
        team_away="New Zealand",
        score_home=0,
        score_away=0,
        status=MatchStatus.SCHEDULED,
        league="Test Series",
        venue="Cape Town Stadium",
        match_time=datetime.now(timezone.utc),
        odds_home=1.95,
        odds_draw=None,
        odds_away=1.95
    ),
    # Soccer Matches
    Match(
        match_id="s001",
        sport=SportType.SOCCER,
        team_home="Real Madrid",
        team_away="Barcelona",
        score_home=2,
        score_away=1,
        status=MatchStatus.LIVE,
        league="La Liga",
        venue="Santiago Bernabéu",
        match_time=datetime.now(timezone.utc),
        odds_home=2.10,
        odds_draw=3.50,
        odds_away=3.20
    ),
    Match(
        match_id="s002",
        sport=SportType.SOCCER,
        team_home="Manchester United",
        team_away="Liverpool",
        score_home=1,
        score_away=1,
        status=MatchStatus.LIVE,
        league="Premier League",
        venue="Old Trafford",
        match_time=datetime.now(timezone.utc),
        odds_home=2.45,
        odds_draw=3.30,
        odds_away=2.85
    ),
    Match(
        match_id="s003",
        sport=SportType.SOCCER,
        team_home="Bayern Munich",
        team_away="Borussia Dortmund",
        score_home=0,
        score_away=0,
        status=MatchStatus.SCHEDULED,
        league="Bundesliga",
        venue="Allianz Arena",
        match_time=datetime.now(timezone.utc),
        odds_home=1.75,
        odds_draw=3.80,
        odds_away=4.20
    ),
]


# Routes
@api_router.get("/")
async def root():
    return {"message": "PlayBets API"}


@api_router.get("/matches/live", response_model=List[Match])
async def get_live_matches():
    """Get all live matches (both cricket and soccer)"""
    live_matches = [m for m in MOCK_MATCHES if m.status == MatchStatus.LIVE]
    return live_matches


@api_router.get("/matches/cricket", response_model=List[Match])
async def get_cricket_matches():
    """Get all cricket matches"""
    cricket_matches = [m for m in MOCK_MATCHES if m.sport == SportType.CRICKET]
    return cricket_matches


@api_router.get("/matches/soccer", response_model=List[Match])
async def get_soccer_matches():
    """Get all soccer matches"""
    soccer_matches = [m for m in MOCK_MATCHES if m.sport == SportType.SOCCER]
    return soccer_matches


@api_router.get("/matches/{match_id}", response_model=Match)
async def get_match_details(match_id: str):
    """Get details of a specific match"""
    match = next((m for m in MOCK_MATCHES if m.match_id == match_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    return match


@api_router.post("/bets", response_model=Bet)
async def place_bet(bet_input: BetCreate):
    """Place a new bet"""
    potential_return = bet_input.stake * bet_input.odds
    
    bet = Bet(
        match_id=bet_input.match_id,
        team_home=bet_input.team_home,
        team_away=bet_input.team_away,
        sport=bet_input.sport,
        bet_type=bet_input.bet_type,
        odds=bet_input.odds,
        stake=bet_input.stake,
        potential_return=potential_return
    )
    
    # Store in MongoDB
    bet_dict = bet.model_dump()
    bet_dict['placed_at'] = bet_dict['placed_at'].isoformat()
    
    await db.bets.insert_one(bet_dict)
    
    return bet


@api_router.get("/bets/history", response_model=List[Bet])
async def get_bet_history():
    """Get betting history"""
    bets = await db.bets.find({}, {"_id": 0}).sort("placed_at", -1).to_list(100)
    
    # Convert ISO string timestamps back to datetime objects
    for bet in bets:
        if isinstance(bet['placed_at'], str):
            bet['placed_at'] = datetime.fromisoformat(bet['placed_at'])
    
    return bets


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
