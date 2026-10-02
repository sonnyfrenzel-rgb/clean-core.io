'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import CcCard from '@/components/cc/Card';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcButton from '@/components/cc/Button';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
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
  type PublicCloudFitReasonCode,
  type PublicCloudFitRule,
} from '@/lib/abap/public-cloud-fit';
import { useAbcdCatalogLookup } from '@/hooks/useAbcdCatalogLookup';
import { useProjectEvidence } from '@/hooks/useProjectEvidence';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import type { Project } from '@/lib/types';
import { wt, cloudFitDetailLabel, cloudFitNotAssigned, cloudFitTargetPlatform, type WorkspaceMessageKey } from '@/lib/workspace-messages';

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
 * The findings are the ones the Analyze stage shows, read from the server
 * (`useProjectEvidence`, `GET /api/projects/{id}/evidence`): computed from the
 * stored source with the file name the run signed and the catalog snapshot of
 * the project's target profile — the signed run's own inputs (owner decision
 * 30.09.2026). Computing them here with the default catalog let a Private
 * Edition project sort objects its run never found; and neither the engine nor
 * a catalog is downloaded for this card (external audit PERF-01). Until the
 * answer is here the card shows its loading state; if it cannot be read, its
 * error state — never the "no source" card for a project that has one. The
 * demo has no project on the server and hands its precomputed findings in as
 * `findings` instead.
 *
 * **ADR-029 — the answer before the number.** The headline sentence
 * (`publicCloudFitHeadline`) is the first thing on the card, the shape DESIGN.md
 * asks for — "4 objects have no catalogued path", a count of objects and never
 * a percentage — and the fifth area, *not assigned*, is always visible rather
 * than folded into one of the four when a rule could not be applied.
 *
 * **The catalog lookup is server-side (roadmap "SAP catalog in the
 * browser bundle").** `resolvePublicCloudFit` takes its grading and
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
 * The synced SAP repository files, for the "data basis and date" the fourth
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

export default function PublicCloudFitPanel({
  project,
  findings: givenFindings,
}: {
  project: Project | null;
  /**
   * The engine's findings, where the caller already holds them — the demo,
   * computed on the server with its own snapshot. Without it the card reads the
   * project's evidence from the server.
   */
  findings?: readonly EvidenceFinding[];
}) {
  const catalogBasis = useCatalogBasis();
  const hasSource = Boolean(project?.legacyCode?.trim());
  const projectEvidence = useProjectEvidence(project?.id, hasSource && !givenFindings, project?.activeRunId ?? '');
  // No project id and no findings handed in: nothing can be read, which is a
  // failure to say, not an empty card.
  const evidenceFailed = !givenFindings && hasSource && (projectEvidence.state === 'failed' || !project?.id);
  const findings = useMemo<EvidenceFinding[] | null>(() => {
    if (!hasSource) return null;
    if (givenFindings) return [...givenFindings];
    return projectEvidence.state === 'ready' ? projectEvidence.value.evidence.findings : null;
  }, [hasSource, givenFindings, projectEvidence]);

  const lookupObjects = useMemo(() => (findings ? publicCloudFitLookupObjects(findings) : []), [findings]);
  // Graded under the project's target profile (owner decision 30.09.2026).
  const lookup = useAbcdCatalogLookup(lookupObjects, project ? catalogLookupTargetOf(project) : null);

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

  if (!hasSource) {
    return (
      <div className="cc" id="public-cloud-fit" data-public-cloud-fit-panel="empty">
        <CcCard title={wt('cloudFit.title')} meta={<CcProvenanceChip value="not-determined" />}>
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('cloudFit.noSource')}
          </p>
        </CcCard>
      </div>
    );
  }

  // Visible "not loaded yet" state — the resolver has not run, so there is
  // nothing to render below but a placeholder, never a matrix of guesses.
  if (!evidenceFailed && (!findings || lookup.status === 'loading')) {
    return (
      <div className="cc" id="public-cloud-fit" data-public-cloud-fit-panel="loading">
        <CcCard title={wt('cloudFit.title')} meta={<CcProvenanceChip value="not-determined" />}>
          <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('cloudFit.loading')}
          </p>
        </CcCard>
      </div>
    );
  }

  // Visible "the lookup failed" state — never silently defaulted to "has a path".
  if (evidenceFailed || lookup.status === 'error' || !result) {
    return (
      <div className="cc" id="public-cloud-fit" data-public-cloud-fit-panel="error">
        <CcCard title={wt('cloudFit.title')} meta={<CcProvenanceChip value="not-determined" />}>
          <CcMessageStrip state="error">
            {wt('cloudFit.lookupFailed')}
          </CcMessageStrip>
        </CcCard>
      </div>
    );
  }

  const { assignments, summary } = result;
  const notAssigned = assignments.filter((a) => a.bucket === null);

  return (
    <div className="cc" id="public-cloud-fit" data-public-cloud-fit-panel="ready">
      <CcCard title={wt('cloudFit.title')} count={assignments.length}>
        <p data-public-cloud-fit-headline className="m-0 text-[14px] leading-snug font-semibold text-cc-ink">
          {publicCloudFitHeadline(summary)}
        </p>
        {summary.targetPlatform && (
          <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">
            {cloudFitTargetPlatform(TARGET_PLATFORM_LABELS[summary.targetPlatform])}
          </p>
        )}
        {summary.noCatalogMatchNote && (
          <div className="mt-3" data-public-cloud-fit-no-catalog-match="">
            <CcMessageStrip state="information">{summary.noCatalogMatchNote}</CcMessageStrip>
          </div>
        )}
        {summary.usageImportCaveat && (
          <div className="mt-3" data-public-cloud-fit-usage-caveat="">
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
            <h4 className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-bold tracking-[0.04em] text-cc-ink uppercase">
              {cloudFitNotAssigned(notAssigned.length)}
              <CcProvenanceChip value="not-determined" />
            </h4>
            {notAssigned.length === 0 ? (
              <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{wt('cloudFit.allAssigned')}</p>
            ) : (
              <ObjectTable rows={notAssigned} />
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
      <p data-public-cloud-fit-meaning className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {meaning}
      </p>
      {rows.length === 0 ? (
        <p className="m-0 mt-1 text-[12px] font-medium text-cc-ink-muted">{wt('cloudFit.emptyBucket')}</p>
      ) : (
        <ObjectTable rows={rows} />
      )}
      {footnote && (
        <p data-public-cloud-fit-basis className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
          {footnote}
        </p>
      )}
    </section>
  );
}

/** The plain one-line status of each rule and reason — the long sentence sits behind the row's detail. */
const RULE_LINE: Record<PublicCloudFitRule, WorkspaceMessageKey> = {
  'retire-drop': 'cloudFit.ruleRetireDrop',
  'retire-candidate-zero-usage': 'cloudFit.ruleRetireCandidateZeroUsage',
  'no-catalogued-path-none-named': 'cloudFit.ruleNoCataloguedPathNoneNamed',
  'no-catalogued-path-not-listed': 'cloudFit.ruleNoCataloguedPathNotListed',
  'rebuild-own-work': 'cloudFit.ruleRebuildOwnWork',
  'rebuild-path': 'cloudFit.ruleRebuildPath',
  'keep-platform-level': 'cloudFit.ruleKeepPlatformLevel',
};

const REASON_LINE: Record<PublicCloudFitReasonCode, WorkspaceMessageKey> = {
  'level-not-determined': 'cloudFit.reasonLevelNotDetermined',
  'target-platform-not-set': 'cloudFit.reasonTargetPlatformNotSet',
  'catalog-evidence-missing': 'cloudFit.reasonCatalogEvidenceMissing',
};

function statusLine(a: PublicCloudFitAssignment): string {
  if (a.rule) return wt(RULE_LINE[a.rule]);
  if (a.reason) return wt(REASON_LINE[a.reason.code]);
  return '';
}

const OBJECT_COLUMNS = [
  { key: 'object', label: wt('cloudFit.colObject'), width: '30%' },
  { key: 'status', label: wt('cloudFit.colStatus') },
  { key: 'detail', label: wt('cloudFit.colDetail'), action: true },
] as const;

/**
 * The objects of one bucket — one row each: the object, what is known in one
 * plain line, and "To find out" as a tag where something is still open. The
 * evidence sentence, the task and the usage note sit in the row's detail, one
 * action deeper (§2.11), and on paper always (§7.1). Nothing is shortened in
 * the detail: it is the sentence the resolver wrote.
 */
function ObjectTable({ rows }: { rows: PublicCloudFitAssignment[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (name: string) => setOpen((o) => ({ ...o, [name]: !o[name] }));
  return (
    <div className="mt-2">
      <CcTable
        caption={wt('cloudFit.tableCaption')}
        columns={OBJECT_COLUMNS}
        limit={5}
        rows={rows.map((a) => {
          const isOpen = Boolean(open[a.objectName]);
          const detail = a.evidence ?? a.reason?.detail ?? null;
          const detailId = `public-cloud-fit-detail-${a.objectName.replace(/[^A-Za-z0-9_-]/g, '_')}`;
          const detailBlock = (
              <div
                id={detailId}
                data-public-cloud-fit-detail={a.objectName}
                className={cn('mt-1 w-full space-y-1', !isOpen && 'hidden print:block')}
              >
                {detail ? (
                  <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{detail}</p>
                ) : null}
                {a.reviewTask && (
                  <p data-public-cloud-fit-review-task className="m-0 text-[12px] leading-snug font-medium text-cc-ink">
                    <span className="font-bold tracking-[0.04em] uppercase">{wt('cloudFit.toFindOut')}</span> {a.reviewTask}
                  </p>
                )}
                {a.usageNote && (
                  <p className="m-0 text-[11px] leading-snug font-medium text-cc-ink-muted">{a.usageNote}</p>
                )}
              </div>
          );
          return {
            key: a.objectName,
            cells: {
              object: (
                <span data-public-cloud-fit-object={a.objectName} className="font-cc-mono text-[12px] font-semibold">
                  {a.objectName}
                </span>
              ),
              status: (
                <div className="flex flex-wrap items-center gap-2">
                  <span data-public-cloud-fit-status="">{statusLine(a)}</span>
                  {a.reviewTask ? <CcTag>{wt('cloudFit.toFindOutTag')}</CcTag> : null}
                  {detailBlock}
                </div>
              ),
              detail: (
                <CcButton
                  variant="ghost"
                  density="compact"
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  aria-label={cloudFitDetailLabel(isOpen, a.objectName)}
                  onClick={() => toggle(a.objectName)}
                >
                  {isOpen ? wt('cloudFit.hide') : wt('cloudFit.details')}
                </CcButton>
              ),
            },
          };
        })}
      />
    </div>
  );
}
