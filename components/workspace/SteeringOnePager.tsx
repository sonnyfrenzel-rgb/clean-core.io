'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import CcButton from '@/components/cc/Button';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevelExplained } from '@/components/cc/LevelExplained';
import { getAuth, getDb } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import { runHistoryEntry, type RunHistoryEntry } from '@/lib/management-answers';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { Loaded } from '@/lib/management-overview';
import type { ProjectDecision } from '@/lib/project-decision';
import { otherEditionLine, standardFit, standardFitOnOtherEdition } from '@/lib/standard-fit';
import { executiveSubject } from '@/lib/management-executive';
import CcStateText from '@/components/cc/StateText';
import { CcTag } from '@/components/cc/Tag';
import type { OptionSignal } from '@/lib/decision-option-signals';
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
import { steeringDecidedBy, steeringMore, wt } from '@/lib/workspace-messages';
import { STEERING_ANCHOR, STEERING_OPEN_EVENT } from '@/lib/steering-open';
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
 * element marked `data-steering-print`, on one A4 landscape page, in colour
 * (owner, 10.10.2026: "in print the one-pager must really be ONE page — in
 * colour and perfectly formatted, to put in front of a real management").
 * While it prints, the document carries the page's own title, so the PDF's
 * file name and any header the browser adds name the program and the day.
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
    | {
        record: ProjectDecision | null;
        unreadable: string | null;
        status?: DecisionStatus | null;
        outdated?: boolean;
        confirmation?: { account: string; at: string } | null;
        signOff?: { code: string | null; by: string | null; at: string | null } | null;
      }
    | undefined
  >(undefined);
  const [process, setProcess] = useState<SteeringProcess | null | undefined>(undefined);
  // ADR-083 (b): who decided is printed by name, else by e-mail. The one name
  // this screen may read is the signed-in account's own.
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

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

      // The reader's own name, for "Confirmed by …" when the reader decided.
      const names = (async (): Promise<Record<string, string>> => {
        const email = user?.email?.trim().toLowerCase();
        if (!uid || !email) return {};
        let name = user?.displayName?.trim() ?? '';
        try {
          const profile = await getDoc(doc(getDb(), 'users', uid));
          const d = profile.data() as { firstName?: unknown; lastName?: unknown } | undefined;
          const full = [d?.firstName, d?.lastName]
            .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
            .map((x) => x.trim())
            .join(' ');
          if (full) name = full;
        } catch {
          /* the e-mail stands, as ADR-083 says */
        }
        return name ? { [email]: name } : {};
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

      const [h, f, d, p, n] = await Promise.all([
        runs,
        read<ItFindingsSource>('findings'),
        read<{
          draft?: ProjectDecision;
          stored?: (ProjectDecision & { confirmation?: { account: string; at: string } | null }) | null;
          unchanged?: boolean;
          signOff?: { code: string | null; by: string | null; at: string | null } | null;
          error?: string;
        }>('decision'),
        reconstructed,
        names,
      ]);
      if (cancelled) return;

      setAccountNames(n);
      setHistory(h);
      setFindings(f.ok && f.json ? f.json : null);
      setProcess(p);
      if (d.ok && d.json?.draft) {
        // The card's rule: a confirmed record is the decision until withdrawn.
        const confirmed = d.json.stored && d.json.stored.status === 'confirmed' ? d.json.stored : null;
        const record = confirmed ?? d.json.draft;
        setDecision({
          record,
          unreadable: null,
          status: confirmed ? 'confirmed' : (d.json.stored?.status ?? 'draft'),
          outdated: Boolean(confirmed && d.json.unchanged === false),
          confirmation: confirmed?.confirmation ?? null,
          signOff: d.json.signOff ?? null,
        });
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

  // Opened from the decision card or the Export menu (`lib/steering-open.ts`),
  // or by a link to `#steering-one-pager`: open, then bring the page into view.
  // Every opening is a new read: what an earlier opening read is dropped
  // first, so neither the page nor Print shows figures from before a run or a
  // decision changed while it was closed.
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    const onOpen = () => {
      setHistory(undefined);
      setFindings(undefined);
      setDecision(undefined);
      setProcess(undefined);
      setOpen(true);
      setReveal((n) => n + 1);
    };
    if (window.location.hash === `#${STEERING_ANCHOR}`) onOpen();
    window.addEventListener(STEERING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(STEERING_OPEN_EVENT, onOpen);
  }, []);
  useEffect(() => {
    if (reveal === 0) return;
    const frame = window.requestAnimationFrame(() =>
      document.getElementById(STEERING_ANCHOR)?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [reveal]);

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

  const fitSource = useMemo(
    () => ({
      mode: 'project' as const,
      hasRun,
      analyzeState: steps.find((x) => x.key === 'analyze')?.state ?? 'empty',
      signedSourceSha256: project?.auditMetadata?.inputFingerprint?.sha256 ?? null,
      findings: findingsLoaded,
      fit,
    }),
    [hasRun, steps, project, findingsLoaded, fit],
  );

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
            fit: standardFit(fitSource),
            otherEdition: otherEditionLine(standardFitOnOtherEdition(fitSource)),
            subject: executiveSubject(project?.legacyCode, project?.name?.trim() || projectId),
            decision: decision.record,
            decisionUnreadable: decision.unreadable,
            decisionStatus: decision.status ?? null,
            decisionOutdated: decision.outdated ?? false,
            confirmation: decision.confirmation ?? null,
            signOff: decision.signOff ?? null,
            process,
            accountNames,
          })
        : null,
    [ready, projectId, project, hasRun, history, findings, decision, process, fitSource, accountNames],
  );

  // Closed, it is a place and no button: the page opens from the button at the
  // top of the decision card and from the Export menu — a second button here,
  // further down, did the same thing twice (ADR-087).
  if (!open) {
    return <div id={STEERING_ANCHOR} data-steering-one-pager="closed" className="cc-no-print scroll-mt-20" />;
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

const SIGNAL_STATE: Record<OptionSignal, 'information' | 'warning' | 'neutral'> = {
  for: 'information',
  against: 'warning',
  'not-determined': 'neutral',
};

/**
 * While the page prints, the document carries the page's own title — Chrome
 * takes it for the PDF's file name and for the header line it may add, which
 * otherwise says the app's title. Set on `beforeprint`, so Ctrl+P gets it too,
 * and given back on `afterprint`.
 */
function usePrintTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    let before: string | null = null;
    const onBefore = () => {
      if (before === null) before = document.title;
      document.title = title;
    };
    const onAfter = () => {
      if (before !== null) document.title = before;
      before = null;
    };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      onAfter();
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, [title]);
}

/**
 * The page itself — one A4 landscape page on paper, stacked on a phone.
 *
 * Layout (10.10.2026), top to bottom: the title block (program, what the code
 * does, date, and the decision with who took it); the decision and its basis
 * (question, proposal, readiness, the four options in one even row, what it
 * rests on); the distance to SAP standard beside the key figures; risks and
 * next steps in two columns; one footer with the legend, the scope, the
 * versions and the only raw ids on the page. Lists end in "+n more" rather
 * than run over; long sentences are clamped on paper only (`data-print-clamp`).
 */
function SteeringSheet({ pager, onClose }: { pager: SteeringPage | null; onClose: () => void }) {
  usePrintTitle(pager?.printTitle ?? null);
  const d = pager?.decision;
  return (
    <section
      id={STEERING_ANCHOR}
      data-steering-one-pager="open"
      data-steering-print=""
      aria-labelledby="steering-one-pager-heading"
      className="cc min-w-0 scroll-mt-20 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      {/* 1. Title block — program, purpose, date; the decision and who took it. */}
      <header
        data-steering-titleblock=""
        className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-cc-ink pb-3"
      >
        <div className="min-w-0 flex-1">
          <p className={LABEL}>
            {STEERING_TITLE}
            {pager && pager.header.subject !== pager.header.program ? (
              <>
                {' · '}
                <span data-steering-subject="" className="font-cc-mono tracking-normal normal-case">
                  {pager.header.subject}
                </span>
              </>
            ) : null}
          </p>
          <h2 id="steering-one-pager-heading" className="m-0 mt-1 cc-text-h2 break-words text-cc-ink">
            {pager?.header.program ?? ''}
          </h2>
          {pager ? (
            <>
              <p data-steering-purpose="" data-print-clamp="2" className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink">
                {pager.header.purpose} <CcProvenanceChip value={pager.header.purposeProvenance} />
              </p>
              <p data-steering-summary="" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink-muted">
                {pager.header.dateText} · {pager.header.status}
              </p>
            </>
          ) : null}
        </div>

        <div data-steering-titleside="" className="flex min-w-0 flex-col items-end gap-2">
          <div className="cc-no-print flex flex-wrap justify-end gap-2">
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
          <p
            data-steering-print-hint=""
            className="cc-no-print m-0 max-w-72 text-right text-[11px] leading-snug font-medium text-cc-ink-muted"
          >
            {wt('steering.printHint')}
          </p>
          {d ? (
            <div
              data-steering-stamp=""
              data-steering-decision={d.state}
              className="w-full max-w-sm rounded-cc-row border border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted px-3 py-2"
            >
              <p className={LABEL}>{wt('steering.decision')}</p>
              {d.state === 'ready' ? (
                <>
                  <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span data-steering-decision-headline="" className="text-[14px] leading-snug font-bold text-cc-ink">
                      {d.answer}
                    </span>
                    <span data-steering-decision-status={d.status}>
                      <CcObjectStatus value={STATUS_OF[d.status]} />
                    </span>
                  </p>
                  {d.decidedBy ? (
                    <p data-steering-decision-who="" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink">
                      {steeringDecidedBy(d.decidedBy.verb, d.decidedBy.by, d.decidedBy.at)}
                      {d.decidedBy.verb === 'Confirmed' ? (
                        <span className="font-medium text-cc-ink-muted"> — {wt('steering.selfDeclaration')}</span>
                      ) : null}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink">
                  <span className="font-semibold">{wt('steering.notDetermined')}</span> — {d.reason}{' '}
                  <CcProvenanceChip value="not-determined" />
                </p>
              )}
            </div>
          ) : null}
        </div>
      </header>

      {!pager || !d ? (
        <div data-steering-one-pager-state="loading" role="status" className="py-6">
          <span className="sr-only">{wt('steering.reading')}</span>
        </div>
      ) : (
        <>
          {/* 2. The decision and its basis — the question, the proposal, the four options. */}
          {d.state === 'ready' ? (
            <section data-steering-block="decision" className="mt-4">
              <h3 className={LABEL}>{wt('steering.basis')}</h3>
              <p data-steering-question="" className="m-0 mt-1 text-[15px] leading-snug font-bold text-cc-ink">
                {pager.question}
              </p>
              <p data-steering-proposal="" data-print-clamp="2" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink">
                {d.proposal} <span className="font-medium">{d.readiness}</span>
              </p>
              <ul
                data-steering-options=""
                className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 lg:grid-cols-4"
              >
                {d.options.map((o) => (
                  <li
                    key={o.option}
                    data-steering-option={o.option}
                    data-option-signal={o.signal}
                    data-option-chosen={o.chosen ? 'yes' : 'no'}
                    className={cn(
                      'flex min-w-0 flex-col rounded-cc-row border bg-cc-surface p-2',
                      o.chosen ? 'border-l-4 border-cc-line border-l-cc-ink' : 'border-cc-line',
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-[13px] font-bold text-cc-ink">{o.label}</span>
                      {o.chosen ? <CcTag>{wt('decide.chosen')}</CcTag> : null}
                      {o.proposed ? <CcTag>{wt('decide.proposed')}</CcTag> : null}
                    </span>
                    <span className="mt-1">
                      <CcStateText state={SIGNAL_STATE[o.signal]}>{o.signalWord}</CcStateText>
                    </span>
                    <span data-print-clamp="4" className="mt-1 text-[12px] leading-snug font-medium text-cc-ink">
                      {o.reason}
                    </span>
                    {/* Effort and cost stand on the card's floor, so the four rows align. */}
                    <span data-option-figures="" className="mt-auto flex flex-col gap-1 border-t border-cc-line pt-2">
                      <span data-option-figure="effort" className="text-[11px] leading-snug font-medium text-cc-ink">
                        <span className="font-semibold">{wt('decide.effort')}:</span>{' '}
                        {o.effort.value ?? wt('steering.notDetermined')} <CcProvenanceChip value={o.effort.provenance} />
                      </span>
                      <span data-option-figure="cost" className="text-[11px] leading-snug font-medium text-cc-ink">
                        <span className="font-semibold">{wt('decide.cost')}:</span>{' '}
                        {o.cost.value ?? wt('steering.notDetermined')} <CcProvenanceChip value={o.cost.provenance} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div data-steering-pillars="" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={LABEL}>{wt('steering.pillars')}</span>
                <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                  {d.pillars.map((p) => (
                    <li key={p.key} data-steering-pillar={p.key} className="flex items-center gap-1 text-[12px] font-semibold text-cc-ink">
                      {p.title}
                      <CcProvenanceChip value={p.provenance} />
                      {p.draft ? <CcObjectStatus value="draft" /> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <p data-steering-question="" className="m-0 mt-4 text-[15px] leading-snug font-bold text-cc-ink">
              {pager.question}
            </p>
          )}

          {/* 3. Distance to SAP standard beside the key figures. */}
          <div data-steering-evidence-row="" className="mt-4 grid gap-4 lg:grid-cols-[2fr_3fr]">
            <section
              data-steering-distance={pager.distance.state}
              data-steering-block="distance"
              className="min-w-0 rounded-cc-row border border-cc-line p-3"
            >
              <h3 className="m-0 text-[14px] leading-snug font-bold text-cc-ink">{pager.distance.title}</h3>
              {pager.distance.state === 'ready' ? (
                <>
                  <p className="m-0 mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="cc-text-figure leading-none text-cc-ink">{pager.distance.percent} %</span>
                    <CcProvenanceChip value="reconstructed" />
                  </p>
                  <p data-print-clamp="2" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink">
                    {pager.distance.sentence}
                  </p>
                  <span
                    role="img"
                    aria-label={`${pager.distance.title}: ${pager.distance.segments.map((g) => `${g.label} ${g.count}`).join(', ')}.`}
                    className="mt-2 flex h-4 w-full gap-1 overflow-hidden rounded-cc-row"
                  >
                    {pager.distance.segments
                      .filter((g) => g.count > 0)
                      .map((g) => (
                        <span
                          key={g.key}
                          data-steering-segment=""
                          style={{ flexGrow: g.count, flexBasis: 0 }}
                          className={cn('block h-full min-w-1', TONE_CLASS[g.tone])}
                        />
                      ))}
                  </span>
                  <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
                    {pager.distance.segments.map((g) => (
                      <li key={g.key} className="flex items-center gap-1 text-[11px] font-medium text-cc-ink">
                        <span
                          aria-hidden="true"
                          data-steering-segment=""
                          className={cn('inline-block h-3 w-3 rounded-[2px]', TONE_CLASS[g.tone])}
                        />
                        {g.label} <span className="font-semibold tabular-nums">{g.count}</span>
                      </li>
                    ))}
                  </ul>
                  {pager.distance.other ? (
                    <p
                      data-steering-other-edition=""
                      data-print-clamp="2"
                      className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink"
                    >
                      {pager.distance.other}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">
                  {pager.distance.state === 'none-used' ? pager.distance.sentence : `${wt('steering.notDetermined')} — ${pager.distance.reason}`}
                </p>
              )}
            </section>

            <section data-steering-block="figures" className="min-w-0">
              <h3 className={LABEL}>{wt('steering.figures')}</h3>
              <ul
                data-steering-figures=""
                className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 lg:grid-cols-3"
              >
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
                      <span
                        data-figure-absent-reason=""
                        data-print-clamp="2"
                        className="mt-1 text-[13px] leading-snug font-semibold text-cc-ink"
                      >
                        {wt('steering.notDetermined')} — {f.absentReason}
                      </span>
                    ) : f.levels ? (
                      <>
                        <span className="mt-1 flex h-4 w-full gap-1 overflow-hidden rounded-cc-row" role="img" aria-label={f.value}>
                          {f.levels
                            .filter((l) => l.count > 0)
                            .map((l) => (
                              <span
                                key={l.grade}
                                data-steering-segment=""
                                style={{ flexGrow: l.count, flexBasis: 0 }}
                                className={cn('block h-full min-w-1', TONE_CLASS[`level-${l.grade}` as keyof typeof TONE_CLASS])}
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
                    <span data-print-clamp="3" className="mt-1 text-[12px] leading-snug font-medium text-cc-ink">
                      {f.meaning}
                    </span>
                    <span className="mt-auto flex flex-wrap items-center gap-2 pt-2">
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
            </section>
          </div>

          {/* 4. Risks and open points — two balanced columns. */}
          <div data-steering-lists="" className="mt-4 grid gap-4 md:grid-cols-2">
            <section data-steering-risks="" data-steering-block="risks" className="min-w-0">
              <h3 className={LABEL}>{wt('steering.risks')}</h3>
              {pager.risks.length > 0 ? (
                <ol className="m-0 mt-2 list-none space-y-2 p-0">
                  {pager.risks.map((r, i) => (
                    <li key={r.object} data-steering-risk={r.object} className="flex min-w-0 items-start gap-2">
                      <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{i + 1}.</span>
                      <span className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-cc-ink">
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="font-cc-mono font-semibold break-all">{r.object}</span>
                          <CcCleanCoreLevelExplained value={r.level} />
                          {r.line !== null ? (
                            <span className="text-cc-ink-muted">
                              {wt('steering.line')} {r.line}
                            </span>
                          ) : null}
                        </span>
                        <span data-print-clamp="2" className="block">
                          {r.why}
                        </span>
                      </span>
                    </li>
                  ))}
                  {pager.risksMore > 0 ? (
                    <li data-steering-more="risks" className="pl-4 text-[12px] font-semibold text-cc-ink-muted">
                      {steeringMore(pager.risksMore)}
                    </li>
                  ) : null}
                </ol>
              ) : (
                <p data-steering-risks-note="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink">
                  {pager.risksNote}
                </p>
              )}
            </section>

            <section data-steering-steps="" data-steering-block="steps" className="min-w-0">
              <h3 className={LABEL}>{wt('steering.nextSteps')}</h3>
              <ol className="m-0 mt-2 list-none space-y-2 p-0">
                {pager.nextSteps.map((s) => (
                  <li key={s.key} data-steering-step={s.key} className="flex min-w-0 items-start gap-2">
                    <span
                      data-steering-owner={s.owner}
                      className="w-28 shrink-0 rounded-cc-row border border-cc-line px-2 text-center text-[11px] font-semibold whitespace-nowrap text-cc-ink"
                    >
                      {s.owner}
                    </span>
                    <span data-print-clamp="2" className="min-w-0 flex-1 text-[12px] leading-snug font-medium text-cc-ink">
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
                {pager.nextStepsMore > 0 ? (
                  <li data-steering-more="steps" className="text-[12px] font-semibold text-cc-ink-muted">
                    {steeringMore(pager.nextStepsMore)}
                  </li>
                ) : null}
              </ol>
            </section>
          </div>

          {/* 5. Footer — legend, scope, versions, and the one line of raw ids. */}
          <footer data-steering-footnote="" className="mt-4 border-t border-cc-line pt-2">
            <p data-steering-legend="" className="m-0 text-[11px] leading-snug font-medium text-cc-ink-muted">
              {pager.footnote.legend}
            </p>
            <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-cc-ink-muted">
              <span data-steering-scope="" className="font-semibold">
                {pager.footnote.scope}
              </span>
              {pager.footnote.versions ? <span className="font-cc-mono break-all">{pager.footnote.versions}</span> : null}
              {pager.footnote.reference ? (
                <span data-steering-reference="" className="font-cc-mono break-all">
                  {wt('steering.reference')}: {pager.footnote.reference}
                </span>
              ) : null}
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
