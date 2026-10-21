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
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import { buildProjectEvidence } from '@/lib/project-evidence-build';
import { sha256Hex } from '@/lib/artefact-digest';
import { isKeyUserDecision } from '@/lib/key-user-route';
import { buildKeyUserSteps } from '@/lib/key-user-steps';
import {
  keyUserCheckIds,
  keyUserListDigest,
  mergeKeyUserAcceptance,
  signedSourceShaOf,
  validateKeyUserConfirmation,
} from '@/lib/key-user-acceptance';

/**
 * The key-user acceptance checks as run in the reader's own system (roadmap
 * 3.0.19, owner decision 19.10.2026; `lib/key-user-acceptance.ts`).
 *
 *   POST `{ checks: 'all' | string[], system, ranOn, note? }` → `{ summary }` —
 *        the signed-in account's statement that it ran these checks of the
 *        key-user step list in its system: a self-declaration, never a run here.
 *
 * Only for a key-user decision on a run whose engine reads key user
 * (`isKeyUserDecision`), and only while the source on the project is the one
 * the run signed. The step list is rebuilt here from that source with the run's
 * engine (`buildProjectEvidence`), so an id the list does not hold is refused,
 * and the record binds the list's checks (`listDigest`).
 *
 * Written through the Admin SDK only, onto the project document as
 * `keyUserAcceptance` — a key outside the client allowlist of
 * `firestore.rules` (as `outsideTestResult` is), so no rules change. Nothing
 * here reaches a run, a signature or an audit pack. Writing is the owner's; a
 * stranger's request is the 404 of a project that does not exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BODY_LIMITS = { maxBytes: 32_768, timeoutMs: 10_000 };

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
      await assertRateLimit(`key-user-checks:${decodedToken.uid}`, 30, 60 * 60 * 1000);
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
  const email = typeof decodedToken.email === 'string' && decodedToken.email ? decodedToken.email : null;
  return { ok: true, uid: decodedToken.uid, email, projectId };
}

const bad = (error: string, code: string, status = 400) => NextResponse.json({ error, code }, { status });

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return bad('Send the confirmation as JSON.', 'unsupported-media-type', 415);
    }
    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null) return bad('The request is too large.', 'too-large', 413);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw || 'null');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return bad("Expected { checks: 'all' | [ids], system, ranOn, note? }.", 'bad-request');
    }

    const now = new Date();
    const by = gate.email ?? 'The signed-in account';
    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return { kind: 'gone' as const };
      if (!isKeyUserDecision(data)) return { kind: 'not-key-user' as const };
      const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
      const signedSha = signedSourceShaOf(data);
      if (!source.trim() || !signedSha || sha256Hex(source) !== signedSha) return { kind: 'source-moved' as const };
      // The step list as every tool shows it: rebuilt from the signed source with the signed run's engine.
      const list = buildKeyUserSteps(buildProjectEvidence(data, source).evidence.keyUser);
      const available = list ? keyUserCheckIds(list) : [];
      if (!list || available.length === 0) return { kind: 'no-checks' as const };
      const checked = validateKeyUserConfirmation(body, available, now);
      if (!checked.ok) return { kind: 'invalid' as const, error: checked.error };
      const summary = mergeKeyUserAcceptance(
        data.keyUserAcceptance,
        {
          subject: { runId: typeof data.activeRunId === 'string' ? data.activeRunId : null, sourceSha256: signedSha },
          listDigest: keyUserListDigest(list),
          total: available.length,
          checkIds: checked.value.checkIds,
          recordedAt: now.toISOString(),
          recordedBy: by,
          system: checked.value.system,
          ranOn: checked.value.ranOn,
          note: checked.value.note,
        },
        available,
      );
      tx.update(projectRef, { keyUserAcceptance: summary });
      return { kind: 'written' as const, summary };
    });

    if (outcome.kind === 'gone') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (outcome.kind === 'not-key-user') {
      return bad('The decision on this project is not key-user extensibility, so there are no key-user checks to record.', 'not-key-user', 409);
    }
    if (outcome.kind === 'source-moved') {
      return bad('The source on the project is not the one the signed run read. Run the analysis again first.', 'source-not-signed', 409);
    }
    if (outcome.kind === 'no-checks') {
      return bad('The key-user step list holds no acceptance check to record.', 'no-checks', 409);
    }
    if (outcome.kind === 'invalid') return bad(outcome.error, 'invalid-confirmation');
    // Counts only — never the system name or the note.
    logger.info('key-user checks recorded', {
      route: 'api/projects/key-user-checks',
      recorded: outcome.summary.checkIds.length,
      total: outcome.summary.total,
    });
    return NextResponse.json({ summary: outcome.summary });
  } catch (err: unknown) {
    logger.error('key-user checks write failed', { route: 'api/projects/key-user-checks', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not record the key-user checks.' }, { status: 500 });
  }
}
