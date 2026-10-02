/**
 * How large a Firestore document is, and whether a write would push a project
 * past the 1 MiB cap — Codex finding architecture-02.
 *
 * Every artefact a project carries has a bound of its own (`firestore.rules`
 * lets a string field reach 1,000,000 characters, the contract route stores a
 * package of up to `MAX_PACKAGE_CHARS`, the source may be 400 kB), but they
 * all live in one document, and Firestore refuses any document over
 * 1,048,576 bytes. Each bound passed on its own while the sum did not, the
 * write failed inside the transaction, and the reader got a generic 500 and
 * lost what had just been generated. This module estimates the document a
 * write would leave behind, so a writer can refuse it by name first.
 *
 * Pure on purpose: no server import, no SDK import. The browser's own writes
 * (`runTransaction` in the Design and Documentation stages) run the same
 * check against their transaction's snapshot. SDK values are recognised by
 * shape — Admin and web `Timestamp` both carry `seconds` and `nanoseconds`,
 * a reference carries `path`, a field-value sentinel names its method.
 *
 * The rules are Firestore's documented storage-size calculation
 * (https://firebase.google.com/docs/firestore/storage-size):
 *   - string: UTF-8 bytes + 1; a field name is a string;
 *   - boolean and null: 1; integer, float and date/time: 8; geo point: 16;
 *   - bytes: their length; reference: the size of the document name;
 *   - array: the sum of its values; map: the sum of its keys and values;
 *   - document: the size of its name + its fields + 32;
 *   - document name: every collection and document ID in its path as a
 *     string, + 16.
 */

/** The cap Firestore sets on one document. */
export const FIRESTORE_MAX_DOCUMENT_BYTES = 1_048_576;

/**
 * What a project write may leave the document at. 16 KiB under the cap: the
 * estimate is exact for the types above, but a field written between this
 * read and the commit (`updatedAt`, a server timestamp, a reader added) must
 * not be the one that tips it over.
 */
export const PROJECT_DOCUMENT_BUDGET_BYTES = FIRESTORE_MAX_DOCUMENT_BYTES - 16 * 1024;

/** The stable code a refused write answers with, on the server and in the browser. */
export const PROJECT_TOO_LARGE_CODE = 'project-too-large';

const encoder = new TextEncoder();

/** A string as Firestore counts it: its UTF-8 bytes plus one. */
export function stringSize(s: string): number {
  return encoder.encode(s).byteLength + 1;
}

/** `projects/abc` → (8+1) + (3+1) + 16. */
export function documentNameSize(path: string): number {
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .reduce((sum, segment) => sum + stringSize(segment), 16);
}

function sentinelName(value: object): string | null {
  // Admin SDK: `methodName` ('FieldValue.delete', 'FieldValue.serverTimestamp');
  // web SDK: `_methodName` ('deleteField', 'serverTimestamp').
  const v = value as { methodName?: unknown; _methodName?: unknown };
  const name = typeof v.methodName === 'string' ? v.methodName : typeof v._methodName === 'string' ? v._methodName : null;
  return name;
}

function isDeleteSentinel(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const name = sentinelName(value);
  return name === 'FieldValue.delete' || name === 'deleteField';
}

function isPlainMap(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** The stored size of one field value. Unknown shapes are counted as their JSON text, never as zero. */
export function valueSize(value: unknown): number {
  if (value === null || value === undefined) return 1;
  // Plain `if`s, not a `switch` with `case 'object': break;` — the production
  // minifier (SWC, Next 15) compiled that form into a function that returned
  // `undefined` for every object, so every project size came out NaN and
  // `/api/runs/create` refused every analysis as too large. Seen on the
  // production build of 02.10.2026; `next dev` does not minify and hid it.
  if (typeof value === 'string') return stringSize(value);
  if (typeof value === 'number' || typeof value === 'bigint') return 8;
  if (typeof value !== 'object') return 1;
  if (Array.isArray(value)) return value.reduce<number>((sum, v) => sum + valueSize(v), 0);
  if (value instanceof Date) return 8;
  if (value instanceof Uint8Array) return value.byteLength;
  if (isPlainMap(value)) return mapSize(value);
  const v = value as Record<string, unknown>;
  // A sentinel resolves on the server: a timestamp, a number, or nothing.
  const sentinel = sentinelName(v);
  if (sentinel) return isDeleteSentinel(v) ? 0 : 8;
  if (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number') return 8;
  if (typeof v.latitude === 'number' && typeof v.longitude === 'number') return 16;
  if (typeof v.path === 'string' && typeof v.id === 'string') return documentNameSize(v.path);
  if (typeof v.toUint8Array === 'function') return (v.toUint8Array as () => Uint8Array)().byteLength;
  // A class instance the SDK would serialise as a map (or refuse): its own fields.
  return mapSize(v);
}

function mapSize(map: Record<string, unknown>): number {
  let sum = 0;
  for (const [key, val] of Object.entries(map)) {
    if (val === undefined || isDeleteSentinel(val)) continue;
    sum += stringSize(key) + valueSize(val);
  }
  return sum;
}

/** The stored size of the document at `path` holding `data`. */
export function estimateDocumentSize(data: Record<string, unknown>, path: string): number {
  return documentNameSize(path) + mapSize(data) + 32;
}

/**
 * The document a write would leave behind.
 *
 * `merge` is `set(fields, { merge: true })`: maps merge key by key, all the
 * way down, and everything else replaces. `update` is `update(fields)`: a key
 * is a dotted field path and its value replaces whatever stood there. A delete
 * sentinel removes its field in both.
 */
export function mergedDocument(
  current: Record<string, unknown> | null | undefined,
  fields: Record<string, unknown>,
  mode: 'merge' | 'update',
): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(current ?? {}) };
  if (mode === 'merge') return deepMerge(base, fields);
  for (const [fieldPath, value] of Object.entries(fields)) {
    const segments = fieldPath.split('.');
    let target = base;
    for (const segment of segments.slice(0, -1)) {
      const next = target[segment];
      const copy: Record<string, unknown> = isPlainMap(next) ? { ...next } : {};
      target[segment] = copy;
      target = copy;
    }
    const last = segments[segments.length - 1];
    if (isDeleteSentinel(value)) delete target[last];
    else target[last] = value;
  }
  return base;
}

function deepMerge(base: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (isDeleteSentinel(value)) {
      delete out[key];
    } else if (isPlainMap(value) && isPlainMap(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export interface ProjectSizeCheck {
  ok: boolean;
  /** The estimated size of the document after the write. */
  bytes: number;
  budget: number;
  /** The largest fields after the write, largest first — what the reader can act on. */
  largest: Array<{ field: string; bytes: number }>;
}

/** Would this write leave the project document within its budget? */
export function checkProjectWrite(
  current: Record<string, unknown> | null | undefined,
  fields: Record<string, unknown>,
  path: string,
  mode: 'merge' | 'update',
  budget: number = PROJECT_DOCUMENT_BUDGET_BYTES,
): ProjectSizeCheck {
  const after = mergedDocument(current, fields, mode);
  const bytes = estimateDocumentSize(after, path);
  const largest = Object.entries(after)
    .filter(([, v]) => v !== undefined)
    .map(([field, v]) => ({ field, bytes: stringSize(field) + valueSize(v) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 3);
  return { ok: bytes <= budget, bytes, budget, largest };
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * The reader's sentence for a refused write: what is large, that nothing was
 * saved, and what to do about it. `what` names the artefact ("this generated
 * package", "this solution design"); `draftKept` says whether the page still
 * shows the draft for the reader to copy.
 */
export function projectTooLargeMessage(check: ProjectSizeCheck, what: string, draftKept = false): string {
  const fields = check.largest.map((f) => `${f.field} (${kb(f.bytes)})`).join(', ');
  return (
    `Saving ${what} would make this project ${kb(check.bytes)}, more than the ${kb(check.budget)} one project can hold. ` +
    `Nothing was saved, and the previous version is untouched. ` +
    `The largest parts are ${fields}. ` +
    (draftKept ? 'The draft is still shown below — copy or download it before you leave this page. ' : '') +
    `To make room, remove an earlier generated artefact, generate again with a smaller scope, or split the program into smaller projects.`
  );
}

/**
 * Thrown from inside a transaction callback to abandon it: nothing queued in
 * the callback is committed, and the caller answers with `check`.
 */
export class ProjectTooLargeError extends Error {
  readonly check: ProjectSizeCheck;
  constructor(check: ProjectSizeCheck) {
    super(`project document would be ${check.bytes} bytes, budget ${check.budget}`);
    this.name = 'ProjectTooLargeError';
    this.check = check;
  }
}
