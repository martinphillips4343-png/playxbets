import { useState, useEffect } from "react";
import axios from "axios";
import MatchCard from "@/components/MatchCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function LivePage({ onAddToBetSlip }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLiveMatches = async () => {
    try {
      const response = await axios.get(`${API}/matches/live`);
      setMatches(response.data);
      setLoading(false);
    } catch (err) {
      setError("Failed to load matches");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveMatches();
    // Refresh every 30 seconds
    const interval = setInterval(fetchLiveMatches, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[#A3A3A3] font-manrope">Loading live matches...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[#FF3B30] font-manrope">{error}</div>
      </div>
    );
  }

  const cricketMatches = matches.filter((m) => m.sport === "cricket");
  const soccerMatches = matches.filter((m) => m.sport === "soccer");

  return (
    <div className="space-y-12" data-testid="live-page">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl md:text-6xl font-oswald font-bold tracking-tight uppercase text-white mb-2">
          Live Matches
        </h1>
        <p className="text-base font-manrope text-[#A3A3A3]">
          Real-time scores and betting odds
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#A3A3A3] font-manrope text-lg">
            No live matches at the moment
          </p>
        </div>
      ) : (
        <>
          {/* Cricket Section */}
          {cricketMatches.length > 0 && (
            <section data-testid="cricket-section">
              <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-oswald font-semibold tracking-tight text-white mb-1">
                  CRICKET
                </h2>
                <div className="w-20 h-1 bg-gold"></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {cricketMatches.map((match) => (
                  <MatchCard
                    key={match.match_id}
                    match={match}
                    onAddToBetSlip={onAddToBetSlip}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Soccer Section */}
          {soccerMatches.length > 0 && (
            <section data-testid="soccer-section">
              <div className="mb-6">
                <h2 className="text-3xl md:text-4xl font-oswald font-semibold tracking-tight text-white mb-1">
                  SOCCER
                </h2>
                <div className="w-20 h-1 bg-gold"></div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {soccerMatches.map((match) => (
                  <MatchCard
                    key={match.match_id}
                    match={match}
                    onAddToBetSlip={onAddToBetSlip}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
