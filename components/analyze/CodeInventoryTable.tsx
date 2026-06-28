'use client';

import { Package } from 'lucide-react';
import clsx from 'clsx';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import type { CodeInventoryItem } from '@/lib/types';

interface CodeInventoryTableProps {
  codeInventory: CodeInventoryItem[];
}

export default function CodeInventoryTable({ codeInventory }: CodeInventoryTableProps) {
  if (!codeInventory || codeInventory.length === 0) return null;

  return (
    <CollapsibleAccordion
      icon={<Package size={16} />}
      title="Code Inventory"
      badge={`${codeInventory.length} object${codeInventory.length !== 1 ? 's' : ''} detected`}
      badgeSeverity={codeInventory.some(i => i.criticality === 'High') ? 'red' : 'green'}
      tooltip="All recognized ABAP artifacts extracted from your uploaded code, classified by type and module."
    >
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs border-collapse min-w-[480px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Object</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Module</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Criticality</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {codeInventory.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-55 transition-colors">
                <td className="py-2 px-2 font-mono font-bold text-slate-800">{item.objectName}</td>
                <td className="py-2 px-2 text-slate-600">{item.type}</td>
                <td className="py-2 px-2 text-slate-500 hidden sm:table-cell">{item.module || '—'}</td>
                <td className="py-2 px-2">
                  <span className={clsx(
                    'px-2 py-0.5 rounded-full text-[10px] font-bold',
                    item.criticality === 'High' ? 'bg-red-55 text-red-700 border border-red-200' :
                    item.criticality === 'Medium' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  )}>{item.criticality}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleAccordion>
  );
}
