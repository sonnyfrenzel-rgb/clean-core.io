import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { buildDemoProject } from '../lib/demo-project';
import { handbookFromData } from '../lib/process-handbook';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import {
  businessCallouts,
  notDeterminedCallout,
  processStepsOf,
  raciMatrix,
  sopSteps,
  type GlanceHandbook,
} from '../lib/business-summary';
import {
  UNKNOWN_STEP_ID,
  businessLayerFor,
  describedSteps,
  engineDocumentationOf,
  fixtureSource,
  processDocumentOf,
  FIXTURE_FILE,
} from './helpers/business-layer-fixture';
import { overloadedLayerFor } from './helpers/raci-overload-fixture';

/**
 * Owner, 03.10.2026 (translated): "Clean up Documentation: make the Business
 * SOP and the RACIs clearly more visual, with less text, and get to the point.
 * The business user must quickly understand where the value or the problems
 * lie." And the same day: "the business part is almost impossible for the user
 * to find."
 *
 * Held here:
 *   - the callouts show only evidence-backed items, each with a line or an id;
 *   - the SOP steps follow the process, the RACI gaps are found, nothing
 *     missing is filled in;
 *   - the Confluence export still carries every SOP step and every RACI row,
 *     and gains the glance as tables;
 *   - in a browser: the description's summary carries its points with
 *     anchors (owner 04.10.2026, ADR-077 amended twice: it replaces the glance
 *     above a description), the RACI matrix is roles × steps — at most six
 *     columns, a layer of fourteen roles fits 1440 px without scrolling — the
 *     full SOP is one click away, a phone has no sideways scroll, and without a
 *     business layer the card that offers it follows the process description;
 *   - an invited reader reads the same order and is offered no generation.
 */

const SOURCE = fixtureSource();
const DOC = engineDocumentationOf(SOURCE);
const LAYER = businessLayerFor(DOC);
const STEPS = processStepsOf(DOC.steps);

const emptyHandbook = (over: Partial<GlanceHandbook> = {}): GlanceHandbook => ({
  chapters: [],
  writes: [],
  calls: [],
  rulesOutside: [],
  counts: { rules: 0, exceptions: 0 },
  ...over,
});

test.describe('the glance, as data', () => {
  test('every callout over the demo stands on evidence: a line or a rule id on every item', () => {
    const process = buildDemoProject().documentation.process;
    expect(process, 'the demo process could not be read').toBeTruthy();
    const handbook = handbookFromData(process!.handbook);
    const callouts = businessCallouts(handbook, { status: 'ready', byKey: {} });
    expect(callouts.length).toBeGreaterThan(0);
    for (const c of callouts) {
      expect(c.evidence.length, `${c.kind} has no evidence`).toBeGreaterThan(0);
      expect(c.count).toBeGreaterThanOrEqual(c.evidence.length);
      for (const e of c.evidence) expect(e.anchor !== null || e.ref !== null, `${c.kind}: ${e.label}`).toBe(true);
    }
  });

  test('a direct write to an SAP table is a callout with its level; the own namespace is not', () => {
    const handbook = emptyHandbook({ writes: [{ name: 'EKKO', plain: 'Purchase order', line: 40 }, { name: 'ZLOG', plain: null, line: 9 }] });
    const ready = businessCallouts(handbook, { status: 'ready', byKey: { 'EKKO@write': 'D' } });
    expect(ready).toHaveLength(1);
    expect(ready[0].kind).toBe('direct-write');
    expect(ready[0].tone).toBe('error');
    expect(ready[0].evidence).toEqual([{ label: 'Purchase order', ref: 'EKKO', anchor: { lineStart: 40, lineEnd: 40 }, level: 'D' }]);
    // A level that has not arrived is not determined, never a default.
    for (const status of ['loading', 'error'] as const) {
      const pending = businessCallouts(handbook, { status, byKey: {} });
      expect(pending[0].evidence[0].level).toBeNull();
      expect(pending[0].tone).toBe('warning');
    }
    expect(businessCallouts(emptyHandbook({ writes: [{ name: 'ZLOG', plain: null, line: 9 }] }), null)).toEqual([]);
  });

  test('nothing to show is no callout, and an early end without a line is not evidence', () => {
    expect(businessCallouts(emptyHandbook(), null)).toEqual([]);
    const unanchored = emptyHandbook({
      chapters: [{ reads: [], writes: [], calls: [], rules: [], exceptions: [{ id: 'x', label: 'Ends', anchor: null }] }],
      counts: { rules: 0, exceptions: 1 },
    });
    expect(businessCallouts(unanchored, null)).toEqual([]);
    expect(notDeterminedCallout(null)).toBeNull();
    expect(notDeterminedCallout([])?.count).toBe(0);
    const some = notDeterminedCallout([{ label: 'Dynamic call', why: 'name at run time', line: 502 }]);
    expect(some?.provenance).toBe('not-determined');
    expect(some?.evidence[0].anchor).toEqual({ lineStart: 502, lineEnd: 502 });
  });
});

test.describe('the SOP and the RACI, as data', () => {
  test('the steps follow the process; a step the code does not have comes last and says so', () => {
    const steps = sopSteps(LAYER, STEPS);
    const described = describedSteps(DOC).map((s) => s.id);
    expect(steps.map((s) => s.stepId)).toEqual([...described, UNKNOWN_STEP_ID]);
    expect(steps.map((s) => s.number)).toEqual(steps.map((_, i) => i + 1));
    expect(steps.at(-1)!.step).toBeNull();
    for (const s of steps.slice(0, -1)) expect(s.step?.anchor, s.stepId).not.toBeNull();
    // Empty fields stay empty — no default narrative, no invented role.
    expect(steps[3].narrative).toBeNull();
    expect(steps[3].outcome).toBeNull();
    expect(steps[1].kpi).toBeNull();
    expect(steps[2].roles.A).toEqual([]);
    expect(steps[0].outcome).toMatch(/\.$/);
    expect(steps[0].narrative!.startsWith(steps[0].outcome!)).toBe(true);
  });

  test('the matrix is roles × steps and says where it has gaps', () => {
    const matrix = raciMatrix(sopSteps(LAYER, STEPS));
    expect(matrix.steps).toHaveLength(LAYER.raci_matrix.length);
    // Six columns at most (owner 04.10.2026); the roles that only consult or are informed are listed under the matrix.
    expect(matrix.roles.map((r) => r.name)).toEqual(expect.arrayContaining(['Purchasing Clerk', 'Process Owner', 'Finance Lead']));
    expect(matrix.roles.length).toBeLessThanOrEqual(6);
    expect([...matrix.roles, ...matrix.moreRoles].map((r) => r.name)).toEqual(expect.arrayContaining(['Internal Audit', 'Compliance Officer']));
    expect(matrix.steps[2].gaps).toContain('no-accountable');
    expect(matrix.steps[5].gaps).toContain('several-accountable');
    expect(matrix.roles.find((r) => r.name === 'Purchasing Clerk')!.overloaded).toBe(true);
    expect(matrix.roles.find((r) => r.name === 'Process Owner')!.overloaded).toBe(false);
  });
});

test.describe('the Confluence export', () => {
  test('keeps every SOP step and every RACI row, after the process description and before the trace', async () => {
    // Owner 03.10.2026: the page opens with the process description; the
    // business layer follows it as a model proposal, the technical trace last.
    const html = await buildEngineConfluenceHtml(processDocumentOf(SOURCE), LAYER, { processSteps: STEPS }).text();
    expect(html).toContain('Business layer — Model proposal');
    for (const row of LAYER.raci_matrix) expect(html).toContain(`<code>${row.stepId}</code></td><td>${row.r || 'Not determined'}</td>`);
    for (const sop of LAYER.sop_details) {
      expect(html).toContain(`<code>${sop.stepId}</code>`);
      if (sop.narrative) expect(html).toContain(sop.narrative);
    }
    // The SOP strip and the matrix as tables, each row.
    for (const row of LAYER.raci_matrix) {
      expect(html).toContain(`data-glance-sop-step="${row.stepId}"`);
      expect(html).toContain(`data-glance-raci-step="${row.stepId}"`);
    }
    expect(html).toContain('SOP steps — Model proposal');
    expect(html).toContain('RACI matrix — Model proposal');
    // A missing value reads "Not determined", never a default (ADR-068).
    expect(html.slice(html.indexOf('data-business-layer'))).not.toContain('N/A');
    const at = (marker: string) => html.indexOf(marker);
    expect(at('data-doc-section="questions"')).toBeLessThan(at('data-business-layer'));
    expect(at('data-business-layer')).toBeLessThan(at('data-doc-section="appendix"'));
  });
});

/** Description (with its glance) -> business layer -> map -> technical trace, top to bottom. */
async function expectReadingOrder(page: Page) {
  const top = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
  const order = [
    '[data-stage-output="documentation"]',
    '[data-business-sop], [data-business-layer-offer]',
    '[data-handbook-stage]',
    '[data-doc-section="appendix"]',
  ];
  for (let i = 1; i < order.length; i += 1) {
    expect(await top(order[i - 1]), `${order[i - 1]} does not stand above ${order[i]}`).toBeLessThan(await top(order[i]));
  }
}

test.describe('the Documentation stage in a browser', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-biz-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocBiz123!';
  const WITH = `doc-biz-${STAMP}`;
  const WITHOUT = `doc-biz-none-${STAMP}`;
  const MANY = `doc-biz-many-${STAMP}`;
  const RUN_ID = `doc-biz-run-${STAMP}`;
  const READER_EMAIL = `doc-biz-reader-${STAMP}@cleancore-test.io`;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Doc', lastName: 'Business', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FIXTURE_FILE, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    // An invited reader of both projects (the `readers` list an accepted
    // invitation writes) — the same stage, read only.
    const readerCred = await createUserWithEmailAndPassword(auth, READER_EMAIL, PASSWORD);
    const readerUid = readerCred.user.uid;
    await adminSetDoc('users', readerUid, {
      firstName: 'Doc', lastName: 'Reader', email: READER_EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 0, transformationsLimit: 50, createdAt: new Date(),
    });
    for (const [id, business] of [[WITH, JSON.stringify(LAYER)], [WITHOUT, ''], [MANY, JSON.stringify(overloadedLayerFor(DOC))]] as const) {
      await adminSetDoc('projects', id, {
        name: 'Business view fixture', userId: uid, createdAt: new Date(), status: 'documented',
        legacyCode: SOURCE,
        analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
        cleanCoreScore: 62,
        solutionDesign: '# Target architecture',
        generatedCode: 'export const ok = true;',
        documentation: JSON.stringify(DOC),
        businessDocumentation: business,
        activeRunId: RUN_ID,
        inputFingerprint: fingerprint,
        readers: [readerUid],
      });
      const unsignedRun = {
        runId: RUN_ID, projectId: id, userId: uid,
        createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
      };
      const runHash = recomputeStoredRunHash(unsignedRun);
      await adminSetDoc(`projects/${id}/runs`, RUN_ID, {
        ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
      });
    }
  });

  test('desktop: evidence on every point of the summary, the RACI matrix roles × steps, the full SOP one click away', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${WITH}/documentation`, { waitUntil: 'domcontentloaded' });

    // Owner 04.10.2026 (ADR-077 amended twice): the description opens with its
    // own summary — key figures, the rules and risks to know, each with its lines.
    const points = page.locator('[data-doc-glance] [data-doc-point]');
    await expect.poll(() => points.count(), { timeout: 120000 }).toBeGreaterThan(1);
    for (let i = 0; i < await points.count(); i += 1) {
      await expect(points.nth(i).locator('[data-cc-anchor]').first(), `point ${i} has no anchor`).toBeVisible();
    }
    await expect(page.locator('[data-doc-glance] [data-doc-figure]')).toHaveCount(6);

    // The page reads like the document — the process description, then the
    // SOP, then the map to explore, then the technical trace.
    const sop = page.locator('[data-business-sop]');
    await expect(sop).toBeVisible();
    await expect(sop.locator('[data-provenance="proposed"]').first()).toBeVisible();
    await expect(page.locator('[data-business-glance]')).toHaveCount(0);
    await expect(page.locator('[data-doc-section="appendix"]')).toBeAttached({ timeout: 60000 });
    await expectReadingOrder(page);

    // The strip: every step, in order, with its anchor and a provenance chip.
    const strip = page.locator('[data-sop-step]');
    await expect(strip).toHaveCount(LAYER.sop_details.length);
    // The strip shows its first row; "Show all" opens the rest (nothing at full length by default).
    await expect(page.locator(`[data-sop-step="${UNKNOWN_STEP_ID}"]`)).toBeHidden();
    await page.locator('[data-sop-strip-all]').click();
    await expect(page.locator(`[data-sop-step="${UNKNOWN_STEP_ID}"] [data-provenance="proposed"]`)).toBeVisible();
    await expect(strip.first().locator('[data-cc-anchor="linked"]')).toBeVisible();

    // The matrix: one row per RACI row, one column per role plus step and check.
    const matrix = page.locator('[data-raci-matrix]');
    await expect(matrix).toBeVisible();
    await expect(matrix.locator('tbody tr')).toHaveCount(LAYER.raci_matrix.length);
    const roles = raciMatrix(sopSteps(LAYER, STEPS)).roles.length;
    await expect(matrix.locator('thead th')).toHaveCount(roles + 2);
    await expect(matrix.locator('[data-raci-gap="no-accountable"]')).toHaveCount(1);
    await expect(page.locator('[data-raci-legend]')).toBeVisible();

    // The full SOP: folded, and opened it holds every narrative.
    const fold = page.locator('[data-sop-full] [data-cc-disclosure-trigger]');
    await expect(fold).toHaveAttribute('aria-expanded', 'false');
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-sop-full-step]')).toHaveCount(LAYER.sop_details.length);
    await expect(page.locator('[data-sop-full]')).toContainText(LAYER.sop_details[0].narrative);
  });

  test('phone: the RACI is a list per step and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${WITH}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-business-sop]')).toBeVisible({ timeout: 120000 });
    await expect.poll(() => page.locator('[data-doc-glance] [data-doc-point]').count(), { timeout: 120000 }).toBeGreaterThan(1);
    await expect(page.locator('[data-raci-matrix]')).toBeHidden();
    await expect(page.locator('[data-raci-list]')).toBeVisible();
    await expect(page.locator('[data-raci-list-step]').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(0);
  });

  test('fourteen proposed roles: six columns, the rest listed, a step without an Accountable named — and no sideways scroll at 1440', async ({ page }) => {
    // Owner 04.10.2026: "unrealistically many roles in the RACI" — the matrix
    // scrolled sideways and a step without an Accountable went unremarked.
    test.setTimeout(300 * 1000);
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: { documentation: true }, keyAvailable: true, keySource: 'community' }),
    }));
    let calls = 0;
    await page.route('**/api/gemini', (route) => { calls += 1; return route.abort(); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${MANY}/documentation`, { waitUntil: 'domcontentloaded' });
    const matrix = page.locator('[data-raci-matrix]');
    await expect(matrix).toBeVisible({ timeout: 120000 });
    await expect(matrix.locator('thead th')).toHaveCount(6 + 2);
    await expect(page.locator('[data-raci-more-roles="8"]')).toBeVisible();
    await expect(page.locator('[data-raci-key]')).toBeVisible();
    await expect(matrix.locator('[data-raci-gap="no-accountable"]')).toHaveCount(1);
    // Every row shows its Accountable: in a column or named in the row; no "+n more roles" noise.
    await expect(matrix.locator('[data-raci-hidden-accountable]').first()).toBeVisible();
    await expect(page.locator('[data-raci-more-on-step]')).toHaveCount(0);
    // Fourteen roles: the notice says so, with the owner's regenerate action in it.
    const notice = page.locator('[data-raci-too-many="14"]');
    await expect(notice).toContainText('This proposal names 14 roles');
    await expect(notice.locator('[data-regenerate-business-layer]')).toBeVisible();
    await expect(page.locator('[data-regenerate-business-layer]')).toHaveCount(1);
    await expect(page.locator('[data-raci-gaps="0"]')).toHaveCount(0);
    // Every box that could scroll sideways (the table's scroll container among them) holds its content.
    const sideways = await matrix.evaluate((el) => Math.max(0, ...[el, ...el.querySelectorAll('*')]
      .filter((n) => n === el || ['auto', 'scroll'].includes(getComputedStyle(n).overflowX))
      .map((n) => (n as HTMLElement).scrollWidth - (n as HTMLElement).clientWidth)));
    expect(sideways, 'the RACI matrix scrolls sideways at 1440').toBeLessThanOrEqual(0);
    // The owner can ask for a new proposal; nothing is called by itself.
    await expect(page.locator('[data-regenerate-business-layer]')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(calls).toBe(0);
  });

  test('without a business layer and without a model the card says why, right after the process description', async ({ page }) => {
    test.setTimeout(300 * 1000);
    // With a model, opening the stage writes the layer itself
    // (tests/documentation-on-open.spec.ts); here none can be called.
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: {}, keyAvailable: false, keySource: null }),
    }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${WITHOUT}/documentation`, { waitUntil: 'domcontentloaded' });
    const offer = page.locator('[data-business-layer-offer]');
    await expect(offer).toBeVisible({ timeout: 120000 });
    await expect(offer.locator('[data-provenance="proposed"]')).toBeVisible();
    // No model: the reason in one line, and the way to Settings — never a silent nothing.
    await expect(offer.locator('[data-business-layer-off]')).toBeVisible();
    await expect(offer.locator('[data-business-layer-off] a[href="/settings"]')).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Generate the business SOP & RACI' })).toHaveCount(0);
    await expect(page.locator('[data-stage-output="documentation"]')).toBeVisible();
    const y = async (selector: string) => (await page.locator(selector).first().boundingBox())!.y;
    // Right after the process description, above the map (owner 04.10.2026).
    expect(await y('[data-stage-output="documentation"]')).toBeLessThan(await y('[data-business-layer-offer]'));
    expect(await y('[data-business-layer-offer]')).toBeLessThan(await y('[data-handbook-stage]'));
    await expect(page.getByRole('tab', { name: /Business SOP/ })).toHaveCount(0);
  });

  test('an invited reader reads the same order, and nothing offers to generate', async ({ page }) => {
    test.setTimeout(300 * 1000);
    // A model is available: the reader still starts nothing and is offered nothing.
    await page.route('**/api/model-stages', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ stages: { documentation: true }, keyAvailable: true, keySource: 'community' }),
    }));
    let calls = 0;
    await page.route('**/api/gemini', (route) => { calls += 1; return route.abort(); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, READER_EMAIL, PASSWORD);

    await page.goto(`/project/${WITH}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-business-sop]')).toBeVisible({ timeout: 120000 });
    await expect(page.locator('[data-process-document]')).toBeVisible({ timeout: 120000 });
    await expect(page.locator('[data-doc-section="appendix"]')).toBeAttached({ timeout: 60000 });
    await expectReadingOrder(page);
    await expect(page.locator('[data-regenerate-documentation]')).toHaveCount(0);
    await expect(page.locator('[data-regenerate-business-layer]')).toHaveCount(0);
    await expect(page.locator('[data-export-process-md]')).toBeVisible();

    await page.goto(`/project/${WITHOUT}/documentation`, { waitUntil: 'domcontentloaded' });
    const offer = page.locator('[data-business-layer-offer]');
    await expect(offer).toBeVisible({ timeout: 120000 });
    await expect(offer.locator('[data-business-layer-reader]')).toBeVisible();
    await expect(page.locator('[data-generate-business-layer]')).toHaveCount(0);
    await expect(page.locator('[data-regenerate-documentation]')).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(calls, 'a reader visit called the model').toBe(0);
  });
});
