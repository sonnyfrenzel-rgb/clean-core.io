import type { Firestore } from 'firebase-admin/firestore';
import { isFirestoreId } from '@/lib/firestore-id';
import {
  PORTFOLIO_MAX_SELECTIONS,
  PORTFOLIO_NAME_MAX_CHARS,
  PORTFOLIO_SELECTION_MAX_PROJECTS,
  PORTFOLIO_VIEW_MAX_PROJECTS,
} from './limits';
import { aggregatePortfolio, type PortfolioView } from './aggregate';
import { programFactsOf, type StoredProject, type StoredRun } from './program-facts';
import { BatchRefusal } from './batch-store';

/**
 * Named selections and the read of the overview — roadmap 3.0.21 (2) and (4).
 *
 *   portfolio_selections/{selectionId}
 *     ownerId, name, projectIds (a list of ids the owner edits, nothing
 *     written onto the projects or their runs), createdAt, readers (uids that
 *     accepted an invitation), readerScopes ({uid: project ids} — what each
 *     reader may see)
 *   portfolio_selections/{selectionId}/invitations/{invitationId}
 *     the e-mail-bound read invitation (`lib/portfolio/selection-invitations.ts`)
 *
 * Server-only, Admin SDK; no rule opens either to a browser (default deny).
 *
 * **What a reader reads.** An accepted reader reads the overview of the
 * selection, computed on every request from the projects the owner listed and
 * still owns — program names, scores, levels, buckets, the SAP objects and the
 * kinds of finding. **Not the source code and not the projects themselves**: a
 * project opens for a reader only if it was shared on its own
 * (`projects/{id}.readers`), and the overview links only those. The roadmap
 * says sharing works "by the same e-mail-bound read invitation as a project";
 * the binding, the confirmation, the expiry, the ceiling and the withdrawal
 * are the same — what it opens is the overview (assumption, see the report).
 *
 * **Sharing never extends silently** (owner decision 23.10.2026). An
 * invitation carries the project ids of the selection at the moment it was
 * sent; accepting copies them into `readerScopes[uid]`, and a reader's
 * overview reads only those still in the selection (`readerProjectIds`). A
 * project the owner adds later is in no reader's scope until the owner
 * releases it (`releaseSelectionProjects`) or sends a new invitation; a
 * project the owner removes leaves every scope at once, so adding it back
 * does not bring it back to a reader either.
 */

type AdminDb = Firestore;

export const SELECTION_COLLECTION = 'portfolio_selections';

export interface Selection {
  id: string;
  ownerId: string;
  name: string;
  projectIds: string[];
  createdAt: number;
  readers: string[];
  /** Per reader uid: the project ids released to that reader. */
  readerScopes: Record<string, string[]>;
}

/** The distinct string ids of a stored list. */
export function idsOfStored(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
}

function scopesOfStored(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [uid, ids] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(ids)) out[uid] = idsOfStored(ids);
  }
  return out;
}

export function selectionOfStored(id: string, data: Record<string, unknown>): Selection {
  return {
    id,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
    name: typeof data.name === 'string' ? data.name : '',
    projectIds: idsOfStored(data.projectIds),
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    readers: idsOfStored(data.readers),
    readerScopes: scopesOfStored(data.readerScopes),
  };
}

/**
 * The project ids a caller's overview of this selection reads: the owner's
 * whole list; for a reader, the ids released to them that are still in the
 * selection; for anybody else, none. A reader accepted before scopes existed
 * has none stored — their scope is the list as it stood, which no route could
 * change then; the first edit of the list writes it down
 * (`updateSelectionProjects`).
 */
export function readerProjectIds(selection: Pick<Selection, 'ownerId' | 'projectIds' | 'readers' | 'readerScopes'>, uid: string): string[] {
  if (selection.ownerId === uid) return selection.projectIds;
  if (!selection.readers.includes(uid)) return [];
  const scope = selection.readerScopes[uid];
  if (!scope) return selection.projectIds;
  const released = new Set(scope);
  return selection.projectIds.filter((id) => released.has(id));
}

/** Owner, or a reader who accepted an invitation. */
export function mayReadSelection(selection: Pick<Selection, 'ownerId' | 'readers'>, uid: string): 'owner' | 'reader' | null {
  if (selection.ownerId === uid) return 'owner';
  return selection.readers.includes(uid) ? 'reader' : null;
}

/** A create body, checked: a name and a list of valid, distinct ids. */
export function checkSelectionBody(raw: unknown): { name: string; projectIds: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, PORTFOLIO_NAME_MAX_CHARS) : '';
  if (!name) throw new BatchRefusal('Give the selection a name.', 400, 'selection-name');
  const list = Array.isArray(r.projectIds) ? r.projectIds : [];
  const projectIds = [...new Set(list.filter((x): x is string => typeof x === 'string' && isFirestoreId(x)))];
  if (projectIds.length === 0) throw new BatchRefusal('Choose at least one project.', 400, 'selection-empty');
  if (projectIds.length > PORTFOLIO_SELECTION_MAX_PROJECTS) {
    throw new BatchRefusal(`A selection holds at most ${PORTFOLIO_SELECTION_MAX_PROJECTS} projects.`, 400, 'selection-too-large');
  }
  return { name, projectIds };
}

export async function selectionsOf(db: AdminDb, uid: string): Promise<Selection[]> {
  const snap = await db.collection(SELECTION_COLLECTION).where('ownerId', '==', uid).get();
  return snap.docs
    .map((d: { id: string; data: () => Record<string, unknown> }) => selectionOfStored(d.id, d.data()))
    .sort((a: Selection, b: Selection) => b.createdAt - a.createdAt);
}

export async function readSelection(db: AdminDb, selectionId: string): Promise<Selection | null> {
  if (!isFirestoreId(selectionId)) return null;
  const snap = await db.collection(SELECTION_COLLECTION).doc(selectionId).get();
  return snap.exists ? selectionOfStored(selectionId, snap.data() || {}) : null;
}

/** Create a selection of the owner's own projects only; an id that is not theirs is left out. */
export async function createSelection(db: AdminDb, uid: string, body: { name: string; projectIds: string[] }): Promise<Selection> {
  const existing = await selectionsOf(db, uid);
  if (existing.length >= PORTFOLIO_MAX_SELECTIONS) {
    throw new BatchRefusal(`An account keeps at most ${PORTFOLIO_MAX_SELECTIONS} selections. Delete one first.`, 409, 'selection-limit');
  }
  const refs = body.projectIds.map((id) => db.collection('projects').doc(id));
  const snaps = refs.length ? await db.getAll(...refs, { fieldMask: ['userId'] }) : [];
  const own = snaps
    .filter((s: { exists: boolean; data: () => Record<string, unknown> | undefined }) => s.exists && (s.data() || {}).userId === uid)
    .map((s: { id: string }) => s.id);
  if (own.length === 0) throw new BatchRefusal('None of these projects is yours.', 400, 'selection-empty');
  const ref = db.collection(SELECTION_COLLECTION).doc();
  const selection = {
    ownerId: uid,
    name: body.name,
    projectIds: own,
    createdAt: Date.now(),
    readers: [] as string[],
    readerScopes: {} as Record<string, string[]>,
  };
  await ref.create(selection);
  return { id: ref.id, ...selection };
}

export async function deleteSelection(db: AdminDb, uid: string, selectionId: string): Promise<void> {
  const selection = await readSelection(db, selectionId);
  if (!selection || selection.ownerId !== uid) throw new BatchRefusal('No such selection.', 404, 'selection-not-found');
  // The invitations go with it: recursiveDelete descends into the subcollection.
  await db.recursiveDelete(db.collection(SELECTION_COLLECTION).doc(selectionId));
}

/* ------------------------------------------------------------- the overview */

const PROJECT_FIELDS = ['name', 'userId', 'activeRunId', 'legacyCode', 's4Deployment', 'assessmentTarget', 'usageReport', 'readers'];
const RUN_FIELDS = ['cleanCoreScore', 'evidenceReport', 'status'];
const CHUNK = 25;

export interface OverviewAnswer {
  view: PortfolioView;
  /** Project ids the caller may open — the owner all, a reader only those shared with them. */
  openable: string[];
  /** The view read the first `PORTFOLIO_VIEW_MAX_PROJECTS` projects only. */
  truncated: boolean;
}

/**
 * The overview over `projects` (already limited to the owner's), read in
 * chunks so no more than `CHUNK` sources are held at once.
 */
async function overviewOf(
  db: AdminDb,
  projectRefs: { id: string }[],
  ownerId: string,
  viewerUid: string,
  missingAlready: number,
): Promise<{ view: PortfolioView; openable: string[] }> {
  const facts = [];
  const openable: string[] = [];
  let missing = missingAlready;
  for (let i = 0; i < projectRefs.length; i += CHUNK) {
    const chunk = projectRefs.slice(i, i + CHUNK).map((p) => db.collection('projects').doc(p.id));
    const snaps = await db.getAll(...chunk, { fieldMask: PROJECT_FIELDS });
    const projects: StoredProject[] = [];
    for (const s of snaps) {
      const data = s.exists ? (s.data() as Record<string, unknown>) : null;
      if (!data || data.userId !== ownerId) {
        missing += 1;
        continue;
      }
      projects.push({ id: s.id, data });
      const readers = Array.isArray(data.readers) ? data.readers : [];
      if (viewerUid === ownerId || readers.includes(viewerUid)) openable.push(s.id);
    }
    const runRefs = projects
      .filter((p) => typeof p.data.activeRunId === 'string' && isFirestoreId(p.data.activeRunId as string))
      .map((p) => db.collection('projects').doc(p.id).collection('runs').doc(p.data.activeRunId as string));
    const runSnaps = runRefs.length ? await db.getAll(...runRefs, { fieldMask: RUN_FIELDS }) : [];
    const runOf = new Map<string, StoredRun>();
    for (const r of runSnaps) {
      const projectId = r.ref.parent.parent?.id;
      if (r.exists && projectId) runOf.set(projectId, r.data() as StoredRun);
    }
    for (const p of projects) facts.push(programFactsOf(p, runOf.get(p.id) ?? null));
  }
  return { view: aggregatePortfolio(facts, missing), openable };
}

/** The overview of all the owner's projects (at most `PORTFOLIO_VIEW_MAX_PROJECTS`). */
export async function overviewOfAll(db: AdminDb, uid: string): Promise<OverviewAnswer> {
  const snap = await db.collection('projects').where('userId', '==', uid).select('name').limit(PORTFOLIO_VIEW_MAX_PROJECTS + 1).get();
  const refs = snap.docs.map((d: { id: string }) => ({ id: d.id }));
  const truncated = refs.length > PORTFOLIO_VIEW_MAX_PROJECTS;
  const { view, openable } = await overviewOf(db, refs.slice(0, PORTFOLIO_VIEW_MAX_PROJECTS), uid, uid, 0);
  return { view, openable, truncated };
}

/**
 * The overview of one selection, for its owner or an accepted reader — a
 * reader's from the projects released to them only (`readerProjectIds`).
 */
export async function overviewOfSelection(db: AdminDb, selection: Selection, viewerUid: string): Promise<OverviewAnswer> {
  const ids = readerProjectIds(selection, viewerUid).filter((id) => isFirestoreId(id));
  const { view, openable } = await overviewOf(
    db,
    ids.slice(0, PORTFOLIO_VIEW_MAX_PROJECTS).map((id) => ({ id })),
    selection.ownerId,
    viewerUid,
    0,
  );
  return { view, openable, truncated: ids.length > PORTFOLIO_VIEW_MAX_PROJECTS };
}
