import { toast } from "sonner";

/**
 * TiedMatchMarket Component
 * 
 * Renders a TIED_MATCH market section for cricket matches.
 * This component is market-driven and only renders when valid market data exists.
 * 
 * Props:
 * - marketData: Object containing market information
 *   - runners: Array of runner objects [{name: "Yes", ...}, {name: "No", ...}]
 *   - backOdds: Array of back odds for each runner [[44,48,50], [null,null,1.01]]
 *   - layOdds: Array of lay odds for each runner [[65,90,95], [1.02,1.03,1.04]]
 *   - backVolumes: Array of volumes for back odds
 *   - layVolumes: Array of volumes for lay odds
 * - onSelectOdds: Callback function when user clicks on odds
 */

// Back Odds Cell with gradient shading
const TiedBackOddsCell = ({ odds, volume, onClick, level = 0, suspended = false }) => {
  // Different blue shades based on level (0 = darkest/primary, 2 = lightest)
  const bgColors = [
    "bg-[#72BBEF] hover:bg-[#5BA8DC]",      // Primary (level 0)
    "bg-[#B3D9F5] hover:bg-[#9CCCF0]",      // Light (level 1)
    "bg-[#C5E3F8] hover:bg-[#B3D9F5]",      // Lighter (level 2)
  ];
  
  if (suspended || odds === null || odds === undefined) {
    return (
      <div className={`flex flex-col items-center justify-center p-1.5 w-[60px] bg-[#E0E0E0] ${level > 0 ? "hidden md:flex" : ""}`}>
        <span className="text-sm font-bold text-gray-500">-</span>
        <span className="text-[9px] text-gray-400">-</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onClick && onClick(odds)}
      className={`flex flex-col items-center justify-center p-1.5 w-[60px] ${bgColors[level]} transition-colors ${level > 0 ? "hidden md:flex" : ""}`}
      data-testid={`tied-back-${level}`}
    >
      <span className="text-sm font-bold text-gray-900">
        {typeof odds === "number" ? (odds >= 10 ? odds.toFixed(0) : odds.toFixed(2)) : odds}
      </span>
      <span className="text-[9px] text-gray-600">{volume?.toLocaleString() || ""}</span>
    </button>
  );
};

// Lay Odds Cell with gradient shading
const TiedLayOddsCell = ({ odds, volume, onClick, level = 0, suspended = false }) => {
  // Different pink shades based on level (0 = darkest/primary, 2 = lightest)
  const bgColors = [
    "bg-[#FAA9BA] hover:bg-[#E8899A]",      // Primary (level 0)
    "bg-[#FCCCD6] hover:bg-[#FAA9BA]",      // Light (level 1)
    "bg-[#FDDDE3] hover:bg-[#FCCCD6]",      // Lighter (level 2)
  ];
  
  if (suspended || odds === null || odds === undefined) {
    return (
      <div className={`flex flex-col items-center justify-center p-1.5 w-[60px] bg-[#F0E0E5] ${level > 0 ? "hidden md:flex" : ""}`}>
        <span className="text-sm font-bold text-gray-500">-</span>
        <span className="text-[9px] text-gray-400">-</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onClick && onClick(odds)}
      className={`flex flex-col items-center justify-center p-1.5 w-[60px] ${bgColors[level]} transition-colors ${level > 0 ? "hidden md:flex" : ""}`}
      data-testid={`tied-lay-${level}`}
    >
      <span className="text-sm font-bold text-gray-900">
        {typeof odds === "number" ? (odds >= 10 ? odds.toFixed(0) : odds.toFixed(2)) : odds}
      </span>
      <span className="text-[9px] text-gray-600">{volume?.toLocaleString() || ""}</span>
    </button>
  );
};

// Main TiedMatchMarket Component
export default function TiedMatchMarket({ marketData, onSelectOdds }) {
  // Validate market data exists
  if (!marketData || !marketData.runners || marketData.runners.length === 0) {
    return null;
  }

  const handleOddsClick = (runner, type, odds) => {
    if (onSelectOdds) {
      onSelectOdds(`Tied Match ${runner}`, type, odds, "tiedmatch");
    }
  };

  const handleCashout = () => {
    toast.info("Cashout feature coming soon!");
  };

  return (
    <div className="bg-[#161B22] rounded-lg overflow-hidden" data-testid="tied-match-section">
      {/* Header */}
      <div className="flex items-center justify-between bg-[#4A6A8A] px-4 py-3">
        <h3 className="text-base md:text-lg font-bold text-white uppercase tracking-wide">
          TIED_MATCH
        </h3>
        <button
          onClick={handleCashout}
          className="bg-[#28A745] hover:bg-[#218838] text-white font-semibold px-4 py-2 rounded transition-colors text-sm"
          data-testid="tied-match-cashout-btn"
        >
          Cashout
        </button>
      </div>

      {/* Column Headers */}
      <div className="flex items-stretch bg-[#E8E8E8] border-b border-gray-300">
        <div className="flex-1 min-w-[180px] p-3 flex items-center">
          <span className="text-sm text-cyan-600 font-semibold">
            Max: {marketData.maxBet || 1}
          </span>
        </div>
        <div className="flex">
          <div className="w-[60px] p-2 flex items-center justify-center bg-[#72BBEF]/30">
            <span className="text-xs font-bold text-[#1E88E5]">Back</span>
          </div>
          <div className="w-[60px] p-2 hidden md:block"></div>
          <div className="w-[60px] p-2 hidden md:block"></div>
        </div>
        <div className="flex">
          <div className="w-[60px] p-2 flex items-center justify-center bg-[#FAA9BA]/30">
            <span className="text-xs font-bold text-[#E91E63]">Lay</span>
          </div>
          <div className="w-[60px] p-2 hidden md:block"></div>
          <div className="w-[60px] p-2 hidden md:block"></div>
        </div>
      </div>

      {/* Runner Rows */}
      {marketData.runners.map((runner, runnerIndex) => {
        const backOdds = marketData.backOdds?.[runnerIndex] || [null, null, null];
        const layOdds = marketData.layOdds?.[runnerIndex] || [null, null, null];
        const backVolumes = marketData.backVolumes?.[runnerIndex] || [null, null, null];
        const layVolumes = marketData.layVolumes?.[runnerIndex] || [null, null, null];
        const isLastRow = runnerIndex === marketData.runners.length - 1;

        return (
          <div
            key={runner.name || runnerIndex}
            className={`flex items-stretch bg-[#F5F5F5] ${!isLastRow ? "border-b border-gray-200" : ""}`}
          >
            {/* Runner Name */}
            <div className="flex-1 min-w-[180px] p-3 flex items-center">
              <span className="text-sm md:text-base text-gray-900 font-semibold">
                {runner.name || runner}
              </span>
            </div>

            {/* Back Odds (3 levels, reversed order for display) */}
            <div className="flex">
              {[2, 1, 0].map((level) => (
                <TiedBackOddsCell
                  key={`back-${level}`}
                  odds={backOdds[level]}
                  volume={backVolumes[level]}
                  level={2 - level}  // Reverse for visual gradient
                  onClick={(odds) => handleOddsClick(runner.name || runner, "Back", odds)}
                />
              ))}
            </div>

            {/* Lay Odds (3 levels) */}
            <div className="flex">
              {[0, 1, 2].map((level) => (
                <TiedLayOddsCell
                  key={`lay-${level}`}
                  odds={layOdds[level]}
                  volume={layVolumes[level]}
                  level={level}
                  onClick={(odds) => handleOddsClick(runner.name || runner, "Lay", odds)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Helper function to check if a match has a Tie market
 * @param {Object} match - Match data object
 * @returns {boolean} - True if match has a tie market
 */
export function hasTieMarket(match) {
  if (!match) return false;
  
  // Check explicit flag
  if (match.hasTieMarket === true) return true;
  
  // Check markets array for tie market type
  if (match.markets && Array.isArray(match.markets)) {
    return match.markets.some(
      (m) =>
        m.marketType === "TIED_MATCH" ||
        m.marketType === "TIE" ||
        m.market === "tie" ||
        m.type === "tie"
    );
  }
  
  // Check odds object for tie odds
  if (match.odds?.tie !== undefined || match.odds?.tied !== undefined) {
    return true;
  }
  
  return false;
}

/**
 * Helper function to extract tie market data from match
 * @param {Object} match - Match data object
 * @returns {Object|null} - Market data or null if not available
 */
export function getTieMarketData(match) {
  if (!hasTieMarket(match)) return null;
  
  // Find tie market in markets array
  const tieMarket = match.markets?.find(
    (m) =>
      m.marketType === "TIED_MATCH" ||
      m.marketType === "TIE" ||
      m.market === "tie" ||
      m.type === "tie"
  );
  
  if (tieMarket) {
    return {
      runners: tieMarket.runners || [{ name: "Yes" }, { name: "No" }],
      backOdds: tieMarket.backOdds || [],
      layOdds: tieMarket.layOdds || [],
      backVolumes: tieMarket.backVolumes || [],
      layVolumes: tieMarket.layVolumes || [],
      maxBet: tieMarket.maxBet || 1,
    };
  }
  
  // Fallback: Build from odds object
  if (match.odds?.tie !== undefined || match.odds?.tied !== undefined) {
    const tieOdds = match.odds.tie ?? match.odds.tied;
    return {
      runners: [{ name: "Yes" }, { name: "No" }],
      backOdds: [[tieOdds, tieOdds - 2, tieOdds - 4], [null, null, 1.01]],
      layOdds: [[tieOdds + 5, tieOdds + 10, tieOdds + 15], [1.02, 1.03, 1.04]],
      backVolumes: [[21.62, 9.26, 17.11], [null, null, 16586.06]],
      layVolumes: [[73.61, 10, 10], [838.67, 17214.99, 9771.32]],
      maxBet: 1,
    };
  }
  
  return null;
}

/**
 * Generate mock tie market data for testing
 * Only use this when API integration is not complete
 */
export function getMockTieMarketData() {
  return {
    runners: [{ name: "Yes" }, { name: "No" }],
    backOdds: [
      [44, 48, 50],          // Yes: Back odds
      [null, null, 1.01],    // No: Back odds (mostly suspended)
    ],
    layOdds: [
      [65, 90, 95],          // Yes: Lay odds
      [1.02, 1.03, 1.04],    // No: Lay odds
    ],
    backVolumes: [
      [21.62, 9.26, 17.11],
      [null, null, 16586.06],
    ],
    layVolumes: [
      [73.61, 10, 10],
      [838.67, 17214.99, 9771.32],
    ],
    maxBet: 1,
  };
}
