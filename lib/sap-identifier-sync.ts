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

export type SyncedSapIdKind = 'fiori-app' | 'scope-item' | 'communication-scenario' | 'api' | 'cds-view';
export type SyncedProtocol = 'V2' | 'V4' | 'REST' | 'SOAP';

/** One identifier from a source that delivers per-entry facts (none is allowed today; kept for one that is). */
export interface SyncedSapIdentifier {
  id: string;
  kind: SyncedSapIdKind;
  title: string | null;
  protocol?: SyncedProtocol;
  release?: string;
  /** Key of the source in `sources`. */
  source: string;
  url: string;
  fetchedAt: string;
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
  entries: SyncedSapIdentifier[];
  summary: SapIdentifierSummary;
}

export const EMPTY_SAP_IDENTIFIER_FILE: SapIdentifierFile = Object.freeze({
  format: 2,
  syncedAt: null,
  sources: [],
  lists: [],
  entries: [],
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
  for (const e of file.entries) out.set(`${e.kind}:${e.id}:${e.source}`, { kind: e.kind, release: e.release ?? 'not stated' });
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

/** The new file from the previous one and this run's results. */
export function buildIdentifierFile(
  previous: SapIdentifierFile,
  results: ListResult[],
  syncedAt: string,
): { file: SapIdentifierFile; replaced: SapNameListKey[]; kept: SapNameListKey[] } {
  const replaced: SapNameListKey[] = [];
  const kept: SapNameListKey[] = [];
  const lists: SapNameList[] = [];
  for (const spec of SAP_NAME_LIST_SPECS) {
    const result = results.find((r) => r.key === spec.key) ?? { key: spec.key, names: null, fetchedAt: syncedAt, sourceSha256: null };
    const merged = mergeList(previous, result);
    lists.push(merged.list);
    (merged.replaced ? replaced : kept).push(spec.key);
  }
  const next = { lists, entries: previous.entries };
  return {
    file: {
      format: 2,
      syncedAt,
      sources: [...SAP_IDENTIFIER_SOURCES],
      lists,
      entries: previous.entries,
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
    entries: file.entries.map((e) => ({ ...e, fetchedAt: null })),
  });
}

/** Reads a previous file of any format; an unknown one counts as empty. */
export function readIdentifierFile(raw: unknown): SapIdentifierFile {
  const f = raw as Partial<SapIdentifierFile> | null;
  if (f && f.format === 2 && Array.isArray(f.lists) && Array.isArray(f.entries)) return f as SapIdentifierFile;
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
