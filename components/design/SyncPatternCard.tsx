'use client';

interface SyncPatternCardProps {
  dataSync?: {
    patternName: string;
    description: string;
  };
}

export default function SyncPatternCard({ dataSync }: SyncPatternCardProps) {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-3xl p-8 flex flex-col justify-between shadow-lg border border-slate-800 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
      <div>
        <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase">Data Sync Strategy</span>
        <h4 className="text-xl font-extrabold text-white mt-3 mb-2">{dataSync?.patternName}</h4>
        <p className="text-xs text-slate-405 leading-relaxed">{dataSync?.description}</p>
      </div>
      <div className="border-t border-slate-800 pt-4 mt-6 flex items-center justify-between text-xs text-slate-400">
        <span>Status</span>
        <span className="text-emerald-400 font-bold bg-emerald-950/50 border border-emerald-900 px-2 py-0.5 rounded-full">Transformed Core</span>
      </div>
    </div>
  );
}
