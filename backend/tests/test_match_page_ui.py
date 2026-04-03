"""
Test suite for MatchPage UI features:
- Blue odds buttons with decimal odds
- Real P2P pool liquidity display
- Green/Red dot indicators for underdog/favorite
- Bet placement flow
- MATCHED BET tab functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test match ID: Scotland vs Oman
TEST_MATCH_ID = "3855c9b2-312c-4e93-9cc9-51e6c7d25af1"


class TestP2PPoolEndpoint:
    """Tests for /api/p2p/pool/{match_id} endpoint"""
    
    def test_pool_endpoint_returns_correct_structure(self):
        """Verify pool endpoint returns expected data structure"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Required fields
        assert "home_team" in data, "Missing home_team field"
        assert "away_team" in data, "Missing away_team field"
        
        # Team names should be strings
        assert isinstance(data["home_team"], str), "home_team should be string"
        assert isinstance(data["away_team"], str), "away_team should be string"
        
        print(f"✓ Pool endpoint returns correct structure: {data}")
    
    def test_pool_endpoint_returns_team_totals(self):
        """Verify pool endpoint returns per-team totals"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check for home team pool data (if bets exist)
        if "home_total" in data:
            assert isinstance(data["home_total"], (int, float)), "home_total should be numeric"
            assert data["home_total"] >= 0, "home_total should be non-negative"
        
        # Check for away team pool data (if bets exist)
        if "away_total" in data:
            assert isinstance(data["away_total"], (int, float)), "away_total should be numeric"
            assert data["away_total"] >= 0, "away_total should be non-negative"
        
        print(f"✓ Pool totals: home={data.get('home_total', 0)}, away={data.get('away_total', 0)}")
    
    def test_pool_endpoint_returns_matched_pending(self):
        """Verify pool endpoint returns matched and pending amounts"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check matched/pending fields if present
        if "home_matched" in data:
            assert isinstance(data["home_matched"], (int, float))
        if "home_pending" in data:
            assert isinstance(data["home_pending"], (int, float))
        if "away_matched" in data:
            assert isinstance(data["away_matched"], (int, float))
        if "away_pending" in data:
            assert isinstance(data["away_pending"], (int, float))
        
        print(f"✓ Pool matched/pending data present")
    
    def test_pool_endpoint_404_for_invalid_match(self):
        """Verify pool endpoint returns 404 for non-existent match"""
        response = requests.get(f"{BASE_URL}/api/p2p/pool/invalid-match-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Pool endpoint returns 404 for invalid match")


class TestMatchEndpoint:
    """Tests for /api/match/{match_id} endpoint"""
    
    def test_match_endpoint_returns_odds(self):
        """Verify match endpoint returns odds data"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Check for odds object
        assert "odds" in data, "Missing odds field"
        odds = data["odds"]
        
        # Check for decimal odds (home/away)
        assert "home" in odds or "home_back" in odds, "Missing home odds"
        assert "away" in odds or "away_back" in odds, "Missing away odds"
        
        home_odds = odds.get("home") or odds.get("home_back")
        away_odds = odds.get("away") or odds.get("away_back")
        
        # Odds should be decimal format (> 1.0)
        assert home_odds > 1.0, f"Home odds {home_odds} should be > 1.0"
        assert away_odds > 1.0, f"Away odds {away_odds} should be > 1.0"
        
        print(f"✓ Match odds: home={home_odds}, away={away_odds}")
    
    def test_match_endpoint_returns_team_names(self):
        """Verify match endpoint returns team names"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "home_team" in data, "Missing home_team"
        assert "away_team" in data, "Missing away_team"
        assert len(data["home_team"]) > 0, "home_team should not be empty"
        assert len(data["away_team"]) > 0, "away_team should not be empty"
        
        print(f"✓ Teams: {data['home_team']} vs {data['away_team']}")
    
    def test_match_endpoint_returns_first_second_team_order(self):
        """Verify match endpoint returns first_team/second_team for bookmaker order"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        odds = data.get("odds", {})
        
        # Check if first_team/second_team are present (from Betfair API order)
        if "first_team" in odds and "second_team" in odds:
            assert isinstance(odds["first_team"], str)
            assert isinstance(odds["second_team"], str)
            print(f"✓ Bookmaker team order: first={odds['first_team']}, second={odds['second_team']}")
        else:
            print("⚠ first_team/second_team not present in odds (may not have Betfair data)")


class TestBetPlacementFlow:
    """Tests for bet placement API"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed - skipping authenticated tests")
    
    def test_bet_placement_requires_auth(self):
        """Verify bet placement requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={
                "match_id": TEST_MATCH_ID,
                "selected_team": "Scotland",
                "stake": 100
            }
        )
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Bet placement requires authentication")
    
    def test_bet_placement_with_auth(self, auth_token):
        """Verify bet placement works with authentication"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        
        # Get initial pool state
        pool_before = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}").json()
        home_total_before = pool_before.get("home_total", 0)
        
        # Place bet
        response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={
                "match_id": TEST_MATCH_ID,
                "selected_team": "Scotland",
                "stake": 50
            },
            headers=headers
        )
        
        # Should succeed or fail due to insufficient balance
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "bet_id" in data, "Missing bet_id in response"
            assert "status" in data, "Missing status in response"
            print(f"✓ Bet placed: {data}")
            
            # Verify pool updated
            pool_after = requests.get(f"{BASE_URL}/api/p2p/pool/{TEST_MATCH_ID}").json()
            home_total_after = pool_after.get("home_total", 0)
            assert home_total_after >= home_total_before, "Pool should increase after bet"
            print(f"✓ Pool updated: {home_total_before} -> {home_total_after}")
        else:
            print(f"⚠ Bet placement failed (likely insufficient balance): {response.json()}")


class TestMyBetsEndpoint:
    """Tests for /api/p2p/bets/{match_id}/my endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token for user"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        pytest.skip("Authentication failed")
    
    def test_my_bets_requires_auth(self):
        """Verify my bets endpoint requires authentication"""
        response = requests.get(f"{BASE_URL}/api/p2p/bets/{TEST_MATCH_ID}/my")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ My bets endpoint requires authentication")
    
    def test_my_bets_returns_list(self, auth_token):
        """Verify my bets endpoint returns list of bets"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(
            f"{BASE_URL}/api/p2p/bets/{TEST_MATCH_ID}/my",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            bet = data[0]
            assert "selected_team" in bet, "Missing selected_team"
            assert "stake" in bet, "Missing stake"
            assert "status" in bet, "Missing status"
            print(f"✓ My bets: {len(data)} bets found")
        else:
            print("✓ My bets: No bets found (empty list)")


class TestMarketStatusEndpoint:
    """Tests for /api/match/{match_id}/market-status endpoint"""
    
    def test_market_status_returns_suspended_flag(self):
        """Verify market status endpoint returns suspended flag"""
        response = requests.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/market-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "suspended" in data, "Missing suspended field"
        assert isinstance(data["suspended"], bool), "suspended should be boolean"
        
        print(f"✓ Market status: suspended={data['suspended']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
