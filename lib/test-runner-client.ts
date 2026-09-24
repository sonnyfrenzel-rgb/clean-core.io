import type { SandboxFile } from './test-sandbox/files';
import {
  parseRunnerReport,
  verifyRunnerReport,
  type RunnerMode,
  type RunnerProxy,
  type RunnerReport,
  type RunRequest,
} from './test-sandbox/protocol';

/**
 * Where a test run executes, decided on the server (roadmap 8.9, CR-09).
 *
 * "Dort oder gar nicht": generated tests execute in the isolated runner
 * service, or they do not execute. The one exception is the Firebase emulator
 * — local development and CI, where no runner is deployed — and it is named:
 * the response and the receipt say `local-emulator`, so nobody mistakes it for
 * the isolated runner.
 *
 *   mock → `RUNNER_URL` set               → the mock runner
 *          emulator build, no RUNNER_URL  → the app's own child process (named)
 *          otherwise                      → refused, 503, with a reason
 *   live → `RUNNER_LIVE_URL`, `RUNNER_SERVICE_ACCOUNT` and `S4_PROXY_BASE_URL`
 *          all set, and the credential key present → the live runner
 *          otherwise                      → refused. Never local, not even
 *                                           under the emulator.
 *
 * Pure: the route reads the environment through `readRunnerConfig` and passes
 * the result in, and the specs pass their own.
 */

export interface RunnerConfig {
  runnerUrl: string;
  runnerLiveUrl: string;
  runnerServiceAccount: string;
  proxyBaseUrl: string;
  proxyKeyPresent: boolean;
  /** True only in a build made for the Firebase emulator. */
  emulator: boolean;
}

export type RunnerTarget =
  | { kind: 'isolated'; url: string }
  | { kind: 'local-emulator' }
  | { kind: 'unavailable'; status: number; reason: string };

export const MOCK_RUNNER_UNAVAILABLE =
  'Test execution is unavailable: the isolated test runner is not configured on this deployment, and generated tests do not run inside the application service.';
export const LIVE_RUNNER_UNAVAILABLE =
  'Running generated tests against a connected tenant is locked on this deployment: the isolated live runner and its credential proxy are not configured.';

function httpsUrl(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password ? u.origin : '';
  } catch {
    return '';
  }
}

/**
 * The environment, read once per request. `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`
 * is read literally, so a production build — where the flag was not set at
 * build time — can never take the local path, whatever the runtime says.
 */
export function readRunnerConfig(): RunnerConfig {
  return {
    runnerUrl: process.env.RUNNER_URL || '',
    runnerLiveUrl: process.env.RUNNER_LIVE_URL || '',
    runnerServiceAccount: process.env.RUNNER_SERVICE_ACCOUNT || '',
    proxyBaseUrl: process.env.S4_PROXY_BASE_URL || '',
    proxyKeyPresent: !!process.env.S4_ENCRYPTION_KEY,
    emulator: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true',
  };
}

export function resolveRunnerTarget(mode: RunnerMode, cfg: RunnerConfig): RunnerTarget {
  if (mode === 'live') {
    const url = httpsUrl(cfg.runnerLiveUrl);
    const proxy = httpsUrl(cfg.proxyBaseUrl);
    if (url && proxy && cfg.runnerServiceAccount.trim() && cfg.proxyKeyPresent) return { kind: 'isolated', url };
    return { kind: 'unavailable', status: 403, reason: LIVE_RUNNER_UNAVAILABLE };
  }
  const url = httpsUrl(cfg.runnerUrl);
  if (url) return { kind: 'isolated', url };
  if (cfg.emulator) return { kind: 'local-emulator' };
  return { kind: 'unavailable', status: 503, reason: MOCK_RUNNER_UNAVAILABLE };
}

/** The proxy base the live runner is told to call: the app's run.app origin plus the route. */
export function proxyBaseFor(cfg: RunnerConfig): string {
  return `${httpsUrl(cfg.proxyBaseUrl)}/api/s4-proxy`;
}

export const RUNNER_CALL_TIMEOUT_MS = 100_000;

export type RunnerCallResult =
  | { ok: true; report: RunnerReport; filesDigest: string }
  | { ok: false; status: number; reason: string };

/**
 * Calls the isolated runner and checks its answer against what was sent.
 *
 * The ID token is minted for the runner's URL (Cloud Run checks the audience
 * and the app's `run.invoker` binding before the runner sees the request).
 * A report whose file hashes, suite hash or mode differ from the request is
 * refused: it describes some other run.
 */
export async function callIsolatedRunner(
  url: string,
  input: { files: SandboxFile[]; suiteCode: string; patterns: string[]; mode: RunnerMode; proxy?: RunnerProxy },
  deps: {
    idToken(audience: string): Promise<string>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<RunnerCallResult> {
  const body: RunRequest = {
    files: input.files,
    suite: { code: input.suiteCode, patterns: input.patterns },
    mode: input.mode,
    ...(input.proxy ? { proxy: input.proxy } : {}),
  };
  let token: string;
  try {
    token = await deps.idToken(url);
  } catch {
    return { ok: false, status: 503, reason: 'The app could not obtain an identity for the test runner.' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? RUNNER_CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(`${url}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error',
    });
  } catch {
    clearTimeout(timer);
    return { ok: false, status: 502, reason: 'The test runner could not be reached.' };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const msg = json && typeof (json as { error?: unknown }).error === 'string' ? String((json as { error: string }).error).slice(0, 300) : '';
    return { ok: false, status: 502, reason: `The test runner refused the run (HTTP ${res.status})${msg ? `: ${msg}` : '.'}` };
  }
  const report = parseRunnerReport(json);
  if (!report) return { ok: false, status: 502, reason: 'The test runner answered with something that is not a run report.' };
  const check = verifyRunnerReport({ files: input.files, suiteCode: input.suiteCode, mode: input.mode }, report);
  if (!check.ok) return { ok: false, status: 502, reason: `${check.reason} Nothing was recorded from this run.` };
  return { ok: true, report, filesDigest: check.digest };
}
