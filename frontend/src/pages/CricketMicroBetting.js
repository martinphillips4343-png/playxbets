import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PublicHeader from "@/components/PublicHeader";

// Ball outcome display names and colors
const OUTCOME_CONFIG = {
  dot: { name: "Dot Ball", short: "0", color: "bg-gray-500", textColor: "text-white" },
  "1": { name: "1 Run", short: "1", color: "bg-blue-500", textColor: "text-white" },
  "2": { name: "2 Runs", short: "2", color: "bg-blue-600", textColor: "text-white" },
  "3": { name: "3 Runs", short: "3", color: "bg-purple-500", textColor: "text-white" },
  "4": { name: "FOUR", short: "4", color: "bg-green-500", textColor: "text-white" },
  "6": { name: "SIX", short: "6", color: "bg-green-600", textColor: "text-white" },
  wicket: { name: "Wicket", short: "W", color: "bg-red-600", textColor: "text-white" },
  wide_noball: { name: "Wide/NB", short: "WD", color: "bg-yellow-500", textColor: "text-black" },
};

export default function CricketMicroBetting({ onShowAuth, user, onLogout }) {
  const [demoStatus, setDemoStatus] = useState(null);
  const [activeMarket, setActiveMarket] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState(null);
  const [stake, setStake] = useState("");
  const [wallet, setWallet] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [placing, setPlacing] = useState(false);
  const wsRef = useRef(null);
  const countdownRef = useRef(null);

  // Fetch wallet balance
  const fetchWallet = useCallback(async () => {
    if (!user) return;
    try {
      const response = await api.get("/wallet");
      setWallet(response.data);
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
    }
  }, [user]);

  // Fetch my micro bets
  const fetchMyBets = useCallback(async () => {
    if (!user) return;
    try {
      const response = await api.get(`/cricket-micro/bets/history/${user.user_id || user.username}`);
      setMyBets(response.data.slice(0, 10));
    } catch (error) {
      console.error("Failed to fetch bets:", error);
    }
  }, [user]);

  // Fetch demo status
  const fetchDemoStatus = async () => {
    try {
      const response = await api.get("/cricket-micro/demo/status");
      setDemoStatus(response.data);
      if (response.data.active_market) {
        setActiveMarket(response.data.active_market);
        updateCountdown(response.data.active_market);
      }
    } catch (error) {
      console.error("Failed to fetch demo status:", error);
    }
  };

  // Update countdown timer
  const updateCountdown = (market) => {
    if (!market || !market.closes_at) return;
    
    const closeTime = new Date(market.closes_at).getTime();
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((closeTime - now) / 1000));
    setCountdown(remaining);
  };

  // Start demo mode
  const startDemo = async () => {
    try {
      await api.post("/cricket-micro/demo/start");
      toast.success("Demo match started!");
      fetchDemoStatus();
    } catch (error) {
      toast.error("Failed to start demo");
    }
  };

  // Stop demo mode
  const stopDemo = async () => {
    try {
      await api.post("/cricket-micro/demo/stop");
      toast.info("Demo match stopped");
      setDemoStatus(null);
      setActiveMarket(null);
    } catch (error) {
      toast.error("Failed to stop demo");
    }
  };

  // Place a bet
  const placeBet = async () => {
    if (!user) {
      onShowAuth("login");
      return;
    }

    if (!selectedOutcome || !stake || parseFloat(stake) <= 0) {
      toast.error("Please select an outcome and enter a valid stake");
      return;
    }

    if (!activeMarket || activeMarket.status !== "open") {
      toast.error("Market is not open for betting");
      return;
    }

    setPlacing(true);
    try {
      await api.post("/cricket-micro/bets", {
        market_id: activeMarket.market_id,
        selected_outcome: selectedOutcome,
        stake: parseFloat(stake),
      }, {
        params: { user_id: user.user_id || user.username }
      });
      
      toast.success(`Bet placed on ${OUTCOME_CONFIG[selectedOutcome].name}!`);
      setSelectedOutcome(null);
      setStake("");
      fetchWallet();
      fetchMyBets();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to place bet");
    } finally {
      setPlacing(false);
    }
  };

  // WebSocket connection
  useEffect(() => {
    const wsUrl = process.env.REACT_APP_BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://");
    const ws = new WebSocket(`${wsUrl}/ws/cricket-micro`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WS event:", data);

        switch (data.event) {
          case "market_created":
            setActiveMarket(data.market);
            updateCountdown(data.market);
            setSelectedOutcome(null);
            break;

          case "market_suspended":
            setActiveMarket((prev) => prev ? { ...prev, status: "suspended" } : null);
            break;

          case "market_result":
            setRecentResults((prev) => [
              { ball: data.ball_number, result: data.result, display: data.result_display },
              ...prev.slice(0, 11),
            ]);
            fetchWallet();
            fetchMyBets();
            break;

          case "match_state_update":
            // Handle match state updates
            break;

          default:
            break;
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
    };

    return () => {
      ws.close();
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }

    if (activeMarket && activeMarket.status === "open") {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [activeMarket]);

  // Initial data fetch
  useEffect(() => {
    fetchDemoStatus();
    fetchWallet();
    fetchMyBets();

    const interval = setInterval(fetchDemoStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchWallet, fetchMyBets]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a1628] to-[#1a2d4a]">
      <PublicHeader
        onShowAuth={onShowAuth}
        activeTab="cricket"
        onTabChange={() => {}}
        user={user}
        onLogout={onLogout}
      />

      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🏏 Cricket Ball-by-Ball Betting
          </h1>
          <p className="text-gray-300">Predict the outcome of every ball!</p>
        </div>

        {/* Demo Controls */}
        <div className="flex justify-center gap-4 mb-6">
          {!demoStatus?.running ? (
            <Button
              onClick={startDemo}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3"
              data-testid="start-demo-btn"
            >
              ▶ Start Demo Match
            </Button>
          ) : (
            <Button
              onClick={stopDemo}
              variant="destructive"
              className="font-bold px-8 py-3"
              data-testid="stop-demo-btn"
            >
              ⏹ Stop Demo
            </Button>
          )}
        </div>

        {demoStatus?.running && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Match Info Panel */}
            <div className="lg:col-span-2">
              {/* Match Header */}
              <div className="bg-[#1e3a5f] rounded-t-lg p-4 border-b border-blue-700">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {demoStatus.match_name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                      <span className="text-red-400 text-sm font-semibold">LIVE</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-yellow-400">
                      Ball {demoStatus.current_ball}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Market */}
              {activeMarket ? (
                <div className="bg-[#152238] rounded-b-lg p-6">
                  {/* Market Status */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-bold ${
                          activeMarket.status === "open"
                            ? "bg-green-500 text-white"
                            : activeMarket.status === "suspended"
                            ? "bg-yellow-500 text-black"
                            : "bg-gray-500 text-white"
                        }`}
                      >
                        {activeMarket.status.toUpperCase()}
                      </span>
                      <span className="text-white font-medium">
                        Next Ball: {activeMarket.ball_number}
                      </span>
                    </div>
                    {activeMarket.status === "open" && countdown > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">Betting closes in:</span>
                        <span
                          className={`text-2xl font-bold ${
                            countdown <= 2 ? "text-red-500" : "text-green-400"
                          }`}
                        >
                          {countdown}s
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Betting Options Grid */}
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {Object.entries(activeMarket.odds).map(([outcome, odds]) => {
                      const config = OUTCOME_CONFIG[outcome];
                      const isSelected = selectedOutcome === outcome;
                      const isDisabled = activeMarket.status !== "open";

                      return (
                        <button
                          key={outcome}
                          onClick={() => !isDisabled && setSelectedOutcome(outcome)}
                          disabled={isDisabled}
                          className={`p-4 rounded-lg transition-all ${
                            isSelected
                              ? "ring-4 ring-yellow-400 scale-105"
                              : ""
                          } ${
                            isDisabled
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:scale-105 cursor-pointer"
                          } ${config.color} ${config.textColor}`}
                          data-testid={`outcome-${outcome}`}
                        >
                          <div className="text-2xl font-bold">{config.short}</div>
                          <div className="text-xs mt-1">{config.name}</div>
                          <div className="text-lg font-bold mt-2">{odds.toFixed(2)}</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Bet Slip */}
                  {user && selectedOutcome && activeMarket.status === "open" && (
                    <div className="bg-[#0d1829] rounded-lg p-4">
                      <h3 className="text-white font-bold mb-3">Place Your Bet</h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-gray-400 text-sm">Selection</label>
                          <div className="text-white font-bold">
                            {OUTCOME_CONFIG[selectedOutcome].name}
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-400 text-sm">Odds</label>
                          <div className="text-green-400 font-bold">
                            {activeMarket.odds[selectedOutcome].toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-4 items-end">
                        <div className="flex-1">
                          <label className="text-gray-400 text-sm block mb-1">
                            Stake (₹)
                          </label>
                          <Input
                            type="number"
                            value={stake}
                            onChange={(e) => setStake(e.target.value)}
                            placeholder="Enter amount"
                            className="bg-[#1e3a5f] border-blue-600 text-white"
                            data-testid="stake-input"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-gray-400 text-sm block mb-1">
                            Potential Win
                          </label>
                          <div className="text-2xl font-bold text-green-400">
                            ₹
                            {stake
                              ? (
                                  parseFloat(stake) *
                                  activeMarket.odds[selectedOutcome]
                                ).toFixed(2)
                              : "0.00"}
                          </div>
                        </div>
                        <Button
                          onClick={placeBet}
                          disabled={placing || !stake}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold px-8"
                          data-testid="place-bet-btn"
                        >
                          {placing ? "Placing..." : "Place Bet"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {!user && (
                    <div className="bg-[#0d1829] rounded-lg p-4 text-center">
                      <p className="text-gray-400 mb-3">Login to place bets</p>
                      <Button
                        onClick={() => onShowAuth("login")}
                        className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold"
                      >
                        Login to Bet
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-[#152238] rounded-b-lg p-6 text-center">
                  <p className="text-gray-400">Waiting for next ball market...</p>
                </div>
              )}

              {/* Recent Results */}
              <div className="mt-6 bg-[#152238] rounded-lg p-4">
                <h3 className="text-white font-bold mb-3">Recent Ball Results</h3>
                <div className="flex gap-2 flex-wrap">
                  {recentResults.length > 0 ? (
                    recentResults.map((result, idx) => {
                      const config = OUTCOME_CONFIG[result.result] || OUTCOME_CONFIG.dot;
                      return (
                        <div
                          key={idx}
                          className={`w-12 h-12 rounded-full flex items-center justify-center ${config.color} ${config.textColor} font-bold text-lg`}
                          title={`Ball ${result.ball}: ${result.display}`}
                        >
                          {config.short}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-gray-500">No results yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-6">
              {/* Wallet */}
              {user && wallet && (
                <div className="bg-[#152238] rounded-lg p-4">
                  <h3 className="text-gray-400 text-sm mb-1">Your Balance</h3>
                  <div className="text-3xl font-bold text-green-400">
                    ₹{wallet.balance?.toFixed(2) || "0.00"}
                  </div>
                </div>
              )}

              {/* My Recent Bets */}
              {user && (
                <div className="bg-[#152238] rounded-lg p-4">
                  <h3 className="text-white font-bold mb-3">My Recent Bets</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {myBets.length > 0 ? (
                      myBets.map((bet) => {
                        const config = OUTCOME_CONFIG[bet.selected_outcome] || OUTCOME_CONFIG.dot;
                        return (
                          <div
                            key={bet.bet_id}
                            className="flex items-center justify-between bg-[#0d1829] rounded p-2"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color} ${config.textColor} text-sm font-bold`}
                              >
                                {config.short}
                              </div>
                              <div>
                                <div className="text-white text-sm">
                                  Ball {bet.ball_number}
                                </div>
                                <div className="text-gray-400 text-xs">
                                  ₹{bet.stake} @ {bet.odds.toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded ${
                                bet.status === "won"
                                  ? "bg-green-600 text-white"
                                  : bet.status === "lost"
                                  ? "bg-red-600 text-white"
                                  : "bg-yellow-600 text-black"
                              }`}
                            >
                              {bet.status.toUpperCase()}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-gray-500 text-center py-4">No bets yet</p>
                    )}
                  </div>
                </div>
              )}

              {/* How to Play */}
              <div className="bg-[#152238] rounded-lg p-4">
                <h3 className="text-white font-bold mb-3">How to Play</h3>
                <ol className="text-gray-300 text-sm space-y-2 list-decimal list-inside">
                  <li>Wait for a new ball market to open</li>
                  <li>Select your predicted outcome</li>
                  <li>Enter your stake amount</li>
                  <li>Place bet within the 5-second window</li>
                  <li>Win if your prediction matches!</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* Pre-demo state */}
        {!demoStatus?.running && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏏</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Cricket Ball-by-Ball Micro Betting
            </h2>
            <p className="text-gray-400 mb-6 max-w-lg mx-auto">
              Experience real-time cricket betting! Predict the outcome of each
              ball - runs, wickets, or extras. Markets open for just 5 seconds
              per ball.
            </p>
            <Button
              onClick={startDemo}
              className="bg-green-600 hover:bg-green-700 text-white font-bold px-12 py-4 text-lg"
            >
              ▶ Start Demo Match
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
