import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function DeclareOutcomes() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data.filter(m => m.status === "completed" || m.status === "live"));
    } catch (error) {
      toast.error("Failed to load matches");
    }
  };

  const handleDeclareWinner = async (matchId, winner) => {
    try {
      await api.put(`/admin/matches/${matchId}/outcome?winner=${winner}`);
      toast.success("Outcome declared successfully!");
      fetchMatches();
    } catch (error) {
      toast.error("Failed to declare outcome");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Declare Outcomes</h1>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {matches.map((match) => (
              <tr key={match.match_id}>
                <td className="px-6 py-4">{match.home_team} vs {match.away_team}</td>
                <td className="px-6 py-4">{match.winner || "Pending"}</td>
                <td className="px-6 py-4 space-x-2">
                  {!match.winner && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleDeclareWinner(match.match_id, match.home_team)}
                      >
                        {match.home_team} Won
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDeclareWinner(match.match_id, match.away_team)}
                      >
                        {match.away_team} Won
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
