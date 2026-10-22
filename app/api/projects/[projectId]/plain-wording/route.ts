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
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { verifyModelReceipt } from '@/lib/model-receipt';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { checkSapReferences } from '@/lib/sap-reference-check';
import {
  MAX_PLAIN_ANSWER,
  PLAIN_WORDING_BODY_LIMITS,
  PLAIN_WORDING_FORMAT_VERSION,
  PLAIN_WORDING_STAGE,
  checkPlainItems,
  isPlainScope,
  isPlainWordingRecord,
  plainDigestFor,
  plainSourceDigest,
  sourceShaOfDigest,
  validatePlainWording,
  type PlainScope,
  type PlainWordingRecord,
} from '@/lib/plain-wording';

/**
 * The engine's sentences reworded in plain business language — roadmap 3.0.20,
 * owner decision 21.10.2026 (2).
 *
 *   GET  `?scope=walk|rules|firstlook` → `{ record }`, the stored rewording or `null`.
 *   POST `{ scope, digest, items, text, receipt }` → `{ record }`.
 *
 * Built like `requirement-wording` next door: the model is not called here.
 * The browser asks `/api/gemini` under the `statements` stage — the stage
 * switch, the missing key, BYOK and the hourly limit on model calls are all
 * answered there — and posts the answer as it came back, with the receipt the
 * proxy issued over exactly those bytes.
 *
 * What this route adds:
 *
 *   1. **The source is the server's.** The digest names the source it was
 *      built for; one that is not the stored source's is refused (409). Every
 *      sentence offered must name lines the source has, and its key must be
 *      the key of its own text and anchor.
 *   2. **The origin is observed.** Stored only with a receipt that verifies
 *      for this account, this text and the `statements` stage.
 *   3. **The guard is the server's.** `validatePlainWording` keeps a rewording
 *      only when it keeps the sentence's anchor, names nothing the engine
 *      sentence does not and leaves out no number of it, keeps its "not" and
 *      "only", carries no secret or personal data, and names no SAP
 *      identifier SAP names otherwise (`checkSapReferences`). The answer is
 *      not stored; its SHA-256 is.
 *
 * What this route does **not** establish: that the sentences sent are the
 * engine's. They come from the owner's browser — the walk's sentences are read
 * off the process map the browser drew, with the business names the naming
 * stage gave it, which this route does not rebuild. It checks their shape, that
 * each key is the key of its own text and anchor, that the anchors are lines of
 * the stored source and that the digest names exactly these sentences — no
 * more. A display filter adds to that, and is not proof of origin either: a
 * browser looks a rewording up only under the key of a sentence it wrote itself
 * from the same source and guards it again before it shows it
 * (`plainLookup`), so a stored rewording of any other sentence is not shown.
 *
 * Stored at `projects/{projectId}/plain_wording/{scope}` through the Admin SDK
 * only; `firestore.rules` has no match for that path, so no client reads or
 * writes it, and project deletion (`recursiveDelete`) takes it along. No rules
 * change. Nothing here reaches a run, a signature or an audit pack. Reading is
 * by membership, writing is the owner's.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'plain_wording';
/** The same bound the requirement-wording route reads in one request. */
const MAX_SOURCE_BYTES = 400_000;

type Gate =
  | { ok: true; uid: string; projectId: string; legacyCode: unknown }
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
      await assertRateLimit(`plain-wording:${decodedToken.uid}`, 30, 60 * 60 * 1000);
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
  return { ok: true, uid: decodedToken.uid, legacyCode: project.legacyCode, projectId };
}

function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

const bad = (error: string, code: string, status: number) => NextResponse.json({ error, code }, { status });

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const scope = req.nextUrl.searchParams.get('scope');
    if (!isPlainScope(scope)) return bad('Expected ?scope=walk, ?scope=rules or ?scope=firstlook.', 'bad-request', 400);
    if (!isFirestoreId(scope)) return bad('Expected ?scope=walk, ?scope=rules or ?scope=firstlook.', 'bad-request', 400);
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(COLLECTION).doc(scope).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    const data = snap.data() || {};
    const record = {
      formatVersion: data.formatVersion,
      scope: data.scope,
      digest: data.digest,
      wording: data.wording,
      offered: data.offered,
      discarded: data.discarded,
      origin: data.origin,
      proposedAt: isoOf(data.proposedAt),
    };
    return NextResponse.json({ record: isPlainWordingRecord(record) && record.scope === scope ? record : null });
  } catch (err: unknown) {
    logger.error('plain-wording read failed', { route: 'api/projects/plain-wording', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the plain wording.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    let body: { scope?: unknown; digest?: unknown; items?: unknown; text?: unknown; receipt?: unknown } | null = null;
    try {
      body = await readBoundedJson(new Response(req.body, { headers: req.headers }), PLAIN_WORDING_BODY_LIMITS);
    } catch (bodyErr) {
      if (bodyErr instanceof ResponseLimitError) return bad('The request is too large.', 'too-large', 413);
      body = null;
    }
    if (!body || !isPlainScope(body.scope) || typeof body.digest !== 'string' || typeof body.text !== 'string') {
      return bad('Expected { scope, digest, items, text, receipt }: the answer from /api/gemini as it came back.', 'bad-request', 400);
    }
    const scope: PlainScope = body.scope;
    if (!isFirestoreId(scope)) return bad('Expected { scope, digest, items, text, receipt }: the answer from /api/gemini as it came back.', 'bad-request', 400);
    if (body.text.length > MAX_PLAIN_ANSWER) return bad('The answer is too large to read.', 'too-large', 413);
    if (typeof gate.legacyCode !== 'string' || gate.legacyCode.trim() === '') {
      return bad('This project has no source, so there is nothing to reword.', 'no-source', 409);
    }
    if (Buffer.byteLength(gate.legacyCode, 'utf8') > MAX_SOURCE_BYTES) {
      return bad(`This source is larger than the ${MAX_SOURCE_BYTES} bytes read in one request.`, 'too-large', 413);
    }
    const sourceSha = plainSourceDigest(gate.legacyCode);
    if (sourceShaOfDigest(body.digest) !== sourceSha) {
      return bad('The source changed since the wording was asked for. Open the view again.', 'source-moved', 409);
    }
    const checked = checkPlainItems(body.items, gate.legacyCode);
    if (!checked.ok) return bad(checked.error, 'bad-request', 400);
    if (plainDigestFor(scope, sourceSha, checked.items) !== body.digest) {
      return bad('The sentences sent are not the ones the digest names.', 'bad-request', 400);
    }

    const key = getAuditSigningKey();
    if (!key) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return bad('The origin of the wording cannot be checked on this deployment.', 'no-signing-key', 503);
    }
    const verdict = verifyModelReceipt(body.receipt, { uid: gate.uid, text: body.text, key, stage: PLAIN_WORDING_STAGE });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: 'This wording carries no valid receipt from the model call, so it is not stored as AI-generated.',
          code: 'receipt-refused',
          refusal: verdict.refusal,
        },
        { status: 422 },
      );
    }

    const validated = validatePlainWording(checked.items, body.text, {
      sapMismatch: (text) => checkSapReferences(text).some((c) => c.status === 'mismatch'),
    });
    const record: PlainWordingRecord = {
      formatVersion: PLAIN_WORDING_FORMAT_VERSION,
      scope,
      digest: body.digest,
      wording: validated.wording,
      offered: checked.items.length,
      discarded: validated.discarded,
      origin: {
        source: 'model',
        receipt: 'verified',
        provider: verdict.receipt.provider,
        modelId: verdict.receipt.modelId,
        byok: verdict.receipt.byok,
        issuedAt: verdict.receipt.iat,
        textSha256: verdict.receipt.textSha256,
      },
      proposedAt: new Date().toISOString(),
    };

    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const outcome: 'gone' | 'source-moved' | 'written' = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return 'gone' as const;
      if (typeof data.legacyCode !== 'string' || plainSourceDigest(data.legacyCode) !== sourceSha) return 'source-moved' as const;
      tx.set(projectRef.collection(COLLECTION).doc(scope), { ...record, requestedBy: gate.uid });
      return 'written' as const;
    });
    if (outcome === 'gone') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (outcome === 'source-moved') return bad('The source changed since the wording was asked for. Open the view again.', 'source-moved', 409);
    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('plain-wording write failed', { route: 'api/projects/plain-wording', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the plain wording.' }, { status: 500 });
  }
}
