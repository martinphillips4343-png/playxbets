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
  const [firstTeam, setFirstTeam] = useState(null);
  const [secondTeam, setSecondTeam] = useState(null);

  // Bet placement
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [stake, setStake] = useState("");
  const [placing, setPlacing] = useState(false);
  const [activeTab, setActiveTab] = useState("odds");
  const [oddsCollapsed, setOddsCollapsed] = useState(false);

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
    // Use bookmaker's team order if available
    if (odds.first_team) setFirstTeam(odds.first_team);
    if (odds.second_team) setSecondTeam(odds.second_team);
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
  const fmtLiquidity = (v) => {
    if (!v || v === 0) return "0";
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString("en-IN");
  };
  // Map pool totals by team name (not by home/away position)
  const getPoolForTeam = (teamName) => {
    if (!pool || !teamName) return 0;
    if (pool.home_team === teamName) return pool.home_total || 0;
    if (pool.away_team === teamName) return pool.away_total || 0;
    // Fuzzy fallback: check if team name is contained
    const lower = teamName.toLowerCase();
    if (pool.home_team && pool.home_team.toLowerCase().includes(lower)) return pool.home_total || 0;
    if (pool.away_team && pool.away_team.toLowerCase().includes(lower)) return pool.away_total || 0;
    return 0;
  };
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

      {/* ==================== MATCH_ODDS SECTION ==================== */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Balance bar */}
        {user && (
          <div className="mb-3 text-right">
            <span className="text-xs text-gray-500">Balance: </span>
            <span className="text-sm text-cyan-400 font-bold">{fmtCurrency(balance)}</span>
          </div>
        )}

        {/* ODDS | MATCHED BET Tabs */}
        <div className="flex items-center gap-6 mb-5" data-testid="odds-tabs">
          <button
            onClick={() => setActiveTab("odds")}
            className={`relative pb-2 text-base font-bold uppercase tracking-wide transition-colors ${activeTab === "odds" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
            data-testid="tab-odds"
          >
            ODDS
            {activeTab === "odds" && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-cyan-400 rounded-full" />}
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={() => setActiveTab("matched")}
            className={`relative pb-2 text-base font-bold uppercase tracking-wide transition-colors ${activeTab === "matched" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
            data-testid="tab-matched"
          >
            MATCHED BET
            {activeTab === "matched" && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-cyan-400 rounded-full" />}
          </button>
        </div>

        {/* SUSPENDED banner */}
        {suspended && (
          <div className="mb-4 flex items-center justify-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg py-3 px-4 animate-pulse" data-testid="suspended-banner">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-red-400 font-bold text-sm uppercase">SUSPENDED {suspendEvent ? `(${suspendEvent})` : ""}</span>
          </div>
        )}

        {/* ==== ODDS TAB ==== */}
        {activeTab === "odds" && (
          <div className="bg-[#1C2B3A] rounded-lg overflow-hidden" data-testid="match-odds-card">
            {/* MATCH_ODDS Header */}
            <button
              onClick={() => setOddsCollapsed(!oddsCollapsed)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#243447] hover:bg-[#2a3c50] transition-colors"
              data-testid="match-odds-header"
            >
              <span className="text-white font-bold text-sm tracking-wide">MATCH_ODDS</span>
              <div className="flex items-center gap-3">
                <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Winner</span>
                <ChevronLeft className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${oddsCollapsed ? "rotate-[-90deg]" : "rotate-90"}`} />
              </div>
            </button>

            {!oddsCollapsed && (
              <>
                {/* Max label */}
                <div className="px-4 pt-3 pb-2">
                  <span className="text-cyan-400 text-sm font-medium" data-testid="max-label">Max: 1L</span>
                </div>

                {/* Divider bar */}
                <div className="mx-4 h-[3px] bg-[#2a3a4e] rounded mb-1" />

                {/* Team Rows — Blue Button odds with real P2P liquidity */}
                {(() => {
                  const rows = [
                    { team: firstTeam || homeTeam, odds: homeOdds, flash: homeFlash, testId: "home" },
                    { team: secondTeam || awayTeam, odds: awayOdds, flash: awayFlash, testId: "away" },
                  ];
                  const o1 = rows[0].odds || 0;
                  const o2 = rows[1].odds || 0;
                  return rows.map(({ team, odds, flash, testId }, idx) => {
                    const isHigher = odds && ((idx === 0 && o1 > o2) || (idx === 1 && o2 > o1));
                    const poolTotal = getPoolForTeam(team);
                    const selected = selectedTeam === team;
                    const disabled = suspended || isCompleted;
                    return (
                  <div key={testId}>
                    <div
                      className={`flex items-center justify-between px-4 py-4 transition-colors
                        ${selected ? "bg-[#1a3050] border-l-4 border-cyan-400" : "border-l-4 border-transparent"}
                        ${disabled ? "opacity-50 pointer-events-none" : ""}
                        ${flash === "flash-up" ? "ring-1 ring-inset ring-green-500/40" : flash === "flash-down" ? "ring-1 ring-inset ring-red-500/40" : ""}
                      `}
                      data-testid={`${testId}-team-row`}
                    >
                      {/* Team Name with favorite/underdog indicator */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isHigher ? "bg-green-500" : "bg-red-500"}`} />
                          <span className="text-white text-base md:text-lg font-bold truncate" data-testid={`${testId}-team-name`}>
                            {team}
                          </span>
                        </div>
                      </div>

                      {/* Large Blue Odds Button */}
                      <div className="flex flex-col items-center ml-4">
                        <button
                          onClick={() => selectTeam(team)}
                          disabled={disabled}
                          className={`min-w-[90px] md:min-w-[110px] px-5 py-3 rounded-lg text-xl md:text-2xl font-black transition-all duration-150
                            ${selected
                              ? "bg-blue-700 text-white ring-2 ring-cyan-400 shadow-lg shadow-blue-500/30 scale-105"
                              : "bg-blue-600 text-white hover:bg-blue-500 hover:shadow-md hover:shadow-blue-500/20 active:scale-95"
                            }
                            ${disabled ? "cursor-not-allowed" : "cursor-pointer"}
                          `}
                          data-testid={`${testId}-odds-btn`}
                        >
                          {odds ? odds.toFixed(2) : "—"}
                        </button>
                        {/* Real P2P pool liquidity below button */}
                        <div className="text-gray-400 text-xs mt-1.5 font-medium" data-testid={`${testId}-liquidity`}>
                          {poolTotal > 0 ? `₹${fmtLiquidity(poolTotal)}` : "—"}
                        </div>
                      </div>
                    </div>
                    {/* Row divider */}
                    <div className="mx-4 h-px bg-[#2a3a4e]" />
                  </div>
                    );
                  });
                })()}
              </>
            )}
          </div>
        )}

        {/* ==== MATCHED BET TAB ==== */}
        {activeTab === "matched" && (
          <div className="bg-[#1C2B3A] rounded-lg overflow-hidden" data-testid="matched-bet-tab">
            <div className="px-4 py-3 bg-[#243447]">
              <span className="text-white font-bold text-sm tracking-wide">MATCHED BETS</span>
            </div>
            {myBets.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No bets placed yet</div>
            ) : (
              <div>
                {myBets.map((b, i) => (
                  <div key={b.bet_id || i} className="px-4 py-3 border-b border-[#2a3a4e] flex items-center justify-between" data-testid={`matched-bet-${i}`}>
                    <div>
                      <div className="text-sm text-white font-medium">{b.selected_team}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Stake: {fmtCurrency(b.stake)} | Matched: {fmtCurrency(b.matched_amount)} | Pending: {fmtCurrency(b.unmatched_amount)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${statusColors[b.status] || "text-gray-400 bg-gray-700/30"}`}>
                      {b.status?.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== BET PLACEMENT FORM ==================== */}
        {selectedTeam && activeTab === "odds" && (
          <div className="mt-4 bg-[#161B22] rounded-xl border border-cyan-500/30 p-4 animate-in slide-in-from-bottom duration-200" data-testid="bet-form">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-gray-400">Betting on</span>
                <span className="text-sm text-cyan-400 font-bold ml-2">{selectedTeam}</span>
                <span className="text-xs text-gray-500 ml-2">@ {(selectedTeam === (firstTeam || homeTeam) ? homeOdds : awayOdds)?.toFixed(2) || "—"}</span>
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
