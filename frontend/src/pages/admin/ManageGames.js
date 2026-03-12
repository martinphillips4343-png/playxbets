import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";

export default function ManageGames() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data);
    } catch (error) {
      toast.error("Failed to load matches");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Manage Games</h1>
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sport</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">League</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teams</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {matches.map((match) => (
              <tr key={match.match_id}>
                <td className="px-6 py-4 capitalize">{match.sport}</td>
                <td className="px-6 py-4">{match.league}</td>
                <td className="px-6 py-4">{match.home_team} vs {match.away_team}</td>
                <td className="px-6 py-4 text-sm">{new Date(match.commence_time).toLocaleString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${match.status === 'live' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                    {match.status}
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
