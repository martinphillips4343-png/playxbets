import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, TrendingUp, History, ArrowDownCircle, MessageSquare, LogOut } from "lucide-react";

export default function UserLayout({ user, onLogout }) {
  const location = useLocation();

  const menuItems = [
    { path: "/user", label: "Dashboard", icon: Home, exact: true },
    { path: "/user/betting", label: "Place Bets", icon: TrendingUp },
    { path: "/user/history", label: "Bet History", icon: History },
    { path: "/user/withdrawals", label: "Withdrawals", icon: ArrowDownCircle },
    { path: "/user/tickets", label: "Support", icon: MessageSquare },
  ];

  const isActive = (path, exact) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-blue-600 to-blue-800 text-white flex flex-col">
        <div className="p-6 border-b border-blue-700">
          <h1 className="text-2xl font-bold">PlayXBets</h1>
          <p className="text-xs text-blue-200 mt-1">Sports Betting</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                isActive(item.path, item.exact)
                  ? "bg-blue-700 border-l-4 border-yellow-400"
                  : "hover:bg-blue-700"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-6 border-t border-blue-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-700 rounded-full flex items-center justify-center">
              <span className="font-bold">{user.username[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-medium text-sm">{user.username}</p>
              <p className="text-xs text-blue-200">Bettor</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
