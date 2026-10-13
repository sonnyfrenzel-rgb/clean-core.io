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
 * Pure: no imports beyond types.
 */

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
  status: 'complete' | 'partial';
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
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : '');
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

function engineOf(raw: unknown): EngineLedRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const digest = (v: unknown) => (typeof v === 'string' && /^[0-9a-f]{64}$/.test(v) ? v : '');
  const scaffoldDigest = digest(e.scaffoldDigest);
  const planDigest = digest(e.planDigest);
  if (!scaffoldDigest || !planDigest) return null;
  return {
    status: e.status === 'complete' ? 'complete' : 'partial',
    units: int(e.units, 1_000),
    written: int(e.written, 1_000),
    repaired: int(e.repaired, 1_000),
    notWritten: list(e.notWritten, 200, (x) => (typeof x.unitId === 'string' ? { unitId: str(x.unitId, 40), title: str(x.title, 200), reason: str(x.reason, 500) } : null)),
    failing: list(e.failing, 200, (x) => (typeof x.unitId === 'string' ? { unitId: str(x.unitId, 40), title: str(x.title, 200), failure: str(x.failure, 500) } : null)),
    checks: list(e.checks, 8, checkOf),
    notRun: list(e.notRun, 8, (x) => (typeof x.kind === 'string' ? { kind: str(x.kind, 20), reason: str(x.reason, 500) } : null)),
    scaffoldFindings: Array.isArray(e.scaffoldFindings) ? e.scaffoldFindings.slice(0, 50).filter((s): s is string => typeof s === 'string').map((s) => str(s, 500)) : [],
    callsUsed: int(e.callsUsed, 1_000),
    budget: int(e.budget, 1_000),
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
  return { ...rec, contextDigest: typeof b.contextDigest === 'string' ? b.contextDigest : null };
}
