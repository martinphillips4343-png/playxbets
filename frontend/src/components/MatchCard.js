export default function MatchCard({ match, onAddToBetSlip }) {
  const isCricket = match.sport === "cricket";
  const isLive = match.status === "live";

  const handleOddsClick = (betType, odds) => {
    if (!odds) return;
    
    onAddToBetSlip({
      id: `${match.match_id}-${betType}`,
      matchId: match.match_id,
      teamHome: match.team_home,
      teamAway: match.team_away,
      sport: match.sport,
      league: match.league,
      betType: betType,
      odds: odds,
    });
  };

  return (
    <div
      className="bg-[#0A0A0A] border border-[#262626] rounded-sm p-6 hover:border-gold transition-all group"
      data-testid={`match-card-${match.match_id}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isLive && (
            <div className="flex items-center gap-2" data-testid="live-indicator">
              <div className="w-2 h-2 bg-live rounded-full animate-pulse"></div>
              <span className="text-xs font-manrope font-bold text-live uppercase tracking-widest">
                LIVE
              </span>
            </div>
          )}
          <span className="text-xs font-manrope text-[#A3A3A3] uppercase tracking-widest">
            {match.league}
          </span>
        </div>
      </div>

      {/* Teams & Score */}
      <div className="space-y-3 mb-6">
        {/* Home Team */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-oswald font-semibold text-white">
            {match.team_home}
          </span>
          {isLive && (
            <span className="text-3xl font-oswald font-bold text-gold">
              {match.score_home}
            </span>
          )}
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-between">
          <span className="text-lg font-oswald font-semibold text-white">
            {match.team_away}
          </span>
          {isLive && (
            <span className="text-3xl font-oswald font-bold text-gold">
              {match.score_away}
            </span>
          )}
        </div>
      </div>

      {/* Venue */}
      <div className="text-xs font-manrope text-[#525252] mb-4">
        {match.venue}
      </div>

      {/* Odds */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => handleOddsClick("Home", match.odds_home)}
          disabled={!match.odds_home}
          className="bg-[#050505] border border-[#262626] hover:border-gold hover:text-gold transition-colors flex flex-col items-center justify-center py-3 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid={`odds-home-${match.match_id}`}
        >
          <span className="text-xs font-manrope text-[#A3A3A3] uppercase mb-1">
            Home
          </span>
          <span className="text-lg font-oswald font-bold text-white">
            {match.odds_home?.toFixed(2) || "-"}
          </span>
        </button>

        {!isCricket && (
          <button
            onClick={() => handleOddsClick("Draw", match.odds_draw)}
            disabled={!match.odds_draw}
            className="bg-[#050505] border border-[#262626] hover:border-gold hover:text-gold transition-colors flex flex-col items-center justify-center py-3 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`odds-draw-${match.match_id}`}
          >
            <span className="text-xs font-manrope text-[#A3A3A3] uppercase mb-1">
              Draw
            </span>
            <span className="text-lg font-oswald font-bold text-white">
              {match.odds_draw?.toFixed(2) || "-"}
            </span>
          </button>
        )}

        <button
          onClick={() => handleOddsClick("Away", match.odds_away)}
          disabled={!match.odds_away}
          className={`bg-[#050505] border border-[#262626] hover:border-gold hover:text-gold transition-colors flex flex-col items-center justify-center py-3 rounded-sm disabled:opacity-50 disabled:cursor-not-allowed ${
            isCricket ? "col-span-2" : ""
          }`}
          data-testid={`odds-away-${match.match_id}`}
        >
          <span className="text-xs font-manrope text-[#A3A3A3] uppercase mb-1">
            Away
          </span>
          <span className="text-lg font-oswald font-bold text-white">
            {match.odds_away?.toFixed(2) || "-"}
          </span>
        </button>
      </div>
    </div>
  );
}
