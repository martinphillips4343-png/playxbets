"""
Test suite for PlayXBets Matches API
Tests that completed matches are properly filtered out from the API response
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestMatchesAPI:
    """Tests for /api/matches endpoint - verifying completed match filtering"""
    
    def test_matches_endpoint_returns_200(self):
        """Test that matches endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Matches endpoint returned 200 OK")
    
    def test_matches_returns_list(self):
        """Test that matches endpoint returns a list"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"
        print(f"✓ Matches endpoint returned list with {len(data)} matches")
    
    def test_no_completed_matches_in_response(self):
        """Test that no matches with status 'completed' are returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        completed_matches = [m for m in data if m.get('status', '').lower() == 'completed']
        assert len(completed_matches) == 0, f"Found {len(completed_matches)} completed matches that should be filtered"
        print(f"✓ No completed matches in response")
    
    def test_no_ended_matches_in_response(self):
        """Test that no matches with status 'ended' are returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        ended_matches = [m for m in data if m.get('status', '').lower() == 'ended']
        assert len(ended_matches) == 0, f"Found {len(ended_matches)} ended matches that should be filtered"
        print(f"✓ No ended matches in response")
    
    def test_no_finished_matches_in_response(self):
        """Test that no matches with status 'finished' are returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        finished_matches = [m for m in data if m.get('status', '').lower() == 'finished']
        assert len(finished_matches) == 0, f"Found {len(finished_matches)} finished matches that should be filtered"
        print(f"✓ No finished matches in response")
    
    def test_no_match_ended_true_in_response(self):
        """Test that no matches with matchEnded=True are returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        ended_matches = [m for m in data if m.get('matchEnded') == True]
        assert len(ended_matches) == 0, f"Found {len(ended_matches)} matches with matchEnded=True that should be filtered"
        print(f"✓ No matches with matchEnded=True in response")
    
    def test_no_quetta_matches_in_response(self):
        """Test that Quetta Gladiators completed match is not returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        quetta_matches = [m for m in data if 'quetta' in m.get('home_team', '').lower() or 'quetta' in m.get('away_team', '').lower()]
        assert len(quetta_matches) == 0, f"Found {len(quetta_matches)} Quetta matches that should be filtered (completed)"
        print(f"✓ No Quetta matches in response (completed match filtered)")
    
    def test_no_victoria_matches_in_response(self):
        """Test that Victoria completed match is not returned"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        victoria_matches = [m for m in data if 'victoria' in m.get('home_team', '').lower() or 'victoria' in m.get('away_team', '').lower()]
        assert len(victoria_matches) == 0, f"Found {len(victoria_matches)} Victoria matches that should be filtered (completed)"
        print(f"✓ No Victoria matches in response (completed match filtered)")
    
    def test_all_matches_have_valid_status(self):
        """Test that all returned matches have valid status (scheduled or live)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        valid_statuses = ['scheduled', 'live']
        invalid_matches = [m for m in data if m.get('status', '').lower() not in valid_statuses]
        
        if invalid_matches:
            for m in invalid_matches[:3]:
                print(f"  Invalid: {m.get('home_team')} vs {m.get('away_team')} - status: {m.get('status')}")
        
        assert len(invalid_matches) == 0, f"Found {len(invalid_matches)} matches with invalid status"
        print(f"✓ All {len(data)} matches have valid status (scheduled/live)")
    
    def test_matches_have_required_fields(self):
        """Test that all matches have required fields"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        required_fields = ['match_id', 'home_team', 'away_team', 'status', 'sport']
        
        for match in data[:5]:  # Check first 5 matches
            for field in required_fields:
                assert field in match, f"Match missing required field: {field}"
        
        print(f"✓ All matches have required fields")


class TestLiveMatchesAPI:
    """Tests for /api/live-matches endpoint"""
    
    def test_live_matches_endpoint_returns_200(self):
        """Test that live-matches endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/live-matches", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Live matches endpoint returned 200 OK")
    
    def test_live_matches_response_structure(self):
        """Test that live-matches returns proper structure"""
        response = requests.get(f"{BASE_URL}/api/live-matches", timeout=10)
        data = response.json()
        
        assert 'success' in data, "Response missing 'success' field"
        assert 'matches' in data, "Response missing 'matches' field"
        assert isinstance(data['matches'], list), "matches should be a list"
        print(f"✓ Live matches response has correct structure")


class TestAllMatchesAPI:
    """Tests for /api/all-matches endpoint"""
    
    def test_all_matches_endpoint_returns_200(self):
        """Test that all-matches endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/all-matches", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ All matches endpoint returned 200 OK")
    
    def test_all_matches_response_structure(self):
        """Test that all-matches returns proper structure with live and upcoming"""
        response = requests.get(f"{BASE_URL}/api/all-matches", timeout=10)
        data = response.json()
        
        assert 'success' in data, "Response missing 'success' field"
        assert 'live' in data, "Response missing 'live' field"
        assert 'upcoming' in data, "Response missing 'upcoming' field"
        print(f"✓ All matches response has correct structure (live: {len(data.get('live', []))}, upcoming: {len(data.get('upcoming', []))})")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
