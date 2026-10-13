/**
 * Verify a generation candidate (`docs/design/engine-led-transformation.md`
 * §13.1, Track C): the lints in the browser, the engine cases and the
 * failure-pattern probes on the isolated runner — and every failure mapped
 * back to the function (fill unit) it belongs to, so the repair round sends
 * only that function back to the model.
 *
 * How a failure finds its unit:
 *
 *   - a **lint finding** by file and line: the line lies between the fill
 *     markers of a unit (`// @cc-fill BEGIN U02 …` … `// @cc-fill END U02`,
 *     §9.1) — anywhere else it is in engine-written code;
 *   - a failing **engine case** by its business rule: the units that carry the
 *     case's rule id (`EngineCaseTrace.ruleId`); a case without a rule, or with
 *     a rule no unit carries, tests the engine-written input contract, decimal
 *     code or run store;
 *   - a failing **probe** by the adapter: the unit the adapter names for it, or
 *     the units filled in the modules the probe calls; otherwise engine code.
 *
 * A failure that maps to no unit is returned with `unitId: null` — the
 * orchestrator reports it as a scaffold finding and never sends it to the
 * model (§13.2 step 2).
 *
 * The runner half goes through the server: the candidate is proposed as a
 * repair draft with `target: { kind: 'generation' }` (`lib/repair-draft.ts`)
 * and run with `POST /api/run-tests { mode: 'verify', draftId }`, which
 * derives the engine cases from the project's own source on the server and
 * writes nothing onto the project. Network calls are injected, so this module
 * stays pure and the specs drive it without a server.
 */

import type { CheckCount, CheckFailure, CheckKind, CheckScope, Verify, VerifyOutcome } from './orchestrator';

export { affFormatsCheck } from './aff-check';
export { packageFormatsHook } from './abapgit-check';

export interface FileLike {
  path: string;
  content: string;
}

export interface MarkerSpan {
  unitId: string;
  path: string;
  /** 1-based lines of the BEGIN and END markers. */
  beginLine: number;
  endLine: number;
}

const BEGIN = /@cc-fill BEGIN (U[0-9A-Za-z_-]+)\b/;
const END = /@cc-fill END (U[0-9A-Za-z_-]+)\b/;

const normPath = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** Where each unit's fill markers stand in the candidate files. */
export function markerSpans(files: readonly FileLike[]): MarkerSpan[] {
  const spans: MarkerSpan[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    const open = new Map<string, number>();
    lines.forEach((line, i) => {
      const b = line.match(BEGIN);
      if (b) {
        open.set(b[1], i + 1);
        return;
      }
      const e = line.match(END);
      if (e && open.has(e[1])) {
        spans.push({ unitId: e[1], path: normPath(file.path), beginLine: open.get(e[1])!, endLine: i + 1 });
        open.delete(e[1]);
      }
    });
  }
  return spans;
}

/** The unit whose fill markers enclose this line, or null. */
export function unitAt(spans: readonly MarkerSpan[], path: string, line: number | null | undefined): string | null {
  if (typeof line !== 'number' || !Number.isFinite(line)) return null;
  const p = normPath(path);
  const hit = spans.find((s) => s.path === p && line > s.beginLine && line < s.endLine);
  return hit ? hit.unitId : null;
}

export interface LintFinding {
  path: string;
  line: number | null;
  message: string;
}

export function mapLintFindings(findings: readonly LintFinding[], spans: readonly MarkerSpan[]): CheckFailure[] {
  return findings.map((f) => ({
    unitId: unitAt(spans, f.path, f.line),
    check: 'lint' as const,
    failure: `${normPath(f.path)}${f.line ? `:${f.line}` : ''} — ${f.message}`,
  }));
}

export interface RunnerResult {
  id: string;
  status: string;
  message?: string;
  /**
   * Why an engine case did not run, when the judge can say it structurally:
   * `base-threw` — `validate` accepted the contract's base request and
   * `simulate` threw on it, i.e. code behind the call contract threw on the
   * original's own base request (`judgeControl`).
   */
  cause?: string;
}

/* ------------------------------------------------- who decides the outcome */

/**
 * The probes whose subject is engine-written code (`acceptanceAdapter`,
 * `lib/transformation/call-contract.ts`): they call the shims into the
 * package's decimal and CSV code, the run store, and `validate`/`simulate` on
 * a request the input contract refuses or the run-id check of two runs. A
 * pass says the engine's code holds — nothing about the written functions.
 * Every other probe (display filter, recalculation, negative write) has a
 * subject only the fills write.
 */
export const ENGINE_CODE_PROBES: ReadonlySet<string> = new Set([
  'rounding-commercial',
  'decimal-quantity',
  'csv-escaping',
  'run-id-collision',
  'empty-selection',
  'lenient-numeric',
]);

export function probeScope(probeId: string): CheckScope {
  const probe = probeId.startsWith(PROBE_TEST_PREFIX) ? probeId.slice(PROBE_TEST_PREFIX.length) : probeId;
  return ENGINE_CODE_PROBES.has(probe) ? 'engine-code' : 'fills';
}

/**
 * Who decides an engine case: the scope the route derived (`engineCaseScope`
 * — guard refusals and record counts need the fills; input contract, exact
 * arithmetic and run identity are the engine's), or, on an answer without it,
 * a case with a business rule is the written functions' and one without is
 * the engine's.
 */
export function caseScope(c: { ruleId?: string | null; scope?: string | null } | undefined): CheckScope {
  if (c?.scope === 'fills' || c?.scope === 'engine-code') return c.scope;
  return c?.ruleId ? 'fills' : 'engine-code';
}

const NOT_RUN_PREFIXES = [/^Not run through the call contract:\s*/i, /^not run(?:nable)?:\s*/i, /^not applicable:\s*/i];

/** A not-run message without the runner's own lead-in, so a shared reason reads once. */
export function notRunReasonOf(message: string | undefined): string {
  let m = (message ?? '').trim();
  for (const re of NOT_RUN_PREFIXES) m = m.replace(re, '');
  return m.replace(/^Not run — /, '');
}

/** Count results three ways for one scope; the reason is said when every not-run result shares one. */
export function countResults(results: readonly RunnerResult[], kind: CheckKind, scope: CheckScope, ms: number): CheckCount {
  const passed = results.filter((r) => r.status === 'Passed').length;
  const failed = results.filter((r) => r.status === 'Failed').length;
  const notRunResults = results.filter((r) => r.status !== 'Passed' && r.status !== 'Failed');
  const reasons = [...new Set(notRunResults.map((r) => notRunReasonOf(r.message)))];
  return {
    kind,
    scope,
    total: results.length,
    passed,
    failed,
    notRun: notRunResults.length,
    notRunReason: notRunResults.length > 0 && reasons.length === 1 && reasons[0] ? reasons[0].slice(0, 300) : null,
    ms,
  };
}

/**
 * The unit that writes each check's predicate, read from the candidate's fill
 * markers (`// @cc-fill BEGIN U02.G0061 …` → `G-0061` → `U02`).
 */
export function guardUnits(files: readonly FileLike[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) for (const m of f.content.matchAll(/@cc-fill BEGIN (U[0-9A-Za-z_-]+)\.G(\d+)\b/g)) out.set(`G-${m[2]}`, m[1]);
  return out;
}

/**
 * Failing engine cases onto the units that carry their rule — or, for a case
 * traced by its line, the unit that writes the check's predicate (`guard`).
 * One failure per case per unit; a case no unit owns is one failure with
 * `unitId: null`.
 */
export function mapEngineFailures(
  results: readonly RunnerResult[],
  cases: ReadonlyArray<{ id: string; ruleId?: string | null; guard?: string | null }>,
  units: ReadonlyArray<{ unitId: string; rules: readonly string[] }>,
  byGuard: ReadonlyMap<string, string> = new Map(),
): CheckFailure[] {
  const ruleOf = new Map(cases.map((c) => [c.id, c.ruleId ?? null]));
  const guardOf = new Map(cases.map((c) => [c.id, c.guard ?? null]));
  const out: CheckFailure[] = [];
  for (const r of results) {
    if (r.status !== 'Failed') continue;
    const rule = ruleOf.get(r.id) ?? null;
    const guard = guardOf.get(r.id) ?? null;
    const failure = `${r.id}${rule ? ` (${rule})` : ''} failed through the call contract${r.message ? `: ${r.message}` : ''}`;
    let owners = rule ? units.filter((u) => u.rules.includes(rule)).map((u) => u.unitId) : [];
    if (owners.length === 0 && guard && byGuard.has(guard)) owners = [byGuard.get(guard)!];
    if (owners.length === 0) out.push({ unitId: null, check: 'cases', failure });
    else for (const unitId of owners) out.push({ unitId, check: 'cases', failure });
  }
  return out;
}

/** The test id of a probe in the verify suite (`lib/test-sandbox/probe-suite.ts`). */
export const PROBE_TEST_PREFIX = 'PRB_';

/**
 * Failing probes onto units: the adapter's `unit` for the probe when it names
 * one, otherwise the units filled in the modules its callables name.
 */
export function mapProbeFailures(
  results: readonly RunnerResult[],
  adapter: unknown,
  spans: readonly MarkerSpan[],
): CheckFailure[] {
  const a = (adapter && typeof adapter === 'object' ? adapter : {}) as { modules?: Record<string, unknown>; probes?: Record<string, unknown> };
  const modules = a.modules && typeof a.modules === 'object' ? a.modules : {};
  const out: CheckFailure[] = [];
  for (const r of results) {
    if (r.status !== 'Failed' || !r.id.startsWith(PROBE_TEST_PREFIX)) continue;
    const probe = r.id.slice(PROBE_TEST_PREFIX.length);
    const failure = `probe ${probe} failed${r.message ? `: ${r.message}` : ''}`;
    const cfg = (a.probes?.[probe] ?? {}) as Record<string, unknown>;
    let owners: string[] = [];
    if (typeof cfg.unit === 'string') owners = [cfg.unit];
    else {
      const named = new Set<string>();
      JSON.stringify(cfg, (k, v) => {
        if (k === 'module' && typeof v === 'string') named.add(v);
        return v;
      });
      const paths = [...named].map((m) => modules[m]).filter((p): p is string => typeof p === 'string').map(normPath);
      owners = [...new Set(spans.filter((s) => paths.includes(s.path)).map((s) => s.unitId))];
    }
    if (owners.length === 0) out.push({ unitId: null, check: 'probes', failure });
    else for (const unitId of owners) out.push({ unitId, check: 'probes', failure });
  }
  return out;
}

/* ------------------------------------------------------------ the verifier */

/** What `POST /api/run-tests { mode: 'verify' }` answers (see the route). */
export interface VerifyRunAnswer {
  mode: 'verify';
  buildError?: string | null;
  engine:
    | { ran: true; results: RunnerResult[]; cases: Array<{ id: string; ruleId: string | null; scope?: CheckScope; guard?: string | null }> }
    | { ran: false; reason: string };
  probes: { ran: true; results: RunnerResult[]; skipped: Array<{ probe: string; reason: string }> } | { ran: false; reason: string };
}

export interface RunnerVerifierDeps {
  /** The candidate package as files, with these bodies spliced in (Track B's `spliceBodies`). */
  candidate: (bodies: ReadonlyMap<string, string>) => FileLike[];
  /**
   * The units with their rule ids, for the engine-case mapping; `kind` names
   * the orchestrator (the unit every run of the base request goes through),
   * which a base request that threw is sent back to when no guard case names
   * a unit.
   */
  units: ReadonlyArray<{ unitId: string; rules: readonly string[]; kind?: string }>;
  /** The lints of `lib/generated-code-lints.ts`, reduced to path, line, message. */
  lint?: (files: readonly FileLike[]) => LintFinding[];
  /**
   * Run the runner checks on a candidate: propose it as a generation draft and
   * run `/api/run-tests` in verify mode. Throws when the runner cannot be reached.
   */
  runOnRunner?: (files: readonly FileLike[], signal: AbortSignal) => Promise<VerifyRunAnswer>;
  /** The file-format check of the RAP track (`abapgit-check.ts`, `packageFormatsHook`: AFF JSON and abapGit XML); absent on the Node track, which writes no ABAP object files. */
  formats?: (files: readonly FileLike[]) => { count: CheckCount; failures: CheckFailure[] };
  now?: () => number;
}

const ADAPTER_PATH = 'acceptance-adapter.json';

/** A `Verify` for the orchestrator: lints every round, the runner once per round. */
export function createRunnerVerifier(deps: RunnerVerifierDeps): Verify {
  const now = deps.now ?? (() => Date.now());
  return async (bodies, ctx): Promise<VerifyOutcome> => {
    const files = deps.candidate(bodies);
    const spans = markerSpans(files);
    const outcome: VerifyOutcome = { checks: [], failures: [], notRun: [] };

    if (deps.lint) {
      const t0 = now();
      const findings = deps.lint(files);
      outcome.checks.push({ kind: 'lint', total: findings.length, failed: findings.length, ms: now() - t0 });
      outcome.failures.push(...mapLintFindings(findings, spans));
    } else {
      outcome.notRun.push({ kind: 'lint', reason: 'no lints were given to this check' });
    }

    if (deps.formats) {
      const t0 = now();
      const f = deps.formats(files);
      outcome.checks.push({ ...f.count, ms: now() - t0 });
      outcome.failures.push(...f.failures);
    }

    const notRun = (kind: CheckKind, reason: string) => outcome.notRun.push({ kind, reason });
    if (!deps.runOnRunner) {
      notRun('cases', 'Engine cases not run: no test runner was given to this check.');
      notRun('probes', 'Failure-pattern probes not run: no test runner was given to this check.');
      return outcome;
    }
    const t0 = now();
    let answer: VerifyRunAnswer;
    try {
      answer = await deps.runOnRunner(files, ctx.signal);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      notRun('cases', `Engine cases and probes not run: the test runner is not reachable (${why}). Run them in Testing.`);
      notRun('probes', `Engine cases and probes not run: the test runner is not reachable (${why}). Run them in Testing.`);
      return outcome;
    }
    const ms = now() - t0;
    if (answer.buildError) {
      // Code that does not compile fails every case; the error names the file.
      const m = answer.buildError.match(/([\w./-]+\.(?:ts|mjs|js)):(\d+)/);
      outcome.failures.push({
        unitId: m ? unitAt(spans, m[1], Number(m[2])) : null,
        check: 'cases',
        failure: `the candidate did not compile: ${answer.buildError.slice(0, 600)}`,
      });
      outcome.checks.push({ kind: 'cases', total: 0, failed: 1, ms });
      return outcome;
    }
    if (answer.engine.ran) {
      const info = new Map(answer.engine.cases.map((c) => [c.id, c]));
      // The base request threw inside the code behind the contract (validate
      // accepted it): no case could run, and that is the written functions'
      // failure, not a mapping that does not fit. A case that needs the fills
      // counts as failed; a case of the engine's own code as not run.
      const threw = answer.engine.results.find((r) => r.cause === 'base-threw');
      const baseThrew = threw ? notRunReasonOf(threw.message).slice(0, 300) : null;
      const threwOn = new Set(answer.engine.results.filter((r) => r.cause === 'base-threw' && caseScope(info.get(r.id)) === 'fills').map((r) => r.id));
      const results = answer.engine.results.map((r): RunnerResult => {
        if (r.cause !== 'base-threw') return r;
        return caseScope(info.get(r.id)) === 'fills'
          ? { ...r, status: 'Failed', message: `the base request threw in the written functions: ${baseThrew}` }
          : { ...r, status: 'Not run', message: 'the written functions threw on the base request, so this case could not run' };
      });
      for (const scope of ['fills', 'engine-code'] as const) {
        const count = countResults(results.filter((r) => caseScope(info.get(r.id)) === scope), 'cases', scope, ms);
        if (baseThrew && scope === 'fills') count.baseThrew = baseThrew;
        outcome.checks.push(count);
      }
      // The other failures onto their rule's units; the throw once per unit it
      // can be sent back to — the units of the guard cases it stopped, else the
      // orchestrator, which every run of the base request goes through. Never
      // onto the engine: validate accepted the request, the written code threw.
      outcome.failures.push(...mapEngineFailures(results.filter((r) => !threwOn.has(r.id)), answer.engine.cases, deps.units, guardUnits(files)));
      if (baseThrew) {
        const rules = new Set([...threwOn].map((id) => info.get(id)?.ruleId).filter((r): r is string => typeof r === 'string'));
        let owners = deps.units.filter((u) => u.rules.some((r) => rules.has(r))).map((u) => u.unitId);
        if (owners.length === 0) owners = deps.units.filter((u) => u.kind === 'orchestrator').map((u) => u.unitId);
        const failure = `the base request threw in the written functions: ${baseThrew}`;
        if (owners.length === 0) outcome.failures.push({ unitId: null, check: 'cases', failure });
        else for (const unitId of owners) outcome.failures.push({ unitId, check: 'cases', failure });
      }
    } else {
      notRun('cases', answer.engine.reason);
    }
    if (answer.probes.ran) {
      const adapterFile = files.find((f) => normPath(f.path) === ADAPTER_PATH);
      let adapter: unknown = null;
      try {
        adapter = adapterFile ? JSON.parse(adapterFile.content) : null;
      } catch {
        adapter = null;
      }
      for (const scope of ['fills', 'engine-code'] as const) {
        outcome.checks.push(countResults(answer.probes.results.filter((r) => probeScope(r.id) === scope), 'probes', scope, ms));
      }
      outcome.failures.push(...mapProbeFailures(answer.probes.results, adapter, spans));
    } else {
      notRun('probes', answer.probes.reason);
    }
    return outcome;
  };
}

/**
 * The runner half over HTTP: propose the candidate as a generation draft, then
 * run it in verify mode. `post` is the caller's authenticated JSON POST.
 */
export function runnerOverHttp(
  projectId: string,
  post: (url: string, body: unknown, signal: AbortSignal) => Promise<{ status: number; body: Record<string, unknown> | null }>,
): (files: readonly FileLike[], signal: AbortSignal) => Promise<VerifyRunAnswer> {
  return async (files, signal) => {
    const generatedCode = JSON.stringify(files.map((f) => ({ path: f.path, content: f.content })));
    const proposed = await post(
      `/api/projects/${encodeURIComponent(projectId)}/repair-drafts`,
      { action: 'propose', target: { kind: 'generation' }, generatedCode, suiteCode: '' },
      signal,
    );
    const draftId = proposed.body?.draftId;
    if (proposed.status !== 200 || typeof draftId !== 'string') {
      throw new Error(String(proposed.body?.error ?? `the candidate could not be handed to the runner (HTTP ${proposed.status})`));
    }
    const ran = await post('/api/run-tests', { projectId, mode: 'verify', draftId }, signal);
    if (ran.status !== 200 || ran.body?.mode !== 'verify') {
      throw new Error(String(ran.body?.error ?? `the runner did not answer (HTTP ${ran.status})`));
    }
    return ran.body as unknown as VerifyRunAnswer;
  };
}
