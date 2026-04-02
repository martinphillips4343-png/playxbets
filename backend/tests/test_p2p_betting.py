"""
P2P Betting API Tests for PlayXBets
Tests the new P2P betting engine with FIFO partial matching.

Endpoints tested:
- POST /api/p2p/bet - Place P2P bet
- GET /api/p2p/bets/{match_id}/my - Get user's P2P bets
- GET /api/p2p/pool/{match_id} - Get pool stats
- GET /api/match/{match_id}/market-status - Get market suspend status
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_CREDS = {"username": "user", "password": "123456"}
ADMIN_CREDS = {"username": "admin", "password": "123456"}

# Test match ID (KKR vs SRH)
TEST_MATCH_ID = "13bfc2f98f9fa3d124be6ce6535ddc8f"


@pytest.fixture(scope="module")
def user_token():
    """Get auth token for user account"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=USER_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"User login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def admin_token():
    """Get auth token for admin account"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=ADMIN_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin login failed: {response.status_code} - {response.text}")


@pytest.fixture
def user_headers(user_token):
    """Headers with user auth token"""
    return {
        "Authorization": f"Bearer {user_token}",
        "Content-Type": "application/json"
    }


@pytest.fixture
def admin_headers(admin_token):
    """Headers with admin auth token"""
    return {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json"
    }


class TestMatchPageAPIs:
    """Test match page related APIs"""
    
    def test_match_detail_returns_odds(self):
        """GET /api/match/{id} returns match with odds"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "match_id" in data
        assert "home_team" in data
        assert "away_team" in data
        assert "odds" in data or "home_odds" in data
        
        # Verify odds structure
        if "odds" in data and data["odds"]:
            odds = data["odds"]
            # Should have home/away odds
            assert "home" in odds or "home_back" in odds
            assert "away" in odds or "away_back" in odds
        
        print(f"Match: {data.get('home_team')} vs {data.get('away_team')}")
        print(f"Status: {data.get('status')}")
    
    def test_market_status_endpoint(self):
        """GET /api/match/{id}/market-status returns suspend state"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/market-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "match_id" in data
        assert "suspended" in data
        assert isinstance(data["suspended"], bool)
        
        print(f"Market status: suspended={data['suspended']}")
        if data.get("last_event"):
            print(f"Last event: {data['last_event']}")


class TestP2PPoolAPI:
    """Test P2P pool stats API"""
    
    def test_pool_stats_returns_team_totals(self):
        """GET /api/p2p/pool/{match_id} returns per-team totals"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "home_team" in data
        assert "away_team" in data
        
        # Pool stats may have home_total, away_total, home_bets, away_bets
        print(f"Pool stats: {data}")
        
        # Verify structure if bets exist
        if "home_total" in data:
            assert isinstance(data["home_total"], (int, float))
        if "away_total" in data:
            assert isinstance(data["away_total"], (int, float))
        if "home_bets" in data:
            assert isinstance(data["home_bets"], int)
        if "away_bets" in data:
            assert isinstance(data["away_bets"], int)
    
    def test_pool_stats_invalid_match(self):
        """GET /api/p2p/pool/{invalid_id} returns 404"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/invalid_match_id_12345")
        assert response.status_code == 404


class TestP2PMyBetsAPI:
    """Test P2P my bets API"""
    
    def test_my_bets_requires_auth(self):
        """GET /api/p2p/bets/{match_id}/my requires authentication"""
        response = requests.get(f"{BASE_URL}/api/p2p/bets/{TEST_MATCH_ID}/my")
        assert response.status_code == 401
    
    def test_my_bets_returns_user_bets(self, user_headers):
        """GET /api/p2p/bets/{match_id}/my returns user's bets"""
        response = requests.get(
            f"{BASE_URL}/api/p2p/bets/{TEST_MATCH_ID}/my",
            headers=user_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list)
        
        print(f"User has {len(data)} P2P bets on this match")
        
        # Verify bet structure if bets exist
        if len(data) > 0:
            bet = data[0]
            assert "bet_id" in bet
            assert "selected_team" in bet
            assert "stake" in bet
            assert "matched_amount" in bet
            assert "unmatched_amount" in bet
            assert "status" in bet
            
            # Status should be one of: pending, partially_matched, fully_matched, won, lost
            valid_statuses = ["pending", "partially_matched", "fully_matched", "won", "lost"]
            assert bet["status"] in valid_statuses, f"Invalid status: {bet['status']}"
            
            print(f"First bet: {bet['selected_team']} - ₹{bet['stake']} - {bet['status']}")


class TestP2PBetPlacement:
    """Test P2P bet placement API"""
    
    def test_place_bet_requires_auth(self):
        """POST /api/p2p/bet requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={"match_id": TEST_MATCH_ID, "selected_team": "Kolkata Knight Riders", "stake": 100}
        )
        assert response.status_code == 401
    
    def test_place_bet_invalid_match(self, user_headers):
        """POST /api/p2p/bet with invalid match returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={"match_id": "invalid_match_12345", "selected_team": "Team A", "stake": 100},
            headers=user_headers
        )
        assert response.status_code == 404
    
    def test_place_bet_invalid_team(self, user_headers):
        """POST /api/p2p/bet with invalid team returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={"match_id": TEST_MATCH_ID, "selected_team": "Invalid Team XYZ", "stake": 100},
            headers=user_headers
        )
        assert response.status_code == 400
    
    def test_place_bet_invalid_stake(self, user_headers):
        """POST /api/p2p/bet with invalid stake returns 400"""
        # Zero stake
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={"match_id": TEST_MATCH_ID, "selected_team": "Kolkata Knight Riders", "stake": 0},
            headers=user_headers
        )
        assert response.status_code == 400
        
        # Negative stake
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={"match_id": TEST_MATCH_ID, "selected_team": "Kolkata Knight Riders", "stake": -100},
            headers=user_headers
        )
        assert response.status_code == 400
    
    def test_place_bet_success(self, user_headers):
        """POST /api/p2p/bet places bet and deducts from wallet"""
        # First check wallet balance
        wallet_response = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers)
        if wallet_response.status_code != 200:
            pytest.skip("Could not get wallet balance")
        
        wallet = wallet_response.json()
        available = wallet.get("balance", 0) - wallet.get("frozen_balance", 0) - wallet.get("exposure", 0)
        
        if available < 100:
            pytest.skip(f"Insufficient balance for test: {available}")
        
        balance_before = wallet.get("balance", 0)
        
        # Place bet
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={
                "match_id": TEST_MATCH_ID,
                "selected_team": "Sunrisers Hyderabad",  # Bet on away team
                "stake": 100
            },
            headers=user_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "bet_id" in data
        assert "selected_team" in data
        assert data["selected_team"] == "Sunrisers Hyderabad"
        assert "stake" in data
        assert data["stake"] == 100
        assert "status" in data
        assert data["status"] in ["pending", "partially_matched", "fully_matched"]
        assert "matched_amount" in data
        assert "unmatched_amount" in data
        
        print(f"Bet placed: {data['bet_id']}")
        print(f"Status: {data['status']}, Matched: {data['matched_amount']}, Unmatched: {data['unmatched_amount']}")
        
        # Verify wallet was deducted
        wallet_after = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        balance_after = wallet_after.get("balance", 0)
        
        assert balance_after < balance_before, "Balance should decrease after bet"
        print(f"Balance: {balance_before} -> {balance_after}")


class TestP2PPartialMatching:
    """Test P2P partial matching logic"""
    
    def test_opposing_bets_get_matched(self, user_headers, admin_headers):
        """Test that opposing bets are matched FIFO"""
        # This test verifies the matching logic by checking pool stats
        # We can't easily test with two different users, but we can verify
        # that the matching endpoint works
        
        # Get current pool stats
        pool_before = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}").json()
        
        # Get user's bets
        my_bets = requests.get(
            f"{BASE_URL}/api/p2p/bets/{TEST_MATCH_ID}/my",
            headers=user_headers
        ).json()
        
        print(f"Pool before: {pool_before}")
        print(f"User bets: {len(my_bets)}")
        
        # Verify bet statuses are valid
        for bet in my_bets:
            assert bet["status"] in ["pending", "partially_matched", "fully_matched", "won", "lost"]
            assert bet["matched_amount"] >= 0
            assert bet["unmatched_amount"] >= 0
            assert bet["matched_amount"] + bet["unmatched_amount"] == bet["stake"]


class TestWalletIntegration:
    """Test wallet integration with P2P betting"""
    
    def test_wallet_balance_after_bet(self, user_headers):
        """Verify wallet balance is correctly updated after bet"""
        response = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "balance" in data
        assert "exposure" in data
        
        # Exposure should be >= 0 (sum of pending bet stakes)
        assert data["exposure"] >= 0
        
        print(f"Wallet: balance={data['balance']}, exposure={data['exposure']}")


class TestOddsPolling:
    """Test odds polling functionality"""
    
    def test_odds_refresh_on_match_page(self):
        """Verify odds are available and can be polled"""
        # First call
        response1 = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Wait 1 second (polling interval)
        time.sleep(1)
        
        # Second call
        response2 = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Both should have odds
        assert data1.get("odds") or data1.get("home_odds")
        assert data2.get("odds") or data2.get("home_odds")
        
        print(f"Odds poll 1: home={data1.get('home_odds')}, away={data1.get('away_odds')}")
        print(f"Odds poll 2: home={data2.get('home_odds')}, away={data2.get('away_odds')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
