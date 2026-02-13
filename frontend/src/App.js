import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import BetSlip from "@/components/BetSlip";
import LivePage from "@/pages/LivePage";
import CricketPage from "@/pages/CricketPage";
import SoccerPage from "@/pages/SoccerPage";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [betSlip, setBetSlip] = useState([]);

  const handleAddToBetSlip = (bet) => {
    // Check if bet already exists
    const exists = betSlip.find((b) => b.id === bet.id);
    if (exists) {
      return; // Don't add duplicate
    }
    setBetSlip((prev) => [...prev, bet]);
  };

  const handleRemoveBet = (betId) => {
    setBetSlip((prev) => prev.filter((b) => b.id !== betId));
  };

  const handlePlaceBets = async (stakes) => {
    // Place bets via API
    const promises = betSlip.map((bet) => {
      const stake = parseFloat(stakes[bet.id]) || 0;
      if (stake === 0) return null;

      return axios.post(`${API}/bets`, {
        match_id: bet.matchId,
        team_home: bet.teamHome,
        team_away: bet.teamAway,
        sport: bet.sport,
        bet_type: bet.betType,
        odds: bet.odds,
        stake: stake,
      });
    });

    await Promise.all(promises.filter(Boolean));
    setBetSlip([]);
  };

  return (
    <div className="App min-h-screen bg-[#050505]">
      <BrowserRouter>
        <Sidebar />
        
        <main className="ml-64 mr-80 p-8">
          <Routes>
            <Route path="/" element={<LivePage onAddToBetSlip={handleAddToBetSlip} />} />
            <Route path="/cricket" element={<CricketPage onAddToBetSlip={handleAddToBetSlip} />} />
            <Route path="/soccer" element={<SoccerPage onAddToBetSlip={handleAddToBetSlip} />} />
          </Routes>
        </main>

        <BetSlip
          bets={betSlip}
          onRemoveBet={handleRemoveBet}
          onPlaceBets={handlePlaceBets}
        />

        <Toaster position="top-right" theme="dark" />
      </BrowserRouter>
    </div>
  );
}

export default App;
