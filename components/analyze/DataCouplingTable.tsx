'use client';

import { Link2 } from 'lucide-react';
import clsx from 'clsx';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import type { DataCouplingEntry } from '@/lib/types';

interface DataCouplingTableProps {
  dataCoupling: DataCouplingEntry[];
}

export default function DataCouplingTable({ dataCoupling }: DataCouplingTableProps) {
  if (!dataCoupling || dataCoupling.length === 0) return null;

  return (
    <CollapsibleAccordion
      icon={<Link2 size={16} />}
      title="Data Coupling"
      badge={`${dataCoupling.length} table${dataCoupling.length !== 1 ? 's' : ''} · ${dataCoupling.filter(d => d.accessType !== 'Read').length} direct writes`}
      badgeSeverity={dataCoupling.some(d => d.riskLevel === 'High') ? 'red' : dataCoupling.some(d => d.riskLevel === 'Medium') ? 'amber' : 'green'}
      tooltip="Direct database table accesses detected in your code. Write operations on standard tables are a Clean-Core risk."
    >
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Table</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Access</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Occurrences</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Confidence</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommendation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {dataCoupling.map((entry, idx) => (
              <tr key={idx} className="hover:bg-slate-55 transition-colors">
                <td className="py-2 px-2 font-mono font-bold text-slate-800">
                  {entry.tableName}
                  {entry.isCustom && <span className="ml-1.5 text-[9px] text-blue-500 font-semibold">(Custom)</span>}
                </td>
                <td className="py-2 px-2">
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    entry.accessType === 'Write' || entry.accessType === 'Read/Write'
                      ? 'bg-red-55 text-red-700 border border-red-200'
                      : 'bg-slate-100 text-slate-600'
                  )}>{entry.accessType}</span>
                </td>
                <td className="py-2 px-2 text-center font-mono text-slate-700">
                  <div className="group relative inline-block cursor-help">
                    <span>{entry.occurrences ?? 1}</span>
                    {entry.lineNumbers && entry.lineNumbers.length > 0 && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-48 -translate-x-1/2 rounded bg-slate-900 p-2 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-lg">
                        <div className="font-bold border-b border-slate-700 pb-1 mb-1">Detected on Lines:</div>
                        <div className="font-mono">{entry.lineNumbers.join(', ')}</div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2 px-2">
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    entry.riskLevel === 'High' ? 'bg-red-55 text-red-700 border border-red-200' :
                    entry.riskLevel === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  )}>{entry.riskLevel}</span>
                </td>
                <td className="py-2 px-2">
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold border',
                    entry.replacementConfidence === 'Verified' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    entry.replacementConfidence === 'Candidate' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-50 text-slate-600 border-slate-200'
                  )}>{entry.replacementConfidence ?? 'Needs Validation'}</span>
                </td>
                <td className="py-2 px-2 text-slate-600 text-[11px]">{entry.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleAccordion>
  );
}
