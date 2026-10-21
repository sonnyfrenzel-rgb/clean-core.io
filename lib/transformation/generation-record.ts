/**
 * What a stored generation says about how it was made (roadmap 3.0.12, step
 * E; `docs/design/engine-led-transformation.md` §12.2, §15.4, §16.2, §18):
 * the path (engine-led or the single call), why the single call ran, the
 * engine-led summary (written, not written and why, the checks), and the
 * "Built on" snapshot of the tools the generation used.
 *
 * The page sends it with the package; the server checks its shape, caps every
 * list and string, compares the scaffold digests against the package's own
 * `traceability.json`, and writes it into `generationBinding` beside the
 * contract — never into a run or the audit pack (§12.3). It is the page's
 * report of a model-written package: provenance stays `proposed`.
 *
 * Pure: no imports beyond the check words.
 */

import { activationOf, cdsCompileOf, typeCheckOf, type AbapActivation, type CdsCompileCheck, type NodeTypeCheck } from './check-words';
import type { GenerationStatus } from './types';

export type GenerationPath = 'engine-led' | 'single-call';

/** One tool the generation built on, as the screen showed it then (§15.4). */
export interface BasisSlot {
  key: string;
  title: string;
  /** "signed run 11 Oct 2026", "need revision 3" — or empty. */
  when: string;
  /** The slot's facts as words, at most four. */
  facts: string[];
  /** The slot needed attention when the generation read it. */
  attention: boolean;
}

export interface EngineLedRecord {
  /**
   * `complete`: every function written and, on the ABAP route since 3.0.13, no parser or syntax error in the
   * package's own objects; `partial`: a function left as a stub; `not-activatable` (3.0.13, ABAP route): the
   * server's activation check found errors — the server sets it, whatever the page sent (`withAbaplint`);
   * `not-runnable` (3.0.13, Node route): the server's type check found errors (`withTypeCheck`);
   * `not-verified` (3.0.13, Node route): the type check, engine cases or probes did not run in full.
   */
  status: GenerationStatus;
  /** Why it is `not-verified`: what did not run (Node route, 3.0.13). */
  unverified?: string[];
  /** SAP identifiers the written bodies name, not verified or contradicting SAP's sources (3.0.13, B4). */
  sapIds?: Array<{ unitId: string; id: string; state: string; sapName: string | null }>;
  units: number;
  written: number;
  repaired: number;
  notWritten: Array<{ unitId: string; title: string; reason: string }>;
  failing: Array<{ unitId: string; title: string; failure: string }>;
  /**
   * `passed`, `notRun`, `scope` and the reasons since the honest count (step
   * E); a record stored before it carries `total` and `failed` only and is read
   * as such (§18) — its total is "reported", never "run".
   */
  checks: Array<{ kind: string; total: number; failed: number; passed?: number; notRun?: number; scope?: 'engine-code' | 'fills'; notRunReason?: string | null; baseThrew?: string | null }>;
  notRun: Array<{ kind: string; reason: string }>;
  scaffoldFindings: string[];
  callsUsed: number;
  budget: number;
  /** Calls held for gate repairs beyond `budget`, and how many were spent (owner decision 14.10.2026). */
  gateRepairBudget?: number;
  gateRepairCallsUsed?: number;
  rounds: number;
  stop: string;
  scaffoldVersion: number;
  scaffoldDigest: string;
  planDigest: string;
}

/** The fields the server adds to `generationBinding` (all optional on a binding from before 3.0.12). */
export interface GenerationRecord {
  path: GenerationPath;
  /** Why the single call ran instead of the engine-led path; null on the engine-led path. */
  fallbackReason: string | null;
  engine: EngineLedRecord | null;
  basis: BasisSlot[];
  /** Total time of the generation, as the page measured it (ms), or null. */
  elapsedMs: number | null;
  /**
   * The server's activation check of the stored ABAP package (3.0.13, `binding.abaplint.activation`). Read only
   * from a stored binding, never from what the page sends; absent on a binding from before — its words stay.
   */
  activation?: AbapActivation | null;
  /** The server's type check of the stored Node package (3.0.13, `binding.typeCheck`); read only from a stored binding. */
  typeCheck?: NodeTypeCheck | null;
  /** The server's `cds compile` of the stored package's CAP shell (3.0.13, `binding.cdsCompile`); read only from a stored binding. */
  cdsCompile?: CdsCompileCheck | null;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : '');

/** A slot's fact as the record stores it — compare today's facts through this, or a long fact is always "changed". */
export const storedFact = (text: string): string => str(text, 300);
const int = (v: unknown, max = 1_000_000): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
const list = <T>(v: unknown, max: number, map: (x: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(v) ? v.slice(0, max).map((x) => (x && typeof x === 'object' && !Array.isArray(x) ? map(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null) : [];

/** One check, capped; the split fields only when the record carries them (an older one does not). */
function checkOf(x: Record<string, unknown>): EngineLedRecord['checks'][number] | null {
  if (typeof x.kind !== 'string') return null;
  const out: EngineLedRecord['checks'][number] = { kind: str(x.kind, 20), total: int(x.total), failed: int(x.failed) };
  if (typeof x.passed === 'number' && typeof x.notRun === 'number') {
    out.passed = int(x.passed);
    out.notRun = int(x.notRun);
  }
  if (x.scope === 'engine-code' || x.scope === 'fills') out.scope = x.scope;
  if (typeof x.notRunReason === 'string' && x.notRunReason) out.notRunReason = str(x.notRunReason, 300);
  if (typeof x.baseThrew === 'string' && x.baseThrew) out.baseThrew = str(x.baseThrew, 300);
  return out;
}

const STATUSES = new Set<GenerationStatus>(['complete', 'partial', 'not-activatable', 'not-runnable', 'not-verified']);

function engineOf(raw: unknown): EngineLedRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const digest = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '');
  const scaffoldDigest = digest(e.scaffoldDigest);
  const planDigest = digest(e.planDigest);
  if (!scaffoldDigest || !planDigest) return null;
  const sapIds = list(e.sapIds, 40, (x) =>
    typeof x.unitId === 'string' && typeof x.id === 'string'
      ? { unitId: str(x.unitId, 40), id: str(x.id, 80), state: str(x.state, 80), sapName: typeof x.sapName === 'string' ? str(x.sapName, 200) : null }
      : null,
  );
  const unverified = Array.isArray(e.unverified) ? e.unverified.slice(0, 12).filter((s): s is string => typeof s === 'string').map((s) => str(s, 500)) : [];
  return {
    status: STATUSES.has(e.status as GenerationStatus) ? (e.status as GenerationStatus) : 'partial',
    ...(unverified.length > 0 ? { unverified } : {}),
    ...(sapIds.length > 0 ? { sapIds } : {}),
    units: int(e.units, 1_000),
    written: int(e.written, 1_000),
    repaired: int(e.repaired, 1_000),
    notWritten: list(e.notWritten, 200, (x) => (typeof x.unitId === 'string' ? { unitId: str(x.unitId, 40), title: str(x.title, 200), reason: str(x.reason, 500) } : null)),
    failing: list(e.failing, 200, (x) => (typeof x.unitId === 'string' ? { unitId: str(x.unitId, 40), title: str(x.title, 200), failure: str(x.failure, 500) } : null)),
    checks: list(e.checks, 12, checkOf),
    notRun: list(e.notRun, 12, (x) => (typeof x.kind === 'string' ? { kind: str(x.kind, 20), reason: str(x.reason, 500) } : null)),
    scaffoldFindings: Array.isArray(e.scaffoldFindings) ? e.scaffoldFindings.slice(0, 50).filter((s): s is string => typeof s === 'string').map((s) => str(s, 500)) : [],
    callsUsed: int(e.callsUsed, 1_000),
    budget: int(e.budget, 1_000),
    ...(typeof e.gateRepairBudget === 'number' && e.gateRepairBudget > 0
      ? { gateRepairBudget: int(e.gateRepairBudget, 1_000), gateRepairCallsUsed: int(e.gateRepairCallsUsed, 1_000) }
      : {}),
    rounds: int(e.rounds, 10),
    stop: str(e.stop, 20),
    scaffoldVersion: int(e.scaffoldVersion, 10_000),
    scaffoldDigest,
    planDigest,
  };
}

function basisOf(raw: unknown): BasisSlot[] {
  return list(raw, 12, (x) =>
    typeof x.key === 'string' && typeof x.title === 'string'
      ? {
          key: str(x.key, 40),
          title: str(x.title, 80),
          when: str(x.when, 120),
          facts: Array.isArray(x.facts) ? x.facts.slice(0, 4).filter((f): f is string => typeof f === 'string').map((f) => str(f, 300)) : [],
          attention: x.attention === true,
        }
      : null,
  );
}

/**
 * The record a store request names, shape-checked and capped; `null` when the
 * request names none (a store from before 3.0.12 — the binding then carries no
 * path, and the page reads it as such, §18).
 */
export function generationRecordOf(raw: unknown): GenerationRecord | { error: string } | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'The generation record is not an object.' };
  const r = raw as Record<string, unknown>;
  const path: GenerationPath | null = r.path === 'engine-led' ? 'engine-led' : r.path === 'single-call' ? 'single-call' : null;
  if (!path) return { error: 'The generation record names no path (engine-led or single-call).' };
  const engine = path === 'engine-led' ? engineOf(r.engine) : null;
  if (path === 'engine-led' && !engine) return { error: 'An engine-led generation must name its scaffold and plan digests.' };
  return {
    path,
    fallbackReason: path === 'single-call' ? str(r.fallbackReason, 500) || null : null,
    engine,
    basis: basisOf(r.basis),
    elapsedMs: typeof r.elapsedMs === 'number' && Number.isFinite(r.elapsedMs) ? int(r.elapsedMs, 3_600_000) : null,
  };
}

/**
 * The engine-led package must carry its own trace, and the trace must name the
 * scaffold the record names — a summary of another scaffold is refused.
 */
export function traceMatchesRecord(files: ReadonlyArray<{ path: string; content: string }>, record: GenerationRecord): string | null {
  if (record.path !== 'engine-led' || !record.engine) return null;
  const file = files.find((f) => f.path === 'traceability.json');
  if (!file) return 'The engine-led package carries no traceability.json.';
  let trace: { scaffoldDigest?: unknown; planDigest?: unknown };
  try {
    trace = JSON.parse(file.content) as typeof trace;
  } catch {
    return 'The package’s traceability.json is not JSON.';
  }
  if (trace.scaffoldDigest !== record.engine.scaffoldDigest || trace.planDigest !== record.engine.planDigest) {
    return 'The package’s traceability.json names another scaffold than the generation record.';
  }
  return null;
}

/** The record of a stored binding, read leniently (a binding from before 3.0.12 has none). */
export function storedGenerationRecord(binding: unknown): (GenerationRecord & { contextDigest: string | null }) | null {
  if (!binding || typeof binding !== 'object') return null;
  const b = binding as Record<string, unknown>;
  if (b.path !== 'engine-led' && b.path !== 'single-call') return null;
  const rec = generationRecordOf({ path: b.path, fallbackReason: b.fallbackReason, engine: b.engine, basis: b.basis, elapsedMs: b.elapsedMs });
  if (!rec || 'error' in rec) return null;
  const activation = storedActivation(binding);
  const typeCheck = storedTypeCheck(binding);
  const cdsCompile = storedCdsCompile(binding);
  return { ...rec, ...(activation ? { activation } : {}), ...(typeCheck ? { typeCheck } : {}), ...(cdsCompile ? { cdsCompile } : {}), contextDigest: typeof b.contextDigest === 'string' ? b.contextDigest : null };
}

/**
 * The server's type check of a stored Node generation (`generationBinding.typeCheck`, 3.0.13), or null — a
 * binding from before, an ABAP package, or a store where the compiler did not run.
 */
export function storedTypeCheck(binding: unknown): NodeTypeCheck | null {
  if (!binding || typeof binding !== 'object') return null;
  return typeCheckOf((binding as { typeCheck?: unknown }).typeCheck);
}

/** The server's `cds compile` of a stored Node generation (`generationBinding.cdsCompile`, 3.0.13), or null. */
export function storedCdsCompile(binding: unknown): CdsCompileCheck | null {
  if (!binding || typeof binding !== 'object') return null;
  return cdsCompileOf((binding as { cdsCompile?: unknown }).cdsCompile);
}

/**
 * The server's activation check of a stored generation (`generationBinding.abaplint.activation`, 3.0.13), or
 * null — a binding from before, a Node package, or a store where abaplint did not run.
 */
export function storedActivation(binding: unknown): AbapActivation | null {
  if (!binding || typeof binding !== 'object') return null;
  const lint = (binding as { abaplint?: unknown }).abaplint;
  if (!lint || typeof lint !== 'object') return null;
  return activationOf((lint as { activation?: unknown }).activation);
}

/**
 * The context digest a stored generation was built on (`generationBinding.contextDigest` of a project, or of
 * the fields a store answered with), or null — a package from before 3.0.12 carries none and is never made
 * stale by it (design §18). Roadmap 3.0.13, item 3.
 */
export function storedContextDigest(project: unknown): string | null {
  const binding = (project as { generationBinding?: { path?: unknown; contextDigest?: unknown } } | null)?.generationBinding;
  if (!binding || typeof binding !== 'object' || (binding.path !== 'engine-led' && binding.path !== 'single-call')) return null;
  return typeof binding.contextDigest === 'string' && binding.contextDigest ? binding.contextDigest : null;
}

/** A Built-on slot as the page reads it now — the shape `isStale` compares (`ChainSlot` of lib/transformation-chain.ts). */
export interface CurrentSlot {
  key: string;
  state: string;
  when: string | null;
  facts: ReadonlyArray<{ text: string }>;
}

/**
 * Does a tool read differently now than when the generation read it? Its `when` or **any** of its facts —
 * compared in the form the record stores them (at most four facts, each capped as `basisOf` caps it), so a
 * fact cut short in the record is not taken for a change (comparing only the first fact let "2 gaps" turning
 * into "3 gaps" in the second fact go unseen). A slot still loading or not read is
 * never stale: nothing is known yet.
 */
export function basisSlotChanged(b: BasisSlot, now: readonly CurrentSlot[]): boolean {
  const current = now.find((s) => s.key === b.key);
  if (!current || current.state === 'loading' || current.state === 'unread') return false;
  if (str(current.when ?? '', 120) !== b.when) return true;
  // Every stored fact, each as the record stores it: the record keeps a fact cut at 300 characters, and
  // comparing the first fact uncut marked a long design reason stale right after the generation (dev
  // acceptance 14.10.2026, hotfix 2).
  const facts = current.facts.slice(0, 4).map((f) => storedFact(f.text));
  return facts.length !== b.facts.length || facts.some((f, i) => f !== b.facts[i]);
}
