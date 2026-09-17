import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { verifyModelReceipt } from '@/lib/model-receipt';
import {
  MAX_ANSWER_LENGTH,
  NAMING_FORMAT_VERSION,
  isProcessNamingRecord,
  namingContextOf,
  validateNamingAnswer,
  type ProcessNamingRecord,
} from '@/lib/process-naming';

/**
 * The business names of a project's process skeleton — roadmap 2.4.
 *
 *   GET  → `{ record }`, the stored naming or `null`.
 *   POST `{ digest, text, receipt }` → `{ record }`, the naming as validated.
 *
 * The model is not called here. `/api/gemini` is the only path from this
 * product to a model (`lib/model-receipt.ts`), so the browser asks it for the
 * names under the `naming` stage — which is where the per-stage switch and the
 * missing key are answered — and then posts the answer **as it came back**,
 * together with the receipt the proxy issued over exactly those bytes.
 *
 * What this route adds is the part the browser cannot be trusted with:
 *
 *   1. **The skeleton is the server's.** It is rebuilt from the project's stored
 *      source, and a browser whose digest disagrees gets 409 instead of names
 *      validated against a reading that is not the project's.
 *   2. **The origin is observed, not claimed.** A naming is stored only with a
 *      receipt that verifies for this account and this text. Without one the
 *      text could have been typed by anyone, and a name typed by anyone must not
 *      carry the chip *Model proposal* — so it is refused, not stored as
 *      something vaguer. The receipt's MAC is not kept; what is kept is that the
 *      server checked it, and which model it named.
 *   3. **The validation is the server's.** `validateNamingAnswer` drops and
 *      counts everything outside the format. The answer itself is not stored —
 *      only its SHA-256, the names that fit and the tally of what did not.
 *
 * Stored at `projects/{projectId}/process_naming/current`, written only through
 * the Admin SDK. `firestore.rules` has no match for that path, so no client can
 * read or write it — which is why there is a GET here at all — and project and
 * account deletion take it with them (`recursiveDelete`). No rules change, no
 * rules deploy.
 *
 * Owner only, for reading as for writing: the names are derived from the code,
 * and an administrator cannot read a project's code either (16.09.2026).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'process_naming';
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

  // The names are read out of the project's code. A token from before the
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
      await assertRateLimit(`process-naming:${decodedToken.uid}`, 30, 60 * 60 * 1000);
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

  const { projectId } = await params;
  if (!projectId || typeof projectId !== 'string') {
    return { ok: false, response: NextResponse.json({ error: 'Missing project id.' }, { status: 400 }) };
  }

  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  }
  const project = snap.data() || {};
  if (project.userId !== decodedToken.uid) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized.' }, { status: 403 }) };
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

    // The record's own fields and nothing else — `requestedBy` stays on the
    // server, and a field some later build adds is not handed out by accident.
    const data = snap.data() || {};
    const record = {
      formatVersion: data.formatVersion,
      digest: data.digest,
      names: data.names,
      lanes: data.lanes,
      discarded: data.discarded,
      origin: data.origin,
      namedAt: isoOf(data.namedAt),
    };
    // A document of another format version is not a naming this build can
    // apply. Saying "none" is true; handing it over as one is not.
    return NextResponse.json({ record: isProcessNamingRecord(record) ? record : null });
  } catch (err: unknown) {
    logger.error('process-naming read failed', { route: 'api/projects/process-naming', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the business names.' }, { status: 500 });
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
      return NextResponse.json({ error: 'This project has no source to name.', code: 'no-source' }, { status: 409 });
    }
    const context = namingContextOf(gate.legacyCode);
    if (body.digest !== context.digest) {
      return NextResponse.json(
        {
          error: 'The source changed since this process was read. Open it again and ask for names again.',
          code: 'source-moved',
        },
        { status: 409 },
      );
    }

    const key = getAuditSigningKey();
    if (!key) {
      console.error(MISSING_SIGNING_KEY_LOG);
      return NextResponse.json(
        { error: 'The origin of the names cannot be checked on this deployment.', code: 'no-signing-key' },
        { status: 503 },
      );
    }
    const verdict = verifyModelReceipt(body.receipt, { uid: gate.uid, text: body.text, key });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error: 'These names carry no valid receipt from the model call, so they are not stored as a model proposal.',
          code: 'receipt-refused',
          refusal: verdict.refusal,
        },
        { status: 422 },
      );
    }

    const validated = validateNamingAnswer(context, body.text);
    const record: ProcessNamingRecord = {
      formatVersion: NAMING_FORMAT_VERSION,
      digest: context.digest,
      names: validated.names,
      lanes: validated.lanes,
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
      namedAt: new Date().toISOString(),
    };

    const { db } = await getAdminDb();
    // `set` without merge: a new naming replaces the old one whole. Keeping a
    // lane of the previous answer next to the names of this one would be a
    // record no model call produced.
    await db
      .collection('projects').doc(gate.projectId)
      .collection(COLLECTION).doc(DOC)
      .set({ ...record, requestedBy: gate.uid });

    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('process-naming write failed', { route: 'api/projects/process-naming', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the business names.' }, { status: 500 });
  }
}
