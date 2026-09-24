import http from 'node:http';
import { executeSandboxRun } from '../lib/test-sandbox/core';
import { parseRunRequest, MAX_RUN_REQUEST_BYTES, type RunnerMode, type RunnerReport } from '../lib/test-sandbox/protocol';
import { startRelay } from './relay';

/**
 * The isolated test runner (roadmap 8.9, CR-09).
 *
 * One HTTP endpoint, `POST /run`, deployed twice from one image:
 *
 *   - `clean-core-runner`      RUNNER_MODE=mock — runs mock suites. Its VPC
 *                              egress reaches nothing.
 *   - `clean-core-runner-live` RUNNER_MODE=live — runs live suites. Its VPC
 *                              egress reaches only the app (Private Google
 *                              Access); a run gets a loopback relay to the
 *                              app's credential proxy, never a credential.
 *
 * Both run as a service account without roles, carry no secrets, accept
 * traffic only from inside the project (`--ingress=internal`) and only from
 * callers holding `run.invoker` — the app. Cloud Run checks the caller's ID
 * token before a request reaches this process, so this server does not verify
 * it again (it could not fetch Google's keys from the mock runner anyway).
 *
 * Concurrency 1 (Cloud Run `--concurrency=1`, and refused here as well): one
 * run per instance, in a fresh temporary directory, removed afterwards.
 *
 * The image contains Node, this file bundled with the shared execution core
 * (`lib/test-sandbox/`), and esbuild — no app code, no `.env`, no secrets.
 */

const MODE: RunnerMode = process.env.RUNNER_MODE === 'live' ? 'live' : 'mock';
const PROXY_ORIGIN = (() => {
  try {
    return process.env.RUNNER_PROXY_ORIGIN ? new URL(process.env.RUNNER_PROXY_ORIGIN).origin : undefined;
  } catch {
    return undefined;
  }
})();
const REVISION = process.env.K_REVISION || 'unknown-revision';

let busy = false;

function send(res: http.ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        over = true;
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
    req.on('close', () => {
      if (over) resolve(null);
    });
  });
}

async function handleRun(req: http.IncomingMessage, res: http.ServerResponse) {
  if (busy) return send(res, 429, { error: 'This runner instance is busy.' });
  busy = true;
  let relay: Awaited<ReturnType<typeof startRelay>> | null = null;
  try {
    const raw = await readBody(req, MAX_RUN_REQUEST_BYTES);
    if (raw === null) return send(res, 413, { error: 'The request is too large.' });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'The request is not JSON.' });
    }
    const parsed = parseRunRequest(body, { serviceMode: MODE, proxyOrigin: PROXY_ORIGIN });
    if (!parsed.ok) return send(res, parsed.status, { error: parsed.error });
    const run = parsed.value;

    // Live: a loopback relay for this run only. It holds the capability and
    // the identity token; the child gets its address and nothing else.
    let extraEnv: Record<string, string> | undefined;
    if (run.mode === 'live' && run.proxy) {
      relay = await startRelay(run.proxy);
      extraEnv = {
        S4_TENANT_URL: relay.url,
        S4_AUTH_TYPE: 'proxy',
        S4_USERNAME: '',
        S4_PASSWORD: '',
      };
    }

    const outcome = await executeSandboxRun({
      files: run.files,
      suiteCode: run.suite.code,
      patterns: run.suite.patterns,
      allowUnsandboxed: false,
      extraEnv,
      loopback: relay ? { host: '127.0.0.1', port: relay.port } : null,
    });
    if (outcome.kind === 'unavailable') return send(res, 500, { error: outcome.reason });

    const report: RunnerReport =
      outcome.kind === 'build-error'
        ? {
            outcome: 'build-error',
            stdout: '',
            stderr: '',
            exitCode: 1,
            buildError: outcome.message,
            stubbedPackages: outcome.stubbedPackages,
            files: outcome.files,
            suiteSha256: outcome.suiteSha256,
            revision: REVISION,
            mode: run.mode,
          }
        : {
            outcome: 'ran',
            stdout: outcome.stdout,
            stderr: outcome.stderr,
            exitCode: outcome.exitCode,
            stubbedPackages: outcome.stubbedPackages,
            files: outcome.files,
            suiteSha256: outcome.suiteSha256,
            revision: REVISION,
            mode: run.mode,
          };
    return send(res, 200, report);
  } catch {
    // A fixed message: an internal error's text can carry paths.
    return send(res, 500, { error: 'Internal error in the test runner.' });
  } finally {
    if (relay) await relay.close();
    busy = false;
  }
}

/**
 * The network half of the authorized negative test (roadmap 8.9).
 *
 * The sandbox child is fenced twice — by the in-process guards and by the VPC.
 * A probe from inside the child therefore proves the pair, not the VPC alone.
 * This one runs from the server process, without the sandbox's guards, so what
 * it measures is the infrastructure: from here, a public host and a private
 * address must be unreachable in both modes. The targets are fixed; the caller
 * sends nothing but the request.
 *
 * Deliberately not probed: the metadata address. Every Cloud Run container
 * reaches its own metadata server — that is how the platform hands out identity
 * — so the protection there is the runner's service account having no roles, an
 * IAM fact the operator runbook (SECURITY.md §7) checks with gcloud.
 */
const NETWORK_PROBES: Array<{ label: string; host: string; port: number }> = [
  { label: 'public host 8.8.8.8:53', host: '8.8.8.8', port: 53 },
  { label: 'public host www.google.com:443', host: 'www.google.com', port: 443 },
  { label: 'private address 10.10.0.1:443', host: '10.10.0.1', port: 443 },
];

async function reachable(host: string, port: number): Promise<boolean> {
  const net = await import('node:net');
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 4000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function handleNetworkSelftest(res: http.ServerResponse) {
  const probes = [];
  for (const p of NETWORK_PROBES) probes.push({ target: p.label, reached: await reachable(p.host, p.port) });
  return send(res, 200, { mode: MODE, revision: REVISION, probes });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/run') {
    void handleRun(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/selftest-network') {
    void handleNetworkSelftest(res);
    return;
  }
  send(res, 404, { error: 'Not found.' });
});

// Generous against the app's own 100 s call timeout; the child is killed after 15 s.
server.requestTimeout = 110_000;
server.listen(Number(process.env.PORT) || 8080, () => {
  process.stdout.write(JSON.stringify({ severity: 'INFO', message: 'test runner listening', mode: MODE, revision: REVISION }) + '\n');
});
