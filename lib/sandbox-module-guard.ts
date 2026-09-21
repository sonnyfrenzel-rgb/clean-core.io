/**
 * Built-ins the test sandbox never hands out — and the two preload files that
 * refuse them at runtime.
 *
 * `--permission` fences the file system, child processes, workers and addons.
 * Node says itself that it is not a boundary against malicious code, and names
 * `node:sqlite` as a way to the file system it does not fence; the counter-review
 * of c5085bb reproduced exactly that (CR-09). So a denied built-in is refused
 * three times, whichever way it is asked for: by the bundler for a static
 * `import`, by the CommonJS loader for `require()` (including `createRequire`),
 * and by the ESM resolve hook for a dynamic `import()` with a computed name.
 *
 * Measured on 19.09.2026, Node 22.22 under `--experimental-permission` — the
 * way CI and production run: the resolve hook does **not** register there
 * (`register()` needs a worker thread the model refuses), so a dynamic
 * `import('node:sqlite')` slips past this file on that Node. What holds for
 * sqlite is Node's own switch, `--no-experimental-sqlite`, which the runner
 * passes on every Node that has the module (`sqliteSwitchSupported` in the
 * route); the CommonJS patch and the bundler hold everywhere. Defence in depth
 * until the isolated runner of roadmap 8.9 — not a boundary of its own, and
 * nothing here claims to be one.
 *
 * Pure: the route writes what `modGuardSource`/`modHooksSource` return next to
 * the network guard, and `tests/sandbox-module-guard.spec.ts` runs the very
 * same text in a child Node to show the three refusals hold.
 */

export const SANDBOX_DENIED_BUILTINS = [
  'sqlite',
  'inspector',
  'inspector/promises',
  'repl',
  'wasi',
  'cluster',
  'child_process',
  'worker_threads',
  'v8',
] as const;

/** `node:sqlite` and `sqlite` are the same request. */
export function sandboxDenied(specifier: string): boolean {
  const bare = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  return (SANDBOX_DENIED_BUILTINS as readonly string[]).includes(bare);
}

export const SANDBOX_DENIED_MESSAGE = 'is not available in the Clean-Core.io test sandbox.';

/** The ESM resolve hook: a dynamic `import()` of a denied built-in throws before it loads. */
export function modHooksSource(): string {
  return `const DENIED = new Set(${JSON.stringify([...SANDBOX_DENIED_BUILTINS])});
const bare = (s) => (String(s).startsWith('node:') ? String(s).slice(5) : String(s));
export async function resolve(specifier, context, next) {
  if (DENIED.has(bare(specifier))) throw new Error(specifier + ' ${SANDBOX_DENIED_MESSAGE}');
  return next(specifier, context);
}
`;
}

/**
 * The preload (`--import`): patches the CommonJS loader for `require()` and
 * registers the resolve hook for `import()`. The hook runs on its own thread,
 * which the permission model may refuse — registering is best effort and says
 * so; the loader patch and the bundler's refusal do not depend on it.
 */
export function modGuardSource(hooksFileUrl: string): string {
  return `import Module, { register } from 'node:module';
const DENIED = new Set(${JSON.stringify([...SANDBOX_DENIED_BUILTINS])});
const bare = (s) => (String(s).startsWith('node:') ? String(s).slice(5) : String(s));
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (DENIED.has(bare(request))) throw new Error(request + ' ${SANDBOX_DENIED_MESSAGE}');
  return realLoad.call(this, request, ...rest);
};
try { register(${JSON.stringify(hooksFileUrl)}); } catch {}
`;
}
