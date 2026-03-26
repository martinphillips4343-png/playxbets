import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import PublicHeader from "@/components/PublicHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";
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
} from "lucide-react";

// ==================== CONSTANTS ====================
const LIVE_REFRESH_INTERVAL = 3000; // 3 seconds for live matches
const UPCOMING_REFRESH_INTERVAL = 30000; // 30 seconds for upcoming

// ==================== ODDS CELL COMPONENTS ====================
const BackOddsCell = ({ odds, stake, onClick, suspended = false, size = "normal" }) => {
  if (suspended) {
    return (
      <div className={`flex flex-col items-center justify-center ${size === "large" ? "p-3 min-w-[80px]" : "p-1.5 min-w-[60px]"} bg-[#72BBEF]/30 text-gray-400`}>
        <span className={`${size === "large" ? "text-lg" : "text-sm"} font-bold`}>-</span>
        <span className="text-[9px]">-</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center ${size === "large" ? "p-3 min-w-[80px]" : "p-1.5 min-w-[60px]"} bg-[#72BBEF] hover:bg-[#5BA8DC] transition-all cursor-pointer active:scale-95`}
      data-testid="back-odds-btn"
    >
      <span className={`${size === "large" ? "text-lg" : "text-sm"} font-bold text-gray-900`}>{typeof odds === "number" ? odds.toFixed(2) : odds}</span>
      <span className="text-[9px] text-gray-700">{stake?.toLocaleString() || ""}</span>
    </button>
  );
};

const LayOddsCell = ({ odds, stake, onClick, suspended = false, size = "normal" }) => {
  if (suspended) {
    return (
      <div className={`flex flex-col items-center justify-center ${size === "large" ? "p-3 min-w-[80px]" : "p-1.5 min-w-[60px]"} bg-[#FAA9BA]/30 text-gray-400`}>
        <span className={`${size === "large" ? "text-lg" : "text-sm"} font-bold`}>-</span>
        <span className="text-[9px]">-</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center ${size === "large" ? "p-3 min-w-[80px]" : "p-1.5 min-w-[60px]"} bg-[#FAA9BA] hover:bg-[#E8899A] transition-all cursor-pointer active:scale-95`}
      data-testid="lay-odds-btn"
    >
      <span className={`${size === "large" ? "text-lg" : "text-sm"} font-bold text-gray-900`}>{typeof odds === "number" ? odds.toFixed(2) : odds}</span>
      <span className="text-[9px] text-gray-700">{stake?.toLocaleString() || ""}</span>
    </button>
  );
};

// ==================== SESSION ROW COMPONENT ====================
const SessionRow = ({ name, noValue, yesValue, noStake, yesStake, onSelect, suspended = false }) => {
  return (
    <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
      <div className="flex-1 min-w-[180px] p-2 md:p-3 flex items-center">
        <span className="text-xs md:text-sm text-white font-medium">{name}</span>
      </div>
      <div className="flex">
        <button
          onClick={() => !suspended && onSelect(name, "No", noValue)}
          disabled={suspended}
          className={`flex flex-col items-center justify-center p-1.5 w-[65px] ${
            suspended ? "bg-[#FAA9BA]/30 text-gray-400" : "bg-[#FAA9BA] hover:bg-[#E8899A]"
          } transition-colors`}
          data-testid="session-no-btn"
        >
          <span className="text-sm font-bold text-gray-900">{noValue}</span>
          <span className="text-[9px] text-gray-700">{noStake}</span>
        </button>
        <button
          onClick={() => !suspended && onSelect(name, "Yes", yesValue)}
          disabled={suspended}
          className={`flex flex-col items-center justify-center p-1.5 w-[65px] ${
            suspended ? "bg-[#72BBEF]/30 text-gray-400" : "bg-[#72BBEF] hover:bg-[#5BA8DC]"
          } transition-colors`}
          data-testid="session-yes-btn"
        >
          <span className="text-sm font-bold text-gray-900">{yesValue}</span>
          <span className="text-[9px] text-gray-700">{yesStake}</span>
        </button>
      </div>
    </div>
  );
};

// ==================== MARKET HEADER COMPONENT ====================
const MarketHeader = ({ title, isExpanded, onToggle, maxBet, minBet }) => {
  return (
    <div
      className="flex items-center justify-between bg-[#2C3E50] px-3 py-2 cursor-pointer"
      onClick={onToggle}
      data-testid={`market-header-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs md:text-sm font-bold text-white uppercase">{title}</span>
        {minBet && maxBet && (
          <span className="text-[10px] text-cyan-400">
            Min:{minBet} Max:{maxBet}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </div>
    </div>
  );
};

// ==================== COLUMN HEADERS ====================
// Match Odds: Single Back + Lay column (centered headers)
const MatchOddsColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[120px] p-2"></div>
    <div className="w-[80px] p-1 flex items-center justify-center bg-[#72BBEF]/10">
      <span className="text-[10px] font-bold text-[#72BBEF]">Back</span>
    </div>
    <div className="w-[80px] p-1 flex items-center justify-center bg-[#FAA9BA]/10">
      <span className="text-[10px] font-bold text-[#FAA9BA]">Lay</span>
    </div>
  </div>
);

// Bookmaker/Other Markets: 3 Back + 3 Lay columns
const ColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[120px] p-2"></div>
    <div className="flex">
      <div className="w-[60px] p-1 text-center bg-[#72BBEF]/10">
        <span className="text-[10px] font-bold text-[#72BBEF]">Back</span>
      </div>
      <div className="w-[60px] p-1 text-center hidden md:block"></div>
      <div className="w-[60px] p-1 text-center hidden md:block"></div>
    </div>
    <div className="flex">
      <div className="w-[60px] p-1 text-center bg-[#FAA9BA]/10">
        <span className="text-[10px] font-bold text-[#FAA9BA]">Lay</span>
      </div>
      <div className="w-[60px] p-1 text-center hidden md:block"></div>
      <div className="w-[60px] p-1 text-center hidden md:block"></div>
    </div>
  </div>
);

const SessionColumnHeaders = () => (
  <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
    <div className="flex-1 min-w-[180px] p-2">
      <span className="text-[10px] text-cyan-400 font-semibold">Session</span>
    </div>
    <div className="flex">
      <div className="w-[65px] p-1 text-center bg-[#FAA9BA]/20">
        <span className="text-[10px] font-bold text-[#FAA9BA]">No</span>
      </div>
      <div className="w-[65px] p-1 text-center bg-[#72BBEF]/20">
        <span className="text-[10px] font-bold text-[#72BBEF]">Yes</span>
      </div>
    </div>
  </div>
);

// ==================== MAIN COMPONENT ====================
export default function MatchPage({ user, onShowAuth, onLogout }) {
  const { matchId } = useParams();
  const navigate = useNavigate();

  // State
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(0);
  const [betSlip, setBetSlip] = useState([]);
  const [showMobileBetSlip, setShowMobileBetSlip] = useState(false);
  const [lastOddsUpdate, setLastOddsUpdate] = useState(null);

  // Expanded markets state
  const [expandedMarkets, setExpandedMarkets] = useState({
    matchOdds: true,
    bookmaker: true,
    sessionMarkets: false,
    overRuns: false,
    fallOfWickets: false,
    teamTotal: false,
    partnership: false,
    specialMarkets: false,
  });

  // Simulated odds state (for live matches)
  const [liveOdds, setLiveOdds] = useState(null);
  const refreshIntervalRef = useRef(null);
  const oddsIntervalRef = useRef(null);

  // ==================== FETCH MATCH DETAILS ====================
  const fetchMatch = useCallback(async () => {
    try {
      const response = await api.get(`/match/${matchId}`);
      setMatch(response.data);
      setError(null);

      // Initialize live odds from match data
      if (!liveOdds && response.data) {
        setLiveOdds({
          home: {
            back: [response.data.odds?.home || 1.85, (response.data.odds?.home || 1.85) - 0.01, (response.data.odds?.home || 1.85) - 0.02],
            lay: [(response.data.odds?.home || 1.85) + 0.02, (response.data.odds?.home || 1.85) + 0.03, (response.data.odds?.home || 1.85) + 0.04],
            backStakes: [50000, 30000, 20000],
            layStakes: [45000, 25000, 15000],
          },
          away: {
            back: [response.data.odds?.away || 1.95, (response.data.odds?.away || 1.95) - 0.01, (response.data.odds?.away || 1.95) - 0.02],
            lay: [(response.data.odds?.away || 1.95) + 0.02, (response.data.odds?.away || 1.95) + 0.03, (response.data.odds?.away || 1.95) + 0.04],
            backStakes: [40000, 25000, 15000],
            layStakes: [35000, 20000, 10000],
          },
          draw: response.data.odds?.draw
            ? {
                back: [response.data.odds.draw, response.data.odds.draw - 0.02, response.data.odds.draw - 0.04],
                lay: [response.data.odds.draw + 0.02, response.data.odds.draw + 0.04, response.data.odds.draw + 0.06],
                backStakes: [30000, 20000, 10000],
                layStakes: [25000, 15000, 8000],
              }
            : null,
        });
      }
    } catch (err) {
      console.error("Error fetching match:", err);
      setError("Failed to load match details");
    } finally {
      setLoading(false);
    }
  }, [matchId, liveOdds]);

  // ==================== FETCH WALLET ====================
  const fetchWallet = useCallback(async () => {
    if (!user) {
      setBalance(1500); // Demo balance for non-logged in users
      return;
    }
    try {
      const response = await api.get("/wallet");
      setBalance(response.data.balance || 0);
    } catch (err) {
      setBalance(1500);
    }
  }, [user]);

  // ==================== SIMULATE ODDS CHANGES (LIVE MATCHES) ====================
  const simulateOddsChange = useCallback(() => {
    if (!match || match.status !== "live" || !liveOdds) return;

    setLiveOdds((prev) => {
      if (!prev) return prev;

      const randomVariation = () => (Math.random() - 0.5) * 0.04;
      const newOdds = {
        home: {
          back: prev.home.back.map((o) => Math.max(1.01, +(o + randomVariation()).toFixed(2))),
          lay: prev.home.lay.map((o) => Math.max(1.02, +(o + randomVariation()).toFixed(2))),
          backStakes: prev.home.backStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
          layStakes: prev.home.layStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
        },
        away: {
          back: prev.away.back.map((o) => Math.max(1.01, +(o + randomVariation()).toFixed(2))),
          lay: prev.away.lay.map((o) => Math.max(1.02, +(o + randomVariation()).toFixed(2))),
          backStakes: prev.away.backStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
          layStakes: prev.away.layStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 5000))),
        },
        draw: prev.draw
          ? {
              back: prev.draw.back.map((o) => Math.max(1.01, +(o + randomVariation()).toFixed(2))),
              lay: prev.draw.lay.map((o) => Math.max(1.02, +(o + randomVariation()).toFixed(2))),
              backStakes: prev.draw.backStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 3000))),
              layStakes: prev.draw.layStakes.map((s) => Math.max(1000, s + Math.floor((Math.random() - 0.5) * 3000))),
            }
          : null,
      };

      return newOdds;
    });

    setLastOddsUpdate(new Date());
  }, [match, liveOdds]);

  // ==================== EFFECTS ====================
  useEffect(() => {
    fetchMatch();
    fetchWallet();
  }, [fetchMatch, fetchWallet]);

  // Set up polling based on match status
  useEffect(() => {
    if (!match) return;

    const interval = match.status === "live" ? LIVE_REFRESH_INTERVAL : UPCOMING_REFRESH_INTERVAL;

    // Clear existing intervals
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    if (oddsIntervalRef.current) clearInterval(oddsIntervalRef.current);

    // Set up match data refresh
    refreshIntervalRef.current = setInterval(fetchMatch, interval);

    // Set up odds simulation for live matches
    if (match.status === "live") {
      oddsIntervalRef.current = setInterval(simulateOddsChange, 2000);
    }

    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (oddsIntervalRef.current) clearInterval(oddsIntervalRef.current);
    };
  }, [match?.status, fetchMatch, simulateOddsChange]);

  // ==================== BET SLIP FUNCTIONS ====================
  const addToBetSlip = (selection, type, odds, marketType = "match") => {
    if (!user) {
      onShowAuth && onShowAuth("login");
      toast.error("Please login to place bets");
      return;
    }

    setBetSlip((prev) => {
      const exists = prev.find((b) => b.selection === selection && b.type === type && b.marketType === marketType);
      if (exists) {
        toast.info("Already in bet slip");
        return prev;
      }
      toast.success(`Added: ${selection} @ ${odds.toFixed(2)}`);
      setShowMobileBetSlip(true);
      return [...prev, { id: Date.now(), selection, type, odds, stake: "", marketType, status: "pending" }];
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
    toast.info("Bet slip cleared");
  };

  const placeBets = async () => {
    if (!user) {
      onShowAuth && onShowAuth("login");
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

    let successCount = 0;
    for (const bet of betSlip) {
      const stake = parseFloat(bet.stake) || 0;
      if (stake <= 0) continue;
      try {
        await api.post("/bets", {
          match_id: matchId,
          selected_team: bet.selection,
          odds: bet.odds,
          stake: stake,
          bet_type: bet.type.toLowerCase(),
          market_type: bet.marketType || "match",
        });
        successCount++;
      } catch (error) {
        if (error.response?.data?.detail) toast.error(error.response.data.detail);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} bet(s) placed successfully!`);
      setBetSlip([]);
      setShowMobileBetSlip(false);
      fetchWallet();
    }
  };

  const toggleMarket = (market) => {
    setExpandedMarkets((prev) => ({ ...prev, [market]: !prev[market] }));
  };

  // ==================== GENERATE SESSION MARKETS ====================
  const getSessionMarkets = () => {
    if (!match || match.sport !== "cricket") return [];
    
    const sessions = [];
    const overTargets = match.format === "odi" ? [10, 20, 30, 40, 50] : [6, 10, 15, 20];
    const homeShort = match.home_team?.substring(0, 3).toUpperCase() || "HOM";
    const awayShort = match.away_team?.substring(0, 3).toUpperCase() || "AWY";

    overTargets.forEach((ov) => {
      const baseRuns = Math.floor(ov * 8.2);
      sessions.push({
        name: `${ov} over runs ${homeShort}(${homeShort} vs ${awayShort})adv`,
        noValue: baseRuns - 2,
        yesValue: baseRuns,
        noStake: 100,
        yesStake: 100,
      });
    });

    return sessions;
  };

  const getOverRunsMarkets = () => {
    if (!match || match.sport !== "cricket") return [];
    return [
      { name: "Match 1st Over Runs", noValue: 5, yesValue: 7, noStake: 100, yesStake: 100 },
      { name: "Powerplay Runs", noValue: 42, yesValue: 45, noStake: 100, yesStake: 100 },
      { name: "1st 6 Overs Runs", noValue: 48, yesValue: 51, noStake: 100, yesStake: 100 },
    ];
  };

  const getFallOfWicketsMarkets = () => {
    if (!match || match.sport !== "cricket") return [];
    return [
      { name: "Fall of 1st Wkt", noValue: 18, yesValue: 22, noStake: 100, yesStake: 100 },
      { name: "1st 2 Wkt Runs", noValue: 35, yesValue: 40, noStake: 100, yesStake: 100 },
    ];
  };

  const getTeamTotalMarkets = () => {
    if (!match) return [];
    const homeShort = match.home_team?.substring(0, 3).toUpperCase() || "HOM";
    const awayShort = match.away_team?.substring(0, 3).toUpperCase() || "AWY";
    return [
      { name: `${homeShort} Total Runs O/U 165.5`, noValue: 1.90, yesValue: 1.90, noStake: 100, yesStake: 100 },
      { name: `${awayShort} Total Runs O/U 165.5`, noValue: 1.90, yesValue: 1.90, noStake: 100, yesStake: 100 },
    ];
  };

  const getPartnershipMarkets = () => {
    if (!match || match.sport !== "cricket") return [];
    return [
      { name: "Current Partnership 25+", noValue: 1.80, yesValue: 2.00, noStake: 100, yesStake: 100 },
      { name: "Current Partnership 50+", noValue: 2.50, yesValue: 3.20, noStake: 100, yesStake: 100 },
    ];
  };

  const getSpecialMarkets = () => {
    if (!match || match.sport !== "cricket") return [];
    return [
      { name: "Batsman 50 in Match", noValue: 1.70, yesValue: 2.10, noStake: 100, yesStake: 100 },
      { name: "Batsman 100 in Match", noValue: 3.50, yesValue: 4.50, noStake: 100, yesStake: 100 },
      { name: "Total Sixes 12+", noValue: 1.85, yesValue: 1.95, noStake: 100, yesStake: 100 },
    ];
  };

  // ==================== RENDER LOADING STATE ====================
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1117]">
        <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading match details...</p>
          </div>
        </div>
      </div>
    );
  }

  // ==================== RENDER ERROR STATE ====================
  if (error || !match) {
    return (
      <div className="min-h-screen bg-[#0D1117]">
        <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center">
            <p className="text-red-400 text-lg mb-4">{error || "Match not found"}</p>
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLive = match.status === "live";
  const isCricket = match.sport === "cricket";
  const totalStake = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
  const potentialProfit = betSlip.reduce((sum, b) => sum + (parseFloat(b.stake) || 0) * (b.odds - 1), 0);

  return (
    <div className="min-h-screen bg-[#0D1117]" data-testid="match-page">
      <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />

      {/* Breadcrumb */}
      <div className="bg-[#161B22] border-b border-gray-800">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-1">
              <Home className="w-4 h-4" />
              Home
            </Link>
            <ChevronLeft className="w-4 h-4 text-gray-600 rotate-180" />
            <span className="text-gray-400">{isCricket ? "Cricket" : "Football"}</span>
            <ChevronLeft className="w-4 h-4 text-gray-600 rotate-180" />
            <span className="text-white font-medium truncate max-w-[200px]">
              {match.home_team} vs {match.away_team}
            </span>
          </div>
        </div>
      </div>

      {/* Match Header */}
      <div className="bg-gradient-to-r from-[#1a2744] to-[#243a5e] border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Left: Match Info */}
            <div className="flex items-start gap-4">
              {/* Back Button */}
              <button
                onClick={() => navigate("/")}
                className="p-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors"
                data-testid="back-button"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>

              <div>
                {/* League */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-cyan-400 font-medium">{match.league || "Unknown League"}</span>
                  {match.format && (
                    <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">
                      {match.format}
                    </span>
                  )}
                </div>

                {/* Teams */}
                <h1 className="text-xl md:text-2xl font-bold text-white mb-2">
                  {match.home_team} vs {match.away_team}
                </h1>

                {/* Status & Time */}
                <div className="flex items-center gap-3 flex-wrap">
                  {isLive ? (
                    <div className="flex items-center gap-1.5 bg-red-600 px-2 py-1 rounded">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-white">LIVE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-amber-600 px-2 py-1 rounded">
                      <Clock className="w-3 h-3 text-white" />
                      <span className="text-xs font-bold text-white">SCHEDULED</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-gray-300 text-xs">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatIndianDateTime(match.commence_time)}
                  </div>

                  {match.venue && (
                    <div className="flex items-center gap-1.5 text-gray-300 text-xs">
                      <MapPin className="w-3.5 h-3.5" />
                      {match.venue}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Feature Badges & Refresh */}
            <div className="flex items-center gap-3">
              {/* Feature badges */}
              <div className="flex items-center gap-2">
                {match.features?.has_tv && (
                  <div className="flex items-center gap-1 bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs font-medium">
                    <Tv className="w-3.5 h-3.5" />
                    TV
                  </div>
                )}
                {match.features?.has_fancy && (
                  <div className="bg-orange-600/20 text-orange-400 px-2 py-1 rounded text-xs font-medium">F</div>
                )}
                {match.features?.has_bookmaker && (
                  <div className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-xs font-medium">BM</div>
                )}
              </div>

              {/* Last update indicator */}
              {isLive && lastOddsUpdate && (
                <div className="flex items-center gap-1.5 text-gray-400 text-xs">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Updated {lastOddsUpdate.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Score Section */}
          {isLive && match.score && match.score.length > 0 && (
            <div className="mt-4 bg-[#1E2736] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-bold text-sm">LIVE SCORE</span>
              </div>
              <div className="text-white text-lg font-bold">{match.score.join(" | ")}</div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Markets Section */}
          <div className="flex-1 space-y-3">
            {/* Upcoming Match Message */}
            {!isLive && (
              <div className="bg-amber-900/30 border border-amber-600/50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 text-amber-400">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">Match has not started yet</span>
                </div>
                <p className="text-amber-300/70 text-sm mt-1">
                  More markets will be available when the match goes live. Basic odds are shown below.
                </p>
              </div>
            )}

            {/* ==================== MATCH ODDS ==================== */}
            <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="match-odds-section">
              <MarketHeader
                title="Match Odds"
                isExpanded={expandedMarkets.matchOdds}
                onToggle={() => toggleMarket("matchOdds")}
              />
              {expandedMarkets.matchOdds && (
                <>
                  <MatchOddsColumnHeaders />
                  {/* Home Team */}
                  <div className="flex items-stretch border-b border-gray-700/50">
                    <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center bg-[#1E2736]">
                      <span className="text-sm text-white font-medium">{match.home_team}</span>
                    </div>
                    <BackOddsCell
                      odds={liveOdds?.home.back[0]}
                      stake={liveOdds?.home.backStakes[0]}
                      onClick={() => addToBetSlip(match.home_team, "Back", liveOdds?.home.back[0])}
                      size="large"
                    />
                    <LayOddsCell
                      odds={liveOdds?.home.lay[0]}
                      stake={liveOdds?.home.layStakes[0]}
                      onClick={() => addToBetSlip(match.home_team, "Lay", liveOdds?.home.lay[0])}
                      size="large"
                    />
                  </div>

                  {/* Draw (Football only) */}
                  {match.sport === "soccer" && liveOdds?.draw && (
                    <div className="flex items-stretch border-b border-gray-700/50">
                      <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center bg-[#1E2736]">
                        <span className="text-sm text-white font-medium">Draw</span>
                      </div>
                      <BackOddsCell
                        odds={liveOdds.draw.back[0]}
                        stake={liveOdds.draw.backStakes[0]}
                        onClick={() => addToBetSlip("Draw", "Back", liveOdds.draw.back[0])}
                        size="large"
                      />
                      <LayOddsCell
                        odds={liveOdds.draw.lay[0]}
                        stake={liveOdds.draw.layStakes[0]}
                        onClick={() => addToBetSlip("Draw", "Lay", liveOdds.draw.lay[0])}
                        size="large"
                      />
                    </div>
                  )}

                  {/* Away Team */}
                  <div className="flex items-stretch">
                    <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center bg-[#1E2736]">
                      <span className="text-sm text-white font-medium">{match.away_team}</span>
                    </div>
                    <BackOddsCell
                      odds={liveOdds?.away.back[0]}
                      stake={liveOdds?.away.backStakes[0]}
                      onClick={() => addToBetSlip(match.away_team, "Back", liveOdds?.away.back[0])}
                      size="large"
                    />
                    <LayOddsCell
                      odds={liveOdds?.away.lay[0]}
                      stake={liveOdds?.away.layStakes[0]}
                      onClick={() => addToBetSlip(match.away_team, "Lay", liveOdds?.away.lay[0])}
                      size="large"
                    />
                  </div>
                </>
              )}
            </div>

            {/* ==================== BOOKMAKER (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="bookmaker-section">
                <MarketHeader
                  title="Bookmaker"
                  isExpanded={expandedMarkets.bookmaker}
                  onToggle={() => toggleMarket("bookmaker")}
                  minBet="100"
                  maxBet="5L"
                />
                {expandedMarkets.bookmaker && (
                  <>
                    <ColumnHeaders />
                    <div className="flex items-stretch border-b border-gray-700/50">
                      <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center bg-[#1E2736]">
                        <span className="text-sm text-white font-medium">{match.home_team}</span>
                      </div>
                      <div className="flex">
                        <BackOddsCell odds={82} stake={100000} onClick={() => addToBetSlip(match.home_team, "Back", 82, "bookmaker")} />
                        <BackOddsCell odds={83} stake={80000} onClick={() => addToBetSlip(match.home_team, "Back", 83, "bookmaker")} />
                        <BackOddsCell odds={84} stake={50000} onClick={() => addToBetSlip(match.home_team, "Back", 84, "bookmaker")} />
                      </div>
                      <div className="flex">
                        <LayOddsCell odds={86} stake={90000} onClick={() => addToBetSlip(match.home_team, "Lay", 86, "bookmaker")} />
                        <LayOddsCell odds={87} stake={70000} onClick={() => addToBetSlip(match.home_team, "Lay", 87, "bookmaker")} />
                        <LayOddsCell odds={88} stake={40000} onClick={() => addToBetSlip(match.home_team, "Lay", 88, "bookmaker")} />
                      </div>
                    </div>
                    <div className="flex items-stretch">
                      <div className="flex-1 min-w-[120px] p-2 md:p-3 flex items-center bg-[#1E2736]">
                        <span className="text-sm text-white font-medium">{match.away_team}</span>
                      </div>
                      <div className="flex">
                        <BackOddsCell odds={115} stake={60000} onClick={() => addToBetSlip(match.away_team, "Back", 115, "bookmaker")} />
                        <BackOddsCell odds={116} stake={45000} onClick={() => addToBetSlip(match.away_team, "Back", 116, "bookmaker")} />
                        <BackOddsCell odds={117} stake={30000} onClick={() => addToBetSlip(match.away_team, "Back", 117, "bookmaker")} />
                      </div>
                      <div className="flex">
                        <LayOddsCell odds={119} stake={55000} onClick={() => addToBetSlip(match.away_team, "Lay", 119, "bookmaker")} />
                        <LayOddsCell odds={120} stake={40000} onClick={() => addToBetSlip(match.away_team, "Lay", 120, "bookmaker")} />
                        <LayOddsCell odds={121} stake={25000} onClick={() => addToBetSlip(match.away_team, "Lay", 121, "bookmaker")} />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ==================== SESSION MARKETS (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="session-markets-section">
                <MarketHeader
                  title="Session Markets"
                  isExpanded={expandedMarkets.sessionMarkets}
                  onToggle={() => toggleMarket("sessionMarkets")}
                />
                {expandedMarkets.sessionMarkets && (
                  <>
                    <SessionColumnHeaders />
                    {getSessionMarkets().map((session, idx) => (
                      <SessionRow
                        key={idx}
                        {...session}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "session")}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ==================== OVER RUNS (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="over-runs-section">
                <MarketHeader
                  title="Over Runs Markets"
                  isExpanded={expandedMarkets.overRuns}
                  onToggle={() => toggleMarket("overRuns")}
                />
                {expandedMarkets.overRuns && (
                  <>
                    <SessionColumnHeaders />
                    {getOverRunsMarkets().map((market, idx) => (
                      <SessionRow
                        key={idx}
                        {...market}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "over")}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ==================== FALL OF WICKETS (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="fall-of-wickets-section">
                <MarketHeader
                  title="Fall of Wickets"
                  isExpanded={expandedMarkets.fallOfWickets}
                  onToggle={() => toggleMarket("fallOfWickets")}
                />
                {expandedMarkets.fallOfWickets && (
                  <>
                    <SessionColumnHeaders />
                    {getFallOfWicketsMarkets().map((market, idx) => (
                      <SessionRow
                        key={idx}
                        {...market}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "wicket")}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ==================== TEAM TOTAL (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="team-total-section">
                <MarketHeader
                  title="Team Total Runs"
                  isExpanded={expandedMarkets.teamTotal}
                  onToggle={() => toggleMarket("teamTotal")}
                />
                {expandedMarkets.teamTotal && (
                  <>
                    <SessionColumnHeaders />
                    {getTeamTotalMarkets().map((market, idx) => (
                      <SessionRow
                        key={idx}
                        {...market}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "total")}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ==================== PARTNERSHIP (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="partnership-section">
                <MarketHeader
                  title="Partnership Markets"
                  isExpanded={expandedMarkets.partnership}
                  onToggle={() => toggleMarket("partnership")}
                />
                {expandedMarkets.partnership && (
                  <>
                    <SessionColumnHeaders />
                    {getPartnershipMarkets().map((market, idx) => (
                      <SessionRow
                        key={idx}
                        {...market}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "partnership")}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ==================== SPECIAL MARKETS (LIVE CRICKET ONLY) ==================== */}
            {isLive && isCricket && (
              <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="special-markets-section">
                <MarketHeader
                  title="Special Markets"
                  isExpanded={expandedMarkets.specialMarkets}
                  onToggle={() => toggleMarket("specialMarkets")}
                />
                {expandedMarkets.specialMarkets && (
                  <>
                    <SessionColumnHeaders />
                    {getSpecialMarkets().map((market, idx) => (
                      <SessionRow
                        key={idx}
                        {...market}
                        onSelect={(name, type, value) => addToBetSlip(`${name} ${type}`, type, value, "special")}
                      />
                    ))}
                  </>
                )}
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
                  <div className="text-center py-8">
                    <p className="text-gray-400 text-sm">Click on odds to add selections</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {betSlip.map((bet) => (
                      <div key={bet.id} className="bg-[#1E2736] rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-white text-sm font-medium">{bet.selection}</p>
                            <p className="text-gray-400 text-xs">
                              {bet.type} @ {bet.odds.toFixed(2)}
                            </p>
                          </div>
                          <button
                            onClick={() => removeFromBetSlip(bet.id)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <input
                          type="number"
                          value={bet.stake}
                          onChange={(e) => updateStake(bet.id, e.target.value)}
                          placeholder="Stake"
                          className="w-full bg-[#0D1117] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500"
                        />
                        {bet.stake && (
                          <div className="flex justify-between mt-2 text-xs">
                            <span className="text-gray-400">Profit:</span>
                            <span className="text-green-400 font-medium">
                              +₹{((parseFloat(bet.stake) || 0) * (bet.odds - 1)).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Totals */}
                    <div className="border-t border-gray-700 pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total Stake:</span>
                        <span className="text-white font-medium">₹{totalStake.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Potential Profit:</span>
                        <span className="text-green-400 font-medium">+₹{potentialProfit.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={clearBetSlip}
                        className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded transition-colors"
                      >
                        Clear
                      </button>
                      <button
                        onClick={placeBets}
                        className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded transition-colors"
                        data-testid="place-bet-btn"
                      >
                        Place Bet
                      </button>
                    </div>
                  </div>
                )}

                {/* Balance */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Your Balance:</span>
                    <span className="text-cyan-400 font-bold">₹{balance.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== MOBILE BOTTOM NAV ==================== */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#161B22] border-t border-gray-700 z-40">
        <div className="flex items-center justify-around py-2">
          <Link to="/" className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white p-2">
            <Home className="w-5 h-5" />
            <span className="text-[10px]">Home</span>
          </Link>
          <button
            onClick={() => setShowMobileBetSlip(true)}
            className="flex flex-col items-center gap-0.5 text-cyan-400 p-2 relative"
            data-testid="mobile-bet-slip-btn"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-[10px]">Bet Slip</span>
            {betSlip.length > 0 && (
              <span className="absolute -top-1 right-0 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                {betSlip.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ==================== MOBILE BET SLIP MODAL ==================== */}
      {showMobileBetSlip && (
        <div className="lg:hidden fixed inset-0 bg-black/70 z-50" onClick={() => setShowMobileBetSlip(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#161B22] rounded-t-2xl max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#2C3E50] px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-white">Bet Slip ({betSlip.length})</span>
              <button onClick={() => setShowMobileBetSlip(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              {betSlip.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400">No selections yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {betSlip.map((bet) => (
                    <div key={bet.id} className="bg-[#1E2736] rounded-lg p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white text-sm font-medium">{bet.selection}</p>
                          <p className="text-gray-400 text-xs">
                            {bet.type} @ {bet.odds.toFixed(2)}
                          </p>
                        </div>
                        <button onClick={() => removeFromBetSlip(bet.id)} className="text-gray-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        type="number"
                        value={bet.stake}
                        onChange={(e) => updateStake(bet.id, e.target.value)}
                        placeholder="Stake"
                        className="w-full bg-[#0D1117] border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                    </div>
                  ))}

                  <div className="border-t border-gray-700 pt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Total Stake:</span>
                      <span className="text-white font-medium">₹{totalStake.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Potential Profit:</span>
                      <span className="text-green-400 font-medium">+₹{potentialProfit.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Balance:</span>
                      <span className="text-cyan-400 font-bold">₹{balance.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={clearBetSlip}
                      className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg"
                    >
                      Clear All
                    </button>
                    <button
                      onClick={placeBets}
                      className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg"
                    >
                      Place Bet
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Spacer for mobile bottom nav */}
      <div className="lg:hidden h-16"></div>
    </div>
  );
}
