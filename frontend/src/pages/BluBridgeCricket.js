import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// Mock data for demo
const MOCK_MATCH = {
  id: "match-001",
  team1: "North West Dragons",
  team2: "Western Province",
  score: { runs: 29, wickets: 2, overs: "5.4" },
  crr: 5.12,
  currentOver: [1, 0, 4, 0, 2, null], // null = ball not bowled yet
  status: "live",
};

const MOCK_ODDS = {
  team1: { back: [1.81, 1.82, 1.83], lay: [1.85, 1.86, 1.87] },
  team2: { back: [2.12, 2.14, 2.16], lay: [2.20, 2.22, 2.24] },
};

// Ball outcome options
const BALL_OPTIONS = [
  { id: "dot", name: "Dot Ball", odds: 2.0 },
  { id: "1run", name: "1 Run", odds: 2.5 },
  { id: "boundary", name: "Boundary (4/6)", odds: 4.0 },
  { id: "wicket", name: "Wicket", odds: 10.0 },
];

// Over market options
const OVER_MARKETS = [
  { id: "over-6.5", name: "Over 6.5 Runs", yesOdds: 1.85, noOdds: 1.95 },
  { id: "over-8.5", name: "Over 8.5 Runs", yesOdds: 2.10, noOdds: 1.75 },
];

// Session markets
const SESSION_MARKETS = {
  first5: {
    title: "First 5 Overs",
    markets: [
      { id: "5ov-runs", name: "Total Runs", line: 40.5, overOdds: 1.90, underOdds: 1.90 },
      { id: "5ov-wkts", name: "Wickets", options: ["0-2", "3+"], odds: [1.75, 2.10] },
    ],
  },
  first10: {
    title: "First 10 Overs",
    markets: [
      { id: "10ov-runs", name: "Total Runs", line: 75.5, overOdds: 1.85, underOdds: 1.95 },
      { id: "10ov-wkts", name: "Wickets 3+", yesOdds: 1.90, noOdds: 1.90 },
    ],
  },
  custom: {
    title: "Custom Session",
    markets: [
      { id: "next2ov", name: "Next 2 Overs Runs", line: 12.5, overOdds: 1.85, underOdds: 1.95 },
      { id: "nextov-bnd", name: "Next Over Boundary", yesOdds: 1.65, noOdds: 2.20 },
    ],
  },
};

export default function BluBridgeCricket() {
  const [match, setMatch] = useState(MOCK_MATCH);
  const [odds, setOdds] = useState(MOCK_ODDS);
  const [betSlip, setBetSlip] = useState([]);
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [balance, setBalance] = useState(1500);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("odds");

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Random score update
      setMatch((prev) => {
        const newRuns = prev.score.runs + Math.floor(Math.random() * 3);
        const newOvers = prev.score.overs;
        return {
          ...prev,
          score: { ...prev.score, runs: newRuns },
          crr: (newRuns / parseFloat(newOvers)).toFixed(2),
        };
      });

      // Random odds fluctuation
      setOdds((prev) => ({
        team1: {
          back: prev.team1.back.map((o) => +(o + (Math.random() - 0.5) * 0.02).toFixed(2)),
          lay: prev.team1.lay.map((o) => +(o + (Math.random() - 0.5) * 0.02).toFixed(2)),
        },
        team2: {
          back: prev.team2.back.map((o) => +(o + (Math.random() - 0.5) * 0.02).toFixed(2)),
          lay: prev.team2.lay.map((o) => +(o + (Math.random() - 0.5) * 0.02).toFixed(2)),
        },
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Add to bet slip
  const addToBetSlip = useCallback((selection, type, selectedOdds) => {
    setBetSlip((prev) => {
      // Check if already exists
      const exists = prev.find((b) => b.selection === selection && b.type === type);
      if (exists) {
        toast.info("Selection already in bet slip");
        return prev;
      }
      toast.success(`Added: ${selection} (${type})`);
      return [...prev, { id: Date.now(), selection, type, odds: selectedOdds, stake: "" }];
    });
  }, []);

  // Update stake in bet slip
  const updateStake = (id, stake) => {
    setBetSlip((prev) =>
      prev.map((b) => (b.id === id ? { ...b, stake } : b))
    );
  };

  // Remove from bet slip
  const removeFromBetSlip = (id) => {
    setBetSlip((prev) => prev.filter((b) => b.id !== id));
  };

  // Clear bet slip
  const clearBetSlip = () => {
    setBetSlip([]);
    setStakeAmount("");
    toast.info("Bet slip cleared");
  };

  // Place bet
  const placeBet = () => {
    const totalStake = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
    if (totalStake <= 0) {
      toast.error("Please enter stake amount");
      return;
    }
    if (totalStake > balance) {
      toast.error("Insufficient balance");
      return;
    }
    setBalance((prev) => prev - totalStake);
    toast.success(`Bet placed! Total stake: ₹${totalStake}`);
    setBetSlip([]);
  };

  // Filter tabs
  const FILTER_TABS = [
    { id: "all", name: "All Markets" },
    { id: "match", name: "Match Odds" },
    { id: "ball", name: "Ball by Ball" },
    { id: "over", name: "Over Markets" },
    { id: "session", name: "Sessions" },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      {/* HEADER */}
      <header className="bg-[#121826] border-b border-cyan-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold">B</span>
              </div>
              <span className="text-xl font-bold">
                Blu<span className="text-cyan-400">Bridge</span>
              </span>
            </div>

            {/* Desktop Menu */}
            <nav className="hidden md:flex items-center gap-6">
              <button className="text-cyan-400 font-semibold border-b-2 border-cyan-400 pb-1">
                Cricket
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Football
              </button>
              <button className="text-gray-400 hover:text-white transition-colors">
                Casino
              </button>
            </nav>

            {/* Balance & User */}
            <div className="flex items-center gap-4">
              <div className="bg-[#1E2736] px-4 py-2 rounded-lg">
                <span className="text-gray-400 text-sm">Balance</span>
                <span className="text-cyan-400 font-bold ml-2">₹{balance.toFixed(0)}</span>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold">D</span>
                </div>
                <span className="text-sm">Demo User</span>
              </div>
              
              {/* Mobile menu button */}
              <button 
                className="md:hidden text-gray-400"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* MATCH HEADER */}
      <div className="bg-gradient-to-r from-[#121826] to-[#1a2435] border-b border-cyan-500/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Match Info */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-red-400 text-sm font-semibold">LIVE</span>
                <span className="text-gray-500 text-sm">• T20 Match</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold">
                {match.team1} <span className="text-gray-500">vs</span> {match.team2}
              </h1>
            </div>

            {/* Score */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-cyan-400">
                  {match.score.runs}/{match.score.wickets}
                </div>
                <div className="text-sm text-gray-400">
                  ({match.score.overs} overs)
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">CRR</div>
                <div className="text-xl font-bold">{match.crr}</div>
              </div>
            </div>

            {/* Current Over */}
            <div>
              <div className="text-sm text-gray-400 mb-2">This Over</div>
              <div className="flex gap-2">
                {match.currentOver.map((ball, idx) => (
                  <div
                    key={idx}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      ball === null
                        ? "bg-gray-700 text-gray-500"
                        : ball === 4 || ball === 6
                        ? "bg-green-500 text-white"
                        : ball === 0
                        ? "bg-gray-600 text-gray-300"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {ball === null ? "•" : ball}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="bg-[#121826] border-b border-cyan-500/10 overflow-x-auto">
        <div className="container mx-auto px-4">
          <div className="flex gap-1 py-2">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeFilter === tab.id
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT - Markets (70%) */}
          <div className="lg:w-[70%] space-y-6">
            {/* MATCH ODDS */}
            {(activeFilter === "all" || activeFilter === "match") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-cyan-400 rounded"></span>
                  Match Odds
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Team 1 */}
                  <div className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-colors">
                    <h3 className="font-semibold mb-3 text-white">{match.team1}</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-12">Back</span>
                        <div className="flex gap-1 flex-1">
                          {odds.team1.back.map((o, idx) => (
                            <button
                              key={idx}
                              onClick={() => addToBetSlip(match.team1, "Back", o)}
                              className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/50 text-[#1E90FF] font-bold py-2 rounded-lg transition-all hover:scale-105"
                            >
                              {o.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-12">Lay</span>
                        <div className="flex gap-1 flex-1">
                          {odds.team1.lay.map((o, idx) => (
                            <button
                              key={idx}
                              onClick={() => addToBetSlip(match.team1, "Lay", o)}
                              className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/50 text-[#FF4D4D] font-bold py-2 rounded-lg transition-all hover:scale-105"
                            >
                              {o.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team 2 */}
                  <div className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-colors">
                    <h3 className="font-semibold mb-3 text-white">{match.team2}</h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-12">Back</span>
                        <div className="flex gap-1 flex-1">
                          {odds.team2.back.map((o, idx) => (
                            <button
                              key={idx}
                              onClick={() => addToBetSlip(match.team2, "Back", o)}
                              className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/50 text-[#1E90FF] font-bold py-2 rounded-lg transition-all hover:scale-105"
                            >
                              {o.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-12">Lay</span>
                        <div className="flex gap-1 flex-1">
                          {odds.team2.lay.map((o, idx) => (
                            <button
                              key={idx}
                              onClick={() => addToBetSlip(match.team2, "Lay", o)}
                              className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/50 text-[#FF4D4D] font-bold py-2 rounded-lg transition-all hover:scale-105"
                            >
                              {o.toFixed(2)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* BALL BY BALL */}
            {(activeFilter === "all" || activeFilter === "ball") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-green-400 rounded"></span>
                  Next Ball Betting
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {BALL_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => addToBetSlip(option.name, "Back", option.odds)}
                      className="bg-[#0B0F1A] hover:bg-[#1a2435] border border-gray-800 hover:border-green-500/50 rounded-xl p-4 transition-all hover:scale-105 group"
                    >
                      <div className="text-sm text-gray-400 group-hover:text-green-400">
                        {option.name}
                      </div>
                      <div className="text-xl font-bold text-green-400 mt-1">
                        {option.odds.toFixed(2)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* OVER BY OVER */}
            {(activeFilter === "all" || activeFilter === "over") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-yellow-400 rounded"></span>
                  Current Over Runs
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {OVER_MARKETS.map((market) => (
                    <div
                      key={market.id}
                      className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                    >
                      <div className="text-sm text-gray-400 mb-3">{market.name}</div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => addToBetSlip(`${market.name} - Yes`, "Back", market.yesOdds)}
                          className="flex-1 bg-green-500/20 hover:bg-green-500/40 border border-green-500/50 text-green-400 font-bold py-3 rounded-lg transition-all hover:scale-105"
                        >
                          <div className="text-xs text-gray-400">Yes</div>
                          <div className="text-lg">{market.yesOdds.toFixed(2)}</div>
                        </button>
                        <button
                          onClick={() => addToBetSlip(`${market.name} - No`, "Back", market.noOdds)}
                          className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 font-bold py-3 rounded-lg transition-all hover:scale-105"
                        >
                          <div className="text-xs text-gray-400">No</div>
                          <div className="text-lg">{market.noOdds.toFixed(2)}</div>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SESSION MARKETS */}
            {(activeFilter === "all" || activeFilter === "session") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-purple-400 rounded"></span>
                  Session Markets
                </h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {Object.values(SESSION_MARKETS).map((session) => (
                    <div
                      key={session.title}
                      className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                    >
                      <h3 className="font-semibold text-purple-400 mb-3">{session.title}</h3>
                      <div className="space-y-3">
                        {session.markets.map((market) => (
                          <div key={market.id} className="space-y-2">
                            <div className="text-xs text-gray-400">
                              {market.name} {market.line && `(${market.line})`}
                            </div>
                            {market.overOdds && market.underOdds ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    addToBetSlip(`${market.name} Over ${market.line}`, "Back", market.overOdds)
                                  }
                                  className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/30 text-[#1E90FF] text-sm font-bold py-2 rounded transition-all"
                                >
                                  Over {market.overOdds}
                                </button>
                                <button
                                  onClick={() =>
                                    addToBetSlip(`${market.name} Under ${market.line}`, "Back", market.underOdds)
                                  }
                                  className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/30 text-[#FF4D4D] text-sm font-bold py-2 rounded transition-all"
                                >
                                  Under {market.underOdds}
                                </button>
                              </div>
                            ) : market.yesOdds && market.noOdds ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    addToBetSlip(`${market.name} - Yes`, "Back", market.yesOdds)
                                  }
                                  className="flex-1 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 text-green-400 text-sm font-bold py-2 rounded transition-all"
                                >
                                  Yes {market.yesOdds}
                                </button>
                                <button
                                  onClick={() =>
                                    addToBetSlip(`${market.name} - No`, "Back", market.noOdds)
                                  }
                                  className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 text-sm font-bold py-2 rounded transition-all"
                                >
                                  No {market.noOdds}
                                </button>
                              </div>
                            ) : market.options ? (
                              <div className="flex gap-2">
                                {market.options.map((opt, idx) => (
                                  <button
                                    key={opt}
                                    onClick={() =>
                                      addToBetSlip(`${market.name} - ${opt}`, "Back", market.odds[idx])
                                    }
                                    className="flex-1 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 text-purple-400 text-sm font-bold py-2 rounded transition-all"
                                  >
                                    {opt} ({market.odds[idx]})
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT - Bet Slip (30%) */}
          <div className="lg:w-[30%]">
            <div className="bg-[#121826] rounded-xl border border-cyan-500/10 sticky top-24">
              {/* Bet Slip Header */}
              <div className="p-4 border-b border-gray-800">
                <h2 className="text-lg font-bold flex items-center justify-between">
                  <span>Bet Slip</span>
                  <span className="bg-cyan-500/20 text-cyan-400 text-sm px-2 py-1 rounded">
                    {betSlip.length}
                  </span>
                </h2>
              </div>

              {/* Bet Slip Content */}
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {betSlip.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Click on any odds to add to bet slip</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {betSlip.map((bet) => (
                      <div
                        key={bet.id}
                        className="bg-[#0B0F1A] rounded-lg p-3 border border-gray-800"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-sm">{bet.selection}</div>
                            <div
                              className={`text-xs ${
                                bet.type === "Back" ? "text-[#1E90FF]" : "text-[#FF4D4D]"
                              }`}
                            >
                              {bet.type} @ {bet.odds.toFixed(2)}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromBetSlip(bet.id)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            ✕
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

              {/* Bet Slip Footer */}
              {betSlip.length > 0 && (
                <div className="p-4 border-t border-gray-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Stake:</span>
                    <span className="font-bold">
                      ₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Profit:</span>
                    <span className="text-green-400 font-bold">
                      ₹
                      {betSlip
                        .reduce(
                          (sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1),
                          0
                        )
                        .toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={clearBetSlip}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={placeBet}
                      className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold py-3 rounded-lg transition-all hover:scale-105"
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

      {/* MOBILE BOTTOM NAV */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#121826] border-t border-cyan-500/20 p-2 z-50">
        <div className="flex justify-around">
          {[
            { id: "odds", name: "Odds", icon: "📊" },
            { id: "ball", name: "Ball", icon: "🏏" },
            { id: "session", name: "Sessions", icon: "📈" },
            { id: "bets", name: `Bets (${betSlip.length})`, icon: "📋" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setMobileTab(tab.id);
                if (tab.id === "bets") {
                  // Scroll to bet slip
                  document.querySelector(".lg\\:w-\\[30\\%\\]")?.scrollIntoView({ behavior: "smooth" });
                } else {
                  setActiveFilter(tab.id === "odds" ? "match" : tab.id);
                }
              }}
              className={`flex flex-col items-center px-4 py-2 rounded-lg ${
                mobileTab === tab.id
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-gray-400"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-xs">{tab.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom padding for mobile nav */}
      <div className="lg:hidden h-20"></div>
    </div>
  );
}
