import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, ArrowUpCircle, ArrowDownCircle, Trophy, MessageCircle } from "lucide-react";
import DashboardHeader from "@/components/DashboardHeader";

const ADMIN_WHATSAPP = "918778156678";
const RECHARGE_AMOUNTS = [100, 500, 1000, 2000, 5000];

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [bets, setBets] = useState([]);
  const [username, setUsername] = useState("");
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  useEffect(() => {
    fetchWallet();
    fetchTransactions();
    fetchBets();
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await api.get("/auth/me");
      setUsername(response.data.username);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setWallet(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await api.get("/transactions/my");
      setTransactions(response.data.slice(0, 5));
    } catch (error) {
      console.error(error);
    }
  };

  const fetchBets = async () => {
    try {
      const response = await api.get("/bets/history");
      setBets(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleRechargeRequest = (amount) => {
    const message = `Hello, I am ${username}. Recharge ₹${amount}`;
    const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    setShowRechargeModal(false);
    setCustomAmount("");
  };

  const formatIndianDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const pendingBets = bets.filter(b => b.status === "pending").length;
  const wonBets = bets.filter(b => b.status === "won").length;
  const lostBets = bets.filter(b => b.status === "lost").length;

  return (
    <div>
      <DashboardHeader title="Dashboard" />
      
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Wallet Card */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 text-white">
            <div className="flex items-center justify-between mb-4">
              <Wallet className="w-8 h-8" />
              <span className="text-sm opacity-90 font-medium">Current Balance</span>
            </div>
            <p className="text-4xl font-bold mb-6">₹{wallet?.balance?.toFixed(2) || "0.00"}</p>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="secondary" 
                className="bg-white/20 hover:bg-white/30 text-white border-0 font-semibold"
                onClick={() => setShowRechargeModal(true)}
                data-testid="deposit-btn"
              >
                <ArrowDownCircle className="w-4 h-4 mr-2" />
                Deposit
              </Button>
              <Button 
                variant="secondary"
                className="bg-white/20 hover:bg-white/30 text-white border-0 font-semibold"
                onClick={() => window.location.href = '/user/withdrawals'}
              >
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Withdraw
              </Button>
            </div>
          </div>

          {/* Pending Bets */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Pending Bets</p>
                <p className="text-3xl font-bold text-orange-600">{pendingBets}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>

          {/* Won Bets */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700 font-semibold mb-1">Won Bets</p>
                <p className="text-3xl font-bold text-green-600">{wonBets}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Bet Now Section */}
        <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-lg p-8 text-white mb-6 text-center">
          <Trophy className="w-16 h-16 mx-auto mb-4 opacity-90" />
          <h2 className="text-3xl font-bold mb-2">Ready to Win Big?</h2>
          <p className="text-lg mb-6 opacity-90">Place your bets on live Cricket & Football matches</p>
          <Button
            onClick={() => window.location.href = '/'}
            className="bg-white text-green-700 hover:bg-gray-100 font-bold text-lg px-8 py-6"
          >
            🎯 BET NOW
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bet Chart Placeholder */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Bet Statistics</h2>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
              <div className="text-center">
                <div className="grid grid-cols-3 gap-8">
                  <div>
                    <p className="text-3xl font-bold text-green-600">{wonBets}</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">Won</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-orange-600">{pendingBets}</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">Pending</p>
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-red-600">{lostBets}</p>
                    <p className="text-sm text-gray-700 font-medium mt-1">Lost</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Latest Transactions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Latest Transactions</h2>
            <div className="space-y-3">
              {transactions.length > 0 ? (
                transactions.map((txn) => (
                  <div key={txn.transaction_id} className="flex items-center justify-between py-3 border-b">
                    <div>
                      <p className="font-medium text-gray-900 text-sm capitalize">{txn.type}</p>
                      <p className="text-xs text-gray-600 font-medium">{formatIndianDateTime(txn.created_at)}</p>
                    </div>
                    <p className={`font-bold ${
                      txn.type === 'deposit' || txn.type === 'winning' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {txn.type === 'deposit' || txn.type === 'winning' ? '+' : '-'}₹{txn.amount.toFixed(2)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-center text-gray-600 font-medium py-8">No transactions yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recharge Modal */}
      {showRechargeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-green-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageCircle className="w-6 h-6" />
                  <h2 className="text-lg font-bold">Recharge via WhatsApp</h2>
                </div>
                <button 
                  onClick={() => setShowRechargeModal(false)}
                  className="text-white/80 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-white/80 mt-1">Select amount to request recharge</p>
            </div>
            
            {/* Body */}
            <div className="p-6">
              {/* Preset Amounts */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {RECHARGE_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handleRechargeRequest(amount)}
                    className="bg-gray-100 hover:bg-green-100 hover:border-green-500 border-2 border-transparent rounded-lg py-3 px-4 font-bold text-gray-800 transition-all"
                    data-testid={`recharge-amount-${amount}`}
                  >
                    ₹{amount.toLocaleString()}
                  </button>
                ))}
              </div>
              
              {/* Custom Amount */}
              <div className="border-t pt-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Or enter custom amount:</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">₹</span>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                      min="100"
                      data-testid="custom-recharge-input"
                    />
                  </div>
                  <button
                    onClick={() => customAmount && handleRechargeRequest(customAmount)}
                    disabled={!customAmount || parseInt(customAmount) < 100}
                    className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                    data-testid="custom-recharge-btn"
                  >
                    <MessageCircle className="w-5 h-5" />
                    Request
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Minimum recharge amount: ₹100</p>
              </div>
              
              {/* Info */}
              <div className="mt-4 bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Your recharge request will be sent to admin via WhatsApp. 
                  The admin will process your request and credit your account.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
