import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Withdrawals</h1>
      
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {withdrawals.map((w) => (
              <tr key={w.withdrawal_id}>
                <td className="px-6 py-4 text-sm">{w.user_id}</td>
                <td className="px-6 py-4">${w.amount.toFixed(2)}</td>
                <td className="px-6 py-4 text-sm">{w.note || "N/A"}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs rounded ${
                    w.status === 'approved' ? 'bg-green-100 text-green-800' :
                    w.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {w.status}
                  </span>
                </td>
                <td className="px-6 py-4 space-x-2">
                  {w.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(w.withdrawal_id, 'approved')}
                        className="bg-green-600 hover:bg-green-700"
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
