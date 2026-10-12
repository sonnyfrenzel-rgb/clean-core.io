/**
 * The typed contract between the tracks of the engine-led transformation
 * (`docs/design/engine-led-transformation.md` §6.1, §8.2, §15.5).
 *
 * Owned by Track B (`feat/3.0.12-scaffold`). Track C (fills, lease, verify,
 * repair) wrote this copy first, from the design's interfaces word for word,
 * so the two tracks could build in parallel; when B lands, B's file wins and
 * any difference is reconciled to the design, not to either branch. Track C
 * adds only the fill request/answer shapes of §8.2, which the design assigns
 * to this file as well.
 *
 * Pure: types only.
 */

export type UnitKind = 'routine' | 'method' | 'orchestrator' | 'event' | 'fixture';

export interface AbapRange {
  lineStart: number;
  lineEnd: number;
  routine: string;
}

export interface Unit {
  /** 'U02' — stable for one source + plan version. */
  id: string;
  kind: UnitKind;
  /** 'validatePolicy' (Node) / 'validate_policy' (RAP method). */
  fn: string;
  /** 'srv/steps/02-validate-policy.ts' / 'src/zbp_….clas.locals_imp.abap'. */
  file: string;
  /** Engine plain name of the step ("Validate the allocation policy"). */
  title: string;
  /** BPMN element id of the step (process documentation), null for helpers. */
  stepId: string | null;
  abap: AbapRange[];
  /** BR ids, DROP excluded. */
  rules: string[];
  /** Guard ids 'G-0120' (line of the IF/CHECK). */
  guards: string[];
  /** Unit ids this unit may call. */
  callees: string[];
  /** Written by the engine; the model never changes it. */
  signature: string;
  budget: { lines: number; chars: number };
}

export interface Scaffold {
  track: 'node' | 'rap';
  /** SCAFFOLD_VERSION, enters the binding. */
  version: number;
  files: Array<{ path: string; content: string; owner: 'engine' | 'fill' }>;
  units: Unit[];
  /** sha256 over every engine-owned character (§9.3). */
  digest: string;
  /** acceptance-adapter.json (Node only). */
  adapter: unknown | null;
  notCarried: Array<{ routine: string; reason: 'unreachable' | 'dropped' | 'fixture' }>;
}

/* ------------------------------------------------------- fills (§8.2) */

export type RuleDecision = 'keep' | 'change' | 'drop' | 'open';

/** One unit as a fill call carries it — built from a `Unit`, its slice and its rules. */
export interface FillRequestUnit {
  unitId: string;
  function: { name: string; file: string; signature: string; returns: string };
  /** `text` is the slice with original line numbers ("0500 FORM validate_policy."). */
  abap: { ranges: AbapRange[]; text: string };
  /** DROP rules are never listed (§6.4). */
  rules: Array<{ id: string; decision: Exclude<RuleDecision, 'drop'>; text: string; proposal?: string }>;
  guards: Array<{ id: string; rule: string | null; helper: string; condition: string; effect: string }>;
  facts: { decimals: Array<{ name: string; digits: number; decimals: number; type: string }> };
  available: { helpers: string[]; callees: string[] };
}

/** A repair round's addition to a unit (§13.2 step 3). */
export interface FillRepair {
  unitId: string;
  round: 1 | 2;
  /** ≤ 2,000 characters. */
  failure: string;
  previousBody: string | null;
}

export interface FillRequest {
  schema: 'cc.fill.v1';
  track: 'node' | 'rap';
  program: string | null;
  context: string;
  rules: string;
  units: FillRequestUnit[];
  repair: FillRepair[] | null;
}

export interface FillAnswerUnit {
  unitId: string;
  body: string;
  needs: string[];
  refused: { reason: string } | null;
}

export interface FillAnswer {
  units: FillAnswerUnit[];
}

/* ------------------------------------------------- events (§15.5) */

/**
 * A context slot key of Track A (`CONTEXT_SLOTS`). Typed as a string here so
 * this file does not depend on Track A's module; A's key union narrows it.
 */
export type ContextSlotKey = string;

export type GenerationEvent =
  | { t: 'slot'; slot: ContextSlotKey; state: 'loading' | 'loaded' | 'missing' | 'stale'; at: number }
  | { t: 'scaffold'; units: number; guards: number; decimals: number; inputs: number; cases: number; ms: number }
  | { t: 'fill'; unitId: string; state: 'writing' | 'written' | 'refused' | 'unusable'; at: number }
  | { t: 'check'; kind: 'guards' | 'lint' | 'cases' | 'probes'; total: number; failed: number; ms: number }
  | { t: 'repair'; round: 1 | 2; unitIds: string[]; state: 'start' | 'done'; fixed?: number }
  | { t: 'fallback'; reason: string }
  | { t: 'stored' }
  | { t: 'failed'; message: string };
