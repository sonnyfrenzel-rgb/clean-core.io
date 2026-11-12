/**
 * One count source for every figure about business rules (hotfix 3.0.22, HF-e).
 *
 * Owner example A showed the same project in four tools with numbers that did
 * not meet: Design "5 questions" beside "25 open rules", Transformation "41
 * rules — 16 decided by you", Documentation "43 rules", Testing "18 of 30
 * business rules". Each was right about something, and none said what. Here is
 * what each tool counts, from one place, with the words for it:
 *
 *   - **business rules** — the rules the engine reads from the signed source
 *     (`deriveBusinessRules`): the rule register's rows, "In short", the
 *     counter-checks. Every tool that says "business rules" means this number.
 *   - **decided / open** — of those, the ones with Keep, Change or Drop on
 *     record, and the rest (Clarify is a question, so open).
 *   - **questions** — Design asks the business-basket rules as a few
 *     questions; one question covers several rules. A question is never
 *     counted as a rule; the words say how many rules the questions cover and
 *     where the others are (technical ones and not determined ones, in the
 *     rule register).
 *   - **entries** — Documentation's rules chapter lists business rules,
 *     decision points and fixed values as rows; its headline names the business
 *     rules, the row count is "entries".
 *   - **reachable** — Testing traces cases to the rules a case can reach (not
 *     declared only, never reached or a technical helper); the sentence names
 *     the full count beside it.
 *
 * Pure and server-free: no engine, no React. Display only — nothing here is
 * read into a signed run, a decision record or an audit pack.
 */

import type { RuleAnswer } from './rule-register';
import type { RuleSetExplanation } from './abap/business-rule-set-explain';

const fmt = (v: number) => v.toLocaleString('en');
const plural = (count: number, one: string, many = `${one}s`) => `${fmt(count)} ${count === 1 ? one : many}`;

/* ---------------------------------------------------------- the counts */

export interface RuleDecisionCounts {
  /** Every business rule of the register. */
  total: number;
  keep: number;
  change: number;
  drop: number;
  /** Keep, Change or Drop on record. */
  decided: number;
  /** No answer, or Clarify. */
  open: number;
}

/** Decided and open business rules, from one answer per rule (`null`: nobody answered). */
export function ruleDecisionCounts(answers: ReadonlyArray<RuleAnswer | null | undefined>): RuleDecisionCounts {
  let keep = 0;
  let change = 0;
  let drop = 0;
  for (const a of answers) {
    if (a === 'keep') keep += 1;
    else if (a === 'change') change += 1;
    else if (a === 'drop') drop += 1;
  }
  const decided = keep + change + drop;
  return { total: answers.length, keep, change, drop, decided, open: answers.length - decided };
}

export interface QuestionRuleCounts {
  /** Questions Design asks. */
  questions: number;
  /** Questions with an answer on record. */
  answered: number;
  /** Business rules the questions cover (each counted once). */
  rulesAsked: number;
  /** Every business rule of the program. */
  total: number;
  /** Business rules no question covers — in the rule register. */
  notAsked: number;
  /** Of those not asked: technical rules that stay as coded, and rules the engine could not place. */
  technical: number;
  undetermined: number;
}

/**
 * How Design's questions relate to the business rules. `ruleIds` is every
 * business rule of the program (the register's rows, `explanation.rules`).
 */
export function questionRuleCounts(input: {
  ruleIds: readonly string[];
  questions: ReadonlyArray<{ ruleIds: readonly string[] }>;
  answered: number;
  technical: number;
  undetermined: number;
}): QuestionRuleCounts {
  const all = new Set(input.ruleIds);
  const asked = new Set(input.questions.flatMap((q) => q.ruleIds).filter((id) => all.has(id)));
  return {
    questions: input.questions.length,
    answered: input.answered,
    rulesAsked: asked.size,
    total: all.size,
    notAsked: all.size - asked.size,
    technical: input.technical,
    undetermined: input.undetermined,
  };
}

/** The same, from the explanation Design reads (its rules are the register's rules). */
export function questionRuleCountsOf(explanation: Pick<RuleSetExplanation, 'rules' | 'questions' | 'baskets'>, answered: number): QuestionRuleCounts {
  return questionRuleCounts({
    ruleIds: explanation.rules.map((r) => r.id),
    questions: explanation.questions,
    answered,
    technical: explanation.baskets.technical.length,
    undetermined: explanation.baskets.undetermined.length,
  });
}

export interface DocumentRuleCounts {
  /** Rows of the rules chapter: business rules, decision points and fixed values. */
  entries: number;
  /** Distinct business rules (`BR-…`) among the rows — the register's count. */
  businessRules: number;
  decisionPoints: number;
  fixedValues: number;
}

/**
 * Documentation's rules chapter, counted. A row carries a business rule's id
 * (`BR-001`), `Decision point` or `Fixed values` (`lib/process-document-build.ts`).
 * A business rule worded as a fixed value is still a business rule: the id
 * decides, not the wording.
 */
export function documentRuleCounts(rows: ReadonlyArray<{ ref: string }>): DocumentRuleCounts {
  const ids = new Set<string>();
  let decisionPoints = 0;
  let fixedValues = 0;
  for (const r of rows) {
    if (/^BR-\d+$/.test(r.ref)) ids.add(r.ref);
    else if (r.ref === 'Fixed values') fixedValues += 1;
    else decisionPoints += 1;
  }
  return { entries: rows.length, businessRules: ids.size, decisionPoints, fixedValues };
}

/* ----------------------------------------------------------- the words */

/** "41 business rules". */
export function businessRulesWord(n: number): string {
  return plural(n, 'business rule');
}

/** "41 business rules — 16 decided: 10 keep, 4 change, 2 drop" (Transformation). */
export function ruleDecisionsLine(c: RuleDecisionCounts): string {
  if (c.decided === 0) return `${businessRulesWord(c.total)} — none decided yet`;
  return `${businessRulesWord(c.total)} — ${fmt(c.decided)} decided: ${fmt(c.keep)} keep, ${fmt(c.change)} change, ${fmt(c.drop)} drop`;
}

/** "25 business rules open — implemented as the original and marked open". */
export function openRulesLine(open: number): string {
  return `${plural(open, 'business rule')} open — implemented as the original and marked open`;
}

/** "25 business rules have no decision yet." */
export function openRulesWarning(open: number): string {
  return open === 1 ? '1 business rule has no decision yet.' : `${fmt(open)} business rules have no decision yet.`;
}

/** "Decide the 25 open business rules". */
export function decideOpenRules(open: number): string {
  return open === 1 ? 'Decide the 1 open business rule' : `Decide the ${fmt(open)} open business rules`;
}

/**
 * "5 questions cover 16 of the 41 business rules. The other 25 — 22 technical,
 * 3 not determined — are decided in the rule register." (Design)
 */
export function questionsCoverRules(c: QuestionRuleCounts): string {
  const head = `${plural(c.questions, 'question')} ${c.questions === 1 ? 'covers' : 'cover'} ${fmt(c.rulesAsked)} of the ${businessRulesWord(c.total)}.`;
  if (c.notAsked <= 0) return head;
  const parts = [c.technical > 0 ? `${fmt(c.technical)} technical` : '', c.undetermined > 0 ? `${fmt(c.undetermined)} not determined` : ''].filter(Boolean);
  const kinds = parts.length ? ` — ${parts.join(', ')} —` : '';
  const other = c.notAsked === 1 ? `The other one${kinds} is decided in the rule register.` : `The other ${fmt(c.notAsked)}${kinds} are decided in the rule register.`;
  return `${head} ${other}`;
}

/** "43 entries: 41 business rules, 1 decision point, 1 fixed value" (Documentation). */
export function documentRulesLine(c: DocumentRuleCounts): string {
  return `${plural(c.entries, 'entry', 'entries')}: ${businessRulesWord(c.businessRules)}, ${plural(c.decisionPoints, 'decision point')}, ${plural(c.fixedValues, 'fixed value')}`;
}

/**
 * Testing's coverage head: "18 of the 18 business rules a case can reach have a
 * traced case (30 business rules in all; 12 are declared only, never reached or
 * technical helpers)". Without the full count, or when every rule is reachable,
 * it says the plain "N of M business rules".
 */
export function tracedRulesLine(covered: number, reachable: number, all: number | null): string {
  if (all === null || all <= reachable) return `${fmt(covered)} of ${businessRulesWord(reachable)} of the original have a traced case`;
  const apart = all - reachable;
  return `${fmt(covered)} of the ${fmt(reachable)} business rules a case can reach have a traced case (${businessRulesWord(all)} in all; ${fmt(apart)} ${apart === 1 ? 'is' : 'are'} declared only, never reached or technical helpers)`;
}

/**
 * Testing's counter-checks: "24 scenarios for 12 of the 14 business rules —
 * each once where it applies and once where it must not"; the rest are
 * declared only and have no condition to check.
 */
export function counterChecksLine(scenarios: number, rules: number, withoutScenario: number): string {
  const withScenario = rules - withoutScenario;
  const head = withoutScenario > 0
    ? `${plural(scenarios, 'scenario')} for ${fmt(withScenario)} of the ${businessRulesWord(rules)}`
    : `${plural(scenarios, 'scenario')} for the ${businessRulesWord(rules)}`;
  const apart = withoutScenario > 0 ? ` (${fmt(withoutScenario)} ${withoutScenario === 1 ? 'is' : 'are'} only declared, with no condition to check)` : '';
  return `${head}${apart} — each once where it applies and once where it must not.`;
}
