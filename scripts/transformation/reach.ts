/**
 * Reach of the engine-led checks (owner, 13.10.2026): which of the functions
 * the model writes do the engine cases and the failure-pattern probes actually
 * test? Shared by `measure-reach.ts` (the numbers) and the server-free specs.
 *
 * A fill region (a step body `U02`, or a guard predicate `U02.G0061`) is
 * REACHED when a check's outcome depends on it, proved by mutation: the region
 * alone is replaced by a mutant and every engine case and probe runs again; a
 * case or probe whose verdict differs from the unmutated run reaches it. Two
 * mutants per region:
 *
 *   - `throw` — the body throws an ordinary Error. A change proves the region
 *     runs on the path of a check that ran (often only through the base
 *     request, the positive control every case starts from);
 *   - `wrong` — the body answers wrongly without throwing: a step does
 *     nothing (`return;`), a predicate answers the opposite of what it
 *     answered before. A change proves a check tells a wrong answer from a
 *     right one — the stronger claim, `value` reach.
 *
 * REACH counts a region reached by either mutant (the owner's definition);
 * `value` counts the second alone. A verdict is compared by its status, the
 * cause of a Not run and the statuses of its examples — never by evidence
 * text, which carries run ids.
 *
 * Runs the engine pass and the probe pass in the local sandbox exactly as the
 * verify route does (`verifyCandidateResponse`: the cases the route derives
 * from the source, `planEngineRun`, `engineRunInputs`, `probeRunInputs`),
 * unconfined by the OS sandbox (`allowUnsandboxed`) but inside SES as on the
 * runner. No network, no model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { prepareEngineLed, candidateFiles, type EngineLedPrepared } from '../../lib/transformation/engine-led';
import { engineCaseScope } from '../../lib/transformation/call-contract';
import { deriveEngineCasesOf, engineCaseProvenance } from '../../lib/engine-case-provenance';
import { planEngineRun } from '../../lib/engine-case-run';
import { ENGINE_OUTCOME_MARKER, judgeEngineCase } from '../acceptance/child/engine-cases-core.mjs';
import { engineRunInputs } from '../../lib/test-sandbox/engine-suite';
import { probeRunInputs, probeVerdicts } from '../../lib/test-sandbox/probe-suite';
import { executeSandboxRun } from '../../lib/test-sandbox/core';
import { geminiTestStubFillText } from '../../lib/gemini-test-stub';

export type Bodies = ReadonlyMap<string, string>;

export interface CaseOutcome {
  id: string;
  scope: 'engine-code' | 'fills';
  status: 'Passed' | 'Failed' | 'Not run';
  /** status, cause and example statuses: what a mutant must change to count. */
  signature: string;
  reason: string | null;
}

export interface ProbeOutcome {
  id: string;
  status: 'Passed' | 'Failed' | 'Skipped';
  signature: string;
  message: string | null;
}

export interface ChecksRun {
  cases: CaseOutcome[];
  /** Why no case ran at all, or null. */
  casesNotRun: string | null;
  probes: ProbeOutcome[];
  probesSkipped: Array<{ probe: string; reason: string }>;
  probesNotRun: string | null;
}

export function prepared(source: string): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (reach)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

/** The stub fills, as the Gemini test stub answers the fill prompt (every unit, every predicate). */
export function stubBodies(prep: EngineLedPrepared): Map<string, string> {
  const text = geminiTestStubFillText(`REQUEST (JSON):\n${JSON.stringify({ track: 'node', units: prep.fillUnits })}`);
  const answer = JSON.parse(text) as { units: Array<{ unitId: string; body: string; guards?: Array<{ id: string; body: string }> }> };
  const bodies = new Map<string, string>();
  for (const u of answer.units) {
    bodies.set(u.unitId, u.body);
    const unit = prep.fillUnits.find((f) => f.unitId === u.unitId);
    for (const g of u.guards ?? []) {
      const regionId = unit?.guards.find((x) => x.id === g.id)?.regionId;
      if (regionId) bodies.set(regionId, g.body);
    }
  }
  return bodies;
}

/** Hand-written reference fills (tests/fixtures/transformation/reference-fills/<name>.json): what a correct model answer would be. */
export function referenceBodies(file: string, prep: EngineLedPrepared): Map<string, string> {
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { bodies: Record<string, string | string[]> };
  const regions = new Set(prep.scaffold.regions.map((r) => r.regionId));
  const bodies = new Map<string, string>();
  for (const [id, body] of Object.entries(json.bodies)) {
    if (!regions.has(id)) throw new Error(`${path.basename(file)}: no fill region ${id} in the scaffold`);
    bodies.set(id, Array.isArray(body) ? body.join('\n') : body);
  }
  return bodies;
}

interface Judged {
  id: string;
  status: string;
  reason?: string;
  cause?: string;
  examples: Array<{ input: string; status: string; evidence: string }>;
}

/** Every case of the cases JSON judged from the engine pass's outcome lines (as `engineVerdicts`, keeping the examples). */
function judged(stdout: string, casesJson: string): Judged[] {
  const cases = (JSON.parse(casesJson) as { cases: Array<{ id: string }> }).cases;
  const reported = new Map<string, unknown>();
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.startsWith(ENGINE_OUTCOME_MARKER)) continue;
    const entry = JSON.parse(line.slice(ENGINE_OUTCOME_MARKER.length)) as { id: string; collected: unknown };
    reported.set(entry.id, entry.collected);
  }
  return cases.map((kase) =>
    reported.has(kase.id)
      ? ({ id: kase.id, ...(judgeEngineCase(kase, reported.get(kase.id)) as Omit<Judged, 'id'>) })
      : { id: kase.id, status: 'Not run', reason: 'no outcome reported', examples: [] },
  );
}

/** Run the engine pass and the probe pass on the candidate with these bodies. */
export async function runChecks(prep: EngineLedPrepared, source: string, bodies: Bodies): Promise<ChecksRun> {
  const files = candidateFiles(prep, bodies);
  const out: ChecksRun = { cases: [], casesNotRun: null, probes: [], probesSkipped: [], probesNotRun: null };

  const derivation = deriveEngineCasesOf(source);
  if (!derivation) out.casesNotRun = 'no derivation';
  else {
    const verified = engineCaseProvenance(derivation.cases as unknown as Array<Record<string, unknown>>, derivation).verified;
    const fills = new Set(engineCaseScope(verified).logic);
    const plan = planEngineRun(verified, files, null);
    if (plan.kind !== 'planned') out.casesNotRun = `no engine plan: ${plan.kind}`;
    else {
      const inputs = engineRunInputs(files, plan.plan.cases, plan.plan.contractModule);
      const eng = await executeSandboxRun({ files: inputs.files, suiteCode: inputs.suiteCode, patterns: [], allowUnsandboxed: true, engine: inputs.engine });
      if (eng.kind !== 'ran') out.casesNotRun = `engine pass: ${eng.kind}${'message' in eng ? ` ${String(eng.message).slice(0, 200)}` : ''}`;
      else {
        out.cases = judged(eng.stdout, plan.plan.cases).map((r) => {
          const status = (r.status === 'Passed' || r.status === 'Failed' ? r.status : 'Not run') as CaseOutcome['status'];
          return {
            id: r.id,
            scope: fills.has(r.id) ? 'fills' : 'engine-code',
            status,
            signature: `${status}|${r.cause ?? ''}|${r.examples.map((e) => e.status).join(',')}|${status === 'Not run' ? notRunKind(r.reason ?? '') : ''}`,
            reason: r.reason ?? (status === 'Failed' ? r.examples.filter((e) => e.status === 'fail').map((e) => e.evidence).join(' | ') : null),
          };
        });
      }
    }
  }

  const probe = probeRunInputs(files);
  if (!probe.ok) out.probesNotRun = probe.reason;
  else {
    out.probesSkipped = probe.skipped;
    const run = await executeSandboxRun({ files: probe.files, suiteCode: probe.suiteCode, patterns: [], allowUnsandboxed: true, probe: probe.probe });
    if (run.kind !== 'ran') out.probesNotRun = `probe pass: ${run.kind}`;
    else
      out.probes = probeVerdicts(run.stdout, probe.probes).map((p) => ({
        id: p.id,
        status: p.status,
        signature: `${p.status}|${p.status === 'Skipped' ? notRunKind(p.message ?? '') : ''}`,
        message: p.message ?? null,
      }));
  }
  return out;
}

/** The kind of a Not run reason without its run-specific text (ids, values). */
function notRunKind(reason: string): string {
  if (/no valid base value/.test(reason)) return 'missing-base';
  if (/threw on the accepted baseRequest/.test(reason)) return 'base-threw';
  if (/refused by simulate/.test(reason)) return 'base-refused';
  if (/maps no request field|marks .* as internal/.test(reason)) return 'no-field';
  if (/ran in part/.test(reason)) return 'in-part';
  return reason.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').slice(0, 80);
}

/* ------------------------------------------------------------------ mutants */

export type MutantKind = 'throw' | 'wrong';

/** The mutant body of a region: see the file comment. `baseline` is the region's body in the measured variant. */
export function mutantBody(kind: MutantKind, isPredicate: boolean, baseline: string): string {
  if (kind === 'throw') return "throw new Error('cc-reach-mutant');";
  if (!isPredicate) return 'return;';
  return `const __ccAnswer = ((): boolean => {\n${baseline}\n})();\nreturn !__ccAnswer;`;
}

export interface RegionReach {
  regionId: string;
  predicate: boolean;
  /** Checks whose verdict changed under the throwing mutant. */
  throwBy: string[];
  /** Checks whose verdict changed under the wrong-answer mutant. */
  wrongBy: string[];
}

export interface ReachResult {
  label: string;
  variant: string;
  regions: number;
  units: number;
  predicates: number;
  baseline: ChecksRun;
  perRegion: RegionReach[];
  reached: number;
  valueReached: number;
}

function changed(a: ChecksRun, b: ChecksRun): string[] {
  const out: string[] = [];
  const am = new Map(a.cases.map((c) => [c.id, c.signature]));
  const bm = new Map(b.cases.map((c) => [c.id, c.signature]));
  for (const id of new Set([...am.keys(), ...bm.keys()])) if (am.get(id) !== bm.get(id)) out.push(id);
  const ap = new Map(a.probes.map((c) => [c.id, c.signature]));
  const bp = new Map(b.probes.map((c) => [c.id, c.signature]));
  for (const id of new Set([...ap.keys(), ...bp.keys()])) if (ap.get(id) !== bp.get(id)) out.push(id);
  if ((a.casesNotRun ?? '') !== (b.casesNotRun ?? '')) out.push('engine-pass');
  return out;
}

async function pool<T, R>(items: readonly T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Measure the reach of one variant of fills on one source. */
export async function measureReach(label: string, source: string, variant: string, bodies: Bodies, opts: { concurrency?: number; prep?: EngineLedPrepared } = {}): Promise<ReachResult> {
  const prep = opts.prep ?? prepared(source);
  const baseline = await runChecks(prep, source, bodies);
  const regions = prep.scaffold.regions;
  const jobs = regions.flatMap((r) => (['throw', 'wrong'] as const).map((kind) => ({ r, kind })));
  const results = await pool(jobs, opts.concurrency ?? 4, async ({ r, kind }) => {
    const base = bodies.get(r.regionId) ?? r.stub;
    const m = new Map(bodies);
    m.set(r.regionId, mutantBody(kind, r.guard !== null, base));
    return { regionId: r.regionId, kind, by: changed(baseline, await runChecks(prep, source, m)) };
  });
  const perRegion: RegionReach[] = regions.map((r) => ({
    regionId: r.regionId,
    predicate: r.guard !== null,
    throwBy: results.find((x) => x.regionId === r.regionId && x.kind === 'throw')!.by,
    wrongBy: results.find((x) => x.regionId === r.regionId && x.kind === 'wrong')!.by,
  }));
  return {
    label,
    variant,
    regions: regions.length,
    units: regions.filter((r) => r.guard === null).length,
    predicates: regions.filter((r) => r.guard !== null).length,
    baseline,
    perRegion,
    reached: perRegion.filter((p) => p.throwBy.length > 0 || p.wrongBy.length > 0).length,
    valueReached: perRegion.filter((p) => p.wrongBy.length > 0).length,
  };
}

/** Cases by scope × outcome, as the honest count words them. */
export function caseTable(run: ChecksRun): Record<'fills' | 'engine-code', { passed: number; failed: number; notRun: number }> {
  const t = { fills: { passed: 0, failed: 0, notRun: 0 }, 'engine-code': { passed: 0, failed: 0, notRun: 0 } };
  for (const c of run.cases) {
    const row = t[c.scope];
    if (c.status === 'Passed') row.passed++;
    else if (c.status === 'Failed') row.failed++;
    else row.notRun++;
  }
  return t;
}
