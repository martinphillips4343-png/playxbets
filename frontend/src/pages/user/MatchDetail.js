import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";

export default function MatchDetail() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [selectedBet, setSelectedBet] = useState(null);
  const [stake, setStake] = useState("");
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    fetchMatch();
    fetchWallet();
  }, [matchId]);

  const fetchMatch = async () => {
    try {
      const response = await api.get(`/matches/${matchId}`);
      setMatch(response.data);
    } catch (error) {
      toast.error("Failed to load match");
    }
  };

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setWallet(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handlePlaceBet = async () => {
    if (!stake || parseFloat(stake) <= 0) {
      toast.error("Enter valid stake amount");
      return;
    }

    try {
      await api.post("/bets", {
        match_id: matchId,
        selected_team: selectedBet.team,
        odds: selectedBet.odds,
        stake: parseFloat(stake),
      });
      toast.success("Bet placed successfully!");
      setSelectedBet(null);
      setStake("");
      fetchWallet();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to place bet");
    }
  };

  if (!match) {
    return (
      <div>
        <DashboardHeader title="Match Details" />
        <div className="p-8">
          <p className="text-gray-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const handleOddsClick = (team, odds, type) => {
    setSelectedBet({ team, odds, type });
  };

  return (
    <div>
      <DashboardHeader title="Match Details" />
      
      <div className="p-6 bg-gray-100 min-h-screen">
        {/* Back Button */}
        <Button
          onClick={() => navigate("/user/betting")}
          variant="ghost"
          className="mb-4 text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Matches
        </Button>

        {/* Match Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {match.home_team} v {match.away_team}
              </h2>
              <p className="text-gray-700 font-medium mt-1">{match.league}</p>
            </div>
            {match.status === "live" && (
              <div className="flex items-center gap-2 bg-green-100 px-4 py-2 rounded">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-800 font-bold">LIVE</span>
              </div>
            )}
          </div>
        </div>

        {/* Match Odds */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="bg-[#243a5e] text-white px-6 py-3 font-semibold">
            Match Odds
          </div>
          
          <table className="w-full">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-900 w-1/3"></th>
                <th className="px-6 py-3 text-center font-semibold text-gray-900" colSpan="3">
                  <div className="flex justify-center gap-16">
                    <span>Back</span>
                    <span>Lay</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Home Team */}
              <tr className="border-b hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900 text-lg">{match.home_team}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => handleOddsClick(match.home_team, match.home_odds, "back")}
                      className="bg-[#72bbef] hover:bg-[#5ba9e0] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                    >
                      {match.home_odds?.toFixed(2)}
                    </button>
                    <button
                      onClick={() => handleOddsClick(match.home_team, match.home_odds + 0.01, "lay")}
                      className="bg-[#faa9ba] hover:bg-[#f991a8] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                    >
                      {(match.home_odds + 0.01)?.toFixed(2)}
                    </button>
                  </div>
                </td>
              </tr>

              {/* Draw - Only for Football */}
              {match.sport === "soccer" && (
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 text-lg">Draw</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => handleOddsClick("Draw", match.odds_draw, "back")}
                        className="bg-[#72bbef] hover:bg-[#5ba9e0] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                      >
                        {match.odds_draw?.toFixed(2)}
                      </button>
                      <button
                        onClick={() => handleOddsClick("Draw", match.odds_draw + 0.01, "lay")}
                        className="bg-[#faa9ba] hover:bg-[#f991a8] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                      >
                        {(match.odds_draw + 0.01)?.toFixed(2)}
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Away Team */}
              <tr className="border-b hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900 text-lg">{match.away_team}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 justify-center">
                    <button
                      onClick={() => handleOddsClick(match.away_team, match.away_odds, "back")}
                      className="bg-[#72bbef] hover:bg-[#5ba9e0] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                    >
                      {match.away_odds?.toFixed(2)}
                    </button>
                    <button
                      onClick={() => handleOddsClick(match.away_team, match.away_odds + 0.01, "lay")}
                      className="bg-[#faa9ba] hover:bg-[#f991a8] px-6 py-3 rounded font-bold text-gray-900 min-w-[80px]"
                    >
                      {(match.away_odds + 0.01)?.toFixed(2)}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bet Slip */}
        {selectedBet && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Place Bet</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Selection</p>
                <p className="font-bold text-gray-900">{selectedBet.team}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Odds</p>
                <p className="font-bold text-gray-900">{selectedBet.odds.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Type</p>
                <p className={`font-bold ${selectedBet.type === "back" ? "text-blue-600" : "text-pink-600"}`}>
                  {selectedBet.type.toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Your Balance</p>
                <p className="font-bold text-green-600">₹{wallet?.balance?.toFixed(2) || "0.00"}</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Stake Amount (₹)</label>
              <Input
                type="number"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Enter stake"
                className="text-gray-900 font-medium"
              />
            </div>

            {stake && (
              <div className="bg-gray-100 p-4 rounded mb-4">
                <p className="text-sm text-gray-700 font-semibold mb-1">Potential Profit</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{(parseFloat(stake) * selectedBet.odds - parseFloat(stake)).toFixed(2)}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handlePlaceBet}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
              >
                Place Bet
              </Button>
              <Button
                onClick={() => {
                  setSelectedBet(null);
                  setStake("");
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
