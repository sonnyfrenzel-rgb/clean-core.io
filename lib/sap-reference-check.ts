import { SAP_API_CATALOG, SAP_API_CATALOG_VERSION } from './abap/sap-api-catalog';
import { SAP_SCOPE_ITEMS } from './sap-scope-items';

/**
 * SAP identifiers a model wrote, checked against SAP data this product holds —
 * owner, 11.10.2026, external review F-03 / F-09.
 *
 * The review of a delivered bundle found four SAP references that no line of
 * our code produced: Fiori app F2358 called "Process Collections Worklist" (SAP
 * lists F2358 as Monitor Purchase Order Items; the collections app is F0380),
 * scope items "BDC / 19M" for collections (19M is Direct Debit; BFC is
 * Collections and Dispute Management), SAP_COM_0093 for credit management (it
 * is Identity Management Integration), and API_JOURNALENTRYITEMBASIC_SRV as a
 * general replacement for BSID/BSAD/BSEG. The model invented or confused them,
 * and the product printed them as fact.
 *
 * This module reads model text, finds the SAP identifiers in it and gives each
 * one of three states:
 *
 *   - `verified`   — our own SAP data holds the ID, and the name the model gave
 *                    it (where it gave one) is SAP's name for it;
 *   - `mismatch`   — we hold the ID, and the model's name for it contradicts
 *                    SAP's; the reader sees SAP's name, never the model's as fact;
 *   - `unverified` — anything else: an ID we hold no SAP data for, or a known ID
 *                    the model wrote without a name (then SAP's name is shown
 *                    beside it, and it is still "check before use").
 *
 * "Verified" says the identifier and its name are SAP's. It never says the SAP
 * object covers the use the model put it to — a name hit is not functional
 * equivalence (review F-03, "Soll").
 *
 * Pure: no React, no server-only imports, so the client stages and the
 * markdown/HTML exports read the same answer. The data is
 *
 *   1. `CURATED_SAP_IDS` below — only entries whose SAP source is named on the
 *      entry. No entry goes in without one.
 *   2. The released successors of `lib/abap/sap-api-catalog.ts` (APIs and CDS
 *      views; the technical name is the name).
 *   3. SAP's scope-item titles in `lib/sap-scope-items.ts`, so a scope item the
 *      model gives for another area (1EG for cost center accounting — SAP lists
 *      it as Bank Integration with File Interface) reads `mismatch`, not
 *      `unverified` (CO review F13, 12.10.2026).
 */

export type SapIdKind =
  | 'fiori-app'
  | 'scope-item'
  | 'communication-scenario'
  | 'api'
  | 'cds-view'
  | 'badi'
  | 'transaction';

export type SapIdStatus = 'verified' | 'mismatch' | 'unverified';

export interface SapSource {
  /** Short, for an inline mark: "SAP KBA 3409472". */
  label: string;
  url: string | null;
}

interface KnownSapId {
  id: string;
  kind: SapIdKind;
  /** SAP's name for it, or null when the technical name is the name (APIs, CDS views). */
  name: string | null;
  source: SapSource;
  /** A restriction SAP itself documents, shown wherever the ID is. */
  caveat?: string;
}

/** The review's primary sources (FI_Collection_Worklist_Review.md §10, retrieved 11.10.2026). */
const S1: SapSource = { label: 'SAP KBA 3696098', url: 'https://userapps.support.sap.com/sap/support/knowledge/en/3696098' };
const S2: SapSource = { label: 'SAP KBA 3409472', url: 'https://userapps.support.sap.com/sap/support/knowledge/en/3409472' };
const S3: SapSource = {
  label: 'SAP Help, Receivables Management 2608',
  url: 'https://help.sap.com/docs/SAP_S4HANA_CLOUD/918bca53037f408f91a2295d04ac16bc/c3205ebafd0c4a6e804c7e7d3c700c3c.html',
};
const S4: SapSource = {
  label: 'SAP Help, Identity and Access Management integration 2608',
  url: 'https://help.sap.com/docs/SAP_S4HANA_CLOUD/0f69f8fb28ac4bf48d2b57b9637e81fa/16fb12e0754b4775a900cabf68e3d744.html',
};
const S5: SapSource = { label: 'SAP KBA 2821106', url: 'https://userapps.support.sap.com/sap/support/knowledge/en/2821106' };

/**
 * The curated table. Every row names the SAP document it was read from; a row
 * without one does not belong here. Extend it the same way: the ID, SAP's name
 * as SAP writes it, and the source.
 */
export const CURATED_SAP_IDS: readonly KnownSapId[] = Object.freeze([
  // SAP KBA 3409472 (S2) — on-premise / private edition; availability depends on the target release.
  { id: 'F0380', kind: 'fiori-app', name: 'Process Collections Worklist', source: S2 },
  // SAP KBA 3696098 (S1).
  { id: 'F2358', kind: 'fiori-app', name: 'Monitor Purchase Order Items', source: S1 },
  // SAP Help, Receivables Management, version 2608 — scope items (S3).
  { id: '19M', kind: 'scope-item', name: 'Direct Debit', source: S3 },
  { id: 'BFC', kind: 'scope-item', name: 'Collections and Dispute Management', source: S3 },
  { id: 'J59', kind: 'scope-item', name: 'Accounts Receivable', source: S3 },
  // SAP Help, Integrating Identity and Access Management Products and Services, version 2608 (S4).
  { id: 'SAP_COM_0093', kind: 'communication-scenario', name: 'Identity Management Integration', source: S4 },
  // SAP KBA 2821106 (S5): entry view and ledger view are different APIs, and this
  // one is restricted to SAP Analytics Cloud in the public edition.
  {
    id: 'API_JOURNALENTRYITEMBASIC_SRV',
    kind: 'api',
    name: null,
    source: S5,
    caveat:
      'SAP distinguishes entry view and ledger view, and restricts this API to SAP Analytics Cloud in the public edition — not a general replacement for BSID, BSAD or BSEG',
  },
  // SAP's scope-item titles, each with the public SAP page that states it (CO review F13, 12.10.2026).
  ...SAP_SCOPE_ITEMS.map((s) => ({ id: s.id, kind: 'scope-item' as const, name: s.title, source: { ...s.source } })),
] as KnownSapId[]);

const CATALOG_SOURCE: SapSource = {
  label: `SAP API catalog ${SAP_API_CATALOG_VERSION} in this product`,
  url: null,
};

/** Every ID we hold SAP data for, by upper-case ID. Curated rows win over the catalog. */
const KNOWN: ReadonlyMap<string, KnownSapId> = (() => {
  const map = new Map<string, KnownSapId>();
  for (const entry of Object.values(SAP_API_CATALOG)) {
    const id = entry.view;
    if (map.has(id.toUpperCase())) continue;
    const kind: SapIdKind | null = entry.type === 'OData API' ? 'api' : entry.type === 'CDS View' ? 'cds-view' : null;
    if (!kind) continue;
    map.set(id.toUpperCase(), { id, kind, name: null, source: CATALOG_SOURCE });
  }
  for (const entry of CURATED_SAP_IDS) map.set(entry.id.toUpperCase(), entry);
  return map;
})();

const KNOWN_SCOPE_ITEMS = CURATED_SAP_IDS.filter((e) => e.kind === 'scope-item').map((e) => e.id);

export interface SapIdCheck {
  /** As the model wrote it. */
  id: string;
  kind: SapIdKind;
  status: SapIdStatus;
  /** The name the model gave it, when one could be read next to it. */
  modelName: string | null;
  /** SAP's name, when we hold one. */
  sapName: string | null;
  source: SapSource | null;
  caveat: string | null;
  /** Where in the text: the first occurrence. */
  index: number;
  length: number;
}

export const SAP_ID_KIND_LABEL: Readonly<Record<SapIdKind, string>> = Object.freeze({
  'fiori-app': 'Fiori app',
  'scope-item': 'Scope item',
  'communication-scenario': 'Communication scenario',
  api: 'API',
  'cds-view': 'CDS view',
  badi: 'BAdI',
  transaction: 'Transaction',
});

// ── Extraction ──────────────────────────────────────────────────────────────

interface RawHit {
  id: string;
  kind: SapIdKind;
  index: number;
  length: number;
}

/** Upper-case words of two or three characters that are never scope items. */
const SCOPE_STOP = new Set([
  'SAP', 'API', 'APIS', 'CDS', 'RAP', 'CAP', 'ERP', 'FI', 'CO', 'SD', 'MM', 'PP', 'PM', 'QM', 'HR', 'AR', 'AP',
  'GL', 'UI', 'UX', 'IT', 'ID', 'IDS', 'OR', 'AND', 'SQL', 'ALV', 'PDF', 'CSV', 'LUW', 'BOM', 'ABC', 'TCO', 'ROI', 'KPI',
  'ATC', 'IAM', 'SSO', 'JWT', 'URL', 'XML', 'DB', 'ON', 'IN', 'OF', 'TO', 'BY', 'FOR', 'THE', 'S4', 'NEW', 'ALL', 'EU',
  'US', 'DE', 'EN', 'OK', 'NO', 'YES', 'SLA', 'FAQ',
]);

const SCOPE_TOKEN = /^[0-9A-Z]{2,3}$/;

function scopeToken(tok: string): boolean {
  return SCOPE_TOKEN.test(tok) && !SCOPE_STOP.has(tok);
}

function pushIfFree(hits: RawHit[], hit: RawHit) {
  if (hits.some((h) => hit.index < h.index + h.length && h.index < hit.index + hit.length)) return;
  hits.push(hit);
}

function rawHits(text: string): RawHit[] {
  const hits: RawHit[] = [];
  const add = (re: RegExp, kind: SapIdKind, group = 0, filter?: (m: RegExpExecArray) => boolean) => {
    for (const m of text.matchAll(re)) {
      if (filter && !filter(m as RegExpExecArray)) continue;
      const id = m[group];
      const index = (m.index ?? 0) + (group === 0 ? 0 : m[0].indexOf(id));
      pushIfFree(hits, { id, kind, index, length: id.length });
    }
  };

  add(/\bSAP_COM_\d{4}\b/g, 'communication-scenario');
  add(/\bAPI_[A-Z0-9_]*[A-Z0-9]\b/g, 'api');
  add(/\bA_[A-Z][A-Za-z0-9]+\b/g, 'api');
  add(/\bI_[A-Z][A-Za-z0-9]+\b/g, 'cds-view');
  add(/\b(?:BADI_[A-Z0-9_]*[A-Z0-9]|[A-Z][A-Z0-9]*_BADI(?:_[A-Z0-9]+)*)\b/g, 'badi');
  add(/\bBAdI\s+(?:definition\s+)?([A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9])\b/g, 'badi', 1);
  // A transaction code is only read where the text says it is one.
  add(/\b(?:transaction(?:\s+code)?|t-?code)s?\s*:?\s*\(?([A-Z][A-Z0-9_]{1,19})\b/gi, 'transaction', 1, (m) => /[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase());
  // Fiori app IDs: F + four or five digits; three digits only after "app" or "Fiori".
  add(/\bF\d{4,5}[A-Z]?\b/g, 'fiori-app');
  add(/\b(?:app|Fiori)\s+(?:ID\s+)?(F\d{3})\b/gi, 'fiori-app', 1);

  // Scope items: the codes listed after "scope item(s)", the one right before it,
  // and the curated scope item IDs wherever they stand.
  for (const m of text.matchAll(/\bscope[- ]items?\b(?:\s+IDs?)?\s*:?\s*\(?/gi)) {
    let pos = (m.index ?? 0) + m[0].length;
    const list = /^([0-9A-Z]{2,3})\b(\s*(?:\/|,|\band\b|\bor\b|&|\+)\s*)?/;
    for (;;) {
      const rest = text.slice(pos);
      const t = list.exec(rest);
      if (!t || !scopeToken(t[1])) break;
      pushIfFree(hits, { id: t[1], kind: 'scope-item', index: pos, length: t[1].length });
      if (!t[2]) break;
      pos += t[0].length;
    }
  }
  for (const m of text.matchAll(/\b([0-9A-Z]{2,3})\s*(?:\([^)]{0,80}\)\s*)?scope[- ]item/gi)) {
    if (m[1] !== m[1].toUpperCase() || !scopeToken(m[1])) continue;
    pushIfFree(hits, { id: m[1], kind: 'scope-item', index: m.index ?? 0, length: m[1].length });
  }
  for (const id of KNOWN_SCOPE_ITEMS) {
    for (const m of text.matchAll(new RegExp(`\\b${id}\\b`, 'g'))) {
      pushIfFree(hits, { id, kind: 'scope-item', index: m.index ?? 0, length: id.length });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

// ── The model's name for an ID ─────────────────────────────────────────────

/** Words that describe the kind of thing, not its name. */
const GENERIC = new Set([
  'sap', 'fiori', 's/4hana', 's4hana', 'app', 'apps', 'application', 'cloud', 'public', 'private', 'edition', 'odata',
  'api', 'apis', 'scope', 'item', 'items', 'communication', 'scenario', 'scenarios', 'id', 'the', 'standard', 'released',
  'service', 'best', 'practices', 'transaction', 'cds', 'view', 'badi', 'verify', 'e.g.', 'see',
  // Verbs and prepositions a sentence opens with, capitalised there: never part of a name.
  'use', 'using', 'implement', 'adopt', 'replace', 'call', 'read', 'connect', 'run', 'check', 'via', 'with', 'through',
  'then', 'later', 'here', 'this', 'that', 'it', 'a', 'an',
]);
const CONNECTOR = new Set(['and', '&', 'of', 'for', 'to', 'by', 'in', '-', '–']);
/** An article ends a name read backwards: "Use the Process Collections Worklist (F2358)". */
const ARTICLE = new Set(['the', 'a', 'an']);

function trimGeneric(words: string[]): string[] {
  const out = [...words];
  while (out.length && (GENERIC.has(out[0].toLowerCase()) || CONNECTOR.has(out[0].toLowerCase()))) out.shift();
  while (out.length && (GENERIC.has(out[out.length - 1].toLowerCase()) || CONNECTOR.has(out[out.length - 1].toLowerCase()))) out.pop();
  return out;
}

const CAP_WORD = /^[A-Z][A-Za-z0-9/-]*[A-Za-z0-9]?$/;
const ID_LIKE = /^(?:SAP_COM_\d{4}|API_\w+|A_\w+|I_\w+|F\d{3,5}[A-Z]?|[0-9A-Z]{2,3})$/;

/** A run of capitalised words (connectors allowed between them), read forwards. */
function titleRunForward(s: string): string | null {
  const words = s.split(/\s+/).filter(Boolean);
  const run: string[] = [];
  for (const raw of words) {
    const w = raw.replace(/[.,;:!?)"”“'’»]+$/, '');
    const ended = w !== raw;
    if (ARTICLE.has(w.toLowerCase()) && run.length) break;
    if (CAP_WORD.test(w) && !ID_LIKE.test(w)) run.push(w);
    else if (CONNECTOR.has(w.toLowerCase()) && run.length) run.push(w);
    else break;
    if (ended) break;
  }
  const name = trimGeneric(run);
  return name.filter((w) => CAP_WORD.test(w)).length >= 2 ? name.join(' ') : null;
}

/** The same, read backwards from just before the ID. */
function titleRunBackward(s: string): string | null {
  const words = s.split(/\s+/).filter(Boolean);
  const run: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const raw = words[i];
    const w = raw.replace(/^[("“„'‘«]+/, '').replace(/[,;:]+$/, '');
    if (/[.,;:!?]$/.test(raw) && run.length) break;
    if (ARTICLE.has(w.toLowerCase())) break;
    if (CAP_WORD.test(w) && !ID_LIKE.test(w)) run.unshift(w);
    else if (CONNECTOR.has(w.toLowerCase()) && run.length) run.unshift(w);
    else break;
    if (w !== raw && /^[("“„'‘«]/.test(raw)) break;
  }
  const name = trimGeneric(run);
  return name.filter((w) => CAP_WORD.test(w)).length >= 2 ? name.join(' ') : null;
}

function cleanName(s: string): string | null {
  const words = trimGeneric(s.replace(/[“”„"'‘’«»]/g, ' ').split(/\s+/).filter(Boolean));
  if (!words.length || !/^[A-Z]/.test(words[0])) return null;
  if (words.every((w) => ID_LIKE.test(w))) return null;
  return words.join(' ');
}

/** The name the model wrote next to an ID, or null when it wrote none we can read. */
export function modelNameNear(text: string, index: number, length: number): string | null {
  const after = text.slice(index + length, index + length + 120);
  const before = text.slice(Math.max(0, index - 120), index);

  // "F2358 (Process Collections Worklist)" / F2358 "Process …"
  const paren = /^\s*\(([^()]{2,90})\)/.exec(after);
  if (paren) {
    const inner = paren[1].split(/[;,]/)[0];
    const n = cleanName(inner);
    if (n) return n;
  }
  const quoted = /^\s*[-–—:=]?\s*["“„'‘«]([^"”“'’»]{2,90})["”“'’»]/.exec(after);
  if (quoted) {
    const n = cleanName(quoted[1]);
    if (n) return n;
  }
  // "Process Collections Worklist (F2358)"
  if (/\(\s*$/.test(before)) {
    const q = /["“„'‘«]([^"”“'’»]{2,90})["”“'’»]\s*\(\s*$/.exec(before);
    if (q) {
      const n = cleanName(q[1]);
      if (n) return n;
    }
    const n = titleRunBackward(before.replace(/\(\s*$/, ''));
    if (n) return n;
  }
  // "F2358 – Process Collections Worklist", "SAP_COM_0093 for Credit Management", "F0380 Process Collections Worklist"
  const sep = /^\s*(?:[-–—:=]|\bfor\b|\bis\b|\bas\b)\s*/.exec(after);
  const tail = sep ? after.slice(sep[0].length) : after;
  const fwd = titleRunForward(tail.trimStart());
  if (fwd) return fwd;
  // "the Credit Management scenario SAP_COM_0093" — a name standing directly before the ID.
  const back = titleRunBackward(before.replace(/\b(?:app|scenario|scope item|API|ID)\s*$/i, ''));
  if (back && /\s$/.test(before)) return back;
  return null;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Does the model's name say the same as SAP's? Equal, or one containing the other. */
export function namesAgree(model: string, sap: string): boolean {
  const a = norm(model);
  const b = norm(sap);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.split(' ').length >= 2 && long.includes(short);
}

// ── Classification ─────────────────────────────────────────────────────────

function classify(text: string, hit: RawHit): SapIdCheck {
  const known = KNOWN.get(hit.id.toUpperCase()) ?? null;
  const kind = known?.kind ?? hit.kind;
  const modelName = modelNameNear(text, hit.index, hit.length);
  const base = {
    id: hit.id,
    kind,
    modelName,
    sapName: known?.name ?? null,
    source: known?.source ?? null,
    caveat: known?.caveat ?? null,
    index: hit.index,
    length: hit.length,
  };
  if (!known) return { ...base, status: 'unverified' };
  // The technical name is the name: holding the ID is holding the name.
  if (known.name === null) return { ...base, status: 'verified' };
  if (modelName && namesAgree(modelName, known.name)) return { ...base, status: 'verified' };
  if (modelName) return { ...base, status: 'mismatch' };
  // No name beside it — SAP's name may still stand in the same sentence.
  const sentence = sentenceAround(text, hit.index);
  if (norm(sentence).includes(norm(known.name))) return { ...base, status: 'verified' };
  return { ...base, status: 'unverified' };
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('. ', index), text.lastIndexOf('\n', index)) + 1;
  const ends = [text.indexOf('. ', index), text.indexOf('\n', index)].filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) : text.length;
  return text.slice(start, end);
}

/** Every SAP identifier in the text, each occurrence, in order. */
export function findSapIdentifiers(text: unknown): SapIdCheck[] {
  if (!text || typeof text !== 'string') return [];
  return rawHits(text).map((h) => classify(text, h));
}

const RANK: Record<SapIdStatus, number> = { mismatch: 3, unverified: 2, verified: 1 };

/**
 * One check per ID across all the texts given, the worst state winning: an ID
 * the model named wrongly once is not made right by a second, correct mention.
 */
export function checkSapReferences(...texts: unknown[]): SapIdCheck[] {
  const byId = new Map<string, SapIdCheck>();
  for (const t of texts) {
    for (const c of findSapIdentifiers(t)) {
      const key = c.id.toUpperCase();
      const prev = byId.get(key);
      if (!prev || RANK[c.status] > RANK[prev.status]) byId.set(key, c);
    }
  }
  return [...byId.values()];
}

// ── Words ──────────────────────────────────────────────────────────────────

export const SAP_ID_STATUS_WORD: Readonly<Record<SapIdStatus, string>> = Object.freeze({
  verified: 'verified',
  mismatch: "name does not match SAP's",
  unverified: 'not verified — check before use',
});

/** The mark after an ID, in plain text: the same words in the UI, the markdown and the HTML exports. */
export function sapIdMark(check: SapIdCheck): string {
  const src = check.source ? check.source.label : '';
  const caveat = check.caveat ? `; SAP restriction: ${check.caveat}` : '';
  if (check.status === 'verified') {
    return check.sapName
      ? `verified: SAP lists ${check.id} as “${check.sapName}”, ${src}${caveat}`
      : `verified: ${check.id} is in ${src}${caveat}`;
  }
  if (check.status === 'mismatch') {
    return `name does not match SAP's (SAP: ${check.id} is “${check.sapName}”, ${src})${caveat}`;
  }
  return check.sapName
    ? `not verified — SAP lists ${check.id} as “${check.sapName}”, ${src}; check before use${caveat}`
    : `not verified — check before use`;
}

/**
 * The occurrences that carry a mark: the first of every identifier, and every
 * later one the model gave a wrong name — "F0380 (Process Collections
 * Worklist) … F0380 (Credit Management)" marks both, so the second wrong name
 * does not read as covered by the first one's "verified" (QA 53b44083e460). A
 * plain repeat, or the same wrong name again, stays unmarked.
 */
export function occurrencesToMark(checks: readonly SapIdCheck[]): SapIdCheck[] {
  const marked = new Set<string>();
  const out: SapIdCheck[] = [];
  for (const c of checks) {
    const id = c.id.toUpperCase();
    const wrongName = c.status === 'mismatch' ? `${id}|${norm(c.modelName ?? '')}` : null;
    if (marked.has(id) && (wrongName === null || marked.has(wrongName))) continue;
    marked.add(id);
    if (wrongName) marked.add(wrongName);
    out.push(c);
  }
  return out;
}

/**
 * The text with a mark after the first occurrence of every SAP identifier in
 * it, and after every later one under another wrong name (`occurrencesToMark`):
 * `F2358 [name does not match SAP's (SAP: F2358 is “Monitor Purchase Order
 * Items”, SAP KBA 3696098)]`. Plain text in, plain text out — the markdown
 * exports and the HTML exports (escaped after this) both read it.
 */
export function annotateSapReferences(text: unknown): string {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  if (!text) return text;
  let out = '';
  let pos = 0;
  for (const c of occurrencesToMark(findSapIdentifiers(text))) {
    const end = c.index + c.length;
    out += text.slice(pos, end) + ` [${sapIdMark(c)}]`;
    pos = end;
  }
  return out + text.slice(pos);
}

/**
 * The SAP identifiers of a whole document as a markdown section — ID, kind,
 * state, SAP's name and the source with its address. Empty when there are none.
 */
export function sapReferenceAppendixMarkdown(...texts: unknown[]): string {
  const checks = checkSapReferences(...texts);
  if (!checks.length) return '';
  let md = `## SAP identifiers named in this document\n`;
  md += `Model proposal. Each identifier was checked against SAP data this product holds. "Verified" means SAP lists the identifier under that name — not that it covers this use.\n\n`;
  md += `| Identifier | Kind | State | SAP's name | Source |\n| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const c of checks) {
    const src = c.source ? (c.source.url ? `[${c.source.label}](${c.source.url})` : c.source.label) : '—';
    const state = SAP_ID_STATUS_WORD[c.status] + (c.status === 'mismatch' && c.modelName ? ` (model wrote “${c.modelName}”)` : '');
    md += `| \`${c.id}\` | ${SAP_ID_KIND_LABEL[c.kind]} | ${state} | ${c.sapName ?? (c.status === 'verified' ? c.id : '—')}${c.caveat ? ` — ${c.caveat}` : ''} | ${src} |\n`;
  }
  return md + '\n';
}

// ── A mapping of a legacy table to an API ──────────────────────────────────

/**
 * What this product's own SAP API catalog says about a legacy object the model
 * mapped to an API: null when the catalog has no entry for the object or names
 * the same successor; otherwise the sentence that says what it names instead.
 */
export function catalogNoteForMapping(legacy: string | null | undefined, ...modelApis: Array<string | null | undefined>): string | null {
  if (!legacy) return null;
  const entry = SAP_API_CATALOG[legacy.trim().toUpperCase()];
  if (!entry) return null;
  const named = modelApis.filter(Boolean).map((s) => String(s).toUpperCase());
  // The successor as a whole identifier: NOT_API_X does not name API_X (QA c9c5b3463951).
  const view = entry.view.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = new RegExp(`(?:^|[^A-Z0-9_])${view}(?![A-Z0-9_])`);
  if (named.some((n) => whole.test(n))) return null;
  return `This product's SAP API catalog (${SAP_API_CATALOG_VERSION}) names ${entry.view} (${entry.type}) as the successor of ${legacy.trim().toUpperCase()}, not the API proposed here.`;
}

// ── Claims of coverage ─────────────────────────────────────────────────────

const OVERCLAIM = [
  /\bfull(?:y)?\s+(?:standard\s+)?(?:coverage|covered|covers?)\b/i,
  /\bcomplete(?:ly)?\s+(?:standard\s+)?(?:coverage|covered|covers?)\b/i,
  /\b100\s?%\s+(?:standard\s+)?(?:coverage|fit|covered)\b/i,
  /\bhigh\s+(?:standard\s+)?fit\b/i,
  /\bcovers?\s+all\s+(?:the\s+)?(?:functionality|functions|requirements|capabilities)\b/i,
  /\bno rewrite (?:is )?needed\b/i,
];

/** The phrases in a text that claim full standard coverage — every occurrence, not the first per pattern. */
export function coverageClaims(text: unknown): string[] {
  if (!text || typeof text !== 'string') return [];
  const out: string[] = [];
  for (const re of OVERCLAIM) {
    for (const m of text.matchAll(new RegExp(re.source, 'gi'))) out.push(m[0]);
  }
  return out;
}

/** Said beside a claim of full coverage or a "High" fit the model wrote. */
export const COVERAGE_CLAIM_NOTE =
  "The model's claim of full standard coverage is not backed by an evidence list here. Confirm the fit capability by capability before relying on it.";

// ── The prompt ─────────────────────────────────────────────────────────────

/**
 * The rules every prompt that lets the model name SAP objects carries. The
 * answer is checked by this module whatever the model does; the rules make a
 * wrong name rarer, the check makes it visible.
 */
export const SAP_REFERENCE_PROMPT_RULES = `SAP IDENTIFIERS — every SAP identifier you write is checked against SAP sources after you answer, and a wrong one is shown to the reader as wrong:
- Write a Fiori app ID (F followed by digits), an SAP Best Practices scope item, a communication scenario (SAP_COM_ followed by digits), an API, a BAdI or a transaction code ONLY when you are certain of it, and always together with SAP's exact name for it, e.g. "F0380 (Process Collections Worklist)".
- When you are not certain, describe the capability in words without an ID, or write the ID followed by "(verify)".
- A communication scenario is not an API: never give a SAP_COM_ ID where an API is asked for.
- Never present one API as a general replacement for several tables without saying what it does not cover (for example entry view versus ledger view, or a restriction of the edition).
- Never claim "full coverage", "fully covers", "covers all functionality" or a "High" fit unless you list, capability by capability, the standard function that covers each one. Otherwise say which capabilities are unconfirmed.`;

/** The comparison every recommendation of a route carries (review 6.3). */
export const OPTION_COMPARISON_RULE = `Compare the options before you recommend one — adopt the SAP standard and retire the custom code; adapt the existing logic; an in-app RAP extension; a side-by-side CAP application. State the reason for the option you recommend over the others, and what is not known that could change it (target release, usage, volumes, external users, cost data). Do not assume the standard covers everything, and do not assume CAP is better.`;
