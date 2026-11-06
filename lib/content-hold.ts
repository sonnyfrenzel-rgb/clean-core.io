/**
 * Content blocked after a report of illegal content — legal texts Fassung 1.1
 * (3.0.21): Terms section 7, /report, privacy policy sections 2, 6 and 8.
 *
 * What the texts promise, and how this module keeps it:
 *
 * - **Blocked, unchanged, accessible to no one — the affected account
 *   included.** Blocking *moves* the project: every document of it (the project
 *   and every subcollection below it — runs, invitations, …) is written
 *   byte-for-byte, under its own path as the id, into
 *   `content_holds/{holdId}/held_documents`, and only once all of them are
 *   written and counted is the original removed. `content_holds` has no match
 *   block in `firestore.rules`, so no browser can read it (default deny, no
 *   rules change), and no route of the application reads `held_documents`
 *   except to put them back (release) or delete them. The owner's dashboard,
 *   the workspace, an invited reader, a portfolio overview and the project's
 *   delete route therefore find no project any more: it cannot be opened,
 *   exported or deleted by its account while it is held. The subcollection is
 *   deliberately not called `runs` or `invitations`: the account erasure
 *   sweeps those by collection group (`deleteUserDataAndAccount`), and held
 *   content must outlive an erasure until its period ends.
 * - **The account is told it is blocked.** The profile carries
 *   `contentBlocks.{holdId}` — kind, project id, dates, state, no name and no
 *   content (a project name can itself be the reported content) — and the
 *   dashboard shows it (`components/ContentBlockNotice.tsx`).
 * - **No viewing, no copy, no export — for suspected depictions of child
 *   sexual abuse above all.** Nothing here returns a held document to a
 *   caller: `listContentHolds` returns the hold records (dates, ids, state,
 *   count), never `held_documents`. The move is a server-side write inside the
 *   same database, never shown, logged or sent anywhere, and the original is
 *   removed, so there is one stored instance at any time after the move.
 * - **The evidence log, each entry with its date.** The hold record keeps
 *   `events` (blocked, police informed, authority decision, retention
 *   extended, released, deleted), each with the time and the acting
 *   administrator, plus the same dates as fields. The admin route writes an
 *   `audit_events` row for every action (`app/api/admin/content-holds`).
 * - **Retention.** With a suspected criminal offence: until the authority has
 *   decided whether to secure the content or said it does not need it, at most
 *   `HOLD_RETENTION_DAYS` after it was informed, unless it asked for longer
 *   (`extendedUntil`); then the operator deletes it — never releases it.
 *   Without suspicion: blocked until the decision, then released or deleted.
 *   Deletion is the operator's act in the admin console, which lists every
 *   hold that is due. The hold record itself (no content) is kept until
 *   `HOLD_RECORD_KEEP_MONTHS` after the release or deletion (`expiresAt`, a
 *   Firestore TTL the owner creates — docs/DATA-RETENTION.md).
 *
 * - **The TTL fallback** (legal review 06.11.2026, B7). Deletion stays the
 *   operator's act; should it not happen, Firestore deletes the held documents
 *   by itself about `HOLD_TTL_FALLBACK_DAYS` after the latest day they may be
 *   kept (`holdTtlFallbackAt`: 90 days after the police notice, or the later
 *   day the authority asked for, plus 7). Each held document carries that time
 *   as `expiresAt` beside the document it holds — the content itself sits
 *   unchanged under `heldDocument` (`HELD_FORMAT`), so a field of the content
 *   that happens to be called `expiresAt` (an invitation's) is neither
 *   overwritten nor taken for the deletion time. It is set when the police
 *   notice is recorded and moved when the authority asks for longer, each
 *   time with an entry `ttl-fallback-set` in the evidence log. It works once
 *   the owner has created the TTL policy (`--collection-group=held_documents`,
 *   field `expiresAt`); until then nothing is deleted by it. The console
 *   shows a hold whose documents are gone after that time as "deleted by TTL
 *   fallback" (`ttlState`).
 *
 * Admin SDK only; every function takes the database handle, so the specs run
 * it against a stand-in.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CONTENT_HOLD_COLLECTION = 'content_holds';
export const HELD_DOCUMENTS = 'held_documents';
/** At most this many days after the authority was informed, unless it asks for longer. */
export const HOLD_RETENTION_DAYS = 90;
/** The hold record (no content) is kept this many months after release or deletion. */
export const HOLD_RECORD_KEEP_MONTHS = 6;
/** The TTL fallback deletes the held documents this many days after the latest day they may be kept. */
export const HOLD_TTL_FALLBACK_DAYS = 7;
/** The layout of a held document since B7: `{ heldFormat, heldDocument, expiresAt }`. */
export const HELD_FORMAT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 400;

export type HoldStatus = 'blocked' | 'released' | 'deleted';
export type AuthorityOutcome = 'secured' | 'not-needed';
export type HoldEventKind = 'blocked' | 'police-informed' | 'authority-decision' | 'retention-extended' | 'ttl-fallback-set' | 'released' | 'deleted';
/** The TTL fallback of a hold, as the console shows it. */
export type HoldTtlState = 'none' | 'set' | 'deleted-by-ttl';

export interface HoldEvent {
  kind: HoldEventKind;
  /** ISO time the event happened (for the police notice: the day the admin enters). */
  at: string;
  /** ISO time it was recorded. */
  recordedAt: string;
  by: string;
  detail?: string;
}

export interface ContentHold {
  id: string;
  kind: 'project';
  projectId: string;
  ownerUid: string;
  status: HoldStatus;
  criminalSuspicion: boolean;
  csamSuspicion: boolean;
  blockedAt: string;
  documentCount: number;
  policeInformedAt: string | null;
  authorityDecision: { outcome: AuthorityOutcome; at: string } | null;
  extendedUntil: string | null;
  releasedAt: string | null;
  deletedAt: string | null;
  /** B7 — when Firestore deletes the held documents by itself, if the operator has not; null while none is set. */
  ttlFallbackAt: string | null;
  /** B7 — none set, set, or the documents are gone after that time (`listContentHolds` looks). */
  ttlState: HoldTtlState;
  events: HoldEvent[];
}

export class ContentHoldRefusal extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ContentHoldRefusal';
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------- pure rules */

/** A document path as a document id: Firestore ids cannot hold `/`. */
export function heldDocumentId(relativePath: string): string {
  return encodeURIComponent(relativePath);
}

export function heldDocumentPath(id: string): string {
  return decodeURIComponent(id);
}

/** An ISO time or `YYYY-MM-DD`, as an ISO time; null for anything else. */
export function isoOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T00:00:00.000Z` : value.trim();
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * The day the content must be deleted by, with a suspected offence: 90 days
 * after the authority was informed, or the later day it asked for. Null before
 * the authority is informed, and without suspicion (then the decision ends it).
 */
export function holdRetainUntil(h: Pick<ContentHold, 'criminalSuspicion' | 'policeInformedAt' | 'extendedUntil'>): string | null {
  if (!h.criminalSuspicion || !h.policeInformedAt) return null;
  const base = Date.parse(h.policeInformedAt) + HOLD_RETENTION_DAYS * DAY_MS;
  const ext = h.extendedUntil ? Date.parse(h.extendedUntil) : NaN;
  return new Date(Number.isFinite(ext) && ext > base ? ext : base).toISOString();
}

/** B7 — when the TTL fallback deletes the held documents: `HOLD_TTL_FALLBACK_DAYS` after `holdRetainUntil`; null without one. */
export function holdTtlFallbackAt(h: Pick<ContentHold, 'criminalSuspicion' | 'policeInformedAt' | 'extendedUntil'>): string | null {
  const until = holdRetainUntil(h);
  return until ? new Date(Date.parse(until) + HOLD_TTL_FALLBACK_DAYS * DAY_MS).toISOString() : null;
}

/** A held document as stored: the document it holds, in either layout. */
export function heldContentOf(stored: Record<string, any>): Record<string, any> {
  return stored && stored.heldFormat === HELD_FORMAT && stored.heldDocument && typeof stored.heldDocument === 'object' ? stored.heldDocument : stored;
}

/** Whether the operator may delete the held content now — and why not, when not. */
export function holdDeletionRefusal(h: ContentHold, nowMs: number): string | null {
  if (h.status !== 'blocked') return 'This content is no longer held.';
  if (!h.criminalSuspicion) return null; // without suspicion: the decision is the operator's
  if (!h.policeInformedAt) return 'Record that the law-enforcement authority was informed first; the content stays until it has been able to secure it.';
  if (h.authorityDecision) return null;
  const until = holdRetainUntil(h);
  if (until && nowMs >= Date.parse(until)) return null;
  return `The authority has not decided yet; the content is kept until ${until?.slice(0, 10)} unless the authority decides earlier.`;
}

/** Content with a suspected offence is never released, only deleted. */
export function holdReleaseRefusal(h: ContentHold): string | null {
  if (h.status !== 'blocked') return 'This content is no longer held.';
  if (h.criminalSuspicion) return 'Content held on a suspected criminal offence is not released; it is deleted once the authority has decided or its period ends.';
  return null;
}

/** Due for the operator: a held item whose deletion is now allowed and expected. */
export function holdDue(h: ContentHold, nowMs: number): boolean {
  return h.status === 'blocked' && h.criminalSuspicion && holdDeletionRefusal(h, nowMs) === null;
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function holdOfStored(id: string, d: Record<string, any>): ContentHold {
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id,
    kind: 'project',
    projectId: s(d.projectId) ?? '',
    ownerUid: s(d.ownerUid) ?? '',
    status: d.status === 'released' || d.status === 'deleted' ? d.status : 'blocked',
    criminalSuspicion: d.criminalSuspicion === true,
    csamSuspicion: d.csamSuspicion === true,
    blockedAt: s(d.blockedAt) ?? '',
    documentCount: typeof d.documentCount === 'number' ? d.documentCount : 0,
    policeInformedAt: s(d.policeInformedAt),
    authorityDecision:
      d.authorityDecision && (d.authorityDecision.outcome === 'secured' || d.authorityDecision.outcome === 'not-needed') && s(d.authorityDecision.at)
        ? { outcome: d.authorityDecision.outcome, at: d.authorityDecision.at }
        : null,
    extendedUntil: s(d.extendedUntil),
    releasedAt: s(d.releasedAt),
    deletedAt: s(d.deletedAt),
    ttlFallbackAt: s(d.ttlFallbackAt),
    ttlState: s(d.ttlFallbackAt) ? 'set' : 'none',
    events: Array.isArray(d.events) ? (d.events as HoldEvent[]) : [],
  };
}

/* --------------------------------------------------------- database steps */

type Db = any;
type FieldValueT = any;

/** Every document of the project, the project first: [path relative to the database root, ref]. */
async function documentsUnder(ref: any): Promise<Array<{ path: string; ref: any }>> {
  const out: Array<{ path: string; ref: any }> = [];
  const visit = async (docRef: any) => {
    out.push({ path: docRef.path, ref: docRef });
    const cols = await docRef.listCollections();
    for (const col of cols) {
      // `listDocuments` also yields documents that exist only as parents of a subcollection.
      const docs = await col.listDocuments();
      for (const d of docs) await visit(d);
    }
  };
  await visit(ref);
  return out;
}

export interface BlockInput {
  projectId: string;
  criminalSuspicion: boolean;
  csamSuspicion: boolean;
}

/**
 * Blocks a project: moves every document of it into the hold, unchanged, then
 * removes the original. Nothing read here leaves this function.
 */
export async function blockProjectContent(db: Db, FieldValue: FieldValueT, adminUid: string, input: BlockInput, now = new Date()): Promise<ContentHold> {
  const projectRef = db.collection('projects').doc(input.projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new ContentHoldRefusal('No such project. It may already be held, or deleted.', 404, 'content-hold-no-project');
  const ownerUid = (projectSnap.data() || {}).userId;
  if (typeof ownerUid !== 'string' || !ownerUid) throw new ContentHoldRefusal('The project names no owner.', 409, 'content-hold-no-owner');

  const holdRef = db.collection(CONTENT_HOLD_COLLECTION).doc();
  const at = now.toISOString();
  const csam = input.csamSuspicion === true;
  const criminal = input.criminalSuspicion === true || csam;
  const record = {
    kind: 'project',
    projectId: input.projectId,
    ownerUid,
    status: 'moving',
    criminalSuspicion: criminal,
    csamSuspicion: csam,
    blockedAt: at,
    blockedBy: adminUid,
    documentCount: 0,
    policeInformedAt: null,
    authorityDecision: null,
    extendedUntil: null,
    releasedAt: null,
    deletedAt: null,
    ttlFallbackAt: null,
    expiresAt: null,
    events: [{ kind: 'blocked', at, recordedAt: at, by: adminUid, detail: csam ? 'csam-suspicion' : criminal ? 'criminal-suspicion' : 'no-suspicion' }],
  };
  // The record first, so a move that stops half-way is visible to the operator.
  await holdRef.set(record);

  const docs = await documentsUnder(projectRef);
  const held = holdRef.collection(HELD_DOCUMENTS);
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    const snaps = await db.getAll(...chunk.map((c) => c.ref));
    const batch = db.batch();
    for (const snap of snaps) {
      if (!snap.exists) continue;
      // The content unchanged under `heldDocument`; `expiresAt` beside it is the TTL fallback's, null until set (B7).
      batch.set(held.doc(heldDocumentId(snap.ref.path)), { heldFormat: HELD_FORMAT, heldDocument: snap.data(), expiresAt: null });
      written += 1;
    }
    await batch.commit();
  }
  // Counted by id only (`select()` reads no field), so nothing of the content is read back.
  const count = (await held.select().get()).size;
  if (count !== written) {
    throw new ContentHoldRefusal(`The move wrote ${count} of ${written} documents; the original is kept. Repeat the block.`, 500, 'content-hold-incomplete');
  }
  await db.recursiveDelete(projectRef);
  await holdRef.update({ status: 'blocked', documentCount: written });

  const profileRef = db.collection('users').doc(ownerUid);
  if ((await profileRef.get()).exists) {
    await profileRef.update({ [`contentBlocks.${holdRef.id}`]: { kind: 'project', projectId: input.projectId, blockedAt: at, status: 'blocked' } });
  }
  return holdOfStored(holdRef.id, { ...record, status: 'blocked', documentCount: written });
}

async function readHold(db: Db, holdId: string): Promise<{ ref: any; hold: ContentHold }> {
  const ref = db.collection(CONTENT_HOLD_COLLECTION).doc(holdId);
  const snap = await ref.get();
  if (!snap.exists) throw new ContentHoldRefusal('No such hold.', 404, 'content-hold-not-found');
  return { ref, hold: holdOfStored(holdId, snap.data() || {}) };
}

function event(kind: HoldEventKind, at: string, by: string, detail?: string): HoldEvent {
  return { kind, at, recordedAt: new Date().toISOString(), by, ...(detail ? { detail } : {}) };
}

/**
 * B7 — writes the TTL fallback's time onto every held document (by id, no
 * content read) and onto the record, with an entry in the evidence log.
 */
async function setTtlFallback(db: Db, FieldValue: FieldValueT, ref: any, adminUid: string, fallbackAt: string): Promise<void> {
  const held = ref.collection(HELD_DOCUMENTS);
  const refs = (await held.select().get()).docs.map((d: any) => d.ref);
  const when = new Date(fallbackAt);
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = db.batch();
    for (const r of refs.slice(i, i + BATCH)) batch.update(r, { expiresAt: when });
    await batch.commit();
  }
  await ref.update({ ttlFallbackAt: fallbackAt, events: FieldValue.arrayUnion(event('ttl-fallback-set', new Date().toISOString(), adminUid, fallbackAt.slice(0, 10))) });
}

/** The day the law-enforcement authority was informed — starts the 90 days, and sets the TTL fallback (B7). */
export async function recordPoliceInformed(db: Db, FieldValue: FieldValueT, adminUid: string, holdId: string, when: unknown): Promise<ContentHold> {
  const { ref, hold } = await readHold(db, holdId);
  if (hold.status !== 'blocked') throw new ContentHoldRefusal('This content is no longer held.', 409, 'content-hold-closed');
  if (!hold.criminalSuspicion) throw new ContentHoldRefusal('This hold records no suspected offence.', 409, 'content-hold-no-suspicion');
  const at = isoOf(when) ?? new Date().toISOString();
  await ref.update({ policeInformedAt: at, events: FieldValue.arrayUnion(event('police-informed', at, adminUid)) });
  const next = { ...hold, policeInformedAt: at };
  const fallbackAt = holdTtlFallbackAt(next);
  if (fallbackAt) await setTtlFallback(db, FieldValue, ref, adminUid, fallbackAt);
  return { ...next, ttlFallbackAt: fallbackAt, ttlState: fallbackAt ? 'set' : 'none' };
}

/** The authority decided whether to secure the content, or said it does not need it. */
export async function recordAuthorityDecision(db: Db, FieldValue: FieldValueT, adminUid: string, holdId: string, outcome: unknown, when: unknown): Promise<ContentHold> {
  if (outcome !== 'secured' && outcome !== 'not-needed') throw new ContentHoldRefusal('Outcome is "secured" or "not-needed".', 400, 'content-hold-outcome');
  const { ref, hold } = await readHold(db, holdId);
  if (hold.status !== 'blocked') throw new ContentHoldRefusal('This content is no longer held.', 409, 'content-hold-closed');
  if (!hold.policeInformedAt) throw new ContentHoldRefusal('Record that the authority was informed first.', 409, 'content-hold-police-first');
  const at = isoOf(when) ?? new Date().toISOString();
  await ref.update({ authorityDecision: { outcome, at }, events: FieldValue.arrayUnion(event('authority-decision', at, adminUid, outcome)) });
  return { ...hold, authorityDecision: { outcome, at } };
}

/** The authority asked for longer retention — until this day. */
export async function extendHoldRetention(db: Db, FieldValue: FieldValueT, adminUid: string, holdId: string, until: unknown): Promise<ContentHold> {
  const { ref, hold } = await readHold(db, holdId);
  const iso = isoOf(until);
  if (!iso) throw new ContentHoldRefusal('Give the day the authority asked for.', 400, 'content-hold-date');
  if (hold.status !== 'blocked' || !hold.policeInformedAt) throw new ContentHoldRefusal('Only held content the authority was informed about can be kept longer.', 409, 'content-hold-closed');
  await ref.update({ extendedUntil: iso, events: FieldValue.arrayUnion(event('retention-extended', new Date().toISOString(), adminUid, iso.slice(0, 10))) });
  // The TTL fallback moves with the longer period (B7).
  const next = { ...hold, extendedUntil: iso };
  const fallbackAt = holdTtlFallbackAt(next);
  if (fallbackAt && fallbackAt !== hold.ttlFallbackAt) await setTtlFallback(db, FieldValue, ref, adminUid, fallbackAt);
  return { ...next, ttlFallbackAt: fallbackAt, ttlState: fallbackAt ? 'set' : 'none' };
}

/** Deletes the held content; the record stays, without content, for its own period. */
export async function deleteHeldContent(db: Db, FieldValue: FieldValueT, adminUid: string, holdId: string, now = new Date()): Promise<ContentHold> {
  const { ref, hold } = await readHold(db, holdId);
  const refusal = holdDeletionRefusal(hold, now.getTime());
  if (refusal) throw new ContentHoldRefusal(refusal, 409, 'content-hold-not-yet');
  await db.recursiveDelete(ref.collection(HELD_DOCUMENTS));
  const at = now.toISOString();
  await ref.update({
    status: 'deleted',
    deletedAt: at,
    expiresAt: addMonths(at, HOLD_RECORD_KEEP_MONTHS),
    events: FieldValue.arrayUnion(event('deleted', at, adminUid)),
  });
  const profileRef = db.collection('users').doc(hold.ownerUid);
  if ((await profileRef.get()).exists) {
    await profileRef.update({ [`contentBlocks.${holdId}.status`]: 'deleted', [`contentBlocks.${holdId}.deletedAt`]: at });
  }
  return { ...hold, status: 'deleted', deletedAt: at };
}

/** Puts released content back where it was, unchanged — only without a suspected offence. */
export async function releaseHeldContent(db: Db, FieldValue: FieldValueT, adminUid: string, holdId: string, now = new Date()): Promise<ContentHold> {
  const { ref, hold } = await readHold(db, holdId);
  const refusal = holdReleaseRefusal(hold);
  if (refusal) throw new ContentHoldRefusal(refusal, 409, 'content-hold-no-release');
  if ((await db.collection('projects').doc(hold.projectId).get()).exists) {
    throw new ContentHoldRefusal('A project with this id exists again; nothing was put back.', 409, 'content-hold-occupied');
  }
  const held = ref.collection(HELD_DOCUMENTS);
  const docs = (await held.get()).docs;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + BATCH)) batch.set(db.doc(heldDocumentPath(d.id)), heldContentOf(d.data()));
    await batch.commit();
  }
  await db.recursiveDelete(held);
  const at = now.toISOString();
  await ref.update({
    status: 'released',
    releasedAt: at,
    expiresAt: addMonths(at, HOLD_RECORD_KEEP_MONTHS),
    events: FieldValue.arrayUnion(event('released', at, adminUid)),
  });
  const profileRef = db.collection('users').doc(hold.ownerUid);
  if ((await profileRef.get()).exists) await profileRef.update({ [`contentBlocks.${holdId}`]: FieldValue.delete() });
  return { ...hold, status: 'released', releasedAt: at };
}

/**
 * The hold records for the admin console — never the held documents. A held
 * item past its TTL fallback is looked at by id only (`select()`, `limit(1)`):
 * none left means the fallback deleted them (B7, `deleted-by-ttl`).
 */
export async function listContentHolds(db: Db, nowMs: number = Date.now()): Promise<ContentHold[]> {
  const snap = await db.collection(CONTENT_HOLD_COLLECTION).orderBy('blockedAt', 'desc').limit(200).get();
  const holds: ContentHold[] = snap.docs.map((d: any) => holdOfStored(d.id, d.data() || {}));
  for (const h of holds) {
    if (h.status !== 'blocked' || !h.ttlFallbackAt || nowMs < Date.parse(h.ttlFallbackAt)) continue;
    const left = await db.collection(CONTENT_HOLD_COLLECTION).doc(h.id).collection(HELD_DOCUMENTS).select().limit(1).get();
    if (left.empty) h.ttlState = 'deleted-by-ttl';
  }
  return holds;
}

/* ------------------------------------------- never back from a copy (B3) */

/**
 * B3 of the legal review of 06.11.2026: held content must not come back from a
 * copy — a backup restored into another database, the old database of the
 * August move — through any path of this repository. The product has no
 * restore of a project or a revision from a backup; the one path that copies
 * documents between databases is `scripts/firestore-delta-sync.ts`, and it
 * asks these two questions before every document.
 *
 * The project ids a hold names that are not released: blocked, being moved, or
 * deleted. Their project must never be written from a copy.
 */
export function unreleasedHeldProjectIds(holds: Array<{ projectId?: unknown; status?: unknown }>): Set<string> {
  const ids = new Set<string>();
  for (const h of holds) {
    if (typeof h.projectId === 'string' && h.projectId && h.status !== 'released') ids.add(h.projectId);
  }
  return ids;
}

/** Whether a document path (relative to the database root) must not be written from a copy. */
export function pathBlockedFromCopy(path: string, heldProjectIds: ReadonlySet<string>): boolean {
  const [collection, id] = path.split('/');
  // The holds themselves never come from a copy: a copy can hold content the operator has since deleted.
  if (collection === CONTENT_HOLD_COLLECTION) return true;
  return collection === 'projects' && typeof id === 'string' && heldProjectIds.has(id);
}

/* ------------------------------------------------- what the account sees */

export interface ContentBlockNoticeEntry {
  holdId: string;
  projectId: string;
  blockedAt: string;
  status: 'blocked' | 'deleted';
  deletedAt: string | null;
}

/** The profile's `contentBlocks`, read defensively for the dashboard notice. */
export function contentBlocksOfProfile(profile: unknown): ContentBlockNoticeEntry[] {
  const raw = profile && typeof profile === 'object' ? (profile as Record<string, unknown>).contentBlocks : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: ContentBlockNoticeEntry[] = [];
  for (const [holdId, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== 'object' || typeof v.projectId !== 'string' || typeof v.blockedAt !== 'string') continue;
    out.push({
      holdId,
      projectId: v.projectId,
      blockedAt: v.blockedAt,
      status: v.status === 'deleted' ? 'deleted' : 'blocked',
      deletedAt: typeof v.deletedAt === 'string' ? v.deletedAt : null,
    });
  }
  return out.sort((a, b) => b.blockedAt.localeCompare(a.blockedAt));
}

/** The sentence the dashboard shows for one entry. */
export function contentBlockSentence(e: ContentBlockNoticeEntry): string {
  const day = e.blockedAt.slice(0, 10);
  if (e.status === 'deleted') {
    return `Project ${e.projectId} was blocked on ${day} after a report of illegal content and deleted on ${(e.deletedAt ?? '').slice(0, 10)}.`;
  }
  return `Project ${e.projectId} is blocked since ${day} after a report of illegal content (Terms of Service, section 7). While it is blocked it is stored unchanged and nobody can open it, this account included; it cannot be exported, and it cannot be deleted from here while it is retained. We tell you the decision and its reasons, unless law-enforcement authorities ask us to hold back.`;
}
