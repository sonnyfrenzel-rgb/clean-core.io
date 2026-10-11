/**
 * The mutation probe: does the suite constrain the behaviour at all?
 *
 * External review of FI_Collection_Worklist, F-05: all ten generated tests
 * passed although a credit memo took a hard-coded foreign reference (F-01) and
 * the totals and the CSV ignored the customer filter (F-02). The reviewer's
 * question was the right one: *would a wrong reference or a dropped export
 * filter turn a test red?* This module answers it for every suite that passes.
 *
 * After a passing run the suite runs again against a few deterministic
 * mutants of the code under test — small, plausible defects of the kind the
 * review found:
 *
 *   - `ignore-request-param` — a request parameter the handlers read
 *     (`req.query.kunnr`) is read as `undefined`: the F-02 class;
 *   - `constant-lookup`      — a lookup `items.find(…)` returns the first entry
 *     whatever it matches: the F-01 class (a fixed reference instead of the
 *     item's own);
 *   - `drop-guard`           — a guard `if (…) continue;` never fires: a filter
 *     of the population is dropped;
 *   - `drop-filter`          — `.filter(…)` passes everything;
 *   - `flip-comparison`      — `<=` becomes `<`, `>=` becomes `>`, `===`
 *     becomes `!==` (and back): a boundary or a condition is wrong.
 *
 * A mutant is *killed* when the suite fails against it, *survives* when the
 * suite still passes, is *invalid* when it does not compile (it then counts
 * for nothing), and *not run* when the runner gave no answer. The report says
 * "the suite catches k of n mutants", names every survivor, and flags a suite
 * that catches none: its tests do not constrain the behaviour.
 *
 * Pure: generation and the report are deterministic functions of the code and
 * the outcomes. Running them is the route's (`/api/run-tests`, mode
 * `mutationProbe`) through the same runner contract as every run — a mutant is
 * just another set of files — so it needs nothing new from the runner.
 */

import type { SandboxFile } from './test-sandbox/files';
import { codeMask, codeMatches, lineAt, matchClose } from './ts-source-scan';

/* ------------------------------------------------------------------ types */

export type MutationOperator = 'ignore-request-param' | 'constant-lookup' | 'drop-guard' | 'drop-filter' | 'flip-comparison';

export const MUTATION_OPERATORS: readonly MutationOperator[] = [
  'ignore-request-param',
  'constant-lookup',
  'drop-guard',
  'drop-filter',
  'flip-comparison',
];

export interface Mutant {
  /** `M1`, `M2`, … in the order they are run. */
  id: string;
  operator: MutationOperator;
  file: string;
  line: number;
  /** What changed, in words: "the request parameter kunnr is ignored (req.query.kunnr → undefined)". */
  description: string;
  /** The files with this one change. Every other file is byte-identical. */
  files: SandboxFile[];
}

export type MutantOutcome = 'killed' | 'survived' | 'invalid' | 'not-run';

export interface MutantResult {
  id: string;
  operator: MutationOperator;
  file: string;
  line: number;
  description: string;
  outcome: MutantOutcome;
}

/**
 * The probe's verdict:
 *   - `constrains`         every viable mutant was caught;
 *   - `partly`             some were, some survived;
 *   - `does-not-constrain` none was caught — the tests do not constrain the behaviour;
 *   - `no-mutants`         the code gave no site for any operator;
 *   - `not-run`            no mutant could be run.
 */
export type MutationVerdict = 'constrains' | 'partly' | 'does-not-constrain' | 'no-mutants' | 'not-run';

/** What the receipt records (`TestRunReceipt.mutation`). Firestore-safe. */
export interface MutationProbeReport {
  v: 1;
  /** Server clock, ISO 8601. */
  at: string;
  /** Mutants that compiled and ran: killed + survived. */
  viable: number;
  killed: number;
  verdict: MutationVerdict;
  sentence: string;
  mutants: MutantResult[];
}

/* -------------------------------------------------------------- settings */

/** How many mutants one probe runs at most. Each is one runner call. */
export const MAX_MUTANTS = 6;

/** How many sites each operator contributes before the round-robin fills up. */
const QUOTA: Record<MutationOperator, number> = {
  'ignore-request-param': 2,
  'constant-lookup': 1,
  'drop-guard': 1,
  'drop-filter': 1,
  'flip-comparison': 1,
};

const CODE_FILE = /\.(ts|tsx|js|mjs|cjs)$/i;
const NOT_UNDER_TEST = /(^|\/)(test|tests|__tests__|spec)(\/|\.)|\.(test|spec)\.[cm]?[jt]sx?$|\.d\.ts$|playwright\.config|(^|\/)erp-triggers\//i;

/* ------------------------------------------------------------------ sites */

interface Site {
  operator: MutationOperator;
  fileIndex: number;
  /** Replacements applied together, in this file. Non-overlapping. */
  edits: Array<{ start: number; end: number; text: string }>;
  line: number;
  description: string;
  /** Stable key, so the same site is never picked twice. */
  key: string;
}

function short(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function sitesOf(file: SandboxFile, fileIndex: number): Site[] {
  const src = file.content;
  const mask = codeMask(src);
  const sites: Site[] = [];

  // ignore-request-param: every read of one parameter in this file, together.
  const reads = new Map<string, Array<{ start: number; end: number; text: string }>>();
  const defaulted = new Set<string>();
  for (const m of codeMatches(src, mask, /\b(?:req|request)\.(?:query|body|params)\.([A-Za-z_$][\w$]*)\b/g)) {
    const list = reads.get(m[1]) ?? [];
    list.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    reads.set(m[1], list);
    // `(req.query.companyCode as string) || '1000'` — a parameter with a fallback is a setting more often than a filter.
    if (/^[^;\n]{0,24}?(\|\||\?\?)/.test(src.slice(m.index + m[0].length, m.index + m[0].length + 30))) defaulted.add(m[1]);
  }
  // Parameters without a fallback first (a selection), then the rarest (one only some handlers
  // read is the one a shared selection loses), then by position.
  const params = [...reads.entries()].sort(
    (a, b) =>
      Number(defaulted.has(a[0])) - Number(defaulted.has(b[0])) ||
      a[1].length - b[1].length ||
      a[1][0].start - b[1][0].start,
  );
  for (const [name, list] of params) {
    sites.push({
      operator: 'ignore-request-param',
      fileIndex,
      edits: list.map((r) => ({ start: r.start, end: r.end, text: 'undefined' })),
      line: lineAt(src, list[0].start),
      description: `the request parameter ${name} is ignored (${list[0].text} → undefined, ${list.length} ${list.length === 1 ? 'place' : 'places'})`,
      key: `${file.path}#param:${name}`,
    });
  }

  // constant-lookup: `.find(…)` → `[0]`.
  for (const m of codeMatches(src, mask, /\.find\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, mask, open);
    if (close === -1) continue;
    sites.push({
      operator: 'constant-lookup',
      fileIndex,
      edits: [{ start: m.index, end: close + 1, text: '[0]' }],
      line: lineAt(src, m.index),
      description: `a lookup returns the first entry instead of the matching one (${short(src.slice(m.index, close + 1))} → [0])`,
      key: `${file.path}#find:${m.index}`,
    });
  }

  // drop-guard: `if (cond) continue;` → `if (false) continue;`
  for (const m of codeMatches(src, mask, /\bif\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, mask, open);
    if (close === -1) continue;
    const after = src.slice(close + 1, close + 40);
    if (!/^\s*continue\s*;/.test(after)) continue;
    sites.push({
      operator: 'drop-guard',
      fileIndex,
      edits: [{ start: open + 1, end: close, text: 'false' }],
      line: lineAt(src, m.index),
      description: `a guard that skips items never fires (if (${short(src.slice(open + 1, close), 50)}) continue)`,
      key: `${file.path}#guard:${m.index}`,
    });
  }

  // drop-filter: `.filter(…)` → removed.
  for (const m of codeMatches(src, mask, /\.filter\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, mask, open);
    if (close === -1) continue;
    sites.push({
      operator: 'drop-filter',
      fileIndex,
      edits: [{ start: m.index, end: close + 1, text: '' }],
      line: lineAt(src, m.index),
      description: `a filter passes everything (${short(src.slice(m.index, close + 1))} removed)`,
      key: `${file.path}#filter:${m.index}`,
    });
  }

  // flip-comparison: boundary operators first, then equality.
  const flips: Array<[RegExp, (op: string) => string]> = [
    [/<=|>=/g, (op) => (op === '<=' ? '<' : '>')],
    [/===|!==/g, (op) => (op === '===' ? '!==' : '===')],
  ];
  for (const [re, flip] of flips) {
    for (const m of codeMatches(src, mask, re)) {
      // Not part of `=>`, `<<=`, `>>=`, `>>>=`.
      const before = src[m.index - 1] ?? '';
      if (m[0].length === 2 && (before === '<' || before === '>' || before === '=')) continue;
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const lineEnd = src.indexOf('\n', m.index);
      const context = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
      sites.push({
        operator: 'flip-comparison',
        fileIndex,
        edits: [{ start: m.index, end: m.index + m[0].length, text: flip(m[0]) }],
        line: lineAt(src, m.index),
        description: `a comparison is flipped (${m[0]} → ${flip(m[0])} in "${short(context, 60)}")`,
        key: `${file.path}#flip:${m.index}`,
      });
    }
  }
  return sites;
}

function applyEdits(content: string, edits: Site['edits']): string {
  let out = content;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Evenly spread picks: `k` of `m` indices, deterministic. */
function spread(m: number, k: number): number[] {
  if (k >= m) return Array.from({ length: m }, (_, i) => i);
  return Array.from({ length: k }, (_, i) => Math.floor(((i + 0.5) * m) / k));
}

/**
 * The mutants of a set of files, deterministic: the same files give the same
 * mutants in the same order. Only code under test is mutated — no suite, no
 * config, no ABAP trigger. Each operator first takes its quota of sites,
 * spread over the code; free places are then filled round-robin.
 */
export function generateMutants(files: readonly SandboxFile[], max: number = MAX_MUTANTS): Mutant[] {
  const byOperator = new Map<MutationOperator, Site[]>(MUTATION_OPERATORS.map((op) => [op, []]));
  files.forEach((file, index) => {
    if (!CODE_FILE.test(file.path) || NOT_UNDER_TEST.test(file.path)) return;
    for (const site of sitesOf(file, index)) byOperator.get(site.operator)!.push(site);
  });
  const chosen: Site[] = [];
  const taken = new Set<string>();
  for (const op of MUTATION_OPERATORS) {
    const sites = byOperator.get(op)!;
    const picks = op === 'ignore-request-param' ? sites.slice(0, QUOTA[op]).map((_, i) => i) : spread(sites.length, QUOTA[op]);
    for (const i of picks) {
      if (chosen.length >= max) break;
      chosen.push(sites[i]);
      taken.add(sites[i].key);
    }
  }
  // Round-robin over what is left, in operator order.
  let progress = true;
  while (chosen.length < max && progress) {
    progress = false;
    for (const op of MUTATION_OPERATORS) {
      if (chosen.length >= max) break;
      const next = byOperator.get(op)!.find((s) => !taken.has(s.key));
      if (next) {
        chosen.push(next);
        taken.add(next.key);
        progress = true;
      }
    }
  }
  return chosen.map((site, i) => ({
    id: `M${i + 1}`,
    operator: site.operator,
    file: files[site.fileIndex].path,
    line: site.line,
    description: site.description,
    files: files.map((f, idx) => (idx === site.fileIndex ? { path: f.path, content: applyEdits(f.content, site.edits) } : f)),
  }));
}

/* ----------------------------------------------------------------- report */

/** What one mutant run gave, as the route sees it. */
export type MutantExecution =
  | { kind: 'ran'; exitCode: number; failedCases: number }
  | { kind: 'build-error' }
  | { kind: 'unavailable'; reason: string };

/** Killed when the suite fails against the mutant; survived when it still passes. */
export function mutantOutcome(execution: MutantExecution): MutantOutcome {
  if (execution.kind === 'build-error') return 'invalid';
  if (execution.kind === 'unavailable') return 'not-run';
  return execution.exitCode !== 0 || execution.failedCases > 0 ? 'killed' : 'survived';
}

const OPERATOR_WORD: Record<MutationOperator, string> = {
  'ignore-request-param': 'request parameter ignored',
  'constant-lookup': 'lookup fixed to the first entry',
  'drop-guard': 'guard dropped',
  'drop-filter': 'filter dropped',
  'flip-comparison': 'comparison flipped',
};

export function operatorWord(op: MutationOperator): string {
  return OPERATOR_WORD[op];
}

/** The report of a probe, from the mutants and their outcomes. */
export function mutationReport(results: readonly MutantResult[], at: string): MutationProbeReport {
  const killed = results.filter((r) => r.outcome === 'killed').length;
  const survived = results.filter((r) => r.outcome === 'survived');
  const viable = killed + survived.length;
  const notRun = results.filter((r) => r.outcome === 'not-run').length;
  const invalid = results.filter((r) => r.outcome === 'invalid').length;
  let verdict: MutationVerdict;
  if (results.length === 0) verdict = 'no-mutants';
  else if (viable === 0) verdict = 'not-run';
  else if (killed === 0) verdict = 'does-not-constrain';
  else if (killed === viable) verdict = 'constrains';
  else verdict = 'partly';
  const extras: string[] = [];
  if (invalid > 0) extras.push(`${invalid} did not compile and count for nothing`);
  if (notRun > 0) extras.push(`${notRun} could not be run`);
  const extra = extras.length > 0 ? ` (${extras.join('; ')})` : '';
  const survivors = survived.map((r) => `${r.id} — ${r.description} (${r.file}:${r.line})`).join('; ');
  let sentence: string;
  switch (verdict) {
    case 'no-mutants':
      sentence = 'The probe found no place in the generated code to change, so it says nothing about the suite.';
      break;
    case 'not-run':
      sentence = `No mutant of the generated code could be run${extra}, so the probe says nothing about the suite.`;
      break;
    case 'does-not-constrain':
      sentence = `The suite catches none of the ${viable} mutants of the generated code${extra}: the tests do not constrain the behaviour. Surviving: ${survivors}.`;
      break;
    case 'constrains':
      sentence = `The suite catches ${killed} of ${viable} mutants of the generated code${extra}.`;
      break;
    default:
      sentence = `The suite catches ${killed} of ${viable} mutants of the generated code${extra}. Surviving: ${survivors}.`;
  }
  return { v: 1, at, viable, killed, verdict, sentence, mutants: results.map((r) => ({ ...r })) };
}

/** Shape check of a stored report — the receipt's reader refuses a receipt with a malformed one. */
export function isMutationProbeReport(value: unknown): value is MutationProbeReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  const verdicts: readonly string[] = ['constrains', 'partly', 'does-not-constrain', 'no-mutants', 'not-run'];
  const outcomes: readonly string[] = ['killed', 'survived', 'invalid', 'not-run'];
  return (
    r.v === 1 &&
    typeof r.at === 'string' &&
    typeof r.viable === 'number' &&
    typeof r.killed === 'number' &&
    verdicts.includes(r.verdict as string) &&
    typeof r.sentence === 'string' &&
    Array.isArray(r.mutants) &&
    r.mutants.every(
      (m) =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as MutantResult).id === 'string' &&
        (MUTATION_OPERATORS as readonly string[]).includes((m as MutantResult).operator) &&
        typeof (m as MutantResult).file === 'string' &&
        typeof (m as MutantResult).line === 'number' &&
        typeof (m as MutantResult).description === 'string' &&
        outcomes.includes((m as MutantResult).outcome),
    )
  );
}

/**
 * May a probe run on this receipt? Only on a run of the whole suite that
 * passed: exit code 0, no failed or errored case, at least one pass, and every
 * stored case in scope. A probe over a failing or partial run would measure
 * the failures, not the tests.
 */
export function probeBasis(
  receipt: { exitCode: number; verdicts: Array<{ id: string; status: string }>; scope: { selected: string[] | null } } | null,
  caseIds: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (!receipt) return { ok: false, reason: 'No recorded run covers the current code and suite. Run the tests first.' };
  if (receipt.exitCode !== 0 || receipt.verdicts.some((v) => v.status === 'Failed' || v.status === 'Error')) {
    return { ok: false, reason: 'The recorded run did not pass, so the probe would measure its failures, not the tests. Fix the failures first.' };
  }
  if (!receipt.verdicts.some((v) => v.status === 'Passed')) return { ok: false, reason: 'The recorded run passed no case, so there is nothing to probe.' };
  const selected = receipt.scope.selected;
  if (selected !== null && caseIds.some((id) => !selected.includes(id))) {
    return { ok: false, reason: 'The recorded run covered only some of the cases. Run the whole suite, then probe it.' };
  }
  return { ok: true };
}
