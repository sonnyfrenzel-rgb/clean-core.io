'use client';

import { Terminal, Layers } from 'lucide-react';

interface ArchitectureOverviewProps {
  overview?: {
    approachDescription: string;
    nodeFramework: string;
    runtimePlatform: string;
  };
}

export default function ArchitectureOverview({ overview }: ArchitectureOverviewProps) {
  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col justify-between md:col-span-2">
      <div>
        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Architecture Approach</span>
        <h3 className="text-2xl font-black text-slate-900 mt-2 mb-3">Modern Cloud-Native Blueprint</h3>
        <p className="text-slate-650 text-base leading-relaxed">{overview?.approachDescription}</p>
      </div>
      <div className="border-t border-slate-100 pt-4 mt-6 flex flex-wrap items-center gap-6">
        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Framework</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Terminal className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-bold text-slate-800">{overview?.nodeFramework || 'Node.js'}</span>
          </div>
        </div>
        <div className="h-8 w-px bg-slate-200"></div>
        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Runtime Platform</span>
          <div className="flex items-center gap-1.5 mt-1">
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">{overview?.runtimePlatform || 'SAP BTP'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
