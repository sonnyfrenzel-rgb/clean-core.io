'use client';

import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import CollapsibleAccordion from '@/components/CollapsibleAccordion';
import CcTable from '@/components/cc/Table';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcWhyPopover from '@/components/cc/WhyPopover';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { levelChartColor, NOT_DETERMINED_CHART } from '@/lib/chart-colors';
import type { ProvenanceValue } from '@/lib/provenance';
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
  deployment,
  release,
}: {
  dataCoupling?: DataCouplingEntry[];
  codeInventory?: CodeInventoryItem[];
  /**
   * Roadmap 7.10 - the target the grades are looked up for. Sent as the
   * lookup's `profile`, so the answer says which catalog snapshot answered and
   * whether that snapshot is the one this target's verdicts come from.
   */
  deployment?: string;
  release?: string;
}) {
  const couplings = dataCoupling || [];
  const inventory = codeInventory || [];
  const [sapGrades, setSapGrades] = useState<Record<string, GradedObject>>({});
  const [lookupSnapshot, setLookupSnapshot] = useState<{ registryKey: string; sourceSha256: string } | null>(null);
  const [lookupCoverage, setLookupCoverage] = useState<{ state: string; sentence: string } | null>(null);
  const [lookupRefusal, setLookupRefusal] = useState<string | null>(null);

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
          body: JSON.stringify({
            objects,
            ...(deployment ? { profile: { edition: deployment, release: release || '' } } : {}),
          }),
        });
        if (res.status === 422) {
          // A target nothing can be looked up for: said, never answered with
          // grades from a catalog that is not its own.
          const refused = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setLookupRefusal(refused.error || 'No catalog lookup is made for this target.');
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          grades?: Record<string, GradedObject>;
          snapshot?: { registryKey: string; sourceSha256: string };
          coverage?: { state: string; sentence: string };
        };
        if (cancelled) return;
        if (data.grades) setSapGrades(data.grades);
        setLookupSnapshot(data.snapshot ?? null);
        setLookupCoverage(data.coverage ?? null);
      } catch {
        // Leave the heuristic grades in place — a failed lookup must not blank the panel.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lookupKey, deployment, release]);

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

  const whyProvenance = estimated === 0 && ownObjects === 0 ? 'imported' : 'reconstructed';

  return (
    <CollapsibleAccordion
      icon={<ListChecks size={16} />}
      title="Cloud Readiness Classification (A–D)"
      badge={`A ${dist.A} · B ${dist.B} · C ${dist.C} · D ${dist.D}`}
      badgeSeverity={dist.D > 0 ? 'error' : dist.C > 0 ? 'warning' : 'neutral'}
      tooltip="SAP's clean core level concept (A = released, B = classic SAP API, C = internal/conditional, D = not recommended), one grade per object. Objects SAP has published a state for are looked up in the Cloudification Repository and SAP's classicAPI/noAPI file, and a table is graded for the access your code makes: reading a table SAP will not release is C, writing to it is D. Your own Z/Y tables are graded B as classic ABAP working on its own data; other objects SAP has not classified fall back to a heuristic and are marked as estimated. Not an authoritative SAP ATC classification and not part of the signed audit pack — verify with SAP ADT/ATC."
    >
      {/* Roadmap 7.10 - which snapshot answered, and whether it is the one this
          target's verdicts come from. A refused target shows no catalog grade. */}
      {lookupRefusal && (
        <div className="mb-4" data-abcd-lookup="refused">
          <CcMessageStrip state="error" headline="No catalog lookup for this target.">
            {lookupRefusal} The grades below are estimates only.
          </CcMessageStrip>
        </div>
      )}
      {lookupSnapshot && (
        <div className="mb-4" data-abcd-lookup={lookupCoverage?.state ?? 'no-profile'}>
          <CcMessageStrip
            state={lookupCoverage && lookupCoverage.state !== 'covered' ? 'warning' : 'information'}
            headline={`Looked up in catalog snapshot ${lookupSnapshot.registryKey}@${lookupSnapshot.sourceSha256.slice(0, 8)}.`}
          >
            {!lookupCoverage
              ? 'No target was named for this lookup, so whether this is the snapshot its verdicts come from is not determined.'
              : lookupCoverage.state !== 'covered'
                ? lookupCoverage.sentence
                : "This is the snapshot the target's verdicts come from."}
          </CcMessageStrip>
        </div>
      )}
      {/* Say where each grade comes from, and keep the audit-pack exclusion
          verbatim. */}
      <div className="mb-4">
        <CcMessageStrip state="information">
          <b className="font-semibold">{fromSap} of {total} grades</b> come from SAP&apos;s
          published object data (Cloudification Repository + SAP&apos;s classicAPI/noAPI file)
          {couplings.length > 0
            ? '; a table is graded for the access your code makes, so reading a table SAP will not release is C and writing to it is D.'
            : '.'}
          {ownObjects > 0 && (
            <> <b className="font-semibold">{ownObjects}</b> are your own tables, graded B as
            classic ABAP working on its own data.</>
          )}
          {estimated > 0 && (
            <> <b className="font-semibold">{estimated}</b> could not be looked up — SAP has not
            classified them, so those are estimated from access type, risk and object type.</>
          )}{' '}
          Not an authoritative SAP ATC classification and <strong>not part of the signed audit pack</strong>.
          Verify each grade with SAP ADT / ATC for your target release before relying on it.
        </CcMessageStrip>
      </div>
      {/* Distribution bar — level colours from the fixed list (A blue, never
          green); "not assessed" is no level and wears the not-determined hatch. */}
      <div className="mb-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full border border-cc-line">
          {ALL_GRADES.map((g) =>
            dist[g] > 0 ? (
              g === 'Unknown' ? (
                <div
                  key={g}
                  data-not-determined=""
                  className={NOT_DETERMINED_CHART.bg}
                  style={{ width: `${(dist[g] / total) * 100}%`, ...NOT_DETERMINED_CHART.hatch }}
                  title={`not assessed: ${dist[g]}`}
                />
              ) : (
                <div
                  key={g}
                  className={levelChartColor(g).bg}
                  style={{ width: `${(dist[g] / total) * 100}%` }}
                  title={`${g}: ${dist[g]}`}
                />
              )
            ) : null,
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
          <span>
            {cleanPct}% cloud-ready or stable (A–B) · {dist.C} to review · {dist.D} to replace{dist.Unknown > 0 ? ` · ${dist.Unknown} not assessed` : ''}
          </span>
          <CcWhyPopover
            subject={`Level distribution, ${cleanPct}% A–B`}
            provenance={whyProvenance}
            basis={`${fromSap} of ${total} grades from SAP's published object data, ${ownObjects} own objects graded B, ${estimated} estimated from access type, risk and object type. One grade per object, counted by row.`}
            evidence="The per-object table below, each row with where its letter comes from."
          />
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
        {GRADES.map((g) => (
          <div key={g} className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5">
              <CcCleanCoreLevel value={g} />
            </span>
            <div>
              <div className="cc-text-identifier text-cc-ink">
                {ABCD_META[g].label}
                <span className="ml-1 cc-text-meta text-cc-ink-muted">· ATC {ABCD_META[g].atcReading} (our reading)</span>
              </div>
              <div className="cc-text-cell text-cc-ink-muted">{ABCD_META[g].description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Per-object grades */}
      <CcTable
        caption="Clean core level per object"
        columns={[
          { key: 'object', label: 'Object' },
          { key: 'grade', label: 'Grade' },
          { key: 'detail', label: 'Detail' },
        ]}
        rows={items.map((it, i) => ({
          key: `${it.name}-${i}`,
          cells: {
            object: <span className="font-cc-mono font-semibold">{it.name}</span>,
            grade: (
              <span className="inline-flex flex-wrap items-center gap-2">
                <CcCleanCoreLevel value={it.grade} />
                <span className="cc-text-meta text-cc-ink">{ABCD_META[it.grade].short}</span>
                <span title={gradeOrigin(it)}>
                  <CcProvenanceChip value={PROVENANCE_CHIP[it.provenance].value} note={PROVENANCE_CHIP[it.provenance].note} />
                </span>
              </span>
            ),
            detail: <span className="text-cc-ink-muted">{it.sub || '—'}</span>,
          },
        }))}
      />
    </CollapsibleAccordion>
  );
}

/**
 * Where a row's letter comes from, as a provenance chip (DESIGN.md §4). A grade
 * read out of SAP's files is *Imported*; one derived here — the own-table rule
 * or the estimate from access type, risk and object type — is *Reconstructed*,
 * with the qualifier the row used to print on its own ("own object", "est.").
 */
const PROVENANCE_CHIP: Record<GradeProvenance, { value: ProvenanceValue; note?: string }> = {
  catalog: { value: 'imported', note: 'SAP data' },
  'catalog-residual': { value: 'imported', note: 'SAP data' },
  'own-object': { value: 'reconstructed', note: 'own object' },
  heuristic: { value: 'reconstructed', note: 'estimated' },
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
