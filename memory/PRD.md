# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI. The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API).

## Tech Stack
- **Frontend**: React 18.2.0 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB Atlas
- **Real-time**: WebSockets (FastAPI)
- **APIs**: CricketData API (Paid), The Odds API (Paid)

## Core Features Implemented

### Authentication & Users
- JWT-based auth (admin/user roles)
- Admin: admin/123456, User: user/123456

### Match Data
- CricketData API integration for live matches + scores
- The Odds API (paid key) for real-time odds
- WebSocket real-time updates
- Backend polling (20s live, 60s scheduled)
- Score merging from cricScore endpoint (team name matching)
- Auto-mark matches as "live" when commence_time passes

### Betting Exchange UI
- **Back = Blue (#1a56db), Lay = Dark Red (#991b1b)**
- **Min: 100 | Max: 2,00,000** label on Match Odds
- **BALL RUNNING** indicator (3s cycle) - session markets show BALL RUNNING during ball delivery
- **SUSPENDED** indicator (2s cycle) - Match Odds cells show SUSPENDED with red pulse animation
- **Odds flash animation** - green flash for odds up, red flash for odds down (CSS keyframes)
- **Dynamic session markets** - values update based on live score/run rate data
- **Pre-match markets**: ALL 8 market sections visible for scheduled matches
- **Live Score section** - shows actual score from CricketData API when available
- **Bet Slip**: Right sidebar with selection management, stake input, profit calculation

### Market Sections (All Cricket Matches)
1. Match Odds (Back/Lay)
2. Session Markets (No/Yes - 6, 10, 15, 20 over runs)
3. Over Runs Markets
4. Fall of Wickets
5. Team Total Runs
6. Partnership Markets
7. Special Markets
8. Tied Match (with Cashout)

### Live Match Features
- Ball Running → Suspended → Active cycle (8s → 3s → 2s)
- Live score polling every 10 seconds
- Odds flash animations on value changes
- WebSocket connection status indicator

## Completed Work Log
- WebSocket integration (DONE)
- Paid Odds API + CricketData API key upgrade (DONE)
- Dynamic odds merging from Odds API (DONE)
- Timezone fix with field_serializer (DONE)
- Back/Lay color update - Blue/Dark Red (DONE, TESTED)
- Pre-match market visibility (DONE, TESTED)
- MongoDB Atlas migration (DONE)
- Admin/User seeding on live DB (DONE)
- date-fns downgrade 4.x→2.30.0 (DONE)
- React downgrade 19→18.2.0 (DONE)
- **2026-03-27: BALL RUNNING / SUSPENDED cycle** (DONE, TESTED 100%)
- **2026-03-27: Odds flash animations** (DONE, TESTED)
- **2026-03-27: Dynamic session markets** based on run rate (DONE, TESTED)
- **2026-03-27: Live score polling + cricScore merging** (DONE, TESTED)
- **2026-03-27: Min/Max bet label** (DONE, TESTED)

## Upcoming Tasks (P1-P2)
1. (P1) Admin Manual Match Entry UI - Frontend form for /api/admin/cricket/seed
2. (P2) Cashout Functionality - Backend logic for live bet cashout
3. (P2) Admin Bet Settlement Panel - Declare match outcomes & auto-settle bets
4. (P2) Admin API Quota Dashboard - CricketData/Odds API usage stats

## Future/Backlog
- User withdrawal request system
- User support ticket system
- Code Architecture Refactor: Break server.py (~1970 lines) into modular routers

## Key Files
- `/app/backend/server.py` - Main backend (needs refactoring)
- `/app/backend/cricket_data_service.py` - Cricket API service
- `/app/frontend/src/pages/MatchPage.js` - Match betting page
- `/app/frontend/src/pages/PublicHomepage.js` - Homepage
- `/app/frontend/src/index.css` - Flash animation CSS
- `/app/frontend/src/components/TiedMatchMarket.js` - Tied match component

## 3rd Party Integrations
- The Odds API (Paid key in backend/.env)
- CricketData API (Paid key in backend/.env)
- MongoDB Atlas (Live DB in backend/.env)
