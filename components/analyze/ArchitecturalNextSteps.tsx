'use client';

interface ArchitecturalNextStepsProps {
  strategicNextSteps?: string[];
}

export default function ArchitecturalNextSteps({ strategicNextSteps }: ArchitecturalNextStepsProps) {
  if (!strategicNextSteps || strategicNextSteps.length === 0) return null;

  return (
    <div className="bg-slate-900 text-white rounded-[2rem] p-8 md:p-12 border border-slate-850 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-green-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
      <div className="relative z-10 space-y-6">
        <div>
          <h3 className="text-2xl font-black text-white tracking-tight">Architectural Next Steps</h3>
          <p className="text-sm text-slate-400 mt-1">Action items for your engineering and configuration teams.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategicNextSteps.map((step, idx) => (
            <div key={idx} className="bg-slate-800 p-4 rounded-xl border border-slate-750 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 font-bold text-xs">{idx + 1}</span>
              <p className="text-xs text-slate-300 leading-relaxed font-medium">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
