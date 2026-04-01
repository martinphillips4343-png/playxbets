import { useState, useEffect } from "react";
import { api } from "@/App";
import { ArrowUpCircle, IndianRupee, Building2 } from "lucide-react";

export default function MyWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/withdrawals/my");
        setWithdrawals(res.data);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const fmtDate = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
  const statusColors = { pending: "bg-yellow-500/20 text-yellow-400", approved: "bg-green-500/20 text-green-400", rejected: "bg-red-500/20 text-red-400" };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4" data-testid="my-withdrawals-page">
      <div className="bg-[#161B22] rounded-lg border border-gray-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><ArrowUpCircle className="w-4 h-4 text-red-400" /> My Withdrawals ({withdrawals.length})</h3>
        </div>
        {withdrawals.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No withdrawals yet</div>
        ) : (
          <div className="divide-y divide-gray-700/30">
            {withdrawals.map((w, i) => (
              <div key={i} className="px-4 py-3 hover:bg-[#1E2736]/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="w-4 h-4 text-red-400" />
                    <span className="text-base font-bold text-red-400">{w.amount?.toLocaleString("en-IN")}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColors[w.status]}`}>{w.status}</span>
                  </div>
                  <span className="text-xs text-gray-500">{fmtDate(w.created_at)}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> {w.bank_name} | A/C: ...{w.account_number?.slice(-4)} | IFSC: {w.ifsc_code} {w.upi_id ? `| UPI: ${w.upi_id}` : ""}
                </div>
                {w.admin_note && <div className="text-[10px] text-cyan-400 mt-0.5">Admin: {w.admin_note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
