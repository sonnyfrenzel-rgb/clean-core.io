'use client';

import { Network, ArrowUpRight } from 'lucide-react';
import GlossaryTerm from '@/components/GlossaryTerm';

interface ApiMapping {
  legacyTableOrFunction: string;
  sapStandardApiName: string;
  apiHubUrl: string;
  apiId: string;
  description: string;
}

interface ApiBusinessHubMappingProps {
  sapStandardApiMapping?: ApiMapping[];
}

export default function ApiBusinessHubMapping({ sapStandardApiMapping }: ApiBusinessHubMappingProps) {
  if (!sapStandardApiMapping || sapStandardApiMapping.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-extrabold text-slate-900 text-lg">SAP API Business Hub Integration</h4>
          <p className="text-xs text-slate-405 mt-1">Officially <GlossaryTerm termKey="Released Interface" className="text-xs text-slate-400 border-emerald-500/40 font-medium">Released standard S/4HANA Public APIs</GlossaryTerm> mapped to fully decouple direct legacy database access.</p>
        </div>
        <span className="bg-blue-50 text-blue-700 border border-blue-150 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          <Network className="w-3.5 h-3.5 text-blue-600 animate-pulse" /> api.sap.com Reference
        </span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Legacy Object</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target <GlossaryTerm termKey="Released Interface" className="text-[10px] text-slate-400 border-slate-400/50 uppercase tracking-widest font-normal">Released API</GlossaryTerm></th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hub API ID</th>
              <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Integration Role / Context</th>
              <th className="py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs">
            {sapStandardApiMapping.map((map, idx) => (
              <tr key={idx} className="hover:bg-slate-55 transition-colors">
                <td className="py-4 font-mono font-bold text-slate-500 select-all">{map.legacyTableOrFunction}</td>
                <td className="py-4 px-4 font-extrabold text-slate-800">{map.sapStandardApiName}</td>
                <td className="py-4 px-4"><span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-mono text-[10px]">{map.apiId}</span></td>
                <td className="py-4 px-4 text-slate-600 leading-relaxed max-w-sm">{map.description}</td>
                <td className="py-4 text-right">
                  <a
                    href={map.apiHubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-105 border border-blue-100 hover:border-blue-200 px-3.5 py-2 rounded-xl transition-all shadow-sm uppercase tracking-widest"
                  >
                    Open API Hub <ArrowUpRight className="w-3 h-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
