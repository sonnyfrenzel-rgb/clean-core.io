import { SAP_API_CATALOG, SAP_API_CATALOG_STAMP, SAP_API_CATALOG_VERSION } from './abap/sap-api-catalog';
import { SAP_SCOPE_ITEMS } from './sap-scope-items';
import { CURATED_SCENARIO_LIST, CURATED_SCOPE_ITEM_LIST } from './sap-curated-lists';
import {
  SAP_IDENTIFIERS_CHECKED,
  SAP_RELEASED_LIST_URL,
  identifierSyncDate,
  isClassicBapi,
  nameListStamp,
  releasedCdsList,
  releasedListsStamp,
  sapIdentifierIndex,
  sapNameListsLoaded,
  sapNameListsVersion,
  syncedSapIdentifiers,
  type ReleaseSpan,
  type SapProtocol,
} from './sap-identifiers';

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
 * one of four states:
 *
 *   - `verified`   — a public SAP page we hold states the ID, and what the model
 *                    wrote beside it agrees with it: the title (where it gave
 *                    one), the protocol of an API, the release (where it named
 *                    one);
 *   - `mismatch`   — we hold the ID from a public SAP page, and the model's
 *                    title, protocol or release contradicts SAP's (F1814 called
 *                    "Manage Sales Orders", an OData V4 pattern for a V2 API,
 *                    F3338A on a release before 2025); the reader sees SAP's
 *                    fact, never the model's as fact;
 *   - `catalog`    — "name found in catalog": the name stands in a list and
 *                    nothing more is known — SAP's released-object list (the
 *                    Cloudification Repository) or this product's own 2024
 *                    catalog, each shown with its date. Until 3.0.12 such a hit
 *                    printed "verified" (SD review CC-R29/R30, PP review F10);
 *   - `unverified` — anything else: an ID we hold nothing for, or a known ID
 *                    the model wrote without a name (then SAP's name is shown
 *                    beside it, and it is still "check before use").
 *
 * "Verified" says the identifier and what the model said of it are SAP's. It
 * never says the SAP object covers the use the model put it to — a name hit is
 * not functional equivalence (review F-03, "Soll").
 *
 * Pure: no React, no server-only imports, so the client stages and the
 * markdown/HTML exports read the same answer. The data is
 *
 *   1. `CURATED_SAP_IDS` below — only entries whose SAP source is named on the
 *      entry. No entry goes in without one.
 *   2. `lib/sap-identifiers.ts` (3.0.12) — curated identifiers with a public
 *      SAP page each, over the weekly synced `lib/abap/generated/sap-identifiers.json`
 *      (communication scenarios from SAP's documentation on GitHub, CC BY 4.0,
 *      each with its product and attribution; an ID named there without a
 *      title is `catalog`), and SAP's released CDS views (names only: `catalog`).
 *   2a. The owner's hand-curated lists (`lib/sap-curated-lists.ts`): under
 *      every SAP source, over our own catalog.
 *
 * Precedence, highest first: a SAP page held by hand (`CURATED_SAP_IDS`,
 * `CURATED_SAP_IDENTIFIERS`) > SAP documentation on GitHub (synced, with its
 * source) > a curated list > this product's catalog. Where SAP's GitHub
 * documentation names an ID without a title and a curated list holds a title
 * for it, the list stands: a name to compare is worth more than a bare ID.
 *   2b. The successors of `lib/abap/sap-api-catalog.ts` — this product's own
 *      2024 catalog; a hit there is a name found in a catalog, shown with the
 *      catalog's release (`SAP_API_CATALOG_STAMP`).
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
  | 'function-module'
  | 'transaction';

export type SapIdStatus = 'verified' | 'mismatch' | 'catalog' | 'unverified';

/** What a mismatch is about. */
export type SapIdMismatch = 'name' | 'protocol' | 'release';

/**
 * Where the data for an ID comes from: a public SAP page, SAP's released-object
 * list, a hand-curated list (`lib/sap-curated-lists.ts`), or our own catalog.
 */
type KnownOrigin = 'public' | 'sap-docs' | 'released-list' | 'curated-list' | 'product-catalog';

/** A different title another SAP source gives for the same ID — said beside the one shown, never over it. */
export interface SapOtherTitle {
  title: string;
  /** The product that source documents. */
  product: string | null;
  source: SapSource;
  attribution: string | null;
}

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
  /** SAP's title of an API, CDS view or function module: shown, never compared. */
  title?: string;
  /** OData protocol, where the source states it. */
  protocol?: SapProtocol;
  /** On-premise release span, where the source states one. */
  onPremise?: ReleaseSpan;
  /** The source's own words on release or edition. */
  release?: string;
  /** `public` when absent. */
  origin?: KnownOrigin;
  /** The product the source documents (SAP-docs entries): context, not a claim about other products. */
  product?: string;
  /** The attribution the source's licence asks for (CC BY 4.0). */
  attribution?: string;
  otherTitle?: SapOtherTitle;
  /** The source names the ID without a title. */
  listedOnly?: boolean;
}

/** The review's primary sources (the FI review, §10, retrieved 11.10.2026). */
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
  label: SAP_API_CATALOG_STAMP,
  url: null,
};

/** The source of a name found in one of SAP's synced lists. */
function releasedListSource(name: string): SapSource {
  return { label: nameListStamp(releasedCdsList(name) ?? 'cds-public'), url: SAP_RELEASED_LIST_URL };
}

const CLASSIC_BAPI_CAVEAT = 'SAP classifies it as a classic API: documented, but not released for ABAP Cloud';

/** Kinds whose technical name is the name: a title beside them is not compared. */
const TECHNICAL_KINDS = new Set<SapIdKind>(['api', 'cds-view', 'function-module']);

interface KnownTables {
  version: number;
  known: Map<string, KnownSapId>;
  scopeItems: string[];
  anywhere: Array<{ id: string; kind: SapIdKind }>;
}

let tables: KnownTables | null = null;

/**
 * Every ID we hold data for, by upper-case ID: our own catalog first, a public
 * SAP page over it, the review's sources above over everything. Rebuilt when
 * the synced lists arrive (`loadSapNameLists`).
 */
function knownTables(): KnownTables {
  const v = sapNameListsVersion();
  if (tables && tables.version === v) return tables;
  const map = new Map<string, KnownSapId>();
  for (const entry of Object.values(SAP_API_CATALOG)) {
    const id = entry.view;
    if (map.has(id.toUpperCase())) continue;
    const kind: SapIdKind | null = entry.type === 'OData API' ? 'api' : entry.type === 'CDS View' ? 'cds-view' : null;
    if (!kind) continue;
    // A view SAP lists as released is a hit in SAP's list, not only in ours.
    const inSapList = kind === 'cds-view' && releasedCdsList(id) !== null;
    map.set(id.toUpperCase(), {
      id,
      kind,
      name: null,
      source: inSapList ? releasedListSource(id) : CATALOG_SOURCE,
      origin: inSapList ? 'released-list' : 'product-catalog',
    });
  }
  // The hand-curated lists: over our own catalog, under every SAP page.
  for (const list of [CURATED_SCOPE_ITEM_LIST, CURATED_SCENARIO_LIST]) {
    const kind: SapIdKind = list === CURATED_SCOPE_ITEM_LIST ? 'scope-item' : 'communication-scenario';
    for (const e of list.entries) {
      map.set(e.id.toUpperCase(), {
        id: e.id,
        kind,
        name: e.title,
        source: { label: list.label, url: null },
        ...(e.deprecated ? { caveat: 'the list marks it deprecated' } : {}),
        origin: 'curated-list',
      });
    }
  }
  for (const e of sapIdentifierIndex().values()) {
    const key = e.id.toUpperCase();
    // A bare ID from SAP's GitHub documentation does not displace a curated list's title.
    if (e.synced && e.listedOnly && map.get(key)?.origin === 'curated-list') continue;
    const technical = TECHNICAL_KINDS.has(e.kind);
    map.set(key, {
      id: e.id,
      kind: e.kind,
      name: technical ? null : e.title,
      ...(technical && e.title ? { title: e.title } : {}),
      source: { ...e.source },
      ...(e.protocol ? { protocol: e.protocol } : {}),
      ...(e.onPremise ? { onPremise: e.onPremise } : {}),
      ...(e.release ? { release: e.release } : {}),
      ...(e.kind === 'function-module' && isClassicBapi(e.id) ? { caveat: CLASSIC_BAPI_CAVEAT } : {}),
      ...(e.synced ? { product: e.product, attribution: e.attribution, listedOnly: e.listedOnly === true } : {}),
      ...(e.otherTitle
        ? { otherTitle: { title: e.otherTitle.title, product: e.otherTitle.product, source: { ...e.otherTitle.source }, attribution: e.otherTitle.attribution ?? null } }
        : {}),
      origin: e.synced ? 'sap-docs' : 'public',
    });
  }
  for (const entry of CURATED_SAP_IDS) {
    const key = entry.id.toUpperCase();
    const before = map.get(key);
    // A page held by hand: its facts only. The synced fields of SAP's GitHub
    // documentation are never spread under it; a title that differs from the
    // row's own is said beside it.
    const synced = before?.origin === 'sap-docs' ? before : null;
    const otherTitle: SapOtherTitle | undefined =
      synced && synced.name && entry.name && !namesAgree(synced.name, entry.name)
        ? { title: synced.name, product: synced.product ?? null, source: synced.source, attribution: synced.attribution ?? null }
        : before?.origin === 'public'
          ? before.otherTitle
          : undefined;
    map.set(key, { ...(before?.origin === 'public' ? before : {}), ...entry, ...(otherTitle ? { otherTitle } : {}), origin: 'public' });
  }
  const all = [...map.values()];
  tables = {
    version: v,
    known: map,
    scopeItems: all.filter((e) => e.kind === 'scope-item').map((e) => e.id),
    // Transactions and function modules we hold a page for are found wherever they stand.
    anywhere: all.filter((e) => e.kind === 'transaction' || e.kind === 'function-module').map((e) => ({ id: e.id, kind: e.kind })),
  };
  return tables;
}

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
  /** For a mismatch: what contradicts SAP's — the name, the protocol or the release. */
  mismatchOn: SapIdMismatch | null;
  /** The protocol the model gave an API (`V2`, `V4`), when it gave one. */
  modelProtocol: SapProtocol | null;
  /** SAP's protocol for it, when the source states one. */
  sapProtocol: SapProtocol | null;
  /** The release the model tied the ID to, when it named one. */
  modelRelease: string | null;
  /** What SAP's source says about release or edition. */
  sapRelease: string | null;
  /** SAP's title of an API, CDS view or function module, shown beside it. */
  sapTitle: string | null;
  /** The ID and its name come from a hand-curated list, not a SAP page (`lib/sap-curated-lists.ts`). */
  curatedList?: true;
  /** The facts come from SAP's documentation on GitHub (synced weekly, CC BY 4.0). */
  sapDocs?: true;
  /** The product the source documents, for an entry from SAP's GitHub documentation. */
  product?: string;
  /** The attribution the source's licence asks for, wherever its facts are shown. */
  attribution?: string;
  /** Another SAP source titles the ID differently: a flagged caveat beside SAP's name. */
  otherTitle?: SapOtherTitle;
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
  'function-module': 'Function module',
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

  add(/\bSAP_COM_[0-9][0-9A-Z]{3}\b/g, 'communication-scenario');
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
  // BAPIs wherever they stand; another function module where the text says it is one.
  add(/\bBAPI_[A-Z0-9_]*[A-Z0-9]\b/g, 'function-module');
  add(/\bfunction\s+modules?\s*:?\s*([A-Z][A-Z0-9_]*_[A-Z0-9_]*[A-Z0-9])\b/g, 'function-module', 1);
  // Transactions and function modules SAP's pages name, wherever they stand (VA02, GUI_DOWNLOAD).
  for (const known of knownTables().anywhere) {
    for (const m of text.matchAll(new RegExp(`(?<![A-Za-z0-9_/-])${known.id}(?![A-Za-z0-9_/-])`, 'g'))) {
      pushIfFree(hits, { id: known.id, kind: known.kind, index: m.index ?? 0, length: known.id.length });
    }
  }

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
  for (const id of knownTables().scopeItems) {
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
const ID_LIKE = /^(?:SAP_COM_[0-9][0-9A-Z]{3}|API_\w+|A_\w+|I_\w+|F\d{3,5}[A-Z]?|[0-9A-Z]{2,3})$/;

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
  // Whole words only: "Sales Order" (F1814) is not inside "Manage Sales Orders" (F1873).
  if (short.split(' ').length >= 2 && ` ${long} `.includes(` ${short} `)) return true;
  // The same words in another order: "Sales Order Change" for "Change sales order".
  const words = (s: string) => s.split(' ').filter((w) => w.length > 1);
  const longWords = new Set(words(long));
  const shortWords = words(short);
  return shortWords.length >= 2 && shortWords.length === longWords.size && shortWords.every((w) => longWords.has(w));
}

// ── Protocol and release the model tied to an ID ───────────────────────────

/** The OData protocol written right next to an ID: "OData V4", "(V2)", "OData version 4". */
export function modelProtocolNear(text: string, index: number, length: number): SapProtocol | null {
  // After the ID: up to the end of the clause or the next identifier, whichever comes first.
  const nextId = /\b(?:API_|A_[A-Z]|I_[A-Z]|SAP_COM_|F\d{4})/;
  let after = text.slice(index + length, index + length + 60).split(/[.;\n]/)[0];
  const cut = nextId.exec(after);
  if (cut) after = after.slice(0, cut.index);
  const inAfter = /\bOData\s*(?:v(?:ersion)?\s*)?([24])(?:\.0)?\b|(?:^|[\s(,])V([24])\b/i.exec(after);
  if (inAfter) return (`V${inAfter[1] ?? inAfter[2]}`) as SapProtocol;
  // Before the ID only when it qualifies this ID directly: "the OData V4 service API_X".
  const before = text.slice(Math.max(0, index - 40), index);
  const inBefore = /\bOData\s*(?:v(?:ersion)?\s*)?([24])(?:\.0)?\s+(?:(?:A2X\s+)?(?:API|service|interface)\s+)?$/i.exec(before);
  return inBefore ? (`V${inBefore[1]}`) as SapProtocol : null;
}

/** An on-premise release written in the same sentence: "S/4HANA 2023", "release 1909". */
export function modelReleaseNear(text: string, index: number): string | null {
  const sentence = sentenceAround(text, index);
  const m = /\b(?:S\/4\s?HANA|release|on[- ]premise|private (?:cloud|edition))\b[^.\n]{0,40}?\b(20[12]\d|1[5-9](?:0[1-9]|1[0-2]))\b/i.exec(sentence);
  return m ? m[1] : null;
}

/** A release as an ordered number: 1909 → 2019.09, 2020 → 2020.10 (SAP ships the yearly release in autumn). */
function releaseKey(release: number | string): number {
  const n = Number(release);
  if (n >= 1500 && n < 2000) return 2000 + Math.floor(n / 100) + (n % 100) / 100;
  return n + 0.1;
}

function releaseInSpan(release: string, span: ReleaseSpan): boolean {
  const k = releaseKey(release);
  if (span.from !== undefined && k < releaseKey(span.from)) return false;
  if (span.until !== undefined && k > releaseKey(span.until)) return false;
  return true;
}

// ── Classification ─────────────────────────────────────────────────────────

function knownFor(hit: RawHit): KnownSapId | null {
  const known = knownTables().known.get(hit.id.toUpperCase());
  if (known) return known;
  // Any CDS view SAP lists as released: a name found in SAP's list.
  if (hit.kind === 'cds-view' && releasedCdsList(hit.id) !== null) {
    return { id: hit.id, kind: 'cds-view', name: null, source: releasedListSource(hit.id), origin: 'released-list' };
  }
  if (hit.kind === 'function-module' && isClassicBapi(hit.id)) {
    return {
      id: hit.id,
      kind: 'function-module',
      name: null,
      source: { label: nameListStamp('bapi-classic'), url: SAP_RELEASED_LIST_URL },
      caveat: CLASSIC_BAPI_CAVEAT,
      origin: 'released-list',
    };
  }
  return null;
}

function classify(text: string, hit: RawHit): SapIdCheck {
  const known = knownFor(hit);
  const kind = known?.kind ?? hit.kind;
  const modelName = modelNameNear(text, hit.index, hit.length);
  const modelProtocol = kind === 'api' ? modelProtocolNear(text, hit.index, hit.length) : null;
  const modelRelease = modelReleaseNear(text, hit.index);
  const base = {
    id: hit.id,
    kind,
    modelName,
    sapName: known?.name ?? null,
    source: known?.source ?? null,
    caveat: known?.caveat ?? null,
    mismatchOn: null as SapIdMismatch | null,
    modelProtocol,
    sapProtocol: known?.protocol ?? null,
    modelRelease,
    sapRelease: known?.release ?? null,
    sapTitle: known?.title ?? null,
    ...(known?.origin === 'curated-list' ? { curatedList: true as const } : {}),
    ...(known?.origin === 'sap-docs' ? { sapDocs: true as const } : {}),
    ...(known?.product ? { product: known.product } : {}),
    ...(known?.attribution ? { attribution: known.attribution } : {}),
    ...(known?.otherTitle ? { otherTitle: known.otherTitle } : {}),
    index: hit.index,
    length: hit.length,
  };
  if (!known) return { ...base, status: 'unverified' };
  // A name in a list — SAP's released objects or our own catalog — is only that.
  if (known.origin === 'released-list' || known.origin === 'product-catalog') return { ...base, status: 'catalog' };
  // A hand-curated list holds the name, not a page: a name it contradicts is a
  // mismatch, anything else is a name found in a list — never "verified".
  if (known.origin === 'curated-list') {
    if (modelName && known.name && !namesAgree(modelName, known.name)) return { ...base, status: 'mismatch', mismatchOn: 'name' };
    return { ...base, status: 'catalog' };
  }
  // SAP's GitHub documentation names the ID without a title: a name found in a list.
  if (known.origin === 'sap-docs' && known.listedOnly && !TECHNICAL_KINDS.has(known.kind)) return { ...base, status: 'catalog' };
  // What the source states and the model contradicts: the protocol, then the release.
  if (modelProtocol && known.protocol && modelProtocol !== known.protocol) {
    return { ...base, status: 'mismatch', mismatchOn: 'protocol' };
  }
  if (modelRelease && known.onPremise && !releaseInSpan(modelRelease, known.onPremise)) {
    return { ...base, status: 'mismatch', mismatchOn: 'release' };
  }
  // The technical name is the name: holding the ID from SAP's page is holding the name.
  if (known.name === null) return { ...base, status: 'verified' };
  if (modelName && namesAgree(modelName, known.name)) return { ...base, status: 'verified' };
  if (modelName) return { ...base, status: 'mismatch', mismatchOn: 'name' };
  // A transaction code written alone claims no meaning: it is SAP's, and SAP's meaning stands beside it (SD review CC-R30).
  if (known.kind === 'transaction') return { ...base, status: 'verified' };
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

const RANK: Record<SapIdStatus, number> = { mismatch: 4, unverified: 3, catalog: 2, verified: 1 };

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
  catalog: 'name found in catalog',
  unverified: 'not verified — check before use',
});

const MISMATCH_WORD: Readonly<Record<SapIdMismatch, string>> = Object.freeze({
  name: "name does not match SAP's",
  protocol: "protocol does not match SAP's",
  release: "release does not match SAP's",
});

/** The state in words, a mismatch said by what it is about. */
export function sapIdStateWord(check: SapIdCheck): string {
  if (check.curatedList && check.status === 'mismatch') return 'name does not match the curated list';
  if (check.curatedList && check.status === 'catalog') return 'name found in curated list';
  return check.status === 'mismatch' && check.mismatchOn ? MISMATCH_WORD[check.mismatchOn] : SAP_ID_STATUS_WORD[check.status];
}

const PROTOCOL_WORD: Readonly<Record<SapProtocol, string>> = Object.freeze({ V2: 'OData V2', V4: 'OData V4', REST: 'REST', SOAP: 'SOAP' });

/** The mark after an ID, in plain text: the same words in the UI, the markdown and the HTML exports. */
export function sapIdMark(check: SapIdCheck): string {
  return sapIdMarkCore(check) + sapIdMarkTail(check);
}

/** What follows the mark of an entry from SAP's GitHub documentation, or one with a second SAP title: the conflict, then the licence. */
function sapIdMarkTail(check: SapIdCheck): string {
  const o = check.otherTitle;
  const other = o
    ? `; sources differ: ${o.source.label}${o.product ? ` (${o.product})` : ''} titles it “${o.title}”${o.attribution && !check.attribution ? ` — ${SAP_DOCS_LICENCE_SHORT}` : ''}`
    : '';
  const licence = check.attribution ? `; ${SAP_DOCS_LICENCE_SHORT}` : '';
  return other + licence;
}

/** The short form of the CC BY 4.0 attribution inside a mark; the full one stands in the document's attribution section. */
export const SAP_DOCS_LICENCE_SHORT = '© SAP SE and contributors, CC BY 4.0, adapted';

/** " (documented for SAP S/4HANA Cloud)" — the product an entry from SAP's GitHub documentation belongs to. */
const productWords = (check: SapIdCheck) => (check.product ? ` (documented for ${check.product})` : '');

function sapIdMarkCore(check: SapIdCheck): string {
  const src = check.source ? check.source.label : '';
  const caveat = check.caveat ? `; SAP restriction: ${check.caveat}` : '';
  const facts = [
    check.sapTitle ? `“${check.sapTitle}”` : '',
    check.sapProtocol ? PROTOCOL_WORD[check.sapProtocol] : '',
    check.sapRelease ?? '',
  ].filter(Boolean).join(', ');
  if (check.status === 'verified') {
    if (check.sapName) return `verified: SAP lists ${check.id} as “${check.sapName}”${check.sapRelease ? ` (${check.sapRelease})` : ''}${productWords(check)}, ${src}${caveat}`;
    return facts
      ? `verified: SAP lists ${check.id} — ${facts}, ${src}${caveat}`
      : `verified: ${check.id} is in ${src}${caveat}`;
  }
  if (check.status === 'catalog' && check.curatedList) {
    return `name found in curated list: ${check.id} is “${check.sapName}” in the ${src} — not checked against a SAP page; check before use${caveat}`;
  }
  if (check.status === 'catalog' && check.sapDocs) {
    return `name found in catalog: SAP's documentation names ${check.id}${productWords(check)} without a title, ${src} — check before use${caveat}`;
  }
  if (check.status === 'catalog') {
    return check.source?.url
      ? `name found in catalog: ${check.id} is in ${src} — the name only, not checked against a page that describes it${caveat}`
      : `name found in catalog: ${check.id} is in ${src} — not in SAP's released-object list here; check before use${caveat}`;
  }
  if (check.status === 'mismatch') {
    if (check.mismatchOn === 'protocol') {
      return `protocol does not match SAP's (the text says ${PROTOCOL_WORD[check.modelProtocol!]}; SAP: ${check.id} is ${PROTOCOL_WORD[check.sapProtocol!]}, ${src})${caveat}`;
    }
    if (check.mismatchOn === 'release') {
      return `release does not match SAP's (the text names release ${check.modelRelease}; SAP: ${check.id}${check.sapName ? ` “${check.sapName}”` : ''} — ${check.sapRelease ?? 'another release'}, ${src})${caveat}`;
    }
    if (check.curatedList) return `name does not match the curated list (the ${src} gives ${check.id} as “${check.sapName}”)${caveat}`;
    return `name does not match SAP's (SAP: ${check.id} is “${check.sapName}”${productWords(check)}, ${src})${caveat}`;
  }
  return check.sapName
    ? `not verified — SAP lists ${check.id} as “${check.sapName}”${productWords(check)}, ${src}; check before use${caveat}`
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
  return annotateInto(text, null);
}

function annotateInto(text: unknown, sink: Set<string> | null): string {
  if (typeof text !== 'string') return text == null ? '' : String(text);
  if (!text) return text;
  let out = '';
  let pos = 0;
  for (const c of occurrencesToMark(findSapIdentifiers(text))) {
    const end = c.index + c.length;
    out += text.slice(pos, end) + ` [${sapIdMark(c)}]`;
    if (sink) for (const a of attributionsOf(c)) sink.add(a);
    pos = end;
  }
  return out + text.slice(pos);
}

/** The full attributions behind one check: its own source and the source of a differing title. */
function attributionsOf(c: SapIdCheck): string[] {
  return [c.attribution, c.otherTitle?.attribution].filter((a): a is string => !!a);
}

/**
 * "SAP-docs/<repo>/<path>@<commit, 8 characters>" for an address of SAP's
 * documentation on GitHub read at a commit; null for any other address.
 */
export function sapDocsSourceShort(url: string | null | undefined): string | null {
  const m = /^https:\/\/github\.com\/SAP-docs\/([^/]+)\/blob\/([0-9a-f]{7,40})\/(.+)$/i.exec(url ?? '');
  return m ? `SAP-docs/${m[1]}/${m[3]}@${m[2].slice(0, 8)}` : null;
}

/** One attributed source behind a check: its document at its commit, the licence, and the full attribution. */
export interface SapIdCitation {
  url: string | null;
  /** The document and commit in short (`sapDocsSourceShort`), else null. */
  short: string | null;
  ccBy: boolean;
  attribution: string;
}

/**
 * The attributed sources behind one check — its own and that of a differing
 * title — for an inline mark: CC BY 4.0 asks for the source wherever the fact
 * stands, not only in a list further down (QA bdf1b45234a6).
 */
export function sapIdCitations(c: SapIdCheck): SapIdCitation[] {
  const out: SapIdCitation[] = [];
  const add = (attribution: string | null | undefined, url: string | null | undefined) => {
    if (!attribution) return;
    out.push({ url: url ?? null, short: sapDocsSourceShort(url), ccBy: /CC BY 4\.0/.test(attribution), attribution });
  };
  add(c.attribution, c.source?.url);
  add(c.otherTitle?.attribution, c.otherTitle?.source.url);
  return out;
}

/** The heading and lead of the attribution section, the same in markdown and HTML. */
export const SAP_DOCS_ATTRIBUTION_HEADING = 'Attribution';
export const SAP_DOCS_ATTRIBUTION_LEAD =
  'Some SAP identifier facts in this document (IDs and titles of communication scenarios) were extracted from SAP documentation published on GitHub under the Creative Commons Attribution 4.0 International licence (https://creativecommons.org/licenses/by/4.0/). The sources, at the commit they were read:';

/**
 * For an export that marks several texts one at a time (the HTML exports): the
 * marks, and afterwards the full attributions every mark it wrote needs.
 */
export function sapReferenceAnnotator(): { annotate: (text: unknown) => string; attributions: () => string[] } {
  const sink = new Set<string>();
  return { annotate: (text: unknown) => annotateInto(text, sink), attributions: () => [...sink].sort() };
}

/** The full attributions the SAP identifiers of these texts need, one per source document. */
export function sapReferenceAttributions(...texts: unknown[]): string[] {
  const out = new Set<string>();
  for (const c of checkSapReferences(...texts)) for (const a of attributionsOf(c)) out.add(a);
  return [...out].sort();
}

/**
 * Which data the check read, with its dates — said under every list of checked
 * identifiers, so a 2024 catalog never reads as current (SD review CC-R29).
 */
export function sapIdentifierSourcesNote(): string {
  const sync = identifierSyncDate();
  const docs = syncedSapIdentifiers().documents.filter((d) => d.count > 0);
  const repos = [...new Set(docs.map((d) => d.repo))];
  return [
    `Checked against: curated SAP identifiers (public SAP pages, checked ${SAP_IDENTIFIERS_CHECKED})`,
    ...(docs.length
      ? [`SAP documentation on GitHub (${repos.join(', ')}; CC BY 4.0): communication scenarios from ${docs.length} document${docs.length === 1 ? '' : 's'}${sync ? `, weekly sync of ${sync}` : ''}`]
      : []),
    `the curated scope-item and scenario lists (${CURATED_SCOPE_ITEM_LIST.checked})`,
    sapNameListsLoaded() ? `${releasedListsStamp()}${sync ? ` (weekly sync of ${sync})` : ''}` : releasedListsStamp(),
    SAP_API_CATALOG_STAMP,
  ].join('; ') + '.';
}

/**
 * Whether the target release or edition of an identifier was checked — the
 * last column of the identifier table (SD review 3.0.12, 2.5: a compact
 * candidate matrix instead of long warnings inside sentences). Only what the
 * source states counts: a release SAP's source gives, or the product it
 * documents; otherwise "not checked".
 */
export function releaseCheckedWords(c: SapIdCheck): string {
  if (c.sapRelease) return `release stated by the source: ${c.sapRelease}`;
  if (c.product) return `edition stated by the source: ${c.product}; release not checked`;
  return 'not checked';
}

/**
 * The SAP identifiers of a whole document as a markdown section — ID, kind,
 * state, SAP's name and the source with its address. Empty when there are none.
 */
export function sapReferenceAppendixMarkdown(...texts: unknown[]): string {
  const checks = checkSapReferences(...texts);
  if (!checks.length) return '';
  let md = `## SAP identifiers named in this document\n`;
  md += `Model proposal. Each identifier was checked against SAP data this product holds. "Verified" means a public SAP page lists the identifier with what the text says of it (title, protocol, release) — not that it covers this use. "Name found in catalog" means the name is in a list and nothing more was checked.\n\n`;
  md += `| Identifier | Kind | State | SAP's name | Source | Release / edition checked |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  for (const c of checks) {
    const src = c.source ? (c.source.url ? `[${c.source.label}](${c.source.url})` : c.source.label) : '—';
    const said =
      c.status !== 'mismatch' ? '' :
      c.mismatchOn === 'protocol' && c.modelProtocol ? ` (text says ${PROTOCOL_WORD[c.modelProtocol]})` :
      c.mismatchOn === 'release' && c.modelRelease ? ` (text names release ${c.modelRelease})` :
      c.modelName ? ` (model wrote “${c.modelName}”)` : '';
    const name = c.sapName ?? c.sapTitle ?? (c.status === 'verified' || c.status === 'catalog' ? c.id : '—');
    const facts = [c.sapProtocol ? PROTOCOL_WORD[c.sapProtocol] : '', c.sapRelease ?? '', c.product ? `documented for ${c.product}` : '']
      .filter(Boolean)
      .join('; ');
    const o = c.otherTitle;
    const other = o
      ? ` — sources differ: ${o.source.url ? `[${o.source.label}](${o.source.url})` : o.source.label}${o.product ? ` (${o.product})` : ''} titles it “${o.title}”`
      : '';
    md += `| \`${c.id}\` | ${SAP_ID_KIND_LABEL[c.kind]} | ${sapIdStateWord(c)}${said} | ${name}${facts ? ` (${facts})` : ''}${c.caveat ? ` — ${c.caveat}` : ''}${other} | ${src}${c.attribution ? ` (${SAP_DOCS_LICENCE_SHORT})` : ''} | ${releaseCheckedWords(c)} |\n`;
  }
  md += `\n${sapIdentifierSourcesNote()}\n`;
  const attributions = [...new Set(checks.flatMap(attributionsOf))].sort();
  if (attributions.length) {
    md += `\n### ${SAP_DOCS_ATTRIBUTION_HEADING}\n${SAP_DOCS_ATTRIBUTION_LEAD}\n\n${attributions.map((a) => `- ${a}`).join('\n')}\n`;
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

/**
 * The attribution section of an HTML export, from the lines a
 * `sapReferenceAnnotator` collected; empty when no mark came from a CC BY
 * source. `esc` is the export's own HTML escaper.
 */
export function sapAttributionHtml(lines: readonly string[], esc: (s: string) => string): string {
  if (!lines.length) return '';
  return `<h2 data-sap-attribution="">${esc(SAP_DOCS_ATTRIBUTION_HEADING)}</h2><p class="muted">${esc(SAP_DOCS_ATTRIBUTION_LEAD)}</p><ul class="muted">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}
