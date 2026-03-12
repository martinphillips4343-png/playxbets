import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Wallet, TrendingUp, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

export default function UserDashboard() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [bets, setBets] = useState([]);

  useEffect(() => {
    fetchWallet();
    fetchTransactions();
    fetchBets();
  }, []);

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

  const formatIndianDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
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
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Wallet Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg shadow-lg p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <Wallet className="w-8 h-8" />
            <span className="text-sm opacity-90">Current Balance</span>
          </div>
          <p className="text-4xl font-bold mb-6">₹{wallet?.balance?.toFixed(2) || "0.00"}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="secondary" 
              className="bg-white/20 hover:bg-white/30 text-white border-0"
              onClick={() => window.open('https://wa.me/?text=Hello%20Recharge%20300', '_blank')}
            >
              <ArrowDownCircle className="w-4 h-4 mr-2" />
              Deposit
            </Button>
            <Button 
              variant="secondary"
              className="bg-white/20 hover:bg-white/30 text-white border-0"
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
              <p className="text-sm text-gray-600 mb-1">Pending Bets</p>
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
              <p className="text-sm text-gray-600 mb-1">Won Bets</p>
              <p className="text-3xl font-bold text-green-600">{wonBets}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bet Chart Placeholder */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Bet Statistics</h2>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
            <div className="text-center">
              <div className="grid grid-cols-3 gap-8">
                <div>
                  <p className="text-3xl font-bold text-green-600">{wonBets}</p>
                  <p className="text-sm text-gray-600 mt-1">Won</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-orange-600">{pendingBets}</p>
                  <p className="text-sm text-gray-600 mt-1">Pending</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-red-600">{lostBets}</p>
                  <p className="text-sm text-gray-600 mt-1">Lost</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Latest Transactions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Latest Transactions</h2>
          <div className="space-y-3">
            {transactions.length > 0 ? (
              transactions.map((txn) => (
                <div key={txn.transaction_id} className="flex items-center justify-between py-3 border-b">
                  <div>
                    <p className="font-medium text-gray-800 text-sm capitalize">{txn.type}</p>
                    <p className="text-xs text-gray-500">{formatIndianDateTime(txn.created_at)}</p>
                  </div>
                  <p className={`font-bold ${
                    txn.type === 'deposit' || txn.type === 'winning' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {txn.type === 'deposit' || txn.type === 'winning' ? '+' : '-'}₹{txn.amount.toFixed(2)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No transactions yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
