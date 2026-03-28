"""
Test suite for PlayXBets P0 Bug Fix - Odds Merge/Swap Issue
Tests that odds from The Odds API are correctly merged with CricketData API matches
without being swapped or mismatched.

P0 Bug: Odds were being mismatched/swapped when merged with CricketData API matches.
Fix involved:
1. Detecting when DB matches have teams in reversed order vs Odds API events and swapping odds accordingly
2. Improved fuzzy team name matching (handles Bangalore/Bengaluru, Rawalpindi variations)
3. Post-merge cleanup of Odds-API-created duplicate entries
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOddsMergeBasics:
    """Basic tests for odds merge functionality"""
    
    def test_matches_endpoint_returns_200(self):
        """Test that matches endpoint is accessible"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print(f"✓ Matches endpoint returned 200 OK")
    
    def test_matches_with_odds_exist(self):
        """Test that some matches have odds data"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        matches_with_odds = [m for m in data if m.get('home_odds') is not None or 
                           (m.get('odds') and m.get('odds').get('home'))]
        
        print(f"Total matches: {len(data)}")
        print(f"Matches with odds: {len(matches_with_odds)}")
        
        # At least some matches should have odds
        assert len(matches_with_odds) > 0, "No matches have odds data - odds merge may not be working"
        print(f"✓ Found {len(matches_with_odds)} matches with odds")


class TestOddsConsistency:
    """Tests for odds consistency - verifying odds are not swapped"""
    
    def test_home_odds_match_odds_object(self):
        """Test that home_odds field matches odds.home field"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        mismatches = []
        for m in data:
            home_odds = m.get('home_odds')
            odds_obj = m.get('odds', {}) or {}
            odds_home = odds_obj.get('home') or odds_obj.get('home_back')
            
            if home_odds is not None and odds_home is not None:
                if abs(home_odds - odds_home) > 0.01:  # Allow small floating point diff
                    mismatches.append({
                        'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                        'home_odds': home_odds,
                        'odds.home': odds_home
                    })
        
        if mismatches:
            for mm in mismatches[:3]:
                print(f"  MISMATCH: {mm}")
        
        assert len(mismatches) == 0, f"Found {len(mismatches)} matches with home_odds mismatch"
        print(f"✓ All home_odds values match odds.home values")
    
    def test_away_odds_match_odds_object(self):
        """Test that away_odds field matches odds.away field"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        mismatches = []
        for m in data:
            away_odds = m.get('away_odds')
            odds_obj = m.get('odds', {}) or {}
            odds_away = odds_obj.get('away') or odds_obj.get('away_back')
            
            if away_odds is not None and odds_away is not None:
                if abs(away_odds - odds_away) > 0.01:
                    mismatches.append({
                        'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                        'away_odds': away_odds,
                        'odds.away': odds_away
                    })
        
        if mismatches:
            for mm in mismatches[:3]:
                print(f"  MISMATCH: {mm}")
        
        assert len(mismatches) == 0, f"Found {len(mismatches)} matches with away_odds mismatch"
        print(f"✓ All away_odds values match odds.away values")
    
    def test_odds_are_reasonable_values(self):
        """Test that odds values are within reasonable betting range (1.01 to 100)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        invalid_odds = []
        for m in data:
            home_odds = m.get('home_odds')
            away_odds = m.get('away_odds')
            
            if home_odds is not None:
                if home_odds < 1.01 or home_odds > 100:
                    invalid_odds.append({
                        'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                        'field': 'home_odds',
                        'value': home_odds
                    })
            
            if away_odds is not None:
                if away_odds < 1.01 or away_odds > 100:
                    invalid_odds.append({
                        'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                        'field': 'away_odds',
                        'value': away_odds
                    })
        
        if invalid_odds:
            for inv in invalid_odds[:3]:
                print(f"  INVALID: {inv}")
        
        assert len(invalid_odds) == 0, f"Found {len(invalid_odds)} invalid odds values"
        print(f"✓ All odds values are within reasonable range (1.01-100)")


class TestMatchDetailOdds:
    """Tests for match detail endpoint odds"""
    
    def test_match_detail_returns_odds(self):
        """Test that match detail endpoint returns odds for matches that have them"""
        # First get a match with odds from the list
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        match_with_odds = None
        for m in data:
            if m.get('home_odds') is not None or (m.get('odds') and m.get('odds').get('home')):
                match_with_odds = m
                break
        
        if match_with_odds is None:
            pytest.skip("No matches with odds found to test")
        
        match_id = match_with_odds.get('match_id')
        print(f"Testing match: {match_with_odds.get('home_team')} vs {match_with_odds.get('away_team')}")
        
        # Get match detail
        detail_response = requests.get(f"{BASE_URL}/api/match/{match_id}", timeout=10)
        assert detail_response.status_code == 200, f"Match detail returned {detail_response.status_code}"
        
        detail = detail_response.json()
        
        # Check odds are present in detail
        has_odds = (detail.get('home_odds') is not None or 
                   (detail.get('odds') and (detail.get('odds').get('home') or detail.get('odds').get('home_back'))))
        
        assert has_odds, f"Match detail missing odds for match {match_id}"
        print(f"✓ Match detail has odds: home={detail.get('odds', {}).get('home')}, away={detail.get('odds', {}).get('away')}")
    
    def test_match_detail_odds_consistency(self):
        """Test that match detail odds match list endpoint odds"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        # Test first 3 matches with odds
        tested = 0
        for m in data:
            if m.get('home_odds') is None and not (m.get('odds') and m.get('odds').get('home')):
                continue
            
            match_id = m.get('match_id')
            list_home_odds = m.get('home_odds') or (m.get('odds', {}) or {}).get('home')
            list_away_odds = m.get('away_odds') or (m.get('odds', {}) or {}).get('away')
            
            detail_response = requests.get(f"{BASE_URL}/api/match/{match_id}", timeout=10)
            if detail_response.status_code != 200:
                continue
            
            detail = detail_response.json()
            detail_odds = detail.get('odds', {}) or {}
            detail_home_odds = detail.get('home_odds') or detail_odds.get('home') or detail_odds.get('home_back')
            detail_away_odds = detail.get('away_odds') or detail_odds.get('away') or detail_odds.get('away_back')
            
            # Check consistency
            if list_home_odds and detail_home_odds:
                assert abs(list_home_odds - detail_home_odds) < 0.1, \
                    f"Home odds mismatch for {m.get('home_team')}: list={list_home_odds}, detail={detail_home_odds}"
            
            if list_away_odds and detail_away_odds:
                assert abs(list_away_odds - detail_away_odds) < 0.1, \
                    f"Away odds mismatch for {m.get('away_team')}: list={list_away_odds}, detail={detail_away_odds}"
            
            tested += 1
            if tested >= 3:
                break
        
        print(f"✓ Tested {tested} matches - list and detail odds are consistent")


class TestNoDuplicateMatches:
    """Tests for duplicate match detection and cleanup"""
    
    def test_no_exact_duplicate_matches(self):
        """Test that there are no exact duplicate matches (same teams, same date)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        # Group by teams + date
        match_keys = {}
        duplicates = []
        
        for m in data:
            home = m.get('home_team', '').lower().strip()
            away = m.get('away_team', '').lower().strip()
            commence = m.get('commence_time', '')[:10]  # Just date part
            
            key = f"{sorted([home, away])}_{commence}"
            
            if key in match_keys:
                duplicates.append({
                    'teams': f"{m.get('home_team')} vs {m.get('away_team')}",
                    'date': commence,
                    'match_id_1': match_keys[key],
                    'match_id_2': m.get('match_id')
                })
            else:
                match_keys[key] = m.get('match_id')
        
        if duplicates:
            for dup in duplicates[:3]:
                print(f"  DUPLICATE: {dup}")
        
        assert len(duplicates) == 0, f"Found {len(duplicates)} duplicate matches (same teams, same date)"
        print(f"✓ No exact duplicate matches found")


class TestAdminCronOddsRefresh:
    """Tests for admin cron endpoint that triggers odds refresh"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json().get('access_token')
    
    def test_admin_login_works(self):
        """Test that admin can login"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            data={"username": "admin", "password": "123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10
        )
        assert response.status_code == 200, f"Admin login failed: {response.status_code}"
        data = response.json()
        assert 'access_token' in data, "No access token in response"
        assert data.get('role') == 'admin', f"Expected admin role, got {data.get('role')}"
        print(f"✓ Admin login successful")
    
    def test_cron_run_endpoint(self, admin_token):
        """Test that admin can trigger odds refresh via cron endpoint"""
        response = requests.post(
            f"{BASE_URL}/api/admin/cron/run",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30
        )
        assert response.status_code == 200, f"Cron run failed: {response.status_code}"
        data = response.json()
        assert data.get('success') == True, f"Cron run not successful: {data}"
        print(f"✓ Cron run successful - fetched {data.get('matches_fetched')} matches")
    
    def test_cron_run_requires_auth(self):
        """Test that cron endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/admin/cron/run", timeout=10)
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✓ Cron endpoint correctly requires authentication")


class TestTeamNameMatching:
    """Tests for fuzzy team name matching (Bangalore/Bengaluru, Rawalpindi variations)"""
    
    def test_bengaluru_bangalore_matches_have_odds(self):
        """Test that Royal Challengers Bengaluru/Bangalore matches have odds if available"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        rcb_matches = [m for m in data if 
                      'bengaluru' in m.get('home_team', '').lower() or 
                      'bengaluru' in m.get('away_team', '').lower() or
                      'bangalore' in m.get('home_team', '').lower() or 
                      'bangalore' in m.get('away_team', '').lower()]
        
        print(f"Found {len(rcb_matches)} RCB matches")
        for m in rcb_matches:
            odds = m.get('odds', {}) or {}
            has_odds = m.get('home_odds') is not None or odds.get('home') is not None
            print(f"  {m.get('home_team')} vs {m.get('away_team')} - has_odds: {has_odds}")
        
        # This is informational - we just want to see if matching works
        print(f"✓ RCB team name matching check complete")
    
    def test_rawalpindi_variations_handled(self):
        """Test that Rawalpindi/Rawalpindiz variations are handled"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        rawalpindi_matches = [m for m in data if 
                            'rawalpindi' in m.get('home_team', '').lower() or 
                            'rawalpindi' in m.get('away_team', '').lower() or
                            'pindi' in m.get('home_team', '').lower() or 
                            'pindi' in m.get('away_team', '').lower()]
        
        print(f"Found {len(rawalpindi_matches)} Rawalpindi matches")
        for m in rawalpindi_matches:
            odds = m.get('odds', {}) or {}
            has_odds = m.get('home_odds') is not None or odds.get('home') is not None
            print(f"  {m.get('home_team')} vs {m.get('away_team')} - has_odds: {has_odds}")
        
        print(f"✓ Rawalpindi team name matching check complete")


class TestOddsNotSwapped:
    """Critical tests to verify odds are not swapped between home and away teams"""
    
    def test_home_odds_not_equal_away_odds(self):
        """Test that home and away odds are different (they should rarely be equal)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        equal_odds_count = 0
        total_with_odds = 0
        
        for m in data:
            home_odds = m.get('home_odds')
            away_odds = m.get('away_odds')
            
            if home_odds is not None and away_odds is not None:
                total_with_odds += 1
                if abs(home_odds - away_odds) < 0.01:
                    equal_odds_count += 1
                    print(f"  Equal odds: {m.get('home_team')} vs {m.get('away_team')} - {home_odds}")
        
        # It's rare for odds to be exactly equal
        if total_with_odds > 0:
            equal_ratio = equal_odds_count / total_with_odds
            print(f"Equal odds ratio: {equal_ratio:.2%} ({equal_odds_count}/{total_with_odds})")
            # Allow up to 20% equal odds (some matches may have equal odds)
            assert equal_ratio < 0.2, f"Too many matches with equal odds ({equal_ratio:.2%})"
        
        print(f"✓ Odds differentiation check passed")
    
    def test_lay_odds_higher_than_back_odds(self):
        """Test that lay odds are higher than back odds (standard exchange spread)"""
        response = requests.get(f"{BASE_URL}/api/matches", timeout=10)
        data = response.json()
        
        violations = []
        for m in data:
            odds = m.get('odds', {}) or {}
            
            home_back = odds.get('home_back') or odds.get('home')
            home_lay = odds.get('home_lay')
            away_back = odds.get('away_back') or odds.get('away')
            away_lay = odds.get('away_lay')
            
            if home_back and home_lay and home_lay < home_back:
                violations.append({
                    'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                    'issue': f"home_lay ({home_lay}) < home_back ({home_back})"
                })
            
            if away_back and away_lay and away_lay < away_back:
                violations.append({
                    'match': f"{m.get('home_team')} vs {m.get('away_team')}",
                    'issue': f"away_lay ({away_lay}) < away_back ({away_back})"
                })
        
        if violations:
            for v in violations[:3]:
                print(f"  VIOLATION: {v}")
        
        assert len(violations) == 0, f"Found {len(violations)} matches with lay < back odds"
        print(f"✓ All lay odds are >= back odds (correct spread)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
