import type { AbapStatement, SourceRange } from './statement-reader';
import type { Block, BlockStructure } from './block-structure';
import type { Branch, BranchArm, ControlFlowReport } from './control-flow';
import type { BusinessRule, BusinessRuleSet, RuleParameter } from './business-rule-set';
import { enclosingBranches, type EnclosingBranch } from './enclosing-branches';
import { conditionToPhrase, humaniseField, humaniseRoutine, plainContext, ruleConditionText, type PlainContext } from './plain-language';
import { ruleStandardHint } from '../rule-standard-hints';
import { readDemoSwitches } from './demo-switches';
import { APP_VERSION } from '../version';
import { engineReads3020Apply } from './engine-reads-3020-gate';

/**
 * Business rules explained for a business reader — roadmap 3.0.20 "with it",
 * part (2): *business rules become a decision and explanation engine* (owner
 * report 21.10.2026: a flat list of 67 rows — "Only maximum raw 1000000000 is
 * processed", "Dec 2", "Kind REV" — with the ABAP beside it and "No answer
 * yet" does not take the business user by the hand).
 *
 * For every rule of a `BusinessRuleSet` this writes, deterministically and
 * from the code alone:
 *
 *   - its **topic** — a business subject the reader recognises ("Credit and
 *     risk", "Organisational units"), read off the field the rule tests and the
 *     class 2.8 gave its value; technical settings and demo switches are set
 *     apart, so a business reader is not asked about a buffer size;
 *   - its **impact** — a number to order by, with the reasons in words (it
 *     stops the process, it decides n steps, it stands at n places, it decides
 *     by an amount; nothing reads it);
 *   - **what it protects** — what the rule does to a case, in business words;
 *   - an **example with real values** from the code — the limit itself and the
 *     value just beside it, the listed values, another value the code handles
 *     elsewhere;
 *   - **what happens on either side** — the branch where it holds and the one
 *     where it does not, read off the arms of the `IF`/`CASE` it stands in;
 *   - **where it applies** — the step it stands in and the conditions of the
 *     branches around it (`enclosing-branches.ts`, 3.0.18 item 13), each with
 *     its line;
 *   - a **proposal with its reason** — keep, change the value, drop, move to
 *     configuration, or move to SAP standard.
 *
 * **Every sentence is anchored.** A sentence carries the lines it was read
 * from; one that would have none is not written. Nothing is guessed: where the
 * code gives no value, there is no example; where the branch says nothing the
 * reader can use, the side says so; a proposal is a proposal, worded as one,
 * and decides nothing — the decision is the account's (`lib/process-states.ts`).
 * A model may at most reword one of these sentences, through the output guards
 * of 3.0.18; nothing here calls one.
 *
 * **Additive.** No reading the run signs changes: this reads a rule set the
 * engine already derived and writes text beside it. Pure — no I/O, no model.
 */

/* ------------------------------------------------------------------ types */

export type RuleTopic =
  | 'amounts'
  | 'credit'
  | 'dates'
  | 'organisation'
  | 'documents'
  | 'partners'
  | 'materials'
  | 'currency'
  | 'status'
  | 'accounting'
  | 'other'
  | 'technical'
  | 'undetermined';

/** The business topics in the order a reader meets them when impact ties; technical settings and the undetermined last. */
export const RULE_TOPICS: readonly RuleTopic[] = Object.freeze([
  'credit',
  'amounts',
  'organisation',
  'documents',
  'partners',
  'materials',
  'dates',
  'currency',
  'accounting',
  'status',
  'other',
  'technical',
  'undetermined',
] as RuleTopic[]);

export const RULE_TOPIC_LABELS: Readonly<Record<RuleTopic, string>> = Object.freeze({
  amounts: 'Amounts, quantities and tolerances',
  credit: 'Credit and risk',
  dates: 'Dates and deadlines',
  organisation: 'Organisational units',
  documents: 'Document and order types',
  partners: 'Customers, vendors and countries',
  materials: 'Materials and stock',
  currency: 'Currencies and units',
  status: 'Statuses, roles and approvals',
  accounting: 'Accounts and cost objects',
  other: 'Other rules',
  technical: 'Technical rules — stay as coded',
  undetermined: 'Not determined',
});

/** What a topic is about, one line under its heading. */
export const RULE_TOPIC_LEADS: Readonly<Record<RuleTopic, string>> = Object.freeze({
  amounts: 'Limits on amounts, quantities and deviations that somebody chose and wrote into the program.',
  credit: 'Which orders count as a credit or risk case, and what happens to them.',
  dates: 'Time limits: how old, how late or which day decides how a case is handled.',
  organisation: 'Plants, sales and purchasing organisations the program is tied to.',
  documents: 'Which kinds of documents and orders are handled, and how each kind is treated.',
  partners: 'Customers, vendors, countries and their terms that are treated differently.',
  materials: 'Which materials, material groups or stock states are handled differently.',
  currency: 'Currencies and units of measure the program expects.',
  status: 'Statuses, roles and approval steps that decide the next step.',
  accounting: 'Which account assignment, cost centre or order a case is booked to, and what that changes.',
  other: 'Rules that fit none of the topics above.',
  technical:
    'Plausibility checks, technical limits, test data and run options of the program itself. Not business decisions: they stay as coded and are confirmed once, together.',
  undetermined: 'Rules whose business meaning the code does not show. Each says why; someone who knows the program decides what they are.',
});

/**
 * The three baskets every rule is sorted into (owner decision 21.10.2026, the
 * new set-up of the business rules: "in a very early stage it overwhelms the
 * user"):
 *
 *   - `business` — a limit or a case distinction a business really sets
 *     (tolerances, amounts, document and order types, organisational units,
 *     deadlines): asked as a question in Design;
 *   - `technical` — self-evident, stays as coded: plausibility checks,
 *     technical limits and sentinels, test data, run options, markers the
 *     program sets and reads itself;
 *   - `undetermined` — the code does not show what it means for the business,
 *     with one sentence why.
 *
 * Deterministic, read off the same facts the topic and the impact are read
 * from; a basket decides nothing — it only says who is asked.
 */
export type RuleBasket = 'business' | 'technical' | 'undetermined';

export const RULE_BASKETS: readonly RuleBasket[] = Object.freeze(['business', 'technical', 'undetermined'] as RuleBasket[]);

export const RULE_BASKET_LABELS: Readonly<Record<RuleBasket, string>> = Object.freeze({
  business: 'Questions for the business',
  technical: 'Technical rules — stay as coded',
  undetermined: 'Not determined',
});

/**
 * One question for the business: the rules of one business subject (one
 * field the code tests — the order types of one `CASE`, the limits on one
 * amount), said in plain words with the values from the code.
 */
export interface RuleQuestion {
  /** `Q-BR-004` — after the weightiest rule it asks about. */
  id: string;
  /** The rules it asks about, weightiest first. Never empty. */
  ruleIds: string[];
  topic: RuleTopic;
  /** The highest impact score of its rules — the order questions are asked in. */
  weight: number;
  /** A limit on a number, several limits on the same number, or listed values. */
  shape: 'limit' | 'limits' | 'values';
  /** What the code does, in business words, with the real values. Anchored like every sentence here. */
  statement: ExplainedSentence;
  /** The question itself — the same few words for every question of a shape. */
  ask: string;
}

/** The five answers the engine may propose. Clarify is the reader's, never a proposal. */
export type RuleProposalKind = 'keep' | 'change-value' | 'drop' | 'configure' | 'standard';

export const RULE_PROPOSAL_LABELS: Readonly<Record<RuleProposalKind, string>> = Object.freeze({
  keep: 'Keep',
  'change-value': 'Change the value',
  drop: 'Drop',
  configure: 'Move to configuration',
  standard: 'Move to SAP standard',
});

/** One sentence and the lines it was read from. `anchors` is never empty. */
export interface ExplainedSentence {
  text: string;
  anchors: SourceRange[];
}

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface RuleExplanation {
  /** `BR-001`. */
  id: string;
  /**
   * A name in words for a rule on a constant, where the plain wording's title
   * would say "Only … is processed"; null when the condition already names the rule.
   */
  headline: string | null;
  topic: RuleTopic;
  /** Set when the rule is a technical setting, not a business decision — the reason in words. */
  technical: ExplainedSentence | null;
  impact: { score: number; level: ImpactLevel; reasons: string[] };
  /** What the rule does to a case, in business words. */
  protects: ExplainedSentence;
  /** An example with values that stand in the code; null when the code gives none. */
  example: ExplainedSentence | null;
  /** What happens where the rule holds and where it does not; null for a constant nothing reads. */
  sides: { holds: ExplainedSentence; otherwise: ExplainedSentence } | null;
  /** The step it stands in and the conditions of the branches around it. */
  where: ExplainedSentence;
  /** The outer conditions alone, outermost first — for a reader that lists them. */
  parents: ExplainedSentence[];
  proposal: { kind: RuleProposalKind; reason: ExplainedSentence };
  /** Who is asked about it: the business, nobody (it stays as coded), or it is not determined — with the reason. */
  basket: { kind: RuleBasket; reason: ExplainedSentence };
}

export interface RuleSetExplanation {
  rules: RuleExplanation[];
  /** The rules in reading order: topics by their highest impact, rules by impact, then by id. */
  order: string[];
  /** The topics that hold rules, in reading order, each with its rules in order. */
  topics: Array<{ topic: RuleTopic; label: string; lead: string; ruleIds: string[]; impact: number }>;
  /** The rule ids of each basket, in reading order. */
  baskets: Record<RuleBasket, string[]>;
  /** The questions for the business, weightiest first — every business rule in exactly one. */
  questions: RuleQuestion[];
}

/** What the explanation reads besides the rule set: the statements, their nesting and the branches. */
export interface ExplainFacts {
  statements: readonly AbapStatement[];
  structure: Pick<BlockStructure, 'enclosing' | 'blocks'>;
  control: Pick<ControlFlowReport, 'branches'>;
}

/* ---------------------------------------------------------------- helpers */

const range = (lineStart: number, lineEnd?: number): SourceRange => ({ lineStart, lineEnd: Math.max(lineStart, lineEnd ?? lineStart) });

const lineWord = (r: SourceRange): string => (r.lineEnd > r.lineStart ? `lines ${r.lineStart} to ${r.lineEnd}` : `line ${r.lineStart}`);

const lcFirst = (text: string): string => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const ucFirst = (text: string): string => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const unquote = (literal: string): string => {
  const m = /^(['`])([\s\S]*)\1$/.exec(literal.trim());
  return m ? m[2] : literal.trim();
};

const isNumeric = (value: string): boolean => /^-?\d+(?:\.\d+)?$/.test(value);

/** `1000000000` → "1,000,000,000", `50000.00` → "50,000.00" — the code's value, its decimals kept. */
function numberWords(value: string): string {
  // A code is not a number: plant '1000', status '01' stay as the code writes them.
  if (/^-?0\d/.test(value) || (!value.includes('.') && value.replace('-', '').length < 5)) return value;
  const decimals = (value.split('.')[1] ?? '').length;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

/** The value beside a limit, in the code's own precision: `500000` +1 → `500001`, `50000.00` +1 → `50000.01`. */
function beside(value: string, direction: 1 | -1): string {
  const decimals = (value.split('.')[1] ?? '').length;
  const step = 10 ** -decimals;
  return (Number(value) + direction * step).toFixed(decimals);
}

const NORMAL_OPERATOR: Record<string, string> = {
  '=': '=', EQ: '=', '<>': '<>', NE: '<>', '><': '<>', '>': '>', GT: '>', '>=': '>=', GE: '>=', '=>': '>=',
  '<': '<', LT: '<', '<=': '<=', LE: '<=', '=<': '<=', CP: 'CP', NP: 'NP', IN: 'IN', BETWEEN: 'BETWEEN', VALUE: 'VALUE',
};
const operatorOf = (p: RuleParameter): string => NORMAL_OPERATOR[p.operator.toUpperCase()] ?? p.operator.toUpperCase();

/** The bare field of a subject — `gs_eban-werks` → `werks`, `<fs_order>-risk_score` → `risk_score`, `c_max_items` → `max_items`. */
function fieldStem(subject: string | null | undefined): string {
  if (!subject) return '';
  const last = subject.toLowerCase().replace(/[<>[\]]/g, '').split(/->|=>|-|~/).filter(Boolean).pop() ?? '';
  return last.replace(/^(?:lv|gv|ls|lt|gt|gs|iv|ev|cv|rv|it|et|ct|is|es|cs|lc|gc|co|mv|ms|p|s|c|r|i|e)_/, '');
}

/** The business words for a subject. A constant is named by its own name, never by its value. */
function subjectWords(p: RuleParameter | undefined, ctx: PlainContext): string {
  if (!p?.subject) return 'the value';
  if (operatorOf(p) === 'VALUE') return lcFirst(humaniseField(p.subject)) || 'the value';
  return lcFirst(humaniseField(p.subject, ctx)) || 'the value';
}

/** The condition parameters — the tests — leaving out the declaration of the constant they read. */
const testsOf = (rule: BusinessRule): RuleParameter[] => rule.parameters.filter((p) => operatorOf(p) !== 'VALUE');

const valuesOf = (p: RuleParameter): string[] =>
  (p.values.length ? p.values : [p.literal]).map(unquote).filter((v) => v !== '');

/* ------------------------------------------------------------------ topics */

const TECHNICAL_STEM = /^(?:max_?)?(?:lim|limit|items|rows|lines|max|raw|max_raw|dec|decs|decimals|digits|len|length|size|width|buffer|count|cnt|idx|index|tabix|level|log_?level|loglevel|log|debug|trace|test|testmode|mode|package|pack|packsize|package_size|commit|commit_size|block_size|chunk|retries|retry|timeout|wait)$/;
const TECHNICAL_ROUTINE = /(?:^|_)(?:LOG|LOGGING|TRACE|PROTOCOL|APPL_LOG|BAL|DEBUG|WRITE_LOG|ADD_LOG|ADD_MESSAGE|MSG)(?:_|$)/;

/** A value no business would choose as a limit: 999999, 1000000000 — "no limit" written as a number. */
function isSentinel(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  return (/^9{6,}$/.test(value)) || (/^10{6,}$/.test(value));
}

const TOPIC_PATTERNS: Array<[RuleTopic, RegExp]> = [
  ['accounting', /(?:knttp|kostl|aufnr|sakto|hkont|kstar|prctr|posid|pspnr|gl_account|cost_center|account_assign)/],
  ['credit', /(?:cmgst|credit|risk|score|bonit|kred|ctlpc|crblb|klimk|dunn|mahn)/],
  ['materials', /(?:matnr|matkl|mtart|mmsta|mstae|material|stock|^charg$|lgort|^mara$|^marc$)/],
  ['currency', /(?:waers|waerk|currency|curr|gewei|voleh|meins|vrkme|unit|uom)/],
  ['organisation', /(?:^werks$|vkorg|ekorg|bukrs|vtweg|spart|kokrs|plant|purch_org|sales_org|org$)/],
  ['documents', /(?:auart|bsart|blart|fkart|lfart|esart|pstyv|doc_type|doctype|kind|bstnk|^type$|_type$|^typ$|order_type)/],
  ['partners', /(?:kunnr|lifnr|land1|ktokd|ktokk|vendor|customer|kunde|lieferant|partner|country|land$|regio|zterm|payment)/],
  // Short words count only as a whole part of the name: "age" is not in "message", "rate" not in "separate".
  ['dates', /(?:day|date|datum|dat$|budat|bldat|erdat|audat|fkdat|wadat|period|month|year|jahr|monat|tage|week|overdue|(?:^|_)(?:age|old|due)(?:_|$))/],
  ['amounts', /(?:netwr|wrbtr|dmbtr|amount|betrag|kbetr|netpr|price|preis|value|wert|brtwr|total|cost|budget|menge|qty|quantity|weight|volume|ntgew|brgew|pct|percent|toleran|factor|surcharge|(?:^|_)(?:amt|sum|charges?|rate|kg|dev)(?:_|$))/],
  ['status', /(?:status|stat$|role|frg|release|approv|action|level|block|lifsk|faksk|sperr|flag|emergency|priority|prio)/],
];

function topicFromStems(stems: readonly string[], rule: BusinessRule): RuleTopic {
  for (const [topic, re] of TOPIC_PATTERNS) if (stems.some((s) => re.test(s))) return topic;
  if (rule.classes.includes('organisationseinheit')) return 'organisation';
  if (rule.classes.includes('datumsgrenze')) return 'dates';
  if (rule.classes.includes('toleranz')) return 'amounts';
  return 'other';
}

/** Money-like subjects: a limit on them is a decision about an amount. */
const MONEY = /(?:netwr|wrbtr|dmbtr|amount|betrag|kbetr|netpr|price|preis|value|wert|brtwr|total|cost|budget|surcharge|(?:^|_)(?:amt|charges?|fee)(?:_|$))/;

/* ------------------------------------------------------- standard pointers */

/*
 * Where SAP standard may meet a rule: owner decision 21.10.2026 (6) — from the
 * scope items fit to standard uses (`lib/rule-standard-hints.ts`), curated
 * entries only, worded as a check; none when nothing curated matches. The small
 * fixed list of standard functions that stood here before is gone.
 */

/* -------------------------------------------------------- branch reading */

interface ArmPlace {
  branch: Branch;
  arm: BranchArm;
  armIndex: number;
}

/** The arm of an `IF`/`CASE` whose own statement starts on `line`. */
function armAt(control: ExplainFacts['control'], line: number): ArmPlace | null {
  for (const branch of control.branches) {
    const armIndex = branch.arms.findIndex((a) => a.header.lineStart === line && a.kind !== 'else' && a.kind !== 'when-others');
    if (armIndex >= 0) return { branch, arm: branch.arms[armIndex], armIndex };
  }
  return null;
}

function blockOf(structure: ExplainFacts['structure'], branch: Branch): Block | null {
  return structure.blocks.find((b) => b.openIndex === branch.openIndex) ?? null;
}

/** The statements directly in one arm — not those of a block nested in it. */
function armStatements(facts: ExplainFacts, place: ArmPlace): AbapStatement[] {
  const block = blockOf(facts.structure, place.branch);
  const from = place.arm.headerIndex + 1;
  const next = place.branch.arms[place.armIndex + 1];
  const to = next ? next.headerIndex : place.branch.closeIndex;
  const out: AbapStatement[] = [];
  for (let i = from; i < to; i += 1) {
    const around = facts.structure.enclosing[i] ?? [];
    if (block && around[around.length - 1] !== block) continue;
    out.push(facts.statements[i]);
  }
  return out;
}

const insideLoop = (facts: ExplainFacts, index: number): boolean =>
  (facts.structure.enclosing[index] ?? []).some((b) => b.kind === 'loop' || b.kind === 'do' || b.kind === 'while' || b.kind === 'select');

/** What one statement does to the case, in words — or null for one a business reader need not hear about. */
function effectOf(statement: AbapStatement, facts: ExplainFacts, ctx: PlainContext): string | null {
  const text = statement.text.trim();
  const keyword = statement.keyword.toUpperCase();
  const index = facts.statements.indexOf(statement);
  switch (keyword) {
    case 'PERFORM': {
      const name = /^PERFORM\s+([\w/]+)/i.exec(text)?.[1];
      return name ? `goes on to “${humaniseRoutine(name)}”` : null;
    }
    case 'CALL': {
      const fm = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)?.[1];
      if (fm) return `calls “${humaniseRoutine(fm)}”`;
      const tx = /^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(text)?.[1];
      if (tx) return `opens transaction ${tx.toUpperCase()}`;
      const method = /^CALL\s+METHOD\s+\S*?(?:->|=>)?(\w+)\s*(?:EXPORTING|IMPORTING|$|\()/i.exec(text)?.[1];
      return method ? `goes on to “${humaniseRoutine(method)}”` : null;
    }
    case 'MESSAGE': {
      const type = (/^MESSAGE\s+([AEIWSX])\d{3}/i.exec(text)?.[1] ?? /\bTYPE\s+'([AEIWSX])'/i.exec(text)?.[1] ?? '').toUpperCase();
      if (type === 'E' || type === 'A' || type === 'X') return 'stops with an error message';
      if (type === 'W') return 'shows a warning';
      return 'shows a message';
    }
    case 'RETURN':
      return 'stops this step for the case';
    case 'EXIT':
      return insideLoop(facts, index) ? 'ends the loop' : 'stops this step for the case';
    case 'CONTINUE':
      return 'skips this entry and takes the next';
    case 'CHECK':
      return insideLoop(facts, index) ? 'skips the entry unless a further check holds' : 'stops this step unless a further check holds';
    case 'STOP':
    case 'LEAVE':
      return 'ends the program';
    case 'RAISE':
      return 'stops with an exception';
    case 'IF':
    case 'CASE':
      return `leaves the decision to a further test (line ${statement.lineStart})`;
    case 'WRITE':
      return 'prints a line in the list';
    case 'SELECT':
      return 'reads data from the database';
    case 'UPDATE':
    case 'INSERT':
    case 'MODIFY':
    case 'DELETE': {
      if (/^(?:INSERT|MODIFY|DELETE)\s+(?:TABLE\s+)?[lgi]t_|\bINTO\s+TABLE\b|^DELETE\s+ADJACENT/i.test(text)) return null;
      return 'saves the change to the database';
    }
    case 'APPEND':
    case 'CLEAR':
    case 'FREE':
    case 'REFRESH':
    case 'SORT':
    case 'READ':
    case 'LOOP':
    case 'ENDLOOP':
    case 'DATA':
    case 'FIELD-SYMBOLS':
    case 'ASSIGN':
      return null;
    case 'ADD':
    case 'SUBTRACT': {
      const target = /\bTO\s+(\S+)$/i.exec(text)?.[1] ?? /\bFROM\s+(\S+)$/i.exec(text)?.[1];
      return target ? `${keyword === 'ADD' ? 'adds to' : 'subtracts from'} the ${lcFirst(humaniseField(target, ctx))}` : null;
    }
    default: {
      const assign = /^([\w<>~-]+)\s*=\s*(.+)$/.exec(text);
      if (!assign) return null;
      const target = lcFirst(humaniseField(assign[1], ctx));
      const value = assign[2].trim();
      if (/^(['`]).*\1$/.test(value) || isNumeric(value)) return `sets the ${target} to ${valueWords(unquote(value))}`;
      if (/^abap_true$/i.test(value)) return `marks the case as “${target}”`;
      if (/^(?:abap_false|space)$/i.test(value)) return `clears the ${target}`;
      return `works out “${target}”`;
    }
  }
}

function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The effects of a run of statements, at most three, each once. */
function effectsOf(statements: readonly AbapStatement[], facts: ExplainFacts, ctx: PlainContext): string[] {
  const out: string[] = [];
  // Further tests are said once, with their lines: "leaves the decision to further tests (lines 445 and 450)".
  const tests: number[] = [];
  for (const s of statements) {
    const keyword = s.keyword.toUpperCase();
    if (keyword === 'IF' || keyword === 'CASE') {
      if (tests.length === 0) out.push('');
      tests.push(s.lineStart);
      continue;
    }
    const e = effectOf(s, facts, ctx);
    if (e && !out.includes(e)) out.push(e);
  }
  const further = tests.length === 1
    ? `leaves the decision to a further test (line ${tests[0]})`
    : `leaves the decision to further tests (lines ${joinWords(tests.map(String))})`;
  const all = out.map((e) => (e === '' ? further : e));
  if (all.length <= 3) return all;
  // Three at most — and the one that ends the flow is never the one left out: it is what the reader most needs.
  const ending = all.filter((e) => ENDS.test(e));
  const rest = all.filter((e) => !ENDS.test(e)).slice(0, Math.max(0, 3 - ending.length));
  return [...rest, ...ending].slice(0, 3);
}

/**
 * An effect that ends the flow for the case — the step or the program stops.
 * A loop that skips one entry and takes the next does not stop anything:
 * it is `SKIPS`, said as a skip, never as a stop.
 */
const STOPS = /^stops|^ends the program/;
const SKIPS = /^skips/;
const ENDS = /^stops|^ends the program|^skips/;

/** How a side ends for the case: it stops, it skips the entry, or it goes on. */
function endingOf(effects: readonly string[]): 'stop' | 'skip' | null {
  if (effects.some((e) => STOPS.test(e))) return 'stop';
  if (effects.some((e) => SKIPS.test(e))) return 'skip';
  return null;
}

/* --------------------------------------------------------------- wording */

const OPERATOR_WORDS: Record<string, string> = {
  '>': 'above', '>=': 'at or above', '<': 'below', '<=': 'at or below', '=': 'equal to', '<>': 'other than',
};

/** "starting with TEST", "ending with -X", "containing DUMMY" — a `CP` pattern in words. */
function patternWords(value: string): string {
  const v = value.replace(/^\*|\*$/g, '');
  if (value.startsWith('*') && value.endsWith('*')) return `containing ${v}`;
  if (value.endsWith('*')) return `starting with ${v}`;
  if (value.startsWith('*')) return `ending with ${v}`;
  return `matching ${value}`;
}

const valueWords = (v: string): string => (isNumeric(v) ? numberWords(v) : v);

/** The condition of a test in words — the engine's phrase, lower-cased, never the code. */
function phraseOf(condition: string, ctx: PlainContext, line: number): string {
  const phrase = conditionToPhrase(condition, ctx, line);
  if (phrase !== 'Condition met') return lcFirst(phrase);
  // Too long for a label: the whole condition in words, without a length limit.
  const full = ruleConditionText(condition, ctx, line).full;
  return full ? lcFirst(full) : 'its condition holds';
}

function parentWords(branch: EnclosingBranch, ctx: PlainContext): string {
  const notHeld = (conditions: readonly string[]) =>
    conditions.map((c) => `not “${phraseOf(c, ctx, branch.chainLine)}”`).join(' and ');
  if (branch.kind === 'if') return `“${phraseOf(branch.condition ?? '', ctx, branch.line)}”`;
  if (branch.kind === 'elseif') {
    const earlier = notHeld(branch.earlier);
    return `${earlier ? `${earlier} but ` : ''}“${phraseOf(branch.condition ?? '', ctx, branch.line)}”`;
  }
  if (branch.kind === 'else') return notHeld(branch.earlier) || 'the test before it does not hold';
  const selector = lcFirst(humaniseField(branch.selector ?? '', ctx)) || 'the value';
  if (branch.kind === 'when') return `${selector} is ${branch.condition?.split(/\s+OR\s+|,\s*/i).map(unquote).join(' or ')}`;
  return `${selector} is none of ${branch.earlier.flatMap((e) => e.split(/\s+OR\s+|,\s*/i)).map(unquote).join(', ')}`;
}

/**
 * The condition a test stands for. A `WHEN` arm's rule is labelled
 * `CASE gs_eban-knttp: 'K'`, its condition text only the values; as a
 * condition it is the selector equal to one of them (as `business-card.ts` reads it).
 */
function conditionFor(rule: BusinessRule, p: RuleParameter): string {
  const when = /^CASE\s+(\S+):\s*(.+)$/.exec(rule.label);
  if (!when) return p.conditionText;
  return when[2].split(/,\s*/).filter(Boolean).map((v) => `${when[1]} = ${v}`).join(' OR ');
}

/* ---------------------------------------------------------------- explain */

interface RuleContext {
  rule: BusinessRule;
  tests: RuleParameter[];
  first: RuleParameter | undefined;
  subject: string;
  stems: string[];
  declarationOnly: boolean;
  unreached: boolean;
  control: boolean;
  place: ArmPlace | null;
  statementIndex: number;
  anchor: SourceRange;
  /** From engine 3.0.20: a cap of a thousand million or more is technical on any subject. */
  reads3020: boolean;
}

function contextOf(rule: BusinessRule, facts: ExplainFacts, ctx: PlainContext, reads3020 = false): RuleContext {
  const tests = testsOf(rule);
  const first = tests[0] ?? rule.parameters[0];
  const stems = [...new Set(rule.parameters.map((p) => fieldStem(p.subject)).filter(Boolean))];
  const conditionLine = tests[0]?.lineStart ?? rule.parameters[0]?.lineStart ?? rule.sentences[0]?.anchors[0]?.lineStart ?? 1;
  const statementIndex = facts.statements.findIndex((s) => s.lineStart === conditionLine && /^(?:IF|ELSEIF|WHEN|CHECK|WHILE|CASE)$/.test(s.keyword.toUpperCase()));
  const anchor = tests[0] ? range(tests[0].lineStart, tests[0].lineEnd) : rule.sentences[0]?.anchors[0] ? range(rule.sentences[0].anchors[0].lineStart, rule.sentences[0].anchors[0].lineEnd) : range(conditionLine);
  return {
    rule,
    tests,
    first,
    subject: subjectWords(first, ctx),
    stems,
    declarationOnly: rule.withoutProcessElement?.reason === 'declaration-only' || tests.length === 0,
    unreached: rule.withoutProcessElement?.reason === 'unreached',
    control: rule.type === 'control',
    place: tests[0] ? armAt(facts.control, tests[0].lineStart) : null,
    statementIndex,
    anchor,
    reads3020,
  };
}

function technicalOf(rc: RuleContext, demo: boolean): ExplainedSentence | null {
  const { rule } = rc;
  const values = rule.parameters.flatMap(valuesOf);
  const routines = rule.sources.map((s) => (s.routine ?? '').toUpperCase());
  const where = rc.anchor;
  if (demo) return { text: 'It selects the program’s own demo data — test data, not a business decision.', anchors: [where] };
  if (rc.stems.some((s) => /^sy-|^(?:subrc|tabix|index|dbcnt)$/.test(s))) {
    return { text: 'It reads a system field of the program run, not a business value.', anchors: [where] };
  }
  // A number alone proves nothing: 999999 can be a business limit on an amount.
  // Only a subject named as a setting of the
  // program makes the rule technical; the sentinel then says what its value is.
  const technicalSubject = rc.stems.length > 0 && rc.stems.every((s) => TECHNICAL_STEM.test(s));
  // From engine 3.0.20 (owner report 21.10.2026, "Only maximum scaled 1000000000000 is processed" first
  // in "What it decides"): a cap of a thousand million or more is "no limit" on any subject.
  if (rc.reads3020 && values.some((v) => /^(?:10{9,}|9{9,})$/.test(v))) {
    const v = values.find((x) => /^(?:10{9,}|9{9,})$/.test(x)) ?? '';
    return { text: `${numberWords(v)} is “no limit” written as a number — a technical cap, not a business limit.`, anchors: [where] };
  }
  if (technicalSubject && values.some(isSentinel)) {
    const v = values.find(isSentinel) ?? '';
    return { text: `${numberWords(v)} is “no limit” written as a number — a technical cap, not a business limit.`, anchors: [where] };
  }
  if (technicalSubject) {
    return { text: `${ucFirst(rc.subject)} is a setting of the program itself — how it counts, rounds or logs — not a business decision.`, anchors: [where] };
  }
  if (routines.length > 0 && routines.every((r) => TECHNICAL_ROUTINE.test(r))) {
    return { text: `It stands in “${humaniseRoutine(routines[0])}”, which writes the program’s log, not a business result.`, anchors: [where] };
  }
  return null;
}

/**
 * The first condition of a rule as one test: its subject, its operator and
 * every value the condition tests that subject against (`land1 <> 'DE' AND
 * land1 <> 'AT'` is one test on the country with two values). `mixed` when the
 * condition tests more than one subject — then no single-subject sentence fits.
 */
interface FirstTest {
  p: RuleParameter;
  op: string;
  values: string[];
  subject: string;
  mixed: boolean;
  /** The other subjects of the same condition with a value the example can name. */
  partners: RuleParameter[];
}

function firstTestOf(rc: RuleContext, ctx: PlainContext): FirstTest | null {
  const p = rc.tests[0];
  if (!p) return null;
  const op = operatorOf(p);
  const same = rc.tests.filter((q) => q.lineStart === p.lineStart && fieldStem(q.subject) === fieldStem(p.subject) && operatorOf(q) === op);
  const values = [...new Set(same.flatMap(valuesOf))];
  const others = rc.tests.filter((q) => q.lineStart === p.lineStart && fieldStem(q.subject) !== fieldStem(p.subject));
  // A condition joining other tests the parameters do not hold (a flag, a field
  // against a field) is mixed as well: its sentence names the whole condition.
  const parts = conditionFor(rc.rule, p).split(/\s+(?:AND|OR)\s+/i).length;
  return { p, op, values, subject: subjectWords(p, ctx), mixed: others.length > 0 || parts > same.length, partners: others };
}

function protectsOf(rc: RuleContext, sidesHolds: string[], sidesOtherwise: string[], ctx: PlainContext): ExplainedSentence {
  const { rule, subject } = rc;
  const anchors = [rc.anchor];
  if (rc.declarationOnly) {
    const decl = rule.parameters[0];
    const fixed = decl ? valuesOf(decl).map(valueWords).join(', ') : '';
    return {
      text: `It names a fixed value${fixed ? ` — ${subject} ${fixed} —` : ''} that no condition in this program reads, so as written it decides nothing.`,
      anchors: decl ? [range(decl.lineStart, decl.lineEnd)] : anchors,
    };
  }
  const t = firstTestOf(rc, ctx);
  const condition = t ? phraseOf(conditionFor(rule, t.p), ctx, t.p.lineStart) : 'its condition holds';
  // Which side ends the flow decides the sentence: an IF whose branch returns
  // keeps the cases where it holds out, a CHECK lets only those cases through.
  // A loop skip is said as a skip: the loop goes on with the next entry.
  const holdsEnd = endingOf(sidesHolds) ?? (rc.control && sidesHolds.length + sidesOtherwise.length === 0 ? 'stop' : null);
  const otherwiseEnd = endingOf(sidesOtherwise);
  const what = (end: 'stop' | 'skip') => (end === 'stop' ? 'the program stops here' : 'the program skips the entry and takes the next');
  if (holdsEnd) {
    if (t && !t.mixed && t.op === '<>' && t.values.length > 0) {
      const listed = joinWords(t.values.map(valueWords)).replace(/ and ([^,]+)$/, ' or $1');
      return { text: `Only cases with ${t.subject} ${listed} go further; for every other ${t.subject} ${what(holdsEnd)}.`, anchors };
    }
    return holdsEnd === 'stop'
      ? { text: `It keeps cases where ${condition} from going further: for them the program stops here.`, anchors }
      : { text: `It leaves out entries where ${condition}: the program skips them and goes on with the next entry.`, anchors };
  }
  if (otherwiseEnd) {
    if (t && !t.mixed && (t.op === '<>' || t.op === '=') && t.values.length > 0) {
      const listed = joinWords(t.values.map(valueWords)).replace(/ and ([^,]+)$/, ' or $1');
      return t.op === '<>'
        ? { text: `Only cases with a ${t.subject} other than ${listed} go further; for ${listed} ${what(otherwiseEnd)}.`, anchors }
        : { text: `Only cases with ${t.subject} ${listed} go further; for every other ${t.subject} ${what(otherwiseEnd)}.`, anchors };
    }
    return otherwiseEnd === 'stop'
      ? { text: `It lets a case through only where ${condition}; every other case stops here.`, anchors }
      : { text: `It takes an entry further only where ${condition}; the program skips every other entry and goes on with the next.`, anchors };
  }
  if (!t || t.mixed) {
    return { text: `It gives cases where ${condition} their own handling.`, anchors };
  }
  const { op, values } = t;
  const v = values[0] ?? '';
  if (OPERATOR_WORDS[op] && isNumeric(v) && op !== '=' && op !== '<>') {
    return { text: `It sets a limit on the ${t.subject}: ${OPERATOR_WORDS[op]} ${numberWords(v)}, a case is handled differently from the rest.`, anchors };
  }
  const either = (list: readonly string[]) => joinWords(list.map(valueWords)).replace(/ and ([^,]+)$/, ' or $1');
  if (rule.classes.includes('organisationseinheit') && op === '=') {
    return { text: `It ties this part of the program to ${t.subject} ${either(values)}; other units are not handled by this branch.`, anchors };
  }
  if (op === '<>' && values.length > 0) {
    return { text: `It treats every ${t.subject} except ${joinWords(values.map(valueWords))} differently from the rest.`, anchors };
  }
  if ((op === 'CP' || op === 'NP') && values.length > 0) {
    return { text: `It picks out cases whose ${t.subject} is ${values.map(patternWords).join(' or ')} for their own handling.`, anchors };
  }
  if (values.length > 0 && (op === '=' || op === 'IN')) {
    return { text: `It gives cases with ${t.subject} ${either(values)} their own handling.`, anchors };
  }
  return { text: `It gives cases where ${condition} their own handling.`, anchors };
}

function exampleOf(rc: RuleContext, siblings: ReadonlyMap<string, string[]>, ctx: PlainContext): ExplainedSentence | null {
  const { rule } = rc;
  if (rc.declarationOnly) {
    const decl = rule.parameters[0];
    const v = decl ? valuesOf(decl)[0] : undefined;
    if (!decl || !v) return null;
    return { text: `The code declares the ${rc.subject} as ${valueWords(v)} on line ${decl.lineStart} and never tests a case against it.`, anchors: [range(decl.lineStart, decl.lineEnd)] };
  }
  const t = firstTestOf(rc, ctx);
  if (!t || t.values.length === 0) return null;
  const { p, op, values } = t;
  const anchors = [range(p.lineStart, p.lineEnd)];
  const subject = t.subject;
  const Subject = ucFirst(subject);
  // The other tests of an AND with a value of their own go into the example.
  const holdsOf = (q: RuleParameter): string | null => {
    const qop = operatorOf(q);
    const qv = valuesOf(q)[0];
    if (!qv) return null;
    const qs = subjectWords(q, ctx);
    if (isNumeric(qv) && (qop === '>' || qop === '>=' || qop === '<' || qop === '<=')) {
      return `${qs} ${numberWords(qop === '>' ? beside(qv, 1) : qop === '<' ? beside(qv, -1) : qv)}`;
    }
    if (qop === '=') return `${qs} ${valueWords(qv)}`;
    return null;
  };
  const and = /\sAND\s/i.test(conditionFor(rule, p));
  const extra = and ? t.partners.map(holdsOf).filter((s): s is string => !!s) : [];
  const also = extra.length ? ` together with ${joinWords(extra)}` : '';
  // "When the rest of the condition holds" — said whenever the condition has more than the example names.
  // An OR holds on any one part; an AND only with every part, so the example says so when it names fewer.
  const rest = and && conditionFor(rule, p).split(/\s+AND\s+/i).length > 1 + extra.length
    ? ' (when the rest of its condition holds)'
    : '';
  const others = (siblings.get(fieldStem(p.subject)) ?? []).filter((v) => !values.includes(v));
  const either = (list: readonly string[]) => joinWords(list.map(valueWords)).replace(/ and ([^,]+)$/, ' or $1');

  if (values.length === 1 && isNumeric(values[0]) && (op === '>' || op === '>=' || op === '<' || op === '<=')) {
    const v = values[0];
    const applies = op === '>' ? beside(v, 1) : op === '<' ? beside(v, -1) : v;
    const not = op === '>' || op === '<' ? v : op === '>=' ? beside(v, -1) : beside(v, 1);
    const caveat = p.caveat ? ' The code does not say in which currency or unit.' : '';
    return {
      text: `${Subject} ${numberWords(applies)}${also}: the rule applies${rest}. ${Subject} ${numberWords(not)}: it does not.${caveat}`,
      anchors,
    };
  }
  if ((op === 'CP' || op === 'NP') && values.length > 0) {
    const words = values.map(patternWords);
    return {
      text: `${Subject} ${words.join(' or ')}: the rule ${op === 'CP' ? 'applies' : 'does not apply'}${rest}. Any other ${subject}: it ${op === 'CP' ? 'does not' : 'does'}.`,
      anchors,
    };
  }
  if (op === '<>') {
    return {
      text: `${Subject} ${either(values)}: the rule does not apply. Any other ${subject}: it does${rest}.`,
      anchors,
    };
  }
  if (op === '=' || op === 'IN') {
    const head = `${Subject} ${either(values)}${also}: the rule applies${rest}.`;
    const tail = others.length ? ` ${Subject} ${valueWords(others[0])} is handled by another rule.` : ` Any other ${subject}: it does not.`;
    return { text: `${head}${tail}`, anchors };
  }
  return null;
}

function sidesOf(rc: RuleContext, facts: ExplainFacts, ctx: PlainContext): { holds: ExplainedSentence; otherwise: ExplainedSentence; holdsEffects: string[]; otherwiseEffects: string[] } | null {
  if (rc.declarationOnly) return null;
  const p = rc.tests[0];
  if (!p) return null;
  const statement = rc.statementIndex >= 0 ? facts.statements[rc.statementIndex] : null;
  const keyword = statement?.keyword.toUpperCase();
  if (keyword === 'CHECK') {
    const loop = insideLoop(facts, rc.statementIndex);
    const otherwiseEffects = [loop ? 'skips this entry and takes the next' : 'stops this step for the case'];
    return {
      holds: { text: 'Where it holds: the program goes on with the case.', anchors: [range(p.lineStart, p.lineEnd)] },
      otherwise: { text: `Where it does not: the program ${otherwiseEffects[0]}.`, anchors: [range(p.lineStart, p.lineEnd)] },
      holdsEffects: [],
      otherwiseEffects,
    };
  }
  if (keyword === 'WHILE') {
    return {
      holds: { text: 'Where it holds: the loop runs again.', anchors: [range(p.lineStart, p.lineEnd)] },
      otherwise: { text: 'Where it does not: the loop ends and the program goes on after it.', anchors: [range(p.lineStart, p.lineEnd)] },
      holdsEffects: [],
      otherwiseEffects: [],
    };
  }
  const place = rc.place;
  if (!place) return null;
  const body = armStatements(facts, place);
  const holdsEffects = effectsOf(body, facts, ctx);
  const armRange = range(place.arm.lineStart, place.arm.lineEnd);
  const holds: ExplainedSentence = {
    text: holdsEffects.length
      ? `Where it holds: the program ${joinWords(holdsEffects)}.`
      : 'Where it holds: the branch does nothing a business reader would see — it prepares data for later steps.',
    anchors: [armRange],
  };
  const rest = place.branch.arms.slice(place.armIndex + 1);
  const next = rest[0];
  let otherwise: ExplainedSentence;
  let otherwiseEffects: string[] = [];
  if (!next) {
    otherwise = {
      text: `Where it does not: this branch is skipped and the program goes on after ${lineWord(range(place.branch.lineEnd))}.`,
      anchors: [range(place.branch.lineStart, place.branch.lineEnd)],
    };
  } else if (next.kind === 'else' || next.kind === 'when-others') {
    otherwiseEffects = effectsOf(armStatements(facts, { branch: place.branch, arm: next, armIndex: place.armIndex + 1 }), facts, ctx);
    otherwise = {
      text: otherwiseEffects.length
        ? `Where it does not: the program ${joinWords(otherwiseEffects)}.`
        : 'Where it does not: the program goes on without this step.',
      anchors: [range(next.lineStart, next.lineEnd)],
    };
  } else if (next.kind === 'elseif') {
    otherwise = {
      text: `Where it does not: the next test decides — “${phraseOf(next.condition, ctx, next.header.lineStart)}” (line ${next.header.lineStart}).`,
      anchors: [range(next.header.lineStart, next.header.lineEnd)],
    };
  } else {
    // A further WHEN: the other values of the same CASE, and what happens to a value none of them lists.
    const others = rest.filter((a) => a.kind === 'when').flatMap((a) => a.condition.split(/\s+OR\s+|,\s*/i).map(unquote)).filter(Boolean);
    const fallback = rest.find((a) => a.kind === 'when-others');
    const fallbackEffects = fallback ? effectsOf(armStatements(facts, { branch: place.branch, arm: fallback, armIndex: place.branch.arms.indexOf(fallback) }), facts, ctx) : [];
    otherwiseEffects = fallbackEffects;
    const shown = others.slice(0, 4);
    otherwise = {
      text: `Other values have their own branch${others.length === 1 ? '' : 'es'} (${shown.join(', ')}${others.length > shown.length ? ` and ${others.length - shown.length} more` : ''}); ${fallback ? (fallbackEffects.length ? `for any value not listed the program ${joinWords(fallbackEffects)}` : 'any value not listed goes on without a step of its own') : 'a value none of them lists is not handled here'}.`,
      anchors: [range(next.header.lineStart, place.branch.lineEnd)],
    };
  }
  return { holds, otherwise, holdsEffects, otherwiseEffects };
}

/** The places a rule decides at: the distinct conditions that test it (a constant read twice decides at two). */
function placesOf(rc: RuleContext): number {
  return Math.max(1, new Set(rc.tests.map((p) => p.lineStart)).size);
}

/**
 * A name for a rule on a constant — the title the plain wording gives it reads
 * "Only critical score 80 is processed" for a constant a condition compares
 * against (owner report 21.10.2026: "Only maximum raw 1000000000 is
 * processed"). Null for every other rule: its condition already names it.
 */
function headlineOf(rc: RuleContext, technical: boolean, ctx: PlainContext, holdsStops: boolean): string | null {
  const decl = rc.rule.parameters[0];
  if (!decl || operatorOf(decl) !== 'VALUE') return null;
  const value = valuesOf(decl)[0] ?? '';
  const name = ucFirst(subjectWords(decl, ctx));
  if (rc.declarationOnly) return `${name} ${valueWords(value)} — declared, not used`;
  const t = firstTestOf(rc, ctx);
  const subject = t ? ucFirst(t.subject) : name;
  if (technical) return `${subject}: ${valueWords(value)} (technical setting)`;
  if (t && OPERATOR_WORDS[t.op] && t.op !== '=' && t.op !== '<>' && isNumeric(value)) {
    return `${subject} ${OPERATOR_WORDS[t.op]} ${numberWords(value)}`;
  }
  // A test that stops every case but one value names the one value it lets through.
  if (t && t.op === '<>') return holdsStops ? `Only ${t.subject} ${valueWords(value)}` : `${subject} other than ${valueWords(value)}`;
  return `${subject} ${valueWords(value)}`;
}

function whereOf(rc: RuleContext, facts: ExplainFacts, ctx: PlainContext): { where: ExplainedSentence; parents: ExplainedSentence[] } {
  const { rule } = rc;
  const routines = [...new Set(rule.sources.map((s) => s.routine).filter((r): r is string => !!r))];
  const places = placesOf(rc);
  const parents: ExplainedSentence[] = rc.statementIndex >= 0
    ? enclosingBranches(facts.statements, facts.structure, rc.statementIndex).map((b) => ({
      text: `${parentWords(b, ctx)} (line ${b.line})`,
      anchors: [range(b.line)],
    }))
    : [];
  const step = routines.length
    ? `In the step “${humaniseRoutine(routines[0])}”${routines.length > 1 ? ` and ${routines.length - 1} more` : ''}`
    : 'At the top of the program';
  const count = places > 1 ? `, at ${places} places` : '';
  const within = parents.length ? `, and only when ${parents.map((p) => p.text).join(' and ')}` : '';
  return {
    where: { text: `${step}${count}${within}.`, anchors: [rc.anchor, ...parents.flatMap((p) => p.anchors)] },
    parents,
  };
}

function impactOf(rc: RuleContext, technical: boolean, sides: ReturnType<typeof sidesOf>): RuleExplanation['impact'] {
  const reasons: string[] = [];
  if (technical) return { score: 0, level: 'low', reasons: ['a technical setting'] };
  if (rc.declarationOnly) return { score: 0, level: 'low', reasons: ['nothing reads it'] };
  if (rc.unreached) return { score: 0, level: 'low', reasons: ['no entry point reaches it'] };
  let score = 1;
  const ending = endingOf([...(sides?.holdsEffects ?? []), ...(sides?.otherwiseEffects ?? [])]);
  if (ending === 'stop' || (rc.control && ending === null)) {
    score += 3;
    reasons.push('stops the process');
  } else if (ending === 'skip') {
    // A skipped entry leaves the rest of the run going: weightier than a branch, never a stop.
    score += 2;
    reasons.push('skips entries');
  }
  const steps = rc.rule.processElements.filter((e) => e.relation === 'branch').length;
  if (steps > 0) {
    score += Math.min(steps, 3);
    reasons.push(steps === 1 ? 'decides a step' : `decides ${steps} steps`);
  }
  const places = placesOf(rc);
  if (places > 1) {
    score += 1;
    reasons.push(`stands at ${places} places`);
  }
  if (rc.stems.some((s) => MONEY.test(s))) {
    score += 2;
    reasons.push('decides by an amount');
  } else if (rc.rule.classes.includes('toleranz') || rc.rule.classes.includes('datumsgrenze')) {
    score += 1;
    reasons.push('a number somebody chose');
  }
  if (rc.rule.classes.includes('organisationseinheit')) {
    score += 1;
    reasons.push('ties the program to one unit');
  }
  return { score, level: score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low', reasons };
}

function proposalOf(rc: RuleContext, technical: boolean, hasInclude: boolean): RuleExplanation['proposal'] {
  const { rule, subject } = rc;
  const anchors = [rc.anchor];
  const say = (kind: RuleProposalKind, text: string, at: SourceRange[] = anchors) => ({ kind, reason: { text, anchors: at } });
  if (technical) return say('keep', 'A technical setting, not a business decision: keep it as it is, or leave it to IT.');
  if (rc.declarationOnly) {
    return say(
      'drop',
      `No condition in this program reads ${subject}, so it decides nothing as written.${hasInclude ? ' An include that is not part of this upload might still read it — check that first.' : ''} If nothing does, it can go.`,
    );
  }
  if (rc.unreached) return say('drop', 'No entry point of the program reaches the step it stands in, so it never runs as written. Unless that step is called from elsewhere, it can go.');
  const standard = ruleStandardHint(rc.stems);
  if (standard) return say('standard', standard.text);
  const tests = rc.tests;
  const values = tests.flatMap(valuesOf);
  const op = tests[0] ? operatorOf(tests[0]) : '=';
  if (tests.some((p) => (operatorOf(p) === 'CP' || operatorOf(p) === '=') && valuesOf(p).some((v) => /^(?:TEST|DUMMY|DEMO|XXX)/i.test(v)))) {
    return say('drop', `The values look like test data (${values.filter((v) => /^(?:TEST|DUMMY|DEMO|XXX)/i.test(v)).join(', ')}). If no such documents are created in production, the rule can go.`);
  }
  const numeric = tests.find((p) => isNumeric(valuesOf(p)[0] ?? '') && ['>', '>=', '<', '<='].includes(operatorOf(p)));
  if (numeric) {
    const v = numberWords(valuesOf(numeric)[0]);
    if (numeric.caveat && rc.stems.some((s) => MONEY.test(s))) {
      return say('change-value', `The code does not say in which currency ${v} is meant. State the limit with its currency — then keep it in configuration, so the business can adjust it.`, [range(numeric.lineStart, numeric.lineEnd)]);
    }
    return say('configure', `The limit ${v} can only change with a new version of the program. Kept in configuration, the business can adjust it itself.`, [range(numeric.lineStart, numeric.lineEnd)]);
  }
  if (rule.classes.includes('organisationseinheit')) {
    return say('configure', `${ucFirst(subject)} ${values.join(', ')} is fixed in the code. Kept in configuration, a further unit needs no program change.`);
  }
  const distinct = [...new Set(values)];
  if (distinct.length >= 3 && (op === '=' || op === '<>' || op === 'IN')) {
    return say('configure', `A list of ${distinct.length} values kept in the code. Kept in configuration, it can grow without a program change.`);
  }
  if (rule.classes.includes('datumsgrenze')) {
    return say('configure', 'A time limit written into the code. Kept in configuration, the business can adjust it itself.');
  }
  return say('keep', `It decides a business case by ${subject} as the code has it. Keep it, unless the business now decides this differently.`);
}

/* ---------------------------------------------------------------- baskets */

const TEST_DATA = /^(?:TEST|DUMMY|DEMO|XXX)/i;

/** A value the program writes into a field itself: `'X'`, `abap_true`, `space`. */
const WRITTEN_VALUE = /^(['`])([\s\S]*)\1$|^(abap_true|abap_false|space)$/i;

/**
 * The values the program assigns to each field from a literal, by field stem,
 * with the first line — `<fs_order>-action = 'SET_DELIVERY_BLOCK'` makes
 * `action` a marker the program sets and reads itself. Conditions are not assignments.
 */
/**
 * The field a marker is written to and read from, as a key. A variable by its
 * whole name; a component by its name and the declared type of what it is a
 * component of — `cs_customer-risk_class` written in a routine that changes
 * the customer and `gs_customer-risk_class` read later are one field of one
 * row type (`ty_customer`). Where that type is not declared, the owner's
 * own name. A variable and a component that only end alike (`lv_status`,
 * `ls_document-status`), or one component of two row types
 * (`ls_billing-status`, `ls_order-status`), are not one field.
 */
function markerKey(name: string | null | undefined, types: ReadonlyMap<string, string>): string {
  if (!name) return '';
  const clean = name.toLowerCase().replace(/\s+/g, '');
  const at = clean.search(/->|=>|-|~/);
  if (at < 0) return `v:${clean}`;
  const owner = clean.slice(0, at);
  const component = clean.split(/->|=>|-|~/).filter(Boolean).pop() ?? '';
  return `c:${types.get(owner) ?? owner}:${component}`;
}

/** The declared type of every name a statement declares with `TYPE`: data, field symbols, routine parameters. */
function declaredTypes(statements: readonly AbapStatement[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of statements) {
    if (!/^(?:DATA|STATICS|CLASS-DATA|FIELD-SYMBOLS|FORM|METHODS|CLASS-METHODS)$/i.test(s.keyword)) continue;
    for (const m of s.text.matchAll(/(<?[\w/]+>?)\s+TYPE\s+(?!(?:STANDARD|SORTED|HASHED|RANGE|TABLE|LINE)\b)(?:REF\s+TO\s+)?([\w/]+)/gi)) {
      const name = m[1].toLowerCase();
      if (!out.has(name)) out.set(name, m[2].toLowerCase());
    }
  }
  return out;
}

function writtenValues(statements: readonly AbapStatement[], demoRoutines: ReadonlySet<string>, types: ReadonlyMap<string, string>): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  let routine: string | null = null;
  for (const s of statements) {
    const keyword = s.keyword.toUpperCase();
    if (keyword === 'FORM' || keyword === 'METHOD') routine = (/^(?:FORM|METHOD)\s+([\w/~]+)/i.exec(s.text)?.[1] ?? '').toUpperCase();
    if (keyword === 'ENDFORM' || keyword === 'ENDMETHOD') routine = null;
    // The program's own demo data is not a marker it sets: a demo routine fills fields with test values.
    if (routine && demoRoutines.has(routine)) continue;
    if (/^(?:IF|ELSEIF|WHEN|CHECK|WHILE|CASE|DATA|CONSTANTS|TYPES|PARAMETERS|PARAMETER|SELECT-OPTIONS|STATICS|CLASS-DATA|FIELD-SYMBOLS)$/i.test(s.keyword)) continue;
    const m = /^([\w<>~-]+)\s*=\s*(\S+)$/.exec(s.text.trim().replace(/\.$/, ''));
    if (!m) continue;
    const v = WRITTEN_VALUE.exec(m[2]);
    if (!v) continue;
    const stem = markerKey(m[1], types);
    if (!stem) continue;
    const value = (v[2] ?? v[3] ?? '').toUpperCase();
    const held = out.get(stem) ?? new Map<string, number>();
    if (!held.has(value)) held.set(value, s.lineStart);
    out.set(stem, held);
  }
  return out;
}

interface BasketFacts {
  written: Map<string, Map<string, number>>;
  /** `declaredTypes` of the source: what makes two components one field. */
  types: ReadonlyMap<string, string>;
  ctx: PlainContext;
  hasInclude: boolean;
}

/** A selection parameter that is a checkbox or a flag — an option chosen when the program is started. */
function isRunOption(subject: string | null | undefined, ctx: PlainContext): boolean {
  const name = (subject ?? '').toLowerCase().replace(/[<>]/g, '');
  const selection = ctx.selections.get(name);
  return !!selection && !selection.selectOption && (selection.checkbox || ctx.flags.has(name));
}

/** A selection-screen parameter or select-option. */
function isSelectionField(subject: string | null | undefined, ctx: PlainContext): boolean {
  return ctx.selections.has((subject ?? '').toLowerCase().replace(/[<>]/g, ''));
}

function basketOf(rc: RuleContext & { holdsStop: boolean }, technical: ExplainedSentence | null, topic: RuleTopic, bf: BasketFacts): RuleExplanation['basket'] {
  const anchors = [rc.anchor];
  const say = (kind: RuleBasket, text: string, at: SourceRange[] = anchors): RuleExplanation['basket'] => ({ kind, reason: { text, anchors: at } });
  if (technical) return say('technical', technical.text, technical.anchors);
  if (rc.declarationOnly) {
    const decl = rc.rule.parameters[0];
    return say(
      'undetermined',
      `No condition in this program reads ${rc.subject}, so what it is for is not determined from the code${bf.hasInclude ? ' — an include that is not part of this upload might read it' : ''}.`,
      decl ? [range(decl.lineStart, decl.lineEnd)] : anchors,
    );
  }
  if (rc.unreached) return say('undetermined', 'No entry point of the program reaches the step it stands in, so whether it still matters is not determined from the code.');
  const tests = rc.tests;
  const values = tests.flatMap(valuesOf);
  const testValues = values.filter((v) => TEST_DATA.test(v));
  // Test data only when every value it picks out is: `IN ('TEST-1', 'LIVE')` still picks out a live one.
  if (testValues.length > 0 && tests.every((p) => valuesOf(p).length === 0 || valuesOf(p).every((v) => TEST_DATA.test(v)))) {
    return say('technical', `It picks out test documents (${[...new Set(testValues)].join(', ')}) — test data, not a business decision.`);
  }
  // "No limit" written as a number on anything but money: a technical cap, whatever the field is called.
  if (values.some(isSentinel) && !rc.stems.some((s) => MONEY.test(s))) {
    const v = values.find(isSentinel) ?? '';
    return say('technical', `${numberWords(v)} is “no limit” written as a number — a technical cap, not a business limit.`);
  }
  // A check of what was entered on the selection screen, ending the run with a message: a plausibility check of the input.
  if (tests.length > 0 && tests.every((p) => isSelectionField(p.subject, bf.ctx)) && rc.holdsStop) {
    return say('technical', `It checks the ${rc.subject} entered when the program is started and stops with a message if it is out of range — a plausibility check of the input, not a business rule.`);
  }
  if (tests.length > 0 && tests.every((p) => isRunOption(p.subject, bf.ctx))) {
    return say('technical', `It follows an option chosen when the program is started (${humaniseField(tests[0].subject ?? '', bf.ctx) || 'a run option'}), not a business value.`);
  }
  // A marker the program writes and reads back itself: every tested value is one it assigns. Only
  // for a status, an action, a class it works out — never for an organisational unit, a document
  // type, a partner, a material, an amount or a date: a program that copies a plant into a field
  // has not made the plant its own marker.
  const markerTopic = topic === 'status' || topic === 'credit' || topic === 'other';
  const marker = markerTopic && tests.length > 0 && tests.every((p) => {
    const held = bf.written.get(markerKey(p.subject, bf.types));
    const vs = valuesOf(p).map((v) => v.toUpperCase());
    return !!held && vs.length > 0 && vs.every((v) => held.has(v));
  });
  if (marker) {
    const p = tests[0];
    const v = valuesOf(p)[0] ?? '';
    const line = bf.written.get(markerKey(p.subject, bf.types))?.get(v.toUpperCase()) ?? p.lineStart;
    return say(
      'technical',
      `The program sets the ${rc.subject} to ${valueWords(v)} itself (line ${line}) and reads it back here — a marker of its own, not a value the business sets.`,
      [rc.anchor, range(line)],
    );
  }
  if (tests.length > 0 && values.length === 0) {
    return say('technical', 'It checks that a value is there before the program goes on — a plausibility check, not a business rule.');
  }
  if (topic === 'other') {
    return say('undetermined', `The code does not show which business subject the ${rc.subject} belongs to, so whether the business sets it is not determined.`);
  }
  return say('business', `${ucFirst(rc.subject)}: a value the business sets (${RULE_TOPIC_LABELS[topic].toLowerCase()}), so the business is asked.`);
}

/* -------------------------------------------------------------- questions */

interface QuestionInput {
  rc: RuleContext;
  t: FirstTest | null;
  holds: string[];
  otherwise: string[];
  explanation: RuleExplanation;
}

const LIMIT_OPS = new Set(['>', '>=', '<', '<=']);
const isLimit = (t: FirstTest | null): boolean => !!t && !t.mixed && LIMIT_OPS.has(t.op) && t.values.length === 1 && isNumeric(t.values[0]);

/** "starts with Z9", "ends with -X", "contains DUMMY". */
function patternVerb(value: string): string {
  const v = value.replace(/^\*|\*$/g, '');
  if (value.startsWith('*') && value.endsWith('*')) return `contains ${v}`;
  if (value.endsWith('*')) return `starts with ${v}`;
  if (value.startsWith('*')) return `ends with ${v}`;
  return `matches ${value}`;
}

/** What the program does with a case where the rule holds, said for a business reader; null when nothing it does is worth saying. */
function outcomeWords(q: QuestionInput): string {
  // What a business reader cannot use is left out: a further test, a read, a list line, a figure worked out.
  const shown = q.holds
    .filter((e) => !/^leaves the decision|^reads data from the database|^prints a line|^works out/.test(e))
    // A flag set to 'X' is a mark on the case, not a value: "marks the case as “hold”", never "sets the hold to X".
    .map((e) => e.replace(/^sets the (.+) to X$/, 'marks the case as “$1”'))
    .slice(0, 2);
  const holdsEnd = endingOf(q.holds);
  const otherwiseEnd = endingOf(q.otherwise);
  // "goes on to “A” and “B”", not "goes on to “A” and goes on to “B”".
  if (shown.length === 2 && shown.every((e) => e.startsWith('goes on to '))) return `the program goes on to ${shown[0].slice(11)} and ${shown[1].slice(11)}`;
  if (shown.length) return `the program ${joinWords(shown)}`;
  if (holdsEnd === 'stop') return 'the program stops here';
  if (holdsEnd === 'skip') return 'the program skips the entry';
  if (otherwiseEnd === 'stop') return 'the program goes on; otherwise it stops here';
  if (otherwiseEnd === 'skip') return 'the program takes the entry further; otherwise it skips it';
  return 'the program handles the case in its own way';
}

/** "is above 500,000", "is ZOR, ZEXP or RE", "is not EUR", "starts with Z9". */
function conditionWords(t: FirstTest): string {
  const either = (list: readonly string[]) => joinWords(list.map(valueWords)).replace(/ and ([^,]+)$/, ' or $1');
  if (isLimit(t)) return `is ${OPERATOR_WORDS[t.op]} ${numberWords(t.values[0])}`;
  if (t.op === '<>') return `is not ${either(t.values)}`;
  if (t.op === 'CP') return t.values.map(patternVerb).join(' or ');
  if (t.op === 'NP') return `does not ${t.values.map((v) => patternVerb(v).replace(/^(\w+?)s /, '$1 ')).join(' or ')}`;
  return `is ${either(t.values)}`;
}

const CURRENCY_STEM = /^(?:waers|waerk|currency|curr|hwaer|rwcur)$/;

/**
 * A limit on an amount in one currency — `waers = 'EUR' AND wrbtr > c_approval`
 * — as one test: "the document amount is above 250.00 EUR". Null for any
 * other condition, also one with a third part.
 */
function amountInCurrency(rc: RuleContext, ctx: PlainContext): { limit: RuleParameter; currency: string; subject: string } | null {
  if (rc.tests.length !== 2) return null;
  const limit = rc.tests.find((p) => LIMIT_OPS.has(operatorOf(p)) && valuesOf(p).length === 1 && isNumeric(valuesOf(p)[0]));
  const currency = rc.tests.find((p) => p !== limit && operatorOf(p) === '=' && CURRENCY_STEM.test(fieldStem(p.subject)) && valuesOf(p).length === 1);
  if (!limit || !currency || !/\sAND\s/i.test(conditionFor(rc.rule, limit))) return null;
  if (conditionFor(rc.rule, limit).split(/\s+(?:AND|OR)\s+/i).length !== 2) return null;
  return { limit, currency: valuesOf(currency)[0], subject: subjectWords(limit, ctx) };
}

function questionOf(group: QuestionInput[], ctx: PlainContext): RuleQuestion {
  const first = group[0];
  const ids = group.map((g) => g.explanation.id);
  const anchors = group.map((g) => g.rc.anchor);
  const weight = Math.max(...group.map((g) => g.explanation.impact.score));
  const base = { id: `Q-${ids[0]}`, ruleIds: ids, topic: first.explanation.topic, weight };
  const subject = first.t?.subject ?? first.rc.subject;
  const tests = group.map((g) => g.t);
  if (group.length > 1 && tests.every(isLimit)) {
    const limits = [...new Set(tests.map((t) => `${OPERATOR_WORDS[t!.op]} ${numberWords(t!.values[0])}`))];
    return {
      ...base,
      shape: 'limits',
      statement: { text: `The program works with ${limits.length === 1 ? 'one limit' : `${limits.length} limits`} on the ${subject}: ${joinWords(limits)}.`, anchors },
      ask: 'Are these limits still right?',
    };
  }
  if (group.length > 1 && tests.every((t) => t && !t.mixed && (t.op === '=' || t.op === 'IN') && t.values.length > 0)) {
    const values = [...new Set(tests.flatMap((t) => t!.values))];
    return {
      ...base,
      shape: 'values',
      statement: { text: `The program handles the ${subject} ${joinWords(values.map(valueWords))} each in its own way.`, anchors },
      ask: 'Are these still the right values?',
    };
  }
  // One rule — or several on one subject that do not read as one list: the weightiest speaks for them.
  const more = group.length > 1 ? ` The same subject is tested at ${group.length - 1} more ${group.length === 2 ? 'place' : 'places'}.` : '';
  const money = amountInCurrency(first.rc, ctx);
  if (money) {
    const v = valuesOf(money.limit)[0];
    return {
      ...base,
      topic: 'amounts',
      shape: 'limit',
      statement: { text: `When the ${money.subject} is ${OPERATOR_WORDS[operatorOf(money.limit)]} ${numberWords(v)} ${money.currency}, ${outcomeWords(first)}.${more}`, anchors },
      ask: 'Is the limit still right?',
    };
  }
  const t = first.t;
  const caveat = t && isLimit(t) && t.p.caveat ? ' The code does not say in which currency or unit.' : '';
  const when = t && !t.mixed
    ? `When the ${subject} ${conditionWords(t)}`
    : `When ${phraseOf(t ? conditionFor(first.rc.rule, t.p) : first.rc.rule.label, ctx, first.rc.anchor.lineStart)}`;
  return {
    ...base,
    shape: isLimit(t) ? 'limit' : 'values',
    statement: { text: `${when}, ${outcomeWords(first)}.${caveat}${more}`, anchors },
    ask: isLimit(t) ? 'Is the limit still right?' : 'Is that still right?',
  };
}

/** The business rules as questions: one per subject (topic and the field first tested), weightiest first. */
function questionsOf(inputs: readonly QuestionInput[], ctx: PlainContext): RuleQuestion[] {
  const numberOf = (id: string) => Number(id.replace(/\D/g, '')) || 0;
  const groups = new Map<string, QuestionInput[]>();
  for (const q of inputs) {
    // An amount in one currency is asked about the amount: the currency only says what it is counted in.
    const money = amountInCurrency(q.rc, ctx);
    const stem = fieldStem(money ? money.limit.subject : q.t?.p.subject ?? q.rc.first?.subject);
    const key = `${money ? 'amounts' : q.explanation.topic}|${stem || q.explanation.id}`;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return [...groups.values()]
    .map((g) => questionOf([...g].sort((a, b) => b.explanation.impact.score - a.explanation.impact.score || numberOf(a.explanation.id) - numberOf(b.explanation.id)), ctx))
    .sort((a, b) => b.weight - a.weight || RULE_TOPICS.indexOf(a.topic) - RULE_TOPICS.indexOf(b.topic) || numberOf(a.ruleIds[0]) - numberOf(b.ruleIds[0]));
}

/**
 * The explanation of every rule of a set. `facts` are the statements, the
 * nesting and the branches the rule set was derived from (`buildProcessFacts`).
 */
export function explainBusinessRules(
  source: string,
  set: BusinessRuleSet,
  facts: ExplainFacts,
  /** The engine the explanation is read for (`ENGINE_READS_3020_FROM`). */
  engineVersion: string | null = APP_VERSION,
): RuleSetExplanation {
  const reads3020 = engineReads3020Apply(engineVersion);
  const ctx = plainContext(source);
  const hasInclude = facts.statements.some((s) => s.keyword.toUpperCase() === 'INCLUDE' && !/^INCLUDE\s+(?:TYPE|STRUCTURE)\b/i.test(s.text));
  // The values the code tests one field against, across rules — for "handled by another rule".
  const siblings = new Map<string, string[]>();
  for (const rule of set.rules) {
    for (const p of testsOf(rule)) {
      const stem = fieldStem(p.subject);
      if (!stem) continue;
      const list = siblings.get(stem) ?? [];
      for (const v of valuesOf(p)) if (!list.includes(v)) list.push(v);
      siblings.set(stem, list);
    }
  }
  const demoIds = new Set((set.demoCases?.rules ?? []).map((d) => d.id));
  const demoRoutines = new Set((set.demoCases ? readDemoSwitches(source, engineVersion)?.routines ?? [] : []).map((r) => r.toUpperCase()));
  const types = declaredTypes(facts.statements);
  const basketFacts: BasketFacts = { written: writtenValues(facts.statements, demoRoutines, types), types, ctx, hasInclude };
  const asked: QuestionInput[] = [];
  const rules: RuleExplanation[] = set.rules.map((rule) => {
    const rc = contextOf(rule, facts, ctx, reads3020);
    const technical = technicalOf(rc, demoIds.has(rule.id));
    const sides = sidesOf(rc, facts, ctx);
    const { where, parents } = whereOf(rc, facts, ctx);
    const businessTopic = topicFromStems(rc.stems, rule);
    const basket = basketOf({ ...rc, holdsStop: (sides?.holdsEffects ?? []).some((x) => STOPS.test(x)) }, technical, businessTopic, basketFacts);
    // The topic stays what it was — the reading order, and the sentences' places in it, do not move;
    // `basketTopics` groups by basket for the register and the flow.
    const topic: RuleTopic = technical ? 'technical' : businessTopic;
    const explanation: RuleExplanation = {
      id: rule.id,
      headline: headlineOf(rc, technical !== null, ctx, (sides?.holdsEffects ?? []).some((x) => STOPS.test(x))),
      topic,
      technical,
      impact: impactOf(rc, technical !== null, sides),
      protects: protectsOf(rc, sides?.holdsEffects ?? [], sides?.otherwiseEffects ?? [], ctx),
      example: exampleOf(rc, siblings, ctx),
      sides: sides ? { holds: sides.holds, otherwise: sides.otherwise } : null,
      where,
      parents,
      proposal: proposalOf(rc, technical !== null, hasInclude),
      basket,
    };
    if (basket.kind === 'business') {
      asked.push({ rc, t: firstTestOf(rc, ctx), holds: sides?.holdsEffects ?? [], otherwise: sides?.otherwiseEffects ?? [], explanation });
    }
    return explanation;
  });

  const byId = new Map(rules.map((r) => [r.id, r]));
  const numberOf = (id: string) => Number(id.replace(/\D/g, '')) || 0;
  const topics = RULE_TOPICS
    .map((topic) => {
      const ids = rules
        .filter((r) => r.topic === topic)
        .sort((a, b) => b.impact.score - a.impact.score || numberOf(a.id) - numberOf(b.id))
        .map((r) => r.id);
      const impact = ids.reduce((max, id) => Math.max(max, byId.get(id)?.impact.score ?? 0), 0);
      return { topic, label: RULE_TOPIC_LABELS[topic], lead: RULE_TOPIC_LEADS[topic], ruleIds: ids, impact };
    })
    .filter((t) => t.ruleIds.length > 0);
  // Business topics by their weightiest rule; technical settings always last.
  const ordered = [
    ...topics.filter((t) => t.topic !== 'technical').sort((a, b) => b.impact - a.impact || RULE_TOPICS.indexOf(a.topic) - RULE_TOPICS.indexOf(b.topic)),
    ...topics.filter((t) => t.topic === 'technical'),
  ];
  const order = ordered.flatMap((t) => t.ruleIds);
  const baskets: Record<RuleBasket, string[]> = { business: [], technical: [], undetermined: [] };
  for (const id of order) baskets[byId.get(id)!.basket.kind].push(id);
  return { rules, order, topics: ordered, baskets, questions: questionsOf(asked, ctx) };
}

/**
 * The topics grouped by basket (owner decision 21.10.2026) — what the rule
 * register and its flow show: the business rules by their topics, in reading
 * order; then every technical rule under *Technical rules — stay as coded*;
 * then every undetermined rule under *Not determined*. Each rule once, in the
 * reading order within its group.
 */
export function basketTopics(explanation: Pick<RuleSetExplanation, 'rules' | 'topics' | 'order'>): RuleSetExplanation['topics'] {
  const byId = new Map(explanation.rules.map((r) => [r.id, r]));
  const basketOfId = (id: string) => byId.get(id)?.basket.kind ?? 'business';
  const business = explanation.topics
    .filter((t) => t.topic !== 'technical')
    .map((t) => ({ ...t, ruleIds: t.ruleIds.filter((id) => basketOfId(id) === 'business') }))
    .filter((t) => t.ruleIds.length > 0);
  const apart = (topic: 'technical' | 'undetermined') => {
    const ids = explanation.order.filter((id) => basketOfId(id) === topic);
    const impact = ids.reduce((max, id) => Math.max(max, byId.get(id)?.impact.score ?? 0), 0);
    return ids.length ? [{ topic, label: RULE_TOPIC_LABELS[topic], lead: RULE_TOPIC_LEADS[topic], ruleIds: ids, impact }] : [];
  };
  return [...business, ...apart('technical'), ...apart('undetermined')];
}

/** Every sentence of an explanation, for a reader (or a check) that walks them all. */
export function explanationSentences(e: RuleExplanation): ExplainedSentence[] {
  return [
    e.protects,
    ...(e.example ? [e.example] : []),
    ...(e.sides ? [e.sides.holds, e.sides.otherwise] : []),
    e.where,
    e.proposal.reason,
    ...(e.technical ? [e.technical] : []),
    e.basket.reason,
  ];
}
