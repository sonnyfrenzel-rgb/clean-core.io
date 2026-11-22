import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { sha256Hex } from '../lib/artefact-digest';
import { computeProjectSummary } from '../lib/project-summary-server';
import { APP_VERSION } from '../lib/version';
import { adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { layoutCheck, PRODUCT_LAYOUT } from './helpers/overlap';

/**
 * 3.3.0 (ADR-123): My workspace, both states, rendered — at 1440 and 390, as
 * the mock-up draws them. Needs the app and the emulators.
 *
 *   - a new account: the two products, both starts in the first screen;
 *   - a returning account (five seeded programs with their server summaries):
 *     Next step, five count tiles that filter, program tiles with map thumbnails
 *     and three facts, the lens, the list mode, the start tile;
 *   - performance: the frame without the old page, CLS 0, the tiles' time and
 *     no bpmn-js — measured in the browser and written to
 *     `test-results/workspace-performance.json`. The time budgets are asserted
 *     only on a production build (`CI` set: `npm start`), where they mean
 *     something; the dev server compiles as it goes.
 *
 * `SHOTS_DIR` set: full-page screenshots of every state for a look against the
 * mock-up.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const SHOTS = process.env.SHOTS_DIR || '';
const PROD = !!process.env.CI;

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'Tiles330!x';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const NEW_EMAIL = `ws330-new-${stamp}@cleancore-test.io`;
const RET_EMAIL = `ws330-ret-${stamp}@cleancore-test.io`;

async function makeAccount(email: string): Promise<string> {
  const cred = await createUserWithEmailAndPassword(clientAuth, email, PASSWORD);
  await adminSetDoc('users', cred.user.uid, {
    firstName: 'Mara', lastName: 'Tiles', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
    termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 2, transformationsLimit: 5, createdAt: new Date(),
  });
  return cred.user.uid;
}

const day = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000);

async function seedPrograms(uid: string) {
  const programs: Array<{ id: string; file: string; name: string; state: 'signed' | 'retire' | 'stale' | 'staged'; changed: number }> = [
    { id: `po-${stamp}`, file: 'Z_MM_PO_APPROVAL.abap', name: 'Emergency purchase approval', state: 'signed', changed: 0 },
    { id: `fr-${stamp}`, file: 'Z_SD_FREIGHT_RATE_CHECK.abap', name: 'Freight charge check', state: 'signed', changed: 1 },
    { id: `oa-${stamp}`, file: 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', name: 'Order fulfilment audit report', state: 'retire', changed: 2 },
    { id: `ms-${stamp}`, file: 'Z_MATERIAL_STOCK_CALC.txt', name: 'Material stock valuation', state: 'stale', changed: 3 },
    { id: `dp-${stamp}`, file: 'Z_SD_DELIVERY_PRIORITY.abap', name: 'Delivery priority of sales orders', state: 'staged', changed: 11 },
  ];
  for (const p of programs) {
    const file = path.join('public/starter-examples', p.file);
    const source = fs.existsSync(path.join(ROOT, file)) ? read(file) : read('public/starter-examples/Z_MATERIAL_STOCK_CALC.txt');
    const sha = sha256Hex(source);
    const runId = `run-${p.id}`;
    const doc: Record<string, unknown> = {
      name: p.name,
      status: 'uploaded',
      userId: uid,
      legacyCode: p.state === 'stale' ? `${source}\n* changed after the run\n` : source,
      createdAt: day(20),
      updatedAt: day(p.changed),
      fromExample: true,
    };
    if (p.state !== 'staged') {
      doc.activeRunId = runId;
      doc.status = 'analyzed';
      doc.s4Deployment = 'private';
      doc.auditMetadata = {
        inputFingerprint: { sha256: sha, fileName: p.file.replace(/\.txt$/, '.abap'), lineCount: source.split('\n').length, uploadedAt: day(8).toISOString() },
        modelCard: { analysisTimestamp: day(8).toISOString(), engineVersion: APP_VERSION },
      };
      doc.summary = computeProjectSummary({
        runId, sourceSha256: sha, source, processName: p.name, sourceFileName: p.file, engineVersion: APP_VERSION,
        cleanCoreScore: 40 + programs.indexOf(p) * 9, recommendation: 'In-App (ABAP Cloud)',
      });
      if (p.state === 'retire') {
        doc.targetArchitecture = 'retire';
        doc.approvedByArchitect = true;
      }
    }
    await adminSetDoc('projects', p.id, doc);
  }
  return programs;
}

/** Collects CLS and the time the first tile or row appeared, from navigation start. */
const consoleErrors: string[] = [];
async function instrument(page: Page) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __tiles: number | null; __bpmn: boolean; __shifts: string[] };
    w.__cls = 0;
    w.__shifts = [];
    w.__tiles = null;
    w.__bpmn = false;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{ hadRecentInput: boolean; value: number; startTime: number; sources?: Array<{ node?: Node | null }> }>) {
          if (e.hadRecentInput) continue;
          w.__cls += e.value;
          const names = (e.sources ?? []).map((src) => {
            const el = src.node as HTMLElement | null;
            if (!el || !el.tagName) return '?';
            const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name).join(',');
            return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${data}]`;
          });
          w.__shifts.push(`${Math.round(e.startTime)}ms ${e.value.toFixed(4)} ${names.join(' ')}`);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {
      /* not supported */
    }
    const seen = () => {
      if (w.__tiles === null && document.querySelector('[data-program-tile], [data-workspace-projects] tbody tr, [data-home-product], [data-home-start]')) {
        w.__tiles = performance.now();
      }
      if (document.querySelector('.djs-container')) w.__bpmn = true;
    };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true });
  });
}

async function measure(page: Page, label: string) {
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => {
    const w = window as unknown as { __cls: number; __tiles: number | null; __bpmn: boolean; __shifts: string[] };
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    const scripts = performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script') as PerformanceResourceTiming[];
    return {
      fcp: paint ? Math.round(paint.startTime) : null,
      domInteractive: nav ? Math.round(nav.domInteractive) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      tiles: w.__tiles === null ? null : Math.round(w.__tiles),
      cls: Math.round(w.__cls * 10000) / 10000,
      bpmnJs: w.__bpmn || scripts.some((s) => /bpmn/i.test(s.name)),
      shifts: w.__shifts.slice(0, 12),
      scriptKb: Math.round(scripts.reduce((n, s) => n + (s.encodedBodySize || s.transferSize || 0), 0) / 1024),
    };
  });
  const out = path.join(ROOT, 'test-results', 'workspace-performance.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const all = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  all[label] = { ...m, consoleErrors: consoleErrors.splice(0), build: PROD ? 'production' : 'dev', at: new Date().toISOString() };
  fs.writeFileSync(out, JSON.stringify(all, null, 2));
  return m;
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

test.describe.configure({ mode: 'serial' });

test.describe('a new account: two equal products', () => {
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    await makeAccount(NEW_EMAIL);
  });

  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    test(`at ${w}: both products, both starts in the first screen, nothing overlaps, no map library`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: w, height: h });
      await signInViaLanding(page, NEW_EMAIL, PASSWORD);
      await instrument(page);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      const view = page.locator('[data-home-first-view]');
      await expect(view).toBeVisible({ timeout: 120_000 });
      await expect(view.locator('[data-home-product]')).toHaveCount(2);
      const tops = await page.evaluate(() => [...document.querySelectorAll('[data-home-way] h3')].map((e) => e.getBoundingClientRect().top + window.scrollY));
      expect(tops).toHaveLength(2);
      for (const top of tops) expect(top, 'a start below the first screen').toBeLessThan(h);
      const report = await page.evaluate(layoutCheck, PRODUCT_LAYOUT);
      expect({ overlaps: report.overlaps, clipped: report.clipped, overflowX: report.overflowX }).toEqual({ overlaps: [], clipped: [], overflowX: 0 });
      const m = await measure(page, `new-${w}`);
      expect(m.bpmnJs, 'bpmn-js loaded on My workspace').toBe(false);
      expect(m.cls, 'layout shift').toBeLessThanOrEqual(0.01);
      await shot(page, `new-${w}`);
    });
  }
});

test.describe('Re-design an example end to end (W4)', () => {
  test('the example’s analysis is signed, then Design opens on it', async ({ page }) => {
    test.setTimeout(360_000);
    const email = `ws330-rd-${stamp}@cleancore-test.io`;
    await makeAccount(email);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, email, PASSWORD);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-home-redesign-example]').click({ timeout: 120_000 });
    await page.waitForURL(/\/project\/[^/?#]+\/analyze\?first=1/, { timeout: 120_000 });
    await page.waitForURL(/\/project\/[^/?#]+\/design/, { timeout: 180_000 });
  });
});

test.describe('a returning account: next step, counts, tiles', () => {
  let programs: Awaited<ReturnType<typeof seedPrograms>>;
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    const uid = await makeAccount(RET_EMAIL);
    programs = await seedPrograms(uid);
  });

  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    test(`at ${w}: the three sections, one tile per program with its map, nothing overlaps`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.setViewportSize({ width: w, height: h });
      await signInViaLanding(page, RET_EMAIL, PASSWORD);
      await instrument(page);
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-program-tile]').first()).toBeVisible({ timeout: 120_000 });
      const m = await measure(page, `returning-${w}`);

      await expect(page.locator('[data-program-tile]')).toHaveCount(programs.length);
      await expect(page.locator('[data-start-tile]')).toBeVisible();
      await expect(page.locator('[data-ws-next]')).toHaveAttribute('data-ws-next', 'start-redesign');
      await expect(page.locator('[data-kpi]')).toHaveCount(5);
      // Four signed programs carry their map; the staged one says when it comes.
      await expect(page.locator('[data-program-tile] [data-map-thumb="drawn"]')).toHaveCount(4);
      await expect(page.locator('[data-program-tile] [data-map-thumb="none"]')).toHaveCount(1);
      // W5: the retired one builds nothing.
      await expect(page.locator(`[data-program-tile="${programs[2].id}"]`)).toContainText('Not needed — decided: Retire');
      // Owner decision 14.11.2026: the business process name is the title, the project's name small below it —
      // and said once where the two are the same.
      const freight = page.locator(`[data-program-tile="${programs[1].id}"]`);
      await expect(freight.locator('[data-tile-title="process"]')).toHaveText('Freight charge check before goods issue');
      await expect(freight.locator('[data-tile-project-name]')).toHaveText('Freight charge check');
      const po = page.locator(`[data-program-tile="${programs[0].id}"]`);
      await expect(po.locator('[data-tile-title="project"]')).toHaveText('Emergency purchase approval');
      await expect(po.locator('[data-tile-project-name]')).toHaveCount(0);
      // One filled action on the page.
      await expect(page.locator('[data-cc-button="primary"]:visible, a[data-cc-button="primary"]:visible')).toHaveCount(1);
      const text = await page.locator('[data-workspace-tiles]').innerText();
      expect(text).not.toMatch(/launchpad|optional/i);

      const report = await page.evaluate(layoutCheck, PRODUCT_LAYOUT);
      expect({ overlaps: report.overlaps, clipped: report.clipped, overflowX: report.overflowX }).toEqual({ overlaps: [], clipped: [], overflowX: 0 });
      expect(m.bpmnJs, 'bpmn-js loaded on My workspace').toBe(false);
      expect(m.cls, 'layout shift').toBeLessThanOrEqual(0.01);
      if (PROD) {
        expect(m.tiles!, 'tiles after 1 s').toBeLessThan(1000 + 1500);
      }
      await shot(page, `returning-${w}`);
    });
  }

  test('the counts filter, the lens marks one fact and is remembered, the list is one click away', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, RET_EMAIL, PASSWORD);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-program-tile]').first()).toBeVisible({ timeout: 120_000 });

    await page.locator('[data-kpi="attention"]').click();
    await expect(page.locator('[data-kpi="attention"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-program-tile]')).toHaveCount(2);
    await page.locator('[data-kpi="attention"]').click();
    await expect(page.locator('[data-program-tile]')).toHaveCount(programs.length);

    await expect(page.locator('[data-tile-fact="business"][data-lens-on="true"]').first()).toBeVisible();
    await page.locator('[data-lens="it"]').click();
    await expect(page.locator('[data-tile-fact="it"][data-lens-on="true"]')).toHaveCount(programs.length);
    await expect(page.locator('[data-tile-action="open-analysis"]').first()).toHaveAttribute('href', /\/analyze$/); // the lens highlights a fact only (privacy 1.4, 20c E2)
    await shot(page, 'returning-1440-lens-it');
    await page.reload();
    await expect(page.locator('[data-lens="it"]')).toHaveAttribute('aria-checked', 'true', { timeout: 120_000 });

    await page.locator('[data-mode="list"]').click();
    await expect(page.locator('[data-workspace-list] table')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'returning-1440-list');
    await page.locator('[data-mode="tiles"]').click();
    await page.locator('[data-lens="business"]').click();

    await page.locator('[data-ws-analyse-another]').click();
    await expect(page.locator('[data-ws-start-panel] [data-home-way]')).toHaveCount(2);
    await shot(page, 'returning-1440-start-open');
  });
});
