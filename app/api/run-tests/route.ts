import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import fssync from 'fs';
import os from 'os';
import path from 'path';
import { isBuiltin } from 'module';
import { pathToFileURL } from 'url';
import { verifyRequestAuth, assertS4TenantAccess, assertMfaSatisfied, assertAccountActive } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';

/**
 * POST /api/run-tests
 *
 * Runs the generated node:test suite against the generated app code and returns
 * TAP results. Request/response contract is unchanged:
 *   IN : { tests, projectId, code, selectedTestIds, s4Environment }
 *   OUT: { output, error, exitCode, testResults }
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
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB stdout/stderr cap
const MAX_INPUT_BYTES = 2 * 1024 * 1024;   // 2 MB combined code/test payload

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

interface TestRunResult {
  id: string;
  name: string;
  status: 'Passed' | 'Failed';
  message?: string;
}

function parseTapOutput(stdout: string): TestRunResult[] {
  const results: TestRunResult[] = [];
  const lines = stdout.split('\n');
  const testLineRegex = /^(ok|not ok)\s+\d+\s+-\s+([A-Za-z0-9_]+):?\s*(.*)$/;

  let currentResult: TestRunResult | null = null;
  let inErrorBlock = false;
  let errorMessageLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(testLineRegex);

    if (match) {
      if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
        currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
      }

      const status = match[1] === 'ok' ? 'Passed' : 'Failed';
      const id = match[2];
      const name = match[3] || id;

      currentResult = {
        id,
        name,
        status,
        message: status === 'Passed' ? 'Verified by Node.js Test Runner' : 'Test assertion failed',
      };
      results.push(currentResult);
      inErrorBlock = false;
      errorMessageLines = [];
    } else if (currentResult && currentResult.status === 'Failed') {
      if (trimmed.startsWith('error:')) {
        inErrorBlock = true;
        errorMessageLines.push(trimmed.replace(/^error:\s*/, ''));
      } else if (inErrorBlock && (trimmed.startsWith('stack:') || trimmed.startsWith('---') || trimmed.startsWith('...'))) {
        inErrorBlock = false;
      } else if (inErrorBlock) {
        errorMessageLines.push(trimmed);
      }
    }
  }

  if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
    currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
  }

  return results;
}

// Node-version dependent permission flag. isolation:'none' needs Node >= 22.8.0;
// the flag was renamed from --experimental-permission to --permission in 23.5.0.
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

  const { tests, projectId, code, selectedTestIds, s4Environment } = await req.json();

  // ── Input validation ────────────────────────────────────────────────────
  const sanitizedProjectId = (projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitizedProjectId) {
    return NextResponse.json(
      { output: '', error: 'Invalid project ID.', exitCode: 1 },
      { status: 400 },
    );
  }

  const testCode = (tests && tests.code) ? tests.code : (tests && tests.spec) ? tests.spec : null;
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

  // Sandbox dir outside the project tree (never write into cwd).
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), `cc-tests-${sanitizedProjectId}-`));
  const projectNodeModules = path.join(process.cwd(), 'node_modules');

  try {
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

    // ── 2) Bundle in the parent: relative .ts/.js inlined, npm packages external ─
    // Plugin mirrors the tsx/Node resolution "import './x.js' → ./x.ts".
    const tsJsResolve = {
      name: 'ts-js-resolve',
      setup(build: any) {
        build.onResolve({ filter: /\.js$/ }, (args: any) => {
          if (args.kind === 'entry-point' || !args.path.startsWith('.')) return;
          const base = path.resolve(args.resolveDir, args.path);
          
          // Prevent directory traversal out of testDir
          if (!base.startsWith(testDir + path.sep) && base !== testDir) {
            return { errors: [{ text: 'Path traversal detected.' }] };
          }

          const tsCandidate = base.replace(/\.js$/, '.ts');
          if (fssync.existsSync(tsCandidate)) return { path: tsCandidate };
          return undefined;
        });
      },
    };

    // Make the sandbox hermetic: every bare npm import from the generated code
    // (express, pino, pino-pretty, typeorm, @sap-cloud-sdk/*, @sap/xssec, passport, …)
    // is replaced with the universal stub and inlined into the bundle. The suite only
    // needs Node built-ins (node:test / node:assert), and business-logic unit tests
    // never need real infra libraries — so stubbing unconditionally guarantees the
    // module under test loads identically in dev and in the pruned production image,
    // instead of crashing the whole suite with "Cannot find module 'express'".
    // Relative paths use the default resolver; Node built-ins stay external.
    const stubMissingPackages = {
      name: 'stub-missing-packages',
      setup(build: any) {
        build.onResolve({ filter: /.*/ }, (args: any) => {
          const p: string = args.path;
          if (args.kind === 'entry-point') return undefined;
          if (p.startsWith('.') || path.isAbsolute(p)) return undefined; // relative → default resolver
          if (p.startsWith('node:') || isBuiltin(p)) return { external: true };
          return { path: p, namespace: 'cc-stub' }; // any other bare import → universal stub, inlined
        });
        build.onLoad({ filter: /.*/, namespace: 'cc-stub' }, () => ({
          contents: stubModuleSource,
          loader: 'js',
        }));
      },
    };

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
        plugins: [tsJsResolve, stubMissingPackages],
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
    // Skipped only when the infra-level egress policy is enforced
    // (S4_TEST_RUNNER_EGRESS_ENFORCED), where controlled live-tenant egress is
    // handled at the network layer instead. Defense-in-depth, not a formal
    // microVM boundary — see docs for the isolated-runner roadmap item.
    const applyNetGuard = process.env.S4_TEST_RUNNER_EGRESS_ENFORCED !== 'true';
    const netGuardPath = path.join(testDir, '__netguard.mjs');
    if (applyNetGuard) {
      await fs.writeFile(netGuardPath, `import net from 'node:net';
import dgram from 'node:dgram';
import dns from 'node:dns';
const BLOCK = () => { throw new Error('Network access is disabled in the Clean-Core.io test sandbox.'); };
try { net.Socket.prototype.connect = BLOCK; } catch {}
try { net.connect = BLOCK; net.createConnection = BLOCK; } catch {}
try { dgram.createSocket = BLOCK; } catch {}
try { globalThis.fetch = BLOCK; } catch {}
try { process.binding = BLOCK; } catch {}
// DNS uses the native c-ares/getaddrinfo resolver, which bypasses net.Socket — block
// every JS entry point so DNS queries (incl. DNS-tunnelling exfil) cannot leave either.
for (const o of [dns, dns.promises, dns.Resolver && dns.Resolver.prototype]) {
  if (!o) continue;
  for (const k of Object.getOwnPropertyNames(o)) {
    try { if (typeof o[k] === 'function') o[k] = BLOCK; } catch {}
  }
}
`);
    }

    // ── 4) Resolve S/4 credentials server-side (F-03), never from the body ──
    let s4Env: Record<string, string> = {};
    if (s4Environment === 'live') {
      if (process.env.S4_TEST_RUNNER_EGRESS_ENFORCED !== 'true') {
        return NextResponse.json(
          {
            output: '',
            error: 'Live S/4HANA test execution is disabled until runner network egress is restricted by infrastructure policy.',
            exitCode: 1,
            testResults: [],
          },
          { status: 403 },
        );
      }

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
    const args = [];
    if (permissionFlag && permissionFlag !== 'none') {
      args.push(
        permissionFlag,
        `--allow-fs-read=${testDir}`,
        `--allow-fs-read=${projectNodeModules}`,
        `--allow-fs-write=${testDir}`
      );
    }
    // F-01: preload the network-egress block before the test runner.
    if (applyNetGuard) {
      args.push(`--import=${pathToFileURL(netGuardPath).href}`);
    }
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
    return NextResponse.json({ output: stdout, error: stderr, exitCode, testResults });
  } catch (err: any) {
    return NextResponse.json(
      { output: '', error: err?.message || 'Internal Server Error during test execution', exitCode: 1 },
      { status: 500 },
    );
  } finally {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
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
      if (outBytes <= MAX_OUTPUT_BYTES) stderr += d.toString();
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
