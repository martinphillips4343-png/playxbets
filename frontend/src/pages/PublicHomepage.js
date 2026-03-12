import { useState, useEffect } from "react";
import { api } from "@/App";
import PublicHeader from "@/components/PublicHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PublicHomepage({ onShowAuth, user, onLogout }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    fetchMatches();
    const interval = setInterval(fetchMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMatches = async () => {
    try {
      const response = await api.get("/matches");
      setMatches(response.data);
    } catch (error) {
      console.error("Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (activeTab === "all") return true;
    return m.sport === activeTab;
  });

  const liveMatches = filteredMatches.filter((m) => m.status === "live");
  const upcomingMatches = filteredMatches.filter((m) => m.status === "scheduled");

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicHeader 
        onShowAuth={onShowAuth} 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
        user={user}
        onLogout={onLogout}
      />

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-[#1a1d3a] via-[#2d1b69] to-[#1a1d3a] text-white py-16">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4 text-white drop-shadow-lg">
            Bet on Your Favorite Sports
          </h1>
          <p className="text-xl md:text-2xl text-gray-200 mb-8 drop-shadow">
            Live Cricket & Football Betting with Best Odds
          </p>
          <Button
            onClick={() => onShowAuth("signup")}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-lg px-10 py-7 shadow-xl"
          >
            Start Betting Now
          </Button>
        </div>
      </div>

      {/* Sport Tabs */}
      <div className="container mx-auto px-6 py-6" id="matches-section">
        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "all"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            All Sports
          </button>
          <button
            onClick={() => setActiveTab("cricket")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "cricket"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            🏏 Cricket
          </button>
          <button
            onClick={() => setActiveTab("soccer")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "soccer"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            ⚽ Football
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading matches...</p>
          </div>
        ) : (
          <>
            {/* Live Matches */}
            {liveMatches.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <h2 className="text-2xl font-bold text-gray-800">Live Now</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {liveMatches.map((match) => (
                    <MatchCard
                      key={match.match_id}
                      match={match}
                      onPlaceBet={() => onShowAuth("login")}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming Matches */}
            {upcomingMatches.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">
                  Upcoming Matches
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upcomingMatches.map((match) => (
                    <MatchCard
                      key={match.match_id}
                      match={match}
                      onPlaceBet={() => onShowAuth("login")}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredMatches.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg">
                  No matches available at the moment
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, onPlaceBet, user }) {
  const isLive = match.status === "live";

  const handleBetClick = () => {
    if (user) {
      // User is logged in, navigate to betting page with this match
      window.location.href = `/user/betting?match=${match.match_id}`;
    } else {
      // User not logged in, show login modal
      onPlaceBet();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      {/* Header */}
      <div className="bg-gray-800 text-white px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase">{match.league}</span>
          {isLive && (
            <span className="flex items-center gap-2 bg-red-600 px-2 py-1 rounded text-xs">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Teams */}
      <div className="p-6">
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg text-gray-900">{match.home_team}</span>
            {match.home_odds && (
              <span className="text-2xl font-bold text-blue-600">
                {match.home_odds.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-lg text-gray-900">{match.away_team}</span>
            {match.away_odds && (
              <span className="text-2xl font-bold text-blue-600">
                {match.away_odds.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Time */}
        <p className="text-sm text-gray-700 mb-4 font-medium">
          {new Date(match.commence_time).toLocaleString()}
        </p>

        {/* Place Bet Button */}
        <Button
          onClick={handleBetClick}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold"
          data-testid="place-bet-btn"
        >
          Place Bet
        </Button>
      </div>
    </div>
  );
}
