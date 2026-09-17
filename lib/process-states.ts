/**
 * Keep · Change deliberately · Drop · Clarify — roadmap 3.5.
 *
 * **"Keep" does not mean "keep this code". It means "the business still needs
 * this".** A confirmation is a statement about the *need*, which is why the
 * roadmap calls it a Bedarfsrevision and says in the same line: no code
 * conservation. Nothing in this module, and nothing in a view over it, may let
 * a reader believe that choosing Keep freezes an ABAP line, protects a FORM
 * from being rewritten, or says anything at all about how the need is met. The
 * four words are answers to one question — *does the business still need this,
 * and in what shape?* — and the code is only where the question came from.
 *
 * Two kinds of subject and one vocabulary for both: a BPMN element id of 2.6,
 * and a business rule id `BR-nnn` of 3.4. A subject with no entry is **not** in
 * a fifth state called "undecided"; it has no state at all, and `undecided` is
 * counted as the absence. That is why `readProcessStates` is handed the list of
 * subjects that exist and does not invent it out of the entries it was given:
 * entries can only ever say what somebody answered, never what was asked.
 *
 * No imports, by the same reasoning as `lib/abcd-classification.ts`: the route
 * that stores a confirmation and the client component that offers one both load
 * this file, so it must pull neither the ABAP engine nor `next/server` behind
 * it. The shapes it reads — a rule, an element — are described structurally
 * here instead of imported from `lib/abap/business-rule-set.ts`.
 *
 * **Not evidence.** A confirmation records that an account said something at a
 * time. It enters no signed run and no audit pack, and accountability is the
 * signed-in account — a self-declaration, not an organisational mandate.
 */

/** Bumped when the stored record changes shape. */
export const PROCESS_STATE_FORMAT_VERSION = 1;

/** The subcollection under `projects/{projectId}`. Written only through the Admin SDK. */
export const PROCESS_STATE_COLLECTION = 'process_states';

/** The longest note a confirmation may carry, in characters. */
export const MAX_STATE_NOTE = 2_000;

/** The most subjects one stored revision may hold. The largest starter example draws 73 elements. */
export const MAX_STATE_ENTRIES = 5_000;

/** The most confirmations one request may make. A reader confirms a card at a time; a draft, a page of them. */
export const MAX_STATE_CHOICES = 200;

export type ElementState = 'keep' | 'change' | 'drop' | 'clarify';

export interface StateEntry {
  /** Eine stabile BPMN-Element-Id (aus 2.6) oder eine Regel-Id `BR-nnn` (3.4). */
  subject: string;
  kind: 'element' | 'rule';
  state: ElementState;
  /** Was das Konto dazugeschrieben hat, oder null. */
  note: string | null;
  /** Wer bestätigt hat — Anzeigename und uid, beide vom Server. */
  account: { uid: string; name: string };
  /** Serveruhr, ISO 8601. Nie aus dem Browser. */
  confirmedAt: string;
  /** Die Revision, die diese Bestätigung angelegt hat. */
  revision: number;
}

export interface ProcessStates {
  /** Schlüssel ist `subject`. Wer hier fehlt, ist unentschieden — das ist kein Zustand, sondern seine Abwesenheit. */
  bySubject: Record<string, StateEntry>;
  counts: { keep: number; change: number; drop: number; clarify: number; undecided: number };
}

/** The four, in the order the mockup's segmented control shows them. */
export const ELEMENT_STATES: readonly ElementState[] = Object.freeze([
  'keep',
  'change',
  'drop',
  'clarify',
] as ElementState[]);

/**
 * What each word says on screen.
 *
 * "Change deliberately" and not "Change": the deliberateness is the point. A
 * process that changed because nobody looked is what this product exists to
 * find; a process that changes because somebody decided it should is a result.
 */
export const STATE_LABELS: Record<ElementState, string> = Object.freeze({
  keep: 'Keep',
  change: 'Change deliberately',
  drop: 'Drop',
  clarify: 'Clarify',
});

/**
 * The sentence under the four words, once per screen.
 *
 * It exists because "Keep" is the word most easily misread, and a label alone
 * cannot carry the correction. A reader who takes Keep for "freeze this ABAP"
 * has misunderstood the product, and then the wording is at fault.
 */
export const STATE_MEANING =
  'These four words state what the business needs, not what the code must stay. Keep means the need remains —'
  + ' it does not preserve a line of ABAP, and it decides nothing about how the need is met.';

export function isElementState(value: unknown): value is ElementState {
  return typeof value === 'string' && (ELEMENT_STATES as readonly string[]).includes(value);
}

export function isStateKind(value: unknown): value is StateEntry['kind'] {
  return value === 'element' || value === 'rule';
}

/**
 * Must this choice say why?
 *
 * Change and Drop move the need away from what the code does, and a move with
 * no reason beside it is a decision nobody can review later — the mockup marks
 * both fields required. Clarify is a question that is allowed to be short, and
 * Keep adds nothing to the need, so neither is forced.
 */
export function noteRequired(state: ElementState): boolean {
  return state === 'change' || state === 'drop';
}

/** The label of the note field for each state — the mockup's wording, in one place. */
export const NOTE_LABELS: Record<ElementState, string> = Object.freeze({
  keep: 'Note',
  change: 'New rule text',
  drop: 'Reason for dropping',
  clarify: 'Question to clarify',
});

function isAccount(value: unknown): value is StateEntry['account'] {
  const a = value as StateEntry['account'] | null;
  return !!a && typeof a.uid === 'string' && a.uid !== '' && typeof a.name === 'string' && a.name !== '';
}

export function isStateEntry(value: unknown): value is StateEntry {
  const e = value as StateEntry | null;
  return (
    !!e
    && typeof e.subject === 'string'
    && e.subject !== ''
    && isStateKind(e.kind)
    && isElementState(e.state)
    && (e.note === null || typeof e.note === 'string')
    && isAccount(e.account)
    && typeof e.confirmedAt === 'string'
    && e.confirmedAt !== ''
    && Number.isInteger(e.revision)
    && e.revision >= 1
  );
}

/**
 * Rein: zählt über die Elemente und Regeln, die es wirklich gibt.
 *
 * Three things it refuses to do, each of which was the easy version:
 *
 *   1. it does not count `undecided` as "subjects minus entries". An entry for
 *      a subject that no longer exists — an element deleted from the model, a
 *      rule that is not in this source — is not a state of anything, so it is
 *      dropped, and dropping it would otherwise make `undecided` too small.
 *   2. it does not trust `kind`. An entry calling `BR-001` an element is not a
 *      state of the rule `BR-001`; it is a state of an element that does not
 *      exist, and it is dropped for that reason rather than quietly fixed.
 *   3. when a subject carries more than one entry, the **highest revision
 *      wins** rather than the last one in the array. The order of an array that
 *      came out of a store is not a fact about when anything was said.
 */
export function readProcessStates(
  entries: StateEntry[],
  subjects: { elements: string[]; rules: string[] },
): ProcessStates {
  const kindOf = new Map<string, StateEntry['kind']>();
  for (const id of subjects.elements) if (id) kindOf.set(id, 'element');
  // A rule id and an element id cannot collide — `BR-nnn` is not a BPMN id —
  // but if a source ever produced one, the rule wins here and the element is
  // then unreachable, which is visible as an undecided subject rather than as a
  // state on the wrong thing.
  for (const id of subjects.rules) if (id) kindOf.set(id, 'rule');

  const bySubject: Record<string, StateEntry> = {};
  for (const entry of entries) {
    if (!isStateEntry(entry)) continue;
    if (kindOf.get(entry.subject) !== entry.kind) continue;
    const held = bySubject[entry.subject];
    if (!held || entry.revision > held.revision) bySubject[entry.subject] = entry;
  }

  const counts = { keep: 0, change: 0, drop: 0, clarify: 0, undecided: 0 };
  for (const entry of Object.values(bySubject)) counts[entry.state] += 1;
  counts.undecided = kindOf.size - Object.keys(bySubject).length;

  return { bySubject, counts };
}

/* ------------------------------------------------------------------ *
 * W22-A14 — a changed confirmed rule marks only the derivations it has.
 * ------------------------------------------------------------------ */

/**
 * One rule and the elements drawn from it.
 *
 * Built by the caller out of `rulesForElement(set, nodeId)`: a rule names
 * skeleton nodes in `processElements`, an element carries the skeleton node it
 * was drawn from in `cc:trace/@node`, and the join of the two is the whole of
 * what "derived from" means here. It is deliberately not "everything in the
 * same sub-process", not "everything downstream" and not "the whole model" —
 * a marking that marks everything tells the reader nothing and costs them the
 * one thing a marking is for, which is knowing where to look.
 */
export interface RuleLink {
  /** `BR-nnn`. */
  rule: string;
  /** The BPMN element ids this rule decides about. */
  elements: string[];
}

/**
 * Why a derivation is marked. There is no `rule-kept`: a rule confirmed as Keep
 * has not moved, so nothing drawn from it has to be looked at again.
 */
export type DerivationReason = 'rule-changed' | 'rule-dropped' | 'rule-open';

const REASON_OF: Partial<Record<ElementState, DerivationReason>> = {
  change: 'rule-changed',
  drop: 'rule-dropped',
  clarify: 'rule-open',
};

export interface DerivationMark {
  /** The BPMN element id that is marked. */
  element: string;
  /** The rules that moved under it, by id. */
  rules: Array<{ rule: string; state: ElementState; reason: DerivationReason; revision: number }>;
  /**
   * True when the element carries a confirmation of its own that was made
   * before the newest of those rules moved: somebody confirmed a need that has
   * since changed, and that is worth more than the plain mark.
   */
  stale: boolean;
  /** One sentence naming the rules. It never says the element is wrong. */
  sentence: string;
}

/**
 * Which derivations a changed confirmed rule marks — and no others.
 *
 * The rule of the acceptance item, as a function: only elements that appear in
 * the `elements` of a rule whose confirmation is Change, Drop or Clarify are
 * returned. An element that is drawn from a rule confirmed as Keep is not
 * returned, an element drawn from an unconfirmed rule is not returned, and an
 * element drawn from no rule at all is not returned. Sorted by element id so
 * that two runs over the same input produce the same list.
 */
export function markAffectedDerivations(
  states: ProcessStates,
  links: readonly RuleLink[],
): DerivationMark[] {
  const byElement = new Map<string, DerivationMark['rules']>();

  for (const link of links) {
    const entry = states.bySubject[link.rule];
    if (!entry || entry.kind !== 'rule') continue;
    const reason = REASON_OF[entry.state];
    if (!reason) continue;
    for (const element of link.elements) {
      if (!element) continue;
      const held = byElement.get(element) ?? [];
      if (held.some((r) => r.rule === link.rule)) continue;
      held.push({ rule: link.rule, state: entry.state, reason, revision: entry.revision });
      byElement.set(element, held);
    }
  }

  const marks: DerivationMark[] = [];
  for (const [element, rules] of byElement) {
    rules.sort((a, b) => (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
    const own = states.bySubject[element];
    const newest = rules.reduce((max, r) => Math.max(max, r.revision), 0);
    const stale = !!own && own.kind === 'element' && own.revision < newest;
    marks.push({ element, rules, stale, sentence: sentenceFor(rules, stale) });
  }
  marks.sort((a, b) => (a.element < b.element ? -1 : a.element > b.element ? 1 : 0));
  return marks;
}

function sentenceFor(rules: DerivationMark['rules'], stale: boolean): string {
  const grouped = new Map<ElementState, string[]>();
  for (const r of rules) grouped.set(r.state, [...(grouped.get(r.state) ?? []), r.rule]);
  const parts = ELEMENT_STATES
    .filter((state) => grouped.has(state))
    .map((state) => `${STATE_LABELS[state]}: ${grouped.get(state)!.join(', ')}`);
  const one = rules.length === 1;
  return `${parts.join(' · ')}. This element was drawn from ${one ? 'that rule' : 'those rules'}`
    + (stale
      ? `, and its own confirmation is older than ${one ? 'it' : 'the newest of them'}.`
      : '.');
}

/** The mark for one element, or null — what a card asks for. */
export function markFor(marks: readonly DerivationMark[], element: string): DerivationMark | null {
  return marks.find((m) => m.element === element) ?? null;
}

/* ------------------------------------------------------------------ *
 * What a screen is handed.
 * ------------------------------------------------------------------ */

/**
 * One subject, as a card names it.
 *
 * `anchor` is null when the subject stands at no line range, and the view then
 * shows nothing rather than a placeholder: C23-A06 — a need without code gets
 * no invented anchor.
 */
export interface StateSubject {
  subject: string;
  kind: StateEntry['kind'];
  /** What it is called on screen: a rule's label, an element's name. */
  label: string;
  /** One line under the label: the rule text, or the element's kind. */
  detail: string;
  /** "lines 224 to 232", or null. */
  anchor: string | null;
}

/** What `GET` hands a screen: the subjects that exist, the confirmations made, and the links between them. */
export interface ProcessStateView {
  formatVersion: number;
  /** The newest Bedarfsrevision, or 0 when the process has none yet. */
  revision: number;
  /** The model revision the need is stated against. Always 1 — the reconstructed Ist. */
  baselineRevision: number;
  subjects: StateSubject[];
  entries: StateEntry[];
  links: RuleLink[];
}

export function subjectIdsOf(subjects: readonly StateSubject[]): { elements: string[]; rules: string[] } {
  return {
    elements: subjects.filter((s) => s.kind === 'element').map((s) => s.subject),
    rules: subjects.filter((s) => s.kind === 'rule').map((s) => s.subject),
  };
}

/** What a browser sends for one confirmation. Account, time and revision are the server's and are not in it. */
export interface StateChoiceInput {
  subject: string;
  kind: StateEntry['kind'];
  state: ElementState;
  note?: string | null;
}

export type ChoiceRefusal =
  | 'bad-request'
  | 'unknown-subject'
  | 'note-required'
  | 'note-too-long'
  | 'too-many';

export type ChoiceCheck =
  | { ok: true; choices: StateChoiceInput[] }
  | { ok: false; code: ChoiceRefusal; error: string };

/**
 * Is this something a revision may record?
 *
 * Checked here rather than in the route so that the browser can refuse the same
 * thing for the same reason before it asks, and a test can read both answers
 * without a server. It decides nothing about the account or the time — those
 * are never in a body and so are never checked out of one.
 */
export function checkStateChoices(
  value: unknown,
  subjects: { elements: string[]; rules: string[] },
): ChoiceCheck {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, code: 'bad-request', error: 'Expected at least one confirmation.' };
  }
  if (value.length > MAX_STATE_CHOICES) {
    return {
      ok: false,
      code: 'too-many',
      error: `One request confirms at most ${MAX_STATE_CHOICES} subjects; this one carries ${value.length}.`,
    };
  }
  const kindOf = new Map<string, StateEntry['kind']>();
  for (const id of subjects.elements) kindOf.set(id, 'element');
  for (const id of subjects.rules) kindOf.set(id, 'rule');

  const choices: StateChoiceInput[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const choice = raw as Partial<StateChoiceInput> | null;
    if (!choice || typeof choice.subject !== 'string' || !isStateKind(choice.kind) || !isElementState(choice.state)) {
      return { ok: false, code: 'bad-request', error: 'Every confirmation needs a subject, a kind and one of the four states.' };
    }
    if (kindOf.get(choice.subject) !== choice.kind) {
      // Named, because the reader can act on it: the model or the source moved
      // under the screen and the page has to be reloaded. It leaks nothing —
      // the subject is one the caller just sent.
      return {
        ok: false,
        code: 'unknown-subject',
        error: `This process has no ${choice.kind} called ${choice.subject}. Reload the process and confirm again.`,
      };
    }
    const note = typeof choice.note === 'string' ? choice.note.trim() : '';
    if (noteRequired(choice.state) && note === '') {
      return {
        ok: false,
        code: 'note-required',
        error: `${STATE_LABELS[choice.state]} needs a reason: ${NOTE_LABELS[choice.state].toLowerCase()} for ${choice.subject}.`,
      };
    }
    if (note.length > MAX_STATE_NOTE) {
      return {
        ok: false,
        code: 'note-too-long',
        error: `A note holds at most ${MAX_STATE_NOTE} characters; the one for ${choice.subject} has ${note.length}.`,
      };
    }
    if (seen.has(choice.subject)) {
      return {
        ok: false,
        code: 'bad-request',
        error: `${choice.subject} is confirmed twice in the same request, and the two answers disagree about which is the newer.`,
      };
    }
    seen.add(choice.subject);
    choices.push({ subject: choice.subject, kind: choice.kind, state: choice.state, note: note === '' ? null : note });
  }
  return { ok: true, choices };
}

/**
 * The entries of the next revision: what was already confirmed, with this
 * request's answers written over it.
 *
 * A snapshot and not a delta, and each entry keeps the account, the time and
 * the revision of the confirmation that **made** it — so a subject confirmed at
 * revision 2 and untouched since still shows the name and the time of revision
 * 2 when it is read at revision 9. That is what "jede Bestätigung zeigt Name
 * und Zeit" has to mean; a snapshot that restamped every row would show one
 * name and one time for work that several people did on different days.
 */
export function applyStateChoices(
  held: readonly StateEntry[],
  choices: readonly StateChoiceInput[],
  made: { account: StateEntry['account']; confirmedAt: string; revision: number },
): StateEntry[] {
  const next = new Map<string, StateEntry>();
  for (const entry of held) if (isStateEntry(entry)) next.set(entry.subject, entry);
  for (const choice of choices) {
    next.set(choice.subject, {
      subject: choice.subject,
      kind: choice.kind,
      state: choice.state,
      note: choice.note ?? null,
      account: made.account,
      confirmedAt: made.confirmedAt,
      revision: made.revision,
    });
  }
  return [...next.values()].sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
}

/** "12 kept, 3 to change, 1 dropped, 2 to clarify, 55 undecided." Counted, never rounded into a claim. */
export function statesSentence(states: ProcessStates): string {
  const c = states.counts;
  const total = c.keep + c.change + c.drop + c.clarify + c.undecided;
  if (total === 0) return 'This process has no elements and no rules to confirm.';
  return `${c.keep} kept, ${c.change} to change, ${c.drop} dropped, ${c.clarify} to clarify,`
    + ` ${c.undecided} of ${total} not yet confirmed.`;
}
