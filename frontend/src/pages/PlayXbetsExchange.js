import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/App";

// ==================== CONSTANTS ====================
const BALL_DURATION = 11; // seconds

const BALL_OUTCOMES = [
  { id: "dot", name: "Dot Ball", short: "0", runs: 0, odds: 2.0, color: "bg-gray-500" },
  { id: "1", name: "1 Run", short: "1", runs: 1, odds: 2.5, color: "bg-blue-500" },
  { id: "2", name: "2 Runs", short: "2", runs: 2, odds: 4.0, color: "bg-blue-600" },
  { id: "3", name: "3 Runs", short: "3", runs: 3, odds: 8.0, color: "bg-purple-500" },
  { id: "4", name: "Four", short: "4", runs: 4, odds: 4.5, color: "bg-green-500" },
  { id: "6", name: "Six", short: "6", runs: 6, odds: 8.0, color: "bg-green-600" },
  { id: "wicket", name: "Wicket", short: "W", runs: 0, odds: 12.0, color: "bg-red-600" },
  { id: "wide", name: "Wide/NB", short: "WD", runs: 1, odds: 6.0, color: "bg-yellow-500" },
];

const BALL_PROBABILITIES = [35, 30, 10, 2, 12, 5, 4, 2]; // Must sum to 100

// ==================== HELPER FUNCTIONS ====================
const generateRandomBall = () => {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < BALL_PROBABILITIES.length; i++) {
    cumulative += BALL_PROBABILITIES[i];
    if (rand < cumulative) {
      return BALL_OUTCOMES[i];
    }
  }
  return BALL_OUTCOMES[0];
};

const formatOvers = (balls) => {
  const overs = Math.floor(balls / 6);
  const ballsInOver = balls % 6;
  return `${overs}.${ballsInOver}`;
};

// ==================== INITIAL STATE ====================
const createInitialMatch = () => ({
  team1: "North West Dragons",
  team2: "Western Province",
  battingTeam: "North West Dragons",
  score: { runs: 51, wickets: 2, balls: 34 },
  crr: 9.0,
  currentOver: [1, 0, 4, 0, 2, null],
  format: "t20",
  maxOvers: 20,
  partnership: { runs: 28, balls: 22 },
  lastWicket: { runs: 23, over: "3.4", batsman: "Player 1" },
});

const createInitialOdds = () => ({
  team1: { back: [1.81, 1.82, 1.83], lay: [1.85, 1.86, 1.87] },
  team2: { back: [2.12, 2.14, 2.16], lay: [2.20, 2.22, 2.24] },
});

// ==================== MAIN COMPONENT ====================
export default function PlayXbetsExchange({ user, onShowAuth, onLogout }) {
  const location = useLocation();
  const [match, setMatch] = useState(createInitialMatch);
  const [odds, setOdds] = useState(createInitialOdds);
  const [betSlip, setBetSlip] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [balance, setBalance] = useState(0);
  const [ballTimer, setBallTimer] = useState(BALL_DURATION);
  const [isBettingOpen, setIsBettingOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState("odds");
  const timerRef = useRef(null);

  // ==================== FETCH USER WALLET ====================
  useEffect(() => {
    if (user) {
      fetchWallet();
    } else {
      setBalance(1500); // Demo balance for non-logged in users
    }
  }, [user]);

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setBalance(response.data.balance || 0);
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
      setBalance(1500); // Fallback demo balance
    }
  };

  // ==================== BALL TIMER LOGIC ====================
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setBallTimer((prev) => {
        if (prev <= 1) {
          // Time's up - generate new ball
          setIsBettingOpen(false);
          setTimeout(() => {
            generateNewBall();
            setBallTimer(BALL_DURATION);
            setIsBettingOpen(true);
          }, 1000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, []);

  // ==================== GENERATE NEW BALL ====================
  const generateNewBall = useCallback(() => {
    const outcome = generateRandomBall();
    
    setMatch((prev) => {
      let newRuns = prev.score.runs + outcome.runs;
      let newWickets = prev.score.wickets;
      let newBalls = prev.score.balls + 1;
      let newPartnership = { ...prev.partnership };
      let newLastWicket = prev.lastWicket;

      // Handle wicket
      if (outcome.id === "wicket") {
        newWickets = Math.min(newWickets + 1, 10);
        newLastWicket = {
          runs: newRuns,
          over: formatOvers(newBalls),
          batsman: `Player ${newWickets}`,
        };
        newPartnership = { runs: 0, balls: 0 };
      } else {
        newPartnership.runs += outcome.runs;
        newPartnership.balls += 1;
      }

      // Update current over display
      const ballInOver = newBalls % 6;
      let newCurrentOver = [...prev.currentOver];
      
      if (ballInOver === 0) {
        // New over started
        newCurrentOver = [null, null, null, null, null, null];
      } else {
        newCurrentOver[ballInOver - 1] = outcome.id === "wicket" ? "W" : 
                                          outcome.id === "wide" ? "WD" : outcome.runs;
      }

      // Calculate CRR
      const newCRR = newBalls > 0 ? ((newRuns / newBalls) * 6).toFixed(2) : 0;

      return {
        ...prev,
        score: { runs: newRuns, wickets: newWickets, balls: newBalls },
        crr: parseFloat(newCRR),
        currentOver: newCurrentOver,
        partnership: newPartnership,
        lastWicket: newLastWicket,
      };
    });

    // Update odds slightly
    setOdds((prev) => ({
      team1: {
        back: prev.team1.back.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        lay: prev.team1.lay.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
      },
      team2: {
        back: prev.team2.back.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        lay: prev.team2.lay.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
      },
    }));

    // Settle ball-by-ball bets
    settleBallBets(outcome);
  }, []);

  // ==================== SETTLE BALL BETS ====================
  const settleBallBets = (outcome) => {
    setBetSlip((prev) => {
      const updated = prev.map((bet) => {
        if (bet.marketType === "ball" && bet.status === "pending") {
          const won = bet.selection === outcome.name;
          if (won) {
            const winAmount = parseFloat(bet.stake || 0) * bet.odds;
            setBalance((b) => b + winAmount);
            toast.success(`Won ₹${winAmount.toFixed(2)} on ${bet.selection}!`);
          }
          return { ...bet, status: won ? "won" : "lost" };
        }
        return bet;
      });
      return updated.filter((b) => b.status === "pending");
    });
  };

  // ==================== FORMAT TOGGLE ====================
  const toggleFormat = (format) => {
    setMatch((prev) => ({
      ...prev,
      format,
      maxOvers: format === "t20" ? 20 : 50,
    }));
  };

  // ==================== ADD TO BET SLIP ====================
  const addToBetSlip = (selection, type, selectedOdds, marketType = "match") => {
    if (!user && marketType === "ball") {
      onShowAuth && onShowAuth("login");
      toast.error("Please login to place bets");
      return;
    }
    
    if (!isBettingOpen && marketType === "ball") {
      toast.error("Betting closed for this ball!");
      return;
    }
    
    setBetSlip((prev) => {
      const exists = prev.find((b) => b.selection === selection && b.type === type && b.marketType === marketType);
      if (exists) {
        toast.info("Already in bet slip");
        return prev;
      }
      toast.success(`Added: ${selection}`);
      return [...prev, { 
        id: Date.now(), 
        selection, 
        type, 
        odds: selectedOdds, 
        stake: "", 
        marketType,
        status: "pending"
      }];
    });
  };

  // ==================== BET SLIP FUNCTIONS ====================
  const updateStake = (id, stake) => {
    setBetSlip((prev) => prev.map((b) => (b.id === id ? { ...b, stake } : b)));
  };

  const removeFromBetSlip = (id) => {
    setBetSlip((prev) => prev.filter((b) => b.id !== id));
  };

  const clearBetSlip = () => {
    setBetSlip([]);
    toast.info("Bet slip cleared");
  };

  const placeBet = async () => {
    if (!user) {
      onShowAuth && onShowAuth("login");
      toast.error("Please login to place bets");
      return;
    }
    
    const totalStake = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
    if (totalStake <= 0) {
      toast.error("Enter stake amount");
      return;
    }
    if (totalStake > balance) {
      toast.error("Insufficient balance");
      return;
    }
    
    // For demo, just deduct from local balance
    setBalance((prev) => prev - totalStake);
    toast.success(`Bet placed! Total: ₹${totalStake}`);
    setBetSlip([]);
    
    // Refresh wallet balance
    if (user) {
      fetchWallet();
    }
  };

  // ==================== FILTER TABS ====================
  const FILTER_TABS = [
    { id: "all", name: "All Markets" },
    { id: "match", name: "Match Odds" },
    { id: "ball", name: "Ball by Ball" },
    { id: "over", name: "Over Markets" },
    { id: "session", name: "Session Markets" },
  ];

  // ==================== OVER MARKETS DATA ====================
  const getOverMarkets = () => {
    const isT20 = match.format === "t20";
    const overs = isT20 ? [5, 10, 15, 20] : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const currentOvers = Math.floor(match.score.balls / 6);
    
    return overs.filter((ov) => ov > currentOvers).map((ov) => {
      const baseRuns = ov * 7.5; // Average run rate calculation
      return {
        over: ov,
        lines: [
          { line: Math.floor(baseRuns - 5) + 0.5, yesOdds: 1.85, noOdds: 1.95 },
          { line: Math.floor(baseRuns + 5) + 0.5, yesOdds: 2.10, noOdds: 1.75 },
        ],
      };
    });
  };

  // ==================== SESSION MARKETS DATA ====================
  const getSessionMarkets = () => {
    const isT20 = match.format === "t20";
    const currentOvers = Math.floor(match.score.balls / 6);
    
    const sessions = [];
    
    // Standard sessions
    const sessionOvers = isT20 ? [5, 10, 15, 20] : [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    
    sessionOvers.forEach((ov) => {
      if (ov > currentOvers) {
        sessions.push({
          title: `First ${ov} Overs`,
          markets: [
            {
              name: "Total Runs",
              line: Math.floor(ov * 7.5) + 0.5,
              overOdds: 1.90,
              underOdds: 1.90,
            },
            {
              name: "Wickets",
              options: ov <= 10 ? ["0-2", "3+"] : ["0-3", "4+"],
              odds: [1.75, 2.10],
            },
          ],
        });
      }
    });

    // Custom session
    sessions.push({
      title: "Custom Session",
      markets: [
        { name: "Next 2 Overs Runs", line: 14.5, overOdds: 1.85, underOdds: 1.95 },
        { name: "Next Over Boundary", yesOdds: 1.65, noOdds: 2.20 },
      ],
    });

    return sessions;
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-[#0B0F1A] text-white">
      {/* ==================== HEADER ==================== */}
      <header className="bg-[#121826] border-b border-cyan-500/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold">X</span>
              </div>
              <span className="text-xl font-bold">
                Play<span className="text-yellow-400">X</span>bets
              </span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <Link
                to="/"
                className={`font-medium transition-colors ${
                  location.pathname === "/" ? "text-yellow-400" : "text-gray-400 hover:text-white"
                }`}
              >
                Home
              </Link>
              <Link
                to="/exchange"
                className={`font-medium transition-colors flex items-center gap-2 ${
                  location.pathname === "/exchange" ? "text-cyan-400" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                Cricket
              </Link>
              <Link
                to="/football-live"
                className={`font-medium transition-colors flex items-center gap-2 ${
                  location.pathname === "/football-live" ? "text-cyan-400" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                Soccer
              </Link>
            </nav>

            {/* Balance & User */}
            <div className="flex items-center gap-4">
              <div className="bg-[#1E2736] px-4 py-2 rounded-lg">
                <span className="text-gray-400 text-sm">Balance</span>
                <span className="text-cyan-400 font-bold ml-2">₹{balance.toFixed(0)}</span>
              </div>
              {user ? (
                <div className="hidden md:flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold">{user.username?.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-sm">{user.username}</span>
                  <button
                    onClick={onLogout}
                    className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onShowAuth && onShowAuth("login")}
                  className="hidden md:block bg-cyan-500 hover:bg-cyan-600 text-white font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ==================== MATCH HEADER ==================== */}
      <div className="bg-gradient-to-r from-[#121826] via-[#1a2435] to-[#121826] border-b border-cyan-500/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Match Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-red-400 text-sm font-semibold">LIVE</span>
                
                {/* Format Toggle */}
                <div className="flex bg-[#0B0F1A] rounded-lg p-1 ml-4">
                  <button
                    onClick={() => toggleFormat("t20")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      match.format === "t20"
                        ? "bg-cyan-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    T20
                  </button>
                  <button
                    onClick={() => toggleFormat("odi")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      match.format === "odi"
                        ? "bg-cyan-500 text-white"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    ODI
                  </button>
                </div>
              </div>
              <h1 className="text-xl md:text-2xl font-bold">
                {match.team1} <span className="text-gray-500">vs</span> {match.team2}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {match.battingTeam} batting • {match.format.toUpperCase()} Match
              </p>
            </div>

            {/* Score & Stats */}
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-cyan-400">
                  {match.score.runs}/{match.score.wickets}
                </div>
                <div className="text-sm text-gray-400">
                  ({formatOvers(match.score.balls)} ov)
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">CRR</div>
                <div className="text-xl font-bold">{match.crr}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-400">Partnership</div>
                <div className="text-lg font-bold">{match.partnership.runs}({match.partnership.balls})</div>
              </div>
            </div>

            {/* This Over & Timer */}
            <div className="flex items-center gap-6">
              <div>
                <div className="text-sm text-gray-400 mb-2">This Over</div>
                <div className="flex gap-1">
                  {match.currentOver.map((ball, idx) => (
                    <div
                      key={idx}
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        ball === null
                          ? "bg-gray-700/50 text-gray-600"
                          : ball === 4 || ball === 6
                          ? "bg-green-500 text-white"
                          : ball === "W"
                          ? "bg-red-500 text-white"
                          : ball === "WD"
                          ? "bg-yellow-500 text-black"
                          : ball === 0
                          ? "bg-gray-600 text-white"
                          : "bg-blue-500 text-white"
                      }`}
                    >
                      {ball === null ? "•" : ball}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Ball Timer */}
              <div className="text-center">
                <div className="text-sm text-gray-400 mb-1">Next Ball In</div>
                <div
                  className={`text-3xl font-bold ${
                    ballTimer <= 3 ? "text-red-500 animate-pulse" : "text-cyan-400"
                  }`}
                >
                  {ballTimer}s
                </div>
                <div
                  className={`text-xs mt-1 px-2 py-1 rounded ${
                    isBettingOpen
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {isBettingOpen ? "BETTING OPEN" : "BETTING CLOSED"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== FILTER TABS ==================== */}
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

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ==================== LEFT - MARKETS (70%) ==================== */}
          <div className="lg:w-[70%] space-y-6">
            {/* ========== MATCH ODDS ========== */}
            {(activeFilter === "all" || activeFilter === "match") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-cyan-400 rounded"></span>
                  Match Odds
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    { name: match.team1, odds: odds.team1 },
                    { name: match.team2, odds: odds.team2 },
                  ].map((team) => (
                    <div
                      key={team.name}
                      className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800 hover:border-cyan-500/30 transition-colors"
                    >
                      <h3 className="font-semibold mb-3">{team.name}</h3>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10">Back</span>
                          <div className="flex gap-1 flex-1">
                            {team.odds.back.map((o, idx) => (
                              <button
                                key={idx}
                                onClick={() => addToBetSlip(team.name, "Back", o)}
                                className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/50 text-[#1E90FF] font-bold py-2 rounded-lg transition-all hover:scale-105"
                              >
                                {o.toFixed(2)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-10">Lay</span>
                          <div className="flex gap-1 flex-1">
                            {team.odds.lay.map((o, idx) => (
                              <button
                                key={idx}
                                onClick={() => addToBetSlip(team.name, "Lay", o)}
                                className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/50 text-[#FF4D4D] font-bold py-2 rounded-lg transition-all hover:scale-105"
                              >
                                {o.toFixed(2)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========== BALL-BY-BALL ========== */}
            {(activeFilter === "all" || activeFilter === "ball") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <span className="w-1 h-6 bg-green-400 rounded"></span>
                    Next Ball Betting
                  </h2>
                  <div
                    className={`text-sm px-3 py-1 rounded-full ${
                      isBettingOpen
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {isBettingOpen ? `Open (${ballTimer}s)` : "Closed"}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {BALL_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome.id}
                      onClick={() => addToBetSlip(outcome.name, "Back", outcome.odds, "ball")}
                      disabled={!isBettingOpen}
                      className={`${outcome.color}/20 hover:${outcome.color}/40 border border-gray-700 rounded-xl p-4 transition-all group ${
                        !isBettingOpen ? "opacity-50 cursor-not-allowed" : "hover:scale-105 hover:border-green-500/50"
                      }`}
                    >
                      <div className="text-2xl font-bold mb-1">{outcome.short}</div>
                      <div className="text-xs text-gray-400">{outcome.name}</div>
                      <div className="text-lg font-bold text-green-400 mt-2">{outcome.odds.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ========== OVER MARKETS ========== */}
            {(activeFilter === "all" || activeFilter === "over") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-yellow-400 rounded"></span>
                  Over Markets ({match.format.toUpperCase()})
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getOverMarkets().slice(0, 6).map((market) => (
                    <div
                      key={market.over}
                      className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                    >
                      <h3 className="font-semibold text-yellow-400 mb-3">
                        {market.over} Over Runs
                      </h3>
                      <div className="space-y-2">
                        {market.lines.map((line, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-xs text-gray-400 w-14 flex items-center">
                              {line.line}
                            </span>
                            <button
                              onClick={() => addToBetSlip(`${market.over}ov Over ${line.line}`, "Yes", line.yesOdds)}
                              className="flex-1 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 text-green-400 text-sm font-bold py-2 rounded transition-all"
                            >
                              Yes {line.yesOdds}
                            </button>
                            <button
                              onClick={() => addToBetSlip(`${market.over}ov Under ${line.line}`, "No", line.noOdds)}
                              className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 text-sm font-bold py-2 rounded transition-all"
                            >
                              No {line.noOdds}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========== SESSION MARKETS ========== */}
            {(activeFilter === "all" || activeFilter === "session") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-purple-400 rounded"></span>
                  Session Markets
                </h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getSessionMarkets().slice(0, 6).map((session, idx) => (
                    <div
                      key={idx}
                      className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800"
                    >
                      <h3 className="font-semibold text-purple-400 mb-3">{session.title}</h3>
                      <div className="space-y-3">
                        {session.markets.map((market, mIdx) => (
                          <div key={mIdx}>
                            <div className="text-xs text-gray-400 mb-1">
                              {market.name} {market.line && `(${market.line})`}
                            </div>
                            {market.overOdds && market.underOdds ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => addToBetSlip(`${session.title} ${market.name} Over`, "Over", market.overOdds)}
                                  className="flex-1 bg-[#1E90FF]/20 hover:bg-[#1E90FF]/40 border border-[#1E90FF]/30 text-[#1E90FF] text-xs font-bold py-2 rounded transition-all"
                                >
                                  Over {market.overOdds}
                                </button>
                                <button
                                  onClick={() => addToBetSlip(`${session.title} ${market.name} Under`, "Under", market.underOdds)}
                                  className="flex-1 bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/40 border border-[#FF4D4D]/30 text-[#FF4D4D] text-xs font-bold py-2 rounded transition-all"
                                >
                                  Under {market.underOdds}
                                </button>
                              </div>
                            ) : market.yesOdds && market.noOdds ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => addToBetSlip(`${session.title} ${market.name} Yes`, "Yes", market.yesOdds)}
                                  className="flex-1 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 text-green-400 text-xs font-bold py-2 rounded transition-all"
                                >
                                  Yes {market.yesOdds}
                                </button>
                                <button
                                  onClick={() => addToBetSlip(`${session.title} ${market.name} No`, "No", market.noOdds)}
                                  className="flex-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 text-red-400 text-xs font-bold py-2 rounded transition-all"
                                >
                                  No {market.noOdds}
                                </button>
                              </div>
                            ) : market.options ? (
                              <div className="flex gap-2">
                                {market.options.map((opt, oIdx) => (
                                  <button
                                    key={opt}
                                    onClick={() => addToBetSlip(`${session.title} Wickets ${opt}`, opt, market.odds[oIdx])}
                                    className="flex-1 bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/30 text-purple-400 text-xs font-bold py-2 rounded transition-all"
                                  >
                                    {opt} ({market.odds[oIdx]})
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

            {/* ========== EXTRA MARKETS (COLLAPSIBLE) ========== */}
            {(activeFilter === "all") && (
              <div className="bg-[#121826] rounded-xl p-4 border border-cyan-500/10">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-6 bg-orange-400 rounded"></span>
                  Extra Markets
                </h2>
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Fall of Wicket */}
                  <div className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800">
                    <h3 className="font-semibold text-orange-400 mb-3">Fall of Wicket</h3>
                    <div className="text-sm text-gray-400 mb-2">
                      Last Wicket: {match.lastWicket.runs} ({match.lastWicket.over})
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addToBetSlip("Next Wicket Over 65", "Over", 1.90)}
                        className="flex-1 bg-[#1E90FF]/20 border border-[#1E90FF]/30 text-[#1E90FF] text-xs font-bold py-2 rounded"
                      >
                        Over 65 (1.90)
                      </button>
                      <button
                        onClick={() => addToBetSlip("Next Wicket Under 65", "Under", 1.90)}
                        className="flex-1 bg-[#FF4D4D]/20 border border-[#FF4D4D]/30 text-[#FF4D4D] text-xs font-bold py-2 rounded"
                      >
                        Under 65 (1.90)
                      </button>
                    </div>
                  </div>

                  {/* Partnership */}
                  <div className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800">
                    <h3 className="font-semibold text-orange-400 mb-3">Partnership Runs</h3>
                    <div className="text-sm text-gray-400 mb-2">
                      Current: {match.partnership.runs} ({match.partnership.balls} balls)
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addToBetSlip("Partnership Over 40", "Over", 1.85)}
                        className="flex-1 bg-[#1E90FF]/20 border border-[#1E90FF]/30 text-[#1E90FF] text-xs font-bold py-2 rounded"
                      >
                        Over 40 (1.85)
                      </button>
                      <button
                        onClick={() => addToBetSlip("Partnership Under 40", "Under", 1.95)}
                        className="flex-1 bg-[#FF4D4D]/20 border border-[#FF4D4D]/30 text-[#FF4D4D] text-xs font-bold py-2 rounded"
                      >
                        Under 40 (1.95)
                      </button>
                    </div>
                  </div>

                  {/* Over-by-Over */}
                  <div className="bg-[#0B0F1A] rounded-xl p-4 border border-gray-800">
                    <h3 className="font-semibold text-orange-400 mb-3">Over-by-Over</h3>
                    <div className="text-sm text-gray-400 mb-2">
                      Next Over Runs
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addToBetSlip("Next Over Over 7", "Over", 1.80)}
                        className="flex-1 bg-[#1E90FF]/20 border border-[#1E90FF]/30 text-[#1E90FF] text-xs font-bold py-2 rounded"
                      >
                        Over 7 (1.80)
                      </button>
                      <button
                        onClick={() => addToBetSlip("Next Over Under 7", "Under", 2.00)}
                        className="flex-1 bg-[#FF4D4D]/20 border border-[#FF4D4D]/30 text-[#FF4D4D] text-xs font-bold py-2 rounded"
                      >
                        Under 7 (2.00)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ==================== RIGHT - BET SLIP (30%) ==================== */}
          <div className="lg:w-[30%]">
            <div className="bg-[#121826] rounded-xl border border-cyan-500/10 sticky top-24">
              {/* Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-lg font-bold">Bet Slip</h2>
                <span className="bg-cyan-500/20 text-cyan-400 text-sm px-2 py-1 rounded">
                  {betSlip.length}
                </span>
              </div>

              {/* Content */}
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {betSlip.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">📋</div>
                    <p>Click odds to add selections</p>
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
                                bet.type === "Back" || bet.type === "Over" || bet.type === "Yes"
                                  ? "text-[#1E90FF]"
                                  : "text-[#FF4D4D]"
                              }`}
                            >
                              {bet.type} @ {bet.odds.toFixed(2)}
                              {bet.marketType === "ball" && (
                                <span className="ml-2 text-green-400">(Ball Market)</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromBetSlip(bet.id)}
                            className="text-gray-500 hover:text-red-400 text-lg"
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

              {/* Footer */}
              {betSlip.length > 0 && (
                <div className="p-4 border-t border-gray-800 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Total Stake:</span>
                    <span className="font-bold">
                      ₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Potential Profit:</span>
                    <span className="text-green-400 font-bold">
                      ₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0).toFixed(2)}
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
                      className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-lg transition-all hover:scale-105"
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

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#121826] border-t border-cyan-500/20 p-2 z-50">
        <div className="flex justify-around">
          {[
            { id: "odds", name: "Odds", icon: "📊", filter: "match" },
            { id: "ball", name: "Ball", icon: "🏏", filter: "ball" },
            { id: "over", name: "Overs", icon: "📈", filter: "over" },
            { id: "session", name: "Sessions", icon: "📋", filter: "session" },
            { id: "bets", name: `Bets (${betSlip.length})`, icon: "🎫", filter: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setMobileTab(tab.id);
                if (tab.filter) {
                  setActiveFilter(tab.filter);
                  window.scrollTo({ top: 400, behavior: "smooth" });
                } else {
                  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                }
              }}
              className={`flex flex-col items-center px-3 py-2 rounded-lg ${
                mobileTab === tab.id ? "bg-cyan-500/20 text-cyan-400" : "text-gray-400"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-xs">{tab.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom padding for mobile */}
      <div className="lg:hidden h-20"></div>
    </div>
  );
}
