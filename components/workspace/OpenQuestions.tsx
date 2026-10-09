'use client';

import React, { useState } from 'react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcTextarea from '@/components/cc/Textarea';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import {
  OPEN_ANSWER_MAX_CHARS,
  OPEN_QUESTIONS_ID,
  openQuestionsLine,
  type OpenQuestionAction,
  type OpenQuestionGroup,
  type OpenQuestions as OpenQuestionsModel,
  type StoredOpenAnswer,
} from '@/lib/open-questions';
import { runProjectCommand, CommandAnswerLostError } from '@/lib/project-command-client';
import { readStoredAnswer } from '@/lib/open-questions';
import type { RecordGap } from '@/lib/legacy-project';
import type { WorkspaceView } from '@/lib/workspace-model';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { BUSINESS_RULES_ID } from './BusinessRulesEditor';
import { oqAnswerBy, oqAnswerQuote, oqCount, oqLinesTitle, oqOwner, wt } from '@/lib/workspace-messages';

/** What this page wrote since the project was read; `null` for an answer it removed. */
export type OpenAnswerOverlay = Partial<Record<OpenQuestionAction, StoredOpenAnswer | null>>;

/**
 * The project's open questions — one list, grouped by the action that resolves
 * each (ADR-081). It replaces the per-view *Not determined* card and fold: the
 * engine's reason for every line stays one click deeper in each group, and
 * every other place on the page says the one line (`OpenQuestionsLine`).
 *
 * Each group: who acts on it, how many questions, whether it blocks the
 * decision, and **one** button — the place in the product that resolves it, or
 * the answer itself where the product has no input for it. Answering and
 * accepting as known open are the owner's, written through the commands route
 * (`record-open-question`); an invited reader reads the end states and writes
 * nothing. The value stays *Not determined* whatever is answered here.
 */
export default function OpenQuestions({
  questions,
  projectId,
  view,
  owner,
  hasRun,
  recorded = [],
  onAnswered,
  demo = false,
}: {
  questions: OpenQuestionsModel;
  projectId: string;
  view: WorkspaceView;
  /** The signed-in account owns the project: it may answer. */
  owner: boolean;
  /** The project has a signed run — the target is then changed in the IT view, not on Analyze. */
  hasRun: boolean;
  recorded?: readonly RecordGap[];
  onAnswered?: (action: OpenQuestionAction, answer: StoredOpenAnswer | null) => void;
  /** The demo has no project to write to and no stage to link into. */
  demo?: boolean;
}) {
  return (
    <section id={OPEN_QUESTIONS_ID} data-open-questions={questions.open} className="scroll-mt-20" aria-label={wt('oq.title')}>
      <CcCard title={wt('oq.title')} count={questions.open} meta={<CcProvenanceChip value="not-determined" />}>
        {/* The tour's "This is what we could not determine" points here, at the
            line and its lead, not at the whole list: on a phone the list is
            taller than the screen, and a sheet under it would always cover it
            (`coachTargetFor` takes the smallest target on screen). */}
        <div data-coach-target="not-determined">
          <p data-open-questions-line="" className="m-0 text-[13px] font-semibold text-cc-ink">
            {openQuestionsLine(questions)}
          </p>
          <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('oq.lead')}</p>
        </div>
        {questions.noSource ? (
          <p data-not-determined-state="no-source" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('notDetermined.noSource')}
          </p>
        ) : null}
        {!questions.noSource && questions.groups.every((g) => g.end !== 'open') && !questions.limits ? (
          <p data-not-determined-state="none" className="m-0 mt-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('oq.none')}
          </p>
        ) : null}
        <ul className="m-0 mt-3 list-none divide-y divide-cc-line p-0">
          {questions.groups.map((group) => (
            <Group
              key={group.action}
              group={group}
              projectId={projectId}
              view={view}
              owner={owner && !demo}
              hasRun={hasRun}
              demo={demo}
              onAnswered={onAnswered}
            />
          ))}
        </ul>
        {questions.limits ? (
          <p data-open-questions-limits="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {questions.limits}
          </p>
        ) : null}
        {recorded.length > 0 ? (
          <div data-not-determined-record-list="" className="mt-3">
            <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('notDetermined.recordTitle')}</p>
            <ul className="m-0 mt-1 list-none space-y-1 p-0">
              {recorded.map((gap) => (
                <li key={gap.form} data-not-determined-record={gap.form} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                  <span className="font-semibold text-cc-ink">{gap.label}</span> — {gap.why}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CcCard>
    </section>
  );
}

/** Where a group's one button leads, or `null` when the answer is the button. */
function actionHref(action: OpenQuestionAction, projectId: string, view: WorkspaceView, hasRun: boolean): string | null {
  const base = `/project/${projectId}`;
  const analyze = (add: 'usage' | 'atc') =>
    `${stageHref({ base, path: 'analyze', view, from: WORKSPACE_RETURN.tools })}&add=${add}`;
  switch (action) {
    case 'add-atc':
      return analyze('atc');
    case 'add-usage':
      return analyze('usage');
    case 'choose-target':
      // With a signed run the target is changed in the IT view (a new run);
      // before one it is part of the analysis on Analyze.
      return hasRun ? `/project/${encodeURIComponent(projectId)}?view=it` : stageHref({ base, path: 'analyze', view, from: WORKSPACE_RETURN.tools });
    case 'confirm-rules':
      return `/project/${encodeURIComponent(projectId)}?view=business#${BUSINESS_RULES_ID}`;
    default:
      return null;
  }
}

const BUTTON_WORDS: Partial<Record<OpenQuestionAction, Parameters<typeof wt>[0]>> = {
  'add-atc': 'oq.addAtc',
  'add-usage': 'oq.addUsage',
  'choose-target': 'oq.chooseTarget',
  'confirm-rules': 'oq.confirmRules',
};

function Group({
  group,
  projectId,
  view,
  owner,
  hasRun,
  demo,
  onAnswered,
}: {
  group: OpenQuestionGroup;
  projectId: string;
  view: WorkspaceView;
  owner: boolean;
  hasRun: boolean;
  demo: boolean;
  onAnswered?: (action: OpenQuestionAction, answer: StoredOpenAnswer | null) => void;
}) {
  const [form, setForm] = useState<'answered' | 'accepted' | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // An invited reader reads the end states and is sent nowhere it could only
  // be refused — except to the rules, which it may read.
  const href = demo || (!owner && group.action !== 'confirm-rules') ? null : actionHref(group.action, projectId, view, hasRun);
  const words = BUTTON_WORDS[group.action];
  const isOpen = group.end === 'open';

  const send = async (end: 'answered' | 'accepted' | 'reopen') => {
    setBusy(true);
    setError('');
    try {
      const fields = await runProjectCommand(projectId, {
        command: 'record-open-question',
        action: group.action,
        end,
        text: end === 'reopen' ? undefined : text,
        basis: end === 'reopen' ? undefined : group.basis,
      });
      const stored = (fields.openQuestions ?? {}) as Record<string, unknown>;
      onAnswered?.(group.action, readStoredAnswer(stored[group.action]));
      setForm(null);
      setText('');
    } catch (err) {
      setError(err instanceof CommandAnswerLostError ? err.message : err instanceof Error ? err.message : wt('oq.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const answerForm = form ? (
    <div data-open-question-form={form} className="mt-2 flex flex-col gap-2">
      <CcTextarea
        label={form === 'answered' ? wt('oq.answerLabel') : wt('oq.acceptLabel')}
        help={form === 'answered' ? wt('oq.answerHelp') : wt('oq.acceptHelp')}
        value={text}
        onChange={setText}
        required
        maxLength={OPEN_ANSWER_MAX_CHARS}
      />
      <div className="flex flex-wrap items-center gap-2">
        <CcButton variant="secondary" onClick={() => void send(form)} disabled={busy || text.trim().length === 0} data-open-question-save="">
          {busy ? wt('oq.saving') : form === 'answered' ? wt('oq.saveAnswer') : wt('oq.saveAccept')}
        </CcButton>
        <CcButton onClick={() => setForm(null)} disabled={busy}>
          {wt('oq.cancel')}
        </CcButton>
      </div>
      {error ? (
        <p role="alert" className="m-0 text-[12px] font-medium text-cc-error">
          {error}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <li data-open-question-group={group.action} data-open-question-end={group.end} className="py-3 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">{group.title}</h3>
        <span data-open-question-count="" className="text-[12px] font-semibold text-cc-ink-muted">
          {oqCount(group.count)}
        </span>
        <CcTag>{oqOwner(group.owner)}</CcTag>
        {isOpen && group.blocksDecision ? (
          <span data-open-question-blocks="" className="text-[12px] font-semibold text-cc-ink">
            {wt('oq.blocks')}
          </span>
        ) : null}
        {group.end === 'answered' ? <CcProvenanceChip value="confirmed" /> : null}
        {!isOpen ? (
          <span data-open-question-state="" className="text-[12px] font-semibold text-cc-ink-muted">
            {group.end === 'resolved' ? wt('oq.end.resolved') : group.end === 'answered' ? wt('oq.end.answered') : wt('oq.end.accepted')}
          </span>
        ) : null}
      </div>
      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
        {group.end === 'resolved' && group.evidence ? group.evidence : group.resolves}
      </p>
      {group.answer ? (
        <p data-open-question-answer="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">
          {oqAnswerQuote(group.answer.text)}{' '}
          <span className="text-cc-ink-muted">{oqAnswerBy(group.answer.account, group.answer.at.slice(0, 10))}</span>
        </p>
      ) : null}
      {group.catalogPending ? (
        <p data-open-question-catalog-pending="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {wt('oq.catalogPending')}
        </p>
      ) : null}
      {isOpen && group.outdated ? (
        <p data-open-question-outdated="" className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {wt('oq.outdated')}
        </p>
      ) : null}

      {isOpen && !form ? (
        <div className="cc-no-print mt-2 flex flex-wrap items-center gap-3">
          {href && words ? (
            <CcLinkButton href={href} data-open-question-action={group.action}>
              {wt(words)}
            </CcLinkButton>
          ) : owner ? (
            <CcButton onClick={() => setForm('answered')} data-open-question-action={group.action}>
              {wt('oq.answer')}
            </CcButton>
          ) : null}
        </div>
      ) : null}
      {isOpen && owner && href && !form ? (
        <div className="cc-no-print mt-1">
          <CcDisclosure title={wt('oq.answerOrAccept')}>
            <div className="flex flex-wrap gap-2">
              <CcButton onClick={() => setForm('answered')} data-open-question-answer-open="">
                {wt('oq.answer')}
              </CcButton>
              <CcButton onClick={() => setForm('accepted')} data-open-question-accept-open="">
                {wt('oq.saveAccept')}
              </CcButton>
            </div>
          </CcDisclosure>
        </div>
      ) : null}
      {isOpen && owner && !href && !form ? (
        <p className="cc-no-print m-0 mt-1">
          <button
            type="button"
            onClick={() => setForm('accepted')}
            data-open-question-accept-open=""
            className="inline-flex min-h-6 items-center text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
          >
            {wt('oq.saveAccept')}
          </button>
        </p>
      ) : null}
      {answerForm}
      {(group.end === 'answered' || group.end === 'accepted') && owner ? (
        <p className="cc-no-print m-0 mt-1">
          <button
            type="button"
            onClick={() => void send('reopen')}
            disabled={busy}
            data-open-question-reopen=""
            className="inline-flex min-h-6 items-center text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
          >
            {wt('oq.reopen')}
          </button>
        </p>
      ) : null}

      {group.lines.length > 0 ? (
        <div className="mt-1">
          <CcDisclosure title={oqLinesTitle(group.lines.length)}>
            <ul className="m-0 list-none space-y-2 p-0">
              {group.lines.map((line, i) => (
                <li key={`${line.anchor ?? line.label}-${i}`} data-not-determined-item="" className="text-[12px] leading-snug">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-cc-ink">{line.label}</span>
                    {line.anchor ? (
                      <CcAnchor label={`${wt('notDetermined.sourceLine')} ${line.anchor}`}>{line.anchor}</CcAnchor>
                    ) : null}
                  </span>
                  {line.catalog ? (
                    <span data-open-question-catalog={line.catalog.state} className="block font-medium text-cc-ink-muted">
                      <span className="font-semibold text-cc-ink">{wt('oq.catalogAnswered')}</span> {line.catalog.answer}
                    </span>
                  ) : (
                    <span className="block font-medium text-cc-ink-muted">{line.why}</span>
                  )}
                </li>
              ))}
            </ul>
          </CcDisclosure>
        </div>
      ) : null}
    </li>
  );
}
