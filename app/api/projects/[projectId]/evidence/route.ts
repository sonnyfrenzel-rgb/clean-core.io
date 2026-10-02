import { NextRequest, NextResponse } from 'next/server';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { logger, errMessage } from '@/lib/logger';
import { verifyRequestAuth, getAdminDb, assertMfaSatisfied } from '@/lib/firebase-admin';
import { isProjectOwner, mayReadProject } from '@/lib/project-readers';
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { isFirestoreId } from '@/lib/firestore-id';
import { looksLikeAbap } from '@/lib/abap-input-check';
import { normaliseAssessmentTarget } from '@/lib/assessment-target';
import { buildProjectEvidence, buildRunEvidence } from '@/lib/project-evidence-build';
import { readBoundedBody, ResponseLimitError } from '@/lib/url-validation';

/**
 * The engine's evidence report for one project, computed on the server with the
 * catalog the signed run reads.
 *
 * **Why.** Analyze, Transformation and the workspace's Public-Cloud-Fit card used
 * to build this report in the browser with `buildAbapEvidence(code, 'main.abap',
 * deployment)`: the *default* catalog and a fixed file name. The signed run
 * (`/api/runs/create`) and `GET /findings` read the snapshot of the project's
 * target profile (`catalogSnapshotKeyForProject`, owner decision 30.09.2026) and
 * the file name the run signed. For a Private Edition project, or one pinned to
 * a release, the screen could therefore show findings the run never signed. The
 * PCE snapshots are ~6 MB of JSON and are server-only
 * (`lib/abap/catalog-snapshots.ts`), so the browser cannot read the right
 * catalog at all; it asks here instead, and no catalog travels to it.
 *
 * `GET` → `{ evidence, sourceSha256, catalog, fileName }` for the source stored
 * on the project — what every display derived from the project reads. Owner
 * **or** an accepted reader (`mayReadProject`), as `GET /findings`: a share is
 * read access to the case including its source, and this is derived from it.
 *
 * `POST { source, fileName, s4Deployment, targetProfile }` → the same answer for
 * a source that is about to be analysed — the Analyze stage's first look at the
 * evidence before the run that signs it exists (the model's prompt and the
 * evidence sweep are built from it). The catalog is chosen exactly as
 * `/api/runs/create` chooses it for the same request body, so the run signs
 * what this answered. Owner only, like the run itself.
 *
 * Read-only: no Firestore write, no run, no signature; the clean core level is
 * never part of the answer (`CLAUDE.md` — the grade stays out of the signed
 * audit pack).
 */
export const runtime = 'nodejs';

/**
 * The most ABAP one request is asked to analyse — the run route's own ceiling
 * (`MAX_ANALYSED_SOURCE_BYTES` in `app/api/runs/create/route.ts`), so nothing
 * this route answers is a source the run would refuse.
 */
const MAX_SOURCE_BYTES = 256 * 1024;

/** A JSON body around that source: escaping can double it, and a little more. */
const BODY_LIMITS = { maxBytes: 3 * MAX_SOURCE_BYTES, timeoutMs: 10_000 };

const tooLarge = () =>
  NextResponse.json(
    {
      error: `This source is larger than the ${MAX_SOURCE_BYTES / 1024} KB one analysis run reads. Analyse the object in parts.`,
      code: 'too-large',
    },
    { status: 413 },
  );

/**
 * Token, second factor and the request budget — before the project id is read
 * from the path, and so before the engine can run.
 */
async function gate(req: NextRequest): Promise<{ token: DecodedIdToken } | { refusal: NextResponse }> {
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return { refusal: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }
  // The evidence is read out of the customer's own code. A token from before the
  // second factor reads neither, here as in Firestore.
  try {
    await assertMfaSatisfied(req, decodedToken);
  } catch (mfaErr: unknown) {
    const q = mfaErr as { message?: string; status?: number };
    return {
      refusal: NextResponse.json({ error: q?.message || 'Multi-factor authentication required.' }, { status: q?.status || 403 }),
    };
  }
  // Every request runs the catalog-backed engine: a budget of its own.
  try {
    await assertRateLimit(`evidence-read:${decodedToken.uid}`, 240, 60 * 60 * 1000);
  } catch (rateErr: unknown) {
    const q = rateErr as { message?: string; status?: number };
    return { refusal: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }) };
  }
  return { token: decodedToken };
}

/** The project document, or the one answer for "not there" and "not yours". */
async function loadProject(
  projectId: string | undefined,
  uid: string,
  allowed: (data: unknown, uid: string) => boolean,
): Promise<{ data: Record<string, unknown> } | { refusal: NextResponse }> {
  if (!projectId) return { refusal: NextResponse.json({ error: 'No project named.' }, { status: 400 }) };
  // Checked before the id forms any document path (SEC-2026-514).
  if (!isFirestoreId(projectId)) return { refusal: NextResponse.json({ error: 'Invalid project id.' }, { status: 400 }) };
  // A suspended account reads nothing here, as in Firestore (accountActive()).
  const inactive = await refuseInactiveAccount(uid);
  if (inactive) return { refusal: inactive };
  const { db } = await getAdminDb();
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists || !allowed(snap.data(), uid)) {
    // A 404 that became a 403 would tell a caller which project ids exist.
    return { refusal: NextResponse.json({ error: 'No such project.' }, { status: 404 }) };
  }
  return { data: snap.data() as Record<string, unknown> };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gated = await gate(req);
    if ('refusal' in gated) return gated.refusal;
    const { projectId } = await params;
    const loaded = await loadProject(projectId, gated.token.uid, mayReadProject);
    if ('refusal' in loaded) return loaded.refusal;

    const source = typeof loaded.data.legacyCode === 'string' ? loaded.data.legacyCode : '';
    if (!source.trim()) {
      // Nothing staged is not an empty report: the caller is told so rather
      // than shown a clean bill.
      return NextResponse.json(
        { error: 'No source is staged on this project, so nothing was analysed.', code: 'no-source' },
        { status: 409 },
      );
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return tooLarge();

    return NextResponse.json(buildProjectEvidence(loaded.data, source));
  } catch (err: unknown) {
    logger.error('project evidence read failed', { route: 'api/projects/evidence', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the evidence of this project.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const gated = await gate(req);
    if ('refusal' in gated) return gated.refusal;
    const { projectId } = await params;
    // Owner only: this is the first half of a run, and only the owner runs one.
    const loaded = await loadProject(projectId, gated.token.uid, isProjectOwner);
    if ('refusal' in loaded) return loaded.refusal;

    const raw = await readBoundedBody(req, BODY_LIMITS).catch((bodyErr) =>
      bodyErr instanceof ResponseLimitError ? null : '',
    );
    if (raw === null) return tooLarge();
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw || '{}');
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return NextResponse.json({ error: 'The request is not JSON.' }, { status: 400 });
    }

    const source = body.source;
    if (typeof source !== 'string' || !source.trim()) {
      return NextResponse.json({ error: 'No source was sent, so nothing was analysed.', code: 'no-source' }, { status: 400 });
    }
    if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) return tooLarge();
    // The run refuses text with no ABAP construct; so does its preview.
    if (!looksLikeAbap(source)) {
      return NextResponse.json({ error: 'That does not look like ABAP.', code: 'not-abap' }, { status: 400 });
    }
    // The edition as the run reads it: the body's, else the project's, else Public.
    const deployment: unknown = body.s4Deployment || loaded.data.s4Deployment || 'public';
    if (deployment !== 'public' && deployment !== 'private') {
      return NextResponse.json(
        { error: 'The evidence engine assesses for the Public and the Private Edition only.', code: 'profile-rejected' },
        { status: 422 },
      );
    }
    // The release as the run reads it: the declaration sent, else the project's.
    let release: string | undefined;
    if (body.targetProfile !== undefined) {
      const parsed = normaliseAssessmentTarget(body.targetProfile);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: 'profile-malformed' }, { status: 400 });
      release = parsed.target.release;
    }
    const fileName = typeof body.fileName === 'string' ? body.fileName : '';

    return NextResponse.json(buildRunEvidence(loaded.data, { source, fileName, deployment, release }));
  } catch (err: unknown) {
    logger.error('project evidence preview failed', { route: 'api/projects/evidence', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not compute the evidence of this source.' }, { status: 500 });
  }
}
