/**
 * One page of a project's revision history, read without the BPMN.
 *
 * The history list needs the summary of each revision and never its drawing.
 * Each stored revision may carry up to `MAX_REVISION_XML` characters of BPMN, so
 * the list asks Firestore for the summary fields only (`select`) and for one
 * page at a time, newest first. A reader who wants older revisions asks again
 * with `?before=<the oldest revision on the page>`.
 *
 * Kept apart from the route so the shape of the query is testable without a
 * server: the route hands in its collection reference, this module decides what
 * is read.
 */

/** Revisions per page of the history list. */
export const PROCESS_REVISION_PAGE_SIZE = 50;

/**
 * The fields of `ProcessRevisionSummary`, the ones a history list shows. `xml`
 * is deliberately absent: that is the drawing, read one revision at a time.
 */
export const REVISION_SUMMARY_FIELDS = [
  'formatVersion',
  'revision',
  'origin',
  'account',
  'savedAt',
  'xmlSha256',
  'sourceSha256',
  'fileName',
  'runId',
  'flowNodes',
  'anchored',
  'unanchored',
] as const;

/** The part of a Firestore query this module uses. */
export interface RevisionQuery {
  select(...fields: string[]): RevisionQuery;
  orderBy(field: string, direction: 'asc' | 'desc'): RevisionQuery;
  where(field: string, op: '<', value: number): RevisionQuery;
  limit(n: number): RevisionQuery;
  get(): Promise<{ docs: Array<{ data: () => Record<string, unknown> }> }>;
}

/**
 * The `before` cursor from a query string: absent → `null` (the newest page),
 * a whole number from 2 upwards → that number, anything else → `'bad'`.
 * `before=1` would name a page with nothing on it and is refused as well.
 */
export function parseRevisionCursor(raw: string | null): number | null | 'bad' {
  if (raw === null) return null;
  if (!/^\d{1,9}$/.test(raw)) return 'bad';
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 2 ? n : 'bad';
}

/**
 * One page, oldest first within the page, and the cursor to the page before it
 * (`null` when this page reaches revision 1).
 */
export async function readRevisionPage(
  collection: RevisionQuery,
  before: number | null,
  pageSize: number = PROCESS_REVISION_PAGE_SIZE,
): Promise<{ docs: Array<Record<string, unknown>>; nextBefore: number | null }> {
  let query = collection.select(...REVISION_SUMMARY_FIELDS).orderBy('revision', 'desc');
  if (before !== null) query = query.where('revision', '<', before);
  // One more than the page: whether it came back says whether an older page exists.
  const snap = await query.limit(pageSize + 1).get();
  const newestFirst = snap.docs.map((d) => d.data());
  const more = newestFirst.length > pageSize;
  const page = newestFirst.slice(0, pageSize);
  const oldest = page[page.length - 1];
  return {
    docs: page.reverse(),
    nextBefore: more && oldest && typeof oldest.revision === 'number' ? oldest.revision : null,
  };
}
