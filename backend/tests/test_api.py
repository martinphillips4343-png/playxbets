"""
PlayXBets API Tests
Tests for authentication, admin, and user endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "123456"}
USER_CREDS = {"username": "user", "password": "123456"}


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        data=ADMIN_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed")


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


@pytest.fixture
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


@pytest.fixture
def user_client(api_client, user_token):
    """Session with user auth header"""
    api_client.headers.update({"Authorization": f"Bearer {user_token}"})
    return api_client


# ==================== HEALTH CHECK ====================
class TestHealth:
    """Health endpoint tests"""
    
    def test_health_check(self, api_client):
        """Test health endpoint returns 200"""
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


# ==================== AUTHENTICATION TESTS ====================
class TestAuth:
    """Authentication endpoint tests"""
    
    def test_admin_login_success(self, api_client):
        """Test admin login with valid credentials"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            data=ADMIN_CREDS
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"] == "admin"
        assert data["username"] == "admin"
    
    def test_user_login_success(self, api_client):
        """Test user login with valid credentials"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            data=USER_CREDS
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["role"] == "user"
        assert data["username"] == "user"
    
    def test_login_invalid_credentials(self, api_client):
        """Test login with invalid credentials"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "invalid", "password": "wrong"}
        )
        assert response.status_code == 401
    
    def test_get_current_user_admin(self, api_client, admin_token):
        """Test get current user for admin"""
        response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert data["role"] == "admin"
    
    def test_get_current_user_unauthorized(self, api_client):
        """Test get current user without token"""
        response = api_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401


# ==================== PUBLIC ENDPOINTS ====================
class TestPublicEndpoints:
    """Public endpoint tests (no auth required)"""
    
    def test_get_matches(self, api_client):
        """Test get all matches"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_get_matches_by_sport(self, api_client):
        """Test get matches filtered by sport"""
        response = api_client.get(f"{BASE_URL}/api/matches?sport=cricket")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# ==================== ADMIN ENDPOINTS ====================
class TestAdminEndpoints:
    """Admin endpoint tests"""
    
    def test_admin_dashboard(self, api_client, admin_token):
        """Test admin dashboard stats"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/dashboard",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Verify dashboard stats structure
        assert "total_bettors" in data
        assert "active_bettors" in data
        assert "in_play_games" in data
        assert "upcoming_games" in data
        assert "total_deposited" in data
        assert "pending_withdrawals" in data
        assert "pending_bets" in data
        assert "pending_tickets" in data
    
    def test_admin_get_users(self, api_client, admin_token):
        """Test admin get all users"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_admin_get_bets(self, api_client, admin_token):
        """Test admin get all bets"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/bets",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_admin_get_withdrawals(self, api_client, admin_token):
        """Test admin get all withdrawals"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/withdrawals",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_admin_get_tickets(self, api_client, admin_token):
        """Test admin get all support tickets"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/tickets",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_admin_dashboard_unauthorized(self, api_client, user_token):
        """Test admin dashboard with user token (should fail)"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/dashboard",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 403


# ==================== USER ENDPOINTS ====================
class TestUserEndpoints:
    """User endpoint tests"""
    
    def test_user_get_wallet(self, api_client, user_token):
        """Test user get wallet"""
        response = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "balance" in data
    
    def test_user_get_bet_history(self, api_client, user_token):
        """Test user get bet history"""
        response = api_client.get(
            f"{BASE_URL}/api/bets/history",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_user_get_transactions(self, api_client, user_token):
        """Test user get transactions"""
        response = api_client.get(
            f"{BASE_URL}/api/transactions/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_user_get_withdrawals(self, api_client, user_token):
        """Test user get withdrawals"""
        response = api_client.get(
            f"{BASE_URL}/api/withdrawals/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_user_get_tickets(self, api_client, user_token):
        """Test user get tickets"""
        response = api_client.get(
            f"{BASE_URL}/api/tickets/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# ==================== ADMIN RECHARGE FLOW ====================
class TestAdminRechargeFlow:
    """Test admin recharge functionality"""
    
    def test_admin_recharge_user_wallet(self, api_client, admin_token, user_token):
        """Test admin can recharge user wallet"""
        # First get user info
        user_response = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert user_response.status_code == 200
        user_id = user_response.json()["user_id"]
        
        # Get initial wallet balance
        wallet_before = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        initial_balance = wallet_before.json().get("balance", 0)
        
        # Admin recharges wallet
        recharge_response = api_client.post(
            f"{BASE_URL}/api/admin/recharge",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "user_id": user_id,
                "amount": 100.0,
                "note": "TEST_recharge"
            }
        )
        assert recharge_response.status_code == 200
        data = recharge_response.json()
        assert data["success"] == True
        assert data["new_balance"] == initial_balance + 100.0
        
        # Verify wallet balance increased
        wallet_after = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert wallet_after.json()["balance"] == initial_balance + 100.0


# ==================== USER REGISTRATION ====================
class TestUserRegistration:
    """Test user registration flow"""
    
    def test_register_new_user(self, api_client):
        """Test registering a new user"""
        import uuid
        test_username = f"TEST_user_{uuid.uuid4().hex[:8]}"
        
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": test_username,
                "password": "testpass123",
                "email": f"{test_username}@test.com"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == test_username
        assert data["role"] == "user"
        assert "user_id" in data
    
    def test_register_duplicate_username(self, api_client):
        """Test registering with existing username fails"""
        response = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": "user",
                "password": "testpass123"
            }
        )
        assert response.status_code == 400


# ==================== SUPPORT TICKET FLOW ====================
class TestSupportTicketFlow:
    """Test support ticket creation and reply"""
    
    def test_create_and_reply_ticket(self, api_client, user_token, admin_token):
        """Test creating a ticket and admin replying"""
        # User creates ticket
        create_response = api_client.post(
            f"{BASE_URL}/api/tickets",
            headers={"Authorization": f"Bearer {user_token}"},
            json={
                "subject": "TEST_ticket",
                "message": "This is a test ticket message"
            }
        )
        assert create_response.status_code == 200
        ticket = create_response.json()
        assert ticket["subject"] == "TEST_ticket"
        assert ticket["status"] == "open"
        ticket_id = ticket["ticket_id"]
        
        # Admin replies to ticket
        reply_response = api_client.put(
            f"{BASE_URL}/api/admin/tickets/{ticket_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "admin_reply": "This is admin reply",
                "status": "closed"
            }
        )
        assert reply_response.status_code == 200
        
        # Verify ticket is closed
        tickets_response = api_client.get(
            f"{BASE_URL}/api/tickets/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        tickets = tickets_response.json()
        test_ticket = next((t for t in tickets if t["ticket_id"] == ticket_id), None)
        assert test_ticket is not None
        assert test_ticket["status"] == "closed"
        assert test_ticket["admin_reply"] == "This is admin reply"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
