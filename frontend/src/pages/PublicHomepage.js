import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import PublicHeader from "@/components/PublicHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { toast } from "sonner";
import { X, Tv, MapPin, Calendar, Trophy, Clock, ChevronRight, Loader2 } from "lucide-react";

export default function PublicHomepage({ onShowAuth, user, onLogout }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchDetail, setMatchDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState("cricket");
  const [betSlip, setBetSlip] = useState(null);
  const [stake, setStake] = useState("");

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  // Fetch match detail when a match is selected
  const fetchMatchDetail = async (matchId) => {
    setLoadingDetail(true);
    try {
      const response = await api.get(`/match/${matchId}`);
      setMatchDetail(response.data);
    } catch (error) {
      console.error("Error fetching match detail:", error);
      toast.error("Failed to load match details");
      setMatchDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Handle match click - open detail modal
  const handleMatchClick = (match) => {
    setSelectedMatch(match);
    fetchMatchDetail(match.match_id);
  };

  // Close match detail modal
  const closeMatchDetail = () => {
    setSelectedMatch(null);
    setMatchDetail(null);
  };

  // Navigate to exchange page for cricket match
  const goToExchange = () => {
    navigate("/exchange");
  };

  // Filter matches: only show live and upcoming (not completed)
  // Then sort by commence_time ascending (earliest first)
  const filteredMatches = matches
    .filter((m) => {
      // Filter by sport tab
      if (m.sport !== activeTab) return false;
      
      // Filter out explicitly completed matches
      if (m.status === "completed" || m.status === "ended" || m.status === "finished") return false;
      
      // For live matches, always show
      if (m.status === "live") return true;
      
      // For scheduled/upcoming, include future matches only
      const matchTime = new Date(m.commence_time);
      const now = new Date();
      return matchTime > now;
    })
    // Sort by commence_time ascending (live matches first, then by date)
    .sort((a, b) => {
      // Live matches come first
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      
      // Then sort by date ascending
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
        </div>

        {/* Matches List */}
        <div className="bg-white rounded-lg shadow mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#243a5e] text-white">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-sm">Match</th>
                  <th className="px-2 py-3 text-center font-bold text-sm w-24">1</th>
                  {activeTab === "soccer" && <th className="px-2 py-3 text-center font-bold text-sm w-24">X</th>}
                  <th className="px-2 py-3 text-center font-bold text-sm w-24">2</th>
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
                      
                      {/* Home Odds */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBetClick(match, match.home_team, match.home_odds || 1.85, "home");
                          }}
                          className="w-full bg-[#72BBEF] hover:bg-[#5BA8DC] text-gray-900 font-bold text-sm py-2 px-2 rounded transition-colors"
                        >
                          {match.home_odds?.toFixed(2) || "1.85"}
                        </button>
                      </td>
                      
                      {/* Draw Odds (Football only) */}
                      {activeTab === "soccer" && (
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBetClick(match, "Draw", match.odds_draw || 3.20, "draw");
                            }}
                            className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-sm py-2 px-2 rounded transition-colors"
                          >
                            {match.odds_draw?.toFixed(2) || "3.20"}
                          </button>
                        </td>
                      )}
                      
                      {/* Away Odds */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBetClick(match, match.away_team, match.away_odds || 1.95, "away");
                          }}
                          className="w-full bg-[#FAA9BA] hover:bg-[#E8899A] text-gray-900 font-bold text-sm py-2 px-2 rounded transition-colors"
                        >
                          {match.away_odds?.toFixed(2) || "1.95"}
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

      {/* Match Detail Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeMatchDetail}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#243a5e] to-[#1a2d4a] text-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {selectedMatch.status === "live" && (
                    <div className="flex items-center gap-1 bg-red-500 px-2 py-0.5 rounded text-xs font-bold">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      LIVE
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-300">{selectedMatch.league || "Cricket"}</p>
                    <h2 className="text-lg font-bold">{selectedMatch.home_team} vs {selectedMatch.away_team}</h2>
                  </div>
                </div>
                <button 
                  onClick={closeMatchDetail}
                  className="text-gray-300 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
              {loadingDetail ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                  <p className="text-gray-500">Loading match details...</p>
                </div>
              ) : matchDetail ? (
                <div className="space-y-4">
                  {/* Match Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Calendar className="w-3 h-3" />
                        Date & Time
                      </div>
                      <p className="font-semibold text-gray-900 text-sm">
                        {formatIndianDateTime(matchDetail.commence_time)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Trophy className="w-3 h-3" />
                        Format
                      </div>
                      <p className="font-semibold text-gray-900 text-sm uppercase">
                        {matchDetail.format || "T20"}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <Clock className="w-3 h-3" />
                        Status
                      </div>
                      <p className={`font-semibold text-sm capitalize ${
                        matchDetail.status === "live" ? "text-green-600" : "text-gray-900"
                      }`}>
                        {matchDetail.status}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                        <MapPin className="w-3 h-3" />
                        Venue
                      </div>
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {matchDetail.venue || "TBD"}
                      </p>
                    </div>
                  </div>

                  {/* Live Score (if available) */}
                  {matchDetail.score && matchDetail.score.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                      <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        Live Score
                      </h3>
                      <div className="space-y-1">
                        {matchDetail.score.map((s, idx) => (
                          <p key={idx} className="text-green-900 font-semibold">{s}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Odds Section */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-bold text-gray-800 mb-3">Match Odds</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-xs text-gray-500 mb-1">{matchDetail.home_team}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              handleBetClick(selectedMatch, matchDetail.home_team, matchDetail.odds?.home || 1.85, "back");
                              closeMatchDetail();
                            }}
                            className="flex-1 bg-[#72BBEF] hover:bg-[#5BA8DC] text-gray-900 font-bold py-2 rounded text-sm"
                          >
                            Back {matchDetail.odds?.home?.toFixed(2) || "1.85"}
                          </button>
                          <button 
                            onClick={() => {
                              handleBetClick(selectedMatch, matchDetail.home_team, (matchDetail.odds?.home || 1.85) + 0.02, "lay");
                              closeMatchDetail();
                            }}
                            className="flex-1 bg-[#FAA9BA] hover:bg-[#E8899A] text-gray-900 font-bold py-2 rounded text-sm"
                          >
                            Lay {((matchDetail.odds?.home || 1.85) + 0.02).toFixed(2)}
                          </button>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-xs text-gray-500 mb-1">{matchDetail.away_team}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              handleBetClick(selectedMatch, matchDetail.away_team, matchDetail.odds?.away || 1.95, "back");
                              closeMatchDetail();
                            }}
                            className="flex-1 bg-[#72BBEF] hover:bg-[#5BA8DC] text-gray-900 font-bold py-2 rounded text-sm"
                          >
                            Back {matchDetail.odds?.away?.toFixed(2) || "1.95"}
                          </button>
                          <button 
                            onClick={() => {
                              handleBetClick(selectedMatch, matchDetail.away_team, (matchDetail.odds?.away || 1.95) + 0.02, "lay");
                              closeMatchDetail();
                            }}
                            className="flex-1 bg-[#FAA9BA] hover:bg-[#E8899A] text-gray-900 font-bold py-2 rounded text-sm"
                          >
                            Lay {((matchDetail.odds?.away || 1.95) + 0.02).toFixed(2)}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="flex flex-wrap gap-2">
                    {matchDetail.features?.has_tv && (
                      <div className="flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1.5 rounded-full text-sm font-medium">
                        <Tv className="w-4 h-4" />
                        Live TV
                      </div>
                    )}
                    {matchDetail.features?.has_fancy && (
                      <div className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded-full text-sm font-medium">
                        Fancy Markets
                      </div>
                    )}
                    {matchDetail.features?.has_bookmaker && (
                      <div className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium">
                        Bookmaker
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>Failed to load match details</p>
                  <button 
                    onClick={() => fetchMatchDetail(selectedMatch.match_id)}
                    className="mt-2 text-blue-600 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t p-4 bg-gray-50">
              <button
                onClick={goToExchange}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                Go to Full Exchange
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
