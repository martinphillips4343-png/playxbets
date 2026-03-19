import { NavLink } from "react-router-dom";
import { Activity, Trophy } from "lucide-react";

export default function Sidebar() {
  const navItems = [
    { path: "/", label: "Live", icon: Activity },
   
  ];

  return (
    <aside 
      className="fixed left-0 top-0 h-screen w-64 bg-[#080808] border-r border-[#262626] flex flex-col"
      data-testid="sidebar"
    >
      {/* Logo */}
      <div className="p-6 border-b border-[#262626]">
        <h1 className="text-3xl font-oswald font-bold text-gold tracking-tight">
          PLAY<span className="text-white">BETS</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2" data-testid="nav-menu">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            data-testid={`nav-${item.label.toLowerCase()}`}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-md font-manrope font-medium transition-all group ${
                isActive
                  ? "bg-[#0A0A0A] text-gold border-l-2 border-gold"
                  : "text-[#A3A3A3] hover:bg-[#0A0A0A] hover:text-white"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-base uppercase tracking-wide">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-6 border-t border-[#262626]">
        <div className="text-xs font-manrope text-[#525252] uppercase tracking-widest">
          Balance
        </div>
        <div className="text-2xl font-oswald font-bold text-gold mt-1">
          $1,250.00
        </div>
      </div>
    </aside>
  );
}
