import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import fssync from 'fs';
import os from 'os';
import path from 'path';
import { isBuiltin } from 'module';
import { pathToFileURL } from 'url';
import { verifyRequestAuth, assertS4TenantAccess, assertMfaSatisfied, assertAccountActive, getAdminDb } from '@/lib/firebase-admin';
import { modGuardSource, modHooksSource, sandboxDenied } from '@/lib/sandbox-module-guard';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';
import { assertRateLimit } from '@/lib/rate-limit';
import { liveRunnerPermitted } from '@/lib/runner-egress-attestation';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { parseTapOutput, packageNameOf, applyRunnerVerdicts } from '@/lib/test-verdicts';
import { testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '@/lib/test-receipt';
import { logger, errMessage } from '@/lib/logger';

/**
 * POST /api/run-tests
 *
 * Runs the generated node:test suite against the generated app code and returns
 * TAP results. Request/response contract is unchanged:
 *   IN : { tests, projectId, code, selectedTestIds, s4Environment }
 *   OUT: { output, error, exitCode, testResults, stubbedPackages }
 *
 * SECURITY MODEL (F-02 — replaces the previous tsx + child_process.exec execution):
 *   Untrusted code is no longer executed inside the app's trust boundary.
 *     (1) esbuild bundles test + relative app files (in the parent) into one
 *         self-contained CJS file; bare npm packages stay external (runtime parity).
 *     (2) A child process runs the suite under Node's Permission Model:
 *           node --permission --allow-fs-read=<dir> --allow-fs-read=<node_modules>
 *                --allow-fs-write=<dir> runner.mjs
 *         => child_process, worker_threads, native addons and any filesystem access
 *            OUTSIDE the sandbox dir are denied by default. This closes RCE / host
 *            pivot / secret exfiltration.
 *     (3) Minimal env: NO ...process.env, no platform secrets reach the child.
 *     (4) run({ isolation: 'none' }) keeps execution in-process => no
 *         --allow-child-process needed (which would itself be an escape vector).
 *
 * F-03: S/4HANA credentials are loaded SERVER-SIDE (encrypted store) by the
 *   authenticated UID — never taken from the request body.
 *
 * RESIDUAL RISK (must be closed at infra level): the Permission Model does NOT gate
 *   network egress. Configure the runner service with egress deny-by-default +
 *   allowlist (Cloud Run egress / VPC firewall).
 */

const EXEC_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB combined stdout+stderr cap
const MAX_INPUT_BYTES = 2 * 1024 * 1024;   // 2 MB combined code/test payload
const CHILD_HEAP_MB = 256;                 // caps child V8 heap → contains heap-bomb DoS
const MAX_CONCURRENT_RUNS = 4;             // per-instance cap on simultaneous heavy runs

// Per-instance counter of in-flight sandbox runs (bundle + child process). Bounds how
// many heavy executions one Cloud Run instance does at once, so a single approved user
// cannot exhaust CPU/memory by firing many runs in parallel (Audit F-01 sub-finding).
let activeRuns = 0;

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
function collectNamedImports(sources: string[]): string[] {
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

function buildStubModule(namedExports: string[]): string {
  const assigns = namedExports
    .map((n) => `try{module.exports[${JSON.stringify(n)}]=universal;}catch(e){}`)
    .join('\n');
  return `${UNIVERSAL_STUB}\n${assigns}`;
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
 * the server filesystem and inlines it into the bundle that is returned to the
 * caller. Case 4 therefore covers every extension and both relative and
 * absolute forms — not just `.js`.
 */
function createSandboxResolvePlugin(opts: {
  testDir: string;
  stubModuleSource: string;
  stubbedPackages: Set<string>;
}) {
  const { testDir, stubModuleSource, stubbedPackages } = opts;
  const insideSandbox = (abs: string) =>
    abs === testDir || abs.startsWith(testDir + path.sep);

  return {
    name: 'cc-sandbox-resolve',
    setup(build: any) {
      build.onResolve({ filter: /.*/ }, (args: any) => {
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

// The TAP parser lives in lib/test-verdicts.ts (E07-F01): SKIP and TODO are
// their own states there, and the tests call it directly.

// Node-version dependent permission flag. isolation:'none' needs Node >= 22.8.0;
// the flag was renamed from --experimental-permission to --permission in 23.5.0.
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
function sqliteSwitchSupported(): boolean {
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  return major > 22 || (major === 22 && minor >= 5);
}

function resolvePermissionFlag(): { flag: string | null; reason?: string } {
  const [major, minor] = process.versions.node.split('.').map((n) => parseInt(n, 10));
  if (major >= 24) return { flag: '--permission' };
  if (major === 23) return { flag: minor >= 5 ? '--permission' : '--experimental-permission' };
  if (major === 22 && minor >= 8) return { flag: '--experimental-permission' };
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
    return { flag: 'none' };
  }
  return { flag: null, reason: 'Node 22.8.0+ is required for sandboxed test isolation.' };
}

async function loadEsbuild(): Promise<any | null> {
  try {
    return await import('esbuild');
  } catch {
    return null;
  }
}

function neutralize(content: string): string {
  return content.replace(/app\.listen/g, '((...args: any[]) => ({ close: () => {} }))');
}

export async function POST(req: Request) {
  // ── AUTH ──────────────────────────────────────────────────────────────
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json(
      { output: '', error: 'Authentication required.', exitCode: 1 },
      { status: 401 },
    );
  }

  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: any) {
    return NextResponse.json(
      { output: '', error: mfaErr.message || 'MFA verification required.', exitCode: 1 },
      { status: 403 }
    );
  }

  // F-02: account-state gate — pending/suspended/stale-Terms accounts cannot run tests.
  try {
    await assertAccountActive(decodedToken.uid, { requireApproved: true, requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
  } catch (gateErr: any) {
    return NextResponse.json(
      { output: '', error: gateErr?.message || 'Account not permitted.', exitCode: 1 },
      { status: gateErr?.status || 403 },
    );
  }

  // `tests` and `code` are deliberately not read out of the body any more — see
  // the ownership block below. What is left is which project, which of its cases
  // and which environment; all three are checked before anything runs.
  const { projectId, selectedTestIds, s4Environment } = await req.json();

  // The documented lock (lib/locked-paths.ts, G0:R0) refuses a live run before any work:
  // nothing is written, bundled, probed or loaded for a path that is closed.
  if (s4Environment === 'live' && LIVE_TEST_EXECUTION.locked) {
    return NextResponse.json(
      { output: '', error: LIVE_TEST_EXECUTION.userNotice, exitCode: 1, testResults: [], locked: LIVE_TEST_EXECUTION.id },
      { status: 403 },
    );
  }

  // ── Input validation ────────────────────────────────────────────────────
  const sanitizedProjectId = (projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitizedProjectId) {
    return NextResponse.json(
      { output: '', error: 'Invalid project ID.', exitCode: 1 },
      { status: 400 },
    );
  }

  // Per-user rate limit (skipped in emulator/E2E). Bounds burst abuse of the runner.
  try {
    await assertRateLimit(`run-tests:${decodedToken.uid}`, 20, 60_000);
  } catch (rlErr: any) {
    return NextResponse.json(
      { output: '', error: rlErr?.message || 'Too many test runs. Please wait a moment and retry.', exitCode: 1 },
      { status: rlErr?.status || 429 },
    );
  }

  // Ownership: the runner may only execute against a project the caller owns.
  // (`projectId` was previously only sanitised for the temp-dir name, so any approved
  // account could run against an arbitrary id — Audit F-01 sub-finding.)
  //
  // The snapshot is kept, because it is also the source of what gets executed.
  // The route used to take `code` and `tests` from the request body and report
  // the outcome as the project's test result, so a caller could post a trivial
  // passing suite, or the project's own suite against different code, and have
  // the answer attributed to the project (QA full review of a19945ef01dc). What
  // runs is now what the project stores. The body's copies are ignored: the
  // client sends `project.generatedCode` and `project.testSuite`, which is the
  // same thing on every honest call and a different thing on the dishonest one.
  let projectData: Record<string, unknown> = {};
  try {
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(sanitizedProjectId).get();
    if (!snap.exists) {
      return NextResponse.json(
        { output: '', error: 'Project not found.', exitCode: 1 },
        { status: 404 },
      );
    }
    projectData = (snap.data() || {}) as Record<string, unknown>;
    // Owner only, and the administrator claim is not an owner — the same form
    // f8bc33b gave `DELETE /api/projects/{id}`. It matters more here than it did
    // when this route only returned TAP: the run now writes an execution receipt
    // onto the project, and that receipt is what turns Testing and Delivery
    // green. A claim that stood in for ownership would let an operator put a
    // passing verdict on a stranger's evidence — and `assertMfaSatisfied` is no
    // second gate, because it lets every token through for an account whose
    // profile does not say `mfaEnabled` (lib/mfa-gate.ts).
    if (projectData.userId !== decodedToken.uid) {
      return NextResponse.json(
        { output: '', error: 'You are not authorized to run tests for this project.', exitCode: 1 },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { output: '', error: 'Project ownership verification failed.', exitCode: 1 },
      { status: 500 },
    );
  }

  const storedSuite = projectData.testSuite as { code?: unknown; spec?: unknown } | undefined;
  const testCode =
    storedSuite && typeof storedSuite.code === 'string' && storedSuite.code
      ? storedSuite.code
      : storedSuite && typeof storedSuite.spec === 'string' && storedSuite.spec
        ? storedSuite.spec
        : null;
  const code = typeof projectData.generatedCode === 'string' ? projectData.generatedCode : '';
  if (!testCode) {
    return NextResponse.json(
      { output: '', error: "No test code provided. Please click 'Regenerate Tests' to create a Node.js test suite.", exitCode: 1 },
      { status: 400 },
    );
  }

  const totalInputBytes = Buffer.byteLength(testCode, 'utf8') + (code ? Buffer.byteLength(code, 'utf8') : 0);
  if (totalInputBytes > MAX_INPUT_BYTES) {
    return NextResponse.json(
      { output: '', error: 'Test/code payload exceeds the allowed size limit.', exitCode: 1 },
      { status: 413 },
    );
  }

  // ── Toolchain / runtime checks (fail-closed) ─────────────────────────────
  const { flag: permissionFlag, reason } = resolvePermissionFlag();
  if (!permissionFlag) {
    return NextResponse.json(
      { output: '', error: `Sandbox unavailable: ${reason}`, exitCode: 1 },
      { status: 500 },
    );
  }

  const esbuild = await loadEsbuild();
  if (!esbuild) {
    return NextResponse.json(
      { output: '', error: 'Sandbox unavailable: esbuild not installed. Add "esbuild" to devDependencies.', exitCode: 1 },
      { status: 500 },
    );
  }

  // Concurrency cap (per instance): refuse new heavy runs at capacity so one user
  // cannot exhaust the instance with many parallel executions. Check + increment run
  // synchronously (no await between) so the guard is race-free; the try/finally below
  // guarantees the decrement even if setup throws.
  if (activeRuns >= MAX_CONCURRENT_RUNS) {
    return NextResponse.json(
      { output: '', error: 'The test runner is at capacity right now. Please retry in a few seconds.', exitCode: 1 },
      { status: 429 },
    );
  }
  activeRuns++;

  const projectNodeModules = path.join(process.cwd(), 'node_modules');
  let testDir = '';

  try {
    // Sandbox dir outside the project tree (never write into cwd).
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), `cc-tests-${sanitizedProjectId}-`));
    // ── 1) Materialise sources (modular vs legacy flat) ────────────────────
    const testEntry = path.join(testDir, 'test.ts');
    let filesParsed = false;
    // Raw source of every materialised file — scanned for named imports so the
    // hermetic stub can expose exactly the bindings the generated code imports.
    const sourceTexts: string[] = [testCode];

    if (code) {
      try {
        const parsed = JSON.parse(code);
        if (Array.isArray(parsed) && parsed.every((f) => typeof f.path === 'string' && typeof f.content === 'string')) {
          for (const file of parsed) {
            const safeRel = String(file.path).replace(/\.\./g, '').replace(/^[\/\\]+/, '');
            const filePath = path.resolve(testDir, safeRel);
            if (!filePath.startsWith(testDir + path.sep) && filePath !== testDir) continue;

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            let safeContent = file.content;
            if (file.path.endsWith('.ts') || file.path.endsWith('.js')) {
              safeContent = neutralize(safeContent);
            }
            await fs.writeFile(filePath, safeContent);
            sourceTexts.push(safeContent);
          }
          filesParsed = true;
        }
      } catch {
        /* not a JSON array → legacy flat below */
      }
    }

    if (!filesParsed && code) {
      const flat = neutralize(code);
      await fs.writeFile(path.join(testDir, 'app.ts'), flat);
      sourceTexts.push(flat);
    }

    await fs.writeFile(testEntry, testCode);

    const stubModuleSource = buildStubModule(collectNamedImports(sourceTexts));

    // ── 2) Bundle in the parent: relative/absolute inlined ONLY from inside the
    //       sandbox dir, bare npm packages stubbed, Node built-ins external ─────
    // One resolver plugin owns the whole import surface so no specifier can slip
    // past the sandbox boundary between two plugins: every relative OR absolute
    // import, of every extension, must resolve inside `testDir` or it is rejected
    // with a fixed message before the default resolver — which reads straight
    // from the server filesystem — ever sees it. Bare imports (express, pino,
    // typeorm, @sap-cloud-sdk/*, @sap/xssec, passport, …) are replaced by the
    // universal stub and inlined, so business-logic unit tests load identically
    // in dev and in the pruned production image instead of crashing with
    // "Cannot find module 'express'"; each stubbed package is named in the
    // response (CR-14). See createSandboxResolvePlugin above.
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
    } catch (buildErr: any) {
      const msg = (buildErr?.message || String(buildErr)).slice(0, 4000);
      // `buildError` lets the client auto-heal (ask the AI to repair the offending
      // generated module/test code) and retry, rather than surfacing a dead end.
      return NextResponse.json(
        { output: '', error: `Compilation failed:\n${msg}`, exitCode: 1, testResults: [], buildError: true },
        { status: 200 },
      );
    }

    // ── 3) Write the in-process runner (TAP, optional name filtering) ───────
    const patternEnv = Array.isArray(selectedTestIds)
      ? selectedTestIds.map((id: string) => String(id).replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean).join('|')
      : '';

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

    // ── F-01: hard network-egress block for the untrusted sandbox ───────────
    // Unit tests need no network. This preload neutralises every outbound path
    // (GCP metadata endpoint 169.254.169.254, internal services, the internet)
    // BEFORE the test bundle loads — closing the runtime-identity token
    // exfiltration path. The child already runs under Node's permission model
    // (no child-process / worker / native-addon escape), and Node built-ins are
    // process singletons, so pure-JS test code cannot obtain an un-patched socket.
    // Every http/https/tls/http2/fetch(undici) egress funnels through
    // net.Socket.prototype.connect, so neutralising it covers TCP comprehensively.
    // The guard is never removed. It used to be skipped whenever
    // S4_TEST_RUNNER_EGRESS_ENFORCED was 'true', which meant one variable both
    // unlocked live tenant credentials and deleted the only defence standing
    // between generated test code and the metadata endpoint — two effects that
    // cannot see each other at the call site. A live run that has passed the
    // egress attestation now narrows the guard to the S/4 host allowlist
    // instead of dropping it: the tenant call it needs is permitted, everything
    // else still throws. Defense-in-depth, not a formal microVM boundary — see
    // docs for the isolated-runner roadmap item.
    // The live decision is made here, before the guard is written, because the
    // guard's shape depends on it. Asking for a live run that is not permitted
    // fails the request outright rather than quietly falling back to the mock —
    // a caller who asked to talk to a tenant must not be told a sandbox result
    // is the same thing.
    //
    // Before any measurement: the documented lock (lib/locked-paths.ts, G0:R0).
    // The attestation below can only ever say "not restricted"; reopening is a
    // decision with conditions, and a probe passing is not one of them.
    const live =
      s4Environment !== 'live'
        ? { permitted: false, reason: 'sandbox run', attestation: null }
        : LIVE_TEST_EXECUTION.locked
          ? { permitted: false, reason: LIVE_TEST_EXECUTION.userNotice, attestation: null }
          : await liveRunnerPermitted();

    if (s4Environment === 'live' && !live.permitted) {
      return NextResponse.json(
        { output: '', error: live.reason, exitCode: 1, testResults: [] },
        { status: 403 },
      );
    }

    const netGuardPath = path.join(testDir, '__netguard.mjs');
    {
      // In an attested live run the tenant host has to be reachable or the
      // feature is pointless, so TCP is narrowed to the S/4 allowlist rather
      // than closed. The metadata endpoint is an IP literal and matches no host
      // suffix, so it stays blocked on this path too — which is the property
      // that actually matters.
      const allowedSuffixes = live.permitted
        ? (process.env.S4_HOST_ALLOWLIST || '')
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
        : [];

      await fs.writeFile(netGuardPath, `import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
const BLOCK = () => { throw new Error('Network access is disabled in the Clean-Core.io test sandbox.'); };
const ALLOWED_SUFFIXES = ${JSON.stringify(allowedSuffixes)};
const realConnect = net.Socket.prototype.connect;
const realNetConnect = net.connect;
const realCreateConnection = net.createConnection;
// Reads the destination out of either connect() shape: connect(options) and
// connect(port, host). An address we cannot read is not an address we allow.
function targetHost(args) {
  const first = args[0];
  if (first && typeof first === 'object') return String(first.host || first.hostname || '');
  if (typeof args[1] === 'string') return args[1];
  return '';
}
// A suffix is a *domain*, so it matches at a label boundary and nowhere else.
// Plain endsWith let 'evil-sap.com' through an allowlist of 'sap.com' — a host
// an attacker can register, reached by the one process that holds decrypted
// tenant credentials (security audit of v2.13.0).
function allowed(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  return ALLOWED_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
}
function gate(real) {
  return function (...args) {
    if (!allowed(targetHost(args))) BLOCK();
    return real.apply(this, args);
  };
}
if (ALLOWED_SUFFIXES.length > 0) {
  try { net.Socket.prototype.connect = gate(realConnect); } catch {}
  try { net.connect = gate(realNetConnect); net.createConnection = gate(realCreateConnection); } catch {}
} else {
  try { net.Socket.prototype.connect = BLOCK; } catch {}
  try { net.connect = BLOCK; net.createConnection = BLOCK; } catch {}
}
try { dgram.createSocket = BLOCK; } catch {}
// The factory is not the only UDP path — the exported Socket constructor and its
// prototype methods can build and send datagrams directly, so neutralise them too.
try {
  if (dgram.Socket && dgram.Socket.prototype) {
    dgram.Socket.prototype.send = BLOCK;
    dgram.Socket.prototype.bind = BLOCK;
    dgram.Socket.prototype.connect = BLOCK;
  }
} catch {}
try { dgram.Socket = BLOCK; } catch {}
try { process.binding = BLOCK; } catch {}
// fetch/undici reaches the network through net.Socket.prototype.connect, so on
// the allowlisted path it is left in place and the socket gate decides. With no
// allowlist there is nothing it could legitimately reach, so it is closed here
// too rather than relying on a single choke point.
if (ALLOWED_SUFFIXES.length === 0) {
  try { globalThis.fetch = BLOCK; } catch {}
}
// DNS uses the native c-ares/getaddrinfo resolver, which bypasses net.Socket — block
// every JS entry point so DNS queries (incl. DNS-tunnelling exfil) cannot leave either.
// An allowlisted live run must be able to resolve the tenant host, so DNS stays
// available there; the socket gate is what decides where a connection may go.
// This is the one place the narrowed guard is genuinely weaker than the closed
// one — DNS tunnelling is possible again — and it is why live mode needs the
// infrastructure policy underneath it, not just this file.
if (ALLOWED_SUFFIXES.length === 0) {
  for (const o of [dns, dns.promises, dns.Resolver && dns.Resolver.prototype]) {
    if (!o) continue;
    for (const k of Object.getOwnPropertyNames(o)) {
      try { if (typeof o[k] === 'function') o[k] = BLOCK; } catch {}
    }
  }
}
`);
    }

    // ── 4) Resolve S/4 credentials server-side (F-03), never from the body ──
    let s4Env: Record<string, string> = {};
    if (s4Environment === 'live') {
      // The egress gate already ran above, before the guard was written; getting
      // here means it passed.

      // Audit P1: re-verify tenant access here too. A user whose S/4 access was
      // revoked must not be able to use stored live credentials via the test runner.
      try {
        await assertS4TenantAccess(decodedToken.uid);
      } catch (e: any) {
        return NextResponse.json(
          { output: '', error: e?.message || 'S/4HANA live access is not permitted.', exitCode: 1 },
          { status: 403 },
        );
      }
      const c = await loadS4ConfigForUser(decodedToken.uid);
      if (c) {
        s4Env = {
          S4_TENANT_URL: c.url || '',
          S4_USERNAME: c.username || '',
          S4_PASSWORD: c.password || '',
          S4_AUTH_TYPE: c.authType || 'basic',
        };
      }
    }

    // ── 5) Start the sandboxed child (no shell, no exec string) ─────────────
    // --max-old-space-size caps the child V8 heap so a heap-bomb test OOMs the
    // child instead of the whole instance.
    const args: string[] = [`--max-old-space-size=${CHILD_HEAP_MB}`];
    if (permissionFlag && permissionFlag !== 'none') {
      args.push(
        permissionFlag,
        `--allow-fs-read=${testDir}`,
        `--allow-fs-read=${projectNodeModules}`,
        `--allow-fs-write=${testDir}`
      );
    }
    // F-01: preload the network-egress block before the test runner. This is
    // unconditional. It used to be skipped on the same env var that unlocked
    // live mode, so the one run holding real tenant credentials was also the
    // one run with no guard loaded at all.
    // The layer that holds against node:sqlite on the Node that has it —
    // see sqliteSwitchSupported. Not conditional on anything else.
    if (sqliteSwitchSupported()) args.push('--no-experimental-sqlite');
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
      SYSTEMROOT: process.env.SYSTEMROOT || '',
      NODE_ENV: 'test',
      SANDBOX_TEST_PATTERNS: patternEnv,
      ...s4Env,
    };

    const { stdout, stderr, exitCode } = await runSandboxed(args, testDir, childEnv);

    const testResults = parseTapOutput(stdout);

    // ── 6) The verdicts and the receipt: what the server saw, the server writes ─
    //
    // The receipt is written with the Admin SDK onto the project, under a key the
    // client update allowlist of `firestore.rules` does not contain — so a browser
    // cannot produce one and the rules need no change to say so. Until it existed,
    // the phase contract read `project.testCases[].status`, which the owner may
    // write and which nothing in the product ever wrote: a row of `Passed`
    // strings unlocked Testing and Delivery, in green, with no execution behind
    // them (QA full review of a19945ef01dc, E07-F02).
    //
    // The verdicts go down beside it, in the same write, because the receipt
    // alone left the honest path leading nowhere (QA 6c38e0c7c620). The testing
    // page had never stored the verdicts it displayed, so after E07-F02 a real
    // server run could no longer make Testing or Delivery green either: the
    // contract wants a verdict *and* a receipt, and nothing produced the first
    // half. Asking the browser to write it back would have put the claim in the
    // one place a browser can forge. The run is observed here, so it is recorded
    // here — one `set`, so a reader never finds a receipt without the verdicts it
    // vouches for or verdicts without the receipt that earns them.
    //
    // This does not make `testCases[].status` trustworthy and is not meant to:
    // the owner can still write `Passed` into it, and that still reads as
    // `Self-reported` because `attestedPasses` is counted from the receipt below
    // and from nothing else. What changed is that an execution now leaves its
    // result where the reader and the contract both look.
    //
    // Writing them does not retire the receipt: `artefactDigest('testCases', …)`
    // hashes the case list without `status` and `message`, exactly so that
    // running a suite cannot freshen it and flipping a verdict cannot invalidate
    // it.
    //
    // Bound to what was executed — the active run, and the digests of the code,
    // the suite and the case list — so regenerating any of them retires the
    // receipt instead of leaving it vouching for something else.
    //
    // Only the runner's own verdicts go in, and only for cases the project
    // actually holds: a suite that names a case the project does not have would
    // otherwise write a verdict for a case no reader can see.
    const subject = testRunSubject(projectData);
    const storedCases = (Array.isArray(projectData.testCases) ? projectData.testCases : []).filter(
      (t): t is Record<string, unknown> => !!t && typeof t === 'object',
    );
    const known = new Set(storedCases.map((t) => String(t.id ?? '')).filter(Boolean));
    // Roadmap 7.3: the scope and the stubs go into the record beside the
    // environment. Both were already known here and neither survived the
    // response — the scope only ever reached `SANDBOX_TEST_PATTERNS`, and the
    // stub list only ever reached one banner on one screen. A later reader
    // asking "what did this run actually cover, and against what" had no way to
    // answer, and the receipt is the thing that outlives the screen.
    //
    // `selected` is the ids the caller asked for, and `null` when it asked for
    // the whole suite; `[]` would say "the caller asked for nothing", which is a
    // different run. The ids are narrowed to cases the project holds for the
    // same reason the verdicts are: a scope naming cases no reader can see is
    // not a scope anybody can check.
    const selectedScope = Array.isArray(selectedTestIds)
      ? [...new Set(selectedTestIds.map((id: unknown) => String(id)).filter((id: string) => known.has(id)))].sort()
      : null;
    // Every stored case, carrying this run's verdict — or `Not run` where the
    // runner said nothing about it, which is what an unselected or unreported
    // case is. A case keeps no verdict from an earlier run: the receipt beside
    // it only covers this one, and the two have to describe the same run.
    const executedCases = applyRunnerVerdicts(storedCases, testResults, exitCode);
    // `environment: 'mock'` below is a constant, and a constant is only honest
    // while nothing else can reach this line. Today nothing can: a live run is
    // refused at the lock long before here. But the lock is a decision someone
    // will one day reverse, and a receipt that then says "mock" about a run
    // against a real tenant is worse than no receipt — it is a signed sentence
    // that is false (security audit of b88c77b, SEC-b88c77b-18). So the
    // assumption is checked where it is used rather than trusted from a
    // hundred lines above: if this was not a sandbox run, no receipt is written
    // at all, and the caller is told why.
    if (s4Environment === 'live') {
      logger.error('run-tests: a live run reached the receipt, which only describes sandbox runs', { projectId: sanitizedProjectId });
      return NextResponse.json(
        {
          output: '',
          error:
            'This run executed against a live tenant, and the receipt format only describes sandbox runs. ' +
            'No receipt was written. Reopening live execution needs a receipt that names the environment it ran in.',
          exitCode: 1,
          testResults: [],
        },
        { status: 501 },
      );
    }
    const receipt: TestRunReceipt = {
      v: TEST_RUN_RECEIPT_VERSION,
      runId: subject.runId,
      codeDigest: subject.codeDigest,
      suiteDigest: subject.suiteDigest,
      casesDigest: subject.casesDigest,
      environment: 'mock',
      scope: { selected: selectedScope, cases: storedCases.length },
      stubs: [...stubbedPackages].sort(),
      executedAt: new Date().toISOString(),
      executedBy: decodedToken.uid,
      exitCode,
      verdicts: testResults
        .filter((r) => known.has(r.id))
        .map((r) => ({ id: r.id, status: r.status as TestRunReceipt['verdicts'][number]['status'] })),
    };
    let recorded = false;
    try {
      const { db } = await getAdminDb();
      await db
        .collection('projects')
        .doc(sanitizedProjectId)
        .set(
          storedCases.length > 0
            ? { testCases: executedCases, testRunReceipt: receipt }
            : { testRunReceipt: receipt },
          { merge: true },
        );
      recorded = true;
    } catch (receiptErr) {
      // The run happened; the record of it did not. Reported rather than
      // swallowed into a green screen: without the receipt the phase contract
      // will read the suite as self-reported, which is the honest outcome.
      logger.error('run-tests: the execution receipt could not be written', {
        route: 'api/run-tests',
        projectId: sanitizedProjectId,
        error: errMessage(receiptErr),
      });
    }

    // The receipt travels back so the page the reader is looking at can show the
    // run it just watched without a reload. It is a copy of what was stored, not
    // a second source: `null` when the write failed, because a client that
    // painted itself green off an unstored receipt would be claiming exactly the
    // thing the receipt exists to stop.
    return NextResponse.json({
      output: stdout,
      error: stderr,
      exitCode,
      testResults,
      stubbedPackages: [...stubbedPackages].sort(),
      receipt: recorded ? receipt : null,
    });
  } catch {
    // A fixed message: an internal error's own text can carry filesystem paths
    // or other server detail, so it is logged, never returned to the caller.
    return NextResponse.json(
      { output: '', error: 'Internal Server Error during test execution.', exitCode: 1 },
      { status: 500 },
    );
  } finally {
    activeRuns--;
    try {
      if (testDir) await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
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
