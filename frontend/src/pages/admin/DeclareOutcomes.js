import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";
import { Trophy, AlertTriangle, Users, DollarSign } from "lucide-react";

export default function DeclareOutcomes() {
  const [pendingMatches, setPendingMatches] = useState([]);
  const [allMatches, setAllMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingRes, matchesRes] = await Promise.all([
        api.get("/admin/settlement/pending"),
        api.get("/matches")
      ]);
      setPendingMatches(pendingRes.data.matches || []);
      setAllMatches(matchesRes.data.filter(m => !m.winner));
    } catch (error) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeclareWinner = async (matchId, winner, matchName) => {
    if (!window.confirm(`Declare "${winner}" as winner for ${matchName}? This will settle all pending bets.`)) return;
    
    setSettling(matchId);
    try {
      const res = await api.put(`/admin/matches/${matchId}/outcome?winner=${winner}`);
      const d = res.data;
      toast.success(`Settled! ${d.won || 0} won, ${d.lost || 0} lost, payout: ${(d.total_payout || 0).toFixed(2)}`);
      fetchData();
    } catch (error) {
      toast.error("Failed to declare outcome");
    } finally {
      setSettling(null);
    }
  };

  return (
    <div>
      <DashboardHeader title="Bet Settlement" />
      
      <div className="p-6 space-y-6">
        {/* Pending Settlements Section */}
        {pendingMatches.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2" data-testid="pending-settlements-header">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Matches with Unsettled Bets ({pendingMatches.length})
            </h2>
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full" data-testid="pending-settlements-table">
                <thead className="bg-amber-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Match</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Pending Bets</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Total Stake</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingMatches.map((match) => (
                    <tr key={match.match_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900" data-testid={`match-name-${match.match_id}`}>
                          {match.home_team} vs {match.away_team}
                        </div>
                        <div className="text-xs text-gray-500">{match.league?.split(",")[0]}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          match.status === 'live' ? 'bg-red-100 text-red-800' :
                          match.status === 'completed' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>{match.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          <Users className="w-3 h-3" /> {match.pending_bets}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">
                        {match.total_stake.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            disabled={settling === match.match_id}
                            onClick={() => handleDeclareWinner(match.match_id, match.home_team, `${match.home_team} vs ${match.away_team}`)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
                            data-testid={`declare-home-${match.match_id}`}
                          >
                            <Trophy className="w-3 h-3 mr-1" /> {match.home_team}
                          </Button>
                          <Button
                            size="sm"
                            disabled={settling === match.match_id}
                            onClick={() => handleDeclareWinner(match.match_id, match.away_team, `${match.home_team} vs ${match.away_team}`)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                            data-testid={`declare-away-${match.match_id}`}
                          >
                            <Trophy className="w-3 h-3 mr-1" /> {match.away_team}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* All Active Matches */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-3">All Active Matches</h2>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full" data-testid="all-matches-table">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Match</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Odds (H/A)</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : allMatches.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No active matches</td></tr>
                ) : (
                  allMatches.map((match) => (
                    <tr key={match.match_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{match.home_team} vs {match.away_team}</td>
                      <td className="px-4 py-3 text-gray-700 text-sm">{formatIndianDateTime(match.commence_time)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          match.status === 'live' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                        }`}>{match.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm">
                        {match.home_odds ? `${match.home_odds} / ${match.away_odds}` : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            disabled={settling === match.match_id}
                            onClick={() => handleDeclareWinner(match.match_id, match.home_team, `${match.home_team} vs ${match.away_team}`)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs"
                          >
                            {match.home_team} Won
                          </Button>
                          <Button
                            size="sm"
                            disabled={settling === match.match_id}
                            onClick={() => handleDeclareWinner(match.match_id, match.away_team, `${match.home_team} vs ${match.away_team}`)}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                          >
                            {match.away_team} Won
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
