/**
 * The call contract's shape as the engine pass names it — where the contract
 * module may stand, what it must export, and the marker in every engine test
 * title (roadmap 3.0.12).
 *
 * Split out of `./engine-suite.ts` so a browser page can read these without
 * pulling in `node:crypto` and the 20 kB runtime string: the Testing page
 * imports the marker and `callContractPresence`, and a client bundle cannot
 * resolve `node:crypto` (the production build failed on it). `engine-suite.ts`
 * re-exports everything here, so the runner and the app read one list.
 *
 * Pure, no imports.
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
