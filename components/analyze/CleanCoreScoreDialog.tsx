'use client';

import React from 'react';
import CcDialog from '@/components/cc/Dialog';
import { SCORE_BANDS, SCORE_BANDS_SOURCE, SCORE_NATURE } from '@/lib/clean-core-score';
import { scoreBandChartColor } from '@/lib/chart-colors';

/**
 * "Understanding Clean Core" — the dialog behind the score's help button on the
 * Analyze object page, a real project's and the demo's alike (one dialog, so
 * the two cannot explain the score in two ways). A CcDialog (D.10b): focus kept
 * inside, Escape closes, focus returns to the button that opened it.
 *
 * The bands are read off the score's own deduction table
 * (`lib/clean-core-score.ts`) — Clean-Core.io's official bands. The four
 * "architecture tiers" that stood here (100 / 90 / 85 / 0) were archetypes no
 * rule produced: the floor is 5, and a modification costs at most 40.
 */
export default function CleanCoreScoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <CcDialog
      open={open}
      title="Understanding Clean Core"
      lead="The Clean Core Score is our own grade for this one piece of code, 5–100, higher is better — a grade, not a compliance percentage, and not an SAP figure. It is computed by fixed rules from the findings, before any model runs."
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="cc-text-label text-cc-ink-muted">What a score means</p>
        {[...SCORE_BANDS].reverse().map((band) => (
          <div key={band.key} data-score-dialog-band={band.key} className="flex gap-4 p-3 rounded-cc-row bg-cc-surface-muted border border-cc-line">
            <span className="w-16 h-12 rounded-cc-row border border-cc-field-border bg-cc-surface text-cc-ink font-cc-mono cc-text-meta flex flex-col items-center justify-center gap-1 shrink-0">
              <span aria-hidden={true} data-score-swatch={band.key} className={`h-2 w-6 rounded-cc-row ${scoreBandChartColor(band.key).bg}`} />
              {band.from}–{band.to}
            </span>
            <div className="space-y-1">
              <h3 className="cc-text-h3 text-cc-ink">{band.label}</h3>
              <p className="cc-text-cell text-cc-ink-muted">{band.meaning}</p>
              <p className="cc-text-meta font-medium text-cc-ink-muted">{band.because}</p>
            </div>
          </div>
        ))}
        <p className="cc-text-meta font-medium text-cc-ink-muted">
          {SCORE_BANDS_SOURCE}. {SCORE_NATURE}.
        </p>
      </div>
    </CcDialog>
  );
}
