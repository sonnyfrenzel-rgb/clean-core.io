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

/**
 * The bodies of the module's `export { … }` lists, found in one pass: each list runs from its `{` to the next `}`.
 * A single pattern over the whole file (`export\s*\{[^}]*\bname\b[^}]*\}`) backtracks without bound on a long
 * file with many unclosed lists; this reads every character a bounded number of times.
 */
export function exportLists(content: string): string[] {
  const lists: string[] = [];
  const head = /export\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(content))) {
    const open = m.index + m[0].length;
    const close = content.indexOf('}', open);
    if (close < 0) break;
    lists.push(content.slice(open, close));
    head.lastIndex = close + 1;
  }
  return lists;
}

/** Does the generated code carry the call contract module, exporting the five names? Read, never run. */
export function callContractPresence(files: ReadonlyArray<{ path: string; content: string }>): { present: boolean; path: string | null; missing: string[] } {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const candidate of CALL_CONTRACT_PATHS) {
    const file = files.find((f) => norm(f.path) === candidate);
    if (!file) continue;
    const lists = exportLists(file.content);
    const missing = CALL_CONTRACT_EXPORTS.filter(
      (name) =>
        !new RegExp(`export\\s+(?:const|let|function|async\\s+function)\\s+${name}\\b`).test(file.content) &&
        !lists.some((list) => new RegExp(`\\b${name}\\b`).test(list)),
    );
    return { present: missing.length === 0, path: candidate, missing };
  }
  return { present: false, path: null, missing: [...CALL_CONTRACT_EXPORTS] };
}
