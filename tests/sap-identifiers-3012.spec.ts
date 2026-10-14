import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  annotateSapReferences,
  checkSapReferences,
  findSapIdentifiers,
  sapIdMark,
  sapIdentifierSourcesNote,
  sapReferenceAppendixMarkdown,
} from '../lib/sap-reference-check';
import {
  CURATED_SAP_IDENTIFIERS,
  SAP_IDENTIFIERS_CHECKED,
  loadSapNameLists,
  sapNameListsLoaded,
  setSyncedSapIdentifiers,
  syncedSapIdentifiers,
} from '../lib/sap-identifiers';
import {
  EMPTY_SAP_IDENTIFIER_FILE,
  SAP_IDENTIFIER_SOURCES,
  SAP_NAME_LIST_SPECS,
  SYNC_USER_AGENT,
  buildIdentifierFile,
  classicBapiNames,
  comparable,
  mergeList,
  politeFetcher,
  readIdentifierFile,
  releasedCdsNames,
} from '../lib/sap-identifier-sync';
import { SAP_API_CATALOG_STAMP, successorInContext } from '../lib/abap/sap-api-catalog';
import { extractDataCoupling } from '../lib/abap/code-assessment';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { anchorNarrative, checkModelLineRefs, engineLineAnchors, lineRefAgrees } from '../lib/abap/narrative-anchors';
import { formatAnalysisToMarkdown } from '../lib/markdownFormatter';

/**
 * Roadmap 3.0.12 — the identifier check generalised (FI, CO, PP and SD reviews
 * of v3.0.10, 12.10.2026; owner decision the same day). Pure: no server, no
 * emulator, no network — the sync is tested on small hand-made fixtures shaped
 * like the SAP Cloudification Repository's files.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const one = (text: string, id: string) => {
  const hit = findSapIdentifiers(text).find((c) => c.id === id);
  expect(hit, `${id} was not found in: ${text}`).toBeTruthy();
  return hit!;
};

/* ------------------------------------------------ fixtures */

/** A release-info file the way the repository writes one, three objects long. */
const RELEASE_INFO = {
  formatVersion: '1',
  objectReleaseInfo: [
    { tadirObject: 'DDLS', tadirObjName: 'I_SALESDOCUMENT', objectType: 'CDS_STOB', objectKey: 'I_SALESDOCUMENT', state: 'released' },
    { tadirObject: 'DDLS', tadirObjName: 'I_NOTRELEASEDVIEW', objectType: 'CDS_STOB', objectKey: 'I_NOTRELEASEDVIEW', state: 'notToBeReleased' },
    { tadirObject: 'TABL', tadirObjName: 'VBAK', objectType: 'TABL', objectKey: 'VBAK', state: 'notToBeReleased' },
    { tadirObject: 'DDLS', tadirObjName: 'C_CONSUMPTIONVIEW', objectType: 'CDS_STOB', objectKey: 'C_CONSUMPTIONVIEW', state: 'released' },
  ],
};
/** A classification file: a function group row names the module in `objectKey`. */
const CLASSIFICATIONS = {
  formatVersion: '2',
  objectClassifications: [
    { tadirObject: 'FUGR', tadirObjName: '2032', objectType: 'FUNC', objectKey: 'BAPI_SALESORDER_CHANGE', state: 'classicAPI' },
    { tadirObject: 'FUGR', tadirObjName: 'V45I', objectType: 'FUNC', objectKey: 'BAPI_NOT_FOR_YOU', state: 'noAPI' },
    { tadirObject: 'FUGR', tadirObjName: 'SFES', objectType: 'FUNC', objectKey: 'GUI_DOWNLOAD', state: 'classicAPI' },
  ],
};

const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(5, '0')}`);

/** A synced file built the way the script builds one, with the minimum counts met. */
function syncedFixture(extraCds: string[] = [], extraBapi: string[] = []) {
  return buildIdentifierFile(
    EMPTY_SAP_IDENTIFIER_FILE,
    [
      { key: 'cds-public', names: [...names('I_FIXTUREVIEW', 5000), ...extraCds], fetchedAt: '2026-10-12T06:45:00.000Z', sourceSha256: 'a' },
      { key: 'cds-private', names: [...names('I_FIXTUREVIEW', 5000), 'I_PRIVATEONLY'], fetchedAt: '2026-10-12T06:45:00.000Z', sourceSha256: 'b' },
      { key: 'bapi-classic', names: [...names('BAPI_FIXTURE', 1000), ...extraBapi], fetchedAt: '2026-10-12T06:45:00.000Z', sourceSha256: 'c' },
    ],
    '2026-10-12T06:45:00.000Z',
  ).file;
}

/* ------------------------------------------------ the four states */

test.describe('each state, with SAP’s facts beside it', () => {
  test.beforeEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  test('verified: the title the model gave is SAP’s (F1873 Manage Sales Orders)', () => {
    const c = one('Use the Fiori app F1873 (Manage Sales Orders) for the list.', 'F1873');
    expect(c.status).toBe('verified');
    expect(c.source?.url).toContain('help.sap.com');
    expect(sapIdMark(c)).toMatch(/^verified: SAP lists F1873 as “Manage Sales Orders”/);
  });

  test('mismatch on the name: F1814 is “Sales Order”, not Manage Sales Orders (SD review CC-R31)', () => {
    const c = one('Order viewing is covered by standard SAP Fiori app F1814 (Manage Sales Orders).', 'F1814');
    expect(c.status).toBe('mismatch');
    expect(c.mismatchOn).toBe('name');
    expect(c.sapName).toBe('Sales Order');
    expect(sapIdMark(c)).toContain("name does not match SAP's (SAP: F1814 is “Sales Order”");
  });

  test('mismatch on the protocol: API_PRODUCTION_ORDER_2_SRV is OData V2 (PP review F10)', () => {
    for (const text of [
      'Read orders through API_PRODUCTION_ORDER_2_SRV (OData V4).',
      'Read orders through the OData V4 service API_PRODUCTION_ORDER_2_SRV.',
      'Read orders through API_PRODUCTION_ORDER_2_SRV, an OData v4 API.',
    ]) {
      const c = one(text, 'API_PRODUCTION_ORDER_2_SRV');
      expect(c.status, text).toBe('mismatch');
      expect(c.mismatchOn, text).toBe('protocol');
      expect(c.modelProtocol).toBe('V4');
      expect(c.sapProtocol).toBe('V2');
      expect(sapIdMark(c)).toContain("protocol does not match SAP's (the text says OData V4; SAP: API_PRODUCTION_ORDER_2_SRV is OData V2");
    }
    expect(one('Read orders through API_PRODUCTION_ORDER_2_SRV (OData V2).', 'API_PRODUCTION_ORDER_2_SRV').status).toBe('verified');
    // A V4 that belongs to another identifier is not this one's.
    expect(one('Use API_X_SRV (OData V4) and API_PRODUCTION_ORDER_2_SRV for orders.', 'API_PRODUCTION_ORDER_2_SRV').status).toBe('verified');
  });

  test('mismatch on the release: F3338A exists from S/4HANA 2025; F3338 before (CO review)', () => {
    const early = one('On S/4HANA 2023, use F3338A (Manage Allocations (New version)).', 'F3338A');
    expect(early.status).toBe('mismatch');
    expect(early.mismatchOn).toBe('release');
    expect(early.modelRelease).toBe('2023');
    expect(sapIdMark(early)).toContain("release does not match SAP's (the text names release 2023");
    expect(one('On S/4HANA 2025, use F3338A (Manage Allocations (New version)).', 'F3338A').status).toBe('verified');
    expect(one('On S/4HANA 2023, use F3338 (Manage Allocations).', 'F3338').status).toBe('verified');
    expect(one('On S/4HANA 1809, use F3338 (Manage Allocations).', 'F3338').mismatchOn).toBe('release');
  });

  test('name found in catalog: a hit in this product’s own 2024 catalog only, with its stamp', () => {
    // I_PricingElement is in our catalog and in neither SAP list nor a curated page.
    const c = one('Read the conditions from I_PricingElement.', 'I_PricingElement');
    expect(c.status).toBe('catalog');
    const mark = sapIdMark(c);
    expect(mark).toMatch(/^name found in catalog: I_PricingElement is in this product's curated SAP API catalog, compiled for 2024\.FPS02/);
    expect(mark).not.toMatch(/^verified/);
  });

  test('not verified: an ID nobody lists (F3965, PP review) and an unknown scenario', () => {
    const c = one('Use the app F3965 (Manage Production Orders).', 'F3965');
    expect(c.status).toBe('unverified');
    expect(sapIdMark(c)).toBe('not verified — check before use');
    expect(one('Use SAP_COM_0777 for it.', 'SAP_COM_0777').status).toBe('unverified');
  });
});

/* ------------------------------------------------ the four reviews */

test.describe('the IDs the FI, CO, PP and SD reviews named', () => {
  test.beforeEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  test('FI: F2358, 19M and SAP_COM_0093 keep their verdicts', () => {
    expect(one('Use F2358 (Process Collections Worklist).', 'F2358').status).toBe('mismatch');
    expect(one('Use scope item 19M (Collections Management).', '19M').status).toBe('mismatch');
    expect(one('Connect through SAP_COM_0093 for Credit Management.', 'SAP_COM_0093').status).toBe('mismatch');
  });

  test('CO: 1EG for cost center accounting is a mismatch; F3338 and F3338A are bound to their releases', () => {
    expect(one('Scope item 1EG (Cost Center Accounting) covers the allocation.', '1EG').status).toBe('mismatch');
    expect(one('Manage Allocations (F3338) runs the cycle.', 'F3338').status).toBe('verified');
  });

  test('PP: F2234 and F3965 as the review found them; I_InternalOrder is SAP’s internal order view', () => {
    const f2234 = one('Monitor stock with F2234 (Monitor Material Coverage).', 'F2234');
    expect(f2234.status).toBe('mismatch');
    expect(f2234.sapName).toBe('Supplier Evaluation by Questionnaire');
    expect(one('Use the app F3965 (Manage Production Orders).', 'F3965').status).toBe('unverified');
    expect(one('Use F2336 (Manage Production Orders).', 'F2336').status).toBe('verified');
    // Named with a page now: verified as an ID, never a statement that it fits a production order.
    expect(one('Read AUFK through I_InternalOrder.', 'I_InternalOrder').status).toBe('verified');
  });

  test('SD: F1814, API_SALES_ORDER_SRV and I_SalesOrder', () => {
    const text =
      'Order viewing is covered by standard SAP Fiori app F1814 (Manage Sales Orders). Use released CDS view I_SalesOrder instead of VBAK and I_SalesOrderItem instead of VBAP. Replace the UPDATE with API_SALES_ORDER_SRV, transaction VA02 and VA03.';
    const checks = checkSapReferences(text);
    const by = (id: string) => checks.find((c) => c.id === id)!;
    expect(by('F1814').status).toBe('mismatch');
    // The review called these "not verified" noise: each has a public SAP page now.
    for (const id of ['I_SalesOrder', 'I_SalesOrderItem', 'API_SALES_ORDER_SRV', 'VA02', 'VA03']) expect(by(id).status, id).toBe('verified');
    expect(by('API_SALES_ORDER_SRV').sapProtocol).toBe('V2');
    expect(by('VA02').kind).toBe('transaction');
  });

  test('BAPIs and function modules are found and checked', () => {
    expect(one('Post with BAPI_ACC_DOCUMENT_POST.', 'BAPI_ACC_DOCUMENT_POST')).toMatchObject({ kind: 'function-module', status: 'verified' });
    expect(one('Download with GUI_DOWNLOAD.', 'GUI_DOWNLOAD')).toMatchObject({ kind: 'function-module', status: 'verified' });
    expect(one('Call BAPI_MADE_UP_THING.', 'BAPI_MADE_UP_THING').status).toBe('unverified');
  });

  test('the curated list: one public SAP page per entry, capped, dated', () => {
    expect(CURATED_SAP_IDENTIFIERS.length).toBeGreaterThan(50);
    expect(CURATED_SAP_IDENTIFIERS.length).toBeLessThan(200);
    for (const e of CURATED_SAP_IDENTIFIERS) {
      expect(e.source.url, e.id).toMatch(/^https:\/\/(help\.sap\.com|fioriappslibrary\.hana\.ondemand\.com)\//);
      expect(e.source.label, e.id).toMatch(/^SAP /);
      expect(e.checked, e.id).toBe(SAP_IDENTIFIERS_CHECKED);
    }
    // Never the Signavio process archive, and no ID that could not be confirmed.
    expect(CURATED_SAP_IDENTIFIERS.filter((e) => /signavio/i.test(`${e.source.url} ${e.source.label}`))).toEqual([]);
    expect(CURATED_SAP_IDENTIFIERS.map((e) => e.id)).not.toContain('F3965');
    expect(new Set(CURATED_SAP_IDENTIFIERS.map((e) => e.id.toUpperCase())).size).toBe(CURATED_SAP_IDENTIFIERS.length);
  });
});

/* ------------------------------------------------ the synced lists */

test.describe('SAP’s synced name lists', () => {
  test.afterEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  test('a released CDS view reads “name found in catalog”, with whose list and its date', () => {
    setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE);
    expect(one('Read VBAK through I_SalesDocument.', 'I_SalesDocument').status).toBe('unverified');
    setSyncedSapIdentifiers(syncedFixture(['I_SALESDOCUMENT']));
    const c = one('Read VBAK through I_SalesDocument.', 'I_SalesDocument');
    expect(c.status).toBe('catalog');
    expect(sapIdMark(c)).toContain('name found in catalog: I_SalesDocument is in SAP Cloudification Repository, CDS views SAP has released (SAP S/4HANA Cloud Public Edition, latest)');
    expect(sapIdMark(c)).toContain('fetched 2026-10-12');
    expect(c.source?.url).toBe('https://github.com/SAP/abap-atc-cr-cv-s4hc');
    // Only in the private edition's list: said so.
    expect(sapIdMark(one('Use I_PrivateOnly.', 'I_PrivateOnly'))).toContain('(SAP Cloud ERP Private, latest)');
  });

  test('a classic BAPI reads “name found in catalog” with SAP’s classification', () => {
    setSyncedSapIdentifiers(syncedFixture([], ['BAPI_SOMETHING_GETLIST']));
    const c = one('Read with BAPI_SOMETHING_GETLIST.', 'BAPI_SOMETHING_GETLIST');
    expect(c.status).toBe('catalog');
    expect(c.caveat).toMatch(/classic API/);
  });

  test('the lists load on demand from the generated file, and the note says what was read', async () => {
    setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE);
    expect(sapIdentifierSourcesNote()).toContain('not consulted');
    await loadSapNameLists();
    expect(sapNameListsLoaded()).toBe(true);
    const note = sapIdentifierSourcesNote();
    expect(note).toContain(`checked ${SAP_IDENTIFIERS_CHECKED}`);
    expect(note).toMatch(/fetched \d{4}-\d{2}-\d{2}/);
    expect(note).toContain(SAP_API_CATALOG_STAMP);
    // A view SAP really lists as released.
    expect(one('Read VBAK through I_SalesDocument.', 'I_SalesDocument').status).toBe('catalog');
  });

  test('the generated file holds complete lists, never a truncated one', () => {
    const file = readIdentifierFile(JSON.parse(read('lib/abap/generated/sap-identifiers.json')));
    for (const spec of SAP_NAME_LIST_SPECS) {
      const l = file.lists.find((x) => x.key === spec.key)!;
      expect(l, spec.key).toBeTruthy();
      expect(l.count, spec.key).toBeGreaterThanOrEqual(spec.minCount);
      expect(l.names.length).toBe(l.count);
      expect(l.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/SAP\/abap-atc-cr-cv-s4hc\//);
      expect(l.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // Facts only: names, no descriptions.
    expect(Object.keys(file.lists[0]).sort()).toEqual(['count', 'fetchedAt', 'key', 'label', 'names', 'release', 'sourceSha256', 'status', 'url']);
    expect(syncedSapIdentifiers()).toBeTruthy();
  });
});

test.describe('the sync: sources, parsing, replace only if complete', () => {
  test('only the open GitHub sources are fetched; SAP’s websites are listed as not synced, with the terms', () => {
    for (const spec of SAP_NAME_LIST_SPECS) expect(spec.url).toMatch(/^https:\/\/raw\.githubusercontent\.com\/SAP\/abap-atc-cr-cv-s4hc\/main\/src\//);
    const synced = SAP_IDENTIFIER_SOURCES.filter((s) => s.synced).map((s) => s.key);
    // The Apache-2.0 Cloudification Repository and SAP's CC BY 4.0 documentation on GitHub (13.10.2026).
    expect(synced).toEqual(['sap-cloudification-repository', 'sap-docs']);
    for (const s of SAP_IDENTIFIER_SOURCES.filter((x) => !x.synced)) {
      expect(s.terms, s.key).toContain('https://www.sap.com/about/legal/terms-of-use.html');
    }
    const script = read('scripts/sync-sap-identifiers.ts');
    expect(script).not.toMatch(/help\.sap\.com|api\.sap\.com|fioriappslibrary/);
  });

  test('the parsers read the repository’s shapes and nothing else', () => {
    expect(releasedCdsNames(RELEASE_INFO)).toEqual(['I_SALESDOCUMENT']);
    expect(classicBapiNames(CLASSIFICATIONS)).toEqual(['BAPI_SALESORDER_CHANGE']);
    expect(releasedCdsNames({} as never)).toBeNull();
    expect(classicBapiNames({ objectReleaseInfo: [] } as never)).toBeNull();
  });

  test('a short or failed list keeps the previous one; a complete one replaces it', () => {
    const previous = syncedFixture();
    const short = mergeList(previous, { key: 'cds-public', names: ['I_ONLY'], fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: 'x' });
    expect(short.replaced).toBe(false);
    expect(short.list.status).toBe('kept-previous');
    expect(short.list.count).toBe(5000);
    expect(short.list.fetchedAt).toBe('2026-10-12T06:45:00.000Z');
    const failed = mergeList(previous, { key: 'bapi-classic', names: null, fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: null });
    expect(failed.list.status).toBe('kept-previous');
    expect(failed.list.count).toBe(1000);
    const first = mergeList(EMPTY_SAP_IDENTIFIER_FILE, { key: 'cds-public', names: null, fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: null });
    expect(first.list.status).toBe('not-synced');
    const full = mergeList(previous, { key: 'cds-public', names: names('I_NEWVIEW', 5001), fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: 'y' });
    expect(full.replaced).toBe(true);
    expect(full.list.count).toBe(5001);
  });

  test('the summary counts by kind and release, and names what was added and removed', () => {
    const before = syncedFixture(['I_GONE']);
    const { file, replaced, kept } = buildIdentifierFile(
      before,
      [
        { key: 'cds-public', names: [...names('I_FIXTUREVIEW', 5000), 'I_NEW'], fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: 'z' },
        { key: 'cds-private', names: null, fetchedAt: '2026-10-19T00:00:00Z', sourceSha256: null },
      ],
      '2026-10-19T00:00:00Z',
    );
    expect(replaced).toEqual(['cds-public']);
    expect(kept).toEqual(['cds-private', 'bapi-classic']);
    expect(file.summary.added).toEqual(['cds-view:I_NEW@cds-public']);
    expect(file.summary.removed).toEqual(['cds-view:I_GONE@cds-public']);
    expect(file.summary.byKind['function-module']).toBe(1000);
    expect(file.summary.byRelease['SAP S/4HANA Cloud Private Edition, latest']).toBe(5001);
    // The same facts read again compare equal, whatever the run date.
    const again = buildIdentifierFile(file, [], '2026-10-26T00:00:00Z').file;
    expect(comparable(again)).toBe(comparable(file));
  });

  test('the fetcher is polite: its user agent, a pause, backoff on 503, a hard cap, the cache', async () => {
    const calls: Array<{ url: string; ua: string }> = [];
    const sleeps: number[] = [];
    let n = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, ua: (init?.headers as Record<string, string>)['User-Agent'] });
      n++;
      return n === 1 ? new Response('busy', { status: 503 }) : new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;
    const store = new Map<string, string>();
    const f = politeFetcher({
      fetchImpl,
      sleep: async (ms) => void sleeps.push(ms),
      delayMs: 7,
      backoffMs: 100,
      maxRequests: 3,
      cache: { get: (u) => store.get(u) ?? null, set: (u, b) => void store.set(u, b) },
    });
    expect(await f.text('https://example.test/a')).toBe('{"ok":true}');
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.ua === SYNC_USER_AGENT)).toBe(true);
    expect(SYNC_USER_AGENT).toContain('clean-core.io');
    expect(sleeps).toEqual([7, 100]);
    // Cached: no request.
    expect(await f.text('https://example.test/a')).toBe('{"ok":true}');
    expect(calls).toHaveLength(2);
    // The cap: a third request is allowed, a fourth is refused.
    await f.text('https://example.test/b');
    await expect(f.text('https://example.test/c')).rejects.toThrow(/request cap/);
    // A 404 is not retried.
    const g = politeFetcher({ fetchImpl: (async () => new Response('no', { status: 404 })) as unknown as typeof fetch, sleep: async () => {} });
    await expect(g.text('https://example.test/x')).rejects.toThrow(/HTTP 404/);
    expect(g.requests).toBe(1);
  });

  test('the weekly workflow has the shape of the other syncs, and the health check watches its branch', async () => {
    const wf = read('.github/workflows/sync-sap-identifiers.yml');
    expect(wf).toMatch(/schedule:\s*\n\s*- cron: '[^']+ \* \* 1'/);
    const top = wf.slice(wf.indexOf('\npermissions:'), wf.indexOf('\njobs:'));
    expect(top).toMatch(/contents: read/);
    expect(top).not.toMatch(/write|pull-requests/);
    const at = { sync: wf.indexOf('\n  sync:'), push: wf.indexOf('\n  push:') };
    expect(at.push).toBeGreaterThan(at.sync);
    const sync = wf.slice(at.sync, at.push);
    const push = wf.slice(at.push);
    expect(sync).toContain('persist-credentials: false');
    expect(sync).toContain('npx tsx scripts/sync-sap-identifiers.ts');
    expect(sync).not.toMatch(/write|github\.token|git push|git commit|secrets\./);
    expect(push).toMatch(/needs: sync/);
    expect(push).toMatch(/contents: write/);
    expect(push).not.toMatch(/\bnpm\b|\bnpx\b|setup-node|\btsx\b/);
    expect(push).toContain('! -path ./lib/abap/generated/sap-identifiers.json');
    expect(push).toContain("grep -vE '^.. lib/abap/generated/sap-identifiers\\.json$'");
    expect(push.match(/git -c core\.hooksPath=\/dev\/null -c core\.fsmonitor=false/g) ?? []).toHaveLength(2);
    expect(wf.match(/github\.token|secrets\.GITHUB_TOKEN/g) ?? []).toHaveLength(1);
    expect(push).toContain('HEAD:chore/sync-sap-identifiers');
    const { BOT_BRANCHES } = await import('../scripts/qa/lib/health.mjs');
    expect(BOT_BRANCHES).toContain('chore/sync-sap-identifiers');
    expect(JSON.parse(read('package.json')).scripts['sync:identifiers']).toBe('tsx scripts/sync-sap-identifiers.ts');
  });
});

/* ------------------------------------------------ wording */

test.describe('“name found in catalog”, never “verified”, for a name-only hit', () => {
  test.beforeEach(() => setSyncedSapIdentifiers(EMPTY_SAP_IDENTIFIER_FILE));

  test('marks, appendix and the stamp of the 2024 catalog', () => {
    const text = 'Use I_PricingElement and I_UserAccount for the read.';
    const out = annotateSapReferences(text);
    expect(out).toContain('I_PricingElement [name found in catalog:');
    expect(out).not.toMatch(/I_PricingElement \[verified/);
    const md = sapReferenceAppendixMarkdown(text);
    expect(md).toMatch(/\| `I_PricingElement` \| CDS view \| name found in catalog \|/);
    expect(md).toContain('2024.FPS02');
    expect(md).toContain('Checked against:');
    expect(SAP_API_CATALOG_STAMP).toMatch(/compiled for 2024\.FPS02, reviewed \d{4}-\d{2}-\d{2}; not synced from SAP/);
  });

  test('no surface prints “verified:” for an ID it holds only by name', () => {
    const c = one('Use I_UserAccount.', 'I_UserAccount');
    expect(c.status).toBe('catalog');
    expect(sapIdMark(c).startsWith('verified')).toBe(false);
  });
});

/* ------------------------------------------------ AUFK by context */

const PP_PROGRAM = [
  'REPORT zpp_sim.',
  'DATA: lt_aufk TYPE STANDARD TABLE OF aufk,',
  '      lt_afko TYPE STANDARD TABLE OF afko,',
  '      lt_resb TYPE STANDARD TABLE OF resb.',
  'SELECT * FROM aufk INTO TABLE lt_aufk WHERE autyp = 10.',
  'SELECT * FROM afko INTO TABLE lt_afko FOR ALL ENTRIES IN lt_aufk WHERE aufnr = lt_aufk-aufnr.',
  'SELECT * FROM resb INTO TABLE lt_resb FOR ALL ENTRIES IN lt_aufk WHERE aufnr = lt_aufk-aufnr.',
].join('\n');

const CO_PROGRAM = [
  'REPORT zco_orders.',
  'DATA lt_aufk TYPE STANDARD TABLE OF aufk.',
  'SELECT * FROM aufk INTO TABLE lt_aufk WHERE autyp = 01.',
].join('\n');

test.describe('AUFK is mapped by what else the program reads (PP review)', () => {
  test('the context rule', () => {
    expect(successorInContext('AUFK', ['AUFK', 'AFKO'])?.entry.view).toBe('I_ManufacturingOrder');
    expect(successorInContext('AUFK', ['AUFK'])).toBeNull();
    // A reservation alone is no production order: RESB is just as much a
    // maintenance order's component (QA review of 03501b79fb3d, e6a7787ff3d0).
    expect(successorInContext('AUFK', ['AUFK', 'RESB'])).toBeNull();
    for (const header of ['AFKO', 'AFPO', 'AFVC', 'AFRU']) {
      expect(successorInContext('AUFK', ['AUFK', 'RESB', header])?.entry.view, header).toBe('I_ManufacturingOrder');
    }
    expect(successorInContext('RESB', ['RESB'])?.entry.view).toBe('I_ReservationDocumentItem');
    expect(successorInContext('RESB', ['RESB', 'AFKO'])).toBeNull();
  });

  test('RESB beside AUFK alone is a reservation; AFRU is a production-order table for RESB too (QA leftovers of hotfix 2)', () => {
    expect(successorInContext('RESB', ['RESB', 'AUFK'])?.entry.view).toBe('I_ReservationDocumentItem');
    expect(successorInContext('RESB', ['RESB', 'AUFK', 'AFRU'])).toBeNull();
    expect(successorInContext('RESB', ['RESB', 'AFRU'])).toBeNull();
    // What v3.0.12 signed.
    expect(successorInContext('RESB', ['RESB', 'AUFK'], { precisionFixes: false })).toBeNull();
    expect(successorInContext('RESB', ['RESB', 'AFRU'], { precisionFixes: false })?.entry.view).toBe('I_ReservationDocumentItem');
    // The evidence follows the engine version.
    const PM = ['REPORT zpm.', 'DATA: lt_aufk TYPE STANDARD TABLE OF aufk, lt_resb TYPE STANDARD TABLE OF resb.',
      'SELECT * FROM aufk INTO TABLE lt_aufk WHERE autyp = 30.',
      'SELECT * FROM resb INTO TABLE lt_resb FOR ALL ENTRIES IN lt_aufk WHERE aufnr = lt_aufk-aufnr.'].join('\n');
    const resb = (engine: string) =>
      buildAbapEvidence(PM, 'z.abap', 'private', undefined, engine).findings.find((f) => f.objectName === 'RESB' && f.sapReplacement)?.sapReplacement?.objectName;
    expect(resb('v3.0.13')).toBe('I_ReservationDocumentItem');
    expect(resb('v3.0.12')).toBe('I_ProductionOrderComponent');
  });

  test('the data coupling names the production order successor beside AFKO and RESB, the internal order otherwise', () => {
    const pp = extractDataCoupling(PP_PROGRAM).find((e) => e.tableName === 'AUFK')!;
    expect(pp.recommendation).toContain('I_ManufacturingOrder');
    expect(pp.recommendation).toContain('production order context');
    expect(pp.recommendation).not.toContain('I_InternalOrder');
    const co = extractDataCoupling(CO_PROGRAM).find((e) => e.tableName === 'AUFK')!;
    expect(co.recommendation).toBe('Use CDS I_InternalOrder');
  });

  test('the evidence engine’s successor follows the same context, labelled a curated mapping', () => {
    const successor = (code: string, table: string) =>
      buildAbapEvidence(code, 'z.abap', 'private').findings.find((f) => f.objectName === table && f.sapReplacement)?.sapReplacement;
    expect(successor(PP_PROGRAM, 'AUFK')).toMatchObject({ objectName: 'I_ManufacturingOrder', confidence: 'Verified' });
    expect(successor(CO_PROGRAM, 'AUFK')?.objectName).toBe('I_InternalOrder');
    // RESB beside the production order tables stays the order component.
    expect(successor(PP_PROGRAM, 'RESB')?.objectName).toBe('I_ProductionOrderComponent');
    // AUFK beside RESB and no production order table: the internal order stays.
    const PM_COMPONENTS = PP_PROGRAM.split('\n').filter((l) => !/afko/i.test(l)).join('\n');
    expect(successor(PM_COMPONENTS, 'AUFK')?.objectName).toBe('I_InternalOrder');
  });
});

/* ------------------------------------------------ line references */

// Line 1 REPORT, 2 DATA, 3 blank, 4–8 FORM enrich … ENDFORM, 9 blank, 10–12 FORM out … ENDFORM.
const SOURCE = [
  'REPORT zsd_orders.',
  'DATA gv_total TYPE p DECIMALS 2.',
  '',
  'FORM enrich.',
  '  gv_total = gv_total * 2.',
  '  IF gv_total > 100.',
  '    gv_total = 100.',
  '  ENDIF.',
  'ENDFORM.',
  '',
  'FORM out.',
  '  WRITE gv_total.',
  'ENDFORM.',
].join('\n');

test.describe('model line references are held against the engine’s anchors (SD review CC-R32)', () => {
  const index = engineLineAnchors(SOURCE);

  test('a range that starts and ends on the routine is kept; one that runs past it is not', () => {
    expect(lineRefAgrees(4, 9, index)).toBe(true);
    expect(lineRefAgrees(5, 8, index)).toBe(true);
    expect(lineRefAgrees(6, 12, index), 'starts inside enrich, ends inside out').toBe(false);
    expect(lineRefAgrees(3, 9, index), 'starts on a blank line').toBe(false);
    expect(lineRefAgrees(12, 12, index)).toBe(true);
    expect(lineRefAgrees(2, 2, index)).toBe(true);
    expect(lineRefAgrees(20, 21, index)).toBe(false);
  });

  test('the export drops what disagrees and says so; without the source every raw reference is dropped', () => {
    const { text, dropped, kept } = checkModelLineRefs('Purpose [L1-L2]. Enrichment [L6–L12]. Output [L11-13].', index);
    expect(kept).toBe(2);
    expect(dropped).toEqual(['[L6–L12]']);
    expect(text).toBe('Purpose [L1-L2]. Enrichment. Output [L11-13].');
    expect(checkModelLineRefs('Purpose [L1-L2].', null).text).toBe('Purpose.');
    // Finding ids are the engine's own and stay.
    expect(checkModelLineRefs('It writes [CC-013].', null).text).toBe('It writes [CC-013].');
  });

  test('the anchored narrative rejects a range the anchors do not hold', () => {
    const r = anchorNarrative('It caps the total [L6-L12]. It prints the total [L11-L13].', [], 13, index);
    expect(r.sentences[0].status).toBe('invalid-anchor');
    expect(r.sentences[1].status).toBe('anchored');
    // Without the anchors, only the length is checked — as before.
    expect(anchorNarrative('It caps the total [L6-L12].', [], 13).sentences[0].status).toBe('anchored');
  });

  test('business-analysis.md carries only references that agree with the source', () => {
    const analysis = JSON.stringify({
      projectTitle: 'Cockpit',
      cleanCoreScore: 40,
      summary: 'A cockpit for orders [L1-L2]. It enriches the totals [L6-L12].',
      asIsContext: 'It prints the total [L11-L13].',
    });
    const withCode = formatAnalysisToMarkdown(analysis, { code: SOURCE });
    expect(withCode).toContain('[L1-L2]');
    expect(withCode).toContain('[L11-L13]');
    expect(withCode).not.toContain('[L6-L12]');
    expect(withCode).toContain("1 line reference the model wrote was dropped: they do not agree with the engine's line anchors");
    const without = formatAnalysisToMarkdown(analysis);
    expect(without).not.toMatch(/\[L\d/);
    expect(without).toContain('no source was at hand');
  });

  test('every export of model text passes the source', () => {
    const delivery = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(delivery).toContain('formatAnalysisToMarkdown(project.analysis, { code: project.legacyCode })');
    expect(delivery).toContain('formatDesignToMarkdown(project.solutionDesign, { code: project.legacyCode })');
    expect(read('app/(app)/project/[projectId]/analyze/page.tsx')).toMatch(/<AnchoredNarrative[\s\S]{0,200}code=\{legacyCode\}/);
    expect(read('lib/process-document-build.ts')).toContain('anchorNarrative(stripModelMarkdown(text), [], lines.length, engineLineAnchors(source))');
  });
});
