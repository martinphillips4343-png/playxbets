import { useState, useEffect } from "react";
import axios from "axios";
import MatchCard from "@/components/MatchCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SoccerPage({ onAddToBetSlip }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const response = await axios.get(`${API}/matches/soccer`);
        setMatches(response.data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    fetchMatches();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[#A3A3A3] font-manrope">Loading soccer matches...</div>
      </div>
    );
  }

  const liveMatches = matches.filter((m) => m.status === "live");
  const upcomingMatches = matches.filter((m) => m.status === "scheduled");

  return (
    <div className="space-y-12" data-testid="soccer-page">
      {/* Hero Section */}
      <div
        className="relative h-64 rounded-sm overflow-hidden"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1762013315117-1c8005ad2b41?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwxfHxzb2NjZXIlMjBtYXRjaCUyMHN0YWRpdW0lMjBuaWdodCUyMGFjdGlvbnxlbnwwfHx8fDE3NzA5OTExMTR8MA&ixlib=rb-4.1.0&q=85')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-8">
          <h1 className="text-5xl md:text-6xl font-oswald font-bold tracking-tight uppercase text-white">
            Soccer
          </h1>
        </div>
      </div>

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-3xl md:text-4xl font-oswald font-semibold tracking-tight text-white mb-1">
              LIVE NOW
            </h2>
            <div className="w-20 h-1 bg-live"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {liveMatches.map((match) => (
              <MatchCard
                key={match.match_id}
                match={match}
                onAddToBetSlip={onAddToBetSlip}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Matches */}
      {upcomingMatches.length > 0 && (
        <section>
          <div className="mb-6">
            <h2 className="text-3xl md:text-4xl font-oswald font-semibold tracking-tight text-white mb-1">
              UPCOMING
            </h2>
            <div className="w-20 h-1 bg-gold"></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingMatches.map((match) => (
              <MatchCard
                key={match.match_id}
                match={match}
                onAddToBetSlip={onAddToBetSlip}
              />
            ))}
          </div>
        </section>
      )}

      {matches.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[#A3A3A3] font-manrope text-lg">
            No soccer matches available
          </p>
        </div>
      )}
    </div>
  );
}
