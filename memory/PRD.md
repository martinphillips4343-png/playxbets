# PlayXBets - Sports Betting Platform PRD

## Original Problem Statement
Build a premium, dark-themed sports betting application named "PlayXBets" featuring:
- A betting exchange inspired by icebook9.com with Back/Lay odds
- Public homepage with hero section and betting markets
- User authentication with login/signup modal
- Admin panel with full functionality
- All dates/times in Indian Standard Time (IST)

## User Personas
1. **Bettors** - Regular users who browse matches and place bets
2. **Admin** - Platform administrator managing users, games, and outcomes

## Core Requirements
1. Public homepage with hero section above betting exchange
2. Back (blue) and Lay (pink) odds display for Cricket and Football
3. Modal-based authentication when user tries to place bet
4. User dashboard with wallet info and "BET NOW" button
5. Admin panel with all modules functional
6. Consistent text visibility across all pages (dark backgrounds with light text)

## Tech Stack
- **Frontend**: React, React Router, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI, Pydantic, Motor (async MongoDB)
- **Database**: MongoDB
- **Authentication**: JWT-based with admin/user roles
- **External API**: The Odds API for sports data

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

## Test Status
- Backend: 100% (23/23 tests passed)
- Frontend: 100% (all UI flows working)
- Last tested: December 2025

## Credentials
- Admin: `admin / 123456`
- User: `user / 123456`

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

## Prioritized Backlog

### P0 (Critical) - Completed ✅
- [x] Hero section on homepage
- [x] Text visibility fixes

### P1 (High Priority)
- [ ] Ball by ball (fancy) betting markets
- [ ] Real-time odds updates via WebSocket
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
- WhatsApp recharge is conceptual (redirect only)
- No real payment integration yet

## Files Structure
```
/app/
├── backend/
│   ├── server.py          # All API routes
│   ├── requirements.txt
│   └── tests/test_api.py  # Backend tests
└── frontend/
    ├── src/
    │   ├── App.js         # Main router
    │   ├── pages/         # All pages
    │   │   ├── admin/     # Admin pages
    │   │   └── user/      # User pages
    │   ├── components/    # Shared components
    │   └── utils/         # Helper functions
    └── package.json
```
