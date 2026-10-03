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
import { decisionManagerView, withoutSourcePaths, type DecisionPlace, type PillarKey } from '@/lib/decision-manager';
import type { ProjectDecision, DecisionCondition, DecisionConfirmation, DecisionStatus } from '@/lib/project-decision';
import { stageHref } from '@/lib/workspace-back-href';
import { cn } from '@/lib/utils';
import InfoPopover from './InfoPopover';
import type { ObjectStatusValue } from '@/lib/object-status';
import {
  wt,
  decisionConfirmedBy,
  decisionConfirmsLine,
  decisionConfirmTitle,
  decisionDeriveFailed,
  decisionLatest,
  decisionMovedSentence,
  decisionOpenCount,
  decisionResolveIn,
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
}: {
  projectId: string;
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
  }, [projectId, reload]);

  const answer = load.state === 'ready' ? load.answer : null;
  // A confirmed record is the decision until it is withdrawn; otherwise the
  // card shows what a confirmation would bind today.
  const shown = useMemo<ProjectDecision | null>(() => {
    if (!answer) return null;
    if (answer.stored && answer.stored.status === 'confirmed') return answer.stored;
    return answer.draft;
  }, [answer]);
  const view = useMemo(() => (shown ? decisionCardView(shown) : null), [shown]);
  const m = useMemo(() => (shown ? decisionManagerView(shown) : null), [shown]);

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
      {/* Identity and status on the left, the decision's own action on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <code data-decision-identity="" className="text-[12px] font-medium text-cc-ink-muted">
            {view.identity}
          </code>
          <span data-decision-state={moved ? 'outdated' : shown.status} className="inline-flex items-center gap-2">
            <CcObjectStatus value={STATUS_OF[shown.status]} />
            {moved ? <CcStateText state="warning">{wt('decision.outdated')}</CcStateText> : null}
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

      {/* The decided or proposed option, in big type, and one sentence of why. */}
      <h3
        data-decision-headline=""
        data-management-headline=""
        className="m-0 mt-2 cc-text-h2 leading-snug text-cc-ink"
      >
        {m.headline}
      </h3>
      <p data-decision-why="" className="m-0 mt-1 text-[13px] leading-snug font-medium text-cc-ink">
        {m.why}
      </p>
      <p data-decision-summary="" className="sr-only">
        {view.summary}
      </p>

      {/* What it rests on: four pillars, each with its state and one plain line. */}
      <h4 className={cn(LABEL, 'mt-4')}>{wt('decision.restsOn')}</h4>
      <ul
        data-decision-pillars=""
        className="m-0 mt-2 grid list-none grid-cols-1 gap-2 p-0 min-[420px]:grid-cols-2 xl:grid-cols-4"
      >
        {m.pillars.map((p) => {
          const Icon = PILLAR_ICON[p.key];
          return (
            <li
              key={p.key}
              data-decision-pillar={p.key}
              data-decision-pillar-provenance={p.provenance}
              className={cn(
                'flex min-w-0 flex-col rounded-cc-row border bg-cc-surface-muted p-3',
                p.inPlace ? 'border-cc-line' : 'border-dashed border-cc-field-border',
              )}
            >
              <span className="flex items-center gap-2 text-[12px] font-bold text-cc-ink">
                <Icon size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
                {p.title}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2">
                <CcProvenanceChip value={p.provenance} />
                {p.draft ? <CcObjectStatus value="draft" /> : null}
              </span>
              <span className="mt-2 text-[12px] leading-snug font-medium text-cc-ink">{p.line}</span>
              <a
                href={placeHref(projectId, p.place)}
                className="mt-auto pt-2 text-[12px] font-semibold text-cc-ink underline underline-offset-2"
              >
                {placeLabel(p.place)}
              </a>
            </li>
          );
        })}
      </ul>

      {/* The open conditions: one plain line each, and where each is resolved. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <h4 className={LABEL}>{wt('decision.openPoints')}</h4>
        <span data-decision-conditions-summary="" className="text-[12px] font-semibold text-cc-ink">
          {m.points.length === 0 ? wt('decision.noOpenPoints') : decisionOpenCount(m.openPoints, m.points.length)}
        </span>
      </div>
      {m.points.length > 0 ? (
        <ul data-decision-conditions="" className="m-0 mt-2 list-none space-y-2 p-0">
          {m.points.map((pt) => (
            <li
              key={pt.id}
              data-decision-condition={pt.id}
              data-decision-condition-status={pt.status}
              className="flex items-start gap-2"
            >
              {pt.done ? (
                <CircleCheck size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink" />
              ) : (
                <Circle size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
              )}
              <span className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-cc-ink">
                <span className="sr-only">{pt.done ? wt('decision.stateDone') : wt('decision.stateOpen')}: </span>
                {pt.line}
                {pt.place ? (
                  <>
                    {' '}
                    <a
                      href={placeHref(projectId, pt.place)}
                      className="text-[12px] font-semibold whitespace-nowrap text-cc-ink underline underline-offset-2"
                    >
                      {decisionResolveIn(placeLabel(pt.place))}
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The run it stands on, and whether it can be taken back. */}
      <dl className="m-0 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px]">
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-decision-binding="run" data-decision-binding-determined={view.run.value === null ? 'no' : 'yes'}>
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.analysisRun')}</dt>
          <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2">
            <CcProvenanceChip value={view.run.provenance} />
            {view.run.value !== null ? (
              <code className="text-[12px] font-medium break-all text-cc-ink-muted">{view.run.value}</code>
            ) : (
              <span className="font-medium text-cc-ink-muted">{view.run.reason}</span>
            )}
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.reversible')}</dt>
          <dd className="m-0 flex items-center gap-1" data-decision-reversible={shown.reversibility.answer}>
            <span className="font-semibold text-cc-ink">{view.reversible.answer}</span>
            <InfoPopover subject={wt('decision.reversible')} hook="decision-reversible">
              {withoutSourcePaths(view.reversible.detail)}
            </InfoPopover>
          </dd>
        </div>
      </dl>

      {m.readiness ? (
        <p
          id="decision-blocked-reason"
          data-decision-coverage-sentence=""
          className={cn('m-0 mt-3 text-[12px] leading-snug', blocked ? 'font-semibold text-cc-ink' : 'font-medium text-cc-ink-muted')}
        >
          {m.readiness}
        </p>
      ) : null}

      {moved ? (
        <p data-decision-moved="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink">
          {decisionMovedSentence(answer.draft.revision)}
        </p>
      ) : null}

      {isConfirmed && answer.stored?.confirmation ? (
        <p data-decision-confirmed-by="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink">
          {decisionConfirmedBy(answer.stored.confirmation.account, answer.stored.confirmation.at.slice(0, 10))}
        </p>
      ) : null}

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

/** Where a pillar or a condition is resolved, as a link on this page. */
function placeHref(projectId: string, place: DecisionPlace): string {
  if (place.kind === 'view') return `/project/${encodeURIComponent(projectId)}?view=${place.view}`;
  // Back to this view from the stage: a link parameter, never a stored role.
  return stageHref({ base: `/project/${encodeURIComponent(projectId)}`, path: place.path, view: THIS_VIEW });
}

function placeLabel(place: DecisionPlace): string {
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
