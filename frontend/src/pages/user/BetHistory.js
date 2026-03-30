import { useState, useEffect, useCallback } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";
import { Download, Filter, DollarSign, TrendingUp, TrendingDown } from "lucide-react";

const PERIODS = [
  { value: "", label: "All Time" },
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];
const STATUSES = [
  { value: "", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function BetHistory() {
  const [bets, setBets] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [downloading, setDownloading] = useState(false);

  const fetchBets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period) params.append("period", period);
      if (statusFilter) params.append("status", statusFilter);
      const res = await api.get(`/bets/history?${params.toString()}`);
      setBets(res.data.bets || []);
      setSummary(res.data.summary || {});
    } catch {
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter]);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  const handleDownload = async (dlPeriod) => {
    setDownloading(true);
    try {
      const res = await api.get(`/statements/download?period=${dlPeriod}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `my_statement_${dlPeriod}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`Statement downloaded`);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const pnlColor = (summary.net_pnl || 0) >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div>
      <DashboardHeader title="My Betting History" />
      <div className="p-4 md:p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="user-bet-summary">
          <div className="bg-white rounded-lg p-3 shadow-sm border">
            <div className="text-xs text-gray-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Total Stake</div>
            <div className="text-xl font-bold mt-1">{(summary.total_stake || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border">
            <div className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-green-600" /> Total Won</div>
            <div className="text-xl font-bold text-green-600 mt-1">{(summary.total_won || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border">
            <div className="text-xs text-gray-500 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-red-600" /> Total Lost</div>
            <div className="text-xl font-bold text-red-600 mt-1">{(summary.total_lost || 0).toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border">
            <div className="text-xs text-gray-500">Net P&L</div>
            <div className={`text-xl font-bold mt-1 ${pnlColor}`} data-testid="net-pnl">
              {(summary.net_pnl || 0) >= 0 ? "+" : ""}{(summary.net_pnl || 0).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Filters + Download */}
        <div className="flex flex-wrap gap-2 items-center" data-testid="user-bet-filters">
          <Filter className="w-4 h-4 text-gray-500" />
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-white" data-testid="user-period-filter">
            {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm bg-white" data-testid="user-status-filter">
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            {["day", "week", "month"].map(p => (
              <Button key={p} size="sm" variant="outline" disabled={downloading}
                onClick={() => handleDownload(p)} data-testid={`user-download-${p}`}
                className="text-xs gap-1">
                <Download className="w-3 h-3" /> {p.charAt(0).toUpperCase() + p.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm" data-testid="user-bets-table">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 uppercase">Date</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 uppercase">Match</th>
                <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-600 uppercase">Type</th>
                <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 uppercase">Team</th>
                <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-600 uppercase">Odds</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-600 uppercase">Stake</th>
                <th className="px-3 py-2.5 text-right text-xs font-bold text-gray-600 uppercase">Potential Win</th>
                <th className="px-3 py-2.5 text-center text-xs font-bold text-gray-600 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : bets.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No bets yet</td></tr>
              ) : bets.map((bet, i) => (
                <tr key={bet.bet_id || i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{(bet.placed_at || "").slice(0, 16).replace("T", " ")}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{bet.match_name || bet.match_id?.slice(0, 12)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                      bet.bet_type === "lay" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                    }`}>{(bet.bet_type || "back").toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 truncate max-w-[150px]">{bet.selected_team}</td>
                  <td className="px-3 py-2 text-center font-mono">{bet.odds}</td>
                  <td className="px-3 py-2 text-right font-bold">{bet.stake?.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{bet.potential_win?.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      bet.status === "won" ? "bg-green-100 text-green-700" :
                      bet.status === "lost" ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>{bet.status}</span>
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
