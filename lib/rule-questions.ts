/**
 * The business rules as a few questions for the business — owner decision
 * 21.10.2026, the new set-up ("everything very complex … at such an early
 * stage it overwhelms the user"; "we are in the first insights, and a business
 * user is to decide that right away?").
 *
 * Pure: no React, no network, no model. It reads what the engine sorted
 * (`lib/abap/business-rule-set-explain.ts`: every rule in one of three
 * baskets, the business rules as questions, one per subject) against what is
 * on record (`lib/process-states.ts`, the need revisions the `process-states`
 * route writes through the Admin SDK) and gives the Design tool:
 *
 *   - **the flow** — at most five open questions at a time, the weightiest
 *     first; stop any time; "3 of 7 questions answered";
 *   - **four answers** — *Yes, that's right* (Keep), *No, it should be …*
 *     (Change, with the new value), *We don't need it any more* (Drop),
 *     *I don't know / someone else* (Clarify, with who). One answer applies to
 *     every rule of its question;
 *   - **accept all proposals** — Keep for every open business rule at once:
 *     the account confirms the code as it stands, a self-declaration, not a
 *     check; the reader then answers only the deviations;
 *   - **the technical rules, once** — Keep for every open technical rule, with
 *     a note that says so; never counted as confirmed by the business;
 *   - **architecture options for IT** — afterwards, for an answered rule whose
 *     engine proposal is to move the value into configuration or to SAP
 *     standard (`lib/rule-standard-hints.ts`): what Design proposes, recorded
 *     with the answers the route already accepts (`standard`, a customizing
 *     value source). They are no longer business answers, and since owner
 *     decision 22.10.2026 they are taken in the rule register of the IT view;
 *     Design names how many there are in one line.
 *
 * Nothing new is stored: every answer is a choice the route already accepts,
 * and an older record with *Move to configuration* or *Move to SAP standard*
 * reads as *Yes, that's right* with its architecture option taken. An answer is
 * the self-declaration of the signed-in account, never part of the signed run.
 */
import type { RuleQuestion, RuleSetExplanation, ExplainedSentence } from './abap/business-rule-set-explain';
import type { StateChoiceInput, StateEntry } from './process-states';
import { decisionKindOf, type RuleDecisionKind } from './rule-decision-flow';

/** The Design tool's place for the questions — where the Business view's sentence and the open questions lead. */
export const RULE_QUESTIONS_ID = 'rule-questions';

/* --------------------------------------------------------------- answers */

export type QuestionAnswer = 'yes' | 'change' | 'drop' | 'unsure';

export const QUESTION_ANSWERS: readonly QuestionAnswer[] = Object.freeze(['yes', 'change', 'drop', 'unsure'] as QuestionAnswer[]);

/** How many open questions are shown at a time. */
export const QUESTION_BATCH = 5;

/** The note "Accept all proposals" records with every Keep — the account confirms the code as it stands. */
export const ACCEPTED_AS_CODED_NOTE = 'Accepted as coded with all proposals at once — a self-declaration, not a check.';

/** The note the one click for the technical rules records with every Keep. */
export const TECHNICAL_KEEP_NOTE = 'Technical rule — stays as coded, confirmed together with the other technical rules.';

/** The reason a Drop carries when the reader gives none: the route needs one, and "not needed" is what was said. */
export const DROP_DEFAULT_NOTE = 'Not needed any more.';

/** An answer that needs words: the new value, or who can answer. */
export const answerNeedsText = (answer: QuestionAnswer): boolean => answer === 'change' || answer === 'unsure';

/** The note a Change carries: "Should be: 500 EUR". */
export const changeNote = (value: string): string => `Should be: ${value.trim()}`;

/** The note a Clarify carries: "To be answered by: purchasing". */
export const unsureNote = (who: string): string => `To be answered by: ${who.trim()}`;

/** The answer as the choices the `process-states` route stores — one per rule of the question. */
export function questionChoices(question: Pick<RuleQuestion, 'ruleIds'>, answer: QuestionAnswer, text: string): StateChoiceInput[] {
  const said = text.trim();
  return question.ruleIds.map((subject): StateChoiceInput => {
    switch (answer) {
      case 'yes':
        return { subject, kind: 'rule', state: 'keep', note: null, valueSource: null, appliesTo: [] };
      case 'change':
        return { subject, kind: 'rule', state: 'change', note: changeNote(said), valueSource: { kind: 'business-requirement', note: null }, appliesTo: [] };
      case 'drop':
        return { subject, kind: 'rule', state: 'drop', note: said || DROP_DEFAULT_NOTE, appliesTo: [] };
      case 'unsure':
        return { subject, kind: 'rule', state: 'clarify', note: unsureNote(said), appliesTo: [] };
    }
  });
}

/** What keeps an answer from being recorded, or null. */
export function answerProblem(answer: QuestionAnswer, text: string): 'text-missing' | null {
  return answerNeedsText(answer) && text.trim() === '' ? 'text-missing' : null;
}

/** The business answer a decision on record reads as. An older Move to configuration / SAP standard is a Yes. */
export function answerOfDecision(kind: RuleDecisionKind | null): QuestionAnswer | null {
  if (kind === null) return null;
  if (kind === 'clarify') return 'unsure';
  if (kind === 'change-value') return 'change';
  if (kind === 'drop') return 'drop';
  return 'yes';
}

/**
 * The answer on record for a question: every rule of it answered, read as one.
 * A question whose rules disagree reads as the answer that most needs a look —
 * a question before a change before a drop before a yes. Null while any rule
 * of it has no answer.
 */
export function questionAnswerOf(question: Pick<RuleQuestion, 'ruleIds'>, entries: Readonly<Record<string, StateEntry>>): QuestionAnswer | null {
  const answers = question.ruleIds.map((id) => answerOfDecision(decisionKindOf(entries[id])));
  if (answers.some((a) => a === null)) return null;
  for (const a of ['unsure', 'change', 'drop'] as const) if (answers.includes(a)) return a;
  return 'yes';
}

/** The words the reader gave with the answer, without the prefix this file adds. */
export function answerTextOf(question: Pick<RuleQuestion, 'ruleIds'>, entries: Readonly<Record<string, StateEntry>>): string | null {
  const note = (entries[question.ruleIds[0]]?.note ?? '').trim();
  if (!note) return null;
  return note.replace(/^Should be:\s*/, '').replace(/^To be answered by:\s*/, '');
}

/** Answered: anything but a question for somebody else, which is still open. */
export const isAnswered = (answer: QuestionAnswer | null): boolean => answer !== null && answer !== 'unsure';

/* -------------------------------------------------------- recommendation */

export interface RecommendedAnswer {
  answer: QuestionAnswer;
  /** The engine's reason for its proposal, one sentence with its lines. */
  reason: ExplainedSentence;
}

/**
 * The answer the engine proposes for a question, read from the proposal of its
 * weightiest rule (owner decision 22.10.2026: the recommendation is shown in
 * every question row, nothing is pre-selected). Keep, Move to configuration
 * and Move to SAP standard all read as *Yes, that's right* — the last two are
 * IT's options on top of a kept value; Change the value reads as *No, it
 * should be …*, Drop as *We don't need it any more*. Null when the rule has no
 * explanation.
 */
export function recommendedAnswerOf(question: Pick<RuleQuestion, 'ruleIds'>, explanation: Pick<RuleSetExplanation, 'rules'>): RecommendedAnswer | null {
  const lead = explanation.rules.find((r) => r.id === question.ruleIds[0]);
  if (!lead) return null;
  const kind = lead.proposal.kind;
  const answer: QuestionAnswer = kind === 'change-value' ? 'change' : kind === 'drop' ? 'drop' : 'yes';
  return { answer, reason: lead.proposal.reason };
}

/* ------------------------------------------------------------------ flow */

export interface QuestionState {
  question: RuleQuestion;
  answer: QuestionAnswer | null;
  /** The reader's words with it — the new value, who to ask — or null. */
  text: string | null;
}

export interface QuestionFlow {
  total: number;
  answered: number;
  /** The questions shown now: at most `QUESTION_BATCH` open ones, weightiest first. */
  shown: QuestionState[];
  /** Open questions beyond the ones shown. */
  later: number;
  /** Every answered question, in the engine's order. A question for somebody else stays open, with who. */
  done: QuestionState[];
}

export function questionFlow(explanation: Pick<RuleSetExplanation, 'questions'>, entries: Readonly<Record<string, StateEntry>>, batch = QUESTION_BATCH): QuestionFlow {
  const states = explanation.questions.map((question): QuestionState => ({
    question,
    answer: questionAnswerOf(question, entries),
    text: answerTextOf(question, entries),
  }));
  const open = states.filter((s) => !isAnswered(s.answer));
  return {
    total: states.length,
    answered: states.length - open.length,
    shown: open.slice(0, batch),
    later: Math.max(0, open.length - batch),
    done: states.filter((s) => isAnswered(s.answer)),
  };
}

/** "Accept all proposals": a Keep, with the note that says what it is, for every business rule nobody answered. */
export function acceptAllChoices(explanation: Pick<RuleSetExplanation, 'baskets'>, entries: Readonly<Record<string, StateEntry>>): StateChoiceInput[] {
  return explanation.baskets.business
    .filter((id) => decisionKindOf(entries[id]) === null)
    .map((subject) => ({ subject, kind: 'rule', state: 'keep', note: ACCEPTED_AS_CODED_NOTE, valueSource: null, appliesTo: [] }));
}

/** "Technical rules stay as coded": a Keep with its note for every technical rule nobody answered. */
export function technicalKeepChoices(explanation: Pick<RuleSetExplanation, 'baskets'>, entries: Readonly<Record<string, StateEntry>>): StateChoiceInput[] {
  return explanation.baskets.technical
    .filter((id) => decisionKindOf(entries[id]) === null)
    .map((subject) => ({ subject, kind: 'rule', state: 'keep', note: TECHNICAL_KEEP_NOTE, valueSource: null, appliesTo: [] }));
}

/** A Keep recorded by the one click for the technical rules. */
export const isTechnicalKeep = (entry: Pick<StateEntry, 'state' | 'note'> | null | undefined): boolean =>
  entry?.state === 'keep' && (entry.note ?? '').trim() === TECHNICAL_KEEP_NOTE;

/* ------------------------------------------------- architecture options (IT) */

/** The place of the architecture options in the rule register of the IT view. */
export const ARCHITECTURE_OPTIONS_ID = 'architecture-options';

export type ArchitectureOptionKind = 'configure' | 'standard';

export interface ArchitectureOption {
  ruleId: string;
  kind: ArchitectureOptionKind;
  /** The engine's reason — the configuration it proposes, or the scope item that may cover it. */
  reason: ExplainedSentence;
  /** Already on record: the value is in configuration, or SAP standard is to meet the need. */
  taken: boolean;
}

/**
 * What Design proposes for IT once the business has answered: for a rule kept
 * or changed whose engine proposal is configuration or SAP standard. SAP
 * standard rides on a Keep only (the route refuses it on a Change), so a
 * changed rule is offered configuration alone.
 */
export function architectureOptions(explanation: Pick<RuleSetExplanation, 'rules' | 'baskets'>, entries: Readonly<Record<string, StateEntry>>): ArchitectureOption[] {
  const byId = new Map(explanation.rules.map((r) => [r.id, r]));
  const out: ArchitectureOption[] = [];
  for (const id of explanation.baskets.business) {
    const e = byId.get(id);
    const entry = entries[id];
    const kind = decisionKindOf(entry);
    if (!e || !kind) continue;
    if (kind === 'configure' || kind === 'standard') {
      out.push({ ruleId: id, kind, reason: e.proposal.reason, taken: true });
      continue;
    }
    const proposed = e.proposal.kind;
    if (kind === 'keep' && (proposed === 'configure' || proposed === 'standard')) {
      out.push({ ruleId: id, kind: proposed, reason: e.proposal.reason, taken: false });
    } else if (kind === 'change-value' && proposed === 'configure') {
      out.push({ ruleId: id, kind: 'configure', reason: e.proposal.reason, taken: entry?.valueSource?.kind === 'customizing' });
    }
  }
  return out;
}

/** The choice that takes an architecture option — on top of the answer on record, which it keeps. */
export function architectureChoice(option: Pick<ArchitectureOption, 'ruleId' | 'kind'>, entry: StateEntry | undefined): StateChoiceInput {
  const note = entry?.note ?? null;
  if (entry?.state === 'change') {
    return { subject: option.ruleId, kind: 'rule', state: 'change', note, valueSource: { kind: 'customizing', note: null }, appliesTo: entry.appliesTo ?? [] };
  }
  if (option.kind === 'standard') {
    return { subject: option.ruleId, kind: 'rule', state: 'keep', note, valueSource: null, appliesTo: entry?.appliesTo ?? [], answer: 'standard' };
  }
  return { subject: option.ruleId, kind: 'rule', state: 'keep', note, valueSource: { kind: 'customizing', note: null }, appliesTo: entry?.appliesTo ?? [] };
}

/* --------------------------------------------------------------- summary */

export interface BasketSummary {
  questions: number;
  questionsAnswered: number;
  technical: number;
  technicalConfirmed: number;
  undetermined: number;
  /** Business rules with a Keep, Change or Drop on record — the technical rules are never counted here. */
  businessDecided: number;
  businessRules: number;
}

export function basketSummary(explanation: Pick<RuleSetExplanation, 'questions' | 'baskets'>, entries: Readonly<Record<string, StateEntry>>): BasketSummary {
  const decided = (id: string) => {
    const k = decisionKindOf(entries[id]);
    return k !== null && k !== 'clarify';
  };
  return {
    questions: explanation.questions.length,
    questionsAnswered: explanation.questions.filter((q) => isAnswered(questionAnswerOf(q, entries))).length,
    technical: explanation.baskets.technical.length,
    technicalConfirmed: explanation.baskets.technical.filter(decided).length,
    undetermined: explanation.baskets.undetermined.length,
    businessDecided: explanation.baskets.business.filter(decided).length,
    businessRules: explanation.baskets.business.length,
  };
}
