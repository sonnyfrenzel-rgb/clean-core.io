/**
 * The engine-led generation, end to end, as pure steps (roadmap 3.0.12,
 * `docs/design/engine-led-transformation.md` §4, §8, §9, §12, §13; step E of
 * the build plan). The Transformation page runs them in this order:
 *
 *   1. `prepareEngineLed` — the unit plan, the scaffold and the fill requests,
 *      from the source, the track and the owner's rule decisions. Runs in a
 *      Web Worker (`scaffold.worker.ts`); never the BPMN map. A plan the
 *      engine refuses (`PlanRefusal`), or a scaffold that throws, comes back
 *      as `{ ok: false, reason }` and the page falls back to the single call.
 *   2. the lease, the fills and the checks — `orchestrator.ts` with
 *      `guardBodyOf` as its body guards and `candidateFiles` as the package
 *      the checks read;
 *   3. `assembleEngineLed` — the final splice (refused when an engine-written
 *      character moved), `traceability.json` and `TRACE.md` with who wrote
 *      each function and why one was not, the test suite, and the summary the
 *      server writes into the binding.
 *
 * Every value that crosses the worker boundary is plain data (structured
 * clone). Pure: no network, no React, no Firestore.
 */

import { deriveEngineCases } from '../testing-engine-cases';
import { LEASED_PROMPT_MAX_CHARS, bundleFills } from './fill-prompt';
import { bodyGuards, spliceBodies } from './markers';
import { buildNodeScaffold } from './scaffold-node';
import { buildRapScaffold } from './scaffold-rap';
import { sliceFor } from './abap-slice';
import { fillGuardsOf, planUnits, readEngineFacts } from './unit-plan';
import { traceJson, traceMarkdown, withTrace } from './trace';
import { checkSummaryOf } from './check-words';
import {
  PlanRefusal,
  type BodyGuardContext,
  type FillOutcome,
  type FillRequestUnit,
  type RegionBody,
  type RuleDecisionInput,
  type Scaffold,
  type ScaffoldFile,
  type Trace,
  type UnitPlan,
} from './types';
import { fillOrder, type GenerationRunResult, type UnitOutcome } from './orchestrator';
import type { PreflightInput } from './preflight';

/* ------------------------------------------------------------ preparation */

/**
 * The plan's facts for the pre-flight check (owner, 13.10.2026): the fill
 * calls of the first wave bundled exactly as the orchestrator bundles them
 * (plan order, the page's bundle options), and the calls whose prompt the
 * route would refuse.
 */
export function preflightFactsOf(prep: EngineLedPrepared, context: string): Omit<PreflightInput, 'window'> {
  const order = fillOrder(prep.plan.units);
  const byId = new Map(prep.fillUnits.map((u) => [u.unitId, u]));
  const ordered = [...order.map((id) => byId.get(id)).filter((u): u is FillRequestUnit => !!u), ...prep.fillUnits.filter((u) => !order.includes(u.unitId))];
  const bundles = bundleFills(ordered, { track: prep.scaffold.track, program: prep.plan.program, context });
  return {
    functions: prep.fillUnits.length,
    fillCalls: Math.max(1, bundles.length),
    oversize: bundles.filter((b) => b.prompt.length > LEASED_PROMPT_MAX_CHARS).map((b) => ({ unitIds: b.unitIds, chars: b.prompt.length })),
  };
}

export interface EngineLedRequest {
  source: string;
  track: 'node' | 'rap';
  /** Fallback program name when the source names none. */
  program: string | null;
  /** The owner's rule answers (`GenerationInputs.context.decisions`). */
  decisions: readonly RuleDecisionInput[];
  /** The PLATFORM KNOWLEDGE block every fill prompt carries (cut to 3,000 characters by the prompt). */
  contextText: string;
}

/** What the screen shows when the scaffold is written (§15.2 "Engine scaffold"). */
export interface ScaffoldFacts {
  units: number;
  guards: number;
  decimals: number;
  inputs: number;
  cases: number;
  fixtures: number;
  dropped: number;
  open: number;
  ms: number;
}

/** One row of the screen's Functions list: what is written where, from which lines and rules. */
export interface UnitRow {
  unitId: string;
  title: string;
  fn: string;
  kind: string;
  /** `L500–540` words, or "main path" for the orchestrator. */
  lines: string;
  rules: string[];
}

export interface EngineLedPrepared {
  ok: true;
  plan: UnitPlan;
  scaffold: Scaffold;
  fillUnits: FillRequestUnit[];
  /** Characters of each unit's ABAP slice, for the body guards' length rule. */
  sliceChars: Record<string, number>;
  /** The fill calls the first wave needs — the lease is bought for these. */
  plannedCalls: number;
  facts: ScaffoldFacts;
  rows: UnitRow[];
}

export type EngineLedPreparation = EngineLedPrepared | { ok: false; reason: string };

const lineWords = (ranges: ReadonlyArray<{ lineStart: number; lineEnd: number }>): string =>
  ranges.map((r) => (r.lineStart === r.lineEnd ? `L${r.lineStart}` : `L${r.lineStart}–${r.lineEnd}`)).join(', ');

/** The return type of a signature (`…): StepResult` → `StepResult`); empty when none is written. */
function returnsOf(signature: string): string {
  const m = signature.match(/\)\s*:\s*([^{]+?)\s*$/);
  return m ? m[1] : '';
}

/**
 * The plan, the scaffold and one fill request per function with a fill region.
 * Never throws: a refusal of the planner or an error of the scaffold is the
 * fallback's reason.
 */
export function prepareEngineLed(req: EngineLedRequest, now: () => number = () => Date.now()): EngineLedPreparation {
  const t0 = now();
  try {
    const facts = readEngineFacts(req.source);
    const plan = planUnits(req.source, { decisions: req.decisions, program: req.program }, facts);
    const cases = deriveEngineCases(facts.source, facts.ruleSet.rules);
    const scaffold = req.track === 'node' ? buildNodeScaffold(plan, facts, { cases }) : buildRapScaffold(plan, facts, { cases });
    const regionIds = new Set(scaffold.regions.map((r) => r.regionId));
    const byId = new Map(plan.units.map((u) => [u.id, u]));
    const fillUnits: FillRequestUnit[] = [];
    const sliceChars: Record<string, number> = {};
    for (const u of plan.units) {
      // A unit with no region of its own (the parent of split parts) is engine-written throughout.
      if (!regionIds.has(u.id)) continue;
      const slice = sliceFor(u, plan, facts);
      sliceChars[u.id] = Math.max(slice.chars, 1);
      const sliceUpper = slice.text.toUpperCase();
      const available = scaffold.available[u.id] ?? [];
      const callees = u.callees
        .map((id) => byId.get(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => (req.track === 'node' ? c.signature.replace(/^export\s+/, '') : c.rapName));
      const calleeNames = new Set(u.callees.map((id) => (req.track === 'node' ? byId.get(id)?.fn : byId.get(id)?.rapName)).filter(Boolean) as string[]);
      fillUnits.push({
        unitId: u.id,
        function: {
          name: req.track === 'node' ? u.fn : u.rapName,
          file: u.file,
          signature: u.signature,
          returns: returnsOf(u.signature),
        },
        abap: { ranges: slice.ranges, text: slice.text, declarations: slice.declarations, callSites: slice.callSites },
        rules: u.rules
          .map((id) => plan.rules.find((r) => r.id === id))
          .filter((r): r is NonNullable<typeof r> => !!r && r.decision !== 'drop')
          .map((r) => ({
            id: r.id,
            decision: r.decision as Exclude<typeof r.decision, 'drop'>,
            text: r.text,
            ...(r.decision === 'change' && r.proposal ? { proposal: r.proposal } : {}),
          })),
        guards: fillGuardsOf(plan, u.id),
        facts: {
          decimals: plan.decimals
            .filter((d) => sliceUpper.includes(d.name.toUpperCase()))
            .slice(0, 12)
            .map((d) => ({ name: d.name, digits: d.digits, decimals: d.decimals, type: `Dec<'${d.name.toUpperCase()}',${d.digits},${d.decimals}>` })),
        },
        available: { helpers: available.filter((n) => !calleeNames.has(n)), callees },
      });
    }
    // Predicate regions take the slice length of the unit that owns them.
    for (const r of scaffold.regions) if (!(r.regionId in sliceChars)) sliceChars[r.regionId] = sliceChars[r.unitId] ?? 2_000;
    const plannedCalls = Math.max(
      1,
      bundleFills(fillUnits, { track: req.track, program: plan.program, context: req.contextText, unitsPerCall: plan.stats.unitsPerCall }).length,
    );
    // The functions in plan order, the main path last — it is filled last (§8.3) and the mockup lists it so.
    const rows: UnitRow[] = [...plan.units.filter((u) => u.kind !== 'orchestrator'), ...plan.units.filter((u) => u.kind === 'orchestrator')]
      .filter((u) => regionIds.has(u.id))
      .map((u) => ({
        unitId: u.id,
        title: u.title,
        fn: req.track === 'node' ? u.fn : u.rapName,
        kind: u.kind,
        lines: u.kind === 'orchestrator' ? 'main path' : lineWords(u.abap),
        rules: u.rules.filter((id) => plan.rules.find((r) => r.id === id)?.decision !== 'drop'),
      }));
    return {
      ok: true,
      plan,
      scaffold,
      fillUnits,
      sliceChars,
      plannedCalls,
      rows,
      facts: {
        units: fillUnits.length,
        guards: plan.guards.filter((g) => g.carried).length,
        decimals: plan.decimals.length,
        inputs: plan.inputs.length,
        cases: cases.cases.length,
        fixtures: plan.notCarried.filter((n) => n.reason === 'fixture').length,
        dropped: plan.stats.rules.drop,
        open: plan.stats.rules.open,
        ms: Math.max(0, now() - t0),
      },
    };
  } catch (err) {
    if (err instanceof PlanRefusal) return { ok: false, reason: err.message };
    const why = err instanceof Error && err.message ? err.message : String(err);
    return { ok: false, reason: `the engine could not build a scaffold: ${why.slice(0, 300)}` };
  }
}

/* -------------------------------------------------------------- the guards */

/** The body-guard context of one fill region (§9.2) — what it may call, its slice, the guards it must call. */
export function guardContextOf(prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars'>, regionId: string, needs: readonly string[] = []): BodyGuardContext {
  const unitId = regionId.split('.')[0];
  const unit = prep.plan.units.find((u) => u.id === unitId);
  const helperOf = (id: string) => prep.plan.guards.find((g) => g.id === id)?.helper;
  return {
    track: prep.scaffold.track,
    available: prep.scaffold.available[regionId] ?? [],
    needs,
    sliceChars: prep.sliceChars[regionId] ?? prep.sliceChars[unitId] ?? 2_000,
    guardCalls: regionId === unitId ? (unit?.guardCalls ?? []).map(helperOf).filter((h): h is string => !!h) : [],
    required: prep.scaffold.required[regionId] ?? [],
  };
}

/** The orchestrator's `guardBody`: why a body may not be spliced into its region, or null. */
export function guardBodyOf(prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars'>) {
  return (regionId: string, body: string, needs: readonly string[]): string | null => {
    const reasons = bodyGuards(body, guardContextOf(prep, regionId, needs));
    return reasons.length === 0 ? null : reasons.map((r) => r.message).join('; ');
  };
}

/** The candidate package with these bodies (by region) spliced in — what the checks read. */
export function candidateFiles(prep: Pick<EngineLedPrepared, 'scaffold'>, bodies: ReadonlyMap<string, string>): ScaffoldFile[] {
  const result = spliceBodies(prep.scaffold, [...bodies].map(([regionId, body]) => ({ regionId, body })), () => null);
  return result.ok ? result.files : prep.scaffold.files;
}

/* -------------------------------------------------------------- assembly */

/**
 * One check as the binding, STATUS.md and TRACE.md carry it. `passed`,
 * `notRun` and `scope` since the honest count (step E): a not-run result is
 * never counted as run, and a check of engine-written code is kept apart from
 * a check of the written functions (`lib/transformation/check-words.ts`).
 */
export interface CheckSummary {
  kind: 'guards' | 'lint' | 'cases' | 'probes' | 'formats';
  total: number;
  failed: number;
  passed?: number;
  notRun?: number;
  scope?: 'engine-code' | 'fills';
  notRunReason?: string | null;
  baseThrew?: string | null;
}


/** What the server writes into the binding of an engine-led generation (§12.2), and STATUS.md reads. */
export interface EngineLedSummary {
  /** `complete`: every function written; `partial`: at least one left as a stub (Q4). Failing checks are findings either way. */
  status: 'complete' | 'partial';
  units: number;
  written: number;
  repaired: number;
  notWritten: Array<{ unitId: string; title: string; reason: string }>;
  /** Functions written whose checks still fail (kept as a reviewable draft). */
  failing: Array<{ unitId: string; title: string; failure: string }>;
  checks: CheckSummary[];
  notRun: Array<{ kind: string; reason: string }>;
  scaffoldFindings: string[];
  callsUsed: number;
  budget: number;
  rounds: number;
  stop: GenerationRunResult['stop'];
  scaffoldVersion: number;
  scaffoldDigest: string;
  planDigest: string;
}

export interface EngineLedPackage {
  files: Array<{ path: string; content: string }>;
  trace: Trace;
  suite: { config: string; spec: string };
  summary: EngineLedSummary;
}

const NODE_SUITE_CONFIG = 'node:test — `npm test` runs test/engine-cases.test.mjs through the call contract (srv/engine-contract.ts).';

function fillOutcomesOf(prep: Pick<EngineLedPrepared, 'scaffold'>, result: GenerationRunResult, applied: ReadonlySet<string>): FillOutcome[] {
  const byUnit = new Map(result.units.map((u) => [u.unitId, u]));
  return prep.scaffold.regions.map((r) => {
    const u = byUnit.get(r.unitId);
    if (applied.has(r.regionId) && u && u.filledBy !== 'not-filled') return { regionId: r.regionId, state: u.filledBy };
    if (!u) return { regionId: r.regionId, state: 'not-sent' as const };
    if (u.reason?.startsWith('the model declined') || u.reason?.includes('refused by the checks')) return { regionId: r.regionId, state: 'refused' as const };
    if (u.reason?.includes('unusable') || u.reason?.includes('did not include')) return { regionId: r.regionId, state: 'unusable' as const };
    return { regionId: r.regionId, state: 'not-sent' as const };
  });
}

/**
 * The package to store: the final splice, the trace with each function's
 * writer and checks, the test suite and the binding's summary. Throws when the
 * splice is refused — an engine-written character moved — and nothing may be
 * stored (§16.1).
 */
export function assembleEngineLed(
  prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars' | 'rows'>,
  result: GenerationRunResult,
  options: { contextDigest?: string | null; runId?: string | null; checks: CheckSummary[]; budget: number },
): EngineLedPackage {
  const bodies: RegionBody[] = [];
  for (const u of result.units) {
    if (u.state !== 'written' || u.body === null) continue;
    bodies.push({ regionId: u.unitId, body: u.body });
    for (const [regionId, body] of Object.entries(u.predicates ?? {})) bodies.push({ regionId, body });
  }
  const splice = spliceBodies(prep.scaffold, bodies, (regionId) => guardContextOf(prep, regionId));
  if (!splice.ok) throw new Error(`The generated package was refused before saving: ${splice.reason ?? 'the splice failed'}. Nothing was saved — try the generation again.`);
  const applied = new Set(splice.applied);
  // A body the final splice refused is a stub after all — say so on the unit.
  const refusedNow = new Map(splice.refused.map((r) => [r.regionId, r.reasons.map((x) => x.message).join('; ')]));
  const outcomes = fillOutcomesOf(prep, result, applied);
  const { files, trace } = withTrace(prep.plan, prep.scaffold, splice.files, outcomes, { contextDigest: options.contextDigest ?? null, runId: options.runId ?? null });

  const title = (id: string) => prep.rows.find((r) => r.unitId === id)?.title ?? id;
  const byUnit = new Map(result.units.map((u) => [u.unitId, u]));
  const notWritten: EngineLedSummary['notWritten'] = [];
  const failing: EngineLedSummary['failing'] = [];
  for (const t of trace.units) {
    const u = byUnit.get(t.unitId);
    if (!u) continue;
    const kinds = (k: string) => u.failures.filter((f) => f.startsWith(`${k}:`)).length;
    t.checks = { lint: kinds('lint'), cases: kinds('cases'), probes: kinds('probes') };
    const refused = refusedNow.get(t.unitId);
    if (u.state !== 'written' || refused) {
      const reason = refused ? `the body was refused by the checks on fills: ${refused}` : (u.reason ?? 'not written');
      notWritten.push({ unitId: t.unitId, title: title(t.unitId), reason });
      t.note = reason;
    } else if (u.failures.length > 0) {
      failing.push({ unitId: t.unitId, title: title(t.unitId), failure: u.failures[0] });
      t.note = `checks still failing: ${u.failures[0]}`;
    }
  }
  const summary: EngineLedSummary = {
    // Partial is a function left as a stub (owner, Q4); a check that still fails on a written body is a finding.
    status: notWritten.length === 0 ? 'complete' : 'partial',
    units: result.units.length,
    written: result.units.filter((u) => u.state === 'written').length - refusedNow.size,
    repaired: result.units.filter((u) => u.state === 'written' && u.filledBy !== 'model' && u.filledBy !== 'not-filled').length,
    notWritten,
    failing,
    checks: options.checks.map(checkSummaryOf),
    notRun: result.checksNotRun.map((n) => ({ kind: n.kind, reason: n.reason })),
    scaffoldFindings: result.scaffoldFindings,
    callsUsed: result.callsUsed,
    budget: options.budget,
    rounds: result.rounds,
    stop: result.stop,
    scaffoldVersion: prep.scaffold.version,
    scaffoldDigest: prep.scaffold.digest,
    planDigest: prep.plan.digest,
  };
  trace.generation = summaryForTrace(summary);
  const out = files.map((f) =>
    f.path === 'traceability.json' ? { path: f.path, content: traceJson(trace) } : f.path === 'TRACE.md' ? { path: f.path, content: traceMarkdown(trace) } : { path: f.path, content: f.content },
  );
  const suiteFile =
    prep.scaffold.track === 'node'
      ? out.find((f) => f.path === 'test/engine-cases.test.mjs')
      : out.find((f) => f.path.endsWith('.clas.testclasses.abap'));
  const suite = {
    config: prep.scaffold.track === 'node' ? NODE_SUITE_CONFIG : '',
    spec: suiteFile?.content ?? '',
  };
  return { files: out, trace, suite, summary };
}

function summaryForTrace(s: EngineLedSummary): NonNullable<Trace['generation']> {
  return {
    status: s.status,
    written: s.written,
    repaired: s.repaired,
    units: s.units,
    notWritten: s.notWritten.map((n) => ({ unitId: n.unitId, reason: n.reason })),
    checks: s.checks.map(checkSummaryOf),
    notRun: s.notRun,
    scaffoldFindings: s.scaffoldFindings,
    callsUsed: s.callsUsed,
    rounds: s.rounds,
  };
}

/** The unit outcomes a cancelled or failed run leaves, for a caller that needs the shape without a run. */
export type { UnitOutcome };
