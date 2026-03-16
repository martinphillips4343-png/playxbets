"""
Cricket Micro Betting API Tests
Tests for the new Cricket Ball-By-Ball Micro Betting extension
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_CREDS = {"username": "user", "password": "123456"}
DEMO_MATCH_ID = "ea479cff-ddbe-48e0-9e4a-528f61a8a175"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def user_token(api_client):
    """Get user authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        data=USER_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("User authentication failed")


@pytest.fixture(scope="module")
def user_info(api_client, user_token):
    """Get user info"""
    response = api_client.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {user_token}"}
    )
    if response.status_code == 200:
        return response.json()
    pytest.skip("Failed to get user info")


# ==================== ODDS ENDPOINT ====================
class TestCricketMicroOdds:
    """Test GET /api/cricket-micro/odds - returns 8 outcome odds"""
    
    def test_get_default_odds(self, api_client):
        """Test that odds endpoint returns all 8 outcomes"""
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/odds")
        assert response.status_code == 200
        
        data = response.json()
        # Verify all 8 outcomes are present
        expected_outcomes = ["dot", "1", "2", "3", "4", "6", "wicket", "wide_noball"]
        for outcome in expected_outcomes:
            assert outcome in data, f"Missing outcome: {outcome}"
            assert isinstance(data[outcome], (int, float)), f"Odds for {outcome} should be numeric"
            assert data[outcome] > 0, f"Odds for {outcome} should be positive"
        
        # Verify specific odds values
        assert data["dot"] == 2.0
        assert data["1"] == 2.5
        assert data["2"] == 4.0
        assert data["3"] == 8.0
        assert data["4"] == 4.5
        assert data["6"] == 8.0
        assert data["wicket"] == 12.0
        assert data["wide_noball"] == 6.0


# ==================== DEMO MODE ENDPOINTS ====================
class TestDemoMode:
    """Test demo mode start/stop/status endpoints"""
    
    def test_demo_status_initial(self, api_client):
        """Test GET /api/cricket-micro/demo/status returns proper structure"""
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "running" in data
        assert "match_id" in data
        assert "match_name" in data
        assert isinstance(data["running"], bool)
    
    def test_demo_stop(self, api_client):
        """Test POST /api/cricket-micro/demo/stop"""
        response = api_client.post(f"{BASE_URL}/api/cricket-micro/demo/stop")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "stopped"
        
        # Verify demo is stopped
        status_response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        assert status_response.json()["running"] == False
    
    def test_demo_start(self, api_client):
        """Test POST /api/cricket-micro/demo/start"""
        response = api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] in ["started", "already_running"]
        assert "match_id" in data
        
        # Verify demo is running
        status_response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        assert status_response.json()["running"] == True
    
    def test_demo_start_already_running(self, api_client):
        """Test starting demo when already running returns already_running"""
        # Ensure demo is running
        api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        time.sleep(0.5)
        
        # Try to start again
        response = api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["started", "already_running"]


# ==================== MARKETS ENDPOINTS ====================
class TestMarketsEndpoints:
    """Test market-related endpoints"""
    
    def test_get_active_markets(self, api_client):
        """Test GET /api/cricket-micro/markets/active"""
        # Ensure demo is running to have active markets
        api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        time.sleep(1)
        
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/active")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # If there are active markets, verify structure
        if len(data) > 0:
            market = data[0]
            assert "market_id" in market
            assert "match_id" in market
            assert "ball_number" in market
            assert "status" in market
            assert "odds" in market
            assert market["status"] in ["open", "suspended"]
    
    def test_get_markets_by_match(self, api_client):
        """Test GET /api/cricket-micro/markets/match/{match_id}"""
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/match/{DEMO_MATCH_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all markets belong to the requested match
        for market in data:
            assert market["match_id"] == DEMO_MATCH_ID
    
    def test_get_specific_market(self, api_client):
        """Test GET /api/cricket-micro/markets/{market_id}"""
        # First get active markets to get a market_id
        active_response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/active")
        active_markets = active_response.json()
        
        if len(active_markets) > 0:
            market_id = active_markets[0]["market_id"]
            response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/{market_id}")
            assert response.status_code == 200
            
            data = response.json()
            assert data["market_id"] == market_id
    
    def test_get_nonexistent_market(self, api_client):
        """Test GET /api/cricket-micro/markets/{market_id} with invalid ID"""
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/nonexistent-market-id")
        assert response.status_code == 404


# ==================== MARKET LIFECYCLE ====================
class TestMarketLifecycle:
    """Test market lifecycle: created -> open -> suspended -> settled"""
    
    def test_market_status_transitions(self, api_client):
        """Test that markets go through proper status transitions"""
        # Ensure demo is running
        api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        time.sleep(1)
        
        # Get demo status to see active market
        status_response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        status = status_response.json()
        
        if status["active_market"]:
            market = status["active_market"]
            # Market should be open or suspended
            assert market["status"] in ["open", "suspended", "created"]
            
            # Verify market has required fields
            assert "closes_at" in market
            assert "opens_at" in market
            assert "odds" in market
            assert len(market["odds"]) == 8  # 8 betting outcomes
    
    def test_market_settlement(self, api_client):
        """Test that markets get settled with results"""
        # Get markets for the demo match
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/match/{DEMO_MATCH_ID}")
        markets = response.json()
        
        # Check for settled markets
        settled_markets = [m for m in markets if m["status"] == "settled"]
        
        # If there are settled markets, verify they have results
        for market in settled_markets:
            assert market["result"] is not None
            assert market["settled_at"] is not None
            # Result should be one of the valid outcomes
            valid_outcomes = ["dot", "1", "2", "3", "4", "6", "wicket", "wide_noball"]
            assert market["result"] in valid_outcomes


# ==================== BETTING ENDPOINTS ====================
class TestBettingEndpoints:
    """Test betting functionality"""
    
    def test_place_bet_without_user_id(self, api_client):
        """Test placing bet without user_id fails"""
        # Get an active market
        api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        time.sleep(1)
        
        status_response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        status = status_response.json()
        
        if status["active_market"] and status["active_market"]["status"] == "open":
            market_id = status["active_market"]["market_id"]
            
            response = api_client.post(
                f"{BASE_URL}/api/cricket-micro/bets",
                json={
                    "market_id": market_id,
                    "selected_outcome": "dot",
                    "stake": 10.0
                }
            )
            assert response.status_code == 400
            assert "User ID is required" in response.json()["detail"]
    
    def test_place_bet_on_closed_market(self, api_client, user_info):
        """Test placing bet on suspended/closed market fails"""
        # Get markets and find a suspended one
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/markets/match/{DEMO_MATCH_ID}")
        markets = response.json()
        
        suspended_markets = [m for m in markets if m["status"] == "suspended"]
        
        if len(suspended_markets) > 0:
            market_id = suspended_markets[0]["market_id"]
            
            response = api_client.post(
                f"{BASE_URL}/api/cricket-micro/bets",
                json={
                    "market_id": market_id,
                    "selected_outcome": "dot",
                    "stake": 10.0
                },
                params={"user_id": user_info["user_id"]}
            )
            assert response.status_code == 400
            assert "not open" in response.json()["detail"].lower()
    
    def test_get_bet_history(self, api_client, user_info):
        """Test GET /api/cricket-micro/bets/history/{user_id}"""
        response = api_client.get(f"{BASE_URL}/api/cricket-micro/bets/history/{user_info['user_id']}")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # If there are bets, verify structure
        for bet in data:
            assert "bet_id" in bet
            assert "market_id" in bet
            assert "selected_outcome" in bet
            assert "stake" in bet
            assert "odds" in bet
            assert "status" in bet


# ==================== 5-SECOND BETTING WINDOW ====================
class TestBettingWindow:
    """Test 5-second betting window functionality"""
    
    def test_market_has_5_second_window(self, api_client):
        """Test that markets have approximately 5-second betting window"""
        # Ensure demo is running
        api_client.post(f"{BASE_URL}/api/cricket-micro/demo/start")
        time.sleep(1)
        
        status_response = api_client.get(f"{BASE_URL}/api/cricket-micro/demo/status")
        status = status_response.json()
        
        if status["active_market"]:
            market = status["active_market"]
            
            if market["opens_at"] and market["closes_at"]:
                from datetime import datetime
                
                opens_at = datetime.fromisoformat(market["opens_at"].replace("Z", "+00:00"))
                closes_at = datetime.fromisoformat(market["closes_at"].replace("Z", "+00:00"))
                
                window_seconds = (closes_at - opens_at).total_seconds()
                
                # Window should be 5 seconds
                assert window_seconds == 5.0, f"Expected 5 second window, got {window_seconds}"


# ==================== HOMEPAGE STILL WORKING ====================
class TestExistingFunctionality:
    """Test that existing functionality still works (no side effects)"""
    
    def test_health_endpoint(self, api_client):
        """Test health endpoint still works"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_matches_endpoint(self, api_client):
        """Test matches endpoint still works"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_auth_login(self, api_client):
        """Test auth login still works"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            data=USER_CREDS,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200
        assert "access_token" in response.json()
    
    def test_wallet_endpoint(self, api_client, user_token):
        """Test wallet endpoint still works"""
        response = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        assert "balance" in response.json()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
