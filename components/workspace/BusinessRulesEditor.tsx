'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, PenLine } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcMessagePopover, { type CcCheckMessage } from '@/components/cc/MessagePopover';
import CcTextarea from '@/components/cc/Textarea';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcDateText from '@/components/cc/DateText';
import CcLinkButton from '@/components/cc/LinkButton';
import CcSelect from '@/components/cc/Select';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField from '@/components/cc/Field';
import { CcRulePropertyTag } from '@/components/cc/Tag';
import { CC_SEGMENTED_GROUP, ccSegmentClass } from '@/components/cc/SegmentedControl';
import { getAuth } from '@/lib/firebase';
import { plainWordingFor } from '@/lib/business-card';
import type { SourceReading } from '@/lib/first-look';
import {
  ELEMENT_STATES,
  MAX_STATE_NOTE,
  MAX_VALUE_SOURCE_NOTE,
  VALUE_SOURCE_KINDS,
  noteRequired,
  valueSourceAllowed,
  valueSourceRequired,
  type ValueSourceKind,
  type ElementState,
  type StateEntry,
} from '@/lib/process-states';
import { confirmOutcomeSentence, confirmProcessStates } from '@/lib/process-states-client';
import { ensureProcessBaseline } from '@/lib/process-revisions-client';
import {
  draftChecks,
  draftChoices,
  draftFrom,
  draftProblems,
  draftSummary,
  editorRules,
  isConfirmedState,
  ruleEntries,
  rulesConfirmed,
  type EditorRule,
  type RuleDraft,
} from '@/lib/rules-editor';
import { publishProcessStates, useProcessStates } from '@/hooks/useProcessStates';
import type { Project } from '@/lib/types';
import {
  wt,
  rulesAttention,
  rulesConfirmedOf,
  rulesDecisionLabel,
  rulesDeviates,
  rulesNotSaved,
  rulesSaveAs,
  rulesSavingCreates,
  rulesReadRefusal,
  rulesUnchangedLine,
  rulesUnsaved,
  rulesValueSourceLabel,
  rulesValueSourceLine,
  rulesAppliesToLine,
} from '@/lib/workspace-messages';

/**
 * The business rules of the source and the one editing mode for them —
 * *Need & process*, mockup screens `s1` (collapsed row) and `s2` (editing).
 *
 * **Reading.** Every rule the engine found hard-coded in the program, in plain
 * words with its line, and what has been said about it: *Reconstructed* until
 * somebody answers, then *Confirmed · name* with the answer and the date. The
 * plain sentence is `lib/business-card.ts`'s deterministic wording; the code it
 * was read from stays one line under it.
 *
 * **Editing** (owner only — the route refuses everybody else, and the button is
 * not offered to them). Keep · Change deliberately · Drop · Clarify per rule,
 * nothing pre-selected; Change and Drop need a reason; the draft is saved as
 * one new need revision through `POST /api/projects/{id}/process-states`,
 * which writes through the Admin SDK into a subcollection no client rule
 * reaches. No `firestore.rules` change. Revision 1 — the reconstructed as-is process —
 * and the signed run are never touched: a confirmation is a self-declaration of
 * the signed-in account, not evidence.
 *
 * **Checks are hints, not blocks** (`DESIGN.md` §2.7): where a confirmed need
 * and the code would now disagree, from the links the route hands out. Only a
 * missing reason stops a save, with a strip that says which field and that
 * nothing was lost.
 */

/** The event the first look's "Confirm the rules" sends; heard here. */
export const EDIT_RULES_EVENT = 'cc:edit-rules';

/**
 * Asked for by the first look's "Confirm the rules": the editor may not be
 * mounted yet (the layer is opened by the same click), so the request is held
 * until an editor picks it up, as well as announced to one that is there.
 */
let pendingEdit = false;
export function requestRuleEditing(): void {
  pendingEdit = true;
  window.dispatchEvent(new Event(EDIT_RULES_EVENT));
}

export function useIsOwner(project: Project | null): boolean {
  // The signed-in account is the browser's; on the server there is none, so
  // the server snapshot says "not the owner" and nothing is offered there.
  const uid = useSyncExternalStore(
    (listener) => getAuth().onAuthStateChanged(() => listener()),
    () => getAuth().currentUser?.uid ?? null,
    () => null,
  );
  return !!uid && typeof project?.userId === 'string' && project.userId === uid;
}

function Anchors({ anchors }: { anchors: readonly string[] }) {
  return (
    <>
      {anchors.slice(0, 3).map((anchor) => (
        <CcAnchor key={anchor} tone="unlinked" label={`${wt('rules.sourceLine')} ${anchor}`}>
          {anchor}
        </CcAnchor>
      ))}
    </>
  );
}

/** The rule's name, its id and its property — the left column of a row. */
function RuleName({ rule }: { rule: EditorRule }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className={rule.titleIsCode ? 'font-cc-mono text-[13px] font-bold text-cc-ink' : 'text-[13px] font-bold text-cc-ink'}>
        {rule.title}
      </span>
      <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{rule.id}</code>
      <CcRulePropertyTag value="hard-coded" />
    </div>
  );
}

/** The rule in plain words, and its lines. */
function RuleSentence({ rule }: { rule: EditorRule }) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug font-medium text-cc-ink">
      {rule.sentence ? (
        <span>{rule.sentence}</span>
      ) : (
        <code className="font-cc-mono text-[12px] font-medium text-cc-ink">{rule.code}</code>
      )}
      <Anchors anchors={rule.anchors} />
    </p>
  );
}

/** What is on record for one rule, in the reading mode. */
function RuleRecord({ entry }: { entry: StateEntry | undefined }) {
  if (!entry) {
    return (
      <span data-rule-record="none" className="flex flex-wrap items-center gap-2">
        <CcProvenanceChip value="reconstructed" />
        <span className="text-[12px] font-medium text-cc-ink-muted">{wt('rules.notAnswered')}</span>
      </span>
    );
  }
  return (
    <span data-rule-record={entry.state} className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        {isConfirmedState(entry.state) ? (
          <CcProvenanceChip value="confirmed" note={entry.account.name} />
        ) : (
          <CcProvenanceChip value="not-determined" />
        )}
        <span className="text-[12px] font-semibold text-cc-ink">{rulesDecisionLabel(entry.state)}</span>
        <span className="text-[12px] font-medium text-cc-ink-muted">
          <CcDateText value={entry.confirmedAt} format="text" />
        </span>
      </span>
      {entry.note ? <span className="text-[12px] leading-snug font-medium text-cc-ink">{entry.note}</span> : null}
      {entry.valueSource ? (
        <span data-rule-record-source={entry.valueSource.kind} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
          {rulesValueSourceLine(entry.valueSource.kind, entry.valueSource.note)}
        </span>
      ) : null}
      {entry.appliesTo && entry.appliesTo.length > 0 ? (
        <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">
          {rulesAppliesToLine(entry.appliesTo)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Where the value comes from, and the other rules of the same subject the
 * answer also applies to — mockup `s2` ("Where the tolerance comes from",
 * "Limit source", "Also applies to"). Keep and Change only. The source is the
 * account's statement about where the business keeps the value, not a reading
 * of the code, so nothing here is pre-filled from the engine.
 */
function ValueSourceFields({
  rule,
  rules,
  entry,
  state,
  error,
  onChange,
}: {
  rule: EditorRule;
  rules: readonly EditorRule[];
  entry: RuleDraft[string];
  state: ElementState;
  error: boolean;
  onChange: (patch: Partial<RuleDraft[string]>) => void;
}) {
  const required = valueSourceRequired(state);
  const siblings = rule.siblings
    .map((id) => rules.find((r) => r.id === id))
    .filter((r): r is EditorRule => !!r);
  const applies = entry.appliesTo ?? [];
  return (
    <div data-rule-value-source={rule.id} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <CcSelect<ValueSourceKind>
          label={state === 'change' ? wt('rules.sourceNew') : wt('rules.source')}
          required={required}
          placeholder={wt('rules.sourcePlaceholder')}
          value={entry.sourceKind ?? ''}
          onChange={(sourceKind) => onChange({ sourceKind })}
          options={VALUE_SOURCE_KINDS.map((kind) => ({ value: kind, label: rulesValueSourceLabel(kind) }))}
          valueState={error ? 'error' : entry.sourceKind === 'unknown' ? 'information' : undefined}
          message={error ? wt('rules.sourceMissing') : entry.sourceKind === 'unknown' ? wt('rules.sourceUnknown') : undefined}
        />
        {entry.sourceKind ? (
          <CcField label={wt('rules.sourceNote')} help={wt('rules.sourceNoteHelp')}>
            {(control) => (
              <input
                id={control.id}
                aria-describedby={control.describedBy}
                maxLength={MAX_VALUE_SOURCE_NOTE}
                value={entry.sourceNote ?? ''}
                onChange={(event) => onChange({ sourceNote: event.target.value })}
                data-rule-source-note={rule.id}
                className={control.className}
              />
            )}
          </CcField>
        ) : null}
      </div>
      {siblings.length > 0 ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
          <legend className="mb-1 p-0 text-[13px] font-semibold text-cc-ink">{wt('rules.appliesTo')}</legend>
          {siblings.map((s) => (
            <CcCheckbox
              key={s.id}
              label={`${s.title} · ${s.id}`}
              checked={applies.includes(s.id)}
              data-rule-applies-to={s.id}
              onChange={(checked) =>
                onChange({ appliesTo: checked ? [...applies, s.id] : applies.filter((id) => id !== s.id) })
              }
            />
          ))}
          <span className="text-[12px] font-medium text-cc-ink-muted">{wt('rules.appliesToHelp')}</span>
        </fieldset>
      ) : null}
    </div>
  );
}

/** Keep · Change deliberately · Drop · Clarify — an empty group is allowed (nothing pre-selected). */
function DecisionGroup({
  rule,
  value,
  onChange,
}: {
  rule: EditorRule;
  value: ElementState | null;
  onChange: (state: ElementState) => void;
}) {
  const move = (delta: number) => {
    const index = value ? ELEMENT_STATES.indexOf(value) : -1;
    const next = ELEMENT_STATES[(index + delta + ELEMENT_STATES.length) % ELEMENT_STATES.length];
    onChange(next);
  };
  return (
    <span
      role="radiogroup"
      aria-label={`${wt('rules.decisionFor')} ${rule.title}`}
      data-rule-decision={rule.id}
      className={`${CC_SEGMENTED_GROUP} flex-wrap self-start`}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {ELEMENT_STATES.map((state, index) => {
        const selected = value === state;
        return (
          <button
            key={state}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (value === null && index === 0) ? 0 : -1}
            data-rule-option={state}
            data-rule-option-on={selected ? 'yes' : 'no'}
            onClick={() => onChange(state)}
            className={ccSegmentClass(selected)}
          >
            {selected ? <Check size={12} aria-hidden={true} /> : null}
            {rulesDecisionLabel(state)}
          </button>
        );
      })}
    </span>
  );
}

export default function BusinessRulesEditor({
  project,
  projectId,
  reading,
}: {
  project: Project | null;
  projectId: string;
  /** The first look's reading of the source — the same rule set, not a second parse. */
  reading: SourceReading | null;
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const owner = useIsOwner(project);
  const { outcome, reload } = useProcessStates(projectId, source.trim().length > 0);
  const view = outcome?.ok ? outcome.view : null;

  const rules = useMemo(
    () => (reading ? editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton)) : []),
    [reading, source],
  );
  const entries = useMemo(() => ruleEntries(view), [view]);
  const counted = useMemo(() => rulesConfirmed(view), [view]);

  const [editing, setEditing] = useState(false);
  // `null` is "what is on record": the draft starts there and Discard returns there.
  const [held, setDraft] = useState<RuleDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<{ state: 'success' | 'error'; text: string } | null>(null);
  const editRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback(async () => {
    setNotice(null);
    if (outcome && !outcome.ok && outcome.code === 'no-baseline') {
      // The need is stated about the reconstructed as-is process, which exists only once
      // the server has rebuilt it from the signed run. Asking for it here is
      // the same call the process map makes on open; it never rebuilds an
      // existing revision 1.
      setPreparing(true);
      const built = await ensureProcessBaseline(projectId);
      setPreparing(false);
      if (!built.ok) {
        setNotice({ state: 'error', text: wt('rules.noBaseline') });
        return;
      }
      await reload();
    }
    setDraft(null);
    setEditing(true);
  }, [outcome, projectId, reload]);

  const draft = useMemo(() => held ?? draftFrom(rules, entries), [held, rules, entries]);

  // "Confirm the rules" in the first look lands here.
  useEffect(() => {
    const onEdit = () => {
      // Held until the owner is known and the record has been read.
      if (!owner || outcome === null) return;
      pendingEdit = false;
      void startEditing();
      document.getElementById('need')?.scrollIntoView({ block: 'start' });
    };
    if (pendingEdit) onEdit();
    window.addEventListener(EDIT_RULES_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_RULES_EVENT, onEdit);
  }, [owner, startEditing, outcome]);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const choices = useMemo(() => draftChoices(draft, entries), [draft, entries]);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const summary = useMemo(() => draftSummary(rules, draft), [rules, draft]);
  const elementName = useCallback(
    (id: string) => view?.subjects.find((s) => s.kind === 'element' && s.subject === id)?.label ?? null,
    [view],
  );
  const checks = useMemo(
    () => draftChecks(rules, draft, view?.links ?? [], elementName),
    [rules, draft, view, elementName],
  );
  const checkMessages: CcCheckMessage[] = checks.map((c) => ({
    id: c.id,
    state: c.state,
    text: c.text,
    targetId: `rule-edit-${c.ruleId}`,
    targetLabel: rules.find((r) => r.id === c.ruleId)?.title ?? c.ruleId,
  }));

  const setEntry = (id: string, patch: Partial<RuleDraft[string]>) =>
    setDraft((d) => {
      const base = d ?? draftFrom(rules, entries);
      return { ...base, [id]: { ...base[id], state: base[id]?.state ?? null, note: base[id]?.note ?? '', ...patch } };
    });

  const focusField = (ruleId: string) => {
    const field = document.querySelector<HTMLTextAreaElement>(`#rule-edit-${CSS.escape(ruleId)} textarea`);
    field?.focus();
    field?.scrollIntoView({ block: 'center' });
  };

  const save = async () => {
    setAttempted(true);
    setNotice(null);
    if (problems.length > 0 || !view) return;
    if (choices.length === 0) return;
    setSaving(true);
    const result = await confirmProcessStates(projectId, view.revision, choices);
    setSaving(false);
    if (result.ok) {
      publishProcessStates(projectId, result.view);
      setEditing(false);
      setAttempted(false);
      setNotice({ state: 'success', text: confirmOutcomeSentence(result) });
    } else {
      setNotice({ state: 'error', text: confirmOutcomeSentence(result) });
      if (result.code === 'revision-moved') void reload();
    }
  };

  const discard = () => {
    setDraft(null);
    setAttempted(false);
    setNotice(null);
    setEditing(false);
  };

  /* -------------------------------------------------------------- states */

  if (!source.trim()) return null;

  if (!reading) {
    return (
      <p data-rules-editor="reading" className="m-0 text-[13px] font-medium text-cc-ink-muted">
        {wt('rules.reading')}
      </p>
    );
  }

  if (rules.length === 0) return null;

  const nextRevision = (view?.revision ?? 0) + 1;
  const unavailable = outcome && !outcome.ok ? outcome.code : null;

  /* -------------------------------------------------------------- reading */

  if (!editing) {
    return (
      <div data-rules-editor="view" className="flex flex-col gap-3">
        {notice ? (
          <CcMessageStrip state={notice.state} announce={true}>
            {notice.text}
          </CcMessageStrip>
        ) : null}
        <CcCard
          title={wt('rules.title')}
          count={rules.length}
          meta={<CcProvenanceChip value="reconstructed" />}
          actions={
            owner ? (
              <CcButton
                variant="secondary"
                icon={<PenLine size={16} aria-hidden={true} />}
                busy={preparing}
                onClick={() => void startEditing()}
                data-rules-edit=""
              >
                {wt('rules.edit')}
              </CcButton>
            ) : null
          }
        >
          <p data-rules-confirmed="" className="m-0 mb-3 text-[13px] font-medium text-cc-ink-muted">
            {counted ? rulesConfirmedOf(counted.confirmed, counted.total) : rulesReadRefusal(unavailable)}{' '}
            {wt('rules.meaning')}
          </p>
          <ul className="m-0 flex list-none flex-col p-0">
            {rules.map((rule) => (
              <li
                key={rule.id}
                id={`rule-${rule.id}`}
                data-rule={rule.id}
                className="grid grid-cols-1 gap-2 border-t border-cc-line py-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-4"
              >
                <RuleName rule={rule} />
                <div className="flex min-w-0 flex-col gap-2">
                  <RuleSentence rule={rule} />
                  <RuleRecord entry={entries[rule.id]} />
                </div>
              </li>
            ))}
          </ul>
        </CcCard>
      </div>
    );
  }

  /* -------------------------------------------------------------- editing */

  const missing = problems.filter((p) => p.kind === 'missing');
  const showErrors = attempted && problems.length > 0;
  const firstProblem = problems[0] ?? null;
  const firstRule = firstProblem ? rules.find((r) => r.id === firstProblem.ruleId) : null;
  const untouchedCount = summary.untouched.length;

  return (
    <div
      ref={editRef}
      tabIndex={-1}
      data-rules-editor="edit"
      aria-label={wt('rules.editingTitle')}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <CcCard
          level={2}
          title={wt('rules.editingTitle')}
          meta={<CcProvenanceChip value="reconstructed" note={wt('rules.revisionOne')} />}
          actions={
            <span className="text-[12px] font-medium text-cc-ink-muted">
              <span aria-hidden={true} className="font-bold text-cc-error">*</span> {wt('rules.required')}
            </span>
          }
        >
          {showErrors && firstRule ? (
            <div className="mb-3">
              <CcMessageStrip
                state="error"
                announce={true}
                headline={rulesNotSaved(nextRevision)}
                actions={
                  <CcButton variant="ghost" onClick={() => focusField(firstRule.id)} data-rules-goto-field="">
                    {wt('rules.goToField')}
                  </CcButton>
                }
              >
                {rulesAttention(missing.length || problems.length, firstRule.id)}
              </CcMessageStrip>
            </div>
          ) : null}
          {notice?.state === 'error' ? (
            <div className="mb-3">
              <CcMessageStrip state="error" announce={true}>
                {notice.text}
              </CcMessageStrip>
            </div>
          ) : null}

          <ol className="m-0 flex list-none flex-col p-0">
            {rules.map((rule) => {
              const entry = draft[rule.id] ?? { state: null, note: '' };
              const problem = problems.find((p) => p.ruleId === rule.id) ?? null;
              const needsNote = entry.state ? noteRequired(entry.state) : false;
              const fieldError = attempted && problem !== null && problem.kind !== 'source-missing';
              const sourceError = attempted && problem?.kind === 'source-missing';
              return (
                <li
                  key={rule.id}
                  id={`rule-edit-${rule.id}`}
                  data-rule-edit={rule.id}
                  data-rule-state={entry.state ?? 'untouched'}
                  className="grid scroll-mt-24 grid-cols-1 gap-2 border-t border-cc-line py-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-4"
                >
                  <RuleName rule={rule} />
                  <div className="flex min-w-0 flex-col gap-2">
                    <RuleSentence rule={rule} />
                    <DecisionGroup
                      rule={rule}
                      value={entry.state}
                      onChange={(state) => setEntry(rule.id, { state })}
                    />
                    {entry.state && entry.state !== 'keep' ? (
                      <CcTextarea
                        label={
                          entry.state === 'change'
                            ? wt('rules.newText')
                            : entry.state === 'drop'
                              ? wt('rules.dropReason')
                              : wt('rules.question')
                        }
                        required={needsNote}
                        rows={2}
                        maxLength={MAX_STATE_NOTE}
                        value={entry.note}
                        onChange={(note) => setEntry(rule.id, { note })}
                        placeholder={entry.state === 'drop' ? wt('rules.dropPlaceholder') : undefined}
                        help={entry.state === 'change' ? wt('rules.newTextHelp') : undefined}
                        valueState={
                          fieldError
                            ? 'error'
                            : entry.state === 'change' && entry.note.trim()
                              ? 'warning'
                              : entry.state === 'clarify'
                                ? 'information'
                                : undefined
                        }
                        message={
                          fieldError
                            ? entry.state === 'drop'
                              ? wt('rules.dropMissing')
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
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
            {rulesUnchangedLine(summary.untouched)}
          </p>
        </CcCard>

        <aside className="flex min-w-0 flex-col gap-4">
          <CcCard
            title={wt('rules.draftTitle')}
            meta={
              <span className="flex items-center gap-2">
                <CcObjectStatus value="draft" />
                <span className="text-[12px] font-medium text-cc-ink-muted">{wt('rules.notSaved')}</span>
              </span>
            }
          >
            <dl data-rules-draft="" className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
              {(['keep', 'change', 'drop', 'clarify'] as const).map((state) => (
                <React.Fragment key={state}>
                  <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                    {rulesDecisionLabel(state, true)}
                  </dt>
                  <dd data-rules-draft-row={state} className="m-0 font-medium text-cc-ink">
                    {summary[state].length === 0
                      ? '—'
                      : summary[state]
                          .map((id) =>
                            summary.missing.includes(id)
                              ? `${id} · ${wt('rules.reasonMissing')}`
                              : summary.sourceMissing.includes(id)
                                ? `${id} · ${wt('rules.valueSourceMissing')}`
                                : id,
                          )
                          .join(', ')}
                  </dd>
                </React.Fragment>
              ))}
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
                {wt('rules.untouched')}
              </dt>
              <dd data-rules-draft-row="untouched" className="m-0 font-medium text-cc-ink">
                {untouchedCount === 0 ? '—' : summary.untouched.join(', ')}
              </dd>
            </dl>
          </CcCard>
          <CcCard title={wt('rules.savingTitle')}>
            <ul className="m-0 grid list-disc gap-1 pl-4 text-[13px] leading-snug font-medium text-cc-ink">
              <li>{rulesSavingCreates(nextRevision)}</li>
              <li>
                <span className="inline-flex flex-wrap items-center gap-1">
                  {wt('rules.savingConfirmedA')} <CcProvenanceChip value="confirmed" />{' '}
                  {wt('rules.savingConfirmedB')}
                </span>
              </li>
              <li>{wt('rules.savingNothingElse')}</li>
            </ul>
          </CcCard>
        </aside>
      </div>

      {/* The footer of the one editing mode (§2.3): what is unsaved, the
          checks, and the two ways out. Sticky, so Save is never a scroll away. */}
      <div
        data-rules-footer=""
        className="sticky bottom-0 z-cc-sticky flex flex-wrap items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc"
      >
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-cc-warning">
          <PenLine size={16} aria-hidden={true} />
          {rulesUnsaved(choices.length)}
        </span>
        <span className="text-[12px] font-medium text-cc-ink-muted">{wt('rules.everySave')}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <CcMessagePopover messages={checkMessages} placement="above" />
          <CcButton variant="ghost" onClick={discard} data-rules-discard="">
            {wt('rules.discard')}
          </CcButton>
          <CcButton
            variant="primary"
            busy={saving}
            disabled={choices.length === 0 && problems.length === 0}
            onClick={() => void save()}
            data-rules-save=""
          >
            {rulesSaveAs(nextRevision)}
          </CcButton>
        </span>
      </div>
      {view === null ? (
        <CcLinkButton href={`/project/${projectId}/analyze`} variant="ghost">
          {wt('rules.openAnalyze')}
        </CcLinkButton>
      ) : null}
    </div>
  );
}
