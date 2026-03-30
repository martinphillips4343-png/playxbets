import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, TrendingUp, History, ArrowDownCircle, MessageSquare, LogOut, Menu, X, Wallet } from "lucide-react";

export default function UserLayout({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { path: "/user", label: "Dashboard", icon: Home, exact: true },
    { path: "/user/betting", label: "Place Bets", icon: TrendingUp },
    { path: "/user/history", label: "Betting History", icon: History },
    { path: "/user/recharges", label: "Recharge History", icon: Wallet },
    { path: "/user/withdrawals", label: "Withdrawal History", icon: ArrowDownCircle },
    { path: "/user/tickets", label: "Support", icon: MessageSquare },
  ];

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);
  const handleNavClick = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">PlayXBets</h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded" data-testid="mobile-menu-toggle">
          {sidebarOpen ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — Light Theme */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="px-5 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">PlayXBets</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Sports Betting</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path, item.exact)
                  ? "bg-blue-50 text-blue-700 border-l-3 border-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] ${isActive(item.path, item.exact) ? 'text-blue-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Quick Actions */}
          <div className="mt-4 mx-2 px-2">
            <p className="text-[10px] text-gray-400 uppercase mb-2 font-semibold tracking-wider">Quick Actions</p>
            <a
              href={`https://wa.me/918778156678?text=Hello%2C%20I%20am%20${encodeURIComponent(user.username)}.%20Recharge%20%E2%82%B9500`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm transition-colors border border-green-200"
              data-testid="sidebar-whatsapp-deposit"
            >
              <ArrowDownCircle className="w-4 h-4" />
              <span className="font-medium">Deposit via WhatsApp</span>
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center">
              <span className="font-bold text-sm">{user.username[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{user.username}</p>
              <p className="text-[11px] text-gray-400">Bettor</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
