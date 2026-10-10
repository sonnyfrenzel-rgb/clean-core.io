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
import { sha256Hex } from '@/lib/artefact-digest';
import { readStoredDocumentation } from '@/lib/process-documentation';
import {
  RACI_EDIT_COLLECTION,
  RACI_EDIT_DOC,
  RACI_EDIT_FORMAT,
  RACI_EDIT_LIMITS,
  readRaciEditRecord,
  validateRaciEditPayload,
  type RaciEditRecord,
} from '@/lib/raci-edit';

/**
 * The owner's RACI of a project — owner request of 10.10.2026 (ADR-084
 * amended): the model proposes the RACI, the owner may change every cell and
 * the roles, and what the owner saves is the owner's.
 *
 *   GET  → `{ record }`, the stored edit or `null`.
 *   POST `{ baseRevision, layerSha256, roles, steps }` → `{ record }`, as stored.
 *
 * Built like the cost-assumptions route: a verified token, the second factor,
 * and on a write the rate limit, an active account with the current Terms and
 * the owner. Reading is by membership — an invited reader sees the owner's
 * RACI — writing is the owner's alone (ADR-083: never written from the
 * browser).
 *
 * What the write checks, in the transaction:
 *
 *   1. **The payload** — known keys, bounded sizes, one letter or none per
 *      cell, storable role names (`validateRaciEditPayload`).
 *   2. **The proposal it was made on** — `layerSha256` is the digest of the
 *      stored `businessDocumentation`. A proposal regenerated meanwhile (in
 *      another tab) answers 409 `layer-changed`; nothing is stored.
 *   3. **The revision** — `baseRevision` is the revision the editor opened
 *      (0 for none). Another save in between answers 409 `revision-moved`.
 *   4. **The steps** — every row names a step of the stored process
 *      description; a step the process does not have is refused by name.
 *
 * Stored at `projects/{projectId}/business_layer/raci`, through the Admin SDK
 * only. `firestore.rules` has no match for that path, so no client reads or
 * writes it, project deletion (`recursiveDelete`) takes it along, and there is
 * no rules change to deploy. Nothing here reaches a run, a signature or an
 * audit pack.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Gate =
  | { ok: true; uid: string; by: string; projectId: string }
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
      await assertRateLimit(`raci:${decodedToken.uid}`, 300, 60 * 60 * 1000);
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
      await assertRateLimit(`raci-read:${decodedToken.uid}`, 1200, 60 * 60 * 1000);
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
  // ADR-083 (b): the account's name, else its e-mail.
  const name = typeof decodedToken.name === 'string' ? decodedToken.name.trim() : '';
  const email = typeof decodedToken.email === 'string' ? decodedToken.email.trim() : '';
  return { ok: true, uid: decodedToken.uid, by: (name || email || 'The owner').slice(0, 200), projectId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;
    const { db } = await getAdminDb();
    const snap = await db.collection('projects').doc(gate.projectId).collection(RACI_EDIT_COLLECTION).doc(RACI_EDIT_DOC).get();
    if (!snap.exists) return NextResponse.json({ record: null });
    return NextResponse.json({ record: readRaciEditRecord(snap.data()) });
  } catch (err: unknown) {
    logger.error('raci read failed', { route: 'api/projects/raci', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the stored RACI.' }, { status: 500 });
  }
}

const BODY_LIMITS = { maxBytes: RACI_EDIT_LIMITS.maxBodyChars * 4, timeoutMs: 15_000 };

const bad = (error: string, code: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, code, ...extra }, { status });

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) => (bodyErr instanceof ResponseLimitError ? null : ''));
    if (raw === null || raw.length > RACI_EDIT_LIMITS.maxBodyChars) return bad('The RACI is too large to store.', 'too-large', 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return bad('Expected { baseRevision, layerSha256, roles, steps } as JSON.', 'bad-request');
    }
    const checked = validateRaciEditPayload(body);
    if (!checked.ok) return bad(checked.error, 'invalid', 400, { field: checked.field });
    const payload = checked.value;

    const { db } = await getAdminDb();
    const projectRef: DocumentReference = db.collection('projects').doc(gate.projectId);
    const recordRef = projectRef.collection(RACI_EDIT_COLLECTION).doc(RACI_EDIT_DOC);
    type Outcome =
      | { kind: 'gone' }
      | { kind: 'no-layer' }
      | { kind: 'layer-changed' }
      | { kind: 'no-documentation' }
      | { kind: 'unknown-step'; stepId: string }
      | { kind: 'revision-moved'; latest: number }
      | { kind: 'written'; record: RaciEditRecord };
    const outcome = await db.runTransaction(async (tx: Transaction): Promise<Outcome> => {
      const fresh = await tx.get(projectRef);
      const data = fresh.exists ? fresh.data() || {} : null;
      if (!data || data.userId !== gate.uid) return { kind: 'gone' };
      const layer = typeof data.businessDocumentation === 'string' ? data.businessDocumentation : '';
      if (!layer.trim()) return { kind: 'no-layer' };
      if (sha256Hex(layer) !== payload.layerSha256) return { kind: 'layer-changed' };
      const stored = readStoredDocumentation(data.documentation);
      if (stored.kind !== 'engine') return { kind: 'no-documentation' };
      const known = new Set(stored.doc.steps.map((s) => s.id));
      const stranger = payload.steps.find((s) => !known.has(s.stepId));
      if (stranger) return { kind: 'unknown-step', stepId: stranger.stepId };
      const current = await tx.get(recordRef);
      const before = current.exists ? readRaciEditRecord(current.data()) : null;
      // A record for an earlier proposal does not count: the editor of the
      // proposal on record starts from 0, as it would after a regeneration.
      const latest = before && before.layerSha256 === payload.layerSha256 ? before.revision : 0;
      if (latest !== payload.baseRevision) return { kind: 'revision-moved', latest };
      const record: RaciEditRecord = {
        formatVersion: RACI_EDIT_FORMAT,
        revision: latest + 1,
        layerSha256: payload.layerSha256,
        roles: payload.roles,
        steps: payload.steps,
        editedBy: gate.by,
        editedAt: new Date().toISOString(),
      };
      tx.set(recordRef, { ...record, editedByUid: gate.uid });
      return { kind: 'written', record };
    });

    switch (outcome.kind) {
      case 'gone':
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      case 'no-layer':
        return bad('There is no SOP and RACI proposal on record to edit.', 'no-layer', 409);
      case 'layer-changed':
        return bad('The SOP and RACI proposal was replaced while you edited, so nothing was saved. Reload the stage to edit the new one.', 'layer-changed', 409);
      case 'no-documentation':
        return bad('The process description on record cannot be read, so the steps cannot be checked. Read it again from the code first.', 'no-documentation', 409);
      case 'unknown-step':
        return bad(`Step ${outcome.stepId} is not a step of the process description on record.`, 'unknown-step', 400, { field: 'steps' });
      case 'revision-moved':
        return bad('The RACI was saved elsewhere since you opened it, so nothing was saved. Reload to see the newer one.', 'revision-moved', 409, { latest: outcome.latest });
      default:
        // Counts only — never a role name or an account.
        logger.info('raci recorded', { route: 'api/projects/raci', roles: outcome.record.roles.length, steps: outcome.record.steps.length, revision: outcome.record.revision });
        return NextResponse.json({ record: outcome.record });
    }
  } catch (err: unknown) {
    logger.error('raci write failed', { route: 'api/projects/raci', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store the RACI.' }, { status: 500 });
  }
}
