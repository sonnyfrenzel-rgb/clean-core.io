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

import type { CheckFailure, CheckKind, Verify, VerifyOutcome } from './orchestrator';

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
}

/**
 * Failing engine cases onto the units that carry their rule. One failure per
 * case per unit; a case no unit owns is one failure with `unitId: null`.
 */
export function mapEngineFailures(
  results: readonly RunnerResult[],
  cases: ReadonlyArray<{ id: string; ruleId?: string | null }>,
  units: ReadonlyArray<{ unitId: string; rules: readonly string[] }>,
): CheckFailure[] {
  const ruleOf = new Map(cases.map((c) => [c.id, c.ruleId ?? null]));
  const out: CheckFailure[] = [];
  for (const r of results) {
    if (r.status !== 'Failed') continue;
    const rule = ruleOf.get(r.id) ?? null;
    const failure = `${r.id}${rule ? ` (${rule})` : ''} failed through the call contract${r.message ? `: ${r.message}` : ''}`;
    const owners = rule ? units.filter((u) => u.rules.includes(rule)).map((u) => u.unitId) : [];
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
  engine: { ran: true; results: RunnerResult[]; cases: Array<{ id: string; ruleId: string | null }> } | { ran: false; reason: string };
  probes: { ran: true; results: RunnerResult[]; skipped: Array<{ probe: string; reason: string }> } | { ran: false; reason: string };
}

export interface RunnerVerifierDeps {
  /** The candidate package as files, with these bodies spliced in (Track B's `spliceBodies`). */
  candidate: (bodies: ReadonlyMap<string, string>) => FileLike[];
  /** The units with their rule ids, for the engine-case mapping. */
  units: ReadonlyArray<{ unitId: string; rules: readonly string[] }>;
  /** The lints of `lib/generated-code-lints.ts`, reduced to path, line, message. */
  lint?: (files: readonly FileLike[]) => LintFinding[];
  /**
   * Run the runner checks on a candidate: propose it as a generation draft and
   * run `/api/run-tests` in verify mode. Throws when the runner cannot be reached.
   */
  runOnRunner?: (files: readonly FileLike[], signal: AbortSignal) => Promise<VerifyRunAnswer>;
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
      const failures = mapEngineFailures(answer.engine.results, answer.engine.cases, deps.units);
      outcome.checks.push({ kind: 'cases', total: answer.engine.results.length, failed: answer.engine.results.filter((r) => r.status === 'Failed').length, ms });
      outcome.failures.push(...failures);
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
      outcome.checks.push({ kind: 'probes', total: answer.probes.results.length, failed: answer.probes.results.filter((r) => r.status === 'Failed').length, ms });
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
