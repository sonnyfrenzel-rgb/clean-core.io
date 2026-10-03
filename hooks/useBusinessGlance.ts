'use client';

import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import { gradeKey, isCustomerObject, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { useAbcdCatalogLookup, type AbcdCatalogLookupObject } from '@/hooks/useAbcdCatalogLookup';
import type { CatalogLookupTarget } from '@/lib/assessment-target';
import type { GlanceGap, GlanceHandbook, GlanceLevels } from '@/lib/business-summary';

/**
 * The two facts the Documentation stage's glance needs beyond the handbook:
 *
 *   - what the detectors could not judge — `assessCoverage` over the signed
 *     source, the same sweep the workspace's *Not determined* card reads,
 *     imported inside the effect so a reader who never opens the stage never
 *     downloads it;
 *   - the clean core level of every table outside the customer namespace the
 *     code writes, graded for that use through `/api/abcd-classify`
 *     (`useAbcdCatalogLookup`, under the project's target profile).
 *
 * Both start unknown and stay unknown on failure — `null` gaps, a `loading` or
 * `error` level — and the glance says so instead of showing a default.
 */
export function useBusinessGlance(
  source: string | null,
  handbook: GlanceHandbook | null,
  catalogTarget: CatalogLookupTarget | null,
): { gaps: GlanceGap[] | null; levels: GlanceLevels } {
  const key = useMemo(() => (source ? sha256Hex(source) : ''), [source]);
  const [held, setHeld] = useState<{ key: string; gaps: GlanceGap[] | null }>({ key: '', gaps: null });

  useEffect(() => {
    if (!source || !key) return;
    let cancelled = false;
    import('@/lib/abap/coverage')
      .then((coverage) => {
        if (cancelled) return;
        const report = coverage.assessCoverage(source);
        setHeld({ key, gaps: report.unassessed.map((u) => ({ label: u.label, why: u.why, line: u.line })) });
      })
      .catch(() => {
        // Not knowing is not "none": the box keeps saying it is checking.
      });
    return () => {
      cancelled = true;
    };
  }, [source, key]);

  const objects = useMemo<AbcdCatalogLookupObject[]>(
    () =>
      (handbook?.writes ?? [])
        .filter((o) => !isCustomerObject(o.name))
        .map((o) => ({ name: o.name.toUpperCase(), use: 'write' as const })),
    [handbook],
  );
  const lookup = useAbcdCatalogLookup(objects, catalogTarget);
  const levels = useMemo<GlanceLevels>(() => {
    const byKey: Record<string, CloudReadinessGrade> = {};
    for (const o of objects) {
      const graded = lookup.grades[gradeKey(o.name, 'write')];
      if (graded) byKey[gradeKey(o.name, 'write')] = graded.grade;
    }
    return { status: lookup.status, byKey };
  }, [objects, lookup]);

  return { gaps: held.key === key && key ? held.gaps : null, levels };
}
