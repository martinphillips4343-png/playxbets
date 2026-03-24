import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/App";
import { ChevronDown, ChevronUp, Tv, BarChart3, Menu, X, Clock } from "lucide-react";

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
      <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center">
        <span className="text-xs md:text-sm text-white font-medium truncate">{name}</span>
      </div>
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

export default function FootballLive({ user, onShowAuth, onLogout }) {
  const location = useLocation();
  const [matches, setMatches] = useState(MOCK_MATCHES);
  const [selectedMatch, setSelectedMatch] = useState(MOCK_MATCHES[0]);
  const [betSlip, setBetSlip] = useState([]);
  const [balance, setBalance] = useState(0);
  const [showBetSlip, setShowBetSlip] = useState(false);
  const [expandedMarkets, setExpandedMarkets] = useState({
    matchOdds: true,
    overUnder: true,
    nextGoal: true,
    correctScore: true,
  });
  const [odds, setOdds] = useState({
    home: { back: [2.10, 2.12, 2.14], lay: [2.18, 2.20, 2.22], backStakes: [1250, 890, 450], layStakes: [980, 670, 320] },
    draw: { back: [3.20, 3.25, 3.30], lay: [3.35, 3.40, 3.45], backStakes: [875, 560, 340], layStakes: [720, 480, 290] },
    away: { back: [3.50, 3.55, 3.60], lay: [3.65, 3.70, 3.75], backStakes: [650, 420, 280], layStakes: [580, 390, 250] },
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
      setMatches((prev) =>
        prev.map((m) => ({
          ...m,
          minute: Math.min(m.minute + 1, 90),
        }))
      );

      setOdds((prev) => ({
        home: {
          back: prev.home.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.home.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          backStakes: prev.home.backStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
          layStakes: prev.home.layStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
        },
        draw: {
          back: prev.draw.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.draw.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          backStakes: prev.draw.backStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
          layStakes: prev.draw.layStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
        },
        away: {
          back: prev.away.back.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          lay: prev.away.lay.map((o) => +(o + (Math.random() - 0.5) * 0.05).toFixed(2)),
          backStakes: prev.away.backStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
          layStakes: prev.away.layStakes.map((s) => Math.max(100, s + Math.floor((Math.random() - 0.5) * 200))),
        },
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const addToBetSlip = (selection, type, selectedOdds) => {
    setBetSlip((prev) => {
      const exists = prev.find((b) => b.selection === selection && b.type === type);
      if (exists) {
        toast.info("Already in bet slip");
        return prev;
      }
      toast.success(`Added: ${selection} @ ${selectedOdds}`);
      setShowBetSlip(true);
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

  const placeBet = async () => {
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
    
    // Place each bet through the backend API
    let successCount = 0;
    let failCount = 0;
    
    for (const bet of betSlip) {
      const stake = parseFloat(bet.stake) || 0;
      if (stake <= 0) continue;
      
      try {
        await api.post("/bets", {
          match_id: selectedMatch?.id || "football-demo-match",
          selected_team: bet.selection,
          odds: bet.odds,
          stake: stake,
          bet_type: bet.type.toLowerCase(), // "back", "lay", "over", "under"
          market_type: "football"
        });
        successCount++;
      } catch (error) {
        console.error("Failed to place bet:", error);
        failCount++;
        if (error.response?.data?.detail) {
          toast.error(error.response.data.detail);
        }
      }
    }
    
    if (successCount > 0) {
      toast.success(`${successCount} bet(s) placed successfully!`);
      setBetSlip([]);
      setShowBetSlip(false);
      // Refresh wallet balance from backend
      fetchWallet();
    }
    
    if (failCount > 0 && successCount === 0) {
      toast.error("Failed to place bets. Please try again.");
    }
  };

  const toggleMarket = (market) => {
    setExpandedMarkets((prev) => ({ ...prev, [market]: !prev[market] }));
  };

  // Goal markets
  const goalMarkets = [
    { name: "Over/Under 0.5", line: 0.5, overOdds: 1.20, underOdds: 4.50, overStake: 890, underStake: 340 },
    { name: "Over/Under 1.5", line: 1.5, overOdds: 1.45, underOdds: 2.75, overStake: 1250, underStake: 580 },
    { name: "Over/Under 2.5", line: 2.5, overOdds: 1.90, underOdds: 1.90, overStake: 980, underStake: 920 },
    { name: "Over/Under 3.5", line: 3.5, overOdds: 2.50, underOdds: 1.55, overStake: 450, underStake: 1100 },
  ];

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      {/* ==================== HEADER ==================== */}
      <header className="bg-[#161B22] border-b border-gray-800 sticky top-0 z-50">
        <div className="flex items-center justify-between px-2 md:px-4 py-2">
          <Link to="/" className="flex items-center gap-1 md:gap-2">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-lg md:text-xl font-bold">X</span>
            </div>
            <span className="text-base md:text-xl font-bold hidden sm:block">
              Play<span className="text-yellow-400">X</span>bets
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">Home</Link>
            <Link to="/exchange" className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Cricket
            </Link>
            <Link to="/football-live" className="text-sm text-cyan-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Soccer
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

      {/* ==================== MATCH SELECTOR ==================== */}
      <div className="bg-[#161B22] border-b border-gray-800 overflow-x-auto">
        <div className="flex gap-2 p-2 md:p-3">
          {matches.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMatch(m)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg border transition-all ${
                selectedMatch?.id === m.id
                  ? "bg-cyan-500/20 border-cyan-500/50"
                  : "bg-[#21262D] border-gray-700 hover:border-cyan-500/30"
              }`}
              data-testid={`match-selector-${m.id}`}
            >
              <div className="flex items-center gap-1 mb-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] text-gray-400">{m.league}</span>
              </div>
              <div className="text-xs font-medium whitespace-nowrap">
                {m.homeTeam} vs {m.awayTeam}
              </div>
              <div className="text-base font-bold text-cyan-400 mt-1">
                {m.homeScore} - {m.awayScore}
                <span className="text-[10px] text-gray-400 ml-1">{m.minute}'</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ==================== MATCH INFO BAR ==================== */}
      <div className="bg-gradient-to-r from-[#1a2332] to-[#1E2736] border-b border-gray-800">
        <div className="px-2 md:px-4 py-2 md:py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] md:text-xs text-green-400 font-semibold">LIVE</span>
              <span className="text-xs md:text-sm font-bold text-white">
                {selectedMatch?.homeTeam} vs {selectedMatch?.awayTeam}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-xl md:text-2xl font-bold text-cyan-400">
                  {selectedMatch?.homeScore} - {selectedMatch?.awayScore}
                </div>
              </div>
              <div className="text-center">
                <div className="text-lg md:text-xl font-bold text-yellow-400">{selectedMatch?.minute}'</div>
                <div className="text-[8px] md:text-[10px] text-gray-400">MINUTE</div>
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
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="football-match-odds">
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
                  name={selectedMatch?.homeTeam || "Home"}
                  backOdds={odds.home.back}
                  layOdds={odds.home.lay}
                  backStakes={odds.home.backStakes}
                  layStakes={odds.home.layStakes}
                  onSelectOdds={addToBetSlip}
                />
                <MarketRow
                  name="Draw"
                  backOdds={odds.draw.back}
                  layOdds={odds.draw.lay}
                  backStakes={odds.draw.backStakes}
                  layStakes={odds.draw.layStakes}
                  onSelectOdds={addToBetSlip}
                  highlight
                />
                <MarketRow
                  name={selectedMatch?.awayTeam || "Away"}
                  backOdds={odds.away.back}
                  layOdds={odds.away.lay}
                  backStakes={odds.away.backStakes}
                  layStakes={odds.away.layStakes}
                  onSelectOdds={addToBetSlip}
                />
              </div>
            )}
          </div>

          {/* ========== OVER/UNDER GOALS ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="over-under-market">
            <MarketHeader 
              title="Over/Under Goals" 
              isExpanded={expandedMarkets.overUnder}
              onToggle={() => toggleMarket('overUnder')}
            />
            {expandedMarkets.overUnder && (
              <div className="overflow-x-auto">
                <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
                  <div className="flex-1 min-w-[140px] p-2">
                    <span className="text-[10px] md:text-xs text-gray-400">Goals Line</span>
                  </div>
                  <div className="flex">
                    <div className="w-[60px] p-1 text-center bg-[#72BBEF]/20">
                      <span className="text-[10px] font-bold text-[#72BBEF]">Over</span>
                    </div>
                    <div className="w-[60px] p-1 text-center bg-[#FAA9BA]/20">
                      <span className="text-[10px] font-bold text-[#FAA9BA]">Under</span>
                    </div>
                  </div>
                </div>
                {goalMarkets.map((market, idx) => (
                  <div key={idx} className={`flex items-stretch border-b border-gray-700/50 ${idx % 2 === 0 ? 'bg-[#1E2736]' : 'bg-[#1a2a3a]'}`}>
                    <div className="flex-1 min-w-[140px] p-2 md:p-3 flex items-center">
                      <span className="text-xs md:text-sm text-white font-medium">{market.name}</span>
                    </div>
                    <div className="flex">
                      <button
                        onClick={() => addToBetSlip(`Over ${market.line} Goals`, "Over", market.overOdds)}
                        className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#72BBEF] hover:bg-[#5BA8DC] transition-colors"
                        data-testid={`over-${market.line}-btn`}
                      >
                        <span className="text-sm font-bold text-gray-900">{market.overOdds.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-700">{market.overStake}</span>
                      </button>
                      <button
                        onClick={() => addToBetSlip(`Under ${market.line} Goals`, "Under", market.underOdds)}
                        className="flex flex-col items-center justify-center p-1 w-[60px] bg-[#FAA9BA] hover:bg-[#E8899A] transition-colors"
                        data-testid={`under-${market.line}-btn`}
                      >
                        <span className="text-sm font-bold text-gray-900">{market.underOdds.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-700">{market.underStake}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ========== NEXT GOAL ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="next-goal-market">
            <MarketHeader 
              title="Next Goal" 
              isExpanded={expandedMarkets.nextGoal}
              onToggle={() => toggleMarket('nextGoal')}
            />
            {expandedMarkets.nextGoal && (
              <div className="overflow-x-auto">
                <ColumnHeaders />
                <MarketRow
                  name={`${selectedMatch?.homeTeam} (Next)`}
                  backOdds={[2.20, 2.22, 2.25]}
                  layOdds={[2.30, 2.32, 2.35]}
                  backStakes={[680, 450, 280]}
                  layStakes={[590, 380, 240]}
                  onSelectOdds={(name, type, odds) => addToBetSlip(`${selectedMatch?.homeTeam} Next Goal`, type, odds)}
                />
                <MarketRow
                  name="No Goal"
                  backOdds={[3.50, 3.55, 3.60]}
                  layOdds={[3.70, 3.75, 3.80]}
                  backStakes={[420, 280, 180]}
                  layStakes={[380, 250, 160]}
                  onSelectOdds={(name, type, odds) => addToBetSlip("No Goal", type, odds)}
                  highlight
                />
                <MarketRow
                  name={`${selectedMatch?.awayTeam} (Next)`}
                  backOdds={[2.80, 2.82, 2.85]}
                  layOdds={[2.90, 2.92, 2.95]}
                  backStakes={[520, 340, 220]}
                  layStakes={[480, 310, 200]}
                  onSelectOdds={(name, type, odds) => addToBetSlip(`${selectedMatch?.awayTeam} Next Goal`, type, odds)}
                />
              </div>
            )}
          </div>

          {/* ========== CORRECT SCORE ========== */}
          <div className="bg-[#161B22] rounded-lg overflow-hidden border border-gray-800" data-testid="correct-score-market">
            <MarketHeader 
              title="Correct Score" 
              isExpanded={expandedMarkets.correctScore}
              onToggle={() => toggleMarket('correctScore')}
            />
            {expandedMarkets.correctScore && (
              <div className="p-2 md:p-3">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-1 md:gap-2">
                  {[
                    { score: "1-0", odds: 6.50 },
                    { score: "2-0", odds: 9.00 },
                    { score: "2-1", odds: 8.50 },
                    { score: "3-0", odds: 15.0 },
                    { score: "3-1", odds: 12.0 },
                    { score: "3-2", odds: 18.0 },
                    { score: "0-0", odds: 8.00 },
                    { score: "1-1", odds: 5.50 },
                    { score: "2-2", odds: 11.0 },
                    { score: "0-1", odds: 8.50 },
                    { score: "0-2", odds: 15.0 },
                    { score: "1-2", odds: 12.0 },
                  ].map((item) => (
                    <button
                      key={item.score}
                      onClick={() => addToBetSlip(`Correct Score ${item.score}`, "Back", item.odds)}
                      className="p-2 md:p-3 rounded-lg bg-[#21262D] border border-gray-700 hover:border-cyan-500/50 hover:bg-[#2a3441] transition-all active:scale-95"
                      data-testid={`correct-score-${item.score}`}
                    >
                      <div className="text-sm md:text-base font-bold text-white">{item.score}</div>
                      <div className="text-xs md:text-sm font-bold text-cyan-400 mt-1">{item.odds.toFixed(2)}</div>
                    </button>
                  ))}
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
                          <div className={`text-[10px] ${bet.type === "Back" || bet.type === "Over" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>
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
          <Link to="/exchange" className="flex flex-col items-center px-3 py-1 text-gray-400">
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
          <Link to="/football-live" className="flex flex-col items-center px-3 py-1 text-cyan-400">
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
                          <div className={`text-xs ${bet.type === "Back" || bet.type === "Over" ? "text-[#72BBEF]" : "text-[#FAA9BA]"}`}>
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
