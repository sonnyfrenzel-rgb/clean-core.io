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

/* ---------- Tile config (light background — punchy, distinguishable) ---------- */
const TILES = [
  {
    key: 'critical',
    label: 'Critical',
    bg: 'bg-red-50',
    bgActive: 'bg-red-100',
    text: 'text-red-600',
    labelText: 'text-red-500',
    border: 'border-red-200',
    topBorder: 'border-t-red-500',
    glow: 'shadow-red-300/50',
    ring: 'ring-red-400',
  },
  {
    key: 'high',
    label: 'High',
    bg: 'bg-orange-50',
    bgActive: 'bg-orange-100',
    text: 'text-orange-600',
    labelText: 'text-orange-500',
    border: 'border-orange-200',
    topBorder: 'border-t-orange-500',
    glow: 'shadow-orange-300/50',
    ring: 'ring-orange-400',
  },
  {
    key: 'medium',
    label: 'Medium',
    bg: 'bg-amber-50',
    bgActive: 'bg-amber-100',
    text: 'text-amber-600',
    labelText: 'text-amber-600',
    border: 'border-amber-200',
    topBorder: 'border-t-amber-500',
    glow: 'shadow-amber-300/50',
    ring: 'ring-amber-400',
  },
  {
    key: 'low',
    label: 'Low',
    bg: 'bg-blue-50',
    bgActive: 'bg-blue-100',
    text: 'text-blue-600',
    labelText: 'text-blue-500',
    border: 'border-blue-200',
    topBorder: 'border-t-blue-500',
    glow: 'shadow-blue-300/50',
    ring: 'ring-blue-400',
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
                hasFindings ? tile.bgActive : tile.bg,
                tile.border,
                tile.topBorder,
                hasFindings && `shadow-md ${tile.glow}`,
                isComplete && hasFindings && `ring-2 ring-offset-1 ring-offset-white ${tile.ring}`,
              )}
            >
              <div className={clsx(
                'text-3xl sm:text-4xl font-black tabular-nums transition-all duration-300',
                hasFindings ? tile.text : 'text-slate-300',
                isComplete && hasFindings && 'scale-110',
              )}>
                {count}
              </div>
              <div className={clsx(
                'text-[10px] sm:text-xs font-extrabold uppercase tracking-widest mt-1.5',
                hasFindings ? tile.labelText : 'text-slate-400',
              )}>
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
            ? 'bg-emerald-50 border-emerald-300 shadow-sm shadow-emerald-200/60'
            : 'bg-slate-50 border-slate-200'
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className={clsx(
            'w-3 h-3 rounded-full transition-all duration-500',
            isComplete
              ? 'bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.5)]'
              : 'bg-slate-400 animate-pulse'
          )} />
          <span className={clsx(
            'text-xs sm:text-sm font-extrabold tracking-wide transition-colors duration-500',
            isComplete ? 'text-emerald-700' : 'text-slate-500'
          )}>
            {isComplete ? '✓ Evidence Scan Complete' : 'Scanning…'}
          </span>
        </div>
        <span className={clsx(
          'text-xs sm:text-sm font-black tabular-nums transition-colors duration-500',
          isComplete ? 'text-emerald-600' : 'text-slate-500'
        )}>
          {totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}
        </span>
      </div>
    </div>
  );
}
