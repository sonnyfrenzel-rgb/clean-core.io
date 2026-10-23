import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LIVE_TEST_EXECUTION } from '../lib/locked-paths';

/**
 * The privacy policy (section 2), the Terms (section 7) and the trust page say
 * the S/4HANA functions read structural information only — a service's
 * `$metadata` or a CSRF token — and never a record, a field value or a count.
 *
 * Until 3.0.21 one route did not: /api/fetch-odata-metadata without a service
 * name read the entries of the gateway catalog's `ServiceCollection` entity
 * set, the tenant's own records, to list its services in the Testing stage.
 * That mode is gone. This guard holds every route that reaches a tenant to the
 * sentence: each URL it builds for the tenant ends in `/$metadata`, and no
 * entity set, query option or catalog path is named in its code.
 */

const ROOT = path.resolve(__dirname, '..');

/** Every route that sends a request to a connected tenant, and the probe it uses. */
const TENANT_READERS = [
  'app/api/fetch-odata-metadata/route.ts',
  'app/api/fetch-s4-metadata/route.ts',
  'app/api/test-s4-connection/route.ts',
  'app/api/test-s4-odata-read/route.ts',
  'lib/s4-connection-probe.ts',
];

/**
 * The credential proxy forwards the requests of a live test run — the path
 * `lib/locked-paths.ts` keeps closed (G0:R0). It is exempt only while that lock
 * holds; lifting the lock has to bring this guard and the legal texts along.
 */
const LOCKED_LIVE_PROXY = 'app/api/s4-proxy/[capability]/[...path]/route.ts';

/** The file with its comments taken out — they explain the old reads by name. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === 'route.ts') out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}

test('every route that reaches out with the tenant fetch is one this guard reads', () => {
  const reaching = routeFiles(path.join(ROOT, 'app', 'api')).filter((rel) => /\bsafeFetch\(/.test(code(rel)));
  const known = new Set([...TENANT_READERS, LOCKED_LIVE_PROXY]);
  const unknown = reaching.filter((rel) => !known.has(rel));
  expect(unknown, 'a new route sends requests out; decide whether it reaches a tenant and add it here').toEqual([]);
  expect(LIVE_TEST_EXECUTION.locked, 'the live path is open: the credential proxy forwards generated code\'s requests to the tenant, which the legal texts do not cover').toBe(true);
});

test('every URL a tenant reader builds ends in /$metadata', () => {
  for (const rel of TENANT_READERS) {
    const src = code(rel);
    // A URL for the tenant is a template literal that starts from the tenant's
    // base (`${resolvedUrl}…`, `${baseUrl}…`, `${u.origin}…`). A service path
    // built on its own (`${ODATA_V2_ROOT}…`) is a part, checked where it is used.
    const urls = [...src.matchAll(/`(\$\{[^`]*)`/g)]
      .map((m) => m[1])
      .filter((t) => /^\$\{[\w.]*(?:url|Url|URL|origin|base|Base)[\w.]*\}/.test(t));
    if (rel === 'app/api/test-s4-connection/route.ts') {
      // The connection test builds no URL of its own: it sends the probe's
      // (lib/s4-connection-probe.ts, checked in this loop) and the OAuth token
      // exchange, nothing else.
      expect(urls).toEqual([]);
      const sent = [...src.matchAll(/\b(safeFetch|probeService)\(\s*([\w.]+)/g)].map((m) => `${m[1]}(${m[2]}`);
      expect(new Set(sent)).toEqual(new Set(['safeFetch(tokenUrl', 'probeService(target.probeUrl']));
      continue;
    }
    expect(urls.length, `${rel} builds no tenant URL this guard can see`).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u, `${rel} builds a tenant URL that is not a service's $metadata`).toMatch(/\/\$metadata$/);
    }
  }
  // The route that had the catalog mode builds its candidates this way; if the
  // pattern above stopped seeing them, the check would pass on nothing.
  const odata = code('app/api/fetch-odata-metadata/route.ts');
  expect([...odata.matchAll(/`\$\{resolvedUrl\}[^`]*\/\$metadata`/g)].length).toBeGreaterThanOrEqual(3);
});

test('no tenant reader names an entity set, a query option or the service catalog', () => {
  for (const rel of TENANT_READERS) {
    const src = code(rel);
    for (const forbidden of [
      /ServiceCollection/i,
      /catalogservice/i,
      /ServiceGroups/,
      /\$top\b/,
      /\$skip\b/,
      /\$count\b/,
      /\$inlinecount/,
      /\$filter\b/,
      /\$select\b/,
      /\$expand\b/,
      /\$format=/,
    ]) {
      expect(src, `${rel} names ${forbidden} — that reads records, not metadata`).not.toMatch(forbidden);
    }
  }
});

test('a metadata request without a service name is refused before anything is sent', () => {
  const src = code('app/api/fetch-odata-metadata/route.ts');
  const refusal = src.indexOf('if (!servicePath) {');
  expect(refusal, 'the route answers a call without a service name again').toBeGreaterThan(-1);
  expect(refusal, 'the refusal comes after the tenant was asked for a token').toBeLessThan(src.indexOf('await buildAuthHeaders('));
  expect(refusal).toBeLessThan(src.indexOf('fetchWithTimeout(candidateUrl'));
  expect(src).not.toMatch(/mode: 'catalog'/);
});

test('the Testing stage no longer asks for the service catalog', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'testing', 'page.tsx'), 'utf8');
  expect(page).not.toContain('handleFetchODataCatalog');
  expect(page).not.toContain('Discover Services');
  // Every call of the metadata route names a service.
  const calls = [...page.matchAll(/fetch\('\/api\/fetch-odata-metadata'[\s\S]*?\}\)\s*\n\s*\}\);/g)].map((m) => m[0]);
  expect(calls.length).toBeGreaterThan(0);
  for (const c of calls) expect(c, 'a call of the metadata route sends no service name').toContain('servicePath:');
});

test('the tenant-security page says what the routes read, not more', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'tenant-security', 'page.tsx'), 'utf8');
  // It promised read-only OData responses for chosen entities and spoke of
  // transactional records and metadata lists being retrieved — none of which
  // the routes read since 3.0.21.
  for (const claim of ['Read-only OData responses', 'read-only OData GET requests', 'transactional records', 'metadata lists']) {
    expect(page, `/tenant-security claims "${claim}"`).not.toContain(claim);
  }
  expect(page).toContain('never a record, a field value or a count');
});
