'use client';

import { BarChart3, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface BusinessValueAuditProps {
  projectId: string;
  bizFallback: {
    legacyAssetScore: number;
    technicalDebtLevel: string;
    estimatedMaintenanceCost: number;
    valueDrivers: string[];
    cloudRoiSummary: string;
  };
}

export default function BusinessValueAudit({ projectId, bizFallback }: BusinessValueAuditProps) {
  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between relative overflow-hidden group">
      <div className="space-y-6">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100/50">Business Value Audit</span>
          <h3 className="text-xl font-black text-slate-900 mt-3">Legacy Asset Valuation</h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">Financial and quality audit of the legacy custom codebase.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Legacy Asset Score */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Legacy Asset Value</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">{bizFallback.legacyAssetScore}%</span>
              <span className="text-[10px] text-green-600 font-extrabold">IP Score</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full mt-2.5 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${bizFallback.legacyAssetScore}%` }}></div>
            </div>
          </div>

          {/* Technical Debt Estimate */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Technical Debt Level</span>
              <span className={clsx(
                "text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider",
                bizFallback.technicalDebtLevel === 'High' ? "bg-rose-100 text-rose-700 border border-rose-200" :
                bizFallback.technicalDebtLevel === 'Medium' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                "bg-green-100 text-green-700 border border-green-200"
              )}>
                {bizFallback.technicalDebtLevel} Debt
              </span>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 font-bold leading-none">
              Est. Maint. Cost: <span className="text-slate-900 font-black font-mono">{(bizFallback.estimatedMaintenanceCost).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}/yr</span>
            </div>
          </div>
        </div>

        {/* Value Drivers List */}
        <div className="space-y-2">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Legacy Business Value Drivers</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {bizFallback.valueDrivers.map((driver, dIdx) => (
              <div key={dIdx} className="bg-slate-50/50 px-3 py-2 rounded-xl border border-slate-100 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <span className="truncate">{driver}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Better Practice TCO & ROI Calculator CTA */}
        <div className="border-t border-slate-100 pt-4 mt-2">
          <a
            href={`/project/${projectId}/tco`}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-br from-[#0b1c30] to-slate-800 hover:shadow-lg text-white font-bold text-xs uppercase tracking-wider h-11 rounded-xl transition-all cursor-pointer shadow-md active:scale-95 text-center no-underline"
          >
            <BarChart3 className="w-4 h-4 text-green-400" /> C-Level TCO & ROI Calculator 📊
          </a>
        </div>
      </div>

      {/* expected ROI box */}
      <div className="border-t border-slate-100 pt-4 mt-6 bg-slate-50 -mx-8 -mb-8 p-6 rounded-b-3xl">
        <div className="flex gap-2.5">
          <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl shrink-0 h-fit">
            <Sparkles size={16} />
          </div>
          <div>
            <span className="block text-[8px] font-black text-emerald-700 uppercase tracking-widest font-mono">Estimated Cloud ROI</span>
            <p className="text-[11px] text-slate-700 leading-relaxed font-bold mt-1">
              {bizFallback.cloudRoiSummary}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
