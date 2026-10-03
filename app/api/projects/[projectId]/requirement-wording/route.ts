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
import { sha256Hex } from '@/lib/artefact-digest';
import { buildRequirementSet } from '@/lib/functional-requirements';
import {
  MAX_WORDING_ANSWER,
  WORDING_FORMAT_VERSION,
  WORDING_STAGE,
  isRequirementWordingRecord,
  validateWording,
  type RequirementWordingRecord,
} from '@/lib/requirement-wording';

/**
 * The model's wording proposal for the functional requirements — v3.0.1.
 *
 *   GET  → `{ record }`, the stored proposal or `null`.
 *   POST `{ digest, text, receipt }` → `{ record }`, the sentences as validated.
 *
 * Built like the statement-proposal route next door, for the same reasons: the
 * model is not called here. The browser asks `/api/gemini` under the `design`
 * stage — the stage switch, the missing key and the rate limit are answered
 * there — and posts the answer as it came back, with the receipt the proxy
 * issued over exactly those bytes.
 *
 * What this route adds:
 *
 *   1. **The source is the server's.** The requirements are rebuilt from the
 *      project's stored source (`buildRequirementSet`); a browser whose digest
 *      disagrees gets 409.
 *   2. **The origin is observed.** Stored only with a receipt that verifies
 *      for this account, this text and the `design` stage.
 *   3. **The validation is the server's.** `validateWording` drops every
 *      sentence that names an unknown requirement, is not a "shall" sentence,
 *      states a number the code does not contain, or cites a line that does not
 *      exist in the source or is not one of that requirement's anchors — each
 *      counted with its reason. The answer itself is not stored; its SHA-256 is.
 *
 * Stored at `projects/{projectId}/requirement_wording/current`, through the
 * Admin SDK only. `firestore.rules` has no match for that path, so no client
 * reads or writes it, and project deletion (`recursiveDelete`) takes it along.
 * No rules change. Nothing here reaches a run, a signature or an audit pack.
 *
 * Reading is by membership, writing is the owner's.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'requirement_wording';
const DOC = 'current';
/** The same bound the findings route reads in one request. */
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
      await assertRateLimit(`requirement-wording:${decodedToken.uid}`, 30, 60 * 60 * 1000);
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

/** The digest the requirements are keyed by: the source as the builder reads it. */
function digestOf(source: string): string {
  return sha256Hex(source.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(COLLECTION).doc(DOC).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    const data = snap.data() || {};
    const record = {
      formatVersion: data.formatVersion,
      digest: data.digest,
      wording: data.wording,
      discarded: data.discarded,
      origin: data.origin,
      proposedAt: isoOf(data.proposedAt),
    };
    return NextResponse.json({ record: isRequirementWordingRecord(record) ? record : null });
  } catch (err: unknown) {
    logger.error('requirement-wording read failed', { route: 'api/projects/requirement-wording', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the wording proposal.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => null)) as { digest?: unknown; text?: unknown; receipt?: unknown } | null;
    if (!body || typeof body.text !== 'string' || typeof body.digest !== 'string') {
      return NextResponse.json(
        { error: 'Expected { digest, text, receipt }: the answer from /api/gemini as it came back.', code: 'bad-request' },
        { status: 400 },
      );
    }
    if (body.text.length > MAX_WORDING_ANSWER) {
      return NextResponse.json({ error: 'The answer is too large to read.', code: 'too-large' }, { status: 413 });
    }
    if (typeof gate.legacyCode !== 'string' || gate.legacyCode.trim() === '') {
      return NextResponse.json({ error: 'This project has no source to read requirements from.', code: 'no-source' }, { status: 409 });
    }
    if (Buffer.byteLength(gate.legacyCode, 'utf8') > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: `This source is larger than the ${MAX_SOURCE_BYTES} bytes read in one request.`, code: 'too-large' }, { status: 413 });
    }
    const digest = digestOf(gate.legacyCode);
    if (body.digest !== digest) {
      return NextResponse.json(
        { error: 'The source changed since the wording was asked for. Open the stage again and ask again.', code: 'source-moved' },
        { status: 409 },
      );
    }

    const key = getAuditSigningKey();
    if (!key) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json({ error: 'The origin of the wording cannot be checked on this deployment.', code: 'no-signing-key' }, { status: 503 });
    }
    const verdict = verifyModelReceipt(body.receipt, { uid: gate.uid, text: body.text, key, stage: WORDING_STAGE });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: 'This wording carries no valid receipt from the model call, so it is not stored as a model proposal.',
          code: 'receipt-refused',
          refusal: verdict.refusal,
        },
        { status: 422 },
      );
    }

    const set = buildRequirementSet({ source: gate.legacyCode });
    const validated = validateWording(set, gate.legacyCode, body.text);
    const record: RequirementWordingRecord = {
      formatVersion: WORDING_FORMAT_VERSION,
      digest,
      wording: validated.wording,
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
      if (typeof data.legacyCode !== 'string' || digestOf(data.legacyCode) !== digest) return 'source-moved' as const;
      tx.set(projectRef.collection(COLLECTION).doc(DOC), { ...record, requestedBy: gate.uid });
      return 'written' as const;
    });
    if (outcome === 'gone') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (outcome === 'source-moved') {
      return NextResponse.json(
        { error: 'The source changed since the wording was asked for. Open the stage again and ask again.', code: 'source-moved' },
        { status: 409 },
      );
    }
    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('requirement-wording write failed', { route: 'api/projects/requirement-wording', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the wording proposal.' }, { status: 500 });
  }
}
