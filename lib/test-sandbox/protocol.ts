import { createHash } from 'node:crypto';
import { normalizeSandboxPath, MAX_SANDBOX_PATH, SANDBOX_PATTERN_ID, type SandboxFile } from './files';
import { CALL_CONTRACT_PATHS, MAX_ENGINE_CASES_BYTES, engineRunInputs } from './engine-suite';

/**
 * The wire contract between the app and the isolated test runner (roadmap 8.9).
 *
 * The runner is a separate Cloud Run service (`runner/`), reachable only by the
 * app. It takes files and a suite, runs them the way `./core.ts` runs them, and
 * reports what it ran: the SHA-256 of every file it received, the suite's hash
 * and the revision it says it runs as. The app compares those hashes with what
 * it sent before it writes a receipt — a report about different files is not a
 * report about this run. The revision is not compared with anything: the app
 * has no independent source for it (reading it from Cloud Run would need a role
 * the app's account does not hold), so it is recorded as the runner reported it
 * — self-reported, shape-checked only.
 *
 * Pure (node:crypto only): both sides import it, and the specs call it directly.
 */

export type RunnerMode = 'mock' | 'live';

/**
 * The wire version. 1 is everything before 3.0.12 (no `protocol` field). 2 adds
 * the engine pass: a request may carry `engine` (the engine cases and the call
 * contract module), and the report then carries `engine` with its own hashes
 * and output. A request with `engine` must say `protocol: 2`; a runner that
 * does not know 2 refuses it rather than silently running half of it.
 */
export const RUNNER_PROTOCOL_VERSION = 2;

/** Combined size of all file contents plus the suite. Same ceiling the route always had. */
export const MAX_RUN_INPUT_BYTES = 2 * 1024 * 1024;
/** The raw request body, JSON overhead included. */
export const MAX_RUN_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_RUN_FILES = 500;
export const MAX_RUN_PATTERNS = 500;

export interface RunnerProxy {
  /** Base URL of the app's credential proxy, e.g. `https://<app>.run.app/api/s4-proxy`. */
  baseUrl: string;
  /** Short-lived capability minted by the app for this one run. */
  capability: string;
}

export interface RunRequest {
  /** 2 when `engine` is present; absent from a version-1 app. */
  protocol?: number;
  files: SandboxFile[];
  suite: { code: string; patterns: string[] };
  mode: RunnerMode;
  proxy?: RunnerProxy;
  /**
   * 3.0.12 — the engine pass: the engine cases (`test/engine-cases.json` text)
   * and the path of the call contract module among `files`. The runner derives
   * the pass's files and suite from them (`engineRunInputs`); `patterns` are
   * the engine case ids to run, empty for all.
   */
  engine?: { cases: string; contractModule: string; patterns: string[] };
}

/** The engine pass as the runner reports it — hashed like the main run. */
export interface RunnerEngineReport {
  outcome: 'ran' | 'build-error';
  stdout: string;
  stderr: string;
  exitCode: number;
  buildError?: string;
  /** SHA-256 of every file of the pass (generated code, runtime, cases), sorted by path. */
  files: FileHash[];
  suiteSha256: string;
  casesSha256: string;
  contractModule: string;
}

export interface FileHash {
  path: string;
  sha256: string;
}

export interface RunnerReport {
  /** `build-error` means the bundle did not compile; nothing was executed. */
  outcome: 'ran' | 'build-error';
  stdout: string;
  stderr: string;
  exitCode: number;
  buildError?: string;
  stubbedPackages: string[];
  /** SHA-256 of every received file, as received, sorted by path. */
  files: FileHash[];
  suiteSha256: string;
  /**
   * `K_REVISION` as the runner reads it from its own environment. Self-reported:
   * the app checks only its shape (`parseRunnerReport`), never its value.
   */
  revision: string;
  mode: RunnerMode;
  /** 2 from 3.0.12 on; absent from an older runner. */
  protocol?: number;
  /** The engine pass, when the request asked for one. */
  engine?: RunnerEngineReport;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** The hashes a runner has to report for these inputs. */
export function hashRunInputs(files: SandboxFile[], suiteCode: string): { files: FileHash[]; suiteSha256: string; digest: string } {
  const hashed = files
    .map((f) => ({ path: f.path, sha256: sha256Hex(f.content) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const suiteSha256 = sha256Hex(suiteCode);
  // One digest over the whole set, for the receipt: canonical JSON of the sorted
  // list and the suite hash, so the same inputs give the same digest anywhere.
  const digest = sha256Hex(JSON.stringify({ files: hashed, suite: suiteSha256 }));
  return { files: hashed, suiteSha256, digest };
}

/**
 * The fixed network probe of the authorized negative test (roadmap 8.9): the
 * destinations the runner's server process tries on `POST /selftest-network`.
 * Shared so the runner and the app that judges its answer cannot drift — the
 * app accepts an answer only when it names exactly these targets.
 *
 * These are sample destinations, not a proof of a general egress boundary: an
 * unreached probe shows that these three were unreachable at that moment. The
 * boundary itself is the runner VPC without NAT and its firewall (SECURITY.md §7).
 */
export const RUNNER_NETWORK_PROBES = [
  { label: 'public host 8.8.8.8:53', host: '8.8.8.8', port: 53 },
  { label: 'public host www.google.com:443', host: 'www.google.com', port: 443 },
  { label: 'private address 10.10.0.1:443', host: '10.10.0.1', port: 443 },
] as const;

type Parsed<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

/**
 * Validates a run request as the runner receives it. Refuses rather than
 * repairs: the app normalises paths before it sends them, so a path that is not
 * already in normal form did not come from the app.
 *
 * `serviceMode` is the mode the service was deployed for. The mock runner runs
 * mock requests only and never opens a relay; the live runner runs live
 * requests only. `proxyOrigin`, when the service knows it, pins where a live
 * run's proxy may be.
 */
export function parseRunRequest(body: unknown, opts: { serviceMode: RunnerMode; proxyOrigin?: string }): Parsed<RunRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'The request is not a JSON object.');
  const b = body as Record<string, unknown>;

  const mode = b.mode;
  if (mode !== 'mock' && mode !== 'live') return fail(400, 'mode must be "mock" or "live".');
  if (mode !== opts.serviceMode) return fail(403, `This runner executes ${opts.serviceMode} runs only.`);

  if (!Array.isArray(b.files)) return fail(400, 'files must be an array.');
  if (b.files.length > MAX_RUN_FILES) return fail(413, 'Too many files.');
  const files: SandboxFile[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const f of b.files as unknown[]) {
    if (!f || typeof f !== 'object') return fail(400, 'Every file needs a path and a content.');
    const { path, content } = f as { path?: unknown; content?: unknown };
    if (typeof path !== 'string' || typeof content !== 'string') return fail(400, 'Every file needs a path and a content.');
    if (path.length > MAX_SANDBOX_PATH || normalizeSandboxPath(path) !== path) return fail(400, 'A file path is not a normalised relative path.');
    if (seen.has(path)) return fail(400, 'A file path appears twice.');
    seen.add(path);
    bytes += Buffer.byteLength(content, 'utf8');
    files.push({ path, content });
  }

  const suite = b.suite as { code?: unknown; patterns?: unknown } | undefined;
  if (!suite || typeof suite !== 'object' || typeof suite.code !== 'string' || !suite.code) return fail(400, 'suite.code is required.');
  bytes += Buffer.byteLength(suite.code, 'utf8');
  if (bytes > MAX_RUN_INPUT_BYTES) return fail(413, 'Test/code payload exceeds the allowed size limit.');

  const rawPatterns = suite.patterns === undefined ? [] : suite.patterns;
  if (!Array.isArray(rawPatterns) || rawPatterns.length > MAX_RUN_PATTERNS) return fail(400, 'suite.patterns must be a short array.');
  const patterns: string[] = [];
  for (const p of rawPatterns) {
    // Word characters, `.` and `-`: the case ids, taken literally — the core
    // escapes and anchors them (`testNamePattern`). A superset of what the app
    // sent before, so an older app's request still passes.
    if (typeof p !== 'string' || !SANDBOX_PATTERN_ID.test(p)) return fail(400, 'A test pattern may hold word characters, "." and "-" only.');
    patterns.push(p);
  }

  let proxy: RunnerProxy | undefined;
  if (mode === 'live') {
    const pr = b.proxy as { baseUrl?: unknown; capability?: unknown } | undefined;
    if (!pr || typeof pr.baseUrl !== 'string' || typeof pr.capability !== 'string') return fail(400, 'A live run needs proxy.baseUrl and proxy.capability.');
    let url: URL;
    try {
      url = new URL(pr.baseUrl);
    } catch {
      return fail(400, 'proxy.baseUrl is not a URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return fail(400, 'proxy.baseUrl must be a plain https URL.');
    if (opts.proxyOrigin && url.origin !== opts.proxyOrigin) return fail(403, 'proxy.baseUrl is not the app this runner serves.');
    if (!/^[A-Za-z0-9_.-]{20,2048}$/.test(pr.capability)) return fail(400, 'proxy.capability is malformed.');
    proxy = { baseUrl: pr.baseUrl.replace(/\/+$/, ''), capability: pr.capability };
  } else if (b.proxy !== undefined) {
    return fail(400, 'A mock run takes no proxy.');
  }

  let engine: RunRequest['engine'];
  if (b.engine !== undefined) {
    if (b.protocol !== RUNNER_PROTOCOL_VERSION) return fail(400, `An engine pass needs protocol ${RUNNER_PROTOCOL_VERSION}.`);
    const e = b.engine as { cases?: unknown; contractModule?: unknown; patterns?: unknown } | null;
    if (!e || typeof e !== 'object' || typeof e.cases !== 'string' || typeof e.contractModule !== 'string') return fail(400, 'engine needs cases and contractModule.');
    if (Buffer.byteLength(e.cases, 'utf8') > MAX_ENGINE_CASES_BYTES) return fail(413, 'The engine cases exceed the allowed size.');
    try {
      const parsedCases = JSON.parse(e.cases) as { cases?: unknown };
      if (!parsedCases || !Array.isArray(parsedCases.cases)) return fail(400, 'engine.cases holds no case list.');
    } catch {
      return fail(400, 'engine.cases is not JSON.');
    }
    if (!(CALL_CONTRACT_PATHS as readonly string[]).includes(e.contractModule)) return fail(400, 'engine.contractModule is not a call contract path.');
    if (!seen.has(e.contractModule)) return fail(400, 'engine.contractModule is not among the files.');
    const rawEnginePatterns = e.patterns === undefined ? [] : e.patterns;
    if (!Array.isArray(rawEnginePatterns) || rawEnginePatterns.length > MAX_RUN_PATTERNS) return fail(400, 'engine.patterns must be a short array.');
    const enginePatterns: string[] = [];
    for (const p of rawEnginePatterns) {
      if (typeof p !== 'string' || !SANDBOX_PATTERN_ID.test(p)) return fail(400, 'A test pattern may hold word characters, "." and "-" only.');
      enginePatterns.push(p);
    }
    engine = { cases: e.cases, contractModule: e.contractModule, patterns: enginePatterns };
  } else if (b.protocol !== undefined && b.protocol !== 1 && b.protocol !== RUNNER_PROTOCOL_VERSION) {
    return fail(400, `Unknown protocol ${String(b.protocol)}.`);
  }

  return {
    ok: true,
    value: {
      ...(engine ? { protocol: RUNNER_PROTOCOL_VERSION } : {}),
      files,
      suite: { code: suite.code, patterns },
      mode,
      ...(proxy ? { proxy } : {}),
      ...(engine ? { engine } : {}),
    },
  };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Shape check of what a runner answered. `null` for anything that is not a report. */
export function parseRunnerReport(value: unknown): RunnerReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const ok =
    (r.outcome === 'ran' || r.outcome === 'build-error') &&
    typeof r.stdout === 'string' &&
    typeof r.stderr === 'string' &&
    typeof r.exitCode === 'number' &&
    (r.buildError === undefined || typeof r.buildError === 'string') &&
    Array.isArray(r.stubbedPackages) &&
    r.stubbedPackages.every((s) => typeof s === 'string') &&
    Array.isArray(r.files) &&
    r.files.every(
      (f) => !!f && typeof f === 'object' && typeof (f as FileHash).path === 'string' && HEX64.test(String((f as FileHash).sha256)),
    ) &&
    typeof r.suiteSha256 === 'string' &&
    HEX64.test(r.suiteSha256) &&
    typeof r.revision === 'string' &&
    r.revision.length > 0 &&
    r.revision.length <= 200 &&
    (r.mode === 'mock' || r.mode === 'live') &&
    (r.protocol === undefined || typeof r.protocol === 'number') &&
    (r.engine === undefined || isEngineReport(r.engine));
  return ok ? (r as unknown as RunnerReport) : null;
}

function isEngineReport(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.outcome === 'ran' || e.outcome === 'build-error') &&
    typeof e.stdout === 'string' &&
    typeof e.stderr === 'string' &&
    typeof e.exitCode === 'number' &&
    (e.buildError === undefined || typeof e.buildError === 'string') &&
    Array.isArray(e.files) &&
    e.files.every((f) => !!f && typeof f === 'object' && typeof (f as FileHash).path === 'string' && HEX64.test(String((f as FileHash).sha256))) &&
    typeof e.suiteSha256 === 'string' &&
    HEX64.test(e.suiteSha256) &&
    typeof e.casesSha256 === 'string' &&
    HEX64.test(e.casesSha256) &&
    typeof e.contractModule === 'string'
  );
}

/**
 * Does the runner's engine report describe the engine pass the app asked for?
 * The app derives the pass's files and suite itself (`engineRunInputs`) and
 * compares every hash, like `verifyRunnerReport` does for the main run.
 * `{ ok: true, digest }` names what ran; `missing` when the runner sent no
 * engine report at all (a runner revision older than protocol 2).
 */
export function verifyEngineReport(
  sent: { files: SandboxFile[]; engine: { cases: string; contractModule: string } },
  report: RunnerReport,
): { ok: true; digest: string } | { ok: false; missing: boolean; reason: string } {
  const e = report.engine;
  if (!e) return { ok: false, missing: true, reason: 'The runner did not run the engine cases (a runner revision before protocol 2).' };
  const inputs = engineRunInputs(sent.files, sent.engine.cases, sent.engine.contractModule);
  const expected = hashRunInputs(inputs.files, inputs.suiteCode);
  if (e.contractModule !== sent.engine.contractModule) return { ok: false, missing: false, reason: 'The runner reported a different contract module.' };
  if (e.casesSha256 !== inputs.casesSha256) return { ok: false, missing: false, reason: 'The runner reported different engine cases.' };
  if (e.suiteSha256 !== expected.suiteSha256) return { ok: false, missing: false, reason: 'The runner reported a different engine suite.' };
  const reported = [...e.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (reported.length !== expected.files.length) return { ok: false, missing: false, reason: 'The runner reported a different set of engine files.' };
  for (let i = 0; i < reported.length; i++) {
    if (reported[i].path !== expected.files[i].path || reported[i].sha256 !== expected.files[i].sha256) {
      return { ok: false, missing: false, reason: 'The runner reported an engine file the app did not derive.' };
    }
  }
  return { ok: true, digest: engineDigest(expected.files, expected.suiteSha256, inputs.casesSha256) };
}

/** One digest over the engine pass: its file hashes, its suite and its cases. */
export function engineDigest(files: FileHash[], suiteSha256: string, casesSha256: string): string {
  return sha256Hex(JSON.stringify({ files, suite: suiteSha256, cases: casesSha256 }));
}

/**
 * Does the runner's report describe the inputs the app sent? Every file the
 * app sent, with the same hash, and nothing else; the same suite; the mode
 * asked for. A mismatch means the report is about some other run and nothing
 * is recorded from it.
 */
export function verifyRunnerReport(
  sent: { files: SandboxFile[]; suiteCode: string; mode: RunnerMode },
  report: RunnerReport,
): { ok: true; digest: string } | { ok: false; reason: string } {
  const expected = hashRunInputs(sent.files, sent.suiteCode);
  if (report.mode !== sent.mode) return { ok: false, reason: 'The runner reported a different mode.' };
  if (report.suiteSha256 !== expected.suiteSha256) return { ok: false, reason: 'The runner reported a different suite.' };
  const reported = [...report.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (reported.length !== expected.files.length) return { ok: false, reason: 'The runner reported a different set of files.' };
  for (let i = 0; i < reported.length; i++) {
    if (reported[i].path !== expected.files[i].path || reported[i].sha256 !== expected.files[i].sha256) {
      return { ok: false, reason: 'The runner reported a file the app did not send.' };
    }
  }
  return { ok: true, digest: expected.digest };
}
