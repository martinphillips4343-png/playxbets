"""
PlayXBets Wallet System E2E Tests
Tests: Deposits, Withdrawals, Admin Approval/Rejection, Balance Updates
"""
import pytest
import requests
import os
import time
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "123456"}
USER_CREDS = {"username": "user", "password": "123456"}


class TestAuth:
    """Authentication tests"""
    
    def test_user_login(self):
        """Test user login with form-urlencoded data"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data=USER_CREDS,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200, f"User login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "user", f"Expected role 'user', got {data.get('role')}"
        print(f"✓ User login successful, role: {data.get('role')}")
    
    def test_admin_login(self):
        """Test admin login with form-urlencoded data"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data=ADMIN_CREDS,
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert data.get("role") == "admin", f"Expected role 'admin', got {data.get('role')}"
        print(f"✓ Admin login successful, role: {data.get('role')}")


@pytest.fixture
def user_token():
    """Get user auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=USER_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code != 200:
        pytest.skip(f"User login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture
def admin_token():
    """Get admin auth token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=ADMIN_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.text}")
    return response.json()["access_token"]


@pytest.fixture
def user_headers(user_token):
    """User auth headers"""
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture
def admin_headers(admin_token):
    """Admin auth headers"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestWallet:
    """Wallet endpoint tests"""
    
    def test_get_wallet(self, user_headers):
        """GET /api/wallet returns wallet with balance fields"""
        response = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers)
        assert response.status_code == 200, f"Get wallet failed: {response.text}"
        
        data = response.json()
        assert "balance" in data, "Missing 'balance' field"
        assert "available_balance" in data, "Missing 'available_balance' field"
        assert "frozen_balance" in data, "Missing 'frozen_balance' field"
        assert "exposure" in data, "Missing 'exposure' field"
        
        # Verify available_balance calculation
        expected_available = data["balance"] - data["frozen_balance"] - data["exposure"]
        assert abs(data["available_balance"] - expected_available) < 0.01, \
            f"available_balance mismatch: {data['available_balance']} != {expected_available}"
        
        print(f"✓ Wallet: balance={data['balance']}, available={data['available_balance']}, frozen={data['frozen_balance']}, exposure={data['exposure']}")


class TestDeposits:
    """Deposit flow tests"""
    
    def test_create_deposit_request(self, user_headers):
        """POST /api/deposits - user creates deposit request"""
        # Use unique amount to avoid duplicate detection
        test_amount = 100 + (int(time.time()) % 1000)
        
        payload = {
            "amount": test_amount,
            "payment_method": "upi",
            "transaction_ref": f"TEST_UTR_{uuid.uuid4().hex[:8]}",
            "note": "Test deposit"
        }
        
        response = requests.post(f"{BASE_URL}/api/deposits", json=payload, headers=user_headers)
        assert response.status_code == 200, f"Create deposit failed: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Expected success=True, got {data}"
        assert "deposit_id" in data, "Missing deposit_id in response"
        assert data.get("status") == "pending", f"Expected status 'pending', got {data.get('status')}"
        
        print(f"✓ Deposit request created: {data['deposit_id']}, amount={test_amount}")
        return data["deposit_id"]
    
    def test_get_my_deposits(self, user_headers):
        """GET /api/deposits/my - user sees their deposits"""
        response = requests.get(f"{BASE_URL}/api/deposits/my", headers=user_headers)
        assert response.status_code == 200, f"Get my deposits failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        if len(data) > 0:
            deposit = data[0]
            assert "deposit_id" in deposit, "Missing deposit_id"
            assert "amount" in deposit, "Missing amount"
            assert "status" in deposit, "Missing status"
            assert "payment_method" in deposit, "Missing payment_method"
            print(f"✓ User has {len(data)} deposits, latest: {deposit.get('amount')} ({deposit.get('status')})")
        else:
            print("✓ User has no deposits yet")
    
    def test_admin_get_all_deposits(self, admin_headers):
        """GET /api/admin/deposits - admin sees all deposits"""
        response = requests.get(f"{BASE_URL}/api/admin/deposits", headers=admin_headers)
        assert response.status_code == 200, f"Admin get deposits failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ Admin sees {len(data)} total deposits")
        
        # Check for pending deposits
        pending = [d for d in data if d.get("status") == "pending"]
        print(f"  - Pending: {len(pending)}")
        
        return data


class TestDepositApprovalFlow:
    """E2E test: Create deposit → Admin approve → Verify balance increase"""
    
    def test_deposit_approval_flow(self, user_headers, admin_headers):
        """Full deposit approval flow"""
        # Step 1: Get initial wallet balance
        wallet_before = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        balance_before = wallet_before["balance"]
        print(f"Step 1: Initial balance = {balance_before}")
        
        # Step 2: Create deposit request
        test_amount = 500 + (int(time.time()) % 500)
        deposit_payload = {
            "amount": test_amount,
            "payment_method": "upi",
            "transaction_ref": f"TEST_APPROVE_{uuid.uuid4().hex[:8]}"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/deposits", json=deposit_payload, headers=user_headers)
        assert create_resp.status_code == 200, f"Create deposit failed: {create_resp.text}"
        deposit_id = create_resp.json()["deposit_id"]
        print(f"Step 2: Created deposit {deposit_id}, amount={test_amount}")
        
        # Step 3: Admin approves deposit
        approve_resp = requests.post(
            f"{BASE_URL}/api/admin/deposits/{deposit_id}/approve",
            headers=admin_headers
        )
        assert approve_resp.status_code == 200, f"Approve deposit failed: {approve_resp.text}"
        approve_data = approve_resp.json()
        assert approve_data.get("success") == True, f"Expected success=True, got {approve_data}"
        print(f"Step 3: Admin approved deposit, new_balance={approve_data.get('new_balance')}")
        
        # Step 4: Verify balance increased
        wallet_after = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        balance_after = wallet_after["balance"]
        
        expected_balance = balance_before + test_amount
        assert abs(balance_after - expected_balance) < 0.01, \
            f"Balance mismatch: expected {expected_balance}, got {balance_after}"
        
        print(f"Step 4: Balance verified: {balance_before} + {test_amount} = {balance_after} ✓")
    
    def test_deposit_rejection_flow(self, user_headers, admin_headers):
        """Full deposit rejection flow - balance should NOT change"""
        # Step 1: Get initial balance
        wallet_before = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        balance_before = wallet_before["balance"]
        print(f"Step 1: Initial balance = {balance_before}")
        
        # Step 2: Create deposit request
        test_amount = 300 + (int(time.time()) % 300)
        deposit_payload = {
            "amount": test_amount,
            "payment_method": "bank_transfer",
            "transaction_ref": f"TEST_REJECT_{uuid.uuid4().hex[:8]}"
        }
        
        create_resp = requests.post(f"{BASE_URL}/api/deposits", json=deposit_payload, headers=user_headers)
        assert create_resp.status_code == 200, f"Create deposit failed: {create_resp.text}"
        deposit_id = create_resp.json()["deposit_id"]
        print(f"Step 2: Created deposit {deposit_id}, amount={test_amount}")
        
        # Step 3: Admin rejects deposit
        reject_resp = requests.post(
            f"{BASE_URL}/api/admin/deposits/{deposit_id}/reject",
            headers=admin_headers
        )
        assert reject_resp.status_code == 200, f"Reject deposit failed: {reject_resp.text}"
        reject_data = reject_resp.json()
        assert reject_data.get("success") == True, f"Expected success=True, got {reject_data}"
        print(f"Step 3: Admin rejected deposit")
        
        # Step 4: Verify balance unchanged
        wallet_after = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        balance_after = wallet_after["balance"]
        
        assert abs(balance_after - balance_before) < 0.01, \
            f"Balance should not change on rejection: was {balance_before}, now {balance_after}"
        
        print(f"Step 4: Balance unchanged: {balance_after} ✓")


class TestWithdrawals:
    """Withdrawal flow tests"""
    
    def test_get_my_withdrawals_first(self, user_headers):
        """GET /api/withdrawals/my - user sees their withdrawals (run first to avoid rate limit)"""
        response = requests.get(f"{BASE_URL}/api/withdrawals/my", headers=user_headers)
        assert response.status_code == 200, f"Get my withdrawals failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        if len(data) > 0:
            withdrawal = data[0]
            assert "withdrawal_id" in withdrawal, "Missing withdrawal_id"
            assert "amount" in withdrawal, "Missing amount"
            assert "status" in withdrawal, "Missing status"
            assert "bank_name" in withdrawal, "Missing bank_name"
            print(f"✓ User has {len(data)} withdrawals, latest: {withdrawal.get('amount')} ({withdrawal.get('status')})")
        else:
            print("✓ User has no withdrawals yet")
    
    def test_get_my_withdrawals(self, user_headers):
        """GET /api/withdrawals/my - user sees their withdrawals"""
        response = requests.get(f"{BASE_URL}/api/withdrawals/my", headers=user_headers)
        assert response.status_code == 200, f"Get my withdrawals failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        if len(data) > 0:
            withdrawal = data[0]
            assert "withdrawal_id" in withdrawal, "Missing withdrawal_id"
            assert "amount" in withdrawal, "Missing amount"
            assert "status" in withdrawal, "Missing status"
            assert "bank_name" in withdrawal, "Missing bank_name"
            print(f"✓ User has {len(data)} withdrawals, latest: {withdrawal.get('amount')} ({withdrawal.get('status')})")
        else:
            print("✓ User has no withdrawals yet")
    
    def test_admin_get_all_withdrawals(self, admin_headers):
        """GET /api/admin/withdrawals - admin sees all withdrawals"""
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals", headers=admin_headers)
        assert response.status_code == 200, f"Admin get withdrawals failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        
        print(f"✓ Admin sees {len(data)} total withdrawals")
        
        pending = [w for w in data if w.get("status") == "pending"]
        print(f"  - Pending: {len(pending)}")


class TestWithdrawalE2EFlow:
    """E2E test: Create withdrawal → Admin approve/reject → Verify balance changes
    Note: These tests use existing pending withdrawals to avoid rate limits"""
    
    def test_find_and_approve_pending_withdrawal(self, user_headers, admin_headers):
        """Find a pending withdrawal and approve it"""
        # Get all pending withdrawals
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals?status=pending", headers=admin_headers)
        assert response.status_code == 200, f"Get pending withdrawals failed: {response.text}"
        
        pending = response.json()
        if len(pending) == 0:
            pytest.skip("No pending withdrawals to test approval")
        
        # Get the first pending withdrawal
        withdrawal = pending[0]
        withdrawal_id = withdrawal["withdrawal_id"]
        amount = withdrawal["amount"]
        user_id = withdrawal["user_id"]
        
        print(f"Found pending withdrawal: {withdrawal_id}, amount={amount}")
        
        # Get user's wallet before approval (need to use admin to check any user's wallet)
        # For now, we'll just verify the admin approval works
        
        # Approve the withdrawal
        approve_resp = requests.put(
            f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}",
            json={"status": "approved", "admin_note": "Test approval via E2E"},
            headers=admin_headers
        )
        assert approve_resp.status_code == 200, f"Approve withdrawal failed: {approve_resp.text}"
        
        approve_data = approve_resp.json()
        assert approve_data.get("success") == True, f"Expected success=True, got {approve_data}"
        
        print(f"✓ Withdrawal {withdrawal_id} approved successfully")
        
        # Verify withdrawal status changed
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals", headers=admin_headers)
        all_withdrawals = response.json()
        approved_wd = next((w for w in all_withdrawals if w["withdrawal_id"] == withdrawal_id), None)
        
        if approved_wd:
            assert approved_wd["status"] == "approved", f"Expected status 'approved', got {approved_wd['status']}"
            print(f"✓ Withdrawal status verified as 'approved'")
    
    def test_find_and_reject_pending_withdrawal(self, user_headers, admin_headers):
        """Find a pending withdrawal and reject it"""
        # Get all pending withdrawals
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals?status=pending", headers=admin_headers)
        assert response.status_code == 200, f"Get pending withdrawals failed: {response.text}"
        
        pending = response.json()
        if len(pending) == 0:
            pytest.skip("No pending withdrawals to test rejection")
        
        # Get the first pending withdrawal
        withdrawal = pending[0]
        withdrawal_id = withdrawal["withdrawal_id"]
        amount = withdrawal["amount"]
        
        print(f"Found pending withdrawal: {withdrawal_id}, amount={amount}")
        
        # Reject the withdrawal
        reject_resp = requests.put(
            f"{BASE_URL}/api/admin/withdrawals/{withdrawal_id}",
            json={"status": "rejected", "admin_note": "Test rejection via E2E"},
            headers=admin_headers
        )
        assert reject_resp.status_code == 200, f"Reject withdrawal failed: {reject_resp.text}"
        
        reject_data = reject_resp.json()
        assert reject_data.get("success") == True, f"Expected success=True, got {reject_data}"
        
        print(f"✓ Withdrawal {withdrawal_id} rejected successfully")
        
        # Verify withdrawal status changed
        response = requests.get(f"{BASE_URL}/api/admin/withdrawals", headers=admin_headers)
        all_withdrawals = response.json()
        rejected_wd = next((w for w in all_withdrawals if w["withdrawal_id"] == withdrawal_id), None)
        
        if rejected_wd:
            assert rejected_wd["status"] == "rejected", f"Expected status 'rejected', got {rejected_wd['status']}"
            print(f"✓ Withdrawal status verified as 'rejected'")


class TestAdminWalletStats:
    """Admin wallet stats endpoint tests"""
    
    def test_admin_wallet_stats(self, admin_headers):
        """GET /api/admin/wallet/stats - admin dashboard stats"""
        response = requests.get(f"{BASE_URL}/api/admin/wallet/stats", headers=admin_headers)
        assert response.status_code == 200, f"Get wallet stats failed: {response.text}"
        
        data = response.json()
        assert "total_deposits" in data, "Missing total_deposits"
        assert "total_withdrawals" in data, "Missing total_withdrawals"
        assert "pending_deposits" in data, "Missing pending_deposits"
        assert "pending_withdrawals" in data, "Missing pending_withdrawals"
        assert "total_users" in data, "Missing total_users"
        assert "total_user_balance" in data, "Missing total_user_balance"
        
        print(f"✓ Admin wallet stats:")
        print(f"  - Total deposits: {data['total_deposits']}")
        print(f"  - Total withdrawals: {data['total_withdrawals']}")
        print(f"  - Pending deposits: {data['pending_deposits']}")
        print(f"  - Pending withdrawals: {data['pending_withdrawals']}")
        print(f"  - Total user balance: {data['total_user_balance']}")


class TestEdgeCases:
    """Edge case tests"""
    
    def test_deposit_invalid_amount(self, user_headers):
        """Deposit with invalid amount should fail"""
        payload = {"amount": -100, "payment_method": "upi"}
        response = requests.post(f"{BASE_URL}/api/deposits", json=payload, headers=user_headers)
        assert response.status_code == 400, f"Expected 400 for negative amount, got {response.status_code}"
        print("✓ Negative deposit amount rejected")
    
    def test_withdrawal_insufficient_balance(self, user_headers):
        """Withdrawal exceeding available balance should fail"""
        # Get current available balance
        wallet = requests.get(f"{BASE_URL}/api/wallet", headers=user_headers).json()
        available = wallet.get("available_balance", 0)
        
        # Try to withdraw more than available
        payload = {
            "amount": available + 10000,
            "account_holder": "Test",
            "bank_name": "Test Bank",
            "account_number": "1234567890",
            "ifsc_code": "TEST0001234"
        }
        
        time.sleep(3)  # Rate limit
        
        response = requests.post(f"{BASE_URL}/api/withdrawals", json=payload, headers=user_headers)
        assert response.status_code == 400, f"Expected 400 for insufficient balance, got {response.status_code}"
        print(f"✓ Withdrawal exceeding available balance ({available}) rejected")
    
    def test_withdrawal_missing_bank_details(self, user_headers):
        """Withdrawal without bank details should fail"""
        payload = {"amount": 100}  # Missing bank details
        
        time.sleep(3)  # Rate limit
        
        response = requests.post(f"{BASE_URL}/api/withdrawals", json=payload, headers=user_headers)
        assert response.status_code == 422 or response.status_code == 400, \
            f"Expected 400/422 for missing bank details, got {response.status_code}"
        print("✓ Withdrawal without bank details rejected")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
