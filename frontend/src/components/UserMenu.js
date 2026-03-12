import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Wallet, LogOut, Home } from "lucide-react";

export default function UserMenu({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavigate = (path) => {
    navigate(path);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
        data-testid="user-menu-button"
      >
        <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
          <span className="font-bold text-black text-sm">
            {user.username[0].toUpperCase()}
          </span>
        </div>
        <span className="text-white font-medium hidden md:block">{user.username}</span>
        <svg
          className={`w-4 h-4 text-white transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl py-2 z-50 border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">{user.username}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>

          {/* For regular users */}
          {user.role === "user" && (
            <>
              <button
                onClick={() => handleNavigate("/user")}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 transition-colors text-left"
              >
                <Home className="w-4 h-4" />
                <span className="text-sm">Dashboard</span>
              </button>

              <button
                onClick={() => handleNavigate("/user/history")}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 transition-colors text-left"
              >
                <Wallet className="w-4 h-4" />
                <span className="text-sm">My Bets</span>
              </button>

              <button
                onClick={() => handleNavigate("/user/withdrawals")}
                className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 transition-colors text-left"
              >
                <Wallet className="w-4 h-4" />
                <span className="text-sm">Withdrawals</span>
              </button>
            </>
          )}

          {/* For admin users */}
          {user.role === "admin" && (
            <button
              onClick={() => handleNavigate("/admin")}
              className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 transition-colors text-left"
            >
              <Home className="w-4 h-4" />
              <span className="text-sm">Admin Dashboard</span>
            </button>
          )}

          <div className="border-t border-gray-100 mt-2 pt-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
