import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { formatIndianDate } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

export default function ManageBettors() {
  const [bettors, setBettors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBettors();
  }, []);

  const fetchBettors = async () => {
    try {
      const response = await api.get("/admin/users");
      setBettors(response.data);
    } catch (error) {
      toast.error("Failed to load bettors");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <DashboardHeader title="Manage Bettors" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Username</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Email</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {bettors.map((bettor) => (
                <tr key={bettor.user_id}>
                  <td className="px-6 py-4 text-gray-900 font-medium">{bettor.username}</td>
                  <td className="px-6 py-4 text-gray-700">{bettor.email || "N/A"}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${bettor.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {bettor.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-700 font-medium">
                    {formatIndianDate(bettor.created_at)}
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
