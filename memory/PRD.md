# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI for cricket. The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API).

## Tech Stack
- **Frontend**: React 18.2.0 + Tailwind CSS + Shadcn/UI + Lucide React icons
- **Backend**: FastAPI + MongoDB Atlas
- **Real-time**: WebSockets (FastAPI)
- **APIs**: CricketData API (Paid), The Odds API (Paid)

## Completed Features

### Authentication & Users
- JWT-based auth (admin/user roles)
- Admin: admin/123456, User: user/123456

### Homepage (Redesigned 2026-03-27)
- Cricket-only (Football tab removed)
- Filter tabs: Cricket | Live Cricket | Upcoming | Select Date
- Clean match list with arrow navigation (no Back/Lay columns)
- Ascending date sort, live matches first
- Real-time WebSocket status indicator
- Responsive mobile card layout

### Match Betting Page
- **Back = Blue (#1a56db), Lay = Dark Red (#991b1b)**
- **Min: 100 Max: 15L** label
- **Green bet totals** below team names (aggregated from DB)
- **BALL RUNNING / SUSPENDED** cycle for live matches
- **Odds flash animations** (green up, red down)
- **Dynamic session markets** based on live score run rate
- **8 market sections**: Match Odds, Session, Over Runs, Fall of Wickets, Team Total, Partnership, Special, Tied Match
- **Bet Slip** panel with selection management

### Auto Match Management
- Auto-mark scheduled -> live when commence_time passes
- Auto-detect completed matches via Odds API + cricScore
- Time-based completion (>5hrs since start)
- Completed matches auto-removed from active list

### Real-time Data
- WebSocket live updates
- Backend polling: 20s live, 60s scheduled
- cricScore endpoint for live score merging
- Score merging by team name matching (cross-API ID handling)

### Bet Totals API
- `/api/match/{id}/bet-totals` - aggregates stakes per team from bets collection

### Odds Merge Fix (2026-03-28)
- Fixed P0 bug: odds were being swapped/mismatched during Odds API -> CricketData merge
- Reversed match detection: correctly identifies when DB teams are in opposite order vs Odds API
- Fuzzy team name matching: handles Bangalore/Bengaluru, Rawalpindi/Rawalpindiz variations
- Canonical name comparison via _canonicalize() method
- Post-merge cleanup: removes Odds-API-created duplicate entries
- All 8 Odds API matches correctly merging into CricketData entries

## Upcoming Tasks
1. **(P1) Bet Settlement Logic** - When match completes, winning bettors get stake x odds
2. **(P1) User/Admin Panel Clean Separation** - Distinct dashboards and menus
3. **(P2) Admin Manual Match Entry UI**
4. **(P2) Cashout Functionality**
5. **(P2) Admin Bet Settlement Panel**

## Future/Backlog
- User withdrawal request system
- User support ticket system
- Code Architecture Refactor: Break server.py (~2200 lines) into modular routers

## Key Files
- `/app/backend/server.py` - Main backend (OddsService class handles odds merge)
- `/app/backend/cricket_data_service.py` - Cricket API service
- `/app/frontend/src/pages/PublicHomepage.js` - Homepage
- `/app/frontend/src/pages/MatchPage.js` - Match betting page
- `/app/frontend/src/index.css` - Flash animation CSS

## 3rd Party Integrations
- The Odds API (Paid key in backend/.env)
- CricketData API (Paid key in backend/.env)
- MongoDB Atlas (Live DB in backend/.env)
