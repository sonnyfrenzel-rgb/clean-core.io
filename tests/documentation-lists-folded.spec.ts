import { test, expect, type Locator, type Page } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { buildDemoProject } from '../lib/demo-project';
import {
  LONG_LIST_ROWS,
  couplingSummary,
  gapsSummary,
  inventorySummary,
  isLongList,
  statementsSummary,
  stepsSummary,
} from '../lib/documentation-lists';

/**
 * Owner feedback 02.10.2026 on the Documentation stage (translated): "leave the
 * long lists folded by default, those are details most users don't need but
 * that should be there".
 *
 * One rule for every list on the stage (`lib/documentation-lists.ts`): more than
 * five rows and it starts folded — heading, count and one line computed from
 * the same rows stay visible; five or fewer and it is open. Opening shows every
 * row. Folded is not removed: on paper everything is open, and the Confluence
 * export carries every row.
 *
 * Tested three ways: the summaries as data over the shipped example, the
 * signed-in stage on a seeded project with a stored engine documentation, and
 * the public demo.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'Z_MM_PO_APPROVAL.abap';
const SOURCE = fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', FILE), 'utf8').replace(/\r\n/g, '\n');

function documentOf(source: string) {
  const bpmn = buildBpmnExportFromSource(source, { processName: FILE, sourceFileName: FILE });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: FILE });
  return buildProcessDocumentation({ source, map });
}

/** Every `[data-doc-list]` on the page: the long ones closed with a summary, the short ones open. */
async function expectTheRule(page: Page): Promise<{ long: string[]; short: string[] }> {
  // The lists on screen; the drawer's tabs hold a second copy of In and Out
  // behind a tab that is not selected.
  const lists = page.locator('[data-doc-list]:visible');
  const n = await lists.count();
  expect(n, 'no list on the page carries the rule').toBeGreaterThan(0);
  const long: string[] = [];
  const short: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const list = lists.nth(i);
    const name = (await list.getAttribute('data-doc-list')) ?? '';
    const trigger = list.locator('[data-cc-disclosure-trigger]').first();
    const disclosure = list.locator('[data-cc-disclosure]').first();
    const region = list.locator('[data-cc-disclosure-region]').first();
    const count = Number((await trigger.innerText()).match(/\((\d+)\)/)?.[1] ?? NaN);
    expect(Number.isFinite(count), `${name}: the closed state shows no count`).toBe(true);
    if ((await list.getAttribute('data-doc-list-long')) === 'true') {
      expect(count, `${name}: folded with ${count} rows`).toBeGreaterThan(LONG_LIST_ROWS);
      await expect(disclosure).toHaveAttribute('data-cc-disclosure', 'closed');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(region).toBeHidden();
      const summary = list.locator('[data-cc-disclosure-summary]').first();
      await expect(summary, `${name}: no one-line summary while closed`).toBeVisible();
      expect((await summary.innerText()).trim().length).toBeGreaterThan(0);
      // Native button, named region, summary as its description.
      expect(await trigger.evaluate((el) => el.tagName)).toBe('BUTTON');
      const controls = await trigger.getAttribute('aria-controls');
      expect(await region.getAttribute('id')).toBe(controls);
      expect(await trigger.getAttribute('aria-describedby')).toBe(await summary.getAttribute('id'));
      long.push(name);
    } else {
      expect(count, `${name}: open with ${count} rows`).toBeLessThanOrEqual(LONG_LIST_ROWS);
      await expect(disclosure).toHaveAttribute('data-cc-disclosure', 'open');
      await expect(region).toBeVisible();
      short.push(name);
    }
  }
  return { long, short };
}

async function open(list: Locator): Promise<void> {
  await list.locator('[data-cc-disclosure-trigger]').first().click();
  await expect(list.locator('[data-cc-disclosure-region]').first()).toBeVisible();
  await expect(list.locator('[data-cc-disclosure-trigger]').first()).toHaveAttribute('aria-expanded', 'true');
}

test.describe('the rule and its summaries, as data', () => {
  test('long is more than five rows', () => {
    expect(LONG_LIST_ROWS).toBe(5);
    expect(isLongList(5)).toBe(false);
    expect(isLongList(6)).toBe(true);
  });

  test('the coupling summary counts the cards it stands for', () => {
    const coupling = buildDemoProject().documentation.coupling;
    expect(coupling.length).toBeGreaterThan(LONG_LIST_ROWS);
    const line = couplingSummary(coupling);
    const written = coupling.filter((e) => e.accessType === 'Write' || e.accessType === 'Read/Write');
    const custom = written.filter((e) => e.isCustom).length;
    expect(line).toContain(`${written.length} written (`);
    if (custom) expect(line).toContain(`${custom} custom`);
    if (written.length - custom) expect(line).toContain(`${written.length - custom} SAP standard`);
    expect(line).toContain(`${coupling.filter((e) => e.accessType === 'Read').length} read`);
    expect(line).toContain(`· ${coupling.filter((e) => e.riskLevel === 'High').length} high risk`);
    // The owner's example, in its shape.
    expect(couplingSummary([
      { accessType: 'Write', isCustom: true, riskLevel: 'High' },
      { accessType: 'Write', isCustom: true, riskLevel: 'High' },
      { accessType: 'Read/Write', isCustom: false, riskLevel: 'High' },
      { accessType: 'Read', isCustom: false, riskLevel: 'Medium' },
    ])).toBe('3 written (2 custom, 1 SAP standard), 1 read · 3 high risk');
  });

  test('the inventory, steps, statements and gaps summaries add up to their rows', () => {
    const inventory = buildDemoProject().documentation.inventory;
    const types = new Set(inventory.map((o) => o.type));
    const inv = inventorySummary(inventory);
    for (const type of types) expect(inv).toContain(`${type} ${inventory.filter((o) => o.type === type).length}`);

    const doc = documentOf(SOURCE);
    const kinds = new Set(doc.steps.map((s) => s.kind));
    const steps = stepsSummary(doc.steps);
    const sum = [...kinds].reduce((n, kind) => {
      const m = steps.match(new RegExp(`${kind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)`));
      return n + Number(m?.[1] ?? 0);
    }, 0);
    expect(sum, 'the kinds in the summary do not add up to the steps').toBe(doc.steps.length);
    expect(statementsSummary(doc.statements)).toMatch(/^in program order · /);
    expect(gapsSummary(doc.notDetermined)).toContain(doc.notDetermined[0].subject);
  });
});

test.describe('the signed-in Documentation stage', () => {
  const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const EMAIL = `doc-lists-${STAMP}@cleancore-test.io`;
  const PASSWORD = 'DocLists123!';
  const PROJECT_ID = `doc-lists-${STAMP}`;
  const RUN_ID = `doc-lists-run-${STAMP}`;
  const doc = documentOf(SOURCE);

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
      firstName: 'Doc', lastName: 'Lists', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 50, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FILE, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Folded lists fixture', userId: uid, createdAt: new Date(), status: 'documented',
      legacyCode: SOURCE,
      analysis: JSON.stringify({ cleanCoreScore: 62, standardFit: { potential: 'Medium' } }),
      cleanCoreScore: 62,
      solutionDesign: '# Target architecture\n\nSide-by-side on BTP.\n',
      generatedCode: 'export const ok = true;\n',
      documentation: JSON.stringify(doc),
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
    });
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
      inputFingerprint: fingerprint,
    });
  });

  test('long lists start folded with count and summary, open to every row, and print and export in full', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-engine-documentation]')).toBeAttached({ timeout: 90000 });
    // The handbook's In and Out under the map are read from the source; wait for them too.
    await expect(page.locator('[data-handbook-io]').first()).toBeAttached({ timeout: 90000 });

    // The premise: this example has long lists and short ones.
    expect(doc.steps.length).toBeGreaterThan(LONG_LIST_ROWS);
    expect(doc.statements.length).toBeGreaterThan(LONG_LIST_ROWS);

    const { long, short } = await expectTheRule(page);
    expect(long).toEqual(expect.arrayContaining(['steps', 'statements']));
    expect(short.length, 'no short list stayed open — the rule was not tested both ways').toBeGreaterThan(0);

    // The owner's question answered while closed: the steps summary is the data's.
    const steps = page.locator('[data-doc-list="steps"]');
    await expect(steps.locator('[data-cc-disclosure-trigger]')).toContainText(`(${doc.steps.length})`);
    await expect(steps.locator('[data-cc-disclosure-summary]')).toHaveText(stepsSummary(doc.steps));
    const statements = page.locator('[data-doc-list="statements"]');
    await expect(statements.locator('[data-cc-disclosure-summary]')).toHaveText(statementsSummary(doc.statements));

    // Print: every folded list is on paper, every row of it.
    await page.emulateMedia({ media: 'print' });
    for (const name of long) {
      await expect(page.locator(`[data-doc-list="${name}"] [data-cc-disclosure-region]`).first()).toBeVisible();
    }
    await expect(steps.locator('[data-doc-step]').first()).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await expect(steps.locator('[data-cc-disclosure-region]')).toBeHidden();

    // Opening shows the list unchanged: every row.
    await open(steps);
    await expect(steps.locator('[data-doc-step]')).toHaveCount(doc.steps.length);
    await expect(steps.locator('[data-doc-step]').last()).toBeVisible();
    await open(statements);
    await expect(statements.locator('[data-cc-disclosure-region] ul > li')).toHaveCount(doc.statements.length);
    await expect(statements).toContainText('50000.00');
    // And it closes again with the keyboard.
    const trigger = steps.locator('[data-cc-disclosure-trigger]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The Confluence export carries every row, folded or not.
    const button = page.getByRole('button', { name: /Export Confluence/ });
    await expect(button).toBeEnabled({ timeout: 60000 });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()]);
    const file = path.join(os.tmpdir(), `cc-doc-lists-${PROJECT_ID}.html`);
    await download.saveAs(file);
    const html = fs.readFileSync(file, 'utf8');
    fs.unlinkSync(file);
    const table = html.slice(html.indexOf('<h2>The process, element by element</h2>'), html.indexOf('<h2>Business statements'));
    expect(table.match(/<tr><td><code>/g)?.length, 'the export lost element rows').toBe(doc.steps.length);
    const list = html.slice(html.indexOf('<h2>Business statements'), html.indexOf('<h2>Not determined'));
    expect(list.match(/<li>/g)?.length, 'the export lost statements').toBe(doc.statements.length);
  });
});

test.describe('the demo Documentation stage', () => {
  test('the inventory and the coupled tables start folded with count and summary, and open in full', async ({ page }) => {
    test.setTimeout(180 * 1000);
    const demo = buildDemoProject();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/demo/documentation', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-demo-ready="true"]')).toBeAttached({ timeout: 60000 });

    expect(demo.documentation.coupling.length).toBeGreaterThan(LONG_LIST_ROWS);
    expect(demo.documentation.inventory.length).toBeGreaterThan(LONG_LIST_ROWS);
    const { long } = await expectTheRule(page);
    expect(long).toEqual(expect.arrayContaining(['inventory', 'coupling']));

    const coupling = page.locator('[data-doc-list="coupling"]');
    await expect(coupling.locator('[data-cc-disclosure-trigger]')).toContainText('Tables this program is coupled to');
    await expect(coupling.locator('[data-cc-disclosure-trigger]')).toContainText(`(${demo.documentation.coupling.length})`);
    await expect(coupling.locator('[data-cc-disclosure-summary]')).toHaveText(couplingSummary(demo.documentation.coupling));
    const inventory = page.locator('[data-doc-list="inventory"]');
    await expect(inventory.locator('[data-cc-disclosure-summary]')).toHaveText(inventorySummary(demo.documentation.inventory));

    // On paper both are open.
    await page.emulateMedia({ media: 'print' });
    await expect(coupling.locator('li').last()).toBeVisible();
    await expect(inventory.locator('[data-testid="demo-inventory"]')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    await open(coupling);
    await expect(coupling.locator('[data-cc-disclosure-region] li')).toHaveCount(demo.documentation.coupling.length);
    await expect(coupling.locator('[data-cc-disclosure-region] li').last()).toBeVisible();
    await open(inventory);
    await expect(inventory.locator('[data-testid="demo-inventory"] tbody tr')).toHaveCount(demo.documentation.inventory.length);
  });
});
