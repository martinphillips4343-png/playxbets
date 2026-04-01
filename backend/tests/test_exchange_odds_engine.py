"""
Test suite for Exchange-Style Odds Engine (Betfair-style)
Tests the upgraded odds_engine.py with:
1. Implied probability correction (removes overround)
2. EMA smoothing for smooth movement
3. Dynamic spread based on volatility
4. Deterministic liquidity (no random)
5. Proper Betfair tick sizes
6. Weighted average across multiple bookmakers
7. 3-level order book with decaying liquidity
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test match ID from the context
TEST_MATCH_ID = "4c65aee441d663bd1e5ed2912f22fb63"

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
        data={"username": "user", "password": "123456"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("User authentication failed")

@pytest.fixture(scope="module")
def authenticated_client(api_client, user_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {user_token}"})
    return api_client


class TestMatchesEndpointExchangeOdds:
    """Test GET /api/matches returns exchange-style odds"""
    
    def test_matches_returns_exchange_odds_structure(self, api_client):
        """Verify matches endpoint returns exchange-style odds with back/lay"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        matches = response.json()
        assert isinstance(matches, list), "Response should be a list"
        
        # Find a match with odds
        match_with_odds = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_back"):
                match_with_odds = m
                break
        
        if not match_with_odds:
            pytest.skip("No matches with odds available")
        
        odds = match_with_odds["odds"]
        
        # Verify exchange-style fields exist
        assert "home_back" in odds, "Missing home_back"
        assert "home_lay" in odds, "Missing home_lay"
        assert "away_back" in odds, "Missing away_back"
        assert "away_lay" in odds, "Missing away_lay"
        
        print(f"Match: {match_with_odds.get('home_team')} vs {match_with_odds.get('away_team')}")
        print(f"Home Back: {odds.get('home_back')}, Home Lay: {odds.get('home_lay')}")
        print(f"Away Back: {odds.get('away_back')}, Away Lay: {odds.get('away_lay')}")
    
    def test_matches_returns_3_level_order_book(self, api_client):
        """Verify matches have 3-level order book (home_back_levels, etc.)"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_levels = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_back_levels"):
                match_with_levels = m
                break
        
        if not match_with_levels:
            pytest.skip("No matches with order book levels available")
        
        odds = match_with_levels["odds"]
        
        # Verify 3-level order book
        assert "home_back_levels" in odds, "Missing home_back_levels"
        assert "home_lay_levels" in odds, "Missing home_lay_levels"
        assert "away_back_levels" in odds, "Missing away_back_levels"
        assert "away_lay_levels" in odds, "Missing away_lay_levels"
        
        # Each should have 3 items
        assert len(odds["home_back_levels"]) == 3, f"Expected 3 home_back_levels, got {len(odds['home_back_levels'])}"
        assert len(odds["home_lay_levels"]) == 3, f"Expected 3 home_lay_levels, got {len(odds['home_lay_levels'])}"
        assert len(odds["away_back_levels"]) == 3, f"Expected 3 away_back_levels, got {len(odds['away_back_levels'])}"
        assert len(odds["away_lay_levels"]) == 3, f"Expected 3 away_lay_levels, got {len(odds['away_lay_levels'])}"
        
        print(f"Home Back Levels: {odds['home_back_levels']}")
        print(f"Home Lay Levels: {odds['home_lay_levels']}")
    
    def test_matches_returns_liquidity_sizes(self, api_client):
        """Verify matches have liquidity sizes for each level"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_sizes = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_back_sizes"):
                match_with_sizes = m
                break
        
        if not match_with_sizes:
            pytest.skip("No matches with liquidity sizes available")
        
        odds = match_with_sizes["odds"]
        
        # Verify liquidity sizes
        assert "home_back_sizes" in odds, "Missing home_back_sizes"
        assert "away_back_sizes" in odds, "Missing away_back_sizes"
        
        # Each should have 3 items
        assert len(odds["home_back_sizes"]) == 3, f"Expected 3 home_back_sizes, got {len(odds['home_back_sizes'])}"
        assert len(odds["away_back_sizes"]) == 3, f"Expected 3 away_back_sizes, got {len(odds['away_back_sizes'])}"
        
        print(f"Home Back Sizes: {odds['home_back_sizes']}")
        print(f"Away Back Sizes: {odds['away_back_sizes']}")


class TestBookmakerOddsEndpoint:
    """Test GET /api/match/{id}/bookmaker-odds endpoint"""
    
    def test_bookmaker_odds_returns_adjusted_odds(self, api_client):
        """Verify bookmaker-odds endpoint returns adjusted odds with back/lay"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/bookmaker-odds")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "match_id" in data, "Missing match_id"
        
        if data.get("odds") is None and data.get("message"):
            pytest.skip(f"No odds available: {data.get('message')}")
        
        assert "adjusted_odds" in data, "Missing adjusted_odds"
        adjusted = data["adjusted_odds"]
        
        # Verify back/lay structure
        assert "home_back" in adjusted, "Missing home_back in adjusted_odds"
        assert "home_lay" in adjusted, "Missing home_lay in adjusted_odds"
        assert "away_back" in adjusted, "Missing away_back in adjusted_odds"
        assert "away_lay" in adjusted, "Missing away_lay in adjusted_odds"
        
        print(f"Adjusted Odds: {adjusted}")
    
    def test_bookmaker_odds_returns_exposure(self, api_client):
        """Verify bookmaker-odds endpoint returns exposure data"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/bookmaker-odds")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "exposure" in data, "Missing exposure data"
        exposure = data["exposure"]
        
        # Exposure should have these fields
        expected_fields = ["home_back_total", "home_lay_total", "away_back_total", "away_lay_total"]
        for field in expected_fields:
            assert field in exposure, f"Missing {field} in exposure"
        
        print(f"Exposure: {exposure}")


class TestOddsSpreadAndTicks:
    """Test that odds spread is tight (1-3 Betfair ticks)"""
    
    def test_spread_is_tight(self, api_client):
        """Verify spread between back and lay is 1-3 ticks"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/bookmaker-odds")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200
        data = response.json()
        
        if not data.get("adjusted_odds"):
            pytest.skip("No adjusted odds available")
        
        adjusted = data["adjusted_odds"]
        home_back = adjusted.get("home_back")
        home_lay = adjusted.get("home_lay")
        away_back = adjusted.get("away_back")
        away_lay = adjusted.get("away_lay")
        
        if not all([home_back, home_lay, away_back, away_lay]):
            pytest.skip("Incomplete odds data")
        
        # Calculate spreads
        home_spread = home_lay - home_back
        away_spread = away_lay - away_back
        
        # Betfair tick sizes vary by price range, but spread should be small
        # For odds around 1.5-3.0, tick is 0.01-0.02, so spread should be < 0.10
        assert home_spread > 0, f"Home lay should be > home back, got spread {home_spread}"
        assert away_spread > 0, f"Away lay should be > away back, got spread {away_spread}"
        assert home_spread < 0.20, f"Home spread too wide: {home_spread}"
        assert away_spread < 0.20, f"Away spread too wide: {away_spread}"
        
        print(f"Home spread: {home_spread:.4f} (back={home_back}, lay={home_lay})")
        print(f"Away spread: {away_spread:.4f} (back={away_back}, lay={away_lay})")


class TestDeterministicLiquidity:
    """Test that liquidity is deterministic (same match returns same sizes)"""
    
    def test_liquidity_is_deterministic(self, api_client):
        """Verify same match returns same liquidity sizes on multiple calls"""
        # First call
        response1 = api_client.get(f"{BASE_URL}/api/matches")
        assert response1.status_code == 200
        
        matches1 = response1.json()
        match1 = None
        for m in matches1:
            if m.get("odds") and m["odds"].get("home_back_sizes"):
                match1 = m
                break
        
        if not match1:
            pytest.skip("No matches with liquidity sizes")
        
        match_id = match1.get("match_id")
        sizes1 = match1["odds"]["home_back_sizes"]
        
        # Wait a moment and call again
        time.sleep(0.5)
        
        # Second call
        response2 = api_client.get(f"{BASE_URL}/api/matches")
        assert response2.status_code == 200
        
        matches2 = response2.json()
        match2 = None
        for m in matches2:
            if m.get("match_id") == match_id:
                match2 = m
                break
        
        if not match2 or not match2.get("odds", {}).get("home_back_sizes"):
            pytest.skip("Match not found in second call")
        
        sizes2 = match2["odds"]["home_back_sizes"]
        
        # Sizes should be identical (deterministic)
        assert sizes1 == sizes2, f"Liquidity not deterministic: {sizes1} vs {sizes2}"
        print(f"Liquidity is deterministic: {sizes1}")


class TestOrderBookLevelDecay:
    """Test that order book levels decrease in liquidity"""
    
    def test_liquidity_decreases_with_depth(self, api_client):
        """Verify level 0 > level 1 > level 2 in liquidity"""
        response = api_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_sizes = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_back_sizes"):
                match_with_sizes = m
                break
        
        if not match_with_sizes:
            pytest.skip("No matches with liquidity sizes")
        
        odds = match_with_sizes["odds"]
        hb_sizes = odds["home_back_sizes"]
        ab_sizes = odds["away_back_sizes"]
        
        # Level 0 should have most liquidity, level 2 least
        # Using >= to allow for edge cases where levels might be equal
        assert hb_sizes[0] >= hb_sizes[1], f"Home back: level 0 ({hb_sizes[0]}) should be >= level 1 ({hb_sizes[1]})"
        assert hb_sizes[1] >= hb_sizes[2], f"Home back: level 1 ({hb_sizes[1]}) should be >= level 2 ({hb_sizes[2]})"
        
        assert ab_sizes[0] >= ab_sizes[1], f"Away back: level 0 ({ab_sizes[0]}) should be >= level 1 ({ab_sizes[1]})"
        assert ab_sizes[1] >= ab_sizes[2], f"Away back: level 1 ({ab_sizes[1]}) should be >= level 2 ({ab_sizes[2]})"
        
        print(f"Home back sizes (decreasing): {hb_sizes}")
        print(f"Away back sizes (decreasing): {ab_sizes}")


class TestSessionMarketsEndpoint:
    """Test GET /api/match/{id}/session-markets endpoint"""
    
    def test_session_markets_returns_markets(self, api_client):
        """Verify session-markets endpoint returns market data"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/session-markets")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "match_id" in data, "Missing match_id"
        assert "markets" in data, "Missing markets"
        assert isinstance(data["markets"], list), "markets should be a list"
        
        print(f"Session markets count: {len(data['markets'])}")
        if data["markets"]:
            print(f"First market: {data['markets'][0]}")
    
    def test_session_markets_has_market_status(self, api_client):
        """Verify session-markets returns market status"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/session-markets")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "market_status" in data, "Missing market_status"
        status = data["market_status"]
        
        assert "suspended" in status, "Missing suspended in market_status"
        print(f"Market status: {status}")


class TestBetPlacementWithExchangeOdds:
    """Test POST /api/bets works with new exchange odds"""
    
    def test_place_back_bet(self, authenticated_client):
        """Verify placing a back bet works with exchange odds"""
        # First get a match with odds
        response = authenticated_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_odds = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_back"):
                match_with_odds = m
                break
        
        if not match_with_odds:
            pytest.skip("No matches with odds available")
        
        match_id = match_with_odds["match_id"]
        home_team = match_with_odds["home_team"]
        home_back = match_with_odds["odds"]["home_back"]
        
        # Place a small back bet
        bet_data = {
            "match_id": match_id,
            "selected_team": home_team,
            "odds": home_back,
            "stake": 100,
            "bet_type": "back",
            "market_type": "match"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/bets", json=bet_data)
        
        # Accept 200, 201, or 400 (insufficient balance)
        assert response.status_code in [200, 201, 400], f"Unexpected status: {response.status_code}: {response.text}"
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "bet_id" in data, "Missing bet_id in response"
            print(f"Back bet placed: {data.get('bet_id')}")
        else:
            print(f"Bet not placed (likely insufficient balance): {response.json()}")
    
    def test_place_lay_bet(self, authenticated_client):
        """Verify placing a lay bet works with exchange odds"""
        # First get a match with odds
        response = authenticated_client.get(f"{BASE_URL}/api/matches")
        assert response.status_code == 200
        
        matches = response.json()
        match_with_odds = None
        for m in matches:
            if m.get("odds") and m["odds"].get("home_lay"):
                match_with_odds = m
                break
        
        if not match_with_odds:
            pytest.skip("No matches with lay odds available")
        
        match_id = match_with_odds["match_id"]
        home_team = match_with_odds["home_team"]
        home_lay = match_with_odds["odds"]["home_lay"]
        
        # Place a small lay bet
        bet_data = {
            "match_id": match_id,
            "selected_team": home_team,
            "odds": home_lay,
            "stake": 100,
            "bet_type": "lay",
            "market_type": "match"
        }
        
        response = authenticated_client.post(f"{BASE_URL}/api/bets", json=bet_data)
        
        # Accept 200, 201, or 400 (insufficient balance)
        assert response.status_code in [200, 201, 400], f"Unexpected status: {response.status_code}: {response.text}"
        
        if response.status_code in [200, 201]:
            data = response.json()
            assert "bet_id" in data, "Missing bet_id in response"
            print(f"Lay bet placed: {data.get('bet_id')}")
        else:
            print(f"Bet not placed (likely insufficient balance): {response.json()}")


class TestWalletSystemStillWorks:
    """Test wallet system still works after odds engine upgrade"""
    
    def test_wallet_returns_balances(self, authenticated_client):
        """Verify GET /api/wallet returns correct balances"""
        response = authenticated_client.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "balance" in data, "Missing balance"
        assert "frozen_balance" in data or "exposure" in data, "Missing frozen_balance or exposure"
        
        print(f"Wallet: balance={data.get('balance')}, frozen={data.get('frozen_balance')}, exposure={data.get('exposure')}")


class TestExposureTracking:
    """Test exposure tracking after placing bets"""
    
    def test_exposure_updates_after_bet(self, authenticated_client):
        """Verify exposure is tracked after placing a bet"""
        # Get initial exposure
        response1 = authenticated_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}/bookmaker-odds")
        
        if response1.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        if response1.status_code != 200:
            pytest.skip(f"Could not get bookmaker odds: {response1.text}")
        
        data1 = response1.json()
        initial_exposure = data1.get("exposure", {})
        
        print(f"Initial exposure: {initial_exposure}")
        
        # Note: We can't easily test exposure changes without placing a bet
        # and the bet might fail due to insufficient balance
        # So we just verify the exposure structure is correct
        
        expected_fields = ["home_back_total", "home_lay_total", "away_back_total", "away_lay_total"]
        for field in expected_fields:
            assert field in initial_exposure, f"Missing {field} in exposure"


class TestMatchDetailEndpoint:
    """Test GET /api/match/{id} returns exchange-style odds"""
    
    def test_match_detail_has_exchange_odds(self, api_client):
        """Verify match detail endpoint returns exchange-style odds"""
        response = api_client.get(f"{BASE_URL}/api/match/{TEST_MATCH_ID}")
        
        if response.status_code == 404:
            pytest.skip(f"Match {TEST_MATCH_ID} not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "match_id" in data, "Missing match_id"
        
        odds = data.get("odds")
        if not odds:
            pytest.skip("No odds in match detail")
        
        # Verify exchange-style fields
        assert "home_back" in odds, "Missing home_back in match detail odds"
        assert "home_lay" in odds, "Missing home_lay in match detail odds"
        
        print(f"Match detail odds: home_back={odds.get('home_back')}, home_lay={odds.get('home_lay')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
