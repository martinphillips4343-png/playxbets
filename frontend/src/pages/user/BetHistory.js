import { useState, useEffect } from "react";
import { api } from "@/App";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

export default function BetHistory() {
  const [bets, setBets] = useState([]);

  useEffect(() => {
    fetchBets();
  }, []);

  const fetchBets = async () => {
    try {
      const response = await api.get("/bets/history");
      setBets(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div>
      <DashboardHeader title="Bet History" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Match</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Selected Team</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Stake</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Odds</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Potential Win</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Placed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {bets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-8 text-center text-gray-700 font-medium">
                    No bets placed yet
                  </td>
                </tr>
              ) : (
                bets.map((bet) => (
                  <tr key={bet.bet_id}>
                    <td className="px-6 py-4 text-gray-900 font-medium">{bet.match_id.slice(0, 12)}...</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{bet.selected_team}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">₹{bet.stake.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-900 font-medium">{bet.odds.toFixed(2)}</td>
                    <td className="px-6 py-4 text-green-600 font-bold">₹{bet.potential_win.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${
                        bet.status === 'won' ? 'bg-green-100 text-green-800' :
                        bet.status === 'lost' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {bet.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{formatIndianDateTime(bet.placed_at)}</td>
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
