import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/App";

// Mock football match data
const MOCK_MATCHES = [
  {
    id: "fb-001",
    homeTeam: "Manchester United",
    awayTeam: "Liverpool",
    homeScore: 1,
    awayScore: 1,
    minute: 67,
    status: "live",
    league: "Premier League",
  },
  {
    id: "fb-002",
    homeTeam: "Barcelona",
    awayTeam: "Real Madrid",
    homeScore: 2,
    awayScore: 0,
    minute: 34,
    status: "live",
    league: "La Liga",
  },
  {
    id: "fb-003",
    homeTeam: "Bayern Munich",
    awayTeam: "Dortmund",
    homeScore: 0,
    awayScore: 0,
    minute: 15,
    status: "live",
    league: "Bundesliga",
  },
];

export default function FootballLive({ user, onShowAuth, onLogout }) {
  const location = useLocation();
  const [matches, setMatches] = useState(MOCK_MATCHES);
  const [selectedMatch, setSelectedMatch] = useState(MOCK_MATCHES[0]);
  const [betSlip, setBetSlip] = useState([]);
  const [balance, setBalance] = useState(0);
  const [odds, setOdds] = useState({
    home: { back: [2.10, 2.12, 2.14], lay: [2.18, 2.20, 2.22] },
    draw: { back: [3.20, 3.25, 3.30], lay: [3.35, 3.40, 3.45] },
    away: { back: [3.50, 3.55, 3.60], lay: [3.65, 3.70, 3.75] },
  });

  // Fetch wallet
  useEffect(() => {
    if (user) {
      fetchWallet();
    } else {
      setBalance(1500);
    }
  }, [user]);

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setBalance(response.data.balance || 0);
    } catch (error) {
      setBalance(1500);
    }
  };

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update match time
      setMatches((prev) =>
        prev.map((m) => ({
          ...m,
          minute: Math.min(m.minute + 1, 90),
        }))
      );

      // Randomly update odds
      setOdds((prev) => ({
        home: {
          back: prev.home.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.home.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
        },
        draw: {
          back: prev.draw.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.draw.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
        },
        away: {
          back: prev.away.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.away.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
        },
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const addToBetSlip = (selection, type, selectedOdds) => {
    if (!user) {
      onShowAuth && onShowAuth("login");
      toast.error("Please login to place bets");
      return;
    }
    
    setBetSlip((prev) => {
      const exists = prev.find((b) => b.selection === selection && b.type === type);
      if (exists) {
        toast.info("Already in bet slip");
        return prev;
      }
      toast.success(`Added: ${selection}`);
      return [...prev, { id: Date.now(), selection, type, odds: selectedOdds, stake: "" }];
    });
  };

  const updateStake = (id, stake) => {
    setBetSlip((prev) => prev.map((b) => (b.id === id ? { ...b, stake } : b)));
  };

  const removeFromBetSlip = (id) => {
    setBetSlip((prev) => prev.filter((b) => b.id !== id));
  };

  const clearBetSlip = () => {
    setBetSlip([]);
  };

  const placeBet = () => {
    if (!user) {
      onShowAuth && onShowAuth("login");
      toast.error("Please login to place bets");
      return;
    }
    
    const total = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
    if (total <= 0) {
      toast.error("Enter stake");
      return;
    }
    if (total > balance) {
      toast.error("Insufficient balance");
      return;
    }
    setBalance((prev) => prev - total);
    toast.success(`Bet placed! ₹${total}`);
    setBetSlip([]);
    if (user) fetchWallet();
  };

  // Goal markets
  const goalMarkets = [
    { name: "Over/Under 0.5", overOdds: 1.20, underOdds: 4.50 },
    { name: "Over/Under 1.5", overOdds: 1.45, underOdds: 2.75 },
    { name: "Over/Under 2.5", overOdds: 1.90, underOdds: 1.90 },
    { name: "Over/Under 3.5", overOdds: 2.50, underOdds: 1.55 },
  ];

  // Next goal market
  const nextGoalOdds = {
    home: 2.20,
    noGoal: 3.50,
    away: 2.80,
  };

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      {/* Header */}
      <header className="bg-[#121826] border-b border-cyan-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold">X</span>
              </div>
              <span className="text-xl font-bold">
                Play<span className="text-yellow-400">X</span>bets
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link
                to="/"
                className="text-gray-400 hover:text-white font-medium transition-colors"
              >
                Home
              </Link>
              <Link
                to="/exchange"
                className="text-gray-400 hover:text-white font-medium transition-colors"
              >
                Cricket Live
              </Link>
              <Link
                to="/football-live"
                className="text-cyan-400 font-medium flex items-center gap-2"
              >
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Football Live
              </Link>
            </nav>

            <div className="flex items-center gap-4">
              <div className="bg-[#1E2736] px-4 py-2 rounded-lg">
                <span className="text-gray-400 text-sm">Balance</span>
                <span className="text-cyan-400 font-bold ml-2">₹{balance}</span>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold">D</span>
                </div>
                <span className="text-sm">Demo User</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Match Selector */}
      <div className="bg-[#121826] border-b border-cyan-500/10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {matches.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMatch(m)}
                className={`flex-shrink-0 px-4 py-3 rounded-lg border transition-all ${
                  selectedMatch?.id === m.id
                    ? "bg-cyan-500/20 border-cyan-500/50"
                    : "bg-[#0B0F1A] border-gray-800 hover:border-cyan-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-xs text-gray-400">{m.league}</span>
                </div>
                <div className="text-sm font-medium">
                  {m.homeTeam} vs {m.awayTeam}
                </div>
                <div className="text-lg font-bold text-cyan-400 mt-1">
                  {m.homeScore} - {m.awayScore}
                  <span className="text-xs text-gray-400 ml-2">{m.minute}'</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Markets */}
          <div className="lg:w-[70%] space-y-6">
            {/* Match Odds */}
            <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-cyan-400 rounded"></span>
                Match Odds - {selectedMatch?.homeTeam} vs {selectedMatch?.awayTeam}
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {[
                  { name: selectedMatch?.homeTeam || "Home", odds: odds.home },
                  { name: "Draw", odds: odds.draw },
                  { name: selectedMatch?.awayTeam || "Away", odds: odds.away },
                ].map((team) => (
                  <div
                    key={team.name}
                    className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                  >
                    <h3 className="font-semibold mb-3 text-center">{team.name}</h3>
                    <div className="space-y-2">
                      <div className="flex gap-1">
                        {team.odds.back.map((o, idx) => (
                          <button
                            key={idx}
                            onClick={() => addToBetSlip(team.name, "Back", o)}
                            className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/50 text-[#1E90FF] font-bold py-2 rounded transition-all hover:scale-105"
                          >
                            {o.toFixed(2)}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-1">
                        {team.odds.lay.map((o, idx) => (
                          <button
                            key={idx}
                            onClick={() => addToBetSlip(team.name, "Lay", o)}
                            className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/50 text-[#FF4D4D] font-bold py-2 rounded transition-all hover:scale-105"
                          >
                            {o.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Over/Under Goals */}
            <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-green-400 rounded"></span>
                Over/Under Goals
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                {goalMarkets.map((market) => (
                  <div
                    key={market.name}
                    className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                  >
                    <div className="text-sm text-gray-400 mb-3 text-center">{market.name}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addToBetSlip(`${market.name} Over`, "Over", market.overOdds)}
                        className="flex-1 bg-green-500/20 hover:bg-green-500/40 border border-green-500/50 text-green-400 font-bold py-3 rounded-lg transition-all"
                      >
                        <div className="text-xs text-gray-400">Over</div>
                        <div className="text-lg">{market.overOdds.toFixed(2)}</div>
                      </button>
                      <button
                        onClick={() => addToBetSlip(`${market.name} Under`, "Under", market.underOdds)}
                        className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 font-bold py-3 rounded-lg transition-all"
                      >
                        <div className="text-xs text-gray-400">Under</div>
                        <div className="text-lg">{market.underOdds.toFixed(2)}</div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Next Goal */}
            <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-yellow-400 rounded"></span>
                Next Goal
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                <button
                  onClick={() => addToBetSlip(`${selectedMatch?.homeTeam} Next Goal`, "Back", nextGoalOdds.home)}
                  className="bg-[#0B0F1A] hover:bg-[#1a2435] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-all"
                >
                  <div className="text-sm text-gray-400 mb-2">{selectedMatch?.homeTeam}</div>
                  <div className="text-2xl font-bold text-cyan-400">{nextGoalOdds.home.toFixed(2)}</div>
                </button>
                <button
                  onClick={() => addToBetSlip("No Goal", "Back", nextGoalOdds.noGoal)}
                  className="bg-[#0B0F1A] hover:bg-[#1a2435] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-all"
                >
                  <div className="text-sm text-gray-400 mb-2">No Goal</div>
                  <div className="text-2xl font-bold text-gray-400">{nextGoalOdds.noGoal.toFixed(2)}</div>
                </button>
                <button
                  onClick={() => addToBetSlip(`${selectedMatch?.awayTeam} Next Goal`, "Back", nextGoalOdds.away)}
                  className="bg-[#0B0F1A] hover:bg-[#1a2435] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-all"
                >
                  <div className="text-sm text-gray-400 mb-2">{selectedMatch?.awayTeam}</div>
                  <div className="text-2xl font-bold text-cyan-400">{nextGoalOdds.away.toFixed(2)}</div>
                </button>
              </div>
            </div>
          </div>

          {/* Bet Slip */}
          <div className="lg:w-[30%]">
            <div className="bg-[#121826] rounded-xl border border-cyan-500/10 sticky top-24">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-lg font-bold">Bet Slip</h2>
                <span className="bg-cyan-500/20 text-cyan-400 text-sm px-2 py-1 rounded">
                  {betSlip.length}
                </span>
              </div>

              <div className="p-4 max-h-[400px] overflow-y-auto">
                {betSlip.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">⚽</div>
                    <p>Click odds to add selections</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {betSlip.map((bet) => (
                      <div
                        key={bet.id}
                        className="bg-[#0B0F1A] rounded-lg p-3 border border-gray-800"
                      >
                        <div className="flex justify-between mb-2">
                          <div>
                            <div className="font-medium text-sm">{bet.selection}</div>
                            <div
                              className={`text-xs ${
                                bet.type === "Back" || bet.type === "Over"
                                  ? "text-[#1E90FF]"
                                  : "text-[#FF4D4D]"
                              }`}
                            >
                              {bet.type} @ {bet.odds.toFixed(2)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromBetSlip(bet.id)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            ×
                          </button>
                        </div>
                        <input
                          type="number"
                          placeholder="Stake ₹"
                          value={bet.stake}
                          onChange={(e) => updateStake(bet.id, e.target.value)}
                          className="w-full bg-[#1a2435] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
                        />
                        {bet.stake && (
                          <div className="mt-2 text-right">
                            <span className="text-gray-400 text-xs">Profit: </span>
                            <span className="text-green-400 font-bold">
                              ₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {betSlip.length > 0 && (
                <div className="p-4 border-t border-gray-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Stake:</span>
                    <span className="font-bold">
                      ₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={clearBetSlip}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg"
                    >
                      Clear
                    </button>
                    <button
                      onClick={placeBet}
                      className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-lg"
                    >
                      Place Bet
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
