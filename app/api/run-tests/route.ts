import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyRequestAuth, assertS4TenantAccess, assertMfaSatisfied, assertAccountActive, getAdminDb } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';
import { isUrlSafe, readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { assertRateLimit } from '@/lib/rate-limit';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { parseTapOutput, applyRunnerVerdicts } from '@/lib/test-verdicts';
import { testRunSubject, sameTestRunInputs, coveringTestRunReceipt, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '@/lib/test-receipt';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { loadDraftForRun, recordDraftExecution } from '@/lib/repair-draft-store';
import type { RepairDraft } from '@/lib/repair-draft';
import { executeSandboxRun, type SandboxRunOutcome } from '@/lib/test-sandbox/core';
import { sandboxFilesFromStoredCode, sandboxPatterns } from '@/lib/test-sandbox/files';
import { engineDigest, hashRunInputs, MAX_RUN_INPUT_BYTES, MAX_RUN_PATTERNS, type RunnerProxy } from '@/lib/test-sandbox/protocol';
import { readRunnerConfig, resolveRunnerTarget, callIsolatedRunner, proxyBaseFor, type RunnerTarget } from '@/lib/test-runner-client';
import { fetchMetadataIdToken } from '@/lib/google-id-token';
import { capabilityKeyFromEnv, mintCapability } from '@/lib/s4-proxy-capability';
import { registerCapability, revokeCapability } from '@/lib/s4-proxy-capability-store';
import { credentialHeaders } from '@/lib/s4-proxy';
import { logger, errMessage } from '@/lib/logger';
import { isFirestoreId } from '@/lib/firestore-id';
import { nextTestRunFailure, type TestRunFailure, type TestRunFailureKind } from '@/lib/testing-closure';
import { probeBasis, type MutantExecution } from '@/lib/testing-mutation';
import { runMutationProbe, MUTANT_CALL_TIMEOUT_MS } from '@/lib/testing-mutation-run';
import type { SandboxFile } from '@/lib/test-sandbox/files';
import { engineRunInputs } from '@/lib/test-sandbox/engine-suite';
import { engineVerdicts, mergeEngineVerdicts, planEngineRun, type EngineRunPlan } from '@/lib/engine-case-run';

/**
 * POST /api/run-tests
 *
 * Runs the project's stored node:test suite against its stored generated code
 * and returns TAP results.
 *   IN : { projectId, selectedTestIds, s4Environment, draftId? }
 *   OUT: { output, error, exitCode, testResults, stubbedPackages, runner, receipt }
 *
 *   IN : { projectId, mutationProbe: true }   (3.0.10, external review F-05)
 *   OUT: { mutation, receipt } - the suite run again against a few deterministic
 *        mutants of the code (`lib/testing-mutation.ts`), recorded on the receipt
 *        it probed. Only on a receipt of a passing run of the whole suite.
 *
 * WHERE IT RUNS (roadmap 8.9, CR-09 — "there or not at all"):
 *   Generated code is untrusted and does not execute in this service. It runs
 *   in the isolated runner (`runner/`, a Cloud Run service with a service
 *   account without roles, no secrets, ingress internal, egress through a VPC
 *   without NAT), reached with the app's own ID token. The runner reports the
 *   SHA-256 of every file it ran and its (self-reported) revision; the hashes
 *   are checked against what was sent before anything is recorded
 *   (`lib/test-runner-client.ts`).
 *
 *   Without `RUNNER_URL` a deployed build refuses to run tests at all. Only an
 *   emulator build (local development, CI) runs the same execution core
 *   (`lib/test-sandbox/core.ts`) in a child process of its own, and says so:
 *   `runner.kind` is `local-emulator` in the response and in the receipt.
 *
 * LIVE RUNS: locked (lib/locked-paths.ts, G0:R0). Behind the lock, a live run
 *   needs the live runner and its credential proxy configured. The runner never
 *   receives a credential: it gets a short-lived capability for this one run,
 *   and the app's proxy (`/api/s4-proxy`) puts the decrypted credentials on each
 *   request to the one tenant host the capability names. The capability is
 *   deleted when the run returns.
 *
 * F-03: S/4HANA credentials are loaded SERVER-SIDE (encrypted store) by the
 *   authenticated UID — never taken from the request body, never sent anywhere
 *   but the tenant.
 */

const MAX_CONCURRENT_RUNS = 4;             // per-instance cap on simultaneous heavy runs

// Per-instance counter of in-flight runs. Bounds how many executions one app
// instance drives at once, so a single approved user cannot exhaust it by
// firing many runs in parallel (Audit F-01 sub-finding).
let activeRuns = 0;

// What a run request may be, read before anything is parsed. The body names a
// project, its selected cases and an environment; the client also still sends
// the project's code and suite, which are ignored (see below) but have to fit.
// Four times the runner's own input ceiling leaves room for both copies and
// their JSON escaping, and replaces "whatever the platform accepts" as the
// bound on what an approved caller can make this route buffer (QA full review
// of fc787674705f, 1988ea0fc1b6).
const RUN_REQUEST_BODY_LIMITS = { maxBytes: 4 * MAX_RUN_INPUT_BYTES, timeoutMs: 30_000 };

/** What an execution produced, whichever executor produced it. */
interface Execution {
  buildError: string | null;
  stdout: string;
  stderr: string;
  exitCode: number;
  stubbedPackages: string[];
  runner: NonNullable<TestRunReceipt['runner']>;
  /**
   * 3.0.12 — the engine pass through the call contract: its TAP output and the
   * digest of what ran (checked against what the app derived), or why its
   * verdicts are not used. Absent when no engine pass was planned.
   */
  engine?: { ran: true; stdout: string; digest: string; contractModule: string } | { ran: false; reason: string };
}

/**
 * ADR-094 — a run of the project's own suite that gave no result is recorded
 * as such: `testRunFailure` on the project, server-written (a key the client
 * allowlist of `firestore.rules` does not contain), with the kind, the first
 * line of the cause, the time, the account and how many attempts in a row
 * failed for the same code and suite. Before it, such a run left nothing
 * behind and every view said "no test run on record" (owner report
 * 11.10.2026). Written only onto the project this run read, as it stood when
 * it was read — the receipt's own condition — and never for a draft run (its
 * code and suite are a candidate, not the project's). A failure to record is
 * logged and does not change the answer: the run's own error still goes back.
 */
async function recordRunFailure(
  projectId: string,
  uid: string,
  read: Record<string, unknown>,
  kind: TestRunFailureKind,
  cause: string,
): Promise<TestRunFailure | null> {
  try {
    const { db } = await getAdminDb();
    const ref: DocumentReference = db.collection('projects').doc(projectId);
    return await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return null;
      const now = (fresh.data() || {}) as Record<string, unknown>;
      if (now.userId !== uid || !sameTestRunInputs(read, now)) return null;
      const failure = nextTestRunFailure(now.testRunFailure, {
        subject: testRunSubject(now),
        at: new Date().toISOString(),
        by: uid,
        kind,
        cause,
        receiptAt: coveringTestRunReceipt(now)?.executedAt ?? null,
      });
      tx.set(ref, { testRunFailure: failure }, { merge: true });
      return failure;
    });
  } catch (err) {
    logger.error('run-tests: the failed run could not be recorded', { route: 'api/run-tests', projectId, error: errMessage(err) });
    return null;
  }
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
  //
  // Roadmap 8.7: `draftId` is the one exception, and it is not code — it names
  // a repair draft the server itself wrote (`lib/repair-draft.ts`). With it the
  // runner executes exactly that draft and records the receipt on the draft,
  // never on the project; see the draft block below and step 6.
  let runRequest: any;
  try {
    runRequest = await readBoundedJson(new Response(req.body, { headers: req.headers }), RUN_REQUEST_BODY_LIMITS);
  } catch (bodyErr) {
    const tooLarge = bodyErr instanceof ResponseLimitError;
    return NextResponse.json(
      { output: '', error: tooLarge ? 'The run request is too large.' : 'Invalid request body.', exitCode: 1 },
      { status: tooLarge ? 413 : 400 },
    );
  }
  const { projectId, selectedTestIds, s4Environment, draftId: rawDraftId } = runRequest ?? {};
  // The runner refuses more patterns than this; refused here, before any work.
  if (Array.isArray(selectedTestIds) && selectedTestIds.length > MAX_RUN_PATTERNS) {
    return NextResponse.json(
      { output: '', error: 'Too many test cases selected.', exitCode: 1 },
      { status: 400 },
    );
  }
  // Checked before the id forms any document path (SEC-2026-514).
  const draftId = isFirestoreId(rawDraftId) ? rawDraftId : '';
  if (rawDraftId !== undefined && rawDraftId !== null && !draftId) {
    return NextResponse.json(
      { output: '', error: 'Invalid repair draft id.', exitCode: 1 },
      { status: 400 },
    );
  }
  if (draftId && s4Environment === 'live') {
    return NextResponse.json(
      { output: '', error: 'A repair draft runs in the sandbox only.', exitCode: 1 },
      { status: 400 },
    );
  }

  // The documented lock (lib/locked-paths.ts, G0:R0) refuses a live run before any work:
  // nothing is written, bundled, probed or loaded for a path that is closed.
  if (s4Environment === 'live' && LIVE_TEST_EXECUTION.locked) {
    return NextResponse.json(
      { output: '', error: LIVE_TEST_EXECUTION.userNotice, exitCode: 1, testResults: [], locked: LIVE_TEST_EXECUTION.id },
      { status: 403 },
    );
  }

  // ── Input validation ────────────────────────────────────────────────────
  // Refused, not repaired: a stripped id would name a different project (SEC-2026-514).
  if (!isFirestoreId(projectId)) {
    return NextResponse.json(
      { output: '', error: 'Invalid project ID.', exitCode: 1 },
      { status: 400 },
    );
  }
  const sanitizedProjectId: string = projectId;

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

  // Roadmap 8.7: a repair draft instead of the stored artefacts. Only the
  // caller's own draft on this project, intact and not yet adopted — the store
  // refuses everything else — and then exactly its code and suite, nothing the
  // body says. Without this the retry after an auto-heal ran the old code.
  let draft: RepairDraft | null = null;
  if (draftId) {
    try {
      const { db } = await getAdminDb();
      const loaded = await loadDraftForRun(db, { projectId: sanitizedProjectId, uid: decodedToken.uid, draftId });
      if (!('draft' in loaded)) {
        return NextResponse.json(
          { output: '', error: loaded.error, exitCode: 1, code: loaded.code },
          { status: loaded.status },
        );
      }
      draft = loaded.draft;
    } catch {
      return NextResponse.json(
        { output: '', error: 'The repair draft could not be read.', exitCode: 1 },
        { status: 500 },
      );
    }
  }

  const storedSuite = projectData.testSuite as { code?: unknown; spec?: unknown } | undefined;
  const testCode = draft
    ? draft.suiteCode || null
    : storedSuite && typeof storedSuite.code === 'string' && storedSuite.code
      ? storedSuite.code
      : storedSuite && typeof storedSuite.spec === 'string' && storedSuite.spec
        ? storedSuite.spec
        : null;
  const code = draft ? draft.generatedCode : typeof projectData.generatedCode === 'string' ? projectData.generatedCode : '';
  if (!testCode) {
    return NextResponse.json(
      { output: '', error: "No test code provided. Please click 'Regenerate Tests' to create a Node.js test suite.", exitCode: 1 },
      { status: 400 },
    );
  }

  const totalInputBytes = Buffer.byteLength(testCode, 'utf8') + (code ? Buffer.byteLength(code, 'utf8') : 0);
  if (totalInputBytes > MAX_RUN_INPUT_BYTES) {
    return NextResponse.json(
      { output: '', error: 'Test/code payload exceeds the allowed size limit.', exitCode: 1 },
      { status: 413 },
    );
  }

  // ── Where it runs: the isolated runner, or — in an emulator build only — the
  //    named local path; anything else is refused here, before any work ──────
  const mode = s4Environment === 'live' ? 'live' : 'mock';
  const runnerConfig = readRunnerConfig();
  const target = resolveRunnerTarget(mode, runnerConfig);

  // 3.0.10 - the mutation probe of the recorded run. Its own mode: it executes
  // the stored code's mutants with the stored suite, records no failed run (a
  // probe is not a run of the project's suite) and writes only onto the
  // receipt it probed.
  if (runRequest?.mutationProbe === true) {
    if (draft || mode !== 'mock') {
      return NextResponse.json(
        { output: '', error: "The mutation probe runs on the project's own suite against mocks only.", exitCode: 1 },
        { status: 400 },
      );
    }
    if (target.kind === 'unavailable') {
      return NextResponse.json({ output: '', error: target.reason, exitCode: 1 }, { status: target.status });
    }
    if (activeRuns >= MAX_CONCURRENT_RUNS) {
      return NextResponse.json(
        { output: '', error: 'The test runner is at capacity right now. Please retry in a few seconds.', exitCode: 1 },
        { status: 429 },
      );
    }
    activeRuns++;
    try {
      return await mutationProbeResponse({
        projectId: sanitizedProjectId,
        uid: decodedToken.uid,
        projectData,
        code,
        testCode,
        target,
      });
    } catch (probeErr) {
      logger.error('run-tests: the mutation probe failed', { route: 'api/run-tests', projectId: sanitizedProjectId, error: errMessage(probeErr) });
      return NextResponse.json({ output: '', error: 'Internal Server Error during the mutation probe.', exitCode: 1 }, { status: 500 });
    } finally {
      activeRuns--;
    }
  }
  // A run of the project's own suite against mocks; a draft or a live run is not recorded as the project's failure.
  const recordsFailure = !draft && mode === 'mock';
  if (target.kind === 'unavailable') {
    const runFailure = recordsFailure
      ? await recordRunFailure(sanitizedProjectId, decodedToken.uid, projectData, 'runner-unavailable', target.reason)
      : null;
    return NextResponse.json(
      { output: '', error: target.reason, exitCode: 1, testResults: [], ...(runFailure ? { runFailure } : {}) },
      { status: target.status },
    );
  }

  const files = sandboxFilesFromStoredCode(code);
  const patterns = sandboxPatterns(selectedTestIds);
  // 3.0.12 (owner, 12.10.2026) — the engine cases run through the call contract
  // in the same executor as the suite, never in this service. Planned from the
  // stored cases and the generated files; a draft run plans it too, against
  // the draft's code.
  const enginePlanOutcome = planEngineRun(
    (Array.isArray(projectData.testCases) ? projectData.testCases : []).filter((t: unknown): t is Record<string, unknown> => !!t && typeof t === 'object'),
    files,
    Array.isArray(selectedTestIds) ? selectedTestIds.map((id: unknown) => String(id)) : null,
  );
  const enginePlan: EngineRunPlan | null = enginePlanOutcome.kind === 'planned' ? enginePlanOutcome.plan : null;
  if (patterns === null) {
    return NextResponse.json(
      { output: '', error: 'A selected test id holds characters the runner cannot filter on (letters, digits, "_", "." and "-" only).', exitCode: 1, testResults: [] },
      { status: 400 },
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

  // The capability of a live run, deleted in `finally` whatever happened.
  let capabilityId = '';

  try {
    // ── Live only: tenant access, then a capability — never a credential ─────
    let proxy: RunnerProxy | undefined;
    if (mode === 'live') {
      // Audit P1: re-verify tenant access here too. A user whose S/4 access was
      // revoked must not be able to reach the tenant through the test runner.
      try {
        await assertS4TenantAccess(decodedToken.uid);
      } catch (e) {
        return NextResponse.json(
          { output: '', error: (e as Error)?.message || 'S/4HANA live access is not permitted.', exitCode: 1, testResults: [] },
          { status: 403 },
        );
      }
      // The credentials are read here only to learn the tenant host and that
      // the proxy can carry the scheme. They stay in this function; what leaves
      // it is a capability naming the host.
      const connection = await loadS4ConfigForUser(decodedToken.uid);
      if (!connection) {
        return NextResponse.json(
          { output: '', error: 'No tenant connection is stored for this account.', exitCode: 1, testResults: [] },
          { status: 400 },
        );
      }
      if (!credentialHeaders(connection)) {
        return NextResponse.json(
          { output: '', error: 'This authentication type is not available to test runs.', exitCode: 1, testResults: [] },
          { status: 501 },
        );
      }
      const urlCheck = await isUrlSafe(connection.url);
      if (!urlCheck.safe || !urlCheck.host) {
        return NextResponse.json(
          { output: '', error: 'The stored tenant URL is not permitted.', exitCode: 1, testResults: [] },
          { status: 403 },
        );
      }
      const { token, claims } = mintCapability(
        { pid: sanitizedProjectId, uid: decodedToken.uid, host: urlCheck.host, run: randomBytes(12).toString('hex') },
        capabilityKeyFromEnv(),
      );
      const { db } = await getAdminDb();
      await registerCapability(db, claims);
      capabilityId = claims.cid;
      proxy = { baseUrl: proxyBaseFor(runnerConfig), capability: token };
    }

    // ── Execute ────────────────────────────────────────────────────────────
    let execution: Execution;
    if (target.kind === 'isolated') {
      const call = await callIsolatedRunner(
        target.url,
        { files, suiteCode: testCode, patterns, mode, ...(proxy ? { proxy } : {}), ...(enginePlan ? { engine: enginePlan } : {}) },
        { idToken: (audience) => fetchMetadataIdToken(audience) },
      );
      if (!call.ok) {
        logger.error('run-tests: the isolated runner did not deliver a usable report', { projectId: sanitizedProjectId, reason: call.reason });
        const runFailure = recordsFailure
          ? await recordRunFailure(sanitizedProjectId, decodedToken.uid, projectData, 'runner-error', call.reason)
          : null;
        return NextResponse.json(
          { output: '', error: call.reason, exitCode: 1, testResults: [], ...(runFailure ? { runFailure } : {}) },
          { status: call.status },
        );
      }
      execution = {
        buildError: call.report.outcome === 'build-error' ? call.report.buildError || 'Compilation failed.' : null,
        stdout: call.report.stdout,
        stderr: call.report.stderr,
        exitCode: call.report.exitCode,
        stubbedPackages: [...call.report.stubbedPackages].sort(),
        runner: { kind: 'isolated', revision: call.report.revision, filesDigest: call.filesDigest },
        ...(enginePlan
          ? {
              engine:
                call.engine?.ok && call.report.engine
                  ? call.report.engine.outcome === 'build-error'
                    ? { ran: false as const, reason: `The engine pass did not compile: ${call.report.engine.buildError ?? 'compilation failed'}` }
                    : { ran: true as const, stdout: call.report.engine.stdout, digest: call.engine.digest, contractModule: enginePlan.contractModule }
                  : { ran: false as const, reason: call.engine && !call.engine.ok ? call.engine.reason : 'The runner did not report the engine pass.' },
            }
          : {}),
      };
    } else {
      // Emulator build only (resolveRunnerTarget). Named in the response and
      // the receipt as `local-emulator`, never presented as the isolated runner.
      const outcome = await executeLocally(target, { files, suiteCode: testCode, patterns });
      if (outcome.kind === 'unavailable') {
        const runFailure = recordsFailure
          ? await recordRunFailure(sanitizedProjectId, decodedToken.uid, projectData, 'runner-unavailable', outcome.reason)
          : null;
        return NextResponse.json({ output: '', error: outcome.reason, exitCode: 1, ...(runFailure ? { runFailure } : {}) }, { status: 500 });
      }
      execution = {
        buildError: outcome.kind === 'build-error' ? outcome.message : null,
        stdout: outcome.kind === 'ran' ? outcome.stdout : '',
        stderr: outcome.kind === 'ran' ? outcome.stderr : '',
        exitCode: outcome.kind === 'ran' ? outcome.exitCode : 1,
        stubbedPackages: outcome.stubbedPackages,
        runner: { kind: 'local-emulator', revision: 'local-emulator', filesDigest: hashRunInputs(files, testCode).digest },
      };
      if (enginePlan) {
        // The same derivation the runner makes, through the same core, named local-emulator like the run.
        const inputs = engineRunInputs(files, enginePlan.cases, enginePlan.contractModule);
        const pass = await executeLocally(target, { files: inputs.files, suiteCode: inputs.suiteCode, patterns: enginePlan.patterns });
        const hashed = hashRunInputs(inputs.files, inputs.suiteCode);
        execution.engine =
          pass.kind === 'ran'
            ? { ran: true, stdout: pass.stdout, digest: engineDigest(hashed.files, hashed.suiteSha256, inputs.casesSha256), contractModule: enginePlan.contractModule }
            : { ran: false, reason: pass.kind === 'build-error' ? `The engine pass did not compile: ${pass.message}` : pass.reason };
      }
    }

    const runnerInfo = { kind: execution.runner.kind, revision: execution.runner.revision };
    const stubbedPackages = execution.stubbedPackages;
    if (execution.buildError !== null) {
      // `buildError` lets the client auto-heal (ask the AI to repair the offending
      // generated module/test code) and retry, rather than surfacing a dead end.
      // The project's own suite not compiling is recorded as a failed run
      // (ADR-094) — the auto-heal's drafts are not the project's and are not.
      const runFailure = recordsFailure
        ? await recordRunFailure(sanitizedProjectId, decodedToken.uid, projectData, 'build-error', execution.buildError)
        : null;
      return NextResponse.json(
        { output: '', error: `Compilation failed:
${execution.buildError}`, exitCode: 1, testResults: [], buildError: true, runner: runnerInfo, ...(draft ? { draftId: draft.draftId } : {}), ...(runFailure ? { runFailure } : {}) },
        { status: 200 },
      );
    }
    const { stdout, stderr, exitCode } = execution;

    // 3.0.12 — the engine pass folded in: a case the call contract ran takes the
    // contract's verdict; the model's test for it stays an extra check. The
    // engine pass reports answers, not verdicts: they are judged here, against
    // the cases this route planned (`engineVerdicts`).
    const engineMerge =
      execution.engine && execution.engine.ran && enginePlan
        ? mergeEngineVerdicts(parseTapOutput(stdout), engineVerdicts(execution.engine.stdout, enginePlan.cases, enginePlan.patterns))
        : null;
    const testResults = engineMerge ? engineMerge.results : parseTapOutput(stdout);
    const engineSummary = execution.engine
      ? execution.engine.ran
        ? { ran: true, viaContract: engineMerge?.viaContract ?? [] }
        : { ran: false, reason: execution.engine.reason }
      : enginePlanOutcome.kind === 'no-contract'
        ? { ran: false, reason: `Not run — the code does not export the call contract (${enginePlanOutcome.reason})` }
        : null;

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
    // while nothing else can reach this line. A live run can reach it once the
    // lock is lifted, and a receipt that then says "mock" about a run against a
    // real tenant is worse than no receipt — it is a signed sentence that is
    // false (security audit of b88c77b, SEC-b88c77b-18). So the assumption is
    // checked where it is used rather than trusted from a hundred lines above:
    // a live run returns what it saw, and no receipt is written for it — the
    // receipt format describes sandbox runs, and naming a tenant run in it is a
    // decision of its own, not a side effect of reopening the path.
    if (s4Environment === 'live') {
      logger.info('run-tests: a live run finished; it is reported without a receipt', { projectId: sanitizedProjectId });
      return NextResponse.json({
        output: stdout,
        error: stderr,
        exitCode,
        testResults,
        stubbedPackages: [...stubbedPackages].sort(),
        runner: runnerInfo,
        receipt: null,
        receiptNotice:
          'This run executed against a live tenant, and the receipt format only describes sandbox runs. ' +
          'No receipt was written; the verdicts above are not recorded on the project.',
      });
    }
    // Roadmap 8.7: a draft run names the draft's digests — what actually ran —
    // and the draft itself. The run and the case list are the project's, as
    // for every run: the draft only replaces code and suite.
    const receipt: TestRunReceipt = {
      v: TEST_RUN_RECEIPT_VERSION,
      runId: subject.runId,
      codeDigest: draft ? draft.codeDigest : subject.codeDigest,
      suiteDigest: draft ? draft.suiteDigest : subject.suiteDigest,
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
      ...(draft ? { draft: { id: draft.draftId, digest: draft.draftDigest } } : {}),
      runner: execution.runner,
      ...(execution.engine && execution.engine.ran
        ? { engine: { digest: execution.engine.digest, contractModule: execution.engine.contractModule, viaContract: engineMerge?.viaContract ?? [] } }
        : {}),
    };
    let recorded = false;
    // A draft run is recorded on the draft and nowhere else: no verdicts and no
    // receipt reach the project, so trying a candidate cannot turn Testing
    // green. Adoption (`/api/projects/{id}/repair-drafts`, compare-and-swap)
    // carries this receipt onto the project together with the code it names.
    if (draft) {
      let recordFailed = false;
      try {
        const { db } = await getAdminDb();
        recorded = await recordDraftExecution(db, {
          projectId: sanitizedProjectId,
          draftId: draft.draftId,
          execution: { receipt, testResults },
        });
      } catch (draftErr) {
        recordFailed = true;
        logger.error('run-tests: the draft execution could not be recorded', {
          route: 'api/run-tests',
          projectId: sanitizedProjectId,
          error: errMessage(draftErr),
        });
      }
      if (!recorded) {
        // A draft run nobody recorded cannot be adopted, and its verdicts are
        // about code the project does not hold. Returned as a 200 with the
        // runner's exit code, a page painted them green anyway (QA review of
        // 4b4586aff273). The output stays as diagnostic text; the result is a
        // refusal, not a pass.
        return NextResponse.json(
          {
            output: stdout,
            error:
              `The run of draft ${draft.draftId} could not be recorded` +
              (recordFailed ? '' : ' — the draft was adopted or removed while it ran') +
              ', so it is not a result of this project and cannot be adopted. Nothing was saved.',
            code: 'draft-run-not-recorded',
            exitCode: 1,
            testResults: [],
            draftId: draft.draftId,
            draftReceipt: null,
            receipt: null,
          },
          { status: recordFailed ? 503 : 409 },
        );
      }
      return NextResponse.json({
        output: stdout,
        error: stderr,
        exitCode,
        testResults,
        stubbedPackages: [...stubbedPackages].sort(),
        runner: runnerInfo,
        draftId: draft.draftId,
        draftReceipt: receipt,
        receipt: null,
      });
    }
    // Written only onto the project this run read, as it stood when it was
    // read (QA full review of fc787674705f, ee7b72f51837). Between that read
    // and this line the suite ran — seconds to minutes — and a merge-set here
    // wrote `executedCases`, built from the old snapshot, over cases the owner
    // had regenerated meanwhile, or re-created a project deleted meanwhile as a
    // stub holding nothing but stale verdicts. The transaction re-reads the
    // project and records only if it still exists, is still the caller's, and
    // still has the run, code, suite and case list that were executed.
    let moved: 'project-gone' | 'project-changed' | null = null;
    try {
      const { db } = await getAdminDb();
      const projectRef: DocumentReference = db.collection('projects').doc(sanitizedProjectId);
      moved = await db.runTransaction(async (tx: Transaction) => {
        const fresh = await tx.get(projectRef);
        if (!fresh.exists) return 'project-gone' as const;
        const now = (fresh.data() || {}) as Record<string, unknown>;
        if (now.userId !== decodedToken.uid) return 'project-gone' as const;
        if (!sameTestRunInputs(projectData, now)) return 'project-changed' as const;
        tx.set(
          projectRef,
          storedCases.length > 0
            ? { testCases: executedCases, testRunReceipt: receipt }
            : { testRunReceipt: receipt },
          { merge: true },
        );
        return null;
      });
      recorded = moved === null;
    } catch (receiptErr) {
      // The run happened; the record of it did not. Reported rather than
      // swallowed into a green screen.
      logger.error('run-tests: the execution receipt could not be written', {
        route: 'api/run-tests',
        projectId: sanitizedProjectId,
        error: errMessage(receiptErr),
      });
      // And refused, not answered as a result (QA review of 1e520bfaf727,
      // a418de0cd071). The success answer below used to go out anyway with the
      // runner's verdicts and `receipt: null`, so a page could still show a
      // passing run that nothing on the project records — the same outcome the
      // draft branch above refuses for an unrecorded draft run.
      return NextResponse.json(
        {
          output: stdout,
          error: 'The tests ran, but their result could not be recorded on the project. Nothing was saved; run the tests again.',
          code: 'run-not-recorded',
          exitCode: 1,
          testResults: [],
          receipt: null,
        },
        { status: 503 },
      );
    }

    if (moved) {
      // Nothing was written, and the verdicts describe a project state that is
      // no longer there — a refusal, not a result (the same shape the draft
      // branch above gives a run nobody recorded).
      return NextResponse.json(
        {
          output: stdout,
          error:
            moved === 'project-gone'
              ? 'The project was deleted while the tests ran. Nothing was saved.'
              : 'The project changed while the tests ran — the code, the test suite, the test cases or the analysis run are no longer the ones that were executed. Nothing was saved; run the tests again.',
          code: moved,
          exitCode: 1,
          testResults: [],
          receipt: null,
        },
        { status: moved === 'project-gone' ? 404 : 409 },
      );
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
      runner: runnerInfo,
      ...(engineSummary ? { engine: engineSummary } : {}),
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
    // Single-run: the capability dies with its run, whatever the run did.
    if (capabilityId) {
      try {
        const { db } = await getAdminDb();
        await revokeCapability(db, capabilityId);
      } catch (revokeErr) {
        // It still expires on its own within ten minutes; say so loudly.
        logger.error('run-tests: a proxy capability could not be revoked', {
          route: 'api/run-tests',
          projectId: sanitizedProjectId,
          error: errMessage(revokeErr),
        });
      }
    }
  }
}

/**
 * The emulator build's local execution — the one place this route starts the
 * execution core, for the project's run and for the mutants of a probe alike.
 * Never with an isolated runner configured: "there or not at all".
 */
async function executeLocally(
  target: RunnerTarget,
  input: { files: SandboxFile[]; suiteCode: string; patterns: string[] },
): Promise<SandboxRunOutcome> {
  if (target.kind === 'isolated') throw new Error('An isolated runner is configured; nothing runs in the application service.');
  if (target.kind === 'unavailable') return { kind: 'unavailable', reason: target.reason };
  return executeSandboxRun({ files: input.files, suiteCode: input.suiteCode, patterns: input.patterns, allowUnsandboxed: true });
}

/**
 * The mutation probe (3.0.10, owner 11.10.2026, external review F-05): would a
 * wrong reference or a dropped filter turn a test red?
 *
 * Runs only on the receipt that covers the project as it stands, and only when
 * that run passed in full (`probeBasis`). Each mutant is one ordinary run
 * through the same executor and the same contract as the project's run - the
 * runner needs nothing new for it. The report goes onto that receipt in a
 * transaction that re-reads the project and writes only if the receipt and the
 * run inputs are still the ones probed; otherwise nothing is written and the
 * answer says why.
 */
async function mutationProbeResponse(input: {
  projectId: string;
  uid: string;
  projectData: Record<string, unknown>;
  code: string;
  testCode: string;
  target: { kind: 'isolated'; url: string } | { kind: 'local-emulator' };
}): Promise<NextResponse> {
  const { projectId, uid, projectData, code, testCode, target } = input;
  const receipt = coveringTestRunReceipt(projectData);
  const caseIds = (Array.isArray(projectData.testCases) ? projectData.testCases : [])
    .map((t) => (t && typeof t === 'object' ? String((t as { id?: unknown }).id ?? '') : ''))
    .filter(Boolean);
  const basis = probeBasis(receipt, caseIds);
  if (!basis.ok || !receipt) {
    return NextResponse.json(
      { output: '', error: basis.ok ? 'No recorded run to probe.' : basis.reason, exitCode: 1, code: 'no-probe-basis' },
      { status: 409 },
    );
  }
  if (receipt.mutation) {
    return NextResponse.json({ output: '', error: '', exitCode: 0, mutation: receipt.mutation, receipt });
  }

  const execute = async (files: SandboxFile[]): Promise<MutantExecution> => {
    if (target.kind === 'isolated') {
      const call = await callIsolatedRunner(
        target.url,
        { files, suiteCode: testCode, patterns: [], mode: 'mock' },
        { idToken: (audience) => fetchMetadataIdToken(audience), timeoutMs: MUTANT_CALL_TIMEOUT_MS },
      );
      if (!call.ok) return { kind: 'unavailable', reason: call.reason };
      if (call.report.outcome === 'build-error') return { kind: 'build-error' };
      const verdicts = parseTapOutput(call.report.stdout);
      return { kind: 'ran', exitCode: call.report.exitCode, failedCases: verdicts.filter((v) => v.status === 'Failed').length };
    }
    const outcome = await executeLocally(target, { files, suiteCode: testCode, patterns: [] });
    if (outcome.kind === 'unavailable') return { kind: 'unavailable', reason: outcome.reason };
    if (outcome.kind === 'build-error') return { kind: 'build-error' };
    const verdicts = parseTapOutput(outcome.stdout);
    return { kind: 'ran', exitCode: outcome.exitCode, failedCases: verdicts.filter((v) => v.status === 'Failed').length };
  };

  const mutation = await runMutationProbe({ files: sandboxFilesFromStoredCode(code), execute });

  const { db } = await getAdminDb();
  const projectRef: DocumentReference = db.collection('projects').doc(projectId);
  const moved = await db.runTransaction(async (tx: Transaction) => {
    const fresh = await tx.get(projectRef);
    if (!fresh.exists) return 'project-gone' as const;
    const now = (fresh.data() || {}) as Record<string, unknown>;
    if (now.userId !== uid) return 'project-gone' as const;
    if (!sameTestRunInputs(projectData, now)) return 'project-changed' as const;
    const current = coveringTestRunReceipt(now);
    if (!current || current.executedAt !== receipt.executedAt || current.suiteDigest !== receipt.suiteDigest) return 'project-changed' as const;
    tx.set(projectRef, { testRunReceipt: { ...current, mutation } }, { merge: true });
    return null;
  });
  if (moved) {
    return NextResponse.json(
      {
        output: '',
        error:
          moved === 'project-gone'
            ? 'The project was deleted while the probe ran. Nothing was saved.'
            : 'The project or its recorded run changed while the probe ran. Nothing was saved; run the tests again.',
        code: moved,
        exitCode: 1,
        mutation,
      },
      { status: moved === 'project-gone' ? 404 : 409 },
    );
  }
  return NextResponse.json({ output: '', error: '', exitCode: 0, mutation, receipt: { ...receipt, mutation } });
}
