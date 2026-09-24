import { NextRequest, NextResponse } from 'next/server';
import { logger, errMessage } from '@/lib/logger';
import {
  verifyRequestAuth,
  getAdminDb,
  assertAccountActive,
  assertMfaSatisfied,
  QuotaError,
} from '@/lib/firebase-admin';
import { mayReadProject } from '@/lib/project-readers';
import { assertRateLimit } from '@/lib/rate-limit';
import { sha256Hex } from '@/lib/artefact-digest';
import { verifyRunIntegrity } from '@/lib/run-signature';
import { getAuditSigningKey, MISSING_SIGNING_KEY_LOG } from '@/lib/audit-signing-key';
import { buildBpmnExportFromSource } from '@/lib/bpmn/export';
import {
  PROCESS_REVISION_COLLECTION,
  PROCESS_REVISION_FORMAT_VERSION,
  checkRevisionXml,
  isProcessRevisionRecord,
  readRevisionStats,
  type ProcessRevisionRecord,
  type ProcessRevisionSummary,
  type RevisionAccount,
} from '@/lib/process-revisions';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * The revisions of a project's process model — roadmap 3.2.
 *
 *   GET                 → `{ latest, revisions }`, the history without the BPMN.
 *   GET ?revision=n     → `{ record }`, one revision with its BPMN, or 404.
 *   POST {}             → `{ record, created }`, revision 1, reconstructed if absent.
 *   POST { xml, baseRevision } → `{ record, created }`, the next revision.
 *
 * Three properties, and all three are enforced here rather than asked of the
 * caller:
 *
 *   1. **Revision 1 is the reconstructed Ist.** It is built on this server from
 *      the skeleton of the source the active run signed (`buildBpmnExport`) and
 *      never from a body. A browser cannot post revision 1, cannot replace it,
 *      and an edit arriving at an empty history reconstructs it first and lands
 *      as revision 2. So "the Ist is unchanged after modelling" is not a
 *      discipline anybody has to keep — there is no code path that changes it.
 *      **"The source the active run signed" is read out of the run itself**, and
 *      that is a correction rather than a description: this route used to take
 *      the project document's word for it. It read the mirrored fingerprint off
 *      the project, checked that `activeRunId` was truthy, and reconstructed. The
 *      run was never loaded and its signature never verified, so any truthy
 *      `activeRunId` — a run that does not exist, one of another project, a
 *      string — satisfied the check, and revision 1 then carried that id and the
 *      claim of being the signed source. Now the run is loaded through the Admin
 *      SDK, `verifyRunIntegrity` rehashes it and checks its HMAC (the same check
 *      `api/audit-pack/create` makes before it signs anything on top of a run),
 *      it must name this project and this document, and the digest **it** signed
 *      is what the reconstruction bytes are compared against. The check runs
 *      where the claim is made — at the one write that creates revision 1. Every
 *      later revision carries that revision's `runId`, `sourceSha256` and file
 *      name forward rather than measuring anything again, which is what makes
 *      "the chain descends from one verified run" a property of the store and
 *      not of the caller.
 *   2. **A written revision is never written again.** Documents are created with
 *      `DocumentReference.create()`, which fails when the document exists. No
 *      `set`, no `update`, no merge, no delete. A second save makes the next
 *      revision; two saves that race leave one of them with a 409 and no write.
 *   3. **The account and the time come from the server.** The account is the
 *      verified token and the profile behind it; the time is this server's
 *      clock. Neither is read out of the request body.
 *
 * Stored at `projects/{projectId}/process_revisions/{n}` through the Admin SDK.
 * `firestore.rules` has no match for that subcollection, so no client can read
 * or write it — which is why there is a GET here at all — and **no rules change
 * and no rules deploy** are needed. Project and account deletion take the
 * revisions with them: both call `recursiveDelete` on the project document,
 * which descends into every subcollection, named or not. The same shape roadmap
 * 2.4 uses for `process_naming` and 2.5 for `process_map`.
 *
 * **Not evidence.** A revision records what somebody drew and when, not that
 * the drawing is right. It enters no signed run and no audit pack, and nothing
 * downstream may read it as a statement about the code.
 *
 * Owner only, for reading as for writing: a process model is the project's code
 * in another shape, and an administrator cannot read a project's code either.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ProjectShape {
  userId?: unknown;
  legacyCode?: unknown;
  name?: unknown;
  activeRunId?: unknown;
  inputFingerprint?: { sha256?: string; fileName?: string };
  auditMetadata?: { inputFingerprint?: { sha256?: string; fileName?: string } };
}

type Gate =
  | { ok: true; uid: string; projectId: string; project: ProjectShape }
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

  // A revision holds the process drawn out of the project's code. A token from
  // before the second factor reads nothing of it, here as in Firestore.
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
    // Higher than 2.4's and 2.5's: modelling saves often, and every save that
    // changes nothing is answered without a write anyway.
    try {
      await assertRateLimit(`process-revisions:${decodedToken.uid}`, 120, 60 * 60 * 1000);
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
  const project = (snap.data() || {}) as ProjectShape;
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
  return { ok: true, uid: decodedToken.uid, projectId, project };
}

/* ------------------------------------------------------------------ */

/** A Firestore Timestamp, a Date or an ISO string, as ISO. */
function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

/** The stored fields and nothing else — a field a later build adds is not handed out by accident. */
function summaryOf(data: Record<string, unknown>): ProcessRevisionSummary {
  const account = (data.account || {}) as Partial<RevisionAccount>;
  return {
    formatVersion: data.formatVersion as number,
    revision: data.revision as number,
    origin: data.origin as ProcessRevisionSummary['origin'],
    account: {
      uid: String(account.uid ?? ''),
      name: String(account.name ?? ''),
      email: String(account.email ?? ''),
    },
    savedAt: isoOf(data.savedAt),
    xmlSha256: String(data.xmlSha256 ?? ''),
    sourceSha256: String(data.sourceSha256 ?? ''),
    fileName: String(data.fileName ?? ''),
    runId: typeof data.runId === 'string' ? data.runId : null,
    flowNodes: data.flowNodes as number,
    anchored: data.anchored as number,
    unanchored: data.unanchored as number,
  };
}

function recordOf(data: Record<string, unknown>): ProcessRevisionRecord {
  return { ...summaryOf(data), xml: String(data.xml ?? '') };
}

type AdminDb = Awaited<ReturnType<typeof getAdminDb>>['db'];

function revisionsOf(db: AdminDb, projectId: string) {
  return db.collection('projects').doc(projectId).collection(PROCESS_REVISION_COLLECTION);
}

async function latestRevision(
  db: AdminDb,
  projectId: string,
): Promise<ProcessRevisionRecord | null> {
  // Ordered by the field, not by the document id: ids are "1", "2" … "10", and
  // as strings "10" sorts before "2".
  const snap = await revisionsOf(db, projectId).orderBy('revision', 'desc').limit(1).get();
  if (snap.empty) return null;
  const record = recordOf(snap.docs[0].data() as Record<string, unknown>);
  return isProcessRevisionRecord(record) ? record : null;
}

/** The name on the profile, or the e-mail. Read here, never sent by a browser. */
async function accountOf(
  db: AdminDb,
  uid: string,
): Promise<RevisionAccount> {
  let name = '';
  let email = '';
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() || {}) as { firstName?: string; lastName?: string; email?: string };
    name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    email = typeof data.email === 'string' ? data.email : '';
  } catch {
    /* a missing profile must not stop the revision — it is named by its account id below */
  }
  return { uid, name: name || email || uid, email };
}

const ALREADY_EXISTS = 6;

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === ALREADY_EXISTS || String(e?.message ?? '').includes('ALREADY_EXISTS');
}

interface Written {
  record: ProcessRevisionRecord;
  created: boolean;
}

/** The run `activeRunId` names, once it has been shown to be that run. */
interface VerifiedRun {
  runId: string;
  sha256: string;
  fileName: string;
}

/**
 * The active run of this project, loaded and verified — or the refusal.
 *
 * Nothing here trusts the project document. `activeRunId` is a field the run
 * route writes, but the fingerprint beside it is a mirror, and a mirror is not
 * evidence: the run is fetched, rehashed and its HMAC checked, and only then is
 * the digest it signed handed back as the source revision 1 may be built from.
 */
async function verifiedRun(
  db: AdminDb,
  gate: Extract<Gate, { ok: true }>,
): Promise<VerifiedRun | { refusal: NextResponse }> {
  const runId = typeof gate.project.activeRunId === 'string' ? gate.project.activeRunId.trim() : '';
  if (!runId) {
    return {
      refusal: NextResponse.json(
        { error: 'This project has no active run, so there is no signed source to reconstruct from.', code: 'no-run' },
        { status: 409 },
      ),
    };
  }

  // One sentence for every way the run fails to be this project's signed run.
  // Which way it was is in the log and nowhere else: a caller that could tell
  // "no such run" from "the signature does not check out" could use this route
  // to probe the store, and neither answer changes what the reader must do.
  const unverified = NextResponse.json(
    {
      error:
        'The analysis run this project points at could not be verified as the run that signed its source. Analyse the source again before a process is reconstructed from it.',
      code: 'run-unverified',
    },
    { status: 409 },
  );

  const runSnap = await db.collection('projects').doc(gate.projectId).collection('runs').doc(runId).get();
  if (!runSnap.exists) {
    logger.warn('process-revisions refused: activeRunId names no run', {
      route: 'api/projects/process-revisions',
      projectId: gate.projectId,
      runId,
    });
    return { refusal: unverified };
  }
  const runData = (runSnap.data() || {}) as Record<string, unknown>;

  // The signature covers the run's own `projectId` and `runId`, so a document
  // copied into another project verifies against the signature it was born with
  // while naming somewhere else. Both are compared to where it was found.
  if (runData.projectId !== gate.projectId || runData.runId !== runId) {
    logger.warn('process-revisions refused: the run names another project or another id', {
      route: 'api/projects/process-revisions',
      projectId: gate.projectId,
      runId,
    });
    return { refusal: unverified };
  }

  const key = getAuditSigningKey();
  if (!key) {
    console.error(MISSING_SIGNING_KEY_LOG);
    return { refusal: NextResponse.json({ error: 'Internal Server Error' }, { status: 500 }) };
  }
  const integrity = verifyRunIntegrity(runData, key);
  if (!integrity.valid) {
    logger.error('process-revisions refused: run integrity check failed', {
      route: 'api/projects/process-revisions',
      projectId: gate.projectId,
      runId,
      reason: integrity.reason,
    });
    return { refusal: unverified };
  }

  const fingerprint = (runData.inputFingerprint || {}) as { sha256?: unknown; fileName?: unknown };
  if (typeof fingerprint.sha256 !== 'string' || fingerprint.sha256 === '') {
    logger.error('process-revisions refused: the verified run carries no source digest', {
      route: 'api/projects/process-revisions',
      projectId: gate.projectId,
      runId,
    });
    return { refusal: unverified };
  }

  return {
    runId,
    sha256: fingerprint.sha256,
    fileName: typeof fingerprint.fileName === 'string' && fingerprint.fileName ? fingerprint.fileName : '',
  };
}

/**
 * Revision 1, reconstructing it when the project has none.
 *
 * Built from the source the active run signed and from nothing else: a
 * reconstruction of bytes nobody signed would be a picture of a program that is
 * not the program under analysis.
 */
async function ensureBaseline(
  db: AdminDb,
  gate: Extract<Gate, { ok: true }>,
): Promise<Written | { refusal: NextResponse }> {
  const existing = await revisionsOf(db, gate.projectId).doc('1').get();
  if (existing.exists) {
    const record = recordOf(existing.data() as Record<string, unknown>);
    if (isProcessRevisionRecord(record)) return { record, created: false };
    return {
      refusal: NextResponse.json(
        { error: 'Revision 1 of this project was written in a shape this build cannot read.', code: 'format-version' },
        { status: 409 },
      ),
    };
  }

  const source = gate.project.legacyCode;
  if (typeof source !== 'string' || source.trim() === '') {
    return {
      refusal: NextResponse.json(
        { error: 'This project has no source, so there is no process to reconstruct.', code: 'no-source' },
        { status: 409 },
      ),
    };
  }
  const sourceSha256 = sha256Hex(source);
  const run = await verifiedRun(db, gate);
  if ('refusal' in run) return run;
  if (run.sha256 !== sourceSha256) {
    return {
      refusal: NextResponse.json(
        { error: 'The source changed since the run signed it. Analyse it again before the process is reconstructed.', code: 'source-moved' },
        { status: 409 },
      ),
    };
  }

  // The file name the run signed, not the one mirrored on the project: the
  // mirror is what the reconstruction is *named* after, and it is beside the
  // digest that was just proven, so it comes from the same place.
  const fileName = run.fileName
    || gate.project.inputFingerprint?.fileName
    || gate.project.auditMetadata?.inputFingerprint?.fileName
    || 'source.abap';
  const { xml } = buildBpmnExportFromSource(source, {
    processName: typeof gate.project.name === 'string' && gate.project.name ? gate.project.name : fileName,
    sourceFileName: fileName,
  });
  const stats = readRevisionStats(xml);
  const record: ProcessRevisionRecord = {
    formatVersion: PROCESS_REVISION_FORMAT_VERSION,
    revision: 1,
    origin: 'reconstructed',
    // Who had it reconstructed, not who drew it: nobody drew revision 1.
    account: await accountOf(db, gate.uid),
    savedAt: new Date().toISOString(),
    xmlSha256: sha256Hex(xml),
    sourceSha256,
    fileName,
    // The id of the run that was loaded and verified above — the field says the
    // revision came from that run, and now it has been shown to.
    runId: run.runId,
    ...stats,
    xml,
  };

  try {
    await revisionsOf(db, gate.projectId).doc('1').create(record);
    return { record, created: true };
  } catch (err: unknown) {
    // Two calls reconstructed at once. The one that lost reads the winner's
    // document rather than overwriting it.
    if (!isAlreadyExists(err)) throw err;
    const again = await revisionsOf(db, gate.projectId).doc('1').get();
    const stored = recordOf((again.data() || {}) as Record<string, unknown>);
    if (isProcessRevisionRecord(stored)) return { record: stored, created: false };
    throw err;
  }
}

/* ------------------------------------------------------------------ */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, false);
    if (!gate.ok) return gate.response;

    const { db } = await getAdminDb();
    const asked = req.nextUrl.searchParams.get('revision');

    /**
     * `?stand=1` — the number and nothing else (roadmap 6.9, CR-15).
     *
     * The workspace asks "has the Stand moved?" on focus, on reload and before
     * a write. Answering that with the full history means reading every
     * revision document of the project to throw all but the last number away;
     * `latestRevision` is one document, ordered by the field. The bound on how
     * *often* it is asked lives in the browser (`lib/workspace-revision.ts`);
     * this is the bound on what one ask costs.
     */
    if (req.nextUrl.searchParams.get('stand') === '1') {
      const newest = await latestRevision(db, gate.projectId);
      return NextResponse.json(
        { latest: newest ? newest.revision : null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (asked !== null) {
      const n = Number(asked);
      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json({ error: 'A revision is a whole number from 1 upwards.', code: 'bad-request' }, { status: 400 });
      }
      const snap = await revisionsOf(db, gate.projectId).doc(String(n)).get();
      if (!snap.exists) return NextResponse.json({ error: 'No such revision.', code: 'not-found' }, { status: 404 });
      const record = recordOf(snap.data() as Record<string, unknown>);
      // A document of another format version is not a revision this build can
      // read. Saying so is true; handing it over as one is not.
      return isProcessRevisionRecord(record)
        ? NextResponse.json({ record })
        : NextResponse.json({ error: 'This revision was written in a shape this build cannot read.', code: 'format-version' }, { status: 409 });
    }

    const snap = await revisionsOf(db, gate.projectId).orderBy('revision', 'asc').get();
    const docs = snap.docs as Array<{ data: () => Record<string, unknown> }>;
    const revisions = docs
      .map((d): ProcessRevisionSummary => summaryOf(d.data()))
      .filter((r: ProcessRevisionSummary) => r.formatVersion === PROCESS_REVISION_FORMAT_VERSION);
    return NextResponse.json({
      latest: revisions.length ? revisions[revisions.length - 1].revision : null,
      revisions,
    });
  } catch (err: unknown) {
    logger.error('process-revisions read failed', { route: 'api/projects/process-revisions', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the revisions of this process.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const body = (await req.json().catch(() => null)) as { xml?: unknown; baseRevision?: unknown } | null;
    const { db } = await getAdminDb();

    const baseline = await ensureBaseline(db, gate);
    if ('refusal' in baseline) return baseline.refusal;

    // No model in the body: the caller wanted the Ist to exist, and now it does.
    if (!body || body.xml === undefined) {
      return NextResponse.json({ record: baseline.record, created: baseline.created }, { status: baseline.created ? 201 : 200 });
    }

    const checked = await checkRevisionXml(body.xml);
    if (!checked.ok) {
      return NextResponse.json(
        { error: checked.error, code: checked.code },
        { status: checked.code === 'too-large' ? 413 : 400 },
      );
    }

    const latest = (await latestRevision(db, gate.projectId)) ?? baseline.record;

    // The same bytes again. Saving a drawing that is byte for byte the drawing
    // already stored adds a row to the history that says nothing happened — and
    // a browser that retries a save on a dropped connection would create one
    // every time. So: no write, and the revision that is already there.
    if (latest.xmlSha256 === checked.sha256) {
      return NextResponse.json({ record: latest, created: false, unchanged: true });
    }

    if (!Number.isInteger(body.baseRevision) || (body.baseRevision as number) < 1) {
      return NextResponse.json(
        { error: 'Expected { xml, baseRevision }: the revision this model was opened from.', code: 'bad-request' },
        { status: 400 },
      );
    }
    if (body.baseRevision !== latest.revision) {
      return NextResponse.json(
        {
          error: `This model was opened from revision ${body.baseRevision}, and revision ${latest.revision} has been saved since. Open the newer one before saving.`,
          code: 'revision-moved',
          latest: latest.revision,
        },
        { status: 409 },
      );
    }

    const record: ProcessRevisionRecord = {
      formatVersion: PROCESS_REVISION_FORMAT_VERSION,
      revision: latest.revision + 1,
      origin: 'edited',
      account: await accountOf(db, gate.uid),
      // The server's clock. A time a browser supplied would be a time anyone
      // could choose, and the history would say whatever the last caller wanted.
      savedAt: new Date().toISOString(),
      xmlSha256: checked.sha256,
      // The reading the whole chain descends from, carried forward from
      // revision 1 rather than measured again — an edited model is not a reading
      // of a source, and a digest of today's bytes beside it would suggest it is.
      sourceSha256: baseline.record.sourceSha256,
      fileName: baseline.record.fileName,
      runId: baseline.record.runId,
      ...checked.stats,
      xml: checked.xml,
    };

    try {
      await revisionsOf(db, gate.projectId).doc(String(record.revision)).create(record);
    } catch (err: unknown) {
      if (!isAlreadyExists(err)) throw err;
      // Somebody else got this number between the read and the write. Nothing
      // was overwritten, and the caller is told which revision to open.
      const now = await latestRevision(db, gate.projectId);
      return NextResponse.json(
        {
          error: `Revision ${record.revision} was saved by another session while this one was being written. Open it before saving again.`,
          code: 'revision-moved',
          latest: now?.revision ?? record.revision,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ record, created: true }, { status: 201 });
  } catch (err: unknown) {
    logger.error('process-revisions write failed', { route: 'api/projects/process-revisions', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not store this revision of the process.' }, { status: 500 });
  }
}
