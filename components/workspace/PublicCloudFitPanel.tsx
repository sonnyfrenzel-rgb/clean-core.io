'use client';

import React, { useMemo } from 'react';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { resolvePublicCloudFit, publicCloudFitLookupObjects } from '@/lib/abap/public-cloud-fit-resolver';
import { gradeKey } from '@/lib/abap/abcd-classification';
import {
  PUBLIC_CLOUD_FIT_BUCKETS,
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  publicCloudFitHeadline,
  TARGET_PLATFORM_LABELS,
  type PublicCloudFitAssignment,
} from '@/lib/abap/public-cloud-fit';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import type { Project } from '@/lib/types';

/**
 * Public-Cloud-Fit and the four buckets — `DESIGN.md` §5.6 (ADR-033), roadmap
 * step 6.7. The Management view's answer to "what do I risk, what do I
 * decide?" for the objects that have no way in SAP Public Cloud.
 *
 * The rule table itself lives in `lib/abap/public-cloud-fit.ts` and is fully
 * tested there (`tests/public-cloud-fit.spec.ts`); this component only lays
 * the result out, per the repository's own rule that logic belongs in a pure
 * module and a panel renders thin.
 *
 * Deliberately its own file rather than a section added to `WorkspaceShell.tsx`
 * — that file's view switcher is being edited concurrently (roadmap 6.1), and
 * a panel nobody else has to touch keeps the two changes from colliding. The
 * wiring into the Management view is the smallest edit that could work: one
 * import and one conditional block.
 *
 * Evidence is computed client-side from `project.legacyCode`, mirroring the
 * analyze page's own `buildAbapEvidence(...)` call (`app/(app)/project/
 * [projectId]/analyze/page.tsx`) rather than inventing a second way to reach
 * the same findings.
 *
 * **ADR-029 — the answer before the number.** The headline sentence
 * (`publicCloudFitHeadline`) is the first thing on the card, exactly the shape
 * DESIGN.md asks for ("4 objects block a Public Cloud decision") — never a
 * percentage, and the fifth area, *not assigned*, is always visible rather
 * than folded into one of the four when a rule could not be applied.
 *
 * **The catalog lookup is server-side (roadmap "SAP-Katalog im
 * Browser-Bundle").** `resolvePublicCloudFit` takes its grading and
 * "released path" facts as `deps` rather than reading the ~5 MB Cloudification
 * Repository itself, so this component batches exactly the objects the
 * resolver needs (`publicCloudFitLookupObjects`) through `/api/abcd-classify`
 * via `useAbcdCatalogLookup`. Until that answer is 'ready' — or if it errors —
 * no bucket is computed at all: showing one derived from a guessed "has a
 * path" would be a Retire/Keep/Rebuild/Blocked verdict standing on invented
 * evidence, exactly what this panel's own honesty rule (ADR-033, `bucket:
 * null` with a reason rather than a default) forbids for every other missing
 * fact.
 */
export default function PublicCloudFitPanel({ project }: { project: Project | null }) {
  const findings = useMemo(() => {
    const code = project?.legacyCode?.trim();
    if (!code || !project) return null;
    return buildAbapEvidence(code, 'main.abap', project.s4Deployment).findings;
  }, [project]);

  const lookupObjects = useMemo(() => (findings ? publicCloudFitLookupObjects(findings) : []), [findings]);
  const lookup = useAbcdCatalogLookup(lookupObjects);

  const result = useMemo(() => {
    if (!findings || !project || lookup.status !== 'ready') return null;
    return resolvePublicCloudFit(
      {
        findings,
        usageReport: project.usageReport ?? null,
        targetPlatform: project.s4Deployment ?? null,
      },
      {
        gradeObjectUse: (name, use) => lookup.grades[gradeKey(name, use)] ?? { grade: 'Unknown', provenance: 'heuristic' },
        hasNoPath: (name) => lookup.noPath[name] ?? false,
      },
    );
  }, [findings, project, lookup.status, lookup.grades, lookup.noPath]);

  if (!project?.legacyCode?.trim() || !findings) {
    return (
      <div className="cc" data-public-cloud-fit-panel="empty">
        <CcCard title="Public-Cloud-Fit and the four buckets" meta={<CcProvenanceChip value="not-determined" />}>
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            No source has been staged, so no object can be sorted into a bucket yet.
          </p>
        </CcCard>
      </div>
    );
  }

  // Visible "not loaded yet" state — the resolver has not run, so there is
  // nothing to render below but a placeholder, never a matrix of guesses.
  if (lookup.status === 'loading') {
    return (
      <div className="cc" data-public-cloud-fit-panel="loading">
        <CcCard title="Public-Cloud-Fit and the four buckets" meta={<CcProvenanceChip value="not-determined" />}>
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            Looking up each object&apos;s clean-core level and released path in the Cloudification Repository…
          </p>
        </CcCard>
      </div>
    );
  }

  // Visible "the lookup failed" state — never silently defaulted to "has a path".
  if (lookup.status === 'error' || !result) {
    return (
      <div className="cc" data-public-cloud-fit-panel="error">
        <CcCard title="Public-Cloud-Fit and the four buckets" meta={<CcProvenanceChip value="not-determined" />}>
          <CcMessageStrip state="error">
            The catalog lookup failed, so no object can be sorted into Retire, Keep, Rebuild or Blocked by SAP right
            now. Reload the page to try again.
          </CcMessageStrip>
        </CcCard>
      </div>
    );
  }

  const { assignments, summary } = result;
  const notAssigned = assignments.filter((a) => a.bucket === null);

  return (
    <div className="cc" data-public-cloud-fit-panel="ready">
      <CcCard title="Public-Cloud-Fit and the four buckets" count={assignments.length}>
        <p data-public-cloud-fit-headline className="m-0 text-[14px] leading-snug font-semibold text-cc-ink">
          {publicCloudFitHeadline(summary)}
        </p>
        {summary.targetPlatform && (
          <p className="m-0 mt-0.5 text-[12px] font-medium text-cc-ink-muted">
            Target platform: {TARGET_PLATFORM_LABELS[summary.targetPlatform]}.
          </p>
        )}
        {summary.usageImportCaveat && (
          <div className="mt-2.5" data-public-cloud-fit-usage-caveat="">
            <CcMessageStrip state="information">{summary.usageImportCaveat}</CcMessageStrip>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {PUBLIC_CLOUD_FIT_BUCKETS.map((bucket) => (
            <BucketSection
              key={bucket}
              bucket={bucket}
              label={PUBLIC_CLOUD_FIT_BUCKET_LABELS[bucket]}
              rows={assignments.filter((a) => a.bucket === bucket)}
            />
          ))}

          <section data-public-cloud-fit-bucket="not-assigned">
            <h4 className="m-0 flex flex-wrap items-center gap-1.5 text-[12px] font-bold tracking-[0.04em] text-cc-ink uppercase">
              Not assigned ({notAssigned.length})
              <CcProvenanceChip value="not-determined" />
            </h4>
            {notAssigned.length === 0 ? (
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">None.</p>
            ) : (
              <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
                {notAssigned.map((a) => (
                  <li
                    key={a.objectName}
                    data-public-cloud-fit-object={a.objectName}
                    className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-2.5 py-1.5"
                  >
                    <div className="text-[12px] font-semibold text-cc-ink">{a.objectName}</div>
                    <p className="m-0 mt-0.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
                      {a.reason?.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </CcCard>
    </div>
  );
}

function BucketSection({
  bucket,
  label,
  rows,
}: {
  bucket: string;
  label: string;
  rows: PublicCloudFitAssignment[];
}) {
  return (
    <section data-public-cloud-fit-bucket={bucket}>
      <h4 className="m-0 text-[12px] font-bold tracking-[0.04em] text-cc-ink uppercase">
        {label} ({rows.length})
      </h4>
      {rows.length === 0 ? (
        <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">None.</p>
      ) : (
        <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0">
          {rows.map((a) => (
            <li
              key={a.objectName}
              data-public-cloud-fit-object={a.objectName}
              className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-2.5 py-1.5"
            >
              <div className="text-[12px] font-semibold text-cc-ink">{a.objectName}</div>
              <p className="m-0 mt-0.5 text-[12px] leading-snug font-medium text-cc-ink-muted">{a.evidence}</p>
              {a.usageNote && (
                <p className="m-0 mt-0.5 text-[11px] leading-snug font-medium text-cc-ink-muted">{a.usageNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
