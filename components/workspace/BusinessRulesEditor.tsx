'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, CircleHelp, PenLine, Trash2, Repeat2 } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcMessagePopover, { type CcCheckMessage } from '@/components/cc/MessagePopover';
import CcTextarea from '@/components/cc/Textarea';
import CcDateText from '@/components/cc/DateText';
import CcLinkButton from '@/components/cc/LinkButton';
import CcSelect from '@/components/cc/Select';
import CcCheckbox from '@/components/cc/Checkbox';
import CcField from '@/components/cc/Field';
import { CcRulePropertyTag } from '@/components/cc/Tag';
import { cn } from '@/lib/utils';
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
  editorRules,
  isConfirmedState,
  ruleEntries,
  rulesStatus,
  type EditorRule,
  type RuleDraft,
} from '@/lib/rules-editor';
import { publishProcessStates, useProcessStates } from '@/hooks/useProcessStates';
import type { Project } from '@/lib/types';
import RulesDoneLine from './RulesDoneLine';
import DecisionTables from '@/components/documentation/DecisionTables';
import { decisionTableViews } from '@/lib/decision-tables';
import {
  wt,
  rulesAnsweredOf,
  rulesAttention,
  rulesConfirmedOf,
  rulesDecisionLabel,
  rulesDeviates,
  rulesNotSaved,
  rulesRecordAnswers,
  rulesRecordAs,
  rulesRecordedWord,
  rulesReadRefusal,
  rulesUnchangedLine,
  rulesUnsaved,
  rulesValueSourceLabel,
  rulesValueSourceLine,
  rulesAppliesToLine,
} from '@/lib/workspace-messages';

/**
 * The business rules of the source, and the one place to answer them —
 * *Need & process*, mockup screens `s1` (the card) and `s2` (answering).
 *
 * **Reading.** Every rule the engine found hard-coded in the program, as a
 * compact row: its name and `BR-` id, the condition in plain words with the
 * ABAP it was read from and its lines, and what is on record — *Reconstructed ·
 * No answer yet* until somebody answers, then *Confirmed · name* with the answer
 * and the date. Rules without an answer stand first and are marked; when every
 * rule has one, the card says so calmly, with who and when, and offers
 * "Review rules" instead of a call to act (owner, 03.10.2026).
 *
 * **Deciding** (owner only — the route refuses everybody else, and the button
 * is not offered to them). Owner, 03.10.2026: *"Is this really editing, or
 * deciding what we do with the rules?"* — it is deciding, so it is named that.
 * Per rule four answers as radio cards, each with its icon and one line of what
 * it means: Keep · Change deliberately · Drop · Clarify, nothing pre-selected.
 * Change, Drop and Clarify open their field in place and need it. The answers
 * are recorded as one new need revision through
 * `POST /api/projects/{id}/process-states`, which writes through the Admin SDK
 * into a subcollection no client rule reaches; revision 1 — the reconstructed
 * as-is process — and the signed run are never touched: a confirmation is a
 * self-declaration of the signed-in account, not evidence. Until they are
 * recorded, the answers are kept in this browser tab, so leaving the page and
 * coming back loses nothing.
 *
 * **Checks are hints, not blocks** (`DESIGN.md` §2.7): where a confirmed need
 * and the code would now disagree, from the links the route hands out. Only a
 * missing reason or question stops a save, with a strip that says which field
 * and that nothing was lost.
 */

/** The event "Decide on rules" sends from the first look and "Your next step"; heard here. */
export const EDIT_RULES_EVENT = 'cc:edit-rules';

/** The Business view's own block for the rules — where the rule actions of the page lead. */
export const BUSINESS_RULES_ID = 'business-rules';

/**
 * Asked for by the first look's or the next step's rule action: the editor may
 * not be mounted yet (the layer is opened by the same click), so the request is
 * held until an editor picks it up, as well as announced to one that is there.
 */
// Holds the project the request was made for, so a request left over from one
// project can never open the editor of another after a navigation (QA
// 29935b8109f6).
let pendingEdit: string | null = null;
export function requestRuleEditing(projectId: string): void {
  pendingEdit = projectId;
  window.dispatchEvent(new Event(EDIT_RULES_EVENT));
}

/** The signed-in account's uid in this browser, or null — never on the server. */
export function useSignedInUid(): string | null {
  return useSyncExternalStore(
    (listener) => getAuth().onAuthStateChanged(() => listener()),
    () => getAuth().currentUser?.uid ?? null,
    () => null,
  );
}

export function useIsOwner(project: Project | null): boolean {
  // The signed-in account is the browser's; on the server there is none, so
  // the server snapshot says "not the owner" and nothing is offered there.
  const uid = useSignedInUid();
  return !!uid && typeof project?.userId === 'string' && project.userId === uid;
}

/** Where the answers of one project are kept until they are recorded — this tab only. */
const draftKey = (projectId: string) => `cc:rules-draft:${projectId}`;

function readKeptDraft(projectId: string, revision: number): RuleDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(projectId));
    if (!raw) return null;
    const kept = JSON.parse(raw) as { revision?: unknown; draft?: unknown };
    if (kept.revision !== revision || typeof kept.draft !== 'object' || kept.draft === null) return null;
    return kept.draft as RuleDraft;
  } catch {
    return null;
  }
}

function keepDraft(projectId: string, revision: number, draft: RuleDraft | null): void {
  try {
    if (draft === null) window.sessionStorage.removeItem(draftKey(projectId));
    else window.sessionStorage.setItem(draftKey(projectId), JSON.stringify({ revision, draft }));
  } catch {
    /* a blocked storage only means the answers are not kept across a reload */
  }
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

/** The rule's name, its id and its property. */
export function RuleName({ rule }: { rule: EditorRule }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span
        className={
          rule.titleIsCode
            ? 'font-cc-mono text-[13px] font-bold break-words text-cc-ink'
            : 'text-[13px] font-bold break-words text-cc-ink'
        }
      >
        {rule.title}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{rule.id}</code>
        <CcRulePropertyTag value="hard-coded" />
      </span>
    </div>
  );
}

/** The rule in plain words, the ABAP it was read from, and its lines. */
export function RuleSentence({ rule }: { rule: EditorRule }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rule.sentence ? (
        <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{rule.sentence}</p>
      ) : null}
      <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <code className="min-w-0 font-cc-mono text-[12px] font-medium break-all text-cc-ink-muted">{rule.code}</code>
        <Anchors anchors={rule.anchors} />
      </p>
    </div>
  );
}

/** What is on record for one rule, in the reading mode: its state chip, who and when. */
function RuleRecord({ entry }: { entry: StateEntry | undefined }) {
  if (!entry) {
    return (
      <span data-rule-record="none" className="flex flex-wrap items-center gap-2">
        <CcProvenanceChip value="reconstructed" />
        <span className="text-[12px] font-semibold text-cc-ink">{wt('rules.noAnswer')}</span>
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
        <span data-rule-record-word="" className="text-[12px] font-semibold text-cc-ink">
          {rulesRecordedWord(entry.state)}
        </span>
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
export function ValueSourceFields({
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


const CHOICE_ICON: Record<ElementState, React.ReactNode> = {
  keep: <Check size={16} aria-hidden={true} />,
  change: <Repeat2 size={16} aria-hidden={true} />,
  drop: <Trash2 size={16} aria-hidden={true} />,
  clarify: <CircleHelp size={16} aria-hidden={true} />,
};

const CHOICE_MEANING: Record<ElementState, 'rules.keepMeaning' | 'rules.changeMeaning' | 'rules.dropMeaning' | 'rules.clarifyMeaning'> = {
  keep: 'rules.keepMeaning',
  change: 'rules.changeMeaning',
  drop: 'rules.dropMeaning',
  clarify: 'rules.clarifyMeaning',
};

/**
 * Keep · Change deliberately · Drop · Clarify as four radio cards — each with
 * its icon and one line of what it means (owner, 03.10.2026: "make the choice
 * more visible"). An empty group is allowed: nothing is pre-selected. Arrow
 * keys move and choose, as in any radio group; each card is a tap target of
 * its own on a phone.
 */
export function DecisionGroup({
  rule,
  value,
  onChange,
}: {
  rule: EditorRule;
  value: ElementState | null;
  onChange: (state: ElementState) => void;
}) {
  const id = useId();
  const refs = useRef(new Map<ElementState, HTMLButtonElement>());
  const move = (delta: number) => {
    const index = value ? ELEMENT_STATES.indexOf(value) : -1;
    const next = ELEMENT_STATES[(index + delta + ELEMENT_STATES.length) % ELEMENT_STATES.length];
    onChange(next);
    refs.current.get(next)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={`${wt('rules.decisionFor')} ${rule.title}`}
      data-rule-decision={rule.id}
      className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 xl:grid-cols-4"
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
        const meaningId = `${id}-${state}`;
        return (
          <button
            key={state}
            ref={(el) => {
              if (el) refs.current.set(state, el);
              else refs.current.delete(state);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-describedby={meaningId}
            tabIndex={selected || (value === null && index === 0) ? 0 : -1}
            data-rule-option={state}
            data-rule-option-on={selected ? 'yes' : 'no'}
            onClick={() => onChange(state)}
            className={cn(
              'flex min-h-11 min-w-0 flex-col items-start gap-1 rounded-cc-row border px-3 py-2 text-left',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus',
              // A radio card, not one of the four buttons: an ink border and
              // ring mark the chosen answer, never a surface of its own (§1.5).
              selected ? 'border-cc-ink shadow-cc ring-2 ring-cc-ink' : 'border-cc-line hover:border-cc-ink',
            )}
          >
            <span className="flex items-center gap-2 text-[13px] font-bold text-cc-ink">
              <span className={selected ? 'text-cc-ink' : 'text-cc-ink-muted'}>{CHOICE_ICON[state]}</span>
              {rulesDecisionLabel(state)}
              {selected ? <Check size={14} aria-hidden={true} className="ml-auto" /> : null}
            </span>
            <span id={meaningId} className="text-[12px] leading-snug font-medium text-cc-ink-muted">
              {wt(CHOICE_MEANING[state])}
            </span>
          </button>
        );
      })}
    </div>
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
  const uid = useSignedInUid();
  const { outcome, reload } = useProcessStates(projectId, source.trim().length > 0);
  const view = outcome?.ok ? outcome.view : null;

  const rules = useMemo(
    () => (reading ? editorRules(reading.ruleSet, plainWordingFor(source, reading.skeleton)) : []),
    [reading, source],
  );
  const entries = useMemo(() => ruleEntries(view), [view]);
  // Roadmap 3.0.7: classifications that only set one field, each one business rule task with its table.
  const decisionTables = useMemo(() => decisionTableViews(reading?.ruleSet), [reading]);
  const status = useMemo(() => rulesStatus(outcome, reading ? rules.map((r) => r.id) : null), [outcome, reading, rules]);
  const rootRef = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState(false);
  // `null` is "what is on record": the draft starts there and Discard returns there.
  const [held, setDraft] = useState<RuleDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [restored, setRestored] = useState(false);
  const [notice, setNotice] = useState<{ state: 'success' | 'error'; text: string } | null>(null);
  /** The order of the answering screen, fixed when it opens: unanswered rules first, then the rest. */
  const [order, setOrder] = useState<string[] | null>(null);
  const editRef = useRef<HTMLDivElement>(null);

  const startEditing = useCallback(async () => {
    setNotice(null);
    let revision = view?.revision ?? 0;
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
      revision = 1;
    }
    const kept = readKeptDraft(projectId, revision);
    setDraft(kept);
    setRestored(kept !== null);
    const open = new Set(status?.open ?? rules.map((r) => r.id));
    setOrder([...rules.filter((r) => open.has(r.id)), ...rules.filter((r) => !open.has(r.id))].map((r) => r.id));
    setEditing(true);
  }, [outcome, projectId, reload, view, status, rules]);

  const draft = useMemo(() => held ?? draftFrom(rules, entries), [held, rules, entries]);

  // "Decide on rules" in the first look and in "Your next step" lands here.
  useEffect(() => {
    const onEdit = () => {
      // Held until the owner is known and the record has been read.
      if (!owner || outcome === null) return;
      if (pendingEdit !== projectId) return;
      pendingEdit = null;
      void startEditing();
      (rootRef.current ?? document.getElementById('need'))?.scrollIntoView({ block: 'start' });
    };
    if (pendingEdit === projectId) onEdit();
    window.addEventListener(EDIT_RULES_EVENT, onEdit);
    return () => window.removeEventListener(EDIT_RULES_EVENT, onEdit);
  }, [owner, startEditing, outcome, projectId]);

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  const choices = useMemo(() => draftChoices(draft, entries), [draft, entries]);
  const problems = useMemo(() => draftProblems(draft), [draft]);
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
      const next = { ...base, [id]: { ...base[id], state: base[id]?.state ?? null, note: base[id]?.note ?? '', ...patch } };
      // Kept in this tab until recorded or discarded, so leaving the page loses nothing.
      keepDraft(projectId, view?.revision ?? 0, next);
      return next;
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
      keepDraft(projectId, view.revision, null);
      publishProcessStates(projectId, result.view);
      setEditing(false);
      setAttempted(false);
      setDraft(null);
      setNotice({ state: 'success', text: confirmOutcomeSentence(result) });
    } else {
      setNotice({ state: 'error', text: confirmOutcomeSentence(result) });
      if (result.code === 'revision-moved') void reload();
    }
  };

  const discard = () => {
    keepDraft(projectId, view?.revision ?? 0, null);
    setDraft(null);
    setAttempted(false);
    setNotice(null);
    setRestored(false);
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
  const allDone = status !== null && status.total > 0 && status.open.length === 0;

  /* -------------------------------------------------------------- reading */

  if (!editing) {
    const open = new Set(status?.open ?? []);
    const openRules = rules.filter((r) => open.has(r.id));
    const answered = rules.filter((r) => !open.has(r.id));
    const row = (rule: EditorRule, unanswered: boolean) => (
      <li
        key={rule.id}
        id={`rule-${rule.id}`}
        data-rule={rule.id}
        data-rule-answered={unanswered ? 'no' : 'yes'}
        className={cn(
          'grid min-w-0 grid-cols-1 gap-2 border-t border-cc-line py-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,240px)] sm:gap-4',
          unanswered ? 'border-l-4 border-l-cc-warning-line pl-3' : 'pl-4',
        )}
      >
        <RuleName rule={rule} />
        <RuleSentence rule={rule} />
        <RuleRecord entry={entries[rule.id]} />
      </li>
    );
    return (
      <div ref={rootRef} data-rules-editor="view" className="flex scroll-mt-24 flex-col gap-3">
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
                variant={allDone ? 'ghost' : 'secondary'}
                icon={<PenLine size={16} aria-hidden={true} />}
                busy={preparing}
                onClick={() => void startEditing()}
                data-rules-edit=""
                data-rules-edit-state={allDone ? 'review' : 'decide'}
              >
                {allDone ? wt('rules.review') : wt('rules.edit')}
              </CcButton>
            ) : null
          }
        >
          {allDone && status ? (
            <div className="mb-2">
              <RulesDoneLine status={status} uid={uid} />
            </div>
          ) : null}
          <p data-rules-confirmed="" className="m-0 mb-3 text-[13px] font-medium text-cc-ink-muted">
            {status ? rulesConfirmedOf(status.confirmed, status.total) : rulesReadRefusal(unavailable)}{' '}
            {wt('rules.meaning')}
          </p>
          {openRules.length > 0 && answered.length > 0 ? (
            <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              {wt('rules.openFirst')} ({openRules.length})
            </p>
          ) : null}
          <ul data-rules-list="" className="m-0 flex list-none flex-col p-0">
            {openRules.map((rule) => row(rule, true))}
          </ul>
          {openRules.length > 0 && answered.length > 0 ? (
            <p className="m-0 mt-3 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              {wt('rules.answeredGroup')} ({answered.length})
            </p>
          ) : null}
          <ul className="m-0 flex list-none flex-col p-0">{answered.map((rule) => row(rule, false))}</ul>
          {decisionTables.length ? (
            <div className="mt-4 border-t border-cc-line pt-3">
              <DecisionTables tables={decisionTables} tone="unlinked" />
            </div>
          ) : null}
        </CcCard>
      </div>
    );
  }

  /* ------------------------------------------------------------- deciding */

  const missing = problems.filter((p) => p.kind === 'missing');
  const showErrors = attempted && problems.length > 0;
  const firstProblem = problems[0] ?? null;
  const firstRule = firstProblem ? rules.find((r) => r.id === firstProblem.ruleId) : null;
  const answeredCount = rules.filter((r) => draft[r.id]?.state).length;
  const untouched = rules.filter((r) => !draft[r.id]?.state).map((r) => r.id);
  const ordered = (order ?? rules.map((r) => r.id))
    .map((id) => rules.find((r) => r.id === id))
    .filter((r): r is EditorRule => !!r);

  return (
    <div
      ref={(el) => {
        editRef.current = el;
        rootRef.current = el;
      }}
      tabIndex={-1}
      data-rules-editor="edit"
      aria-label={wt('rules.editingTitle')}
      className="flex min-w-0 scroll-mt-24 flex-col gap-4"
    >
      <CcCard
        level={2}
        title={wt('rules.editingTitle')}
        meta={<CcProvenanceChip value="reconstructed" note={wt('rules.revisionOne')} />}
        actions={
          <span
            data-rules-progress=""
            data-answered={answeredCount}
            data-total={rules.length}
            aria-live="polite"
            className="text-[13px] font-bold text-cc-ink"
          >
            {rulesAnsweredOf(answeredCount, rules.length)}
          </span>
        }
      >
        <p data-rules-lead="" className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink">
          {wt('rules.lead')}
        </p>
        <p className="m-0 mt-1 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">
          {wt('rules.smallPrint')}{' '}
          <span className="inline-flex items-center gap-1 align-middle">
            <CcProvenanceChip value="confirmed" />
          </span>
        </p>
        {restored ? (
          <div className="mt-3">
            <CcMessageStrip state="information">{wt('rules.draftRestored')}</CcMessageStrip>
          </div>
        ) : null}
        {showErrors && firstRule ? (
          <div className="mt-3">
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
          <div className="mt-3">
            <CcMessageStrip state="error" announce={true}>
              {notice.text}
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
                id={`rule-edit-${rule.id}`}
                data-rule-edit={rule.id}
                data-rule-state={entry.state ?? 'untouched'}
                className={cn(
                  'flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-cc-card border bg-cc-surface p-3 sm:p-4',
                  entry.state ? 'border-cc-line' : 'border-cc-line border-l-4 border-l-cc-warning-line',
                )}
              >
                <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-4">
                  <RuleName rule={rule} />
                  <RuleSentence rule={rule} />
                </div>
                {entry.state ? null : (
                  <span data-rule-unanswered="" className="text-[12px] font-semibold text-cc-warning">
                    {wt('rules.noAnswer')}
                  </span>
                )}
                <DecisionGroup rule={rule} value={entry.state} onChange={(state) => setEntry(rule.id, { state })} />
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
        <p className="m-0 mt-3 text-[12px] font-medium text-cc-ink-muted">{rulesUnchangedLine(untouched)}</p>
      </CcCard>

      {/* The footer of the one answering mode (§2.3): how far, what is not yet
          recorded, the checks, and the one primary action that says what it
          records. Sticky, so it is never a scroll away. */}
      <div
        data-rules-footer=""
        className="sticky bottom-0 z-cc-sticky flex flex-wrap items-center gap-x-3 gap-y-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc"
      >
        <span className="flex min-w-0 flex-col">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-cc-ink">
            <PenLine size={16} aria-hidden={true} className="text-cc-warning" />
            {rulesUnsaved(choices.length)}
          </span>
          <span className="text-[12px] font-medium text-cc-ink-muted">
            {choices.length > 0 ? wt('rules.draftKept') : wt('rules.everySave')}
          </span>
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <CcMessagePopover messages={checkMessages} placement="above" />
          <CcButton variant="ghost" onClick={discard} data-rules-discard="">
            {wt('rules.discard')}
          </CcButton>
          <span className="flex flex-col items-end">
            <CcButton
              variant="primary"
              busy={saving}
              disabled={choices.length === 0 && problems.length === 0}
              onClick={() => void save()}
              data-rules-save=""
            >
              {rulesRecordAnswers(choices.length)}
            </CcButton>
            <span data-rules-save-note="" className="mt-1 text-[11px] font-medium text-cc-ink-muted">
              {rulesRecordAs(nextRevision)}
            </span>
          </span>
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
