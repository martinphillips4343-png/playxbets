"""
Test suite for withdrawable balance feature (iteration 21)
Tests:
1. GET /api/wallet returns withdrawable_balance and total_winnings fields
2. GET /api/transactions/my returns user transactions (previously missing endpoint)
3. POST /api/withdrawals - validates against withdrawable_balance (only winnings can be withdrawn)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def get_user_token():
    """Get user auth token with retry"""
    for attempt in range(3):
        try:
            resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                data={"username": "user", "password": "123456"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
        except Exception as e:
            print(f"Login attempt {attempt+1} failed: {e}")
        import time
        time.sleep(2)
    return None


def get_admin_token():
    """Get admin auth token with retry"""
    for attempt in range(3):
        try:
            resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                data={"username": "admin", "password": "123456"},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
        except Exception as e:
            print(f"Admin login attempt {attempt+1} failed: {e}")
        import time
        time.sleep(2)
    return None


# ==================== USER WALLET TESTS ====================

def test_wallet_returns_withdrawable_balance_field():
    """GET /api/wallet should return withdrawable_balance field"""
    token = get_user_token()
    assert token, "User login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/wallet",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    # Verify new fields exist
    assert "withdrawable_balance" in data, "withdrawable_balance field missing from wallet response"
    assert "total_winnings" in data, "total_winnings field missing from wallet response"
    
    # Verify existing fields still present
    assert "balance" in data, "balance field missing"
    assert "available_balance" in data, "available_balance field missing"
    assert "frozen_balance" in data, "frozen_balance field missing"
    assert "exposure" in data, "exposure field missing"
    
    # Verify types
    assert isinstance(data["withdrawable_balance"], (int, float)), "withdrawable_balance should be numeric"
    assert isinstance(data["total_winnings"], (int, float)), "total_winnings should be numeric"
    
    print(f"Wallet data: balance={data['balance']}, available={data['available_balance']}, withdrawable={data['withdrawable_balance']}, total_winnings={data['total_winnings']}")


def test_transactions_my_endpoint_exists():
    """GET /api/transactions/my should return user transactions (this was the missing endpoint)"""
    token = get_user_token()
    assert token, "User login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/transactions/my",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}. This endpoint was previously missing causing the zero-balance bug."
    
    data = response.json()
    assert isinstance(data, list), "transactions/my should return a list"
    
    print(f"User has {len(data)} transactions")
    
    # If there are transactions, verify structure
    if len(data) > 0:
        tx = data[0]
        assert "type" in tx, "Transaction should have type field"
        assert "amount" in tx, "Transaction should have amount field"
        print(f"Sample transaction: type={tx.get('type')}, amount={tx.get('amount')}")


def test_wallet_withdrawable_balance_calculation():
    """Verify withdrawable_balance is calculated correctly: total_winnings - withdrawn - pending"""
    token = get_user_token()
    assert token, "User login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/wallet",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    
    data = response.json()
    withdrawable = data.get("withdrawable_balance", 0)
    total_winnings = data.get("total_winnings", 0)
    available = data.get("available_balance", 0)
    
    # withdrawable should be <= total_winnings (can't withdraw more than won)
    assert withdrawable <= total_winnings or total_winnings == 0, \
        f"withdrawable ({withdrawable}) should be <= total_winnings ({total_winnings})"
    
    # withdrawable should be <= available_balance (can't withdraw more than available)
    assert withdrawable <= available + 0.01, \
        f"withdrawable ({withdrawable}) should be <= available ({available})"
    
    print(f"Withdrawable balance check passed: withdrawable={withdrawable}, total_winnings={total_winnings}, available={available}")


def test_withdrawal_exceeding_withdrawable_fails():
    """POST /api/withdrawals with amount > withdrawable_balance should fail with specific error"""
    token = get_user_token()
    assert token, "User login failed"
    
    # First get current withdrawable balance
    wallet_resp = requests.get(
        f"{BASE_URL}/api/wallet",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert wallet_resp.status_code == 200
    
    wallet = wallet_resp.json()
    withdrawable = wallet.get("withdrawable_balance", 0)
    
    # Try to withdraw more than withdrawable
    excessive_amount = withdrawable + 10000  # Way more than withdrawable
    
    withdrawal_data = {
        "amount": excessive_amount,
        "account_holder": "Test User",
        "bank_name": "Test Bank",
        "account_number": "1234567890",
        "ifsc_code": "TEST0001234"
    }
    
    response = requests.post(
        f"{BASE_URL}/api/withdrawals",
        json=withdrawal_data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    
    # Should fail with 400 and specific error message
    assert response.status_code == 400, f"Expected 400 for excessive withdrawal, got {response.status_code}"
    
    error_detail = response.json().get("detail", "")
    assert "Only winning amounts can be withdrawn" in error_detail or "Insufficient" in error_detail, \
        f"Expected 'Only winning amounts can be withdrawn' error, got: {error_detail}"
    
    print(f"Correctly rejected withdrawal of {excessive_amount} (withdrawable: {withdrawable})")


# ==================== ADMIN TESTS ====================

def test_admin_get_withdrawals():
    """GET /api/admin/withdrawals should work for admin"""
    token = get_admin_token()
    assert token, "Admin login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/admin/withdrawals",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert isinstance(data, list), "Should return list of withdrawals"
    
    print(f"Admin sees {len(data)} withdrawals")
    
    # Check structure if there are withdrawals
    if len(data) > 0:
        w = data[0]
        assert "withdrawal_id" in w, "Should have withdrawal_id"
        assert "amount" in w, "Should have amount"
        assert "status" in w, "Should have status"
        assert "username" in w, "Should have username"


def test_admin_wallet_stats():
    """GET /api/admin/wallet/stats should return stats"""
    token = get_admin_token()
    assert token, "Admin login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/admin/wallet/stats",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert "total_deposits" in data, "Should have total_deposits"
    assert "total_withdrawals" in data, "Should have total_withdrawals"
    assert "pending_withdrawals" in data, "Should have pending_withdrawals"
    
    print(f"Admin stats: deposits={data.get('total_deposits')}, withdrawals={data.get('total_withdrawals')}, pending={data.get('pending_withdrawals')}")


# ==================== DEPOSITS TESTS ====================

def test_get_my_deposits():
    """GET /api/deposits/my should return user's deposit history"""
    token = get_user_token()
    assert token, "User login failed"
    
    response = requests.get(
        f"{BASE_URL}/api/deposits/my",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    assert isinstance(data, list), "Should return list of deposits"
    
    print(f"User has {len(data)} deposits")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
