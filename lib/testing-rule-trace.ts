/**
 * Rule-traced test cases — every material business rule of the ORIGINAL ABAP
 * gets at least one case whose expected result is stated from the original,
 * and every case says which rule it checks, on which lines.
 *
 * Owner, 11.10.2026, after the external review of FI_Collection_Worklist
 * (F-01, F-02, F-05): the generated service gave a credit memo a hard-coded
 * foreign reference document and let totals and CSV ignore the customer
 * filter the list used — and all ten generated tests passed. They tested the
 * generated code against itself ("the sum of the buckets is the total"), not
 * against what the original does. A case that would have caught F-01 says:
 * "BR-009, L551-553: a credit whose reference is not a customer item of the
 * same customer keeps its own posted terms; without a baseline date the due
 * date stays unknown → bucket UNKNOWN, action DUE_DATE_REVIEW" — and that
 * sentence is written from the ABAP, before anybody reads the target code.
 *
 * Pure and import-light (types and the origin check only), so the generation
 * hook, the Testing view and a spec run the same reading.
 *
 * Three things are kept apart:
 *
 *   - the **trace** is the model's statement (`ruleTrace`): rule id, lines, a
 *     quote, what the original does and the result it gives for this case's
 *     data. Validated, never repaired into something the model did not write;
 *   - the **check** of the lines and the rule id against the signed source is
 *     the product's (`checkScenarioOrigin`, the same check `derivedFrom` gets);
 *   - the **assessment** — passed against a model-stated expectation /
 *     failed on a rule marked to change / defect / not yet assessable — is derived from the
 *     run's verdict and the owner's decision on the rule
 *     (`keep`/`change`/`drop`/`clarify`, `lib/process-states.ts`). A traced
 *     case that passed is never "unchanged": nothing ties the test's assertion
 *     to `expectedFromOriginal`, and that result is the model's reading of the
 *     original, not a result of running it (QA review of 11e3bc7d90e8).
 */

import type { BusinessRuleSet } from './abap/business-rule-set';
import type { ElementState } from './process-states';
import {
  checkScenarioOrigin,
  lineWord,
  normaliseRef,
  parseScenarioOrigin,
  type OriginCheck,
  type OriginEngine,
  type OriginLineRange,
} from './scenario-origin';

/* ------------------------------------------------------------------ types */

/** What a traced case checks of the rule: the rule itself, an exception it names, or an edge of its condition. */
export type RuleTraceKind = 'rule' | 'exception' | 'edge';

export const RULE_TRACE_KINDS: readonly RuleTraceKind[] = ['rule', 'exception', 'edge'];

/** The trace as stored on a case after validation. Firestore-safe: no nested arrays, no `undefined`. */
export interface RuleTrace {
  /** `BR-009`. */
  ruleId: string;
  kind: RuleTraceKind;
  /** Lines of the ORIGINAL source the rule stands on. Never empty. */
  lines: OriginLineRange[];
  /** One line (or part of one) copied from those lines. */
  quote?: string;
  /** What the original does there, for this case's input — in words. */
  originalBehaviour: string;
  /** The result the original gives for this case's data — stated without reading the target code. */
  expectedFromOriginal: string;
}

export type RuleTraceParse =
  | { state: 'stated'; trace: RuleTrace }
  | { state: 'not-stated' }
  | { state: 'malformed'; reason: string };

/** A rule the generation must cover, as the prompt lists it. */
export interface MaterialRule {
  id: string;
  /** The rule's code label — the condition as written. */
  label: string;
  /** The rule text the engine writes (its sentences joined). */
  text: string;
  /** The routine it stands in, when the engine names one. */
  routine: string | null;
  ranges: Array<{ lineStart: number; lineEnd: number }>;
  /** The first anchor's verbatim lines, cut short. */
  quote: string;
  type: 'rule' | 'control';
}

/** One decision table, as the prompt lists it, so every row's outcome can get a case. */
export interface MaterialTable {
  id: string;
  field: string;
  lineStart: number;
  lineEnd: number;
  rows: Array<{ condition: string | null; value: string; line: number }>;
  ruleIds: string[];
}

/* ------------------------------------------------------------- constants */

const MAX_TEXT = 600;
const MAX_QUOTE = 400;
/** The prompt lists at most this many rules; the rest are counted and named as not listed. */
export const MAX_PROMPT_RULES = 60;

/** Fields a stored case carries for its trace, besides `ruleTrace` itself. */
export const RULE_TRACE_KEY = 'ruleTrace';
export const RULE_TRACE_DROPPED_KEY = 'ruleTraceDropped';

/* --------------------------------------------------------- material rules */

/**
 * The rules a suite must cover: every rule of the engine's set except those
 * that decide nothing a business reader would test — a constant no condition
 * reads, a routine no entry point reaches, and a technical helper folded into
 * its callers (CSV escaping, buffer probes). Controls stay: a validation that
 * refuses a selection is behaviour the target must keep or change on purpose.
 */
export function materialRules(set: Pick<BusinessRuleSet, 'rules'>): MaterialRule[] {
  const out: MaterialRule[] = [];
  for (const rule of set.rules) {
    const reason = rule.withoutProcessElement?.reason;
    if (reason === 'declaration-only' || reason === 'unreached' || reason === 'technical-helper') continue;
    const ranges: Array<{ lineStart: number; lineEnd: number }> = [];
    for (const s of rule.sentences) {
      for (const a of s.anchors) {
        if (!ranges.some((r) => r.lineStart === a.lineStart && r.lineEnd === a.lineEnd)) ranges.push({ lineStart: a.lineStart, lineEnd: a.lineEnd });
      }
    }
    ranges.sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd);
    const first = rule.sentences.find((s) => s.anchors.length > 0)?.anchors[0];
    const routine = rule.sources.find((s) => s.routine)?.routine ?? null;
    out.push({
      id: rule.id,
      label: rule.label,
      text: rule.text.replace(/\s+/g, ' ').slice(0, MAX_TEXT),
      routine,
      ranges,
      quote: (first?.quote ?? '').replace(/\s+/g, ' ').slice(0, 200),
      type: rule.type,
    });
  }
  return out;
}

/** The decision tables of a set, as the prompt lists them. */
export function materialTables(set: Pick<BusinessRuleSet, 'decisionTables'>): MaterialTable[] {
  return (set.decisionTables ?? []).map((t) => ({
    id: t.id,
    field: t.field,
    lineStart: t.anchor.lineStart,
    lineEnd: t.anchor.lineEnd,
    rows: t.rows.map((r) => ({ condition: r.condition, value: r.value, line: r.anchor.lineStart })),
    ruleIds: [...t.ruleIds],
  }));
}

/* ---------------------------------------------------------------- prompt */

function rangesWord(ranges: ReadonlyArray<{ lineStart: number; lineEnd: number }>): string {
  return ranges.slice(0, 6).map(lineWord).join(', ') + (ranges.length > 6 ? `, +${ranges.length - 6} more` : '');
}

/**
 * The part of the testing prompt that asks for one traced case per material
 * rule. The rules come from the engine (no model), with their ids, lines and a
 * verbatim quote; the model is told to state the expected result from the
 * ORIGINAL, and why: a test whose expectation is read off the generated code
 * passes whatever the generated code does.
 */
export function ruleTracePromptSection(rules: readonly MaterialRule[], tables: readonly MaterialTable[] = []): string {
  if (rules.length === 0) {
    return `
        BUSINESS RULES OF THE ORIGINAL:
        - The engine found no business rule in the legacy source. Write no "ruleTrace".
`;
  }
  const listed = rules.slice(0, MAX_PROMPT_RULES);
  const lines = listed.map(
    (r) =>
      `  ${r.id} (${r.type}${r.routine ? `, in ${r.routine}` : ''}) at ${rangesWord(r.ranges)}: ${r.label.replace(/\s+/g, ' ').slice(0, 140)}\n      what the engine reads: ${r.text.slice(0, 300)}`,
  );
  if (rules.length > listed.length) lines.push(`  (and ${rules.length - listed.length} more rules, not listed — cover the listed ones first)`);
  const tableLines = tables.map(
    (t) =>
      `  ${t.id} sets ${t.field} at ${lineWord(t)} (rules ${t.ruleIds.join(', ') || 'none'}):\n` +
      t.rows.map((row) => `      ${row.condition ?? 'otherwise'} → ${row.value} (L${row.line})`).join('\n'),
  );
  return `
        RULE-TRACED TEST CASES (CRITICAL — this is what the tests are for):
        The tests must show whether the generated code behaves like the ORIGINAL ABAP, not whether it agrees with itself.
        - Write AT LEAST ONE test case for EVERY business rule listed below. Add a separate case for each exception or edge the rule's own code names (for example: a missing baseline date leaves the due date unknown; a reference that does not belong to the same customer is not used; the boundary value of a comparison).
        - Each such case carries "ruleTrace": { "ruleId": "<id from the list, e.g. BR-009>", "kind": "rule" | "exception" | "edge", "lines": ["551-553"], "quote": "<one line copied verbatim from those lines of the numbered legacy source>", "originalBehaviour": "<what the ORIGINAL ABAP does at those lines for this case's input>", "expectedFromOriginal": "<the concrete result the ORIGINAL gives for this case's data: values, bucket, action, count, sum>" }.
        - Derive "expectedFromOriginal" ONLY from the legacy ABAP and the case's input data. Never read it off the generated code, and never compute it with the generated code's own functions inside the test (no "expect(total).toBe(sumOfBuckets(...))"). The assertion in the test MUST compare against the literal value you stated in "expectedFromOriginal".
        - Use the item's OWN identity in inputs (company code, document, year, item, customer). Do not rely on other items being present unless the rule is about them.
        - "expectedResult" may repeat "expectedFromOriginal"; it must not contradict it. If the generated code visibly differs from the original for a rule, still state the ORIGINAL's result — the test is then expected to fail, and that failure is the finding.
        - Put the rule id in the test title after the case id: test('TC_07: BR-009 credit with a foreign reference keeps its own terms', ...).
        - Never invent a rule id or a line: every trace is checked against the source, and a wrong one is flagged.
        Business rules of the ORIGINAL (id, kind, lines, condition, what the engine reads):
${lines.join('\n')}
${tableLines.length > 0 ? `        Decision tables of the ORIGINAL (one case per row outcome is expected; trace it to the listed rule ids):\n${tableLines.join('\n')}\n` : ''}`;
}

/* ----------------------------------------------------------------- parse */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Validate a `ruleTrace` the model wrote or the project stores. Malformed is
 * reported with its reason, never thrown, never repaired.
 */
export function parseRuleTrace(raw: unknown): RuleTraceParse {
  if (raw === undefined || raw === null) return { state: 'not-stated' };
  if (!isPlainObject(raw)) return { state: 'malformed', reason: 'it is not an object with a rule id, lines and an expected result' };
  const rawId = typeof raw.ruleId === 'string' ? raw.ruleId : typeof raw.rule === 'string' ? raw.rule : '';
  const ruleId = rawId.trim() ? normaliseRef(rawId) : '';
  if (!/^BR-\d{3,6}$/.test(ruleId)) {
    return { state: 'malformed', reason: rawId ? `its rule id "${rawId.slice(0, 40)}" is not a business rule id like BR-009` : 'it names no rule id' };
  }
  const kindRaw = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : 'rule';
  const kind = (RULE_TRACE_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as RuleTraceKind) : 'rule';
  // The lines and the quote are read exactly as `derivedFrom` reads them.
  const origin = parseScenarioOrigin({ kind: 'rule', ref: ruleId, lines: raw.lines, quote: raw.quote });
  if (origin.state === 'not-stated') return { state: 'malformed', reason: 'it names no source line' };
  if (origin.state === 'malformed') return { state: 'malformed', reason: origin.reason };
  const originalBehaviour = text(raw.originalBehaviour, MAX_TEXT);
  const expectedFromOriginal = text(raw.expectedFromOriginal ?? raw.expected, MAX_TEXT);
  if (!expectedFromOriginal) return { state: 'malformed', reason: 'it states no expected result from the original' };
  const trace: RuleTrace = {
    ruleId,
    kind,
    lines: origin.origin.lines,
    originalBehaviour: originalBehaviour ?? expectedFromOriginal,
    expectedFromOriginal,
  };
  if (origin.origin.quote) trace.quote = origin.origin.quote.slice(0, MAX_QUOTE);
  return { state: 'stated', trace };
}

/**
 * A generated case as it is stored: `ruleTrace` validated (or dropped, with the
 * reason under `ruleTraceDropped`). When the case states no `derivedFrom`, the
 * trace supplies one — the same rule, lines and quote — so the origin check
 * and the trace never disagree about where a case comes from.
 */
export function withRuleTrace(tc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...tc };
  delete out[RULE_TRACE_DROPPED_KEY];
  const parsed = parseRuleTrace(tc[RULE_TRACE_KEY]);
  if (parsed.state === 'stated') {
    out[RULE_TRACE_KEY] = parsed.trace;
    if (out.derivedFrom === undefined || out.derivedFrom === null) {
      const derived: Record<string, unknown> = { kind: 'rule', ref: parsed.trace.ruleId, lines: parsed.trace.lines };
      if (parsed.trace.quote) derived.quote = parsed.trace.quote;
      out.derivedFrom = derived;
    }
  } else {
    delete out[RULE_TRACE_KEY];
    if (parsed.state === 'malformed') out[RULE_TRACE_DROPPED_KEY] = `The model's rule trace was dropped: ${parsed.reason}.`;
  }
  return out;
}

/** The trace of a stored case, or null. */
export function ruleTraceOf(tc: Record<string, unknown> | null | undefined): RuleTrace | null {
  if (!tc) return null;
  const parsed = parseRuleTrace(tc[RULE_TRACE_KEY]);
  return parsed.state === 'stated' ? parsed.trace : null;
}

/** The check of a trace's rule and lines against the signed source — `derivedFrom`'s check, for the trace. */
export function checkRuleTrace(trace: RuleTrace, engine: OriginEngine): OriginCheck {
  return checkScenarioOrigin({ kind: 'rule', ref: trace.ruleId, lines: trace.lines, ...(trace.quote ? { quote: trace.quote } : {}) }, engine);
}

/* -------------------------------------------------------------- coverage */

export interface RuleCoverage {
  /** Material rules with at least one traced case whose trace is anchored (or not checkable). */
  covered: string[];
  /** Material rules no case traces. */
  missing: string[];
  /** Traced cases whose rule id or lines do not match the source. */
  mismatched: Array<{ caseId: string; ruleId: string; problem: string }>;
  total: number;
}

/**
 * Which material rules the suite covers. A trace counts for its rule only when
 * the check does not refute it; without an engine the stated id counts, and
 * the sentence says the lines were not checked.
 */
export function ruleCoverage(
  rules: ReadonlyArray<{ id: string }>,
  cases: ReadonlyArray<Record<string, unknown>>,
  engine: OriginEngine | null,
): RuleCoverage {
  const wanted = new Set(rules.map((r) => r.id));
  const covered = new Set<string>();
  const mismatched: RuleCoverage['mismatched'] = [];
  for (const tc of cases) {
    const trace = ruleTraceOf(tc);
    if (!trace) continue;
    if (engine) {
      const check = checkRuleTrace(trace, engine);
      if (check.outcome === 'mismatch') {
        mismatched.push({ caseId: String(tc.id ?? ''), ruleId: trace.ruleId, problem: check.problems[0] ?? check.sentence });
        continue;
      }
    }
    if (wanted.has(trace.ruleId)) covered.add(trace.ruleId);
  }
  const order = rules.map((r) => r.id);
  return {
    covered: order.filter((id) => covered.has(id)),
    missing: order.filter((id) => !covered.has(id)),
    mismatched,
    total: order.length,
  };
}

/** "21 of 29 business rules of the original have a case with an expected result from the original · not covered: BR-004, BR-005, … · 1 trace does not match the source". */
export function ruleCoverageSentence(c: RuleCoverage): string {
  if (c.total === 0) return 'The engine found no business rule in the original, so no case can be traced to one.';
  const parts = [`${c.covered.length} of ${c.total} business rules of the original have a case with an expected result from the original`];
  if (c.missing.length > 0) {
    const shown = c.missing.slice(0, 8).join(', ');
    parts.push(`not covered: ${shown}${c.missing.length > 8 ? ` and ${c.missing.length - 8} more` : ''}`);
  }
  if (c.mismatched.length > 0) parts.push(`${c.mismatched.length} ${c.mismatched.length === 1 ? 'trace does' : 'traces do'} not match the source`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------ assessment */

/**
 * The answers per case (§6.4): unchanged (the product's own invariant cases
 * only), passed against a model-stated expectation, failed on a rule the owner
 * marked to change (not determined), defect, not yet assessable.
 */
export type CaseAssessment = 'unchanged' | 'passed-model-stated' | 'failed-rule-changing' | 'defect' | 'not-assessable';

export const CASE_ASSESSMENT_WORD: Record<CaseAssessment, string> = {
  unchanged: 'Unchanged',
  'passed-model-stated': 'Passed · expectation not verified',
  'failed-rule-changing': 'Failed · rule marked to change',
  defect: 'Defect',
  'not-assessable': 'Not yet assessable',
};

export interface CaseAssessmentReading {
  value: CaseAssessment;
  sentence: string;
}

/**
 * One case's assessment.
 *
 *   - no run, or a verdict that judged nothing (Not run, Skipped, Todo,
 *     Error) → not yet assessable — the default, never a pass by absence;
 *   - a traced case that passed → passed against a model-stated expectation:
 *     the target did what the test expected. That the assertion checks the
 *     stated result of the original is not established, and the stated result
 *     is the model's reading of the original — so never "unchanged";
 *   - a traced case that failed, on a rule the owner marked "change
 *     deliberately" or "drop" → failed on a rule marked to change: whether the
 *     failure is that change or another defect is not determined;
 *   - a traced case that failed otherwise → defect, until the owner decides
 *     the rule changes;
 *   - a case without a trace → not yet assessable: it does not say what the
 *     original does, so its verdict cannot say old against new. The invariant
 *     cases are the exception — they compare outputs that the original builds
 *     from one selection, so a failure is a defect and a pass is unchanged.
 */
export function assessCase(input: {
  trace: RuleTrace | null;
  /** The run's verdict for the case, from the covering receipt or this session. */
  verdict: string | null;
  /** The owner's decision on the traced rule, if any. */
  ruleState?: ElementState | null;
  /** A deterministic invariant case (`lib/testing-invariants.ts`). */
  invariant?: boolean;
}): CaseAssessmentReading {
  const { trace, verdict, ruleState, invariant } = input;
  if (!verdict || verdict === 'Not run') {
    return { value: 'not-assessable', sentence: 'No run of this case is on record yet, so old and new have not been compared.' };
  }
  if (verdict !== 'Passed' && verdict !== 'Failed') {
    return { value: 'not-assessable', sentence: `The run gave no verdict on this case (${verdict}), so old and new have not been compared.` };
  }
  if (invariant) {
    return verdict === 'Passed'
      ? { value: 'unchanged', sentence: 'List, totals and export agree for one selection, as they do in the original, where all three come from one selection.' }
      : { value: 'defect', sentence: 'List, totals and export disagree for one selection. The original builds all three from one selection, so this is a defect.' };
  }
  if (!trace) {
    return {
      value: 'not-assessable',
      sentence: `The case ${verdict === 'Passed' ? 'passed' : 'failed'}, but it names no business rule of the original, so its verdict does not say whether the behaviour changed.`,
    };
  }
  if (verdict === 'Passed') {
    const notVerified = `The expected result for ${trace.ruleId} is model-stated from the original (${trace.expectedFromOriginal}), not verified — neither by running the original nor by checking that the test asserts it.`;
    if (ruleState === 'change' || ruleState === 'drop') {
      return {
        value: 'passed-model-stated',
        sentence: `The case passed although ${trace.ruleId} is marked "${ruleState === 'change' ? 'change deliberately' : 'drop'}" — check whether the decided change is in the code yet. ${notVerified}`,
      };
    }
    return { value: 'passed-model-stated', sentence: `The case passed. ${notVerified}` };
  }
  // A rule decision does not explain a failure by itself (QA 6e1e9a6a3c3b): the
  // case may fail for another reason in the same code. Said as open, never as
  // "deliberate".
  if (ruleState === 'change' || ruleState === 'drop') {
    return {
      value: 'failed-rule-changing',
      sentence: `The case failed, and ${trace.ruleId} is marked "${ruleState === 'change' ? 'change deliberately' : 'drop'}". Whether this failure is that decided change or a defect elsewhere is not determined — compare the failure with the decision.`,
    };
  }
  return {
    value: 'defect',
    sentence: `The target differs from the original for ${trace.ruleId} (expected from the original: ${trace.expectedFromOriginal}). Nobody marked the rule to change, so this is a defect until the owner decides otherwise.`,
  };
}

export interface AssessmentCounts {
  unchanged: number;
  passedModelStated: number;
  failedRuleChanging: number;
  defect: number;
  notAssessable: number;
}

export function countAssessments(values: readonly CaseAssessment[]): AssessmentCounts {
  const c: AssessmentCounts = { unchanged: 0, passedModelStated: 0, failedRuleChanging: 0, defect: 0, notAssessable: 0 };
  for (const v of values) {
    if (v === 'unchanged') c.unchanged++;
    else if (v === 'passed-model-stated') c.passedModelStated++;
    else if (v === 'failed-rule-changing') c.failedRuleChanging++;
    else if (v === 'defect') c.defect++;
    else c.notAssessable++;
  }
  return c;
}

/** "Old against new: 1 unchanged · 5 passed, expectation model-stated, not verified · 1 failed on a rule marked to change, not determined · 2 defects · 3 not yet assessable". */
export function assessmentSummary(c: AssessmentCounts): string {
  const parts: string[] = [];
  parts.push(`${c.unchanged} unchanged`);
  if (c.passedModelStated > 0) parts.push(`${c.passedModelStated} passed, expectation model-stated, not verified`);
  if (c.failedRuleChanging > 0) parts.push(`${c.failedRuleChanging} failed on a rule marked to change, not determined`);
  parts.push(`${c.defect} ${c.defect === 1 ? 'defect' : 'defects'}`);
  parts.push(`${c.notAssessable} not yet assessable`);
  return `Old against new: ${parts.join(' · ')}`;
}
