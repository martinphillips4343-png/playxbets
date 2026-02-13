import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BetSlip({ bets, onRemoveBet, onPlaceBets }) {
  const [stakes, setStakes] = useState({});

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);
  const totalStake = Object.values(stakes).reduce((sum, stake) => sum + (parseFloat(stake) || 0), 0);
  const potentialReturn = totalStake * totalOdds;

  const handleStakeChange = (betId, value) => {
    setStakes(prev => ({ ...prev, [betId]: value }));
  };

  const handlePlaceBets = async () => {
    if (bets.length === 0) {
      toast.error("Add bets to your slip first");
      return;
    }

    if (totalStake === 0) {
      toast.error("Enter stake amounts");
      return;
    }

    try {
      await onPlaceBets(stakes);
      setStakes({});
      toast.success(`Bet placed! Potential return: $${potentialReturn.toFixed(2)}`);
    } catch (error) {
      toast.error("Failed to place bet");
    }
  };

  return (
    <aside 
      className="fixed right-0 top-0 h-screen w-80 bg-[#080808] border-l border-[#262626] flex flex-col"
      data-testid="betslip"
    >
      {/* Header */}
      <div className="p-6 border-b border-[#262626]">
        <h2 className="text-xl font-oswald font-bold text-gold uppercase tracking-wide">
          Bet Slip
        </h2>
        <p className="text-xs font-manrope text-[#A3A3A3] mt-1">
          {bets.length} {bets.length === 1 ? 'selection' : 'selections'}
        </p>
      </div>

      {/* Bets List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {bets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#525252] font-manrope">
              Your bet slip is empty
            </p>
          </div>
        ) : (
          bets.map((bet) => (
            <div
              key={bet.id}
              className="bg-[#0A0A0A] border border-[#262626] rounded-sm p-4"
              data-testid={`betslip-item-${bet.id}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="text-xs font-manrope text-[#A3A3A3] uppercase tracking-widest">
                    {bet.league}
                  </div>
                  <div className="text-sm font-manrope text-white mt-1">
                    {bet.teamHome} vs {bet.teamAway}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveBet(bet.id)}
                  className="text-[#A3A3A3] hover:text-[#FF3B30] transition-colors"
                  data-testid={`remove-bet-${bet.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-manrope text-[#A3A3A3] uppercase">
                  {bet.betType}
                </span>
                <span className="text-lg font-oswald font-bold text-gold">
                  {bet.odds.toFixed(2)}
                </span>
              </div>

              <div>
                <label className="text-xs font-manrope text-[#A3A3A3] uppercase tracking-widest">
                  Stake
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={stakes[bet.id] || ''}
                  onChange={(e) => handleStakeChange(bet.id, e.target.value)}
                  placeholder="0.00"
                  className="w-full mt-1 bg-[#050505] border border-[#262626] rounded-sm px-3 py-2 text-white font-manrope focus:outline-none focus:border-gold"
                  data-testid={`stake-input-${bet.id}`}
                />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer - Summary */}
      {bets.length > 0 && (
        <div className="border-t border-[#262626] p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm font-manrope">
              <span className="text-[#A3A3A3]">Total Odds</span>
              <span className="text-white font-bold">{totalOdds.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-manrope">
              <span className="text-[#A3A3A3]">Total Stake</span>
              <span className="text-white font-bold">${totalStake.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#262626]">
              <span className="text-sm font-manrope text-[#A3A3A3] uppercase">
                Potential Return
              </span>
              <span className="text-xl font-oswald font-bold text-gold">
                ${potentialReturn.toFixed(2)}
              </span>
            </div>
          </div>

          <Button
            onClick={handlePlaceBets}
            className="w-full bg-gold hover:bg-[#F4C430] text-black font-oswald font-bold uppercase tracking-wider text-base py-6 rounded-sm"
            data-testid="place-bet-button"
          >
            Place Bet
          </Button>
        </div>
      )}
    </aside>
  );
}
