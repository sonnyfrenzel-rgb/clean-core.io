/**
 * The words for the checks of an engine-led generation (roadmap 3.0.12, step
 * E) — one source for the generation screen, the Built-on card, STATUS.md and
 * TRACE.md, so none of them can say it differently.
 *
 * Two rules the words keep:
 *
 *   - Three outcomes, never two. A result is passed, failed or not run; a case
 *     the runner skipped is not a run that passed. "26 run, 0 failed" over 26
 *     cases that never ran was the defect this module replaced.
 *   - Who decides the outcome. A check of engine-written code (the input
 *     contract, decimals, CSV, run store) says nothing about the functions the
 *     model wrote, and is never worded as if it did; the checks that can reach
 *     the written functions are counted apart, even when none of them ran.
 *
 * A check is green ('met') only when something of the written functions
 * passed and nothing failed or was not run. A record from before the split
 * (no `scope`, no `passed`) is read as it was stored: its total is called
 * "reported", never "run" or "passed".
 *
 * Pure: no imports beyond types.
 */

export type CheckScopeWord = 'engine-code' | 'fills';

/** A check as the record, the trace or the event carries it — every split field optional (older records). */
export interface CheckLike {
  kind: string;
  total: number;
  failed: number;
  passed?: number;
  notRun?: number;
  scope?: CheckScopeWord;
  notRunReason?: string | null;
  baseThrew?: string | null;
}

/** Said once under the checks wherever a check of engine-written code is listed. */
export const ENGINE_CODE_NOTE =
  "Checks of the engine's own code run only what Clean-Core.io wrote (input contract, decimals, CSV, run store); they do not test the functions the model wrote.";

const plural =(n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The noun of a check, in the singular and plural, and what it checks. */
function nounOf(kind: string, scope: CheckScopeWord | undefined): { one: string; many: string; of: string } {
  if (kind === 'cases') {
    if (scope === 'fills') return { one: 'engine case', many: 'engine cases', of: 'of the written functions' };
    if (scope === 'engine-code') return { one: 'engine case', many: 'engine cases', of: "of the engine's input-contract, decimal and run-store code" };
    return { one: 'engine case', many: 'engine cases', of: '' };
  }
  if (kind === 'probes') {
    if (scope === 'fills') return { one: 'probe', many: 'probes', of: 'of the written functions' };
    if (scope === 'engine-code') return { one: 'probe', many: 'probes', of: "of the engine's decimal, CSV and run-store code" };
    return { one: 'probe', many: 'probes', of: '' };
  }
  if (kind === 'guards') return { one: 'body guard', many: 'body guards', of: '' };
  if (kind === 'lint') return { one: 'lint check', many: 'lint checks', of: '' };
  if (kind === 'formats') return { one: 'object file', many: 'object files', of: "against SAP's ABAP file formats (AFF schemas)" };
  return { one: kind, many: kind, of: '' };
}

const withOf = (head: string, of: string) => (of ? `${head} ${of}` : head);

/** True when the check carries the three-way split (written since the honest count). */
export function isSplit(c: CheckLike): boolean {
  return typeof c.passed === 'number' && typeof c.notRun === 'number';
}

/**
 * One check as a phrase: "5 probes of the engine's decimal, CSV and run-store
 * code passed", "26 engine cases of the written functions not run — no valid
 * base value known for P_BANFN", "engine cases of the written functions: 0 run".
 */
export function checkPhrase(c: CheckLike): string {
  const n = nounOf(c.kind, c.scope);
  if (c.kind === 'guards') return `body guards: ${plural(c.total, 'body', 'bodies')}, ${c.failed} refused`;
  if (c.kind === 'lint') return `lint checks: ${c.total === 0 ? 'no finding' : plural(c.total, 'finding')}`;
  const threw = c.baseThrew ? `; the base request threw in the written functions (${c.baseThrew})` : '';
  if (!isSplit(c)) {
    // A record from before the split: its total mixed passed and not run.
    return `${withOf(n.many, n.of)}: ${c.total} reported, ${c.failed} failed (passed and not run were not counted apart)`;
  }
  const passed = c.passed ?? 0;
  const notRun = c.notRun ?? 0;
  const reason = c.notRunReason ? ` — ${c.notRunReason}` : '';
  if (c.total === 0) return `${withOf(n.many, n.of)}: 0 run${threw}`;
  if (passed === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} passed`;
  if (notRun === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} not run${reason}${threw}`;
  if (c.failed === c.total) return `${c.total} ${withOf(c.total === 1 ? n.one : n.many, n.of)} failed${threw}`;
  const parts = [`${passed} passed`, `${c.failed} failed`, `${notRun} not run${reason}`];
  return `${withOf(n.many, n.of)}: ${parts.join(', ')}${threw}`;
}

/** The checks of one kind (both scopes) as the screen's state: green only when the written functions passed something and nothing else is open. */
export function checkStateOf(checks: readonly CheckLike[]): 'met' | 'warning' | 'failed' {
  if (checks.some((c) => c.failed > 0 || c.baseThrew)) return 'failed';
  if (checks.length === 0 || checks.some((c) => !isSplit(c) || (c.notRun ?? 0) > 0)) return 'warning';
  const fills = checks.filter((c) => c.scope === 'fills');
  return fills.some((c) => (c.passed ?? 0) > 0) ? 'met' : 'warning';
}

/** The order the phrases of one kind are said in: the written functions first, then the engine's own code. */
export function orderedChecks<T extends CheckLike>(checks: readonly T[]): T[] {
  const rank = (c: CheckLike) => ['guards', 'lint', 'cases', 'probes', 'formats'].indexOf(c.kind) * 3 + (c.scope === 'fills' ? 0 : c.scope === 'engine-code' ? 1 : 2);
  return [...checks].sort((a, b) => rank(a) - rank(b));
}

/** A check with only the fields it carries — no `undefined` reaches Firestore or the trace. */
export function checkSummaryOf<T extends CheckLike>(c: T): T {
  const out = { kind: c.kind, total: c.total, failed: c.failed } as T;
  if (typeof c.passed === 'number') out.passed = c.passed;
  if (typeof c.notRun === 'number') out.notRun = c.notRun;
  if (c.scope) out.scope = c.scope;
  if (c.notRunReason) out.notRunReason = c.notRunReason;
  if (c.baseThrew) out.baseThrew = c.baseThrew;
  return out;
}
