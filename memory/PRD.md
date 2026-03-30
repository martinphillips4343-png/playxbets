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
- Back bets: win when team wins, payout = stake × odds
- Lay bets: deduct liability (stake × (odds-1)), win when team LOSES
- Admin Bet Settlement Panel with pending bets view

### Real-Time Optimization (2026-03-28, updated 2026-03-29) — 9-Point System
1. **API Sync Validation**: `/api/admin/sync-report` cross-references CricketData + Odds API (total/synced/unsynced/errors/missing_odds/duplicates/time_mismatches)
2. **Smart Orchestrator**: Single 3s scheduler tick. Fast polling: live=3s, upcoming=60s. SmartPollCoordinator prevents duplicate polls with per-source dedup + async locks
3. **In-Memory TTL Cache**: `sync_engine.TTLCache` with match_ttl=3s, odds_ttl=5s. Delta detection — only pushes changed data
4. **Complete Match Coverage**: ALL cricket matches shown globally (no minor league filtering). Matches without odds show "Odds N/A"
5. **Data Merging**: Hashmap-based fast lookup by match_id + normalized team names. Handles partial data and delayed odds
6. **Frontend Optimization**: WebSocket-first, polling-fallback. Timestamp-based dedup prevents stale overwrites. State diffing prevents unnecessary re-renders
7. **Backend Stability**: `api_call_with_retry()` — max 3 attempts with backoff + timeout. No duplicate API calls or infinite loops
8. **Zero Side Effects**: Betting, UI/UX, auth all untouched
9. **Monitoring**: `/api/monitoring/stats` — API latency, WS events, sync success rate, cache stats, coordinator status, errors

### Odds Merge System
- Reversed match detection, fuzzy team name matching
- Canonical comparison, post-merge duplicate cleanup

### Auto Match Management
- Auto-promote scheduled → live when commence_time passes
- Auto-detect completed matches (Odds API scores, time-based, extreme odds, cricScore)
- Completion detection covers 8 global cricket sport keys

### User History Pages
- Betting History, Recharge History, Withdrawal History

## Architecture
```
/app/backend/
├── server.py              # Main FastAPI app (~2500 lines)
├── sync_engine.py         # NEW: TTLCache, PerformanceMonitor, SmartPollCoordinator, SyncValidator
├── cricket_data_service.py # CricketData API integration
├── requirements.txt
└── .env

/app/frontend/src/
├── hooks/useWebSocket.js  # OPTIMIZED: Dedup, delta updates, WS-first/polling-fallback
├── pages/PublicHomepage.js # Updated: Odds N/A badge
├── pages/MatchPage.js     # Optimized poll intervals
└── pages/admin/DeclareOutcomes.js # Bet Settlement
```

## Key API Endpoints
- `GET /api/matches` — All active matches (no filtering)
- `GET /api/match/{id}` — Single match data
- `GET /api/monitoring/stats` — Performance monitoring (public)
- `GET /api/admin/sync-report` — API sync validation (admin)
- `GET /api/admin/settlement/pending` — Unsettled matches (admin)
- `PUT /api/admin/matches/{id}/outcome?winner=Team` — Declare winner + settle bets

### Dynamic Odds Spread (2026-03-28)
- Formula: `spread = max(0.01, round(back_odds / 20, 2))`
- At ~1x: spread=0.05 (e.g., 1.03→1.08), at ~10x: spread=0.50, at ~20x: spread=1.00
- Applied at serving time to all endpoints: `/matches`, `/matches/live`, `/match/{id}`
- 3-level order book lay levels also use dynamic spread

### Enhanced Betting History & Statement Download (2026-03-28)
- **Admin**: `/api/admin/bets` with filters (period: day/week/month, status: won/lost/pending), summary stats (total bets, stake, won, lost, pending, payout)
- **User**: `/api/bets/history` with same filters + P&L summary (total_stake, total_won, total_lost, net_pnl)
- **CSV Download**: `/api/admin/statements/download?period=day|week|month` and `/api/statements/download?period=day|week|month`
- Frontend pages: Summary cards, period/status filters, download buttons for Day/Week/Month

## Upcoming Tasks
1. **(P1)** User/Admin Panel Clean Separation
2. **(P2)** Admin Manual Match Entry UI
3. **(P2)** Cashout Functionality for live bets

## Future/Backlog
- User withdrawal approval system
- Support ticket system
- Code refactor: Break server.py into /routes, /models, /services

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores
- CricketData API (Paid) - Match data + live scores
- MongoDB Atlas - Cloud database
