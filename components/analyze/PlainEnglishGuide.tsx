'use client';

interface PlainEnglishGuideProps {
  plainEnglishActionPlan: string[];
  extensibilityRoute: string;
}

export default function PlainEnglishGuide({ plainEnglishActionPlan, extensibilityRoute }: PlainEnglishGuideProps) {
  return (
    <div className="bg-slate-900 text-white rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden flex flex-col justify-between group">
      <div className="absolute top-0 right-0 w-80 h-80 bg-green-500/5 rounded-full blur-3xl -mr-24 -mt-24 pointer-events-none"></div>
      
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase bg-green-950 px-2.5 py-1 rounded-full border border-green-800/30">Executive Summary</span>
            <h3 className="text-xl font-black text-white mt-3">What to Do - Plain English Guide</h3>
            <p className="text-xs text-slate-400 mt-1">Simple, non-technical steps to modernize this business process successfully.</p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-3 py-1 rounded-full uppercase tracking-wider font-mono shrink-0 self-start sm:self-center">Business Roadmap</span>
        </div>

        <div className="space-y-4">
          {plainEnglishActionPlan.map((action, aIdx) => (
            <div key={aIdx} className="bg-slate-800/50 p-4 rounded-2xl border border-slate-800/60 flex items-start gap-4 hover:border-slate-700 transition-colors">
              <span className="w-8 h-8 rounded-xl bg-green-500/10 text-green-400 border border-green-500/20 flex items-center justify-center shrink-0 font-black text-xs shadow-inner">{aIdx + 1}</span>
              <p className="text-xs text-slate-300 leading-relaxed font-bold pt-1.5">{action}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-slate-400 font-bold font-mono tracking-widest uppercase mt-6 pt-4 border-t border-slate-800/60">
        Strategic Path: {extensibilityRoute} Track
      </div>
    </div>
  );
}
