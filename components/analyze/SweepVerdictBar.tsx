'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CcSeverity } from '@/components/cc/Identifier';
import type { SeverityValue } from '@/lib/severity';

/* ---------- Types ---------- */
interface SweepVerdictBarProps {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalFindings: number;
  isComplete: boolean;
}

/**
 * The four counters above the sweep. The severity word comes from
 * `CcSeverity` (ADR-049) — the tile itself stays a plain light surface, so the
 * colour of a severity lives in exactly one place. "Low" counts Low and Info
 * findings together, as it always has; the tile says so in its word.
 *
 * The finished state is ink on a neutral surface, not green: a scan that ran to
 * the end has read the code, it has not proven anything about it (ADR-007).
 */
const TILES: { key: 'critical' | 'high' | 'medium' | 'low'; severity: SeverityValue }[] = [
  { key: 'critical', severity: 'Critical' },
  { key: 'high', severity: 'High' },
  { key: 'medium', severity: 'Medium' },
  { key: 'low', severity: 'Low' },
];

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
              className="rounded-cc-card border border-cc-line bg-cc-surface p-4 text-center shadow-cc"
            >
              <div
                className={cn(
                  'cc-text-title tabular-nums',
                  count > 0 ? 'text-cc-ink' : 'text-cc-ink-muted',
                )}
              >
                {count}
              </div>
              <div className="mt-2">
                <CcSeverity value={tile.severity} />
                {tile.key === 'low' ? <span className="ml-1 cc-text-meta text-cc-ink-muted">+ Info</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verdict status bar */}
      <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-4 py-3 flex items-center justify-between gap-3">
        <span className="cc-text-identifier text-cc-ink">
          {isComplete ? 'Evidence scan complete' : 'Scanning…'}
        </span>
        <span className="cc-text-identifier tabular-nums text-cc-ink">
          {totalFindings} {totalFindings === 1 ? 'finding' : 'findings'}
        </span>
      </div>
    </div>
  );
}
