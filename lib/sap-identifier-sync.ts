/**
 * The pure half of `scripts/sync-sap-identifiers.ts` (owner, 12.10.2026): the
 * shape of `lib/abap/generated/sap-identifiers.json`, the sources and what
 * their terms allow, the rule that a partial fetch never replaces a complete
 * one, the summary of what changed, and the polite fetcher. Nothing here runs
 * on import — the script calls it, and the specs read it without a network.
 *
 * Only facts are stored: names of SAP objects, their kind and the release the
 * source states, with the address and fetch time of the list they came from.
 * No descriptions, no text beyond a name.
 *
 * Which sources are synced, and why only these (checked 12.10.2026):
 *
 *   - SAP Cloudification Repository, github.com/SAP/abap-atc-cr-cv-s4hc —
 *     Apache License 2.0, read through raw.githubusercontent.com like the
 *     catalog sync already does. Synced.
 *   - SAP Help Portal (help.sap.com, incl. /http.svc), SAP Business Accelerator
 *     Hub (api.sap.com, incl. /odata/1.0/catalog.svc) and the SAP Fiori apps
 *     reference library — governed by SAP's "Terms of Use for SAP Websites"
 *     (https://www.sap.com/about/legal/terms-of-use.html, revised 26.02.2026),
 *     §4: "Automated extraction, copying, or indexing is not allowed without
 *     explicit permission and except for standard web searches", and the
 *     robots.txt of help.sap.com and api.sap.com disallow every agent they do
 *     not name. Not synced. Their facts live in the curated list
 *     (`lib/sap-identifiers.ts`), checked by hand, until SAP grants permission.
 */

import { scenarioIdsInContext, scenariosFromProse, scenariosFromTables } from './sap-docs-parse';

export type SyncedSapIdKind = 'fiori-app' | 'scope-item' | 'communication-scenario' | 'api' | 'cds-view';
export type SyncedProtocol = 'V2' | 'V4' | 'REST' | 'SOAP';

/**
 * One identifier as a source states it. A field the source does not state is
 * null (an empty list for `apiRefs`) — never derived, never guessed.
 */
export interface SyncedSapIdentifier {
  id: string;
  kind: SyncedSapIdKind;
  /** SAP's title as the source writes it, or null when the source names the ID alone. */
  title: string | null;
  /** The product the source documents: "SAP S/4HANA Cloud", "SAP BTP ABAP Environment". */
  product: string;
  edition: string | null;
  availableInRelease: string | null;
  protocol: SyncedProtocol | null;
  protocolVersion: string | null;
  apiVersion: string | null;
  /** APIs the source names beside this identifier (technical names). */
  apiRefs: string[];
  /** True only when the identifier's own text says it is deprecated; a deprecated service plan is not a deprecated scenario. */
  deprecated: boolean | null;
  source: { key: string; repo: string; path: string; url: string };
  /** SPDX identifier of the source's licence, as its REUSE.toml or LICENSE states it. */
  license: string;
  /** Git commit the file was read at. */
  sourceRevision: string;
  observedAt: string;
}

/** A title a synced source gives that differs from the curated one: flagged, never overwritten. */
export interface SapIdentifierConflict {
  id: string;
  curatedTitle: string;
  syncedTitle: string;
  product: string;
  url: string;
}

/** The name lists the sync keeps — each one from one public file. */
export type SapNameListKey = 'cds-public' | 'cds-private' | 'bapi-classic';

export interface SapNameList {
  key: SapNameListKey;
  /** What the names are, in words. */
  label: string;
  /** The release the source states for every name in the list. */
  release: string;
  /** The file the names were read from. */
  url: string;
  /** When that file was last read completely; every name in the list shares it. */
  fetchedAt: string | null;
  sourceSha256: string | null;
  count: number;
  /** `fetched` this run; `kept-previous` — the fetch failed or came back short, the last complete list stands. */
  status: 'fetched' | 'kept-previous' | 'not-synced';
  names: string[];
}

export interface SyncedSourceMeta {
  key: string;
  label: string;
  url: string;
  /** What the source's terms say about automated reading, in one line, with the address of the terms. */
  terms: string;
  synced: boolean;
}

export interface SapIdentifierSummary {
  byKind: Record<string, number>;
  byRelease: Record<string, number>;
  /** Names new since the previous file, capped. */
  added: string[];
  /** Names gone since the previous file, capped. */
  removed: string[];
  addedCount: number;
  removedCount: number;
}

export interface SapIdentifierFile {
  format: 2;
  syncedAt: string | null;
  /** Every source considered, synced or not, with the reason. */
  sources: SyncedSourceMeta[];
  lists: SapNameList[];
  /** Per-document sources (SAP-docs): when each was last read completely, at which commit. */
  documents: SapDocumentState[];
  entries: SyncedSapIdentifier[];
  conflicts: SapIdentifierConflict[];
  /** Attribution the licences of the synced sources require. */
  notice: string[];
  summary: SapIdentifierSummary;
}

export interface SapDocumentState {
  key: string;
  repo: string;
  path: string;
  product: string;
  license: string | null;
  sourceRevision: string | null;
  observedAt: string | null;
  count: number;
  status: 'fetched' | 'kept-previous' | 'not-synced';
}

export const EMPTY_SAP_IDENTIFIER_FILE: SapIdentifierFile = Object.freeze({
  format: 2,
  syncedAt: null,
  sources: [],
  lists: [],
  documents: [],
  entries: [],
  conflicts: [],
  notice: [],
  summary: { byKind: {}, byRelease: {}, added: [], removed: [], addedCount: 0, removedCount: 0 },
}) as SapIdentifierFile;

/* ------------------------------------------------ the sources */

const CR = 'https://raw.githubusercontent.com/SAP/abap-atc-cr-cv-s4hc/main/src';
const SAP_TERMS = 'https://www.sap.com/about/legal/terms-of-use.html';

export const SAP_IDENTIFIER_SOURCES: readonly SyncedSourceMeta[] = Object.freeze([
  {
    key: 'sap-cloudification-repository',
    label: 'SAP Cloudification Repository (github.com/SAP/abap-atc-cr-cv-s4hc)',
    url: 'https://github.com/SAP/abap-atc-cr-cv-s4hc',
    terms: 'Apache License 2.0 (https://github.com/SAP/abap-atc-cr-cv-s4hc/blob/main/LICENSE); read like the catalog sync does',
    synced: true,
  },
  {
    key: 'sap-help-portal',
    label: 'SAP Help Portal (help.sap.com)',
    url: 'https://help.sap.com',
    terms: `Not synced: SAP Terms of Use for SAP Websites §4 forbids automated extraction without explicit permission (${SAP_TERMS}); robots.txt disallows unnamed agents. Curated by hand.`,
    synced: false,
  },
  {
    key: 'sap-business-accelerator-hub',
    label: 'SAP Business Accelerator Hub (api.sap.com)',
    url: 'https://api.sap.com',
    terms: `Not synced: SAP Terms of Use for SAP Websites §4 (${SAP_TERMS}); robots.txt disallows unnamed agents. Curated by hand.`,
    synced: false,
  },
  {
    key: 'sap-fiori-apps-library',
    label: 'SAP Fiori apps reference library',
    url: 'https://fioriappslibrary.hana.ondemand.com',
    terms: `Not synced: SAP Terms of Use for SAP Websites §4 (${SAP_TERMS}); the new library (fal.cloud.sap) requires sign-in. Curated by hand.`,
    synced: false,
  },
] as SyncedSourceMeta[]);

/** The lists the sync fetches, with the fewest names a complete list has. */
export const SAP_NAME_LIST_SPECS: ReadonlyArray<{ key: SapNameListKey; label: string; release: string; url: string; minCount: number }> = Object.freeze([
  { key: 'cds-public', label: 'CDS views SAP has released', release: 'SAP S/4HANA Cloud Public Edition, latest', url: `${CR}/objectReleaseInfoLatest.json`, minCount: 5000 },
  { key: 'cds-private', label: 'CDS views SAP has released', release: 'SAP S/4HANA Cloud Private Edition, latest', url: `${CR}/objectReleaseInfo_PCELatest.json`, minCount: 5000 },
  { key: 'bapi-classic', label: 'BAPIs SAP classifies as classic APIs (not released for ABAP Cloud)', release: 'SAP object classifications', url: `${CR}/objectClassifications_SAP.json`, minCount: 1000 },
]);

/* ------------------------------------------------ reading the files */

interface ReleaseInfoFile {
  objectReleaseInfo?: Array<{ tadirObject?: string; tadirObjName?: string; objectType?: string; objectKey?: string; state?: string }>;
}

interface ClassificationFile {
  objectClassifications?: Array<{ tadirObject?: string; tadirObjName?: string; objectType?: string; objectKey?: string; state?: string }>;
}

/** The released CDS views (`I_…`, DDLS) of a release-info file — names upper-cased, sorted. */
export function releasedCdsNames(file: ReleaseInfoFile): string[] | null {
  if (!file || !Array.isArray(file.objectReleaseInfo)) return null;
  const names = new Set<string>();
  for (const o of file.objectReleaseInfo) {
    const type = String(o.tadirObject ?? o.objectType ?? '').toUpperCase();
    const name = String(o.tadirObjName ?? o.objectKey ?? '').toUpperCase();
    if (type === 'DDLS' && String(o.state ?? '').toLowerCase() === 'released' && /^I_[A-Z0-9_]+$/.test(name)) names.add(name);
  }
  return [...names].sort();
}

/** The BAPIs SAP classifies as classic APIs — names upper-cased, sorted. */
export function classicBapiNames(file: ClassificationFile): string[] | null {
  if (!file || !Array.isArray(file.objectClassifications)) return null;
  const names = new Set<string>();
  for (const o of file.objectClassifications) {
    // For function modules the module is the object key; the group is the TADIR name.
    const name = String(o.objectKey ?? o.tadirObjName ?? '').toUpperCase();
    const type = String(o.objectType ?? o.tadirObject ?? '').toUpperCase();
    if ((type === 'FUNC' || type === 'FUGR') && String(o.state ?? '') === 'classicAPI' && /^BAPI_[A-Z0-9_]+$/.test(name)) names.add(name);
  }
  return [...names].sort();
}

/* ------------------------------------------------ replace only if complete */

export interface ListResult {
  key: SapNameListKey;
  /** Null when the fetch or the parse failed. */
  names: string[] | null;
  fetchedAt: string;
  sourceSha256: string | null;
}

/**
 * The list for the new file. A fresh list replaces the previous one only when
 * it arrived and holds at least the spec's minimum; otherwise the previous
 * list stands and says so. A catalog is never truncated by a network error or
 * a changed file format.
 */
export function mergeList(previous: SapIdentifierFile, result: ListResult): { list: SapNameList; replaced: boolean } {
  const spec = SAP_NAME_LIST_SPECS.find((s) => s.key === result.key);
  if (!spec) throw new Error(`unknown list ${result.key}`);
  const before = previous.lists.find((l) => l.key === result.key);
  const complete = Array.isArray(result.names) && result.names.length >= spec.minCount;
  if (complete) {
    const names = [...new Set(result.names!)].sort();
    return {
      list: { key: spec.key, label: spec.label, release: spec.release, url: spec.url, fetchedAt: result.fetchedAt, sourceSha256: result.sourceSha256, count: names.length, status: 'fetched', names },
      replaced: true,
    };
  }
  const names = before?.names ?? [];
  return {
    list: {
      key: spec.key,
      label: spec.label,
      release: spec.release,
      url: spec.url,
      fetchedAt: before?.fetchedAt ?? null,
      sourceSha256: before?.sourceSha256 ?? null,
      count: names.length,
      status: names.length ? 'kept-previous' : 'not-synced',
      names,
    },
    replaced: false,
  };
}

const LIST_CAP = 50;

function allNames(file: Pick<SapIdentifierFile, 'lists' | 'entries'>): Map<string, { kind: string; release: string }> {
  const out = new Map<string, { kind: string; release: string }>();
  for (const l of file.lists) {
    const kind = l.key === 'bapi-classic' ? 'function-module' : 'cds-view';
    for (const n of l.names) out.set(`${kind}:${n}:${l.key}`, { kind, release: l.release });
  }
  for (const e of file.entries) out.set(`${e.kind}:${e.id}:${e.source.key}`, { kind: e.kind, release: e.availableInRelease ?? `${e.product}, release not stated` });
  return out;
}

export function summarize(before: Pick<SapIdentifierFile, 'lists' | 'entries'>, after: Pick<SapIdentifierFile, 'lists' | 'entries'>): SapIdentifierSummary {
  const was = allNames(before);
  const now = allNames(after);
  const added = [...now.keys()].filter((k) => !was.has(k)).sort();
  const removed = [...was.keys()].filter((k) => !now.has(k)).sort();
  const byKind: Record<string, number> = {};
  const byRelease: Record<string, number> = {};
  for (const v of now.values()) {
    byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
    byRelease[v.release] = (byRelease[v.release] ?? 0) + 1;
  }
  // `kind:NAME@list`, so the same view in both editions' lists reads as two facts.
  const short = (k: string) => {
    const [kind, name, key] = k.split(':');
    return `${kind}:${name}@${key}`;
  };
  return {
    byKind,
    byRelease,
    added: added.slice(0, LIST_CAP).map(short),
    removed: removed.slice(0, LIST_CAP).map(short),
    addedCount: added.length,
    removedCount: removed.length,
  };
}

/* ------------------------------------------------ SAP documentation on GitHub */

/** Licences under which a document's facts may be stored and shown (with attribution where the licence asks). */
export const OPEN_LICENSES = new Set(['CC-BY-4.0', 'Apache-2.0', 'MIT', 'CC0-1.0']);

export interface SapDocumentSpec {
  key: string;
  /** Repository under github.com/SAP-docs. */
  repo: string;
  path: string;
  /** The product the document is about — its context, not a claim of availability elsewhere. */
  product: string;
  edition: string | null;
  /** How the facts are written there. */
  read: 'scenarios' | 'ids-in-context';
  /** For `ids-in-context`: the sentence must name the product. */
  context?: RegExp;
  /** The fewest entries a complete reading of this document has. */
  minCount: number;
}

/**
 * The pinned documents, each checked by hand on 12.10.2026: the repository's
 * REUSE.toml states CC-BY-4.0 for `**` (btp-cloud-platform: "SPDX-License-Identifier
 * = CC-BY-4.0", © SAP SE or an SAP affiliate company and contributors). The
 * sync checks the licence again on every run and skips a document whose
 * repository no longer states an open one.
 */
export const SAP_DOCS_SOURCES: readonly SapDocumentSpec[] = Object.freeze([
  {
    key: 'sapdocs-s4hc-service-plans',
    repo: 'btp-cloud-platform',
    path: 'docs/40-extensions/supported-service-plans-for-sap-s-4hana-cloud-925c00a.md',
    product: 'SAP S/4HANA Cloud',
    edition: null,
    read: 'scenarios',
    minCount: 3,
  },
  {
    key: 'sapdocs-s4hc-register-system',
    repo: 'btp-cloud-platform',
    path: 'docs/40-extensions/register-an-sap-s-4hana-cloud-system-in-a-global-account-in-sap-btp-28171b6.md',
    product: 'SAP S/4HANA Cloud',
    edition: null,
    read: 'ids-in-context',
    context: /SAP S\/4HANA Cloud/,
    minCount: 10,
  },
  {
    key: 'sapdocs-btp-abap-managed-scenarios',
    repo: 'btp-cloud-platform',
    path: 'docs/50-administration-and-ops/overview-of-communication-scenarios-managed-by-sap-2d16f49.md',
    product: 'SAP BTP ABAP Environment',
    edition: null,
    read: 'scenarios',
    minCount: 20,
  },
] as SapDocumentSpec[]);

export const sapDocsBlobUrl = (repo: string, revision: string, path: string) => `https://github.com/SAP-docs/${repo}/blob/${revision}/${path}`;

/** The attribution CC BY 4.0 asks for, for one SAP-docs-derived fact. */
export function sapDocsAttribution(url: string): string {
  return `© SAP SE and contributors, CC BY 4.0 — source: ${url}; adapted (extracted ID and title)`;
}

export interface DocumentResult {
  key: string;
  /** Null when the fetch, the licence check or the parse failed. */
  markdown: string | null;
  license: string | null;
  sourceRevision: string | null;
  observedAt: string;
}

/** The entries one document states, each with its source, licence, revision and time. */
export function entriesFromDocument(spec: SapDocumentSpec, result: DocumentResult): SyncedSapIdentifier[] | null {
  if (result.markdown === null || !result.license || !OPEN_LICENSES.has(result.license) || !result.sourceRevision) return null;
  const md = result.markdown;
  const found =
    spec.read === 'ids-in-context'
      ? scenarioIdsInContext(md, spec.context ?? /./)
      : [...scenariosFromTables(md), ...scenariosFromProse(md)];
  const byId = new Map<string, (typeof found)[number]>();
  for (const f of found) {
    const prev = byId.get(f.id);
    // The first title stands; a later mention adds API references, never a second title.
    if (!prev) byId.set(f.id, { ...f, apiRefs: [...f.apiRefs] });
    else prev.apiRefs = [...new Set([...prev.apiRefs, ...f.apiRefs])].sort();
  }
  const url = sapDocsBlobUrl(spec.repo, result.sourceRevision, spec.path);
  return [...byId.values()]
    .map((f) => ({
      id: f.id,
      kind: 'communication-scenario' as const,
      title: f.title,
      product: spec.product,
      edition: spec.edition,
      availableInRelease: null,
      protocol: f.protocol,
      protocolVersion: null,
      apiVersion: null,
      apiRefs: f.apiRefs,
      deprecated: f.deprecated,
      source: { key: spec.key, repo: `SAP-docs/${spec.repo}`, path: spec.path, url },
      license: result.license!,
      sourceRevision: result.sourceRevision!,
      observedAt: result.observedAt,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** A document's entries for the new file: replaced only by a complete, licensed reading; otherwise the previous ones stand. */
export function mergeDocument(
  previous: SapIdentifierFile,
  spec: SapDocumentSpec,
  fresh: SyncedSapIdentifier[] | null,
  result: DocumentResult,
): { state: SapDocumentState; entries: SyncedSapIdentifier[]; replaced: boolean } {
  const kept = previous.entries.filter((e) => e.source.key === spec.key);
  const before = previous.documents.find((d) => d.key === spec.key);
  if (fresh && fresh.length >= spec.minCount) {
    return {
      state: { key: spec.key, repo: `SAP-docs/${spec.repo}`, path: spec.path, product: spec.product, license: result.license, sourceRevision: result.sourceRevision, observedAt: result.observedAt, count: fresh.length, status: 'fetched' },
      entries: fresh,
      replaced: true,
    };
  }
  return {
    state: {
      key: spec.key,
      repo: `SAP-docs/${spec.repo}`,
      path: spec.path,
      product: spec.product,
      license: before?.license ?? null,
      sourceRevision: before?.sourceRevision ?? null,
      observedAt: before?.observedAt ?? null,
      count: kept.length,
      status: kept.length ? 'kept-previous' : 'not-synced',
    },
    entries: kept,
    replaced: false,
  };
}

/** Titles a synced source gives that differ from the curated title of the same ID — flagged, not overwritten. */
export function titleConflicts(
  entries: SyncedSapIdentifier[],
  curated: ReadonlyMap<string, string>,
  agree: (a: string, b: string) => boolean,
): SapIdentifierConflict[] {
  const out: SapIdentifierConflict[] = [];
  for (const e of entries) {
    const mine = curated.get(e.id.toUpperCase());
    if (!mine || !e.title || agree(e.title, mine)) continue;
    out.push({ id: e.id, curatedTitle: mine, syncedTitle: e.title, product: e.product, url: e.source.url });
  }
  return out;
}

/** Plain title comparison for the conflict list: the same words, case and punctuation aside. */
export function sameTitle(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return n(a) === n(b);
}

function noticeLines(file: Pick<SapIdentifierFile, 'lists' | 'documents'>): string[] {
  const lines: string[] = [];
  if (file.lists.some((l) => l.count > 0)) {
    lines.push('SAP Cloudification Repository (https://github.com/SAP/abap-atc-cr-cv-s4hc), Apache License 2.0: names of released CDS views and classic BAPIs.');
  }
  for (const d of file.documents) {
    if (!d.count || !d.sourceRevision) continue;
    const spec = SAP_DOCS_SOURCES.find((s) => s.key === d.key);
    if (!spec) continue;
    lines.push(sapDocsAttribution(sapDocsBlobUrl(spec.repo, d.sourceRevision, spec.path)));
  }
  return lines;
}

/** The new file from the previous one and this run's results. */
export function buildIdentifierFile(
  previous: SapIdentifierFile,
  results: ListResult[],
  syncedAt: string,
  options: {
    /** This run's document readings; without them the previous documents stand. */
    documents?: Array<{ spec: SapDocumentSpec; result: DocumentResult; entries: SyncedSapIdentifier[] | null }>;
    /** Curated titles by upper-case ID, for the conflict list. */
    curatedTitles?: ReadonlyMap<string, string>;
    agree?: (a: string, b: string) => boolean;
  } = {},
): { file: SapIdentifierFile; replaced: string[]; kept: string[] } {
  const replaced: string[] = [];
  const kept: string[] = [];
  const lists: SapNameList[] = [];
  for (const spec of SAP_NAME_LIST_SPECS) {
    const result = results.find((r) => r.key === spec.key) ?? { key: spec.key, names: null, fetchedAt: syncedAt, sourceSha256: null };
    const merged = mergeList(previous, result);
    lists.push(merged.list);
    (merged.replaced ? replaced : kept).push(spec.key);
  }
  let documents = previous.documents;
  let entries = previous.entries;
  if (options.documents) {
    documents = [];
    entries = [];
    for (const spec of SAP_DOCS_SOURCES) {
      const run = options.documents.find((d) => d.spec.key === spec.key);
      const result = run?.result ?? { key: spec.key, markdown: null, license: null, sourceRevision: null, observedAt: syncedAt };
      const merged = mergeDocument(previous, spec, run?.entries ?? null, result);
      documents.push(merged.state);
      entries.push(...merged.entries);
      (merged.replaced ? replaced : kept).push(spec.key);
    }
  }
  const conflicts = options.curatedTitles ? titleConflicts(entries, options.curatedTitles, options.agree ?? sameTitle) : previous.conflicts;
  const next = { lists, entries };
  return {
    file: {
      format: 2,
      syncedAt,
      sources: [...SAP_IDENTIFIER_SOURCES],
      lists,
      documents,
      entries,
      conflicts,
      notice: noticeLines({ lists, documents }),
      summary: summarize(previous, next),
    },
    replaced,
    kept,
  };
}

/** The file with its run dates blanked — two syncs that read the same facts compare equal. */
export function comparable(file: SapIdentifierFile): string {
  return JSON.stringify({
    sources: file.sources,
    lists: file.lists.map((l) => ({ ...l, fetchedAt: null, status: null })),
    documents: file.documents.map((d) => ({ ...d, observedAt: null, status: null })),
    entries: file.entries.map((e) => ({ ...e, observedAt: null })),
    conflicts: file.conflicts,
  });
}

/** Reads a previous file of any format; an unknown one counts as empty. Fields a file predates read as empty. */
export function readIdentifierFile(raw: unknown): SapIdentifierFile {
  const f = raw as Partial<SapIdentifierFile> | null;
  if (f && f.format === 2 && Array.isArray(f.lists) && Array.isArray(f.entries)) {
    return { ...EMPTY_SAP_IDENTIFIER_FILE, ...f, documents: f.documents ?? [], conflicts: f.conflicts ?? [], notice: f.notice ?? [] } as SapIdentifierFile;
  }
  return EMPTY_SAP_IDENTIFIER_FILE;
}

/* ------------------------------------------------ polite fetching */

export const SYNC_USER_AGENT = 'clean-core-io-identifier-sync/1.0 (+https://github.com/sonnyfrenzel-rgb/clean-core.io)';

export interface PoliteFetchOptions {
  /** Pause before every request, ms. */
  delayMs?: number;
  retries?: number;
  /** First backoff, ms; doubled per retry. */
  backoffMs?: number;
  timeoutMs?: number;
  /** Requests this fetcher may make in total; the next one throws. */
  maxRequests?: number;
  /** Largest body accepted, bytes. */
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Optional cache: read before a request, written after a 200. */
  cache?: { get(url: string): string | null; set(url: string, body: string): void };
}

/**
 * A fetcher that waits between requests, retries 429 and 5xx with backoff,
 * names the project in its user agent, honours a hard request cap and a size
 * cap, and reads a cache first.
 */
export function politeFetcher(options: PoliteFetchOptions = {}) {
  const delayMs = options.delayMs ?? 2000;
  const retries = options.retries ?? 3;
  const backoffMs = options.backoffMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 12;
  const maxBytes = options.maxBytes ?? 40_000_000;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let made = 0;
  return {
    get requests() {
      return made;
    },
    async text(url: string, accept = 'application/json'): Promise<string> {
      const cached = options.cache?.get(url);
      if (cached != null) return cached;
      for (let attempt = 0; ; attempt++) {
        if (made >= maxRequests) throw new Error(`request cap of ${maxRequests} reached`);
        made++;
        await sleep(attempt === 0 ? delayMs : backoffMs * 2 ** (attempt - 1));
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        let status = 0;
        try {
          const res = await doFetch(url, { headers: { 'User-Agent': SYNC_USER_AGENT, Accept: accept }, signal: ctrl.signal });
          status = res.status;
          if (res.ok) {
            const body = await res.text();
            if (body.length > maxBytes) throw new Error(`body of ${body.length} bytes exceeds the cap of ${maxBytes}`);
            options.cache?.set(url, body);
            return body;
          }
        } catch (e) {
          if (e instanceof Error && /exceeds the cap/.test(e.message)) throw e;
          status = 0;
        } finally {
          clearTimeout(timer);
        }
        const retryable = status === 0 || status === 429 || status >= 500;
        if (!retryable || attempt >= retries) throw new Error(`HTTP ${status || 'error'} for ${url}`);
      }
    },
  };
}
