import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

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
    <div>
      <DashboardHeader title="Manage Games" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Sport</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">League</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Teams</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Start Time</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {matches.map((match) => (
                <tr key={match.match_id}>
                  <td className="px-6 py-4 capitalize text-gray-900 font-medium">{match.sport}</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">{match.league}</td>
                  <td className="px-6 py-4 text-gray-900 font-medium">{match.home_team} vs {match.away_team}</td>
                  <td className="px-6 py-4 text-gray-700 font-medium">{formatIndianDateTime(match.commence_time)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${match.status === 'live' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                      {match.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
