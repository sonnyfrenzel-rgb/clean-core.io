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
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';
import { ArtefactReadError, readStoredArtefacts } from '@/lib/project-artefact-store';
import { storeBusinessLayer, storeDocumentation, storeTestSuite } from '@/lib/project-artefact-writes';
import { ARTEFACT_READ_ERROR, isStoredArtefactField } from '@/lib/project-artefacts';

/**
 * The large artefacts of a project — roadmap 3.0.14, item 9.
 *
 *   GET  → `{ artefacts }`: every artefact the project keeps in documents of
 *          its own (`lib/project-artefacts.ts`), joined. Read by membership,
 *          so an invited reader reads what the owner reads.
 *   POST `{ action: 'documentation' | 'business-layer' | 'test-suite', … }`
 *          → `{ fields }` as stored (`lib/project-artefact-writes.ts`).
 *          The owner's alone.
 *
 * The same gates in the same order as the other project routes: a verified
 * token, the second factor, a rate limit; a read needs an account that is not
 * suspended and the project's membership, a write an account that is not
 * suspended and the owner — the gate the browser's own write passed before.
 * "Not there" and "not yours" are one answer.
 *
 * The artefacts sit at `projects/{projectId}/artefacts/{field}-{n}`, written
 * and read through the Admin SDK only. `firestore.rules` has no match for that
 * path, so no browser reads or writes it, and project deletion
 * (`recursiveDelete`) takes it along. No rules change. Nothing here reaches a
 * run, a signature or an audit pack: the artefacts are what they were on the
 * project document, in another place.
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
      // One write per generation of a stage.
      await assertRateLimit(`project-artefacts:${decodedToken.uid}`, 240, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
    }
    try {
      // The account gate the browser write passed until 3.0.14 (`accountActive()`
      // in firestore.rules: a profile, not suspended, not disabled) — no more and
      // no less, so moving the write to the server neither opens nor closes it
      // for anyone. The Terms are asked for by the model call that produced
      // what is stored here (`/api/gemini`), not by the store.
      await assertAccountActive(decodedToken.uid, { isAdminClaim: decodedToken.admin === true });
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
      // Every stage and every list row of a project with stored artefacts reads
      // this once per write of them (the browser caches by the index).
      await assertRateLimit(`project-artefacts-read:${decodedToken.uid}`, 2400, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return { ok: false, response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
    }
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
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    // The index and the parts are read in one read-only transaction, so the
    // parts are the ones the index names — never half of a later write.
    const artefacts = await db.runTransaction(
      async (tx: Transaction) => {
        const snap = await tx.get(projectRef);
        const data = (snap.data() || {}) as Record<string, unknown>;
        // Inline copies are the page's own read of the document; only what is
        // stored outside is answered here — all of it, inline or not.
        const index = Object.fromEntries(Object.entries(data).filter(([key]) => !isStoredArtefactField(key)));
        return readStoredArtefacts(tx, projectRef, index);
      },
      { readOnly: true },
    );
    return NextResponse.json({ artefacts }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err: unknown) {
    if (err instanceof ArtefactReadError) {
      logger.error('stored artefacts could not be joined', { route: 'api/projects/artefacts', error: err.message });
      return NextResponse.json({ error: ARTEFACT_READ_ERROR, code: 'artefacts-unreadable' }, { status: 500 });
    }
    logger.error('artefact read failed', { route: 'api/projects/artefacts', error: errMessage(err) });
    return NextResponse.json({ error: ARTEFACT_READ_ERROR }, { status: 500 });
  }
}

/** A documentation of 999,999 characters is at most three times that in UTF-8. */
const BODY_LIMITS = { maxBytes: 8 * 1024 * 1024, timeoutMs: 20_000 };

const STORES = {
  documentation: storeDocumentation,
  'business-layer': storeBusinessLayer,
  'test-suite': storeTestSuite,
} as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null) return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Expected { action: 'documentation' | 'business-layer' | 'test-suite', … } as JSON.", code: 'bad-request' }, { status: 400 });
    }
    const fields = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
    const store = typeof fields.action === 'string' ? STORES[fields.action as keyof typeof STORES] : undefined;
    if (!store) {
      return NextResponse.json({ error: "Expected { action: 'documentation' | 'business-layer' | 'test-suite', … } as JSON.", code: 'bad-request' }, { status: 400 });
    }
    const { db } = await getAdminDb();
    const outcome = await store(db, { projectId: gate.projectId, uid: gate.uid, body: fields });
    if (outcome.status !== 200) {
      const refusal = outcome as { status: number; code: string; error: string; check?: { bytes: number; budget: number; largest: unknown } };
      if (refusal.check) {
        logger.warn('artefact store refused: too large', { route: 'api/projects/artefacts', action: fields.action, bytes: refusal.check.bytes, budget: refusal.check.budget });
      }
      return NextResponse.json(
        {
          error: refusal.error,
          code: refusal.code,
          ...(refusal.check ? { bytes: refusal.check.bytes, budget: refusal.check.budget, largest: refusal.check.largest } : {}),
        },
        { status: refusal.status },
      );
    }
    const stored = outcome as { fields: Record<string, unknown>; kept?: string | null };
    return NextResponse.json({ fields: stored.fields, ...(stored.kept !== undefined ? { kept: stored.kept } : {}) });
  } catch (err: unknown) {
    if (err instanceof ArtefactReadError) {
      logger.error('stored artefacts could not be joined', { route: 'api/projects/artefacts', error: err.message });
      return NextResponse.json({ error: ARTEFACT_READ_ERROR, code: 'artefacts-unreadable' }, { status: 500 });
    }
    logger.error('artefact write failed', { route: 'api/projects/artefacts', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store this artefact.' }, { status: 500 });
  }
}
