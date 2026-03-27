# PlayXBets - Product Requirements Document

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring a dense, tabular betting exchange UI. The platform integrates real-time cricket matches (CricketData API) and odds (The Odds API).

## Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Real-time**: WebSockets (FastAPI)
- **APIs**: CricketData API, The Odds API (Paid)

## Core Features Implemented

### Authentication & Users
- JWT-based auth (admin/user roles)
- Admin: admin/123456, User: user/123456

### Match Data
- CricketData API integration for live matches
- The Odds API (paid key) for real-time odds
- WebSocket real-time updates
- Backend polling (20s live, 60s scheduled)
- Pydantic field serializers for UTC timezone

### Betting Exchange UI (Updated 2026-03-27)
- **Back/Lay Colors**: Back = Blue (#1a56db), Lay = Dark Red (#991b1b)
- **Pre-match markets**: ALL market sections visible for scheduled matches (not just live)
- **Market Sections**: Match Odds, Session Markets, Over Runs, Fall of Wickets, Team Total Runs, Partnership Markets, Special Markets, Tied Match
- **Bet Slip**: Right sidebar with selection management, stake input, profit calculation
- **Homepage**: Back/Lay column headers with correct colors

### Cricket Micro-Betting
- Ball-by-ball betting engine
- Demo mode for testing

### Admin Panel
- Dashboard, Manage Games, Bets Placed, Deposits, Withdrawals, Support Tickets

### User Features
- Betting Exchange, Bet History, Wallet, Withdrawals, Support Tickets

## Completed Work Log
- WebSocket integration (DONE)
- Paid Odds API key upgrade (DONE)
- Live score bug fix (DONE)
- Real-time sync frequency increase (DONE)
- Dynamic odds merging (DONE)
- Pydantic model fix (DONE)
- Timezone fix with field_serializer (DONE)
- Cache clearing (DONE)
- **2026-03-27: Back/Lay color update** - Blue/Dark Red (DONE, TESTED)
- **2026-03-27: Pre-match market visibility** - All sections visible for scheduled matches (DONE, TESTED)

## Upcoming Tasks (P1-P2)
1. (P1) Admin Manual Match Entry UI - Frontend form for /api/admin/cricket/seed
2. (P2) Cashout Functionality - Backend logic for live bet cashout
3. (P2) Admin Bet Settlement Panel - Declare match outcomes & auto-settle bets
4. (P2) Admin API Quota Dashboard - CricketData/Odds API usage stats

## Future/Backlog
- User withdrawal request system
- User support ticket system
- Code Architecture Refactor: Break server.py (~1870 lines) into modular routers

## Key Files
- `/app/backend/server.py` - Main backend (needs refactoring)
- `/app/backend/cricket_data_service.py` - Cricket API service
- `/app/backend/cricket_micro_betting.py` - Micro betting engine
- `/app/frontend/src/pages/MatchPage.js` - Match betting page
- `/app/frontend/src/pages/PublicHomepage.js` - Homepage
- `/app/frontend/src/components/TiedMatchMarket.js` - Tied match component

## 3rd Party Integrations
- The Odds API (Paid key in backend/.env)
- CricketData API (Key in backend/.env)
