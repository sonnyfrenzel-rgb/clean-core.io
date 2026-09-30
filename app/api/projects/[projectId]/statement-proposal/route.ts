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
import { MAX_ANSWER_LENGTH, validateStatementAnswer } from '@/lib/business-statement-prompt';
import {
  STATEMENT_PROPOSAL_FORMAT_VERSION,
  STATEMENT_STAGE,
  isStatementProposalRecord,
  statementProposalContextOf,
  type StatementProposalRecord,
} from '@/lib/statement-proposal';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * The model's business sentences for a project's source — roadmap 17.10.
 *
 *   GET  → `{ record }`, the stored proposal or `null`.
 *   POST `{ digest, text, receipt }` → `{ record }`, the sentences as validated.
 *
 * Built exactly like the naming route next door
 * (`app/api/projects/[projectId]/process-naming/route.ts`), because it is the
 * same problem: the model is not called here. `/api/gemini` is the only path
 * from this product to a model (`lib/model-receipt.ts`); the browser asks it
 * under the `statements` stage — the per-stage switch, the missing key, the
 * account's own key and the per-account rate limit are all answered there — and
 * posts the answer **as it came back**, with the receipt the proxy issued over
 * exactly those bytes. No second way out, and no key on this route.
 *
 * What this route adds is what the browser cannot be trusted with:
 *
 *   1. **The source is the server's.** The prompt context is rebuilt from the
 *      project's stored source; a browser whose digest disagrees gets 409.
 *   2. **The origin is observed, not claimed.** Stored only with a receipt that
 *      verifies for this account and this text — a sentence typed by anyone
 *      must not wear the chip *Model proposal*.
 *   3. **The validation is the server's.** `validateStatementAnswer` drops and
 *      counts every sentence whose anchor, file, line or element does not hold.
 *      The answer itself is not stored — only its SHA-256, the sentences that
 *      fit and the tally of what did not.
 *
 * Stored at `projects/{projectId}/statement_proposal/current`, written only
 * through the Admin SDK. `firestore.rules` has no match for that path, so no
 * client reads or writes it, and project and account deletion take it with
 * them (`recursiveDelete`). No rules change, no rules deploy. Nothing here
 * reaches a run, a run receipt, a signature or an audit pack.
 *
 * Reading is by membership, writing is the owner's — an invited reader sees the
 * proposal the owner asked for and never asks for one.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'statement_proposal';
const DOC = 'current';

type Gate =
  | { ok: true; uid: string; projectId: string; legacyCode: unknown }
  | { ok: false; response: NextResponse };

async function openProject(
  req: NextRequest,
  params: Promise<{ projectId: string }>,
  mutating: boolean,
): Promise<Gate> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { ok: false, response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  // The sentences are read out of the project's code. A token from before the
  // second factor reads nothing of it, here as in Firestore.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      ok: false,
      response: NextResponse.json(
        { error: q?.message || 'Multi-factor authentication required.' },
        { status: q?.status || 403 },
      ),
    };
  }

  if (mutating) {
    try {
      await assertRateLimit(`statement-proposal:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return {
        ok: false,
        response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
      };
    }
    try {
      await assertAccountActive(decodedToken.uid, {
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return { ok: false, response: NextResponse.json({ error: gateErr.message }, { status: gateErr.status }) };
      }
      throw gateErr;
    }
  }

  if (!mutating) {
    // The read keeps no Terms or approval gate (CR-13), but a suspended account
    // reads nothing, as in Firestore (accountActive()).
    const inactive = await refuseInactiveAccount(decodedToken.uid);
    if (inactive) return { ok: false, response: inactive };
  }

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }
  // Checked before the id forms any document path (SEC-2026-514).
  if (!isFirestoreId(projectId)) {
    return { ok: false, response: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  }

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  // Same answer for "no such project" and "not yours": a 404 that only appears
  // for projects that exist is a way to ask whether one does. The wording is
  // the one `app/api/projects/[projectId]/route.ts:56` and
  // `readers/route.ts:144` already use, so that the three do not drift apart.
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = snap.data() || {};
  // Reading is by membership, writing is the owner's: an invited reader may
  // open what the owner shared and never change or start anything. Until
  // 19.09.2026 this asked for the owner on GET as well, so a valid invitation
  // opened the project and hid its process (Gegenreview c5085bb, CR-13).
  if (mutating ? project.userId !== decodedToken.uid : !mayReadProject(project, decodedToken.uid)) {
    // Not the route's 'Unauthorized.' any more: a stranger who was told 403
    // here and 404 above could read off the status code alone whether a
    // guessed id names a real project. An invited reader reaching for a write
    // is answered the same, exactly as `readers/route.ts` answers every
    // non-owner — they lose a distinction they never acted on, and the
    // refusal keeps saying nothing.
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  return { ok: true, uid: decodedToken.uid, legacyCode: project.legacyCode, projectId };
}

/** A Firestore Timestamp, a Date or an ISO string, as ISO. */
function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;

    const { db } = await getAdminDb();
    const snap = await db
      .collection('projects').doc(gate.projectId)
      .collection(COLLECTION).doc(DOC)
      .get();
    if (!snap.exists) return NextResponse.json({ record: null });

    // The record's own fields and nothing else — `requestedBy` stays on the server.
    const data = snap.data() || {};
    const record = {
      formatVersion: data.formatVersion,
      digest: data.digest,
      statements: data.statements,
      discarded: data.discarded,
      origin: data.origin,
      proposedAt: isoOf(data.proposedAt),
    };
    // A document of another format version is not a proposal this build can show.
    return NextResponse.json({ record: isStatementProposalRecord(record) ? record : null });
  } catch (err: unknown) {
    logger.error('statement-proposal read failed', { route: 'api/projects/statement-proposal', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the business sentences.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
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
    if (body.text.length > MAX_ANSWER_LENGTH) {
      return NextResponse.json({ error: 'The answer is too large to read.', code: 'too-large' }, { status: 413 });
    }

    if (typeof gate.legacyCode !== 'string' || gate.legacyCode.trim() === '') {
      return NextResponse.json({ error: 'This project has no source to describe.', code: 'no-source' }, { status: 409 });
    }
    const context = statementProposalContextOf(gate.legacyCode);
    if (body.digest !== context.digest) {
      return NextResponse.json(
        {
          error: 'The source changed since these sentences were asked for. Open the stage again and ask again.',
          code: 'source-moved',
        },
        { status: 409 },
      );
    }

    const key = getAuditSigningKey();
    if (!key) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json(
        { error: 'The origin of the sentences cannot be checked on this deployment.', code: 'no-signing-key' },
        { status: 503 },
      );
    }
    const verdict = verifyModelReceipt(body.receipt, {
      uid: gate.uid,
      text: body.text,
      key,
      // Only a call made under the statements stage may be stored as its
      // proposal: the stage switch is enforced by `/api/gemini`, and a receipt
      // from another stage would walk around it (QA review of 8f9ea35a000e,
      // 33a42c475f1a).
      stage: STATEMENT_STAGE,
    });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: 'These sentences carry no valid receipt from the model call, so they are not stored as a model proposal.',
          code: 'receipt-refused',
          refusal: verdict.refusal,
        },
        { status: 422 },
      );
    }

    const validated = validateStatementAnswer(context.statementContext, body.text);
    const record: StatementProposalRecord = {
      formatVersion: STATEMENT_PROPOSAL_FORMAT_VERSION,
      digest: context.digest,
      statements: validated.statements,
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
    // `set` without merge: a new proposal replaces the old one whole. Keeping a
    // sentence of the previous answer next to those of this one would be a
    // record no model call produced.
    //
    // In a transaction that reads the project again. The gate above is a read;
    // a project deleted after it used to receive the proposal anyway, and a
    // subcollection document outlives its deleted parent (QA review of
    // e7372791c70d). Owner and source are asked again for the same reason.
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const outcome: 'gone' | 'source-moved' | 'written' = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return 'gone' as const;
      if (typeof data.legacyCode !== 'string' || statementProposalContextOf(data.legacyCode).digest !== context.digest) {
        return 'source-moved' as const;
      }
      tx.set(projectRef.collection(COLLECTION).doc(DOC), { ...record, requestedBy: gate.uid });
      return 'written' as const;
    });
    if (outcome === 'gone') {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (outcome === 'source-moved') {
      return NextResponse.json(
        {
          error: 'The source changed since these sentences were asked for. Open the stage again and ask again.',
          code: 'source-moved',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('statement-proposal write failed', { route: 'api/projects/statement-proposal', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the business sentences.' }, { status: 500 });
  }
}
