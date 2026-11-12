import { expect, test, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { sha256Hex } from '../lib/artefact-digest';
import { readerInitials, workspaceEyebrow } from '../lib/workspace-head';
import { signedSourceAbsence, signedSourceOf } from '../lib/signed-source';
import { bizReadAccess } from '../lib/messages/workspace-business';
import { adminMergeDoc, adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';
import type { Project } from '../lib/types';

/**
 * The Business view of a real project, mockup s1 — the process map and its
 * linked source column in the workspace, the order of the view, and the head
 * of the object page (eyebrow, Export, "Invite to view", read access).
 *
 * The map is drawn from the source the active run signed and nothing else, so
 * the fixture records the digest of that source the way a run does; a project
 * whose source no longer matches, and an empty one, are seeded beside it.
 */

const FILE = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs
  .readFileSync(path.resolve('public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

/* ------------------------------------------------------------ pure parts */

test.describe('the head and the signed source, as pure functions', () => {
  const fingerprint = { sha256: sha256Hex(SOURCE), fileName: FILE };
  const project = (extra: Partial<Project> & Record<string, unknown> = {}): Project =>
    ({ name: 'P', legacyCode: SOURCE, activeRunId: 'r1', inputFingerprint: fingerprint, ...extra }) as unknown as Project;

  test('the map reads only the source the active run signed', () => {
    expect(signedSourceOf(project())).toEqual({ source: SOURCE, fileName: FILE });
    expect(signedSourceAbsence(project())).toBeNull();
    // One byte changed after signing: no map, and the reason says why.
    expect(signedSourceOf(project({ legacyCode: `${SOURCE} ` }))).toBeNull();
    expect(signedSourceAbsence(project({ legacyCode: `${SOURCE} ` }))).toBe('changed');
    expect(signedSourceAbsence(project({ activeRunId: undefined }))).toBe('no-run');
    expect(signedSourceAbsence(project({ legacyCode: '' }))).toBe('no-source');
    expect(signedSourceAbsence(project({ inputFingerprint: undefined }))).toBe('changed');
  });

  test('the eyebrow names only what the record holds', () => {
    // The file without its extension, and only when it is not the title again (owner, 03.10.2026).
    const BASE = 'Z_MM_PO_APPROVAL';
    expect(workspaceEyebrow(project())).toEqual([BASE]);
    expect(workspaceEyebrow(project({ name: 'z_mm_po_approval' }))).toEqual([]);
    expect(workspaceEyebrow(project({ s4Deployment: 'private' }))).toEqual([BASE, 'SAP Cloud ERP Private']);
    expect(
      workspaceEyebrow(project({ s4Deployment: 'private', assessmentTarget: { release: '2023 FPS02', components: [], languageVersions: [] } })),
    ).toEqual([BASE, 'SAP Cloud ERP Private 2023 FPS02']);
    // An edition the catalog lookup would assume is not stated as declared.
    expect(workspaceEyebrow({ name: 'Empty' } as Project)).toEqual([]);
  });

  test('read access and initials come from the accepted address', () => {
    expect(bizReadAccess(0)).toBe('Read access: only you');
    expect(bizReadAccess(1)).toBe('Read access: you and 1 reader');
    expect(bizReadAccess(3)).toBe('Read access: you and 3 readers');
    expect(readerInitials('mara.weber@example.com')).toBe('MW');
    expect(readerInitials('ops@example.com')).toBe('OP');
    expect(readerInitials('@')).toBe('?');
  });
});

/* -------------------------------------------------------------- rendered */

// The Business view is Analyze's page since v3.1.0 (plan AB-2, ADR-109): the map
// is the page, its code opens beside it on a click, and the workspace's head
// (eyebrow, read access, Export, Invite) is IT's and Management's.
test.describe('the Business view of a real project (Analyze, Business; mockup states 3, 7)', () => {
  test.describe.configure({ mode: 'serial' });

  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let signed = '';
  let moved = '';
  let empty = '';

  test.beforeAll(async () => {
    account = await seedStageProject({ prefix: 'wsbiz', admin: true, acceptTerms: true });
    signed = account.projectId;
    const fingerprint = { sha256: sha256Hex(SOURCE), fileName: FILE };
    await adminMergeDoc('projects', signed, {
      name: 'Emergency purchase approval',
      legacyCode: SOURCE,
      inputFingerprint: fingerprint,
      s4Deployment: 'private',
    });
    await adminMergeDoc(`projects/${signed}/runs`, account.runId, { inputFingerprint: fingerprint, legacyCode: SOURCE });

    moved = `${signed}-moved`;
    await adminSetDoc('projects', moved, {
      name: 'Source changed after signing', userId: account.uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: `${SOURCE}\n* edited\n`, activeRunId: account.runId, inputFingerprint: fingerprint,
    });

    empty = `${signed}-empty`;
    await adminSetDoc('projects', empty, { name: 'Untitled project', userId: account.uid, createdAt: new Date(), status: 'created' });
  });

  /** The old Business address, which the workspace sends on to Analyze. */
  async function open(page: Page, id: string) {
    await page.goto(`/project/${id}?view=business`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(new RegExp(`/project/${id}/analyze\\?view=business`), { timeout: 90_000 });
  }

  test('the map and its code are on the page, linked both ways, in the order of AB-2', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const writes: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && /\/api\/projects\/[^/]+\/process-map/.test(req.url())) writes.push(req.url());
    });
    await signInThroughForm(page, account);
    await open(page, signed);
    await expect(page.locator('[data-analyze-business="ready"]')).toBeVisible({ timeout: 90_000 });

    // The map, drawn from the signed source; no code before a click.
    const process = page.locator('[data-analyze-map] [data-workspace-process="ready"]');
    await expect(process).toBeVisible({ timeout: 120_000 });
    await expect(process.locator('[data-process-map]')).toBeVisible();
    await expect(page.locator('[data-analyze-code-panel]')).toHaveCount(0);
    // No layer bar: Business has one section, and it is not on this page's first screen (ADR-096, AB-2).
    await expect(page.locator('nav[data-workspace-layers]')).toHaveCount(0);

    // The order of AB-2: what the program does → the map → the first insights → Next step (interim until v3.2.0).
    const tops = await page.evaluate(() =>
      ['[data-analyze-summary]', '[data-analyze-map]', '[data-analyze-interim] [data-first-look]', '[data-analyze-interim] [data-next-step]'].map(
        (sel) => {
          const el = document.querySelector(sel);
          return el ? el.getBoundingClientRect().top + window.scrollY : -1;
        },
      ),
    );
    expect(tops.every((t) => t >= 0), `a block is missing: ${tops.join(', ')}`).toBe(true);
    for (let i = 1; i < tops.length; i++) expect(tops[i], `block ${i} stands above block ${i - 1}`).toBeGreaterThan(tops[i - 1]);
    await expect(page.locator('[data-analyze-interim] [data-next-step-variant="bar"]')).toBeVisible();

    // Step → code: a step chosen in the map's own step list opens its lines in the panel beside the map.
    await process.getByRole('radio', { name: /Steps/ }).click();
    const rows = process.locator('[data-step-node]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    await rows.nth((await rows.count()) > 1 ? 1 : 0).click();
    const panel = page.locator('[data-analyze-code-panel]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-cc-code-line="highlighted"]').first()).toBeVisible();

    // The full source scrolls to the marked lines rather than starting at line 1.
    await panel.locator('[data-workspace-source-full]').click();
    await expect(panel.locator('[data-cc-code-line="highlighted"]').first()).toBeInViewport();
    await panel.locator('[data-analyze-code-close]').click();
    await expect(panel).toHaveCount(0);

    // Code → map: a line address opens the same panel at that line.
    await page.evaluate(() => {
      window.location.hash = '#L3';
    });
    await expect(page.locator('[data-analyze-code-panel]')).toBeVisible();
    await expect(page.locator('[data-analyze-code-panel] [data-cc-code-line="highlighted"]').first()).toBeVisible();

    // Opening the page measured and stored nothing.
    expect(writes, 'Analyze, Business wrote a process-map record on open').toEqual([]);

    // App pages: the one-line legal footer, not the marketing footer.
    const footer = page.locator('footer').last();
    await expect(footer.locator('a[href="/datenschutz"]')).toBeVisible();
    await expect(footer).toContainText('Clean-Core.io');
  });

  test('the workspace head: eyebrow from the record, read access, Export of the signed BPMN, Invite', async ({ page }) => {
    // The head of the workspace stands in IT and Management since v3.1.0 (Business is Analyze's, AB-2).
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await page.goto(`/project/${signed}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-workspace-eyebrow]')).toHaveText(
      `Project · ${FILE.replace(/\.abap$/, '')} · SAP Cloud ERP Private`.toUpperCase(),
      { ignoreCase: true },
    );
    await expect(page.locator('[data-workspace-read-access="0"]')).toContainText('Read access: only you', { timeout: 60_000 });
    await page.locator('[data-workspace-export]').click();
    await expect(page.locator('[data-workspace-export-bpmn]')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.locator('[data-workspace-export-bpmn]').click();
    expect((await download).suggestedFilename()).toMatch(/\.bpmn$/);
    await page.keyboard.press('Escape');
    // Invite opens the dialog that says what it gives away.
    await page.locator('[data-workspace-invite]').click();
    await expect(page.getByRole('dialog')).toContainText(/source code/i);
    await page.keyboard.press('Escape');
  });

  test('a source that moved after signing draws no map, and says why', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, moved);
    await expect(page.locator('[data-analyze-map] [data-workspace-process="absent"][data-absence="changed"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-process-map]')).toHaveCount(0);
    // And Export (the workspace's, IT since v3.1.0) does not offer a BPMN file of bytes nobody signed.
    await page.goto(`/project/${moved}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90_000 });
    await page.locator('[data-workspace-export]').click();
    await expect(page.locator('[data-workspace-export-bpmn]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-export-bpmn-absent]')).toBeVisible();
  });

  test('an empty project: no map, and the upload path in its place (P4)', async ({ page }) => {
    // Since v3.1.0 an empty project's Business view is Analyze's upload and start path (AB-2, P4): there is
    // nothing to draw, so neither the map's absence box nor the first insights stand there.
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, empty);
    await expect(page.locator('[data-stage-title]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-analyze-business="ready"]')).toHaveCount(0);
    await expect(page.locator('[data-process-map]')).toHaveCount(0);
    await expect(page.locator('[data-first-look]')).toHaveCount(0);
    // The workspace still says what is open: Analyze is the next step, the open questions say "no source".
    await page.goto(`/project/${empty}?view=it`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-next-step-state="open"]').first()).toHaveAttribute('data-next-step-key', 'analyze');
  });

  test('on a phone the map opens as the map, at 40 % or more, with full screen — and nothing scrolls sideways (ADR-072)', async ({ browser }) => {
    test.setTimeout(300 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await signInThroughForm(page, account);
    await open(page, signed);
    const process = page.locator('[data-analyze-map] [data-workspace-process="ready"]');
    await expect(process).toBeVisible({ timeout: 120_000 });
    // The map itself, as on Documentation: fitted, never below 40 %, full
    // screen one tap away; the step list stays one tab away.
    await expect(process.getByRole('radio', { name: /Map/ })).toHaveAttribute('aria-checked', 'true');
    await expect(process.getByRole('radio', { name: /Steps/ })).toBeVisible();
    const zoom = page.locator('[data-workspace-process="ready"] [data-map-zoom]').first();
    await expect(zoom).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => Number((await zoom.innerText()).replace(/[^\d]/g, ''))).toBeGreaterThanOrEqual(40);
    await expect(page.locator('[data-workspace-process="ready"] [data-map-fullscreen-toggle], [data-workspace-process="ready"] [data-map-fullscreen]').first()).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
    await context.close();
  });
});

test.describe('the shell path', () => {
  test('My workspace is not called the Admin Console', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const account = await seedStageProject({ prefix: 'wsbizpath', admin: true, acceptTerms: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, account);
    await page.goto('/admin/workspace', { waitUntil: 'domcontentloaded' });
    const path = page.locator('header [data-shell-path]');
    await expect(path).toBeVisible({ timeout: 60_000 });
    await expect(path).not.toContainText('Admin Console');
    await expect(path).toContainText('My workspace');
  });
});

// Owner, 01.10.2026 (QA 55bcde6ea5e1): the map is the anchor of the Business
// view and stays under every layer, not only under "Need & process".
test('the Business map is not tied to the chosen layer', () => {
  // The map is Analyze, Business's page since v3.1.0 (AB-2): it has no layer to be tied to.
  const business = fs.readFileSync(path.resolve(__dirname, '..', 'components/analyze/AnalyzeBusiness.tsx'), 'utf8');
  const block = business.slice(business.indexOf('<div id={BUSINESS_MAP_ID}'), business.indexOf('<WorkspaceProcess'));
  expect(block).toContain('data-analyze-map=""');
  expect(business).not.toMatch(/currentLayer|hashLayer|layerFromHash/);
});
