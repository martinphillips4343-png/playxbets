import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Users, Activity, Trophy, DollarSign, ArrowUp, Play } from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get("/admin/dashboard");
      setStats(response.data);
    } catch (error) {
      toast.error("Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };

  const handleRunCron = async () => {
    try {
      toast.info("Fetching latest odds...");
      await api.post("/admin/cron/run");
      toast.success("Cron job completed successfully!");
      fetchStats();
    } catch (error) {
      toast.error("Failed to run cron job");
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Bettors",
      value: stats?.total_bettors || 0,
      icon: Users,
      color: "bg-purple-100 text-purple-600",
    },
    {
      label: "Active Bettors",
      value: stats?.active_bettors || 0,
      icon: Activity,
      color: "bg-green-100 text-green-600",
    },
    {
      label: "Email Unverified Bettors",
      value: 0,
      icon: Users,
      color: "bg-red-100 text-red-600",
    },
    {
      label: "Mobile Unverified Bettors",
      value: 0,
      icon: Users,
      color: "bg-orange-100 text-orange-600",
    },
    {
      label: "In Play Games",
      value: stats?.in_play_games || 0,
      icon: Play,
      color: "bg-red-100 text-red-600",
    },
    {
      label: "Upcoming Games",
      value: stats?.upcoming_games || 0,
      icon: Trophy,
      color: "bg-yellow-100 text-yellow-600",
    },
    {
      label: "Open For Betting",
      value: stats?.open_for_betting || 0,
      icon: Trophy,
      color: "bg-green-100 text-green-600",
    },
    {
      label: "Not Open For Betting",
      value: 0,
      icon: Trophy,
      color: "bg-gray-100 text-gray-600",
    },
  ];

  return (
    <div className="p-8" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <Button
          onClick={handleRunCron}
          className="bg-yellow-500 hover:bg-yellow-600 text-white"
          data-testid="run-cron-button"
        >
          <Play className="w-4 h-4 mr-2" />
          Cron Jobs
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div
            key={index}
            className="bg-white rounded-lg shadow p-6 border border-gray-200 hover:shadow-lg transition-shadow"
            data-testid={`stat-card-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-xs text-gray-500 uppercase mb-2">{card.label}</p>
                <p className="text-3xl font-bold text-gray-800">{card.value}</p>
              </div>
              <div className={`p-3 rounded-lg ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Deposits Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Deposits</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <DollarSign className="w-5 h-5" />
                <span className="text-sm font-medium">Total Deposited</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                ${stats?.total_deposited?.toFixed(2) || "0.00"} INR
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded">
              <p className="text-sm text-orange-600 font-medium mb-2">Pending Deposits</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.pending_deposits || 0}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-sm text-red-600 font-medium mb-2">Rejected Deposits</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.rejected_deposits || 0}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-sm text-purple-600 font-medium mb-2">Deposited Charge</p>
              <p className="text-2xl font-bold text-gray-800">
                ${stats?.deposited_charge?.toFixed(2) || "0.00"} INR
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6">Withdrawals</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 p-4 rounded">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <ArrowUp className="w-5 h-5" />
                <span className="text-sm font-medium">Total Withdrawn</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                ${stats?.total_withdrawn?.toFixed(2) || "0.00"} INR
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded">
              <p className="text-sm text-orange-600 font-medium mb-2">Pending Withdrawals</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.pending_withdrawals || 0}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-sm text-red-600 font-medium mb-2">Rejected Withdrawals</p>
              <p className="text-2xl font-bold text-gray-800">{stats?.rejected_withdrawals || 0}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded">
              <p className="text-sm text-purple-600 font-medium mb-2">Withdrawal Charge</p>
              <p className="text-2xl font-bold text-gray-800">
                ${stats?.withdrawal_charge?.toFixed(2) || "0.00"} INR
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Other Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500 mb-2">Pending Bet</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.pending_bets || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500 mb-2">Pending Support Tickets</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.pending_tickets || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500 mb-2">Pending KYC Verifications</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.pending_kyc || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500 mb-2">Pending Outcomes</p>
          <p className="text-3xl font-bold text-gray-800">{stats?.pending_outcomes || 0}</p>
        </div>
      </div>
    </div>
  );
}
