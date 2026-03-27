import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import PublicHeader from "@/components/PublicHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { toast } from "sonner";
import { useLiveMatches } from "@/hooks/useWebSocket";

// Get backend URL for WebSocket
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// Polling intervals (fallback when WebSocket unavailable)
const LIVE_POLL_INTERVAL = 15000;  // 15 seconds for live data
const IDLE_POLL_INTERVAL = 30000;  // 30 seconds when no live matches

export default function PublicHomepage({ onShowAuth, user, onLogout }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [activeTab, setActiveTab] = useState("cricket");
  const [betSlip, setBetSlip] = useState(null);
  const [stake, setStake] = useState("");
  const [hasLiveMatches, setHasLiveMatches] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // WebSocket connection for real-time updates
  const { matches: wsLiveMatches, isConnected: wsConnected, lastUpdate: wsLastUpdate, usePolling } = useLiveMatches(BACKEND_URL);
  const pollIntervalRef = useRef(null);

  // Fetch all matches (not just live)
  const fetchMatches = useCallback(async () => {
    try {
      const response = await api.get("/matches");
      const data = response.data || [];
      
      // Filter out any matches that might still be marked as live but are actually ended
      const validMatches = data.filter(m => {
        if (m.matchEnded === true) return false;
        if (["completed", "ended", "finished"].includes(m.status?.toLowerCase())) return false;
        return true;
      });
      
      setMatches(validMatches);
      setApiUnavailable(false);
      setLastUpdate(new Date());
      
      const liveCount = validMatches.filter(m => m.status === "live").length;
      setHasLiveMatches(liveCount > 0);
      
    } catch (error) {
      console.error("Failed to fetch matches:", error);
      setApiUnavailable(true);
    }
  }, []);

  // Initial fetch and polling (only when WebSocket not connected)
  useEffect(() => {
    fetchMatches();
    
    // Only poll if WebSocket is not connected
    if (!wsConnected || usePolling) {
      const interval = setInterval(fetchMatches, hasLiveMatches ? LIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL);
      pollIntervalRef.current = interval;
      return () => clearInterval(interval);
    }
  }, [fetchMatches, hasLiveMatches, wsConnected, usePolling]);

  // Merge WebSocket live matches into local state
  useEffect(() => {
    if (wsLiveMatches && wsLiveMatches.length > 0) {
      setMatches(prev => {
        // Update live matches from WebSocket
        const liveMatchIds = new Set(wsLiveMatches.map(m => m.match_id));
        const updatedMatches = prev.map(m => {
          const wsMatch = wsLiveMatches.find(wm => wm.match_id === m.match_id);
          return wsMatch ? { ...m, ...wsMatch } : m;
        });
        
        // Add any new live matches not in local state
        const newLiveMatches = wsLiveMatches.filter(wm => 
          !prev.find(m => m.match_id === wm.match_id)
        );
        
        return [...updatedMatches, ...newLiveMatches];
      });
      
      setHasLiveMatches(wsLiveMatches.length > 0);
    }
  }, [wsLiveMatches]);

  // Update timestamp from WebSocket
  useEffect(() => {
    if (wsLastUpdate) {
      setLastUpdate(wsLastUpdate);
    }
  }, [wsLastUpdate]);

  // Handle match click - navigate to match page
  const handleMatchClick = (match) => {
    navigate(`/match/${match.match_id}`);
  };

  // Filter matches: only show live and upcoming (not completed)
  const filteredMatches = matches
    .filter((m) => {
      if (m.sport !== activeTab) return false;
      const status = (m.status || "").toLowerCase();
      if (status === "completed" || status === "ended" || status === "finished") return false;
      if (m.matchEnded === true) return false;
      if (status === "live") return true;
      try {
        const matchTime = new Date(m.commence_time);
        const now = new Date();
        // Show upcoming matches AND recently started matches (within 6 hours of start)
        // Recently started matches may not be marked as "live" yet by the API
        const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        return matchTime > sixHoursAgo;
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

  const handleBetClick = (match, team, odds, type) => {
    if (!user) {
      onShowAuth("login");
      return;
    }
    setBetSlip({ match, team, odds, type });
  };

  const handlePlaceBet = async () => {
    if (!user) {
      onShowAuth("login");
      return;
    }

    if (!stake || parseFloat(stake) <= 0) {
      toast.error("Enter valid stake amount");
      return;
    }

    try {
      await api.post("/bets", {
        match_id: betSlip.match.match_id,
        selected_team: betSlip.team,
        odds: betSlip.odds,
        stake: parseFloat(stake),
      });
      toast.success("Bet placed successfully!");
      setBetSlip(null);
      setStake("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to place bet");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <PublicHeader 
        onShowAuth={onShowAuth} 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        user={user}
        onLogout={onLogout}
      />

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#1a1d3a] via-[#2d1b69] to-[#1a1d3a] text-white py-16">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 text-white drop-shadow-lg">
            Bet on Your Favorite Sports
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-8 drop-shadow">
            Live Cricket & Football Betting with Best Odds
          </p>
          {!user && (
            <button
              onClick={() => onShowAuth("signup")}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg px-10 py-7 rounded shadow-xl"
            >
              Start Betting Now
            </button>
          )}
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* Sport Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("cricket")}
            className={`px-6 py-2 font-bold rounded-t text-base ${
              activeTab === "cricket"
                ? "bg-white text-gray-900 shadow"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            🏏 Cricket
          </button>
          <button
            onClick={() => setActiveTab("soccer")}
            className={`px-6 py-2 font-bold rounded-t text-base ${
              activeTab === "soccer"
                ? "bg-white text-gray-900 shadow"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            ⚽ Football
          </button>
          
          {/* Auto-refresh indicator */}
          <div className="flex items-center gap-2 ml-auto text-xs text-gray-500">
            {apiUnavailable && !wsConnected && (
              <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                Live data temporarily unavailable
              </span>
            )}
            {wsConnected && (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Real-time
              </span>
            )}
            {!wsConnected && usePolling && (
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Polling
              </span>
            )}
            {lastUpdate && (
              <span className="hidden md:inline">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            {hasLiveMatches && (
              <span className="flex items-center gap-1 text-green-600">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="hidden md:inline">Live</span>
              </span>
            )}
          </div>
        </div>

        {/* Matches List */}
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#243a5e] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-sm">Match</th>
                  <th className="px-2 py-3 text-center font-bold text-sm w-24 bg-[#1a56db]/30">Back</th>
                  {activeTab === "soccer" && <th className="px-2 py-3 text-center font-bold text-sm w-24">X</th>}
                  <th className="px-2 py-3 text-center font-bold text-sm w-24 bg-[#991b1b]/30">Lay</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === "soccer" ? 4 : 3} className="px-6 py-8 text-center text-gray-500 font-medium">
                      No {activeTab === "cricket" ? "cricket" : "football"} matches available
                    </td>
                  </tr>
                ) : (
                  filteredMatches.map((match, idx) => (
                    <tr
                      key={match.match_id}
                      className={`border-b hover:bg-blue-50 cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      onClick={() => handleMatchClick(match)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          {/* Live Indicator */}
                          {match.status === "live" && (
                            <div className="flex-shrink-0 mt-1">
                              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            {/* League Name */}
                            <div className="text-xs text-gray-500 font-medium truncate mb-0.5">
                              {match.league || (activeTab === "cricket" ? "Cricket" : "Football")}
                            </div>
                            
                            {/* Team Names */}
                            <div className="font-bold text-gray-900 text-sm truncate">
                              {match.home_team} v {match.away_team}
                            </div>
                            
                            {/* Date/Time + Icons */}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">
                                {match.status === "live" ? (
                                  <span className="text-green-600 font-bold">LIVE</span>
                                ) : (
                                  formatIndianDateTime(match.commence_time)
                                )}
                              </span>
                              
                              {/* Feature Icons */}
                              <div className="flex items-center gap-1">
                                {match.has_tv && (
                                  <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded" title="Live TV">
                                    TV
                                  </span>
                                )}
                                {match.has_fancy && (
                                  <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded" title="Fancy Markets">
                                    F
                                  </span>
                                )}
                                {match.has_bookmaker && (
                                  <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded" title="Bookmaker">
                                    BM
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      {/* Home Odds - Show real API odds, or "-" if not available */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (match.home_odds) {
                              handleBetClick(match, match.home_team, match.home_odds, "home");
                            }
                          }}
                          disabled={!match.home_odds}
                          className={`w-full ${match.home_odds ? 'bg-[#1a56db] hover:bg-[#1e40af] cursor-pointer text-white' : 'bg-gray-600 cursor-not-allowed text-gray-400'} font-bold text-sm py-2 px-2 rounded transition-colors`}
                        >
                          {match.home_odds?.toFixed(2) || "-"}
                        </button>
                      </td>
                      
                      {/* Draw Odds (Football only) */}
                      {activeTab === "soccer" && (
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (match.odds_draw) {
                                handleBetClick(match, "Draw", match.odds_draw, "draw");
                              }
                            }}
                            disabled={!match.odds_draw}
                            className={`w-full ${match.odds_draw ? 'bg-gray-200 hover:bg-gray-300 cursor-pointer' : 'bg-gray-600 cursor-not-allowed'} text-gray-900 font-bold text-sm py-2 px-2 rounded transition-colors`}
                          >
                            {match.odds_draw?.toFixed(2) || "-"}
                          </button>
                        </td>
                      )}
                      
                      {/* Away Odds - Show real API odds, or "-" if not available */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (match.away_odds) {
                              handleBetClick(match, match.away_team, match.away_odds, "away");
                            }
                          }}
                          disabled={!match.away_odds}
                          className={`w-full ${match.away_odds ? 'bg-[#991b1b] hover:bg-[#7f1d1d] cursor-pointer text-white' : 'bg-gray-600 cursor-not-allowed text-gray-400'} font-bold text-sm py-2 px-2 rounded transition-colors`}
                        >
                          {match.away_odds?.toFixed(2) || "-"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bet Slip Modal - Fixed Overlay */}
      {betSlip && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Place Bet</h3>
            <div className="space-y-3 mb-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-700 font-semibold">Match:</span>
                <span className="font-bold text-gray-900">{betSlip.match.home_team} v {betSlip.match.away_team}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700 font-semibold">Selection:</span>
                <span className="font-bold text-gray-900">{betSlip.team}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700 font-semibold">Odds:</span>
                <span className="font-bold text-gray-900">{betSlip.odds.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-700 font-semibold">Type:</span>
                <span className={`font-bold ${betSlip.type === "back" ? "text-blue-600" : "text-pink-600"}`}>
                  {betSlip.type.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-900 mb-2">Stake (₹)</label>
              <input
                type="number"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-4 py-2 border border-gray-300 rounded text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {stake && (
              <div className="bg-green-50 p-3 rounded mb-4">
                <p className="text-sm text-gray-700 font-semibold">Potential Profit</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{(parseFloat(stake) * betSlip.odds - parseFloat(stake)).toFixed(2)}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handlePlaceBet}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded transition-colors"
              >
                Place Bet
              </button>
              <button
                onClick={() => {
                  setBetSlip(null);
                  setStake("");
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-3 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
