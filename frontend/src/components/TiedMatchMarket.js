import { useState } from "react";

/**
 * TiedMatchMarket Component - YES/NO layout with bright blue/red colors
 */
export default function TiedMatchMarket({ match, onSelectOdds, ballRunning = false, matchSuspended = false }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const tieOdds = getTieOdds(match);
  const isSuspended = ballRunning || matchSuspended;

  return (
    <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="tied-match-section">
      <div
        className="flex items-center justify-between px-4 py-3 bg-[#2C3E50] cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">TIED MATCH</span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && (
        <>
          <div className="flex items-stretch bg-[#232B36] border-b border-gray-700">
            <div className="flex-1 min-w-[180px] p-2 flex items-center">
              <span className="text-[11px] text-cyan-400 font-medium">Min: 100  Max: 1L</span>
            </div>
            <div className="flex">
              <div className="w-[65px] p-1 text-center bg-[#dc2626]/20"><span className="text-[10px] font-bold text-[#fca5a5]">No</span></div>
              <div className="w-[65px] p-1 text-center bg-[#2563eb]/20"><span className="text-[10px] font-bold text-[#60a5fa]">Yes</span></div>
            </div>
          </div>

          {/* YES Row */}
          <div className="flex items-stretch border-b border-gray-700/50 bg-[#1E2736]">
            <div className="flex-1 min-w-[180px] p-3 flex items-center">
              <span className="text-sm text-white font-semibold">YES</span>
            </div>
            <div className="flex">
              {isSuspended ? (
                <div className="flex items-center justify-center w-[130px] bg-gray-700/40">
                  <span className="text-xs font-bold text-red-400 animate-pulse">SUSPENDED</span>
                </div>
              ) : (
                <>
                  <button onClick={() => onSelectOdds && onSelectOdds("Tied Match YES", "Back", tieOdds.yesBack)}
                    className="flex flex-col items-center justify-center p-2 w-[65px] bg-[#dc2626] hover:bg-[#b91c1c] transition-colors cursor-pointer" data-testid="tied-yes-no">
                    <span className="text-sm font-bold text-white">{tieOdds.yesBack.toFixed(1)}</span>
                  </button>
                  <button onClick={() => onSelectOdds && onSelectOdds("Tied Match YES", "Lay", tieOdds.yesLay)}
                    className="flex flex-col items-center justify-center p-2 w-[65px] bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors cursor-pointer" data-testid="tied-yes-yes">
                    <span className="text-sm font-bold text-white">{tieOdds.yesLay.toFixed(1)}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* NO Row */}
          <div className="flex items-stretch bg-[#1E2736]">
            <div className="flex-1 min-w-[180px] p-3 flex items-center">
              <span className="text-sm text-white font-semibold">NO</span>
            </div>
            <div className="flex">
              {isSuspended ? (
                <div className="flex items-center justify-center w-[130px] bg-gray-700/40">
                  <span className="text-xs font-bold text-red-400 animate-pulse">SUSPENDED</span>
                </div>
              ) : (
                <>
                  <button onClick={() => onSelectOdds && onSelectOdds("Tied Match NO", "Back", tieOdds.noBack)}
                    className="flex flex-col items-center justify-center p-2 w-[65px] bg-[#dc2626] hover:bg-[#b91c1c] transition-colors cursor-pointer" data-testid="tied-no-no">
                    <span className="text-sm font-bold text-white">{tieOdds.noBack.toFixed(1)}</span>
                  </button>
                  <button onClick={() => onSelectOdds && onSelectOdds("Tied Match NO", "Lay", tieOdds.noLay)}
                    className="flex flex-col items-center justify-center p-2 w-[65px] bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors cursor-pointer" data-testid="tied-no-yes">
                    <span className="text-sm font-bold text-white">{tieOdds.noLay.toFixed(1)}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function getTieOdds(match) {
  const format = match?.format || "t20";
  if (format === "t20") return { yesBack: 50, yesLay: 65, noBack: 1.01, noLay: 1.02 };
  if (format === "odi") return { yesBack: 80, yesLay: 95, noBack: 1.01, noLay: 1.02 };
  return { yesBack: 8, yesLay: 12, noBack: 1.05, noLay: 1.08 };
}
