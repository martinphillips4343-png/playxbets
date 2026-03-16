# PlayXBets - Sports Betting Platform PRD

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring:
- A betting exchange inspired by icebook9.com with Back/Lay odds
- Public homepage with hero section and betting markets
- User authentication with login/signup modal
- Admin panel with full functionality
- All dates/times in Indian Standard Time (IST)
- **NEW: Cricket Ball-By-Ball Micro Betting**

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

## Tech Stack
- **Frontend**: React, React Router, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI, Pydantic, Motor (async MongoDB)
- **Database**: MongoDB
- **Authentication**: JWT-based with admin/user roles
- **External APIs**: 
  - The Odds API for sports data
  - CricketData API for ball-by-ball data (DEMO MODE available)
- **Real-time**: WebSocket for micro betting updates

## What's Been Implemented ✅

### Phase 1: Core Infrastructure (Completed)
- [x] FastAPI backend with all endpoints
- [x] MongoDB integration
- [x] JWT authentication
- [x] User registration and login
- [x] React frontend with routing
- [x] Tailwind CSS styling

### Phase 2: Public Homepage (Completed)
- [x] Hero section with "Bet on Your Favorite Sports" headline
- [x] Betting exchange table with Back/Lay odds
- [x] Cricket and Football sport tabs
- [x] Live match indicators
- [x] IST date/time formatting

### Phase 3: User Features (Completed)
- [x] User dashboard with wallet balance
- [x] Bet history page
- [x] Withdrawal request system
- [x] Support ticket system
- [x] "BET NOW" button navigation

### Phase 4: Admin Panel (Completed)
- [x] Dashboard with stats cards
- [x] Manage Bettors page
- [x] Manage Games page
- [x] Bets Placed page (with full table)
- [x] Declare Outcomes page
- [x] Deposits page with user search
- [x] Withdrawals page with approve/reject
- [x] Support Tickets page with reply

### Phase 5: Text Visibility Fix (Completed - Dec 2025)
- [x] Added DashboardHeader to all admin/user pages
- [x] Fixed text colors to text-gray-900 for body text
- [x] Fixed header colors to text-gray-700
- [x] Consistent styling across all tables
- [x] Added empty state messages for all tables

### Phase 6: Cricket Ball-By-Ball Micro Betting (Completed - Mar 2026) ✨ NEW
- [x] **Backend Module**: `/app/backend/cricket_micro_betting.py`
  - CricketData API integration (with DEMO mode)
  - WebSocket real-time streaming
  - Automatic market creation and suspension
  - 5-second betting windows
  - Anti ball-delay betting protection
  - Multi-match parallel processing
  
- [x] **8 Betting Outcomes**:
  - Dot Ball (2.00 odds)
  - 1 Run (2.50 odds)
  - 2 Runs (4.00 odds)
  - 3 Runs (8.00 odds)
  - FOUR (4.50 odds)
  - SIX (8.00 odds)
  - Wicket (12.00 odds)
  - Wide/No Ball (6.00 odds)

- [x] **Market Lifecycle**:
  - Created → Open (5s window) → Suspended → Settled
  
- [x] **Security Features**:
  - Server timestamp validation
  - Betting window enforcement
  - Automatic market suspension
  - Reject bets after window closes

- [x] **Frontend Page**: `/cricket-live`
  - Real-time updates via WebSocket
  - Countdown timer for betting window
  - Colorful outcome buttons
  - Bet slip with stake/potential win
  - Recent ball results display
  - My Recent Bets sidebar

## Test Status
- Backend: 100% (42/42 tests passed)
- Frontend: 100% (all UI flows working)
- Cricket Micro Betting: 100% (19 new tests passed)
- Last tested: March 2026

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

### Cricket Micro Betting (NEW)
- GET /api/cricket-micro/odds - Get default odds for all outcomes
- POST /api/cricket-micro/demo/start - Start demo match simulation
- POST /api/cricket-micro/demo/stop - Stop demo simulation
- GET /api/cricket-micro/demo/status - Get demo status and active market
- GET /api/cricket-micro/markets/active - Get all open/suspended markets
- GET /api/cricket-micro/markets/{market_id} - Get specific market
- GET /api/cricket-micro/markets/match/{match_id} - Get all markets for a match
- POST /api/cricket-micro/bets - Place a micro bet
- GET /api/cricket-micro/bets/history/{user_id} - Get user's micro bet history

### WebSocket
- WS /ws/cricket-micro - Real-time micro betting updates
- WS /ws/cricket-micro/{match_id} - Match-specific updates

## Prioritized Backlog

### P0 (Critical) - Completed ✅
- [x] Hero section on homepage
- [x] Text visibility fixes
- [x] Cricket Ball-By-Ball Micro Betting

### P1 (High Priority)
- [ ] Real CricketData API integration (currently using DEMO mode)
- [ ] Real-time odds updates via WebSocket for regular betting
- [ ] Live match score integration

### P2 (Medium Priority)
- [ ] Enhanced admin deposit page (user search dropdown with autocomplete)
- [ ] User profile management
- [ ] Email notifications for bets/outcomes
- [ ] Betting limits and responsible gambling features

### P3 (Future)
- [ ] Mobile app (React Native)
- [ ] Multiple payment gateways
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

## Known Limitations
- Match data relies on The Odds API (may be rate limited)
- CricketData API using DEMO mode (real API requires valid key)
- WhatsApp recharge is conceptual (redirect only)
- No real payment integration yet

## Files Structure
```
/app/
├── backend/
│   ├── server.py                    # Main FastAPI app
│   ├── cricket_micro_betting.py     # NEW: Micro betting module
│   ├── requirements.txt
│   └── tests/
│       ├── test_api.py
│       └── test_cricket_micro_betting.py  # NEW
└── frontend/
    ├── src/
    │   ├── App.js                   # Main router
    │   ├── pages/
    │   │   ├── CricketMicroBetting.js  # NEW
    │   │   ├── admin/               # Admin pages
    │   │   └── user/                # User pages
    │   ├── components/
    │   │   └── PublicHeader.js      # Updated with Cricket Live link
    │   └── utils/
    └── package.json
```

## Environment Variables
```
# Backend (.env)
MONGO_URL="mongodb://localhost:27017"
DB_NAME="playxbets_db"
CORS_ORIGINS="*"
ODDS_API_KEY="..."
SECRET_KEY="..."
CRICKETDATA_API_KEY="a185dd9f-67a3-47cf-8ab7-a1294b716031"  # NEW
DEMO_CRICKET_MATCH_ID="ea479cff-ddbe-48e0-9e4a-528f61a8a175"  # NEW
```
