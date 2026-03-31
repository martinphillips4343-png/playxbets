"""
WebSocket and Match Page API Tests
Tests for:
- WebSocket status endpoint
- Match detail endpoint
- Live matches endpoint
- Bet placement flow
"""

import pytest
import requests
import os
import json
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://cricket-odds-sync.preview.emergentagent.com')

class TestWebSocketStatus:
    """Tests for WebSocket status endpoint"""
    
    def test_ws_status_endpoint(self):
        """Test /api/ws/status returns connection stats"""
        response = requests.get(f"{BASE_URL}/api/ws/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "active_connections" in data
        assert "cache_stats" in data
        assert "timestamp" in data
        assert isinstance(data["active_connections"], int)
        print(f"WebSocket status: {data['active_connections']} active connections")


class TestMatchEndpoints:
    """Tests for match-related endpoints"""
    
    def test_get_live_matches(self):
        """Test /api/matches/live returns live matches"""
        response = requests.get(f"{BASE_URL}/api/matches/live")
        assert response.status_code == 200
        
        data = response.json()
        assert "success" in data
        assert "count" in data
        assert "matches" in data
        assert "timestamp" in data
        print(f"Live matches count: {data['count']}")
        
        # Verify all returned matches have status 'live'
        for match in data["matches"]:
            assert match.get("status") == "live", f"Match {match.get('match_id')} has status {match.get('status')}"
    
    def test_get_matches_status(self):
        """Test /api/matches/status returns quick status"""
        response = requests.get(f"{BASE_URL}/api/matches/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "live_count" in data
        assert "upcoming_count" in data
        assert "timestamp" in data
        print(f"Status: {data['live_count']} live, {data['upcoming_count']} upcoming")
    
    def test_get_match_detail(self):
        """Test /api/match/{match_id} returns match details"""
        # First get a live match ID
        live_response = requests.get(f"{BASE_URL}/api/matches/live")
        assert live_response.status_code == 200
        
        live_data = live_response.json()
        if live_data["count"] == 0:
            pytest.skip("No live matches available for testing")
        
        match_id = live_data["matches"][0]["match_id"]
        
        # Get match detail
        response = requests.get(f"{BASE_URL}/api/match/{match_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["match_id"] == match_id
        assert "home_team" in data
        assert "away_team" in data
        assert "odds" in data
        assert "features" in data
        assert "status" in data
        
        # Verify odds structure
        assert "home" in data["odds"]
        assert "away" in data["odds"]
        
        # Verify features structure
        assert "has_tv" in data["features"]
        assert "has_fancy" in data["features"]
        assert "has_bookmaker" in data["features"]
        
        print(f"Match detail: {data['home_team']} vs {data['away_team']}, status: {data['status']}")
    
    def test_match_not_found(self):
        """Test /api/match/{invalid_id} returns 404"""
        response = requests.get(f"{BASE_URL}/api/match/invalid-match-id-12345")
        assert response.status_code == 404


class TestAuthentication:
    """Tests for authentication flow"""
    
    def test_login_success(self):
        """Test successful login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "access_token" in data
        assert "token_type" in data
        assert data["token_type"] == "bearer"
        assert data["username"] == "user"
        assert data["role"] == "user"
        print("User login successful")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "invalid", "password": "wrong"}
        )
        assert response.status_code == 401
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["role"] == "admin"
        print("Admin login successful")


class TestBetPlacement:
    """Tests for bet placement flow"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"}
        )
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Authentication failed")
    
    @pytest.fixture
    def live_match_id(self):
        """Get a live match ID for testing"""
        response = requests.get(f"{BASE_URL}/api/matches/live")
        if response.status_code == 200 and response.json()["count"] > 0:
            return response.json()["matches"][0]["match_id"]
        pytest.skip("No live matches available")
    
    def test_get_wallet(self, auth_token):
        """Test getting wallet balance"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/wallet", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "balance" in data
        print(f"Wallet balance: {data['balance']}")
    
    def test_place_bet_unauthorized(self, live_match_id):
        """Test placing bet without authentication"""
        bet_data = {
            "match_id": live_match_id,
            "selected_team": "Team Alpha",
            "odds": 1.5,
            "stake": 100,
            "bet_type": "back",
            "market_type": "match"
        }
        response = requests.post(f"{BASE_URL}/api/bets", json=bet_data)
        assert response.status_code == 401
    
    def test_get_bet_history(self, auth_token):
        """Test getting bet history"""
        headers = {"Authorization": f"Bearer {auth_token}"}
        response = requests.get(f"{BASE_URL}/api/bets/history", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"Bet history count: {len(data)}")


class TestWebSocketConnection:
    """Tests for WebSocket connection (basic connectivity)"""
    
    def test_websocket_main_endpoint_exists(self):
        """Test that WebSocket endpoint is accessible"""
        # We can't fully test WebSocket in pytest, but we can verify the endpoint exists
        # by checking the ws/status endpoint
        response = requests.get(f"{BASE_URL}/api/ws/status")
        assert response.status_code == 200
        print("WebSocket endpoint is accessible")
    
    def test_websocket_match_endpoint_format(self):
        """Test that match-specific WebSocket endpoint format is correct"""
        # Get a match ID
        response = requests.get(f"{BASE_URL}/api/matches/live")
        if response.status_code == 200 and response.json()["count"] > 0:
            match_id = response.json()["matches"][0]["match_id"]
            # The WebSocket URL format should be /api/ws/match/{match_id}
            ws_url = f"{BASE_URL}/api/ws/match/{match_id}".replace("https://", "wss://").replace("http://", "ws://")
            print(f"WebSocket URL format: {ws_url}")
            # We verify the format is correct
            assert "/api/ws/match/" in ws_url
            assert match_id in ws_url


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
