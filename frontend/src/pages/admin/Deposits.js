import { useState, useEffect, useCallback } from "react";
import { api } from "@/App";
import { ArrowDownCircle, CheckCircle, XCircle, Search } from "lucide-react";

export default function Deposits() {
  const [deposits, setDeposits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [dRes, sRes] = await Promise.all([
        api.get("/admin/deposits"),
        api.get("/admin/wallet/stats"),
      ]);
      setDeposits(dRes.data);
      setStats(sRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (depositId) => {
    if (!window.confirm("Approve this deposit? Balance will be added to user wallet.")) return;
    setProcessing(depositId);
    try {
      await api.post(`/admin/deposits/${depositId}/approve`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to approve");
    }
    setProcessing(null);
  };

  const handleReject = async (depositId) => {
    if (!window.confirm("Reject this deposit request?")) return;
    setProcessing(depositId);
    try {
      await api.post(`/admin/deposits/${depositId}/reject`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to reject");
    }
    setProcessing(null);
  };

  const filtered = deposits.filter(d => {
    if (filter !== "all" && d.status !== filter) return false;
    if (search && !d.username?.toLowerCase().includes(search.toLowerCase()) && !d.transaction_ref?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const fmtDate = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
  const statusColors = { pending: "bg-yellow-100 text-yellow-800 border-yellow-200", approved: "bg-green-100 text-green-800 border-green-200", rejected: "bg-red-100 text-red-800 border-red-200" };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4" data-testid="admin-deposits-page">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Total Deposits</div>
          <div className="text-xl font-bold text-green-600">{(stats?.total_deposits || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Pending Deposits</div>
          <div className="text-xl font-bold text-yellow-600">{stats?.pending_deposits || 0}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Total Withdrawals</div>
          <div className="text-xl font-bold text-red-600">{(stats?.total_withdrawals || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">User Balances</div>
          <div className="text-xl font-bold text-gray-900">{(stats?.total_user_balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username or ref..." className="bg-transparent text-gray-900 text-sm w-full outline-none placeholder-gray-400" data-testid="search-input" />
        </div>
        {["all", "pending", "approved", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"}`} data-testid={`filter-${f}`}>{f.charAt(0).toUpperCase() + f.slice(1)} {f === "pending" && stats?.pending_deposits ? `(${stats.pending_deposits})` : ""}</button>
        ))}
      </div>

      {/* Deposits Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-green-500" /> Deposit Requests ({filtered.length})</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No deposits found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 text-[10px] text-gray-500 uppercase border-b border-gray-200">
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Ref</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{d.username}</td>
                    <td className="px-4 py-3 text-sm text-green-600 font-bold">{d.amount?.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 uppercase">{d.payment_method}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{d.transaction_ref || "-"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusColors[d.status]}`}>{d.status}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(d.created_at)}</td>
                    <td className="px-4 py-3">
                      {d.status === "pending" ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleApprove(d.deposit_id)} disabled={processing === d.deposit_id} className="flex items-center gap-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2 py-1 rounded text-[10px] font-medium" data-testid={`approve-dep-${i}`}>
                            <CheckCircle className="w-3 h-3" /> Approve
                          </button>
                          <button onClick={() => handleReject(d.deposit_id)} disabled={processing === d.deposit_id} className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded text-[10px] font-medium" data-testid={`reject-dep-${i}`}>
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400">{d.admin_note || "-"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
