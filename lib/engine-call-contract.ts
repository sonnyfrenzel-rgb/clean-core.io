/**
 * The call contract: a small interface every generated Node.js package exports
 * so the engine cases (`lib/testing-engine-cases.ts`) run against it without a
 * model-written assertion (owner decision, 12.10.2026, roadmap 3.0.12).
 *
 * The module is `srv/engine-contract.ts` (or `.mjs`/`.js`, or at the package
 * root). It starts no server, opens no connection and reads no file, and it
 * exports:
 *
 *     export const CONTRACT = {
 *       version: 1,
 *       baseRequest: { … },           // a valid request every check of the original passes
 *       fields: {                      // the original's field names → request paths
 *         P_GJAHR: 'fiscalYear',
 *         QUOTA: 'receivers[].quota',  // `list[].key`: a field of every record
 *         GV_TOTAL: null,              // internal to the original: not part of a request
 *       },
 *     };
 *     export function validate(request) → { ok, errors: [{ field, rule, message }], normalized }
 *     export function simulate(request) → { ok, runId, records, errors }
 *     export function getRun(runId) → the stored run ({ runId, … }) or null
 *     export function compute(field, a, op, b) → exact decimal string at the field's places
 *
 * - `validate` runs the one input validator every channel uses; `normalized` is
 *   the request as the target holds it, decimals as strings at their places.
 * - `simulate` runs the validator, the original's checks and the calculation,
 *   and stores the run under a fresh id; `records` is how many input records
 *   went into the result.
 * - An error names the request path or the original field (`field`) and the
 *   rule id or line of the check that refused (`rule`: `BR-002`, `L42`).
 * - Field values arrive as strings, as a CSV or a form gives them; `null`,
 *   NaN and Infinity as themselves.
 *
 * - `compute` applies + - * / to two decimal strings for a declared decimal
 *   field (named as the original names it, internal ones included) and rounds
 *   commercially to the field's places — the exact-arithmetic cases.
 *
 * In the product the cases run inside the isolated test runner, as a second
 * pass beside the model's suite (`lib/test-sandbox/engine-suite.ts`, protocol
 * version 2); for an unpacked package, `scripts/acceptance/engine-cases.mjs`
 * runs them in the acceptance harness's sandbox. Both execute the same runtime
 * (`scripts/acceptance/child/engine-cases-core.mjs`).
 *
 * Pure: types and the sentences. No I/O.
 */

export { CALL_CONTRACT_PATHS, CALL_CONTRACT_EXPORTS, callContractPresence } from './test-sandbox/engine-contract-shape';

/** A value a case puts into a request field. */
export type CallValue =
  /** As a CSV or a form gives it: a string; `null` for an explicit null. */
  | { value: string | null }
  /** Values JSON cannot carry, a missing key, and an empty value (`[]` for a list, `''` otherwise). */
  | { special: 'NaN' | 'Infinity' | '-Infinity' | 'missing' | 'empty' }
  /** The value another field of the base request has. */
  | { sameAs: string }
  /** A value different from another field of the base request. */
  | { differentFrom: string };

/** One field a case sets, named as the original names it (`P_RATE`, `GS_COMP-BDMNG`). */
export interface CallSet {
  field: string;
  to: CallValue;
}

export type CallExpect =
  /** `validate` accepts; when `normalized` is given, the field holds exactly that decimal string. */
  | { kind: 'accepted'; field?: string; normalized?: string }
  /** Refused (`ok: false` or a throw), naming `rule` or `field`; no error names a rule of `notRules`. */
  | { kind: 'refused'; field?: string; rule?: string; notRules?: string[] }
  /** Not refused by this rule or field (another refusal does not count against it). */
  | { kind: 'not-refused-by'; field?: string; rule?: string }
  /** Refused, or accepted with the field not 0 (missing stays missing). */
  | { kind: 'not-zero'; field: string }
  /** Accepted with the field 0. */
  | { kind: 'zero'; field: string }
  /** `simulate` does not answer `ok: true`. */
  | { kind: 'not-success' }
  /** `simulate` answers ok with `records` = the base request's records + `delta`. */
  | { kind: 'records-delta'; delta: number }
  /** Two runs with a frozen clock: two ids, and the first run is still readable as itself. */
  | { kind: 'distinct-runs' }
  /** `compute` gives exactly this decimal string. */
  | { kind: 'equals'; value: string }
  /** `check`: the predicate answers as `EngineCaseCall.check.holds` says. */
  | { kind: 'holds' };

/**
 * The predicate of one of the original's checks, asked directly (3.0.12, owner
 * 13.10.2026): does `G-0061`'s condition hold on this input? `holds` is the
 * original's answer, derived from its condition — never the code's. The
 * engine-led scaffold's contract exports `check`; a contract without it leaves
 * the example not run.
 */
export interface EngineCheckCall {
  guard: string;
  holds: boolean;
  /** The checked field, when the condition names one: an example on the base request is asked only when the base gives it a value. */
  field?: string;
}

/** The machine form of one example. Firestore-safe: no nested arrays, no `undefined`. */
export interface EngineCaseCall {
  /** `check`: only the predicate is asked (a check that ends a step early shows in no request outcome). */
  op: 'validate' | 'simulate' | 'run-identity' | 'compute' | 'check';
  /**
   * The same example as a question to the check's predicate: asked for `op: 'check'`, and in place of a
   * `simulate` whose `set` the contract cannot carry in a request (a system field, a computed value).
   */
  check?: EngineCheckCall;
  /** `compute`: fold `start` through `compute(field, acc, op, b)` for each step. */
  compute?: { field: string; start: string; steps: Array<{ op: '+' | '-' | '*' | '/'; b: string }> };
  /**
   * `request` (default): the base request with `set` applied — a `list[].key`
   * field on every record. `append`: a copy of the list's first record, with
   * `set` applied, appended to the list. `empty`: the request `{}`.
   */
  mode?: 'request' | 'append' | 'empty';
  set: CallSet[];
  expect: CallExpect;
}

/** What an engine case reads when the code has no call contract to run it against. */
export const NOT_RUN_NO_CONTRACT = 'Not run — the code does not export the call contract';

/**
 * The same, on the ABAP route (3.0.13): the call contract is the Node.js
 * package's, and Clean-Core.io has no ABAP runtime — an engine case runs there
 * only as an ABAP Unit test method, in the reader's system.
 */
export const NOT_RUN_ABAP_UNIT =
  'Not run — Clean-Core.io has no ABAP runtime; on the ABAP route this case runs only as an ABAP Unit test method in your system';

/** Why an engine case has no verdict when no call contract runs it, said for the route the project is on. */
export function notRunWithoutContract(route: 'node' | 'abap', contract: { path: string | null; missing: readonly string[] }): string {
  if (route === 'abap') return NOT_RUN_ABAP_UNIT;
  return `${NOT_RUN_NO_CONTRACT}${contract.path ? ` (${contract.path} lacks ${contract.missing.join(', ')})` : ''}`;
}
