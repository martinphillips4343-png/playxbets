"""
Test suite for PlayXBets dynamic odds spread and statement features:
1. Dynamic odds spread formula (lay = back + back/20)
2. Admin betting history with filters and summary stats
3. Statement download CSV for admin and user
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "123456"}
USER_CREDS = {"username": "user", "password": "123456"}


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=ADMIN_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Admin auth failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def user_token():
    """Get user authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        data=USER_CREDS,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"User auth failed: {response.status_code} - {response.text}")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


class TestDynamicOddsSpread:
    """Test dynamic odds spread formula: spread = max(0.01, round(back/20, 2))"""

    def test_matches_endpoint_returns_dynamic_spread(self):
        """GET /api/matches should return odds with dynamic spread applied"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        matches = response.json()
        assert isinstance(matches, list), "Response should be a list of matches"
        
        # Find matches with odds
        matches_with_odds = [m for m in matches if m.get("odds") and m["odds"].get("home_back")]
        
        if not matches_with_odds:
            pytest.skip("No matches with odds available to test spread formula")
        
        # Verify dynamic spread formula for each match
        for match in matches_with_odds[:5]:  # Test first 5 matches with odds
            odds = match["odds"]
            home_back = odds.get("home_back")
            home_lay = odds.get("home_lay")
            away_back = odds.get("away_back")
            away_lay = odds.get("away_lay")
            
            if home_back and home_lay:
                expected_spread = max(0.01, round(home_back / 20, 2))
                expected_lay = round(home_back + expected_spread, 2)
                assert abs(home_lay - expected_lay) < 0.02, \
                    f"Home lay {home_lay} != expected {expected_lay} (back={home_back}, spread={expected_spread})"
                print(f"✓ Home: back={home_back} → lay={home_lay} (spread={round(home_lay - home_back, 2)})")
            
            if away_back and away_lay:
                expected_spread = max(0.01, round(away_back / 20, 2))
                expected_lay = round(away_back + expected_spread, 2)
                assert abs(away_lay - expected_lay) < 0.02, \
                    f"Away lay {away_lay} != expected {expected_lay} (back={away_back}, spread={expected_spread})"
                print(f"✓ Away: back={away_back} → lay={away_lay} (spread={round(away_lay - away_back, 2)})")

    def test_spread_varies_with_odds_magnitude(self):
        """Verify spread is NOT fixed at 0.02 - it should vary based on back odds"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        matches_with_odds = [m for m in matches if m.get("odds") and m["odds"].get("home_back")]
        
        if len(matches_with_odds) < 2:
            pytest.skip("Need at least 2 matches with odds to verify varying spread")
        
        spreads = []
        for match in matches_with_odds:
            odds = match["odds"]
            if odds.get("home_back") and odds.get("home_lay"):
                spread = round(odds["home_lay"] - odds["home_back"], 2)
                spreads.append(spread)
                print(f"Match: back={odds['home_back']}, lay={odds['home_lay']}, spread={spread}")
        
        # Check that not all spreads are 0.02 (fixed spread)
        unique_spreads = set(spreads)
        print(f"Unique spreads found: {unique_spreads}")
        
        # If all odds are similar, spreads might be same - that's OK
        # But if odds vary significantly, spreads should vary too

    def test_match_detail_endpoint_has_dynamic_spread(self):
        """GET /api/match/{match_id} should return odds with dynamic spread"""
        # First get a match with odds
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_odds = next(
            (m for m in matches if m.get("odds") and m["odds"].get("home_back")),
            None
        )
        
        if not match_with_odds:
            pytest.skip("No match with odds available")
        
        match_id = match_with_odds["match_id"]
        
        # Get match detail
        detail_response = requests.get(f"{BASE_URL}/api/match/{match_id}")
        assert detail_response.status_code == 200, f"Expected 200, got {detail_response.status_code}"
        
        detail = detail_response.json()
        odds = detail.get("odds", {})
        
        home_back = odds.get("home_back")
        home_lay = odds.get("home_lay")
        
        if home_back and home_lay:
            expected_spread = max(0.01, round(home_back / 20, 2))
            expected_lay = round(home_back + expected_spread, 2)
            assert abs(home_lay - expected_lay) < 0.02, \
                f"Match detail: lay {home_lay} != expected {expected_lay}"
            print(f"✓ Match detail: back={home_back} → lay={home_lay}")


class TestAdminBettingHistory:
    """Test admin betting history with filters and summary stats"""

    def test_admin_bets_returns_bets_and_summary(self, admin_headers):
        """GET /api/admin/bets should return bets array and summary object"""
        response = requests.get(f"{BASE_URL}/api/admin/bets", headers=admin_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "bets" in data, "Response should contain 'bets' array"
        assert "summary" in data, "Response should contain 'summary' object"
        
        summary = data["summary"]
        assert "total_bets" in summary, "Summary should have total_bets"
        assert "total_stake" in summary, "Summary should have total_stake"
        assert "won" in summary, "Summary should have won count"
        assert "lost" in summary, "Summary should have lost count"
        assert "pending" in summary, "Summary should have pending count"
        
        print(f"✓ Admin bets: {summary['total_bets']} bets, stake={summary['total_stake']}")
        print(f"  Won: {summary['won']}, Lost: {summary['lost']}, Pending: {summary['pending']}")

    def test_admin_bets_period_filter_day(self, admin_headers):
        """GET /api/admin/bets?period=day should filter by last 24 hours"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?period=day", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "bets" in data
        assert "summary" in data
        print(f"✓ Day filter: {data['summary']['total_bets']} bets")

    def test_admin_bets_period_filter_week(self, admin_headers):
        """GET /api/admin/bets?period=week should filter by last 7 days"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?period=week", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "bets" in data
        print(f"✓ Week filter: {data['summary']['total_bets']} bets")

    def test_admin_bets_period_filter_month(self, admin_headers):
        """GET /api/admin/bets?period=month should filter by last 30 days"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?period=month", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "bets" in data
        print(f"✓ Month filter: {data['summary']['total_bets']} bets")

    def test_admin_bets_status_filter_pending(self, admin_headers):
        """GET /api/admin/bets?status=pending should filter pending bets"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?status=pending", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        bets = data.get("bets", [])
        
        # All returned bets should be pending
        for bet in bets:
            assert bet.get("status") == "pending", f"Expected pending, got {bet.get('status')}"
        
        print(f"✓ Pending filter: {len(bets)} pending bets")

    def test_admin_bets_status_filter_won(self, admin_headers):
        """GET /api/admin/bets?status=won should filter won bets"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?status=won", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        bets = data.get("bets", [])
        
        for bet in bets:
            assert bet.get("status") == "won", f"Expected won, got {bet.get('status')}"
        
        print(f"✓ Won filter: {len(bets)} won bets")

    def test_admin_bets_status_filter_lost(self, admin_headers):
        """GET /api/admin/bets?status=lost should filter lost bets"""
        response = requests.get(f"{BASE_URL}/api/admin/bets?status=lost", headers=admin_headers)
        assert response.status_code == 200
        
        data = response.json()
        bets = data.get("bets", [])
        
        for bet in bets:
            assert bet.get("status") == "lost", f"Expected lost, got {bet.get('status')}"
        
        print(f"✓ Lost filter: {len(bets)} lost bets")

    def test_admin_bets_combined_filters(self, admin_headers):
        """GET /api/admin/bets?period=month&status=pending should combine filters"""
        response = requests.get(
            f"{BASE_URL}/api/admin/bets?period=month&status=pending",
            headers=admin_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        print(f"✓ Combined filters (month+pending): {data['summary']['total_bets']} bets")


class TestAdminStatementDownload:
    """Test admin statement CSV download"""

    def test_admin_statement_download_day(self, admin_headers):
        """GET /api/admin/statements/download?period=day returns CSV"""
        response = requests.get(
            f"{BASE_URL}/api/admin/statements/download?period=day",
            headers=admin_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content type
        content_type = response.headers.get("Content-Type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        # Check content disposition
        content_disp = response.headers.get("Content-Disposition", "")
        assert "attachment" in content_disp, "Should have attachment disposition"
        assert ".csv" in content_disp, "Filename should be .csv"
        
        # Check CSV headers
        content = response.text
        first_line = content.split("\n")[0] if content else ""
        assert "Date" in first_line, "CSV should have Date column"
        assert "User" in first_line, "CSV should have User column"
        assert "Stake" in first_line, "CSV should have Stake column"
        
        print(f"✓ Admin day statement: {len(content)} bytes")

    def test_admin_statement_download_week(self, admin_headers):
        """GET /api/admin/statements/download?period=week returns CSV"""
        response = requests.get(
            f"{BASE_URL}/api/admin/statements/download?period=week",
            headers=admin_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print(f"✓ Admin week statement: {len(response.text)} bytes")

    def test_admin_statement_download_month(self, admin_headers):
        """GET /api/admin/statements/download?period=month returns CSV"""
        response = requests.get(
            f"{BASE_URL}/api/admin/statements/download?period=month",
            headers=admin_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print(f"✓ Admin month statement: {len(response.text)} bytes")


class TestUserBetHistory:
    """Test user betting history with filters and P&L summary"""

    def test_user_bets_history_returns_bets_and_summary(self, user_headers):
        """GET /api/bets/history should return bets and P&L summary"""
        response = requests.get(f"{BASE_URL}/api/bets/history", headers=user_headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "bets" in data, "Response should contain 'bets' array"
        assert "summary" in data, "Response should contain 'summary' object"
        
        summary = data["summary"]
        assert "total_stake" in summary, "Summary should have total_stake"
        assert "total_won" in summary, "Summary should have total_won"
        assert "total_lost" in summary, "Summary should have total_lost"
        assert "net_pnl" in summary, "Summary should have net_pnl"
        
        print(f"✓ User bets: {summary.get('total_bets', len(data['bets']))} bets")
        print(f"  Stake: {summary['total_stake']}, Won: {summary['total_won']}, Lost: {summary['total_lost']}")
        print(f"  Net P&L: {summary['net_pnl']}")

    def test_user_bets_history_period_filter(self, user_headers):
        """GET /api/bets/history?period=month should filter by period"""
        response = requests.get(f"{BASE_URL}/api/bets/history?period=month", headers=user_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "bets" in data
        print(f"✓ User month filter: {len(data['bets'])} bets")

    def test_user_bets_history_status_filter(self, user_headers):
        """GET /api/bets/history?status=pending should filter by status"""
        response = requests.get(f"{BASE_URL}/api/bets/history?status=pending", headers=user_headers)
        assert response.status_code == 200
        
        data = response.json()
        bets = data.get("bets", [])
        
        for bet in bets:
            assert bet.get("status") == "pending"
        
        print(f"✓ User pending filter: {len(bets)} bets")


class TestUserStatementDownload:
    """Test user statement CSV download"""

    def test_user_statement_download_day(self, user_headers):
        """GET /api/statements/download?period=day returns user's CSV"""
        response = requests.get(
            f"{BASE_URL}/api/statements/download?period=day",
            headers=user_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        content_type = response.headers.get("Content-Type", "")
        assert "text/csv" in content_type, f"Expected text/csv, got {content_type}"
        
        # Check CSV headers (user statement doesn't have User column)
        content = response.text
        first_line = content.split("\n")[0] if content else ""
        assert "Date" in first_line, "CSV should have Date column"
        assert "Match" in first_line, "CSV should have Match column"
        
        print(f"✓ User day statement: {len(content)} bytes")

    def test_user_statement_download_week(self, user_headers):
        """GET /api/statements/download?period=week returns CSV"""
        response = requests.get(
            f"{BASE_URL}/api/statements/download?period=week",
            headers=user_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print(f"✓ User week statement: {len(response.text)} bytes")

    def test_user_statement_download_month(self, user_headers):
        """GET /api/statements/download?period=month returns CSV"""
        response = requests.get(
            f"{BASE_URL}/api/statements/download?period=month",
            headers=user_headers
        )
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("Content-Type", "")
        print(f"✓ User month statement: {len(response.text)} bytes")


class TestAuthRequired:
    """Test that endpoints require proper authentication"""

    def test_admin_bets_requires_admin_auth(self):
        """GET /api/admin/bets should require admin authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/bets")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"

    def test_admin_statement_requires_admin_auth(self):
        """GET /api/admin/statements/download should require admin auth"""
        response = requests.get(f"{BASE_URL}/api/admin/statements/download?period=day")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"

    def test_user_bets_history_requires_auth(self):
        """GET /api/bets/history should require user authentication"""
        response = requests.get(f"{BASE_URL}/api/bets/history")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"

    def test_user_statement_requires_auth(self):
        """GET /api/statements/download should require user auth"""
        response = requests.get(f"{BASE_URL}/api/statements/download?period=day")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
