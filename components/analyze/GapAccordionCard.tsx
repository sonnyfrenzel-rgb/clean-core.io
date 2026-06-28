'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface GapAccordionCardProps {
  gap: {
    title: string;
    severity: string;
    complexity: string;
    strategy: string;
    rationale: string;
  };
}

export default function GapAccordionCard({ gap }: GapAccordionCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const colors = {
    High: 'bg-red-50 text-red-700 border-red-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    Low: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  };

  return (
    <div className="border border-slate-150 rounded-2xl bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h4 className="font-extrabold text-slate-900 text-base">{gap.title}</h4>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${colors[gap.severity as 'High' | 'Medium' | 'Low'] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
              Divergence: {gap.severity}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
              Complexity: {gap.complexity}
            </span>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} />
      </button>
      
      <div className={`transition-all duration-350 ease-in-out ${isOpen ? 'max-h-[500px] border-t border-slate-100' : 'max-h-0'} overflow-hidden`}>
        <div className="p-5 bg-slate-50/50 space-y-4 text-sm">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Recommended Strategy</span>
            <p className="mt-1 font-semibold text-slate-800 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">{gap.strategy}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Technical Rationale</span>
            <p className="mt-1 text-slate-600 leading-relaxed">{gap.rationale}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
