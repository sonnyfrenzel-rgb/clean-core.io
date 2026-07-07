'use client';

import { ListChecks } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import type { DataCouplingEntry, CodeInventoryItem } from '@/lib/types';
import {
  ABCD_META, GRADES, gradeDistribution, gradeFromCoupling, gradeFromInventory,
  type CloudReadinessGrade,
} from '@/lib/abap/abcd-classification';

/**
 * Cloud Readiness Classification (A–D) — the SAP Clean Core object classification
 * (released → cloud-ready) that superseded the older Tier 1/2/3 wording. Grades are
 * derived deterministically from the detected dependencies (access type + risk) and
 * the custom-object inventory (criticality + type). Proven, not guessed.
 */
export default function AbcdClassificationPanel({
  dataCoupling,
  codeInventory,
}: {
  dataCoupling?: DataCouplingEntry[];
  codeInventory?: CodeInventoryItem[];
}) {
  const couplings = dataCoupling || [];
  const inventory = codeInventory || [];

  const items: { name: string; sub: string; grade: CloudReadinessGrade }[] = [
    ...couplings.map((c) => ({
      name: c.tableName,
      sub: `${c.accessType || 'access'}${c.isCustom ? ' · custom' : ''} — ${c.recommendation || ''}`.trim(),
      grade: gradeFromCoupling(c),
    })),
    ...inventory.map((o) => ({
      name: o.objectName,
      sub: `${o.type}${o.module ? ' · ' + o.module : ''}`,
      grade: gradeFromInventory(o),
    })),
  ];

  if (items.length === 0) return null;

  const dist = gradeDistribution(items.map((i) => i.grade));
  const total = items.length;
  const cleanPct = Math.round(((dist.A + dist.B) / total) * 100);

  return (
    <CollapsibleAccordion
      icon={<ListChecks size={16} />}
      title="Cloud Readiness Classification (A–D)"
      badge={`A ${dist.A} · B ${dist.B} · C ${dist.C} · D ${dist.D}`}
      badgeSeverity={dist.D > 0 ? 'red' : dist.C > 0 ? 'amber' : 'green'}
      tooltip="SAP's Clean Core object classification (A–D) that superseded Tier 1/2/3. A = released & cloud-ready, B = stable with caution, C = conditional/review, D = not clean/replace. Derived deterministically from the detected dependencies and inventory."
    >
      {/* Distribution bar */}
      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-100">
          {GRADES.map((g) =>
            dist[g] > 0 ? (
              <div key={g} style={{ width: `${(dist[g] / total) * 100}%`, background: ABCD_META[g].color }} title={`${g}: ${dist[g]}`} />
            ) : null,
          )}
        </div>
        <div className="mt-2 text-[11px] font-semibold text-slate-500">
          {cleanPct}% cloud-ready or stable (A–B) · {dist.C} to review · {dist.D} to replace
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {GRADES.map((g) => (
          <div key={g} className="flex items-start gap-2">
            <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-black border ${ABCD_META[g].badge}`}>{g}</span>
            <div>
              <div className="text-xs font-bold text-slate-800">{ABCD_META[g].label}</div>
              <div className="text-[11px] text-slate-500 leading-snug">{ABCD_META[g].description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Per-object grades */}
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs border-collapse min-w-[460px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Object</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grade</th>
              <th className="py-2 px-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((it, i) => (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="py-2 px-2 font-mono font-bold text-slate-800">{it.name}</td>
                <td className="py-2 px-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${ABCD_META[it.grade].badge}`}>
                    {it.grade} · {ABCD_META[it.grade].short}
                  </span>
                </td>
                <td className="py-2 px-2 text-slate-500 hidden sm:table-cell">{it.sub || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleAccordion>
  );
}
