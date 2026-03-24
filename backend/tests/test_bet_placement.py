"""
PlayXBets Bet Placement E2E Tests
Tests for the bet placement flow: POST /api/bets endpoint
- Verifies wallet balance deduction
- Verifies bet is saved in history
- Verifies insufficient balance handling
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
USER_CREDS = {"username": "user", "password": "123456"}
ADMIN_CREDS = {"username": "admin", "password": "123456"}


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
def user_id(api_client, user_token):
    """Get user ID"""
    response = api_client.get(
        f"{BASE_URL}/api/auth/me",
        headers={"Authorization": f"Bearer {user_token}"}
    )
    if response.status_code == 200:
        return response.json().get("user_id")
    pytest.skip("Could not get user ID")


# ==================== BET PLACEMENT TESTS ====================
class TestBetPlacement:
    """Bet placement endpoint tests"""
    
    def test_place_bet_success(self, api_client, user_token, admin_token, user_id):
        """Test placing a bet successfully - verifies wallet deduction and bet saved"""
        # Step 1: Ensure user has sufficient balance by recharging
        recharge_response = api_client.post(
            f"{BASE_URL}/api/admin/recharge",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "user_id": user_id,
                "amount": 500.0,
                "note": "TEST_bet_placement_recharge"
            }
        )
        assert recharge_response.status_code == 200, f"Recharge failed: {recharge_response.text}"
        
        # Step 2: Get wallet balance before bet
        wallet_before = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert wallet_before.status_code == 200
        balance_before = wallet_before.json()["balance"]
        print(f"Balance before bet: {balance_before}")
        
        # Step 3: Place a bet
        bet_stake = 100.0
        bet_odds = 1.85
        bet_payload = {
            "match_id": "cricket-demo-match",
            "selected_team": "TEST_North West Dragons",
            "odds": bet_odds,
            "stake": bet_stake,
            "bet_type": "back",
            "market_type": "match"
        }
        
        bet_response = api_client.post(
            f"{BASE_URL}/api/bets",
            headers={"Authorization": f"Bearer {user_token}"},
            json=bet_payload
        )
        assert bet_response.status_code == 200, f"Bet placement failed: {bet_response.text}"
        bet_data = bet_response.json()
        
        # Verify bet response structure
        assert "bet_id" in bet_data
        assert bet_data["selected_team"] == "TEST_North West Dragons"
        assert bet_data["odds"] == bet_odds
        assert bet_data["stake"] == bet_stake
        assert bet_data["status"] == "pending"
        assert bet_data["potential_win"] == bet_stake * bet_odds
        print(f"Bet placed successfully: {bet_data['bet_id']}")
        
        # Step 4: Verify wallet balance decreased
        wallet_after = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert wallet_after.status_code == 200
        balance_after = wallet_after.json()["balance"]
        print(f"Balance after bet: {balance_after}")
        
        assert balance_after == balance_before - bet_stake, \
            f"Expected balance {balance_before - bet_stake}, got {balance_after}"
        
        # Step 5: Verify bet appears in history
        history_response = api_client.get(
            f"{BASE_URL}/api/bets/history",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert history_response.status_code == 200
        bets = history_response.json()
        
        # Find our bet in history
        placed_bet = next((b for b in bets if b["bet_id"] == bet_data["bet_id"]), None)
        assert placed_bet is not None, "Bet not found in history"
        assert placed_bet["selected_team"] == "TEST_North West Dragons"
        assert placed_bet["stake"] == bet_stake
        print("Bet verified in history")
    
    def test_place_bet_insufficient_balance(self, api_client, user_token):
        """Test placing a bet with insufficient balance returns 400"""
        # Get current balance
        wallet_response = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        current_balance = wallet_response.json()["balance"]
        
        # Try to place bet with stake > balance
        bet_payload = {
            "match_id": "cricket-demo-match",
            "selected_team": "TEST_Team",
            "odds": 2.0,
            "stake": current_balance + 10000,  # More than balance
            "bet_type": "back",
            "market_type": "match"
        }
        
        bet_response = api_client.post(
            f"{BASE_URL}/api/bets",
            headers={"Authorization": f"Bearer {user_token}"},
            json=bet_payload
        )
        assert bet_response.status_code == 400, f"Expected 400, got {bet_response.status_code}"
        assert "Insufficient balance" in bet_response.json().get("detail", "")
        print("Insufficient balance error handled correctly")
    
    def test_place_bet_unauthorized(self, api_client):
        """Test placing a bet without authentication returns 401"""
        bet_payload = {
            "match_id": "cricket-demo-match",
            "selected_team": "TEST_Team",
            "odds": 2.0,
            "stake": 100,
            "bet_type": "back",
            "market_type": "match"
        }
        
        bet_response = api_client.post(
            f"{BASE_URL}/api/bets",
            json=bet_payload
        )
        assert bet_response.status_code == 401, f"Expected 401, got {bet_response.status_code}"
        print("Unauthorized bet placement rejected correctly")
    
    def test_place_football_bet(self, api_client, user_token, admin_token, user_id):
        """Test placing a football bet"""
        # Ensure balance
        api_client.post(
            f"{BASE_URL}/api/admin/recharge",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"user_id": user_id, "amount": 200.0, "note": "TEST_football_bet"}
        )
        
        # Get balance before
        wallet_before = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        balance_before = wallet_before.json()["balance"]
        
        # Place football bet
        bet_payload = {
            "match_id": "fb-001",
            "selected_team": "TEST_Manchester United",
            "odds": 2.10,
            "stake": 50.0,
            "bet_type": "back",
            "market_type": "football"
        }
        
        bet_response = api_client.post(
            f"{BASE_URL}/api/bets",
            headers={"Authorization": f"Bearer {user_token}"},
            json=bet_payload
        )
        assert bet_response.status_code == 200, f"Football bet failed: {bet_response.text}"
        bet_data = bet_response.json()
        
        assert bet_data["market_type"] == "football"
        assert bet_data["stake"] == 50.0
        
        # Verify balance deducted
        wallet_after = api_client.get(
            f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        balance_after = wallet_after.json()["balance"]
        assert balance_after == balance_before - 50.0
        print(f"Football bet placed successfully, balance: {balance_before} -> {balance_after}")
    
    def test_place_lay_bet(self, api_client, user_token, admin_token, user_id):
        """Test placing a lay bet"""
        # Ensure balance
        api_client.post(
            f"{BASE_URL}/api/admin/recharge",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"user_id": user_id, "amount": 200.0, "note": "TEST_lay_bet"}
        )
        
        # Place lay bet
        bet_payload = {
            "match_id": "cricket-demo-match",
            "selected_team": "TEST_Western Province",
            "odds": 2.20,
            "stake": 75.0,
            "bet_type": "lay",
            "market_type": "match"
        }
        
        bet_response = api_client.post(
            f"{BASE_URL}/api/bets",
            headers={"Authorization": f"Bearer {user_token}"},
            json=bet_payload
        )
        assert bet_response.status_code == 200, f"Lay bet failed: {bet_response.text}"
        bet_data = bet_response.json()
        
        assert bet_data["bet_type"] == "lay"
        assert bet_data["stake"] == 75.0
        print(f"Lay bet placed successfully: {bet_data['bet_id']}")


# ==================== BET HISTORY VERIFICATION ====================
class TestBetHistory:
    """Bet history endpoint tests"""
    
    def test_get_bet_history(self, api_client, user_token):
        """Test getting bet history returns list of bets"""
        response = api_client.get(
            f"{BASE_URL}/api/bets/history",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        assert response.status_code == 200
        bets = response.json()
        assert isinstance(bets, list)
        
        # Verify bet structure if there are bets
        if bets:
            bet = bets[0]
            assert "bet_id" in bet
            assert "match_id" in bet
            assert "selected_team" in bet
            assert "odds" in bet
            assert "stake" in bet
            assert "status" in bet
            assert "placed_at" in bet
            print(f"Found {len(bets)} bets in history")
    
    def test_admin_can_see_all_bets(self, api_client, admin_token):
        """Test admin can see all bets"""
        response = api_client.get(
            f"{BASE_URL}/api/admin/bets",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        bets = response.json()
        assert isinstance(bets, list)
        print(f"Admin sees {len(bets)} total bets")


# ==================== TRANSACTION VERIFICATION ====================
class TestTransactions:
    """Transaction verification tests"""
    
    def test_bet_creates_transaction(self, api_client, user_token, admin_token, user_id):
        """Test that placing a bet creates a transaction record"""
        # Recharge first
        api_client.post(
            f"{BASE_URL}/api/admin/recharge",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"user_id": user_id, "amount": 100.0, "note": "TEST_transaction_test"}
        )
        
        # Get transactions before
        txn_before = api_client.get(
            f"{BASE_URL}/api/transactions/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        txn_count_before = len(txn_before.json())
        
        # Place bet
        bet_payload = {
            "match_id": "test-match-txn",
            "selected_team": "TEST_Transaction_Team",
            "odds": 1.50,
            "stake": 25.0,
            "bet_type": "back",
            "market_type": "match"
        }
        
        api_client.post(
            f"{BASE_URL}/api/bets",
            headers={"Authorization": f"Bearer {user_token}"},
            json=bet_payload
        )
        
        # Get transactions after
        txn_after = api_client.get(
            f"{BASE_URL}/api/transactions/my",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        transactions = txn_after.json()
        txn_count_after = len(transactions)
        
        # Should have at least one more transaction (the bet)
        assert txn_count_after > txn_count_before, "No new transaction created"
        
        # Find the bet transaction
        bet_txn = next((t for t in transactions if t["type"] == "bet" and "test-match-txn" in t.get("note", "")), None)
        assert bet_txn is not None, "Bet transaction not found"
        assert bet_txn["amount"] == 25.0
        print(f"Bet transaction verified: {bet_txn['transaction_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
