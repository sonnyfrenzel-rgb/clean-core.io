'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Circle, CircleCheck, Route, ScrollText, Users } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcDisclosure from '@/components/cc/Disclosure';
import CcStateText from '@/components/cc/StateText';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { getAuth } from '@/lib/firebase';
import { CommandAnswerLostError, runProjectCommand } from '@/lib/project-command-client';
import { CONDITION_STATUS_LABEL, decisionCardView, type CardBinding } from '@/lib/decision-card';
import {
  decisionManagerView,
  withoutSourcePaths,
  type DecisionFoundation,
  type DecisionPlace,
  type DecisionPoint,
  type PillarKey,
  type StoredCostScenario,
} from '@/lib/decision-manager';
import { MANAGEMENT_IDS } from '@/lib/management-sections';
import type { ProjectDecision, DecisionCondition, DecisionConfirmation, DecisionStatus } from '@/lib/project-decision';
import { stageHref } from '@/lib/workspace-back-href';
import { cn } from '@/lib/utils';
import InfoPopover from './InfoPopover';
import type { ObjectStatusValue } from '@/lib/object-status';
import {
  wt,
  decisionConfirmsLine,
  decisionConfirmTitle,
  decisionDeriveFailed,
  decisionLatest,
  decisionLimitsFolded,
  decisionMovedSentence,
  decisionOpenCount,
  decisionResolveIn,
  decisionRestsOnCount,
  decisionTodoCount,
  decisionWithdrawTitle,
} from '@/lib/workspace-messages';

/**
 * "Open decision" — roadmap 8.4, mockup screen 5 (Management).
 *
 * The draft is derived on the server (`GET /api/projects/{id}/decision`) and
 * never on this page: it binds the architecture contract, whose evidence
 * reaches the 4.3 MB SAP catalog. Everything the card says comes out of
 * `lib/decision-card.ts`; a binding the server could not make is shown as
 * *not determined* with its reason, never left out and never filled in.
 *
 * **Confirming.** The reader confirms what the card shows. If the record on
 * the project is not that draft yet, the draft is recorded first
 * (`record-decision-draft`), and then confirmed with the fingerprint the card
 * displayed and the run it was derived from (`confirm-decision`, bound as 8.8
 * binds the sign-off). A 409 comes back with the server's own sentence, shown
 * in a `role="alert"` strip — which run the project stands on now and what
 * changed — and nothing is written.
 *
 * **Accountability** is the signed-in account and nothing else: no role is
 * stored, the dialog says whose confirmation it is, and the sentence under the
 * card is the one `lib/provenance.ts` owns.
 */

interface DecisionAnswer {
  draft: ProjectDecision;
  stored: (ProjectDecision & { status: DecisionStatus; confirmation: DecisionConfirmation | null }) | null;
  unchanged: boolean;
  runId: string | null;
  evidenceDigest: string | null;
  canDecide: boolean;
}

type Load = { state: 'loading' } | { state: 'failed'; sentence: string } | { state: 'ready'; answer: DecisionAnswer };

const STATUS_OF: Record<DecisionStatus, ObjectStatusValue> = {
  draft: 'draft',
  confirmed: 'confirmed',
  withdrawn: 'open',
  superseded: 'open',
};

export default function DecisionCard({
  projectId,
  beforeWrite,
  onChanged,
  costScenario = null,
  revision = 0,
  process = null,
}: {
  projectId: string;
  /**
   * "Your process" in one line — what the map of the signed source counts
   * ("36 steps · 13 decision points · 11 rules"), said in the Need row, whose
   * action leads to Business (ADR-087). `null` while it is not counted.
   */
  process?: string | null;
  /**
   * Bumped by the shell whenever any reader wrote the decision — the option
   * cards of ADR-079 choose Keep, standard or Retire outside this card, and the
   * card must read that choice back rather than keep "No option chosen yet".
   */
  revision?: number;
  /** The figures stored on the Economics stage, while the decision binds none of them. */
  costScenario?: StoredCostScenario | null;
  /** The Stand check of roadmap 6.9: a write against an overtaken screen stops first. */
  beforeWrite?: () => Promise<boolean>;
  /** Called after a command wrote the decision, so other readers of it reread. */
  onChanged?: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [reload, setReload] = useState(0);
  const [asking, setAsking] = useState<'confirm' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);
  // The headline says what the refused action left behind: a confirmation that
  // first recorded the draft has written that draft, so "Nothing was written"
  // would be false there.
  const [refusal, setRefusal] = useState<{ headline: string; sentence: string } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) setLoad({ state: 'failed', sentence: wt('decision.signedOut') });
          return;
        }
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/decision`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as (DecisionAnswer & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !json || !json.draft) {
          setLoad({
            state: 'failed',
            sentence: json?.error || decisionDeriveFailed(res.status),
          });
          return;
        }
        setLoad({ state: 'ready', answer: json });
      } catch {
        if (!cancelled) setLoad({ state: 'failed', sentence: wt('decision.unreadable') });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reload, revision]);

  const answer = load.state === 'ready' ? load.answer : null;
  // A confirmed record is the decision until it is withdrawn; otherwise the
  // card shows what a confirmation would bind today.
  const shown = useMemo<ProjectDecision | null>(() => {
    if (!answer) return null;
    if (answer.stored && answer.stored.status === 'confirmed') return answer.stored;
    return answer.draft;
  }, [answer]);
  const view = useMemo(() => (shown ? decisionCardView(shown) : null), [shown]);
  const m = useMemo(() => (shown ? decisionManagerView(shown, costScenario) : null), [shown, costScenario]);

  const account = typeof window === 'undefined' ? null : (getAuth().currentUser?.email ?? null);

  // The command may have been applied although its answer never arrived: the
  // card neither claims it was nor that nothing was written, and reads the
  // decision again so what it shows next is the server's.
  const answerLost = useCallback(
    (err: CommandAnswerLostError) => {
      setRefusal({ headline: wt('decision.answerLost'), sentence: err.message });
      // Not a success, so not the success path's `setReload` + `onChanged` pair
      // (management-overview.spec.ts counts that pair), but the same two rereads.
      onChanged?.();
      setReload((n) => n + 1);
    },
    [onChanged],
  );

  const confirm = useCallback(async () => {
    if (!answer) return;
    setAsking(null);
    setRefusal(null);
    if (beforeWrite && !(await beforeWrite())) return;
    setBusy(true);
    let draftSaved = false;
    try {
      const draft = answer.draft;
      if (!answer.stored || answer.stored.fingerprint !== draft.fingerprint || answer.stored.status !== 'draft') {
        await runProjectCommand(projectId, { command: 'record-decision-draft', decision: draft });
        draftSaved = true;
      }
      await runProjectCommand(projectId, {
        command: 'confirm-decision',
        expectedDecisionFingerprint: draft.fingerprint,
        expectedRunId: answer.runId ?? '',
        expectedEvidenceDigest: answer.evidenceDigest ?? '',
      });
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err: unknown) {
      if (err instanceof CommandAnswerLostError) {
        answerLost(err);
        return;
      }
      setRefusal({
        headline: draftSaved ? wt('decision.draftSaved') : wt('decision.nothingWritten'),
        sentence: err instanceof Error ? err.message : wt('decision.confirmRefused'),
      });
      if (draftSaved) onChanged?.();
    } finally {
      setBusy(false);
    }
  }, [answer, answerLost, beforeWrite, onChanged, projectId]);

  const withdraw = useCallback(async () => {
    setAsking(null);
    setRefusal(null);
    if (beforeWrite && !(await beforeWrite())) return;
    setBusy(true);
    try {
      await runProjectCommand(projectId, { command: 'withdraw-decision' });
      setReload((n) => n + 1);
      onChanged?.();
    } catch (err: unknown) {
      if (err instanceof CommandAnswerLostError) {
        answerLost(err);
        return;
      }
      setRefusal({
        headline: wt('decision.nothingWritten'),
        sentence: err instanceof Error ? err.message : wt('decision.withdrawRefused'),
      });
    } finally {
      setBusy(false);
    }
  }, [answerLost, beforeWrite, onChanged, projectId]);

  const cancel = useCallback(() => setAsking(null), []);

  if (load.state === 'loading') {
    return (
      <div data-decision-card="loading" role="status" className="py-4">
        <span className="sr-only">{wt('decision.deriving')}</span>
      </div>
    );
  }

  if (load.state === 'failed' || !view || !m || !shown || !answer) {
    return (
      <CcCard title={wt('decision.title')} meta={<CcProvenanceChip value="not-determined" />}>
        <p data-decision-card="unreadable" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {load.state === 'failed' ? load.sentence : wt('decision.unreadable')} {wt('decision.unreadableTail')}
        </p>
      </CcCard>
    );
  }

  const isConfirmed = shown.status === 'confirmed';
  const moved = isConfirmed && !answer.unchanged;
  const blocked = view.coverage.state === 'blocked';

  return (
    <div
      data-decision-card=""
      data-decision-status={shown.status}
      data-decision-coverage={view.coverage.state}
      className="min-w-0"
    >
      <p data-decision-summary="" className="sr-only">
        {view.summary}
      </p>

      {/* What it rests on (ADR-087): one list, one row per foundation with its
          state, one line and one action; the open conditions nested under the
          foundation they belong to, and the limits nobody here can close as one
          muted folded line under the contract. The decided option itself is
          the answer at the top of the card — never said a second time here. */}
      <section id={MANAGEMENT_IDS.restsOn} data-decision-rests-on="" className="scroll-mt-20">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 data-decision-rests-on-title="" className={LABEL}>
            {decisionRestsOnCount(m.inPlace, m.pillars.length)}
          </h3>
          <span data-decision-conditions-summary="" className="text-[12px] font-semibold text-cc-ink">
            {m.points.length === 0
              ? wt('decision.noOpenPoints')
              : m.openPoints === 0
                ? decisionOpenCount(0, m.points.length)
                : decisionTodoCount(m.todo, m.limits)}
          </span>
        </div>
        <ul data-decision-pillars="" className="m-0 mt-2 list-none space-y-2 p-0">
          {m.foundations.map((f) => (
            <Foundation
              key={f.pillar.key}
              foundation={f}
              projectId={projectId}
              process={f.pillar.key === 'need' ? process : null}
            />
          ))}
          {m.other.length > 0 ? (
            <li
              data-decision-other=""
              className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
            >
              <span className="text-[12px] font-bold text-cc-ink">{wt('decision.otherTitle')}</span>
              <ul data-decision-conditions="" className="m-0 mt-2 list-none space-y-2 p-0">
                {m.other.map((pt) => (
                  <ConditionLine key={pt.id} point={pt} projectId={projectId} />
                ))}
              </ul>
            </li>
          ) : null}
        </ul>
      </section>

      {/* The record: identity, status and whether it can be taken back on the
          left, the decision's own action on the right, and under it the one
          sentence that says whether it can be confirmed. */}
      <div
        data-decision-record=""
        className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-cc-line pt-3"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          <code data-decision-identity="" className="text-[12px] font-medium text-cc-ink-muted">
            {view.identity}
          </code>
          <span data-decision-state={moved ? 'outdated' : shown.status} className="inline-flex items-center gap-2">
            <CcObjectStatus value={STATUS_OF[shown.status]} />
            {moved ? <CcStateText state="warning">{wt('decision.outdated')}</CcStateText> : null}
          </span>
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="font-semibold text-cc-ink-muted">{wt('decision.reversible')}</span>
            <span className="flex items-center gap-1" data-decision-reversible={shown.reversibility.answer}>
              <span className="font-semibold text-cc-ink">{view.reversible.answer}</span>
              <InfoPopover subject={wt('decision.reversible')} hook="decision-reversible">
                {withoutSourcePaths(view.reversible.detail)}
              </InfoPopover>
            </span>
          </span>
        </div>
        {answer.canDecide ? (
          isConfirmed ? (
            <CcButton onClick={() => setAsking('withdraw')} disabled={busy} data-decision-withdraw="">
              {wt('decision.withdrawEllipsis')}
            </CcButton>
          ) : (
            <CcButton
              // Primary only when it can be done: a blocked decision leaves the
              // page's one primary to the step that unblocks it.
              variant={view.confirmable ? 'primary' : 'secondary'}
              onClick={() => setAsking('confirm')}
              disabled={busy || !view.confirmable}
              aria-describedby={view.confirmable ? undefined : 'decision-blocked-reason'}
              data-decision-confirm=""
            >
              {wt('decision.confirmEllipsis')}
            </CcButton>
          )
        ) : null}
      </div>

      {m.readiness ? (
        <p
          id="decision-blocked-reason"
          data-decision-coverage-sentence=""
          className={cn('m-0 mt-2 text-[12px] leading-snug', blocked ? 'font-semibold text-cc-ink' : 'font-medium text-cc-ink-muted')}
        >
          {m.readiness}
        </p>
      ) : null}

      {moved ? (
        <p data-decision-moved="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink">
          {decisionMovedSentence(answer.draft.revision)}
        </p>
      ) : null}

      {/* Who confirmed is said once, beside the answer at the top of the card. */}
      <p data-decision-self-declaration="" className="m-0 mt-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
        {view.selfDeclaration}
      </p>

      {refusal ? (
        <div className="mt-3" data-decision-refusal="">
          <CcMessageStrip state="error" headline={refusal.headline} announce={true}>
            {refusal.sentence}
          </CcMessageStrip>
        </div>
      ) : null}

      {/* For IT readers, folded: the record's own sentences, without source file paths. */}
      <div className="mt-3 border-t border-cc-line pt-1" data-decision-technical="">
        <CcDisclosure title={wt('decision.technicalBasis')} count={m.technical.length} level={4} density="compact">
          <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('decision.technicalLead')}</p>
          {/* The run it stands on — an auditor's fact, kept here once. */}
          <div
            className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-[12px]"
            data-decision-binding="run"
            data-decision-binding-determined={view.run.value === null ? 'no' : 'yes'}
          >
            <span className="font-semibold text-cc-ink-muted">{wt('decision.analysisRun')}</span>
            <CcProvenanceChip value={view.run.provenance} />
            {view.run.value !== null ? (
              <code className="text-[12px] font-medium break-all text-cc-ink-muted">{view.run.value}</code>
            ) : (
              <span className="font-medium text-cc-ink-muted">{view.run.reason}</span>
            )}
          </div>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {view.bindings.map((b) => (
              <Binding key={b.key} binding={b} />
            ))}
          </ul>
          <dl className="m-0 mt-2 space-y-2">
            {m.technical
              .filter((e) => !e.key.startsWith('binding:'))
              .map((e) => (
                <div key={e.key} data-decision-technical-entry={e.key}>
                  <dt className="text-[12px] font-semibold text-cc-ink-muted">
                    {e.label}
                    {e.key.startsWith('condition:') ? (
                      <span className="ml-2 font-medium">
                        {conditionBasis(view.conditions, e.key.slice('condition:'.length))}
                      </span>
                    ) : null}
                  </dt>
                  <dd className="m-0 text-[12px] leading-snug font-medium text-cc-ink">{e.text}</dd>
                </div>
              ))}
          </dl>
        </CcDisclosure>
      </div>

      {/* The timeline — folded, as the mockup folds it. */}
      {shown.timeline.length > 0 ? (
        <div className="border-t border-cc-line pt-1" data-decision-timeline-fold="">
          <CcDisclosure
            title={wt('decision.timeline')}
            count={shown.timeline.length}
            summary={decisionLatest(shown.timeline[shown.timeline.length - 1].at.slice(0, 10))}
            level={4}
            density="compact"
          >
            <ol id="decision-timeline" data-decision-timeline="" className="m-0 list-none space-y-1 p-0">
              {shown.timeline.map((entry, i) => (
                <li key={`${entry.at}-${entry.kind}-${i}`} className="text-[12px] leading-snug font-medium text-cc-ink">
                  <code className="text-cc-ink-muted">{entry.at.slice(0, 10)}</code> {entry.sentence}
                  {entry.account ? <span className="text-cc-ink-muted"> · {entry.account}</span> : null}
                </li>
              ))}
            </ol>
          </CcDisclosure>
        </div>
      ) : null}

      <CcMessageBox
        open={asking === 'confirm'}
        title={decisionConfirmTitle(shown.decisionId)}
        confirmLabel={wt('decision.confirm')}
        onConfirm={confirm}
        onCancel={cancel}
      >
        <p className="m-0">
          {decisionConfirmsLine(account)} {view.selfDeclaration}
        </p>
        <ul data-decision-dialog-lines="" className="m-0 mt-2 list-disc space-y-1 pl-5">
          {view.dialogLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </CcMessageBox>

      <CcMessageBox
        open={asking === 'withdraw'}
        title={decisionWithdrawTitle(shown.decisionId)}
        confirmLabel={wt('decision.withdraw')}
        onConfirm={withdraw}
        onCancel={cancel}
      >
        <p className="m-0">
          {wt('decision.withdrawBody')}
        </p>
      </CcMessageBox>
    </div>
  );
}

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

const PILLAR_ICON: Record<PillarKey, typeof Users> = {
  need: Users,
  option: Route,
  cost: Calculator,
  contract: ScrollText,
};

const THIS_VIEW = 'management';

/**
 * One foundation of the decision (ADR-087): its title, state, one line and one
 * action, and under it the conditions that belong to it — to do or met — and
 * the limits nobody here can close, folded into one muted line.
 */
function Foundation({
  foundation: f,
  projectId,
  process = null,
}: {
  foundation: DecisionFoundation;
  projectId: string;
  /** The Need row only: the process the map counts, in one line. */
  process?: string | null;
}) {
  const p = f.pillar;
  const Icon = PILLAR_ICON[p.key];
  return (
    <li
      id={p.key === 'cost' ? MANAGEMENT_IDS.costs : undefined}
      data-decision-pillar={p.key}
      data-decision-pillar-provenance={p.provenance}
      data-decision-pillar-in-place={p.inPlace ? 'yes' : 'no'}
      className={cn(
        'min-w-0 scroll-mt-20 rounded-cc-row border bg-cc-surface-muted px-3 py-2',
        p.inPlace ? 'border-cc-line' : 'border-dashed border-cc-field-border',
      )}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className="flex w-52 max-w-full shrink-0 flex-wrap items-center gap-2 text-[12px] font-bold text-cc-ink max-sm:w-full">
          <Icon size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
          {p.title}
          <CcProvenanceChip value={p.provenance} />
          {p.draft ? <CcObjectStatus value="draft" /> : null}
        </span>
        <span className="min-w-0 flex-1 basis-64 text-[13px] leading-snug font-medium text-cc-ink">
          {p.line}{' '}
          <a
            href={placeHref(projectId, p.place)}
            data-decision-pillar-action=""
            className="text-[12px] font-semibold whitespace-nowrap text-cc-ink underline underline-offset-2"
          >
            {p.place.action ?? placeLabel(p.place)}
          </a>
          {process ? (
            <span data-decision-need-process="" className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">
              {wt('decision.yourProcess')} {process}
            </span>
          ) : null}
        </span>
      </div>
      {f.points.length > 0 ? (
        <ul data-decision-conditions="" className="m-0 mt-2 list-none space-y-2 p-0 sm:pl-[13.75rem]">
          {f.points.map((pt) => (
            <ConditionLine key={pt.id} point={pt} projectId={projectId} />
          ))}
        </ul>
      ) : null}
      {f.limits.length > 0 ? (
        <div data-decision-limits="" className="mt-1 sm:pl-[13.75rem]">
          <CcDisclosure title={decisionLimitsFolded(f.limits.length)} density="compact">
            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('decision.limitsLead')}</p>
            <ul className="m-0 mt-1 list-none space-y-2 p-0">
              {f.limits.map((pt) => (
                <ConditionLine key={pt.id} point={pt} projectId={projectId} />
              ))}
            </ul>
          </CcDisclosure>
        </div>
      ) : null}
    </li>
  );
}

/**
 * One condition: its line, the link to the exact place it is acted on — named
 * by what is done there — and, folded, the technical detail behind the line.
 */
function ConditionLine({ point: pt, projectId }: { point: DecisionPoint; projectId: string }) {
  return (
    <li
      data-decision-condition={pt.id}
      data-decision-condition-status={pt.status}
      data-decision-condition-kind={pt.kind}
      className="flex items-start gap-2"
    >
      {pt.done ? (
        <CircleCheck size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink" />
      ) : (
        <Circle size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
      )}
      <span className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-cc-ink">
        <span className="sr-only">
          {pt.done ? wt('decision.stateDone') : pt.kind === 'limit' ? wt('decision.stateLimit') : wt('decision.stateOpen')}:{' '}
        </span>
        {pt.line}
        {pt.place ? (
          <>
            {' '}
            <a
              href={placeHref(projectId, pt.place)}
              data-decision-condition-link={pt.place.hash ?? ''}
              className="text-[12px] font-semibold whitespace-nowrap text-cc-ink underline underline-offset-2"
            >
              {pt.place.action ?? decisionResolveIn(placeLabel(pt.place))}
            </a>
          </>
        ) : null}
        {pt.details.length > 0 ? (
          <span className="block" data-decision-condition-details="">
            <CcDisclosure title={wt('decision.whichPlaces')} count={pt.details.length} density="compact">
              <ul className="m-0 list-disc space-y-1 pl-5 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {pt.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </CcDisclosure>
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Where a pillar or a condition is resolved, as a link on this page — to the exact place, where one is named. */
function placeHref(projectId: string, place: DecisionPlace): string {
  // ADR-079: an option chosen in Management is changed in the four options above.
  if (place.kind === 'view' && place.view === 'management') return '#decision-options';
  if (place.kind === 'view') {
    return `/project/${encodeURIComponent(projectId)}?view=${place.view}${place.hash ? `#${encodeURIComponent(place.hash)}` : ''}`;
  }
  // Back to this view from the stage: a link parameter, never a stored role.
  const href = stageHref({ base: `/project/${encodeURIComponent(projectId)}`, path: place.path, view: THIS_VIEW });
  return place.hash ? `${href}#${encodeURIComponent(place.hash)}` : href;
}

function placeLabel(place: DecisionPlace): string {
  if (place.kind === 'view' && place.view === 'management') return wt('decide.optionsLabel');
  if (place.kind === 'view') return wt(place.view === 'business' ? 'decision.placeBusiness' : 'decision.placeIt');
  return wt(
    place.path === 'tco' ? 'decision.placeEconomics' : place.path === 'design' ? 'decision.placeDesign' : 'decision.placeAnalyze',
  );
}

/** Whose status a condition carries — the evidence's or the account's — and the status itself. */
function conditionBasis(conditions: readonly DecisionCondition[], id: string): string {
  const c = conditions.find((x) => x.id === id);
  if (!c) return '';
  return `${CONDITION_STATUS_LABEL[c.status]} · ${c.statusBasis === 'derived' ? wt('decision.fromEvidence') : wt('decision.statedByAccount')}`;
}

/** One binding: what is bound, or *not determined* with its reason. */
function Binding({ binding }: { binding: CardBinding }) {
  return (
    <li data-decision-binding={binding.key} data-decision-binding-determined={binding.value === null ? 'no' : 'yes'}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-cc-ink-muted">{binding.label}</span>
        {binding.value === null ? (
          <span className="font-semibold text-cc-ink-muted">{wt('decision.notDetermined')}</span>
        ) : (
          <span className="font-semibold text-cc-ink" title={binding.value}>{binding.shown}</span>
        )}
        <CcProvenanceChip value={binding.provenance} />
      </span>
      {binding.value === null ? (
        <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">{withoutSourcePaths(binding.reason ?? '')}</span>
      ) : binding.note ? (
        <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">{withoutSourcePaths(binding.note)}</span>
      ) : null}
    </li>
  );
}
