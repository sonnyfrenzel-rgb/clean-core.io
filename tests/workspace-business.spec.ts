import { expect, test, type Page } from '@playwright/test';
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
    expect(workspaceEyebrow(project())).toEqual([FILE]);
    expect(workspaceEyebrow(project({ s4Deployment: 'private' }))).toEqual([FILE, 'S/4HANA Cloud Private Edition']);
    expect(
      workspaceEyebrow(project({ s4Deployment: 'private', assessmentTarget: { release: '2023 FPS02', components: [], languageVersions: [] } })),
    ).toEqual([FILE, 'S/4HANA Cloud Private Edition 2023 FPS02']);
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

test.describe('the Business view of a real project (mockup s1)', () => {
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

  async function open(page: Page, id: string) {
    await page.goto(`/project/${id}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });
  }

  test('the map and its source column are on the page, linked both ways, in the order of ADR-072', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const writes: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && /\/api\/projects\/[^/]+\/process-map/.test(req.url())) writes.push(req.url());
    });
    await signInThroughForm(page, account);
    await open(page, signed);

    // The head: eyebrow from the record, read access, Export and Invite.
    await expect(page.locator('[data-workspace-eyebrow]')).toHaveText(
      `Project · ${FILE} · S/4HANA Cloud Private Edition`.toUpperCase(),
      { ignoreCase: true },
    );
    await expect(page.locator('[data-workspace-read-access="0"]')).toContainText('Read access: only you', { timeout: 60_000 });
    await expect(page.locator('[data-workspace-export]')).toBeVisible();
    await expect(page.locator('[data-workspace-invite]')).toBeVisible();

    // The map, drawn from the signed source.
    const process = page.locator('[data-workspace-process="ready"]');
    await expect(process).toBeVisible({ timeout: 120_000 });
    await expect(process.locator('[data-process-map]')).toBeVisible();
    await expect(page.locator('[data-workspace-source-column]')).toBeVisible();

    // The map is the anchor of the view under every layer, on the screen and
    // not only in the source guard below (carried QA finding caa77476a0d2).
    // Unconditional: without another layer to switch to, the check would pass
    // without checking anything (QA finding dfec287c8150).
    const other = page.locator('nav[data-workspace-layers] button[data-workspace-layer][data-layer-state="off"]').first();
    await expect(other, 'no other layer to switch to — the check below would be vacuous').toBeVisible();
    const layerKey = await other.getAttribute('data-workspace-layer');
    await other.click();
    await expect(
      page.locator(`nav[data-workspace-layers] button[data-workspace-layer="${layerKey}"]`).first(),
    ).toHaveAttribute('data-layer-state', 'on');
    await expect(page.locator('[data-workspace-process] [data-process-map]')).toBeVisible();

    // The order since ADR-072: answer → map → Next step → layer → folded Not determined.
    const tops = await page.evaluate(() =>
      ['[data-first-look]', '[data-workspace-process]', '[data-next-step]', '[data-workspace-layer-section]', '#not-determined'].map(
        (sel) => {
          const el = document.querySelector(sel);
          return el ? el.getBoundingClientRect().top + window.scrollY : -1;
        },
      ),
    );
    expect(tops.every((t) => t >= 0), `a block is missing: ${tops.join(', ')}`).toBe(true);
    for (let i = 1; i < tops.length; i++) expect(tops[i], `block ${i} stands above block ${i - 1}`).toBeGreaterThan(tops[i - 1]);
    await expect(page.locator('[data-next-step-variant="bar"]')).toBeVisible();
    await expect(page.locator('#not-determined [data-cc-disclosure]')).toHaveAttribute('data-cc-disclosure', 'closed');

    // Code → step: a line range under "Steps by line" selects its step on the map.
    const column = page.locator('[data-workspace-source-column]');
    await column.getByRole('tab', { name: /Steps by line/ }).click();
    const firstRange = column.locator('[data-workspace-steps-by-line] [data-cc-anchor]').first();
    await firstRange.click();
    await expect(page.locator('[data-process-code-card]')).toBeVisible();
    await expect(column.locator('[data-workspace-source] [data-cc-code-line="highlighted"]').first()).toBeVisible();
    const stepName = (await column.locator('[data-workspace-source-step]').textContent())?.trim() ?? '';
    expect(stepName.length).toBeGreaterThan(0);

    // Step → code: a step chosen in the map's own step list marks its lines here.
    await process.getByRole('radio', { name: /Steps/ }).click();
    const rows = process.locator('[data-step-node]');
    if ((await rows.count()) > 1) {
      await rows.nth(1).click();
      await expect(column.locator('[data-cc-code-line="highlighted"]').first()).toBeVisible();
    }

    // The full source scrolls to the marked lines rather than starting at line 1.
    await column.locator('[data-workspace-source-full]').click();
    await expect(column.locator('[data-cc-code-line="highlighted"]').first()).toBeInViewport();

    // Export: the BPMN file of the signed source, print, and the Delivery stage.
    await page.locator('[data-workspace-export]').click();
    await expect(page.locator('[data-workspace-export-bpmn]')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.locator('[data-workspace-export-bpmn]').click();
    expect((await download).suggestedFilename()).toMatch(/\.bpmn$/);

    // Invite opens the dialog that says what it gives away.
    await page.locator('[data-workspace-invite]').click();
    await expect(page.getByRole('dialog')).toContainText(/source code/i);
    await page.keyboard.press('Escape');

    // Opening the workspace measured and stored nothing.
    expect(writes, 'the workspace wrote a process-map record on open').toEqual([]);

    // App pages: the one-line legal footer, not the marketing footer.
    const footer = page.locator('footer').last();
    await expect(footer.locator('a[href="/datenschutz"]')).toBeVisible();
    await expect(footer).toContainText('Clean-Core.io');
  });

  test('a source that moved after signing draws no map, and says why', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, moved);
    await expect(page.locator('[data-workspace-process="absent"][data-absence="changed"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-process-map]')).toHaveCount(0);
    // And Export does not offer a BPMN file of bytes nobody signed.
    await page.locator('[data-workspace-export]').click();
    await expect(page.locator('[data-workspace-export-bpmn]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-export-bpmn-absent]')).toBeVisible();
  });

  test('an empty project: no map box repeating the empty layer, the absence open, Analyze next', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, empty);
    await expect(page.locator('[data-workspace-process="absent"][data-absence="no-source"]')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('[data-process-map]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-layer-absent="need"]')).toBeVisible();
    await expect(page.locator('[data-not-determined-state="no-source"]')).toBeVisible();
    await expect(page.locator('[data-next-step-state="open"]')).toHaveAttribute('data-next-step-key', 'analyze');
  });

  test('on a phone the map opens as the map, at 40 % or more, with full screen — and nothing scrolls sideways (ADR-072)', async ({ browser }) => {
    test.setTimeout(300 * 1000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await signInThroughForm(page, account);
    await open(page, signed);
    const process = page.locator('[data-workspace-process="ready"]');
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
  const shell = fs.readFileSync(path.resolve(__dirname, '..', 'components/workspace/WorkspaceShell.tsx'), 'utf8');
  const block = shell.slice(shell.indexOf('    process:'), shell.indexOf('data-workspace-process-block'));
  expect(block).toContain("view === 'business' ? (");
  expect(block).not.toMatch(/currentLayer === 'need'|hashLayer === null/);
});
