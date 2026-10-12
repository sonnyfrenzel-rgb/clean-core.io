/**
 * The shape of the call contract the engine cases run against (roadmap 3.0.12):
 * where the module may stand, the five names it exports, the marker in every
 * engine test title, and the read-only presence check.
 *
 * No imports at all, so the Testing page can read it in the browser bundle;
 * `./engine-suite.ts` (node:crypto, app server and runner) re-exports it.
 */

/** Where the contract module may stand, in the order they are tried. Same list as the runtime's. */
export const CALL_CONTRACT_PATHS = [
  'srv/engine-contract.ts',
  'srv/engine-contract.mjs',
  'srv/engine-contract.js',
  'engine-contract.ts',
  'engine-contract.mjs',
  'engine-contract.js',
] as const;

export const CALL_CONTRACT_EXPORTS = ['CONTRACT', 'validate', 'simulate', 'getRun', 'compute'] as const;

/** The marker in every engine test title — how a verdict is known to come from the call contract. */
export const ENGINE_CONTRACT_MARKER = '[call contract]';

/** Does the generated code carry the call contract module, exporting the five names? Read, never run. */
export function callContractPresence(files: ReadonlyArray<{ path: string; content: string }>): { present: boolean; path: string | null; missing: string[] } {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const candidate of CALL_CONTRACT_PATHS) {
    const file = files.find((f) => norm(f.path) === candidate);
    if (!file) continue;
    const missing = CALL_CONTRACT_EXPORTS.filter(
      (name) =>
        !new RegExp(`export\\s+(?:const|let|function|async\\s+function)\\s+${name}\\b`).test(file.content) &&
        !new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(file.content),
    );
    return { present: missing.length === 0, path: candidate, missing };
  }
  return { present: false, path: null, missing: [...CALL_CONTRACT_EXPORTS] };
}
