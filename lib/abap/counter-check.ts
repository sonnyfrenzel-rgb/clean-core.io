import { deriveBusinessRules, type BusinessRule, type BusinessRuleSet, type RuleAnchor, type RuleParameter, type SentencePart, type TypeBasisKind } from './business-rule-set';
import { capabilityKeyOf } from './standard-coverage';
import type { SubjectKind } from './business-rules';
import type { StandardEvidence } from '../evidence-level';
import type { TestRunReceipt, TestRunVerdict } from '../test-receipt';

/**
 * Counter-check scenarios — roadmap 7.3, mockup screen `s3`.
 *
 * The roadmap row, verbatim: *Gegenprobe-Szenarien aus dem bestätigten Bedarf,
 * als Given/When/Then mit Testdatenbedarf, damit Fachbereiche sie ohne ABAP
 * prüfen; Testing speichert Verdikte als Receipt mit Umfang, Umgebung und
 * Stubs.* Four things are load-bearing in that sentence and each one is a way
 * this product could be caught lying.
 *
 * ## 1. A scenario is a question, not an answer
 *
 * Given/When/Then says what *would* be checked. Nothing here has run, nothing
 * here is a verdict, and no field of `CounterCheckScenario` carries an outcome.
 * Until an execution exists and a receipt attests to it, the capability is
 * `notDetermined` in the sense of roadmap 7.2 — the acceptance line the 2.7
 * catalogue writes as UX-E08-F01-US02: *ein bestätigter Szenarioentwurf wird
 * nicht als tatsächlich durchgeführter Test angezeigt*.
 *
 * ## 2. From the confirmed need, not from the generated code
 *
 * The scenarios are derived from `deriveBusinessRules` (roadmap 3.4) — the
 * `BR-nnn` decisions read out of the **original ABAP**. They are deliberately
 * not read out of the transformed code: UX-E08-F01-US01 names a test derived
 * only from the same generated code as *kein unabhängiger fachlicher
 * Erfüllungsbeleg*, and it is right. A scenario that comes from the output
 * cannot catch the output.
 *
 * ## 3. The counter-check is the second scenario, not a nicety
 *
 * Every decision yields **two** scenarios: one in which the test holds and one
 * in which it does not. A suite that only ever exercises the case the rule was
 * written for is passed by an implementation that always fires. The
 * `does-not-apply` arm is the *Gegenprobe* the roadmap names, and it is why the
 * data needs are stated with their operator inverted rather than omitted.
 *
 * ## 4. The test data need is what makes it a task
 *
 * *Given a requisition whose currency is not EUR* is a wish until somebody
 * produces such a record. So every scenario carries `data`: the field as the
 * code writes it, the operator, the literal, the line it stands on, and what
 * the code does **not** say about the value (a currency, a unit). A business
 * department can read that list, prepare the records and check the outcome
 * without opening the ABAP — which is the whole of *damit Fachbereiche sie ohne
 * ABAP prüfen*.
 *
 * The names stay code. `GS_EBAN-WAERS` is not translated into "the currency of
 * the requisition", because nothing in the source says that is what it means;
 * the plain-language name is roadmap 7.8's job and arrives with the *Model
 * proposal* provenance on it. What a reader gets here without ABAP is the
 * **structure**: what to prepare, when it runs, what must then happen.
 *
 * ## What it refuses to say
 *
 * `scenarioDemonstrations` is the only bridge from an execution to the evidence
 * ladder of `lib/evidence-level.ts`, and it is deliberately narrow:
 *
 *   - It takes a receipt that **already covers the project**
 *     (`coveringTestRunReceipt`). A receipt for a different code digest is not
 *     handed in as `null` by accident — it is what W22-A16 is about, and the
 *     covering check lives in one place so this module cannot weaken it.
 *   - Only `Passed` produces evidence. `Skipped`, `Todo`, `Failed`, `Error` and
 *     a case the runner never mentioned each produce a *refusal* with its own
 *     reason, because W22-A15 and the 2.7 contract both say the same thing:
 *     *fehlend, geplant, simuliert, nur Connectivity, übersprungen,
 *     fehlgeschlagen und bestanden bleiben verschieden*.
 *   - The evidence it produces is `kind: 'demonstration'`, whose ceiling is E3,
 *     which `fitOfLevel` renders as `mock-only` with the `demonstrated-mock`
 *     provenance. **No level here is ever green**, and nothing in this file
 *     writes the word "passed" about a capability. A sandbox run is an
 *     execution in a sandbox; W22-A15 asks that no view present it as a
 *     successful business execution, and the way to keep that is to say what it
 *     was — which is why `environment` and the stubbed packages travel into the
 *     evidence sentence itself (UX-E08-F02-US02: *Umgebung und ersetzte
 *     Abhängigkeiten sind am Ergebnis sichtbar*).
 *   - Which test case executes which scenario is **declared, never derived**.
 *     The suite is model-generated and its ids mean nothing to this module;
 *     guessing a link would fabricate exactly the evidence the step exists to
 *     earn. An unlinked scenario is refused with `not-linked`.
 *
 * Nothing here writes anywhere and nothing calls a model. The same source gives
 * the same scenarios with the same numbers.
 */

/* ------------------------------------------------------------------ types */

/** Which side of the decision a scenario prepares. Both are always derived. */
export type ScenarioArm =
  /** The record makes the rule's test hold. */
  | 'applies'
  /** The counter-check: the record makes it fail. */
  | 'does-not-apply';

/** How the data needs of a scenario combine. */
export type NeedCombination =
  /** One need, and it decides. */
  | 'single'
  /** Every need has to hold at once. */
  | 'all'
  /** At least one need has to hold. */
  | 'any'
  /**
   * The condition mixes connectives (or negates), so no combination is stated:
   * the record has to make the condition **as written** come out the required
   * way. Stating a rule for a mixed condition would be a guess about precedence.
   */
  | 'as-written';

/** Why a scenario cannot be run as written. Set exactly when it is not runnable. */
export type ScenarioBlockedReason =
  /** The code compares the value with an expression, so no field can be named. */
  'subject-not-named';

/** Why a rule yields no scenario at all. */
export type NoScenarioReason =
  /** A constant no condition in this source reads: there is no decision to observe. */
  'declaration-only';

/** A clause of the scenario. Anchored like every sentence of roadmap 3.4. */
export interface ScenarioClause {
  kind: 'given' | 'when' | 'then';
  /** The clause as plain text — the parts joined. */
  text: string;
  parts: SentencePart[];
  /** Never empty: a clause without a line to check is not written. */
  anchors: RuleAnchor[];
}

/**
 * One record somebody has to produce before the scenario can be run.
 *
 * This is the *Testdatenbedarf*. It never says what the field means, and it
 * never invents a value: it states the constraint the code puts on it, at the
 * line the code puts it.
 */
export interface TestDataNeed {
  /** The field or variable as the source writes it. `null` when the code names none. */
  field: string | null;
  subjectKind: SubjectKind;
  /** The operator as the source spells it: `>`, `GT`, `<>`, `CP`, `IN`. */
  operator: string;
  /** The value as the source writes it, quotes included. */
  literal: string;
  /** What the value has to be, in words — inverted on the counter arm. */
  requirement: string;
  /**
   * Every line this same requirement is tested on, `L69`, in source order.
   * A rule copied into fourteen routines tests one value in fourteen places; it
   * is still one record to prepare, and listing it fourteen times would turn a
   * two-line data need into a twenty-eight-line one that says nothing more.
   */
  anchors: string[];
  /** What the code does not state about this value. `null` when it states everything. */
  caveat: string | null;
}

export interface CounterCheckScenario {
  /** `CCS-001`, in order of the rule it checks. Stable per source. */
  id: string;
  /** The `BR-nnn` this scenario checks. */
  ruleId: string;
  /**
   * The capability key of roadmap 7.2 — the normalised subject a verdict is
   * filed under. `null` when the rule has no readable subject, which is the
   * same set `deriveStandardCoverage` lists under `unassigned`.
   */
  capabilityKey: string | null;
  arm: ScenarioArm;
  /** The decision as the source writes it, with the arm behind it. Code, not a business name. */
  title: string;
  given: ScenarioClause;
  when: ScenarioClause;
  then: ScenarioClause;
  data: TestDataNeed[];
  combination: NeedCombination;
  /**
   * What the reader must know before preparing data — an unreached routine, a
   * condition the engine could only read part of, a value whose currency the
   * code does not state. Never a verdict.
   */
  notes: string[];
  /** Set exactly when the scenario cannot be run as written. */
  blocked: { reason: ScenarioBlockedReason; detail: string } | null;
}

export interface CounterCheckScenarios {
  program: string | null;
  scenarios: CounterCheckScenario[];
  /**
   * The rules no scenario could be written for, with the reason — the shape
   * `StandardCoverage.unassigned` has, for the same reason it has it. A decision
   * that produces no scenario is still a decision somebody made, and dropping it
   * silently would leave a reader counting scenarios and believing they had
   * counted rules.
   */
  withoutScenario: Array<{ ruleId: string; reason: NoScenarioReason; detail: string }>;
  counts: {
    rules: number;
    scenarios: number;
    runnable: number;
    blocked: Record<ScenarioBlockedReason, number>;
    withoutScenario: number;
    dataNeeds: number;
    withCapability: number;
  };
  /** True when there is no source to read — a different thing from zero scenarios. */
  noSource: boolean;
}

/* --------------------------------------------------------- entry points */

/** Counter-check scenarios for one ABAP source. No model, no network. */
export function deriveCounterCheckScenarios(source: string): CounterCheckScenarios {
  if (typeof source !== 'string' || !source.trim()) {
    return {
      program: null,
      scenarios: [],
      withoutScenario: [],
      counts: {
        rules: 0,
        scenarios: 0,
        runnable: 0,
        blocked: { 'subject-not-named': 0 },
        withoutScenario: 0,
        dataNeeds: 0,
        withCapability: 0,
      },
      noSource: true,
    };
  }
  return deriveCounterCheckScenariosFrom(deriveBusinessRules(source));
}

/** The same scenarios for a caller that already derived the rules. */
export function deriveCounterCheckScenariosFrom(ruleSet: BusinessRuleSet): CounterCheckScenarios {
  const scenarios: CounterCheckScenario[] = [];
  const withoutScenario: CounterCheckScenarios['withoutScenario'] = [];

  for (const rule of ruleSet.rules) {
    if (rule.parameters.every((p) => p.origin === 'constant')) {
      withoutScenario.push({
        ruleId: rule.id,
        reason: 'declaration-only',
        detail:
          rule.withoutProcessElement?.detail ??
          `${rule.label} is declared and no condition in this source reads it.`,
      });
      continue;
    }
    for (const arm of ARMS) scenarios.push(buildScenario(rule, arm, scenarios.length + 1));
  }

  const blocked: Record<ScenarioBlockedReason, number> = { 'subject-not-named': 0 };
  for (const scenario of scenarios) {
    if (scenario.blocked) blocked[scenario.blocked.reason] += 1;
  }

  return {
    program: ruleSet.program,
    scenarios,
    withoutScenario,
    counts: {
      rules: ruleSet.rules.length,
      scenarios: scenarios.length,
      runnable: scenarios.filter((s) => s.blocked === null).length,
      blocked,
      withoutScenario: withoutScenario.length,
      dataNeeds: scenarios.reduce((sum, s) => sum + s.data.length, 0),
      withCapability: scenarios.filter((s) => s.capabilityKey !== null).length,
    },
    noSource: false,
  };
}

/* -------------------------------------------------------------- the words */

const ARMS: readonly ScenarioArm[] = Object.freeze(['applies', 'does-not-apply']);

const text = (value: string): SentencePart => ({ kind: 'text', value });
const code = (value: string): SentencePart => ({ kind: 'code', value });

/**
 * The sentence that turns a scenario into a task rather than a wish.
 *
 * One spelling, used wherever the data needs are shown, for the same reason
 * `SCOPE_ITEM_NOTE` has one: a list of fields without it reads as a description
 * of the code, and the reader never learns that somebody has to go and make
 * those records exist.
 */
export const TEST_DATA_NOTE = 'Test data somebody has to provide before this scenario can be run.';

/**
 * What the value has to be, per operator, positive and inverted.
 *
 * The inverted column is the counter-check, and it is written out rather than
 * prefixed with "not": *at most 5* is a usable instruction and *not greater
 * than 5* is a riddle one boundary away from being read as *less than 5*.
 */
const OPERATOR_WORDS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  '=': ['equal to', 'different from'],
  EQ: ['equal to', 'different from'],
  '<>': ['different from', 'equal to'],
  '><': ['different from', 'equal to'],
  NE: ['different from', 'equal to'],
  '>': ['greater than', 'at most'],
  GT: ['greater than', 'at most'],
  '<': ['less than', 'at least'],
  LT: ['less than', 'at least'],
  '>=': ['at least', 'less than'],
  GE: ['at least', 'less than'],
  '<=': ['at most', 'greater than'],
  LE: ['at most', 'greater than'],
  CP: ['matching the pattern', 'not matching the pattern'],
  NP: ['not matching the pattern', 'matching the pattern'],
  CS: ['containing', 'not containing'],
  NS: ['not containing', 'containing'],
  CA: ['containing any character of', 'containing no character of'],
  NA: ['containing no character of', 'containing any character of'],
  CO: ['made up only of the characters of', 'using a character outside'],
  CN: ['using a character outside', 'made up only of the characters of'],
  IN: ['one of', 'none of'],
  BETWEEN: ['within the range', 'outside the range'],
});

/**
 * The words for an operator this table does not know.
 *
 * It names the comparison verbatim instead of paraphrasing it. An unknown
 * operator paraphrased is an invented instruction, and the whole point of the
 * data need is that somebody acts on it.
 */
function requirementWords(operator: string, arm: ScenarioArm): string {
  const known = OPERATOR_WORDS[operator.toUpperCase()];
  if (known) return arm === 'applies' ? known[0] : known[1];
  return arm === 'applies' ? `satisfying ${operator}` : `not satisfying ${operator}`;
}

/* --------------------------------------------------------- the derivation */

/**
 * Everything outside a literal, upper-cased — the text connectives and
 * comparisons are read from.
 *
 * Field symbols go too. `<fs_order>-risk_score GE c_critical_score` is one
 * comparison, and the angle brackets of the symbol are not two more: counting
 * them made every field-symbol condition report that the engine had only read
 * part of it, on a source where it had read all of it.
 */
function outsideLiterals(conditionText: string): string {
  return conditionText
    .split(/('(?:[^']|'')*'|`(?:[^`]|``)*`|\|[^|]*\|)/)
    .filter((_, i) => i % 2 === 0)
    .join(' ')
    .replace(/<[A-Za-z_]\w*>/g, ' ')
    .toUpperCase();
}

/** Every comparison the condition makes, counted outside its literals. */
const COMPARISONS = /<>|><|>=|<=|=|>|<|\b(?:EQ|NE|GT|LT|GE|LE|CP|NP|CO|CN|CA|NA|CS|NS|IN|BETWEEN|IS)\b/g;

/**
 * How the needs of this rule combine on this arm.
 *
 * `AND` on the positive arm means every need holds, and on the counter arm one
 * broken need is enough — the inversion is the whole of De Morgan and it is the
 * difference between a counter-check somebody can prepare and one they cannot.
 * A condition that mixes `AND` with `OR`, or negates, gets `as-written`: the
 * precedence is the code's business and guessing at it would hand somebody an
 * instruction that does not produce the case they were promised.
 */
function combinationOf(rule: BusinessRule, arm: ScenarioArm, needs: number): NeedCombination {
  if (needs <= 1) return 'single';
  const conditions = rule.parameters.filter((p) => p.origin !== 'constant');
  // Alternatives: any one of them produces the case, and the counter-check has
  // to avoid every one of them.
  const alternatives = (): NeedCombination => (arm === 'applies' ? 'any' : 'all');

  const origins = new Set(conditions.map((p) => p.origin));
  // A `CASE` arm lists values of one selector.
  if (origins.size === 1 && origins.has('when')) return alternatives();

  const joined = conditions.map((p) => outsideLiterals(p.conditionText)).join(' ');
  const hasAnd = /\bAND\b/.test(joined);
  const hasOr = /\bOR\b/.test(joined);
  const hasNot = /\bNOT\b/.test(joined);
  if (hasNot || (hasAnd && hasOr)) return 'as-written';
  if (!hasAnd && !hasOr) {
    // No connective at all, so the values stand in different conditions — the
    // arms of one `IF … ELSEIF` grading one field, which 3.4 joins as one value
    // list. A record holds one value, so "all of these" would be a request for
    // a record that cannot exist.
    const fields = new Set(conditions.map((p) => p.subject));
    return fields.size === 1 && !fields.has(null) ? alternatives() : 'as-written';
  }
  if (hasAnd) return arm === 'applies' ? 'all' : 'any';
  return alternatives();
}

/**
 * True when the condition compares more than the engine could read out of it.
 *
 * `gv_emergency = abap_true AND gv_amount <= '50000.00'` is two comparisons and
 * one readable value: `abap_true` is not a literal, so 2.8 never made a
 * candidate of it. Handing the reader the one value and calling the list
 * complete would promise a record that does not produce the case. Counting
 * errs upwards on purpose — a comparison miscounted as present says "the engine
 * read only part of this", which is the safe half of being wrong.
 */
function conditionPartlyRead(rule: BusinessRule): boolean {
  // Per condition, not over the rule: a condition copied into fourteen routines
  // has fourteen sets of parameters, and summing them would hide an unread
  // operand behind the copies.
  const byCondition = new Map<string, Set<string>>();
  for (const parameter of rule.parameters) {
    if (parameter.origin === 'constant') continue;
    const values = byCondition.get(parameter.conditionText) ?? new Set<string>();
    values.add(`${parameter.subject ?? ''}|${parameter.operator}|${parameter.literal}`);
    byCondition.set(parameter.conditionText, values);
  }
  for (const [condition, values] of byCondition) {
    if ((outsideLiterals(condition).match(COMPARISONS) ?? []).length > values.size) return true;
  }
  return false;
}

/**
 * The data needs of one arm, one entry per distinct requirement.
 *
 * Distinct on field, operator and value — the three things somebody preparing a
 * record acts on. Every place the requirement is tested travels with it as an
 * anchor, so nothing about where it stands is lost.
 */
function needsOf(parameters: readonly RuleParameter[], arm: ScenarioArm): TestDataNeed[] {
  const out: TestDataNeed[] = [];
  const at = new Map<string, TestDataNeed>();
  for (const parameter of parameters) {
    const key = `${parameter.subject ?? ''}|${parameter.operator}|${parameter.literal}`;
    const anchor = `L${parameter.lineStart}`;
    const known = at.get(key);
    if (known) {
      if (!known.anchors.includes(anchor)) known.anchors.push(anchor);
      if (known.caveat === null && parameter.caveat) known.caveat = parameter.caveat;
      continue;
    }
    const need: TestDataNeed = {
      field: parameter.subject,
      subjectKind: parameter.subjectKind,
      operator: parameter.operator,
      literal: parameter.literal,
      requirement: `${requirementWords(parameter.operator, arm)} ${parameter.literal}`,
      anchors: [anchor],
      caveat: parameter.caveat ?? null,
    };
    at.set(key, need);
    out.push(need);
  }
  return out;
}

/** `GS_EBAN-WAERS is different from 'EUR'` — the one spelling a need is written in. */
function needParts(need: TestDataNeed): SentencePart[] {
  const subject: SentencePart[] = need.field
    ? [code(need.field)]
    : [text(`the expression compared on ${need.anchors.join(', ')}`)];
  return [...subject, text(' is '), text(need.requirement)];
}

function joinNeeds(needs: readonly TestDataNeed[], combination: NeedCombination, conditionText: string): SentencePart[] {
  if (combination === 'as-written') {
    return [
      text('whose values make '),
      code(conditionText),
      text(' come out the way this scenario requires'),
    ];
  }
  const lead: SentencePart[] =
    combination === 'single'
      ? [text('in which ')]
      : combination === 'all'
        ? [text('in which all of these hold: ')]
        : [text('in which at least one of these holds: ')];
  const out: SentencePart[] = [...lead];
  needs.forEach((need, i) => {
    if (i > 0) out.push(text(', '));
    out.push(...needParts(need));
  });
  return out;
}

/**
 * Where the scenario is triggered.
 *
 * The routine leads, because it is the rule's own — `sources` comes off the
 * places the condition stands in. The drawn element follows in a sentence of its
 * own rather than standing in for the routine: the skeleton draws one gateway
 * per `IF … ELSEIF` chain and labels it with the chain's first condition, so a
 * rule that lives in a later arm would otherwise be introduced under a condition
 * that is not its own. *It stands in* is true for every arm; *it is* was not.
 */
function whenClause(rule: BusinessRule): ScenarioClause {
  const element = rule.processElements.find((e) => e.relation === 'condition') ?? rule.processElements[0] ?? null;
  const routines = rule.sources.map((s) => s.routine).filter((r): r is string => r !== null);
  const named = [...new Set(routines)];
  const anchors = rule.sentences.flatMap((s) => s.anchors);

  const where: SentencePart[] =
    named.length === 0
      ? [text('the program runs')]
      : named.length === 1
        ? [code(named[0]), text(' runs')]
        : [
            text('any of '),
            ...named.flatMap((r, i) => (i > 0 ? [text(', '), code(r)] : [code(r)])),
            text(' runs'),
          ];

  const onMap: SentencePart[] = element
    ? [
        text(' On the process map it stands in '),
        code(element.label),
        text(' in '),
        code(element.region),
        text('.'),
      ]
    : [];

  return clause('when', [text('When '), ...where, text('.'), ...onMap], anchors);
}

/** What the code does once the record reaches the decision — read off the type basis. */
const OUTCOME: Readonly<Record<TypeBasisKind, readonly [string, string]>> = Object.freeze({
  'flow-continues': ['the code of this branch runs', 'the code of this branch does not run'],
  'ends-flow': [
    'the code ends the flow at the anchored statement — it leaves the routine, stops, raises or sends an error message',
    'the flow goes on past this point',
  ],
  'else-ends-flow': [
    'the flow goes on past this point',
    'the code ends the flow at the anchored statement — it leaves the routine, stops, raises or sends an error message',
  ],
  'check-leaves': ['processing goes on', 'processing leaves this block at the anchored statement'],
  'skips-iteration': ['the loop pass goes on', 'the rest of this loop pass is skipped'],
  'loop-condition': ['the body of the loop runs again', 'the loop ends'],
  // Unreachable from here: a rule whose only place is a declaration produces no
  // scenario at all and is listed under `withoutScenario`. Present so the table
  // stays total over `TypeBasisKind` — a missing key would be an `undefined`
  // outcome silently rendered as an empty Then.
  'declaration-only': [
    'no condition in this source reads the constant, so nothing observes the record',
    'no condition in this source reads the constant, so nothing observes the record',
  ],
});

function thenClause(rule: BusinessRule, arm: ScenarioArm): ScenarioClause {
  const parts: SentencePart[] = [text('Then ')];
  const anchors: RuleAnchor[] = [];
  rule.typeBasis.forEach((basis, i) => {
    if (i > 0) parts.push(text('; '));
    parts.push(text(OUTCOME[basis.basis][arm === 'applies' ? 0 : 1]));
    anchors.push(...basis.anchors);
  });
  parts.push(text('.'));
  return clause('then', parts, anchors);
}

function clause(kind: ScenarioClause['kind'], parts: SentencePart[], anchors: RuleAnchor[]): ScenarioClause {
  const seen = new Set<string>();
  const unique = anchors.filter((a) => {
    const mark = `${a.lineStart}|${a.lineEnd}`;
    if (seen.has(mark)) return false;
    seen.add(mark);
    return true;
  });
  return { kind, text: parts.map((p) => p.value).join(''), parts, anchors: unique };
}

const ARM_TITLE: Readonly<Record<ScenarioArm, string>> = Object.freeze({
  applies: 'the test holds',
  'does-not-apply': 'the test does not hold — counter-check',
});

function buildScenario(rule: BusinessRule, arm: ScenarioArm, index: number): CounterCheckScenario {
  const id = `CCS-${String(index).padStart(3, '0')}`;
  // A constant's declaration is not a place the record is tested; the conditions
  // that read it are. A rule that has only a declaration produced no scenario at
  // all and never reaches here.
  const parameters = rule.parameters.filter((p) => p.origin !== 'constant');
  const data = needsOf(parameters, arm);
  const combination = combinationOf(rule, arm, data.length);

  const notes: string[] = [];
  if (rule.withoutProcessElement && rule.withoutProcessElement.reason !== 'declaration-only') {
    notes.push(
      `${rule.withoutProcessElement.detail} The scenario checks the routine, not a step of the drawn process.`,
    );
  }
  if (conditionPartlyRead(rule)) {
    notes.push(
      'The condition compares more than the engine could read out of it, so the values below are not the whole of it. Read the anchored line before preparing the record.',
    );
  }
  for (const caveat of [...new Set(data.map((n) => n.caveat).filter((c): c is string => c !== null))]) {
    notes.push(`Not stated in the code: ${caveat}.`);
  }

  const blocked = blockedOf(data);

  const given = clause(
    'given',
    [
      text('Given a record '),
      ...joinNeeds(data, combination, parameters[0]?.conditionText ?? rule.label),
      text('. '),
      text(TEST_DATA_NOTE),
    ],
    parameters.map((p) => anchorOf(rule, p)),
  );

  return {
    id,
    ruleId: rule.id,
    capabilityKey: capabilityKeyOf(rule),
    arm,
    title: `${rule.label} — ${ARM_TITLE[arm]}`,
    given,
    when: whenClause(rule),
    then: thenClause(rule, arm),
    data,
    combination,
    notes,
    blocked,
  };
}

/** The anchor of the line a parameter stands on, out of the rule's own sentences. */
function anchorOf(rule: BusinessRule, parameter: RuleParameter): RuleAnchor {
  const found = rule.sentences
    .flatMap((s) => s.anchors)
    .find((a) => a.lineStart === parameter.lineStart && a.lineEnd === parameter.lineEnd);
  return found ?? { lineStart: parameter.lineStart, lineEnd: parameter.lineEnd, quote: parameter.conditionText };
}

function blockedOf(data: readonly TestDataNeed[]): CounterCheckScenario['blocked'] {
  if (data.length > 0 && data.every((need) => need.field === null)) {
    return {
      reason: 'subject-not-named',
      detail:
        'The code compares the value with an expression rather than with a named field, so nobody can be told which record to prepare.',
    };
  }
  return null;
}

/* ============================================================ the bridge */

/**
 * Which stored test case executes which scenario — **declared, never derived**.
 *
 * The suite is generated by a model and its case ids carry no relationship to
 * `CCS-nnn`. Matching them on a name, a substring or an order would invent the
 * one fact the receipt exists to establish, so the link arrives the way a scope
 * item arrives in roadmap 7.2: supplied, with a source.
 */
export interface ScenarioCaseLink {
  scenarioId: string;
  /** A `project.testCases[].id`. */
  caseId: string;
  /** Who said the case executes the scenario. Never empty. */
  source: string;
}

/** Why an execution did not become evidence for a scenario. */
export type DemonstrationRefusal =
  /** No execution covers this project's code, suite and case list at all. */
  | 'no-receipt'
  /** Nobody has said which test case executes this scenario. */
  | 'not-linked'
  /** The run was asked for other cases; this one was outside its scope. */
  | 'out-of-scope'
  /** The runner reported nothing about the case. */
  | 'not-reported'
  /** The runner reported it, and the verdict is not a pass. */
  | 'not-passed'
  /** The scenario cannot be run as written, so no execution of it exists. */
  | 'blocked';

export interface RefusedDemonstration {
  scenarioId: string;
  capabilityKey: string | null;
  reason: DemonstrationRefusal;
  /** The verdict the runner reported, when there was one. */
  verdict: TestRunVerdict | null;
  detail: string;
}

export interface ScenarioDemonstrations {
  /** Keyed by `StandardCapability.key`, ready for `CoverageOptions.supplied`. */
  evidence: Record<string, StandardEvidence[]>;
  /** One entry per scenario that produced none, with the reason it produced none. */
  refused: RefusedDemonstration[];
}

const REFUSAL_DETAIL: Readonly<Record<DemonstrationRefusal, string>> = Object.freeze({
  'no-receipt':
    'No execution on record covers the code, the suite and the case list this project holds now. An execution of an earlier revision says nothing about this one.',
  'not-linked':
    'No test case is declared to execute this scenario, so no execution can be attributed to it.',
  'out-of-scope': 'The run was asked for other cases, so this one was never executed in it.',
  'not-reported':
    'The runner reported no result for this case. A case nothing was said about is not a case that ran.',
  'not-passed': 'The runner reported this case, and what it reported is not a pass.',
  blocked: 'The scenario cannot be run as written, so there is nothing an execution could attest to.',
});

/**
 * The `demonstration` evidence an execution earns — and every refusal beside it.
 *
 * `receipt` is the receipt that **covers this project**, as
 * `coveringTestRunReceipt` returns it, or `null`. That function is the single
 * place the binding to run, code digest, suite digest and case list is checked
 * (W22-A16); repeating the check here would be a second copy to drift from it,
 * and weakening it here would be invisible from there.
 *
 * The evidence sentence names the environment and every stubbed package,
 * because an execution against a universal mock of `@sap/xssec` is a different
 * fact from an execution against `@sap/xssec`, and the reader is the one who has
 * to decide whether the difference matters.
 */
export function scenarioDemonstrations(
  scenarios: readonly CounterCheckScenario[],
  links: readonly ScenarioCaseLink[],
  receipt: TestRunReceipt | null,
): ScenarioDemonstrations {
  const evidence: Record<string, StandardEvidence[]> = {};
  const refused: RefusedDemonstration[] = [];

  const linkOf = new Map(links.map((l) => [l.scenarioId, l]));
  const verdicts = new Map((receipt?.verdicts ?? []).map((v) => [v.id, v.status]));
  const scope = receipt?.scope?.selected ?? null;

  const refuse = (
    scenario: CounterCheckScenario,
    reason: DemonstrationRefusal,
    verdict: TestRunVerdict | null,
  ) => {
    refused.push({
      scenarioId: scenario.id,
      capabilityKey: scenario.capabilityKey,
      reason,
      verdict,
      detail: REFUSAL_DETAIL[reason],
    });
  };

  for (const scenario of scenarios) {
    if (scenario.blocked) {
      refuse(scenario, 'blocked', null);
      continue;
    }
    if (!receipt) {
      refuse(scenario, 'no-receipt', null);
      continue;
    }
    const link = linkOf.get(scenario.id);
    if (!link) {
      refuse(scenario, 'not-linked', null);
      continue;
    }
    if (scope !== null && !scope.includes(link.caseId)) {
      refuse(scenario, 'out-of-scope', null);
      continue;
    }
    const verdict = verdicts.get(link.caseId) ?? null;
    if (verdict === null) {
      refuse(scenario, 'not-reported', null);
      continue;
    }
    if (verdict !== 'Passed') {
      refuse(scenario, 'not-passed', verdict);
      continue;
    }
    if (scenario.capabilityKey === null) {
      // The rule has no readable subject, so `deriveStandardCoverage` files it
      // under `unassigned` and there is no capability for the evidence to stand
      // on. Recorded as a refusal rather than dropped.
      refuse(scenario, 'blocked', verdict);
      continue;
    }
    const list = evidence[scenario.capabilityKey] ?? [];
    list.push({
      kind: 'demonstration',
      reference: `${scenario.id} — ${scenario.title}`,
      source: executionSource(receipt, link),
      anchor: scenario.then.anchors[0] ? `L${scenario.then.anchors[0].lineStart}` : undefined,
    });
    evidence[scenario.capabilityKey] = list;
  }

  return { evidence, refused };
}

/**
 * Where the evidence came from, in one sentence a reader can act on.
 *
 * Environment first, stubs second, and the stub half is never omitted: "with no
 * package stubbed" and a missing sentence look the same on screen, and only one
 * of them is a statement.
 */
function executionSource(receipt: TestRunReceipt, link: ScenarioCaseLink): string {
  const stubs =
    receipt.stubs.length > 0
      ? `with stubs for ${receipt.stubs.join(', ')}`
      : 'with no package stubbed';
  return `Counter-check run in the ${receipt.environment} sandbox on ${receipt.executedAt}, case ${link.caseId}, ${stubs} (link declared by ${link.source})`;
}
