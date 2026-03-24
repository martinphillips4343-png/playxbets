# PlayXBets - Sports Betting Platform PRD

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring:
- A betting exchange inspired by icebook9.com with Back/Lay odds
- Public homepage with hero section and betting markets
- User authentication with login/signup modal
- Admin panel with full functionality
- All dates/times in Indian Standard Time (IST)
- **Cricket Ball-By-Ball Micro Betting**
- **Advanced PlayXbets Exchange UI** with multiple market types

## Latest Updates (March 24, 2026)

### P0 UI Redesign Complete ✅
Completely overhauled the Cricket Exchange (`/exchange`) and Football Live (`/football-live`) pages to match icebook9.com style:
- **Table-based layout** replacing card-based design
- **Back odds**: Blue (#72BBEF) with 3 columns per selection
- **Lay odds**: Pink (#FAA9BA) with 3 columns per selection
- **Stacked odds/stake** display (odds on top, stake below)
- **Fully responsive mobile design** with bottom navigation bar
- **Collapsible market sections** with expand/collapse headers
- **Mobile bet slip modal** with slide-up animation

### Previous Updates (March 19, 2026)
1. ✅ **Football matches showing on homepage** - Fixed date filtering logic and draw odds extraction from The Odds API
2. ✅ **Header consistency** - PublicHeader now has consistent navigation ("Home", "Cricket" 🔴, "Soccer" 🟢) matching exchange pages
3. ✅ **Session Markets structure** - Dynamic generation based on T20 (5,10,15,20) vs ODI (5,10...50) with mandatory "First 5 Overs", Powerplay highlighting, and proper wicket/boundary options

## User Personas
1. **Bettors** - Regular users who browse matches and place bets
2. **Admin** - Platform administrator managing users, games, and outcomes
3. **Cricket Micro Bettors** - Users who want fast-paced ball-by-ball betting

## Core Requirements
1. Public homepage with hero section above betting exchange
2. Back (blue) and Lay (pink) odds display for Cricket and Football
3. Modal-based authentication when user tries to place bet
4. User dashboard with wallet info and "BET NOW" button
5. Admin panel with all modules functional
6. Consistent text visibility across all pages (dark backgrounds with light text)
7. **Cricket Ball-By-Ball Micro Betting with 5-second windows**
8. **icebook9-style dense table UI** (NEW - March 24, 2026)

## Tech Stack
- **Frontend**: React, React Router, Tailwind CSS, Shadcn UI, Lucide React
- **Backend**: FastAPI, Pydantic, Motor (async MongoDB)
- **Database**: MongoDB
- **Authentication**: JWT-based with admin/user roles
- **External APIs**: 
  - The Odds API for sports data
  - CricketData API for ball-by-ball data (DEMO MODE available)
- **Real-time**: WebSocket for micro betting updates

## What's Been Implemented ✅

### Phase 1-6: Core Infrastructure, Homepage, User Features, Admin Panel, Text Fixes, Cricket Micro Betting
- All completed as per previous sessions

### Phase 7: icebook9-Style UI Redesign (Completed - March 24, 2026) ✨ NEW
- [x] **Cricket Exchange (`/exchange`)** - Complete redesign
  - Dense table layout with 3 Back + 3 Lay columns
  - Back (#72BBEF blue) and Lay (#FAA9BA pink) color scheme
  - Stacked odds (large) over stake (small) in each cell
  - Collapsible sections: Match Odds, Bookmaker, Ball-by-Ball, Session Markets, Extra Markets
  - Format toggle (T20/ODI) with dynamic session markets
  - Live score display with current over balls
  - Ball timer countdown with betting status indicator
  
- [x] **Football Live (`/football-live`)** - Complete redesign
  - Match selector cards at top for multiple live matches
  - Dense table layout matching cricket page
  - Markets: Match Odds (3-way), Over/Under Goals, Next Goal, Correct Score
  - Same Back/Lay color scheme and layout
  
- [x] **Mobile Responsiveness**
  - Bottom navigation bar (Home, Cricket, Bet Slip, Soccer)
  - Mobile bet slip modal with slide-up animation
  - Responsive table scrolling on small screens
  - Touch-optimized odds buttons with active:scale-95

## Test Status
- Backend: 100% (all tests passed)
- Frontend: 100% (all UI flows working)
- Cricket Exchange UI: 100% (verified via testing agent)
- Football Live UI: 100% (verified via testing agent)
- Mobile Responsiveness: 100% (verified on 390x844 viewport)
- Last tested: March 24, 2026

## Credentials
- Admin: `admin / 123456`
- User: `user / 123456`
- Demo Match ID: `ea479cff-ddbe-48e0-9e4a-528f61a8a175`

## API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me

### User
- GET /api/matches
- POST /api/bets
- GET /api/bets/history
- GET /api/wallet
- POST /api/withdrawals
- GET /api/withdrawals/my
- POST /api/tickets
- GET /api/tickets/my
- GET /api/transactions/my

### Admin
- GET /api/admin/dashboard
- GET /api/admin/users
- GET /api/admin/bets
- POST /api/admin/recharge
- GET /api/admin/withdrawals
- PUT /api/admin/withdrawals/{id}
- GET /api/admin/tickets
- PUT /api/admin/tickets/{id}
- PUT /api/admin/matches/{id}/outcome
- POST /api/admin/cron/run

### Cricket Micro Betting
- GET /api/cricket-micro/odds
- POST /api/cricket-micro/demo/start
- POST /api/cricket-micro/demo/stop
- GET /api/cricket-micro/demo/status
- GET /api/cricket-micro/markets/active
- GET /api/cricket-micro/markets/{market_id}
- GET /api/cricket-micro/markets/match/{match_id}
- POST /api/cricket-micro/bets
- GET /api/cricket-micro/bets/history/{user_id}

### WebSocket
- WS /ws/cricket-micro - Real-time micro betting updates
- WS /ws/cricket-micro/{match_id} - Match-specific updates

## Prioritized Backlog

### P0 (Critical) - Completed ✅
- [x] Hero section on homepage
- [x] Text visibility fixes
- [x] Cricket Ball-By-Ball Micro Betting
- [x] icebook9-style UI Redesign (Cricket + Football)

### P1 (High Priority)
- [ ] Connect "Place Bet" to backend endpoint (persist bets, update wallet)
- [ ] Real CricketData API integration (currently using DEMO mode)
- [ ] Real-time odds updates via WebSocket for regular betting
- [ ] Live match score integration from external API

### P2 (Medium Priority)
- [ ] Add ICEBOOK-style features (Fall of Wicket, Partnership Runs as collapsible cards)
- [ ] Enhanced admin deposit page (user search dropdown with autocomplete)
- [ ] User profile management
- [ ] Email notifications for bets/outcomes

### P3 (Future)
- [ ] Mobile app (React Native)
- [ ] Multiple payment gateways
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] User withdrawal request system
- [ ] Support ticket system

## Known Limitations
- Match data relies on The Odds API (may be rate limited)
- CricketData API using DEMO mode (real API requires valid key)
- **Bet placement is simulated** - only updates frontend state (P1 priority to fix)
- WhatsApp recharge is conceptual (redirect only)
- No real payment integration yet

## Files Structure
```
/app/
├── backend/
│   ├── server.py                    # Main FastAPI app
│   ├── cricket_micro_betting.py     # Micro betting module
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── pages/
│   │   │   ├── PlayXbetsExchange.js  # NEW: icebook9-style Cricket Exchange
│   │   │   ├── FootballLive.js       # NEW: icebook9-style Football Exchange
│   │   │   ├── CricketMicroBetting.js
│   │   │   ├── PublicHomepage.js
│   │   │   ├── admin/
│   │   │   └── user/
│   │   ├── components/
│   │   │   └── PublicHeader.js
│   │   └── utils/
│   └── package.json
├── memory/
│   └── PRD.md
└── test_reports/
    └── iteration_3.json              # Latest test results
```

## Design Guidelines (icebook9-style)
- **Back Color**: #72BBEF (light blue)
- **Lay Color**: #FAA9BA (light pink)
- **Background**: #0D1117 (dark navy)
- **Card Background**: #161B22
- **Header Background**: #2C3E50
- **Text**: White on dark, Dark on light (odds cells)
- **Mobile Breakpoint**: lg: (1024px) for bet slip sidebar
- **Table Layout**: 3 Back + 3 Lay columns per market
- **Odds Cell**: Stacked (odds on top, stake below)

## Environment Variables
```
# Backend (.env)
MONGO_URL="mongodb://localhost:27017"
DB_NAME="playxbets_db"
CORS_ORIGINS="*"
ODDS_API_KEY="..."
SECRET_KEY="..."
CRICKETDATA_API_KEY="a185dd9f-67a3-47cf-8ab7-a1294b716031"
DEMO_CRICKET_MATCH_ID="ea479cff-ddbe-48e0-9e4a-528f61a8a175"
```
