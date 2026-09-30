'use client';

import { BarChart3 } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';

interface BusinessValueAuditProps {
  projectId: string;
  /**
   * Null means the analysis did not produce it. The page used to substitute — an
   * asset score of 82/55/35 picked by a string comparison, a maintenance cost
   * from `(100 - score) * 180 + 1200` — so these were never null and the honest
   * branches below were unreachable. See docs/ARCHITECTURE.md §5.3.
   */
  bizFallback: {
    legacyAssetScore: number | null;
    technicalDebtLevel: string | null;
    valueDrivers: string[] | null;
  };
}

/** An amount, not a state: the darkest step of the sequential palette (§1.8), never green. */
const SCORE_BAR = SEQUENTIAL_CHART_COLORS[SEQUENTIAL_CHART_COLORS.length - 1].bg;

export default function BusinessValueAudit({ projectId, bizFallback }: BusinessValueAuditProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc flex flex-col justify-between">
      <div className="space-y-6">
        <div>
          <span className="cc-text-label text-cc-ink-muted">Business Value Audit</span>
          <h3 className="cc-text-h2 text-cc-ink mt-2">Legacy Asset Valuation</h3>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Quality audit of the legacy custom codebase. It puts no money on it.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Legacy Asset Score — the model's number, and marked as such. */}
          <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="cc-text-label text-cc-ink-muted">Legacy Asset Value</span>
              {bizFallback.legacyAssetScore !== null && <CcProvenanceChip value="proposed" />}
            </div>
            {bizFallback.legacyAssetScore !== null ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="cc-text-title text-cc-ink">{bizFallback.legacyAssetScore}%</span>
                  <span className="cc-text-meta text-cc-ink-muted">IP Score</span>
                </div>
                <div className="h-1.5 w-full bg-cc-line rounded-full mt-3 overflow-hidden">
                  <div className={`h-full rounded-full ${SCORE_BAR}`} style={{ width: `${bizFallback.legacyAssetScore}%` }}></div>
                </div>
              </>
            ) : (
              // No bar either: a zero-width bar reads as "scored zero".
              <span className="cc-text-cell text-cc-ink-muted">not determined</span>
            )}
          </div>

          {/* Technical Debt Estimate */}
          <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex flex-col justify-between">
            <div>
              <span className="cc-text-label text-cc-ink-muted block mb-1">Technical Debt Level</span>
              <CcTag>
                {bizFallback.technicalDebtLevel ? `${bizFallback.technicalDebtLevel} Debt` : 'Debt not computed'}
              </CcTag>
            </div>
            {/* Roadmap step 0.4: no amount without approved cost assumptions — and an analysis has none. */}
            <div className="mt-2 cc-text-meta text-cc-ink-muted" data-money-not-determined>
              Maintenance cost: <span className="text-cc-ink">not determined</span>
            </div>
          </div>
        </div>

        {/* Value Drivers List */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cc-text-label text-cc-ink-muted">Legacy Business Value Drivers</span>
            {!!bizFallback.valueDrivers?.length && <CcProvenanceChip value="proposed" />}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(bizFallback.valueDrivers ?? []).map((driver, dIdx) => (
              <div key={dIdx} className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2 flex items-center gap-2 cc-text-cell text-cc-ink">
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-cc-ink-muted shrink-0"></span>
                <span className="truncate">{driver}</span>
              </div>
            ))}
            {!bizFallback.valueDrivers?.length && (
              <span className="cc-text-cell text-cc-ink-muted">Not identified for this run.</span>
            )}
          </div>
        </div>

        {/* Economics CTA: the only place that prices anything, from the user's own figures */}
        <div className="border-t border-cc-line pt-4">
          <CcLinkButton
            href={`/project/${projectId}/tco`}
            variant="secondary"
            density="cozy"
            icon={<BarChart3 size={16} aria-hidden="true" />}
          >
            Economics: model with your own figures
          </CcLinkButton>
        </div>
      </div>

      {/* cost and ROI: stated as not determined */}
      <div className="mt-6">
        <CcMessageStrip state="neutral" headline="Cost and ROI">
          <span data-money-not-determined>
            Not determined. A cost or ROI figure needs approved cost assumptions, and this analysis has none — the Economics stage models costs only from figures you enter.
          </span>
        </CcMessageStrip>
      </div>
    </div>
  );
}
