import type { Firestore } from 'firebase-admin/firestore';
import { isFirestoreId } from '@/lib/firestore-id';
import {
  REPAIR_DRAFT_COLLECTION,
  buildRepairDraft,
  decideAdoption,
  isIntactRepairDraft,
  projectRevision,
  storedSuiteSource,
  type RepairBase,
  type RepairDraft,
  type RepairDraftExecution,
  type RepairDraftRefusal,
} from './repair-draft';

/**
 * The Firestore half of roadmap 8.7: where drafts are read and written, always
 * inside a transaction, always with the Admin SDK.
 *
 * `db` is a parameter so the specs can run every path against the emulator
 * without a server — the same shape `lib/mfa-disable.ts` and
 * `lib/survey/link-fetch.ts` have. The decisions themselves are in
 * `lib/repair-draft.ts`; this module only reads what they need, in the
 * transaction the write is conditional on, and writes what they return.
 *
 * `projects/{id}/repairDrafts/{draftId}` has no `match` block in
 * `firestore.rules`, so the default deny closes it to every browser — read and
 * write. No rules change and no rules deploy.
 */

type Refusal = Pick<RepairDraftRefusal, 'status' | 'code' | 'error'>;

export type ProposeOutcome =
  | { status: 200; draft: RepairDraft }
  | Refusal;

export type LoadOutcome = { status: 200; draft: RepairDraft } | Refusal;

export type AdoptOutcome = { status: 200; draftId: string; fields: Record<string, unknown> } | Refusal;

const draftsOf = (db: Firestore, projectId: string) =>
  db.collection('projects').doc(projectId).collection(REPAIR_DRAFT_COLLECTION);

// Same answer for "no such project" and "not yours" — the wording the commands
// route and the readers route use, so a 404 cannot be used to ask whether one exists.
const NOT_FOUND: Refusal = { status: 404, code: 'not-found', error: 'Project not found.' };
const draftNotFound = (id: string): Refusal => ({ status: 404, code: 'draft-not-found', error: `There is no repair draft ${id} on this project.` });

/**
 * Cuts a draft. The base is the server's own copy — of the project, or of the
 * draft being repaired further — never the browser's.
 */
export async function proposeRepairDraft(
  db: Firestore,
  args: { projectId: string; uid: string; body: unknown; now: string },
): Promise<ProposeOutcome> {
  const projectRef = db.collection('projects').doc(args.projectId);
  const body = (args.body && typeof args.body === 'object' ? args.body : {}) as Record<string, unknown>;
  const parentDraftId = typeof body.parentDraftId === 'string' && body.parentDraftId ? body.parentDraftId : null;
  // Checked before the id forms any document path (SEC-2026-514).
  if (parentDraftId !== null && !isFirestoreId(parentDraftId)) {
    return { status: 400, code: 'invalid-draft', error: 'Invalid draft id.' };
  }

  return db.runTransaction(async (tx): Promise<ProposeOutcome> => {
    const snap = await tx.get(projectRef);
    if (!snap.exists) return NOT_FOUND;
    const project = (snap.data() || {}) as Record<string, unknown>;
    if (project.userId !== args.uid) return NOT_FOUND;
    const revision = projectRevision(project);

    let base: RepairBase;
    if (parentDraftId) {
      const parentSnap = await tx.get(draftsOf(db, args.projectId).doc(parentDraftId));
      const parentData = parentSnap.exists ? (parentSnap.data() as Record<string, unknown>) : null;
      if (!parentData || !isIntactRepairDraft(parentData) || parentData.projectId !== args.projectId) {
        return draftNotFound(parentDraftId);
      }
      if (parentData.createdBy !== args.uid) return draftNotFound(parentDraftId);
      if (parentData.adoptedAt) {
        return { status: 409, code: 'already-adopted', error: `Draft ${parentDraftId} has been adopted; repair what the project stores now.` };
      }
      const moved = (['runId', 'codeDigest', 'suiteDigest', 'casesDigest'] as const).some((k) => parentData.parent[k] !== revision[k]);
      if (moved) {
        return {
          status: 409,
          code: 'parent-moved',
          error: `Draft ${parentDraftId} was cut from a version of the project that is no longer the current one. Nothing was drafted; run the tests again on what is stored now.`,
        };
      }
      base = {
        code: parentData.generatedCode,
        suite: parentData.suiteCode,
        parent: parentData.parent,
        parentDraftId,
        depth: typeof parentData.depth === 'number' ? parentData.depth : 1,
      };
    } else {
      base = {
        code: typeof project.generatedCode === 'string' ? project.generatedCode : '',
        suite: storedSuiteSource(project.testSuite),
        parent: revision,
        parentDraftId: null,
        depth: 0,
      };
    }

    const built = buildRepairDraft(body, base, { uid: args.uid, now: args.now, projectId: args.projectId });
    if (!built.ok) return { status: built.status, code: built.code, error: built.error };

    const ref = draftsOf(db, args.projectId).doc();
    const draft: RepairDraft = { ...built.draft, draftId: ref.id };
    // `create`, not `set`: a draft id is never written twice.
    tx.create(ref, draft as unknown as Record<string, unknown>);
    return { status: 200, draft };
  });
}

/**
 * The draft the runner is asked to execute — only the caller's own, only on
 * this project, only intact and only while it has not been adopted.
 */
export async function loadDraftForRun(
  db: Firestore,
  args: { projectId: string; uid: string; draftId: string },
): Promise<LoadOutcome> {
  const snap = await draftsOf(db, args.projectId).doc(args.draftId).get();
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
  if (!data || !isIntactRepairDraft(data) || data.projectId !== args.projectId || data.createdBy !== args.uid) {
    return draftNotFound(args.draftId);
  }
  if (data.adoptedAt) {
    return { status: 409, code: 'already-adopted', error: `Draft ${args.draftId} has already been adopted; run the tests on what the project stores now.` };
  }
  return { status: 200, draft: data };
}

/**
 * Records the run of a draft on the draft — never on the project. Refused once
 * the draft is adopted: the receipt that went onto the project is the last word.
 * The draft's content is not touched; only `execution` is written.
 */
export async function recordDraftExecution(
  db: Firestore,
  args: { projectId: string; draftId: string; execution: RepairDraftExecution },
): Promise<boolean> {
  const ref = draftsOf(db, args.projectId).doc(args.draftId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() || {}).adoptedAt) return false;
    tx.update(ref, { execution: JSON.parse(JSON.stringify(args.execution)) });
    return true;
  });
}

/**
 * The compare-and-swap onto the project. One transaction reads the project and
 * the draft, `decideAdoption` compares, and the project write, the adoption
 * stamp on the draft and the journal row commit together or not at all.
 */
export async function adoptRepairDraft(
  db: Firestore,
  args: { projectId: string; uid: string; body: unknown; now: Date; actorEmail: string },
): Promise<AdoptOutcome> {
  const projectRef = db.collection('projects').doc(args.projectId);
  const body = (args.body && typeof args.body === 'object' ? args.body : {}) as Record<string, unknown>;
  const draftId = typeof body.draftId === 'string' ? body.draftId : '';
  if (!draftId) return { status: 400, code: 'missing-draft', error: 'Name the draft to adopt: draftId.' };
  // Checked before the id forms any document path (SEC-2026-514).
  if (!isFirestoreId(draftId)) return { status: 400, code: 'invalid-draft', error: 'Invalid draft id.' };
  const draftRef = draftsOf(db, args.projectId).doc(draftId);

  return db.runTransaction(async (tx): Promise<AdoptOutcome> => {
    const [projectSnap, draftSnap] = await Promise.all([tx.get(projectRef), tx.get(draftRef)]);
    if (!projectSnap.exists) return NOT_FOUND;
    const project = (projectSnap.data() || {}) as Record<string, unknown>;
    if (project.userId !== args.uid) return NOT_FOUND;
    const data = draftSnap.exists ? ((draftSnap.data() || {}) as Record<string, unknown>) : null;
    if (!data || data.projectId !== args.projectId || data.createdBy !== args.uid) return draftNotFound(draftId);

    const decision = decideAdoption(body, project, { draft: data, execution: data.execution, adoptedAt: data.adoptedAt });
    if (!decision.ok) return { status: decision.status, code: decision.code, error: decision.error };

    tx.set(projectRef, { ...decision.fields, updatedAt: args.now }, { merge: true });
    tx.update(draftRef, { adoptedAt: args.now.toISOString(), adoptedBy: args.uid });
    tx.set(db.collection('audit_events').doc(), {
      actorUid: args.uid,
      actorEmail: args.actorEmail,
      action: `PROJECT_REPAIR_DRAFT_ADOPTED:${args.projectId}:${draftId}`,
      targetUid: args.uid,
      timestamp: args.now,
    });
    return { status: 200, draftId, fields: decision.fields };
  });
}
