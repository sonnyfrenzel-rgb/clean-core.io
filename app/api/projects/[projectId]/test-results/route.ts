import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import { isAbapUnitRoute } from '@/lib/test-runnability';
import {
  MAX_RESULT_FILE_BYTES,
  boundedFileName,
  matchToScenarios,
  parseTestResultFile,
  utf8Length,
} from '@/lib/test-result-import';
import {
  OUTSIDE_RESULT_VERSION,
  outsideSubjectOf,
  summaryOf,
  validateConfirmation,
  type OutsideTestRecord,
} from '@/lib/sap-test-results';

/**
 * Test results from the reader's own SAP system — ADR-074, owner decision
 * 03.10.2026. On the ABAP Cloud route nothing here runs the ABAP Unit class, so
 * the result comes from the system that did.
 *
 *   GET  → `{ record }`, the stored record or `null`.
 *   POST `{ action: 'import', fileName, xml }` → `{ record }` — an ABAP Unit
 *        result file (JUnit XML or ADT's run result), parsed here and matched
 *        to the scenarios.
 *   POST `{ action: 'confirm', passed, failed, system, ranOn, note? }` →
 *        `{ record }` — the account's statement that it ran the class.
 *
 * **What an upload can and cannot do** (owner, 03.10.2026: "the upload must not
 * create a new security hole"):
 *
 *   - The body is read under a byte limit and a deadline before anything is
 *     parsed (`readBoundedBody`), and the file inside it under its own.
 *   - The file is parsed here, by `lib/test-result-import.ts`: no DTD, no
 *     entity beyond the five predefined, no external anything; elements,
 *     depth, attributes, test cases and every kept string are capped.
 *   - Only the parsed, bounded fields are stored — method names, outcomes, the
 *     first line of a failure. The file itself is never stored; its SHA-256 is.
 *   - Nothing from the file is executed, fetched, written to disk or logged.
 *     The log line carries counts and the SHA-256.
 *   - The file name is checked (`.xml`), but the content decides: a file is
 *     read only if its root is a JUnit or ABAP Unit result.
 *
 * Stored at `projects/{projectId}/test_results/current`, through the Admin SDK
 * only — `firestore.rules` has no match for it, so no client reads or writes
 * it, and project deletion (`recursiveDelete`) takes it along. In the same
 * transaction its summary goes onto the project document as
 * `outsideTestResult`, a key outside the client allowlist (as `testRunReceipt`
 * is), so every view reads the same phase through `workflowSteps`. No rules
 * change. Nothing here reaches a run, a signature or an audit pack.
 *
 * Reading is by membership, writing is the owner's. A stranger's request is
 * the 404 of a project that does not exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'test_results';
const DOC = 'current';
/**
 * The JSON body around the file: the file's own cap, plus what JSON escaping
 * can add to it (quotes and line breaks), plus the other fields.
 */
const BODY_LIMITS = { maxBytes: MAX_RESULT_FILE_BYTES * 2 + 16_384, timeoutMs: 15_000 };

type Gate =
  | { ok: true; uid: string; email: string | null; projectId: string }
  | { ok: false; response: NextResponse };

async function openProject(req: NextRequest, params: Promise<{ projectId: string }>, mutating: boolean): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return { ok: false, response: NextResponse.json({ error: q?.message || 'Multi-factor authentication required.' }, { status: q?.status || 403 }) };
  }
  if (mutating) {
    try {
      await assertRateLimit(`test-results:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
    }
    try {
      await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
      }
      throw gateErr;
    }
  } else {
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return { ok: false, response: inactive };
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }
  if (!isFirestoreId(projectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  }
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = snap.data() || {};
  if (mutating ? project.userId !== decodedToken.uid : !mayReadProject(project, decodedToken.uid)) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const email = typeof decodedToken.email === 'string' && decodedToken.email ? decodedToken.email : null;
  return { ok: true, uid: decodedToken.uid, email, projectId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(COLLECTION).doc(DOC).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    const { recordedByUid: _uid, ...record } = snap.data() || {};
    void _uid;
    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('test-results read failed', { route: 'api/projects/test-results', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the test results.' }, { status: 500 });
  }
}

const bad = (error: string, code: string, status = 400) => NextResponse.json({ error, code }, { status });

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return bad('Send the result as JSON.', 'unsupported-media-type', 415);
    }
    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null) return bad(`The file is larger than ${MAX_RESULT_FILE_BYTES / 1_000_000} MB.`, 'too-large', 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw || 'null');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return bad("Expected { action: 'import', fileName, xml } or { action: 'confirm', passed, failed, system, ranOn }.", 'bad-request');
    }

    const now = new Date();
    const by = gate.email ?? 'The signed-in account';
    type Draft = Omit<OutsideTestRecord, 'subject' | 'scenarioCount' | 'results' | 'coverage'> & {
      /** Imported only: the parsed cases, matched inside the transaction against the scenarios as they stand. */
      cases?: Parameters<typeof matchToScenarios>[0];
    };
    let draft: Draft;
    let sha256: string | null = null;

    if (body.action === 'import') {
      const fileName = boundedFileName(body.fileName);
      if (!/\.xml$/i.test(fileName)) {
        return bad('Upload the result as an .xml file — JUnit XML or the ABAP Unit run result.', 'not-xml-file', 415);
      }
      if (typeof body.xml !== 'string' || !body.xml.trim()) return bad('The file is empty.', 'empty');
      if (utf8Length(body.xml) > MAX_RESULT_FILE_BYTES) {
        return bad(`The file is larger than ${MAX_RESULT_FILE_BYTES / 1_000_000} MB.`, 'too-large', 413);
      }
      const parsed = parseTestResultFile(body.xml);
      if (!parsed.ok) return bad(parsed.error, parsed.code, parsed.code === 'too-large' ? 413 : 422);
      sha256 = createHash('sha256').update(body.xml, 'utf8').digest('hex');
      draft = {
        v: OUTSIDE_RESULT_VERSION,
        kind: 'imported',
        recordedAt: now.toISOString(),
        recordedBy: by,
        passed: 0,
        failed: 0,
        skipped: 0,
        file: { name: fileName, sha256, format: parsed.format },
        system: null,
        ranOn: null,
        unmatched: [],
        unmatchedTotal: 0,
        note: null,
        cases: parsed.cases,
      };
    } else if (body.action === 'confirm') {
      const checked = validateConfirmation(body, now);
      if (!checked.ok) return bad(checked.error, 'invalid-confirmation');
      const c = checked.value;
      draft = {
        v: OUTSIDE_RESULT_VERSION,
        kind: 'confirmed',
        recordedAt: now.toISOString(),
        recordedBy: by,
        passed: c.passed,
        failed: c.failed,
        skipped: 0,
        file: null,
        system: c.system,
        ranOn: c.ranOn,
        unmatched: [],
        unmatchedTotal: 0,
        note: c.note,
      };
    } else {
      return bad("The action is 'import' or 'confirm'.", 'bad-request');
    }

    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return { kind: 'gone' as const };
      if (!isAbapUnitRoute(data)) return { kind: 'not-abap' as const };
      const testCases = Array.isArray(data.testCases) ? (data.testCases as Array<{ id?: unknown }>) : [];
      if (testCases.length === 0) return { kind: 'no-scenarios' as const };

      const { cases, ...rest } = draft;
      let record: OutsideTestRecord;
      if (cases) {
        const matched = matchToScenarios(cases, testCases.map((t) => String(t?.id ?? '')));
        const count = (o: string) => matched.results.filter((r) => r.outcome === o).length;
        record = {
          ...rest,
          subject: outsideSubjectOf(data),
          scenarioCount: testCases.length,
          passed: matched.totals.passed,
          failed: matched.totals.failed,
          skipped: matched.totals.skipped,
          coverage: { passed: count('passed'), failed: count('failed'), skipped: count('skipped'), none: count('none') },
          results: matched.results,
          unmatched: matched.unmatched,
          unmatchedTotal: matched.unmatchedTotal,
        };
      } else {
        record = { ...rest, subject: outsideSubjectOf(data), scenarioCount: testCases.length, coverage: null, results: [] };
      }
      tx.set(projectRef.collection(COLLECTION).doc(DOC), { ...record, recordedByUid: gate.uid });
      tx.update(projectRef, { outsideTestResult: summaryOf(record) });
      return { kind: 'written' as const, record };
    });

    if (outcome.kind === 'gone') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (outcome.kind === 'not-abap') {
      return bad('This project is not on the ABAP Cloud route. Its scenarios run here, against mocks, in step 2.', 'not-abap-route', 409);
    }
    if (outcome.kind === 'no-scenarios') {
      return bad('There are no scenarios on this project to record a result for. Write them first (step 1).', 'no-scenarios', 409);
    }
    // Counts and the digest only — never a name, a message or the file.
    logger.info('test-results recorded', {
      route: 'api/projects/test-results',
      kind: outcome.record.kind,
      scenarios: outcome.record.scenarioCount,
      passed: outcome.record.passed,
      failed: outcome.record.failed,
      skipped: outcome.record.skipped,
      unmatched: outcome.record.unmatchedTotal,
      sha256,
    });
    return NextResponse.json({ record: outcome.record });
  } catch (err: unknown) {
    logger.error('test-results write failed', { route: 'api/projects/test-results', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not record the test results.' }, { status: 500 });
  }
}
