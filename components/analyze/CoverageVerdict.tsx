'use client';

import { useState } from 'react';
import { HelpCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';
import type { SupportFinding } from '@/lib/abap/class-model';
import { LEVEL_LABEL, LEVEL_EMOJI, type SupportLevel } from '@/lib/abap/support-matrix';
import type { SupportSummary } from '@/lib/abap/findings-detector';

interface CoverageVerdictProps {
  findings: SupportFinding[];
  summary: SupportSummary | null;
}

export default function CoverageVerdict({ findings, summary }: CoverageVerdictProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  const total = findings.length;
  const counts = summary?.counts || { fully: 0, partial: 0, notSupported: 0 };
  const overall: SupportLevel = summary?.overall || 'fully';

  const fullyPercent = total > 0 ? Math.round((counts.fully / total) * 100) : 100;
  const reviewPercent = total > 0 ? Math.round((counts.partial / total) * 100) : 0;
  const outOfScopePercent = total > 0 ? Math.round((counts.notSupported / total) * 100) : 0;

  // SVG calculations for segmented donut
  const radius = 38;
  const circ = 2 * Math.PI * radius; // ~238.76
  
  const fullyOffset = circ - (circ * fullyPercent) / 100;
  const reviewOffset = circ - (circ * reviewPercent) / 100;
  const outOfScopeOffset = circ - (circ * outOfScopePercent) / 100;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden group">
      {/* Decorative gradient blob */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-green-500/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
        
        {/* Left column: Title & counters */}
        <div className="space-y-6 flex-1 w-full">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase bg-green-950/60 px-3 py-1 rounded-full border border-green-800/30">Deterministic Audit</span>
            <button 
              onClick={() => setShowExplanation(true)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
              title="What is Coverage Verdict?"
            >
              <HelpCircle size={14} />
            </button>
          </div>

          <div>
            <h3 className="text-2xl font-black tracking-tight text-white">Coverage Verdict</h3>
            <p className="text-xs text-slate-400 mt-1">Statically resolved ABAP language constructs mapped directly to target platform capabilities.</p>
          </div>

          {/* Three Counters */}
          <div className="grid grid-cols-3 gap-4">
            {/* Fully Supported Counter */}
            <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 hover:border-green-500/30 transition-all">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Fully Supported</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-green-400">{fullyPercent}%</span>
                <span className="text-[10px] text-slate-400 font-mono">({counts.fully})</span>
              </div>
            </div>

            {/* Review Required Counter */}
            <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 hover:border-amber-500/30 transition-all">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Review Required</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-400">{reviewPercent}%</span>
                <span className="text-[10px] text-slate-400 font-mono">({counts.partial})</span>
              </div>
            </div>

            {/* Out of Scope Counter */}
            <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 hover:border-red-500/30 transition-all">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Out of Scope</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-red-400">{outOfScopePercent}%</span>
                <span className="text-[10px] text-slate-400 font-mono">({counts.notSupported})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: Donut Chart */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Back track */}
              <circle cx="50" cy="50" r={radius} className="stroke-slate-850 fill-none" strokeWidth="8" />
              
              {/* Green (Fully) segment */}
              <circle 
                cx="50" cy="50" r={radius} 
                className="stroke-green-500 fill-none transition-all duration-500" 
                strokeWidth="8" 
                strokeDasharray={circ} 
                strokeDashoffset={fullyOffset}
              />
              
              {/* Amber (Review) segment */}
              <circle 
                cx="50" cy="50" r={radius} 
                className="stroke-amber-500 fill-none transition-all duration-500" 
                strokeWidth="8" 
                strokeDasharray={circ} 
                strokeDashoffset={reviewOffset}
                style={{ 
                  transform: `rotate(${(fullyPercent * 3.6)}deg)`, 
                  transformOrigin: '50px 50px' 
                }}
              />
              
              {/* Red (Out of Scope) segment */}
              <circle 
                cx="50" cy="50" r={radius} 
                className="stroke-red-500 fill-none transition-all duration-500" 
                strokeWidth="8" 
                strokeDasharray={circ} 
                strokeDashoffset={outOfScopeOffset}
                style={{ 
                  transform: `rotate(${((fullyPercent + reviewPercent) * 3.6)}deg)`, 
                  transformOrigin: '50px 50px' 
                }}
              />
            </svg>
            
            {/* Center label */}
            <div className="absolute flex flex-col items-center text-center">
              <span className="text-2xl leading-none">{LEVEL_EMOJI[overall]}</span>
              <span className="text-[9px] text-slate-400 font-extrabold uppercase mt-1 tracking-wider leading-none">
                {LEVEL_LABEL[overall]}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Explanation Modal */}
      {showExplanation && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 md:p-10 max-w-lg w-full border border-slate-800 shadow-2xl relative animate-in zoom-in-95 duration-300 space-y-6">
            <button 
              onClick={() => setShowExplanation(false)} 
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-all"
            >
              <X size={18} />
            </button>
            
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest bg-green-950 px-3 py-1 rounded-full inline-block font-mono">EA Assessment Guidelines</span>
              <h3 className="text-2xl font-black tracking-tight">Coverage Verdict Architecture</h3>
              <p className="text-xs text-slate-455 leading-relaxed">The Coverage Verdict is computed statically by analyzing your custom repository against released SAP S/4HANA APIs and BTP Cloud guidelines.</p>
            </div>
            
            <div className="space-y-4 pt-2">
              <div className="flex gap-4 p-3 rounded-2xl bg-slate-850/50 border border-slate-800 text-xs">
                <span className="text-lg">✅</span>
                <div>
                  <h5 className="font-extrabold text-slate-200">Fully Supported</h5>
                  <p className="text-slate-400 leading-relaxed mt-0.5">Statically verified constructs that map 1:1 to released standard models or automatically transformed BTP APIs.</p>
                </div>
              </div>
              
              <div className="flex gap-4 p-3 rounded-2xl bg-slate-850/50 border border-slate-800 text-xs">
                <span className="text-lg">⚠️</span>
                <div>
                  <h5 className="font-extrabold text-slate-200">Review Required</h5>
                  <p className="text-slate-400 leading-relaxed mt-0.5">Complex patterns (e.g. 3-table joins or custom enhancements) that require architectural sign-off to ensure clean core compliance.</p>
                </div>
              </div>

              <div className="flex gap-4 p-3 rounded-2xl bg-slate-850/50 border border-slate-800 text-xs">
                <span className="text-lg">❌</span>
                <div>
                  <h5 className="font-extrabold text-slate-200">Out of Scope</h5>
                  <p className="text-slate-400 leading-relaxed mt-0.5">Legacy UI components or internal system kernel calls that have no cloud-equivalent APIs and must be decommissioned or fully re-architected.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
