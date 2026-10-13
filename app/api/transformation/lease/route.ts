import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  assertMfaSatisfied,
  assertAccountActive,
  getAdminDb,
  QuotaError,
} from '@/lib/firebase-admin';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { readBoundedJson, ResponseLimitError } from '@/lib/url-validation';
import { modelStageEnabled, MODEL_STAGE_LABELS, STAGE_DISABLED_CODE } from '@/lib/model-stages';
import { contractOfProject, MAX_CONTRACT_SOURCE_BYTES } from '@/lib/contract-build';
import { generationDirection } from '@/lib/generation-direction';
import { generationRevision, generationStateOf } from '@/lib/generation-revision';
import { platformContextOf } from '@/lib/transformation-context-build';
import type { InputManifest } from '@/lib/input-manifest';
import { LEASE_MAX_PLANNED_CALLS, leaseView } from '@/lib/transformation/lease';
import { issueLease, voidLease } from '@/lib/transformation/lease-store';

/**
 * POST /api/transformation/lease — one generation's model budget
 * (`docs/design/engine-led-transformation.md` §11; owner decision 12.10.2026).
 *
 *   IN : { projectId, generationToken, plannedCalls }
 *   OUT: { lease: { projectId, leaseId, budget, used, expiresAt, maxInFlight }, reused }
 *
 * An engine-led generation makes up to 48 small model calls. Each of them
 * passing the per-account limit of `/api/gemini` (20 an hour) would make one
 * generation cost the hour, so the generation buys a lease here instead, for
 * **one** unit of that same limit (`gemini:<uid>`), and its calls name the
 * lease. The decisions — budget, 4 in flight, its time (`leaseTtlMs`), 3 leases an hour,
 * one open lease per project, idempotent per generation token — are in
 * `lib/transformation/lease.ts`; the transaction in `lease-store.ts`.
 *
 * A lease is issued only to the project's owner, with the second factor, an
 * active account and the Transformation stage switched on, and only for the
 * generation token the contract route hands out for the project as it stands
 * now (`generationRevision`) — a lease cannot be bought for a project that is
 * not the caller's, or for a state the page is no longer looking at.
 */
export const runtime = 'nodejs';

const LEASE_BODY_LIMITS = { maxBytes: 16 * 1024, timeoutMs: 10_000 };

function manifestOfRun(run: Record<string, unknown> | null): InputManifest | null {
  const manifest = run?.inputManifest;
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as Partial<InputManifest>;
  return typeof m.hash === 'string' && Array.isArray(m.inputs) ? (manifest as InputManifest) : null;
}

export async function POST(req: NextRequest) {
  try {
    const decodedToken = await verifyRequestAuth(req);
    if (!decodedToken) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    try {
      await assertMfaSatisfied(req, decodedToken);
    } catch (mfaErr: unknown) {
      const q = mfaErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'MFA verification required.' }, { status: q?.status || 403 });
    }
    // Bounds the work below (the contract is rebuilt from the source) — the
    // lease limit itself is the hourly window in the transaction.
    try {
      await assertRateLimit(`transformation-lease-route:${decodedToken.uid}`, 30, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 });
    }
    try {
      await assertAccountActive(decodedToken.uid, {
        requireApproved: true,
        requireCurrentTerms: true,
        isAdminClaim: decodedToken.admin === true,
      });
    } catch (gateErr: unknown) {
      if (gateErr instanceof QuotaError) {
        return NextResponse.json({ error: gateErr.message }, { status: gateErr.status });
      }
      throw gateErr;
    }

    let body: Record<string, unknown> = {};
    try {
      const parsed = await readBoundedJson(new Response(req.body, { headers: req.headers }), LEASE_BODY_LIMITS);
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch (bodyErr) {
      if (bodyErr instanceof ResponseLimitError) {
        return NextResponse.json({ error: 'The request is too large.', code: 'too-large' }, { status: 413 });
      }
      return NextResponse.json({ error: 'Invalid request body.', code: 'bad-request' }, { status: 400 });
    }
    const { projectId, generationToken, plannedCalls } = body;
    // Checked before the id forms any document path (SEC-2026-514).
    if (!isFirestoreId(projectId)) {
      return NextResponse.json({ error: 'Invalid project id.', code: 'bad-request' }, { status: 400 });
    }
    if (typeof generationToken !== 'string' || generationToken.length === 0 || generationToken.length > 256) {
      return NextResponse.json({ error: 'Name the generation this lease is for: generationToken.', code: 'no-generation-token' }, { status: 400 });
    }
    if (typeof plannedCalls !== 'number' || !Number.isInteger(plannedCalls) || plannedCalls < 1 || plannedCalls > LEASE_MAX_PLANNED_CALLS) {
      return NextResponse.json(
        { error: `plannedCalls must be a whole number from 1 to ${LEASE_MAX_PLANNED_CALLS}.`, code: 'bad-request' },
        { status: 400 },
      );
    }

    const { db } = await getAdminDb();
    const profile = await db.collection('users').doc(decodedToken.uid).get();
    if (!modelStageEnabled(profile.exists ? (profile.data() as { modelStages?: Record<string, boolean> }) : null, 'transformation')) {
      return NextResponse.json(
        {
          error: `${MODEL_STAGE_LABELS.transformation} is switched off for this account (${STAGE_DISABLED_CODE}). Turn it back on in Settings to generate it.`,
          code: STAGE_DISABLED_CODE,
        },
        { status: 403 },
      );
    }

    const snap = await db.collection('projects').doc(projectId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    // Owner only; one answer for "not there" and "not yours".
    if (!data || data.userId !== decodedToken.uid) {
      return NextResponse.json({ error: 'No such project.' }, { status: 404 });
    }
    let run: Record<string, unknown> | null = null;
    if (typeof data.activeRunId === 'string' && data.activeRunId && isFirestoreId(data.activeRunId)) {
      const runSnap = await db.collection('projects').doc(projectId).collection('runs').doc(data.activeRunId).get();
      run = runSnap.exists ? (runSnap.data() as Record<string, unknown>) : null;
    }
    const source = typeof data.legacyCode === 'string' ? data.legacyCode : '';
    if (Buffer.byteLength(source, 'utf8') > MAX_CONTRACT_SOURCE_BYTES) {
      return NextResponse.json(
        { error: `This source is larger than the ${MAX_CONTRACT_SOURCE_BYTES} bytes a generation is derived from.`, code: 'too-large' },
        { status: 413 },
      );
    }
    const built = contractOfProject(data, manifestOfRun(run));
    if (!built.ok) {
      return NextResponse.json({ error: 'No code can be generated for this project as it stands.', code: built.code }, { status: 409 });
    }
    const decision = generationDirection(built.contract);
    if (!decision.ok) {
      return NextResponse.json({ error: decision.sentence, code: decision.code }, { status: 409 });
    }
    // The token covers the PLATFORM KNOWLEDGE block (3.0.12): built here as the
    // contract route builds it, or every lease would read as stale.
    const platform = await platformContextOf(db, projectId, data, built, decision.isAbapCloud);
    if (generationRevision(generationStateOf(data, run, platform.stamp), built.contract.fingerprint) !== generationToken) {
      return NextResponse.json(
        {
          error: 'The project changed after this generation was prepared. Reload the page and generate from the current state.',
          code: 'generation-stale',
        },
        { status: 409 },
      );
    }

    const now = Date.now();
    const outcome = await issueLease(db, { projectId, uid: decodedToken.uid, generationToken, plannedCalls, now });
    if (outcome.kind === 'refused') {
      return NextResponse.json(
        { error: outcome.error, code: outcome.code, ...(outcome.retryAfterSeconds ? { retryAfterSeconds: outcome.retryAfterSeconds } : {}) },
        { status: outcome.status },
      );
    }
    if (outcome.kind === 'reused') {
      return NextResponse.json({ lease: leaseView(outcome.lease), reused: true });
    }

    // The one unit of the account's hourly model limit this generation costs
    // — the same key and ceiling as a call to /api/gemini without a lease.
    if (!decodedToken.admin) {
      try {
        await assertRateLimit(`gemini:${decodedToken.uid}`, 20, 60 * 60 * 1000);
      } catch (rateErr: unknown) {
        await voidLease(db, { projectId, uid: decodedToken.uid, leaseId: outcome.lease.leaseId, issuedAt: now });
        const q = rateErr as { message?: string; status?: number };
        return NextResponse.json({ error: q?.message || 'Too many requests.', code: 'model-hourly-limit' }, { status: q?.status || 429 });
      }
    }
    return NextResponse.json({ lease: leaseView(outcome.lease), reused: false });
  } catch (err: unknown) {
    logger.error('transformation lease failed', { route: 'api/transformation/lease', error: errMessage(err) });
    return NextResponse.json({ error: 'The generation could not be prepared. Please try again.' }, { status: 500 });
  }
}
