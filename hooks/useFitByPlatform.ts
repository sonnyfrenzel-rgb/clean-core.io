'use client';

import { useMemo } from 'react';
import { gradeKey, type ObjectUse } from '@/lib/abap/abcd-classification';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { publicCloudFitLookupObjects, resolvePublicCloudFit, type PublicCloudFitFinding } from '@/lib/abap/public-cloud-fit-resolver';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { FitByPlatform, Loaded } from '@/lib/management-overview';
import { sapCallsOf } from '@/lib/standard-fit';
import type { Project } from '@/lib/types';

/**
 * The same findings resolved into the four buckets for both editions — what
 * the Management overview reads (roadmap 3.0.10 (b)) and the demo workspace
 * reads for its decision panel. Moved out of `ManagementOverview.tsx` so both
 * stand on one derivation rather than two copies of it.
 *
 * The findings rows carry `objectName` and `kind`, which is all the resolver
 * reads. The grades and no-path facts come through `/api/abcd-classify`; until
 * that answer is in, nothing is concluded (`loading`), and a failed lookup is
 * `absent` with `lookupFailed` as the reason — never a bucket on a guessed fact.
 */
export function useFitByPlatform(
  findings: Loaded<ItFindingsSource>,
  project: Project | null,
  lookupFailed: string,
): Loaded<FitByPlatform> {
  const fitFindings = useMemo<PublicCloudFitFinding[] | null>(
    () =>
      findings.state === 'ready'
        ? findings.value.rows.map((r) => ({ objectName: r.objectName ?? '', kind: r.kind as EvidenceFinding['kind'] }))
        : null,
    [findings],
  );
  // The SAP function modules and BAPIs the code calls count as SAP objects too
  // (ADR-069, note of 03.10.2026), from the same `uses` the IT view lists.
  const calls = useMemo(() => (findings.state === 'ready' ? sapCallsOf(findings.value) : []), [findings]);
  const lookupObjects = useMemo(
    () => (fitFindings ? publicCloudFitLookupObjects(fitFindings, calls) : []),
    [fitFindings, calls],
  );
  // Graded under the project's target profile, as its run and the IT rows are
  // (owner decision 30.09.2026).
  const lookup = useAbcdCatalogLookup(lookupObjects, project ? catalogLookupTargetOf(project) : null);

  return useMemo<Loaded<FitByPlatform>>(() => {
    if (findings.state === 'loading') return { state: 'loading' };
    if (findings.state === 'absent') return { state: 'absent', reason: findings.reason };
    if (!fitFindings || !project) return { state: 'loading' };
    if (lookupObjects.length > 0 && lookup.status === 'loading') return { state: 'loading' };
    if (lookupObjects.length > 0 && lookup.status === 'error') return { state: 'absent', reason: lookupFailed };
    const deps = {
      gradeObjectUse: (name: string, use: ObjectUse | null) =>
        lookup.grades[gradeKey(name, use)] ?? { grade: 'Unknown' as const, provenance: 'heuristic' as const },
      hasNoPath: (name: string) => lookup.noPath[name] ?? false,
    };
    const base = { findings: fitFindings, calls, usageReport: project.usageReport ?? null, catalogBasis: null };
    return {
      state: 'ready',
      value: {
        target: project.s4Deployment ?? null,
        private: resolvePublicCloudFit({ ...base, targetPlatform: 'private' }, deps),
        public: resolvePublicCloudFit({ ...base, targetPlatform: 'public' }, deps),
      },
    };
  }, [findings, fitFindings, calls, project, lookupObjects.length, lookup.status, lookup.grades, lookup.noPath, lookupFailed]);
}
