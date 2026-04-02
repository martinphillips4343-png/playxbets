import { useState, useEffect, useCallback } from "react";
import { api } from "@/App";
import { ArrowUpCircle, CheckCircle, XCircle, Search, Building2, CreditCard, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

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

  const copyToClipboard = async (text, fieldId) => {
    if (!text || text === "-") return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const CopyButton = ({ value, fieldId }) => (
    <button
      onClick={(e) => { e.stopPropagation(); copyToClipboard(value, fieldId); }}
      className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-gray-200 transition-colors ml-1 flex-shrink-0"
      title="Copy"
      data-testid={`copy-${fieldId}`}
    >
      {copiedField === fieldId ? (
        <Check className="w-3 h-3 text-green-600" />
      ) : (
        <Copy className="w-3 h-3 text-gray-400 hover:text-gray-600" />
      )}
    </button>
  );

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
  const statusColors = { pending: "bg-yellow-100 text-yellow-800 border-yellow-200", approved: "bg-green-100 text-green-800 border-green-200", rejected: "bg-red-100 text-red-800 border-red-200" };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-4 p-4" data-testid="admin-withdrawals-page">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Total Withdrawals</div>
          <div className="text-xl font-bold text-red-600">{(stats?.total_withdrawals || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Pending Withdrawals</div>
          <div className="text-xl font-bold text-yellow-600">{stats?.pending_withdrawals || 0}</div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="text-[10px] text-gray-500 uppercase font-medium">Total Deposits</div>
          <div className="text-xl font-bold text-green-600">{(stats?.total_deposits || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
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
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username or holder..." className="bg-transparent text-gray-900 text-sm w-full outline-none placeholder-gray-400" data-testid="search-input" />
        </div>
        {["all", "pending", "approved", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"}`} data-testid={`filter-${f}`}>{f.charAt(0).toUpperCase() + f.slice(1)} {f === "pending" && stats?.pending_withdrawals ? `(${stats.pending_withdrawals})` : ""}</button>
        ))}
      </div>

      {/* Withdrawals Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2"><ArrowUpCircle className="w-4 h-4 text-red-500" /> Withdrawal Requests ({filtered.length})</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No withdrawals found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((w, i) => (
              <div key={i} className="px-4 py-3 hover:bg-gray-50 transition-colors" data-testid={`withdrawal-row-${i}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-sm text-gray-900 font-medium">{w.username}</span>
                      <span className="text-lg font-bold text-red-600 ml-3">{w.amount?.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${statusColors[w.status]}`}>{w.status}</span>
                  </div>
                  <div className="text-xs text-gray-500">{fmtDate(w.created_at)}</div>
                </div>
                {/* Bank Details with Copy */}
                <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-x-5 gap-y-2 text-xs" data-testid={`bank-details-${i}`}>
                  <div className="flex items-center gap-1 text-gray-600">
                    <Building2 className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400">Name:</span>
                    <span className="text-gray-900 font-medium">{w.account_holder || "-"}</span>
                    <CopyButton value={w.account_holder} fieldId={`holder-${i}`} />
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <CreditCard className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400">A/C:</span>
                    <span className="text-gray-900 font-medium">{w.account_number || "-"}</span>
                    <CopyButton value={w.account_number} fieldId={`account-${i}`} />
                  </div>
                  <div className="flex items-center gap-1 text-gray-600">
                    <span className="text-gray-400">IFSC:</span>
                    <span className="text-gray-900 font-medium">{w.ifsc_code || "-"}</span>
                    <CopyButton value={w.ifsc_code} fieldId={`ifsc-${i}`} />
                  </div>
                  {w.upi_id && (
                    <div className="flex items-center gap-1 text-gray-600">
                      <span className="text-gray-400">UPI:</span>
                      <span className="text-blue-600 font-medium">{w.upi_id}</span>
                      <CopyButton value={w.upi_id} fieldId={`upi-${i}`} />
                    </div>
                  )}
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
                {w.admin_note && <div className="text-[10px] text-blue-600 mt-1">Admin: {w.admin_note}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
