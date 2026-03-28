import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  Trophy, 
  CheckCircle, 
  DollarSign, 
  ArrowDownCircle, 
  MessageSquare,
  LogOut,
  Play,
  Menu,
  X
} from "lucide-react";

export default function AdminLayout({ user, onLogout }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menuItems = [
    { path: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { path: "/admin/bettors", label: "Manage Bettors", icon: Users },
    { path: "/admin/games", label: "Manage Games", icon: Trophy },
    { path: "/admin/bets", label: "Bets Placed", icon: CheckCircle },
    { path: "/admin/outcomes", label: "Bet Settlement", icon: CheckCircle },
    { path: "/admin/deposits", label: "Deposits", icon: DollarSign },
    { path: "/admin/withdrawals", label: "Withdrawals", icon: ArrowDownCircle },
    { path: "/admin/tickets", label: "Support Ticket", icon: MessageSquare },
  ];

  const isActive = (path, exact) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#1e3a8a] text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">PlayXBets Admin</h1>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)} 
          className="p-2 hover:bg-blue-700 rounded"
          data-testid="mobile-menu-toggle"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-[#1e3a8a] text-white flex flex-col transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        data-testid="admin-sidebar"
      >
        {/* Logo */}
        <div className="p-4 md:p-6 border-b border-blue-700">
          <h1 className="text-xl md:text-2xl font-bold">PlayXBets</h1>
          <p className="text-xs text-blue-300 mt-1">Admin Panel</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-4 md:px-6 py-3 transition-colors ${
                isActive(item.path, item.exact)
                  ? "bg-blue-700 border-l-4 border-yellow-400"
                  : "hover:bg-blue-800"
              }`}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* User Info */}
        <div className="p-4 md:p-6 border-t border-blue-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-700 rounded-full flex items-center justify-center">
              <span className="font-bold text-sm md:text-base">{user.username[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-medium text-sm">{user.username}</p>
              <p className="text-xs text-blue-300">Administrator</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 rounded text-sm transition-colors"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
