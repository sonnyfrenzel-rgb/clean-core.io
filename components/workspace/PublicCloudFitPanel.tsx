'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { buildAbapEvidence } from '@/lib/abap/evidence-model';
import { resolvePublicCloudFit, publicCloudFitLookupObjects } from '@/lib/abap/public-cloud-fit-resolver';
import { gradeKey } from '@/lib/abap/abcd-classification';
import {
  PUBLIC_CLOUD_FIT_BUCKETS,
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  PUBLIC_CLOUD_FIT_BUCKET_MEANINGS,
  publicCloudFitHeadline,
  TARGET_PLATFORM_LABELS,
  type CatalogSnapshot,
  type PublicCloudFitAssignment,
  type PublicCloudFitBucket,
} from '@/lib/abap/public-cloud-fit';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import type { Project } from '@/lib/types';

/**
 * Public-Cloud-Fit and the four buckets — `DESIGN.md` §5.6 (ADR-033), roadmap
 * step 6.7. The Management view's answer to "what do I risk, what do I
 * decide?" for the objects whose way into SAP Public Cloud nobody has named.
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
 * (`publicCloudFitHeadline`) is the first thing on the card, the shape DESIGN.md
 * asks for — "4 objects have no catalogued path", a count of objects and never
 * a percentage — and the fifth area, *not assigned*, is always visible rather
 * than folded into one of the four when a rule could not be applied.
 *
 * **The catalog lookup is server-side (roadmap "SAP-Katalog im
 * Browser-Bundle").** `resolvePublicCloudFit` takes its grading and
 * "released path" facts as `deps` rather than reading the ~5 MB Cloudification
 * Repository itself, so this component batches exactly the objects the
 * resolver needs (`publicCloudFitLookupObjects`) through `/api/abcd-classify`
 * via `useAbcdCatalogLookup`. Until that answer is 'ready' — or if it errors —
 * no bucket is computed at all: showing one derived from a guessed "has a
 * path" would be a Retire/Keep/Rebuild/no-path verdict standing on invented
 * evidence, exactly what this panel's own honesty rule (ADR-033, `bucket:
 * null` with a reason rather than a default) forbids for every other missing
 * fact.
 *
 * **The fourth bucket reads as a question, not a grade (roadmap 6.7, CR-18).**
 * Each heading carries `PUBLIC_CLOUD_FIT_BUCKET_MEANINGS` — one sentence saying
 * who has the work — so *Rebuild* ("we know how") and *No catalogued path*
 * ("someone has to find out") cannot be read as two severities of the same
 * failure. Every object in the fourth bucket shows its `reviewTask` as a task,
 * and the card names the SAP files behind it with the day each was synced.
 */

/**
 * The synced SAP repository files, for the "Datenbasis und Datum" the fourth
 * bucket has to carry.
 *
 * Read from `/facts.json` — the same `getFacts()` the public `/facts` page
 * prints, public and cached, no auth. It is a second small request rather than
 * a field on `/api/abcd-classify` because that route answers per object and
 * this is one fact for the whole card, and rather than a constant in this file
 * because a date typed here would be correct exactly once: the catalog is
 * re-synced by `npm run sync:catalog`, and nothing would make a hand-written
 * copy follow it.
 *
 * `null` until it arrives, and `null` for good if the request fails —
 * `summarizePublicCloudFit` then says the sync date is not available in this
 * view. It never stands in a plausible date for a missing one.
 */
function useCatalogBasis(): CatalogSnapshot[] | null {
  const [basis, setBasis] = useState<CatalogSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/facts.json');
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { catalogArtifacts?: { file?: string; fetchedAt?: string }[] };
        const artifacts = (json.catalogArtifacts ?? [])
          .filter((a): a is { file: string; fetchedAt: string } => Boolean(a.file && a.fetchedAt))
          .map((a) => ({ file: a.file, syncedAt: a.fetchedAt }));
        if (!cancelled && artifacts.length) setBasis(artifacts);
      } catch {
        // Leaves `basis` null — the card then says the date is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return basis;
}

export default function PublicCloudFitPanel({ project }: { project: Project | null }) {
  const catalogBasis = useCatalogBasis();
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
        catalogBasis,
      },
      {
        gradeObjectUse: (name, use) => lookup.grades[gradeKey(name, use)] ?? { grade: 'Unknown', provenance: 'heuristic' },
        hasNoPath: (name) => lookup.noPath[name] ?? false,
      },
    );
  }, [findings, project, lookup.status, lookup.grades, lookup.noPath, catalogBasis]);

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
            The catalog lookup failed, so no object can be sorted into Retire, No catalogued path, Rebuild or Keep
            right now. Reload the page to try again.
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
        {summary.noCatalogMatchNote && (
          <div className="mt-2.5" data-public-cloud-fit-no-catalog-match="">
            <CcMessageStrip state="information">{summary.noCatalogMatchNote}</CcMessageStrip>
          </div>
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
              meaning={PUBLIC_CLOUD_FIT_BUCKET_MEANINGS[bucket]}
              rows={assignments.filter((a) => a.bucket === bucket)}
              footnote={bucket === 'no-catalogued-path' ? summary.catalogBasisNote : null}
            />
          ))}

          <section data-public-cloud-fit-bucket="not-assigned">
            <h4 className="m-0 flex flex-wrap items-center gap-1.5 text-[12px] font-bold tracking-[0.04em] text-cc-ink uppercase">
              Not assigned ({notAssigned.length})
              <CcProvenanceChip value="not-determined" />
            </h4>
            {notAssigned.length === 0 ? (
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">Every object could be assigned.</p>
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

/**
 * One bucket, with the sentence that says who has the work under its heading.
 *
 * The `meaning` line is not decoration: four labels in a column read as four
 * severities of the same problem, and the whole point of the fourth bucket is
 * that it is not a severity at all — it is an open question (CR-18). The
 * `reviewTask` on each row is shown as a task, marked as one, and the
 * `footnote` carries the data basis and its date under the bucket that rests
 * on it.
 */
function BucketSection({
  bucket,
  label,
  meaning,
  rows,
  footnote,
}: {
  bucket: PublicCloudFitBucket;
  label: string;
  meaning: string;
  rows: PublicCloudFitAssignment[];
  footnote: string | null;
}) {
  return (
    <section data-public-cloud-fit-bucket={bucket}>
      <h4 className="m-0 text-[12px] font-bold tracking-[0.04em] text-cc-ink uppercase">
        {label} ({rows.length})
      </h4>
      <p data-public-cloud-fit-meaning className="m-0 mt-0.5 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {meaning}
      </p>
      {rows.length === 0 ? (
        <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">No object in this bucket.</p>
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
              {a.reviewTask && (
                <p
                  data-public-cloud-fit-review-task
                  className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink"
                >
                  <span className="font-bold tracking-[0.04em] uppercase">To find out:</span> {a.reviewTask}
                </p>
              )}
              {a.usageNote && (
                <p className="m-0 mt-0.5 text-[11px] leading-snug font-medium text-cc-ink-muted">{a.usageNote}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {footnote && (
        <p data-public-cloud-fit-basis className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
          {footnote}
        </p>
      )}
    </section>
  );
}
