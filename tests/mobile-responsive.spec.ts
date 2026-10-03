import { test, expect, devices, type Page, type CDPSession, type Locator, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';

/**
 * Clean-Core.io on a phone (owner 03.10.2026, translated: "you cannot scroll
 * or zoom the BPMN maps with your finger, and some views are rendered wider
 * than the screen").
 *
 * Three things, measured on the rendered page with a touch-emulating phone:
 *
 *   (a) **No page is wider than the screen.** At 360, 390 and 430 px, and in
 *       landscape at 844 × 390, `document.documentElement.scrollWidth` stays
 *       within the viewport on every public page, the demo workspace and its
 *       seven stages, My workspace, a project workspace in its three views, the
 *       seven stages, settings, verify-pack, an invitation and the admin pages.
 *       Compared with the configured width, not `innerWidth`: a mobile browser
 *       zooms a too-wide page out, and `innerWidth` then grows with it.
 *   (b) **Every map moves under a finger** — the gesture model of
 *       `components/process-map/useTouchViewport.ts`: a sideways swipe pans the
 *       map and leaves the page where it is, a vertical swipe scrolls the page
 *       and leaves the map where it is (the page is never trapped), two fingers
 *       pinch-zoom the map and not the page, a double tap fits.
 *   (c) **The map controls are touch targets**: 44 × 44 px at least.
 *
 * Touches are real: `Input.dispatchTouchEvent` through CDP, so the browser's
 * own `touch-action` handling decides who gets the gesture, as on a device.
 */

const PHONE = {
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};
test.use(PHONE);

const WIDTHS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
];

const FILE = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');

/** A stored blueprint from before the engine wrote the Documentation stage — the legacy flow chart. */
const LEGACY_BLUEPRINT = {
  l1_domain: { name: 'Order to Cash', strategicGoal: 'Clean core', owner: 'Process Owner' },
  l2_group: { name: 'Sales', processArea: 'Order handling', kpis: ['Cycle time'] },
  l3_flow: [
    { id: 'Start', name: 'Trigger', type: 'startEvent', role: 'System', next: ['Task1'] },
    { id: 'Task1', name: 'Check order', type: 'serviceTask', role: 'System', next: ['Task2'] },
    { id: 'Task2', name: 'Check credit', type: 'userTask', role: 'Clerk', next: ['Task3'] },
    { id: 'Task3', name: 'Confirm order', type: 'serviceTask', role: 'System', next: ['End'] },
    { id: 'End', name: 'Done', type: 'endEvent', role: 'System', next: [] },
  ],
  l4_tasks: [
    { stepId: 'Task1', name: 'Check order', description: 'Checks the order.', inputs: ['Order'], outputs: ['Result'], systems: ['SAP S/4HANA'], complexity: 'Low' },
  ],
};

const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'];

/* ------------------------------------------------------------------ fixtures */

let acct: SeededProject;
let legacyProjectId: string;

async function seed(): Promise<void> {
  acct = await seedStageProject({ prefix: 'mobile', admin: true, acceptTerms: true, rich: true });
  // The starter example: a process with some 25 steps, wide enough to pan.
  const fingerprint = {
    sha256: sha256Hex(SOURCE), fileName: FILE, lineCount: SOURCE.split('\n').length,
    byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
  };
  // No stored blueprint: the Documentation stage then draws the handbook and its map from the code.
  await adminMergeDoc('projects', acct.projectId, { legacyCode: SOURCE, inputFingerprint: fingerprint, documentation: null });
  const unsignedRun = {
    runId: acct.runId, projectId: acct.projectId, userId: acct.uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62, inputFingerprint: fingerprint,
  };
  const runHash = recomputeStoredRunHash(unsignedRun);
  await adminSetDoc(`projects/${acct.projectId}/runs`, acct.runId, {
    ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
  });
  // A second project that still carries a legacy blueprint (the @xyflow chart).
  legacyProjectId = `${acct.projectId}-legacy`;
  await adminSetDoc('projects', legacyProjectId, {
    name: 'Legacy blueprint fixture', userId: acct.uid, createdAt: new Date(), status: 'documented',
    legacyCode: 'REPORT z_legacy.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n',
    analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
    cleanCoreScore: 62,
    documentation: JSON.stringify(LEGACY_BLUEPRINT),
    activeRunId: `${acct.runId}-legacy`,
  });
  await adminSetDoc(`projects/${legacyProjectId}/runs`, `${acct.runId}-legacy`, {
    runId: `${acct.runId}-legacy`, projectId: legacyProjectId, userId: acct.uid,
    createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
  });
}

/** Signs in at desktop width (the landing header keeps its button there), then turns back into the phone. */
async function signIn(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInThroughForm(page, acct);
  await page.setViewportSize(PHONE.viewport);
}

/* ------------------------------------------------------------- measurement */

interface Overflow {
  scrollWidth: number;
  offenders: string[];
}

/** The document's width, and the outermost elements that stick out past the right edge. */
async function measureOverflow(page: Page, width: number): Promise<Overflow> {
  return page.evaluate((vw) => {
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const data = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).slice(0, 2).join('');
      const cls = typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}` : '';
      const r = el.getBoundingClientRect();
      return `${el.tagName.toLowerCase()}${id}${data}${cls} (${Math.round(r.left)}..${Math.round(r.right)})`;
    };
    /** Is the element cut off by a scrolling or clipping box that itself fits? */
    const contained = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible') {
          const r = p.getBoundingClientRect();
          if (r.right <= vw + 1 && r.left >= -1) return true;
        }
        if (s.position === 'fixed') return true;
      }
      return false;
    };
    const sticking = new Set<Element>();
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || s.visibility === 'hidden') continue;
      if ((r.right > vw + 1 || r.left < -1) && !contained(el)) sticking.add(el);
    }
    const outermost = [...sticking].filter((el) => !el.parentElement || !sticking.has(el.parentElement));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      offenders: outermost.slice(0, 6).map(describe),
    };
  }, width);
}

async function settle(page: Page, ready?: string): Promise<void> {
  if (ready) await page.locator(ready).first().waitFor({ state: 'attached', timeout: 90000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

/** Every width, on the page already open; returns one line per width that overflows. */
async function overflowAtEveryWidth(page: Page, label: string): Promise<string[]> {
  const failures: string[] = [];
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await page.waitForTimeout(350);
    let m = await measureOverflow(page, size.width);
    if (m.scrollWidth > size.width) {
      // A resize can leave a transient overflow for a frame or two (a
      // transition, a re-measuring list); only one that stays counts.
      await page.waitForTimeout(1500);
      m = await measureOverflow(page, size.width);
    }
    if (m.scrollWidth > size.width) {
      failures.push(`${label} @${size.width}x${size.height}: scrollWidth ${m.scrollWidth} — ${m.offenders.join(' | ')}`);
    }
  }
  await page.setViewportSize(PHONE.viewport);
  return failures;
}

/* ------------------------------------------------------------------ touches */

interface Pt {
  x: number;
  y: number;
}

async function touchSwipe(cdp: CDPSession, from: Pt, to: Pt, steps = 10): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i += 1) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 250));
}

async function touchPinch(cdp: CDPSession, center: Pt, fromGap: number, toGap: number, steps = 10): Promise<void> {
  const points = (gap: number) => [
    { x: center.x - gap / 2, y: center.y, id: 1 },
    { x: center.x + gap / 2, y: center.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(fromGap) });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(fromGap + ((toGap - fromGap) * i) / steps) });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 250));
}

async function doubleTap(cdp: CDPSession, at: Pt): Promise<void> {
  for (let i = 0; i < 2; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await new Promise((r) => setTimeout(r, 90));
  }
  await new Promise((r) => setTimeout(r, 300));
}

/** How far the page itself is scrolled — the document and any scrolling box outside the maps — and its zoom. */
async function pageScroll(page: Page): Promise<{ x: number; y: number; scale: number }> {
  return page.evaluate(() => {
    const root = document.scrollingElement as HTMLElement;
    let y = root.scrollTop;
    for (const el of document.querySelectorAll<HTMLElement>('main, main *')) {
      if (el.scrollTop > 0 && !el.closest('[data-process-map-canvas], [data-canvas-scroll], .react-flow, .cc-editor-canvas')) y += el.scrollTop;
    }
    return { x: root.scrollLeft, y, scale: window.visualViewport?.scale ?? 1 };
  });
}

interface MapState {
  scale: number;
  x: number;
  y: number;
}

/** A map whose view is a transform (bpmn-js, @xyflow) or a scroll box with a zoom (Design). */
interface MapProbe {
  name: string;
  surface: Locator;
  read: () => Promise<MapState>;
}

function bpmnProbe(page: Page, name: string): MapProbe {
  const surface = page.locator('[data-process-map-canvas]').first();
  return {
    name,
    surface,
    read: () =>
      surface.evaluate((el) => {
        const vp = el.querySelector('svg g.viewport') as SVGGElement | null;
        const m = vp?.transform.baseVal.consolidate()?.matrix;
        return m ? { scale: m.a, x: m.e, y: m.f } : { scale: 1, x: 0, y: 0 };
      }),
  };
}

function flowProbe(page: Page): MapProbe {
  const surface = page.locator('.react-flow').first();
  return {
    name: 'legacy documentation flow (@xyflow)',
    surface,
    read: () =>
      surface.evaluate((el) => {
        const vp = el.querySelector('.react-flow__viewport') as HTMLElement | null;
        const m = vp ? new DOMMatrix(getComputedStyle(vp).transform) : new DOMMatrix();
        return { scale: m.a, x: m.e, y: m.f };
      }),
  };
}

function designProbe(page: Page): MapProbe {
  const surface = page.locator('[data-canvas-scroll]').first();
  return {
    name: 'design canvas',
    surface,
    read: () =>
      surface.evaluate((el) => ({
        scale: Number(el.getAttribute('data-canvas-zoom') ?? '1'),
        x: -el.scrollLeft,
        y: -el.scrollTop,
      })),
  };
}

/**
 * The gesture model, on one map. Returns the broken promises rather than
 * throwing on the first, so the before-run lists every one.
 */
async function exerciseTouch(page: Page, cdp: CDPSession, probe: MapProbe, opts: { vertical?: boolean } = {}): Promise<string[]> {
  const broken: string[] = [];
  const { surface } = probe;
  await surface.scrollIntoViewIfNeeded();
  // Room above and below, so that a vertical swipe has a page to scroll.
  await surface.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const box = (await surface.boundingBox())!;
  const viewport = page.viewportSize()!;
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport.height);
  const c = { x: box.x + box.width / 2, y: (top + bottom) / 2 };

  // 1. A sideways swipe pans the map, not the page.
  let before = await probe.read();
  let pageBefore = await pageScroll(page);
  await touchSwipe(cdp, { x: c.x + box.width * 0.3, y: c.y }, { x: c.x - box.width * 0.3, y: c.y });
  let after = await probe.read();
  let pageAfter = await pageScroll(page);
  if (Math.abs(after.x - before.x) < 40) broken.push(`${probe.name}: a sideways swipe did not pan the map (x ${before.x.toFixed(0)} → ${after.x.toFixed(0)})`);
  if (Math.abs(pageAfter.y - pageBefore.y) > 2 || Math.abs(pageAfter.x - pageBefore.x) > 2) broken.push(`${probe.name}: a sideways swipe on the map moved the page`);

  // 2. A vertical swipe scrolls the page and leaves the map alone.
  if (opts.vertical !== false) {
    before = await probe.read();
    pageBefore = await pageScroll(page);
    await touchSwipe(cdp, { x: c.x, y: c.y + 80 }, { x: c.x, y: c.y - 80 });
    after = await probe.read();
    pageAfter = await pageScroll(page);
    if (pageAfter.y - pageBefore.y < 30) broken.push(`${probe.name}: a vertical swipe on the map did not scroll the page (trapped; page y ${pageBefore.y} → ${pageAfter.y})`);
    if (Math.abs(after.y - before.y) > 2) broken.push(`${probe.name}: a vertical swipe on the map moved the map`);
    await surface.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
  }

  // 3. Two fingers apart zoom the map in; the page keeps its scale.
  const box2 = (await surface.boundingBox())!;
  const c2 = { x: box2.x + box2.width / 2, y: Math.max(box2.y, 0) + Math.min(box2.height, viewport.height) / 2 };
  before = await probe.read();
  await touchPinch(cdp, c2, 60, Math.min(220, box2.width - 40));
  after = await probe.read();
  const pageZoom = await pageScroll(page);
  if (!(after.scale > before.scale * 1.1)) broken.push(`${probe.name}: a pinch did not zoom the map (scale ${before.scale.toFixed(2)} → ${after.scale.toFixed(2)})`);
  if (Math.abs(pageZoom.scale - 1) > 0.01) broken.push(`${probe.name}: a pinch zoomed the page (visual scale ${pageZoom.scale.toFixed(2)})`);
  return broken;
}

/** The map's controls: every button at least 44 × 44 px. */
async function smallTargets(controls: Locator, label: string): Promise<string[]> {
  const sizes = await controls.evaluateAll((els) =>
    els
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '?', w: r.width, h: r.height };
      }),
  );
  return sizes.filter((s) => s.w < 44 - 0.5 || s.h < 44 - 0.5).map((s) => `${label}: "${s.name}" is ${s.w.toFixed(0)}×${s.h.toFixed(0)} px`);
}

/* -------------------------------------------------------------------- specs */

const PUBLIC_ROUTES: { path: string; ready?: string }[] = [
  { path: '/' },
  { path: '/catalog' },
  { path: '/catalog/vbak' },
  { path: '/catalog/browse/v' },
  { path: '/knowledge' },
  { path: '/impressum' },
  { path: '/datenschutz' },
  { path: '/datenschutz/de' },
  { path: '/terms' },
  { path: '/licenses' },
  { path: '/whitepaper' },
  { path: '/how-to' },
  { path: '/how-it-works' },
  { path: '/trust' },
  { path: '/facts' },
  { path: '/about' },
  { path: '/method/levels' },
  { path: '/features/process-blueprints' },
  { path: '/clean-core-explained' },
  { path: '/clean-core-score' },
  { path: '/reference-analysis' },
  { path: '/verify-pack' },
];

/** The demo sits behind sign-in, like the rest of the product shell. */
const DEMO_ROUTES: { path: string; ready?: string }[] = [
  { path: '/demo' },
  { path: '/demo/workspace?view=business', ready: '[data-demo-ready="true"]' },
  { path: '/demo/workspace?view=management', ready: '[data-demo-ready="true"]' },
  { path: '/demo/workspace?view=it', ready: '[data-demo-ready="true"]' },
  ...STAGES.map((s) => ({ path: `/demo/${s}`, ready: '[data-demo-ready="true"]' })),
];

test.describe('phone: no page wider than the screen', () => {
  test('public pages', async ({ page }) => {
    test.setTimeout(900 * 1000);
    const failures: string[] = [];
    // One catalog module page, whichever the index links first.
    await page.goto('/catalog', { waitUntil: 'domcontentloaded' });
    const moduleHref = await page.locator('a[href^="/catalog/module/"]').first().getAttribute('href').catch(() => null);
    const routes = moduleHref ? [...PUBLIC_ROUTES, { path: moduleHref }] : PUBLIC_ROUTES;
    for (const route of routes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await settle(page, route.ready);
      failures.push(...(await overflowAtEveryWidth(page, route.path)));
    }
    console.log(`[mobile-responsive] public overflow:\n${failures.join('\n') || '(none)'}`);
    expect(failures).toEqual([]);
  });

  test('signed in: the demo, My workspace, a project in three views, seven stages, settings, invitation, admin', async ({ page }) => {
    test.setTimeout(900 * 1000);
    if (!acct) await seed();
    await signIn(page);
    const pid = acct.projectId;
    const routes: { path: string; ready?: string }[] = [
      ...DEMO_ROUTES,
      { path: '/dashboard' },
      { path: `/project/${pid}?view=business`, ready: '[data-workspace-process="ready"]' },
      { path: `/project/${pid}?view=management` },
      { path: `/project/${pid}?view=it` },
      ...STAGES.map((s) => ({ path: `/project/${pid}/${s}`, ready: '[data-stage-title]' })),
      { path: `/project/${legacyProjectId}/documentation`, ready: '[data-stage-title]' },
      { path: '/settings' },
      { path: '/verify-pack' },
      { path: `/invitation/${pid}/no-such-invitation` },
      { path: '/admin' },
      { path: '/admin/workspace' },
      { path: '/admin/new-project' },
      { path: '/admin/design-system' },
    ];
    const failures: string[] = [];
    for (const route of routes) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await settle(page, route.ready);
      failures.push(...(await overflowAtEveryWidth(page, route.path.replace(pid, '<project>'))));
    }
    console.log(`[mobile-responsive] signed-in overflow:\n${failures.join('\n') || '(none)'}`);
    expect(failures).toEqual([]);
  });
});

test.describe('phone: every map moves under a finger', () => {
  async function openMapView(page: Page): Promise<void> {
    // On a phone the process opens as steps (DESIGN.md §5.7); "Map" shows the map.
    const process = page.locator('[data-process-map]').first();
    await process.getByRole('radio', { name: /Map/ }).first().click().catch(async () => {
      await process.getByRole('button', { name: /^Map$/ }).first().click();
    });
    await expect.poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 90000 }).toBeGreaterThan(5);
  }

  test('the demo workspace and the demo Documentation stage', async ({ page, context }) => {
    test.setTimeout(300 * 1000);
    if (!acct) await seed();
    await signIn(page);
    const cdp = await (context as BrowserContext).newCDPSession(page);
    const broken: string[] = [];

    await page.goto('/demo/workspace?view=business', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    await openMapView(page);
    broken.push(...(await exerciseTouch(page, cdp, bpmnProbe(page, 'demo workspace map'))));

    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    await expect.poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 90000 }).toBeGreaterThan(5);
    const probe = bpmnProbe(page, 'demo documentation map');
    broken.push(...(await exerciseTouch(page, cdp, probe)));
    broken.push(...(await smallTargets(page.locator('[data-map-view-tools] button'), 'demo documentation map controls')));

    // A double tap on the background fits again.
    const fitted = await (async () => {
      await page.locator('[data-map-fit]').first().evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(300);
      return probe.read();
    })();
    const box = (await probe.surface.boundingBox())!;
    await touchPinch(cdp, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 60, 200);
    await doubleTap(cdp, { x: box.x + 6, y: box.y + box.height - 6 });
    const back = await probe.read();
    if (Math.abs(back.scale - fitted.scale) > 0.01) broken.push(`demo documentation map: a double tap did not fit (scale ${back.scale.toFixed(2)}, fitted ${fitted.scale.toFixed(2)})`);

    // Full screen: one finger pans in every direction.
    const toggleFs = page.locator('[data-map-fullscreen-toggle]').first();
    if ((await toggleFs.count()) === 0) {
      broken.push('demo documentation map: no full-screen control');
      console.log(`[mobile-responsive] demo maps:\n${broken.join('\n')}`);
      expect(broken).toEqual([]);
    }
    await toggleFs.evaluate((el) => (el as HTMLElement).click());
    await expect(page.locator('[data-map-canvas-frame]')).toHaveAttribute('data-map-fullscreen', 'true');
    const fbox = (await probe.surface.boundingBox())!;
    const fc = { x: fbox.x + fbox.width / 2, y: fbox.y + fbox.height / 2 };
    const fBefore = await probe.read();
    await touchSwipe(cdp, { x: fc.x, y: fc.y + 100 }, { x: fc.x, y: fc.y - 100 });
    const fAfter = await probe.read();
    if (Math.abs(fAfter.y - fBefore.y) < 40) broken.push('demo documentation map: in full screen a vertical swipe did not pan the map');
    broken.push(...(await smallTargets(page.locator('[data-map-view-tools] button'), 'demo documentation map controls in full screen')));

    console.log(`[mobile-responsive] demo maps:\n${broken.join('\n') || '(none)'}`);
    expect(broken).toEqual([]);
  });

  test('the demo Design drawing, in landscape where it is drawn wide', async ({ page, context }) => {
    test.setTimeout(240 * 1000);
    if (!acct) await seed();
    await signIn(page);
    const cdp = await (context as BrowserContext).newCDPSession(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/demo/design', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    const probe = designProbe(page);
    await expect(probe.surface).toBeVisible({ timeout: 60000 });
    const broken = await exerciseTouch(page, cdp, probe, { vertical: false });
    broken.push(...(await smallTargets(page.locator('[data-canvas-controls] button'), 'design canvas controls')));
    console.log(`[mobile-responsive] design canvas:\n${broken.join('\n') || '(none)'}`);
    expect(broken).toEqual([]);
  });

  test('a signed project: the workspace map, the Documentation map and a legacy blueprint flow', async ({ page, context }) => {
    test.setTimeout(420 * 1000);
    if (!acct) await seed();
    await signIn(page);
    const cdp = await (context as BrowserContext).newCDPSession(page);
    const broken: string[] = [];

    await page.goto(`/project/${acct.projectId}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-process="ready"]')).toBeAttached({ timeout: 90000 });
    await openMapView(page);
    broken.push(...(await exerciseTouch(page, cdp, bpmnProbe(page, 'project workspace map'))));
    broken.push(...(await smallTargets(page.locator('[data-process-map] [role="radiogroup"] [role="radio"]'), 'Map | Steps')));
    broken.push(...(await smallTargets(page.locator('[data-map-view-tools] button'), 'project workspace map controls')));

    await page.goto(`/project/${acct.projectId}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-process-map]').first()).toBeAttached({ timeout: 90000 });
    await openMapView(page);
    broken.push(...(await exerciseTouch(page, cdp, bpmnProbe(page, 'project documentation map'))));
    broken.push(...(await smallTargets(page.locator('[data-map-view-tools] button'), 'project documentation map controls')));

    await page.goto(`/project/${legacyProjectId}/documentation`, { waitUntil: 'domcontentloaded' });
    const flow = flowProbe(page);
    const shown = await flow.surface.waitFor({ state: 'visible', timeout: 60000 }).then(() => true, () => false);
    if (shown) {
      broken.push(...(await exerciseTouch(page, cdp, flow)));
      broken.push(...(await smallTargets(page.locator('[data-map-view-tools] button'), 'legacy flow controls')));
    } else {
      broken.push('legacy documentation flow: not rendered for the legacy blueprint fixture');
    }

    console.log(`[mobile-responsive] project maps:\n${broken.join('\n') || '(none)'}`);
    expect(broken).toEqual([]);
  });
});

/* --------------------------------------------------------------- assistant */

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Owner 03.10.2026 (translated): "Ask the assistant does not work properly on
 * mobile, because the suggestions overlay the answer texts." After one question
 * the visible part of the answer must not meet a suggestion, the answer must
 * have room to be read, and the input, the close button and Escape must stay
 * in reach — also with the keyboard up, emulated as a window that lost the
 * bottom half of its height.
 */
async function assistantLayout(page: Page, label: string): Promise<string[]> {
  const broken: string[] = [];
  const m = await page.evaluate(() => {
    const rect = (el: Element | null): Box | null => {
      if (!el || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const list = document.querySelector('[data-chatbot-messages]');
    const answers = [...document.querySelectorAll('[data-chatbot-messages] .chat-answer')];
    const answer = answers[answers.length - 1] ?? null;
    const chips = [...document.querySelectorAll('[data-chatbot-suggestions] button')].map(rect).filter((r): r is Box => r !== null);
    const input = document.querySelector('#chatbot-panel input');
    const close = document.querySelector('#chatbot-panel [aria-label="Close the assistant"]');
    return {
      list: rect(list),
      answer: rect(answer),
      chips,
      input: rect(input),
      close: rect(close),
      vv: { width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight },
    };
  });
  if (!m.list || !m.answer) return [`${label}: no answer in the assistant`];
  const seen: Box = {
    left: Math.max(m.answer.left, m.list.left),
    top: Math.max(m.answer.top, m.list.top),
    right: Math.min(m.answer.right, m.list.right),
    bottom: Math.min(m.answer.bottom, m.list.bottom),
  };
  const seenHeight = seen.bottom - seen.top;
  if (seenHeight < 40) broken.push(`${label}: only ${Math.max(0, seenHeight).toFixed(0)} px of the answer can be seen`);
  for (const chip of m.chips) {
    const meets = chip.left < seen.right && chip.right > seen.left && chip.top < seen.bottom && chip.bottom > seen.top;
    if (meets && seenHeight > 0) broken.push(`${label}: a suggestion covers the answer`);
  }
  const inside = (b: Box | null) => b !== null && b.top >= -1 && b.left >= -1 && b.bottom <= m.vv.height + 1 && b.right <= m.vv.width + 1;
  if (!inside(m.input)) broken.push(`${label}: the input is outside the visible screen`);
  if (!inside(m.close)) broken.push(`${label}: the close button is outside the visible screen`);
  return broken;
}

test.describe('phone: the assistant', () => {
  test('suggestions never cover the answer; input and close stay in reach, keyboard up or not', async ({ page }) => {
    test.setTimeout(300 * 1000);
    if (!acct) await seed();
    await signIn(page);
    await page.goto('/demo/workspace?view=business', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });
    const broken: string[] = [];
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      await page.waitForTimeout(300);
      if (!(await page.locator('#chatbot-panel').isVisible())) {
        // The floating button can be switched off at desktop widths; the shell opens it by event then.
        // The shell's event opens it at every width, whether or not the
        // floating button is shown there.
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-chatbot')));
      }
      const panel = page.locator('#chatbot-panel');
      await expect(panel).toBeVisible();
      await panel.locator('input').fill('What is Clean Core?');
      await panel.locator('button[type="submit"]').click();
      await expect.poll(async () => panel.locator('[data-chatbot-glossary-answer]').count(), { timeout: 30000 }).toBeGreaterThan(0);
      await page.waitForTimeout(700);
      broken.push(...(await assistantLayout(page, `@${size.width}x${size.height}`)));
      // The keyboard takes the bottom half of the screen.
      await page.setViewportSize({ width: size.width, height: Math.round(size.height / 2) });
      await panel.locator('input').focus();
      await page.waitForTimeout(500);
      broken.push(...(await assistantLayout(page, `@${size.width}x${size.height} keyboard up`)));
      await page.keyboard.press('Escape');
      await expect(panel, `@${size.width}: Escape closes the assistant`).toBeHidden();
    }
    console.log(`[mobile-responsive] assistant:\n${broken.join('\n') || '(none)'}`);
    expect(broken).toEqual([]);
  });
});

/* -------------------------------------------------------------- full screen */

/**
 * Owner 03.10.2026 (translated): "You still need to be able to get into
 * fullscreen mode, and get back again easily when needed." The workspace's
 * layer map (Business, Need & process) carries the controls every map carries;
 * full screen covers the window, and the button, Escape and — on a phone — the
 * back gesture each leave it, with the page where it was.
 */
async function fullscreenRoundTrip(page: Page, label: string, phone: boolean): Promise<string[]> {
  const broken: string[] = [];
  const frame = page.locator('[data-workspace-process] [data-map-canvas-frame]').first();
  const toggle = frame.locator('[data-map-fullscreen-toggle]');
  if ((await toggle.count()) === 0) return [`${label}: the layer map has no full-screen control`];
  await frame.scrollIntoViewIfNeeded();
  const size = page.viewportSize()!;
  const exits: ('button' | 'escape' | 'back')[] = phone ? ['button', 'escape', 'back'] : ['button', 'escape'];
  for (const exit of exits) {
    const where = await pageScroll(page);
    const url = page.url();
    await toggle.click();
    await expect(frame, `${label}: full screen opens`).toHaveAttribute('data-map-fullscreen', 'true');
    await page.waitForTimeout(300);
    const box = (await frame.boundingBox())!;
    if (box.width < size.width - 2 || box.height < size.height - 2 || box.x > 1 || box.y > 1) {
      broken.push(`${label}: full screen covers ${box.width.toFixed(0)}×${box.height.toFixed(0)} at ${box.x.toFixed(0)},${box.y.toFixed(0)}, not the ${size.width}×${size.height} window`);
    }
    const out = frame.locator('[data-map-fullscreen-toggle]');
    const outBox = (await out.boundingBox())!;
    if (outBox.x + outBox.width < size.width * 0.6 || outBox.y > size.height * 0.25) broken.push(`${label}: the way out is not at the top right`);
    if (phone && (outBox.width < 43.5 || outBox.height < 43.5)) broken.push(`${label}: the way out is ${outBox.width.toFixed(0)}×${outBox.height.toFixed(0)} px`);
    if (!(await out.innerText()).match(/Leave full screen/)) broken.push(`${label}: the way out is not labelled in words`);
    if (exit === 'button') await out.click();
    else if (exit === 'escape') await page.keyboard.press('Escape');
    else await page.goBack();
    await expect(frame, `${label}: ${exit} leaves full screen`).toHaveAttribute('data-map-fullscreen', 'false', { timeout: 10000 });
    await page.waitForTimeout(400);
    if (page.url() !== url) broken.push(`${label}: leaving by ${exit} changed the address to ${page.url()}`);
    const back = await pageScroll(page);
    if (Math.abs(back.y - where.y) > 4) broken.push(`${label}: after leaving by ${exit} the page moved (${where.y} → ${back.y})`);
    if (exit !== 'back') await expect(toggle, `${label}: focus returns to the toggle after ${exit}`).toBeFocused();
  }
  return broken;
}

test.describe('the layer map: full screen in and out', () => {
  for (const phone of [false, true]) {
    test(`${phone ? 'phone' : 'desktop'}: enter, cover the window, leave by button, Escape${phone ? ' and Back' : ''}`, async ({ page }) => {
      test.setTimeout(300 * 1000);
      if (!acct) await seed();
      await signIn(page);
      if (!phone) await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/project/${acct.projectId}?view=business`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-workspace-process="ready"]')).toBeAttached({ timeout: 90000 });
      if (phone) {
        const process = page.locator('[data-process-map]').first();
        await process.getByRole('radio', { name: /Map/ }).first().click();
      }
      await expect.poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 90000 }).toBeGreaterThan(5);
      const broken = await fullscreenRoundTrip(page, phone ? 'phone layer map' : 'desktop layer map', phone);
      console.log(`[mobile-responsive] full screen (${phone ? 'phone' : 'desktop'}):\n${broken.join('\n') || '(none)'}`);
      expect(broken).toEqual([]);
    });
  }
});
