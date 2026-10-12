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
 * The cases are run by `scripts/acceptance/engine-cases.mjs` in the acceptance
 * harness's sandbox (`scripts/acceptance/lib/sandbox.mjs`): a child process
 * with the permission model, the network guard, a minimal environment and a
 * hard timeout — and only where the harness allows executing a package at all.
 *
 * Pure: types, the static presence check and the sentences. No I/O.
 */

/** Where the contract module may stand, in the order they are tried. */
export const CALL_CONTRACT_PATHS = [
  'srv/engine-contract.ts',
  'srv/engine-contract.mjs',
  'srv/engine-contract.js',
  'engine-contract.ts',
  'engine-contract.mjs',
  'engine-contract.js',
] as const;

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
  | { kind: 'distinct-runs' };

/** The machine form of one example. Firestore-safe: no nested arrays, no `undefined`. */
export interface EngineCaseCall {
  op: 'validate' | 'simulate' | 'run-identity';
  /**
   * `request` (default): the base request with `set` applied — a `list[].key`
   * field on every record. `append`: a copy of the list's first record, with
   * `set` applied, appended to the list. `empty`: the request `{}`.
   */
  mode?: 'request' | 'append' | 'empty';
  set: CallSet[];
  expect: CallExpect;
}

/* ------------------------------------------------------- presence (static) */

/** Does the generated code carry the call contract module, exporting the four names? Read, never run. */
export function callContractPresence(files: ReadonlyArray<{ path: string; content: string }>): { present: boolean; path: string | null; missing: string[] } {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const candidate of CALL_CONTRACT_PATHS) {
    const file = files.find((f) => norm(f.path) === candidate);
    if (!file) continue;
    const missing = ['CONTRACT', 'validate', 'simulate', 'getRun'].filter(
      (name) =>
        !new RegExp(`export\\s+(?:const|let|function|async\\s+function)\\s+${name}\\b`).test(file.content) &&
        !new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(file.content),
    );
    return { present: missing.length === 0, path: candidate, missing };
  }
  return { present: false, path: null, missing: ['CONTRACT', 'validate', 'simulate', 'getRun'] };
}

/** What an engine case reads when the code has no call contract to run it against. */
export const NOT_RUN_NO_CONTRACT = 'Not run — the code does not export the call contract';
