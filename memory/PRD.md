# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI (Betfair-style). The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API). Includes a manual wallet system (no payment gateways) where users request deposits/withdrawals and admins approve/reject them.

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
1. **Margin Application**: Raw API odds converted to probability, 7% margin added
2. **Exposure Tracking**: In-memory per-match tracking of back/lay totals
3. **Dynamic Odds Adjustment**: More money on one side -> reduce that side odds
4. **No Arbitrage**: Safety checks ensure users can never profit from both sides simultaneously
5. **Session Markets from Backend**: Over runs, fours, sixes, wickets markets
6. **Event-Driven Market Suspension**: Markets suspend only on 4/6/wicket events
7. **New API Endpoints**: `/match/{id}/session-markets`, `/match/{id}/bookmaker-odds`, etc.

### Manual Wallet System (2026-04-01) - TESTED
- **Deposit Flow**: User submits deposit request -> Admin approves/rejects -> Balance updated
- **Withdrawal Flow**: User submits withdrawal (bank details required) -> Balance frozen -> Admin approves (deducts) or rejects (unfreezes)
- **Wallet Schema**: balance, available_balance (computed), frozen_balance, exposure, withdrawable_balance (winnings only), total_winnings
- **Withdrawable = Winnings Only**: Recharged amounts cannot be withdrawn. Only bet winnings are withdrawable. Backend enforces this check.
- **Admin Dashboard**: Deposit/Withdrawal management with stats, filters, approve/reject
- **User Pages**: Recharge history, withdrawal history
- **E2E Tested**: 17/17 + 7/7 backend tests passed, all frontend verified (2026-04-01)

### Wallet + Betting Integration Fix (2026-04-01)
- **Bug Fixed**: `place_bet` now checks `available_balance` (balance - frozen - exposure) instead of raw balance
- Prevents users from betting with money frozen for pending withdrawals

### Withdrawable = Winnings Only (2026-04-01) - TESTED
- **Bug Fixed**: Wallet page showed ₹0.00 because `/api/transactions/my` was missing, causing `Promise.all` to silently fail
- **Feature**: Only winning amounts can be withdrawn, not recharged/deposited amounts
- `withdrawable_balance = total_winnings - approved_withdrawals - pending_withdrawals`
- Backend enforces check on POST /api/withdrawals
- Frontend shows "Withdrawable (Winnings)" card in cyan + withdrawal form shows limit

### API Connection (2026-03-31)
- Odds API quota reset and keys properly loaded from .env
- CricketData API quota reset to 2000
- Both APIs live and syncing every 1-3 seconds for live matches

### Real-Time Optimization
1. **API Sync**: SmartPollCoordinator prevents duplicate polls
2. **Smart Orchestrator**: 3s tick. Live polling: odds=3s, cricket=3s. Upcoming: 60s
3. **In-Memory TTL Cache**: match_ttl=3s, odds_ttl=5s. Delta detection
4. **Completion Detection**: Odds API /scores + time-based (>5h)

### Enhanced Betting History & Statement Download (2026-03-28)
- Admin/User filters, P&L summary, CSV download

## Architecture
```
/app/backend/
├── server.py              # Main FastAPI app (~3100 lines)
├── odds_engine.py         # BookmakerOddsEngine: margin, exposure, dynamic odds, session markets
├── sync_engine.py         # TTLCache, PerformanceMonitor, SmartPollCoordinator
├── cricket_data_service.py # CricketData API integration (quota: 2000/day)
├── requirements.txt
└── .env

/app/frontend/src/
├── hooks/useWebSocket.js
├── pages/PublicHomepage.js
├── pages/MatchPage.js
├── pages/Login.js, SignUp.js
├── pages/user/RechargeHistory.js, MyWithdrawals.js, BetHistory.js, Dashboard.js
├── pages/admin/Dashboard.js, Deposits.js, Withdrawals.js, DeclareOutcomes.js, BetsPlaced.js
└── App.js (Routes)
```

## Key API Endpoints
- `GET /api/matches` — All active matches with margin-applied odds
- `GET /api/match/{id}` — Single match with margin-applied odds
- `GET /api/match/{id}/session-markets` — Backend-calculated session markets
- `GET /api/match/{id}/bookmaker-odds` — Real-time adjusted odds with exposure data
- `POST /api/bets` — Place bet (checks available_balance)
- `GET /api/wallet` — User wallet (balance, available_balance, frozen_balance, exposure)
- `POST /api/deposits` — Create deposit request
- `GET /api/deposits/my` — User's deposit history
- `POST /api/withdrawals` — Create withdrawal (freezes balance)
- `GET /api/withdrawals/my` — User's withdrawal history
- `GET /api/admin/deposits` — All deposit requests
- `POST /api/admin/deposits/{id}/approve` — Approve deposit
- `POST /api/admin/deposits/{id}/reject` — Reject deposit
- `GET /api/admin/withdrawals` — All withdrawal requests
- `PUT /api/admin/withdrawals/{id}` — Approve/reject withdrawal
- `GET /api/admin/wallet/stats` — Admin wallet statistics

## Upcoming Tasks
1. **(P2)** Admin Manual Match Entry UI (form to hit `/api/admin/cricket/seed`)
2. **(P2)** Cashout Functionality for live bets

## Future/Backlog
- User support ticket system
- Code refactor: Break server.py (~3100 lines) into /routes, /models, /services

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores - Key in .env
- CricketData API (Paid) - Match data + live scores - Key in .env, quota 2000/day
- MongoDB Atlas - Cloud database
