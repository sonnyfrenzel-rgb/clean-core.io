/**
 * Large artefacts in documents of their own — roadmap 3.0.14, item 9
 * (owner decision 15.10.2026: "wir müssen besser werden für große Beispiele").
 *
 * A project used to be one Firestore document, and Firestore refuses any
 * document over 1 MiB. The SD reference program no longer fit: its business
 * documentation alone would have made the project 1,229 KB. The four large
 * artefacts a project carries now live beside it, one per artefact:
 *
 *   projects/{id}/artefacts/{field}-{n}   n = 0 … parts-1
 *
 * An artefact that is larger than one document can hold is split over several
 * parts — a string by its characters, a list by its entries — and joined back
 * in order. The project document keeps only an index (`artefactStore`): for
 * each field stored outside, the revision of the write and the number of parts.
 * A reader joins the parts only when every one of them carries that revision,
 * so a read that falls between two writes cannot return half of each.
 *
 * Who reads and writes: only the server, with the Admin SDK
 * (`lib/project-artefact-store.ts`). `firestore.rules` has no match for the
 * collection, so the default deny closes it to every browser — no rules change
 * and no rules deploy. The browser reads the artefacts through
 * `GET /api/projects/{id}/artefacts`, which admits the owner and an invited
 * reader by the same `mayReadProject` the rules use for the project document.
 *
 * The read bridge: a project stored before 3.0.14 holds the fields inline and
 * has no index. It is read exactly as before. A field named in the index is
 * taken from its parts and wins over an inline copy (there should be none: a
 * write to the parts removes the inline field in the same transaction).
 *
 * The values are stored as Firestore values, never re-encoded: a string part is
 * a string, a list part is a list of the same entries. What a reader gets back
 * is the value that was written, so every digest computed over it — the
 * artefact digests of a source change, the test-run subject, the generation
 * token — is the digest it was before the move.
 *
 * Pure on purpose: no SDK import. The browser loader and the server store both
 * read the index with these functions.
 */

import { valueSize, stringSize, PROJECT_DOCUMENT_BUDGET_BYTES } from './firestore-doc-size';

/** The artefacts that live in documents of their own. */
export const STORED_ARTEFACT_FIELDS = ['generatedCode', 'documentation', 'businessDocumentation', 'testCases'] as const;
export type StoredArtefactField = (typeof STORED_ARTEFACT_FIELDS)[number];

/** The subcollection under `projects/{id}`. */
export const ARTEFACT_COLLECTION = 'artefacts';

/** The index on the project document. Written by the server only; not on the rules' client allowlist. */
export const ARTEFACT_INDEX_FIELD = 'artefactStore';

/**
 * What one part may hold, in stored bytes of its value. The rest of the budget
 * is the part's own few fields and its name; a part is always well under the
 * 1 MiB Firestore allows.
 */
export const ARTEFACT_PART_VALUE_BYTES = PROJECT_DOCUMENT_BUDGET_BYTES - 8 * 1024;

/**
 * At most this many parts per artefact. A field is bounded long before this
 * (1,000,000 characters; 100 test cases), so the bound is a backstop against a
 * runaway value, not a limit anyone reaches.
 */
export const MAX_ARTEFACT_PARTS = 8;

/** One entry of the index. */
export interface ArtefactIndexEntry {
  /** A fresh id per write; every part of that write carries it. */
  rev: string;
  /** How many parts the value was split into. */
  parts: number;
  /** `string` or `list` — what the parts join into. */
  kind: 'string' | 'list';
  /** The stored size of the whole value (Firestore's count), for the reader's information. */
  bytes: number;
}

export type ArtefactIndex = Partial<Record<StoredArtefactField, ArtefactIndexEntry>>;

/** One part as it is stored. */
export interface ArtefactPart {
  field: StoredArtefactField;
  rev: string;
  part: number;
  parts: number;
  kind: 'string' | 'list';
  value: string | unknown[];
}

export const isStoredArtefactField = (key: string): key is StoredArtefactField =>
  (STORED_ARTEFACT_FIELDS as readonly string[]).includes(key);

/** The document id of part `n` of `field`. */
export const artefactPartId = (field: StoredArtefactField, n: number): string => `${field}-${n}`;

function readEntry(value: unknown): ArtefactIndexEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.rev !== 'string' || !v.rev) return null;
  if (typeof v.parts !== 'number' || !Number.isInteger(v.parts) || v.parts < 1 || v.parts > MAX_ARTEFACT_PARTS) return null;
  if (v.kind !== 'string' && v.kind !== 'list') return null;
  return { rev: v.rev, parts: v.parts, kind: v.kind, bytes: typeof v.bytes === 'number' ? v.bytes : 0 };
}

/** The index of a project document — only the well-formed entries of known fields. */
export function artefactIndexOf(project: unknown): ArtefactIndex {
  if (!project || typeof project !== 'object') return {};
  const raw = (project as Record<string, unknown>)[ARTEFACT_INDEX_FIELD];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ArtefactIndex = {};
  for (const field of STORED_ARTEFACT_FIELDS) {
    const entry = readEntry((raw as Record<string, unknown>)[field]);
    if (entry) out[field] = entry;
  }
  return out;
}

/** Does this project document keep any artefact outside? */
export const hasStoredArtefacts = (project: unknown): boolean => Object.keys(artefactIndexOf(project)).length > 0;

/**
 * A key that changes whenever an artefact is written outside — for a cache of
 * what was read. Two documents with the same key hold the same artefacts.
 */
export function artefactIndexKey(project: unknown): string {
  const index = artefactIndexOf(project);
  return STORED_ARTEFACT_FIELDS.filter((f) => index[f])
    .map((f) => `${f}:${index[f]!.rev}:${index[f]!.parts}`)
    .join('|');
}

/**
 * Is this value one that goes into parts? An absent or empty value does not:
 * it is written inline as it always was (`''` clears a layer, for instance),
 * and the index entry goes.
 */
export function isExternalValue(value: unknown): value is string | unknown[] {
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

/** A refusal: one entry is larger than a part can hold. */
export interface PartTooLarge {
  ok: false;
  field: StoredArtefactField;
  /** The stored size of the entry (or the whole value) that does not fit. */
  bytes: number;
  budget: number;
}

export type SplitResult =
  | { ok: true; kind: 'string' | 'list'; parts: Array<string | unknown[]>; bytes: number }
  | PartTooLarge;

/** Split a string at code-point boundaries so each slice is at most `limit` UTF-8 bytes. */
function splitString(value: string, limit: number): string[] {
  const out: string[] = [];
  const encoder = new TextEncoder();
  let start = 0;
  while (start < value.length) {
    // A first guess by characters (each at most 3 UTF-8 bytes per UTF-16 unit),
    // then shrunk until it fits and does not cut a surrogate pair.
    let end = Math.min(value.length, start + Math.max(1, Math.floor(limit / 3)));
    // Grow while the slice still fits — a mostly-ASCII text fills its part.
    let size = encoder.encode(value.slice(start, end)).byteLength;
    while (end < value.length && size < limit) {
      const step = Math.max(1, Math.floor((limit - size) / 3));
      const next = Math.min(value.length, end + step);
      const nextSize = size + encoder.encode(value.slice(end, next)).byteLength;
      if (nextSize > limit) break;
      end = next;
      size = nextSize;
    }
    // Never end between the two halves of a surrogate pair.
    if (end < value.length) {
      const code = value.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    out.push(value.slice(start, end));
    start = end;
  }
  return out;
}

/**
 * Split one artefact into parts that each fit a document. A list is cut
 * between entries; an entry larger than a part is refused by name, never cut.
 */
export function splitArtefact(
  field: StoredArtefactField,
  value: string | unknown[],
  limit: number = ARTEFACT_PART_VALUE_BYTES,
): SplitResult {
  const bytes = valueSize(value);
  const budget = limit * MAX_ARTEFACT_PARTS;
  if (typeof value === 'string') {
    if (stringSize(value) > budget) return { ok: false, field, bytes, budget };
    return { ok: true, kind: 'string', parts: splitString(value, limit), bytes };
  }
  const parts: unknown[][] = [];
  let current: unknown[] = [];
  let size = 0;
  for (const entry of value) {
    const entrySize = valueSize(entry);
    if (entrySize > limit) return { ok: false, field, bytes: entrySize, budget: limit };
    if (current.length > 0 && size + entrySize > limit) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(entry);
    size += entrySize;
  }
  if (current.length > 0) parts.push(current);
  if (parts.length > MAX_ARTEFACT_PARTS) return { ok: false, field, bytes, budget };
  return { ok: true, kind: 'list', parts, bytes };
}

/** A part as read back, checked against the index entry it is supposed to belong to. */
function readPart(raw: unknown, field: StoredArtefactField, n: number, entry: ArtefactIndexEntry): string | unknown[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.field !== field || p.rev !== entry.rev || p.part !== n || p.parts !== entry.parts || p.kind !== entry.kind) return null;
  if (entry.kind === 'string' && typeof p.value === 'string') return p.value;
  if (entry.kind === 'list' && Array.isArray(p.value)) return p.value;
  return null;
}

export type JoinResult = { ok: true; value: string | unknown[] } | { ok: false; reason: string };

/**
 * Join the parts of one artefact, in order. `parts[n]` is the stored data of
 * part `n` (or `undefined` when it was not found). Any part missing or from
 * another write is a failed read, never a shorter value.
 */
export function joinArtefact(field: StoredArtefactField, entry: ArtefactIndexEntry, parts: unknown[]): JoinResult {
  const values: Array<string | unknown[]> = [];
  for (let n = 0; n < entry.parts; n++) {
    const value = readPart(parts[n], field, n, entry);
    if (value === null) return { ok: false, reason: `part ${n + 1} of ${entry.parts} of ${field} is missing or from another write` };
    values.push(value);
  }
  if (entry.kind === 'string') return { ok: true, value: (values as string[]).join('') };
  return { ok: true, value: (values as unknown[][]).flat(1) };
}

/** The stored data of part `n` of a split. */
export function artefactPartData(
  field: StoredArtefactField,
  rev: string,
  kind: 'string' | 'list',
  parts: number,
  n: number,
  value: string | unknown[],
): ArtefactPart {
  return { field, rev, part: n, parts, kind, value };
}

/** Said to the reader when the stored artefacts of a project could not be read. */
export const ARTEFACT_READ_ERROR =
  'The generated artefacts of this project could not be read. Reload the page to try again.';
