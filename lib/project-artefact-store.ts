import { randomUUID } from 'crypto';
import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import {
  ARTEFACT_COLLECTION,
  ARTEFACT_INDEX_FIELD,
  ARTEFACT_PART_VALUE_BYTES,
  STORED_ARTEFACT_FIELDS,
  artefactIndexOf,
  isStoredArtefactField,
  artefactPartData,
  artefactPartId,
  isExternalValue,
  joinArtefact,
  splitArtefact,
  type ArtefactIndexEntry,
  type StoredArtefactField,
} from './project-artefacts';
import { checkProjectWrite, estimateDocumentSize, type ProjectSizeCheck } from './firestore-doc-size';
import { mayReadProject } from './project-readers';

/**
 * The server half of roadmap 3.0.14, item 9: reading and writing the large
 * artefacts of a project in documents of their own (`lib/project-artefacts.ts`
 * says why and in which shape).
 *
 * Admin SDK only, and always beside the project document it belongs to:
 *
 *   - **Read.** `withStoredArtefacts(reader, projectRef, data)` returns the
 *     project data with every artefact the index names filled in from its
 *     parts — the same object the code read before the move. `reader` is the
 *     database or the transaction the caller already holds, so a read inside a
 *     compare-and-swap reads the parts inside it too.
 *   - **Write.** `planArtefactWrite(...)` turns the fields a writer would have
 *     put on the project into what the project gets now (the inline field
 *     removed, the index entry set) and the parts to write beside it; the
 *     caller writes both in the transaction it already runs, so every
 *     precondition it checks — the generation token, the update time, the
 *     active run — holds for the parts as much as for the project. The project
 *     document is written on every artefact write (its index changes), so its
 *     update time still moves, and every compare-and-swap on it still sees the
 *     write.
 *
 * Inline wins. A field present on the project document is the newer value: a
 * write to the parts removes the inline copy in the same transaction, so an
 * inline value next to an index entry was written afterwards — by a browser
 * tab that still runs the bundle from before the move. It is read as it
 * stands, and the next server write of that field replaces both.
 */

/** Anything that can read several documents at once: the database or a transaction. */
export interface ArtefactReader {
  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
}

/** The stored artefacts could not be read whole. Never answered as "nothing stored". */
export class ArtefactReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtefactReadError';
  }
}

const partsCollection = (projectRef: DocumentReference) => projectRef.collection(ARTEFACT_COLLECTION);

/** The fields the index names and the project document does not hold inline. */
function fieldsToRead(data: Record<string, unknown>): Array<[StoredArtefactField, ArtefactIndexEntry]> {
  const index = artefactIndexOf(data);
  return STORED_ARTEFACT_FIELDS.filter((f) => index[f] && data[f] === undefined).map((f) => [f, index[f]!]);
}

/**
 * The artefacts stored outside the project document, joined. Fields held
 * inline are not read. Throws `ArtefactReadError` when a part is missing or
 * belongs to another write — a reader is told the read failed rather than shown
 * a shorter artefact or none.
 */
export async function readStoredArtefacts(
  reader: ArtefactReader,
  projectRef: DocumentReference,
  data: Record<string, unknown>,
): Promise<Partial<Record<StoredArtefactField, unknown>>> {
  const wanted = fieldsToRead(data);
  if (wanted.length === 0) return {};
  const refs: DocumentReference[] = [];
  for (const [field, entry] of wanted) {
    for (let n = 0; n < entry.parts; n++) refs.push(partsCollection(projectRef).doc(artefactPartId(field, n)));
  }
  const snaps = await reader.getAll(...refs);
  const byId = new Map<string, unknown>();
  for (const snap of snaps) if (snap.exists) byId.set(snap.id, snap.data());
  const out: Partial<Record<StoredArtefactField, unknown>> = {};
  for (const [field, entry] of wanted) {
    const parts = Array.from({ length: entry.parts }, (_, n) => byId.get(artefactPartId(field, n)));
    const joined = joinArtefact(field, entry, parts);
    if (!joined.ok) throw new ArtefactReadError(`projects/${projectRef.id}: ${joined.reason}`);
    out[field] = joined.value;
  }
  return out;
}

/**
 * The project data with its stored artefacts filled in. A project without an
 * index — every project stored before 3.0.14 — is returned as it is, the same
 * object, without a read.
 */
export async function withStoredArtefacts<T extends Record<string, unknown>>(
  reader: ArtefactReader,
  projectRef: DocumentReference,
  data: T,
): Promise<T> {
  if (fieldsToRead(data).length === 0) return data;
  const values = await readStoredArtefacts(reader, projectRef, data);
  return { ...data, ...values };
}

/**
 * Every artefact stored outside the project document, for a reader, inside the
 * caller's read-only transaction. Read access is asked of the project document
 * this transaction reads; `null` — answered as "no such project" — when the
 * document is gone or `uid` may no longer read it (SEC-2026-844).
 */
export async function readArtefactsForReader(
  tx: ArtefactReader & { get(ref: DocumentReference): Promise<DocumentSnapshot> },
  projectRef: DocumentReference,
  uid: string,
): Promise<Partial<Record<StoredArtefactField, unknown>> | null> {
  const snap = await tx.get(projectRef);
  const data = (snap.exists ? snap.data() || {} : {}) as Record<string, unknown>;
  if (!snap.exists || !mayReadProject(data, uid)) return null;
  // Inline copies are the page's own read of the document; only what is
  // stored outside is answered here — all of it, inline or not.
  const index = Object.fromEntries(Object.entries(data).filter(([key]) => !isStoredArtefactField(key)));
  return readStoredArtefacts(tx, projectRef, index);
}

/** A transaction's request may carry 10 MiB; the parts of one write stay well under it. */
const MAX_PARTS_BYTES_PER_WRITE = 9 * 1024 * 1024;

export interface ArtefactWritePlan {
  /** What the project document gets in place of the fields the writer named. */
  projectFields: Record<string, unknown>;
  /** The parts to write, each a whole document (`set`, not merge). */
  parts: Array<{ ref: DocumentReference; data: Record<string, unknown> }>;
  /** Parts of an earlier, longer write that are no longer part of anything. */
  deletes: DocumentReference[];
}

export type ArtefactWritePlanResult = { ok: true; plan: ArtefactWritePlan } | { ok: false; check: ProjectSizeCheck };

/**
 * Turn a project write into a project write plus artefact parts.
 *
 * `current` is the project document **as stored** (not filled in): the size
 * guard measures what stays inline, and the index of earlier parts is read
 * from it. `fields` and `mode` are what the writer would have passed to
 * `tx.set(projectRef, fields, { merge: true })` (`'merge'`) or
 * `tx.update(projectRef, fields)` (`'update'`); the returned `projectFields`
 * go to the same call.
 *
 * A non-empty artefact goes into parts and its inline field is removed. An
 * empty one (`''`, `[]`), `null` or a delete is written inline exactly as
 * before, and its parts go. Fields that are not artefacts pass through.
 *
 * The answer is a refusal with a `ProjectSizeCheck` when what stays inline
 * would outgrow the project document, or when one artefact is larger than its
 * parts can hold — nothing is written then.
 */
export async function planArtefactWrite(
  projectRef: DocumentReference,
  current: Record<string, unknown> | null | undefined,
  fields: Record<string, unknown>,
  mode: 'merge' | 'update',
  options: { partValueBytes?: number } = {},
): Promise<ArtefactWritePlanResult> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const limit = options.partValueBytes ?? ARTEFACT_PART_VALUE_BYTES;
  const index = artefactIndexOf(current);
  const projectFields: Record<string, unknown> = {};
  const indexChanges: Record<string, unknown> = {};
  const parts: ArtefactWritePlan['parts'] = [];
  const deletes: DocumentReference[] = [];
  let partBytes = 0;

  for (const [key, value] of Object.entries(fields)) {
    if (!(STORED_ARTEFACT_FIELDS as readonly string[]).includes(key)) {
      projectFields[key] = value;
      continue;
    }
    const field = key as StoredArtefactField;
    if (value === undefined) continue;
    const before = index[field];
    if (!isExternalValue(value)) {
      // Empty, null or a delete: inline, as it always was; the parts go.
      projectFields[field] = value;
      if (before) {
        indexChanges[field] = FieldValue.delete();
        for (let n = 0; n < before.parts; n++) deletes.push(partsCollection(projectRef).doc(artefactPartId(field, n)));
      }
      continue;
    }
    const split = splitArtefact(field, value, limit);
    if (!split.ok) {
      return {
        ok: false,
        check: { ok: false, bytes: split.bytes, budget: split.budget, largest: [{ field, bytes: split.bytes }], scope: 'artefact' },
      };
    }
    const rev = randomUUID();
    split.parts.forEach((partValue, n) => {
      const ref = partsCollection(projectRef).doc(artefactPartId(field, n));
      const data = artefactPartData(field, rev, split.kind, split.parts.length, n, partValue) as unknown as Record<string, unknown>;
      partBytes += estimateDocumentSize(data, ref.path);
      parts.push({ ref, data });
    });
    if (before) {
      for (let n = split.parts.length; n < before.parts; n++) deletes.push(partsCollection(projectRef).doc(artefactPartId(field, n)));
    }
    projectFields[field] = FieldValue.delete();
    const entry: ArtefactIndexEntry = { rev, parts: split.parts.length, kind: split.kind, bytes: split.bytes };
    indexChanges[field] = entry;
  }

  if (partBytes > MAX_PARTS_BYTES_PER_WRITE) {
    const largest = parts
      .map((p) => ({ field: String(p.data.field), bytes: estimateDocumentSize(p.data, p.ref.path) }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 3);
    return { ok: false, check: { ok: false, bytes: partBytes, budget: MAX_PARTS_BYTES_PER_WRITE, largest, scope: 'artefact' } };
  }

  if (Object.keys(indexChanges).length > 0) {
    if (mode === 'merge') {
      projectFields[ARTEFACT_INDEX_FIELD] = indexChanges;
    } else {
      for (const [field, change] of Object.entries(indexChanges)) projectFields[`${ARTEFACT_INDEX_FIELD}.${field}`] = change;
    }
  }

  const size = checkProjectWrite(current, projectFields, projectRef.path, mode);
  if (!size.ok) return { ok: false, check: size };
  return { ok: true, plan: { projectFields, parts, deletes } };
}

/** Queue the parts of a plan on the transaction the project write is in. */
export function writeArtefactParts(tx: Transaction, plan: ArtefactWritePlan): void {
  for (const part of plan.parts) tx.set(part.ref, part.data);
  for (const ref of plan.deletes) tx.delete(ref);
}

