import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PublicHeader({ onShowAuth }) {
  return (
    <header className="bg-[#1a1d3a] text-white sticky top-0 z-50 shadow-lg">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-red-500 rounded-lg flex items-center justify-center">
              <span className="text-xl font-bold text-white">X</span>
            </div>
            <h1 className="text-2xl font-bold">
              Play<span className="text-yellow-400">X</span>Bets
            </h1>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a href="#live" className="hover:text-yellow-400 transition-colors">
              Live
            </a>
            <a href="#cricket" className="hover:text-yellow-400 transition-colors">
              Cricket
            </a>
            <a href="#soccer" className="hover:text-yellow-400 transition-colors">
              Soccer
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => onShowAuth("login")}
              variant="ghost"
              className="text-white hover:text-yellow-400"
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
          </div>
        </div>
      </div>
    </header>
  );
}
