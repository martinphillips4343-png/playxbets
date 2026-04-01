import { useState, useEffect, useCallback } from "react";
import { api } from "@/App";
import { ArrowUpCircle, CheckCircle, XCircle, Search, Building2, CreditCard } from "lucide-react";

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [wRes, sRes] = await Promise.all([
        api.get("/admin/withdrawals"),
        api.get("/admin/wallet/stats"),
      ]);
      setWithdrawals(wRes.data);
      setStats(sRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (withdrawalId) => {
    if (!window.confirm("Approve this withdrawal? Amount will be deducted from user wallet.")) return;
    setProcessing(withdrawalId);
    try {
      await api.put(`/admin/withdrawals/${withdrawalId}`, { status: "approved", admin_note: "Approved and paid" });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to approve");
    }
    setProcessing(null);
  };

  const handleReject = async (withdrawalId) => {
    if (!window.confirm("Reject this withdrawal? Frozen amount will be returned to user.")) return;
    setProcessing(withdrawalId);
    try {
      await api.put(`/admin/withdrawals/${withdrawalId}`, { status: "rejected", admin_note: "Rejected by admin" });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to reject");
    }
    setProcessing(null);
  };

  const filtered = withdrawals.filter(w => {
    if (filter !== "all" && w.status !== filter) return false;
    if (search && !w.username?.toLowerCase().includes(search.toLowerCase()) && !w.account_holder?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fmtDate = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
  const statusColors = { pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", approved: "bg-green-500/20 text-green-400 border-green-500/30", rejected: "bg-red-500/20 text-red-400 border-red-500/30" };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4" data-testid="admin-withdrawals-page">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#161B22] rounded-lg p-4 border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">Total Withdrawals</div>
          <div className="text-xl font-bold text-red-400">{(stats?.total_withdrawals || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
        <div className="bg-[#161B22] rounded-lg p-4 border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">Pending Withdrawals</div>
          <div className="text-xl font-bold text-yellow-400">{stats?.pending_withdrawals || 0}</div>
        </div>
        <div className="bg-[#161B22] rounded-lg p-4 border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">Total Deposits</div>
          <div className="text-xl font-bold text-green-400">{(stats?.total_deposits || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
        <div className="bg-[#161B22] rounded-lg p-4 border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">User Balances</div>
          <div className="text-xl font-bold text-white">{(stats?.total_user_balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#161B22] rounded-lg p-3 border border-gray-700/50 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-[#0D1117] rounded-lg px-3 py-1.5 border border-gray-700/50 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username or holder..." className="bg-transparent text-white text-sm w-full outline-none" />
        </div>
        {["all", "pending", "approved", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "bg-[#0D1117] text-gray-400 border border-gray-700/50 hover:text-white"}`}>{f.charAt(0).toUpperCase() + f.slice(1)} {f === "pending" && stats?.pending_withdrawals ? `(${stats.pending_withdrawals})` : ""}</button>
        ))}
      </div>

      {/* Withdrawals Table */}
      <div className="bg-[#161B22] rounded-lg border border-gray-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-sm font-bold text-white flex items-center gap-2"><ArrowUpCircle className="w-4 h-4 text-red-400" /> Withdrawal Requests ({filtered.length})</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No withdrawals found</div>
        ) : (
          <div className="divide-y divide-gray-700/30">
            {filtered.map((w, i) => (
              <div key={i} className="px-4 py-3 hover:bg-[#1E2736]/50 transition-colors" data-testid={`withdrawal-row-${i}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-sm text-white font-medium">{w.username}</span>
                      <span className="text-lg font-bold text-red-400 ml-3">{w.amount?.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusColors[w.status]}`}>{w.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">{fmtDate(w.created_at)}</div>
                </div>
                {/* Bank Details */}
                <div className="bg-[#0D1117] rounded-lg p-2.5 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                  <div className="flex items-center gap-1 text-gray-400"><Building2 className="w-3 h-3" /> <span className="text-gray-500">Bank:</span> <span className="text-white">{w.bank_name || "-"}</span></div>
                  <div className="flex items-center gap-1 text-gray-400"><CreditCard className="w-3 h-3" /> <span className="text-gray-500">A/C:</span> <span className="text-white">{w.account_number || "-"}</span></div>
                  <div className="text-gray-400"><span className="text-gray-500">IFSC:</span> <span className="text-white">{w.ifsc_code || "-"}</span></div>
                  <div className="text-gray-400"><span className="text-gray-500">Holder:</span> <span className="text-white">{w.account_holder || "-"}</span></div>
                  {w.upi_id && <div className="text-gray-400"><span className="text-gray-500">UPI:</span> <span className="text-cyan-400">{w.upi_id}</span></div>}
                </div>
                {/* Actions */}
                {w.status === "pending" && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleApprove(w.withdrawal_id)} disabled={processing === w.withdrawal_id} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium" data-testid={`approve-wd-${i}`}>
                      <CheckCircle className="w-3.5 h-3.5" /> Approve & Pay
                    </button>
                    <button onClick={() => handleReject(w.withdrawal_id)} disabled={processing === w.withdrawal_id} className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-medium" data-testid={`reject-wd-${i}`}>
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                )}
                {w.admin_note && <div className="text-[10px] text-cyan-400 mt-1">Admin: {w.admin_note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
