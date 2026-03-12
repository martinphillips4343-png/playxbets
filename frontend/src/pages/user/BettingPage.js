import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function BettingPage() {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [odds, setOdds] = useState(0);
  const [stake, setStake] = useState("");

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data.filter(m => m.status === "scheduled"));
    } catch (error) {
      toast.error("Failed to load matches");
    }
  };

  const handlePlaceBet = async () => {
    if (!selectedMatch || !selectedTeam || !stake) {
      toast.error("Please fill all fields");
      return;
    }

    try {
      await api.post("/bets", {
        match_id: selectedMatch.match_id,
        selected_team: selectedTeam,
        odds: odds,
        stake: parseFloat(stake),
      });
      toast.success("Bet placed successfully!");
      setSelectedMatch(null);
      setSelectedTeam("");
      setStake("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to place bet");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Place Bets</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matches List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Available Matches</h2>
          <div className="space-y-3">
            {matches.map((match) => (
              <div
                key={match.match_id}
                className={`bg-white rounded-lg shadow p-4 cursor-pointer transition ${
                  selectedMatch?.match_id === match.match_id ? "ring-2 ring-blue-500" : ""
                }`}
                onClick={() => {
                  setSelectedMatch(match);
                  setSelectedTeam("");
                  setOdds(0);
                }}
              >
                <p className="text-sm text-gray-600 mb-1">{match.league}</p>
                <p className="font-semibold">{match.home_team} vs {match.away_team}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {new Date(match.commence_time).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Bet Slip */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Bet Slip</h2>
          <div className="bg-white rounded-lg shadow p-6">
            {selectedMatch ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Winner</label>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        setSelectedTeam(selectedMatch.home_team);
                        setOdds(selectedMatch.home_odds || 0);
                      }}
                      className={`w-full p-3 rounded border ${
                        selectedTeam === selectedMatch.home_team
                          ? "bg-blue-50 border-blue-500"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {selectedMatch.home_team} @ {selectedMatch.home_odds?.toFixed(2) || "N/A"}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedTeam(selectedMatch.away_team);
                        setOdds(selectedMatch.away_odds || 0);
                      }}
                      className={`w-full p-3 rounded border ${
                        selectedTeam === selectedMatch.away_team
                          ? "bg-blue-50 border-blue-500"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {selectedMatch.away_team} @ {selectedMatch.away_odds?.toFixed(2) || "N/A"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Stake Amount</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    placeholder="Enter stake"
                  />
                </div>

                {stake && odds > 0 && (
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Potential Win:</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${(parseFloat(stake) * odds).toFixed(2)}
                    </p>
                  </div>
                )}

                <Button onClick={handlePlaceBet} className="w-full">
                  Place Bet
                </Button>
              </div>
            ) : (
              <p className="text-gray-600 text-center">Select a match to place a bet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
