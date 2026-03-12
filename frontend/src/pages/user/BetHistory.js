import { useState, useEffect } from "react";
import { api } from "@/App";

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
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Bet History</h1>
      
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Match</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selected Team</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stake</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Odds</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Potential Win</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bets.map((bet) => (
              <tr key={bet.bet_id}>
                <td className="px-6 py-4">{bet.match_id}</td>
                <td className="px-6 py-4">{bet.selected_team}</td>
                <td className="px-6 py-4">${bet.stake.toFixed(2)}</td>
                <td className="px-6 py-4">{bet.odds.toFixed(2)}</td>
                <td className="px-6 py-4">${bet.potential_win.toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${
                    bet.status === 'won' ? 'bg-green-100 text-green-800' :
                    bet.status === 'lost' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {bet.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
