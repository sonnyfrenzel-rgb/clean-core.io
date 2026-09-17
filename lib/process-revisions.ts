import { sha256Hex } from './artefact-digest';
import { kindWord, parseBpmn, type ParsedBpmn } from './process-map';

/**
 * Revisions of a project's process model — roadmap 3.2.
 *
 * Every save is a revision of its own and nothing rewrites one that exists.
 * Revision 1 is the **reconstructed Ist**: it is built on the server from the
 * skeleton of the source the active run signed (`buildBpmnExport`), never from
 * an edit, and it stays what it was after any amount of modelling. Every later
 * revision carries the account that saved it and the time it was saved, read
 * from the server's clock.
 *
 * **What a revision is not.** It is not a statement about the code. It says
 * what somebody drew at a point in time — and a drawing can be wrong, out of
 * date, or a deliberate proposal for something the program does not do today.
 * Nothing here enters a signed run or an audit pack (`lib/audit-pack-build.ts`),
 * and no wording in this module or the views over it may suggest otherwise.
 *
 * This file is pure — no React, no network, no Firestore. The route that stores
 * a revision and the browser that compares two of them read the same shapes and
 * the same comparison, so there is one answer to "what changed" and not two.
 */

/** Bumped when the stored record changes shape. */
export const PROCESS_REVISION_FORMAT_VERSION = 1;

/** The subcollection under `projects/{projectId}`. Written only through the Admin SDK. */
export const PROCESS_REVISION_COLLECTION = 'process_revisions';

/**
 * The largest BPMN a revision may carry, in characters.
 *
 * A Firestore document holds one MiB in total. The largest of the starter
 * examples — 73 flow nodes out of 19,615 characters of ABAP — exports to
 * 114,071 characters of BPMN, so this is roughly seven times the biggest thing
 * the product draws today and still leaves the rest of the document room. A
 * model above it is refused with a reason rather than stored truncated: half a
 * diagram is a diagram nobody drew.
 */
export const MAX_REVISION_XML = 800_000;

/** How a revision came to be. Revision 1 is always `reconstructed`. */
export type RevisionOrigin = 'reconstructed' | 'edited';

/** Who saved a revision. Resolved on the server from the signed-in account, never sent by a browser. */
export interface RevisionAccount {
  uid: string;
  /** The name on the profile, or the e-mail when the profile carries no name. Never empty. */
  name: string;
  email: string;
}

/** A revision without its BPMN — what a history list needs. */
export interface ProcessRevisionSummary {
  formatVersion: number;
  /** 1, 2, 3 … and also the document id. */
  revision: number;
  origin: RevisionOrigin;
  account: RevisionAccount;
  /** ISO 8601, from the server's clock. The browser's clock never reaches this field. */
  savedAt: string;
  xmlSha256: string;
  /** The source revision 1 was reconstructed from, carried on every revision of the project. */
  sourceSha256: string;
  fileName: string;
  runId: string | null;
  /** Counted out of the saved file, not asserted: flow nodes, and how many carry a line anchor. */
  flowNodes: number;
  anchored: number;
  unanchored: number;
}

/** A revision with the bytes that were saved. */
export interface ProcessRevisionRecord extends ProcessRevisionSummary {
  xml: string;
}

/** What `readRevisionStats` counts out of a BPMN file. */
export interface RevisionStats {
  flowNodes: number;
  anchored: number;
  unanchored: number;
}

/* ------------------------------------------------------------------ *
 * Reading and checking what is about to be stored.
 * ------------------------------------------------------------------ */

/**
 * Flow nodes and anchors, counted out of the file.
 *
 * Out of the file and not out of the editor's state on purpose: what is stored
 * is the XML, so the numbers beside it have to be the numbers in it. An element
 * somebody drew by hand has no line anchor and is counted as unanchored — which
 * is true, and is exactly what the reader should see.
 */
export function readRevisionStats(xml: string): RevisionStats {
  const parsed: ParsedBpmn = parseBpmn(xml);
  const anchored = parsed.elements.filter((e) => e.trace?.lineStart !== null && e.trace?.lineStart !== undefined).length;
  return { flowNodes: parsed.elements.length, anchored, unanchored: parsed.elements.length - anchored };
}

export type RevisionRefusal = 'bad-request' | 'too-large' | 'not-bpmn';

export type RevisionXmlCheck =
  | { ok: true; xml: string; sha256: string; stats: RevisionStats }
  | { ok: false; code: RevisionRefusal; error: string };

/**
 * Is this something a revision may hold?
 *
 * Deliberately not a schema validation of BPMN 2.0. The editor of 3.1 is
 * bpmn-js and what it serialises is BPMN; what this has to stop is an empty
 * box, a payload of another kind, and a model too large for the store. A stored
 * revision is bytes somebody saved — vouching for their correctness is not
 * something this product can do, and pretending to would be the claim the
 * roadmap forbids.
 */
export function checkRevisionXml(value: unknown): RevisionXmlCheck {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, code: 'bad-request', error: 'Expected the BPMN 2.0 XML of the model as a string.' };
  }
  if (value.length > MAX_REVISION_XML) {
    return {
      ok: false,
      code: 'too-large',
      error: `This model is ${value.length} characters of BPMN; a revision holds at most ${MAX_REVISION_XML}.`,
    };
  }
  if (!/<[A-Za-z][\w.-]*:?definitions[\s>]/.test(value)) {
    return { ok: false, code: 'not-bpmn', error: 'This is not a BPMN 2.0 document: it has no definitions element.' };
  }
  return { ok: true, xml: value, sha256: sha256Hex(value), stats: readRevisionStats(value) };
}

function isAccount(value: unknown): value is RevisionAccount {
  const a = value as RevisionAccount | null;
  return !!a && typeof a.uid === 'string' && typeof a.name === 'string' && typeof a.email === 'string';
}

export function isProcessRevisionSummary(value: unknown): value is ProcessRevisionSummary {
  const r = value as ProcessRevisionSummary | null;
  return (
    !!r
    && r.formatVersion === PROCESS_REVISION_FORMAT_VERSION
    && Number.isInteger(r.revision)
    && r.revision >= 1
    && (r.origin === 'reconstructed' || r.origin === 'edited')
    && isAccount(r.account)
    && typeof r.savedAt === 'string'
    && r.savedAt !== ''
    && typeof r.xmlSha256 === 'string'
    && typeof r.sourceSha256 === 'string'
    && typeof r.fileName === 'string'
    && (r.runId === null || typeof r.runId === 'string')
    && Number.isInteger(r.flowNodes)
    && Number.isInteger(r.anchored)
    && Number.isInteger(r.unanchored)
  );
}

export function isProcessRevisionRecord(value: unknown): value is ProcessRevisionRecord {
  return isProcessRevisionSummary(value) && typeof (value as ProcessRevisionRecord).xml === 'string';
}

/**
 * The line a revision carries wherever it is named.
 *
 * "Revision 1 · reconstructed from Z_MM_PO_APPROVAL.abap" for the Ist, and
 * "Revision 2 · saved by Sonny Frenzel" for an edit. What it never says is that
 * the revision is right.
 */
export function revisionLine(summary: ProcessRevisionSummary): string {
  return summary.origin === 'reconstructed'
    ? `Revision ${summary.revision} · reconstructed from ${summary.fileName}`
    : `Revision ${summary.revision} · saved by ${summary.account.name}`;
}

/* ------------------------------------------------------------------ *
 * Comparing two revisions.
 * ------------------------------------------------------------------ */

/** What a comparison can report about one element. */
export type RevisionFieldName = 'name' | 'type' | 'anchor' | 'status' | 'plane' | 'flows';

export interface RevisionFieldChange {
  field: RevisionFieldName;
  /** "Name", "Element type", "Line anchor", "Status", "Sub-process", "Outgoing flows". */
  label: string;
  before: string;
  after: string;
}

/** One element, as a comparison names it. */
export interface RevisionElementRef {
  /** The BPMN element id of 2.6 — stable across an export, which is what makes this comparison possible. */
  id: string;
  /** "Decision", "Service step" — `kindWord(tag)`. */
  kind: string;
  /** The name in the file, or the id when the element has none. */
  label: string;
  /** "lines 12 to 18", or null when the element carries no line range. */
  anchor: string | null;
}

export interface RevisionChange extends RevisionElementRef {
  fields: RevisionFieldChange[];
}

export interface RevisionDiff {
  from: number;
  to: number;
  added: RevisionElementRef[];
  removed: RevisionElementRef[];
  changed: RevisionChange[];
  /** Elements in both revisions with nothing different about them. */
  unchanged: number;
  /** True when no element was added, removed or changed. */
  identical: boolean;
  /** Counted, in one sentence. */
  summary: string;
}

const FIELD_LABELS: Record<RevisionFieldName, string> = {
  name: 'Name',
  type: 'Element type',
  anchor: 'Line anchor',
  status: 'Status',
  plane: 'Sub-process',
  flows: 'Outgoing flows',
};

type Element = ParsedBpmn['elements'][number];
type Flow = ParsedBpmn['flows'][number];

/** "line 5", "lines 5 to 9", or null — the wording `lib/process-map.ts` already uses. */
function anchorWords(element: Element): string | null {
  const start = element.trace?.lineStart ?? null;
  const end = element.trace?.lineEnd ?? null;
  if (start === null) return null;
  if (end === null || end === start) return `line ${start}`;
  return `lines ${start} to ${end}`;
}

function labelOf(element: Element): string {
  return element.name || element.id;
}

/**
 * The outgoing flows of an element, twice: once as a key for comparing and once
 * as a sentence for reading.
 *
 * The key names the **target's id** and not its label, because renaming a step
 * must be reported on that step and not a second time on everything pointing at
 * it. The sentence names the label, because that is what a reader recognises.
 */
function outgoing(id: string, flows: Flow[], byId: Map<string, Element>): { key: string; text: string } {
  const mine = flows.filter((f) => f.sourceRef === id);
  const key = mine.map((f) => `${f.condition} ${f.targetRef}`).join('');
  const text = mine.length === 0
    ? 'none'
    : mine
      .map((f) => {
        const target = byId.get(f.targetRef);
        const name = target ? labelOf(target) : f.targetRef;
        return f.condition ? `${f.condition} → ${name}` : `→ ${name}`;
      })
      .join('; ');
  return { key, text };
}

function refOf(element: Element): RevisionElementRef {
  return { id: element.id, kind: kindWord(element.tag), label: labelOf(element), anchor: anchorWords(element) };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What changed between two revisions, per BPMN element.
 *
 * Identity is the element id of roadmap 2.6 — stable for the same reading of
 * the same source, and kept by the editor across a save, which is the only
 * reason a comparison can say "this step was renamed" rather than "one step
 * disappeared and another appeared".
 *
 * Pure: two strings in, one object out. No clock, no account, no network — so
 * the comparison is the same in a browser, in a route and in a test with no
 * server at all.
 */
export function diffProcessRevisions(
  before: { revision: number; xml: string },
  after: { revision: number; xml: string },
): RevisionDiff {
  const a = parseBpmn(before.xml);
  const b = parseBpmn(after.xml);
  const aById = new Map(a.elements.map((e) => [e.id, e]));
  const bById = new Map(b.elements.map((e) => [e.id, e]));

  const added: RevisionElementRef[] = [];
  const removed: RevisionElementRef[] = [];
  const changed: RevisionChange[] = [];
  let unchanged = 0;

  for (const element of a.elements) {
    if (!bById.has(element.id)) removed.push(refOf(element));
  }

  for (const now of b.elements) {
    const then = aById.get(now.id);
    if (!then) {
      added.push(refOf(now));
      continue;
    }
    const fields: RevisionFieldChange[] = [];
    const add = (field: RevisionFieldName, from: string, to: string) => {
      if (from !== to) fields.push({ field, label: FIELD_LABELS[field], before: from, after: to });
    };
    add('name', labelOf(then), labelOf(now));
    add('type', kindWord(then.tag), kindWord(now.tag));
    add('anchor', anchorWords(then) ?? 'none', anchorWords(now) ?? 'none');
    add('status', then.trace?.status ?? 'none', now.trace?.status ?? 'none');
    add('plane', then.plane ?? 'top level', now.plane ?? 'top level');

    const flowsThen = outgoing(then.id, a.flows, aById);
    const flowsNow = outgoing(now.id, b.flows, bById);
    if (flowsThen.key !== flowsNow.key) {
      fields.push({ field: 'flows', label: FIELD_LABELS.flows, before: flowsThen.text, after: flowsNow.text });
    }

    if (fields.length) changed.push({ ...refOf(now), fields });
    else unchanged += 1;
  }

  const identical = added.length === 0 && removed.length === 0 && changed.length === 0;
  const summary = identical
    ? `No element differs between revision ${before.revision} and revision ${after.revision}.`
    : [
      `${count(added.length, 'element added', 'elements added')}`,
      `${removed.length} removed`,
      `${changed.length} changed`,
      `${unchanged} unchanged`,
    ].join(', ') + '.';

  return { from: before.revision, to: after.revision, added, removed, changed, unchanged, identical, summary };
}
