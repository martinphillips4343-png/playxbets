import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import UserMenu from "@/components/UserMenu";

export default function PublicHeader({ onShowAuth, activeTab, onTabChange, user, onLogout }) {
  const location = useLocation();
  
  const scrollToMatches = (tab) => {
    if (onTabChange) onTabChange(tab);
    const matchesSection = document.getElementById("matches-section");
    if (matchesSection) {
      matchesSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="bg-[#1a1d3a] text-white sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-white">X</span>
            </div>
            <h1 className="text-2xl font-bold">
              Play<span className="text-yellow-400">X</span>Bets
            </h1>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link 
              to="/"
              className={`hover:text-yellow-400 transition-colors font-medium ${location.pathname === "/" ? "text-yellow-400" : ""}`}
            >
              Home
            </Link>
            <Link 
              to="/exchange"
              className={`hover:text-cyan-400 transition-colors font-medium flex items-center gap-1 ${location.pathname === "/exchange" ? "text-cyan-400" : ""}`}
            >
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              Cricket Live
            </Link>
            <Link 
              to="/football-live"
              className={`hover:text-cyan-400 transition-colors font-medium flex items-center gap-1 ${location.pathname === "/football-live" ? "text-cyan-400" : ""}`}
            >
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Football Live
            </Link>
            <button 
              onClick={() => scrollToMatches("cricket")}
              className="hover:text-yellow-400 transition-colors font-medium"
            >
              Cricket
            </button>
            <button 
              onClick={() => scrollToMatches("soccer")}
              className="hover:text-yellow-400 transition-colors font-medium"
            >
              Soccer
            </button>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <UserMenu user={user} onLogout={onLogout} />
            ) : (
              <>
                <Button
                  onClick={() => onShowAuth("login")}
                  variant="ghost"
                  className="text-white hover:text-yellow-400 hover:bg-transparent"
                  data-testid="header-login-btn"
                >
                  Login
                </Button>
                <Button
                  onClick={() => onShowAuth("signup")}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                  data-testid="header-signup-btn"
                >
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
