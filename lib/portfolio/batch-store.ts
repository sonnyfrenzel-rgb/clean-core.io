import { looksLikeAbap } from '@/lib/abap-input-check';
import { scanCodeContent } from '@/lib/staged-code-scan';
import { normaliseAssessmentTarget } from '@/lib/assessment-target';
import { OWN_CODE_MAX_SOURCE_BYTES } from '@/lib/own-code-import';
import {
  batchOfStored,
  isOpenBatch,
  itemOfStored,
  nextClaims,
  outcomeOfRun,
  programsInWindow,
  progressOf,
  type Batch,
  type BatchItem,
  type BatchProgress,
} from './batch-model';
import {
  PORTFOLIO_BATCH_MAX_PROGRAMS,
  PORTFOLIO_DAILY_MAX_PROGRAMS,
  PORTFOLIO_DAY_MS,
  PORTFOLIO_NAME_MAX_CHARS,
  PORTFOLIO_STEP_BUDGET_MS,
} from './limits';
import { portfolioBatchMessages as M } from '../messages/portfolio';

/**
 * The batch queue in Firestore — roadmap 3.0.21 (1). Server-only, Admin SDK.
 *
 *   portfolio_batches/{batchId}            the batch: owner, name, target, total
 *   portfolio_batches/{batchId}/items/{id} one program: its source until a project
 *                                          holds it, then the project, the run or
 *                                          the reason it failed
 *
 * No rule opens either to a browser: `firestore.rules` has no match for them,
 * and the default is deny. Every read goes through a route that checks the
 * owner.
 *
 * **The source travels once.** An item holds the program's source only until
 * the step makes its project; the project write and the removal of the source
 * from the item are one batched write, so a step that is lost in between
 * leaves either the item with its source (and no project) or the project (and
 * no source on the item) — never two projects for one program. A cancelled
 * batch drops the sources of every program not yet made into a project.
 */

type AdminDb = any; // the Admin SDK is reached through a dynamic import (lib/firebase-admin.ts) and arrives untyped
type FieldValueT = any;

export const BATCH_COLLECTION = 'portfolio_batches';
export const BATCH_ITEMS = 'items';

/** One program as the upload sends it. */
export interface UploadedProgram {
  name: string;
  fileName: string;
  source: string;
  missing: string[];
}

export class BatchRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'BatchRefusal';
  }
}

/* -------------------------------------------------------------- the payload */

/** One program of a body, checked; a refusal names why, before any project exists. */
export function checkUploadedProgram(raw: unknown): { ok: true; program: UploadedProgram } | { ok: false; name: string; reason: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 254) : '';
  const fileName = typeof r.fileName === 'string' && r.fileName.trim() ? r.fileName.trim().split('/').pop()!.slice(0, 200) : `${name || 'program'}.abap`;
  const missing = Array.isArray(r.missing)
    ? r.missing.filter((m): m is string => typeof m === 'string').map((m) => m.slice(0, 60)).slice(0, 200)
    : [];
  if (!name) return { ok: false, name: '(no name)', reason: M.noName };
  if (typeof r.source !== 'string' || !r.source.trim()) return { ok: false, name, reason: M.noSource };
  const bytes = Buffer.byteLength(r.source, 'utf8');
  if (bytes > OWN_CODE_MAX_SOURCE_BYTES) return { ok: false, name, reason: M.tooLarge(bytes, OWN_CODE_MAX_SOURCE_BYTES) };
  if (!looksLikeAbap(r.source)) return { ok: false, name, reason: M.notAbap };
  const blocked = scanCodeContent(r.source);
  if (blocked) return { ok: false, name, reason: blocked };
  return { ok: true, program: { name, fileName, source: r.source, missing } };
}

/** The batch header of a create body, checked. */
export function checkBatchHeader(raw: unknown): { name: string; edition: 'public' | 'private'; release: string; total: number } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const total = typeof r.total === 'number' && Number.isInteger(r.total) ? r.total : 0;
  if (total < 1) throw new BatchRefusal(M.empty, 400, 'batch-empty');
  if (total > PORTFOLIO_BATCH_MAX_PROGRAMS) throw new BatchRefusal(M.overBatchLimit(PORTFOLIO_BATCH_MAX_PROGRAMS), 400, 'batch-too-large');
  const edition = r.edition === 'private' ? 'private' : r.edition === 'public' ? 'public' : null;
  if (!edition) throw new BatchRefusal(M.noEdition, 400, 'batch-edition');
  let release = '';
  if (edition === 'private' && r.release !== undefined && r.release !== '') {
    const parsed = normaliseAssessmentTarget({ release: r.release });
    if (!parsed.ok) throw new BatchRefusal(parsed.error, 400, 'batch-release');
    release = parsed.target.release;
  }
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, PORTFOLIO_NAME_MAX_CHARS) : M.defaultName;
  return { name, edition, release, total };
}

/* ------------------------------------------------------------------- reads */

async function itemsOf(db: AdminDb, batchId: string): Promise<BatchItem[]> {
  const snap = await db
    .collection(BATCH_COLLECTION)
    .doc(batchId)
    .collection(BATCH_ITEMS)
    .select('seq', 'name', 'fileName', 'projectId', 'status', 'claimedAt', 'runId', 'reason', 'code', 'missing')
    .get();
  return snap.docs
    .map((d: { id: string; data: () => Record<string, unknown> }) => itemOfStored(d.id, d.data()))
    .sort((a: BatchItem, b: BatchItem) => a.seq - b.seq);
}

/** The account's batches, newest first — headers only. */
export async function batchesOf(db: AdminDb, uid: string): Promise<Batch[]> {
  const snap = await db.collection(BATCH_COLLECTION).where('userId', '==', uid).get();
  return snap.docs
    .map((d: { id: string; data: () => Record<string, unknown> }) => batchOfStored(d.id, d.data()))
    .sort((a: Batch, b: Batch) => b.createdAt - a.createdAt);
}

/** One batch of this owner with its items and progress; `null` for "not there or not yours". */
export async function readBatch(
  db: AdminDb,
  uid: string,
  batchId: string,
): Promise<{ batch: Batch; items: BatchItem[]; progress: BatchProgress } | null> {
  const snap = await db.collection(BATCH_COLLECTION).doc(batchId).get();
  if (!snap.exists) return null;
  const batch = batchOfStored(batchId, snap.data() || {});
  if (batch.userId !== uid) return null;
  const items = await itemsOf(db, batchId);
  return { batch, items, progress: progressOf(items, batch) };
}

/* ------------------------------------------------------------------ writes */

/**
 * Append programs to a batch: each checked program becomes a queued item with
 * its source; each refused one a failed item with its reason and no project.
 * One transaction, so two overlapping appends cannot overrun `total`.
 */
export async function appendPrograms(db: AdminDb, uid: string, batchId: string, rawPrograms: unknown[]): Promise<number> {
  if (!Array.isArray(rawPrograms) || rawPrograms.length === 0) throw new BatchRefusal(M.empty, 400, 'batch-empty');
  const batchRef = db.collection(BATCH_COLLECTION).doc(batchId);
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
    const data = snap.data() || {};
    const batch = batchOfStored(batchId, data);
    if (batch.userId !== uid) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
    if (batch.status === 'cancelled') throw new BatchRefusal(M.cancelledAlready, 409, 'batch-cancelled');
    const appended = typeof data.appended === 'number' ? data.appended : 0;
    if (appended + rawPrograms.length > batch.total) throw new BatchRefusal(M.overAnnounced, 400, 'batch-overrun');
    rawPrograms.forEach((raw, i) => {
      const seq = appended + i;
      const ref = batchRef.collection(BATCH_ITEMS).doc(`p${String(seq).padStart(4, '0')}`);
      const checked = checkUploadedProgram(raw);
      const base = { seq, projectId: null, claimedAt: null, runId: null };
      tx.create(
        ref,
        checked.ok
          ? { ...base, name: checked.program.name, fileName: checked.program.fileName, missing: checked.program.missing, source: checked.program.source, status: 'queued', reason: null, code: null }
          : { ...base, name: checked.name, fileName: '', missing: [], status: 'failed', reason: checked.reason, code: 'refused-before-project' },
      );
    });
    tx.update(batchRef, { appended: appended + rawPrograms.length });
    return appended + rawPrograms.length;
  });
}

/**
 * Create a batch for this account: one at a time, and at most
 * `PORTFOLIO_DAILY_MAX_PROGRAMS` programs in a rolling day.
 */
export async function createBatch(
  db: AdminDb,
  uid: string,
  header: ReturnType<typeof checkBatchHeader>,
  now: number = Date.now(),
): Promise<string> {
  const existing = await batchesOf(db, uid);
  for (const b of existing) {
    if (b.status === 'cancelled' || b.status === 'done') continue;
    const items = await itemsOf(db, b.id);
    if (isOpenBatch(b, progressOf(items, b))) throw new BatchRefusal(M.oneAtATime, 409, 'batch-open');
  }
  const used = programsInWindow(existing, now, PORTFOLIO_DAY_MS);
  if (used + header.total > PORTFOLIO_DAILY_MAX_PROGRAMS) {
    throw new BatchRefusal(M.overDailyLimit(PORTFOLIO_DAILY_MAX_PROGRAMS, Math.max(0, PORTFOLIO_DAILY_MAX_PROGRAMS - used)), 429, 'batch-daily-limit');
  }
  const ref = db.collection(BATCH_COLLECTION).doc();
  await ref.create({ userId: uid, name: header.name, edition: header.edition, release: header.release, total: header.total, appended: 0, status: 'queued', createdAt: now });
  return ref.id;
}

/** Cancel: nothing queued is taken any more; queued programs fail as cancelled and drop their source. */
export async function cancelBatch(db: AdminDb, uid: string, batchId: string, FieldValue: FieldValueT): Promise<void> {
  const found = await readBatch(db, uid, batchId);
  if (!found) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
  const writes = db.batch();
  writes.update(db.collection(BATCH_COLLECTION).doc(batchId), { status: 'cancelled' });
  for (const item of found.items) {
    if (item.status !== 'queued') continue;
    writes.update(db.collection(BATCH_COLLECTION).doc(batchId).collection(BATCH_ITEMS).doc(item.id), {
      status: 'failed',
      reason: M.cancelled,
      code: 'cancelled',
      source: FieldValue.delete(),
    });
  }
  await writes.commit();
}

/**
 * Delete the record of a batch, with the sources still queued in it. Its
 * projects stay — they are the account's. Open to an account that no longer
 * has its key (`mode: 'manage'`), so a queue can always be taken back.
 */
export async function deleteBatchRecord(db: AdminDb, uid: string, batchId: string): Promise<void> {
  const found = await readBatch(db, uid, batchId);
  if (!found) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
  await db.recursiveDelete(db.collection(BATCH_COLLECTION).doc(batchId));
}

/* -------------------------------------------------------------------- step */

/** How a step signs one program: the run route's handler, called in-process (see the route). */
export type SignRun = (body: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> | null }>;

/**
 * Work the queue a little: take up to `PORTFOLIO_STEP_MAX_ITEMS` programs, make
 * each one's project and sign its run through `signRun`, record the outcome.
 * Programs taken but not reached inside the time budget go back to the queue.
 */
export async function stepBatch(
  db: AdminDb,
  FieldValue: FieldValueT,
  uid: string,
  batchId: string,
  signRun: SignRun,
  clock: () => number = Date.now,
): Promise<{ batch: Batch; items: BatchItem[]; progress: BatchProgress }> {
  const batchRef = db.collection(BATCH_COLLECTION).doc(batchId);
  const started = clock();

  const taken = await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
    const batch = batchOfStored(batchId, snap.data() || {});
    if (batch.userId !== uid) throw new BatchRefusal(M.notFound, 404, 'batch-not-found');
    if (batch.status === 'cancelled') return { batch, picks: [] as BatchItem[] };
    const open = await tx.get(batchRef.collection(BATCH_ITEMS).where('status', 'in', ['queued', 'running']));
    const items: BatchItem[] = open.docs.map((d: { id: string; data: () => Record<string, unknown> }) => itemOfStored(d.id, d.data()));
    const now = clock();
    const picks = nextClaims(items, now);
    for (const p of picks) tx.update(batchRef.collection(BATCH_ITEMS).doc(p.id), { status: 'running', claimedAt: now });
    if (picks.length > 0 && batch.status === 'queued') tx.update(batchRef, { status: 'running' });
    return { batch, picks };
  });

  const { batch } = taken;
  for (const pick of taken.picks) {
    const itemRef = batchRef.collection(BATCH_ITEMS).doc(pick.id);
    if (clock() - started > PORTFOLIO_STEP_BUDGET_MS) {
      await itemRef.update({ status: 'queued', claimedAt: null });
      continue;
    }
    try {
      let projectId = pick.projectId;
      if (projectId) {
        // Taken again after a lost step: the project exists; it may even hold
        // the run already, and then nothing is signed twice.
        const project = await db.collection('projects').doc(projectId).get();
        const activeRunId = project.exists ? (project.data() || {}).activeRunId : null;
        if (!project.exists) {
          await itemRef.update({ status: 'failed', reason: M.projectGone, code: 'project-gone', claimedAt: null });
          continue;
        }
        if (typeof activeRunId === 'string' && activeRunId) {
          await itemRef.update({ status: 'done', runId: activeRunId, reason: null, code: null, claimedAt: null });
          continue;
        }
      } else {
        const full = await itemRef.get();
        const source = (full.data() || {}).source;
        if (typeof source !== 'string' || !source) {
          await itemRef.update({ status: 'failed', reason: M.noSource, code: 'no-source', claimedAt: null });
          continue;
        }
        const projectRef = db.collection('projects').doc();
        projectId = projectRef.id;
        // The shape a browser creates (`OwnCodeImport`), with the target the
        // run is signed against and the batch it came from. One write with
        // the item, so a program never gets two projects.
        const writes = db.batch();
        writes.create(projectRef, {
          name: pick.name || pick.fileName || 'Program',
          status: 'uploaded',
          legacyCode: source,
          userId: uid,
          createdAt: FieldValue.serverTimestamp(),
          s4Deployment: batch.edition,
          portfolioBatchId: batchId,
        });
        writes.update(itemRef, { projectId, source: FieldValue.delete() });
        await writes.commit();
      }

      const result = await signRun({
        projectId,
        s4Deployment: batch.edition,
        ...(batch.edition === 'private' && batch.release ? { targetProfile: { release: batch.release } } : {}),
        // Engine only: no narrative, no receipt — the run records that no
        // model took part (`modelParticipation: 'none'`).
        analysis: '',
        uploadedFileName: pick.fileName || `${pick.name}.abap`,
      });
      const outcome = outcomeOfRun(result.status, result.body);
      await itemRef.update(
        outcome.status === 'done'
          ? { status: 'done', runId: outcome.runId, reason: null, code: null, claimedAt: null }
          : { status: 'failed', reason: outcome.reason, code: outcome.code, claimedAt: null },
      );
    } catch {
      // The reason stays on the server's log through the run route; the item
      // says what the reader can act on.
      await itemRef.update({ status: 'failed', reason: M.stepFailed, code: 'step-failed', claimedAt: null }).catch(() => {});
    }
  }

  const items = await itemsOf(db, batchId);
  const progress = progressOf(items, batch);
  if (progress.finished && batch.status !== 'cancelled' && batch.status !== 'done') {
    await batchRef.update({ status: 'done' });
    return { batch: { ...batch, status: 'done' }, items, progress };
  }
  return { batch, items, progress };
}
