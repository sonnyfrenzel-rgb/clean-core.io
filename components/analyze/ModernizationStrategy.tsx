'use client';

import { Info } from 'lucide-react';

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
    <div className="bg-slate-50 rounded-[2rem] p-8 md:p-10 border border-slate-200 space-y-8 relative">
      {showHelpMode && (
        <div className="sm:absolute relative sm:top-8 sm:right-8 mb-4 sm:mb-0 flex items-center gap-1.5 text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200/60 px-3 py-1 rounded-full animate-pulse select-none w-fit self-start z-10">
          <Info size={12} />
          Identifies key architecture strategies to safeguard your ERP standard core.
        </div>
      )}
      <div>
        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Modernization Strategy</h3>
        <p className="text-sm text-slate-500 mt-1">Concrete actions to keep your core clean during target implementation.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block">Keep Core Clean</span>
          <p className="text-xs text-slate-650 leading-relaxed">{recommendations?.keepCoreClean}</p>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full inline-block">Decommissioning</span>
          <p className="text-xs text-slate-650 leading-relaxed">{recommendations?.decommissioning}</p>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-slate-150 shadow-sm space-y-3">
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full inline-block">Cloud Readiness</span>
          <p className="text-xs text-slate-650 leading-relaxed">{recommendations?.cloudReadiness}</p>
        </div>
      </div>
    </div>
  );
}
