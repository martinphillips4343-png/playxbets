import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import PublicHeader from "@/components/PublicHeader";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { toast } from "sonner";
import { useLiveMatches } from "@/hooks/useWebSocket";
import { ChevronRight, Calendar, Flame, Clock, Trophy } from "lucide-react";

// Get backend URL for WebSocket
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// Polling intervals
const LIVE_POLL_INTERVAL = 15000;
const IDLE_POLL_INTERVAL = 30000;

export default function PublicHomepage({ onShowAuth, user, onLogout }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [hasLiveMatches, setHasLiveMatches] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const { matches: wsLiveMatches, isConnected: wsConnected, lastUpdate: wsLastUpdate, usePolling } = useLiveMatches(BACKEND_URL);
  const pollIntervalRef = useRef(null);

  const fetchMatches = useCallback(async () => {
    try {
      const response = await api.get("/matches");
      const data = response.data || [];
      const validMatches = data.filter(m => {
        if (m.matchEnded === true) return false;
        if (["completed", "ended", "finished"].includes(m.status?.toLowerCase())) return false;
        return true;
      });
      setMatches(validMatches);
      setApiUnavailable(false);
      setLastUpdate(new Date());
      const liveCount = validMatches.filter(m => m.status === "live").length;
      setHasLiveMatches(liveCount > 0);
    } catch (error) {
      console.error("Failed to fetch matches:", error);
      setApiUnavailable(true);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
    if (!wsConnected || usePolling) {
      const interval = setInterval(fetchMatches, hasLiveMatches ? LIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL);
      pollIntervalRef.current = interval;
      return () => clearInterval(interval);
    }
  }, [fetchMatches, hasLiveMatches, wsConnected, usePolling]);

  useEffect(() => {
    if (wsLiveMatches && wsLiveMatches.length > 0) {
      setMatches(prev => {
        const updatedMatches = prev.map(m => {
          const wsMatch = wsLiveMatches.find(wm => wm.match_id === m.match_id);
          return wsMatch ? { ...m, ...wsMatch } : m;
        });
        const newLiveMatches = wsLiveMatches.filter(wm => !prev.find(m => m.match_id === wm.match_id));
        return [...updatedMatches, ...newLiveMatches];
      });
      setHasLiveMatches(wsLiveMatches.length > 0);
    }
  }, [wsLiveMatches]);

  useEffect(() => {
    if (wsLastUpdate) setLastUpdate(wsLastUpdate);
  }, [wsLastUpdate]);

  const handleMatchClick = (match) => {
    navigate(`/match/${match.match_id}`);
  };

  // Filter matches — cricket only, with filter tabs
  const filteredMatches = matches
    .filter((m) => {
      // Cricket only
      if (m.sport !== "cricket") return false;
      const status = (m.status || "").toLowerCase();
      if (status === "completed" || status === "ended" || status === "finished") return false;
      if (m.matchEnded === true) return false;

      // Apply active filter
      if (activeFilter === "live") {
        return status === "live";
      }
      if (activeFilter === "upcoming") {
        if (status === "live") return false;
        try {
          const matchTime = new Date(m.commence_time);
          return matchTime > new Date();
        } catch { return false; }
      }
      if (activeFilter === "date" && selectedDate) {
        try {
          const matchDate = new Date(m.commence_time);
          const filterDate = new Date(selectedDate);
          return matchDate.toDateString() === filterDate.toDateString();
        } catch { return false; }
      }

      // "all" filter — show live + recent + upcoming
      if (status === "live") return true;
      try {
        const matchTime = new Date(m.commence_time);
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        return matchTime > sixHoursAgo;
      } catch { return false; }
    })
    .sort((a, b) => {
      // Live matches first, then ascending by date
      if (a.status === "live" && b.status !== "live") return -1;
      if (b.status === "live" && a.status !== "live") return 1;
      return new Date(a.commence_time) - new Date(b.commence_time);
    });

  const liveCount = matches.filter(m => m.status === "live" && m.sport === "cricket").length;

  return (
    <div className="min-h-screen bg-gray-100">
      <PublicHeader 
        onShowAuth={onShowAuth} 
        activeTab="cricket" 
        onTabChange={() => {}}
        user={user}
        onLogout={onLogout}
      />

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#1a1d3a] via-[#2d1b69] to-[#1a1d3a] text-white py-8 md:py-14">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-3 md:mb-4 text-white drop-shadow-lg">
            Live Cricket Betting
          </h1>
          <p className="text-base md:text-lg text-gray-300 mb-6 md:mb-8 drop-shadow">
            Real-time odds, instant bets, best exchange rates
          </p>
          {!user && (
            <button
              onClick={() => onShowAuth("signup")}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-base md:text-lg px-8 md:px-10 py-3 md:py-4 rounded-lg shadow-xl transition-transform hover:scale-105"
              data-testid="start-betting-btn"
            >
              Start Betting Now
            </button>
          )}
        </div>
      </div>

      <div className="container mx-auto px-3 md:px-6 py-4 md:py-6">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => { setActiveFilter("all"); setSelectedDate(""); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 font-semibold rounded-lg text-xs md:text-sm transition-all ${
              activeFilter === "all"
                ? "bg-[#1a1d3a] text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
            data-testid="filter-all"
          >
            <Trophy className="w-3.5 h-3.5" />
            Cricket
          </button>
          <button
            onClick={() => { setActiveFilter("live"); setSelectedDate(""); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 font-semibold rounded-lg text-xs md:text-sm transition-all ${
              activeFilter === "live"
                ? "bg-green-600 text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
            data-testid="filter-live"
          >
            <Flame className="w-3.5 h-3.5" />
            Live Cricket
            {liveCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">{liveCount}</span>
            )}
          </button>
          <button
            onClick={() => { setActiveFilter("upcoming"); setSelectedDate(""); }}
            className={`flex items-center gap-1.5 px-3 md:px-5 py-2 font-semibold rounded-lg text-xs md:text-sm transition-all ${
              activeFilter === "upcoming"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
            data-testid="filter-upcoming"
          >
            <Clock className="w-3.5 h-3.5" />
            Upcoming
          </button>
          <div className="relative flex items-center">
            <Calendar className="w-3.5 h-3.5 absolute left-2.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setActiveFilter("date"); }}
              className={`pl-8 pr-3 py-2 rounded-lg text-xs md:text-sm font-medium border transition-all ${
                activeFilter === "date"
                  ? "bg-purple-600 text-white border-purple-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
              }`}
              data-testid="filter-date"
            />
          </div>

          {/* Status Indicators */}
          <div className="flex items-center gap-2 ml-auto text-xs text-gray-500">
            {wsConnected && (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="hidden md:inline">Real-time</span>
              </span>
            )}
            {lastUpdate && (
              <span className="hidden md:inline text-gray-400">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Matches List */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden" data-testid="matches-list">
          {/* Header */}
          <div className="bg-[#1a1d3a] text-white px-4 py-3 flex justify-between items-center">
            <span className="font-bold text-sm md:text-base">
              {activeFilter === "live" ? "Live Matches" : activeFilter === "upcoming" ? "Upcoming Matches" : activeFilter === "date" ? "Matches on Date" : "All Cricket Matches"}
            </span>
            <span className="text-xs text-gray-300">{filteredMatches.length} match{filteredMatches.length !== 1 ? "es" : ""}</span>
          </div>

          {filteredMatches.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-gray-400 mb-2">
                {activeFilter === "live" ? (
                  <Flame className="w-10 h-10 mx-auto mb-3 opacity-30" />
                ) : (
                  <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                )}
              </div>
              <p className="text-gray-500 font-medium">
                {activeFilter === "live" ? "No live cricket matches right now" : "No matches found"}
              </p>
              <p className="text-gray-400 text-sm mt-1">Check back soon for more action!</p>
            </div>
          ) : (
            filteredMatches.map((match, idx) => (
              <div
                key={match.match_id}
                onClick={() => handleMatchClick(match)}
                className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-blue-50 active:bg-blue-100 border-b border-gray-100 ${
                  idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                }`}
                data-testid="match-row"
              >
                {/* Live Indicator */}
                {match.status === "live" && (
                  <div className="flex-shrink-0">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></div>
                  </div>
                )}

                {/* Match Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] md:text-xs text-gray-400 font-medium truncate mb-0.5">
                    {match.league || "Cricket"}
                  </div>
                  <div className="font-bold text-gray-900 text-sm md:text-base truncate">
                    {match.home_team} <span className="text-gray-400 font-normal">v</span> {match.away_team}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {match.status === "live" ? (
                      <span className="text-green-600 font-bold text-xs flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block"></span>
                        LIVE
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">{formatIndianDateTime(match.commence_time)}</span>
                    )}
                    {match.has_tv && <span className="bg-green-600 text-white text-[8px] font-bold px-1 py-0.5 rounded">TV</span>}
                    {match.has_fancy && <span className="bg-orange-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">F</span>}
                    {match.has_bookmaker && <span className="bg-blue-600 text-white text-[8px] font-bold px-1 py-0.5 rounded">BM</span>}
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0">
                  <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-400" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
