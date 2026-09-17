'use client';

import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import { getAuth } from '@/lib/firebase';
import type { DataCouplingEntry, CodeInventoryItem } from '@/lib/types';
import {
  ABCD_META, GRADES, ALL_GRADES, gradeDistribution, gradeFromCoupling, gradeFromInventory,
  gradeKey, objectUseFromAccess,
  type CloudReadinessGrade, type GradedObject, type ObjectUse, type GradeProvenance,
} from '@/lib/abap/abcd-classification';

/**
 * Cloud Readiness Classification (A–D) — SAP's clean core level concept, which
 * superseded the older Tier 1/2/3 wording.
 *
 * Three tiers, and the difference is visible per row. Where SAP has published a
 * state for an object, the grade is a lookup against the Cloudification
 * Repository and SAP's classicAPI/noAPI file — for a table, for the access the
 * code makes: reading KNA1 is C, writing to it is D. Your own Z/Y tables are
 * graded as your own data (B). Everything else SAP has not classified falls
 * back to the heuristic over access type, risk and object type, and says so.
 *
 * There is no grade for the program as a whole here: each row is one object and
 * the badge counts rows.
 *
 * The lookup runs server-side via /api/abcd-classify: the catalog artifacts are
 * ~4 MB and this is a client component, so the names go out and the grades come
 * back rather than shipping the maps to the browser. Until they arrive (or if
 * the call fails) every row shows its heuristic grade, so the panel is never
 * blank and never blocks on the network.
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
  const [sapGrades, setSapGrades] = useState<Record<string, GradedObject>>({});

  const heuristicItems: { name: string; use: ObjectUse | null; sub: string; grade: CloudReadinessGrade }[] = [
    ...couplings.map((c) => ({
      name: c.tableName,
      use: objectUseFromAccess(c.accessType),
      sub: `${c.accessType || 'access'}${c.isCustom ? ' · custom' : ''} — ${c.recommendation || ''}`.trim(),
      grade: gradeFromCoupling(c),
    })),
    ...inventory.map((o) => ({
      name: o.objectName,
      use: null,
      sub: `${o.type}${o.module ? ' · ' + o.module : ''}`,
      grade: gradeFromInventory(o),
    })),
  ];

  // One key per lookup, in the shape the route answers with: the name, or
  // NAME@use for a table the code reads, writes, or depends on as a type.
  const lookupKey = heuristicItems
    .filter((i) => i.name)
    .map((i) => gradeKey(i.name, i.use))
    .join('|');

  useEffect(() => {
    const keys = lookupKey ? lookupKey.split('|') : [];
    if (keys.length === 0) return;
    let cancelled = false;
    const objects = keys.map((key) => {
      const [name, use] = key.split('@');
      return use ? { name, use } : name;
    });

    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return; // not signed in yet — heuristic grades stand
        const res = await fetch('/api/abcd-classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ objects }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { grades?: Record<string, GradedObject> };
        if (!cancelled && data.grades) setSapGrades(data.grades);
      } catch {
        // Leave the heuristic grades in place — a failed lookup must not blank the panel.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lookupKey]);

  // A catalog grade replaces the heuristic one; anything SAP has not classified
  // keeps its estimate and is labelled as such.
  const items = heuristicItems.map((it) => {
    const looked = sapGrades[gradeKey(it.name, it.use)];
    const useCatalog = looked && looked.grade !== 'Unknown';
    return {
      ...it,
      grade: useCatalog ? looked.grade : it.grade,
      provenance: useCatalog ? looked.provenance : ('heuristic' as const),
      sapState: useCatalog ? looked.state : undefined,
      objectGrade: useCatalog ? looked.objectGrade : undefined,
    };
  });

  if (items.length === 0) return null;

  const dist = gradeDistribution(items.map((i) => i.grade));
  const total = items.length;
  const cleanPct = Math.round(((dist.A + dist.B) / total) * 100);
  const fromSap = items.filter((i) => i.provenance === 'catalog' || i.provenance === 'catalog-residual').length;
  const ownObjects = items.filter((i) => i.provenance === 'own-object').length;
  const estimated = items.filter((i) => i.provenance === 'heuristic').length;

  return (
    <CollapsibleAccordion
      icon={<ListChecks size={16} />}
      title="Cloud Readiness Classification (A–D)"
      badge={`A ${dist.A} · B ${dist.B} · C ${dist.C} · D ${dist.D}`}
      badgeSeverity={dist.D > 0 ? 'red' : dist.C > 0 ? 'amber' : 'green'}
      tooltip="SAP's clean core level concept (A = released, B = classic SAP API, C = internal/conditional, D = not recommended), one grade per object. Objects SAP has published a state for are looked up in the Cloudification Repository and SAP's classicAPI/noAPI file, and a table is graded for the access your code makes: reading a table SAP will not release is C, writing to it is D. Your own Z/Y tables are graded B as classic ABAP working on its own data; other objects SAP has not classified fall back to a heuristic and are marked as estimated. Not an authoritative SAP ATC classification and not part of the signed audit pack — verify with SAP ADT/ATC."
    >
      {/* Say where each grade comes from, and keep the audit-pack exclusion
          verbatim. */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-700 leading-snug">
        <span className="text-emerald-700">{fromSap} of {total} grades</span> come from SAP&apos;s
        published object data (Cloudification Repository + SAP&apos;s classicAPI/noAPI file)
        {couplings.length > 0
          ? '; a table is graded for the access your code makes, so reading a table SAP will not release is C and writing to it is D.'
          : '.'}
        {ownObjects > 0 && (
          <> <span className="text-emerald-700">{ownObjects}</span> are your own tables, graded B as
          classic ABAP working on its own data.</>
        )}
        {estimated > 0 && (
          <> <span className="text-amber-700">{estimated}</span> could not be looked up — SAP has not
          classified them, so those are estimated from access type, risk and object type.</>
        )}{' '}
        Not an authoritative SAP ATC classification and <strong>not part of the signed audit pack</strong>.
        Verify each grade with SAP ADT / ATC for your target release before relying on it.
      </div>
      {/* Distribution bar */}
      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-100">
          {ALL_GRADES.map((g) =>
            dist[g] > 0 ? (
              <div key={g} style={{ width: `${(dist[g] / total) * 100}%`, background: ABCD_META[g].color }} title={`${g}: ${dist[g]}`} />
            ) : null,
          )}
        </div>
        <div className="mt-2 text-[11px] font-semibold text-slate-500">
          {cleanPct}% cloud-ready or stable (A–B) · {dist.C} to review · {dist.D} to replace{dist.Unknown > 0 ? ` · ${dist.Unknown} not assessed` : ''}
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {GRADES.map((g) => (
          <div key={g} className="flex items-start gap-2">
            <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-black border ${ABCD_META[g].badge}`}>{g}</span>
            <div>
              <div className="text-xs font-bold text-slate-800">
                {ABCD_META[g].label}
                <span className="ml-1 text-[10px] font-semibold text-slate-400">· ATC {ABCD_META[g].atcReading} (our reading)</span>
              </div>
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
                <td className="py-2 px-2 whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${ABCD_META[it.grade].badge}`}>
                    {it.grade} · {ABCD_META[it.grade].short}
                  </span>
                  <span
                    className={`ml-1.5 text-[9px] font-bold uppercase tracking-wider ${it.provenance === 'heuristic' ? 'text-amber-600' : 'text-emerald-600'}`}
                    title={gradeOrigin(it)}
                  >
                    {PROVENANCE_CHIP[it.provenance]}
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

const PROVENANCE_CHIP: Record<GradeProvenance, string> = {
  catalog: 'SAP data',
  'catalog-residual': 'SAP data',
  'own-object': 'own object',
  heuristic: 'est.',
};

/**
 * Where one row's letter comes from, in words. Where the access moved the
 * letter away from the object's own grade, both are named, so the row does not
 * silently disagree with the catalog page for the same object.
 */
function gradeOrigin(it: {
  grade: CloudReadinessGrade;
  use: ObjectUse | null;
  provenance: GradeProvenance;
  sapState?: string;
  objectGrade?: CloudReadinessGrade;
}): string {
  const access = it.use === 'read' ? 'read' : it.use === 'write' ? 'written' : null;
  switch (it.provenance) {
    case 'catalog': {
      const base = `SAP state: ${it.sapState}`;
      if (!access) return base;
      if (!it.objectGrade) return `${base} · ${access} by this code`;
      return `${base} · ${access} by this code, which makes it ${it.grade}; the object on its own is ${it.objectGrade}`;
    }
    case 'catalog-residual':
      return 'Listed in neither SAP file — SAP-internal, not classified for customer use';
    case 'own-object':
      return `Your own ${access ? `table, ${access} by this code` : 'object'}. SAP's files do not classify it; classic ABAP working on its own data is level B.`;
    default:
      return 'Estimated from access type, risk and object type';
  }
}
