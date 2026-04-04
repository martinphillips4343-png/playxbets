"""
Test suite for SUSPENDED state feature on 4/6/Wicket cricket events.
Tests:
1. Backend: /api/admin/match/{match_id}/test-suspend triggers suspended=true
2. Backend: /api/match/{match_id}/market-status returns suspended state
3. Backend: P2P bet placement blocked during suspension (409)
4. Backend: Suspension auto-clears after 15 seconds
"""

import pytest
import requests
import time
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
MATCH_ID = "306aeb5b-4d70-4085-98ca-eb312e9f7ffc"  # Leicestershire vs Sussex - LIVE match

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "123456"
USER_USERNAME = "user"
USER_PASSWORD = "123456"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def user_token():
    """Get user authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": USER_USERNAME, "password": USER_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"User authentication failed: {response.status_code} - {response.text}")


class TestSuspendedStateBackend:
    """Backend tests for SUSPENDED state feature"""

    def test_01_market_status_endpoint_exists(self):
        """Test that market-status endpoint exists and returns valid response"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "suspended" in data, "Response should contain 'suspended' field"
        assert "match_id" in data, "Response should contain 'match_id' field"
        print(f"Market status response: {data}")

    def test_02_test_suspend_four_event(self, admin_token):
        """Test that triggering FOUR event sets suspended=true"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=four",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("triggered") == "four", f"Expected triggered='four', got {data.get('triggered')}"
        assert data.get("market_status", {}).get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("market_status", {}).get("last_event") == "four", f"Expected last_event='four', got {data}"
        print(f"FOUR event triggered: {data}")

    def test_03_market_status_shows_suspended_after_four(self):
        """Verify market-status returns suspended=true after FOUR event"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert response.status_code == 200
        data = response.json()
        assert data.get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("last_event") == "four", f"Expected last_event='four', got {data}"
        print(f"Market status after FOUR: {data}")

    def test_04_test_suspend_six_event(self, admin_token):
        """Test that triggering SIX event sets suspended=true"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=six",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("triggered") == "six", f"Expected triggered='six', got {data.get('triggered')}"
        assert data.get("market_status", {}).get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("market_status", {}).get("last_event") == "six", f"Expected last_event='six', got {data}"
        print(f"SIX event triggered: {data}")

    def test_05_market_status_shows_suspended_after_six(self):
        """Verify market-status returns suspended=true after SIX event"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert response.status_code == 200
        data = response.json()
        assert data.get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("last_event") == "six", f"Expected last_event='six', got {data}"
        print(f"Market status after SIX: {data}")

    def test_06_test_suspend_wicket_event(self, admin_token):
        """Test that triggering WICKET event sets suspended=true"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=wicket",
            headers=headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("triggered") == "wicket", f"Expected triggered='wicket', got {data.get('triggered')}"
        assert data.get("market_status", {}).get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("market_status", {}).get("last_event") == "wicket", f"Expected last_event='wicket', got {data}"
        print(f"WICKET event triggered: {data}")

    def test_07_market_status_shows_suspended_after_wicket(self):
        """Verify market-status returns suspended=true after WICKET event"""
        response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert response.status_code == 200
        data = response.json()
        assert data.get("suspended") == True, f"Expected suspended=true, got {data}"
        assert data.get("last_event") == "wicket", f"Expected last_event='wicket', got {data}"
        print(f"Market status after WICKET: {data}")

    def test_08_p2p_bet_blocked_during_suspension(self, admin_token, user_token):
        """Test that P2P bet placement is blocked during suspension"""
        # First trigger a suspend event
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        suspend_response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=four",
            headers=admin_headers
        )
        assert suspend_response.status_code == 200, f"Failed to trigger suspend: {suspend_response.text}"
        
        # Verify suspended
        status_response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert status_response.json().get("suspended") == True, "Market should be suspended"
        
        # Try to place a bet - should fail with 400 (Market is SUSPENDED)
        user_headers = {"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"}
        bet_response = requests.post(
            f"{BASE_URL}/api/p2p/bet",
            json={
                "match_id": MATCH_ID,
                "selected_team": "Leicestershire",
                "stake": 100
            },
            headers=user_headers
        )
        # The endpoint returns 400 with "Market is SUSPENDED" message
        assert bet_response.status_code == 400, f"Expected 400 (suspended), got {bet_response.status_code}: {bet_response.text}"
        assert "SUSPENDED" in bet_response.text.upper(), f"Expected SUSPENDED in error message, got: {bet_response.text}"
        print(f"Bet blocked during suspension: {bet_response.status_code} - {bet_response.text}")

    def test_09_suspension_auto_clears_after_15_seconds(self, admin_token):
        """Test that suspension auto-clears after 15 seconds"""
        # Trigger a suspend event
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=four",
            headers=headers
        )
        assert response.status_code == 200
        
        # Verify suspended immediately
        status_response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        assert status_response.json().get("suspended") == True, "Should be suspended immediately after event"
        
        # Wait 16 seconds for auto-clear
        print("Waiting 16 seconds for suspension to auto-clear...")
        time.sleep(16)
        
        # Check market status - should be cleared
        status_response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        data = status_response.json()
        assert data.get("suspended") == False, f"Expected suspended=false after 15s, got {data}"
        print(f"Suspension auto-cleared: {data}")

    def test_10_invalid_event_type_rejected(self, admin_token):
        """Test that invalid event types are rejected"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=invalid",
            headers=headers
        )
        assert response.status_code == 400, f"Expected 400 for invalid event_type, got {response.status_code}"
        print(f"Invalid event type rejected: {response.status_code} - {response.text}")

    def test_11_test_suspend_requires_admin(self, user_token):
        """Test that test-suspend endpoint requires admin role"""
        headers = {"Authorization": f"Bearer {user_token}"}
        response = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=four",
            headers=headers
        )
        assert response.status_code == 403, f"Expected 403 for non-admin, got {response.status_code}"
        print(f"Non-admin rejected: {response.status_code}")

    def test_12_consecutive_events_keep_suspended(self, admin_token):
        """Test that consecutive 4/6/wicket events keep market suspended"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Trigger first event
        response1 = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=four",
            headers=headers
        )
        assert response1.status_code == 200
        
        # Wait 5 seconds
        time.sleep(5)
        
        # Trigger second event (should reset the 15s timer)
        response2 = requests.post(
            f"{BASE_URL}/api/admin/match/{MATCH_ID}/test-suspend?event_type=six",
            headers=headers
        )
        assert response2.status_code == 200
        
        # Check status - should still be suspended with last_event=six
        status_response = requests.get(f"{BASE_URL}/api/match/{MATCH_ID}/market-status")
        data = status_response.json()
        assert data.get("suspended") == True, f"Should still be suspended after consecutive events"
        assert data.get("last_event") == "six", f"Last event should be 'six', got {data.get('last_event')}"
        print(f"Consecutive events keep suspended: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
