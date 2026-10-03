'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTextarea from '@/components/cc/Textarea';
import { cn } from '@/lib/utils';
import { DecisionGroup, RuleName, RuleSentence, ValueSourceFields } from '@/components/workspace/BusinessRulesEditor';
import { MAX_STATE_NOTE, noteRequired, valueSourceAllowed } from '@/lib/process-states';
import { draftProblems, isConfirmedState, type EditorRule, type RuleDraft } from '@/lib/rules-editor';
import {
  wt,
  rulesAnsweredOf,
  rulesAttention,
  rulesConfirmedOf,
  rulesDeviates,
  rulesRecordAnswers,
  rulesRecordedWord,
  rulesValueSourceLine,
} from '@/lib/workspace-messages';

/**
 * The demo's business rules — the same answers the product asks for
 * (owner, 03.10.2026: "the demo must match the product").
 *
 * Reading and deciding are the product's: the rule's name, its sentence and
 * lines, and per rule the four radio cards Keep · Change deliberately · Drop ·
 * Clarify (`DecisionGroup` from `BusinessRulesEditor`), nothing pre-selected.
 * Change needs its new text and where the new value comes from, Drop its
 * reason, Clarify its question — the same `draftProblems` the product checks
 * before it records. Clarify stays open and is not counted as confirmed.
 *
 * What differs is where an answer goes: a demo has no signed run and no
 * account to record against, so "Record answers" keeps the answers in this
 * browser (the demo's storage key) and nowhere else — never in Firestore, and
 * "Reset demo" throws them away.
 */
export default function DemoRulesCard({
  rules,
  answers,
  editing,
  onEditingChange,
  onRecord,
}: {
  rules: readonly EditorRule[];
  /** The answers recorded in this browser, by rule id. */
  answers: RuleDraft;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRecord: (answers: RuleDraft) => void;
}) {
  const isOpen = (id: string) => {
    const state = answers[id]?.state;
    return !state || !isConfirmedState(state);
  };
  const confirmed = rules.filter((r) => !isOpen(r.id)).length;
  const allDone = rules.length > 0 && confirmed === rules.length;

  if (editing) {
    return (
      <Answering
        rules={rules}
        answers={answers}
        // Fixed when the answering opens — rules without an answer first — so nothing jumps.
        order={[...rules.filter((r) => isOpen(r.id)), ...rules.filter((r) => !isOpen(r.id))].map((r) => r.id)}
        onClose={() => onEditingChange(false)}
        onRecord={onRecord}
      />
    );
  }

  const openRules = rules.filter((r) => isOpen(r.id));
  const answered = rules.filter((r) => !isOpen(r.id));
  const row = (rule: EditorRule, unanswered: boolean) => {
    const entry = answers[rule.id];
    return (
      <li
        key={rule.id}
        data-demo-rule={rule.id}
        data-demo-rule-answer={entry?.state ?? 'none'}
        className={cn(
          'grid min-w-0 grid-cols-1 gap-2 border-t border-cc-line py-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,220px)] sm:gap-4',
          unanswered ? 'border-l-4 border-l-cc-warning-line pl-3' : 'pl-4',
        )}
      >
        <RuleName rule={rule} />
        <RuleSentence rule={rule} />
        {entry?.state ? (
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              {isConfirmedState(entry.state) ? (
                <CcProvenanceChip value="confirmed" note={wt('demo.thisBrowser')} />
              ) : (
                <CcProvenanceChip value="not-determined" />
              )}
              <span className="text-[12px] font-semibold text-cc-ink">{rulesRecordedWord(entry.state)}</span>
            </span>
            {entry.note ? <span className="text-[12px] leading-snug font-medium text-cc-ink">{entry.note}</span> : null}
            {entry.sourceKind ? (
              <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">
                {rulesValueSourceLine(entry.sourceKind, entry.sourceNote?.trim() || null)}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <CcProvenanceChip value="reconstructed" />
            <span className="text-[12px] font-semibold text-cc-ink">{wt('rules.noAnswer')}</span>
          </span>
        )}
      </li>
    );
  };
  return (
    <CcCard
      title={wt('rules.title')}
      count={rules.length}
      meta={<CcProvenanceChip value="reconstructed" />}
      actions={
        <CcButton
          variant={allDone ? 'ghost' : 'secondary'}
          icon={<PenLine size={16} aria-hidden={true} />}
          onClick={() => onEditingChange(true)}
          data-demo-rules-edit={allDone ? 'review' : 'decide'}
        >
          {allDone ? wt('rules.review') : wt('rules.edit')}
        </CcButton>
      }
    >
      <p data-demo-rules-confirmed="" className="m-0 mb-3 text-[13px] font-medium text-cc-ink-muted">
        {rulesConfirmedOf(confirmed, rules.length)} {wt('rules.meaning')} {wt('demo.rulesThisBrowser')}
      </p>
      {openRules.length > 0 && answered.length > 0 ? (
        <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          {wt('rules.openFirst')} ({openRules.length})
        </p>
      ) : null}
      <ul data-demo-rules="" className="m-0 flex list-none flex-col p-0">
        {openRules.map((rule) => row(rule, true))}
      </ul>
      {openRules.length > 0 && answered.length > 0 ? (
        <p className="m-0 mt-3 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
          {wt('rules.answeredGroup')} ({answered.length})
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col p-0">{answered.map((rule) => row(rule, false))}</ul>
    </CcCard>
  );
}

/** The answering mode — the product's "Decide on the business rules", kept in this browser. */
function Answering({
  rules,
  answers,
  order,
  onClose,
  onRecord,
}: {
  rules: readonly EditorRule[];
  answers: RuleDraft;
  order: readonly string[];
  onClose: () => void;
  onRecord: (answers: RuleDraft) => void;
}) {
  // The draft starts from what this browser holds.
  const [draft, setDraft] = useState<RuleDraft>(answers);
  const [attempted, setAttempted] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    editRef.current?.focus();
  }, []);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const setEntry = (id: string, patch: Partial<RuleDraft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], state: d[id]?.state ?? null, note: d[id]?.note ?? '', ...patch } }));

  const record = () => {
    setAttempted(true);
    if (problems.length > 0) return;
    const kept: RuleDraft = {};
    for (const [id, entry] of Object.entries(draft)) if (entry.state) kept[id] = { ...entry, note: entry.note.trim() };
    onRecord(kept);
    onClose();
  };

  const answeredCount = rules.filter((r) => draft[r.id]?.state).length;
  const ordered = order
    .map((id) => rules.find((r) => r.id === id))
    .filter((r): r is EditorRule => !!r);
  const firstProblem = problems[0] ?? null;
  const changed = rules.filter((r) => {
    const a = answers[r.id];
    const d = draft[r.id];
    return (d?.state ?? null) !== (a?.state ?? null) || (d?.note ?? '').trim() !== (a?.note ?? '') || (d?.sourceKind ?? '') !== (a?.sourceKind ?? '');
  }).length;

  return (
    <div ref={editRef} tabIndex={-1} data-demo-rules-editor="" aria-label={wt('rules.editingTitle')} className="flex min-w-0 flex-col gap-4">
      <CcCard
        level={2}
        title={wt('rules.editingTitle')}
        meta={<CcProvenanceChip value="reconstructed" />}
        actions={
          <span aria-live="polite" data-demo-rules-progress="" className="text-[13px] font-bold text-cc-ink">
            {rulesAnsweredOf(answeredCount, rules.length)}
          </span>
        }
      >
        <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">{wt('rules.lead')}</p>
        <p className="m-0 mt-1 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('demo.rulesThisBrowser')}</p>
        {attempted && firstProblem ? (
          <div className="mt-3">
            <CcMessageStrip state="error" announce={true}>
              {rulesAttention(problems.length, firstProblem.ruleId)}
            </CcMessageStrip>
          </div>
        ) : null}
        <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
          {ordered.map((rule) => {
            const entry = draft[rule.id] ?? { state: null, note: '' };
            const problem = problems.find((p) => p.ruleId === rule.id) ?? null;
            const needsNote = entry.state ? noteRequired(entry.state) || entry.state === 'clarify' : false;
            const fieldError = attempted && problem !== null && problem.kind !== 'source-missing';
            const sourceError = attempted && problem?.kind === 'source-missing';
            return (
              <li
                key={rule.id}
                data-demo-rule-edit={rule.id}
                data-rule-state={entry.state ?? 'untouched'}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-cc-card border bg-cc-surface p-3 sm:p-4',
                  entry.state ? 'border-cc-line' : 'border-cc-line border-l-4 border-l-cc-warning-line',
                )}
              >
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-4">
                  <RuleName rule={rule} />
                  <RuleSentence rule={rule} />
                </div>
                <DecisionGroup rule={rule} value={entry.state} onChange={(state) => setEntry(rule.id, { state })} />
                {entry.state && entry.state !== 'keep' ? (
                  <CcTextarea
                    label={entry.state === 'change' ? wt('rules.newText') : entry.state === 'drop' ? wt('rules.dropReason') : wt('rules.question')}
                    required={needsNote}
                    rows={2}
                    maxLength={MAX_STATE_NOTE}
                    value={entry.note}
                    onChange={(note) => setEntry(rule.id, { note })}
                    placeholder={entry.state === 'drop' ? wt('rules.dropPlaceholder') : undefined}
                    help={entry.state === 'change' ? wt('rules.newTextHelp') : undefined}
                    valueState={fieldError ? 'error' : entry.state === 'change' && entry.note.trim() ? 'warning' : entry.state === 'clarify' ? 'information' : undefined}
                    message={
                      fieldError
                        ? entry.state === 'drop'
                          ? wt('rules.dropMissing')
                          : entry.state === 'clarify'
                            ? wt('rules.clarifyMissing')
                            : wt('rules.changeMissing')
                        : entry.state === 'change' && entry.note.trim()
                          ? rulesDeviates(rule.anchors[0] ?? null)
                          : entry.state === 'clarify'
                            ? wt('rules.clarifyInfo')
                            : undefined
                    }
                  />
                ) : null}
                {entry.state && valueSourceAllowed(entry.state) ? (
                  <ValueSourceFields
                    rule={rule}
                    rules={rules}
                    entry={entry}
                    state={entry.state}
                    error={sourceError}
                    onChange={(patch) => setEntry(rule.id, patch)}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </CcCard>
      <div className="sticky bottom-0 z-cc-sticky flex flex-wrap items-center gap-x-3 gap-y-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
        <span className="text-[12px] font-medium text-cc-ink-muted">{wt('demo.rulesThisBrowser')}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <CcButton variant="ghost" onClick={onClose} data-demo-rules-discard="">
            {wt('rules.discard')}
          </CcButton>
          <CcButton variant="primary" disabled={changed === 0 && problems.length === 0} onClick={record} data-demo-rules-record="">
            {rulesRecordAnswers(changed)}
          </CcButton>
        </span>
      </div>
    </div>
  );
}
