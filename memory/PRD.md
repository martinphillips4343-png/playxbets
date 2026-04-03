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

### Betfair-Style Match Betting Page → **Upgraded to Winner P2P UI (2026-04-02)**
- **NEW**: Minimal "Winner" UI with two large team cards (single odds per team)
- **NEW**: P2P betting engine (user vs user, no back/lay)
- **NEW**: Partial matching (FIFO) — if ₹1000 bet on Team A, only ₹400 on Team B → match ₹400, keep ₹600 pending
- **NEW**: Quick stake buttons (100, 500, 1K, 5K, 10K)
- **NEW**: Betting Pool stats per team (total stake, matched, pending, bet count)
- **NEW**: My Bets section showing status (pending/partially_matched/fully_matched/won/lost)
- Suspend detection on 4/6/wicket via score comparison (CricketData API)
- Dark theme for match page, real-time 1s polling
- Settlement: winners get 2× matched + unmatched refund; losers lose matched, get unmatched refund
- Removed: All session markets, tied match, over runs, wicket markets, extra widgets
- Removed: Back/Lay system, bet slip sidebar

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
- `GET /api/matches` — All active matches with odds
- `GET /api/match/{id}` — Single match with odds
- `GET /api/match/{id}/market-status` — Suspend state (4/6/wicket detection)
- `POST /api/p2p/bet` — Place P2P bet (select team + stake, auto-matching)
- `GET /api/p2p/bets/{id}/my` — User's P2P bets for a match
- `GET /api/p2p/pool/{id}` — P2P pool stats per team
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

### Light Theme Conversion (2026-04-02) - TESTED
- Converted all User and Admin panel pages from dark to light theme
- Global body background changed from `#050505` to `#F9FAFB`
- Pages converted: Admin Withdrawals, Admin Deposits, User RechargeHistory, User MyWithdrawals
- Pages already light: Admin Dashboard, ManageBettors, ManageGames, BetsPlaced, DeclareOutcomes, SupportTickets, User Dashboard, MyTickets, BettingExchange, MatchDetail
- Public-facing pages (Homepage, MatchPage) intentionally remain dark-themed
- Login page background changed from dark gradient to light gradient

### Admin Withdrawals Copy Feature (2026-04-02) - TESTED
- Added single-click copy buttons for Name, Bank Account, IFSC, and UPI fields on Admin Withdrawals page
- Each field has a dedicated copy icon button with clipboard API integration
- Visual feedback: icon changes to checkmark on successful copy, toast notification shown
- data-testid attributes: `copy-holder-{i}`, `copy-account-{i}`, `copy-ifsc-{i}`, `copy-upi-{i}`

### Blue Button Odds UI + Real P2P Liquidity (2026-04-03) - TESTED
- Replaced old American odds format with **large clickable Blue Buttons** (bg-blue-600, white text, decimal odds)
- Real P2P pool liquidity displayed below each button (from `/api/p2p/pool/{match_id}` — no fake data)
- Green dot = underdog (higher odds), Red dot = favorite (lower odds)
- Pool data mapped correctly by team name (handles first_team/second_team vs home_team/away_team mismatch)
- Bet form opens on button click, quick stake buttons, bet placement verified
- E2E tested: 12/12 features passed (iteration_25)

## Upcoming Tasks
1. **(P2)** Admin Manual Match Entry UI (form to hit `/api/admin/cricket/seed`)
2. **(P2)** Cashout Functionality for live bets
3. **(P3)** Fix WebSocket connection warning (console: WebSocket closed before established)

## Future/Backlog
- User support ticket system
- Code refactor: Break server.py (~3400 lines) into /routes, /models, /services

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores - Key in .env
- CricketData API (Paid) - Match data + live scores - Key in .env, quota 2000/day
- MongoDB Atlas - Cloud database
