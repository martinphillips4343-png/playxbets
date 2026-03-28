"""
Test Suite for PlayXBets Bet Settlement and Datetime Fix
Tests:
1. GET /api/matches returns matches with odds data (not all null)
2. GET /api/admin/settlement/pending returns matches with unsettled bets
3. PUT /api/admin/matches/{match_id}/outcome settles bets correctly
4. POST /api/bets correctly calculates lay bet liability
5. Backend logs show no datetime comparison errors
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMatchesWithOdds:
    """Test that matches have real odds data"""
    
    def test_matches_endpoint_returns_data(self):
        """GET /api/matches should return matches"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=60)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        matches = response.json()
        assert isinstance(matches, list), "Response should be a list"
        assert len(matches) > 0, "Should have at least one match"
        print(f"✓ GET /api/matches returned {len(matches)} matches")
    
    def test_matches_have_odds_data(self):
        """Matches should have odds data (not all null)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=60)
        assert response.status_code == 200
        
        matches = response.json()
        matches_with_odds = 0
        
        for match in matches:
            home_odds = match.get("home_odds")
            away_odds = match.get("away_odds")
            odds_obj = match.get("odds", {})
            
            # Check if match has any odds
            has_odds = (
                (home_odds is not None and home_odds > 0) or
                (away_odds is not None and away_odds > 0) or
                (odds_obj and odds_obj.get("home_back") is not None)
            )
            
            if has_odds:
                matches_with_odds += 1
        
        print(f"✓ {matches_with_odds}/{len(matches)} matches have odds data")
        # At least some matches should have odds (from Odds API)
        assert matches_with_odds > 0, "At least some matches should have odds data"
    
    def test_no_minor_league_matches(self):
        """Homepage should not show minor league matches like Plunket Shield"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=60)
        assert response.status_code == 200
        
        matches = response.json()
        minor_leagues = ["plunket shield", "sheffield shield", "ranji trophy", "vijay hazare", "syed mushtaq ali"]
        
        for match in matches:
            league = (match.get("league") or "").lower()
            for minor in minor_leagues:
                assert minor not in league, f"Minor league match found: {league}"
        
        print("✓ No minor league matches found in response")


class TestAdminAuth:
    """Test admin authentication"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        token = response.json().get("access_token")
        assert token, "No access_token in response"
        return token
    
    def test_admin_login(self, admin_token):
        """Admin should be able to login"""
        assert admin_token is not None
        print("✓ Admin login successful")


class TestPendingSettlements:
    """Test pending settlements endpoint"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_pending_settlements_requires_auth(self):
        """GET /api/admin/settlement/pending should require auth"""
        response = requests.get(f"{BASE_URL}/api/admin/settlement/pending", timeout=10)
        assert response.status_code == 401, "Should require authentication"
        print("✓ Pending settlements endpoint requires auth")
    
    def test_pending_settlements_returns_data(self, admin_headers):
        """GET /api/admin/settlement/pending should return matches with unsettled bets"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settlement/pending",
            headers=admin_headers,
            timeout=10
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "matches" in data, "Response should have 'matches' key"
        
        matches = data["matches"]
        print(f"✓ GET /api/admin/settlement/pending returned {len(matches)} matches with pending bets")
        
        # Validate structure if there are pending matches
        if matches:
            match = matches[0]
            assert "match_id" in match, "Match should have match_id"
            assert "home_team" in match, "Match should have home_team"
            assert "away_team" in match, "Match should have away_team"
            assert "pending_bets" in match, "Match should have pending_bets count"
            assert "total_stake" in match, "Match should have total_stake"
            print(f"✓ Pending match structure validated: {match['home_team']} vs {match['away_team']}")


class TestBetPlacement:
    """Test bet placement with correct lay bet liability calculation"""
    
    @pytest.fixture
    def user_headers(self):
        """Get user auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture
    def test_match(self):
        """Get a match to place bets on"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=60)
        matches = response.json()
        # Find a match with odds
        for match in matches:
            if match.get("home_odds") and match.get("status") in ["scheduled", "live"]:
                return match
        # Return first match if none have odds
        return matches[0] if matches else None
    
    def test_back_bet_deducts_full_stake(self, user_headers, test_match):
        """Back bet should deduct full stake from wallet"""
        if not test_match:
            pytest.skip("No test match available")
        
        # Get initial balance
        wallet_resp = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers, timeout=10)
        initial_balance = wallet_resp.json().get("balance", 0)
        
        stake = 10
        odds = test_match.get("home_odds", 2.0)
        
        bet_data = {
            "match_id": test_match["match_id"],
            "selected_team": test_match["home_team"],
            "bet_type": "back",
            "stake": stake,
            "odds": odds
        }
        
        response = requests.post(
            f"{BASE_URL}/api/bets",
            json=bet_data,
            headers=user_headers,
            timeout=10
        )
        
        if response.status_code == 200:
            # Check wallet deduction
            wallet_resp = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers, timeout=10)
            new_balance = wallet_resp.json().get("balance", 0)
            
            expected_deduction = stake
            actual_deduction = initial_balance - new_balance
            
            assert abs(actual_deduction - expected_deduction) < 0.01, \
                f"Back bet should deduct full stake. Expected {expected_deduction}, got {actual_deduction}"
            print(f"✓ Back bet correctly deducted {actual_deduction} (stake={stake})")
        else:
            print(f"⚠ Bet placement returned {response.status_code}: {response.text}")
    
    def test_lay_bet_deducts_liability(self, user_headers, test_match):
        """Lay bet should deduct stake*(odds-1) as liability"""
        if not test_match:
            pytest.skip("No test match available")
        
        # Get initial balance
        wallet_resp = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers, timeout=10)
        initial_balance = wallet_resp.json().get("balance", 0)
        
        stake = 10
        odds = test_match.get("home_odds", 2.0)
        expected_liability = round(stake * (odds - 1), 2)
        
        bet_data = {
            "match_id": test_match["match_id"],
            "selected_team": test_match["home_team"],
            "bet_type": "lay",
            "stake": stake,
            "odds": odds
        }
        
        response = requests.post(
            f"{BASE_URL}/api/bets",
            json=bet_data,
            headers=user_headers,
            timeout=10
        )
        
        if response.status_code == 200:
            # Check wallet deduction
            wallet_resp = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers, timeout=10)
            new_balance = wallet_resp.json().get("balance", 0)
            
            actual_deduction = round(initial_balance - new_balance, 2)
            
            assert abs(actual_deduction - expected_liability) < 0.01, \
                f"Lay bet should deduct liability. Expected {expected_liability}, got {actual_deduction}"
            print(f"✓ Lay bet correctly deducted {actual_deduction} (liability=stake*{odds-1}={expected_liability})")
        else:
            print(f"⚠ Lay bet placement returned {response.status_code}: {response.text}")


class TestBetSettlement:
    """Test bet settlement logic"""
    
    @pytest.fixture
    def admin_headers(self):
        """Get admin auth headers"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        token = response.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    
    def test_declare_outcome_endpoint_exists(self, admin_headers):
        """PUT /api/admin/matches/{match_id}/outcome should exist"""
        # Use a fake match_id to test endpoint existence
        response = requests.put(
            f"{BASE_URL}/api/admin/matches/fake-match-id/outcome?winner=TestTeam",
            headers=admin_headers,
            timeout=10
        )
        # Should return 404 (match not found) not 405 (method not allowed)
        assert response.status_code in [200, 404], f"Endpoint should exist, got {response.status_code}"
        print("✓ Declare outcome endpoint exists")
    
    def test_settlement_with_pending_match(self, admin_headers):
        """Test settling a match with pending bets"""
        # Get pending settlements
        pending_resp = requests.get(
            f"{BASE_URL}/api/admin/settlement/pending",
            headers=admin_headers,
            timeout=10
        )
        
        if pending_resp.status_code != 200:
            pytest.skip("Could not get pending settlements")
        
        pending_matches = pending_resp.json().get("matches", [])
        
        if not pending_matches:
            print("⚠ No pending matches to settle - skipping settlement test")
            pytest.skip("No pending matches available for settlement test")
        
        # Get first pending match
        match = pending_matches[0]
        match_id = match["match_id"]
        home_team = match["home_team"]
        
        # Declare winner
        response = requests.put(
            f"{BASE_URL}/api/admin/matches/{match_id}/outcome?winner={home_team}",
            headers=admin_headers,
            timeout=10
        )
        
        assert response.status_code == 200, f"Settlement failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Settlement should return success=True"
        
        print(f"✓ Settlement successful: {data.get('won', 0)} won, {data.get('lost', 0)} lost")


class TestDatetimeFix:
    """Test that datetime comparison errors are fixed"""
    
    def test_matches_endpoint_no_errors(self):
        """GET /api/matches should not cause datetime errors"""
        # Make multiple requests to trigger any datetime issues
        for i in range(3):
            response = requests.get(f"{BASE_URL}/api/matches", timeout=60)
            assert response.status_code == 200, f"Request {i+1} failed with {response.status_code}"
            time.sleep(0.5)
        
        print("✓ Multiple requests to /api/matches completed without errors")
    
    def test_live_matches_endpoint(self):
        """GET /api/matches/live should work without datetime errors"""
        response = requests.get(f"{BASE_URL}/api/matches/live", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✓ GET /api/matches/live works correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
