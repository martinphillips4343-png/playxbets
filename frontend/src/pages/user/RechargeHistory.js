import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle, MessageCircle, Upload, IndianRupee, Wallet, History } from "lucide-react";

const WHATSAPP_NUMBER = "919876543210";

export default function RechargeHistory() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("deposit");
  const [wallet, setWallet] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  // Deposit form
  const [depAmount, setDepAmount] = useState("");
  const [depMethod, setDepMethod] = useState("upi");
  const [depRef, setDepRef] = useState("");
  const [depNote, setDepNote] = useState("");
  const [depScreenshot, setDepScreenshot] = useState(null);

  // Withdrawal form
  const [wdAmount, setWdAmount] = useState("");
  const [wdHolder, setWdHolder] = useState("");
  const [wdBank, setWdBank] = useState("");
  const [wdAccount, setWdAccount] = useState("");
  const [wdIfsc, setWdIfsc] = useState("");
  const [wdUpi, setWdUpi] = useState("");
  const [wdNote, setWdNote] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [wRes, dRes, wrRes, tRes] = await Promise.all([
        api.get("/wallet"),
        api.get("/deposits/my"),
        api.get("/withdrawals/my"),
        api.get("/transactions/my"),
      ]);
      setWallet(wRes.data);
      setDeposits(dRes.data);
      setWithdrawals(wrRes.data);
      setTransactions(tRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg({ type: "error", text: "File too large. Max 5MB." }); return; }
    const reader = new FileReader();
    reader.onload = () => setDepScreenshot(reader.result);
    reader.readAsDataURL(file);
  };

  const submitDeposit = async (e) => {
    e.preventDefault();
    if (!depAmount || parseFloat(depAmount) <= 0) { setMsg({ type: "error", text: "Enter a valid amount" }); return; }
    setSubmitting(true);
    try {
      await api.post("/deposits", {
        amount: parseFloat(depAmount),
        payment_method: depMethod,
        transaction_ref: depRef || undefined,
        proof_screenshot: depScreenshot || undefined,
        note: depNote || undefined,
      });
      setMsg({ type: "success", text: "Deposit request submitted! Awaiting admin approval." });
      setShowDepositForm(false);
      setDepAmount(""); setDepRef(""); setDepNote(""); setDepScreenshot(null);
      fetchData();
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.detail || "Failed to submit" });
    }
    setSubmitting(false);
  };

  const submitWithdrawal = async (e) => {
    e.preventDefault();
    if (!wdAmount || parseFloat(wdAmount) <= 0) { setMsg({ type: "error", text: "Enter a valid amount" }); return; }
    if (!wdHolder || !wdBank || !wdAccount || !wdIfsc) { setMsg({ type: "error", text: "All bank details are required" }); return; }
    setSubmitting(true);
    try {
      await api.post("/withdrawals", {
        amount: parseFloat(wdAmount),
        account_holder: wdHolder,
        bank_name: wdBank,
        account_number: wdAccount,
        ifsc_code: wdIfsc,
        upi_id: wdUpi || undefined,
        note: wdNote || undefined,
      });
      setMsg({ type: "success", text: "Withdrawal request submitted! Amount frozen until approval." });
      setShowWithdrawForm(false);
      setWdAmount(""); setWdHolder(""); setWdBank(""); setWdAccount(""); setWdIfsc(""); setWdUpi(""); setWdNote("");
      fetchData();
    } catch (err) {
      setMsg({ type: "error", text: err.response?.data?.detail || "Failed to submit" });
    }
    setSubmitting(false);
  };

  const openWhatsApp = () => {
    const username = wallet?.user_id || "user";
    const text = encodeURIComponent(`I want to deposit. Username: ${username}`);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, "_blank");
  };

  const statusBadge = (status) => {
    const colors = { pending: "bg-yellow-500/20 text-yellow-400", approved: "bg-green-500/20 text-green-400", rejected: "bg-red-500/20 text-red-400", paid: "bg-green-500/20 text-green-400" };
    return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors[status] || "bg-gray-500/20 text-gray-400"}`}>{status}</span>;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4 p-4" data-testid="wallet-page">
      {msg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${msg.type === "success" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="float-right text-xs opacity-60 hover:opacity-100">dismiss</button>
        </div>
      )}

      {/* Wallet Balance Card */}
      <div className="bg-[#161B22] rounded-xl p-5 border border-gray-700/50" data-testid="wallet-balance-card">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">My Wallet</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#0D1117] rounded-lg p-3 border border-gray-700/30">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Available Balance</div>
            <div className="text-xl font-bold text-green-400" data-testid="available-balance">{(wallet?.available_balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
          </div>
          <div className="bg-[#0D1117] rounded-lg p-3 border border-gray-700/30">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Total Balance</div>
            <div className="text-xl font-bold text-white">{(wallet?.balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
          </div>
          <div className="bg-[#0D1117] rounded-lg p-3 border border-gray-700/30">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Frozen (Withdrawal)</div>
            <div className="text-xl font-bold text-yellow-400">{(wallet?.frozen_balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
          </div>
          <div className="bg-[#0D1117] rounded-lg p-3 border border-gray-700/30">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Exposure (Bets)</div>
            <div className="text-xl font-bold text-orange-400">{(wallet?.exposure || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</div>
          </div>
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={() => { setShowDepositForm(true); setShowWithdrawForm(false); }} className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors" data-testid="deposit-btn">
            <ArrowDownCircle className="w-4 h-4" /> Deposit
          </button>
          <button onClick={() => { setShowWithdrawForm(true); setShowDepositForm(false); }} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium text-sm transition-colors" data-testid="withdraw-btn">
            <ArrowUpCircle className="w-4 h-4" /> Withdraw
          </button>
          <button onClick={openWhatsApp} className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BD5A] text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors" data-testid="whatsapp-btn">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </button>
        </div>
      </div>

      {/* Deposit Form */}
      {showDepositForm && (
        <div className="bg-[#161B22] rounded-xl p-5 border border-green-500/30" data-testid="deposit-form">
          <h3 className="text-base font-bold text-green-400 mb-3 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4" /> Deposit Request</h3>
          <form onSubmit={submitDeposit} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Amount *</label>
              <input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)} placeholder="Enter amount" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="dep-amount-input" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Payment Method *</label>
              <select value={depMethod} onChange={e => setDepMethod(e.target.value)} className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" data-testid="dep-method-select">
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Transaction Reference ID (optional)</label>
              <input type="text" value={depRef} onChange={e => setDepRef(e.target.value)} placeholder="e.g. UTR number" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" data-testid="dep-ref-input" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Upload Screenshot (optional)</label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-gray-400 text-sm cursor-pointer hover:border-cyan-500 transition-colors">
                  <Upload className="w-4 h-4" /> {depScreenshot ? "Uploaded" : "Choose file"}
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" data-testid="dep-screenshot-input" />
                </label>
                {depScreenshot && <span className="text-green-400 text-xs">File attached</span>}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Note (optional)</label>
              <input type="text" value={depNote} onChange={e => setDepNote(e.target.value)} placeholder="Any note for admin" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium" data-testid="dep-submit-btn">
                {submitting ? "Submitting..." : "Submit Deposit Request"}
              </button>
              <button type="button" onClick={() => setShowDepositForm(false)} className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Withdrawal Form */}
      {showWithdrawForm && (
        <div className="bg-[#161B22] rounded-xl p-5 border border-red-500/30" data-testid="withdrawal-form">
          <h3 className="text-base font-bold text-red-400 mb-3 flex items-center gap-2"><ArrowUpCircle className="w-4 h-4" /> Withdrawal Request</h3>
          <form onSubmit={submitWithdrawal} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Amount *</label>
              <input type="number" value={wdAmount} onChange={e => setWdAmount(e.target.value)} placeholder="Enter amount" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="wd-amount-input" />
              <span className="text-[10px] text-gray-500 mt-0.5 block">Available: {(wallet?.available_balance || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Account Holder *</label>
                <input type="text" value={wdHolder} onChange={e => setWdHolder(e.target.value)} placeholder="Full name" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="wd-holder-input" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Bank Name *</label>
                <input type="text" value={wdBank} onChange={e => setWdBank(e.target.value)} placeholder="e.g. HDFC Bank" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="wd-bank-input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Account Number *</label>
                <input type="text" value={wdAccount} onChange={e => setWdAccount(e.target.value)} placeholder="Account number" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="wd-account-input" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">IFSC Code *</label>
                <input type="text" value={wdIfsc} onChange={e => setWdIfsc(e.target.value)} placeholder="e.g. HDFC0001234" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" required data-testid="wd-ifsc-input" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">UPI ID (optional)</label>
              <input type="text" value={wdUpi} onChange={e => setWdUpi(e.target.value)} placeholder="e.g. name@upi" className="w-full bg-[#0D1117] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" data-testid="wd-upi-input" />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium" data-testid="wd-submit-btn">
                {submitting ? "Submitting..." : "Submit Withdrawal Request"}
              </button>
              <button type="button" onClick={() => setShowWithdrawForm(false)} className="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#161B22] rounded-lg p-1 border border-gray-700/50">
        {[
          { id: "deposit", label: "Deposits", icon: ArrowDownCircle },
          { id: "withdrawal", label: "Withdrawals", icon: ArrowUpCircle },
          { id: "transactions", label: "All Transactions", icon: History },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${tab === t.id ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" : "text-gray-400 hover:text-white"}`} data-testid={`tab-${t.id}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-[#161B22] rounded-xl border border-gray-700/50 overflow-hidden">
        {tab === "deposit" && (
          <>
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Deposit History</h3>
              <span className="text-[10px] text-gray-500">{deposits.length} records</span>
            </div>
            {deposits.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No deposit requests yet</div>
            ) : (
              <div className="divide-y divide-gray-700/30">
                {deposits.map((d, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-[#1E2736]/50 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <IndianRupee className="w-3.5 h-3.5 text-green-400" />
                        {d.amount?.toLocaleString("en-IN")}
                        {statusBadge(d.status)}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{d.payment_method?.toUpperCase()} {d.transaction_ref ? `| Ref: ${d.transaction_ref}` : ""} | {fmtDate(d.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "withdrawal" && (
          <>
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Withdrawal History</h3>
              <span className="text-[10px] text-gray-500">{withdrawals.length} records</span>
            </div>
            {withdrawals.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No withdrawal requests yet</div>
            ) : (
              <div className="divide-y divide-gray-700/30">
                {withdrawals.map((w, i) => (
                  <div key={i} className="px-4 py-3 hover:bg-[#1E2736]/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        <IndianRupee className="w-3.5 h-3.5 text-red-400" />
                        {w.amount?.toLocaleString("en-IN")}
                        {statusBadge(w.status)}
                      </div>
                      <div className="text-[10px] text-gray-500">{fmtDate(w.created_at)}</div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {w.bank_name} | A/C: {w.account_number?.slice(-4)?.padStart(w.account_number?.length || 4, "*")} | IFSC: {w.ifsc_code}
                      {w.upi_id ? ` | UPI: ${w.upi_id}` : ""}
                    </div>
                    {w.admin_note && <div className="text-[10px] text-cyan-400 mt-0.5">Admin: {w.admin_note}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "transactions" && (
          <>
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Transaction History</h3>
              <span className="text-[10px] text-gray-500">{transactions.length} records</span>
            </div>
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No transactions yet</div>
            ) : (
              <div className="divide-y divide-gray-700/30">
                {transactions.map((t, i) => (
                  <div key={i} className="px-4 py-3 flex items-center justify-between hover:bg-[#1E2736]/50 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-white flex items-center gap-2">
                        {t.type === "deposit" ? <ArrowDownCircle className="w-3.5 h-3.5 text-green-400" /> : t.type === "withdrawal" ? <ArrowUpCircle className="w-3.5 h-3.5 text-red-400" /> : <IndianRupee className="w-3.5 h-3.5 text-yellow-400" />}
                        <span className={t.type === "deposit" || t.type === "win" ? "text-green-400" : "text-red-400"}>
                          {t.type === "deposit" || t.type === "win" ? "+" : "-"}{t.amount?.toLocaleString("en-IN")}
                        </span>
                        <span className="text-[10px] text-gray-500 uppercase">{t.type}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{t.description || t.note || ""} | {fmtDate(t.created_at)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Bal: {t.balance_after?.toLocaleString("en-IN")}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
