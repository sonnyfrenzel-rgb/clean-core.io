'use client';

import { Zap, RefreshCw, Layers, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface Gap {
  title: string;
  severity: 'High' | 'Medium' | 'Low';
  strategy: string;
  complexity: 'High' | 'Medium' | 'Low';
  rationale: string;
}

interface GapsPrioritizationProps {
  showHelpMode: boolean;
  gapsCat: {
    quickWins: Gap[];
    complexStandard: Gap[];
    strategic: Gap[];
    retire: Gap[];
  };
}

const quadrants = [
  {
    key: 'quickWins' as const,
    label: 'Quick Wins',
    subtitle: 'Simple requirements handled through standard extensibility or decommissioned easily.',
    tag: 'Low Effort',
    Icon: Zap,
    emptyGapLabel: 'Low Severity',
    accentClass: 'text-emerald-600',
    tagClass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  },
  {
    key: 'complexStandard' as const,
    label: 'Complex Standard Fit',
    subtitle: 'Standard exists but migration requires significant refactoring or process redesign.',
    tag: 'High Fit / High Effort',
    Icon: RefreshCw,
    emptyGapLabel: 'Standard Target',
    accentClass: 'text-blue-600',
    tagClass: 'bg-blue-50 text-blue-700 border-blue-100',
  },
  {
    key: 'strategic' as const,
    label: 'Strategic Extensions',
    subtitle: 'High complexity, no standard fit. Best implemented side-by-side on BTP.',
    tag: 'Transformed App',
    Icon: Layers,
    emptyGapLabel: 'Side-by-Side',
    accentClass: 'text-amber-600',
    tagClass: 'bg-amber-50 text-amber-700 border-amber-100',
  },
  {
    key: 'retire' as const,
    label: 'Retire & Decommission',
    subtitle: 'Obsolete requirements or unused custom logic to be removed from scope.',
    tag: 'Decommission',
    Icon: Trash2,
    emptyGapLabel: 'Retire',
    accentClass: 'text-red-500',
    tagClass: 'bg-red-50 text-red-600 border-red-100',
  },
];

export default function GapsPrioritization({ showHelpMode, gapsCat }: GapsPrioritizationProps) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Gaps Prioritization Matrix</h3>
        <p className="text-sm text-slate-500 mt-1">Identified extensions grouped by complexity and core compliance impact.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quadrants.map((q) => {
          const gaps = gapsCat[q.key];
          return (
            <div key={q.key} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <q.Icon size={16} className={q.accentClass} />
                  <h5 className="font-extrabold text-slate-800 text-sm tracking-tight">{q.label}</h5>
                </div>
                <span className={clsx("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border", q.tagClass)}>
                  {q.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">{q.subtitle}</p>

              {/* Gap Items */}
              <div className="space-y-2">
                {gaps.length > 0 ? (
                  gaps.map((g, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-700">{g.title}</span>
                      <span className={clsx(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                        g.complexity === 'High' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                        g.complexity === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-emerald-50 text-emerald-600 border-emerald-100'
                      )}>
                        {g.complexity} Effort
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-300 italic">No gaps categorized in this quadrant.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
