'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { clsx } from 'clsx';
import type { Project } from '@/lib/types';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { CcSeverity } from '@/components/cc/Identifier';

/**
 * "Why this route & score" — a small, collapsible transparency panel on the Analyze
 * results. It surfaces the deterministic router rationale, confidence, the three scores,
 * and the data-coupling findings that drove them, so an architect can see the reasoning
 * (evidence, not an AI guess) without opening the full evidence report.
 */
const ARCH: Record<string, string> = {
  rap: 'In-App ABAP Cloud (RAP)',
  cap: 'Side-by-Side BTP (CAP)',
  integration: 'SAP Integration Suite',
  event: 'SAP Event Mesh',
  retire: 'Retire / Decommission',
};

export default function WhyScorePanel({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);

  const conf = project.recommendationConfidence;
  const rationale = project.recommendationJustification;
  const route = project.targetArchitecture
    ? ARCH[project.targetArchitecture] || project.targetArchitecture
    : project.extensibilityRoute || '—';
  const coupling = project.dataCoupling || [];

  // Nothing to explain yet — don't render an empty panel.
  if (!rationale && conf == null && coupling.length === 0) return null;

  const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
  coupling.forEach((c) => { if (counts[c.riskLevel] != null) counts[c.riskLevel] += 1; });
  const highRisk = coupling.filter((c) => c.riskLevel === 'High').slice(0, 6);

  const scores = [
    { label: 'Clean Core', v: project.cleanCoreScore, max: 100, basis: 'The Clean Core Score of the run, computed by the deterministic router from the evidence before any model ran.' },
    { label: 'Complexity', v: project.complexityScore, max: 10, basis: 'A heuristic over the structure of the code (lib/abap/code-assessment.ts, computeComplexityScore).' },
    { label: 'Criticality', v: project.criticalityScore, max: 10, basis: 'A heuristic over the module and the data the code touches (lib/abap/code-assessment.ts, computeCriticalityScore).' },
  ];

  return (
    <div className="not-prose mt-8 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-4 sm:px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-2 text-cc-ink-muted">
            <Info className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <div className="cc-text-label text-cc-ink-muted">Transparency</div>
            <h3 className="cc-text-h2 text-cc-ink">Why this route &amp; score</h3>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {conf != null && <span className="hidden sm:inline cc-text-meta text-cc-ink-muted">{conf}% confidence</span>}
          <ChevronDown className={clsx('w-5 h-5 text-cc-ink-muted motion-safe:transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </div>
      </button>

      <div className={clsx('grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-4 sm:px-6 pb-6 pt-1 space-y-6">
            {/* Route + confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="cc-text-identifier text-cc-ink">Recommended route:</span>
              <span className="cc-text-identifier text-cc-ink rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-1">{route}</span>
              {conf != null && (
                <div className="flex items-center gap-2">
                  {/* One measure, one ink: the bar is not a verdict, so it
                      carries no traffic-light colour (§1.8). */}
                  <div className="w-28 h-2 rounded-full bg-cc-surface-muted border border-cc-line overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cc-neutral"
                      style={{ width: `${Math.min(100, Math.max(0, conf))}%` }}
                    />
                  </div>
                  <span className="cc-text-meta text-cc-ink-muted">{conf}%</span>
                  <CcWhyPopover
                    subject={`Route confidence ${conf}%`}
                    provenance="reconstructed"
                    basis="The deterministic extensibility router, from the findings of this run — before any model call."
                    evidence={rationale || undefined}
                  />
                </div>
              )}
            </div>

            {/* Rationale */}
            {rationale && (
              <div>
                <div className="cc-text-label text-cc-ink-muted mb-2">Router rationale (deterministic)</div>
                <p className="cc-text-body text-cc-ink">{rationale}</p>
              </div>
            )}

            {/* Scores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {scores.map((s) => (
                <div key={s.label} className="rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="cc-text-title tabular-nums text-cc-ink">
                      {s.v ?? '—'}
                      <span className="cc-text-meta text-cc-ink-muted">/{s.max}</span>
                    </span>
                    {s.v != null && (
                      <CcWhyPopover
                        subject={`${s.label} ${s.v}/${s.max}`}
                        provenance="reconstructed"
                        basis={s.basis}
                      />
                    )}
                  </div>
                  <div className="cc-text-label text-cc-ink-muted mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* What drove it */}
            {coupling.length > 0 && (
              <div>
                <div className="cc-text-label text-cc-ink-muted mb-2">What drove it — data coupling by risk</div>
                <div className="flex flex-wrap gap-3 mb-3">
                  {(['High', 'Medium', 'Low'] as const).map((lvl) => (
                    <span key={lvl} className="inline-flex items-center gap-2 cc-text-identifier text-cc-ink">
                      <span className="tabular-nums">{counts[lvl]}</span>
                      <CcSeverity value={lvl} />
                    </span>
                  ))}
                </div>
                {highRisk.length > 0 && (
                  <ul className="space-y-2">
                    {highRisk.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 cc-text-cell">
                        <span className="font-cc-mono font-semibold text-cc-ink shrink-0">{c.tableName}</span>
                        <span className="text-cc-ink-muted">— {c.recommendation}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="cc-text-meta text-cc-ink-muted border-t border-cc-line pt-3">
              These figures come from the deterministic evidence engine, before any model call. The route and
              score are computed from the findings above — derived from the code, not guessed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
