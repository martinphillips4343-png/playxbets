import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import DashboardHeader from "@/components/DashboardHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";

export default function BettingExchange() {
  const [matches, setMatches] = useState([]);
  const [activeTab, setActiveTab] = useState("cricket");
  const navigate = useNavigate();

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

  const filteredMatches = matches.filter((m) => m.sport === activeTab);

  const handleMatchClick = (matchId) => {
    navigate(`/user/match/${matchId}`);
  };

  return (
    <div>
      <DashboardHeader title="Betting Exchange" />
      
      <div className="p-6 bg-gray-100 min-h-screen">
        {/* Sport Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("cricket")}
            className={`px-6 py-2 font-semibold rounded-t ${
              activeTab === "cricket"
                ? "bg-white text-gray-900 border-b-2 border-blue-600"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            🏏 Cricket
          </button>
          <button
            onClick={() => setActiveTab("soccer")}
            className={`px-6 py-2 font-semibold rounded-t ${
              activeTab === "soccer"
                ? "bg-white text-gray-900 border-b-2 border-blue-600"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            ⚽ Football
          </button>
        </div>

        {/* Matches Table */}
        <div className="bg-white rounded-lg shadow">
          <table className="w-full">
            <thead className="bg-[#243a5e] text-white">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Game</th>
                <th className="px-6 py-3 text-center font-semibold w-32">1</th>
                <th className="px-6 py-3 text-center font-semibold w-32">X</th>
                <th className="px-6 py-3 text-center font-semibold w-32">2</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.map((match) => (
                <tr
                  key={match.match_id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleMatchClick(match.match_id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {match.status === "live" && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs font-semibold text-green-600">LIVE</span>
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900">
                          {match.home_team} v {match.away_team}
                        </div>
                        <div className="text-xs text-gray-600 font-medium">
                          {formatIndianDateTime(match.commence_time)}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  {/* Team 1 (Home) Odds */}
                  <td className="px-2 py-4">
                    <div className="flex gap-1">
                      <div className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded cursor-pointer">
                        <div className="text-sm font-bold text-gray-900">
                          {match.home_odds?.toFixed(2) || "-"}
                        </div>
                      </div>
                      <div className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded cursor-pointer">
                        <div className="text-sm font-bold text-gray-900">
                          {(match.home_odds + 0.01)?.toFixed(2) || "-"}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Draw (X) Odds - Only for Football */}
                  <td className="px-2 py-4">
                    {match.sport === "soccer" ? (
                      <div className="flex gap-1">
                        <div className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded cursor-pointer">
                          <div className="text-sm font-bold text-gray-900">
                            {match.odds_draw?.toFixed(2) || "-"}
                          </div>
                        </div>
                        <div className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded cursor-pointer">
                          <div className="text-sm font-bold text-gray-900">
                            {(match.odds_draw + 0.01)?.toFixed(2) || "-"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400">-</div>
                    )}
                  </td>

                  {/* Team 2 (Away) Odds */}
                  <td className="px-2 py-4">
                    <div className="flex gap-1">
                      <div className="flex-1 bg-[#72bbef] hover:bg-[#5ba9e0] text-center py-2 px-3 rounded cursor-pointer">
                        <div className="text-sm font-bold text-gray-900">
                          {match.away_odds?.toFixed(2) || "-"}
                        </div>
                      </div>
                      <div className="flex-1 bg-[#faa9ba] hover:bg-[#f991a8] text-center py-2 px-3 rounded cursor-pointer">
                        <div className="text-sm font-bold text-gray-900">
                          {(match.away_odds + 0.01)?.toFixed(2) || "-"}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredMatches.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 font-medium">No matches available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
