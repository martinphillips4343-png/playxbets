"""
Cricket Ball-By-Ball Micro Betting Extension Module
====================================================
This module extends the existing PlayXBets platform with real-time
ball-by-ball micro betting for cricket matches.

Features:
- CricketData API integration for ball-by-ball data
- WebSocket real-time streaming
- Automatic market creation and suspension
- 5-second betting windows
- Anti ball-delay betting protection
- Multi-match parallel processing
"""

import os
import asyncio
import logging
import uuid
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from motor.motor_asyncio import AsyncIOMotorDatabase

# Logging
logger = logging.getLogger(__name__)

# Configuration
CRICKETDATA_API_KEY = os.getenv("CRICKETDATA_API_KEY", "")
CRICKETDATA_BASE_URL = "https://api.cricapi.com/v1"
DEMO_MATCH_ID = os.getenv("DEMO_CRICKET_MATCH_ID", "")

# Betting window configuration
BETTING_WINDOW_SECONDS = 5
LATENCY_THRESHOLD_SECONDS = 2
POLL_INTERVAL_SECONDS = 1.5

# ==================== ENUMS ====================
class MicroMarketStatus(str, Enum):
    CREATED = "created"
    OPEN = "open"
    SUSPENDED = "suspended"
    SETTLED = "settled"
    CANCELLED = "cancelled"

class MicroBetStatus(str, Enum):
    PENDING = "pending"
    WON = "won"
    LOST = "lost"
    REFUNDED = "refunded"

class BallOutcome(str, Enum):
    DOT = "dot"
    ONE = "1"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    SIX = "6"
    WICKET = "wicket"
    WIDE_NOBALL = "wide_noball"

# ==================== MODELS ====================
class MicroMarket(BaseModel):
    """Ball-by-ball betting market"""
    model_config = ConfigDict(extra="ignore")
    market_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    match_id: str
    match_name: str
    ball_number: str  # Format: "10.4" (over.ball)
    status: MicroMarketStatus = MicroMarketStatus.CREATED
    odds: Dict[str, float] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    opens_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closes_at: Optional[datetime] = None
    result: Optional[str] = None
    settled_at: Optional[datetime] = None

class MicroBet(BaseModel):
    """User bet on a micro market"""
    model_config = ConfigDict(extra="ignore")
    bet_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    market_id: str
    match_id: str
    ball_number: str
    selected_outcome: str
    odds: float
    stake: float
    potential_win: float
    status: MicroBetStatus = MicroBetStatus.PENDING
    placed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    server_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    settled_at: Optional[datetime] = None

class MicroBetCreate(BaseModel):
    """Request to place a micro bet"""
    market_id: str
    selected_outcome: str
    stake: float

class CricketMatchState(BaseModel):
    """State of a live cricket match"""
    model_config = ConfigDict(extra="ignore")
    match_id: str
    match_name: str
    team1: str
    team2: str
    batting_team: str
    current_score: str
    current_over: str
    last_ball: str
    last_ball_result: Optional[str] = None
    is_live: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== DEFAULT ODDS ====================
DEFAULT_ODDS = {
    BallOutcome.DOT.value: 2.0,
    BallOutcome.ONE.value: 2.5,
    BallOutcome.TWO.value: 4.0,
    BallOutcome.THREE.value: 8.0,
    BallOutcome.FOUR.value: 4.5,
    BallOutcome.SIX.value: 8.0,
    BallOutcome.WICKET.value: 12.0,
    BallOutcome.WIDE_NOBALL.value: 6.0,
}

# ==================== WEBSOCKET MANAGER ====================
class ConnectionManager:
    """Manages WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # match_id -> connections
        self.all_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket, match_id: Optional[str] = None):
        await websocket.accept()
        self.all_connections.add(websocket)
        if match_id:
            if match_id not in self.active_connections:
                self.active_connections[match_id] = set()
            self.active_connections[match_id].add(websocket)
        logger.info(f"WebSocket connected. Total: {len(self.all_connections)}")
    
    def disconnect(self, websocket: WebSocket, match_id: Optional[str] = None):
        self.all_connections.discard(websocket)
        if match_id and match_id in self.active_connections:
            self.active_connections[match_id].discard(websocket)
        logger.info(f"WebSocket disconnected. Total: {len(self.all_connections)}")
    
    async def broadcast_to_match(self, match_id: str, message: dict):
        """Broadcast message to all connections watching a specific match"""
        if match_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[match_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
            for conn in dead_connections:
                self.disconnect(conn, match_id)
    
    async def broadcast_all(self, message: dict):
        """Broadcast message to all connections"""
        dead_connections = set()
        for connection in self.all_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.add(connection)
        for conn in dead_connections:
            self.all_connections.discard(conn)

# Global connection manager
ws_manager = ConnectionManager()

# ==================== CRICKET DATA API SERVICE ====================
class CricketDataService:
    """Service for fetching ball-by-ball data from CricketData API"""
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=10.0)
    
    async def get_live_matches(self) -> List[dict]:
        """Fetch all live cricket matches"""
        try:
            url = f"{CRICKETDATA_BASE_URL}/currentMatches"
            params = {"apikey": CRICKETDATA_API_KEY, "offset": 0}
            response = await self.client.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    matches = data.get("data", [])
                    # Filter for live matches
                    live_matches = [m for m in matches if m.get("matchStarted") and not m.get("matchEnded")]
                    return live_matches
            return []
        except Exception as e:
            logger.error(f"Error fetching live matches: {e}")
            return []
    
    async def get_ball_by_ball(self, match_id: str) -> dict:
        """Fetch ball-by-ball data for a specific match"""
        try:
            url = f"{CRICKETDATA_BASE_URL}/match_bbb"
            params = {"apikey": CRICKETDATA_API_KEY, "id": match_id}
            response = await self.client.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "success":
                    return data.get("data", {})
            return {}
        except Exception as e:
            logger.error(f"Error fetching ball-by-ball data: {e}")
            return {}
    
    async def close(self):
        await self.client.aclose()

# Global cricket data service
cricket_service = CricketDataService()

# ==================== MICRO BETTING ENGINE ====================
class MicroBettingEngine:
    """
    Main engine for cricket micro betting.
    Handles ball detection, market creation, and settlement.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.match_states: Dict[str, CricketMatchState] = {}
        self.active_markets: Dict[str, MicroMarket] = {}
        self.running = False
        self._tasks: Dict[str, asyncio.Task] = {}
    
    def parse_ball_number(self, over_str: str, ball_in_over: int) -> str:
        """Convert over and ball to ball number format (e.g., '10.4')"""
        return f"{over_str}.{ball_in_over}"
    
    def get_next_ball(self, current_ball: str) -> str:
        """Calculate the next ball number"""
        if not current_ball or "." not in current_ball:
            return "0.1"
        parts = current_ball.split(".")
        over = int(parts[0])
        ball = int(parts[1])
        if ball >= 6:
            return f"{over + 1}.1"
        return f"{over}.{ball + 1}"
    
    def map_result_to_outcome(self, result: str) -> str:
        """Map API result to our outcome enum"""
        result_lower = result.lower().strip()
        if result_lower in ["0", "dot", "."]:
            return BallOutcome.DOT.value
        elif result_lower == "1":
            return BallOutcome.ONE.value
        elif result_lower == "2":
            return BallOutcome.TWO.value
        elif result_lower == "3":
            return BallOutcome.THREE.value
        elif result_lower == "4":
            return BallOutcome.FOUR.value
        elif result_lower == "6":
            return BallOutcome.SIX.value
        elif "wicket" in result_lower or "out" in result_lower or "w" == result_lower:
            return BallOutcome.WICKET.value
        elif "wide" in result_lower or "no ball" in result_lower or "nb" in result_lower or "wd" in result_lower:
            return BallOutcome.WIDE_NOBALL.value
        else:
            # Default to dot for unknown
            return BallOutcome.DOT.value
    
    async def create_market(self, match_id: str, match_name: str, ball_number: str) -> MicroMarket:
        """Create a new micro market for the next ball"""
        now = datetime.now(timezone.utc)
        closes_at = now + timedelta(seconds=BETTING_WINDOW_SECONDS)
        
        market = MicroMarket(
            match_id=match_id,
            match_name=match_name,
            ball_number=ball_number,
            status=MicroMarketStatus.OPEN,
            odds=DEFAULT_ODDS.copy(),
            created_at=now,
            opens_at=now,
            closes_at=closes_at,
        )
        
        # Store in database
        await self.db.micro_markets.insert_one(market.model_dump())
        
        # Track active market
        self.active_markets[market.market_id] = market
        
        # Broadcast market creation
        await ws_manager.broadcast_to_match(match_id, {
            "event": "market_created",
            "market": market.model_dump(mode="json"),
        })
        
        logger.info(f"Created market {market.market_id} for ball {ball_number}")
        
        # Schedule auto-suspension
        asyncio.create_task(self._auto_suspend_market(market.market_id, BETTING_WINDOW_SECONDS))
        
        return market
    
    async def _auto_suspend_market(self, market_id: str, delay_seconds: float):
        """Automatically suspend market after betting window"""
        await asyncio.sleep(delay_seconds)
        market = self.active_markets.get(market_id)
        if market and market.status == MicroMarketStatus.OPEN:
            await self.suspend_market(market_id, "Betting window expired")
    
    async def suspend_market(self, market_id: str, reason: str = ""):
        """Suspend a market to prevent further betting"""
        market = self.active_markets.get(market_id)
        if not market:
            return
        
        market.status = MicroMarketStatus.SUSPENDED
        
        await self.db.micro_markets.update_one(
            {"market_id": market_id},
            {"$set": {"status": MicroMarketStatus.SUSPENDED.value}}
        )
        
        await ws_manager.broadcast_to_match(market.match_id, {
            "event": "market_suspended",
            "market_id": market_id,
            "reason": reason,
        })
        
        logger.info(f"Suspended market {market_id}: {reason}")
    
    async def settle_market(self, market_id: str, result: str):
        """Settle a market with the ball result"""
        market = self.active_markets.get(market_id)
        if not market:
            # Try to fetch from database
            market_doc = await self.db.micro_markets.find_one({"market_id": market_id}, {"_id": 0})
            if not market_doc:
                return
            market = MicroMarket(**market_doc)
        
        outcome = self.map_result_to_outcome(result)
        now = datetime.now(timezone.utc)
        
        # Update market
        market.status = MicroMarketStatus.SETTLED
        market.result = outcome
        market.settled_at = now
        
        await self.db.micro_markets.update_one(
            {"market_id": market_id},
            {"$set": {
                "status": MicroMarketStatus.SETTLED.value,
                "result": outcome,
                "settled_at": now,
            }}
        )
        
        # Settle all bets on this market
        bets = await self.db.micro_bets.find(
            {"market_id": market_id, "status": MicroBetStatus.PENDING.value},
            {"_id": 0}
        ).to_list(1000)
        
        for bet_doc in bets:
            bet = MicroBet(**bet_doc)
            if bet.selected_outcome == outcome:
                # Winner
                await self._pay_winner(bet)
            else:
                # Loser
                await self.db.micro_bets.update_one(
                    {"bet_id": bet.bet_id},
                    {"$set": {"status": MicroBetStatus.LOST.value, "settled_at": now}}
                )
        
        # Remove from active markets
        self.active_markets.pop(market_id, None)
        
        # Broadcast result
        await ws_manager.broadcast_to_match(market.match_id, {
            "event": "market_result",
            "market_id": market_id,
            "result": outcome,
            "result_display": result,
        })
        
        logger.info(f"Settled market {market_id} with result: {outcome}")
    
    async def _pay_winner(self, bet: MicroBet):
        """Pay out a winning bet"""
        now = datetime.now(timezone.utc)
        
        # Get user wallet
        wallet = await self.db.wallets.find_one({"user_id": bet.user_id}, {"_id": 0})
        if not wallet:
            return
        
        balance_before = wallet["balance"]
        balance_after = balance_before + bet.potential_win
        
        # Update wallet
        await self.db.wallets.update_one(
            {"user_id": bet.user_id},
            {"$set": {"balance": balance_after, "updated_at": now}}
        )
        
        # Create transaction
        from server import Transaction, TransactionType
        transaction = Transaction(
            user_id=bet.user_id,
            type=TransactionType.WINNING,
            amount=bet.potential_win,
            balance_before=balance_before,
            balance_after=balance_after,
            note=f"Won micro bet on ball {bet.ball_number}"
        )
        await self.db.transactions.insert_one(transaction.model_dump())
        
        # Update bet status
        await self.db.micro_bets.update_one(
            {"bet_id": bet.bet_id},
            {"$set": {"status": MicroBetStatus.WON.value, "settled_at": now}}
        )
    
    async def process_ball_event(self, match_id: str, match_name: str, ball_number: str, result: str):
        """Process a detected ball event"""
        logger.info(f"Ball event: {match_name} - Ball {ball_number} = {result}")
        
        # Find and settle any market for this ball
        market_doc = await self.db.micro_markets.find_one({
            "match_id": match_id,
            "ball_number": ball_number,
            "status": {"$in": [MicroMarketStatus.OPEN.value, MicroMarketStatus.SUSPENDED.value]}
        }, {"_id": 0})
        
        if market_doc:
            await self.settle_market(market_doc["market_id"], result)
        
        # Create market for next ball
        next_ball = self.get_next_ball(ball_number)
        await self.create_market(match_id, match_name, next_ball)
    
    async def start_match_listener(self, match_id: str, match_name: str):
        """Start listening for ball events on a match"""
        logger.info(f"Starting listener for match: {match_name} ({match_id})")
        
        # Initialize match state
        self.match_states[match_id] = CricketMatchState(
            match_id=match_id,
            match_name=match_name,
            team1="",
            team2="",
            batting_team="",
            current_score="",
            current_over="0",
            last_ball="0.0",
        )
        
        self.running = True
        
        while self.running:
            try:
                # Fetch ball-by-ball data
                data = await cricket_service.get_ball_by_ball(match_id)
                
                if not data:
                    logger.warning(f"No data for match {match_id}")
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue
                
                # Process ball-by-ball updates
                bbb_data = data.get("bbb", [])
                if bbb_data:
                    latest_entry = bbb_data[-1] if isinstance(bbb_data, list) else None
                    
                    if latest_entry:
                        current_over = str(latest_entry.get("overs", "0"))
                        balls = latest_entry.get("ball", [])
                        
                        if balls:
                            last_ball_data = balls[-1] if isinstance(balls, list) else balls
                            ball_num = len(balls) if isinstance(balls, list) else 1
                            
                            current_ball = self.parse_ball_number(current_over, ball_num)
                            
                            # Check if this is a new ball
                            state = self.match_states.get(match_id)
                            if state and current_ball != state.last_ball:
                                # New ball detected!
                                result = str(last_ball_data.get("run", last_ball_data.get("score", "0")))
                                
                                # Update state
                                state.last_ball = current_ball
                                state.last_ball_result = result
                                state.current_over = current_over
                                state.updated_at = datetime.now(timezone.utc)
                                
                                # Process the ball event
                                await self.process_ball_event(match_id, match_name, current_ball, result)
                                
                                # Broadcast match state update
                                await ws_manager.broadcast_to_match(match_id, {
                                    "event": "match_state_update",
                                    "state": state.model_dump(mode="json"),
                                })
                
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                
            except Exception as e:
                logger.error(f"Error in match listener: {e}")
                await asyncio.sleep(POLL_INTERVAL_SECONDS * 2)
    
    async def stop_match_listener(self, match_id: str):
        """Stop listening for a match"""
        if match_id in self._tasks:
            self._tasks[match_id].cancel()
            del self._tasks[match_id]
        if match_id in self.match_states:
            del self.match_states[match_id]
        
        # Suspend all active markets for this match
        for market_id, market in list(self.active_markets.items()):
            if market.match_id == match_id:
                await self.suspend_market(market_id, "Match listener stopped")

# ==================== DEMO MODE ====================
class DemoMicroBettingEngine:
    """
    Demo mode engine that simulates live cricket match for testing.
    Uses simulated ball events instead of real API data.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.running = False
        self.current_over = 0
        self.current_ball = 0
        self.active_market: Optional[MicroMarket] = None
        self.demo_match_id = DEMO_MATCH_ID or "demo-match-001"
        self.demo_match_name = "India vs Australia - Demo Match"
    
    async def start_demo(self):
        """Start demo mode simulation"""
        self.running = True
        self.current_over = 0
        self.current_ball = 0
        
        logger.info("Starting demo mode for cricket micro betting")
        
        # Create initial market
        await self._create_next_market()
        
        # Start simulation loop
        while self.running:
            await asyncio.sleep(8)  # Wait 8 seconds between balls
            if not self.running:
                break
            await self._simulate_ball()
    
    async def stop_demo(self):
        """Stop demo mode"""
        self.running = False
        if self.active_market:
            await self._suspend_market("Demo stopped")
    
    def _get_ball_number(self) -> str:
        """Get current ball number string"""
        return f"{self.current_over}.{self.current_ball}"
    
    def _next_ball(self):
        """Advance to next ball"""
        self.current_ball += 1
        if self.current_ball > 6:
            self.current_over += 1
            self.current_ball = 1
    
    async def _create_next_market(self):
        """Create market for the next ball"""
        self._next_ball()
        ball_number = self._get_ball_number()
        now = datetime.now(timezone.utc)
        closes_at = now + timedelta(seconds=BETTING_WINDOW_SECONDS)
        
        market = MicroMarket(
            match_id=self.demo_match_id,
            match_name=self.demo_match_name,
            ball_number=ball_number,
            status=MicroMarketStatus.OPEN,
            odds=DEFAULT_ODDS.copy(),
            created_at=now,
            opens_at=now,
            closes_at=closes_at,
        )
        
        await self.db.micro_markets.insert_one(market.model_dump())
        self.active_market = market
        
        # Broadcast
        await ws_manager.broadcast_all({
            "event": "market_created",
            "market": market.model_dump(mode="json"),
        })
        
        logger.info(f"Demo: Created market for ball {ball_number}")
        
        # Schedule auto-suspension
        asyncio.create_task(self._auto_suspend(market.market_id))
        
        return market
    
    async def _auto_suspend(self, market_id: str):
        """Auto-suspend after betting window"""
        await asyncio.sleep(BETTING_WINDOW_SECONDS)
        if self.active_market and self.active_market.market_id == market_id:
            if self.active_market.status == MicroMarketStatus.OPEN:
                await self._suspend_market("Betting window closed")
    
    async def _suspend_market(self, reason: str):
        """Suspend the active market"""
        if not self.active_market:
            return
        
        self.active_market.status = MicroMarketStatus.SUSPENDED
        await self.db.micro_markets.update_one(
            {"market_id": self.active_market.market_id},
            {"$set": {"status": MicroMarketStatus.SUSPENDED.value}}
        )
        
        await ws_manager.broadcast_all({
            "event": "market_suspended",
            "market_id": self.active_market.market_id,
            "reason": reason,
        })
    
    async def _simulate_ball(self):
        """Simulate a ball being bowled"""
        import random
        
        # Suspend current market if still open
        if self.active_market and self.active_market.status == MicroMarketStatus.OPEN:
            await self._suspend_market("Ball bowled")
        
        # Generate random result
        outcomes = [
            (BallOutcome.DOT.value, "Dot ball", 35),
            (BallOutcome.ONE.value, "1 run", 30),
            (BallOutcome.TWO.value, "2 runs", 10),
            (BallOutcome.THREE.value, "3 runs", 2),
            (BallOutcome.FOUR.value, "FOUR!", 12),
            (BallOutcome.SIX.value, "SIX!", 5),
            (BallOutcome.WICKET.value, "WICKET!", 4),
            (BallOutcome.WIDE_NOBALL.value, "Wide/No Ball", 2),
        ]
        
        weights = [o[2] for o in outcomes]
        result = random.choices(outcomes, weights=weights)[0]
        outcome, display, _ = result
        
        # Settle market
        if self.active_market:
            await self._settle_market(outcome, display)
        
        # Create next market
        await self._create_next_market()
    
    async def _settle_market(self, outcome: str, display: str):
        """Settle the active market"""
        if not self.active_market:
            return
        
        now = datetime.now(timezone.utc)
        market_id = self.active_market.market_id
        
        self.active_market.status = MicroMarketStatus.SETTLED
        self.active_market.result = outcome
        self.active_market.settled_at = now
        
        await self.db.micro_markets.update_one(
            {"market_id": market_id},
            {"$set": {
                "status": MicroMarketStatus.SETTLED.value,
                "result": outcome,
                "settled_at": now,
            }}
        )
        
        # Settle bets
        bets = await self.db.micro_bets.find(
            {"market_id": market_id, "status": MicroBetStatus.PENDING.value},
            {"_id": 0}
        ).to_list(1000)
        
        for bet_doc in bets:
            bet = MicroBet(**bet_doc)
            if bet.selected_outcome == outcome:
                await self._pay_winner(bet)
            else:
                await self.db.micro_bets.update_one(
                    {"bet_id": bet.bet_id},
                    {"$set": {"status": MicroBetStatus.LOST.value, "settled_at": now}}
                )
        
        # Broadcast result
        await ws_manager.broadcast_all({
            "event": "market_result",
            "market_id": market_id,
            "ball_number": self.active_market.ball_number,
            "result": outcome,
            "result_display": display,
        })
        
        logger.info(f"Demo: Ball {self.active_market.ball_number} = {display}")
    
    async def _pay_winner(self, bet: MicroBet):
        """Pay winning bet"""
        now = datetime.now(timezone.utc)
        
        wallet = await self.db.wallets.find_one({"user_id": bet.user_id}, {"_id": 0})
        if not wallet:
            return
        
        balance_before = wallet["balance"]
        balance_after = balance_before + bet.potential_win
        
        await self.db.wallets.update_one(
            {"user_id": bet.user_id},
            {"$set": {"balance": balance_after, "updated_at": now}}
        )
        
        # Create transaction
        await self.db.transactions.insert_one({
            "transaction_id": str(uuid.uuid4()),
            "user_id": bet.user_id,
            "type": "winning",
            "amount": bet.potential_win,
            "balance_before": balance_before,
            "balance_after": balance_after,
            "note": f"Won micro bet on ball {bet.ball_number}",
            "created_at": now,
        })
        
        await self.db.micro_bets.update_one(
            {"bet_id": bet.bet_id},
            {"$set": {"status": MicroBetStatus.WON.value, "settled_at": now}}
        )

# ==================== API ROUTER ====================
def create_micro_betting_router(db: AsyncIOMotorDatabase) -> APIRouter:
    """Create the API router for micro betting"""
    
    router = APIRouter(prefix="/cricket-micro", tags=["Cricket Micro Betting"])
    
    # Initialize engines
    demo_engine = DemoMicroBettingEngine(db)
    live_engine = MicroBettingEngine(db)
    
    @router.get("/markets/active")
    async def get_active_markets():
        """Get all active micro markets"""
        markets = await db.micro_markets.find(
            {"status": {"$in": [MicroMarketStatus.OPEN.value, MicroMarketStatus.SUSPENDED.value]}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
        return markets
    
    @router.get("/markets/{market_id}")
    async def get_market(market_id: str):
        """Get a specific market"""
        market = await db.micro_markets.find_one({"market_id": market_id}, {"_id": 0})
        if not market:
            raise HTTPException(status_code=404, detail="Market not found")
        return market
    
    @router.get("/markets/match/{match_id}")
    async def get_match_markets(match_id: str):
        """Get all markets for a match"""
        markets = await db.micro_markets.find(
            {"match_id": match_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        return markets
    
    @router.post("/bets")
    async def place_micro_bet(bet_input: MicroBetCreate, user_id: str = None):
        """
        Place a micro bet on a ball outcome.
        
        Note: In production, user_id should come from JWT auth.
        For this extension, we accept user_id as a query parameter.
        """
        if not user_id:
            raise HTTPException(status_code=400, detail="User ID is required")
        
        server_time = datetime.now(timezone.utc)
        
        # Get market
        market = await db.micro_markets.find_one({"market_id": bet_input.market_id}, {"_id": 0})
        if not market:
            raise HTTPException(status_code=404, detail="Market not found")
        
        # Check market status
        if market["status"] != MicroMarketStatus.OPEN.value:
            raise HTTPException(status_code=400, detail="Market is not open for betting")
        
        # Check betting window
        closes_at = market.get("closes_at")
        if closes_at:
            if isinstance(closes_at, str):
                closes_at = datetime.fromisoformat(closes_at.replace("Z", "+00:00"))
            if server_time > closes_at:
                raise HTTPException(status_code=400, detail="Betting window has closed")
        
        # Validate outcome
        if bet_input.selected_outcome not in market["odds"]:
            raise HTTPException(status_code=400, detail="Invalid outcome selection")
        
        # Get user wallet
        wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
        if not wallet or wallet["balance"] < bet_input.stake:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        # Get odds
        odds = market["odds"][bet_input.selected_outcome]
        
        # Deduct stake from wallet
        balance_before = wallet["balance"]
        balance_after = balance_before - bet_input.stake
        
        await db.wallets.update_one(
            {"user_id": user_id},
            {"$set": {"balance": balance_after, "updated_at": server_time}}
        )
        
        # Create transaction
        await db.transactions.insert_one({
            "transaction_id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "bet",
            "amount": bet_input.stake,
            "balance_before": balance_before,
            "balance_after": balance_after,
            "note": f"Micro bet on ball {market['ball_number']}",
            "created_at": server_time,
        })
        
        # Create bet
        bet = MicroBet(
            user_id=user_id,
            market_id=bet_input.market_id,
            match_id=market["match_id"],
            ball_number=market["ball_number"],
            selected_outcome=bet_input.selected_outcome,
            odds=odds,
            stake=bet_input.stake,
            potential_win=bet_input.stake * odds,
            server_timestamp=server_time,
        )
        
        await db.micro_bets.insert_one(bet.model_dump())
        
        return bet.model_dump()
    
    @router.get("/bets/history/{user_id}")
    async def get_micro_bet_history(user_id: str):
        """Get micro bet history for a user"""
        bets = await db.micro_bets.find(
            {"user_id": user_id},
            {"_id": 0}
        ).sort("placed_at", -1).to_list(100)
        return bets
    
    @router.post("/demo/start")
    async def start_demo_mode():
        """Start demo mode for testing"""
        if demo_engine.running:
            return {"status": "already_running"}
        asyncio.create_task(demo_engine.start_demo())
        return {"status": "started", "match_id": demo_engine.demo_match_id}
    
    @router.post("/demo/stop")
    async def stop_demo_mode():
        """Stop demo mode"""
        await demo_engine.stop_demo()
        return {"status": "stopped"}
    
    @router.get("/demo/status")
    async def get_demo_status():
        """Get demo mode status"""
        return {
            "running": demo_engine.running,
            "match_id": demo_engine.demo_match_id,
            "match_name": demo_engine.demo_match_name,
            "current_ball": demo_engine._get_ball_number() if demo_engine.running else None,
            "active_market": demo_engine.active_market.model_dump(mode="json") if demo_engine.active_market else None,
        }
    
    @router.get("/odds")
    async def get_default_odds():
        """Get default odds for all outcomes"""
        return DEFAULT_ODDS
    
    return router

# ==================== WEBSOCKET ENDPOINT ====================
async def websocket_endpoint(websocket: WebSocket, match_id: Optional[str] = None):
    """WebSocket endpoint for real-time updates"""
    await ws_manager.connect(websocket, match_id)
    try:
        while True:
            # Keep connection alive and receive any messages
            data = await websocket.receive_text()
            # Echo back or handle ping
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, match_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket, match_id)
