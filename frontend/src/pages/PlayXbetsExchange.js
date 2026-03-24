import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/App";
import { ChevronDown, ChevronUp, Clock, Tv, BarChart3, Menu, X } from "lucide-react";

// ==================== CONSTANTS ====================
const BALL_DURATION = 11;

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

const BALL_PROBABILITIES = [35, 30, 10, 2, 12, 5, 4, 2];

// ==================== HELPER FUNCTIONS ====================
const generateRandomBall = () => {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < BALL_PROBABILITIES.length; i++) {
    cumulative += BALL_PROBABILITIES[i];
    if (rand < cumulative) return BALL_OUTCOMES[i];
  }
  return BALL_OUTCOMES[0];
};

const formatOvers = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;

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
  team1: { back: [1.81, 1.82, 1.83], lay: [1.85, 1.86, 1.87], backStakes: [1250, 890, 450], layStakes: [980, 670, 320] },
  team2: { back: [2.12, 2.14, 2.16], lay: [2.20, 2.22, 2.24], backStakes: [875, 560, 340], layStakes: [720, 480, 290] },
});

// ==================== ODDS CELL COMPONENT ====================
const OddsCell = ({ odds, stake, type, onClick, suspended = false }) => {
  const isBack = type === "back";
  const bgColor = isBack ? "bg-[#72BBEF]" : "bg-[#FAA9BA]";
  const hoverColor = isBack ? "hover:bg-[#5BA8DC]" : "hover:bg-[#E8899A]";
  
  if (suspended) {
    return (
      <div className="flex flex-col items-center justify-center p-1 min-w-[50px] bg-gray-600/50 text-gray-400 text-xs">
        <span>-</span>
      </div>
    );
  }
  
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-1 min-w-[50px] ${bgColor} ${hoverColor} transition-colors cursor-pointer active:scale-95`}
      data-testid={`odds-${type}-${odds}`}
    >
      <span className="text-sm md:text-base font-bold text-gray-900">{odds.toFixed(2)}</span>
      <span className="text-[10px] md:text-xs text-gray-700">{stake?.toLocaleString() || 0}</span>
    </button>
  );
};

// ==================== MARKET ROW COMPONENT ====================
const MarketRow = ({ name, backOdds, layOdds, backStakes, layStakes, onSelectOdds, suspended = false, highlight = false }) => {
  return (
    <div className={`flex items-stretch border-b border-gray-700/50 ${highlight ? 'bg-[#1a2a3a]' : 'bg-[#1E2736]'}`}>
      {/* Team/Selection Name */}
      <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center">
        <span className="text-xs md:text-sm text-white font-medium truncate">{name}</span>
      </div>
      
      {/* Back Odds - 3 columns */}
      <div className="flex">
        {backOdds.map((odds, idx) => (
          <OddsCell
            key={`back-${idx}`}
            odds={odds}
            stake={backStakes?.[idx]}
            type="back"
            onClick={() => !suspended && onSelectOdds(name, "Back", odds)}
            suspended={suspended}
          />
        ))}
      </div>
      
      {/* Lay Odds - 3 columns */}
      <div className="flex">
        {layOdds.map((odds, idx) => (
          <OddsCell
            key={`lay-${idx}`}
            odds={odds}
            stake={layStakes?.[idx]}
            type="lay"
            onClick={() => !suspended && onSelectOdds(name, "Lay", odds)}
            suspended={suspended}
          />
        ))}
      </div>
    </div>
  );
};

// ==================== MARKET HEADER COMPONENT ====================
const MarketHeader = ({ title, isExpanded, onToggle, showTV = false }) => {
  return (
    <div 
      className="flex items-center justify-between bg-[#2C3E50] p-2 cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs md:text-sm font-bold text-white uppercase">{title}</span>
        {showTV && <Tv className="w-4 h-4 text-green-400" />}
      </div>
      <div className="flex items-center gap-1">
        {/* Back/Lay Headers */}
        <div className="hidden sm:flex items-center mr-2">
          <div className="flex">
            <span className="w-[50px] text-center text-[10px] text-[#72BBEF] font-bold">Back</span>
            <span className="w-[50px] text-center text-[10px] text-[#72BBEF] font-bold hidden md:block"></span>
            <span className="w-[50px] text-center text-[10px] text-[#72BBEF] font-bold hidden md:block"></span>
          </div>
          <div className="flex">
            <span className="w-[50px] text-center text-[10px] text-[#FAA9BA] font-bold">Lay</span>
            <span className="w-[50px] text-center text-[10px] text-[#FAA9BA] font-bold hidden md:block"></span>
            <span className="w-[50px] text-center text-[10px] text-[#FAA9BA] font-bold hidden md:block"></span>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
};

// ==================== COLUMN HEADERS ====================
const ColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[120px] p-2">
      <span className="text-[10px] md:text-xs text-gray-400">Selection</span>
    </div>
    <div className="flex">
      <div className="w-[50px] p-1 text-center bg-[#72BBEF]/20">
        <span className="text-[10px] font-bold text-[#72BBEF]">Back</span>
      </div>
      <div className="w-[50px] p-1 text-center bg-[#72BBEF]/10 hidden md:block">
        <span className="text-[10px] text-[#72BBEF]/70"></span>
      </div>
      <div className="w-[50px] p-1 text-center bg-[#72BBEF]/5 hidden md:block">
        <span className="text-[10px] text-[#72BBEF]/50"></span>
      </div>
    </div>
    <div className="flex">
      <div className="w-[50px] p-1 text-center bg-[#FAA9BA]/20">
        <span className="text-[10px] font-bold text-[#FAA9BA]">Lay</span>
      </div>
      <div className="w-[50px] p-1 text-center bg-[#FAA9BA]/10 hidden md:block">
        <span className="text-[10px] text-[#FAA9BA]/70"></span>
      </div>
      <div className="w-[50px] p-1 text-center bg-[#FAA9BA]/5 hidden md:block">
        <span className="text-[10px] text-[#FAA9BA]/50"></span>
      </div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function PlayXbetsExchange({ user, onShowAuth, onLogout }) {
  const location = useLocation();
  const [match, setMatch] = useState(createInitialMatch);
  const [odds, setOdds] = useState(createInitialOdds);
  const [betSlip, setBetSlip] = useState([]);
  const [balance, setBalance] = useState(0);
  const [ballTimer, setBallTimer] = useState(BALL_DURATION);
  const [isBettingOpen, setIsBettingOpen] = useState(true);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState({
    matchOdds: true,
    bookmaker: true,
    ballByBall: true,
    overMarkets: true,
    sessionMarkets: true,
  });
  const timerRef = useRef(null);

  // ==================== FETCH USER WALLET ====================
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

  // ==================== BALL TIMER LOGIC ====================
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setBallTimer((prev) => {
        if (prev <= 1) {
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

      if (outcome.id === "wicket") {
        newWickets = Math.min(newWickets + 1, 10);
        newLastWicket = { runs: newRuns, over: formatOvers(newBalls), batsman: `Player ${newWickets}` };
        newPartnership = { runs: 0, balls: 0 };
      } else {
        newPartnership.runs += outcome.runs;
        newPartnership.balls += 1;
      }

      const ballInOver = newBalls % 6;
      let newCurrentOver = [...prev.currentOver];
      
      if (ballInOver === 0) {
        newCurrentOver = [null, null, null, null, null, null];
      } else {
        newCurrentOver[ballInOver - 1] = outcome.id === "wicket" ? "W" : outcome.id === "wide" ? "WD" : outcome.runs;
      }

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

    // Update odds
    setOdds((prev) => ({
      team1: {
        back: prev.team1.back.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        lay: prev.team1.lay.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        backStakes: prev.team1.backStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
        layStakes: prev.team1.layStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
      },
      team2: {
        back: prev.team2.back.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        lay: prev.team2.lay.map((o) => +(o + (Math.random() - 0.5) * 0.03).toFixed(2)),
        backStakes: prev.team2.backStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
        layStakes: prev.team2.layStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
      },
    }));

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
    setMatch((prev) => ({ ...prev, format, maxOvers: format === "t20" ? 20 : 50 }));
  };

  // ==================== ADD TO BET SLIP ====================
  const addToBetSlip = (selection, type, selectedOdds, marketType = "match") => {
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
      toast.success(`Added: ${selection} @ ${selectedOdds}`);
      setShowBetSlip(true);
      return [...prev, { id: Date.now(), selection, type, odds: selectedOdds, stake: "", marketType, status: "pending" }];
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
    
    setBalance((prev) => prev - totalStake);
    toast.success(`Bet placed! Total: ₹${totalStake}`);
    setBetSlip([]);
    setShowBetSlip(false);
    if (user) fetchWallet();
  };

  // ==================== TOGGLE MARKET EXPANSION ====================
  const toggleMarket = (market) => {
    setExpandedMarkets((prev) => ({ ...prev, [market]: !prev[market] }));
  };

  // ==================== SESSION MARKETS DATA ====================
  const getSessionMarkets = () => {
    const isT20 = match.format === "t20";
    const currentOvers = Math.floor(match.score.balls / 6);
    const sessions = [];
    const sessionOvers = isT20 ? [6, 10, 15, 20] : [10, 20, 30, 40, 50];
    
    sessionOvers.forEach((ov) => {
      if (ov > currentOvers) {
        const baseRunRate = isT20 ? 8.0 : 5.5;
        const expectedRuns = Math.floor(ov * baseRunRate);
        sessions.push({
          name: ov === 6 && isT20 ? `Powerplay Runs` : `${ov} Over Runs`,
          line: expectedRuns + 0.5,
          yesOdds: +(1.85 + Math.random() * 0.1).toFixed(2),
          noOdds: +(1.90 + Math.random() * 0.1).toFixed(2),
          yesStake: Math.floor(500 + Math.random() * 1000),
          noStake: Math.floor(500 + Math.random() * 1000),
        });
      }
    });
    return sessions;
  };

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      {/* ==================== HEADER ==================== */}
      <header className="bg-[#161B22] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center justify-between px-2 md:px-4 py-2">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1 md:gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-lg md:text-xl font-bold">X</span>
            </div>
            <span className="text-base md:text-xl font-bold hidden sm:block">
              Play<span className="text-yellow-400">X</span>bets
            </span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-4">
            <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">Home</Link>
            <Link to="/exchange" className="text-sm text-cyan-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Cricket
            </Link>
            <Link to="/football-live" className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Soccer
            </Link>
          </nav>

          {/* Balance & User */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="bg-[#21262D] px-2 md:px-3 py-1.5 rounded-lg flex items-center gap-1">
              <span className="text-[10px] md:text-xs text-gray-400">Bal:</span>
              <span className="text-xs md:text-sm font-bold text-green-400">₹{balance.toFixed(0)}</span>
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-xs md:text-sm font-bold">{user.username?.charAt(0).toUpperCase()}</span>
                </div>
                <button onClick={onLogout} className="text-xs text-gray-400 hover:text-red-400 hidden md:block">Logout</button>
              </div>
            ) : (
              <button
                onClick={() => onShowAuth && onShowAuth("login")}
                className="bg-cyan-500 hover:bg-cyan-600 text-white text-xs md:text-sm font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ==================== MATCH INFO BAR ==================== */}
      <div className="bg-gradient-to-r from-[#1a2332] to-[#1E2736] border-b border-gray-800">
        <div className="px-2 md:px-4 py-2 md:py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            {/* Match Title */}
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] md:text-xs text-red-400 font-semibold">LIVE</span>
              <span className="text-xs md:text-sm font-bold text-white">{match.team1} vs {match.team2}</span>
              
              {/* Format Toggle */}
              <div className="flex bg-[#0D1117] rounded p-0.5 ml-2">
                <button
                  onClick={() => toggleFormat("t20")}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    match.format === "t20" ? "bg-cyan-500 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  T20
                </button>
                <button
                  onClick={() => toggleFormat("odi")}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                    match.format === "odi" ? "bg-cyan-500 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  ODI
                </button>
              </div>
            </div>

            {/* Score & Stats */}
            <div className="flex items-center gap-3 md:gap-6">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold text-cyan-400">
                  {match.score.runs}/{match.score.wickets}
                </div>
                <div className="text-[10px] md:text-xs text-gray-400">({formatOvers(match.score.balls)} ov)</div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="text-[10px] text-gray-400">CRR</div>
                <div className="text-sm font-bold">{match.crr}</div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="text-[10px] text-gray-400">Partnership</div>
                <div className="text-sm font-bold">{match.partnership.runs}({match.partnership.balls})</div>
              </div>
              
              {/* This Over */}
              <div className="flex items-center gap-1">
                {match.currentOver.map((ball, idx) => (
                  <div
                    key={idx}
                    className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold ${
                      ball === null ? "bg-gray-700/50 text-gray-600" :
                      ball === 4 || ball === 6 ? "bg-green-500 text-white" :
                      ball === "W" ? "bg-red-500 text-white" :
                      ball === "WD" ? "bg-yellow-500 text-black" :
                      ball === 0 ? "bg-gray-600 text-white" : "bg-blue-500 text-white"
                    }`}
                  >
                    {ball === null ? "." : ball}
                  </div>
                ))}
              </div>
              
              {/* Ball Timer */}
              <div className="text-center">
                <div className={`text-lg md:text-xl font-bold ${ballTimer <= 3 ? "text-red-500 animate-pulse" : "text-cyan-400"}`}>
                  {ballTimer}s
                </div>
                <div className={`text-[8px] md:text-[10px] px-1.5 py-0.5 rounded ${
                  isBettingOpen ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                }`}>
                  {isBettingOpen ? "OPEN" : "CLOSED"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="flex flex-col lg:flex-row">
        {/* ==================== LEFT - MARKETS ==================== */}
        <div className="flex-1 p-2 md:p-4 space-y-2 md:space-y-3 pb-20 lg:pb-4">
          
          {/* ========== MATCH ODDS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="match-odds-market">
            <MarketHeader 
              title="Match Odds" 
              isExpanded={expandedMarkets.matchOdds}
              onToggle={() => toggleMarket('matchOdds')}
              showTV={true}
            />
            {expandedMarkets.matchOdds && (
              <div className="overflow-x-auto">
                <ColumnHeaders />
                <MarketRow
                  name={match.team1}
                  backOdds={odds.team1.back}
                  layOdds={odds.team1.lay}
                  backStakes={odds.team1.backStakes}
                  layStakes={odds.team1.layStakes}
                  onSelectOdds={addToBetSlip}
                />
                <MarketRow
                  name={match.team2}
                  backOdds={odds.team2.back}
                  layOdds={odds.team2.lay}
                  backStakes={odds.team2.backStakes}
                  layStakes={odds.team2.layStakes}
                  onSelectOdds={addToBetSlip}
                  highlight
                />
              </div>
            )}
          </div>

          {/* ========== BOOKMAKER ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="bookmaker-market">
            <MarketHeader 
              title="Bookmaker" 
              isExpanded={expandedMarkets.bookmaker}
              onToggle={() => toggleMarket('bookmaker')}
            />
            {expandedMarkets.bookmaker && (
              <div className="overflow-x-auto">
                <ColumnHeaders />
                <MarketRow
                  name={match.team1}
                  backOdds={[+(odds.team1.back[0] - 0.02).toFixed(2), +(odds.team1.back[1] - 0.02).toFixed(2), +(odds.team1.back[2] - 0.02).toFixed(2)]}
                  layOdds={[+(odds.team1.lay[0] + 0.02).toFixed(2), +(odds.team1.lay[1] + 0.02).toFixed(2), +(odds.team1.lay[2] + 0.02).toFixed(2)]}
                  backStakes={[2500, 1800, 900]}
                  layStakes={[2200, 1500, 800]}
                  onSelectOdds={(name, type, odds) => addToBetSlip(`${name} (BM)`, type, odds)}
                />
                <MarketRow
                  name={match.team2}
                  backOdds={[+(odds.team2.back[0] - 0.02).toFixed(2), +(odds.team2.back[1] - 0.02).toFixed(2), +(odds.team2.back[2] - 0.02).toFixed(2)]}
                  layOdds={[+(odds.team2.lay[0] + 0.02).toFixed(2), +(odds.team2.lay[1] + 0.02).toFixed(2), +(odds.team2.lay[2] + 0.02).toFixed(2)]}
                  backStakes={[1800, 1200, 600]}
                  layStakes={[1600, 1000, 500]}
                  onSelectOdds={(name, type, odds) => addToBetSlip(`${name} (BM)`, type, odds)}
                  highlight
                />
              </div>
            )}
          </div>

          {/* ========== BALL BY BALL ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="ball-by-ball-market">
            <MarketHeader 
              title={`Next Ball (${isBettingOpen ? `${ballTimer}s` : 'CLOSED'})`}
              isExpanded={expandedMarkets.ballByBall}
              onToggle={() => toggleMarket('ballByBall')}
            />
            {expandedMarkets.ballByBall && (
              <div className="p-2 md:p-3">
                <div className="grid grid-cols-4 md:grid-cols-8 gap-1 md:gap-2">
                  {BALL_OUTCOMES.map((outcome) => (
                    <button
                      key={outcome.id}
                      onClick={() => addToBetSlip(outcome.name, "Back", outcome.odds, "ball")}
                      disabled={!isBettingOpen}
                      className={`p-2 md:p-3 rounded-lg border transition-all ${
                        !isBettingOpen 
                          ? "opacity-50 cursor-not-allowed bg-gray-800 border-gray-700" 
                          : "bg-[#21262D] border-gray-700 hover:border-cyan-500/50 hover:bg-[#2a3441] active:scale-95"
                      }`}
                      data-testid={`ball-outcome-${outcome.id}`}
                    >
                      <div className={`text-lg md:text-xl font-bold ${outcome.id === 'wicket' ? 'text-red-400' : outcome.id === '4' || outcome.id === '6' ? 'text-green-400' : 'text-white'}`}>
                        {outcome.short}
                      </div>
                      <div className="text-[8px] md:text-[10px] text-gray-400 truncate">{outcome.name}</div>
                      <div className="text-xs md:text-sm font-bold text-cyan-400 mt-1">{outcome.odds.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ========== SESSION MARKETS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="session-markets">
            <MarketHeader 
              title={`Session Markets (${match.format.toUpperCase()})`}
              isExpanded={expandedMarkets.sessionMarkets}
              onToggle={() => toggleMarket('sessionMarkets')}
            />
            {expandedMarkets.sessionMarkets && (
              <div className="overflow-x-auto">
                <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
                  <div className="flex-1 min-w-[140px] p-2">
                    <span className="text-[10px] md:text-xs text-gray-400">Session</span>
                  </div>
                  <div className="flex">
                    <div className="w-[60px] p-1 text-center bg-[#FAA9BA]/20">
                      <span className="text-[10px] font-bold text-[#FAA9BA]">No</span>
                    </div>
                    <div className="w-[60px] p-1 text-center bg-[#72BBEF]/20">
                      <span className="text-[10px] font-bold text-[#72BBEF]">Yes</span>
                    </div>
                  </div>
                </div>
                {getSessionMarkets().map((session, idx) => (
                  <div key={idx} className={`flex items-stretch border-b border-gray-700/50 ${idx % 2 === 0 ? 'bg-[#1E2736]' : 'bg-[#1a2a3a]'}`}>
                    <div className="flex-1 min-w-[140px] p-2 md:p-3 flex flex-col justify-center">
                      <span className="text-xs md:text-sm text-white font-medium">{session.name}</span>
                      <span className="text-[10px] text-gray-400">Line: {session.line}</span>
                    </div>
                    <div className="flex">
                      <button
                        onClick={() => addToBetSlip(`${session.name} Under ${session.line}`, "No", session.noOdds)}
                        className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#FAA9BA] hover:bg-[#E8899A] transition-colors"
                      >
                        <span className="text-sm font-bold text-gray-900">{session.noOdds.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-700">{session.noStake}</span>
                      </button>
                      <button
                        onClick={() => addToBetSlip(`${session.name} Over ${session.line}`, "Yes", session.yesOdds)}
                        className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#72BBEF] hover:bg-[#5BA8DC] transition-colors"
                      >
                        <span className="text-sm font-bold text-gray-900">{session.yesOdds.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-700">{session.yesStake}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ========== EXTRA MARKETS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800">
            <MarketHeader 
              title="Fall of Wicket / Partnership"
              isExpanded={expandedMarkets.overMarkets}
              onToggle={() => toggleMarket('overMarkets')}
            />
            {expandedMarkets.overMarkets && (
              <div className="overflow-x-auto">
                <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
                  <div className="flex-1 min-w-[140px] p-2">
                    <span className="text-[10px] md:text-xs text-gray-400">Market</span>
                  </div>
                  <div className="flex">
                    <div className="w-[60px] p-1 text-center bg-[#FAA9BA]/20">
                      <span className="text-[10px] font-bold text-[#FAA9BA]">No</span>
                    </div>
                    <div className="w-[60px] p-1 text-center bg-[#72BBEF]/20">
                      <span className="text-[10px] font-bold text-[#72BBEF]">Yes</span>
                    </div>
                  </div>
                </div>
                {/* Fall of Wicket */}
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
                  <div className="flex-1 min-w-[140px] p-2 md:p-3 flex flex-col justify-center">
                    <span className="text-xs md:text-sm text-white font-medium">Next Wicket Runs</span>
                    <span className="text-[10px] text-gray-400">Last: {match.lastWicket.runs} ({match.lastWicket.over})</span>
                  </div>
                  <div className="flex">
                    <button
                      onClick={() => addToBetSlip("Next Wicket Under 65", "No", 1.90)}
                      className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#FAA9BA] hover:bg-[#E8899A] transition-colors"
                    >
                      <span className="text-sm font-bold text-gray-900">1.90</span>
                      <span className="text-[10px] text-gray-700">650</span>
                    </button>
                    <button
                      onClick={() => addToBetSlip("Next Wicket Over 65", "Yes", 1.90)}
                      className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#72BBEF] hover:bg-[#5BA8DC] transition-colors"
                    >
                      <span className="text-sm font-bold text-gray-900">1.90</span>
                      <span className="text-[10px] text-gray-700">580</span>
                    </button>
                  </div>
                </div>
                {/* Partnership */}
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1a2a3a]">
                  <div className="flex-1 min-w-[140px] p-2 md:p-3 flex flex-col justify-center">
                    <span className="text-xs md:text-sm text-white font-medium">Partnership Runs</span>
                    <span className="text-[10px] text-gray-400">Current: {match.partnership.runs} ({match.partnership.balls}b)</span>
                  </div>
                  <div className="flex">
                    <button
                      onClick={() => addToBetSlip("Partnership Under 40", "No", 1.95)}
                      className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#FAA9BA] hover:bg-[#E8899A] transition-colors"
                    >
                      <span className="text-sm font-bold text-gray-900">1.95</span>
                      <span className="text-[10px] text-gray-700">720</span>
                    </button>
                    <button
                      onClick={() => addToBetSlip("Partnership Over 40", "Yes", 1.85)}
                      className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#72BBEF] hover:bg-[#5BA8DC] transition-colors"
                    >
                      <span className="text-sm font-bold text-gray-900">1.85</span>
                      <span className="text-[10px] text-gray-700">680</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== RIGHT - BET SLIP (Desktop) ==================== */}
        <div className="hidden lg:block w-[320px] p-4">
          <div className="bg-[#161B22] rounded-lg border border-gray-800 sticky top-20">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#21262D] rounded-t-lg">
              <h2 className="text-sm font-bold">Bet Slip</h2>
              <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-0.5 rounded">{betSlip.length}</span>
            </div>

            <div className="p-3 max-h-[400px] overflow-y-auto">
              {betSlip.length === 0 ? (
                <div className="text-center text-gray-500 py-6">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Click odds to add selections</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {betSlip.map((bet) => (
                    <div key={bet.id} className="bg-[#21262D] rounded-lg p-2 border border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-xs font-medium text-white">{bet.selection}</div>
                          <div className={`text-[10px] ${bet.type === "Back" || bet.type === "Yes" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>
                            {bet.type} @ {bet.odds.toFixed(2)}
                          </div>
                        </div>
                        <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400 text-lg leading-none">×</button>
                      </div>
                      <input
                        type="number"
                        placeholder="Stake ₹"
                        value={bet.stake}
                        onChange={(e) => updateStake(bet.id, e.target.value)}
                        className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-xs focus:border-cyan-500 focus:outline-none"
                      />
                      {bet.stake && (
                        <div className="mt-1 text-right">
                          <span className="text-gray-400 text-[10px]">Profit: </span>
                          <span className="text-green-400 text-xs font-bold">₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {betSlip.length > 0 && (
              <div className="p-3 border-t border-gray-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Total Stake:</span>
                  <span className="font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Potential Profit:</span>
                  <span className="text-green-400 font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0).toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={clearBetSlip} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">
                    Clear
                  </button>
                  <button 
                    onClick={placeBet} 
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold py-2 rounded-lg transition-all"
                    data-testid="place-bet-btn"
                  >
                    Place Bet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#161B22] border-t border-gray-800 z-50">
        <div className="flex justify-around py-2">
          <Link to="/" className="flex flex-col items-center px-3 py-1 text-gray-400">
            <Menu className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </Link>
          <Link to="/exchange" className="flex flex-col items-center px-3 py-1 text-cyan-400">
            <Tv className="w-5 h-5" />
            <span className="text-[10px]">Cricket</span>
          </Link>
          <button
            onClick={() => setShowBetSlip(true)}
            className="flex flex-col items-center px-3 py-1 text-yellow-400 relative"
            data-testid="mobile-betslip-btn"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-[10px]">Bet Slip</span>
            {betSlip.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {betSlip.length}
              </span>
            )}
          </button>
          <Link to="/football-live" className="flex flex-col items-center px-3 py-1 text-gray-400">
            <Clock className="w-5 h-5" />
            <span className="text-[10px]">Soccer</span>
          </Link>
        </div>
      </div>

      {/* ==================== MOBILE BET SLIP MODAL ==================== */}
      {showBetSlip && (
        <div className="lg:hidden fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="w-full bg-[#161B22] rounded-t-2xl max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#21262D]">
              <h2 className="text-sm font-bold">Bet Slip ({betSlip.length})</h2>
              <button onClick={() => setShowBetSlip(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 max-h-[50vh] overflow-y-auto">
              {betSlip.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Click odds to add selections</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {betSlip.map((bet) => (
                    <div key={bet.id} className="bg-[#21262D] rounded-lg p-3 border border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="text-sm font-medium text-white">{bet.selection}</div>
                          <div className={`text-xs ${bet.type === "Back" || bet.type === "Yes" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>
                            {bet.type} @ {bet.odds.toFixed(2)}
                          </div>
                        </div>
                        <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400 text-xl">×</button>
                      </div>
                      <input
                        type="number"
                        placeholder="Stake ₹"
                        value={bet.stake}
                        onChange={(e) => updateStake(bet.id, e.target.value)}
                        className="w-full bg-[#0D1117] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none"
                      />
                      {bet.stake && (
                        <div className="mt-2 text-right">
                          <span className="text-gray-400 text-xs">Profit: </span>
                          <span className="text-green-400 font-bold">₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {betSlip.length > 0 && (
              <div className="p-3 border-t border-gray-800 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Total Stake:</span>
                  <span className="font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Potential Profit:</span>
                  <span className="text-green-400 font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0).toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={clearBetSlip} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg">
                    Clear
                  </button>
                  <button 
                    onClick={placeBet} 
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-lg"
                    data-testid="mobile-place-bet-btn"
                  >
                    Place Bet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
