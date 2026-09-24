import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';
import { modGuardSource, modHooksSource, sandboxDenied } from '../sandbox-module-guard';
import { packageNameOf } from '../test-verdicts';
import { netGuardSource, type LoopbackAllowance } from './net-guard';
import { hashRunInputs, type FileHash } from './protocol';
import type { SandboxFile } from './files';

/**
 * The execution core of the test sandbox — one copy, used in two places.
 *
 *   - `runner/server.ts`, the isolated Cloud Run runner (roadmap 8.9). This is
 *     where generated tests execute in every deployed environment.
 *   - `/api/run-tests`, but **only** under the Firebase emulator (local
 *     development and CI), where no runner exists. The route names that path
 *     `local-emulator` in the response and in the receipt; in a deployed
 *     build it is unreachable and the route fails closed without a runner.
 *
 * What one run does:
 *     (1) esbuild bundles test + relative app files into one self-contained CJS
 *         file; bare npm packages become a hermetic universal stub; relative and
 *         absolute imports must resolve inside the run's own directory.
 *     (2) A child process runs the suite under Node's Permission Model
 *         (read/write only the run's directory; no child processes, workers or
 *         native addons), with `--no-experimental-sqlite`, the module guard
 *         (`lib/sandbox-module-guard.ts`) and the network guard (`./net-guard.ts`)
 *         preloaded. None of this is an isolation boundary — see those files.
 *     (3) Minimal environment: `PATH`, `NODE_ENV=test`, the name filter, and
 *         whatever the caller passes explicitly. Never `...process.env`.
 *     (4) `run({ isolation: 'none' })` keeps execution in one process, so no
 *         `--allow-child-process` is needed.
 *     (5) A fresh temporary directory per run, removed in `finally`.
 *
 * It returns what it ran — the SHA-256 of every file it was handed and of the
 * suite — so the runner can report it and the app can check the report.
 */

export const EXEC_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB combined stdout+stderr cap
const CHILD_HEAP_MB = 256; // caps child V8 heap → contains heap-bomb DoS

/**
 * Universal stub for an npm package that the AI-generated code imports but that
 * is NOT installed in this environment (e.g. express, pino, pino-pretty, typeorm,
 * @sap-cloud-sdk/http-client, @sap/xssec, passport). Without this, `require('express')`
 * inside the sandbox throws "Cannot find module" and every unit test fails before the
 * business logic can even load. The stub resolves every property access / call / `new`
 * to a harmless universal mock, so the module under test loads and its pure functions
 * (validation, defaulting, mapping, …) can be genuinely unit-tested. Server bootstrap
 * (`app.listen`) is separately neutralized, so nothing actually binds a port.
 */
const UNIVERSAL_STUB = `
const handler = {
  get(_t, prop) {
    // Report as CommonJS (not an ES module) so esbuild's interop maps a default
    // import ('import express from ...') straight to this callable proxy.
    if (prop === '__esModule') return false;
    if (prop === 'then') return undefined;
    if (prop === 'default') return universal;
    if (prop === 'toString') return () => '';
    if (prop === 'valueOf') return () => 0;
    if (prop === 'toJSON') return () => null;
    if (typeof prop === 'symbol') return undefined;
    return universal;
  },
  apply() { return universal; },
  construct() { return universal; },
};
const universal = new Proxy(function () {}, handler);
module.exports = universal;
`;

/**
 * esbuild's CJS↔ESM interop only copies a required module's OWN enumerable keys, so
 * a bare Proxy exposes a callable default but every NAMED import (`import { DataSource }
 * from 'typeorm'`) resolves to undefined → `new DataSource()` throws. We therefore scan
 * the generated sources for named-import bindings and attach each one to the stub as a
 * real own property (all pointing at the universal mock), so named imports work too.
 */
export function collectNamedImports(sources: string[]): string[] {
  const names = new Set<string>();
  const re = /import[^{};]*\{([^}]*)\}/g;
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      for (const raw of m[1].split(',')) {
        // Use the exported name (before `as`), strip a leading `type` modifier.
        const name = raw.trim().split(/\s+as\s+/)[0].trim().replace(/^type\s+/, '');
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return [...names];
}

export function buildStubModule(namedExports: string[]): string {
  const assigns = namedExports
    .map((n) => `try{module.exports[${JSON.stringify(n)}]=universal;}catch(e){}`)
    .join('\n');
  return `${UNIVERSAL_STUB}\n${assigns}`;
}

/** The slice of esbuild's plugin API this file uses. */
interface ResolveArgs {
  path: string;
  kind: string;
  resolveDir?: string;
}
interface PluginBuild {
  onResolve(opts: { filter: RegExp }, cb: (args: ResolveArgs) => unknown): void;
  onLoad(opts: { filter: RegExp; namespace: string }, cb: () => unknown): void;
}
interface Esbuild {
  build(options: Record<string, unknown>): Promise<unknown>;
}

/**
 * The single esbuild resolver plugin for the sandbox bundle. It owns the whole
 * import surface of the untrusted test/app code so no specifier can slip past
 * the sandbox boundary between two plugins. Every resolution is one of four
 * cases, decided in this order:
 *
 *   1. entry point            → left to esbuild.
 *   2. Node built-in          → external (node:test/node:assert stay real).
 *   3. bare npm import        → the hermetic universal stub, inlined.
 *   4. relative OR absolute   → resolved against the importer and required to
 *      land INSIDE `testDir`; anything that resolves outside is rejected with a
 *      fixed message. Only after the boundary holds is the tsx-style
 *      `./x.js → ./x.ts` rewrite applied; everything else falls through to the
 *      default resolver, which now only ever sees paths inside the sandbox.
 *
 * The boundary must be enforced HERE, before the default resolver ever runs,
 * because the default resolver reads whatever path it is handed straight from
 * the filesystem and inlines it into the bundle that is returned to the
 * caller. Case 4 therefore covers every extension and both relative and
 * absolute forms — not just `.js`.
 */
export function createSandboxResolvePlugin(opts: {
  testDir: string;
  stubModuleSource: string;
  stubbedPackages: Set<string>;
}) {
  const { testDir, stubModuleSource, stubbedPackages } = opts;
  const insideSandbox = (abs: string) =>
    abs === testDir || abs.startsWith(testDir + path.sep);

  return {
    name: 'cc-sandbox-resolve',
    setup(build: PluginBuild) {
      build.onResolve({ filter: /.*/ }, (args: ResolveArgs) => {
        const p: string = args.path;
        if (args.kind === 'entry-point') return undefined;

        // A built-in the sandbox never hands out is refused here, at bundle
        // time, before it could become external (lib/sandbox-module-guard.ts).
        if ((p.startsWith('node:') || isBuiltin(p)) && sandboxDenied(p)) {
          return { errors: [{ text: `${p} is not available in the Clean-Core.io test sandbox.` }] };
        }
        // Node built-ins stay external (real node:test / node:assert).
        if (p.startsWith('node:') || isBuiltin(p)) return { external: true };

        // Bare npm import (neither relative nor absolute) → universal stub.
        if (!p.startsWith('.') && !path.isAbsolute(p)) {
          stubbedPackages.add(packageNameOf(p));
          return { path: p, namespace: 'cc-stub' };
        }

        // Relative or absolute → must resolve INSIDE testDir, any extension.
        // A fixed error text is returned on rejection so the checked path is
        // never echoed back to the caller.
        const base = path.resolve(args.resolveDir || testDir, p);
        if (!insideSandbox(base)) {
          return { errors: [{ text: 'Path outside sandbox rejected.' }] };
        }

        // Inside the sandbox: mirror tsx/Node resolution "./x.js → ./x.ts".
        const tsCandidate = base.replace(/\.js$/, '.ts');
        if (tsCandidate !== base && fssync.existsSync(tsCandidate)) {
          return { path: tsCandidate };
        }
        return undefined; // inside sandbox → default resolver
      });

      build.onLoad({ filter: /.*/, namespace: 'cc-stub' }, () => ({
        contents: stubModuleSource,
        loader: 'js',
      }));
    },
  };
}

/**
 * `--no-experimental-sqlite` exists from the Node that has `node:sqlite` (22.5).
 * The module reaches the file system past the permission model's fence — Node
 * documents it, the counter-review of c5085bb reproduced it (CR-09) — and this
 * switch removes the module altogether. Measured on 22.22 under
 * `--experimental-permission`: every form of the import — static, dynamic,
 * computed, `require` — answers ERR_UNKNOWN_BUILTIN_MODULE, while the resolve
 * hook of `lib/sandbox-module-guard.ts` cannot even register there (it needs a
 * worker thread the model refuses). Node 20 has neither the module nor the flag.
 */
export function sqliteSwitchSupported(): boolean {
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  return major > 22 || (major === 22 && minor >= 5);
}

/**
 * Node-version dependent permission flag. isolation:'none' needs Node >= 22.8.0;
 * the flag was renamed from --experimental-permission to --permission in 23.5.0.
 *
 * `allowUnsandboxed` is true only for the emulator path of the app (local
 * development and CI on an older Node). The runner never passes it: on the
 * runner a Node without the permission model is a refusal, not a fallback.
 */
export function resolvePermissionFlag(allowUnsandboxed: boolean): { flag: string | null; reason?: string } {
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  if (major >= 24) return { flag: '--permission' };
  if (major === 23) return { flag: minor >= 5 ? '--permission' : '--experimental-permission' };
  if (major === 22 && minor >= 8) return { flag: '--experimental-permission' };
  if (allowUnsandboxed) return { flag: 'none' };
  return { flag: null, reason: 'Node 22.8.0+ is required for sandboxed test isolation.' };
}

async function loadEsbuild(): Promise<Esbuild | null> {
  try {
    return (await import('esbuild')) as unknown as Esbuild;
  } catch {
    return null;
  }
}

function neutralize(content: string): string {
  return content.replace(/app\.listen/g, '((...args: any[]) => ({ close: () => {} }))');
}

export interface SandboxRunInput {
  files: SandboxFile[];
  suiteCode: string;
  /** Case ids for the name filter, word characters only. Empty = the whole suite. */
  patterns: string[];
  /** See `resolvePermissionFlag`. */
  allowUnsandboxed: boolean;
  /** Extra variables for the child, on top of the minimal set. Never secrets. */
  extraEnv?: Record<string, string>;
  /** The one loopback port the child may connect to (the live relay), or none. */
  loopback?: LoopbackAllowance | null;
}

export type SandboxRunOutcome =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'build-error'; message: string; stubbedPackages: string[]; files: FileHash[]; suiteSha256: string }
  | {
      kind: 'ran';
      stdout: string;
      stderr: string;
      exitCode: number;
      stubbedPackages: string[];
      files: FileHash[];
      suiteSha256: string;
    };

export async function executeSandboxRun(input: SandboxRunInput): Promise<SandboxRunOutcome> {
  // ── Toolchain / runtime checks (fail-closed) ─────────────────────────────
  const { flag: permissionFlag, reason } = resolvePermissionFlag(input.allowUnsandboxed);
  if (!permissionFlag) return { kind: 'unavailable', reason: `Sandbox unavailable: ${reason}` };

  const esbuild = await loadEsbuild();
  if (!esbuild) {
    return { kind: 'unavailable', reason: 'Sandbox unavailable: esbuild not installed.' };
  }

  // What was handed in, hashed before anything touches it — the report names
  // the inputs, not the neutralised copies written to disk.
  const { files: fileHashes, suiteSha256 } = hashRunInputs(input.files, input.suiteCode);

  let testDir = '';
  try {
    // A fresh directory per run, outside any project tree, removed in finally.
    // realpath: on some systems the temp dir is a symlink, and the boundary
    // checks below compare resolved paths.
    testDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cc-tests-')));

    // ── 1) Materialise the sources ─────────────────────────────────────────
    const testEntry = path.join(testDir, 'test.ts');
    // Raw source of every materialised file — scanned for named imports so the
    // hermetic stub can expose exactly the bindings the generated code imports.
    const sourceTexts: string[] = [input.suiteCode];
    for (const file of input.files) {
      const filePath = path.resolve(testDir, file.path);
      if (!filePath.startsWith(testDir + path.sep)) continue;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const content = /\.(ts|js)$/.test(file.path) ? neutralize(file.content) : file.content;
      await fs.writeFile(filePath, content);
      sourceTexts.push(content);
    }
    await fs.writeFile(testEntry, input.suiteCode);

    const stubModuleSource = buildStubModule(collectNamedImports(sourceTexts));

    // ── 2) Bundle: relative/absolute inlined ONLY from inside the sandbox dir,
    //       bare npm packages stubbed, Node built-ins external ────────────────
    // One resolver plugin owns the whole import surface; each stubbed package is
    // named in the result (CR-14). See createSandboxResolvePlugin above.
    const stubbedPackages = new Set<string>();
    const resolvePlugin = createSandboxResolvePlugin({ testDir, stubModuleSource, stubbedPackages });

    const bundlePath = path.join(testDir, '__sandbox_bundle.cjs');
    try {
      await esbuild.build({
        entryPoints: [testEntry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        outfile: bundlePath,
        sourcemap: 'inline',
        logLevel: 'silent',
        resolveExtensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
        // Enable TS decorators so typeorm-style entities (@Entity/@Column/…) compile.
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
        plugins: [resolvePlugin],
        loader: { '.ts': 'ts', '.tsx': 'tsx' },
      });
    } catch (buildErr) {
      const raw = buildErr instanceof Error ? buildErr.message : String(buildErr);
      // The run directory is a random name; it is not echoed back.
      const message = scrubRunDir(raw, testDir).slice(0, 4000);
      return { kind: 'build-error', message, stubbedPackages: [...stubbedPackages].sort(), files: fileHashes, suiteSha256 };
    }

    // ── 3) The in-process runner (TAP, optional name filtering) ─────────────
    const runnerPath = path.join(testDir, '__runner.mjs');
    const runnerSrc = `
import { run } from 'node:test';
import { tap } from 'node:test/reporters';

const bundle = ${JSON.stringify(bundlePath)};
const raw = process.env.SANDBOX_TEST_PATTERNS || '';
const testNamePatterns = raw ? [raw] : undefined;

let failed = false;
const stream = run({ files: [bundle], isolation: 'none', testNamePatterns });
stream.on('test:fail', () => { failed = true; });

for await (const chunk of stream.compose(tap)) {
  process.stdout.write(chunk);
}
process.exitCode = failed ? 1 : 0;
`;
    await fs.writeFile(runnerPath, runnerSrc);

    // ── 4) The guards, written next to the runner ───────────────────────────
    // The network guard is written on every run, closed unless the caller
    // hands the one loopback port of a live relay (./net-guard.ts).
    const netGuardPath = path.join(testDir, '__netguard.mjs');
    await fs.writeFile(netGuardPath, netGuardSource(input.loopback ?? null));

    // ── 5) Start the sandboxed child (no shell, no exec string) ─────────────
    // --max-old-space-size caps the child V8 heap so a heap-bomb test OOMs the
    // child instead of the whole instance.
    const args: string[] = [`--max-old-space-size=${CHILD_HEAP_MB}`];
    if (permissionFlag !== 'none') {
      args.push(permissionFlag, `--allow-fs-read=${testDir}`, `--allow-fs-write=${testDir}`);
    }
    // The layer that holds against node:sqlite on the Node that has it —
    // see sqliteSwitchSupported. Not conditional on anything else.
    if (sqliteSwitchSupported()) args.push('--no-experimental-sqlite');
    // The network guard, unconditionally, before the test runner.
    args.push(`--import=${pathToFileURL(netGuardPath).href}`);
    // The built-ins the sandbox refuses at runtime, whichever way they are
    // asked for: require() through the CommonJS loader, import() through the
    // ESM resolve hook. The bundler already refused the static form. What this
    // is and is not stands in lib/sandbox-module-guard.ts.
    const modHooksPath = path.join(testDir, '__modhooks.mjs');
    const modGuardPath = path.join(testDir, '__modguard.mjs');
    await fs.writeFile(modHooksPath, modHooksSource());
    await fs.writeFile(modGuardPath, modGuardSource(pathToFileURL(modHooksPath).href));
    args.push(`--import=${pathToFileURL(modGuardPath).href}`);
    args.push(runnerPath);

    const childEnv: Record<string, string> = {
      PATH: process.env.PATH || '',
      ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT || '' } : {}),
      NODE_ENV: 'test',
      SANDBOX_TEST_PATTERNS: input.patterns.join('|'),
      ...(input.extraEnv || {}),
    };

    const { stdout, stderr, exitCode } = await runSandboxed(args, testDir, childEnv);
    return {
      kind: 'ran',
      stdout,
      stderr: scrubRunDir(stderr, testDir),
      exitCode,
      stubbedPackages: [...stubbedPackages].sort(),
      files: fileHashes,
      suiteSha256,
    };
  } finally {
    try {
      if (testDir) await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

/**
 * The run directory's name, absolute or relative (esbuild reports paths
 * relative to the working directory), replaced by a marker — the caller has no
 * use for where on the runner a run lived.
 */
function scrubRunDir(text: string, testDir: string): string {
  return text.split(testDir).join('<sandbox>').replace(/[^\s'"`:]*cc-tests-[A-Za-z0-9]+/g, '<sandbox>');
}

// Child-process execution with timeout & output cap.
function runSandboxed(
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let outBytes = 0;
    let killedForLimit = false;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, EXEC_TIMEOUT_MS);

    child.stdout.on('data', (d: Buffer) => {
      outBytes += d.length;
      if (outBytes > MAX_OUTPUT_BYTES) {
        if (!killedForLimit) {
          killedForLimit = true;
          child.kill('SIGKILL');
        }
        return;
      }
      stdout += d.toString();
    });

    child.stderr.on('data', (d: Buffer) => {
      // stderr shares the combined output cap so an stderr-only flood cannot bypass it.
      outBytes += d.length;
      if (outBytes > MAX_OUTPUT_BYTES) {
        if (!killedForLimit) {
          killedForLimit = true;
          child.kill('SIGKILL');
        }
        return;
      }
      stderr += d.toString();
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr || String(e), exitCode: 1 });
    });

    child.on('close', (codeNum, signal) => {
      clearTimeout(timer);
      if (killedForLimit) stderr += '\n[Sandbox] Output limit exceeded; process terminated.';
      else if (signal === 'SIGKILL') stderr += `\n[Sandbox] Timed out after ${EXEC_TIMEOUT_MS} ms.`;
      resolve({ stdout, stderr, exitCode: typeof codeNum === 'number' ? codeNum : 1 });
    });
  });
}
