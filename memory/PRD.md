# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI (Betfair-style). The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API).

## Tech Stack
- **Frontend**: React 18.2.0 + Tailwind CSS + Shadcn/UI + Lucide React icons
- **Backend**: FastAPI + MongoDB Atlas
- **Real-time**: WebSockets (FastAPI) + APScheduler
- **APIs**: CricketData API (Paid), The Odds API (Paid)

## Completed Features

### Authentication & Users
- JWT-based auth (admin/user roles)
- Admin: admin/123456, User: user/123456

### Homepage
- Cricket-only with Live/Upcoming/Date filters
- Clean match list, responsive mobile card layout
- Real-time WebSocket status indicator

### Betfair-Style Match Betting Page
- **Single Back/Lay**: 1 Back + 1 Lay column per team (clean, no header labels)
- **Bookmaker sections**: Removed completely
- **User Exposure Panel**: Per-team profit/loss from all user bets (green/red)
- **Matched Bets Tab**: ODDS | MATCHED BET tabs, shows Team | Odds | Stake
- **Session/Tied Colors**: Bright red (#dc2626) for No, Bright blue (#2563eb) for Yes
- **Session SUSPENDED**: Completed overs auto-show SUSPENDED
- **Bet Slip**: Click odds -> enter stake -> see profit/loss -> place bet
- **Real-time**: WebSocket + fallback polling, odds flash green/red on change
- **Match Odds Colors**: Back=Blue(#1a56db), Lay=Dark Red(#991b1b)
- **Dynamic States**: BALL RUNNING / SUSPENDED cycle for live matches
- **Backend 10s Polling**: All schedulers (odds, cricket, live check) run every 10 seconds

### Datetime Fix (2026-03-28)
- Added `ensure_utc()` helper to normalize all datetime values (naive/aware/string) to UTC
- Fixed all scheduled→live auto-promotion that was broken by offset-naive vs offset-aware comparison
- Fixed MongoDB queries that compared strings with datetime fields using `$or` pattern
- Fixed CricketData service quota tracking timezone comparison

### Bet Settlement Logic (2026-03-28)
- **Back bets**: Deduct full stake, win when selected team wins, payout = stake × odds
- **Lay bets**: Deduct liability (stake × (odds-1)), win when selected team LOSES, payout = liability + stake
- **Admin Settlement Panel**: `/admin/outcomes` page shows matches with unsettled bets, pending bet counts, total stakes
- **Settlement API**: `PUT /api/admin/matches/{match_id}/outcome?winner=TeamName` settles all pending bets
- **Pending Settlements API**: `GET /api/admin/settlement/pending` shows matches needing settlement

### Odds Merge System
- Reversed match detection (swapped home/away between APIs)
- Fuzzy team name matching (Bangalore/Bengaluru, Rawalpindi/Rawalpindiz)
- Canonical comparison, post-merge duplicate cleanup

### Auto Match Management
- Auto-mark scheduled → live when commence_time passes
- Auto-detect completed matches via: Odds API /scores, time-based (3.5h T20), extreme odds (<1.03), cricScore status
- Minor league filtering (Plunket Shield, Sheffield Shield, Ranji Trophy, etc.)

### User History Pages
- **Betting History**: /user/history
- **Recharge History**: /user/recharges
- **Withdrawal History**: /user/withdrawals

## Upcoming Tasks
1. **(P1)** User/Admin Panel Clean Separation — Distinct dashboards, menus, access control
2. **(P2)** Admin Manual Match Entry UI — Frontend form for `/api/admin/cricket/seed`
3. **(P2)** Cashout Functionality for live bets

## Future/Backlog
- User withdrawal request approval system
- User support ticket system
- Code Refactor: Break server.py (~2550 lines) into modular routers (/routes, /models, /services)

## Key Files
- `/app/backend/server.py` - Main backend (monolithic ~2550 lines)
- `/app/backend/cricket_data_service.py` - Cricket API integration
- `/app/frontend/src/pages/MatchPage.js` - Betfair-style exchange UI
- `/app/frontend/src/pages/PublicHomepage.js` - Homepage
- `/app/frontend/src/pages/admin/DeclareOutcomes.js` - Bet Settlement admin page
- `/app/frontend/src/pages/user/RechargeHistory.js` - Recharge history
- `/app/frontend/src/layouts/AdminLayout.js` - Admin sidebar

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores
- CricketData API (Paid) - Match data + live scores
- MongoDB Atlas - Cloud database
