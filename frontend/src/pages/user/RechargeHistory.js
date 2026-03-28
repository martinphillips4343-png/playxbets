import { useState, useEffect } from "react";
import { api } from "@/App";
import { ArrowUpCircle, Wallet } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";

export default function RechargeHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecharges = async () => {
      try {
        const response = await api.get("/transactions/recharge-history");
        setTransactions(response.data);
      } catch (error) {
        console.error("Failed to fetch recharge history:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRecharges();
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117]">
      <DashboardHeader title="Recharge History" />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="bg-[#161B22] rounded-lg overflow-hidden">
          <div className="bg-[#2C3E50] px-4 py-3 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-white">Recharge / Deposit History</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : transactions.length === 0 ? (
            <div className="py-12 text-center text-gray-400">
              <ArrowUpCircle className="w-10 h-10 mx-auto mb-3 text-gray-600" />
              <p>No recharge history yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700/50">
              {transactions.map((txn, idx) => (
                <div key={txn.transaction_id || idx} className="flex items-center justify-between px-4 py-3" data-testid={`recharge-row-${idx}`}>
                  <div>
                    <p className="text-sm text-white font-medium">
                      {txn.type === "deposit" ? "Deposit" : "Recharge"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {txn.created_at ? new Date(txn.created_at).toLocaleString("en-IN") : "-"}
                    </p>
                    {txn.description && <p className="text-xs text-gray-500 mt-0.5">{txn.description}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-green-400 font-bold text-sm">
                      +₹{(txn.amount || 0).toLocaleString("en-IN")}
                    </span>
                    <p className="text-[10px] text-gray-500">
                      Bal: ₹{(txn.balance_after || 0).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
