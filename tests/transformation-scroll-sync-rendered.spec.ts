import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { seedStageProject, signInThroughForm, type SeededProject } from './helpers/seed-project';
import { adminSetDoc } from './helpers/admin-seed';
import { sha256Hex } from '../lib/artefact-digest';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';

/**
 * Roadmap 3.0.14, item 6 (owner decision 15.10.2026), rendered: side by side
 * scrolls by the trace, not by percent. A project with a stored RAP package and
 * its traceability.json:
 *
 *   - scrolling the original to a unit's first line brings that unit's method
 *     to the top of the target pane;
 *   - scrolling the target pane to a method brings its unit's first ABAP line to
 *     the top of the original;
 *   - TRACE.md has no trace link: the note says sync does not apply to it, and a
 *     file chosen again opens at the method of the original's current line;
 *   - on a phone the panes stack and the note says they scroll on their own.
 *
 * Needs the emulators and the production build (the integrator runs it); the
 * pure mapping is `tests/transformation-scroll-sync.spec.ts`.
 */

test.use({ baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000' });
test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

const PO_DEMO = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');
const LOGIC = 'src/zcl_mm_po_logic.clas.abap';

/** The units and where their ABAP lines lie in the original (668 lines). */
const UNITS = [
  { unitId: 'U01', fn: 'read_requisitions', abap: [100, 180] },
  { unitId: 'U02', fn: 'check_release', abap: [200, 300] },
  { unitId: 'U03', fn: 'post_orders', abap: [400, 500] },
] as const;

/** The logic class: each method followed by 60 body lines, so the pane has to scroll between them. */
function logicClass(): { content: string; methodLine: Record<string, number> } {
  const lines = ['CLASS zcl_mm_po_logic IMPLEMENTATION.', ''];
  const methodLine: Record<string, number> = {};
  for (const u of UNITS) {
    methodLine[u.unitId] = lines.length + 1;
    lines.push(`  METHOD ${u.fn}.`);
    for (let i = 0; i < 60; i++) lines.push(`    " ${u.unitId} body line ${i + 1}`);
    lines.push('  ENDMETHOD.', '');
  }
  lines.push('ENDCLASS.');
  return { content: lines.join('\n'), methodLine };
}

const LOGIC_CLASS = logicClass();

function trace() {
  return {
    format: 'clean-core.traceability/1',
    program: 'Z_MM_PO_APPROVAL',
    sourceSha256: sha256Hex(PO_DEMO),
    contextDigest: null,
    scaffoldVersion: 11,
    planDigest: 'plan',
    scaffoldDigest: 'scaffold',
    runId: null,
    functions: UNITS.map((u) => ({ name: u.fn, file: LOGIC, owner: 'fill', unitId: u.unitId, abap: [{ lineStart: u.abap[0], lineEnd: u.abap[1] }], rules: [] })),
    units: UNITS.map((u) => ({
      unitId: u.unitId,
      fn: u.fn,
      file: LOGIC,
      title: u.fn.replace('_', ' '),
      kind: 'routine',
      abap: [{ lineStart: u.abap[0], lineEnd: u.abap[1] }],
      rules: [],
      guards: [],
      filledBy: 'model',
      checks: { lint: null, cases: null, probes: null },
    })),
    notCarried: [],
    openRules: [],
    droppedRules: [],
  };
}

async function seed(prefix: string): Promise<SeededProject> {
  const account = await seedStageProject({ prefix, acceptTerms: true });
  const sha = sha256Hex(PO_DEMO);
  const files = [
    { path: LOGIC, content: LOGIC_CLASS.content },
    { path: 'src/zcl_mm_po_logic.clas.xml', content: '<abapGit/>' },
    { path: 'TRACE.md', content: '# How this code was built — Z_MM_PO_APPROVAL\n' },
    { path: 'traceability.json', content: `${JSON.stringify(trace(), null, 2)}\n` },
  ];
  await adminSetDoc('projects', account.projectId, {
    name: 'Z_MM_PO_APPROVAL',
    userId: account.uid,
    createdAt: new Date(),
    status: 'designed',
    legacyCode: PO_DEMO,
    s4Deployment: 'public',
    cleanCoreScore: 41,
    activeRunId: account.runId,
    solutionDesign: '# Target architecture\n\nIn-app on ABAP Cloud (RAP).\n',
    inputFingerprint: { sha256: sha, fileName: 'Z_MM_PO_APPROVAL.abap', lineCount: PO_DEMO.split('\n').length },
    generatedCode: JSON.stringify(files),
  });
  const inputManifest = buildInputManifest(
    analysisRunInputs({ sourceSha256: sha, deploymentTarget: 'public', catalogVersion: '2026.FPS01', rulesetVersion: 'rules-v1.0', engineVersion: '2.15.0', model: null }),
    null,
  );
  await adminSetDoc(`projects/${account.projectId}/runs`, account.runId, {
    runId: account.runId,
    projectId: account.projectId,
    userId: account.uid,
    createdAt: new Date().toISOString(),
    status: 'completed',
    cleanCoreScore: 41,
    analysis: '',
    inputManifest,
  });
  return account;
}

const legacyPane = (page: Page) => page.locator('pre[aria-label="Legacy source (ABAP)"]').locator('xpath=..');
const targetPane = (page: Page) => page.locator('[data-stage-output="generatedCode"]');

/** The topmost visible line of a pane, read from the DOM the way the page reads it. */
async function topLine(pane: Locator): Promise<number> {
  return pane.evaluate((el) => {
    const lines = Array.from(el.querySelectorAll<HTMLElement>('[data-cc-code-surface] [data-cc-code-line]'));
    const paneTop = el.getBoundingClientRect().top;
    let found = 0;
    lines.forEach((line, i) => {
      if (line.getBoundingClientRect().top - paneTop <= 1) found = i;
    });
    return found + 1;
  });
}

/** Scroll a pane, as a reader would, so that `line` stands at its top. */
async function scrollTo(pane: Locator, line: number) {
  await pane.evaluate((el, n) => {
    const target = el.querySelectorAll<HTMLElement>('[data-cc-code-surface] [data-cc-code-line]')[n - 1];
    el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top;
  }, line);
}

async function open(page: Page, account: SeededProject) {
  await signInThroughForm(page, account);
  await page.goto(`/project/${account.projectId}/transformation`);
  await expect(page.locator('#tf-side')).toBeAttached({ timeout: 120_000 });
  await page.locator('#tf-side').scrollIntoViewIfNeeded();
  await expect(targetPane(page).locator('[data-cc-code-line]').first()).toBeAttached({ timeout: 30_000 });
}

test('desktop: a line of the original brings its method to the top, and a method brings its lines', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const account = await seed('tf-scroll-sync');
  await open(page, account);
  await expect(page.locator('#tf-sync-note')).toHaveAttribute('data-sync-scope', 'trace');
  await expect(page.getByRole('button', { name: /Sync Scroll: ON/ })).toHaveAttribute('aria-describedby', 'tf-sync-note');

  // The original at U03's first line → post_orders at the top of the target pane.
  await scrollTo(legacyPane(page), 400);
  await expect.poll(() => topLine(targetPane(page)), { timeout: 5_000 }).toBe(LOGIC_CLASS.methodLine.U03);
  // Inside the same unit the target pane is not pulled back.
  await scrollTo(legacyPane(page), 420);
  await page.waitForTimeout(600);
  expect(await topLine(targetPane(page))).toBe(LOGIC_CLASS.methodLine.U03);
  // Between units: the nearest preceding one (U02 ended at 300).
  await scrollTo(legacyPane(page), 350);
  await expect.poll(() => topLine(targetPane(page)), { timeout: 5_000 }).toBe(LOGIC_CLASS.methodLine.U02);

  // The other way: the target pane at read_requisitions → the original at line 100.
  await page.waitForTimeout(800);
  await scrollTo(targetPane(page), LOGIC_CLASS.methodLine.U01 + 3);
  await expect.poll(() => topLine(legacyPane(page)), { timeout: 5_000 }).toBe(100);

  // A file without a trace link says so; the panes no longer follow each other.
  await page.locator('nav[aria-label="Project files"] button', { hasText: 'TRACE.md' }).click();
  await expect(page.locator('#tf-sync-note')).toHaveAttribute('data-sync-scope', 'no-link');
  await expect(page.locator('#tf-sync-note')).toContainText('Sync does not apply to TRACE.md');

  // Move the original to U02, then choose the logic class again: it opens at check_release.
  await scrollTo(legacyPane(page), 250);
  await page.waitForTimeout(400);
  await page.locator('nav[aria-label="Project files"] button', { hasText: 'U01' }).click();
  await expect(page.locator('#tf-sync-note')).toHaveAttribute('data-sync-scope', 'trace');
  await expect.poll(() => topLine(targetPane(page)), { timeout: 5_000 }).toBe(LOGIC_CLASS.methodLine.U02);

  // Sync off: the panes scroll on their own.
  await page.getByRole('button', { name: /Sync Scroll: ON/ }).click();
  await expect(page.locator('#tf-sync-note')).toHaveText('The panes scroll on their own.');
  await scrollTo(legacyPane(page), 450);
  await page.waitForTimeout(600);
  expect(await topLine(targetPane(page))).toBe(LOGIC_CLASS.methodLine.U02);
});

test('phone: the panes stack, and the note says they scroll on their own', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const account = await seed('tf-scroll-sync-phone');
  await open(page, account);
  await expect(page.locator('#tf-sync-note')).toHaveAttribute('data-sync-scope', 'stacked');
  await expect(page.locator('#tf-sync-note')).toHaveText('On a narrow screen the panes are stacked and scroll on their own.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
});
