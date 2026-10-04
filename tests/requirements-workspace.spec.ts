import { test, expect, type Page, type Browser } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminGetDoc, adminSetDoc as seedDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { TERMS_VERSION } from '../lib/constants';

/**
 * The requirements workspace of the Design tool on screen (ADR-078): the card
 * on Design opens it; the owner starts it, edits a requirement with the
 * formatting bar, decides, and every change is saved and survives a reload;
 * full text is entered and left by its button, Escape and Back; the exports
 * carry the edit, escaped, with the provenance words; an invited reader reads
 * and cannot write; a phone reads and decides without a sideways scroll; the
 * demo shows the engine's draft and stores nothing. No model is called.
 *
 * Screenshots for the owner's eyes go to `test-results/requirements-workspace/`.
 */

const PASSWORD = 'ReqSpace123!';
const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const OWNER = `reqws-owner-${STAMP}@cleancore-test.io`;
const READER = `reqws-reader-${STAMP}@cleancore-test.io`;
const PROJECT = `reqws-${STAMP}`;
const SHOTS = path.join(__dirname, '..', 'test-results', 'requirements-workspace');
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');

async function adminSetDoc(collection: string, id: string, data: Record<string, unknown>) {
  try {
    await seedDoc(collection, id, data);
  } catch (err) {
    if (!(await adminGetDoc(collection, id))) throw err;
  }
}

/** Every model call fails loudly here — and is counted. */
async function noModel(page: Page): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/api/gemini**', (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 500, body: '{"error":"no model in this spec"}' });
  });
  return calls;
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

async function openWorkspace(page: Page) {
  await page.goto(`/project/${PROJECT}/design/requirements`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-spec-workspace]')).toBeVisible({ timeout: 120_000 });
}

const saved = (page: Page) => expect(page.locator('[data-spec-toolbar] [data-spec-save]')).toHaveAttribute('data-spec-save', 'saved', { timeout: 30_000 });

async function signedInPage(browser: Browser, email: string, width = 1440, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  const page = await context.newPage();
  await signInViaLanding(page, email, PASSWORD);
  return { context, page };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
  const auth = getAuth(app);
  try { connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* connected */ }
  const make = async (email: string) => {
    const uid = (await createUserWithEmailAndPassword(auth, email, PASSWORD)).user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Req', lastName: 'Space', email, tier: 'pilot', status: 'approved',
      termsVersionAccepted: TERMS_VERSION, transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    return uid;
  };
  const owner = await make(OWNER);
  const reader = await make(READER);
  const fingerprint = { sha256: sha256Hex(SOURCE), fileName: 'Z_MM_PO_APPROVAL.abap', lineCount: SOURCE.split('\n').length, byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString() };
  const runId = `${PROJECT}-run`;
  await adminSetDoc('projects', PROJECT, {
    name: 'Emergency purchase approval', userId: owner, readers: [reader], createdAt: new Date(), status: 'analyzed', s4Deployment: 'private',
    legacyCode: SOURCE, analysis: JSON.stringify({ cleanCoreScore: 60 }), cleanCoreScore: 60,
    solutionDesign: '# Target architecture\n\nFixture.\n', activeRunId: runId, inputFingerprint: fingerprint, auditMetadata: { inputFingerprint: fingerprint },
  });
  const unsigned = { runId, projectId: PROJECT, userId: owner, createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint };
  const runHash = recomputeStoredRunHash(unsigned);
  await adminSetDoc(`projects/${PROJECT}/runs`, runId, { ...unsigned, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!) });
});

test('Design shows one card; the workspace opens on its own address and starts on a click', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  const calls = await noModel(page);
  await page.goto(`/project/${PROJECT}/design`, { waitUntil: 'domcontentloaded' });
  const card = page.locator('[data-spec-card]');
  await expect(card).toBeVisible({ timeout: 120_000 });
  await expect(card).toHaveAttribute('data-spec-card', 'not-started');
  await expect(card.locator('[data-spec-card-cost]')).toContainText('not counted against analysis runs');
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'card-1440');
  await card.locator('[data-spec-open]').click();
  await expect(page).toHaveURL(new RegExp(`/project/${PROJECT}/design/requirements$`), { timeout: 60_000 });
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-state', 'not-started', { timeout: 120_000 });
  expect(await adminGetDoc(`projects/${PROJECT}/requirements_spec`, 'current'), 'nothing is stored before the click').toBeFalsy();

  await page.locator('[data-spec-start]').click();
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-state', 'ready', { timeout: 60_000 });
  await saved(page);
  const stored = await adminGetDoc(`projects/${PROJECT}/requirements_spec`, 'current');
  expect(stored?.revision).toBe(1);
  expect(stored?.history?.[0]?.change).toBe('Started the specification from the code');
  // The document: title page, the nine sections, the requirements with their lines.
  for (let n = 1; n <= 9; n++) await expect(page.locator(`#spec-s${n}`)).toBeVisible();
  await expect(page.locator('[data-spec-req="FR-001"] [data-spec-req-lines]')).toHaveText(/^L\d+/);
  await expect(page.locator('[data-spec-req-kind="non-functional"]').first()).toBeVisible();
  await expect(page.locator('[data-spec-figure="open"] [data-spec-figure-value]')).not.toHaveText('0');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'workspace-top-1440');
  expect(calls).toEqual([]);
  await context.close();
});

test('the owner edits a requirement with the formatting bar and sets its status; it survives a reload', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await openWorkspace(page);
  const req = page.locator('[data-spec-req="FR-001"]');
  await req.locator('[data-spec-req-edit="FR-001"]').click();
  const editor = page.locator('[data-spec-req-editor="FR-001"]');
  const input = editor.locator('textarea[data-spec-req-statement-input]');
  await input.fill('The system shall process only document type NB.');
  // Select "NB" and make it bold with the bar.
  await input.evaluate((el: HTMLTextAreaElement) => {
    const at = el.value.indexOf('NB');
    el.setSelectionRange(at, at + 2);
  });
  await editor.locator('[data-rich-tool="bold"]').first().click();
  await expect(input).toHaveValue('The system shall process only document type **NB**.');
  await req.scrollIntoViewIfNeeded();
  await shot(page, 'editing-1440');
  await editor.locator('[data-spec-req-done="FR-001"]').click();
  await expect(req.locator('[data-spec-req-statement] strong')).toHaveText('NB');
  await page.getByLabel('Status of FR-001').selectOption('accepted');
  await expect(req).toHaveAttribute('data-spec-req-status', 'accepted');
  await saved(page);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-state', 'ready', { timeout: 120_000 });
  const again = page.locator('[data-spec-req="FR-001"]');
  await expect(again.locator('[data-spec-req-statement] strong')).toHaveText('NB');
  await expect(again).toHaveAttribute('data-spec-req-status', 'accepted');
  const stored = await adminGetDoc(`projects/${PROJECT}/requirements_spec`, 'current');
  const fr1 = (stored?.spec?.requirements as Array<{ id: string; statement: string }>).find((r) => r.id === 'FR-001');
  expect(fr1?.statement).toBe('The system shall process only document type **NB**.');
  await context.close();
});

test('a decision is recorded in its dialog, lowers the open count and is stamped with the account', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await openWorkspace(page);
  const count = page.locator('[data-spec-figure="open"] [data-spec-figure-value]');
  const before = Number(await count.textContent());
  await page.locator('[data-spec-decide-next]').click();
  const dialog = page.locator('[data-spec-decision-dialog]');
  await expect(dialog).toBeVisible();
  const id = (await dialog.getAttribute('data-spec-decision-dialog'))!;
  await shot(page, 'decision-dialog-1440');
  // "Another answer", with a value of one's own.
  await dialog.getByLabel('Another answer').check();
  await dialog.getByLabel('Your answer').fill('All rows from 2024 onwards');
  await dialog.locator('[data-spec-decision-record]').click();
  await expect(dialog).toBeHidden();
  await expect(count).toHaveText(String(before - 1));
  await saved(page);
  const card = page.locator(`[data-spec-decision="${id}"]`);
  await expect(card).toHaveAttribute('data-spec-decision-open', 'false');
  await expect(card.locator('[data-spec-decision-answer]')).toContainText(OWNER, { timeout: 30_000 });

  // "Decide later" keeps the next one open.
  await page.locator('[data-spec-decide-next]').click();
  await dialog.getByLabel('Decide later').check();
  await dialog.locator('[data-spec-decision-record]').click();
  await expect(count).toHaveText(String(before - 1));
  await saved(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(`[data-spec-decision="${id}"]`)).toHaveAttribute('data-spec-decision-open', 'false', { timeout: 120_000 });
  await expect(page.locator('[data-spec-figure="open"] [data-spec-figure-value]')).toHaveText(String(before - 1));
  await page.locator('#spec-s8').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-spec-trace-row]').first()).toBeVisible();
  await shot(page, 'trace-matrix-1440');
  await context.close();
});

test('full text: entered by its button, left by Escape and by Back, the address unchanged', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await openWorkspace(page);
  const root = page.locator('[data-spec-fulltext-root]');
  await page.locator('[data-spec-fulltext="enter"]').first().click();
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'on');
  await expect(page.locator('[data-spec-fulltext="leave"]')).toBeFocused();
  // The contents navigate inside the full text without leaving it.
  await root.locator('[data-spec-toc-link="spec-s7"]').click();
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'on');
  await shot(page, 'fulltext-1440');
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'off');

  await page.locator('[data-spec-fulltext="enter"]').first().click();
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'on');
  await page.goBack();
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'off');
  await expect(page).toHaveURL(new RegExp(`/project/${PROJECT}/design/requirements$`));

  await page.locator('[data-spec-fulltext="enter"]').first().click();
  await page.locator('[data-spec-fulltext="leave"]').click();
  await expect(root).toHaveAttribute('data-spec-fulltext-root', 'off');
  await context.close();
});

test('the exports carry the edit, escaped, with the provenance words; Word opens as a package', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await openWorkspace(page);
  const text = async (kind: string) => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.locator(`[data-spec-export="${kind}"]`).click()]);
    return { name: d.suggestedFilename(), body: fs.readFileSync((await d.path())!) };
  };
  const md = await text('md');
  expect(md.name).toMatch(/_requirements_specification\.md$/);
  const markdown = md.body.toString('utf8');
  expect(markdown).toContain('The system shall process only document type **NB**.');
  expect(markdown).toContain('7. Open decisions');
  expect(markdown).toContain('8. Traceability matrix');
  expect(markdown).toContain('Reconstructed from the code — not confirmed');
  expect(markdown).toContain('not part of the signed audit pack');

  const html = (await text('html')).body.toString('utf8');
  expect(html).toContain('<strong>NB</strong>');
  expect(html).not.toMatch(/<script/i);

  const docx = await text('docx');
  expect(docx.name).toMatch(/\.docx$/);
  const zip = await JSZip.loadAsync(docx.body);
  const document = await zip.file('word/document.xml')!.async('string');
  expect(document).toContain('FR-001');
  expect(document).toContain('<w:b/>');
  await context.close();
});

test('a failed save says so and keeps the edit; Retry stores it', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await openWorkspace(page);
  await page.route(`**/api/projects/${PROJECT}/requirements-spec`, (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{"error":"Could not store the requirements specification."}' }) : route.continue(),
  );
  await page.getByLabel('Status of FR-002').selectOption('rejected');
  await expect(page.locator('[data-spec-toolbar] [data-spec-save]')).toHaveAttribute('data-spec-save', 'failed', { timeout: 30_000 });
  await expect(page.locator('[data-spec-save-retry-strip]')).toBeVisible();
  await page.unroute(`**/api/projects/${PROJECT}/requirements-spec`);
  await page.locator('[data-spec-save-retry-strip]').click();
  await saved(page);
  const stored = await adminGetDoc(`projects/${PROJECT}/requirements_spec`, 'current');
  expect((stored?.spec?.requirements as Array<{ id: string; status: string }>).find((r) => r.id === 'FR-002')?.status).toBe('rejected');
  await context.close();
});

test('Delivery lists the specification among the artefacts — what it holds, never as proven', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER);
  await noModel(page);
  await page.goto(`/project/${PROJECT}/delivery`, { waitUntil: 'domcontentloaded' });
  const line = page.locator('[data-delivery-spec]');
  await expect(line).toBeVisible({ timeout: 120_000 });
  await expect(line).toContainText(/Requirements specification: \d+ requirements \(\d+ functional, \d+ non-functional\), \d+ open decisions?\./);
  await expect(line).toContainText('Not part of the signed audit pack.');
  const card = line.locator('xpath=ancestor::li[1]');
  await expect(card.locator('[data-provenance="proven"]')).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await shot(page, 'delivery-1440');
  await context.close();
});

test('an invited reader reads, opens a decision and exports — and writes nothing', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, READER);
  await noModel(page);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/requirements-spec')) posts.push(r.url());
  });
  await page.goto(`/project/${PROJECT}/design`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-spec-card]')).toHaveAttribute('data-spec-card', /draft|ready/, { timeout: 120_000 });
  await openWorkspace(page);
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-mode', 'reader');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'reader-top-1440');
  await expect(page.locator('[data-spec-req="FR-001"] [data-spec-req-statement] strong')).toHaveText('NB', { timeout: 60_000 });
  await expect(page.locator('[data-spec-req-edit]')).toHaveCount(0);
  await expect(page.locator('[data-spec-edit]')).toHaveCount(0);
  await expect(page.locator('[data-spec-add]')).toHaveCount(0);
  await page.locator('[data-spec-decide]').first().click();
  const dialog = page.locator('[data-spec-decision-dialog]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-spec-decision-record]')).toHaveCount(0);
  await shot(page, 'reader-decision-1440');
  await page.keyboard.press('Escape');
  const [d] = await Promise.all([page.waitForEvent('download'), page.locator('[data-spec-export="md"]').click()]);
  expect(d.suggestedFilename()).toMatch(/\.md$/);
  await page.waitForTimeout(1_500);
  expect(posts).toEqual([]);
  await context.close();
});

test('on a phone the owner reads and decides, with no sideways scroll', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await signedInPage(browser, OWNER, 390, 844);
  await noModel(page);
  await openWorkspace(page);
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-state', 'ready', { timeout: 120_000 });
  await expect(page.locator('[data-spec-req-edit="FR-001"]')).toBeHidden();
  await expect(page.locator('[data-spec-decide]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  await shot(page, 'workspace-top-390');
  await page.locator('#spec-s3').scrollIntoViewIfNeeded();
  await shot(page, 'requirements-390');
  await page.locator('#spec-s8').scrollIntoViewIfNeeded();
  await shot(page, 'trace-matrix-390');
  const after = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(after).toBeLessThanOrEqual(0);
  await page.goto(`/project/${PROJECT}/design`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-spec-card]').scrollIntoViewIfNeeded({ timeout: 120_000 });
  await shot(page, 'card-390');
  await context.close();
});

test('the demo shows the engine’s draft read-only and stores nothing', async ({ page }) => {
  test.setTimeout(300_000);
  const calls = await noModel(page);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/')) posts.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/design', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 90_000 });
  await page.locator('[data-spec-card] [data-spec-open]').click();
  await expect(page).toHaveURL(/\/demo\/design\/requirements$/);
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-mode', 'demo', { timeout: 90_000 });
  await expect(page.locator('[data-spec-workspace]')).toHaveAttribute('data-spec-state', 'ready', { timeout: 90_000 });
  await expect(page.locator('[data-spec-req]').first()).toBeVisible();
  await expect(page.locator('[data-spec-export]')).toHaveCount(0);
  await expect(page.locator('[data-spec-req-edit]')).toHaveCount(0);
  await shot(page, 'demo-1440');
  expect(calls).toEqual([]);
  expect(posts).toEqual([]);
});
