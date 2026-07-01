'use client';

import { useMemo } from 'react';
import clsx from 'clsx';

/* ---------- Types ---------- */
interface SweepVerdictBarProps {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalFindings: number;
  isComplete: boolean;
}

/* ---------- Tile config ---------- */
const TILES = [
  { key: 'critical', label: 'Critical', colorBg: 'bg-red-500/15', colorText: 'text-red-400', colorBorder: 'border-red-500/30', colorGlow: 'shadow-red-500/20', icon: '🔴' },
  { key: 'high',     label: 'High',     colorBg: 'bg-orange-500/15', colorText: 'text-orange-400', colorBorder: 'border-orange-500/30', colorGlow: 'shadow-orange-500/20', icon: '🟠' },
  { key: 'medium',   label: 'Medium',   colorBg: 'bg-amber-500/15', colorText: 'text-amber-400', colorBorder: 'border-amber-500/30', colorGlow: 'shadow-amber-500/20', icon: '🟡' },
  { key: 'low',      label: 'Low',      colorBg: 'bg-blue-500/15', colorText: 'text-blue-400', colorBorder: 'border-blue-500/30', colorGlow: 'shadow-blue-500/20', icon: '🔵' },
] as const;

export default function SweepVerdictBar({
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  totalFindings,
  isComplete,
}: SweepVerdictBarProps) {
  const counts = useMemo(() => ({
    critical: criticalCount,
    high: highCount,
    medium: mediumCount,
    low: lowCount,
  }), [criticalCount, highCount, mediumCount, lowCount]);

  return (
    <div className="space-y-3">
      {/* Counter tiles */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"
        role="status"
        aria-live="polite"
        aria-label="Evidence scan findings summary"
      >
        {TILES.map((tile) => {
          const count = counts[tile.key];
          return (
            <div
              key={tile.key}
              className={clsx(
                'relative rounded-xl border p-3 sm:p-4 text-center transition-all duration-500',
                tile.colorBg, tile.colorBorder,
                count > 0 && `shadow-lg ${tile.colorGlow}`,
                isComplete && count > 0 && 'ring-1 ring-offset-1 ring-offset-slate-900',
                isComplete && tile.key === 'critical' && count > 0 && 'ring-red-500/50',
                isComplete && tile.key === 'high' && count > 0 && 'ring-orange-500/50',
                isComplete && tile.key === 'medium' && count > 0 && 'ring-amber-500/50',
                isComplete && tile.key === 'low' && count > 0 && 'ring-blue-500/50',
              )}
            >
              <div className={clsx('text-2xl sm:text-3xl font-black tabular-nums transition-all duration-300', tile.colorText)}>
                {count}
              </div>
              <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                {tile.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verdict bar */}
      <div
        className={clsx(
          'rounded-xl border px-4 py-3 flex items-center justify-between gap-3 transition-all duration-700',
          isComplete
            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10'
            : 'bg-slate-800/50 border-slate-700/40'
        )}
      >
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-2.5 h-2.5 rounded-full transition-all duration-500',
            isComplete ? 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]' : 'bg-slate-500 animate-pulse'
          )} />
          <span className={clsx(
            'text-xs sm:text-sm font-bold transition-colors duration-500',
            isComplete ? 'text-emerald-400' : 'text-slate-400'
          )}>
            {isComplete ? 'Evidence Scan Complete' : 'Scanning...'}
          </span>
        </div>
        <span className="text-xs sm:text-sm font-black text-slate-300 tabular-nums">
          {totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}
        </span>
      </div>
    </div>
  );
}
