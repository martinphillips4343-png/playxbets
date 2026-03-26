import { useState, useEffect } from "react";
import { api } from "@/App";
import { Button } from "@/components/ui/button";
import { Users, Activity, Trophy, DollarSign, ArrowUp, Play } from "lucide-react";
import { toast } from "sonner";
import DashboardHeader from "@/components/DashboardHeader";

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
        <div className="text-gray-900 font-medium">Loading...</div>
      </div>
    );
  };

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
    <div data-testid="admin-dashboard">
      <DashboardHeader title="Dashboard" />
      
      <div className="p-4 md:p-6 lg:p-8">
        {/* Cron Button */}
        <div className="flex justify-end mb-4 md:mb-6">
          <Button
            onClick={handleRunCron}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold text-sm md:text-base"
            data-testid="run-cron-button"
          >
            <Play className="w-4 h-4 mr-2" />
            Cron Jobs
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-6 md:mb-8">
          {statCards.map((card, index) => (
            <div
              key={index}
              className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6 border border-gray-200 hover:shadow-lg transition-shadow"
              data-testid={`stat-card-${card.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-600 font-semibold uppercase mb-1 md:mb-2 truncate">{card.label}</p>
                  <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`p-2 md:p-3 rounded-lg ${card.color} flex-shrink-0 ml-2`}>
                  <card.icon className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Deposits Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6">Deposits</h2>
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="bg-green-50 p-3 md:p-4 rounded">
                <div className="flex items-center gap-1 md:gap-2 text-green-600 mb-1 md:mb-2">
                  <DollarSign className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="text-xs md:text-sm font-semibold truncate">Total Deposited</span>
                </div>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">
                  ₹{stats?.total_deposited?.toFixed(2) || "0.00"}
                </p>
              </div>
              <div className="bg-orange-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-orange-600 font-semibold mb-1 md:mb-2 truncate">Pending Deposits</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{stats?.pending_deposits || 0}</p>
              </div>
              <div className="bg-red-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-red-600 font-semibold mb-1 md:mb-2 truncate">Rejected Deposits</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{stats?.rejected_deposits || 0}</p>
              </div>
              <div className="bg-purple-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-purple-600 font-semibold mb-1 md:mb-2 truncate">Deposited Charge</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">
                  ₹{stats?.deposited_charge?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 md:p-6">
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-4 md:mb-6">Withdrawals</h2>
            <div className="grid grid-cols-2 gap-2 md:gap-4">
              <div className="bg-green-50 p-3 md:p-4 rounded">
                <div className="flex items-center gap-1 md:gap-2 text-green-600 mb-1 md:mb-2">
                  <ArrowUp className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="text-xs md:text-sm font-semibold truncate">Total Withdrawn</span>
                </div>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">
                  ₹{stats?.total_withdrawn?.toFixed(2) || "0.00"}
                </p>
              </div>
              <div className="bg-orange-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-orange-600 font-semibold mb-1 md:mb-2 truncate">Pending Withdrawals</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{stats?.pending_withdrawals || 0}</p>
              </div>
              <div className="bg-red-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-red-600 font-semibold mb-1 md:mb-2 truncate">Rejected Withdrawals</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">{stats?.rejected_withdrawals || 0}</p>
              </div>
              <div className="bg-purple-50 p-3 md:p-4 rounded">
                <p className="text-xs md:text-sm text-purple-600 font-semibold mb-1 md:mb-2 truncate">Withdrawal Charge</p>
                <p className="text-lg md:text-xl lg:text-2xl font-bold text-gray-900">
                  ₹{stats?.withdrawal_charge?.toFixed(2) || "0.00"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Other Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
          <div className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6">
            <p className="text-xs md:text-sm text-gray-600 font-semibold mb-1 md:mb-2">Pending Bet</p>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{stats?.pending_bets || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6">
            <p className="text-xs md:text-sm text-gray-600 font-semibold mb-1 md:mb-2 truncate">Pending Support</p>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{stats?.pending_tickets || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6">
            <p className="text-xs md:text-sm text-gray-600 font-semibold mb-1 md:mb-2 truncate">Pending KYC</p>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{stats?.pending_kyc || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-3 md:p-4 lg:p-6">
            <p className="text-xs md:text-sm text-gray-600 font-semibold mb-1 md:mb-2 truncate">Pending Outcomes</p>
            <p className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{stats?.pending_outcomes || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
