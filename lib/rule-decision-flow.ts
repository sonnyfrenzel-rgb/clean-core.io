/**
 * The business rules as a guided decision — roadmap 3.0.20 "with it", part (2).
 *
 * Pure: no React, no network, no model. It joins what the engine explains about
 * each rule (`lib/abap/business-rule-set-explain.ts`) with what is on record
 * (`lib/process-states.ts`, the need revisions the `process-states` route
 * writes through the Admin SDK), and gives the Business view three things:
 *
 *   - the **flow** — the rules by business topic, weightiest first, each with
 *     the engine's proposal and the answer on record, and which rule is next;
 *   - the **one-click answer** — a proposal taken over as a choice the route
 *     accepts: *Move to configuration* is a Keep whose value source is the
 *     customizing table, *Move to SAP standard* a Keep with the answer
 *     `standard` (owner decision 21.10.2026 (5), written by the route through
 *     the Admin SDK — before it, a Keep whose note started with the words,
 *     which is still read as standard), *Change the value* a Change with the
 *     new value and its source, *Drop* a Drop with its reason;
 *   - the **workshop view** — open points, who decided what, and what changed
 *     in the latest session, read off the entries of the latest revision (each
 *     carries its account, its server time and the revision that set it).
 *
 * A proposal decides nothing. An answer is the self-declaration of the
 * signed-in account, never part of the signed run.
 */
import { VALUE_SOURCE_LABELS, sameAnswer, type ProcessStateView, type StateChoiceInput, type StateEntry, type ValueSourceKind } from './process-states';
import {
  basketTopics,
  RULE_PROPOSAL_LABELS,
  type ImpactLevel,
  type RuleExplanation,
  type RuleProposalKind,
  type RuleSetExplanation,
  type RuleTopic,
} from './abap/business-rule-set-explain';

/* --------------------------------------------------------------- answers */

/** The answers a reader can give a rule here: the five proposals, and a question for somebody else. */
export type RuleDecisionKind = RuleProposalKind | 'clarify';

export const RULE_DECISION_KINDS: readonly RuleDecisionKind[] = Object.freeze([
  'keep',
  'configure',
  'standard',
  'change-value',
  'drop',
  'clarify',
] as RuleDecisionKind[]);

export const RULE_DECISION_LABELS: Readonly<Record<RuleDecisionKind, string>> = Object.freeze({
  ...RULE_PROPOSAL_LABELS,
  clarify: 'Ask someone',
});

/** What each answer means for the new solution — one line under it. */
export const RULE_DECISION_MEANINGS: Readonly<Record<RuleDecisionKind, string>> = Object.freeze({
  keep: 'The new solution must do the same.',
  configure: 'The need stays; the value moves out of the code into configuration.',
  standard: 'The need stays; SAP standard is to meet it instead of custom code.',
  'change-value': 'The need stays with a different value — say which.',
  drop: 'No longer needed — say why.',
  clarify: 'Somebody else must answer — say who and what.',
});

/**
 * The words a note of *Move to SAP standard* started with before the answer
 * had a value of its own — how such an older Keep is still read back as standard.
 */
export const STANDARD_NOTE_PREFIX = 'Move to SAP standard';

/** The answer on record, as one of the six — or null when there is none. */
export function decisionKindOf(entry: Pick<StateEntry, 'state' | 'note' | 'valueSource' | 'answer'> | null | undefined): RuleDecisionKind | null {
  if (!entry) return null;
  if (entry.state === 'clarify') return 'clarify';
  if (entry.state === 'drop') return 'drop';
  if (entry.state === 'change') return 'change-value';
  if (entry.answer === 'standard') return 'standard';
  if (entry.valueSource?.kind === 'customizing') return 'configure';
  // Recorded before 3.0.20 (5): a Keep whose note said so.
  if ((entry.note ?? '').startsWith(STANDARD_NOTE_PREFIX)) return 'standard';
  return 'keep';
}

/** The note worth showing: the bare "Move to SAP standard." marker repeats the answer and is left out. */
export function shownNote(note: string | null | undefined): string | null {
  const text = (note ?? '').trim();
  return text === '' || text === `${STANDARD_NOTE_PREFIX}.` ? null : text;
}

/** Change, Drop and a question need words: the route refuses a Change or Drop without them, and a question without one asks nothing. */
export const decisionNeedsNote = (kind: RuleDecisionKind): boolean => kind === 'change-value' || kind === 'drop' || kind === 'clarify';

/** A new value says where it is to come from (`valueSourceRequired`). */
export const decisionNeedsSource = (kind: RuleDecisionKind): boolean => kind === 'change-value';

/**
 * The note a one-click answer starts with: the engine's reason when the
 * reader takes over a proposal to drop (the reason is what makes a Drop
 * reviewable later), nothing otherwise. The reader can always rewrite it.
 */
export function startingNote(kind: RuleDecisionKind, explanation: Pick<RuleExplanation, 'proposal'> | null): string {
  if (kind === 'drop' && explanation?.proposal.kind === 'drop') return explanation.proposal.reason.text;
  return '';
}

/** The answer as the choice the `process-states` route stores. Nothing it does not already accept. */
export function choiceOf(ruleId: string, kind: RuleDecisionKind, note: string, sourceKind?: ValueSourceKind | null): StateChoiceInput {
  const text = note.trim();
  const said = text === '' ? null : text;
  switch (kind) {
    case 'keep':
      return { subject: ruleId, kind: 'rule', state: 'keep', note: said, valueSource: null, appliesTo: [] };
    case 'configure':
      return { subject: ruleId, kind: 'rule', state: 'keep', note: said, valueSource: { kind: 'customizing', note: null }, appliesTo: [] };
    case 'standard':
      return { subject: ruleId, kind: 'rule', state: 'keep', note: said, valueSource: null, appliesTo: [], answer: 'standard' };
    case 'change-value':
      return {
        subject: ruleId,
        kind: 'rule',
        state: 'change',
        note: said,
        valueSource: { kind: sourceKind ?? 'business-requirement', note: null },
        appliesTo: [],
      };
    case 'drop':
      return { subject: ruleId, kind: 'rule', state: 'drop', note: said, appliesTo: [] };
    case 'clarify':
      return { subject: ruleId, kind: 'rule', state: 'clarify', note: said, appliesTo: [] };
  }
}

/** What keeps a one-click answer from being recorded, or null. */
export function decisionProblem(kind: RuleDecisionKind, note: string): 'note-missing' | null {
  return decisionNeedsNote(kind) && note.trim() === '' ? 'note-missing' : null;
}

/* ------------------------------------------------------------------ flow */

/** The latest rule entries on record, by rule id. */
export function latestRuleEntries(view: ProcessStateView | null): Record<string, StateEntry> {
  const out: Record<string, StateEntry> = {};
  if (!view) return out;
  for (const entry of view.entries) {
    if (entry.kind !== 'rule') continue;
    const held = out[entry.subject];
    if (!held || entry.revision > held.revision) out[entry.subject] = entry;
  }
  return out;
}

/** Decided: kept, configured, moved to the standard, changed or dropped. A question is still open. */
export const isDecided = (kind: RuleDecisionKind | null): boolean => kind !== null && kind !== 'clarify';

export interface FlowRule {
  id: string;
  proposal: RuleProposalKind;
  decision: RuleDecisionKind | null;
  /** The answer on record differs from the engine's proposal — a point to discuss. */
  deviates: boolean;
  impact: ImpactLevel;
}

export interface FlowTopic {
  topic: RuleTopic;
  label: string;
  lead: string;
  rules: FlowRule[];
  decided: number;
  total: number;
  /** Technical settings are set apart and can be answered together. */
  apart: boolean;
}

export interface RuleFlow {
  topics: FlowTopic[];
  decided: number;
  total: number;
  /** The weightiest rule nobody has decided yet, in reading order; null when every rule is decided. */
  next: string | null;
  /** The technical settings still open — what "Keep all technical settings" answers at once. */
  openTechnical: string[];
}

export function ruleFlow(explanation: RuleSetExplanation, entries: Readonly<Record<string, StateEntry>>): RuleFlow {
  const byId = new Map(explanation.rules.map((r) => [r.id, r]));
  // By basket (owner decision 21.10.2026): the business topics, then the technical rules, then the undetermined.
  const topics: FlowTopic[] = basketTopics(explanation).map((t) => {
    const rules = t.ruleIds.map((id): FlowRule => {
      const e = byId.get(id);
      const decision = decisionKindOf(entries[id]);
      const proposal = e?.proposal.kind ?? 'keep';
      return { id, proposal, decision, deviates: isDecided(decision) && decision !== proposal, impact: e?.impact.level ?? 'low' };
    });
    return {
      topic: t.topic,
      label: t.label,
      lead: t.lead,
      rules,
      decided: rules.filter((r) => isDecided(r.decision)).length,
      total: rules.length,
      // The technical rules and the undetermined are set apart (owner decision 21.10.2026, the rule baskets).
      apart: t.topic === 'technical' || t.topic === 'undetermined',
    };
  });
  const all = topics.flatMap((t) => t.rules);
  const business = topics.filter((t) => !t.apart).flatMap((t) => t.rules);
  return {
    topics,
    decided: all.filter((r) => isDecided(r.decision)).length,
    total: all.length,
    next: (business.find((r) => !isDecided(r.decision)) ?? all.find((r) => !isDecided(r.decision)))?.id ?? null,
    openTechnical: topics.filter((t) => t.topic === 'technical').flatMap((t) => t.rules).filter((r) => !isDecided(r.decision)).map((r) => r.id),
  };
}

/* -------------------------------------------------------------- workshop */

export interface WorkshopDecision {
  id: string;
  kind: RuleDecisionKind;
  by: string;
  at: string;
  note: string | null;
}

export interface WorkshopView {
  /** Rules without a decision, weightiest first; a question carries what was asked and by whom. */
  open: Array<{ id: string; impact: ImpactLevel; question: string | null; askedBy: string | null }>;
  /** Per account, its decisions, latest first; accounts by their latest answer. */
  byAccount: Array<{ uid: string; name: string; decisions: WorkshopDecision[] }>;
  /** The days answers were recorded on (server time, `YYYY-MM-DD`), newest first, with how many. */
  sessions: Array<{ day: string; count: number }>;
  /** What the latest session recorded; null when nothing is on record. */
  latest: { day: string; decisions: WorkshopDecision[] } | null;
  /** The session before the latest, or null when the latest is the first. */
  previousDay: string | null;
  /** Decisions that differ from the engine's proposal — the points worth discussing. */
  deviations: Array<WorkshopDecision & { proposal: RuleProposalKind }>;
}

const dayOf = (iso: string): string => iso.slice(0, 10);
const newestFirst = (a: { at: string }, b: { at: string }) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/**
 * The workshop view of the rules. Read off the latest revision: every entry
 * there carries who answered, when and in which revision, so the sessions and
 * "what changed in the latest one" need no second read. What an answer
 * replaced is in the earlier revisions; `ruleChanges` reads it from those
 * (3.0.20 (4)), and the workshop shows the two side by side.
 */
export function workshopView(explanation: RuleSetExplanation, entries: Readonly<Record<string, StateEntry>>): WorkshopView {
  const byId = new Map(explanation.rules.map((r) => [r.id, r]));
  const decisions: WorkshopDecision[] = [];
  for (const id of explanation.order) {
    const entry = entries[id];
    const kind = decisionKindOf(entry);
    if (!entry || !kind) continue;
    decisions.push({ id, kind, by: entry.account.name, at: entry.confirmedAt, note: shownNote(entry.note) });
  }
  const open = explanation.order
    .filter((id) => !isDecided(decisionKindOf(entries[id])))
    .map((id) => {
      const entry = entries[id];
      const asked = entry?.state === 'clarify';
      return { id, impact: byId.get(id)?.impact.level ?? 'low', question: asked ? entry.note ?? null : null, askedBy: asked ? entry.account.name : null };
    });
  const accounts = new Map<string, { uid: string; name: string; decisions: WorkshopDecision[] }>();
  for (const id of explanation.order) {
    const entry = entries[id];
    const d = decisions.find((x) => x.id === id);
    if (!entry || !d) continue;
    const held = accounts.get(entry.account.uid) ?? { uid: entry.account.uid, name: entry.account.name, decisions: [] };
    held.decisions.push(d);
    accounts.set(entry.account.uid, held);
  }
  const byAccount = [...accounts.values()]
    .map((a) => ({ ...a, decisions: [...a.decisions].sort(newestFirst) }))
    .sort((a, b) => newestFirst(a.decisions[0], b.decisions[0]));
  const counts = new Map<string, number>();
  for (const d of decisions) counts.set(dayOf(d.at), (counts.get(dayOf(d.at)) ?? 0) + 1);
  const sessions = [...counts.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => (a.day < b.day ? 1 : -1));
  const latestDay = sessions[0]?.day ?? null;
  return {
    open,
    byAccount,
    sessions,
    latest: latestDay ? { day: latestDay, decisions: decisions.filter((d) => dayOf(d.at) === latestDay).sort(newestFirst) } : null,
    previousDay: sessions[1]?.day ?? null,
    deviations: decisions
      .filter((d) => d.kind !== 'clarify' && d.kind !== byId.get(d.id)?.proposal.kind)
      .map((d) => ({ ...d, proposal: byId.get(d.id)?.proposal.kind ?? 'keep' })),
  };
}

/* ------------------------------------------------------- old → new (3.0.20 (4)) */

export interface RuleChange {
  id: string;
  /** The answer before, and its note. */
  from: RuleDecisionKind;
  fromNote: string | null;
  /** The answer that replaced it, with who gave it and when. */
  to: RuleDecisionKind;
  note: string | null;
  by: string;
  at: string;
  revision: number;
  /** What else moved with the answer: the value source, "also applies to" — in words; empty when nothing did. */
  details: string[];
}

const sourceWords = (v: StateEntry['valueSource']) => (v ? `${VALUE_SOURCE_LABELS[v.kind]}${v.note ? ` (${v.note})` : ''}` : 'none');
const listWords = (v: string[] | undefined) => [...(v ?? [])].sort().join(', ') || 'none';

/** The parts of an answer besides its word and note that differ between two entries, in words. */
function answerDetails(before: StateEntry, after: StateEntry): string[] {
  const out: string[] = [];
  if (sourceWords(before.valueSource) !== sourceWords(after.valueSource)) {
    out.push(`Value source: ${sourceWords(before.valueSource)} → ${sourceWords(after.valueSource)}`);
  }
  if (listWords(before.appliesTo) !== listWords(after.appliesTo)) {
    out.push(`Also applies to: ${listWords(before.appliesTo)} → ${listWords(after.appliesTo)}`);
  }
  return out;
}

/**
 * Per rule, every answer that replaced an earlier one — earlier answer → new
 * answer, who and when — newest first. Read from the answers as they were made
 * (`ruleAnswersMade`); a first answer replaced nothing and is not a change, and
 * an answer given again the same in every part (`sameAnswer`: state, note,
 * value source, "also applies to", the answer) is none either. A moved value
 * source or "also applies to" under the same word is a change, said in
 * `details`.
 */
export function ruleChanges(explanation: Pick<RuleSetExplanation, 'order'>, made: readonly StateEntry[]): RuleChange[] {
  const known = new Set(explanation.order);
  const bySubject = new Map<string, StateEntry[]>();
  for (const e of made) {
    if (e.kind !== 'rule' || !known.has(e.subject)) continue;
    bySubject.set(e.subject, [...(bySubject.get(e.subject) ?? []), e]);
  }
  const out: RuleChange[] = [];
  for (const [id, list] of bySubject) {
    const ordered = [...list].sort((a, b) => a.revision - b.revision);
    for (let i = 1; i < ordered.length; i += 1) {
      const before = ordered[i - 1];
      const after = ordered[i];
      const from = decisionKindOf(before);
      const to = decisionKindOf(after);
      if (!from || !to) continue;
      if (sameAnswer(before, after)) continue;
      const details = answerDetails(before, after);
      if (from === to && shownNote(before.note) === shownNote(after.note) && details.length === 0) continue;
      out.push({
        id,
        from,
        fromNote: shownNote(before.note),
        to,
        note: shownNote(after.note),
        by: after.account.name,
        at: after.confirmedAt,
        revision: after.revision,
        details,
      });
    }
  }
  return out.sort((a, b) => b.revision - a.revision || (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------- measuring */

/**
 * The share of rules with a plain explanation and with a real-value example —
 * the 3.0.20 measure. A plain explanation is "what it protects" and either
 * side in words; a real-value example names a value that stands in the code.
 */
export function explanationCoverage(explanation: RuleSetExplanation): { rules: number; explained: number; withExample: number } {
  const rules = explanation.rules.length;
  const explained = explanation.rules.filter((r) => r.protects.text.length > 0 && (r.sides !== null || r.example !== null)).length;
  const withExample = explanation.rules.filter((r) => r.example !== null).length;
  return { rules, explained, withExample };
}
