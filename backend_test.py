import requests
import sys
import json
from datetime import datetime

class PlayBetsAPITester:
    def __init__(self, base_url="https://live-betting-hub-5.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def run_test(self, name, method, endpoint, expected_status, data=None, expected_count=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                
                # Additional validation for expected count
                if expected_count is not None:
                    try:
                        response_data = response.json()
                        if isinstance(response_data, list):
                            actual_count = len(response_data)
                            if actual_count == expected_count:
                                print(f"   ✅ Count validation passed: {actual_count} items")
                            else:
                                print(f"   ⚠️  Count mismatch: expected {expected_count}, got {actual_count}")
                        else:
                            print(f"   ℹ️  Response: {response_data}")
                    except:
                        print(f"   ℹ️  Response received but couldn't parse JSON")
                        
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Error: {response.text}")

            self.test_results.append({
                "test": name,
                "success": success,
                "status_code": response.status_code,
                "expected_status": expected_status
            })

            return success, response.json() if success else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.test_results.append({
                "test": name,
                "success": False,
                "error": str(e)
            })
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API", "GET", "", 200)

    def test_live_matches(self):
        """Test live matches endpoint - should return both cricket and soccer live matches"""
        success, response = self.run_test("Live Matches", "GET", "matches/live", 200, expected_count=4)
        
        if success and response:
            cricket_live = [m for m in response if m.get('sport') == 'cricket' and m.get('status') == 'live']
            soccer_live = [m for m in response if m.get('sport') == 'soccer' and m.get('status') == 'live']
            
            print(f"   📊 Cricket live matches: {len(cricket_live)}")
            print(f"   📊 Soccer live matches: {len(soccer_live)}")
            
            if len(cricket_live) >= 2 and len(soccer_live) >= 2:
                print(f"   ✅ Both sports have live matches as expected")
            else:
                print(f"   ⚠️  Expected at least 2 live matches per sport")
        
        return success

    def test_cricket_matches(self):
        """Test cricket matches endpoint"""
        success, response = self.run_test("Cricket Matches", "GET", "matches/cricket", 200, expected_count=3)
        
        if success and response:
            live_count = len([m for m in response if m.get('status') == 'live'])
            scheduled_count = len([m for m in response if m.get('status') == 'scheduled'])
            print(f"   📊 Live: {live_count}, Scheduled: {scheduled_count}")
        
        return success

    def test_soccer_matches(self):
        """Test soccer matches endpoint"""
        success, response = self.run_test("Soccer Matches", "GET", "matches/soccer", 200, expected_count=3)
        
        if success and response:
            live_count = len([m for m in response if m.get('status') == 'live'])
            scheduled_count = len([m for m in response if m.get('status') == 'scheduled'])
            print(f"   📊 Live: {live_count}, Scheduled: {scheduled_count}")
            
            # Check for draw odds in soccer matches
            draw_odds_count = len([m for m in response if m.get('odds_draw') is not None])
            print(f"   📊 Matches with draw odds: {draw_odds_count}")
        
        return success

    def test_specific_match(self):
        """Test getting specific match details"""
        return self.run_test("Specific Match (Cricket)", "GET", "matches/c001", 200)

    def test_place_bet(self):
        """Test placing a bet"""
        bet_data = {
            "match_id": "c001",
            "team_home": "India",
            "team_away": "Pakistan",
            "sport": "cricket",
            "bet_type": "home",
            "odds": 1.65,
            "stake": 10.0
        }
        
        success, response = self.run_test("Place Bet", "POST", "bets", 200, data=bet_data)
        
        if success and response:
            expected_return = bet_data["stake"] * bet_data["odds"]
            actual_return = response.get("potential_return", 0)
            
            if abs(actual_return - expected_return) < 0.01:
                print(f"   ✅ Potential return calculation correct: ${actual_return:.2f}")
            else:
                print(f"   ❌ Potential return mismatch: expected ${expected_return:.2f}, got ${actual_return:.2f}")
        
        return success

    def test_bet_history(self):
        """Test getting bet history"""
        return self.run_test("Bet History", "GET", "bets/history", 200)

    def test_status_endpoints(self):
        """Test status check endpoints"""
        # Create status check
        status_data = {"client_name": "test_client"}
        success1, _ = self.run_test("Create Status Check", "POST", "status", 200, data=status_data)
        
        # Get status checks
        success2, _ = self.run_test("Get Status Checks", "GET", "status", 200)
        
        return success1 and success2

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting PlayBets API Testing...")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 60)

        # Test all endpoints
        tests = [
            self.test_root_endpoint,
            self.test_live_matches,
            self.test_cricket_matches,
            self.test_soccer_matches,
            self.test_specific_match,
            self.test_place_bet,
            self.test_bet_history,
            self.test_status_endpoints
        ]

        for test in tests:
            test()

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("❌ Some tests failed")
            failed_tests = [r for r in self.test_results if not r.get('success', False)]
            print("\nFailed tests:")
            for test in failed_tests:
                print(f"  - {test['test']}: {test.get('error', 'Status code mismatch')}")
            return False

def main():
    tester = PlayBetsAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())