# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI (Betfair-style). The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API).

## Tech Stack
- **Frontend**: React 18.2.0 + Tailwind CSS + Shadcn/UI + Lucide React icons
- **Backend**: FastAPI + MongoDB Atlas
- **Real-time**: WebSockets (FastAPI) + APScheduler + In-Memory TTL Cache
- **APIs**: CricketData API (Paid), The Odds API (Paid)

## Completed Features

### Authentication & Users
- JWT-based auth (admin/user roles)
- Admin: admin/123456, User: user/123456

### Homepage
- Cricket-only with Live/Upcoming/Date filters
- Matches show real odds (blue/red) or "Odds N/A" when unavailable
- WebSocket "Real-time" green badge indicator

### Betfair-Style Match Betting Page
- Single Back/Lay per team (no bookmaker sections)
- User Exposure Panel, Matched Bets Tab
- Session/Tied bright blue/red colors with SUSPENDED state
- Bet Slip with profit/loss preview
- Real-time odds flash green/red on change

### Bet Settlement Logic (2026-03-28)
- Back bets: win when team wins, payout = stake * odds
- Lay bets: deduct liability (stake * (odds-1)), win when team LOSES
- Admin Bet Settlement Panel with pending bets view

### Bookmaker Odds Engine (2026-03-31)
1. **Margin Application**: Raw API odds converted to probability, 7% margin added (5-10% range), converted back. Total probability always > 1.0 = house always profits
2. **Exposure Tracking**: In-memory per-match tracking of back/lay totals on both sides
3. **Dynamic Odds Adjustment**: More money on one side -> reduce that side odds, increase opposite. Auto-balance book
4. **No Arbitrage**: Safety checks ensure users can never profit from both sides simultaneously
5. **Session Markets from Backend**: Over runs, fours, sixes, wickets markets calculated server-side with proper YES/NO odds + margin
6. **Event-Driven Market Suspension**: Markets suspend only on 4/6/wicket events (not timed cycles). Auto-resume after 5 seconds
7. **New API Endpoints**: `/match/{id}/session-markets`, `/match/{id}/bookmaker-odds`, `/match/{id}/market-status`, `/admin/match/{id}/house-profit`

### API Connection (2026-03-31)
- Odds API quota reset and keys properly loaded from .env (no hardcoded fallbacks)
- CricketData API quota reset to 2000 (was incorrectly limited to 100)
- Both APIs live and syncing every 2-3 seconds for live matches

### Real-Time Optimization
1. **API Sync**: SmartPollCoordinator prevents duplicate polls
2. **Smart Orchestrator**: 3s tick. Live polling: odds=3s, cricket=3s. Upcoming: 60s
3. **In-Memory TTL Cache**: match_ttl=3s, odds_ttl=5s. Delta detection
4. **Completion Detection**: Odds API /scores + time-based (>5h)
5. **Score Enrichment**: Odds API /scores endpoint feeds live score data

### Dynamic Odds Spread
- Formula: margin-based with exposure adjustment
- Lay spread: max(0.02, back / 15) - wider than before for house edge
- 3-level order book lay levels with dynamic spread

### Enhanced Betting History & Statement Download (2026-03-28)
- Admin/User filters, P&L summary, CSV download

## Architecture
```
/app/backend/
├── server.py              # Main FastAPI app (~2700 lines)
├── odds_engine.py         # BookmakerOddsEngine: margin, exposure, dynamic odds, session markets
├── sync_engine.py         # TTLCache, PerformanceMonitor, SmartPollCoordinator
├── cricket_data_service.py # CricketData API integration (quota: 2000/day)
├── requirements.txt
└── .env

/app/frontend/src/
├── hooks/useWebSocket.js
├── pages/PublicHomepage.js
├── pages/MatchPage.js     # Session markets from backend, event-driven suspend
└── pages/admin/DeclareOutcomes.js
```

## Key API Endpoints
- `GET /api/matches` — All active matches with margin-applied odds
- `GET /api/match/{id}` — Single match with margin-applied odds
- `GET /api/match/{id}/session-markets` — Backend-calculated session markets (over runs, fours, sixes, wickets)
- `GET /api/match/{id}/bookmaker-odds` — Real-time adjusted odds with exposure data
- `GET /api/match/{id}/market-status` — Market suspension status (event-driven)
- `GET /api/admin/match/{id}/house-profit` — House profit projection per outcome (admin)
- `GET /api/monitoring/stats` — Performance monitoring

## Upcoming Tasks
1. **(P2)** Admin Manual Match Entry UI
2. **(P2)** Cashout Functionality for live bets

## Future/Backlog
- User withdrawal approval system
- Support ticket system
- Code refactor: Break server.py into /routes, /models, /services

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores - Key in .env
- CricketData API (Paid) - Match data + live scores - Key in .env, quota 2000/day
- MongoDB Atlas - Cloud database
