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

### Betfair-Style Match Betting Page (2026-03-28)
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

### Multi-Bookmaker Order Book
- Backend aggregates ALL bookmakers from Odds API (not just first)
- Sorts to build 3-level depth (Back descending, Lay ascending)
- Generates realistic liquidity amounts
- Bookmaker section uses different bookmaker sources for variety

### Auto Match Management
- Auto-mark scheduled → live when commence_time passes
- Auto-detect completed matches via: Odds API /scores, time-based (3.5h T20), extreme odds (<1.03), cricScore status
- Fixed: string datetime parsing, "Not in Odds API" only for Odds-API-created matches

### Odds Merge System
- Reversed match detection (swapped home/away between APIs)
- Fuzzy team name matching (Bangalore/Bengaluru, Rawalpindi/Rawalpindiz)
- Canonical comparison, post-merge duplicate cleanup

### User History Pages
- **Betting History**: /user/history (existing)
- **Recharge History**: /user/recharges (NEW - 2026-03-28)
- **Withdrawal History**: /user/withdrawals (existing)
- All accessible from user sidebar menu

### APIs Added (2026-03-28)
- `GET /api/match/{match_id}/exposure` - User exposure per team
- `GET /api/match/{match_id}/my-bets` - User's matched bets for a match
- `GET /api/transactions/recharge-history` - Deposit/recharge history

## Upcoming Tasks
1. **(P1)** Bet Settlement Logic — winner gets stake × odds on match completion
2. **(P1)** User/Admin Panel Clean Separation
3. **(P2)** Admin Manual Match Entry UI
4. **(P2)** Cashout Functionality
5. **(P2)** Admin Bet Settlement Panel

## Future/Backlog
- User withdrawal request system
- User support ticket system
- Code Refactor: Break server.py (~2400 lines) into modular routers

## Key Files
- `/app/backend/server.py` - Main backend
- `/app/frontend/src/pages/MatchPage.js` - Betfair-style exchange UI
- `/app/frontend/src/pages/PublicHomepage.js` - Homepage
- `/app/frontend/src/pages/user/RechargeHistory.js` - Recharge history
- `/app/frontend/src/layouts/UserLayout.js` - User sidebar

## 3rd Party Integrations
- The Odds API (Paid) - Match odds + scores
- CricketData API (Paid) - Match data + live scores
- MongoDB Atlas - Cloud database
