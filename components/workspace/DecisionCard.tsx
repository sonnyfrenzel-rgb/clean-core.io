'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { getAuth } from '@/lib/firebase';
import { CommandAnswerLostError, runProjectCommand } from '@/lib/project-command-client';
import { CONDITION_STATUS_LABEL, decisionCardView, type CardBinding } from '@/lib/decision-card';
import type { ProjectDecision, DecisionConfirmation, DecisionStatus } from '@/lib/project-decision';
import type { ObjectStatusValue } from '@/lib/object-status';
import {
  wt,
  decisionConfirmedBy,
  decisionConfirmsLine,
  decisionConfirmTitle,
  decisionDeriveFailed,
  decisionLatest,
  decisionMovedSentence,
  decisionShowConditions,
  decisionTimelineTitle,
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
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);

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

  if (load.state === 'failed' || !view || !shown || !answer) {
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

  return (
    <div data-decision-card="" data-decision-status={shown.status} data-decision-coverage={view.coverage.state}>
      <CcCard
        title={wt('decision.title')}
        meta={
          <>
            <code data-decision-identity="" className="text-[12px] font-medium text-cc-ink-muted">
              {view.identity}
            </code>
            <CcObjectStatus value={STATUS_OF[shown.status]} />
          </>
        }
        actions={
          answer.canDecide ? (
            isConfirmed ? (
              <CcButton onClick={() => setAsking('withdraw')} disabled={busy} data-decision-withdraw="">
                {wt('decision.withdrawEllipsis')}
              </CcButton>
            ) : (
              <CcButton
                variant="primary"
                onClick={() => setAsking('confirm')}
                disabled={busy || !view.confirmable}
                aria-describedby={view.confirmable ? undefined : 'decision-blocked-reason'}
                data-decision-confirm=""
              >
                {wt('decision.confirmEllipsis')}
              </CcButton>
            )
          ) : null
        }
      >
        <p data-decision-summary="" className="m-0 text-[14px] leading-snug font-semibold text-cc-ink">
          {view.summary}
        </p>

        <dl className="m-0 mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.binds')}</dt>
          <dd className="m-0 min-w-0">
            <ul data-decision-binds="" className="m-0 list-none space-y-1 p-0">
              {view.bindings.map((b) => (
                <Binding key={b.key} binding={b} />
              ))}
            </ul>
          </dd>
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.run')}</dt>
          <dd className="m-0 min-w-0">
            <ul className="m-0 list-none p-0">
              <Binding binding={view.run} />
            </ul>
          </dd>
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.reversible')}</dt>
          <dd className="m-0 min-w-0" data-decision-reversible={shown.reversibility.answer}>
            <span className="font-semibold text-cc-ink">{view.reversible.answer}</span>
            <span className="mt-0.5 block text-[12px] leading-snug font-medium text-cc-ink-muted">
              {view.reversible.detail}
            </span>
          </dd>
          <dt className="font-semibold text-cc-ink-muted">{wt('decision.conditions')}</dt>
          <dd className="m-0 min-w-0">
            <span data-decision-conditions-summary="" className="font-medium text-cc-ink">
              {view.conditionsSummary}
            </span>
            {view.conditions.length > 0 ? (
              <span className="ml-2 inline-block">
                <CcButton
                  variant="ghost"
                  onClick={() => setConditionsOpen((v) => !v)}
                  aria-expanded={conditionsOpen}
                  aria-controls="decision-conditions"
                  data-decision-conditions-toggle=""
                >
                  {conditionsOpen ? wt('decision.hideConditions') : decisionShowConditions(view.conditions.length)}
                  <ChevronDown size={14} aria-hidden={true} />
                </CcButton>
              </span>
            ) : null}
            {conditionsOpen ? (
              <ul id="decision-conditions" data-decision-conditions="" className="m-0 mt-2 list-none space-y-1.5 p-0">
                {view.conditions.map((c) => (
                  <li
                    key={c.id}
                    data-decision-condition={c.id}
                    className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-[12px] font-semibold text-cc-ink">{c.id}</code>
                      <span data-decision-condition-status={c.status} className="text-[12px] font-semibold text-cc-ink">
                        {CONDITION_STATUS_LABEL[c.status]}
                      </span>
                      <span className="text-[12px] font-medium text-cc-ink-muted">
                        {c.statusBasis === 'derived' ? wt('decision.fromEvidence') : wt('decision.statedByAccount')}
                      </span>
                      <CcProvenanceChip value={c.provenance} />
                    </div>
                    <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{c.text}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </dl>

        {view.coverage.state !== 'clear' ? (
          <p
            id="decision-blocked-reason"
            data-decision-coverage-sentence=""
            className="m-0 mt-2.5 text-[12px] leading-snug font-medium text-cc-ink-muted"
          >
            {view.coverage.state === 'blocked' ? wt('decision.cannotConfirmYet') : wt('decision.qualified')}{' '}
            {view.coverage.sentence}
          </p>
        ) : null}

        {moved ? (
          <p data-decision-moved="" className="m-0 mt-2.5 text-[12px] leading-snug font-medium text-cc-ink">
            {decisionMovedSentence(answer.draft.revision)}
          </p>
        ) : null}

        {isConfirmed && answer.stored?.confirmation ? (
          <p data-decision-confirmed-by="" className="m-0 mt-2.5 text-[12px] leading-snug font-medium text-cc-ink">
            {decisionConfirmedBy(answer.stored.confirmation.account, answer.stored.confirmation.at.slice(0, 10))}
          </p>
        ) : null}

        <p data-decision-self-declaration="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {view.selfDeclaration}
        </p>

        {refusal ? (
          <div className="mt-2.5" data-decision-refusal="">
            <CcMessageStrip state="error" headline={refusal.headline} announce={true}>
              {refusal.sentence}
            </CcMessageStrip>
          </div>
        ) : null}

        {/* The timeline — folded, as the mockup folds it. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cc-line pt-2.5">
          <h4 className="m-0 text-[13px] font-bold text-cc-ink">{decisionTimelineTitle(shown.timeline.length)}</h4>
          {shown.timeline.length > 0 ? (
            <span className="text-[12px] font-medium text-cc-ink-muted">
              {decisionLatest(shown.timeline[shown.timeline.length - 1].at.slice(0, 10))}
            </span>
          ) : null}
          {shown.timeline.length > 0 ? (
            <span className="ml-auto">
              <CcButton
                variant="ghost"
                onClick={() => setTimelineOpen((v) => !v)}
                aria-expanded={timelineOpen}
                aria-controls="decision-timeline"
                data-decision-timeline-toggle=""
              >
                {timelineOpen ? wt('decision.hide') : wt('decision.show')}
                <ChevronDown size={14} aria-hidden={true} />
              </CcButton>
            </span>
          ) : null}
        </div>
        {timelineOpen ? (
          <ol id="decision-timeline" data-decision-timeline="" className="m-0 mt-2 list-none space-y-1 p-0">
            {shown.timeline.map((entry, i) => (
              <li key={`${entry.at}-${entry.kind}-${i}`} className="text-[12px] leading-snug font-medium text-cc-ink">
                <code className="text-cc-ink-muted">{entry.at.slice(0, 10)}</code> {entry.sentence}
                {entry.account ? <span className="text-cc-ink-muted"> · {entry.account}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </CcCard>

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

/** One binding: what is bound, or *not determined* with its reason. */
function Binding({ binding }: { binding: CardBinding }) {
  return (
    <li data-decision-binding={binding.key} data-decision-binding-determined={binding.value === null ? 'no' : 'yes'}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-cc-ink-muted">{binding.label}</span>
        {binding.value === null ? (
          <span className="font-semibold text-cc-ink-muted">{wt('decision.notDetermined')}</span>
        ) : (
          <code className="font-semibold text-cc-ink">{binding.value}</code>
        )}
        <CcProvenanceChip value={binding.provenance} />
      </span>
      {binding.value === null ? (
        <span className="mt-0.5 block text-[12px] leading-snug font-medium text-cc-ink-muted">{binding.reason}</span>
      ) : binding.note ? (
        <span className="mt-0.5 block text-[12px] leading-snug font-medium text-cc-ink-muted">{binding.note}</span>
      ) : null}
    </li>
  );
}
