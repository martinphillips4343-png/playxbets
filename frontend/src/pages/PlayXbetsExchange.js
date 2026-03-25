import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/App";
import { ChevronDown, ChevronUp, Clock, Tv, BarChart3, Menu, X, DollarSign } from "lucide-react";

// ==================== CONSTANTS ====================
const BALL_DURATION = 11;
const SUSPEND_DURATION = 3000; // 3 seconds suspension after ball/wicket/boundary

const BALL_OUTCOMES = [
  { id: "dot", runs: 0 },
  { id: "1", runs: 1 },
  { id: "2", runs: 2 },
  { id: "3", runs: 3 },
  { id: "4", runs: 4 },
  { id: "6", runs: 6 },
  { id: "wicket", runs: 0 },
  { id: "wide", runs: 1 },
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

const randomOddsVariation = (base, range = 0.05) => +(base + (Math.random() - 0.5) * range * 2).toFixed(2);

// ==================== INITIAL STATE ====================
const createInitialMatch = () => ({
  team1: "RC Bengaluru",
  team2: "Sunrisers Hyderabad",
  team1Short: "RCB",
  team2Short: "SRH",
  battingTeam: "RC Bengaluru",
  score: { runs: 51, wickets: 2, balls: 34 },
  crr: 9.0,
  currentOver: [1, 0, 4, 0, 2, null],
  format: "t20",
  maxOvers: 20,
  partnership: { runs: 28, balls: 22 },
  lastWicket: { runs: 23, over: "3.4", batsman: "V Kohli" },
  batsman1: { name: "F du Plessis", runs: 34, balls: 22 },
  batsman2: { name: "G Maxwell", runs: 17, balls: 12 },
  fallOfWickets: [{ runs: 23, over: "3.4", wicket: 1 }, { runs: 45, over: "5.1", wicket: 2 }],
});

const createInitialOdds = () => ({
  team1: { back: [84, 85, 86], lay: [88, 89, 90], backStakes: [50000, 35000, 20000], layStakes: [50000, 30000, 15000] },
  team2: { back: [113, 115, 117], lay: [119, 121, 123], backStakes: [10000, 8000, 5000], layStakes: [10000, 7000, 4000] },
});

// ==================== ODDS CELL COMPONENT (BACK) ====================
const BackOddsCell = ({ odds, stake, onClick, suspended = false, showStake = true }) => {
  if (suspended) {
    return (
      <div className="flex flex-col items-center justify-center p-1 min-w-[55px] bg-[#72BBEF]/30 text-gray-400">
        <span className="text-sm font-bold">-</span>
        {showStake && <span className="text-[9px]">-</span>}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-1 min-w-[55px] bg-[#72BBEF] hover:bg-[#5BA8DC] transition-colors cursor-pointer active:scale-95"
    >
      <span className="text-sm font-bold text-gray-900">{typeof odds === 'number' ? odds.toFixed(2) : odds}</span>
      {showStake && <span className="text-[9px] text-gray-700">{stake?.toLocaleString() || ''}</span>}
    </button>
  );
};

// ==================== ODDS CELL COMPONENT (LAY) ====================
const LayOddsCell = ({ odds, stake, onClick, suspended = false, showStake = true }) => {
  if (suspended) {
    return (
      <div className="flex flex-col items-center justify-center p-1 min-w-[55px] bg-[#FAA9BA]/30 text-gray-400">
        <span className="text-sm font-bold">-</span>
        {showStake && <span className="text-[9px]">-</span>}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center p-1 min-w-[55px] bg-[#FAA9BA] hover:bg-[#E8899A] transition-colors cursor-pointer active:scale-95"
    >
      <span className="text-sm font-bold text-gray-900">{typeof odds === 'number' ? odds.toFixed(2) : odds}</span>
      {showStake && <span className="text-[9px] text-gray-700">{stake?.toLocaleString() || ''}</span>}
    </button>
  );
};

// ==================== SESSION ROW COMPONENT (NO/YES) ====================
const SessionRow = ({ name, noValue, yesValue, noStake, yesStake, onSelect, suspended = false, highlight = false }) => {
  return (
    <div className={`flex items-stretch border-b border-gray-700/50 ${highlight ? 'bg-[#1a2a3a]' : 'bg-[#1E2736]'}`}>
      <div className="flex-1 min-w-[200px] p-2 md:p-3 flex items-center">
        <span className="text-xs md:text-sm text-white font-medium">{name}</span>
      </div>
      <div className="flex">
        <button
          onClick={() => !suspended && onSelect(name, "No", noValue)}
          disabled={suspended}
          className={`flex flex-col items-center justify-center p-1 w-[70px] ${suspended ? 'bg-[#FAA9BA]/30 text-gray-400' : 'bg-[#FAA9BA] hover:bg-[#E8899A]'} transition-colors`}
        >
          <span className="text-sm font-bold text-gray-900">{noValue}</span>
          <span className="text-[9px] text-gray-700">{noStake}</span>
        </button>
        <button
          onClick={() => !suspended && onSelect(name, "Yes", yesValue)}
          disabled={suspended}
          className={`flex flex-col items-center justify-center p-1 w-[70px] ${suspended ? 'bg-[#72BBEF]/30 text-gray-400' : 'bg-[#72BBEF] hover:bg-[#5BA8DC]'} transition-colors`}
        >
          <span className="text-sm font-bold text-gray-900">{yesValue}</span>
          <span className="text-[9px] text-gray-700">{yesStake}</span>
        </button>
      </div>
    </div>
  );
};

// ==================== MARKET HEADER WITH CASHOUT ====================
const MarketHeader = ({ title, isExpanded, onToggle, maxBet, showCashout = true }) => {
  return (
    <div className="flex items-center justify-between bg-[#2C3E50] p-2 cursor-pointer" onClick={onToggle}>
      <div className="flex items-center gap-2">
        <span className="text-xs md:text-sm font-bold text-white uppercase">{title}</span>
        {maxBet && <span className="text-[10px] text-cyan-400">Max: {maxBet}</span>}
      </div>
      <div className="flex items-center gap-2">
        {showCashout && (
          <button
            onClick={(e) => { e.stopPropagation(); toast.info("Cashout feature coming soon!"); }}
            className="px-2 py-1 bg-teal-600 hover:bg-teal-500 text-white text-[10px] font-bold rounded transition-colors"
          >
            Cashout
          </button>
        )}
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
};

// ==================== COLUMN HEADERS (BACK/LAY 3-COLUMN) ====================
const ColumnHeaders3 = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[120px] p-2">
      <span className="text-[10px] text-gray-400"></span>
    </div>
    <div className="flex">
      <div className="w-[55px] p-1 text-center"><span className="text-[10px] font-bold text-[#72BBEF]">Back</span></div>
      <div className="w-[55px] p-1 text-center hidden md:block"></div>
      <div className="w-[55px] p-1 text-center hidden md:block"></div>
    </div>
    <div className="flex">
      <div className="w-[55px] p-1 text-center"><span className="text-[10px] font-bold text-[#FAA9BA]">Lay</span></div>
      <div className="w-[55px] p-1 text-center hidden md:block"></div>
      <div className="w-[55px] p-1 text-center hidden md:block"></div>
    </div>
  </div>
);

// ==================== SESSION COLUMN HEADERS (NO/YES) ====================
const SessionColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[200px] p-2">
      <span className="text-[10px] text-cyan-400 font-semibold">Normal</span>
    </div>
    <div className="flex">
      <div className="w-[70px] p-1 text-center bg-[#FAA9BA]/20"><span className="text-[10px] font-bold text-[#FAA9BA]">No</span></div>
      <div className="w-[70px] p-1 text-center bg-[#72BBEF]/20"><span className="text-[10px] font-bold text-[#72BBEF]">Yes</span></div>
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
  const [isSuspended, setIsSuspended] = useState(false);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState({
    matchOdds: true,
    bookmaker: true,
    sessionMarkets: true,
    overRuns: true,
    fallOfWickets: true,
    nextOver: true,
    teamTotal: true,
    partnership: true,
    specialMarkets: true,
  });
  const timerRef = useRef(null);

  // ==================== FETCH USER WALLET ====================
  useEffect(() => {
    if (user) fetchWallet();
    else setBalance(1500);
  }, [user]);

  const fetchWallet = async () => {
    try {
      const response = await api.get("/wallet");
      setBalance(response.data.balance || 0);
    } catch (error) {
      setBalance(1500);
    }
  };

  // ==================== BALL TIMER & AUTO-SUSPEND LOGIC ====================
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setBallTimer((prev) => {
        if (prev <= 1) {
          // Ball is being bowled - SUSPEND ALL MARKETS
          setIsBettingOpen(false);
          setIsSuspended(true);
          
          setTimeout(() => {
            const outcome = generateNewBall();
            
            // Check if boundary or wicket - extend suspension
            const isBoundaryOrWicket = outcome.runs >= 4 || outcome.id === 'wicket';
            
            setTimeout(() => {
              setBallTimer(BALL_DURATION);
              setIsBettingOpen(true);
              setIsSuspended(false);
            }, isBoundaryOrWicket ? SUSPEND_DURATION : 1500);
            
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
      let newFallOfWickets = [...prev.fallOfWickets];

      if (outcome.id === "wicket") {
        newWickets = Math.min(newWickets + 1, 10);
        newLastWicket = { runs: newRuns, over: formatOvers(newBalls), batsman: `Batsman ${newWickets}` };
        newFallOfWickets.push({ runs: newRuns, over: formatOvers(newBalls), wicket: newWickets });
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
        fallOfWickets: newFallOfWickets,
      };
    });

    // Update odds based on match situation
    setOdds((prev) => {
      const runsEffect = outcome.runs >= 4 ? 5 : outcome.runs;
      const wicketEffect = outcome.id === 'wicket' ? -10 : 0;
      
      return {
        team1: {
          back: prev.team1.back.map((o) => Math.max(1, o + runsEffect + wicketEffect + Math.floor((Math.random() - 0.5) * 3))),
          lay: prev.team1.lay.map((o) => Math.max(1, o + runsEffect + wicketEffect + Math.floor((Math.random() - 0.5) * 3))),
          backStakes: prev.team1.backStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
          layStakes: prev.team1.layStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
        },
        team2: {
          back: prev.team2.back.map((o) => Math.max(1, o - runsEffect - wicketEffect + Math.floor((Math.random() - 0.5) * 3))),
          lay: prev.team2.lay.map((o) => Math.max(1, o - runsEffect - wicketEffect + Math.floor((Math.random() - 0.5) * 3))),
          backStakes: prev.team2.backStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
          layStakes: prev.team2.layStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
        },
      };
    });
    
    return outcome;
  }, []);

  // ==================== ADD TO BET SLIP ====================
  const addToBetSlip = (selection, type, selectedOdds, marketType = "match") => {
    if (isSuspended && marketType !== "match") {
      toast.error("Market suspended!");
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
  const updateStake = (id, stake) => setBetSlip((prev) => prev.map((b) => (b.id === id ? { ...b, stake } : b)));
  const removeFromBetSlip = (id) => setBetSlip((prev) => prev.filter((b) => b.id !== id));
  const clearBetSlip = () => { setBetSlip([]); toast.info("Bet slip cleared"); };

  const placeBet = async () => {
    if (!user) { onShowAuth && onShowAuth("login"); toast.error("Please login to place bets"); return; }
    const totalStake = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
    if (totalStake <= 0) { toast.error("Enter stake amount"); return; }
    if (totalStake > balance) { toast.error("Insufficient balance"); return; }
    
    let successCount = 0;
    for (const bet of betSlip) {
      const stake = parseFloat(bet.stake) || 0;
      if (stake <= 0) continue;
      try {
        await api.post("/bets", {
          match_id: "cricket-demo-match",
          selected_team: bet.selection,
          odds: bet.odds,
          stake: stake,
          bet_type: bet.type.toLowerCase(),
          market_type: bet.marketType || "match"
        });
        successCount++;
      } catch (error) {
        if (error.response?.data?.detail) toast.error(error.response.data.detail);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} bet(s) placed!`);
      setBetSlip([]);
      setShowBetSlip(false);
      fetchWallet();
    }
  };

  const toggleMarket = (market) => setExpandedMarkets((prev) => ({ ...prev, [market]: !prev[market] }));

  // ==================== DYNAMIC MARKET DATA ====================
  const currentOvers = Math.floor(match.score.balls / 6);
  const getSessionMarkets = () => {
    const sessions = [];
    const overTargets = [6, 10, 15, 20];
    
    overTargets.forEach((ov) => {
      if (ov > currentOvers) {
        const baseRuns = Math.floor(ov * 8.5);
        // Team 1
        sessions.push({
          name: `${ov} over runs ${match.team1Short}(${match.team1Short} vs ${match.team2Short})adv`,
          noValue: baseRuns - 2,
          yesValue: baseRuns,
          noStake: 100,
          yesStake: 100,
        });
        // Team 2
        sessions.push({
          name: `${ov} over runs ${match.team2Short}(${match.team1Short} vs ${match.team2Short})adv`,
          noValue: baseRuns - 4,
          yesValue: baseRuns - 2,
          noStake: 100,
          yesStake: 100,
        });
      }
    });
    return sessions;
  };

  const getOverRunMarkets = () => [
    { name: `Match 1st over run ${match.team1Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 7, yesValue: 7, noStake: 110, yesStake: 90 },
    { name: `Match 1st over run ${match.team2Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 8, yesValue: 8, noStake: 110, yesStake: 90 },
    { name: `Powerplay runs ${match.team1Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 48, yesValue: 50, noStake: 100, yesStake: 100 },
    { name: `Powerplay runs ${match.team2Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 46, yesValue: 48, noStake: 100, yesStake: 100 },
  ];

  const getFallOfWicketMarkets = () => [
    { name: `Fall of 1st wkt ${match.team1Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 30, yesValue: 30, noStake: 120, yesStake: 90 },
    { name: `Fall of 1st wkt ${match.team2Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 26, yesValue: 26, noStake: 120, yesStake: 90 },
    { name: `Fall of 1st wkt run bhav ${match.team1Short} 2 adv`, noValue: 1, yesValue: 1, noStake: 5, yesStake: 2 },
    { name: `Fall of 1st wkt run bhav ${match.team2Short} 2 adv`, noValue: 1, yesValue: 1, noStake: 6, yesStake: 3 },
    { name: `1st 2 wkt Runs ${match.team1Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 63, yesValue: 63, noStake: 120, yesStake: 90 },
    { name: `1st 2 wkt Runs ${match.team2Short}(${match.team1Short} vs ${match.team2Short})adv`, noValue: 58, yesValue: 58, noStake: 120, yesStake: 90 },
  ];

  const getTeamTotalMarkets = () => [
    { name: `${match.team1} Total Over 160.5`, noValue: 1.85, yesValue: 1.95, noStake: 500, yesStake: 450, isOdds: true },
    { name: `${match.team1} Total Under 160.5`, noValue: 1.95, yesValue: 1.85, noStake: 450, yesStake: 500, isOdds: true },
    { name: `${match.team2} Total Over 155.5`, noValue: 1.90, yesValue: 1.90, noStake: 480, yesStake: 480, isOdds: true },
    { name: `${match.team2} Total Under 155.5`, noValue: 1.90, yesValue: 1.90, noStake: 480, yesStake: 480, isOdds: true },
  ];

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      {/* ==================== HEADER ==================== */}
      <header className="bg-[#161B22] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center justify-between px-2 md:px-4 py-2">
          <Link to="/" className="flex items-center gap-1 md:gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-lg md:text-xl font-bold">X</span>
            </div>
            <span className="text-base md:text-xl font-bold hidden sm:block">Play<span className="text-yellow-400">X</span>bets</span>
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            <Link to="/" className="text-sm text-gray-400 hover:text-white">Home</Link>
            <Link to="/exchange" className="text-sm text-cyan-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>Cricket
            </Link>
            <Link to="/football-live" className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>Soccer
            </Link>
          </nav>
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
              <button onClick={() => onShowAuth && onShowAuth("login")} className="bg-cyan-500 hover:bg-cyan-600 text-white text-xs md:text-sm font-bold px-3 py-1.5 rounded-lg">Login</button>
            )}
          </div>
        </div>
      </header>

      {/* ==================== MATCH INFO BAR ==================== */}
      <div className="bg-gradient-to-r from-[#1a2332] to-[#1E2736] border-b border-gray-800">
        <div className="px-2 md:px-4 py-2 md:py-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] md:text-xs text-red-400 font-semibold">LIVE</span>
              <span className="text-xs md:text-sm font-bold text-white">{match.team1} vs {match.team2}</span>
            </div>
            <div className="flex items-center gap-3 md:gap-6">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold text-cyan-400">{match.score.runs}/{match.score.wickets}</div>
                <div className="text-[10px] md:text-xs text-gray-400">({formatOvers(match.score.balls)} ov)</div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="text-[10px] text-gray-400">CRR</div>
                <div className="text-sm font-bold">{match.crr}</div>
              </div>
              <div className="flex items-center gap-1">
                {match.currentOver.map((ball, idx) => (
                  <div key={idx} className={`w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold ${
                    ball === null ? "bg-gray-700/50 text-gray-600" :
                    ball === 4 || ball === 6 ? "bg-green-500 text-white" :
                    ball === "W" ? "bg-red-500 text-white" :
                    ball === "WD" ? "bg-yellow-500 text-black" :
                    ball === 0 ? "bg-gray-600 text-white" : "bg-blue-500 text-white"
                  }`}>{ball === null ? "." : ball}</div>
                ))}
              </div>
              <div className="text-center">
                <div className={`text-lg md:text-xl font-bold ${ballTimer <= 3 ? "text-red-500 animate-pulse" : "text-cyan-400"}`}>{ballTimer}s</div>
                <div className={`text-[8px] md:text-[10px] px-1.5 py-0.5 rounded ${isSuspended ? "bg-red-500/20 text-red-400" : isBettingOpen ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                  {isSuspended ? "SUSPENDED" : isBettingOpen ? "OPEN" : "CLOSED"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT ==================== */}
      <div className="flex flex-col lg:flex-row">
        <div className="flex-1 p-2 md:p-4 space-y-2 md:space-y-3 pb-20 lg:pb-4 overflow-x-auto">
          
          {/* ========== 1. MATCH ODDS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="match-odds-market">
            <MarketHeader title="MATCH_ODDS" isExpanded={expandedMarkets.matchOdds} onToggle={() => toggleMarket('matchOdds')} maxBet="50K" />
            {expandedMarkets.matchOdds && (
              <div className="overflow-x-auto">
                <ColumnHeaders3 />
                {/* Team 1 */}
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
                  <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center">
                    <span className="text-xs md:text-sm text-white font-medium">{match.team1}</span>
                  </div>
                  <div className="flex">
                    {odds.team1.back.map((o, i) => <BackOddsCell key={i} odds={o} stake={odds.team1.backStakes[i]} onClick={() => addToBetSlip(match.team1, "Back", o)} suspended={isSuspended} />)}
                  </div>
                  <div className="flex">
                    {odds.team1.lay.map((o, i) => <LayOddsCell key={i} odds={o} stake={odds.team1.layStakes[i]} onClick={() => addToBetSlip(match.team1, "Lay", o)} suspended={isSuspended} />)}
                  </div>
                </div>
                {/* Team 2 */}
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1a2a3a]">
                  <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center">
                    <span className="text-xs md:text-sm text-white font-medium">{match.team2}</span>
                  </div>
                  <div className="flex">
                    {odds.team2.back.map((o, i) => <BackOddsCell key={i} odds={o} stake={odds.team2.backStakes[i]} onClick={() => addToBetSlip(match.team2, "Back", o)} suspended={isSuspended} />)}
                  </div>
                  <div className="flex">
                    {odds.team2.lay.map((o, i) => <LayOddsCell key={i} odds={o} stake={odds.team2.layStakes[i]} onClick={() => addToBetSlip(match.team2, "Lay", o)} suspended={isSuspended} />)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========== 2. BOOKMAKER ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="bookmaker-market">
            <MarketHeader title="Bookmaker" isExpanded={expandedMarkets.bookmaker} onToggle={() => toggleMarket('bookmaker')} maxBet="5L" />
            {expandedMarkets.bookmaker && (
              <div className="overflow-x-auto">
                <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
                  <div className="flex-1 min-w-[120px] p-2"><span className="text-[10px] text-cyan-400">Min: 100 Max: 5L</span></div>
                  <div className="w-[70px] p-1 text-center"><span className="text-[10px] font-bold text-[#72BBEF]">Back</span></div>
                  <div className="w-[70px] p-1 text-center"><span className="text-[10px] font-bold text-[#FAA9BA]">Lay</span></div>
                </div>
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
                  <div className="flex-1 min-w-[120px] p-2 md:p-3"><span className="text-xs md:text-sm text-white font-medium">{match.team1}</span></div>
                  <BackOddsCell odds={odds.team1.back[0]} stake={500000} onClick={() => addToBetSlip(`${match.team1} (BM)`, "Back", odds.team1.back[0])} suspended={isSuspended} />
                  <LayOddsCell odds={odds.team1.lay[0]} stake={500000} onClick={() => addToBetSlip(`${match.team1} (BM)`, "Lay", odds.team1.lay[0])} suspended={isSuspended} />
                </div>
                <div className="flex items-stretch border-b border-gray-700/50 bg-[#1a2a3a]">
                  <div className="flex-1 min-w-[120px] p-2 md:p-3"><span className="text-xs md:text-sm text-white font-medium">{match.team2}</span></div>
                  <BackOddsCell odds={odds.team2.back[0]} stake={500000} onClick={() => addToBetSlip(`${match.team2} (BM)`, "Back", odds.team2.back[0])} suspended={isSuspended} />
                  <LayOddsCell odds={odds.team2.lay[0]} stake={500000} onClick={() => addToBetSlip(`${match.team2} (BM)`, "Lay", odds.team2.lay[0])} suspended={isSuspended} />
                </div>
              </div>
            )}
          </div>

          {/* ========== 3. SESSION MARKETS (6/10/15/20 OVER RUNS) ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="session-markets">
            <MarketHeader title="Session Markets" isExpanded={expandedMarkets.sessionMarkets} onToggle={() => toggleMarket('sessionMarkets')} maxBet="50K" />
            {expandedMarkets.sessionMarkets && (
              <div className="overflow-x-auto">
                <div className="p-2 bg-[#232B36] border-b border-gray-700">
                  <p className="text-[10px] text-yellow-400">"The King of All MATKA Market Open And Close Every Hour! LIVE RESULTS,100% TRUSTED."</p>
                </div>
                <SessionColumnHeaders />
                {getSessionMarkets().map((session, idx) => (
                  <SessionRow key={idx} {...session} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "session")} suspended={isSuspended} highlight={idx % 2 === 1} />
                ))}
              </div>
            )}
          </div>

          {/* ========== 5. OVER RUN MARKETS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="over-run-markets">
            <MarketHeader title="Over Run Markets" isExpanded={expandedMarkets.overRuns} onToggle={() => toggleMarket('overRuns')} maxBet="25K" />
            {expandedMarkets.overRuns && (
              <div className="overflow-x-auto">
                <SessionColumnHeaders />
                {getOverRunMarkets().map((market, idx) => (
                  <SessionRow key={idx} {...market} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "over")} suspended={isSuspended} highlight={idx % 2 === 1} />
                ))}
              </div>
            )}
          </div>

          {/* ========== 6. FALL OF WICKETS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="fall-of-wickets">
            <MarketHeader title="Fall of Wickets" isExpanded={expandedMarkets.fallOfWickets} onToggle={() => toggleMarket('fallOfWickets')} maxBet="25K" />
            {expandedMarkets.fallOfWickets && (
              <div className="overflow-x-auto">
                <SessionColumnHeaders />
                {getFallOfWicketMarkets().map((market, idx) => (
                  <SessionRow key={idx} {...market} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "wicket")} suspended={isSuspended} highlight={idx % 2 === 1} />
                ))}
              </div>
            )}
          </div>

          {/* ========== 7. NEXT OVER MARKET ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="next-over-market">
            <MarketHeader title="Next Over Runs" isExpanded={expandedMarkets.nextOver} onToggle={() => toggleMarket('nextOver')} maxBet="10K" />
            {expandedMarkets.nextOver && (
              <div className="overflow-x-auto">
                <SessionColumnHeaders />
                <SessionRow name={`Over ${Math.floor(match.score.balls / 6) + 1} Total Runs`} noValue={6} yesValue={8} noStake={100} yesStake={100} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "nextover")} suspended={isSuspended} />
                <SessionRow name="Next Over Boundaries" noValue={0} yesValue={2} noStake={100} yesStake={100} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "nextover")} suspended={isSuspended} highlight />
              </div>
            )}
          </div>

          {/* ========== 8. TEAM TOTAL RUNS (OVER/UNDER) ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="team-total-market">
            <MarketHeader title="Team Total Runs" isExpanded={expandedMarkets.teamTotal} onToggle={() => toggleMarket('teamTotal')} maxBet="50K" />
            {expandedMarkets.teamTotal && (
              <div className="overflow-x-auto">
                <ColumnHeaders3 />
                {getTeamTotalMarkets().map((market, idx) => (
                  <div key={idx} className={`flex items-stretch border-b border-gray-700/50 ${idx % 2 === 0 ? 'bg-[#1E2736]' : 'bg-[#1a2a3a]'}`}>
                    <div className="flex-1 min-w-[160px] p-2 md:p-3"><span className="text-xs md:text-sm text-white font-medium">{market.name}</span></div>
                    <div className="flex">
                      <BackOddsCell odds={market.yesValue} stake={market.yesStake} onClick={() => addToBetSlip(market.name, "Back", market.yesValue, "total")} suspended={isSuspended} />
                    </div>
                    <div className="flex">
                      <LayOddsCell odds={market.noValue} stake={market.noStake} onClick={() => addToBetSlip(market.name, "Lay", market.noValue, "total")} suspended={isSuspended} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ========== 9. PARTNERSHIP MARKETS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="partnership-market">
            <MarketHeader title="Partnership Markets" isExpanded={expandedMarkets.partnership} onToggle={() => toggleMarket('partnership')} maxBet="25K" />
            {expandedMarkets.partnership && (
              <div className="overflow-x-auto">
                <div className="p-2 bg-[#232B36] border-b border-gray-700">
                  <p className="text-[10px] text-gray-400">Current Partnership: <span className="text-cyan-400 font-bold">{match.partnership.runs} ({match.partnership.balls}b)</span></p>
                </div>
                <SessionColumnHeaders />
                <SessionRow name="Current Partnership Over 35.5" noValue={1.90} yesValue={1.90} noStake={500} yesStake={500} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "partnership")} suspended={isSuspended} />
                <SessionRow name="Current Partnership Over 50.5" noValue={2.50} yesValue={1.55} noStake={400} yesStake={600} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "partnership")} suspended={isSuspended} highlight />
                <SessionRow name="Partnership Boundaries" noValue={3} yesValue={5} noStake={100} yesStake={100} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "partnership")} suspended={isSuspended} />
              </div>
            )}
          </div>

          {/* ========== 10. SPECIAL MARKETS (BATSMAN 50/100) ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="special-markets">
            <MarketHeader title="Special Markets" isExpanded={expandedMarkets.specialMarkets} onToggle={() => toggleMarket('specialMarkets')} maxBet="10K" />
            {expandedMarkets.specialMarkets && (
              <div className="overflow-x-auto">
                <SessionColumnHeaders />
                <SessionRow name={`${match.batsman1.name} to score 50 (Currently: ${match.batsman1.runs})`} noValue={1.75} yesValue={2.10} noStake={500} yesStake={400} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "special")} suspended={isSuspended} />
                <SessionRow name={`${match.batsman1.name} to score 100 (Currently: ${match.batsman1.runs})`} noValue={1.20} yesValue={4.50} noStake={800} yesStake={200} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "special")} suspended={isSuspended} highlight />
                <SessionRow name={`${match.batsman2.name} to score 50 (Currently: ${match.batsman2.runs})`} noValue={1.65} yesValue={2.30} noStake={550} yesStake={350} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "special")} suspended={isSuspended} />
                <SessionRow name={`${match.batsman2.name} to score 100 (Currently: ${match.batsman2.runs})`} noValue={1.15} yesValue={5.00} noStake={850} yesStake={150} onSelect={(name, type, val) => addToBetSlip(`${name} ${type}`, type, val, "special")} suspended={isSuspended} highlight />
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
                          <div className={`text-[10px] ${bet.type === "Back" || bet.type === "Yes" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>{bet.type} @ {bet.odds}</div>
                        </div>
                        <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400 text-lg leading-none">×</button>
                      </div>
                      <input type="number" placeholder="Stake ₹" value={bet.stake} onChange={(e) => updateStake(bet.id, e.target.value)} className="w-full bg-[#0D1117] border border-gray-700 rounded px-2 py-1.5 text-xs focus:border-cyan-500 focus:outline-none" />
                      {bet.stake && <div className="mt-1 text-right"><span className="text-gray-400 text-[10px]">Profit: </span><span className="text-green-400 text-xs font-bold">₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}</span></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {betSlip.length > 0 && (
              <div className="p-3 border-t border-gray-800 space-y-2">
                <div className="flex justify-between text-xs"><span className="text-gray-400">Total Stake:</span><span className="font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-400">Potential Profit:</span><span className="text-green-400 font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0).toFixed(2)}</span></div>
                <div className="flex gap-2">
                  <button onClick={clearBetSlip} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded-lg">Clear</button>
                  <button onClick={placeBet} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold py-2 rounded-lg" data-testid="place-bet-btn">Place Bet</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#161B22] border-t border-gray-800 z-50">
        <div className="flex justify-around py-2">
          <Link to="/" className="flex flex-col items-center px-3 py-1 text-gray-400"><Menu className="w-5 h-5" /><span className="text-[10px]">Home</span></Link>
          <Link to="/exchange" className="flex flex-col items-center px-3 py-1 text-cyan-400"><Tv className="w-5 h-5" /><span className="text-[10px]">Cricket</span></Link>
          <button onClick={() => setShowBetSlip(true)} className="flex flex-col items-center px-3 py-1 text-yellow-400 relative" data-testid="mobile-betslip-btn">
            <BarChart3 className="w-5 h-5" /><span className="text-[10px]">Bet Slip</span>
            {betSlip.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{betSlip.length}</span>}
          </button>
          <Link to="/football-live" className="flex flex-col items-center px-3 py-1 text-gray-400"><Clock className="w-5 h-5" /><span className="text-[10px]">Soccer</span></Link>
        </div>
      </div>

      {/* ==================== MOBILE BET SLIP MODAL ==================== */}
      {showBetSlip && (
        <div className="lg:hidden fixed inset-0 bg-black/80 z-50 flex items-end">
          <div className="w-full bg-[#161B22] rounded-t-2xl max-h-[80vh] overflow-hidden animate-slide-up">
            <div className="p-3 border-b border-gray-800 flex items-center justify-between bg-[#21262D]">
              <h2 className="text-sm font-bold">Bet Slip ({betSlip.length})</h2>
              <button onClick={() => setShowBetSlip(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-3 max-h-[50vh] overflow-y-auto">
              {betSlip.length === 0 ? (
                <div className="text-center text-gray-500 py-8"><BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Click odds to add selections</p></div>
              ) : (
                <div className="space-y-2">
                  {betSlip.map((bet) => (
                    <div key={bet.id} className="bg-[#21262D] rounded-lg p-3 border border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div><div className="text-sm font-medium text-white">{bet.selection}</div><div className={`text-xs ${bet.type === "Back" || bet.type === "Yes" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>{bet.type} @ {bet.odds}</div></div>
                        <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400 text-xl">×</button>
                      </div>
                      <input type="number" placeholder="Stake ₹" value={bet.stake} onChange={(e) => updateStake(bet.id, e.target.value)} className="w-full bg-[#0D1117] border border-gray-700 rounded px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none" />
                      {bet.stake && <div className="mt-2 text-right"><span className="text-gray-400 text-xs">Profit: </span><span className="text-green-400 font-bold">₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}</span></div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {betSlip.length > 0 && (
              <div className="p-3 border-t border-gray-800 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-gray-400">Total Stake:</span><span className="font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-400">Potential Profit:</span><span className="text-green-400 font-bold">₹{betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0).toFixed(2)}</span></div>
                <div className="flex gap-2">
                  <button onClick={clearBetSlip} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg">Clear</button>
                  <button onClick={placeBet} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 rounded-lg" data-testid="mobile-place-bet-btn">Place Bet</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  );
}
