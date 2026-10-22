'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Check, CircleHelp, PenLine, Trash2, CheckCheck } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTextarea from '@/components/cc/Textarea';
import CcLinkButton from '@/components/cc/LinkButton';
import { CC_SEGMENTED_GROUP, ccSegmentClass } from '@/components/cc/SegmentedControl';
import { cn } from '@/lib/utils';
import { AsReadFromCode, WordedChip } from '@/components/workspace/WordedText';
import { BUSINESS_RULES_ID, useIsOwner } from '@/components/workspace/BusinessRulesEditor';
import type { SourceReading } from '@/lib/first-look';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import { explainBusinessRules, type ExplainedSentence, type RuleExplanation, type RuleSetExplanation } from '@/lib/abap/business-rule-set-explain';
import { plainWordingFor } from '@/lib/business-card';
import { editorRules, ruleEntries, type EditorRule } from '@/lib/rules-editor';
import { MAX_STATE_NOTE, type StateChoiceInput, type StateEntry } from '@/lib/process-states';
import {
  QUESTION_ANSWERS,
  RULE_QUESTIONS_ID,
  acceptAllChoices,
  answerNeedsText,
  answerProblem,
  architectureOptions,
  questionChoices,
  questionFlow,
  recommendedAnswerOf,
  targetQuestionGroups,
  type QuestionAnswer,
  type QuestionState,
  type RecommendedAnswer,
} from '@/lib/rule-questions';
import { ANSWERS_READING, NO_BUSINESS_QUESTIONS, businessAnswersOf, type BusinessAnswersReading } from '@/lib/design-business-answers';
import { recordRuleChoices } from '@/lib/rule-record-client';
import { useProcessStates } from '@/hooks/useProcessStates';
import { usePlainWording } from '@/hooks/usePlainWording';
import AskOnClick from '@/components/workspace/AskOnClick';
import { PLAIN_ON_CLICK_LABEL } from '@/lib/auto-steps';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { plainModelEnabled, rulePlainSentences, type PlainWordingRecord, type WordedSentence } from '@/lib/plain-wording';
import type { Project } from '@/lib/types';
import { itProposals, questionsAnsweredOf, questionsChangeTarget, questionsLater, questionsWithoutImpact, wt, type WorkspaceMessageKey } from '@/lib/workspace-messages';
import { engineVersionOfProject } from '@/lib/run-engine-version';

/**
 * The questions for the business — the Design tool, before Transformation
 * (owner decision 21.10.2026, the new set-up of the business rules).
 *
 * Not a list of every rule: the engine sorts each into three baskets
 * (`lib/abap/business-rule-set-explain.ts`) and asks the business only what a
 * business sets — limits and case distinctions, one question per subject, the
 * weightiest first, at most five at a time. Each is said in plain business
 * words with the value from the code ("When the amount is above 250.00 EUR,
 * the program goes on to “Request approval”. Is the limit still right?") —
 * no rule id, no impact tag, no code on top; *More about it* folds the
 * explanation, the lines and the code. Four answers; "Accept all proposals"
 * confirms the code as it stands for every open question in one click. Each
 * row frames the answer the engine recommends, with its reason under the row;
 * nothing is pre-selected (owner decision 22.10.2026). The architecture
 * options for IT — configuration or SAP standard — are no business answers:
 * they are taken in the rule register of the IT view, and Design says in one
 * line how many there are.
 *
 * Since owner decision 22.10.2026 (ADR-106) the panel stands beside the
 * Design canvas, and the open questions come in two groups: the ones that
 * change the target on top, the ones without impact on it folded
 * (`targetQuestionGroups`, the rule in `changesTarget`).
 *
 * The page hears what is answered (`onAnswers`): the solution design is
 * written only on a click, once every question has an answer, and carries the
 * answers as given requirements (`lib/design-business-answers.ts`).
 *
 * Stored as before: one need revision per answer through the `process-states`
 * route (`lib/rule-questions.ts`). The technical rules and the undetermined
 * ones stand in the rule register of the IT view, with the technical rules'
 * one click there.
 */

export { RULE_QUESTIONS_ID };

type Say = (text: string, anchor: { lineStart: number; lineEnd: number } | null) => WordedSentence;

const ANSWER_LABEL: Record<QuestionAnswer, WorkspaceMessageKey> = {
  yes: 'questions.answerYes',
  change: 'questions.answerChange',
  drop: 'questions.answerDrop',
  unsure: 'questions.answerUnsure',
};

const ANSWER_ICON: Record<QuestionAnswer, React.ReactNode> = {
  yes: <Check size={14} aria-hidden={true} />,
  change: <PenLine size={14} aria-hidden={true} />,
  drop: <Trash2 size={14} aria-hidden={true} />,
  unsure: <CircleHelp size={14} aria-hidden={true} />,
};

/** One engine sentence, reworded where a rewording held, with its first line. */
function Said({ sentence, say, mark, strong = false }: { sentence: ExplainedSentence; say: Say; mark: string; strong?: boolean }) {
  const first = sentence.anchors[0];
  const said = say(sentence.text, first ?? null);
  return (
    <p data-question-said={mark} data-question-worded={said.worded ? 'yes' : 'no'} className={strong ? 'm-0 text-[15px] leading-snug font-semibold text-cc-ink' : 'm-0 text-[13px] leading-snug font-medium text-cc-ink'}>
      {said.text}
      <WordedChip said={said} />
    </p>
  );
}

/** What stands behind a question, one fold down: each rule explained, its lines and its code. */
function MoreAboutIt({ rules, explained, say }: { rules: readonly EditorRule[]; explained: readonly RuleExplanation[]; say: Say }) {
  return (
    <div data-question-more="">
      <CcDisclosure title={wt('questions.more')}>
        <div className="flex min-w-0 flex-col gap-3">
          {explained.map((e) => {
            const rule = rules.find((r) => r.id === e.id);
            const sentences = [e.protects, ...(e.example ? [e.example] : []), ...(e.sides ? [e.sides.holds, e.sides.otherwise] : []), e.where];
            return (
              <div key={e.id} data-question-rule={e.id} className="flex min-w-0 flex-col gap-1">
                {sentences.map((s, i) => (
                  <Said key={i} sentence={s} say={say} mark={i === 0 ? 'protects' : 'detail'} />
                ))}
                <AsReadFromCode said={sentences.map((s) => say(s.text, s.anchors[0] ?? null))} />
                {rule ? (
                  <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('questions.code')}</span>
                    <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{rule.id}</code>
                    <code className="min-w-0 font-cc-mono text-[12px] font-medium break-all text-cc-ink-muted">{rule.code}</code>
                    {rule.anchors.slice(0, 3).map((a) => (
                      <CcAnchor key={a} tone="unlinked" label={`${wt('rules.sourceLine')} ${a}`}>
                        {a}
                      </CcAnchor>
                    ))}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CcDisclosure>
    </div>
  );
}

interface CardProps {
  state: QuestionState;
  explained: readonly RuleExplanation[];
  rules: readonly EditorRule[];
  owner: boolean;
  busy: boolean;
  onRecord: (choices: StateChoiceInput[]) => void;
  onCancel?: () => void;
  say: Say;
  /** The answer the engine recommends, framed in the row; never pre-selected. */
  recommended: RecommendedAnswer | null;
}

/** One question: the statement, the question, four answers; the rest one fold down. */
function QuestionCard({ state, explained, rules, owner, busy, onRecord, onCancel, say, recommended }: CardProps) {
  const { question } = state;
  const reasonId = useId();
  const [chosen, setChosen] = useState<QuestionAnswer | null>(null);
  const [text, setText] = useState('');
  const pick = (answer: QuestionAnswer) => {
    if (answer === 'yes') {
      setChosen(null);
      onRecord(questionChoices(question, 'yes', ''));
      return;
    }
    setChosen(answer);
    setText('');
  };
  const missing = chosen !== null && answerProblem(chosen, text) !== null;
  return (
    <li
      id={`question-${question.id}`}
      data-question={question.id}
      data-question-rules={question.ruleIds.join(' ')}
      data-question-answer={state.answer ?? 'none'}
      className="flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-3 sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Said sentence={question.statement} say={say} mark="statement" strong={true} />
        <p data-question-ask="" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
          {question.ask}
        </p>
        {state.answer === 'unsure' && state.text ? (
          <span data-question-asked="" className="flex flex-wrap items-center gap-2">
            <CcProvenanceChip value="not-determined" />
            <span className="text-[12px] font-semibold text-cc-ink">{wt('questions.answerUnsure')}</span>
            <span className="text-[12px] font-medium text-cc-ink">{state.text}</span>
          </span>
        ) : null}
      </div>
      {owner ? (
        <div className="flex min-w-0 flex-col gap-2">
          <span role="radiogroup" aria-label={question.ask} className={`${CC_SEGMENTED_GROUP} flex-wrap self-start`}>
            {QUESTION_ANSWERS.map((answer) => (
              <button
                key={answer}
                type="button"
                role="radio"
                aria-checked={(chosen ?? state.answer) === answer}
                aria-describedby={recommended?.answer === answer ? reasonId : undefined}
                disabled={busy}
                data-question-pick={answer}
                data-question-recommended={recommended?.answer === answer ? '' : undefined}
                onClick={() => pick(answer)}
                className={cn(ccSegmentClass((chosen ?? state.answer) === answer), recommended?.answer === answer && 'ring-2 ring-cc-brand-strong ring-inset')}
              >
                {ANSWER_ICON[answer]}
                {wt(ANSWER_LABEL[answer])}
                {recommended?.answer === answer ? (
                  <span data-question-recommended-label="" className="ml-1 rounded-full border border-current px-2 text-[11px] leading-4 font-bold tracking-[0.04em] uppercase">
                    {wt('questions.recommended')}
                  </span>
                ) : null}
              </button>
            ))}
          </span>
          {recommended ? (
            <p id={reasonId} data-question-recommended-reason={recommended.answer} className="m-0 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">
              <span className="font-semibold text-cc-ink">{wt('questions.recommendedReason')}</span> {say(recommended.reason.text, recommended.reason.anchors[0] ?? null).text}
            </p>
          ) : null}
          {chosen ? (
            <div data-question-form={chosen} className="flex max-w-xl flex-col gap-2">
              <CcTextarea
                label={chosen === 'change' ? wt('questions.newValue') : chosen === 'unsure' ? wt('questions.who') : wt('questions.dropReason')}
                required={answerNeedsText(chosen)}
                rows={2}
                maxLength={MAX_STATE_NOTE - 32}
                value={text}
                onChange={setText}
                help={chosen === 'change' ? wt('questions.newValueHelp') : chosen === 'unsure' ? wt('questions.whoHelp') : undefined}
                valueState={missing ? 'information' : undefined}
              />
              <span className="flex flex-wrap gap-2">
                <CcButton
                  variant="secondary"
                  busy={busy}
                  disabled={missing}
                  onClick={() => onRecord(questionChoices(question, chosen, text))}
                  data-question-record={chosen}
                >
                  {wt('questions.record')}
                </CcButton>
                <CcButton
                  variant="ghost"
                  onClick={() => {
                    setChosen(null);
                    onCancel?.();
                  }}
                >
                  {wt('questions.cancel')}
                </CcButton>
              </span>
            </div>
          ) : onCancel ? (
            <span>
              <CcButton variant="ghost" onClick={onCancel}>
                {wt('questions.cancel')}
              </CcButton>
            </span>
          ) : null}
        </div>
      ) : null}
      <MoreAboutIt rules={rules} explained={explained} say={say} />
    </li>
  );
}

export interface RuleQuestionsViewProps {
  explanation: RuleSetExplanation;
  entries: Readonly<Record<string, StateEntry>>;
  rules: readonly EditorRule[];
  owner: boolean;
  busy: boolean;
  error: string | null;
  recorded: boolean;
  onRecord: (choices: StateChoiceInput[]) => void;
  say: Say;
  /** Where the rule register is — the IT view of the project. */
  registerHref: string | null;
}

/** Presentational: the flow, the answered questions, and one line on IT's options. */
export function RuleQuestionsView({ explanation, entries, rules, owner, busy, error, recorded, onRecord, say, registerHref }: RuleQuestionsViewProps) {
  const flow = useMemo(() => questionFlow(explanation, entries), [explanation, entries]);
  // The open questions in two groups: the ones that change the target first (owner decision 22.10.2026).
  const groups = useMemo(() => targetQuestionGroups(explanation, entries), [explanation, entries]);
  // Taken in the rule register of the IT view; Design names how many there are.
  const options = useMemo(() => architectureOptions(explanation, entries), [explanation, entries]);
  const accept = useMemo(() => acceptAllChoices(explanation, entries), [explanation, entries]);
  const byId = useMemo(() => new Map(explanation.rules.map((r) => [r.id, r])), [explanation]);
  const [editing, setEditing] = useState<string | null>(null);
  const explainedOf = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((e): e is RuleExplanation => !!e);
  const recommendedOf = (s: QuestionState) => recommendedAnswerOf(s.question, explanation);
  // "Every question has an answer." is said once: by the strip right after the last answer, else by the line.
  const allAnsweredNow = recorded && flow.shown.length === 0;
  const percent = flow.total ? Math.round((flow.answered / flow.total) * 100) : 0;
  const record = (choices: StateChoiceInput[]) => {
    setEditing(null);
    onRecord(choices);
  };

  return (
    <div id={RULE_QUESTIONS_ID} data-rule-questions="" data-answered={flow.answered} data-total={flow.total} className="scroll-mt-24">
      <CcCard title={wt('questions.title')} count={flow.total} meta={<CcProvenanceChip value="reconstructed" />}>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink-muted">{owner ? wt('questions.lead') : wt('questions.leadReader')}</p>
          {!owner ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('questions.ownerOnly')}</p> : null}
          {flow.total === 0 ? (
            <p data-questions-none="" className="m-0 text-[13px] font-medium text-cc-ink">{wt('questions.none')}</p>
          ) : (
            <span className="flex max-w-xl items-center gap-2">
              <span
                role="progressbar"
                aria-label={questionsAnsweredOf(flow.answered, flow.total)}
                aria-valuemin={0}
                aria-valuemax={flow.total}
                aria-valuenow={flow.answered}
                className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full border border-cc-line bg-cc-surface-muted"
              >
                <span className="block h-full rounded-full bg-cc-ink motion-safe:transition-[width] motion-safe:duration-200" style={{ width: `${percent}%` }} />
              </span>
              <span data-questions-progress="" className="text-[13px] font-bold whitespace-nowrap text-cc-ink">
                {questionsAnsweredOf(flow.answered, flow.total)}
              </span>
            </span>
          )}
          {owner && accept.length > 0 && flow.shown.length > 0 ? (
            <div data-questions-accept-all="" className="flex max-w-3xl flex-col gap-1">
              <span>
                <CcButton variant="secondary" icon={<CheckCheck size={16} aria-hidden={true} />} busy={busy} onClick={() => record(accept)} data-questions-accept="">
                  {wt('questions.acceptAll')}
                </CcButton>
              </span>
              <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('questions.acceptAllNote')}</p>
            </div>
          ) : null}
          {recorded ? (
            <CcMessageStrip state="success" announce={true}>
              {allAnsweredNow ? wt('questions.allAnswered') : wt('questions.recorded')}
            </CcMessageStrip>
          ) : null}
          {error ? (
            <CcMessageStrip state="error" announce={true}>
              {error}
            </CcMessageStrip>
          ) : null}

          {/* Owner decision 22.10.2026 (3.0.21): the questions that change the
              target on top, the ones without impact on it folded
              (`targetQuestionGroups`, the rule in `changesTarget`). */}
          {groups.changing.length > 0 ? (
            <div data-questions-changing={groups.changingOpen} className="flex min-w-0 flex-col gap-2">
              <h3 data-questions-changing-title="" className="m-0 text-[14px] font-bold text-cc-ink">{questionsChangeTarget(groups.changingOpen)}</h3>
              <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('questions.changingNote')}</p>
              <ol data-questions-open="" className="m-0 flex list-none flex-col gap-3 p-0">
                {groups.changing.map((s) => (
                  <QuestionCard key={s.question.id} state={s} explained={explainedOf(s.question.ruleIds)} rules={rules} owner={owner} busy={busy} onRecord={record} say={say} recommended={recommendedOf(s)} />
                ))}
              </ol>
            </div>
          ) : null}
          {groups.quiet.length > 0 ? (
            <div data-questions-quiet={groups.quietOpen}>
              <CcDisclosure title={questionsWithoutImpact(groups.quietOpen)} level={3} defaultOpen={groups.changingOpen === 0}>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('questions.quietNote')}</p>
                  <ol data-questions-open-quiet="" className="m-0 flex list-none flex-col gap-3 p-0">
                    {groups.quiet.map((s) => (
                      <QuestionCard key={s.question.id} state={s} explained={explainedOf(s.question.ruleIds)} rules={rules} owner={owner} busy={busy} onRecord={record} say={say} recommended={recommendedOf(s)} />
                    ))}
                  </ol>
                </div>
              </CcDisclosure>
            </div>
          ) : null}
          {flow.shown.length === 0 && flow.total > 0 && !allAnsweredNow ? (
            <p data-questions-all-answered="" className="m-0 text-[13px] font-semibold text-cc-ink">{wt('questions.allAnswered')}</p>
          ) : null}
          {groups.later > 0 ? <p data-questions-later="" className="m-0 text-[12px] font-medium text-cc-ink-muted">{questionsLater(groups.later)}</p> : null}

          {flow.done.length > 0 ? (
            <div data-questions-done="">
              <CcDisclosure title={wt('questions.answeredTitle')} count={flow.done.length} level={3}>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {flow.done.map((s) =>
                    editing === s.question.id ? (
                      <QuestionCard
                        key={s.question.id}
                        state={s}
                        explained={explainedOf(s.question.ruleIds)}
                        rules={rules}
                        owner={owner}
                        busy={busy}
                        onRecord={record}
                        onCancel={() => setEditing(null)}
                        say={say}
                        recommended={recommendedOf(s)}
                      />
                    ) : (
                      <li key={s.question.id} data-question-done={s.question.id} data-question-answer={s.answer ?? 'none'} className="flex min-w-0 flex-col gap-1 border-t border-cc-line pt-2">
                        <Said sentence={s.question.statement} say={say} mark="statement" />
                        <span className="flex flex-wrap items-center gap-2">
                          <CcProvenanceChip value={s.answer === 'unsure' ? 'not-determined' : 'confirmed'} note={entries[s.question.ruleIds[0]]?.account.name} />
                          <span className="text-[12px] font-semibold text-cc-ink">{s.answer ? wt(ANSWER_LABEL[s.answer]) : ''}</span>
                          {s.text && s.answer !== 'yes' ? <span className="text-[12px] font-medium text-cc-ink">{s.text}</span> : null}
                          {owner ? (
                            <CcButton variant="ghost" onClick={() => setEditing(s.question.id)} data-question-change={s.question.id}>
                              {wt('questions.changeAnswer')}
                            </CcButton>
                          ) : null}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </CcDisclosure>
            </div>
          ) : null}

          {options.length > 0 ? (
            <p data-architecture-pointer="" data-architecture-count={options.length} className="m-0 flex flex-wrap items-center gap-2 border-t border-cc-line pt-3 text-[13px] font-medium text-cc-ink">
              {wt('questions.itPointer')}
              {registerHref ? (
                <CcLinkButton href={registerHref} variant="ghost" data-architecture-pointer-link="">
                  {itProposals(options.length)}
                </CcLinkButton>
              ) : (
                <span>{itProposals(options.length)}</span>
              )}
            </p>
          ) : null}

          <p className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
            {wt('questions.register')}
            {registerHref ? (
              <CcLinkButton href={registerHref} variant="ghost" data-questions-register="">
                {wt('questions.openRegister')}
              </CcLinkButton>
            ) : null}
          </p>
        </div>
      </CcCard>
    </div>
  );
}

/** The questions of a project's signed source, read in this browser; nothing without a source. */
export default function RuleQuestions({
  project,
  projectId,
  reading: given,
  plainWording,
  onAnswers,
}: {
  project: Project | null;
  projectId: string;
  /** A reading handed in without parsing (a rendered test). */
  reading?: SourceReading | null;
  plainWording?: PlainWordingRecord | null;
  /** Told what is answered, each time it changes — the page gates and feeds the solution design with it. */
  onAnswers?: (reading: BusinessAnswersReading) => void;
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  // The rules and their explanation are read for the engine of the project's signed run (3.0.20).
  const engineVersion = engineVersionOfProject(project);
  const owner = useIsOwner(project);
  const [read, setRead] = useState<SourceReading | null>(given ?? null);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    if (given !== undefined || !source.trim()) return;
    let cancelled = false;
    void import('@/lib/first-look').then((m) => {
      if (cancelled) return;
      try {
        setRead(m.readSource(source, engineVersion));
        setReadFailed(false);
      } catch {
        setRead(null);
        setReadFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [given, source, engineVersion]);
  const reading = given ?? read;
  const { outcome, reload } = useProcessStates(projectId, source.trim().length > 0);
  const view = outcome?.ok ? outcome.view : null;
  const entries = useMemo(() => ruleEntries(view), [view]);
  const explanation = useMemo(() => {
    if (!reading || !source) return null;
    try {
      return explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source), engineVersion);
    } catch {
      return null;
    }
  }, [reading, source, engineVersion]);
  const rules = useMemo(() => (reading ? editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton)) : []), [reading, source]);
  const availability = useModelAvailability();
  const sentences = useMemo(() => (explanation ? rulePlainSentences(explanation) : null), [explanation]);
  const wording = usePlainWording({
    projectId,
    scope: 'rules',
    source,
    sentences,
    owner,
    active: explanation !== null,
    modelEnabled: plainModelEnabled(availability),
    autoAllowed: availability.autoSteps,
    initial: plainWording ?? null,
  });
  // What the page hears: still reading, no question at all, or every question with its answer.
  const answersReading = useMemo<BusinessAnswersReading>(() => {
    if (!project) return ANSWERS_READING;
    if (!source.trim() || readFailed) return NO_BUSINESS_QUESTIONS;
    if (!reading) return ANSWERS_READING;
    if (reading.ruleSet.rules.length === 0 || !explanation) return NO_BUSINESS_QUESTIONS;
    if (explanation.questions.length === 0) return NO_BUSINESS_QUESTIONS;
    if (outcome === null) return ANSWERS_READING;
    return businessAnswersOf(explanation, entries);
  }, [project, source, readFailed, reading, explanation, outcome, entries]);
  useEffect(() => {
    onAnswers?.(answersReading);
  }, [onAnswers, answersReading]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);
  const onRecord = useCallback(
    (choices: StateChoiceInput[]) => {
      if (choices.length === 0) return;
      setBusy(true);
      setError(null);
      setRecorded(false);
      void recordRuleChoices({ projectId, view, outcome, choices })
        .then((result) => {
          if (result.ok) setRecorded(true);
          else {
            setError(result.text);
            if (result.moved) void reload();
          }
        })
        .finally(() => setBusy(false));
    },
    [projectId, view, outcome, reload],
  );

  if (!source.trim() || !reading || reading.ruleSet.rules.length === 0) return null;
  if (!explanation) return null;
  return (
    <>
    <AskOnClick askNow={wording.askNow} label={PLAIN_ON_CLICK_LABEL} />
    <RuleQuestionsView
      explanation={explanation}
      entries={entries}
      rules={rules}
      owner={owner}
      busy={busy}
      error={error}
      recorded={recorded}
      onRecord={onRecord}
      say={wording.say}
      registerHref={`/project/${encodeURIComponent(projectId)}?view=it#${BUSINESS_RULES_ID}`}
    />
    </>
  );
}
