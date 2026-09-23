'use client';

import { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from '@/lib/artefact-digest';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import {
  buildFindingsOverlay,
  buildLevelOverlay,
  buildUsageOverlay,
  lookupObjects,
  objectSites,
  sitesByElement,
  type ObjectSite,
} from '@/lib/process-overlays';
import type { CallGraphReport } from '@/lib/abap/call-graph';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { UsageReport } from '@/lib/abap/usage-model';
import type { ProcessMapModel } from '@/lib/process-map';
import type { OverlayDefinition, ProcessNavigation } from '@/lib/process-navigation';

/**
 * The three overlays of roadmap 6.3, ready for the filter row — level, findings
 * and usage.
 *
 * Built the way `useProcessRules` is built, and for the same three reasons:
 *
 *   - **Derived, never stored.** The same signed source gives the same findings
 *     and the same object sites, so there is nothing to keep in step with
 *     anything, nothing reaches a run, and no model is called. An overlay is
 *     display; it has no place to be written to.
 *   - **The heavy readers are imported inside the effect**, not at the top of
 *     the file: the evidence model, the call graph and the table dependencies
 *     pull the statement reader and the block structure with them, and a reader
 *     who never opens a stage with the map should not download them.
 *   - **A reader that cannot get through the source is not a reason to lose the
 *     map.** The overlays are then simply absent, like any other count that has
 *     no answer — never an overlay showing zero, which would read as "nothing
 *     here" rather than "not known".
 *
 * The levels themselves are not computed here at all: `gradeSapObject` is
 * server-only (CLAUDE.md), so the distinct objects go through
 * `useAbcdCatalogLookup` and `/api/abcd-classify` in one batch, exactly as
 * `UsageRiskMatrix` and `PublicCloudFitPanel` do.
 */

/** `/api/abcd-classify` refuses more than 500 objects in one call. */
const MAX_GRADED = 500;

interface Derived {
  sites: ObjectSite[];
  findings: EvidenceFinding[];
  /** The call graph of the same source: what routine sits behind which step. */
  calls: CallGraphReport | null;
}

const EMPTY: Derived = { sites: [], findings: [], calls: null };

export function useProcessOverlays(
  source: string | null,
  model: ProcessMapModel,
  nav: ProcessNavigation,
  usage: UsageReport | null | undefined,
): OverlayDefinition[] {
  const [held, setHeld] = useState<{ key: string; value: Derived }>({ key: '', value: EMPTY });
  const key = useMemo(() => (source ? sha256Hex(source) : ''), [source]);
  const fileName = model.fileName;

  useEffect(() => {
    if (!source || !key) return;
    let cancelled = false;

    const build = async () => {
      const [tablesModule, callsModule, evidenceModule] = await Promise.all([
        import('@/lib/abap/table-dependencies'),
        import('@/lib/abap/call-graph'),
        import('@/lib/abap/evidence-model'),
      ]);
      if (cancelled) return;
      const calls = callsModule.readCallGraph(source);
      const sites = objectSites(tablesModule.readTableDependencies(source), calls);
      const findings = evidenceModule.buildAbapEvidence(source, fileName).findings;
      if (cancelled) return;
      setHeld({ key, value: { sites, findings, calls } });
    };

    build().catch(() => {
      if (!cancelled) setHeld({ key, value: EMPTY });
    });

    return () => {
      cancelled = true;
    };
  }, [source, key, fileName]);

  const derived = held.key === key ? held.value : EMPTY;

  const byElement = useMemo(
    () => sitesByElement(model, nav, derived.sites, derived.calls),
    [model, nav, derived.sites, derived.calls],
  );

  // Only the objects that actually sit behind an element are graded: the rest
  // are not on the map, and the route's batch is bounded.
  const objects = useMemo(() => {
    const placed: ObjectSite[] = [];
    for (const sites of byElement.values()) placed.push(...sites);
    return lookupObjects(placed).slice(0, MAX_GRADED);
  }, [byElement]);

  const lookup = useAbcdCatalogLookup(objects);

  return useMemo(() => {
    const out: OverlayDefinition[] = [];
    const level = lookup.status === 'ready' ? buildLevelOverlay(byElement, lookup.grades, nav) : null;
    if (level) out.push(level);
    if (derived.findings.length > 0) out.push(buildFindingsOverlay(model, nav, derived.findings, derived.calls));
    const usageOverlay = buildUsageOverlay(byElement, nav, usage);
    if (usageOverlay) out.push(usageOverlay);
    return out;
  }, [byElement, derived.calls, derived.findings, lookup.grades, lookup.status, model, nav, usage]);
}
