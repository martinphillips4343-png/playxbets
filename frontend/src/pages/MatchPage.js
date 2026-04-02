import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import PublicHeader from "@/components/PublicHeader";
import { useMatchUpdates } from "@/hooks/useWebSocket";
import { formatIndianDateTime } from "@/utils/dateFormat";
import {
  ChevronLeft, Loader2, Home, Wifi, WifiOff, RefreshCw, Clock, Calendar, X, AlertTriangle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
const ODDS_POLL_MS = 1000;

// ==================== ODDS FLASH HOOK ====================
const useOddsFlash = (current) => {
  const prev = useRef(null);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (prev.current !== null && current !== null && current !== prev.current) {
      setFlash(current > prev.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 800);
      return () => clearTimeout(t);
    }
    prev.current = current;
  }, [current]);
  return flash;
};

// ==================== MAIN COMPONENT ====================
export default function MatchPage({ user, onShowAuth, onLogout }) {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const { match: wsMatch, isConnected: wsConnected, lastUpdate: wsLastUpdate } = useMatchUpdates(BACKEND_URL, matchId);

  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(0);
  const [homeOdds, setHomeOdds] = useState(null);
  const [awayOdds, setAwayOdds] = useState(null);
  const [suspended, setSuspended] = useState(false);
  const [suspendEvent, setSuspendEvent] = useState(null);

  // Bet placement
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [stake, setStake] = useState("");
  const [placing, setPlacing] = useState(false);

  // My bets + pool
  const [myBets, setMyBets] = useState([]);
  const [pool, setPool] = useState(null);

  // Flash
  const homeFlash = useOddsFlash(homeOdds);
  const awayFlash = useOddsFlash(awayOdds);

  // ==================== EXTRACT ODDS ====================
  const extractOdds = useCallback((data) => {
    if (!data) return;
    const odds = data.odds || {};
    const h = odds.home || odds.home_back || data.home_odds;
    const a = odds.away || odds.away_back || data.away_odds;
    if (h && h > 1) setHomeOdds(parseFloat(h.toFixed(2)));
    if (a && a > 1) setAwayOdds(parseFloat(a.toFixed(2)));
  }, []);

  // ==================== SYNC WS ====================
  useEffect(() => {
    if (wsMatch) {
      if (wsMatch.matchEnded || ["completed", "ended"].includes(wsMatch.status?.toLowerCase())) {
        setMatch({ ...wsMatch, status: "completed" });
      } else {
        setMatch(wsMatch);
      }
      extractOdds(wsMatch);
      setError(null);
      setLoading(false);
    }
  }, [wsMatch, extractOdds]);

  // ==================== FETCH MATCH (polling fallback + odds refresh) ====================
  const fetchMatch = useCallback(async () => {
    try {
      const r = await api.get(`/match/${matchId}`);
      const d = r.data;
      if (d.matchEnded || ["completed", "ended"].includes(d.status?.toLowerCase())) {
        setMatch({ ...d, status: "completed" });
      } else {
        setMatch(d);
      }
      extractOdds(d);
      setError(null);
    } catch { setError("Failed to load match"); }
    setLoading(false);
  }, [matchId, extractOdds]);

  // ==================== MARKET STATUS POLLING (suspend detection) ====================
  useEffect(() => {
    if (!match || !["live", "scheduled"].includes(match.status)) return;
    const poll = async () => {
      try {
        const r = await api.get(`/match/${matchId}/market-status`);
        setSuspended(r.data.suspended || false);
        setSuspendEvent(r.data.last_event || null);
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, ODDS_POLL_MS);
    return () => clearInterval(interval);
  }, [match?.status, matchId]);

  // ==================== ODDS POLLING (1s) ====================
  useEffect(() => {
    if (!matchId) return;
    fetchMatch();
    const interval = setInterval(fetchMatch, ODDS_POLL_MS);
    return () => clearInterval(interval);
  }, [matchId, fetchMatch]);

  // ==================== WALLET ====================
  const fetchWallet = useCallback(async () => {
    if (!user) return;
    try { const r = await api.get("/wallet"); setBalance(r.data.balance || 0); } catch { /* silent */ }
  }, [user]);
  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  // ==================== MY BETS + POOL ====================
  const fetchBetsAndPool = useCallback(async () => {
    if (!matchId) return;
    try {
      const [bRes, pRes] = await Promise.allSettled([
        user ? api.get(`/p2p/bets/${matchId}/my`) : Promise.resolve({ data: [] }),
        api.get(`/p2p/pool/${matchId}`),
      ]);
      if (bRes.status === "fulfilled") setMyBets(bRes.value.data);
      if (pRes.status === "fulfilled") setPool(pRes.value.data);
    } catch { /* silent */ }
  }, [matchId, user]);
  useEffect(() => { fetchBetsAndPool(); }, [fetchBetsAndPool]);
  useEffect(() => {
    if (!matchId) return;
    const iv = setInterval(fetchBetsAndPool, 5000);
    return () => clearInterval(iv);
  }, [matchId, fetchBetsAndPool]);

  // ==================== PLACE BET ====================
  const handlePlaceBet = async () => {
    if (!user) { onShowAuth && onShowAuth("login"); toast.error("Please login to place bets"); return; }
    if (!selectedTeam) return;
    const s = parseFloat(stake);
    if (!s || s <= 0) { toast.error("Enter a valid stake amount"); return; }
    if (s > balance) { toast.error("Insufficient balance"); return; }
    setPlacing(true);
    try {
      const r = await api.post("/p2p/bet", { match_id: matchId, selected_team: selectedTeam, stake: s });
      toast.success(`Bet placed! ${r.data.status === "fully_matched" ? "Fully matched!" : r.data.status === "partially_matched" ? `Partially matched (${r.data.matched_amount})` : "Pending matching..."}`);
      setSelectedTeam(null);
      setStake("");
      fetchWallet();
      fetchBetsAndPool();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to place bet");
    }
    setPlacing(false);
  };

  const selectTeam = (team) => {
    if (suspended) { toast.error("Market is SUSPENDED"); return; }
    if (!user) { onShowAuth && onShowAuth("login"); toast.error("Please login"); return; }
    if (match?.status === "completed") { toast.error("Match has ended"); return; }
    setSelectedTeam(selectedTeam === team ? null : team);
    setStake("");
  };

  // ==================== STATUS HELPERS ====================
  const fmtCurrency = (v) => (v || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const statusColors = {
    pending: "text-yellow-400 bg-yellow-400/10",
    partially_matched: "text-blue-400 bg-blue-400/10",
    fully_matched: "text-cyan-400 bg-cyan-400/10",
    won: "text-green-400 bg-green-400/10",
    lost: "text-red-400 bg-red-400/10",
  };

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
  const isCompleted = match.status === "completed";
  const homeTeam = match.home_team || "Team A";
  const awayTeam = match.away_team || "Team B";

  return (
    <div className="min-h-screen bg-[#0D1117]" data-testid="match-page">
      <PublicHeader onShowAuth={onShowAuth} user={user} onLogout={onLogout} />

      {/* Breadcrumb */}
      <div className="bg-[#161B22] border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2 text-sm">
          <Link to="/" className="text-gray-400 hover:text-white flex items-center gap-1"><Home className="w-3.5 h-3.5" />Home</Link>
          <ChevronLeft className="w-3 h-3 text-gray-600 rotate-180" />
          <span className="text-white truncate">{homeTeam} vs {awayTeam}</span>
        </div>
      </div>

      {/* Match Header */}
      <div className="bg-gradient-to-r from-[#1a2744] to-[#243a5e] border-b border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <button onClick={() => navigate("/")} className="p-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg mt-0.5" data-testid="back-button">
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-cyan-400 font-medium">{match.league || "Cricket"}</span>
                  {match.format && <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded uppercase">{match.format}</span>}
                </div>
                <h1 className="text-lg md:text-xl font-bold text-white">{homeTeam} vs {awayTeam}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {isLive ? (
                    <div className="flex items-center gap-1.5 bg-red-600 px-2 py-0.5 rounded">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-white">LIVE</span>
                    </div>
                  ) : isCompleted ? (
                    <div className="flex items-center gap-1.5 bg-gray-600 px-2 py-0.5 rounded">
                      <span className="text-[10px] font-bold text-white">COMPLETED</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-amber-600 px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3 text-white" />
                      <span className="text-[10px] font-bold text-white">UPCOMING</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-300 flex items-center gap-1"><Calendar className="w-3 h-3" />{formatIndianDateTime(match.commence_time)}</span>
                </div>
              </div>
            </div>
            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              {isLive && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${wsConnected ? "bg-green-600/20 text-green-400" : "bg-yellow-600/20 text-yellow-400"}`}>
                  {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span>{wsConnected ? "Live" : "Polling"}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Score */}
          {isLive && match.score?.length > 0 && (
            <div className="mt-3 bg-[#1E2736] rounded-lg p-3" data-testid="live-score">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-400 font-bold text-xs">LIVE SCORE</span>
              </div>
              <div className="text-white text-base font-bold">
                {match.score.map((s) => {
                  if (typeof s === "string") return s;
                  if (typeof s === "object" && s) return `${s.r || ""} ${s.o ? `(${s.o} ov)` : ""}`;
                  return String(s);
                }).join(" | ")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ==================== WINNER SECTION ==================== */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Winner Header */}
        <div className="text-center mb-4">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest" data-testid="winner-header">Winner</h2>
          {user && <div className="text-xs text-gray-500 mt-1">Balance: <span className="text-cyan-400 font-bold">{fmtCurrency(balance)}</span></div>}
        </div>

        {/* SUSPENDED overlay */}
        {suspended && (
          <div className="mb-4 flex items-center justify-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg py-3 px-4 animate-pulse" data-testid="suspended-banner">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-bold text-sm uppercase">SUSPENDED {suspendEvent ? `(${suspendEvent})` : ""}</span>
          </div>
        )}

        {/* Two Team Cards */}
        <div className="grid grid-cols-2 gap-3 md:gap-4" data-testid="team-cards">
          {/* Home Team Card */}
          <button
            onClick={() => selectTeam(homeTeam)}
            disabled={suspended || isCompleted}
            className={`relative rounded-xl p-5 md:p-6 transition-all duration-200 border-2 text-center
              ${selectedTeam === homeTeam
                ? "bg-cyan-600/20 border-cyan-500 shadow-lg shadow-cyan-500/20"
                : "bg-[#161B22] border-gray-700/50 hover:border-gray-500"
              }
              ${suspended || isCompleted ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"}
              ${homeFlash === "flash-up" ? "ring-2 ring-green-500/50" : homeFlash === "flash-down" ? "ring-2 ring-red-500/50" : ""}
            `}
            data-testid="home-team-card"
          >
            {selectedTeam === homeTeam && <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />}
            <div className={`text-3xl md:text-4xl font-black mb-3 ${homeOdds ? "text-cyan-400" : "text-gray-600"}`} data-testid="home-odds">
              {homeOdds ? homeOdds.toFixed(2) : "—"}
            </div>
            <div className="text-xs md:text-sm font-bold text-white uppercase tracking-wide leading-tight" data-testid="home-team-name">
              {homeTeam}
            </div>
            {pool && (
              <div className="mt-3 text-[10px] text-gray-500">
                {pool.home_bets || 0} bets | {fmtCurrency(pool.home_total || 0)}
              </div>
            )}
          </button>

          {/* Away Team Card */}
          <button
            onClick={() => selectTeam(awayTeam)}
            disabled={suspended || isCompleted}
            className={`relative rounded-xl p-5 md:p-6 transition-all duration-200 border-2 text-center
              ${selectedTeam === awayTeam
                ? "bg-cyan-600/20 border-cyan-500 shadow-lg shadow-cyan-500/20"
                : "bg-[#161B22] border-gray-700/50 hover:border-gray-500"
              }
              ${suspended || isCompleted ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.98]"}
              ${awayFlash === "flash-up" ? "ring-2 ring-green-500/50" : awayFlash === "flash-down" ? "ring-2 ring-red-500/50" : ""}
            `}
            data-testid="away-team-card"
          >
            {selectedTeam === awayTeam && <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />}
            <div className={`text-3xl md:text-4xl font-black mb-3 ${awayOdds ? "text-cyan-400" : "text-gray-600"}`} data-testid="away-odds">
              {awayOdds ? awayOdds.toFixed(2) : "—"}
            </div>
            <div className="text-xs md:text-sm font-bold text-white uppercase tracking-wide leading-tight" data-testid="away-team-name">
              {awayTeam}
            </div>
            {pool && (
              <div className="mt-3 text-[10px] text-gray-500">
                {pool.away_bets || 0} bets | {fmtCurrency(pool.away_total || 0)}
              </div>
            )}
          </button>
        </div>

        {/* ==================== BET PLACEMENT FORM ==================== */}
        {selectedTeam && (
          <div className="mt-4 bg-[#161B22] rounded-xl border border-cyan-500/30 p-4 animate-in slide-in-from-bottom duration-200" data-testid="bet-form">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-gray-400">Betting on</span>
                <span className="text-sm text-cyan-400 font-bold ml-2">{selectedTeam}</span>
                <span className="text-xs text-gray-500 ml-2">@ {(selectedTeam === homeTeam ? homeOdds : awayOdds)?.toFixed(2) || "—"}</span>
              </div>
              <button onClick={() => { setSelectedTeam(null); setStake(""); }} className="text-gray-500 hover:text-white" data-testid="close-bet-form">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={stake}
                onChange={e => setStake(e.target.value)}
                placeholder="Enter stake"
                className="flex-1 bg-[#0D1117] border border-gray-700 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors"
                data-testid="stake-input"
                autoFocus
              />
              <button
                onClick={handlePlaceBet}
                disabled={placing || !stake || parseFloat(stake) <= 0}
                className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-3 rounded-lg text-sm transition-colors"
                data-testid="confirm-bet-btn"
              >
                {placing ? "..." : "Place Bet"}
              </button>
            </div>
            {/* Quick stake buttons */}
            <div className="flex gap-2 mt-2">
              {[100, 500, 1000, 5000, 10000].map(v => (
                <button key={v} onClick={() => setStake(String(v))}
                  className="flex-1 bg-[#1E2736] hover:bg-[#2a3a4e] text-gray-300 text-xs py-1.5 rounded border border-gray-700/50 transition-colors"
                  data-testid={`quick-stake-${v}`}>
                  {v >= 1000 ? `${v/1000}K` : v}
                </button>
              ))}
            </div>
            {parseFloat(stake) > 0 && (
              <div className="mt-2 text-[10px] text-gray-500">
                If {selectedTeam} wins, you receive <span className="text-green-400 font-bold">{fmtCurrency(parseFloat(stake) * 2)}</span> (matched portion)
              </div>
            )}
          </div>
        )}

        {/* ==================== MY BETS ==================== */}
        {myBets.length > 0 && (
          <div className="mt-6" data-testid="my-bets-section">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">My Bets</h3>
            <div className="space-y-2">
              {myBets.map((b, i) => (
                <div key={b.bet_id || i} className="bg-[#161B22] rounded-lg p-3 border border-gray-700/50 flex items-center justify-between" data-testid={`my-bet-${i}`}>
                  <div>
                    <div className="text-sm text-white font-medium">{b.selected_team}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Stake: {fmtCurrency(b.stake)} | Matched: {fmtCurrency(b.matched_amount)} | Pending: {fmtCurrency(b.unmatched_amount)}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusColors[b.status] || "text-gray-400 bg-gray-700/30"}`}>
                    {b.status?.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== POOL STATS (compact) ==================== */}
        {pool && (pool.home_bets > 0 || pool.away_bets > 0) && (
          <div className="mt-6 bg-[#161B22] rounded-lg p-4 border border-gray-700/50" data-testid="pool-stats">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Betting Pool</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-500 mb-1">{homeTeam}</div>
                <div className="text-base font-bold text-cyan-400">{fmtCurrency(pool.home_total || 0)}</div>
                <div className="text-[10px] text-gray-500">{pool.home_bets || 0} bets</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">{awayTeam}</div>
                <div className="text-base font-bold text-cyan-400">{fmtCurrency(pool.away_total || 0)}</div>
                <div className="text-[10px] text-gray-500">{pool.away_bets || 0} bets</div>
              </div>
            </div>
          </div>
        )}

        {/* Completed match message */}
        {isCompleted && (
          <div className="mt-6 bg-gray-800/50 rounded-lg p-4 text-center border border-gray-700">
            <p className="text-gray-400 text-sm">This match has ended.</p>
            {match.winner && <p className="text-green-400 font-bold mt-1">Winner: {match.winner}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
