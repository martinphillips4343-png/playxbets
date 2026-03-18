import { useState, useEffect } from "react";
import { api } from "@/App";
import PublicHeader from "@/components/PublicHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { toast } from "sonner";

export default function PublicHomepage({ onShowAuth, user, onLogout }) {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
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

  // Filter matches: only show live and upcoming (not completed)
  const filteredMatches = matches.filter((m) => {
    // Filter by sport tab
    if (m.sport !== activeTab) return false;
    
    // Filter out completed matches
    if (m.status === "completed" || m.status === "ended" || m.status === "finished") return false;
    
    // Check if match date is in the past (more than 3 hours ago = likely completed)
    const matchTime = new Date(m.commence_time);
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    
    // If match started more than 3 hours ago and not marked as live, consider it completed
    if (matchTime < threeHoursAgo && m.status !== "live") return false;
    
    return true;
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
        <div className="bg-white rounded-lg shadow mb-6">
          <table className="w-full">
            <thead className="bg-[#243a5e] text-white">
              <tr>
                <th className="px-6 py-3 text-left font-bold text-base">Game</th>
                <th className="px-6 py-3 text-center font-bold text-base w-32">1</th>
                <th className="px-6 py-3 text-center font-bold text-base w-32">X</th>
                <th className="px-6 py-3 text-center font-bold text-base w-32">2</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500 font-medium">
                    No {activeTab === "cricket" ? "cricket" : "football"} matches available
                  </td>
                </tr>
              ) : (
                filteredMatches.map((match) => (
                  <tr
                    key={match.match_id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedMatch(match)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {match.status === "live" && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-green-600">LIVE</span>
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 text-base">
                            {match.home_team} v {match.away_team}
                          </div>
                          <div className="text-xs text-gray-700 font-medium">
                            {formatIndianDateTime(match.commence_time)}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    {/* Home Odds */}
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleBetClick(match, match.home_team, match.home_odds, "back")}
                          className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded"
                        >
                          <div className="text-sm font-bold text-gray-900">
                            {match.home_odds?.toFixed(2) || "-"}
                          </div>
                        </button>
                        <button
                          onClick={() => handleBetClick(match, match.home_team, match.home_odds + 0.01, "lay")}
                          className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded"
                        >
                          <div className="text-sm font-bold text-gray-900">
                            {(match.home_odds + 0.01)?.toFixed(2) || "-"}
                          </div>
                        </button>
                      </div>
                    </td>

                    {/* Draw Odds */}
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      {match.sport === "soccer" ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleBetClick(match, "Draw", match.odds_draw, "back")}
                            className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded"
                          >
                            <div className="text-sm font-bold text-gray-900">
                              {match.odds_draw?.toFixed(2) || "-"}
                            </div>
                          </button>
                          <button
                            onClick={() => handleBetClick(match, "Draw", match.odds_draw + 0.01, "lay")}
                            className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded"
                          >
                            <div className="text-sm font-bold text-gray-900">
                              {(match.odds_draw + 0.01)?.toFixed(2) || "-"}
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 font-medium">-</div>
                      )}
                    </td>

                    {/* Away Odds */}
                    <td className="px-2 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleBetClick(match, match.away_team, match.away_odds, "back")}
                          className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded"
                        >
                          <div className="text-sm font-bold text-gray-900">
                            {match.away_odds?.toFixed(2) || "-"}
                          </div>
                        </button>
                        <button
                          onClick={() => handleBetClick(match, match.away_team, match.away_odds + 0.01, "lay")}
                          className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded"
                        >
                          <div className="text-sm font-bold text-gray-900">
                            {(match.away_odds + 0.01)?.toFixed(2) || "-"}
                          </div>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
