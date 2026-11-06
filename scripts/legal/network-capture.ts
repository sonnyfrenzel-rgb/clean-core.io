/**
 * Network capture of the public site — evidence for privacy policy section 7.
 *
 * The claim it checks: a visitor who opens the public pages WITHOUT signing in
 * makes requests to clean-core.io only (our servers on Google Cloud, Belgium)
 * and to no third party; Firebase Authentication (Google) starts only once the
 * sign-in dialog opens or a page that needs an account is opened.
 *
 *   npx tsx scripts/legal/network-capture.ts [--base https://clean-core.io] [--date YYYY-MM-DD] [--label dev]
 *
 * Writes `docs/legal/network-capture-<date>.md` (one table per engine × step,
 * and the verdict) and `docs/legal/network-capture-<date>.json` (the raw
 * capture). Repeat it on every release.
 *
 * What it does, and what it does not:
 * - Read-only page loads. No sign-in, no text typed, no form submitted. Step 9
 *   only opens the sign-in dialog; steps 10 and 11 open account pages signed out.
 * - Three engines: Chromium desktop 1440×900, WebKit desktop, WebKit with
 *   Playwright's iPhone profile. WebKit is the Safari engine, not Safari and not
 *   a physical iPhone.
 * - Every step runs in a FRESH browser context (no cookies, no storage), so a
 *   step cannot inherit what an earlier step stored. One extra "journey" pass per
 *   engine opens steps 1–8 one after another in a single context, the way a
 *   reader browses.
 * - Every request is recorded through the context (page, frames, workers,
 *   service workers where the engine reports them), plus WebSockets. Kept per
 *   request: host, path, the NAMES of query parameters (never their values),
 *   resource type, method, the frame that issued it, the redirect source, and
 *   on Chromium the initiator from the DevTools protocol. No headers, no bodies,
 *   no cookie or storage values: names only.
 * - After each step: cookie names (with domain), localStorage and
 *   sessionStorage key names, IndexedDB database and object-store names, Cache
 *   Storage names and service-worker registrations — names only.
 *
 * Needs the browsers: `npx playwright install chromium webkit`.
 */
import fs from 'fs';
import path from 'path';
import {
  chromium,
  webkit,
  devices,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type Request,
} from '@playwright/test';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'https://clean-core.io').replace(/\/$/, '');
const DATE = arg('date', new Date().toISOString().slice(0, 10));
/** Optional suffix of the file names, e.g. `dev` for a run against the dev service. */
const LABEL = arg('label', '');
const OUT_DIR = path.resolve(arg('out', path.resolve(__dirname, '..', '..', 'docs', 'legal')));
/** `--steps 1,6,9` runs only those steps (a quick check); the default is all of them. */
const ONLY_STEPS = arg('steps', '').split(',').map((x) => x.trim()).filter(Boolean);
const FIRST_PARTY = new URL(BASE).hostname.replace(/^www\./, '');

// ---------------------------------------------------------------------------
// Engines and steps
// ---------------------------------------------------------------------------

type EngineId = 'chromium-desktop' | 'webkit-desktop' | 'webkit-iphone';

interface Engine {
  id: EngineId;
  label: string;
  launch: () => Promise<Browser>;
  options: BrowserContextOptions;
}

const ENGINES: Engine[] = [
  {
    id: 'chromium-desktop',
    label: 'Chromium desktop 1440×900',
    launch: () => chromium.launch(),
    options: { viewport: { width: 1440, height: 900 } },
  },
  {
    id: 'webkit-desktop',
    label: 'WebKit desktop 1440×900 (Safari engine)',
    launch: () => webkit.launch(),
    options: { viewport: { width: 1440, height: 900 } },
  },
  {
    id: 'webkit-iphone',
    label: `WebKit, Playwright profile "iPhone 15" (Safari engine, not a physical iPhone)`,
    launch: () => webkit.launch(),
    options: { ...devices['iPhone 15'] },
  },
];

interface Step {
  id: string;
  title: string;
  /** Steps 1–8 are covered by the section 7 claim; 9–11 are expected to start Firebase Auth. */
  publicClaim: boolean;
  run: (page: Page) => Promise<void>;
}

const SETTLE_MS = 5_000;

/** The pages a step loaded and the HTTP status of each (a 404 page is a page too, and says so). */
let visits: string[] = [];

async function open(page: Page, route: string): Promise<void> {
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 60_000 });
  visits.push(`${route} ${response ? response.status() : '?'}`);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(SETTLE_MS);
}

async function scrollToBottom(page: Page): Promise<void> {
  // Step through the page so lazy sections, images and observers fire.
  for (let i = 0; i < 60; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(250);
    if (done) break;
  }
}

const STEPS: Step[] = [
  {
    id: '1',
    title: 'Landing page /, scrolled to the bottom, 10 s wait',
    publicClaim: true,
    run: async (page) => {
      await open(page, '/');
      await scrollToBottom(page);
      await page.waitForTimeout(10_000);
    },
  },
  { id: '2', title: '/how-it-works', publicClaim: true, run: (p) => open(p, '/how-it-works') },
  { id: '3', title: '/trust', publicClaim: true, run: (p) => open(p, '/trust') },
  {
    id: '4',
    title: '/terms and /terms/de',
    publicClaim: true,
    run: async (p) => {
      await open(p, '/terms');
      await open(p, '/terms/de');
    },
  },
  {
    id: '5',
    title: '/datenschutz (English) and /datenschutz/de',
    publicClaim: true,
    run: async (p) => {
      await open(p, '/datenschutz');
      await open(p, '/datenschutz/de');
    },
  },
  {
    id: '6',
    title: '/report and /report/de',
    publicClaim: true,
    run: async (p) => {
      await open(p, '/report');
      await open(p, '/report/de');
    },
  },
  { id: '7', title: '/clean-core-explained', publicClaim: true, run: (p) => open(p, '/clean-core-explained') },
  { id: '8', title: '/verify-pack', publicClaim: true, run: (p) => open(p, '/verify-pack') },
  {
    id: '9',
    title: 'Landing page, sign-in dialog opened from the header (nothing entered)',
    publicClaim: false,
    run: async (page) => {
      await open(page, '/');
      // The header's "Get Free Access or Login" link (?auth=signin). Fall back to
      // the URL it leads to if the link is not clickable in this layout.
      const link = page.locator('header a[href*="auth=signin"]').filter({ visible: true }).first();
      if (await link.count()) {
        await link.click();
      } else {
        await page.goto(`${BASE}/?auth=signin`, { waitUntil: 'load' });
      }
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(SETTLE_MS * 2);
    },
  },
  {
    id: '10',
    title: 'Project link /project/some-nonexistent-id, signed out',
    publicClaim: false,
    run: (p) => open(p, '/project/some-nonexistent-id'),
  },
  { id: '11', title: '/dashboard, signed out', publicClaim: false, run: (p) => open(p, '/dashboard') },
];

const ALL_STEPS = STEPS.length;
if (ONLY_STEPS.length) STEPS.splice(0, STEPS.length, ...STEPS.filter((s) => ONLY_STEPS.includes(s.id)));

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

interface RequestRecord {
  host: string;
  scheme: string;
  path: string;
  queryNames: string[];
  resourceType: string;
  method: string;
  /** Path of the frame (or worker) that issued it; for a third-party frame, host + path. */
  issuedBy: string;
  redirectedFrom?: string;
  /** Chromium only (DevTools protocol): initiator type and the script/document that started it. */
  initiator?: string;
  thirdParty: boolean;
}

interface DeviceState {
  cookies: string[];
  localStorage: string[];
  sessionStorage: string[];
  indexedDB: string[];
  cacheStorage: string[];
  serviceWorkers: string[];
}

interface StepResult {
  engine: EngineId;
  step: string;
  title: string;
  mode: 'isolated' | 'journey';
  publicClaim: boolean;
  error?: string;
  requests: RequestRecord[];
  thirdPartyHosts: string[];
  state: DeviceState;
  /** Route and HTTP status of every page the step loaded with `goto`. */
  pages: string[];
}

/** A path segment that looks like a token or an ID long enough to carry one. */
function redactPath(p: string): string {
  return p
    .split('/')
    .map((seg) => (/^[A-Za-z0-9_\-.~%]{48,}$/.test(seg) && !/\.(js|css|woff2?|png|svg|jpg|webp|ico|json|txt|map)$/i.test(seg) ? '<long-segment>' : seg))
    .join('/');
}

function describeUrl(raw: string): { host: string; scheme: string; path: string; queryNames: string[] } {
  try {
    const u = new URL(raw);
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') {
      return { host: '', scheme: u.protocol.replace(':', ''), path: '', queryNames: [] };
    }
    return {
      host: u.hostname,
      scheme: u.protocol.replace(':', ''),
      path: redactPath(u.pathname),
      queryNames: [...new Set([...u.searchParams.keys()])].sort(),
    };
  } catch {
    return { host: '', scheme: 'unparsable', path: '', queryNames: [] };
  }
}

function isThirdParty(host: string, scheme: string): boolean {
  if (!host || scheme === 'data' || scheme === 'blob' || scheme === 'about') return false;
  return !(host === FIRST_PARTY || host.endsWith(`.${FIRST_PARTY}`));
}

function shortRef(raw: string | undefined): string {
  if (!raw) return '';
  const d = describeUrl(raw);
  if (!d.host) return d.scheme;
  return isThirdParty(d.host, d.scheme) ? `${d.host}${d.path}` : d.path || '/';
}

/** Names only: storage keys, IndexedDB databases and their stores, caches, service-worker scopes. */
const IN_PAGE_STATE = `(async () => {
  const keys = (get) => { try { const s = get(); return s ? Object.keys(s).sort() : []; } catch (e) { return ['<unreadable>']; } };
  let idb = [];
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      for (const d of dbs) {
        if (!d.name) continue;
        const stores = await new Promise((resolve) => {
          const req = indexedDB.open(d.name);
          req.onsuccess = () => { const n = Array.from(req.result.objectStoreNames); req.result.close(); resolve(n); };
          req.onerror = () => resolve(['<unopenable>']);
        });
        idb.push(d.name + ' [' + stores.join(', ') + ']');
      }
    } else {
      idb = ['<indexedDB.databases() unsupported>'];
    }
  } catch (e) { idb = ['<unreadable>']; }
  let cacheNames = [];
  try { cacheNames = ('caches' in window) ? await caches.keys() : []; } catch (e) { cacheNames = ['<unreadable>']; }
  let sws = [];
  try { sws = ('serviceWorker' in navigator) ? (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname) : []; } catch (e) { sws = ['<unreadable>']; }
  return {
    localStorage: keys(() => window.localStorage),
    sessionStorage: keys(() => window.sessionStorage),
    indexedDB: idb.sort(),
    cacheStorage: cacheNames.sort(),
    serviceWorkers: sws.sort(),
  };
})()`;

async function collectState(context: BrowserContext, page: Page): Promise<DeviceState> {
  const cookies = (await context.cookies()).map((c) => `${c.name} (${c.domain})`).sort();
  // Passed as a string on purpose: tsx/esbuild wraps named functions in a
  // `__name()` helper that does not exist inside the page, and a function
  // argument to `page.evaluate` would carry it in.
  const inPage = (await page.evaluate(IN_PAGE_STATE).catch((e: unknown) => ({
    localStorage: [`<error: ${String(e).split('\n')[0].slice(0, 80)}>`],
    sessionStorage: [],
    indexedDB: [],
    cacheStorage: [],
    serviceWorkers: [],
  }))) as Omit<DeviceState, 'cookies'>;
  return { cookies, ...inPage };
}

async function newRecordedContext(browser: Browser, engine: Engine) {
  const context = await browser.newContext({ ...engine.options, serviceWorkers: 'allow' });
  const page = await context.newPage();
  let sink: Array<RequestRecord & { _url?: string }> = [];
  const initiators = new Map<string, string>();

  if (engine.id === 'chromium-desktop') {
    // The DevTools protocol knows who started a request; Playwright's API does not.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (e: {
      request: { url: string };
      initiator: { type: string; url?: string; stack?: { callFrames: Array<{ url: string }> } };
    }) => {
      const frame = e.initiator.stack?.callFrames.find((f) => f.url)?.url ?? e.initiator.url;
      initiators.set(e.request.url, `${e.initiator.type}${frame ? ` ${shortRef(frame)}` : ''}`);
    });
  }

  const record = (req: Request) => {
    const d = describeUrl(req.url());
    let issuedBy = '';
    try {
      issuedBy = shortRef(req.frame().url());
    } catch {
      issuedBy = req.serviceWorker() ? `service worker ${shortRef(req.serviceWorker()!.url())}` : 'worker';
    }
    sink.push({
      ...d,
      resourceType: req.resourceType(),
      method: req.method(),
      issuedBy,
      redirectedFrom: req.redirectedFrom() ? shortRef(req.redirectedFrom()!.url()) : undefined,
      _url: req.url(),
      thirdParty: isThirdParty(d.host, d.scheme),
    });
  };
  context.on('request', record);
  page.on('websocket', (ws) => {
    const d = describeUrl(ws.url());
    sink.push({ ...d, resourceType: 'websocket', method: 'GET', issuedBy: shortRef(page.url()), thirdParty: isThirdParty(d.host, d.scheme) });
  });

  return {
    context,
    page,
    /** Hand over what was recorded since the last call; Chromium initiators are filled in late. */
    drain(): RequestRecord[] {
      const out = sink.map(({ _url, ...r }) => {
        const initiator = _url ? initiators.get(_url) : undefined;
        return initiator ? { ...r, initiator } : r;
      });
      sink = [];
      return out;
    },
  };
}

function result(engine: Engine, step: Step, mode: 'isolated' | 'journey', requests: RequestRecord[], state: DeviceState, error?: string): StepResult {
  const thirdPartyHosts = [...new Set(requests.filter((r) => r.thirdParty).map((r) => r.host))].sort();
  const pages = visits;
  visits = [];
  return { engine: engine.id, step: step.id, title: step.title, mode, publicClaim: step.publicClaim, error, requests, thirdPartyHosts, state, pages };
}

async function runEngine(engine: Engine): Promise<StepResult[]> {
  const browser = await engine.launch();
  const out: StepResult[] = [];
  try {
    // Isolated: every step in a fresh context.
    for (const step of STEPS) {
      visits = [];
      const rc = await newRecordedContext(browser, engine);
      let error: string | undefined;
      try {
        await step.run(rc.page);
      } catch (e) {
        error = String(e).split('\n')[0].slice(0, 200);
      }
      const state = await collectState(rc.context, rc.page);
      out.push(result(engine, step, 'isolated', rc.drain(), state, error));
      await rc.context.close();
      console.log(`[${engine.id}] step ${step.id}: ${out[out.length - 1].thirdPartyHosts.join(', ') || 'none'}${error ? ` (error: ${error})` : ''}`);
    }
    // Journey: steps 1–8 in one context, one after another.
    const rc = await newRecordedContext(browser, engine);
    visits = [];
    for (const step of STEPS.filter((s) => s.publicClaim)) {
      let error: string | undefined;
      try {
        await step.run(rc.page);
      } catch (e) {
        error = String(e).split('\n')[0].slice(0, 200);
      }
      const state = await collectState(rc.context, rc.page);
      out.push(result(engine, step, 'journey', rc.drain(), state, error));
    }
    await rc.context.close();
    const journey = out.filter((r) => r.mode === 'journey');
    console.log(`[${engine.id}] journey 1–8: ${[...new Set(journey.flatMap((r) => r.thirdPartyHosts))].join(', ') || 'none'}`);
  } finally {
    await browser.close();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function stateSummary(s: DeviceState): string {
  const parts: string[] = [];
  if (s.cookies.length) parts.push(`cookies: ${s.cookies.join(', ')}`);
  if (s.localStorage.length) parts.push(`localStorage: ${s.localStorage.join(', ')}`);
  if (s.sessionStorage.length) parts.push(`sessionStorage: ${s.sessionStorage.join(', ')}`);
  if (s.indexedDB.length) parts.push(`IndexedDB: ${s.indexedDB.join('; ')}`);
  if (s.cacheStorage.length) parts.push(`Cache Storage: ${s.cacheStorage.join(', ')}`);
  if (s.serviceWorkers.length) parts.push(`service workers: ${s.serviceWorkers.join(', ')}`);
  return parts.length ? esc(parts.join(' · ')) : 'nothing';
}

function thirdPartyDetail(r: StepResult): string {
  const rows = r.requests.filter((q) => q.thirdParty);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const q of rows) {
    const key = `${q.host}${q.path}|${q.resourceType}|${q.issuedBy}|${q.initiator ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const query = q.queryNames.length ? `?${q.queryNames.map((n) => `${n}=…`).join('&')}` : '';
    lines.push(
      `| ${esc(q.host)} | \`${esc(q.path + query)}\` | ${q.resourceType} | ${esc(q.issuedBy)} | ${esc(q.initiator ?? '—')} |`,
    );
  }
  return lines.join('\n');
}

function writeReport(results: StepResult[], meta: { version: string; startedAt: string; finishedAt: string; playwright: string }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = `network-capture-${DATE}${LABEL ? `-${LABEL}` : ''}`;
  // The raw capture: every request, identical ones (same host, path, query
  // names, type, method, issuer, initiator) folded into one row with a count.
  const raw = results.map((r) => {
    const rows = new Map<string, RequestRecord & { count: number }>();
    for (const q of r.requests) {
      const key = JSON.stringify([q.host, q.scheme, q.path, q.queryNames, q.resourceType, q.method, q.issuedBy, q.redirectedFrom, q.initiator]);
      const row = rows.get(key);
      if (row) row.count++;
      else rows.set(key, { ...q, count: 1 });
    }
    return { ...r, requestCount: r.requests.length, requests: [...rows.values()] };
  });
  const json = JSON.stringify(
    { base: BASE, firstParty: FIRST_PARTY, date: DATE, ...meta, steps: STEPS.map(({ id, title, publicClaim }) => ({ id, title, publicClaim })), engines: ENGINES.map(({ id, label }) => ({ id, label })), results: raw },
    null,
    1,
  );
  fs.writeFileSync(path.join(OUT_DIR, `${base}.json`), json + '\n', 'utf8');

  const iso = results.filter((r) => r.mode === 'isolated');
  const journey = results.filter((r) => r.mode === 'journey');
  const publicIso = iso.filter((r) => r.publicClaim);
  const claimBroken = [...publicIso, ...journey].filter((r) => r.thirdPartyHosts.length > 0);
  const errors = results.filter((r) => r.error);
  const later = [...new Set(iso.filter((r) => !r.publicClaim).flatMap((r) => r.thirdPartyHosts))].sort();
  const laterByEngine = ENGINES.map((e) => {
    const rows = iso.filter((r) => !r.publicClaim && r.engine === e.id);
    return `${e.label}: ${rows.map((r) => `step ${r.step} ${r.thirdPartyHosts.length ? r.thirdPartyHosts.map((h) => `\`${h}\``).join(', ') : 'none'}`).join('; ')}.`;
  }).join(' ');
  const storedBefore = [...publicIso, ...journey].filter((r) => stateSummary(r.state) !== 'nothing');

  const L: string[] = [];
  L.push(`# Network capture of the public site — ${DATE}`);
  L.push('');
  L.push('Evidence for privacy policy section 7. Generated by `scripts/legal/network-capture.ts`; repeat it on every release:');
  L.push('');
  L.push('```');
  L.push('npx tsx scripts/legal/network-capture.ts');
  L.push('```');
  L.push('');
  L.push(`- Target: ${BASE} — served version **${meta.version}**`);
  L.push(`- Run: ${meta.startedAt} → ${meta.finishedAt} (UTC), Playwright ${meta.playwright}`);
  L.push(`- First party: \`${FIRST_PARTY}\` and its subdomains. Everything else counts as a third party.`);
  L.push('- Read-only page loads. No sign-in, nothing typed, no form submitted.');
  if (ONLY_STEPS.length) L.push(`- **Partial run:** steps ${ONLY_STEPS.join(', ')} of ${ALL_STEPS} only.`);
  L.push('- Every step ran in a **fresh browser context** (no cookies, no storage). A second "journey" pass opened steps 1–8 one after another in one context.');
  L.push('- Recorded per request: host, path, the names of query parameters (never their values), resource type, the frame that issued it, and on Chromium the initiator from the DevTools protocol. Recorded per step: the names of cookies, localStorage/sessionStorage keys, IndexedDB databases and object stores, Cache Storage entries and service-worker scopes — never their values. No headers, bodies or tokens are stored.');
  L.push('- **WebKit is the Safari engine, run by Playwright — not Safari itself, and the iPhone profile is not a physical iPhone.** It reproduces the engine behaviour that matters here (Firebase Auth treats Safari and mobile browsers differently), not every Safari privacy feature.');
  L.push('');
  L.push('## Verdict');
  L.push('');
  L.push(
    claimBroken.length === 0
      ? `- **Steps 1–8: the section 7 claim holds.** In all three engines, in fresh contexts and in the journey pass, every request went to \`${FIRST_PARTY}\`. No Google Fonts, no gstatic, no googleapis, no Firebase (Auth, App Check, Installations), no reCAPTCHA, no Analytics, no error reporting.`
      : `- **Steps 1–8: the section 7 claim does NOT hold.** ${ENGINES.map((e) => {
          const bad = claimBroken.filter((r) => r.engine === e.id);
          if (!bad.length) return `${e.label}: none.`;
          const hosts = [...new Set(bad.flatMap((r) => r.thirdPartyHosts))].sort().map((h) => `\`${h}\``).join(', ');
          const steps = [...new Set(bad.map((r) => r.step))].join(', ');
          return `${e.label}: ${hosts} in steps ${steps}${bad.some((r) => r.mode === 'journey') ? ' (fresh contexts and journey)' : ''}.`;
        }).join(' ')} Exact URLs and the issuing frame in "Third-party requests in detail".`,
  );
  L.push(
    `- **From step 9/10/11 on**, these third-party hosts appear: ${later.length ? later.map((h) => `\`${h}\``).join(', ') : 'none'}. ${laterByEngine}`,
  );
  L.push(
    storedBefore.length === 0
      ? '- **Stored on the device before sign-in (steps 1–8): nothing** — no cookie, no localStorage/sessionStorage key, no IndexedDB database, no Cache Storage, no service worker.'
      : `- **Stored on the device before sign-in (steps 1–8):** ${[...new Set(storedBefore.map((r) => stateSummary(r.state)))].map((x) => `${x} (${storedBefore.filter((r) => stateSummary(r.state) === x).map((r) => `${r.engine} ${r.step}${r.mode === 'journey' ? ' journey' : ''}`).join(', ')})`).join('; ')}.`,
  );
  if (errors.length) {
    L.push(`- Steps that raised an error (the capture up to the error is kept): ${errors.map((r) => `${r.engine} ${r.step}${r.mode === 'journey' ? ' journey' : ''}: ${esc(r.error ?? '')}`).join('; ')}`);
  }
  L.push('');
  L.push('## Third-party hosts, engine × step (fresh context per step)');
  L.push('');
  L.push(`| Step | ${ENGINES.map((e) => e.label).join(' | ')} |`);
  L.push(`|---|${ENGINES.map(() => '---').join('|')}|`);
  for (const s of STEPS) {
    const cells = ENGINES.map((e) => {
      const r = iso.find((x) => x.engine === e.id && x.step === s.id);
      if (!r) return 'not run';
      const hosts = r.thirdPartyHosts.length ? r.thirdPartyHosts.map((h) => `\`${h}\``).join(', ') : 'none';
      return `${hosts} (${r.requests.length} req.${r.error ? ', error' : ''})`;
    });
    L.push(`| ${s.id}. ${esc(s.title)} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Pages loaded and their HTTP status');
  L.push('');
  L.push('From the first engine; a page that answers 404 renders the not-found page, which is what a visitor of that address sees.');
  L.push('');
  L.push('| Step | Pages (HTTP status) |');
  L.push('|---|---|');
  for (const s of STEPS) {
    const r = iso.find((x) => x.engine === ENGINES[0].id && x.step === s.id);
    L.push(`| ${s.id} | ${r && r.pages.length ? esc(r.pages.join(', ')) : '—'} |`);
  }
  L.push('');
  L.push('## Journey pass, steps 1–8 in one context');
  L.push('');
  L.push(`| Step | ${ENGINES.map((e) => e.label).join(' | ')} |`);
  L.push(`|---|${ENGINES.map(() => '---').join('|')}|`);
  for (const s of STEPS.filter((x) => x.publicClaim)) {
    const cells = ENGINES.map((e) => {
      const r = journey.find((x) => x.engine === e.id && x.step === s.id);
      if (!r) return 'not run';
      return `${r.thirdPartyHosts.length ? r.thirdPartyHosts.map((h) => `\`${h}\``).join(', ') : 'none'} (${r.requests.length} req.)`;
    });
    L.push(`| ${s.id}. ${esc(s.title)} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Stored on the device after each step (names only)');
  L.push('');
  L.push(`| Step | ${ENGINES.map((e) => e.label).join(' | ')} |`);
  L.push(`|---|${ENGINES.map(() => '---').join('|')}|`);
  for (const s of STEPS) {
    const cells = ENGINES.map((e) => {
      const r = iso.find((x) => x.engine === e.id && x.step === s.id);
      return r ? stateSummary(r.state) : 'not run';
    });
    L.push(`| ${s.id} | ${cells.join(' | ')} |`);
  }
  L.push('');
  L.push('## Third-party requests in detail');
  L.push('');
  L.push('Path without query values; "issued by" is the frame or worker that sent it; the initiator (Chromium only) is the script or document that started it.');
  for (const e of ENGINES) {
    for (const r of [...iso, ...journey].filter((x) => x.engine === e.id && x.thirdPartyHosts.length)) {
      L.push('');
      L.push(`### ${e.label} — step ${r.step}${r.mode === 'journey' ? ' (journey)' : ''}`);
      L.push('');
      L.push('| Host | Path | Type | Issued by | Initiator |');
      L.push('|---|---|---|---|---|');
      L.push(thirdPartyDetail(r));
    }
  }
  L.push('');
  L.push(`Raw capture: [\`${base}.json\`](./${base}.json).`);
  L.push('');
  fs.writeFileSync(path.join(OUT_DIR, `${base}.md`), L.join('\n'), 'utf8');
  return { md: path.join(OUT_DIR, `${base}.md`), json: path.join(OUT_DIR, `${base}.json`) };
}

async function main() {
  const startedAt = new Date().toISOString();
  let version = 'unknown';
  try {
    const h = (await (await fetch(`${BASE}/api/health`)).json()) as { version?: string; commit?: string };
    version = `${h.version ?? '?'} (commit ${h.commit ?? '?'})`;
  } catch {
    /* the report says unknown */
  }
  const playwright = (require('@playwright/test/package.json') as { version: string }).version;
  const results: StepResult[] = [];
  for (const engine of ENGINES) results.push(...(await runEngine(engine)));
  const files = writeReport(results, { version, startedAt, finishedAt: new Date().toISOString(), playwright });
  console.log(`\nReport: ${files.md}\nRaw:    ${files.json}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
