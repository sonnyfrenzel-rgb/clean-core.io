'use client';

import { CheckCircle2, Layers, Trash2, Info } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { SEQUENTIAL_CHART_COLORS } from '@/lib/chart-colors';

/** A step of the model's three-word answer: an amount, not a state (§1.8) — never green. */
const FIT_STEP = SEQUENTIAL_CHART_COLORS[SEQUENTIAL_CHART_COLORS.length - 1].bg;

interface TargetScopeMappingProps {
  showHelpMode: boolean;
  standardFit?: {
    potential: 'High' | 'Medium' | 'Low';
    targetStandardProcess: string;
    rationale: string;
  };
  recommendations?: {
    keepCoreClean: string;
    decommissioning: string;
    cloudReadiness: string;
  };
}

export default function TargetScopeMapping({ showHelpMode, standardFit, recommendations }: TargetScopeMappingProps) {
  return (
    <div className="rounded-cc-card border border-cc-line bg-cc-surface p-6 shadow-cc space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="cc-text-h2 text-cc-ink">Target Scope & Extensibility Mapping</h3>
            {/* The fit is the model's answer: said so where the spark icon used to stand. */}
            {standardFit && <CcProvenanceChip value="proposed" />}
            {showHelpMode && (
              <div className="group relative">
                <Info size={16} aria-hidden="true" className="text-cc-ink-muted cursor-help shrink-0" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 max-w-[85vw] bg-cc-overlay text-cc-on-dark cc-text-cell rounded-cc-row p-3 shadow-cc-dialog opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50">
                  <strong>Enterprise Architecture Mapping:</strong> Categorizes your legacy code into modern SAP clean core boundaries to identify what can be decommissioned or automated.
                </div>
              </div>
            )}
          </div>
          <p className="cc-text-cell text-cc-ink-muted mt-1">Strategic alignment of custom legacy logic with modern S/4HANA extensibility guidelines.</p>
        </div>
        <span className="shrink-0 self-start sm:self-center">
          <CcTag>Clean Core Mapping</CcTag>
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: S/4HANA Standard Fit */}
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cc-ink-muted">
              <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
              <span className="cc-text-label">Standard Fit</span>
            </div>
            <h4 className="cc-text-h3 text-cc-ink">{standardFit?.targetStandardProcess || 'S/4HANA Best Practice'}</h4>
            <p className="cc-text-cell text-cc-ink">{standardFit?.rationale}</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2 cc-text-label text-cc-ink-muted mb-2">
              <span>Standardization Fit</span>
              {/* 90 / 50 / 15 % were three numbers picked to look like a
                  measurement. What the model actually returns is one of three
                  words, so that is what is shown — with a bar of three steps
                  rather than a percentage nothing computed. */}
              <span className="text-cc-ink">
                {standardFit?.potential || 'Not assessed'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-cc-line rounded-full overflow-hidden flex gap-0.5">
              {['Low', 'Medium', 'High'].map((step, i) => {
                const rank = standardFit?.potential === 'High' ? 3 : standardFit?.potential === 'Medium' ? 2 : standardFit?.potential === 'Low' ? 1 : 0;
                return (
                  <div
                    key={step}
                    className={`h-full flex-1 rounded-full ${i < rank ? FIT_STEP : 'bg-transparent'}`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Column 2: Transformed BTP Extension */}
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cc-ink-muted">
              <Layers size={16} aria-hidden="true" className="shrink-0" />
              <span className="cc-text-label">Modern Extension</span>
            </div>
            <h4 className="cc-text-h3 text-cc-ink">Side-by-Side BTP / Node.js</h4>
            <p className="cc-text-cell text-cc-ink">{recommendations?.cloudReadiness || 'Custom API layers and microservices completely transformed from standard core.'}</p>
          </div>
          {/* "Cloud Readiness 95 %" and the bar under it were a number and a
              width written into the file — nothing measures either, and the
              column beside this one had already given up its invented 90/50/15
              for the three words the model actually returns. A meter with no
              measurement behind it is the same claim in a friendlier shape, so
              it is gone rather than rounded (UX review of 52f171091948,
              29e1d6c0013f). The description above stays: it says what this
              column is for without pretending to have counted it. */}
        </div>

        {/* Column 3: Obsolete / Retire */}
        <div className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cc-ink-muted">
              <Trash2 size={16} aria-hidden="true" className="shrink-0" />
              <span className="cc-text-label">Decommission</span>
            </div>
            <h4 className="cc-text-h3 text-cc-ink">Redundant & Obsolete Logic</h4>
            <p className="cc-text-cell text-cc-ink">{recommendations?.decommissioning || 'Obsolete SAP workarounds, manual validation structures, and unused code blocks.'}</p>
          </div>
          {/* Same as the column before: no ratio was ever computed. */}
        </div>
      </div>
    </div>
  );
}
