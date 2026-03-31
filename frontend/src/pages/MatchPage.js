import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import PublicHeader from "@/components/PublicHeader";
import TiedMatchMarket from "@/components/TiedMatchMarket";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { useMatchUpdates } from "@/hooks/useWebSocket";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Tv,
  Clock,
  Calendar,
  MapPin,
  Trophy,
  Loader2,
  RefreshCw,
  X,
  Home,
  Wifi,
  WifiOff,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const FALLBACK_POLL_INTERVAL = 8000;
const LIVE_SCORE_POLL_INTERVAL = 15000;

// ==================== ODDS FLASH ANIMATION HOOK ====================
const useOddsFlash = (currentOdds) => {
  const prevRef = useRef(null);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (prevRef.current !== null && currentOdds !== null && currentOdds !== prevRef.current) {
      setFlash(currentOdds > prevRef.current ? "odds-flash-up" : "odds-flash-down");
      const t = setTimeout(() => setFlash(""), 1500);
      return () => clearTimeout(t);
    }
    prevRef.current = currentOdds;
  }, [currentOdds]);
  return flash;
};

// ==================== ODDS CELL ====================
const OddsCell = ({ price, size, type, isBest, onClick, suspended }) => {
  const flash = useOddsFlash(price);
  const isBack = type === "back";
  
  if (suspended) {
    return (
      <div className="flex flex-col items-center justify-center p-1.5 w-[75px] bg-gray-700/40">
        <span className="text-[9px] font-bold text-red-400 animate-pulse">-</span>
      </div>
    );
  }
  
  const bgClass = isBack
    ? "bg-[#1a56db] hover:bg-[#1e40af]"
    : "bg-[#991b1b] hover:bg-[#7f1d1d]";

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-1.5 w-[75px] ${bgClass} transition-all cursor-pointer active:scale-95 border-r border-gray-700/30 ${flash}`}
      data-testid={`${type}-odds-cell`}
    >
      <span className="text-sm md:text-base font-bold text-white">
        {price ? price.toFixed(2) : "-"}
      </span>
      <span className="text-[8px] md:text-[9px] text-white/60">
        {size ? (size > 999 ? `${(size / 1000).toFixed(1)}k` : size.toFixed(0)) : "-"}
      </span>
    </button>
  );
};

// ==================== SESSION ROW (with SUSPENDED for completed overs) ====================
const SessionRow = ({ name, noValue, yesValue, noStake, yesStake, onSelect, suspended = false, ballRunning = false, completed = false }) => (
  <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
    <div className="flex-1 min-w-[180px] p-2 md:p-3 flex items-center">
      <span className="text-xs md:text-sm text-white font-medium">{name}</span>
    </div>
    <div className="flex">
      {completed ? (
        <div className="flex items-center justify-center w-[130px] bg-gray-700/40">
          <span className="text-xs font-bold text-red-400" data-testid="session-suspended-label">SUSPENDED</span>
        </div>
      ) : ballRunning ? (
        <div className="flex items-center justify-center w-[130px] bg-yellow-500/20">
          <span className="text-xs font-bold text-red-400 animate-pulse" data-testid="ball-running-label">BALL RUNNING</span>
        </div>
      ) : (
        <>
          <button
            onClick={() => !suspended && onSelect(name, "No", noValue)}
            disabled={suspended}
            className={`flex flex-col items-center justify-center p-1.5 w-[65px] ${suspended ? "bg-[#dc2626]/30 text-gray-400" : "bg-[#dc2626] hover:bg-[#b91c1c]"} transition-colors`}
            data-testid="session-no-btn"
          >
            <span className="text-sm font-bold text-white">{noValue}</span>
            <span className="text-[9px] text-white/60">{noStake ? noStake.toLocaleString("en-IN") : "-"}</span>
          </button>
          <button
            onClick={() => !suspended && onSelect(name, "Yes", yesValue)}
            disabled={suspended}
            className={`flex flex-col items-center justify-center p-1.5 w-[65px] ${suspended ? "bg-[#2563eb]/30 text-gray-400" : "bg-[#2563eb] hover:bg-[#1d4ed8]"} transition-colors`}
            data-testid="session-yes-btn"
          >
            <span className="text-sm font-bold text-white">{yesValue}</span>
            <span className="text-[9px] text-white/60">{yesStake ? yesStake.toLocaleString("en-IN") : "-"}</span>
          </button>
        </>
      )}
    </div>
  </div>
);

// ==================== MARKET HEADER ====================
const MarketHeader = ({ title, isExpanded, onToggle, maxBet, minBet }) => (
  <div className="flex items-center justify-between bg-[#2C3E50] px-3 py-2 cursor-pointer" onClick={onToggle}
    data-testid={`market-header-${title.toLowerCase().replace(/\s+/g, "-")}`}>
    <div className="flex items-center gap-2">
      <span className="text-xs md:text-sm font-bold text-white uppercase">{title}</span>
      {minBet && maxBet && <span className="text-[10px] text-cyan-400">Min:{minBet} Max:{maxBet}</span>}
    </div>
    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
  </div>
);

// ==================== MATCH ODDS HEADER (CLEAN - NO LABELS) ====================
const MatchOddsHeader = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[120px] p-2"></div>
    <div className="w-[75px] p-1 text-center"></div>
    <div className="w-[75px] p-1 text-center"></div>
  </div>
);

const SessionColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[180px] p-2"><span className="text-[10px] text-cyan-400 font-semibold">Session</span></div>
    <div className="flex">
      <div className="w-[65px] p-1 text-center bg-[#dc2626]/20"><span className="text-[10px] font-bold text-[#fca5a5]">No</span></div>
      <div className="w-[65px] p-1 text-center bg-[#2563eb]/20"><span className="text-[10px] font-bold text-[#60a5fa]">Yes</span></div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function MatchPage({ user, onShowAuth, onLogout }) {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { match: wsMatch, isConnected: wsConnected, lastUpdate: wsLastUpdate } = useMatchUpdates(BACKEND_URL, matchId);

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(0);
  const [betSlip, setBetSlip] = useState([]);
  const [showMobileBetSlip, setShowMobileBetSlip] = useState(false);
  const [lastOddsUpdate, setLastOddsUpdate] = useState(null);
  const [ballRunning, setBallRunning] = useState(false);
  const [matchSuspended, setMatchSuspended] = useState(false);
  const [liveScoreData, setLiveScoreData] = useState(null);
  const [exposure, setExposure] = useState({ home_exposure: 0, away_exposure: 0 });
  const [matchedBets, setMatchedBets] = useState([]);
  const [activeTab, setActiveTab] = useState("odds"); // "odds" | "matched"

  const [expandedMarkets, setExpandedMarkets] = useState({
    matchOdds: true,
    sessionMarkets: true,
    overRuns: false,
    fallOfWickets: false,
    teamTotal: false,
    partnership: false,
    specialMarkets: false,
  });

  const [liveOdds, setLiveOdds] = useState(null);
  const fallbackIntervalRef = useRef(null);
  const [backendSessionMarkets, setBackendSessionMarkets] = useState(null);
  const [backendMarketStatus, setBackendMarketStatus] = useState(null);

  // ==================== PARSE ORDER BOOK FROM MATCH DATA ====================
  const parseOrderBook = useCallback((matchData) => {
    const odds = matchData?.odds;
    if (!odds) return null;

    const hbLevels = odds.home_back_levels || [odds.home_back || odds.home];
    const hlLevels = odds.home_lay_levels || [odds.home_lay || (odds.home ? odds.home + 0.02 : null)];
    const abLevels = odds.away_back_levels || [odds.away_back || odds.away];
    const alLevels = odds.away_lay_levels || [odds.away_lay || (odds.away ? odds.away + 0.02 : null)];

    if (!hbLevels[0] || !abLevels[0]) return null;

    return {
      home: {
        back: hbLevels,
        lay: hlLevels,
        backSizes: odds.home_back_sizes || [5000, 8000, 6000],
        laySizes: odds.home_lay_sizes || [4000, 7000, 5000],
      },
      away: {
        back: abLevels,
        lay: alLevels,
        backSizes: odds.away_back_sizes || [6000, 9000, 7000],
        laySizes: odds.away_lay_sizes || [3000, 8000, 4000],
      },
      bookmakers: odds.bookmakers || [],
    };
  }, []);

  // ==================== SYNC WEBSOCKET ====================
  useEffect(() => {
    if (wsMatch) {
      if (wsMatch.matchEnded === true || ["completed", "ended", "finished"].includes(wsMatch.status?.toLowerCase())) {
        setMatch({ ...wsMatch, status: "completed" });
        toast.info("This match has ended");
      } else {
        setMatch(wsMatch);
      }
      setError(null);
      setLoading(false);
      setLastOddsUpdate(wsLastUpdate);
      const ob = parseOrderBook(wsMatch);
      if (ob) setLiveOdds(ob);
    }
  }, [wsMatch, wsLastUpdate, parseOrderBook]);

  // ==================== FETCH MATCH (FALLBACK) ====================
  const fetchMatch = useCallback(async () => {
    if (wsConnected && wsMatch) return;
    try {
      const response = await api.get(`/match/${matchId}`);
      const d = response.data;
      if (d.matchEnded === true || ["completed", "ended", "finished"].includes(d.status?.toLowerCase())) {
        setMatch({ ...d, status: "completed" });
        toast.info("This match has ended");
        return;
      }
      setMatch(d);
      setError(null);
      const ob = parseOrderBook(d);
      if (ob) setLiveOdds(ob);
    } catch (err) {
      setError("Failed to load match details");
    } finally {
      setLoading(false);
    }
  }, [matchId, wsConnected, wsMatch, parseOrderBook]);

  // ==================== FETCH WALLET ====================
  const fetchWallet = useCallback(async () => {
    if (!user) { setBalance(1500); return; }
    try {
      const r = await api.get("/wallet");
      setBalance(r.data.balance || 0);
    } catch { setBalance(1500); }
  }, [user]);

  // ==================== FETCH EXPOSURE ====================
  const fetchExposure = useCallback(async () => {
    if (!user || !matchId) return;
    try {
      const r = await api.get(`/match/${matchId}/exposure`);
      setExposure(r.data);
    } catch { /* silent */ }
  }, [user, matchId]);

  // ==================== FETCH MATCHED BETS ====================
  const fetchMatchedBets = useCallback(async () => {
    if (!user || !matchId) return;
    try {
      const r = await api.get(`/match/${matchId}/my-bets`);
      setMatchedBets(r.data);
    } catch { /* silent */ }
  }, [user, matchId]);

  // ==================== MARKET STATUS POLLING (replaces timed ball-running cycle) ====================
  useEffect(() => {
    if (!match || match.status !== "live") { setBallRunning(false); setMatchSuspended(false); return; }
    
    const fetchMarketStatus = async () => {
      try {
        const r = await api.get(`/match/${matchId}/market-status`);
        const status = r.data;
        setBackendMarketStatus(status);
        
        if (status.suspended) {
          // Market is suspended due to 4/6/wicket event
          setBallRunning(true);
          setMatchSuspended(false);
        } else {
          setBallRunning(false);
          setMatchSuspended(false);
        }
      } catch {
        // Fallback: use timed cycle if backend market status unavailable
      }
    };
    
    fetchMarketStatus();
    const interval = setInterval(fetchMarketStatus, 2000);
    return () => { clearInterval(interval); setBallRunning(false); setMatchSuspended(false); };
  }, [match?.status, match?.match_id, matchId]);

  // ==================== SESSION MARKETS POLLING ====================
  useEffect(() => {
    if (!match || match.sport !== "cricket") return;
    
    const fetchSessionMarkets = async () => {
      try {
        const r = await api.get(`/match/${matchId}/session-markets`);
        setBackendSessionMarkets(r.data);
      } catch {
        // Fallback: will use frontend-generated markets
      }
    };
    
    fetchSessionMarkets();
    const pollInterval = match.status === "live" ? 3000 : 30000;
    const interval = setInterval(fetchSessionMarkets, pollInterval);
    return () => clearInterval(interval);
  }, [match?.status, match?.match_id, match?.sport, matchId]);

  // ==================== LIVE SCORE POLLING ====================
  useEffect(() => {
    if (!match || match.status !== "live") return;
    const fetchLive = async () => {
      try {
        const r = await api.get(`/match/${matchId}`);
        const d = r.data;
        if (d.score?.length > 0) { setLiveScoreData(d.score); setMatch(prev => prev ? { ...prev, score: d.score } : prev); }
        const ob = parseOrderBook(d);
        if (ob) setLiveOdds(ob);
      } catch { /* silent */ }
    };
    fetchLive();
    const interval = setInterval(fetchLive, LIVE_SCORE_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [match?.status, matchId, parseOrderBook]);

  // ==================== EFFECTS ====================
  useEffect(() => { fetchWallet(); }, [fetchWallet]);
  useEffect(() => { fetchExposure(); fetchMatchedBets(); }, [fetchExposure, fetchMatchedBets]);
  
  useEffect(() => {
    if (!matchId || !match) return;
    const interval = setInterval(() => { fetchExposure(); fetchMatchedBets(); }, 15000);
    return () => clearInterval(interval);
  }, [matchId, match, fetchExposure, fetchMatchedBets]);

  useEffect(() => {
    if (wsConnected) { if (fallbackIntervalRef.current) { clearInterval(fallbackIntervalRef.current); fallbackIntervalRef.current = null; } return; }
    fetchMatch();
    fallbackIntervalRef.current = setInterval(fetchMatch, FALLBACK_POLL_INTERVAL);
    return () => { if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current); };
  }, [wsConnected, fetchMatch]);

  // ==================== BET SLIP ====================
  const addToBetSlip = (selection, type, odds, marketType = "match") => {
    if (!user) { onShowAuth && onShowAuth("login"); toast.error("Please login to place bets"); return; }
    if (!odds || odds <= 0) return;
    setBetSlip(prev => {
      if (prev.find(b => b.selection === selection && b.type === type && b.marketType === marketType)) {
        toast.info("Already in bet slip"); return prev;
      }
      toast.success(`Added: ${selection} @ ${typeof odds === 'number' ? odds.toFixed(2) : odds}`);
      setShowMobileBetSlip(true);
      return [...prev, { id: Date.now(), selection, type, odds, stake: "", marketType, status: "pending" }];
    });
  };

  const updateStake = (id, stake) => setBetSlip(prev => prev.map(b => b.id === id ? { ...b, stake } : b));
  const removeFromBetSlip = (id) => setBetSlip(prev => prev.filter(b => b.id !== id));
  const clearBetSlip = () => { setBetSlip([]); toast.info("Bet slip cleared"); };

  const placeBets = async () => {
    if (!user) { onShowAuth && onShowAuth("login"); return; }
    const totalStake = betSlip.reduce((s, b) => s + (parseFloat(b.stake) || 0), 0);
    if (totalStake <= 0) { toast.error("Enter stake amount"); return; }
    if (totalStake > balance) { toast.error("Insufficient balance"); return; }
    if (totalStake > 10000000) { toast.error("Max limit exceeded (1 Crore)"); return; }

    let ok = 0;
    for (const bet of betSlip) {
      const stake = parseFloat(bet.stake) || 0;
      if (stake <= 0) continue;
      try {
        await api.post("/bets", { match_id: matchId, selected_team: bet.selection, odds: bet.odds, stake, bet_type: bet.type.toLowerCase(), market_type: bet.marketType || "match" });
        ok++;
      } catch (e) { if (e.response?.data?.detail) toast.error(e.response.data.detail); }
    }
    if (ok > 0) {
      toast.success(`${ok} bet(s) placed!`);
      setBetSlip([]); setShowMobileBetSlip(false);
      fetchWallet(); fetchExposure(); fetchMatchedBets();
    }
  };

  const toggleMarket = (m) => setExpandedMarkets(prev => ({ ...prev, [m]: !prev[m] }));

  // ==================== SESSION MARKETS (from backend with fallback) ====================
  const getSessionMarkets = useCallback(() => {
    // Use backend session markets if available (over_runs type)
    if (backendSessionMarkets?.markets) {
      return backendSessionMarkets.markets
        .filter(m => m.type === "over_runs")
        .map(m => ({
          name: m.name,
          noValue: m.no_value,
          yesValue: m.yes_value,
          noStake: 100,
          yesStake: 100,
          completed: m.completed,
          suspended: m.suspended,
          ballRunning: m.ball_running,
        }));
    }
    
    // Fallback: frontend calculation
    if (!match || match.sport !== "cricket") return [];
    const sessions = [];
    const overTargets = match.format === "odi" ? [10, 20, 30, 40, 50] : [6, 10, 15, 20];
    const homeShort = match.home_team?.substring(0, 3).toUpperCase() || "HOM";
    const awayShort = match.away_team?.substring(0, 3).toUpperCase() || "AWY";
    let currentRuns = 0, currentOvers = 0;
    const scoreData = liveScoreData || match.score || [];
    if (scoreData.length > 0) {
      const fi = scoreData[0];
      if (typeof fi === "string") {
        const m2 = fi.match(/(\d+)\/(\d+)\s*\((\d+\.?\d*)\)/);
        if (m2) { currentRuns = parseInt(m2[1]); currentOvers = parseFloat(m2[3]); }
      } else if (typeof fi === "object") { currentRuns = parseInt(fi.r) || 0; currentOvers = parseFloat(fi.o) || 0; }
    }
    const rr = currentOvers > 0 ? currentRuns / currentOvers : 7.5 + Math.random() * 2;
    const jitter = () => Math.floor(Math.random() * 3) - 1;
    overTargets.forEach(ov => {
      const proj = currentOvers > 0 ? (ov <= currentOvers ? Math.floor(ov * rr) : Math.floor(currentRuns + (ov - currentOvers) * rr)) : Math.floor(ov * (7.5 + Math.random() * 2));
      sessions.push({ name: `${ov} over runs ${homeShort}(${homeShort} vs ${awayShort})adv`, noValue: proj - 2 + jitter(), yesValue: proj + jitter(), noStake: 100, yesStake: 100, completed: currentOvers > 0 && ov <= currentOvers });
    });
    return sessions;
  }, [match, liveScoreData, backendSessionMarkets]);

  // ==================== ADDITIONAL SESSION MARKETS (Fours, Sixes, Wickets from backend) ====================
  const getFoursMarkets = useCallback(() => {
    if (!backendSessionMarkets?.markets) return [];
    return backendSessionMarkets.markets
      .filter(m => m.type === "fours")
      .map(m => ({
        name: m.name,
        noValue: m.no_value,
        yesValue: m.yes_value,
        noStake: 100,
        yesStake: 100,
        completed: m.completed,
        suspended: m.suspended,
        ballRunning: m.ball_running,
      }));
  }, [backendSessionMarkets]);

  const getSixesMarkets = useCallback(() => {
    if (!backendSessionMarkets?.markets) return [];
    return backendSessionMarkets.markets
      .filter(m => m.type === "sixes")
      .map(m => ({
        name: m.name,
        noValue: m.no_value,
        yesValue: m.yes_value,
        noStake: 100,
        yesStake: 100,
        completed: m.completed,
        suspended: m.suspended,
        ballRunning: m.ball_running,
      }));
  }, [backendSessionMarkets]);

  const getWicketsMarkets = useCallback(() => {
    if (!backendSessionMarkets?.markets) return [];
    return backendSessionMarkets.markets
      .filter(m => m.type === "wickets")
      .map(m => ({
        name: m.name,
        noValue: m.no_value,
        yesValue: m.yes_value,
        noStake: 100,
        yesStake: 100,
        completed: m.completed,
        suspended: m.suspended,
        ballRunning: m.ball_running,
      }));
  }, [backendSessionMarkets]);

  const getOverRunsMarkets = () => {
    // Use backend fours markets if available (renamed from "over runs" to avoid confusion with session markets)
    const foursData = getFoursMarkets();
    if (foursData.length > 0) return foursData;
    
    // Fallback static data
    return !match || match.sport !== "cricket" ? [] : [
      { name: "Match 1st Over Runs", noValue: 5, yesValue: 7, noStake: 100, yesStake: 100 },
      { name: "Powerplay Runs", noValue: 42, yesValue: 45, noStake: 100, yesStake: 100 },
      { name: "1st 6 Overs Runs", noValue: 48, yesValue: 51, noStake: 100, yesStake: 100 },
    ];
  };
  const getFallOfWicketsMarkets = () => {
    // Use backend wickets markets if available
    const wicketsData = getWicketsMarkets();
    if (wicketsData.length > 0) return wicketsData;
    
    return !match || match.sport !== "cricket" ? [] : [
      { name: "Fall of 1st Wkt", noValue: 18, yesValue: 22, noStake: 100, yesStake: 100 },
      { name: "1st 2 Wkt Runs", noValue: 35, yesValue: 40, noStake: 100, yesStake: 100 },
    ];
  };
  const getTeamTotalMarkets = () => {
    // Use backend sixes markets if available
    const sixesData = getSixesMarkets();
    if (sixesData.length > 0) return sixesData;
    
    if (!match) return [];
    const hs = match.home_team?.substring(0, 3).toUpperCase() || "HOM";
    const as2 = match.away_team?.substring(0, 3).toUpperCase() || "AWY";
    return [
      { name: `${hs} Total Runs O/U 165.5`, noValue: 1.90, yesValue: 1.90, noStake: 100, yesStake: 100 },
      { name: `${as2} Total Runs O/U 165.5`, noValue: 1.90, yesValue: 1.90, noStake: 100, yesStake: 100 },
    ];
  };
  const getPartnershipMarkets = () => !match || match.sport !== "cricket" ? [] : [
    { name: "Current Partnership 25+", noValue: 1.80, yesValue: 2.00, noStake: 100, yesStake: 100 },
    { name: "Current Partnership 50+", noValue: 2.50, yesValue: 3.20, noStake: 100, yesStake: 100 },
  ];
  const getSpecialMarkets = () => !match || match.sport !== "cricket" ? [] : [
    { name: "Batsman 50 in Match", noValue: 1.70, yesValue: 2.10, noStake: 100, yesStake: 100 },
    { name: "Batsman 100 in Match", noValue: 3.50, yesValue: 4.50, noStake: 100, yesStake: 100 },
    { name: "Total Sixes 12+", noValue: 1.85, yesValue: 1.95, noStake: 100, yesStake: 100 },
  ];

  // ==================== LOADING / ERROR ====================
  if (loading) return (
    <div className="min-h-screen bg-[#0D1117]">
      <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
      </div>
    </div>
  );
  if (error || !match) return (
    <div className="min-h-screen bg-[#0D1117]">
      <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error || "Match not found"}</p>
          <button onClick={() => navigate("/")} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg">Back to Home</button>
        </div>
      </div>
    </div>
  );

  const isLive = match.status === "live";
  const isCricket = match.sport === "cricket";
  const isSuspended = isLive && (ballRunning || matchSuspended);
  const totalStake = betSlip.reduce((s, b) => s + (parseFloat(b.stake) || 0), 0);
  const potentialProfit = betSlip.reduce((s, b) => { const st = parseFloat(b.stake) || 0; return s + (b.type === "Back" ? st * (b.odds - 1) : st); }, 0);
  const potentialLoss = betSlip.reduce((s, b) => { const st = parseFloat(b.stake) || 0; return s + (b.type === "Back" ? st : st * (b.odds - 1)); }, 0);

  // ==================== RENDER TEAM ROW (SINGLE BACK + LAY) ====================
  const renderTeamOddsRow = (teamName, teamData, teamKey) => {
    const backs = teamData?.back || [];
    const lays = teamData?.lay || [];
    const backSizes = teamData?.backSizes || [];
    const laySizes = teamData?.laySizes || [];
    const exp = teamKey === "home" ? exposure.home_exposure : exposure.away_exposure;

    // Best back (first element) and best lay (first element)
    const bestBack = backs[0];
    const bestLay = lays[0];
    const bestBackSize = backSizes[0];
    const bestLaySize = laySizes[0];

    return (
      <div className="flex items-stretch border-b border-gray-700/50" data-testid={`${teamKey}-team-row`}>
        {/* Team Name + Exposure */}
        <div className="flex-1 min-w-[120px] p-2 md:p-3 flex flex-col justify-center bg-[#1E2736]">
          <span className="text-xs md:text-sm text-white font-medium">{teamName}</span>
          {user && exp !== 0 && (
            <span className={`text-[11px] font-bold ${exp > 0 ? "text-green-400" : "text-red-400"}`} data-testid={`${teamKey}-exposure`}>
              {exp > 0 ? "+" : ""}{exp.toFixed(0)}
            </span>
          )}
        </div>
        {/* Single Back cell */}
        <OddsCell price={bestBack} size={bestBackSize} type="back" isBest={true} onClick={() => addToBetSlip(teamName, "Back", bestBack)} suspended={isSuspended} />
        {/* Single Lay cell */}
        <OddsCell price={bestLay} size={bestLaySize} type="lay" isBest={true} onClick={() => addToBetSlip(teamName, "Lay", bestLay)} suspended={isSuspended} />
      </div>
    );
  };

  // ==================== BET SLIP ITEM ====================
  const renderBetSlipItem = (bet) => {
    const stake = parseFloat(bet.stake) || 0;
    return (
      <div key={bet.id} className="bg-[#1E2736] rounded-lg p-3">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-white text-sm font-medium">{bet.selection}</p>
            <p className="text-gray-400 text-xs">{bet.type} @ {typeof bet.odds === 'number' ? bet.odds.toFixed(2) : bet.odds}</p>
          </div>
          <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400"><X className="w-4 h-4" /></button>
        </div>
        <input type="number" value={bet.stake} onChange={e => updateStake(bet.id, e.target.value)} placeholder="Stake"
          className="w-full bg-[#0D1117] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500" data-testid="stake-input" />
        {stake > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Stake:</span>
              <span className="text-white font-medium" data-testid="bet-stake-value">₹{stake.toLocaleString("en-IN")}</span>
            </div>
            {bet.type === "Back" ? (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Profit:</span>
                  <span className="text-green-400 font-medium" data-testid="bet-profit-value">+₹{(stake * (bet.odds - 1)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Loss:</span>
                  <span className="text-red-400 font-medium" data-testid="bet-loss-value">-₹{stake.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Profit:</span>
                  <span className="text-green-400 font-medium" data-testid="bet-profit-value">+₹{stake.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Liability:</span>
                  <span className="text-red-400 font-medium" data-testid="bet-liability-value">-₹{(stake * (bet.odds - 1)).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0D1117]" data-testid="match-page">
      <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />

      {/* Breadcrumb */}
      <div className="bg-[#161B22] border-b border-gray-800">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-1"><Home className="w-4 h-4" />Home</Link>
            <ChevronLeft className="w-4 h-4 text-gray-600 rotate-180" />
            <span className="text-gray-400">{isCricket ? "Cricket" : "Football"}</span>
            <ChevronLeft className="w-4 h-4 text-gray-600 rotate-180" />
            <span className="text-white font-medium truncate max-w-[200px]">{match.home_team} vs {match.away_team}</span>
          </div>
        </div>
      </div>

      {/* Match Header */}
      <div className="bg-gradient-to-r from-[#1a2744] to-[#243a5e] border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <button onClick={() => navigate("/")} className="p-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg" data-testid="back-button">
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-cyan-400 font-medium">{match.league || "Unknown League"}</span>
                  {match.format && <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">{match.format}</span>}
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-white mb-2">{match.home_team} vs {match.away_team}</h1>
                <div className="flex items-center gap-3 flex-wrap">
                  {isLive ? (
                    <div className="flex items-center gap-1.5 bg-red-600 px-2 py-1 rounded">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-white">LIVE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-amber-600 px-2 py-1 rounded">
                      <Clock className="w-3 h-3 text-white" /><span className="text-xs font-bold text-white">SCHEDULED</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-gray-300 text-xs"><Calendar className="w-3.5 h-3.5" />{formatIndianDateTime(match.commence_time)}</div>
                  {match.venue && <div className="flex items-center gap-1.5 text-gray-300 text-xs"><MapPin className="w-3.5 h-3.5" />{match.venue}</div>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {match.features?.has_tv && <div className="flex items-center gap-1 bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs font-medium"><Tv className="w-3.5 h-3.5" />TV</div>}
              </div>
              {isLive && (
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${wsConnected ? "bg-green-600/20 text-green-400" : "bg-yellow-600/20 text-yellow-400"}`}>
                    {wsConnected ? <><Wifi className="w-3.5 h-3.5" /><span>Live</span></> : <><WifiOff className="w-3.5 h-3.5" /><span>Polling</span></>}
                  </div>
                  {lastOddsUpdate && <div className="flex items-center gap-1.5 text-gray-400 text-xs"><RefreshCw className="w-3.5 h-3.5" /><span>Updated {lastOddsUpdate.toLocaleTimeString()}</span></div>}
                </div>
              )}
            </div>
          </div>

          {/* Live Score */}
          {isLive && (
            <div className="mt-4 bg-[#1E2736] rounded-lg p-4" data-testid="live-score-section">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-bold text-sm">LIVE SCORE</span>
              </div>
              {match.score?.length > 0 ? (
                <div className="text-white text-lg font-bold">
                  {match.score.map((s) => {
                    if (typeof s === "string") return s;
                    if (typeof s === "object" && s) { const r = s.r || ""; const o = s.o || ""; return r && o ? `${r} (${o} ov)` : r || s.inning || JSON.stringify(s); }
                    return String(s);
                  }).join(" | ")}
                </div>
              ) : <div className="text-gray-400 text-sm">Score updates will appear here once available.</div>}
            </div>
          )}
        </div>
      </div>

      {/* TABS: ODDS | MATCHED BET */}
      <div className="bg-[#161B22] border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-0">
            <button
              onClick={() => setActiveTab("odds")}
              className={`px-4 py-2.5 text-xs font-bold uppercase border-b-2 transition-colors ${activeTab === "odds" ? "text-white border-cyan-400" : "text-gray-400 border-transparent hover:text-gray-200"}`}
              data-testid="odds-tab"
            >ODDS</button>
            <span className="text-gray-600 text-xs">|</span>
            <button
              onClick={() => setActiveTab("matched")}
              className={`px-4 py-2.5 text-xs font-bold uppercase border-b-2 transition-colors ${activeTab === "matched" ? "text-white border-cyan-400" : "text-gray-400 border-transparent hover:text-gray-200"}`}
              data-testid="matched-bets-tab"
            >MATCHED BET {matchedBets.length > 0 && <span className="ml-1 bg-cyan-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{matchedBets.length}</span>}</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4">
        {activeTab === "matched" ? (
          /* ==================== MATCHED BETS VIEW ==================== */
          <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="matched-bets-section">
            <div className="bg-[#2C3E50] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white uppercase">{match.home_team} v {match.away_team}</span>
                <span className="text-xs text-gray-400">{formatIndianDateTime(match.commence_time)}</span>
              </div>
            </div>
            {/* Table Header */}
            <div className="flex items-center bg-[#232B36] border-b border-gray-700 px-4 py-2">
              <span className="flex-1 text-[10px] text-gray-400 font-bold uppercase">Matched Bet</span>
              <span className="w-20 text-center text-[10px] text-gray-400 font-bold uppercase">Odds</span>
              <span className="w-20 text-center text-[10px] text-gray-400 font-bold uppercase">Stake</span>
            </div>
            {matchedBets.length > 0 ? matchedBets.map((bet, idx) => (
              <div key={idx} className={`flex items-center px-4 py-3 border-b border-gray-700/50 ${bet.bet_type === "back" ? "bg-[#1a56db]/10" : "bg-[#991b1b]/10"}`}
                data-testid={`matched-bet-row-${idx}`}>
                <span className="flex-1 text-sm text-white font-medium">{bet.selected_team}</span>
                <span className="w-20 text-center text-sm text-white font-bold">{bet.odds?.toFixed(2)}</span>
                <span className="w-20 text-center text-sm text-white font-bold">{bet.stake}</span>
              </div>
            )) : (
              <div className="py-8 text-center text-gray-400 text-sm">No matched bets yet</div>
            )}
          </div>
        ) : (
          /* ==================== ODDS VIEW ==================== */
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 space-y-3">
              {/* Upcoming Message */}
              {!isLive && (
                <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-amber-400"><Clock className="w-5 h-5" /><span className="font-medium">Match has not started yet</span></div>
                  <p className="text-amber-300/70 text-sm mt-1">Place your bets now! All markets are available for pre-match betting.</p>
                </div>
              )}

              {/* ==================== MATCH ODDS (3-LEVEL) ==================== */}
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="match-odds-section">
                <MarketHeader title="MATCH_ODDS" isExpanded={expandedMarkets.matchOdds} onToggle={() => toggleMarket("matchOdds")} />
                {expandedMarkets.matchOdds && (
                  <>
                    <div className="flex items-center px-3 py-1.5 bg-[#1a2332] border-b border-gray-700/50">
                      <span className="text-[11px] text-cyan-400 font-medium" data-testid="min-max-label">Max: 1L</span>
                    </div>
                    <MatchOddsHeader />
                    {isLive && (ballRunning || matchSuspended) && (
                      <div className="flex items-center justify-center py-1 bg-red-900/40">
                        <span className="text-xs font-bold text-red-400 animate-pulse" data-testid="match-odds-status">{ballRunning ? "BALL RUNNING" : "SUSPENDED"}</span>
                      </div>
                    )}
                    {liveOdds && renderTeamOddsRow(match.home_team, liveOdds.home, "home")}
                    {liveOdds && renderTeamOddsRow(match.away_team, liveOdds.away, "away")}
                    {!liveOdds && (
                      <div className="py-6 text-center text-gray-500 text-sm">Odds not available for this match</div>
                    )}
                  </>
                )}
              </div>

              {/* ==================== SESSION MARKETS ==================== */}
              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="session-markets-section">
                  <MarketHeader title="Session Markets" isExpanded={expandedMarkets.sessionMarkets} onToggle={() => toggleMarket("sessionMarkets")} />
                  {expandedMarkets.sessionMarkets && (
                    <>
                      <SessionColumnHeaders />
                      {getSessionMarkets().map((s, i) => <SessionRow key={i} {...s} ballRunning={s.ballRunning || (isLive && ballRunning)} suspended={s.suspended || (isLive && matchSuspended)} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "session")} />)}
                    </>
                  )}
                </div>
              )}

              {isCricket && <TiedMatchMarket match={match} onSelectOdds={addToBetSlip} ballRunning={isLive && ballRunning} matchSuspended={isLive && matchSuspended} />}

              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="over-runs-section">
                  <MarketHeader title="4 Runs / Over Runs" isExpanded={expandedMarkets.overRuns} onToggle={() => toggleMarket("overRuns")} />
                  {expandedMarkets.overRuns && (<><SessionColumnHeaders />{getOverRunsMarkets().map((m2, i) => <SessionRow key={i} {...m2} ballRunning={m2.ballRunning || (isLive && ballRunning)} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "over")} />)}</>)}
                </div>
              )}
              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="fall-of-wickets-section">
                  <MarketHeader title="Wicket Markets" isExpanded={expandedMarkets.fallOfWickets} onToggle={() => toggleMarket("fallOfWickets")} />
                  {expandedMarkets.fallOfWickets && (<><SessionColumnHeaders />{getFallOfWicketsMarkets().map((m2, i) => <SessionRow key={i} {...m2} ballRunning={m2.ballRunning || (isLive && ballRunning)} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "wicket")} />)}</>)}
                </div>
              )}
              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="team-total-section">
                  <MarketHeader title="6 Runs / Sixes" isExpanded={expandedMarkets.teamTotal} onToggle={() => toggleMarket("teamTotal")} />
                  {expandedMarkets.teamTotal && (<><SessionColumnHeaders />{getTeamTotalMarkets().map((m2, i) => <SessionRow key={i} {...m2} ballRunning={m2.ballRunning || (isLive && ballRunning)} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "total")} />)}</>)}
                </div>
              )}
              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="partnership-section">
                  <MarketHeader title="Partnership Markets" isExpanded={expandedMarkets.partnership} onToggle={() => toggleMarket("partnership")} />
                  {expandedMarkets.partnership && (<><SessionColumnHeaders />{getPartnershipMarkets().map((m2, i) => <SessionRow key={i} {...m2} ballRunning={isLive && ballRunning} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "partnership")} />)}</>)}
                </div>
              )}
              {isCricket && (
                <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="special-markets-section">
                  <MarketHeader title="Special Markets" isExpanded={expandedMarkets.specialMarkets} onToggle={() => toggleMarket("specialMarkets")} />
                  {expandedMarkets.specialMarkets && (<><SessionColumnHeaders />{getSpecialMarkets().map((m2, i) => <SessionRow key={i} {...m2} ballRunning={isLive && ballRunning} onSelect={(n, t, v) => addToBetSlip(`${n} ${t}`, t, v, "special")} />)}</>)}
                </div>
              )}
            </div>

            {/* ==================== BET SLIP SIDEBAR (DESKTOP) ==================== */}
            <div className="hidden lg:block w-80 sticky top-4 h-fit" data-testid="bet-slip-sidebar">
              <div className="bg-[#161B22] rounded-lg overflow-hidden">
                <div className="bg-[#2C3E50] px-4 py-3 flex items-center justify-between">
                  <span className="font-bold text-white">Bet Slip</span>
                  <span className="bg-cyan-600 text-white text-xs px-2 py-0.5 rounded-full">{betSlip.length}</span>
                </div>
                <div className="p-4">
                  {betSlip.length === 0 ? (
                    <div className="text-center py-8"><p className="text-gray-400 text-sm">Click on odds to add selections</p></div>
                  ) : (
                    <div className="space-y-3">
                      {betSlip.map(renderBetSlipItem)}
                      <div className="border-t border-gray-700 pt-3 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-gray-400">Total Stake:</span><span className="text-white font-medium" data-testid="total-stake">₹{totalStake.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-400">Potential Profit:</span><span className="text-green-400 font-medium" data-testid="total-profit">+₹{potentialProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-400">Potential Loss:</span><span className="text-red-400 font-medium" data-testid="total-loss">-₹{potentialLoss.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={clearBetSlip} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded">Clear</button>
                        <button onClick={placeBets} className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded" data-testid="place-bet-btn">Place Bet</button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Your Balance:</span><span className="text-cyan-400 font-bold">₹{balance.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#161B22] border-t border-gray-700 z-40">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white p-2"><Home className="w-5 h-5" /><span className="text-[10px]">Home</span></Link>
          <button onClick={() => setShowMobileBetSlip(true)} className="flex flex-col items-center gap-0.5 text-cyan-400 p-2 relative" data-testid="mobile-bet-slip-btn">
            <Trophy className="w-5 h-5" /><span className="text-[10px]">Bet Slip</span>
            {betSlip.length > 0 && <span className="absolute -top-1 right-0 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{betSlip.length}</span>}
          </button>
        </div>
      </div>

      {/* ==================== MOBILE BET SLIP MODAL ==================== */}
      {showMobileBetSlip && (
        <div className="lg:hidden fixed inset-0 bg-black/70 z-50" onClick={() => setShowMobileBetSlip(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-[#161B22] rounded-t-2xl max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[#2C3E50] px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-white">Bet Slip ({betSlip.length})</span>
              <button onClick={() => setShowMobileBetSlip(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              {betSlip.length === 0 ? (
                <div className="text-center py-8"><p className="text-gray-400">No selections yet</p></div>
              ) : (
                <div className="space-y-3">
                  {betSlip.map(renderBetSlipItem)}
                  <div className="border-t border-gray-700 pt-3 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Total Stake:</span><span className="text-white font-medium">₹{totalStake.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Potential Profit:</span><span className="text-green-400 font-medium">+₹{potentialProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Potential Loss:</span><span className="text-red-400 font-medium">-₹{potentialLoss.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-400">Balance:</span><span className="text-cyan-400 font-bold">₹{balance.toFixed(2)}</span></div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={clearBetSlip} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg">Clear All</button>
                    <button onClick={placeBets} className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg">Place Bet</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="lg:hidden h-16"></div>
    </div>
  );
}
