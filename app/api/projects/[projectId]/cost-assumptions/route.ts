import { NextRequest, NextResponse } from 'next/server';
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
import { costAssumptionsRevision } from '@/lib/cost-assumptions';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import {
  ECONOMICS_COLLECTION,
  ECONOMICS_DOC,
  ECONOMICS_LIMITS,
  ECONOMICS_RECORD_FORMAT,
  readEconomicsRecord,
  validateEconomicsPayload,
  type EconomicsRecord,
} from '@/lib/economics-record';

/**
 * The Economics figures of a project — what the reader entered on the
 * Economics stage, kept so that leaving the stage does not throw it away
 * (owner report 03.10.2026).
 *
 *   GET  → `{ record }`, the stored figures or `null`.
 *   POST `{ assumptions, inputs }` → `{ record }`, as stored.
 *
 * Built like the requirement-wording route next door: the same gates in the
 * same order — a verified token, the second factor, and on a write the rate
 * limit, an active account with the current Terms, and the owner. Reading is
 * by membership, so an invited reader sees the owner's figures; writing is the
 * owner's alone.
 *
 * What this route adds:
 *
 *   1. **The validation is the server's.** `validateEconomicsPayload` checks
 *      every field — types, bounds, the currency's form, no NaN or Infinity, no
 *      unknown key — and the body has a size limit. A refusal names the field.
 *   2. **The basis is the server's.** The signed run the figures were priced
 *      against, and its score, are read here from the project and its active
 *      run, never taken from the browser. The phase contract compares that
 *      score with the run's current one to say when the figures are out of date.
 *
 * Stored at `projects/{projectId}/cost_assumptions/current`, through the Admin
 * SDK only. `firestore.rules` has no match for that path, so no client reads
 * or writes it, and project deletion (`recursiveDelete`) takes it along. No
 * rules change. Economics is a scenario, not evidence: nothing here reaches a
 * run, a signature or an audit pack.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Gate =
  | { ok: true; uid: string; projectId: string }
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
      // Saves are debounced on the page, roughly one per pause in typing.
      await assertRateLimit(`cost-assumptions:${decodedToken.uid}`, 600, 60 * 60 * 1000);
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
    try {
      // Every stage reads this once when it opens.
      await assertRateLimit(`cost-assumptions-read:${decodedToken.uid}`, 1200, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
    }
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
  return { ok: true, uid: decodedToken.uid, projectId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(ECONOMICS_COLLECTION).doc(ECONOMICS_DOC).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    return NextResponse.json({ record: readEconomicsRecord(snap.data()) });
  } catch (err: unknown) {
    logger.error('cost-assumptions read failed', { route: 'api/projects/cost-assumptions', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the stored cost figures.' }, { status: 500 });
  }
}

const BODY_LIMITS = { maxBytes: ECONOMICS_LIMITS.maxBodyChars * 4, timeoutMs: 15_000 };

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    // Read through the bounded reader: the unbounded text read buffered the whole body
    // before the length check below could refuse it (SEC-b6716f0-33). Four
    // bytes per character is the most UTF-8 needs, so the character limit
    // below stays the one that decides.
    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null || raw.length > ECONOMICS_LIMITS.maxBodyChars) {
      return NextResponse.json({ error: 'The figures are too large to store.', code: 'too-large' }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Expected { assumptions, inputs } as JSON.', code: 'bad-request' }, { status: 400 });
    }
    const checked = validateEconomicsPayload(body);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.error, field: checked.field, code: 'invalid' }, { status: 400 });
    }

    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return null;
      const runId = typeof data.activeRunId === 'string' && data.activeRunId ? data.activeRunId : null;
      let score: number | null = null;
      if (runId && /^[A-Za-z0-9_-]{1,200}$/.test(runId)) {
        const run = await tx.get(projectRef.collection('runs').doc(runId));
        const s = run.exists ? run.data()?.cleanCoreScore : undefined;
        score = typeof s === 'number' && Number.isFinite(s) ? s : null;
      }
      const record: EconomicsRecord = {
        formatVersion: ECONOMICS_RECORD_FORMAT,
        ...checked.value,
        revision: costAssumptionsRevision(checked.value.assumptions),
        basis: { runId, score },
        savedAt: new Date().toISOString(),
      };
      tx.set(projectRef.collection(ECONOMICS_COLLECTION).doc(ECONOMICS_DOC), { ...record, savedBy: gate.uid });
      return record;
    });
    if (!outcome) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ record: outcome });
  } catch (err: unknown) {
    logger.error('cost-assumptions write failed', { route: 'api/projects/cost-assumptions', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the cost figures.' }, { status: 500 });
  }
}
