"""
Test suite for PlayXBets Homepage Redesign Features
Tests: Filter tabs, cricket-only matches, bet-totals endpoint, match sorting, completed match filtering
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHomepageRedesign:
    """Tests for homepage redesign features"""
    
    def test_matches_endpoint_returns_cricket_only(self):
        """Verify /api/matches returns only cricket matches"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        matches = response.json()
        assert isinstance(matches, list), "Response should be a list"
        
        # All matches should be cricket
        for match in matches:
            assert match.get("sport") == "cricket", f"Expected cricket, got {match.get('sport')}"
        
        print(f"✓ All {len(matches)} matches are cricket")
    
    def test_matches_no_completed_matches(self):
        """Verify /api/matches does NOT return completed/ended/finished matches"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        
        for match in matches:
            status = match.get("status", "").lower()
            assert status not in ["completed", "ended", "finished"], \
                f"Found completed match: {match.get('home_team')} vs {match.get('away_team')} - status: {status}"
            
            # Also check matchEnded flag
            assert match.get("matchEnded") != True, \
                f"Found matchEnded=True: {match.get('home_team')} vs {match.get('away_team')}"
        
        print(f"✓ No completed matches in {len(matches)} results")
    
    def test_matches_have_valid_dates(self):
        """Verify matches have valid commence_time dates"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        
        if len(matches) < 2:
            pytest.skip("Not enough matches to test")
        
        # Verify all matches have valid dates
        valid_dates = 0
        for match in matches:
            commence = match.get("commence_time")
            if commence:
                try:
                    dt = datetime.fromisoformat(commence.replace("Z", "+00:00"))
                    valid_dates += 1
                except:
                    pass
        
        # At least 90% should have valid dates
        assert valid_dates >= len(matches) * 0.9, \
            f"Only {valid_dates}/{len(matches)} matches have valid dates"
        
        print(f"✓ {valid_dates}/{len(matches)} matches have valid dates")
    
    def test_matches_have_required_fields(self):
        """Verify matches have all required fields for homepage display"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        
        required_fields = ["match_id", "home_team", "away_team", "commence_time", "status", "sport"]
        
        for match in matches[:5]:  # Check first 5
            for field in required_fields:
                assert field in match, f"Missing field: {field}"
        
        print(f"✓ All required fields present")


class TestBetTotalsEndpoint:
    """Tests for /api/match/{match_id}/bet-totals endpoint"""
    
    def test_bet_totals_endpoint_exists(self):
        """Verify bet-totals endpoint returns proper response"""
        # Get a match ID first
        matches_response = requests.get(f"{BASE_URL}/api/matches")
        assert matches_response.status_code == 200
        
        matches = matches_response.json()
        if not matches:
            pytest.skip("No matches available")
        
        match_id = matches[0]["match_id"]
        
        # Test bet-totals endpoint
        response = requests.get(f"{BASE_URL}/api/match/{match_id}/bet-totals")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "match_id" in data
        assert "home_team" in data
        assert "away_team" in data
        assert "home_total" in data
        assert "away_total" in data
        
        print(f"✓ Bet totals endpoint working: home_total={data['home_total']}, away_total={data['away_total']}")
    
    def test_bet_totals_returns_numbers(self):
        """Verify bet-totals returns numeric values"""
        matches_response = requests.get(f"{BASE_URL}/api/matches")
        matches = matches_response.json()
        
        if not matches:
            pytest.skip("No matches available")
        
        match_id = matches[0]["match_id"]
        response = requests.get(f"{BASE_URL}/api/match/{match_id}/bet-totals")
        data = response.json()
        
        assert isinstance(data["home_total"], (int, float)), "home_total should be numeric"
        assert isinstance(data["away_total"], (int, float)), "away_total should be numeric"
        assert data["home_total"] >= 0, "home_total should be non-negative"
        assert data["away_total"] >= 0, "away_total should be non-negative"
        
        print(f"✓ Bet totals are valid numbers")
    
    def test_bet_totals_invalid_match_id(self):
        """Verify bet-totals returns 404 for invalid match ID"""
        response = requests.get(f"{BASE_URL}/api/match/invalid-match-id-12345/bet-totals")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print(f"✓ Returns 404 for invalid match ID")


class TestMatchDetailEndpoint:
    """Tests for /api/match/{match_id} endpoint"""
    
    def test_match_detail_returns_data(self):
        """Verify match detail endpoint returns proper data"""
        matches_response = requests.get(f"{BASE_URL}/api/matches")
        matches = matches_response.json()
        
        if not matches:
            pytest.skip("No matches available")
        
        match_id = matches[0]["match_id"]
        response = requests.get(f"{BASE_URL}/api/match/{match_id}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "match_id" in data
        assert "home_team" in data
        assert "away_team" in data
        
        print(f"✓ Match detail endpoint working: {data['home_team']} vs {data['away_team']}")
    
    def test_match_detail_has_odds(self):
        """Verify match detail includes odds data when available"""
        matches_response = requests.get(f"{BASE_URL}/api/matches")
        matches = matches_response.json()
        
        if not matches:
            pytest.skip("No matches available")
        
        match_id = matches[0]["match_id"]
        response = requests.get(f"{BASE_URL}/api/match/{match_id}")
        data = response.json()
        
        # Odds may be null for some matches, but field should exist
        assert "home_odds" in data or "odds" in data, "Match should have odds field"
        
        print(f"✓ Match detail has odds field")


class TestFilterFunctionality:
    """Tests for filter-related API behavior"""
    
    def test_live_matches_endpoint(self):
        """Verify /api/live-matches endpoint works"""
        response = requests.get(f"{BASE_URL}/api/live-matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data
        assert "matches" in data
        
        print(f"✓ Live matches endpoint working: {data.get('count', 0)} live matches")
    
    def test_all_matches_endpoint(self):
        """Verify /api/all-matches endpoint works"""
        response = requests.get(f"{BASE_URL}/api/all-matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "success" in data
        assert "live" in data
        assert "upcoming" in data
        
        print(f"✓ All matches endpoint working: {data.get('live_count', 0)} live, {data.get('upcoming_count', 0)} upcoming")


class TestNoFootballMatches:
    """Verify Football matches are not returned"""
    
    def test_no_football_in_matches(self):
        """Verify /api/matches does not return football/soccer matches"""
        response = requests.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        
        for match in matches:
            sport = match.get("sport", "").lower()
            assert sport != "football", f"Found football match: {match.get('home_team')} vs {match.get('away_team')}"
            assert sport != "soccer", f"Found soccer match: {match.get('home_team')} vs {match.get('away_team')}"
        
        print(f"✓ No football/soccer matches in {len(matches)} results")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
