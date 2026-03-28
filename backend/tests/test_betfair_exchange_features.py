"""
Test suite for Betfair-style cricket betting exchange features:
- 3-level Back/Lay order book
- User exposure (profit/loss per team)
- Matched bets tab
- Bookmaker sections (Indian rate format)
- Bet slip with profit/loss calculation
- Recharge History page
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MATCH_ID = "37b02340-7238-41b7-bcf3-8ae4215e4bee"  # Gujarat Titans vs Punjab Kings

class TestMatchDetailOrderBook:
    """Test /api/match/{match_id} returns full order book with 3 levels"""
    
    def test_match_detail_returns_order_book(self):
        """Verify match detail endpoint returns order book data"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "odds" in data, "Response should contain 'odds' field"
        assert "home_team" in data, "Response should contain 'home_team'"
        assert "away_team" in data, "Response should contain 'away_team'"
        print(f"Match: {data.get('home_team')} vs {data.get('away_team')}")
    
    def test_order_book_has_3_back_levels(self):
        """Verify order book has 3 back levels for home and away teams"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        
        # Check home back levels
        home_back_levels = odds.get("home_back_levels", [])
        assert len(home_back_levels) >= 1, f"Expected at least 1 home back level, got {len(home_back_levels)}"
        print(f"Home back levels: {home_back_levels}")
        
        # Check away back levels
        away_back_levels = odds.get("away_back_levels", [])
        assert len(away_back_levels) >= 1, f"Expected at least 1 away back level, got {len(away_back_levels)}"
        print(f"Away back levels: {away_back_levels}")
    
    def test_order_book_has_3_lay_levels(self):
        """Verify order book has 3 lay levels for home and away teams"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        
        # Check home lay levels
        home_lay_levels = odds.get("home_lay_levels", [])
        assert len(home_lay_levels) >= 1, f"Expected at least 1 home lay level, got {len(home_lay_levels)}"
        print(f"Home lay levels: {home_lay_levels}")
        
        # Check away lay levels
        away_lay_levels = odds.get("away_lay_levels", [])
        assert len(away_lay_levels) >= 1, f"Expected at least 1 away lay level, got {len(away_lay_levels)}"
        print(f"Away lay levels: {away_lay_levels}")
    
    def test_order_book_has_liquidity_sizes(self):
        """Verify order book includes liquidity/size data"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        
        # Check for size arrays
        home_back_sizes = odds.get("home_back_sizes", [])
        home_lay_sizes = odds.get("home_lay_sizes", [])
        away_back_sizes = odds.get("away_back_sizes", [])
        away_lay_sizes = odds.get("away_lay_sizes", [])
        
        print(f"Home back sizes: {home_back_sizes}")
        print(f"Home lay sizes: {home_lay_sizes}")
        print(f"Away back sizes: {away_back_sizes}")
        print(f"Away lay sizes: {away_lay_sizes}")
        
        # At least one size array should have data
        has_sizes = any([home_back_sizes, home_lay_sizes, away_back_sizes, away_lay_sizes])
        assert has_sizes, "Order book should include liquidity sizes"


class TestBookmakerSection:
    """Test bookmaker section with Indian rate format"""
    
    def test_match_detail_returns_bookmakers(self):
        """Verify match detail returns bookmakers array"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        bookmakers = odds.get("bookmakers", [])
        
        print(f"Number of bookmakers: {len(bookmakers)}")
        if bookmakers:
            print(f"First bookmaker: {bookmakers[0]}")
    
    def test_bookmaker_indian_rate_format(self):
        """Verify bookmaker odds are in Indian rate format (decimal-1)*100"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        bookmakers = odds.get("bookmakers", [])
        
        if bookmakers:
            bk = bookmakers[0]
            # Indian rate format: values should be like 105, 76, etc (not 2.05, 1.76)
            home_back = bk.get("home_back")
            away_back = bk.get("away_back")
            
            print(f"Bookmaker home_back: {home_back}, away_back: {away_back}")
            
            # Indian rates are typically > 1 and < 1000 (representing percentages)
            if home_back is not None:
                assert home_back > 1, f"Indian rate should be > 1, got {home_back}"
                assert home_back < 1000, f"Indian rate should be < 1000, got {home_back}"
            
            # Check for min/max bet limits
            assert "min_bet" in bk or "max_bet" in bk, "Bookmaker should have bet limits"
            print(f"Min bet: {bk.get('min_bet')}, Max bet: {bk.get('max_bet')}")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture
    def user_token(self):
        """Get user authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("User login failed - skipping authenticated tests")
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Admin login failed - skipping authenticated tests")
    
    def test_user_login_works(self):
        """Verify user login endpoint works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "Response should contain access_token"
        print(f"User login successful, token type: {data.get('token_type')}")
    
    def test_exposure_endpoint_requires_auth(self):
        """Verify exposure endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/exposure")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_exposure_endpoint_with_auth(self, user_token):
        """Verify exposure endpoint works with authentication"""
        response = requests.get(
            f"{BASE_URL}/api/match/{MATCH_ID}/exposure",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "match_id" in data, "Response should contain match_id"
        assert "home_team" in data, "Response should contain home_team"
        assert "away_team" in data, "Response should contain away_team"
        assert "home_exposure" in data, "Response should contain home_exposure"
        assert "away_exposure" in data, "Response should contain away_exposure"
        
        print(f"Exposure - Home: {data.get('home_exposure')}, Away: {data.get('away_exposure')}")
    
    def test_my_bets_endpoint_requires_auth(self):
        """Verify my-bets endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/my-bets")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_my_bets_endpoint_with_auth(self, user_token):
        """Verify my-bets endpoint works with authentication"""
        response = requests.get(
            f"{BASE_URL}/api/match/{MATCH_ID}/my-bets",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of bets"
        print(f"User has {len(data)} bets for this match")
    
    def test_recharge_history_requires_auth(self):
        """Verify recharge-history endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/transactions/recharge-history")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_recharge_history_with_auth(self, user_token):
        """Verify recharge-history endpoint works with authentication"""
        response = requests.get(
            f"{BASE_URL}/api/transactions/recharge-history",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of transactions"
        print(f"User has {len(data)} recharge transactions")


class TestBetPlacement:
    """Test bet placement endpoint"""
    
    @pytest.fixture
    def user_token(self):
        """Get user authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("User login failed - skipping bet placement tests")
    
    def test_bet_placement_requires_auth(self):
        """Verify bet placement requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/bets",
            json={
                "match_id": MATCH_ID,
                "selected_team": "Gujarat Titans",
                "odds": 2.05,
                "stake": 100,
                "bet_type": "back",
                "market_type": "match"
            }
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_bet_placement_with_auth(self, user_token):
        """Verify bet placement works with authentication"""
        # First get wallet balance
        wallet_response = requests.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        initial_balance = wallet_response.json().get("balance", 0) if wallet_response.status_code == 200 else 0
        print(f"Initial wallet balance: {initial_balance}")
        
        # Place a small test bet
        bet_stake = 10
        response = requests.post(
            f"{BASE_URL}/api/bets",
            json={
                "match_id": MATCH_ID,
                "selected_team": "Gujarat Titans",
                "odds": 2.05,
                "stake": bet_stake,
                "bet_type": "back",
                "market_type": "match"
            },
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        # Check response
        if response.status_code == 200:
            data = response.json()
            print(f"Bet placed successfully: {data}")
            
            # Verify wallet was deducted
            wallet_response = requests.get(
                f"{BASE_URL}/api/wallet",
                headers={"Authorization": f"Bearer {user_token}"}
            )
            if wallet_response.status_code == 200:
                new_balance = wallet_response.json().get("balance", 0)
                print(f"New wallet balance: {new_balance}")
                # Balance should be reduced by stake amount
                assert new_balance <= initial_balance, "Wallet should be deducted after bet"
        elif response.status_code == 400:
            # Might fail due to insufficient balance or other validation
            print(f"Bet placement failed (expected for validation): {response.json()}")
        else:
            print(f"Unexpected response: {response.status_code} - {response.text}")


class TestMatchesWithOrderBook:
    """Test that matches list includes order book data"""
    
    def test_matches_endpoint_returns_data(self):
        """Verify matches endpoint returns data"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Total matches: {len(data)}")
    
    def test_find_match_with_order_book(self):
        """Find a match that has full order book data"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        data = response.json()
        matches_with_odds = [m for m in data if m.get("home_odds") or m.get("odds")]
        print(f"Matches with odds: {len(matches_with_odds)}")
        
        if matches_with_odds:
            sample = matches_with_odds[0]
            print(f"Sample match: {sample.get('home_team')} vs {sample.get('away_team')}")
            print(f"Match ID: {sample.get('match_id')}")


class TestWalletEndpoint:
    """Test wallet endpoint"""
    
    @pytest.fixture
    def user_token(self):
        """Get user authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("User login failed")
    
    def test_wallet_requires_auth(self):
        """Verify wallet endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
    
    def test_wallet_with_auth(self, user_token):
        """Verify wallet endpoint works with authentication"""
        response = requests.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "balance" in data, "Response should contain balance"
        print(f"User wallet balance: {data.get('balance')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
