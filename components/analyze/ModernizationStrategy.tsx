'use client';

import CcMessageStrip from '@/components/cc/MessageStrip';

interface Recommendations {
  keepCoreClean: string;
  decommissioning: string;
  cloudReadiness: string;
}

interface ModernizationStrategyProps {
  showHelpMode: boolean;
  recommendations?: Recommendations;
}

export default function ModernizationStrategy({ showHelpMode, recommendations }: ModernizationStrategyProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface-muted p-6 md:p-8 space-y-6">
      {showHelpMode && (
        <CcMessageStrip state="information">
          Identifies key architecture strategies to safeguard your ERP standard core.
        </CcMessageStrip>
      )}
      <div>
        <h3 className="cc-text-h2 text-cc-ink">Modernization Strategy</h3>
        <p className="cc-text-cell text-cc-ink-muted mt-1">Concrete actions to keep your core clean during target implementation.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc space-y-3">
          <h4 className="cc-text-label text-cc-ink-muted">Keep Core Clean</h4>
          <p className="cc-text-cell text-cc-ink">{recommendations?.keepCoreClean}</p>
        </div>

        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc space-y-3">
          <h4 className="cc-text-label text-cc-ink-muted">Decommissioning</h4>
          <p className="cc-text-cell text-cc-ink">{recommendations?.decommissioning}</p>
        </div>

        <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc space-y-3">
          <h4 className="cc-text-label text-cc-ink-muted">Cloud Readiness</h4>
          <p className="cc-text-cell text-cc-ink">{recommendations?.cloudReadiness}</p>
        </div>
      </div>
    </div>
  );
}
