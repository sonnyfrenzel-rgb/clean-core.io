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
import { bodyGuards, FINAL_PERIOD_NOTE, markForeignLineRefs, repairFinalPeriod, spliceBodies } from './markers';
import { buildNodeScaffold } from './scaffold-node';
import { buildRapScaffold } from './scaffold-rap';
import type { AgainstDecision } from './decision-header';
import { checkSapReferences, sapIdStateWord } from '../sap-reference-check';
import { sliceFor } from './abap-slice';
import { fillGuardsOf, planUnits, readEngineFacts, type PlanInput } from './unit-plan';
import { camelName } from './naming';
import { parameterShapes, regionSignature, typeDeclarations, typesText, type TypeDeclaration } from './type-shapes';
import { traceJson, traceMarkdown, withTrace } from './trace';
import { checkSummaryOf, type AbapActivation, type NodeTypeCheck } from './check-words';
import {
  PlanRefusal,
  type BodyGuardContext,
  type FillOutcome,
  type FillRequestUnit,
  type GenerationStatus,
  type RegionBody,
  type RuleDecisionInput,
  type Scaffold,
  type ScaffoldFile,
  type Trace,
  type UnitPlan,
} from './types';
import { fillOrder, type GenerationRunResult, type UnitOutcome } from './orchestrator';
import type { PreflightInput } from './preflight';
import { secretInBody } from '../sensitive-text';

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
    // The plan's reason where it could not split a function small enough (3.0.17: one statement, or the main path).
    oversize: bundles
      .filter((b) => b.prompt.length > LEASED_PROMPT_MAX_CHARS)
      .map((b) => {
        const reason = b.unitIds.map((id) => prep.plan.units.find((u) => u.id === id)?.promptOverCap?.reason).find(Boolean);
        return { unitIds: b.unitIds, chars: b.prompt.length, ...(reason ? { reason } : {}) };
      }),
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
  /** The live decision on record this rebuild contradicts (`againstDecisionOf`); every main file then says so first (B6). */
  against?: AgainstDecision | null;
  /**
   * Scaffold 20 (roadmap 3.0.19): a program that splits — the lines a key user configures (`PlanInput.keyUser`).
   * The routines inside them get no function and no fill request, so no model call.
   */
  keyUser?: PlanInput['keyUser'];
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
    const plan = planUnits(req.source, { decisions: req.decisions, program: req.program, keyUser: req.keyUser ?? null }, facts);
    const cases = deriveEngineCases(facts.source, facts.ruleSet.rules);
    const against = req.against ?? null;
    const scaffold = req.track === 'node' ? buildNodeScaffold(plan, facts, { cases, against }) : buildRapScaffold(plan, facts, { cases, against });
    const regionIds = new Set(scaffold.regions.map((r) => r.regionId));
    const wired = new Set(Object.values(scaffold.authority ?? {}).flatMap((es) => es.flatMap((e) => (e.wired ? [e.wired.guard] : []))));
    const byId = new Map(plan.units.map((u) => [u.id, u]));
    const fillUnits: FillRequestUnit[] = [];
    const sliceChars: Record<string, number> = {};
    const decls = req.track === 'node' ? declarationsOf(scaffold) : null;
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
          // RAP (scaffold version 6): the method's own ABAP signature, not the Node one.
          signature: scaffold.rap?.signatures[u.id] ?? u.signature,
          returns: scaffold.rap ? '' : returnsOf(u.signature),
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
        // A predicate the engine wrote has no region: the model is not asked for it.
        guards: fillGuardsOf(plan, u.id)
          .map((g) => (g.regionId && !regionIds.has(g.regionId) ? { ...g, regionId: null } : g))
          // Node: the keys of `values` as the package declares them (`G0036Values` also holds the routine's parameters a check reads).
          .map((g) => (decls ? { ...g, values: decls.get(`${g.id.replace('-', '')}Values`)?.fields ?? [] } : g))
          // Node: the ABAP type of each value a predicate the model writes reads.
          .map((g) => (g.regionId && scaffold.predicateTypes?.[g.id] ? { ...g, declared: scaffold.predicateTypes[g.id] } : g))
          // A check on sy-subrc the frame runs with its AUTHORITY-CHECK: the stub calls it.
          .map((g) => (wired.has(g.id) ? { ...g, placement: 'entry' as const } : g)),
        facts: {
          decimals: plan.decimals
            .filter((d) => sliceUpper.includes(d.name.toUpperCase()))
            .slice(0, 12)
            .map((d) => ({ name: d.name, digits: d.digits, decimals: d.decimals, type: `Dec<'${d.name.toUpperCase()}',${d.digits},${d.decimals}>` })),
        },
        available: { helpers: available.filter((n) => !calleeNames.has(n)), callees },
        // The original's AUTHORITY-CHECKs in these lines (Node, scaffold version 15): the function the engine wrote
        // for each, or the exact call — the model never decides an authorization (`authority-node.ts`).
        ...(scaffold.authority?.[u.id]?.length ? { authority: scaffold.authority[u.id].map((e) => ({ line: e.line, fn: e.fn, call: e.call, ...(e.wired ? { wired: e.wired } : {}) })) } : {}),
        // The original's SELECTs in these lines (Node, scaffold version 15): answered from the request's lookup lists
        // by srv/lib/lookups.ts — the function the frame holds, or the exact call (`lookups-node.ts`).
        ...(scaffold.lookups?.[u.id]?.length
          ? { lookups: scaffold.lookups[u.id].map((e) => ({ line: e.line, table: e.table, list: e.list, fn: e.fn, call: e.call, returns: e.returns, ...(e.open ? { open: e.open } : {}) })) }
          : {}),
        // The fields of every type the signature and the callees' signatures name (defect D, 13.10.2026).
        // Of the original's globals (`Locals`), only those this function's ABAP names (3.0.13, A3).
        // RAP since scaffold version 6: the logic class around the body (scaffold-rap.ts).
        ...(decls
          ? {
              types: [
                // A split part (3.0.20): the frame declares the parent routine's locals these lines read or write.
                ...(scaffold.partLocals?.[u.id]?.length
                  ? [`// The parent routine's locals these lines read or write are declared by the frame before your body, typed as the original declares them, and written back after it: ${scaffold.partLocals[u.id].join(', ')}. Use them under these names; never declare them.`]
                  : []),
                typesText(decls, [u.signature, ...callees], ['Dec'], { Locals: localsNamedIn(`${slice.text}\n${slice.declarations}`) }),
              ].join('\n'),
            }
          : scaffold.rap?.unitTypes[u.id]
            ? { types: scaffold.rap.unitTypes[u.id] }
            : {}),
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

/** The property names (`gtClaims`) of every ABAP name an ABAP text mentions — `Locals` keeps those it declares. */
export function localsNamedIn(abap: string): Set<string> {
  const out = new Set<string>();
  for (const m of abap.matchAll(/[A-Za-z_][\w/]*/g)) out.add(camelName(m[0].toLowerCase()));
  return out;
}

/* -------------------------------------------------------------- the guards */

const declarationCache = new WeakMap<Pick<Scaffold, 'files'>, Map<string, TypeDeclaration>>();
/** The scaffold's own type declarations (`type-shapes.ts`), read once per scaffold. */
function declarationsOf(scaffold: Pick<Scaffold, 'files'>): Map<string, TypeDeclaration> {
  let d = declarationCache.get(scaffold);
  if (!d) {
    d = typeDeclarations(scaffold.files);
    declarationCache.set(scaffold, d);
  }
  return d;
}

/** The body-guard context of one fill region (§9.2) — what it may call, its slice, the guards it must call. */
export function guardContextOf(prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars'>, regionId: string, needs: readonly string[] = []): BodyGuardContext {
  const unitId = regionId.split('.')[0];
  const unit = prep.plan.units.find((u) => u.id === unitId);
  const helperOf = (id: string) => prep.plan.guards.find((g) => g.id === id)?.helper;
  // A derived check's predicate reads the values the body hands in (`scaffold-node.ts` `guardsFile`).
  const predicateOf = prep.plan.guards.find((g) => g.regionId === regionId && regionId !== unitId);
  // Since scaffold version 7 every Node predicate has `values` (`{}` when its check reads none).
  const params = predicateOf && (prep.scaffold.track === 'node' || (predicateOf.basis === 'derived' && predicateOf.operands.length > 0)) ? ['values'] : [];
  // The fields of the region's parameters, read from the package the body lands in (defect D).
  const signature = prep.scaffold.track === 'node' ? regionSignature(prep.scaffold.files, regionId) : null;
  const shapes = signature ? parameterShapes(declarationsOf(prep.scaffold), signature) : {};
  return {
    track: prep.scaffold.track,
    available: prep.scaffold.available[regionId] ?? [],
    needs,
    sliceChars: prep.sliceChars[regionId] ?? prep.sliceChars[unitId] ?? 2_000,
    guardCalls: regionId === unitId ? (unit?.guardCalls ?? []).map(helperOf).filter((h): h is string => !!h) : [],
    required: prep.scaffold.required[regionId] ?? [],
    // The original's AUTHORITY-CHECKs in the region's lines: called and used, or the body is refused.
    ...(prep.scaffold.authority?.[regionId]?.length ? { authority: prep.scaffold.authority[regionId] } : {}),
    ...(params.length > 0 ? { params } : {}),
    ...(Object.keys(shapes).length > 0 ? { shapes } : {}),
    ...(prep.scaffold.rap?.regions[regionId] ? { abap: prep.scaffold.rap.regions[regionId] } : {}),
    // A split part's handed-over locals (3.0.20): declared by the frame, never again by the body.
    ...(regionId === unitId && prep.scaffold.partLocals?.[regionId]?.length ? { partLocals: prep.scaffold.partLocals[regionId] } : {}),
  };
}

/** The orchestrator's `guardBody`: why a body may not be spliced into its region, or null. */
export function guardBodyOf(prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars'>) {
  return (regionId: string, body: string, needs: readonly string[]): string | null => {
    const reasons = [...bodyGuards(body, guardContextOf(prep, regionId, needs)).map((r) => r.message), secretInBody(body)].filter((r): r is string => !!r);
    return reasons.length === 0 ? null : reasons.join('; ');
  };
}

/**
 * The lines a fill region was given (3.0.13, B5): its ABAP slice and ranges, the declarations and call sites
 * the slice carries, and the lines of its guards — a body's comment may cite these and no others.
 */
export function givenLinesOf(prep: Pick<EngineLedPrepared, 'fillUnits'>, regionId: string): Set<number> {
  const u = prep.fillUnits.find((x) => x.unitId === regionId.split('.')[0]);
  const out = new Set<number>();
  if (!u) return out;
  for (const r of u.abap.ranges) for (let n = r.lineStart; n <= r.lineEnd && n - r.lineStart < 5_000; n++) out.add(n);
  for (const text of [u.abap.text, u.abap.declarations ?? '']) for (const m of text.matchAll(/^\s*(\d{1,5})\s/gm)) out.add(Number(m[1]));
  for (const c of u.abap.callSites ?? []) out.add(c.line);
  for (const g of u.guards ?? []) {
    const line = (g as { line?: unknown }).line;
    if (typeof line === 'number') out.add(line);
  }
  return out;
}

/**
 * The orchestrator's `repairBody` (3.0.17 criterion 3): an ABAP body whose only refusal is a missing final period gets
 * it, and passes only if the same checks then accept it (`repairFinalPeriod`). The Node route repairs nothing.
 */
export function repairBodyOf(prep: Pick<EngineLedPrepared, 'plan' | 'scaffold' | 'sliceChars'>) {
  return (regionId: string, body: string, needs: readonly string[]): { body: string; note: string } | null => {
    if (prep.scaffold.track !== 'rap') return null;
    const ctx = guardContextOf(prep, regionId, needs);
    const repaired = repairFinalPeriod(body, (b) => bodyGuards(b, ctx));
    return repaired === null ? null : { body: repaired, note: FINAL_PERIOD_NOTE };
  };
}

/** The orchestrator's `normalizeBody`: line references a body's comments make outside its given lines, marked (B5). */
export function normalizeBodyOf(prep: Pick<EngineLedPrepared, 'fillUnits' | 'scaffold'>) {
  const cache = new Map<string, Set<number>>();
  return (regionId: string, body: string): string => {
    const key = regionId.split('.')[0];
    if (!cache.has(key)) cache.set(key, givenLinesOf(prep, regionId));
    return markForeignLineRefs(body, prep.scaffold.track, cache.get(key)!).body;
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
  kind: 'guards' | 'lint' | 'cases' | 'probes' | 'formats' | 'abap' | 'types';
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
  /**
   * `complete`: every function written; `partial`: at least one left as a stub (Q4). Failing checks are findings
   * either way — except, on the ABAP route since 3.0.13, abaplint's parser and syntax errors: with one left after
   * the last round the package is `not-activatable` (the server checks again when it stores, `withAbaplint`).
   */
  status: GenerationStatus;
  /** Node route (3.0.13): what of the type check, engine cases and probes did not run — why it is `not-verified`. */
  unverified?: string[];
  /**
   * SAP identifiers the written bodies name that are not verified against SAP's sources, or contradict them
   * (3.0.13, B4: `lib/sap-reference-check.ts` over the model-written text) — with the function that names them.
   */
  sapIds?: Array<{ unitId: string; id: string; state: string; sapName: string | null }>;
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
  /** The calls held for gate repairs beyond `budget`, and how many were spent (owner decision 14.10.2026). */
  gateRepairBudget?: number;
  gateRepairCallsUsed?: number;
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
  options: {
    contextDigest?: string | null;
    runId?: string | null;
    checks: CheckSummary[];
    budget: number;
    /** The lease's calls held for gate repairs (owner decision 14.10.2026); 0 or absent: none. */
    gateRepairBudget?: number;
    /** The activation check of the last round (ABAP route, 3.0.13); absent or null when it did not run. */
    activation?: AbapActivation | null;
    /** The type check of the last round (Node route, 3.0.13); null when it did not run. */
    typeCheck?: NodeTypeCheck | null;
  },
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
    // A mechanical repair of the engine on an accepted body (a missing final period) is said, never hidden.
    if (!refused && u.state === 'written' && u.repairs?.length) t.note = [t.note, ...u.repairs].filter(Boolean).join('; ');
  }
  // Node route (3.0.13, A1/A2/A5): complete only when the type check ran with 0 errors and the engine cases and
  // probes ran in full; a type error makes it not runnable, anything that did not run makes it not verified.
  const node = prep.scaffold.track === 'node';
  const fromRun = result.unverified ?? [];
  const unverified = node ? [...(!options.typeCheck && !fromRun.some((u) => u.startsWith('type check')) ? ['type check not run'] : []), ...fromRun] : [];
  const status: GenerationStatus =
    options.activation && !options.activation.activatable
      ? 'not-activatable'
      : node && options.typeCheck && !options.typeCheck.runnable
        ? 'not-runnable'
        : notWritten.length > 0
          ? 'partial'
          : node && unverified.length > 0
            ? 'not-verified'
            : 'complete';
  // B4 (3.0.13): every SAP identifier a written body names, checked against SAP's sources; the ones not
  // verified, or contradicting SAP, are findings of that function — said in STATUS.md and TRACE.md.
  const sapIds: NonNullable<EngineLedSummary['sapIds']> = [];
  for (const b of bodies) {
    if (refusedNow.has(b.regionId)) continue;
    const unitId = b.regionId.split('.')[0];
    for (const c of checkSapReferences(b.body)) {
      if (c.status !== 'mismatch' && c.status !== 'unverified') continue;
      if (sapIds.some((x) => x.unitId === unitId && x.id.toUpperCase() === c.id.toUpperCase())) continue;
      sapIds.push({ unitId, id: c.id, state: sapIdStateWord(c), sapName: c.sapName });
    }
  }
  for (const t of trace.units) {
    const named = sapIds.filter((x) => x.unitId === t.unitId);
    if (named.length > 0) t.note = [t.note, `SAP identifiers to check: ${named.map((x) => `${x.id} (${x.state}${x.sapName ? `; SAP: ${x.sapName}` : ''})`).join(', ')}`].filter(Boolean).join('; ');
  }
  const summary: EngineLedSummary = {
    // Partial is a function left as a stub (owner, Q4); a check that still fails on a written body is a finding.
    status,
    ...(node && unverified.length > 0 ? { unverified } : {}),
    ...(sapIds.length > 0 ? { sapIds: sapIds.slice(0, 40) } : {}),
    units: result.units.length,
    written: result.units.filter((u) => u.state === 'written').length - refusedNow.size,
    repaired: result.units.filter((u) => u.state === 'written' && u.filledBy !== 'model' && u.filledBy !== 'not-filled').length,
    notWritten,
    failing,
    checks: options.checks.map(checkSummaryOf),
    notRun: result.checksNotRun.map((n) => ({ kind: n.kind, reason: n.reason })),
    scaffoldFindings: [...(result.scaffoldBaseline ?? []), ...result.scaffoldFindings],
    callsUsed: result.callsUsed,
    budget: options.budget,
    ...(options.gateRepairBudget ? { gateRepairBudget: options.gateRepairBudget, gateRepairCallsUsed: result.gateRepairCallsUsed ?? 0 } : {}),
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
    ...(s.unverified?.length ? { unverified: s.unverified } : {}),
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
