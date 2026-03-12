import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { formatIndianDate } from "@/utils/dateFormat";

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
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Manage Bettors</h1>
      
      <div className="bg-white rounded-lg shadow">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {bettors.map((bettor) => (
              <tr key={bettor.user_id}>
                <td className="px-6 py-4">{bettor.username}</td>
                <td className="px-6 py-4">{bettor.email || "N/A"}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${bettor.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                    {bettor.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(bettor.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
