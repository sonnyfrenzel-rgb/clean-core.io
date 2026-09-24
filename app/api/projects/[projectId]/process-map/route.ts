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
import { refuseInactiveAccount } from '@/lib/account-read-gate';
import { assertRateLimit } from '@/lib/rate-limit';
import { sha256Hex } from '@/lib/artefact-digest';
import { buildBpmnExportFromSource } from '@/lib/bpmn/export';
import { APP_VERSION } from '@/lib/version';
import {
  PROCESS_MAP_FORMAT_VERSION,
  isProcessMapRecord,
  parseBpmn,
  type ProcessMapRecord,
} from '@/lib/process-map';
import type { ProvenanceValue } from '@/lib/provenance';
import { isFirestoreId } from '@/lib/firestore-id';

/**
 * The traceability quote of a project's process map — roadmap 2.5.
 *
 *   GET  → `{ record }`, the stored quote or `null`.
 *   POST → `{ record }`, measured now from the project's stored source.
 *
 * **Why it is stored, and why here.** The roadmap asks for the quote per model,
 * kept — so that "37 of 41 elements carry a line anchor" is a fact about a
 * reading of a source at a point in time, and not a number that quietly changes
 * the next time the engine does. Three things follow from that:
 *
 *   1. **The server measures it.** The browser draws the same map, but a quote a
 *      browser could supply is a claim, not a measurement. The skeleton, the
 *      BPMN and the counts are all rebuilt here from `project.legacyCode`.
 *   2. **Firestore through the Admin SDK, at `projects/{projectId}/process_map/current`.**
 *      `firestore.rules` has no match for that subcollection, so no client can
 *      read or write it — which is why there is a GET here at all — and **no
 *      rules change and no rules deploy** are needed (a rules deploy is manual
 *      and needs an explicit go). Project and account deletion take it with them,
 *      because both delete a project recursively. The same shape roadmap 2.4
 *      uses for `process_naming`, for the same reasons.
 *   3. **It is bound to the source it was measured on.** The record carries the
 *      SHA-256 of that source; a screen looking at other bytes is shown nothing
 *      rather than a number belonging to a source nobody is reading. One
 *      document per project today, because one project has one source and one
 *      model; when model revisions arrive (roadmap 3.2) the document id becomes
 *      the revision.
 *
 * **Not evidence.** The quote measures the map, not the code. It never enters a
 * signed run or an audit pack, and nothing downstream may treat it as a verdict
 * about the source.
 *
 * Owner only, for reading as for writing: the quote is derived from the code,
 * and an administrator cannot read a project's code either.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'process_map';
const DOC = 'current';

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

  // The map is read out of the project's code. A token from before the second
  // factor reads nothing of it, here as in Firestore.
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
      await assertRateLimit(`process-map:${decodedToken.uid}`, 60, 60 * 60 * 1000);
    } catch (rateErr: unknown) {
      const q = rateErr as { message?: string; status?: number };
      return {
        ok: false,
        response: NextResponse.json({ error: q?.message || 'Too many requests.' }, { status: q?.status || 429 }),
      };
    }
    // The same gate the three sibling process routes apply, and the one this
    // route was missing: a suspended account, or one that has not accepted the
    // current terms, kept its write access to the process map while naming,
    // revisions and states refused it (security audit of b88c77b,
    // SEC-b88c77b-13, verified by counting the call in all four routes on
    // 21.09.2026 — this was the only zero).
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

    const data = snap.data() || {};
    const record = {
      formatVersion: data.formatVersion,
      sourceSha256: data.sourceSha256,
      fileName: data.fileName,
      runId: data.runId ?? null,
      flowNodes: data.flowNodes,
      anchored: data.anchored,
      unanchored: data.unanchored,
      percent: data.percent ?? null,
      statuses: data.statuses ?? {},
      engine: data.engine,
      measuredAt: isoOf(data.measuredAt),
    };
    // A document of another format version is not a quote this build can read.
    // Saying "none" is true; handing it over as one is not.
    return NextResponse.json({ record: isProcessMapRecord(record) ? record : null });
  } catch (err: unknown) {
    logger.error('process-map read failed', { route: 'api/projects/process-map', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not read the traceability quote.' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const gate = await openProject(req, params, true);
    if (!gate.ok) return gate.response;

    const source = gate.project.legacyCode;
    if (typeof source !== 'string' || source.trim() === '') {
      return NextResponse.json({ error: 'This project has no source to read.', code: 'no-source' }, { status: 409 });
    }

    // The map is drawn from the source the active run signed, and the quote is a
    // measurement of that map. Measuring a source the run never saw would give a
    // number about lines nobody signed.
    const signed = gate.project.inputFingerprint ?? gate.project.auditMetadata?.inputFingerprint;
    const sourceSha256 = sha256Hex(source);
    if (!gate.project.activeRunId || !signed?.sha256) {
      return NextResponse.json(
        { error: 'This project has no active run, so there is no signed source to measure.', code: 'no-run' },
        { status: 409 },
      );
    }
    if (signed.sha256 !== sourceSha256) {
      return NextResponse.json(
        { error: 'The source changed since the run signed it. Analyse it again before the map is measured.', code: 'source-moved' },
        { status: 409 },
      );
    }

    const fileName = signed.fileName || 'source.abap';
    const { xml, stats } = buildBpmnExportFromSource(source, {
      processName: typeof gate.project.name === 'string' && gate.project.name ? gate.project.name : fileName,
      sourceFileName: fileName,
    });

    // The statuses are counted out of the file, not asserted here: whatever 2.6
    // writes into `cc:trace/@status` is what the legend adds up.
    const statuses: Partial<Record<ProvenanceValue, number>> = {};
    for (const element of parseBpmn(xml).elements) {
      const status = element.trace?.status;
      if (status) statuses[status] = (statuses[status] ?? 0) + 1;
    }

    const record: ProcessMapRecord = {
      formatVersion: PROCESS_MAP_FORMAT_VERSION,
      sourceSha256,
      fileName,
      runId: typeof gate.project.activeRunId === 'string' ? gate.project.activeRunId : null,
      flowNodes: stats.flowNodes,
      anchored: stats.anchored,
      unanchored: stats.unanchored,
      percent: stats.flowNodes > 0 ? Math.floor((stats.anchored / stats.flowNodes) * 1000) / 10 : null,
      statuses,
      engine: APP_VERSION,
      measuredAt: new Date().toISOString(),
    };

    const { db } = await getAdminDb();
    // `set` without merge: a new measurement replaces the old one whole. Half of
    // one reading beside half of another is a quote no source ever produced.
    await db
      .collection('projects').doc(gate.projectId)
      .collection(COLLECTION).doc(DOC)
      .set({ ...record, measuredBy: gate.uid });

    return NextResponse.json({ record });
  } catch (err: unknown) {
    logger.error('process-map write failed', { route: 'api/projects/process-map', error: errMessage(err) });
    return NextResponse.json({ error: 'Could not measure the traceability quote.' }, { status: 500 });
  }
}
