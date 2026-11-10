/**
 * The business answers in the solution design (owner decision 22.10.2026:
 * questions first, design on click, the answers flow into the design).
 *
 * Pure: no React, no network, no model. It reads the questions of the Design
 * stage (`lib/rule-questions.ts`) against the answers on record and gives the
 * page four things:
 *
 *   - **the reading** — every question with its answer, or open;
 *   - **the gate** — whether "Generate the design" is enabled: only once every
 *     business question has an answer, with the reason in words while some are
 *     open, and the secondary way to write it without them;
 *   - **the prompt section** — the answers as given requirements, the open
 *     questions as open, and the rule that tells the model what to do with
 *     them;
 *   - **the basis** — a digest of the answers, stored inside the design it was
 *     written with, so a design written before an answer changed reads as
 *     needing regeneration.
 *
 * An answer is the self-declaration of the signed-in account, never part of
 * the signed run.
 */
import type { RuleSetExplanation } from './abap/business-rule-set-explain';
import type { StateEntry } from './process-states';
import { DROP_DEFAULT_NOTE, answerTextOf, isAnswered, questionAnswerOf, type QuestionAnswer } from './rule-questions';
import { sha256Hex } from './artefact-digest';

/** One question with the answer on record. */
export interface BusinessAnswer {
  questionId: string;
  ruleIds: string[];
  /** What the code does, in business words with its values — the subject the answer is about. */
  subject: string;
  /** Null while nobody answered it. */
  answer: QuestionAnswer | null;
  /** The new value, who decides, or why it is dropped; null when nothing was said. */
  note: string | null;
}

export interface BusinessAnswersReady {
  state: 'ready';
  /** How many business questions the engine asks. */
  total: number;
  /** Every question, in the engine's order. */
  questions: BusinessAnswer[];
  /** Questions without an answer, or with "someone else" — still open. */
  open: number;
}

/** `reading` while the source, the rules or the answers on record are not read yet. */
export type BusinessAnswersReading = { state: 'reading' } | BusinessAnswersReady;

export const ANSWERS_READING: BusinessAnswersReading = Object.freeze({ state: 'reading' }) as BusinessAnswersReading;

/** A project whose program asks the business nothing: the design is written as before. */
export const NO_BUSINESS_QUESTIONS: BusinessAnswersReady = Object.freeze({ state: 'ready', total: 0, questions: [], open: 0 }) as BusinessAnswersReady;

export function businessAnswersOf(explanation: Pick<RuleSetExplanation, 'questions'>, entries: Readonly<Record<string, StateEntry>>): BusinessAnswersReady {
  const questions = explanation.questions.map((q): BusinessAnswer => {
    const answer = questionAnswerOf(q, entries);
    const said = answer === null || answer === 'yes' ? null : answerTextOf(q, entries);
    return { questionId: q.id, ruleIds: [...q.ruleIds], subject: q.statement.text, answer, note: said };
  });
  return { state: 'ready', total: questions.length, questions, open: questions.filter((q) => !isAnswered(q.answer)).length };
}

/* ------------------------------------------------------------------ gate */

export type DesignWriteGate =
  /** The questions are still being read: the action waits. */
  | { kind: 'reading' }
  /** Business questions are open: the action waits for them, or is asked for without them. */
  | { kind: 'open'; open: number }
  /** Every business question has an answer, or the program asks none. */
  | { kind: 'ready' };

export function designWriteGate(reading: BusinessAnswersReading): DesignWriteGate {
  if (reading.state === 'reading') return { kind: 'reading' };
  if (reading.open > 0) return { kind: 'open', open: reading.open };
  return { kind: 'ready' };
}

/** Whether "Generate the design" is enabled — and "Write it without the open answers" is never needed then. */
export const designWriteEnabled = (gate: DesignWriteGate): boolean => gate.kind === 'ready';

/* ------------------------------------------------------------ page order */

/**
 * Whether the Design page shows its proposal — the target on the canvas, the
 * decision with the recommended route and the alternatives, the design
 * document with the option comparison (owner decision 22.10.2026, roadmap
 * 3.0.21, amending ADR-102's page order). Until then the canvas holds a calm
 * placeholder and the questions stand beside it. Shown once
 *
 *   - every business question has an answer, or the program asks none
 *     (`designWriteGate` is `ready`);
 *   - the reader clicked *Skip questions*; or
 *   - a solution design is on record — it was asked for by a click before, so
 *     the questions were passed then.
 *
 * Nothing is written by showing it: the design is still written only on the
 * owner's click (ADR-102).
 */
export function designProposalShown({ gate, skipped, hasDesign }: { gate: DesignWriteGate; skipped: boolean; hasDesign: boolean }): boolean {
  return hasDesign || skipped || gate.kind === 'ready';
}

/* ---------------------------------------------------------------- prompt */

/**
 * What the model is told to do with the answers. Placed next to the other rules
 * of the design prompt; empty for a program that asks the business nothing.
 */
export const BUSINESS_ANSWERS_PROMPT_RULE =
  'BUSINESS ANSWERS: the answers of the business listed under BUSINESS ANSWERS in the context are given requirements, not suggestions. ' +
  'Design every changed value in with the value the business gave, instead of the value in the code. ' +
  'Leave every rule the business no longer needs out of the design: no check, no field, no step and no configuration for it. ' +
  'Keep a rule the business confirmed as it is coded. ' +
  'A question listed as open stays open: do not decide it; where the design depends on it, say that it is open and who decides. ' +
  'Wherever the document relies on one of these answers, mark that point with “(set by the business)”.';

export function businessAnswersPromptRule(reading: BusinessAnswersReading): string {
  return reading.state === 'ready' && reading.total > 0 ? BUSINESS_ANSWERS_PROMPT_RULE : '';
}

function answerLine(q: BusinessAnswer): string {
  const head = `- ${q.ruleIds.join(', ')}: ${q.subject.trim()}`;
  switch (q.answer) {
    case 'yes':
      return `${head} — Answer: keep it as coded.`;
    case 'change':
      return `${head} — Answer: change it; it should be: ${q.note ?? 'not stated'}.`;
    case 'drop':
      return `${head} — Answer: not needed any more; leave it out of the design.${q.note && q.note !== DROP_DEFAULT_NOTE ? ` Reason given: ${q.note}` : ''}`;
    case 'unsure':
      return `${head} — Open: someone else decides${q.note ? ` (${q.note})` : ''}.`;
    default:
      return `${head} — Open: not answered when this design was written.`;
  }
}

/**
 * The section of the design context that carries the answers: the answered
 * ones as given requirements, then the open ones — a question for someone
 * else, or one nobody answered when the design was asked for. Empty for a
 * program that asks the business nothing, or while the answers are not read.
 */
export function businessAnswersSection(reading: BusinessAnswersReading): string {
  if (reading.state !== 'ready' || reading.total === 0) return '';
  const given = reading.questions.filter((q) => isAnswered(q.answer));
  const open = reading.questions.filter((q) => !isAnswered(q.answer));
  const parts = [
    'BUSINESS ANSWERS (recorded in Design by the owner of the project — a self-declaration of the account, not a check; given requirements for this design):',
    given.length ? given.map(answerLine).join('\n') : '- None answered yet.',
  ];
  if (open.length) {
    parts.push(
      `OPEN BUSINESS QUESTIONS (${open.length} of ${reading.total} open when this design was written; not decided, and not to be decided by the design):`,
      open.map(answerLine).join('\n'),
    );
  }
  return parts.join('\n');
}

/* ----------------------------------------------------------------- basis */

/** The key inside the stored design JSON that carries the digest of the answers it was written with. */
export const ANSWERS_BASIS_KEY = 'businessAnswersBasis';

/** The digest of the answers a design is written with. Order-free; an unanswered question counts as nothing. */
export function businessAnswersDigest(reading: BusinessAnswersReady): string {
  const said = reading.questions
    .filter((q) => q.answer !== null)
    .map((q) => [[...q.ruleIds].sort().join(','), q.answer, (q.note ?? '').trim()] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return sha256Hex(JSON.stringify(said));
}

/** The digest of "no answer on record" — what a design written before this basis existed is read as. */
export const NO_ANSWERS_DIGEST = businessAnswersDigest(NO_BUSINESS_QUESTIONS);

/**
 * The model's design text with the basis written into its JSON object, right
 * after the opening brace, so the rest of the text stays as the model wrote
 * it. A text without an object is returned as it is.
 */
export function withBusinessAnswersBasis(design: string, digest: string): string {
  const at = design.indexOf('{');
  if (at === -1 || !/^[0-9a-f]{64}$/.test(digest)) return design;
  return `${design.slice(0, at + 1)}"${ANSWERS_BASIS_KEY}":"${digest}",${design.slice(at + 1)}`;
}

/** The basis a stored design was written with, or null when it carries none. */
export function storedBusinessAnswersBasis(design: string | null | undefined): string | null {
  if (!design) return null;
  const m = new RegExp(`"${ANSWERS_BASIS_KEY}"\\s*:\\s*"([0-9a-f]{64})"`).exec(design);
  return m ? m[1] : null;
}

/**
 * Whether the answers on record moved since the design was written. A design
 * without a basis was written before the answers reached the design: it reads
 * as written with none, so any answer on record now makes it need regeneration.
 * Nothing moves while the answers are being read.
 */
export function businessAnswersMoved(design: string | null | undefined, reading: BusinessAnswersReading): boolean {
  if (!design || reading.state !== 'ready') return false;
  const stored = storedBusinessAnswersBasis(design) ?? NO_ANSWERS_DIGEST;
  return stored !== businessAnswersDigest(reading);
}
