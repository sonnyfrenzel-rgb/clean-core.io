'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import CcButton from '@/components/cc/Button';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { getAuth, getDb } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import { runHistoryEntry, type RunHistoryEntry } from '@/lib/management-answers';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { Loaded } from '@/lib/management-overview';
import type { ProjectDecision } from '@/lib/project-decision';
import { standardFit } from '@/lib/standard-fit';
import { signedSourceOf } from '@/lib/signed-source';
import { workflowSteps } from '@/lib/workflow-steps';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import { notDetermined } from '@/lib/workspace-model';
import {
  STEERING_TITLE,
  steeringOnePager,
  type SteeringOnePager as SteeringPage,
  type SteeringProcess,
} from '@/lib/steering-one-pager';
import type { ObjectStatusValue } from '@/lib/object-status';
import type { DecisionStatus } from '@/lib/project-decision';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { t } from '@/lib/cc-messages';
import { wt } from '@/lib/workspace-messages';
import { TONE_CLASS } from './ManagementExecutive';

/**
 * The steering one-pager — roadmap step 8.6, mockup screen 5; redesigned
 * 03.10.2026 (owner: "That is not a steering one-pager, far too complex and
 * confusing").
 *
 * Everything it prints is sorted in `lib/steering-one-pager.ts`, which only
 * re-reads what the Management answers, the IT findings, fit to standard and
 * the decision record already derive. The decision block is the decision
 * card's own derivation (`lib/decision-manager.ts`), so page and card say the
 * same thing. This component adds no number of its own.
 *
 * **The PDF is the browser's.** "Print / Save as PDF" calls `window.print()`,
 * and the print rule in `app/globals.css` keeps nothing on paper but the
 * element marked `data-steering-print`, on one A4 landscape page.
 *
 * **Read when opened.** The reads (runs, findings, decision) run only after
 * the reader asks for the page. Each has three states: in flight, failed
 * (`null`, reported as such), answered.
 *
 * A view, not a record: nothing here is written, and nothing here is part of
 * the signed audit pack.
 */
export default function SteeringOnePager({
  project,
  projectId,
}: {
  project: Project | null;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<RunHistoryEntry[] | null | undefined>(undefined);
  const [findings, setFindings] = useState<ItFindingsSource | null | undefined>(undefined);
  const [decision, setDecision] = useState<
    { record: ProjectDecision | null; unreadable: string | null } | undefined
  >(undefined);
  const [process, setProcess] = useState<SteeringProcess | null | undefined>(undefined);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;

    (async () => {
      const user = getAuth().currentUser;
      const uid = user?.uid ?? null;

      // Runs: owner-only, and a non-owner is never asked (see ManagementAnswers).
      const runs = (async (): Promise<RunHistoryEntry[] | null> => {
        if (!uid || !isProjectOwner(project, uid)) return null;
        try {
          const snap = await getDocs(
            query(collection(getDb(), 'projects', projectId, 'runs'), where('userId', '==', uid)),
          );
          return snap.docs
            .map((d) => runHistoryEntry({ runId: d.id, ...d.data() }))
            .filter((e): e is RunHistoryEntry => e !== null);
        } catch {
          return null;
        }
      })();

      // The process the signed source reconstructs to, counted as the map counts.
      const reconstructed = (async (): Promise<SteeringProcess | null> => {
        const signed = signedSourceOf(project);
        if (!signed) return null;
        try {
          const m = await import('@/lib/process-summary');
          const s = m.processSummaryOf(signed.source, signed.fileName);
          return s ? { steps: s.steps, decisions: s.decisions } : null;
        } catch {
          return null;
        }
      })();

      const token = await user?.getIdToken().catch(() => null);
      const read = async <T,>(path: string): Promise<{ ok: boolean; status: number; json: T | null }> => {
        if (!token) return { ok: false, status: 401, json: null };
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/${path}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { ok: res.ok, status: res.status, json: (await res.json().catch(() => null)) as T | null };
        } catch {
          return { ok: false, status: 0, json: null };
        }
      };

      const [h, f, d, p] = await Promise.all([
        runs,
        read<ItFindingsSource>('findings'),
        read<{
          draft?: ProjectDecision;
          stored?: ProjectDecision | null;
          error?: string;
        }>('decision'),
        reconstructed,
      ]);
      if (cancelled) return;

      setHistory(h);
      setFindings(f.ok && f.json ? f.json : null);
      setProcess(p);
      if (d.ok && d.json?.draft) {
        // The card's rule: a confirmed record is the decision until withdrawn.
        const record = d.json.stored && d.json.stored.status === 'confirmed' ? d.json.stored : d.json.draft;
        setDecision({ record, unreadable: null });
      } else {
        setDecision({
          record: null,
          unreadable: d.json?.error?.trim() || wt('steering.decisionUnreadable'),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectId, project]);

  // Every opening is a new read: what an earlier opening read is dropped
  // first, so neither the page nor Print shows figures from before a run or a
  // decision changed while it was closed.
  const openFresh = () => {
    setHistory(undefined);
    setFindings(undefined);
    setDecision(undefined);
    setProcess(undefined);
    setOpen(true);
  };

  const findingsLoaded = useMemo<Loaded<ItFindingsSource>>(
    () =>
      findings === undefined
        ? { state: 'loading' }
        : findings === null
          ? { state: 'absent', reason: wt('mgmt.whatFindings') }
          : { state: 'ready', value: findings },
    [findings],
  );
  const fit = useFitByPlatform(findingsLoaded, project, wt('mgmt.lookupFailed'));
  const hasRun = Boolean(project?.activeRunId);
  const steps = useMemo(() => workflowSteps(project), [project]);

  const ready = history !== undefined && findings !== undefined && decision !== undefined && process !== undefined && fit.state !== 'loading';
  const pager = useMemo(
    () =>
      ready
        ? steeringOnePager({
            mode: 'project',
            base: `/project/${encodeURIComponent(projectId)}`,
            program: project?.name?.trim() || projectId,
            date: new Date().toISOString().slice(0, 10),
            project,
            hasRun,
            history,
            open: notDetermined(project),
            findings,
            fit: standardFit({
              mode: 'project',
              hasRun,
              analyzeState: steps.find((x) => x.key === 'analyze')?.state ?? 'empty',
              signedSourceSha256: project?.auditMetadata?.inputFingerprint?.sha256 ?? null,
              findings: findingsLoaded,
              fit,
            }),
            decision: decision.record,
            decisionUnreadable: decision.unreadable,
            process,
          })
        : null,
    [ready, projectId, project, hasRun, history, findings, decision, process, steps, findingsLoaded, fit],
  );

  if (!open) {
    return (
      <div data-steering-one-pager="closed" className="cc-no-print">
        <CcButton variant="ghost" density="compact" icon={<FileText size={14} />} onClick={openFresh}>
          {STEERING_TITLE}
        </CcButton>
      </div>
    );
  }
  return <SteeringSheet pager={pager} onClose={() => setOpen(false)} />;
}

/** The one-pager of the demo, from the demo's own data — never signed, and it says so. */
export function SteeringOnePagerToggle({ build }: { build: () => SteeringPage }) {
  const [open, setOpen] = useState(false);
  const pager = useMemo(() => (open ? build() : null), [open, build]);
  if (!open) {
    return (
      <div data-steering-one-pager="closed" className="cc-no-print">
        <CcButton variant="ghost" density="compact" icon={<FileText size={14} />} onClick={() => setOpen(true)}>
          {STEERING_TITLE}
        </CcButton>
      </div>
    );
  }
  return <SteeringSheet pager={pager} onClose={() => setOpen(false)} />;
}

const STATUS_OF: Record<DecisionStatus, ObjectStatusValue> = {
  draft: 'draft',
  confirmed: 'confirmed',
  withdrawn: 'open',
  superseded: 'open',
};

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

/** The page itself — one A4 page on paper, stacked on a phone. */
function SteeringSheet({ pager, onClose }: { pager: SteeringPage | null; onClose: () => void }) {
  return (
    <section
      data-steering-one-pager="open"
      data-steering-print=""
      aria-labelledby="steering-one-pager-heading"
      className="cc min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={LABEL}>{STEERING_TITLE}</p>
          <h2 id="steering-one-pager-heading" className="m-0 mt-1 cc-text-h2 break-words text-cc-ink">
            {pager?.header.program ?? ''}
          </h2>
          {pager ? (
            <>
              <p data-steering-summary="" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink">
                {pager.header.date} · {pager.header.status}
              </p>
              <p data-steering-purpose="" className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink">
                <span className="min-w-0">{pager.header.purpose}</span>
                <CcProvenanceChip value={pager.header.purposeProvenance} />
              </p>
            </>
          ) : null}
        </div>
        <div className="cc-no-print flex flex-wrap gap-2">
          <CcButton
            variant="secondary"
            density="compact"
            icon={<Printer size={14} />}
            disabled={!pager}
            onClick={() => window.print()}
          >
            {wt('steering.print')}
          </CcButton>
          <CcButton variant="ghost" density="compact" onClick={onClose}>
            {t('action.close')}
          </CcButton>
        </div>
      </div>

      {!pager ? (
        <div data-steering-one-pager-state="loading" role="status" className="py-6">
          <span className="sr-only">{wt('steering.reading')}</span>
        </div>
      ) : (
        <>
          {/* 2. The decision — the card's headline, status and pillars. */}
          <div
            data-steering-decision={pager.decision.state}
            className="mt-4 rounded-cc-row border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted p-3"
          >
            <p className={LABEL}>{wt('steering.decision')}</p>
            {pager.decision.state === 'ready' ? (
              <>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 data-steering-decision-headline="" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
                    {pager.decision.headline}
                  </h3>
                  <span data-steering-decision-status={pager.decision.status}>
                    <CcObjectStatus value={STATUS_OF[pager.decision.status]} />
                  </span>
                  <code className="text-[11px] text-cc-ink-muted">{pager.decision.identity}</code>
                </div>
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">
                  {pager.decision.why} {pager.decision.readiness}
                </p>
                <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                  {pager.decision.pillars.map((p) => (
                    <li key={p.key} data-steering-pillar={p.key} className="flex items-center gap-1 text-[12px] font-semibold text-cc-ink">
                      {p.title}
                      <CcProvenanceChip value={p.provenance} />
                      {p.draft ? <CcObjectStatus value="draft" /> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink">
                <span className="font-semibold">{wt('steering.notDetermined')}</span> — {pager.decision.reason}{' '}
                <CcProvenanceChip value="not-determined" />
              </p>
            )}
          </div>

          {/* 3. At most four key figures. */}
          <h3 className={cn(LABEL, 'mt-4')}>{wt('steering.figures')}</h3>
          <ul data-steering-figures="" className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {pager.figures.map((f) => (
              <li
                key={f.key}
                data-steering-figure={f.key}
                data-steering-figure-determined={f.value === null ? 'no' : 'yes'}
                className={cn(
                  'flex min-w-0 flex-col rounded-cc-row border p-3',
                  f.value === null ? 'border-dashed border-cc-field-border' : 'border-cc-line',
                )}
              >
                <span className="text-[12px] font-semibold text-cc-ink-muted">{f.label}</span>
                {f.value === null ? (
                  <span data-figure-absent-reason="" className="mt-1 text-[13px] leading-snug font-semibold text-cc-ink">
                    {wt('steering.notDetermined')} — {f.absentReason}
                  </span>
                ) : f.levels ? (
                  <>
                    <span className="mt-1 flex h-4 w-full gap-[2px] overflow-hidden rounded-cc-row" role="img" aria-label={f.value}>
                      {f.levels
                        .filter((l) => l.count > 0)
                        .map((l) => (
                          <span
                            key={l.grade}
                            style={{ flexGrow: l.count, flexBasis: 0 }}
                            className={cn('block h-full min-w-[4px]', TONE_CLASS[`level-${l.grade}` as keyof typeof TONE_CLASS])}
                          />
                        ))}
                    </span>
                    <span data-figure-value="" className="mt-1 text-[13px] font-bold text-cc-ink">
                      {f.value}
                    </span>
                  </>
                ) : (
                  <span data-figure-value="" className="mt-1 cc-text-figure leading-none break-words text-cc-ink">
                    {f.value}
                  </span>
                )}
                <span className="mt-1 text-[12px] leading-snug font-medium text-cc-ink">{f.meaning}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <CcProvenanceChip value={f.provenance} />
                  <a
                    href={f.evidence.href}
                    data-steering-evidence=""
                    className="cc-no-print text-[12px] font-semibold text-cc-ink underline underline-offset-2"
                  >
                    {f.evidence.place}
                  </a>
                </span>
              </li>
            ))}
          </ul>

          <div data-steering-lists="" className="mt-4 grid gap-4 md:grid-cols-2">
            {/* 4. Risks and blockers — the top three. */}
            <section data-steering-risks="" className="min-w-0">
              <h3 className={LABEL}>{wt('steering.risks')}</h3>
              {pager.risks.length > 0 ? (
                <ol className="m-0 mt-2 list-none space-y-2 p-0">
                  {pager.risks.map((r, i) => (
                    <li key={r.object} data-steering-risk={r.object} className="flex min-w-0 items-start gap-2">
                      <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{i + 1}.</span>
                      <span className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-cc-ink">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="font-cc-mono font-semibold break-all">{r.object}</span>
                          <CcCleanCoreLevel value={r.level} />
                          {r.line !== null ? (
                            <span className="text-cc-ink-muted">
                              {wt('steering.line')} {r.line}
                            </span>
                          ) : null}
                        </span>
                        <span className="block">{r.why}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p data-steering-risks-note="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">
                  {pager.risksNote}
                </p>
              )}
            </section>

            {/* 5. Open points and next steps — who acts. */}
            <section data-steering-steps="" className="min-w-0">
              <h3 className={LABEL}>{wt('steering.nextSteps')}</h3>
              <ol className="m-0 mt-2 list-none space-y-2 p-0">
                {pager.nextSteps.map((s) => (
                  <li key={s.key} data-steering-step={s.key} className="flex min-w-0 items-start gap-2">
                    <span
                      data-steering-owner={s.owner}
                      className="shrink-0 rounded-cc-row border border-cc-line px-2 text-[11px] font-semibold whitespace-nowrap text-cc-ink"
                    >
                      {s.owner}
                    </span>
                    <span className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-cc-ink">
                      {s.link ? (
                        <a href={s.link.href} className="text-cc-ink underline underline-offset-2">
                          {s.text}
                        </a>
                      ) : (
                        s.text
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* 6. Footnote — legend, scope, versions in small print. */}
          <footer data-steering-footnote="" className="mt-4 border-t border-cc-line pt-2">
            <p className="m-0 text-[11px] leading-snug font-medium text-cc-ink-muted">{pager.footnote.legend}</p>
            <p data-steering-scope="" className="m-0 mt-1 text-[11px] leading-snug font-semibold text-cc-ink-muted">
              {pager.footnote.scope}
            </p>
            {pager.footnote.versions ? (
              <p className="m-0 mt-1 font-cc-mono text-[11px] leading-snug break-all text-cc-ink-muted">
                {pager.footnote.versions}
              </p>
            ) : null}
          </footer>
        </>
      )}
    </section>
  );
}
