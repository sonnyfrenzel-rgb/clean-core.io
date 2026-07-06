'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { clsx } from 'clsx';
import type { Project } from '@/lib/types';

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
    { label: 'Clean Core', v: project.cleanCoreScore },
    { label: 'Complexity', v: project.complexityScore },
    { label: 'Criticality', v: project.criticalityScore },
  ];

  return (
    <div className="not-prose mt-8 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 sm:px-7 py-5 text-left hover:bg-slate-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-emerald-50 border border-emerald-100">
            <Info className="w-5 h-5 text-emerald-600" />
          </span>
          <div>
            <div className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Transparency</div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">Why this route &amp; score</h3>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {conf != null && <span className="hidden sm:inline text-xs font-bold text-slate-500">{conf}% confidence</span>}
          <ChevronDown className={clsx('w-5 h-5 text-slate-400 transition-transform duration-300', open && 'rotate-180')} />
        </div>
      </button>

      <div className={clsx('grid transition-[grid-template-rows] duration-300 ease-in-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="px-5 sm:px-7 pb-7 pt-1 space-y-6">
            {/* Route + confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-bold text-slate-900">Recommended route:</span>
              <span className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full">{route}</span>
              {conf != null && (
                <div className="flex items-center gap-2">
                  <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', conf >= 80 ? 'bg-emerald-500' : conf >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(100, Math.max(0, conf))}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-500">{conf}%</span>
                </div>
              )}
            </div>

            {/* Rationale */}
            {rationale && (
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Router rationale (deterministic)</div>
                <p className="text-sm text-slate-700 leading-relaxed">{rationale}</p>
              </div>
            )}

            {/* Scores */}
            <div className="grid grid-cols-3 gap-3">
              {scores.map((s) => (
                <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-slate-900">
                    {s.v ?? '—'}
                    <span className="text-xs text-slate-400 font-bold">/100</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* What drove it */}
            {coupling.length > 0 && (
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">What drove it — data coupling by risk</div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(['High', 'Medium', 'Low'] as const).map((lvl) => (
                    <span
                      key={lvl}
                      className={clsx(
                        'text-xs font-bold px-3 py-1 rounded-full border',
                        lvl === 'High'
                          ? 'bg-red-50 text-red-700 border-red-100'
                          : lvl === 'Medium'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100',
                      )}
                    >
                      {counts[lvl]} {lvl}
                    </span>
                  ))}
                </div>
                {highRisk.length > 0 && (
                  <ul className="space-y-2">
                    {highRisk.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-800 shrink-0">{c.tableName}</span>
                        <span className="text-slate-500">— {c.recommendation}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
              These figures come from the deterministic evidence engine (before any AI). The route and score are
              computed from the findings above — proven, not guessed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
