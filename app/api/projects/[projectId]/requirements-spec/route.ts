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
import {
  SPEC_COLLECTION,
  SPEC_DOC,
  SPEC_FORMAT_VERSION,
  SPEC_LIMITS,
  nextHistory,
  readSpecRecord,
  specSummaryOf,
  stampAnswers,
  validateSpecPayload,
  type SpecRecord,
} from '@/lib/requirements-spec';

/**
 * The requirements specification of a project — what the owner writes in the
 * Design tool's requirements workspace (owner 04.10.2026, ADR-078).
 *
 *   GET  → `{ record }`, the stored specification or `null`.
 *   POST `{ spec, baseRevision, derivedFrom, change }` → `{ record }`, as stored.
 *
 * Built like the cost-assumptions route: the same gates in the same order — a
 * verified token, the second factor, and on a write the rate limit, an active
 * account with the current Terms, and the owner. Reading is by membership, so
 * an invited reader reads the owner's specification; writing is the owner's
 * alone. A stranger's request is the 404 of a project that does not exist.
 *
 * What this route decides itself, never the browser:
 *
 *   1. **Every field is validated** (`validateSpecPayload`): types, lengths,
 *      the fixed lists, ids, line ranges, no unknown key, and a size limit on
 *      the body before it is parsed. A refusal names the field.
 *   2. **Who answered a decision, and when**, is stamped here from the token
 *      and the server's clock (`stampAnswers`); a browser cannot send it.
 *   3. **The revision** is the server's: a save names the revision it was
 *      made on, and a save over a newer one is refused with 409, so two tabs
 *      cannot silently overwrite each other.
 *   4. **The basis**: `derivedFrom` must be the SHA-256 of the source the
 *      active run signed — or what was stored before, for a document kept on
 *      while the source moved on. A browser cannot claim currency for a source
 *      nobody signed.
 *
 * Stored at `projects/{projectId}/requirements_spec/current` through the Admin
 * SDK only; `firestore.rules` has no match for that path, so no client reads
 * or writes it, and project deletion (`recursiveDelete`) takes it along. In the
 * same transaction a summary goes onto the project as `requirementsSpec`, a key
 * outside the client allowlist (as `outsideTestResult` is), so the Design card
 * and Delivery read it with the project. No rules change. The specification is
 * not evidence: nothing here reaches a run, a signature or an audit pack.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      // Saves are debounced on the page, roughly one per pause in typing.
      await assertRateLimit(`requirements-spec:${decodedToken.uid}`, 600, 60 * 60 * 1000);
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
      await assertRateLimit(`requirements-spec-read:${decodedToken.uid}`, 1200, 60 * 60 * 1000);
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
  const email = typeof decodedToken.email === 'string' && decodedToken.email ? decodedToken.email : null;
  return { ok: true, uid: decodedToken.uid, email, projectId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(SPEC_COLLECTION).doc(SPEC_DOC).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    return NextResponse.json({ record: readSpecRecord(snap.data()) });
  } catch (err: unknown) {
    logger.error('requirements-spec read failed', { route: 'api/projects/requirements-spec', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the requirements specification.' }, { status: 500 });
  }
}

const bad = (error: string, code: string, status = 400, field?: string) =>
  NextResponse.json({ error, code, ...(field ? { field } : {}) }, { status });

/** The SHA-256 of the source the active run signed, as the project records it. */
function signedSha256(project: Record<string, unknown>): string | null {
  const meta = project.auditMetadata as { inputFingerprint?: { sha256?: unknown } } | undefined;
  const own = project.inputFingerprint as { sha256?: unknown } | undefined;
  const sha = own?.sha256 ?? meta?.inputFingerprint?.sha256;
  return typeof sha === 'string' && /^[0-9a-f]{64}$/.test(sha) ? sha : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    if (!(req.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      return bad('Send the specification as JSON.', 'unsupported-media-type', 415);
    }
    const raw = await req.text().catch(() => '');
    if (raw.length > SPEC_LIMITS.maxBodyChars) {
      return bad('The specification is too large to store.', 'too-large', 413);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return bad('Expected { spec, baseRevision, derivedFrom, change } as JSON.', 'bad-request');
    }
    const checked = validateSpecPayload(body);
    if (!checked.ok) return bad(checked.error, 'invalid', 400, checked.field);
    const payload = checked.value;

    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const docRef = projectRef.collection(SPEC_COLLECTION).doc(SPEC_DOC);
    const by = gate.email ?? 'The signed-in account';
    const now = new Date().toISOString();

    const outcome = await db.runTransaction(async (tx: Transaction) => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return { kind: 'gone' as const };
      const storedSnap = await tx.get(docRef);
      const stored = storedSnap.exists ? readSpecRecord(storedSnap.data()) : null;
      const storedRevision = stored?.revision ?? 0;
      if (payload.baseRevision !== storedRevision) return { kind: 'conflict' as const, revision: storedRevision };

      const signed = signedSha256(data);
      if (!signed && !stored) return { kind: 'no-run' as const };
      if (payload.derivedFrom !== signed && payload.derivedFrom !== stored?.derivedFrom) return { kind: 'basis' as const };

      const revision = storedRevision + 1;
      const record: SpecRecord = {
        formatVersion: SPEC_FORMAT_VERSION,
        spec: stampAnswers(payload.spec, stored?.spec ?? null, by, now),
        derivedFrom: payload.derivedFrom,
        revision,
        savedAt: now,
        savedBy: by,
        history: nextHistory(stored?.history ?? [], { revision, at: now, by, change: payload.change }),
      };
      const size = JSON.stringify(record).length;
      if (size > SPEC_LIMITS.maxBodyChars) return { kind: 'too-large' as const };
      tx.set(docRef, { ...record, savedByUid: gate.uid });
      tx.update(projectRef, { requirementsSpec: specSummaryOf(record) });
      return { kind: 'written' as const, record };
    });

    if (outcome.kind === 'gone') return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (outcome.kind === 'conflict') {
      return NextResponse.json(
        { error: 'The specification was saved elsewhere since this page read it. Reload to see the newer revision.', code: 'conflict', revision: outcome.revision },
        { status: 409 },
      );
    }
    if (outcome.kind === 'no-run') return bad('The specification is read from the source of a signed run. Run the analysis first.', 'no-signed-run', 409);
    if (outcome.kind === 'basis') return bad('The specification names a source the active run did not sign.', 'basis', 409, 'derivedFrom');
    if (outcome.kind === 'too-large') return bad('The specification is too large to store.', 'too-large', 413);
    // Counts only — never a requirement's text.
    logger.info('requirements-spec saved', {
      route: 'api/projects/requirements-spec',
      revision: outcome.record.revision,
      requirements: outcome.record.spec.requirements.length,
      decisions: outcome.record.spec.decisions.length,
    });
    return NextResponse.json({ record: outcome.record });
  } catch (err: unknown) {
    logger.error('requirements-spec write failed', { route: 'api/projects/requirements-spec', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the requirements specification.' }, { status: 500 });
  }
}
