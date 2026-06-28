'use client';

import { Info } from 'lucide-react';

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

export default function GapsPrioritization({ showHelpMode, gapsCat }: GapsPrioritizationProps) {
  return (
    <div className="space-y-4 relative">
      {showHelpMode && (
        <div className="sm:absolute relative sm:top-0 sm:right-0 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
          <Info size={12} />
          Prioritizes extensions based on business value and complex deployment effort.
        </div>
      )}
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Gaps Prioritization Matrix</h3>
        <p className="text-sm text-slate-500 mt-1">Identified extensions grouped by complexity and core compliance impact.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-[2rem] border border-slate-200">
        {/* Quadrant 1: Quick Wins */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-extrabold text-emerald-800 text-sm tracking-wider uppercase">⚡ Quick Wins</h5>
            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Low Effort</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">Simple requirements that can be handled through standard extensibility or decommissioned easily.</p>
          <div className="space-y-2">
            {gapsCat.quickWins.length > 0 ? (
              gapsCat.quickWins.map((g, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800">{g.title}</span>
                  <span className="text-[9px] text-slate-500 font-medium">Low Severity</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
            )}
          </div>
        </div>

        {/* Quadrant 2: Complex Standard Fit */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-extrabold text-blue-800 text-sm tracking-wider uppercase">🔄 Complex Standard Fit</h5>
            <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">High Fit / High Effort</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">Standard exists but migration requires significant refactoring or process redesign.</p>
          <div className="space-y-2">
            {gapsCat.complexStandard.length > 0 ? (
              gapsCat.complexStandard.map((g, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800">{g.title}</span>
                  <span className="text-[9px] text-blue-600 font-bold">Standard Target</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
            )}
          </div>
        </div>

        {/* Quadrant 3: Strategic Extensions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-extrabold text-amber-800 text-sm tracking-wider uppercase">💡 Strategic Extensions</h5>
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Transformed App Needed</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">High complexity and no standard fit. Best implemented side-by-side on BTP or dynamic APIs.</p>
          <div className="space-y-2">
            {gapsCat.strategic.length > 0 ? (
              gapsCat.strategic.map((g, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800">{g.title}</span>
                  <span className="text-[9px] text-amber-600 font-bold">Side-by-Side</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
            )}
          </div>
        </div>

        {/* Quadrant 4: Retire / Decommission */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h5 className="font-extrabold text-rose-800 text-sm tracking-wider uppercase">🗑️ Retire & Decommission</h5>
            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Decommission</span>
          </div>
          <p className="text-xs text-slate-400 mb-4">Obsolete requirements or unused custom logic that should be removed from scope.</p>
          <div className="space-y-2">
            {gapsCat.retire.length > 0 ? (
              gapsCat.retire.map((g, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-800">{g.title}</span>
                  <span className="text-[9px] text-rose-600 font-bold bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">Retire</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No gaps categorized in this quadrant.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
