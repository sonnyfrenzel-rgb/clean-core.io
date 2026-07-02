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
  {
    key: 'critical',
    label: 'Critical',
    colorBg: 'bg-red-500/20',
    colorBgActive: 'bg-red-500/30',
    colorText: 'text-red-400',
    colorBorder: 'border-red-500/30',
    colorGlow: 'shadow-red-500/30',
    topBorder: 'border-t-red-500',
    ring: 'ring-red-500/50',
  },
  {
    key: 'high',
    label: 'High',
    colorBg: 'bg-orange-500/20',
    colorBgActive: 'bg-orange-500/30',
    colorText: 'text-orange-400',
    colorBorder: 'border-orange-500/30',
    colorGlow: 'shadow-orange-500/30',
    topBorder: 'border-t-orange-500',
    ring: 'ring-orange-500/50',
  },
  {
    key: 'medium',
    label: 'Medium',
    colorBg: 'bg-amber-500/20',
    colorBgActive: 'bg-amber-500/30',
    colorText: 'text-amber-400',
    colorBorder: 'border-amber-500/30',
    colorGlow: 'shadow-amber-500/30',
    topBorder: 'border-t-amber-500',
    ring: 'ring-amber-500/50',
  },
  {
    key: 'low',
    label: 'Low',
    colorBg: 'bg-blue-500/20',
    colorBgActive: 'bg-blue-500/30',
    colorText: 'text-blue-400',
    colorBorder: 'border-blue-500/30',
    colorGlow: 'shadow-blue-500/30',
    topBorder: 'border-t-blue-500',
    ring: 'ring-blue-500/50',
  },
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
          const hasFindings = count > 0;
          return (
            <div
              key={tile.key}
              className={clsx(
                'relative rounded-xl border border-t-[3px] p-4 sm:p-5 text-center transition-all duration-500',
                hasFindings ? tile.colorBgActive : tile.colorBg,
                tile.colorBorder,
                tile.topBorder,
                hasFindings && `shadow-lg ${tile.colorGlow}`,
                isComplete && hasFindings && `ring-1 ring-offset-1 ring-offset-slate-900 ${tile.ring}`,
              )}
            >
              <div className={clsx(
                'text-3xl sm:text-4xl font-black tabular-nums transition-all duration-300',
                tile.colorText,
                isComplete && hasFindings && 'scale-110',
              )}>
                {count}
              </div>
              <div className="text-[10px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-widest mt-1.5">
                {tile.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verdict status bar */}
      <div
        className={clsx(
          'rounded-xl border px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 transition-all duration-700',
          isComplete
            ? 'bg-emerald-500/15 border-emerald-500/40 shadow-lg shadow-emerald-500/15'
            : 'bg-slate-800/50 border-slate-700/40'
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className={clsx(
            'w-3 h-3 rounded-full transition-all duration-500',
            isComplete
              ? 'bg-emerald-400 shadow-[0_0_12px_3px_rgba(52,211,153,0.6)]'
              : 'bg-slate-500 animate-pulse'
          )} />
          <span className={clsx(
            'text-xs sm:text-sm font-extrabold tracking-wide transition-colors duration-500',
            isComplete ? 'text-emerald-400' : 'text-slate-400'
          )}>
            {isComplete ? '✓ Evidence Scan Complete' : 'Scanning…'}
          </span>
        </div>
        <span className={clsx(
          'text-xs sm:text-sm font-black tabular-nums transition-colors duration-500',
          isComplete ? 'text-emerald-300' : 'text-slate-300'
        )}>
          {totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}
        </span>
      </div>
    </div>
  );
}
