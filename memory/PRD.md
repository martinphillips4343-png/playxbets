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

## Latest Updates (March 26, 2026)

### Phase 13: Real-Time Match System (Completed - March 26, 2026)
Fixed live match system to be real-time and accurate:

1. **Correct Match Status Handling**:
   - Uses `status`, `matchStarted`, `matchEnded` from CricketData API
   - Live: `matchStarted=true AND matchEnded=false`
   - Completed: `matchEnded=true OR status in [completed, finished, ended]`

2. **Auto-Refresh Polling**:
   - Frontend: 15 seconds when live matches exist, 30 seconds otherwise
   - Backend: Every 1 minute for live odds, every 5 minutes for cricket data
   - Shows "Updated" timestamp and green "Live" indicator

3. **Auto-Cleanup Logic**:
   - Removes finished matches from live list automatically
   - Marks stale "live" matches (>30 min) as completed
   - Filters out matches with matchEnded=true flag

4. **API Rate Limit Handling**:
   - Detects 429 responses and enters cooldown (60 seconds)
   - Shows "Live data temporarily unavailable" message
   - Falls back to cached data during rate limiting
   - Smart quota management (100 requests/day limit)

5. **New API Endpoints**:
   - `GET /api/matches/status` - Lightweight status check
   - `GET /api/matches/live` - Live matches only

### Phase 12: Bug Fixes & Improvements (Completed - March 26, 2026)
1. **Match Odds Layout Fix**: Now shows only 1 Back + 1 Lay column (best odds) in Match Odds section
   - Bookmaker section still shows 3+3 columns (unchanged)
   - Back/Lay headers properly centered and aligned
   - Removed yellow highlighting that was causing misalignment

2. **Admin & User Dashboard Responsive**: Full mobile responsive design
   - Added hamburger menu for mobile navigation
   - Collapsible sidebar with smooth slide animation
   - 2-column grid layout on mobile for stat cards
   - Added explicit `/admin/dashboard` and `/user/dashboard` routes

3. **Odds API Live Polling**: Dynamic polling based on live matches
   - Every 2 minutes when live matches exist
   - Daily at Indian midnight for full refresh
   - Fixed async event loop issues with proper main loop reference

### Phase 11: Dedicated Match Page (Completed - March 26, 2026)
Replaced the modal dialog with a full dedicated match page at `/match/{match_id}`:
- **Navigation**: Click any match row → navigates to `/match/{match_id}` 
- **Breadcrumb**: Home > Cricket/Football > Match Name
- **Match Header**: League, Teams, Status (LIVE/SCHEDULED), Date/Time, Format badge, Feature badges (TV, F, BM)
- **Conditional UI**:
  - **Upcoming**: "Match has not started yet" message + basic Match Odds only
  - **Live Cricket**: Full 8-section betting interface (Match Odds, Bookmaker, Session Markets, Over Runs, Fall of Wickets, Team Total, Partnership, Special Markets)
  - **Live Football**: 3-way betting with Draw option
- **Bet Slip**: Desktop sidebar (sticky) + Mobile bottom modal
- **Auto-refresh**: Odds update every 2-3 seconds for live matches with "Updated" timestamp
- **Responsive**: Mobile-first with bottom nav bar (Home, Bet Slip)

### Previous Updates (March 24, 2026)

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

### Phase 7: icebook9-Style UI Redesign (Completed - March 24, 2026)
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

### Phase 8: Backend Bet Integration & WhatsApp Recharge (Completed - March 24, 2026)
- [x] **Bet Placement Connected to Backend**
  - Extended BetCreate/Bet models with bet_type (back/lay) and market_type
  - Frontend placeBet() now calls POST /api/bets
  - Wallet balance deducted, transactions created, bets persisted to MongoDB
  
- [x] **WhatsApp Recharge Feature**
  - Floating WhatsApp button only visible when logged in
  - Pre-filled message: "Hello, I am [USERNAME]. Recharge ₹[AMOUNT]"
  - Admin WhatsApp: 8778156678
  - User Dashboard recharge modal with preset amounts (₹100, ₹500, ₹1,000, ₹2,000, ₹5,000)
  - Custom amount input with minimum ₹100 validation
  - Sidebar "Deposit via WhatsApp" quick action

### Phase 9: Cricket Module Complete Upgrade (Completed - March 25, 2026)
- [x] **All 10 Cricket Market Sections**
  1. MATCH_ODDS - Back/Lay (3 columns each)
  2. Bookmaker - Fixed odds, high limits (Min:100 Max:5L)
  3. Session Markets - 6/10/15/20 over runs with format "X over runs TEAM(Team1 vs Team2)adv"
  4. Over Run Markets - Match 1st Over, Powerplay Runs
  5. Fall of Wickets - Fall of 1st wkt, 1st 2 wkt Runs
  6. Next Over Runs - Total runs in next over
  7. Team Total Runs - Over/Under markets
  8. Partnership Markets - Current partnership Yes/No
  9. Special Markets - Batsman 50/100 Yes/No

- [x] **Cricket Engine Features**
  - Auto-suspend on ball delivery/wicket/boundary (3 sec)
  - "SUSPENDED" status and "BALL IN PLAY" message
  - Ball timer countdown (11 second cycle)
  - Odds movement based on runs/wickets
  - Cashout buttons (visual only)

- [x] **CricketData API Integration**
  - Quota management (100 requests/day)
  - In-memory caching (10-15 min TTL)
  - Smart scheduler (30 min polling)
  - Auto quota reset at Indian midnight

### Phase 10: Match Sorting & Detail Panel (Completed - March 25, 2026)
- [x] **Match Sorting (Cricket + Football)**
  - All matches sorted by date/time ascending (earliest first)
  - Live matches appear at top
  - Consistent across all match listings

- [x] **Match Detail Modal** *(Replaced by Phase 11)*
  - Replaced by dedicated `/match/{match_id}` page

- [x] **Backend Endpoint**
  - GET /api/match/{match_id} for detailed match data
  - Reuses cached CricketData API responses

### Phase 11: Dedicated Match Page (Completed - March 26, 2026)
- [x] **New Route `/match/{match_id}`**
  - Public route accessible without login
  - Full match details with all betting markets
  - Replaces modal-based approach for better UX

- [x] **Match Page Components**
  - MatchPage.js (~900 lines) with full market rendering
  - BackOddsCell, LayOddsCell, SessionRow components
  - MarketHeader with collapsible sections
  - Mobile bet slip modal with slide-up animation

- [x] **Conditional Rendering**
  - Upcoming matches: Basic odds + "More markets when live" message
  - Live cricket: 8 market sections (Match Odds, Bookmaker, Session, Over Runs, Fall of Wickets, Team Total, Partnership, Special)
  - Live football: 3-way betting with Draw option

- [x] **Auto-refresh System**
  - Live: 3-second refresh interval with odds simulation
  - Upcoming: 30-second refresh interval
  - Visual "Updated" timestamp indicator

## Test Status
- Backend: 100% (all tests passed)
- Frontend: 100% (all UI flows working)
- Cricket Exchange UI: 100% (verified via testing agent)
- Football Live UI: 100% (verified via testing agent)
- Match Page: 100% (verified via testing agent - iteration 7)
- Mobile Responsiveness: 100% (verified on 390x844 viewport)
- Last tested: March 26, 2026

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
- [x] Connect "Place Bet" to backend endpoint (persist bets, update wallet) - March 24, 2026

### P1 (High Priority)
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
- WhatsApp recharge is conceptual (redirect only)
- No real payment integration yet
- Odds are simulated (randomly fluctuate) - real-time WebSocket odds integration pending

## Files Structure
```
/app/
├── backend/
│   ├── server.py                    # Main FastAPI app
│   ├── cricket_data_service.py      # CricketData API service
│   ├── cricket_micro_betting.py     # Micro betting module
│   ├── requirements.txt
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.js                   # Routes including /match/:matchId
│   │   ├── pages/
│   │   │   ├── MatchPage.js         # NEW: Dedicated match betting page
│   │   │   ├── PlayXbetsExchange.js # icebook9-style Cricket Exchange
│   │   │   ├── FootballLive.js      # icebook9-style Football Exchange
│   │   │   ├── CricketMicroBetting.js
│   │   │   ├── PublicHomepage.js    # Homepage (navigates to MatchPage)
│   │   │   ├── admin/
│   │   │   └── user/
│   │   ├── components/
│   │   │   └── PublicHeader.js
│   │   └── utils/
│   └── package.json
├── memory/
│   └── PRD.md
└── test_reports/
    ├── iteration_6.json
    └── iteration_7.json             # Latest test results (Match Page)
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
