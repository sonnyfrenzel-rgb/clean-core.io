import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  mfaRefusal,
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
import { readBoundedRequestJson } from '@/lib/url-validation';
import { CUSTOMER_TEXTS_MAX_BYTES, customerTextsBytes, isCustomerTexts } from '@/lib/abap/customer-texts';

/**
 * The customer's own dictionary texts of a project — concept "Business-Lesbarkeit" H5(b), owner decision 06.11.2026.
 *
 *   GET  → `{ texts }`, the stored texts or `null`.
 *   POST `{ texts }` → `{ stored: true }`, the texts the import read from the abapGit XML files of the upload
 *        (`lib/abap/customer-texts.ts`), checked for shape and bounds (`isCustomerTexts`) and stored as sent.
 *
 * Stored at `projects/{projectId}/customer_texts/current`, written only through the Admin SDK. `firestore.rules` has
 * no match for that path, so no client can read or write it — which is why there is a GET here — and project and
 * account deletion take it with them (`recursiveDelete`, `app/api/projects/[projectId]/route.ts`). No rules change.
 *
 * The texts never leave the project: they are read by the project's own Business view and nothing else, never enter
 * a run, its signature or the audit pack, and no model stage is handed them by this route.
 *
 * Reading is by membership, as the process naming is; writing is the owner's.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'customer_texts';
const DOC = 'current';
/** 5,000 entries of each kind at 80 characters, as JSON, is well below this; a bigger body is not texts. */
const BODY_LIMITS = { maxBytes: 3 * 1024 * 1024, timeoutMs: 20_000 };

type Gate = { ok: true; uid: string; projectId: string } | { ok: false; response: NextResponse };

const notFound = () => NextResponse.json({ error: 'Project not found.' }, { status: 404 });

async function openProject(req: NextRequest, params: Promise<{ projectId: string }>, mutating: boolean): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaRefusal(mfaErr);
    return { ok: false, response: NextResponse.json({ error: q?.message || 'Multi-factor authentication required.' }, { status: q?.status || 403 }) };
  }
  try {
    await assertRateLimit(`customer-texts${mutating ? '' : '-read'}:${decodedToken.uid}`, mutating ? 30 : 600, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
  }
  if (mutating) {
    try {
      await assertAccountActive(decodedToken.uid, { requireCurrentTerms: true, isAdminClaim: decodedToken.admin === true });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
      throw gateErr;
    }
  } else {
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return { ok: false, response: inactive };
  }
  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  if (!isFirestoreId(projectId)) return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  // One answer for "no such project" and "not yours", as every project route gives.
  if (!snap.exists) return { ok: false, response: notFound() };
  const project = snap.data() || {};
  if (mutating ? project.userId !== decodedToken.uid : !mayReadProject(project, decodedToken.uid)) return { ok: false, response: notFound() };
  return { ok: true, uid: decodedToken.uid, projectId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(COLLECTION).doc(DOC).get();
    const texts = snap.exists ? (snap.data() || {}).texts : null;
    // A document of another shape is not texts this build reads: "none" is true, handing it over is not.
    return NextResponse.json({ texts: isCustomerTexts(texts) ? texts : null });
  } catch (err: unknown) {
    logger.error('customer-texts read failed', { route: 'api/projects/customer-texts', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the customer texts.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;
    const read = await readBoundedRequestJson(req, BODY_LIMITS);
    if (read.tooLarge) return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
    const texts = (read.body as { texts?: unknown } | null)?.texts;
    if (!isCustomerTexts(texts)) {
      return NextResponse.json({ error: 'Expected { texts } as the import reads them.', code: 'bad-request' }, { status: 400 });
    }
    // Refused here rather than by Firestore's document limit, which answered 500.
    if (customerTextsBytes(texts) > CUSTOMER_TEXTS_MAX_BYTES) {
      return NextResponse.json({ error: 'These texts are too large to store with the project.', code: 'too-large' }, { status: 413 });
    }
    const { db, FieldValue } = await getAdminDb();
    await db.collection('projects').doc(gate.projectId).collection(COLLECTION).doc(DOC).set({
      texts,
      storedBy: gate.uid,
      storedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ stored: true });
  } catch (err: unknown) {
    logger.error('customer-texts write failed', { route: 'api/projects/customer-texts', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the customer texts.' }, { status: 500 });
  }
}
