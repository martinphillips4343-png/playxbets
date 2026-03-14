import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatIndianDateTime } from "@/utils/dateFormat";
import DashboardHeader from "@/components/DashboardHeader";

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    fetchWithdrawals();
  }, []);

  const fetchWithdrawals = async () => {
    try {
      const response = await api.get("/admin/withdrawals");
      setWithdrawals(response.data);
    } catch (error) {
      toast.error("Failed to load withdrawals");
    }
  };

  const handleUpdate = async (withdrawalId, status) => {
    try {
      await api.put(`/admin/withdrawals/${withdrawalId}`, { status });
      toast.success(`Withdrawal ${status}!`);
      fetchWithdrawals();
    } catch (error) {
      toast.error("Failed to update withdrawal");
    }
  };

  return (
    <div>
      <DashboardHeader title="Withdrawals" />
      
      <div className="p-8">
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">User ID</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Note</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-700 font-medium">
                    No withdrawal requests
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.withdrawal_id}>
                    <td className="px-6 py-4 text-gray-900 font-medium">{w.user_id.slice(0, 8)}...</td>
                    <td className="px-6 py-4 text-gray-900 font-bold">₹{w.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{w.note || "N/A"}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${
                        w.status === 'approved' ? 'bg-green-100 text-green-800' :
                        w.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{formatIndianDateTime(w.created_at)}</td>
                    <td className="px-6 py-4 space-x-2">
                      {w.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(w.withdrawal_id, 'approved')}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdate(w.withdrawal_id, 'rejected')}
                            variant="destructive"
                          >
                            Reject
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
