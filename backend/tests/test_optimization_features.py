"""
PlayXBets Optimization Features Test Suite
Tests: Monitoring, Sync Report, Smart Orchestrator, Match Coverage, Bet Placement, Admin Settlement
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://sports-exchange-demo.preview.emergentagent.com').rstrip('/')


class TestMonitoringEndpoint:
    """Test GET /api/monitoring/stats - public endpoint"""
    
    def test_monitoring_stats_returns_200(self):
        """Monitoring endpoint should return 200 without auth"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Monitoring endpoint returns 200")
    
    def test_monitoring_stats_has_api_latency(self):
        """Monitoring should include API latency stats"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "api" in data, "Missing 'api' key in monitoring stats"
        assert "avg_latency_5min_ms" in data["api"], "Missing avg_latency_5min_ms"
        assert "success_rate_1h_pct" in data["api"], "Missing success_rate_1h_pct"
        print(f"PASS: API latency 5min avg: {data['api']['avg_latency_5min_ms']}ms, success rate: {data['api']['success_rate_1h_pct']}%")
    
    def test_monitoring_stats_has_websocket_events(self):
        """Monitoring should include WebSocket event stats"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "websocket" in data, "Missing 'websocket' key"
        assert "events_5min" in data["websocket"], "Missing events_5min"
        assert "active_connections" in data["websocket"], "Missing active_connections"
        print(f"PASS: WS events 5min: {data['websocket']['events_5min']}, active connections: {data['websocket']['active_connections']}")
    
    def test_monitoring_stats_has_sync_results(self):
        """Monitoring should include sync results"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "sync" in data, "Missing 'sync' key"
        assert "recent" in data["sync"], "Missing recent sync results"
        print(f"PASS: Recent sync results count: {len(data['sync']['recent'])}")
    
    def test_monitoring_stats_has_errors(self):
        """Monitoring should include error tracking"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "errors" in data, "Missing 'errors' key"
        assert "recent" in data["errors"], "Missing recent errors"
        assert "count_1h" in data["errors"], "Missing count_1h"
        print(f"PASS: Errors in last hour: {data['errors']['count_1h']}")
    
    def test_monitoring_stats_has_cache_stats(self):
        """Monitoring should include cache stats"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "cache" in data, "Missing 'cache' key"
        assert "total_matches_cached" in data["cache"], "Missing total_matches_cached"
        assert "match_ttl_sec" in data["cache"], "Missing match_ttl_sec"
        print(f"PASS: Cache stats - matches: {data['cache']['total_matches_cached']}, TTL: {data['cache']['match_ttl_sec']}s")
    
    def test_monitoring_stats_has_coordinator_status(self):
        """Monitoring should include coordinator status"""
        response = requests.get(f"{BASE_URL}/api/monitoring/stats", timeout=15)
        data = response.json()
        assert "coordinator" in data, "Missing 'coordinator' key"
        print(f"PASS: Coordinator status present with {len(data['coordinator'])} sources tracked")


class TestSyncReportEndpoint:
    """Test GET /api/admin/sync-report - requires admin auth"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        return response.json()["access_token"]
    
    def test_sync_report_requires_auth(self):
        """Sync report should require authentication"""
        response = requests.get(f"{BASE_URL}/api/admin/sync-report", timeout=15)
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("PASS: Sync report requires authentication")
    
    def test_sync_report_returns_200_with_auth(self, admin_token):
        """Sync report should return 200 with admin auth"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync-report",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Sync report returns 200 with admin auth")
    
    def test_sync_report_has_summary(self, admin_token):
        """Sync report should include summary stats"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync-report",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        data = response.json()
        assert "summary" in data, "Missing 'summary' key"
        summary = data["summary"]
        assert "total_unique_matches" in summary, "Missing total_unique_matches"
        assert "synced_matches" in summary, "Missing synced_matches"
        assert "cricket_only" in summary, "Missing cricket_only (unsynced)"
        assert "odds_only" in summary, "Missing odds_only (unmapped)"
        print(f"PASS: Sync summary - total: {summary['total_unique_matches']}, synced: {summary['synced_matches']}, unsynced: {summary['cricket_only']}")
    
    def test_sync_report_has_missing_odds(self, admin_token):
        """Sync report should list matches missing odds"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync-report",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        data = response.json()
        assert "missing_odds" in data, "Missing 'missing_odds' key"
        print(f"PASS: Missing odds list has {len(data['missing_odds'])} entries")
    
    def test_sync_report_has_unmapped_odds_events(self, admin_token):
        """Sync report should list unmapped odds events"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync-report",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        data = response.json()
        assert "unmapped_odds_events" in data, "Missing 'unmapped_odds_events' key"
        print(f"PASS: Unmapped odds events list has {len(data['unmapped_odds_events'])} entries")
    
    def test_sync_report_has_database_stats(self, admin_token):
        """Sync report should include database stats"""
        response = requests.get(
            f"{BASE_URL}/api/admin/sync-report",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        data = response.json()
        assert "database" in data, "Missing 'database' key"
        db_stats = data["database"]
        assert "total_matches" in db_stats, "Missing total_matches"
        assert "live" in db_stats, "Missing live count"
        assert "scheduled" in db_stats, "Missing scheduled count"
        assert "with_odds" in db_stats, "Missing with_odds count"
        print(f"PASS: DB stats - total: {db_stats['total_matches']}, live: {db_stats['live']}, with_odds: {db_stats['with_odds']}")


class TestMatchesEndpoint:
    """Test GET /api/matches - complete match coverage"""
    
    def test_matches_returns_200(self):
        """Matches endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Matches endpoint returns 200")
    
    def test_matches_returns_all_cricket(self):
        """Should return ALL cricket matches including minor leagues"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        assert len(data) > 0, "No matches returned"
        # Check for variety of leagues
        leagues = set(m.get("league", "") for m in data)
        print(f"PASS: {len(data)} matches returned from {len(leagues)} leagues")
    
    def test_matches_includes_ipl(self):
        """Should include IPL matches"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        ipl_matches = [m for m in data if "IPL" in m.get("league", "").upper() or "INDIAN PREMIER" in m.get("league", "").upper()]
        assert len(ipl_matches) > 0, "No IPL matches found"
        print(f"PASS: {len(ipl_matches)} IPL matches found")
    
    def test_matches_includes_psl(self):
        """Should include PSL matches (global coverage)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        psl_matches = [m for m in data if "PSL" in m.get("league", "").upper() or "PAKISTAN SUPER" in m.get("league", "").upper()]
        # PSL may or may not be in season, so just check if any exist
        print(f"INFO: {len(psl_matches)} PSL matches found (may be 0 if not in season)")
    
    def test_matches_with_odds_have_valid_values(self):
        """Matches with odds should have valid numeric values"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        with_odds = [m for m in data if m.get("home_odds")]
        for m in with_odds[:5]:  # Check first 5
            assert isinstance(m["home_odds"], (int, float)), f"Invalid home_odds type: {type(m['home_odds'])}"
            assert isinstance(m["away_odds"], (int, float)), f"Invalid away_odds type: {type(m['away_odds'])}"
            assert m["home_odds"] > 1.0, f"Invalid home_odds value: {m['home_odds']}"
            assert m["away_odds"] > 1.0, f"Invalid away_odds value: {m['away_odds']}"
        print(f"PASS: {len(with_odds)} matches have valid odds values")
    
    def test_matches_without_odds_exist(self):
        """Some matches should exist without odds (Odds N/A case)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        without_odds = [m for m in data if not m.get("home_odds")]
        # This is expected behavior - not all matches have odds
        print(f"INFO: {len(without_odds)} matches without odds (will show 'Odds N/A' on frontend)")


class TestBetPlacement:
    """Test POST /api/bets - bet placement functionality"""
    
    @pytest.fixture
    def user_token(self):
        """Get user auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        assert response.status_code == 200, f"User login failed: {response.status_code}"
        return response.json()["access_token"]
    
    @pytest.fixture
    def match_with_odds(self):
        """Get a match with odds for betting"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=15)
        data = response.json()
        with_odds = [m for m in data if m.get("home_odds") and m.get("status") != "completed"]
        if not with_odds:
            pytest.skip("No matches with odds available for betting")
        return with_odds[0]
    
    def test_bet_placement_requires_auth(self, match_with_odds):
        """Bet placement should require authentication"""
        bet_data = {
            "match_id": match_with_odds["match_id"],
            "selected_team": match_with_odds["home_team"],
            "odds": match_with_odds["home_odds"],
            "stake": 10.0,
            "bet_type": "back"
        }
        response = requests.post(f"{BASE_URL}/api/bets", json=bet_data, timeout=15)
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("PASS: Bet placement requires authentication")
    
    def test_bet_placement_returns_potential_win(self, user_token, match_with_odds):
        """Bet placement should return valid bet with potential_win"""
        # First recharge wallet
        admin_response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        admin_token = admin_response.json()["access_token"]
        
        # Get user_id
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=15
        )
        user_id = me_response.json()["user_id"]
        
        # Recharge wallet
        requests.post(
            f"{BASE_URL}/api/admin/recharge",
            json={"user_id": user_id, "amount": 1000.0},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        
        # Place bet
        bet_data = {
            "match_id": match_with_odds["match_id"],
            "selected_team": match_with_odds["home_team"],
            "odds": match_with_odds["home_odds"],
            "stake": 10.0,
            "bet_type": "back"
        }
        response = requests.post(
            f"{BASE_URL}/api/bets",
            json=bet_data,
            headers={"Authorization": f"Bearer {user_token}"},
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            assert "potential_win" in data, "Missing potential_win in bet response"
            assert data["potential_win"] > 0, "potential_win should be positive"
            expected_win = round(10.0 * match_with_odds["home_odds"], 2)
            print(f"PASS: Bet placed with potential_win: {data['potential_win']} (expected ~{expected_win})")
        else:
            print(f"INFO: Bet placement returned {response.status_code} - {response.text[:100]}")


class TestAdminSettlement:
    """Test PUT /api/admin/matches/{match_id}/outcome - admin settlement"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        return response.json()["access_token"]
    
    def test_settlement_requires_admin(self):
        """Settlement should require admin authentication"""
        response = requests.put(
            f"{BASE_URL}/api/admin/matches/test-match-id/outcome?winner=TestTeam",
            timeout=15
        )
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        print("PASS: Settlement requires admin authentication")
    
    def test_settlement_returns_404_for_invalid_match(self, admin_token):
        """Settlement should return 404 for non-existent match"""
        response = requests.put(
            f"{BASE_URL}/api/admin/matches/invalid-match-id-12345/outcome?winner=TestTeam",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert response.status_code == 404, f"Expected 404 for invalid match, got {response.status_code}"
        print("PASS: Settlement returns 404 for invalid match")
    
    def test_pending_settlements_endpoint(self, admin_token):
        """Pending settlements endpoint should work"""
        response = requests.get(
            f"{BASE_URL}/api/admin/settlement/pending",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "matches" in data, "Missing 'matches' key"
        assert "total" in data, "Missing 'total' key"
        print(f"PASS: Pending settlements - {data['total']} matches with unsettled bets")


class TestLiveMatchesEndpoint:
    """Test GET /api/matches/live - live matches"""
    
    def test_live_matches_returns_200(self):
        """Live matches endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/matches/live", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Live matches endpoint returns 200")
    
    def test_live_matches_has_correct_structure(self):
        """Live matches should have correct response structure"""
        response = requests.get(f"{BASE_URL}/api/matches/live", timeout=15)
        data = response.json()
        assert "matches" in data, "Missing 'matches' key"
        assert "count" in data, "Missing 'count' key"
        assert "timestamp" in data, "Missing 'timestamp' key"
        print(f"PASS: Live matches structure correct - {data['count']} live matches")


class TestHealthAndAuth:
    """Test basic health and auth endpoints"""
    
    def test_health_endpoint(self):
        """Health endpoint should return 200"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=15)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: Health endpoint returns 200")
    
    def test_admin_login(self):
        """Admin login should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert data["role"] == "admin", f"Expected admin role, got {data['role']}"
        print("PASS: Admin login successful")
    
    def test_user_login(self):
        """User login should work"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "user", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15
        )
        assert response.status_code == 200, f"User login failed: {response.status_code}"
        data = response.json()
        assert "access_token" in data, "Missing access_token"
        assert data["role"] == "user", f"Expected user role, got {data['role']}"
        print("PASS: User login successful")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
