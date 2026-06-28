'use client';

import { CheckCircle2, Sparkles, Trash2, Info } from 'lucide-react';
import clsx from 'clsx';

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
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-extrabold text-slate-900 text-lg">Target Scope & Extensibility Mapping</h4>
            {showHelpMode && (
              <div className="group relative">
                <Info size={14} className="text-amber-500 cursor-help animate-pulse shrink-0" />
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 max-w-[85vw] bg-slate-900 text-white text-xs rounded-xl p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50 leading-relaxed font-normal">
                  <strong>Enterprise Architecture Mapping:</strong> Categorizes your legacy code into modern SAP clean core boundaries to identify what can be decommissioned or automated.
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">Strategic alignment of custom legacy logic with modern S/4HANA extensibility guidelines.</p>
        </div>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200/60 px-3 py-1 rounded-full uppercase tracking-wider font-mono shrink-0 self-start sm:self-center">Clean Core Mapping</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: S/4HANA Standard Fit */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 size={18} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Standard Fit</span>
            </div>
            <h5 className="text-sm font-extrabold text-slate-900">{standardFit?.targetStandardProcess || 'S/4HANA Best Practice'}</h5>
            <p className="text-xs text-slate-650 leading-relaxed">{standardFit?.rationale}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
              <span>Standardization Fit</span>
              <span className="text-green-600 font-extrabold">{standardFit?.potential === 'High' ? '90%' : standardFit?.potential === 'Medium' ? '50%' : '15%'}</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full" 
                style={{ width: standardFit?.potential === 'High' ? '90%' : standardFit?.potential === 'Medium' ? '50%' : '15%' }}
              ></div>
            </div>
          </div>
        </div>

        {/* Column 2: Transformed BTP Extension */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-700">
              <Sparkles size={18} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Modern Extension</span>
            </div>
            <h5 className="text-sm font-extrabold text-slate-900">Side-by-Side BTP / Node.js</h5>
            <p className="text-xs text-slate-650 leading-relaxed">{recommendations?.cloudReadiness || 'Custom API layers and microservices completely transformed from standard core.'}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
              <span>Cloud Readiness</span>
              <span className="text-emerald-600 font-extrabold">95%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '95%' }}></div>
            </div>
          </div>
        </div>

        {/* Column 3: Obsolete / Retire */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <Trash2 size={18} className="shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider font-mono">Decommission</span>
            </div>
            <h5 className="text-sm font-extrabold text-slate-900">Redundant & Obsolete Logic</h5>
            <p className="text-xs text-slate-650 leading-relaxed">{recommendations?.decommissioning || 'Obsolete SAP workarounds, manual validation structures, and unused code blocks.'}</p>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase mb-1.5">
              <span>Decommission Ratio</span>
              <span className="text-slate-600 font-extrabold">80%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-slate-500 rounded-full" style={{ width: '80%' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
