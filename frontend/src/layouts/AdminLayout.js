import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Users, CheckCircle, Settings, LogOut, Menu, X, TrendingUp, FileText } from "lucide-react";

const menuItems = [
  { path: "/admin", label: "Dashboard", icon: Home, exact: true },
  { path: "/admin/bettors", label: "Manage Bettors", icon: Users },
  { path: "/admin/bets", label: "Bets Placed", icon: TrendingUp },
  { path: "/admin/outcomes", label: "Bet Settlement", icon: CheckCircle },
  { path: "/admin/withdrawals", label: "Withdrawals", icon: FileText },
  { path: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path, exact) => exact ? location.pathname === path : location.pathname.startsWith(path);
  const handleNavClick = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">PlayXBets <span className="text-xs font-normal text-gray-400">Admin</span></h1>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded" data-testid="mobile-menu-toggle">
          {sidebarOpen ? <X className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && <div className="md:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar — Light Theme */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        data-testid="admin-sidebar"
      >
        <div className="px-5 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold text-gray-900">PlayXBets</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">Admin Panel</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path, item.exact)
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className={`w-[18px] h-[18px] ${isActive(item.path, item.exact) ? 'text-blue-600' : 'text-gray-400'}`} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center">
              <span className="font-bold text-sm">{user.username[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">{user.username}</p>
              <p className="text-[11px] text-gray-400">Administrator</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
            data-testid="logout-button"
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
