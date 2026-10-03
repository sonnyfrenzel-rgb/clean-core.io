/**
 * The rule-editing mode of the Business view — mockup screen `s2`, roadmap 3.5.
 *
 * Pure: no React, no network, no model. It turns three things the product
 * already has into what the editing screen shows:
 *
 *   - the business rules of the source (`lib/abap/business-rule-set.ts`), worded
 *     for a business reader by `lib/business-card.ts`'s plain wording — the same
 *     deterministic sentences the Business card uses, never a model's;
 *   - the confirmations on record (`lib/process-states.ts`, the Bedarfsrevision
 *     the `process-states` route stores through the Admin SDK);
 *   - the draft the reader is holding.
 *
 * What it refuses to do is the point of it:
 *
 *   - **nothing is pre-selected.** A rule nobody answered is *untouched*, not
 *     "kept" — the absence of an answer is not an answer;
 *   - **a check is a hint, not a block.** The checks say where a confirmed need
 *     and the code now disagree — the code does not change because somebody
 *     confirmed a new need — and saving stays possible with every one of them;
 *   - **only a missing reason blocks a save**, because Change and Drop without
 *     one are decisions nobody can review later (`noteRequired`);
 *   - **a confirmation is a self-declaration of the signed-in account**, shown as
 *     *Confirmed · name*, never as proof, and never part of the signed run.
 */
import type { BusinessRuleSet } from './abap/business-rule-set';
import type { ProcessSkeleton, SkeletonNode } from './abap/process-skeleton';
import { plainLabels } from './abap/plain-language';
import type { PlainWording } from './business-card';
import { anchorLabel } from './first-look';
import { capabilityKeyOf } from './abap/standard-coverage';
import {
  ELEMENT_STATES,
  MAX_STATE_NOTE,
  MAX_VALUE_SOURCE_NOTE,
  STATE_LABELS,
  noteRequired,
  sameAnswer,
  valueSourceAllowed,
  valueSourceRequired,
  type ValueSourceKind,
  type ElementState,
  type ProcessStateView,
  type RuleLink,
  type StateChoiceInput,
  type StateEntry,
} from './process-states';

/* ------------------------------------------------------------------ rules */

/** One rule as the editing screen shows it. */
export interface EditorRule {
  /** `BR-001`. */
  id: string;
  /** "Plant 1000" — the short plain phrase, or the code when there is none. */
  title: string;
  /** True when `title` is code, because the wording had no plain phrase for it. */
  titleIsCode: boolean;
  /** The rule as one plain sentence, or null — then the code is the sentence. */
  sentence: string | null;
  /** The condition as the source writes it. */
  code: string;
  /** Every place the rule stands, `L87`, `L398-414`. */
  anchors: string[];
  /**
   * The other rules that decide the same subject (`capabilityKeyOf`) — what
   * "Also applies to" may offer. Empty when the rule stands alone, and then the
   * field is not shown: there is nothing in the code it could apply to.
   */
  siblings: string[];
}

const sentenceCase = (text: string): string =>
  text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);

/** The rules of a reading, worded. Same order as the rule set — `BR-001` first. */
export function editorRules(ruleSet: BusinessRuleSet, wording: PlainWording): EditorRule[] {
  const byKey = new Map<string, string[]>();
  for (const rule of ruleSet.rules) {
    const key = capabilityKeyOf(rule);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), rule.id]);
  }
  return ruleSet.rules.map((rule) => {
    const key = capabilityKeyOf(rule);
    // A phrase is only a name when it says something in words: "1000 1000" is
    // two values, not a name, and is not shown as one.
    const raw = wording.rulePhrase(rule);
    const phrase = raw && (raw.match(/[A-Za-z]/g) ?? []).length >= 3 ? raw : null;
    const sentence = wording.ruleSentence(rule);
    // Without a phrase the plain sentence is the name, and the code stands
    // beside it instead of the sentence a second time.
    const title = phrase ? sentenceCase(phrase) : sentence ?? rule.label;
    return {
      id: rule.id,
      title,
      titleIsCode: !phrase && !sentence,
      sentence: phrase && sentence !== title ? sentence : null,
      code: rule.label,
      anchors: [
        ...new Set(rule.sentences.flatMap((s) => s.anchors.map((a) => anchorLabel(a.lineStart, a.lineEnd)))),
      ],
      siblings: key ? (byKey.get(key) ?? []).filter((id) => id !== rule.id) : [],
    };
  });
}

/* ------------------------------------------------------------------ draft */

/** The answer a reader is holding for one rule. `state: null` is untouched. */
export interface DraftEntry {
  state: ElementState | null;
  note: string;
  /** Where the value comes from — Keep and Change only; `''` is not chosen. */
  sourceKind?: ValueSourceKind | '';
  sourceNote?: string;
  /** Other rules of the same subject this answer also applies to. */
  appliesTo?: string[];
}

export type RuleDraft = Record<string, DraftEntry>;

/** The rule confirmations on record, by rule id. Elements are not this screen's. */
export function ruleEntries(view: ProcessStateView | null): Record<string, StateEntry> {
  const out: Record<string, StateEntry> = {};
  if (!view) return out;
  const rules = new Set(view.subjects.filter((s) => s.kind === 'rule').map((s) => s.subject));
  for (const entry of view.entries) {
    if (entry.kind !== 'rule' || !rules.has(entry.subject)) continue;
    const held = out[entry.subject];
    if (!held || entry.revision > held.revision) out[entry.subject] = entry;
  }
  return out;
}

/** The draft a reader starts from: exactly what is on record, and nothing chosen for the rest. */
export function draftFrom(rules: readonly EditorRule[], entries: Record<string, StateEntry>): RuleDraft {
  const draft: RuleDraft = {};
  for (const rule of rules) {
    const entry = entries[rule.id];
    draft[rule.id] = {
      state: entry?.state ?? null,
      note: entry?.note ?? '',
      sourceKind: entry?.valueSource?.kind ?? '',
      sourceNote: entry?.valueSource?.note ?? '',
      appliesTo: [...(entry?.appliesTo ?? [])],
    };
  }
  return draft;
}

/** The rules whose answer differs from what is on record — what a save would send. */
export function draftChoices(draft: RuleDraft, entries: Record<string, StateEntry>): StateChoiceInput[] {
  const out: StateChoiceInput[] = [];
  for (const [id, entry] of Object.entries(draft)) {
    if (!entry.state) continue;
    const note = entry.note.trim();
    const withSource = valueSourceAllowed(entry.state);
    const sourceNote = (entry.sourceNote ?? '').trim();
    const choice: StateChoiceInput = {
      subject: id,
      kind: 'rule',
      state: entry.state,
      note: note === '' ? null : note,
      valueSource:
        withSource && entry.sourceKind
          ? { kind: entry.sourceKind, note: sourceNote === '' ? null : sourceNote }
          : null,
      appliesTo: withSource ? [...(entry.appliesTo ?? [])].sort() : [],
    };
    if (sameAnswer(entries[id], choice)) continue;
    out.push(choice);
  }
  return out.sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
}

/** One field that keeps the draft from being saved. */
export interface DraftProblem {
  ruleId: string;
  /**
   * `missing` — the state needs a reason; `too-long` — over the limit;
   * `source-missing` — a change that does not say where the new value comes from.
   */
  kind: 'missing' | 'too-long' | 'source-missing';
}

/** What blocks a save. Only Change and Drop without a reason, and a note over the limit. */
export function draftProblems(draft: RuleDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  for (const [ruleId, entry] of Object.entries(draft)) {
    if (!entry.state) continue;
    const note = entry.note.trim();
    // Clarify asks somebody else; without the question and who should answer
    // it, the open point cannot be followed up (owner, 03.10.2026). Required
    // here, in the answering screen; what the route stores is unchanged.
    if ((noteRequired(entry.state) || entry.state === 'clarify') && note === '') out.push({ ruleId, kind: 'missing' });
    else if (note.length > MAX_STATE_NOTE) out.push({ ruleId, kind: 'too-long' });
    else if (valueSourceRequired(entry.state) && !entry.sourceKind) out.push({ ruleId, kind: 'source-missing' });
    else if ((entry.sourceNote ?? '').trim().length > MAX_VALUE_SOURCE_NOTE) out.push({ ruleId, kind: 'too-long' });
  }
  return out.sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
}

/** The draft by answer, for the "This draft" card. Ids in rule order. */
export interface DraftSummary {
  keep: string[];
  change: string[];
  drop: string[];
  clarify: string[];
  untouched: string[];
  /** Rules whose answer needs a reason and has none. */
  missing: string[];
  /** Changes that have a reason but do not say where the new value comes from. */
  sourceMissing: string[];
}

export function draftSummary(rules: readonly EditorRule[], draft: RuleDraft): DraftSummary {
  const summary: DraftSummary = { keep: [], change: [], drop: [], clarify: [], untouched: [], missing: [], sourceMissing: [] };
  const problems = draftProblems(draft);
  const missing = new Set(problems.filter((p) => p.kind === 'missing').map((p) => p.ruleId));
  const sourceMissing = new Set(problems.filter((p) => p.kind === 'source-missing').map((p) => p.ruleId));
  for (const rule of rules) {
    const state = draft[rule.id]?.state ?? null;
    if (!state) summary.untouched.push(rule.id);
    else summary[state].push(rule.id);
    if (missing.has(rule.id)) summary.missing.push(rule.id);
    if (sourceMissing.has(rule.id)) summary.sourceMissing.push(rule.id);
  }
  return summary;
}

/* ------------------------------------------------------------------ checks */

/** A hint about the draft — never a block. */
export interface DraftCheck {
  id: string;
  state: 'warning' | 'information';
  ruleId: string;
  text: string;
}

/**
 * Where a confirmed need and the code would now disagree.
 *
 * Built from the links the `process-states` route hands out — which elements of
 * the reconstructed process each rule was drawn into — so a hint names a real
 * element or no element, never "something downstream". The code itself does not
 * change because a need was confirmed, and the hint says that in plain words.
 */
export function draftChecks(
  rules: readonly EditorRule[],
  draft: RuleDraft,
  links: readonly RuleLink[],
  elementName: (id: string) => string | null,
): DraftCheck[] {
  const linked = new Map(links.map((l) => [l.rule, l.elements]));
  const out: DraftCheck[] = [];
  for (const rule of rules) {
    const state = draft[rule.id]?.state ?? null;
    if (!state || state === 'keep') continue;
    const elements = linked.get(rule.id) ?? [];
    const names = [...new Set(elements.map(elementName).filter((n): n is string => !!n))];
    const where = rule.anchors[0] ?? null;
    const step = names.length > 0 ? `“${names[0]}”` : null;
    if (state === 'change') {
      out.push({
        id: `${rule.id}-change`,
        state: 'warning',
        ruleId: rule.id,
        text: step
          ? `“${rule.title}” changes, but the step ${step} still follows the code${where ? ` at ${where}` : ''} until the program is changed.`
          : `“${rule.title}” changes, but the program still decides it as written${where ? ` at ${where}` : ''} until it is changed.`,
      });
    } else if (state === 'drop') {
      out.push({
        id: `${rule.id}-drop`,
        state: 'warning',
        ruleId: rule.id,
        text: step
          ? `“${rule.title}” is dropped, but the path through ${step} still exists in the reconstructed process.`
          : `“${rule.title}” is dropped, but the code${where ? ` at ${where}` : ''} still applies it.`,
      });
    } else {
      out.push({
        id: `${rule.id}-clarify`,
        state: 'information',
        ruleId: rule.id,
        text: `“${rule.title}” stays open until the question is answered. It is not counted as confirmed.`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ counts */

/** Kept, changed or dropped — a Clarify is an open question, not a confirmation. */
export function isConfirmedState(state: ElementState): boolean {
  return state === 'keep' || state === 'change' || state === 'drop';
}

/** "Rules confirmed x of n" — over the rules the route knows, or null when nothing could be read. */
export function rulesConfirmed(view: ProcessStateView | null): { confirmed: number; total: number } | null {
  if (!view) return null;
  const total = view.subjects.filter((s) => s.kind === 'rule').length;
  const confirmed = Object.values(ruleEntries(view)).filter((e) => isConfirmedState(e.state)).length;
  return { confirmed, total };
}

/**
 * Where the answers to the rules stand — the one reading every place on the
 * Business view takes its rule action from (owner, 03.10.2026: the first look
 * offered "Confirm the rule" as its primary action while that one rule was
 * already confirmed, because it never asked).
 *
 * `open` are the rules without a Keep, Change or Drop on record, in the order
 * of the code; a Clarify is an open question and stays open. `by` and `lastAt`
 * say who answered and when, for the done state ("by you, 3 Oct 2026").
 */
export interface RulesStatus {
  total: number;
  confirmed: number;
  open: string[];
  /** The accounts behind the confirmed answers, each once, latest answer first. */
  by: { uid: string; name: string }[];
  /** Server time of the latest confirmed answer, or null when there is none. */
  lastAt: string | null;
}

/**
 * The status from what the process-states route answered. `null` while it has
 * not answered, and when the read failed: then nothing is known, and no place
 * may offer an action as if it were. "No reconstructed baseline yet" is known —
 * nobody has answered anything — so every rule of the reading is open.
 */
export function rulesStatus(
  outcome: { ok: true; view: ProcessStateView } | { ok: false; code: string } | null,
  ruleIds: readonly string[] | null,
): RulesStatus | null {
  if (!outcome) return null;
  if (!outcome.ok) {
    if (outcome.code !== 'no-baseline' || !ruleIds) return null;
    return { total: ruleIds.length, confirmed: 0, open: [...ruleIds], by: [], lastAt: null };
  }
  const subjects = outcome.view.subjects.filter((s) => s.kind === 'rule').map((s) => s.subject);
  const entries = ruleEntries(outcome.view);
  const answered = subjects
    .map((id) => entries[id])
    .filter((e): e is StateEntry => !!e && isConfirmedState(e.state))
    .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : a.confirmedAt > b.confirmedAt ? -1 : 0));
  const by: { uid: string; name: string }[] = [];
  for (const entry of answered) {
    if (!by.some((b) => b.uid === entry.account.uid)) by.push({ uid: entry.account.uid, name: entry.account.name });
  }
  return {
    total: subjects.length,
    confirmed: answered.length,
    open: subjects.filter((id) => !(entries[id] && isConfirmedState(entries[id].state))),
    by,
    lastAt: answered[0]?.confirmedAt ?? null,
  };
}

export { ELEMENT_STATES, STATE_LABELS, noteRequired };

/* ------------------------------------------------------------- step strip */

/** One chip of the "Your process" strip. */
export interface StepChip {
  id: string;
  label: string;
  anchor: string | null;
  decision: boolean;
}

const STRIP_KINDS = new Set<SkeletonNode['kind']>([
  'gateway',
  'sub-process',
  'call-activity',
  'transaction',
  'task',
  'service-task',
  'send-task',
  'user-task',
  'business-rule-task',
  'read',
  'write',
  'loop',
]);

/**
 * The first steps of the first entry, in plain words — the strip under "Your
 * process" (mockup `s0`, moment 4). Read off the skeleton in the order the
 * entry walks it; a node whose plain label is empty keeps its technical name.
 * `more` says whether the entry goes on, so the strip can end in "…" rather
 * than look complete.
 */
export function stepStrip(
  skeleton: ProcessSkeleton,
  source: string,
  max = 5,
): { steps: StepChip[]; more: boolean } {
  const entry = skeleton.entries[0];
  if (!entry) return { steps: [], more: false };
  const labels = plainLabels(skeleton, source);
  const inEntry = skeleton.nodes.filter((n) => n.region === entry && STRIP_KINDS.has(n.kind));
  const steps = inEntry.slice(0, max).map((n) => ({
    id: n.id,
    label: (labels.nodes.get(n.id) || '').trim() || n.label,
    anchor: n.anchor ? anchorLabel(n.anchor.lineStart, n.anchor.lineEnd) : null,
    decision: n.kind === 'gateway',
  }));
  return { steps, more: inEntry.length > max };
}
