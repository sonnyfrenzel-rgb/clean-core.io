import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyRequestAuth, assertS4TenantAccess, assertMfaSatisfied, assertAccountActive, getAdminDb } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';
import { isUrlSafe } from '@/lib/url-validation';
import { assertRateLimit } from '@/lib/rate-limit';
import { LIVE_TEST_EXECUTION } from '@/lib/locked-paths';
import { parseTapOutput, applyRunnerVerdicts } from '@/lib/test-verdicts';
import { testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '@/lib/test-receipt';
import { loadDraftForRun, recordDraftExecution } from '@/lib/repair-draft-store';
import type { RepairDraft } from '@/lib/repair-draft';
import { executeSandboxRun } from '@/lib/test-sandbox/core';
import { sandboxFilesFromStoredCode, sandboxPatterns } from '@/lib/test-sandbox/files';
import { hashRunInputs, MAX_RUN_INPUT_BYTES, type RunnerProxy } from '@/lib/test-sandbox/protocol';
import { readRunnerConfig, resolveRunnerTarget, callIsolatedRunner, proxyBaseFor } from '@/lib/test-runner-client';
import { fetchMetadataIdToken } from '@/lib/google-id-token';
import { capabilityKeyFromEnv, mintCapability } from '@/lib/s4-proxy-capability';
import { registerCapability, revokeCapability } from '@/lib/s4-proxy-capability-store';
import { credentialHeaders } from '@/lib/s4-proxy';
import { logger, errMessage } from '@/lib/logger';

/**
 * POST /api/run-tests
 *
 * Runs the project's stored node:test suite against its stored generated code
 * and returns TAP results.
 *   IN : { projectId, selectedTestIds, s4Environment, draftId? }
 *   OUT: { output, error, exitCode, testResults, stubbedPackages, runner, receipt }
 *
 * WHERE IT RUNS (roadmap 8.9, CR-09 — "dort oder gar nicht"):
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

/** What an execution produced, whichever executor produced it. */
interface Execution {
  buildError: string | null;
  stdout: string;
  stderr: string;
  exitCode: number;
  stubbedPackages: string[];
  runner: NonNullable<TestRunReceipt['runner']>;
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
  const { projectId, selectedTestIds, s4Environment, draftId: rawDraftId } = await req.json();
  const draftId = typeof rawDraftId === 'string' && rawDraftId ? rawDraftId.replace(/[^a-zA-Z0-9_-]/g, '') : '';
  if (rawDraftId !== undefined && rawDraftId !== null && (!draftId || draftId !== rawDraftId)) {
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
  if (target.kind === 'unavailable') {
    return NextResponse.json(
      { output: '', error: target.reason, exitCode: 1, testResults: [] },
      { status: target.status },
    );
  }

  const files = sandboxFilesFromStoredCode(code);
  const patterns = sandboxPatterns(selectedTestIds);

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
        { files, suiteCode: testCode, patterns, mode, ...(proxy ? { proxy } : {}) },
        { idToken: (audience) => fetchMetadataIdToken(audience) },
      );
      if (!call.ok) {
        logger.error('run-tests: the isolated runner did not deliver a usable report', { projectId: sanitizedProjectId, reason: call.reason });
        return NextResponse.json(
          { output: '', error: call.reason, exitCode: 1, testResults: [] },
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
      };
    } else {
      // Emulator build only (resolveRunnerTarget). Named in the response and
      // the receipt as `local-emulator`, never presented as the isolated runner.
      const outcome = await executeSandboxRun({ files, suiteCode: testCode, patterns, allowUnsandboxed: true });
      if (outcome.kind === 'unavailable') {
        return NextResponse.json({ output: '', error: outcome.reason, exitCode: 1 }, { status: 500 });
      }
      execution = {
        buildError: outcome.kind === 'build-error' ? outcome.message : null,
        stdout: outcome.kind === 'ran' ? outcome.stdout : '',
        stderr: outcome.kind === 'ran' ? outcome.stderr : '',
        exitCode: outcome.kind === 'ran' ? outcome.exitCode : 1,
        stubbedPackages: outcome.stubbedPackages,
        runner: { kind: 'local-emulator', revision: 'local-emulator', filesDigest: hashRunInputs(files, testCode).digest },
      };
    }

    const runnerInfo = { kind: execution.runner.kind, revision: execution.runner.revision };
    const stubbedPackages = execution.stubbedPackages;
    if (execution.buildError !== null) {
      // `buildError` lets the client auto-heal (ask the AI to repair the offending
      // generated module/test code) and retry, rather than surfacing a dead end.
      return NextResponse.json(
        { output: '', error: `Compilation failed:
${execution.buildError}`, exitCode: 1, testResults: [], buildError: true, runner: runnerInfo, ...(draft ? { draftId: draft.draftId } : {}) },
        { status: 200 },
      );
    }
    const { stdout, stderr, exitCode } = execution;

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
      runner: runnerInfo,
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
