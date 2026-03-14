import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

export default function DeclareOutcomes() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data.filter(m => m.status === "completed" || m.status === "live" || m.status === "scheduled"));
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
    <div>
      <DashboardHeader title="Declare Outcomes" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Match</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Winner</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {matches.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-700 font-medium">
                    No matches available
                  </td>
                </tr>
              ) : (
                matches.map((match) => (
                  <tr key={match.match_id}>
                    <td className="px-6 py-4 text-gray-900 font-medium">{match.home_team} vs {match.away_team}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{formatIndianDateTime(match.commence_time)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${
                        match.status === 'live' ? 'bg-red-100 text-red-800' :
                        match.status === 'completed' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {match.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-bold">{match.winner || "-"}</td>
                    <td className="px-6 py-4 space-x-2">
                      {!match.winner && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleDeclareWinner(match.match_id, match.home_team)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {match.home_team} Won
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeclareWinner(match.match_id, match.away_team)}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {match.away_team} Won
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
