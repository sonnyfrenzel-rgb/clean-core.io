import { UNANCHORED } from './process-naming';
import type { ProcessMapElement, ProcessMapModel } from './process-map';
import type { ElementState, ProcessStates, StateEntry } from './process-states';

/**
 * Ist and Soll — roadmap 3.6.
 *
 * The Ist is `lib/process-map.ts`: a process reconstructed from ABAP, every
 * element carrying the lines it was read out of. The states are 3.5: what an
 * account says should happen to each element and each rule. This module puts
 * the two together into the **Soll** and then holds the two side by side.
 *
 * Four rules, and they are the whole of the derivation:
 *
 *   - `keep`   — the element stays in the Soll exactly as the Ist has it.
 *   - `drop`   — the element is **not** in the Soll. It is still carried in
 *                `dropped`, with its line anchor, because the comparison has to
 *                be able to say *what* goes and *where the code for it was*.
 *   - `change` — the element stays, marked as deliberately changed. What the
 *                change is, is not derived here: nobody said, and guessing is
 *                the failure this whole product exists to avoid.
 *   - `clarify` **and undecided** — the element stays and is marked *open*.
 *                They are open for different reasons and this module never
 *                collapses them: *"somebody asked for this to be clarified"* is
 *                a statement; *"nobody has said anything"* is the absence of
 *                one. Three separate carriers keep them apart — `state` (null
 *                exactly when nobody spoke), `openReason` (`clarify` against
 *                `undecided`), and two counters that are never summed into one.
 *
 * **C23-A06 — a need without code gets no invented anchor.** Every anchor in
 * here is copied from the Ist element it belongs to. A subject that exists only
 * in the Soll has no line and is given none: not the neighbour's, not the
 * parent's, not the enclosing sub-process's. It is visibly `Unanchored` — 2.4's
 * word, imported rather than respelt — and the comparison counts it as **added**
 * and never as confirmed. The other direction holds too: an element that the Ist
 * anchored and the states dropped keeps its anchor in the comparison, because it
 * is established that the code was there.
 *
 * **A Soll is not a statement about the code.** It says what somebody holds to
 * be necessary. It enters no signed run and no audit pack
 * (`lib/audit-pack-build.ts`), and no wording here or in the views over it may
 * suggest otherwise.
 *
 * Pure: no React, no DOM, no network, no clock, no model call. The browser and
 * any route that ever stores this build the same thing from the same inputs, so
 * there is one answer to "what changes" and not two.
 */

/** Bumped when the derived record changes shape. */
export const PROCESS_TARGET_FORMAT_VERSION = 1;

/** The one sentence a Soll carries wherever it is shown. */
export const TARGET_DISCLAIMER =
  'A target model says what somebody holds to be necessary. It is not a statement about the code, '
  + 'it changes no run, and it is in no audit pack.';

/** Why a subject that exists only in the Soll carries no line anchor. */
export const NEED_WITHOUT_CODE = 'This exists only in the target model. No code was read for it, so it has no line anchor.';

/** How far the target has got with one subject. `dropped` subjects are not in the target at all. */
export type TargetDisposition = 'kept' | 'changed' | 'open' | 'dropped';

/**
 * Why a subject is open — and these are two facts, not two words for one.
 *
 * `clarify` is somebody's statement, made by an account at a time, with a name
 * beside it. `undecided` is the absence of any statement. A screen that shows
 * them as one teaches the reader that nobody looked when somebody did, or the
 * other way round.
 */
export type OpenReason = 'clarify' | 'undecided';

/**
 * Where a row's anchor comes from — or why it has none.
 *
 * The invariant this type exists for, asserted in `tests/process-target.spec.ts`:
 * **`anchor !== null` exactly when `anchorBasis === 'code'`**. Nothing else in
 * this module may produce a line range.
 */
export type AnchorBasis =
  /** Copied from the Ist element. The only basis that carries a line range. */
  | 'code'
  /** In the Ist, and the reconstruction found no line for it (2.4's `Unanchored`). */
  | 'unanchored'
  /** Only in the Soll: there is no code for it, so there is no anchor. C23-A06. */
  | 'need'
  /** Not established here. Rules carry this — see `buildTargetModel`. */
  | 'unknown';

export interface TargetAnchor {
  lineStart: number;
  lineEnd: number;
}

/** Who said so, when, in which state revision, and what they wrote beside it. */
export interface TargetDecision {
  account: { uid: string; name: string };
  /** ISO 8601, from 3.5's server clock — never re-stamped here. */
  confirmedAt: string;
  revision: number;
  note: string | null;
}

/** One element or one rule, as the Soll has it. */
export interface TargetSubject {
  /** The stable BPMN element id of 2.6, or a rule id `BR-nnn` of 3.4. */
  subject: string;
  kind: 'element' | 'rule';
  /** What the reader recognises: the element's label, or the rule id. */
  label: string;
  /** "Decision", "Service step", "Business rule" — the element's `kind` word, unchanged. */
  what: string;
  /** The state an account confirmed, or **null** when nobody has said anything. */
  state: ElementState | null;
  disposition: TargetDisposition;
  /** Set exactly when `disposition === 'open'`. */
  openReason: OpenReason | null;
  anchor: TargetAnchor | null;
  anchorBasis: AnchorBasis;
  /** `Unanchored` whenever there is no anchor to show, whatever the subject is called. */
  evidenceLabel: string | null;
  /** The Ist's reason, or `NEED_WITHOUT_CODE` for a subject that exists only here. */
  unanchoredReason: string | null;
  /** True when the Ist contains this subject. False for a need drawn without code. */
  fromIst: boolean;
  /** Null exactly when `state` is null. */
  decision: TargetDecision | null;
  plane: string | null;
  lane: string | null;
}

export interface TargetCounts {
  /** Everything considered: the Ist's subjects plus every subject the states name. */
  subjects: number;
  kept: number;
  changed: number;
  dropped: number;
  /** Open because an account asked for it to be clarified. */
  clarify: number;
  /** Open because nobody has said anything. Never added to `clarify`. */
  undecided: number;
  /** Of `subjects`: those that exist only in the Soll and therefore carry no anchor. */
  needsWithoutCode: number;
  elements: number;
  rules: number;
}

export interface TargetModel {
  formatVersion: number;
  processName: string;
  /** The file the Ist was reconstructed from. */
  fileName: string;
  /** Everything the Soll contains: the Ist minus what was dropped, plus the needs. */
  subjects: TargetSubject[];
  /** What the states dropped. Not part of the Soll — carried so the comparison can name it. */
  dropped: TargetSubject[];
  counts: TargetCounts;
  /** Counted, in one sentence. Never a claim about the code. */
  summary: string;
  disclaimer: string;
}

/* ------------------------------------------------------------------ *
 * The Soll.
 * ------------------------------------------------------------------ */

function anchorOf(element: ProcessMapElement): TargetAnchor | null {
  return element.anchor ? { lineStart: element.anchor.lineStart, lineEnd: element.anchor.lineEnd } : null;
}

function decisionOf(entry: StateEntry): TargetDecision {
  return {
    account: { uid: entry.account.uid, name: entry.account.name },
    confirmedAt: entry.confirmedAt,
    revision: entry.revision,
    note: entry.note,
  };
}

function dispositionOf(state: ElementState | null): TargetDisposition {
  if (state === null) return 'open';
  if (state === 'keep') return 'kept';
  if (state === 'change') return 'changed';
  if (state === 'drop') return 'dropped';
  return 'open';
}

function openReasonOf(state: ElementState | null): OpenReason | null {
  if (state === null) return 'undecided';
  return state === 'clarify' ? 'clarify' : null;
}

/** One subject of the Ist, with whatever the states say about it. */
function subjectFromIst(element: ProcessMapElement, entry: StateEntry | undefined): TargetSubject {
  const state = entry ? entry.state : null;
  const anchor = anchorOf(element);
  return {
    subject: element.id,
    kind: 'element',
    label: element.label,
    what: element.kind,
    state,
    disposition: dispositionOf(state),
    openReason: openReasonOf(state),
    anchor,
    anchorBasis: anchor ? 'code' : 'unanchored',
    evidenceLabel: anchor ? null : UNANCHORED,
    unanchoredReason: anchor ? null : element.unanchoredReason,
    fromIst: true,
    decision: entry ? decisionOf(entry) : null,
    plane: element.plane,
    lane: element.lane,
  };
}

/**
 * A subject the states name that the Ist does not contain — a need somebody drew.
 *
 * This is the function C23-A06 is about, and the only thing worth saying about
 * it is what it does **not** do: it takes no element, so it has nothing to copy
 * an anchor from, and it therefore cannot produce one by accident. The label is
 * the id, because that is all that is known; the note stays a note and is never
 * promoted to a name.
 */
function subjectFromNeed(entry: StateEntry): TargetSubject {
  return {
    subject: entry.subject,
    kind: entry.kind,
    label: entry.subject,
    what: entry.kind === 'rule' ? 'Business rule' : 'Step without code',
    state: entry.state,
    disposition: dispositionOf(entry.state),
    openReason: openReasonOf(entry.state),
    anchor: null,
    anchorBasis: 'need',
    evidenceLabel: UNANCHORED,
    unanchoredReason: NEED_WITHOUT_CODE,
    fromIst: false,
    decision: decisionOf(entry),
    plane: null,
    lane: null,
  };
}

/**
 * A rule of 3.4, with whatever the states say about it.
 *
 * The anchor basis is `unknown` on purpose. A business rule has no line range
 * of its own — `lib/abap/business-rule-set.ts` says why: a rule copied into
 * fourteen routines stands at fourteen places, and a range from the first to
 * the last would claim the nine hundred lines between them. This derivation is
 * handed the process map and the states, not the rule set, so it states nothing
 * about where `BR-004` stands; the rule set itself holds the places, and the
 * screen shows them from there.
 */
function subjectFromRule(id: string, entry: StateEntry | undefined): TargetSubject {
  const state = entry ? entry.state : null;
  return {
    subject: id,
    kind: 'rule',
    label: id,
    what: 'Business rule',
    state,
    disposition: dispositionOf(state),
    openReason: openReasonOf(state),
    anchor: null,
    anchorBasis: 'unknown',
    evidenceLabel: null,
    unanchoredReason: null,
    fromIst: true,
    decision: entry ? decisionOf(entry) : null,
    plane: null,
    lane: null,
  };
}

function countSubjects(all: readonly TargetSubject[]): TargetCounts {
  const counts: TargetCounts = {
    subjects: all.length,
    kept: 0,
    changed: 0,
    dropped: 0,
    clarify: 0,
    undecided: 0,
    needsWithoutCode: 0,
    elements: 0,
    rules: 0,
  };
  for (const subject of all) {
    if (subject.disposition === 'kept') counts.kept += 1;
    else if (subject.disposition === 'changed') counts.changed += 1;
    else if (subject.disposition === 'dropped') counts.dropped += 1;
    else if (subject.openReason === 'clarify') counts.clarify += 1;
    else counts.undecided += 1;
    if (!subject.fromIst) counts.needsWithoutCode += 1;
    if (subject.kind === 'rule') counts.rules += 1;
    else counts.elements += 1;
  }
  return counts;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Soll, out of the Ist and the states.
 *
 * `istRuleIds` is optional and is the ids of the rules 3.4 derived from the
 * same source. Hand them in and a rule nobody has spoken about is counted as
 * open, like an element nobody has spoken about. Leave them out and this
 * derivation knows only the rules the states name — which is a smaller answer,
 * not a wrong one, and the counters say which of the two you are reading
 * (`counts.rules`).
 *
 * A rule id the states name that is not in `istRuleIds` is a need without code,
 * like a drawn element. Without `istRuleIds` a named rule is taken to be in the
 * Ist, because a `BR-nnn` is produced by the engine out of the source and is not
 * something a reader invents.
 */
export function buildTargetModel(
  ist: ProcessMapModel,
  states: ProcessStates,
  istRuleIds?: readonly string[],
): TargetModel {
  const entries = states.bySubject;
  const kept: TargetSubject[] = [];
  const dropped: TargetSubject[] = [];
  const place = (subject: TargetSubject) => {
    (subject.disposition === 'dropped' ? dropped : kept).push(subject);
  };

  // The Ist's elements first, in the Ist's order — the order a reader already knows.
  const inIst = new Set<string>();
  for (const element of ist.elements) {
    inIst.add(element.id);
    place(subjectFromIst(element, entries[element.id]));
  }

  // Then the rules, in 3.4's order when they were handed in.
  const ruleIds = istRuleIds ? [...istRuleIds] : [];
  const knownRules = new Set(ruleIds);
  if (!istRuleIds) {
    for (const entry of Object.values(entries)) {
      if (entry.kind === 'rule' && !knownRules.has(entry.subject)) {
        knownRules.add(entry.subject);
        ruleIds.push(entry.subject);
      }
    }
    ruleIds.sort();
  }
  for (const id of ruleIds) {
    inIst.add(id);
    place(subjectFromRule(id, entries[id]));
  }

  // And last what the states name that the Ist does not have. Sorted by id so
  // the answer does not depend on the order a store happened to return keys in.
  const needs = Object.values(entries)
    .filter((entry) => !inIst.has(entry.subject))
    .sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
  for (const entry of needs) place(subjectFromNeed(entry));

  const counts = countSubjects([...kept, ...dropped]);
  const summary = counts.subjects === 0
    ? 'There is nothing to put a target model together from.'
    : `${count(counts.subjects, 'subject', 'subjects')}: ${counts.kept} kept, `
      + `${counts.changed} deliberately changed, ${counts.dropped} dropped, ${counts.clarify} to clarify, `
      + `${counts.undecided} undecided, and ${count(counts.needsWithoutCode, 'need', 'needs')} without code.`;

  return {
    formatVersion: PROCESS_TARGET_FORMAT_VERSION,
    processName: ist.processName,
    fileName: ist.fileName,
    subjects: kept,
    dropped,
    counts,
    summary,
    disclaimer: TARGET_DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ *
 * Ist against Soll.
 * ------------------------------------------------------------------ */

/**
 * What the comparison says about one subject. Exactly one per row.
 *
 * `added` is its own verdict and takes precedence over everything else, which
 * is C23-A06 in one line: a subject that exists only in the Soll is what
 * somebody wants, never what the code was shown to do. It is counted as added
 * even when an account has confirmed it — a confirmation of a need is still a
 * need.
 */
export type ComparisonVerdict = 'stays' | 'changes' | 'goes' | 'open' | 'added';

export interface ComparisonRow {
  subject: string;
  kind: 'element' | 'rule';
  label: string;
  what: string;
  verdict: ComparisonVerdict;
  /** The state an account confirmed, or **null** when nobody has said anything. */
  state: ElementState | null;
  /** Why this is open. Set on an `added` row too, where it does not decide the verdict. */
  openReason: OpenReason | null;
  inIst: boolean;
  inTarget: boolean;
  /** The Ist's line range, copied. Never a neighbour's, never a parent's. */
  anchor: TargetAnchor | null;
  anchorBasis: AnchorBasis;
  evidenceLabel: string | null;
  unanchoredReason: string | null;
  decision: TargetDecision | null;
  /** The line a reader sees. Counted words and names only. */
  sentence: string;
}

export interface ComparisonCounts {
  subjects: number;
  stays: number;
  changes: number;
  goes: number;
  open: number;
  added: number;
  /** Of the `open` rows only, and kept in two fields because they are two facts. */
  clarify: number;
  undecided: number;
  /** Of the `added` rows: how many carry no anchor. C23-A06 makes this all of them. */
  addedWithoutAnchor: number;
}

export interface Comparison {
  formatVersion: number;
  processName: string;
  fileName: string;
  /** Every subject, once: the Ist's order, then the rules, then the needs. */
  rows: ComparisonRow[];
  byVerdict: Record<ComparisonVerdict, ComparisonRow[]>;
  counts: ComparisonCounts;
  summary: string;
  disclaimer: string;
}

function verdictOf(row: { inIst: boolean; inTarget: boolean; state: ElementState | null }): ComparisonVerdict {
  if (!row.inIst) return row.inTarget ? 'added' : 'goes';
  if (!row.inTarget) return 'goes';
  if (row.state === 'keep') return 'stays';
  if (row.state === 'change') return 'changes';
  return 'open';
}

function whereWords(anchor: TargetAnchor | null): string {
  if (!anchor) return '';
  return anchor.lineEnd === anchor.lineStart
    ? ` The code for it is at line ${anchor.lineStart}.`
    : ` The code for it is at lines ${anchor.lineStart} to ${anchor.lineEnd}.`;
}

function sentenceFor(row: Omit<ComparisonRow, 'sentence'>): string {
  const who = row.decision ? row.decision.account.name : null;
  switch (row.verdict) {
    case 'stays':
      return `Stays as the code has it${who ? `, kept by ${who}` : ''}.`;
    case 'changes':
      return `Stays and is deliberately changed${who ? `, by ${who}` : ''}. What the change is, nobody has written down here.`;
    case 'goes':
      return `Not in the target model${who ? `, dropped by ${who}` : ''}.${whereWords(row.anchor)}`;
    case 'added':
      return `Added: it is in the target model only. ${NEED_WITHOUT_CODE}`;
    case 'open':
    default:
      return row.openReason === 'clarify'
        ? `Open: ${who ?? 'an account'} asked for this to be clarified.`
        : 'Open: nobody has said anything about this yet.';
  }
}

function rowFrom(subject: TargetSubject, inIst: boolean, inTarget: boolean): ComparisonRow {
  const base = {
    subject: subject.subject,
    kind: subject.kind,
    label: subject.label,
    what: subject.what,
    verdict: verdictOf({ inIst, inTarget, state: subject.state }),
    state: subject.state,
    openReason: subject.openReason,
    inIst,
    inTarget,
    anchor: subject.anchor,
    anchorBasis: subject.anchorBasis,
    evidenceLabel: subject.evidenceLabel,
    unanchoredReason: subject.unanchoredReason,
    decision: subject.decision,
  };
  return { ...base, sentence: sentenceFor(base) };
}

/**
 * The Ist and the Soll side by side: what stays, what changes, what goes, what
 * is open, what was added.
 *
 * **Why this is not `diffProcessRevisions`.** That function compares two BPMN
 * files and reports, per element, which of six fields differ — it is about two
 * drawings of the same thing. This one compares a drawing against a set of
 * statements about it, and its rows exist for subjects that are in no drawing
 * at all (a rule, a need nobody drew). The two share the identity that makes
 * either possible — 2.6's stable element id — and nothing else worth sharing:
 * the field-level `before`/`after` of a revision diff has no meaning here,
 * because a `change` state says *that* something changes and never *what*.
 * Wiring this through that one would have meant inventing an "after" side, and
 * inventing is the thing this step is measured on not doing.
 *
 * `ist` is read rather than trusted: whether a subject is in the Ist is decided
 * against `ist.elements` for every element, not from the flag the target model
 * carries, so the two cannot drift apart.
 */
export function compareIstSoll(ist: ProcessMapModel, target: TargetModel): Comparison {
  const istIds = new Set(ist.elements.map((element) => element.id));
  const inTarget = new Set(target.subjects.map((subject) => subject.subject));

  const rows: ComparisonRow[] = [];
  for (const subject of [...target.subjects, ...target.dropped]) {
    const fromIst = subject.kind === 'element' ? istIds.has(subject.subject) : subject.fromIst;
    rows.push(rowFrom(subject, fromIst, inTarget.has(subject.subject)));
  }

  // Back into the order a reader has in front of them: the Ist's elements as
  // the map draws them, then the rules, then everything that is in neither.
  const istOrder = new Map(ist.elements.map((element, index) => [element.id, index]));
  const rank = (row: ComparisonRow): number => {
    const index = istOrder.get(row.subject);
    if (index !== undefined) return index;
    return row.kind === 'rule' ? 1_000_000 : 2_000_000;
  };
  rows.sort((a, b) => rank(a) - rank(b));

  const byVerdict: Record<ComparisonVerdict, ComparisonRow[]> = {
    stays: [],
    changes: [],
    goes: [],
    open: [],
    added: [],
  };
  for (const row of rows) byVerdict[row.verdict].push(row);

  const open = byVerdict.open;
  const counts: ComparisonCounts = {
    subjects: rows.length,
    stays: byVerdict.stays.length,
    changes: byVerdict.changes.length,
    goes: byVerdict.goes.length,
    open: open.length,
    added: byVerdict.added.length,
    clarify: open.filter((row) => row.openReason === 'clarify').length,
    undecided: open.filter((row) => row.openReason === 'undecided').length,
    addedWithoutAnchor: byVerdict.added.filter((row) => row.anchor === null).length,
  };

  const summary = counts.subjects === 0
    ? 'There is nothing to compare.'
    : `${count(counts.subjects, 'subject', 'subjects')}: ${counts.stays} stay, ${counts.changes} change, `
      + `${counts.goes} go, ${counts.open} are open (${counts.clarify} to clarify, ${counts.undecided} undecided) `
      + `and ${counts.added} were added without code.`;

  return {
    formatVersion: PROCESS_TARGET_FORMAT_VERSION,
    processName: ist.processName,
    fileName: ist.fileName,
    rows,
    byVerdict,
    counts,
    summary,
    disclaimer: TARGET_DISCLAIMER,
  };
}

/** The five verdicts in the order a comparison shows them. */
export const COMPARISON_VERDICTS: readonly ComparisonVerdict[] = Object.freeze([
  'stays',
  'changes',
  'goes',
  'open',
  'added',
] as ComparisonVerdict[]);

/** The heading each group of the comparison carries. Counted words, no adjectives. */
export const VERDICT_LABELS: Record<ComparisonVerdict, string> = Object.freeze({
  stays: 'Stays',
  changes: 'Changes deliberately',
  goes: 'Not in the target',
  open: 'Open',
  added: 'Added without code',
});

/** How a row's anchor reads in one short phrase — or what stands there instead. */
export function anchorWords(row: { anchor: TargetAnchor | null; anchorBasis: AnchorBasis }): string | null {
  if (row.anchor) {
    return row.anchor.lineEnd === row.anchor.lineStart
      ? `line ${row.anchor.lineStart}`
      : `lines ${row.anchor.lineStart} to ${row.anchor.lineEnd}`;
  }
  return row.anchorBasis === 'unknown' ? null : UNANCHORED;
}
