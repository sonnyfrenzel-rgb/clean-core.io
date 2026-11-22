import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { exampleTiers } from '../lib/example-catalog';
import { countSourceLines } from '../lib/source-lines';
import { PHASES } from '../lib/workflow-steps';
import { leaveHomeStart, leaveRedesignAfterAnalysis, pastedFileName, takeHomeStart, takeRedesignAfterAnalysis } from '../lib/home-start-handoff';
import { WORKSPACE_PAGE_MESSAGES } from '../lib/messages/workspace';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { verifyRunIntegrity } from '../lib/run-signature';
import { signInViaLanding } from './helpers/sign-in';
import { layoutCheck, layoutClean, PRODUCT_LAYOUT } from './helpers/overlap';

/**
 * AB-14a — the first view of a new account (home mockup v2.1, state 1;
 * `docs/design/analyze-business-first-plan.md`, AB-14a).
 *
 * Server-free half: no map on the view and no slice of the demo map left in
 * the code (3.3.0, ADR-123 (5); removed 14.11.2026), the path's names are the tool bar's,
 * every shipped example is offered with the line count of its file, the page
 * claims no duration (H-O2), and the start's one filled button is "Start this
 * example" (H-O15).
 *
 * Rendered half (needs the app and the emulators): a fresh account lands on
 * the view and sees exactly that, at the six viewports of the mockup, with
 * nothing covering anything.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOME_FILES = [
  'components/workspace/HomeFirstView.tsx',
  'components/workspace/HomeStartParts.tsx',
  'components/workspace/ToolPathStrip.tsx',
];

/* --------------------------------------------------------------- server-free */

test.describe('no map on My workspace (ADR-123 (5))', () => {
  test('3.3.0: the slice of the demo map is gone — its files, its cut and every import of them (owner decision 14.11.2026)', () => {
    // AB-14a drew four elements of the demo map on a new account's first view. 3.3.0 draws no map there, and the
    // owner removed the unused slice: its loader, its canvas and the model cut that only it used.
    for (const gone of ['lib/home-map-slice.ts', 'components/process-map/MapSlice.tsx', 'lib/bpmn/slice.ts']) {
      expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
    }
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.(?:ts|tsx|mjs)$/.test(e.name) && /(?:from|import\()\s*['"][^'"]*(?:home-map-slice|process-map\/MapSlice|bpmn\/slice)['"]/.test(code(rel))) offenders.push(rel);
      }
    };
    for (const d of ['app', 'components', 'hooks', 'lib', 'scripts', 'tests']) walk(d);
    expect(offenders).toEqual([]);
    // The export has no view hook left for a cut: what it lays out is the whole model.
    expect(code('lib/bpmn/export.ts')).not.toMatch(/options\.view\b/);
  });

  test('3.3.0: My workspace draws no map — no bpmn-js, no slice, on the page (ADR-123 (5))', () => {
    for (const f of [...HOME_FILES, 'components/workspace/WorkspaceListReport.tsx', 'components/MyWorkspaceSwitch.tsx', 'app/(app)/dashboard/layout.tsx']) {
      const src = code(f);
      expect(src, f).not.toContain('MapSlice');
      expect(src, f).not.toContain('bpmn-js');
      expect(src, f).not.toContain('homeMapSlice');
    }
  });
});

test.describe('two equal products (ADR-123)', () => {
  test('the six re-design tools: names and order are the tool bar\'s, never written twice, nothing "optional"', () => {
    const strip = code('components/workspace/ToolPathStrip.tsx');
    expect(strip).toContain("import { PHASES } from '@/lib/workflow-steps'");
    expect(strip).toContain('PHASES.slice(1)');
    const home = Object.entries(WORKSPACE_PAGE_MESSAGES).filter(([k]) => k.startsWith('home.')).map(([, v]) => v).join('\n');
    expect(home).not.toMatch(/optional/i);
    expect(home).not.toMatch(/launchpad/i);
    // Both products have a card and a cost line (W8).
    const view = code('components/workspace/HomeFirstView.tsx');
    expect(view).toContain('data-home-product="analyse"');
    expect(view).toContain('data-home-product="redesign"');
    expect(WORKSPACE_PAGE_MESSAGES['home.analyse.cost']).toBe('1 analysis run per program');
    expect(WORKSPACE_PAGE_MESSAGES['home.redesign.cost']).toBe('Not counted against your runs');
    for (const p of PHASES) expect(strip, `"${p.label}" is written into the strip`).not.toContain(`'${p.label}'`);
    for (const p of PHASES) expect(strip).not.toMatch(new RegExp(`>\\s*${p.label}\\s*<`));
    // A purpose line for every tool, and none for a tool that does not exist.
    const keys = Object.keys(WORKSPACE_PAGE_MESSAGES).filter((k) => k.startsWith('home.path.'));
    expect(keys.sort()).toEqual(PHASES.map((p) => `home.path.${p.key}`).sort());
  });
});

test.describe('the start', () => {
  test('every shipped example is offered, with the line count of its file', () => {
    const tiers = exampleTiers();
    const offered = [tiers.startHere, ...tiers.next.map((n) => n.example), ...tiers.more];
    expect(offered.map((e) => e.name).sort()).toEqual(STARTER_EXAMPLES.map((e) => e.name).sort());
    expect(offered).toHaveLength(7);
    expect(tiers.startHere.name).toBe('Z_MM_PO_APPROVAL');
    for (const e of STARTER_EXAMPLES) {
      expect(e.lines, e.file).toBe(countSourceLines(read(`public/starter-examples/${e.file}`)));
    }
  });

  test('one filled button: "Start this example" (H-O15); "Choose a file" is not filled', () => {
    const examples = code('components/StarterExamples.tsx');
    const home = examples.slice(examples.indexOf("if (variant === 'home')"), examples.indexOf("if (variant === 'home')") + 12_000);
    const branch = home.slice(0, home.indexOf('\n  return ('));
    expect(branch.match(/'primary'/g) ?? []).toHaveLength(1);
    expect(branch).toMatch(/variant=\{homePrimary \? 'primary' : 'secondary'\}[\s\S]{0,400}home\.startExample/);
    const view = code('components/workspace/HomeFirstView.tsx');
    // The view's own primary is the banner's after the demo (W7), and the example's start is secondary exactly then.
    expect(view.match(/variant="primary"/g) ?? []).toHaveLength(1);
    expect(view).toMatch(/fromDemo \? \(\s*<div\s+data-home-from-demo/);
    expect(view).toContain('homePrimary={!fromDemo}');
    expect(view).toMatch(/variant="secondary"[\s\S]{0,200}data-home-redesign-example/);
    expect(code('components/workspace/HomeStartParts.tsx')).toMatch(/variant="ghost"[\s\S]{0,200}data-home-choose-file/);
    expect(WORKSPACE_PAGE_MESSAGES['home.startExample']).toBe('Start this example');
  });

  test('no duration is claimed until H-O2 is measured', () => {
    const home = Object.entries(WORKSPACE_PAGE_MESSAGES)
      .filter(([k]) => k.startsWith('home.'))
      .map(([, v]) => v)
      .join('\n');
    expect(home).not.toMatch(/\bseconds?\b|\bminutes?\b|\b\d+\s*s\b/i);
    for (const f of HOME_FILES) expect(code(f)).not.toMatch(/\bseconds?\b|about \d+/i);
  });

  test('the own file goes on to today\'s start, preset, once', () => {
    const file = new File(['REPORT z_po_check.'], 'z_po_check.abap');
    leaveHomeStart({ kind: 'files', files: [file] });
    const taken = takeHomeStart();
    expect(taken).toEqual({ kind: 'files', files: [file] });
    expect(takeHomeStart()).toBeNull();
    leaveHomeStart({ kind: 'files', files: [] });
    expect(takeHomeStart()).toBeNull();
    leaveHomeStart({ kind: 'paste' });
    expect(takeHomeStart()).toEqual({ kind: 'paste' });
    // The start takes it, and nothing on the home page reads the file.
    expect(code('components/workspace/OwnCodeImport.tsx')).toContain('takeHomeStart()');
    expect(code('components/workspace/HomeStartParts.tsx')).not.toMatch(/\.text\(\)|FileReader|arrayBuffer/);
  });

  test('"Re-design an example end to end" travels as an intent in module memory, once, and Analyze opens Design on it (W4)', () => {
    expect(takeRedesignAfterAnalysis('p1')).toBe(false);
    leaveRedesignAfterAnalysis('p1');
    expect(takeRedesignAfterAnalysis('p2')).toBe(false);
    expect(takeRedesignAfterAnalysis('p1')).toBe(true);
    expect(takeRedesignAfterAnalysis('p1')).toBe(false);
    const examples = code('components/StarterExamples.tsx');
    expect(examples).toContain("if (afterRun.current === 'design') leaveRedesignAfterAnalysis(docRef.id);");
    const analyze = code('components/analyze/AnalyzeBusiness.tsx');
    expect(analyze).toMatch(/if \(takeRedesignAfterAnalysis\(projectId\)\) \{\s*router\.push\(`\/project\/\$\{encodeURIComponent\(projectId\)\}\/design`\);/);
  });

  test('a pasted program travels under its own name', () => {
    expect(pastedFileName('REPORT z_po_check.\nWRITE 1.')).toBe('Z_PO_CHECK.abap');
    expect(pastedFileName('  program /abc/zfoo message-id 00.')).toBe('_ABC_ZFOO.abap');
    expect(pastedFileName('CLASS zcl_x DEFINITION.')).toBe('ZCL_X.abap');
    expect(pastedFileName('WRITE 1.')).toBe('PASTED_CODE.abap');
  });

  test('a new account gets the view only once both lists answered empty; a failed list keeps today\'s page', () => {
    const list = code('components/workspace/WorkspaceListReport.tsx');
    expect(list).toMatch(/projects\.length === 0 && shared\.length === 0[\s\S]{0,40}\)\s*\{\s*return <HomeFirstView/);
    expect(list).toContain('setOwnFailedFor(uid)');
  });
});

/* ------------------------------------------------------------------ rendered */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
const PASSWORD = 'HomeFirst123!';
const EMAIL = `home-first-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

const VIEWPORTS: ReadonlyArray<readonly [string, number, number]> = [
  ['1920x1080', 1920, 1080],
  ['1440x900', 1440, 900],
  ['1280x800', 1280, 800],
  ['1024x768', 1024, 768],
  ['768x1024', 768, 1024],
  ['phone', 390, 844],
];

async function openHome(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  const view = page.locator('[data-home-first-view]');
  await expect(view).toBeVisible({ timeout: 90_000 });
  await expect(view.locator('[data-home-start-example]')).toBeVisible({ timeout: 60_000 });
  return view;
}

test.describe('a fresh account lands on the first view', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, EMAIL, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Mara', lastName: 'Home', email: EMAIL, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 0, transformationsLimit: 5,
      createdAt: new Date(),
    });
  });

  test('two equal products, one filled button, every example, the six tools, and no duration', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);

    await expect(view.getByRole('heading', { level: 1 })).toHaveText('What do you want to do with your Z program?');
    await expect(view).toContainText('Welcome, Mara.');
    await expect(view.locator('[data-home-product]')).toHaveCount(2);
    await expect(view.locator('#home-analyse-title')).toHaveText('Analyse it — understand what it does');
    await expect(view.locator('#home-redesign-title')).toHaveText('Re-design it — build its clean core successor');

    // Exactly one filled button on the page, and it is the recommended example's.
    const primaries = page.locator('[data-cc-button="primary"]:visible');
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toHaveText(/Start this example/);
    await expect(primaries).toHaveAttribute('data-example-start', 'Z_MM_PO_APPROVAL');
    await expect(view.locator('[data-cc-button="ghost"][data-home-choose-file]')).toBeVisible();
    await expect(view.locator('[data-cc-button="secondary"][data-home-redesign-example]')).toBeVisible();

    // All seven shipped examples, each with the line count of its file — six behind "6 more examples".
    await view.locator('[data-home-more-examples]').click();
    for (const e of STARTER_EXAMPLES) {
      const card = view.locator(`[data-example-card="${e.name}"]`);
      await expect(card, e.name).toBeVisible();
      await expect(card.locator(`[data-example-lines="${countSourceLines(read(`public/starter-examples/${e.file}`))}"]`)).toBeVisible();
    }
    await expect(view.locator('[data-example-card]')).toHaveCount(STARTER_EXAMPLES.length);

    // The products in the tool bar's order: Analyze, then the six of Re-design.
    const steps = await view.locator('[data-home-path-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-home-path-step')));
    expect(steps).toEqual(PHASES.map((p) => p.key));

    // No duration claim (H-O2), nothing optional, no map drawn.
    const text = await view.innerText();
    expect(text).not.toMatch(/\bseconds?\b|\bminutes?\b/i);
    expect(text).not.toMatch(/optional/i);
    await expect(page.locator('.djs-container, [data-home-map-slice]')).toHaveCount(0);

    // No list, no demo row, no First insights on this view.
    await expect(page.locator('[data-workspace-projects]')).toHaveCount(0);
    await expect(view.locator('[data-home-open-demo]:visible')).toHaveCount(1);
  });

  test('the six viewports: nothing covers anything, the columns end together, and the phone has both ways in its first screen', async ({ page }) => {
    test.setTimeout(420 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openHome(page);
    const failures: string[] = [];
    for (const [name, width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      const report = await page.evaluate(layoutCheck, {
        ...PRODUCT_LAYOUT,
        ignore: PRODUCT_LAYOUT.ignore,
      });
      if (!layoutClean(report)) {
        failures.push(`${name}: ${JSON.stringify({ overlaps: report.overlaps, clipped: report.clipped, focusOut: report.focusOut, overflowX: report.overflowX })}`);
      }
      if (width > 600) {
        // The pair: two cards side by side, starting and ending together (equal weight).
        const [a, b] = await page.evaluate(() =>
          [...document.querySelectorAll('[data-home-product]')].map((c) => {
            const r = c.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom };
          }),
        );
        expect(Math.abs(a.top - b.top), `${name}: the products do not start together`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.bottom - b.bottom), `${name}: the products do not end together`).toBeLessThanOrEqual(1);
      }
      if (name === '1440x900') {
        const tops = await page.evaluate(() =>
          [...document.querySelectorAll('[data-home-way] h3')].map((h) => h.getBoundingClientRect().top + window.scrollY),
        );
        for (const top of tops) expect(top, 'a way of the start is below the first screen').toBeLessThan(height);
      }
      if (name === 'phone') {
        const tops = await page.evaluate(() =>
          [...document.querySelectorAll('[data-home-way] h3')].map((h) => h.getBoundingClientRect().top + window.scrollY),
        );
        expect(tops).toHaveLength(2);
        for (const top of tops) expect(top, 'a way of the start is below the first screen').toBeLessThan(height);
      }
    }
    expect(failures).toEqual([]);
  });

  test('"Choose a file" opens today\'s start with the file in it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);
    await view.locator('[data-home-file-input]').setInputFiles({
      name: 'Z_MATERIAL_STOCK_CALC.abap',
      mimeType: 'text/plain',
      buffer: Buffer.from(read('public/starter-examples/Z_MATERIAL_STOCK_CALC.txt')),
    });
    await page.waitForURL(/\/admin\/new-project\/upload/, { timeout: 45_000 });
    await expect(page.locator('[data-own-code-file="Z_MATERIAL_STOCK_CALC.abap"]')).toBeVisible({ timeout: 30_000 });
  });

  test('"Paste the code" opens today\'s start with its paste field', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);
    await view.locator('[data-home-paste]').click();
    await page.waitForURL(/\/admin\/new-project\/upload/, { timeout: 45_000 });
    const paste = page.locator('[data-own-code-paste]');
    await expect(paste).toBeVisible({ timeout: 30_000 });
    // Nothing pasted, nothing to add.
    await expect(paste.locator('[data-own-code-paste-add]')).toBeDisabled();
    await paste.locator('textarea').fill(read('public/starter-examples/Z_MATERIAL_STOCK_CALC.txt'));
    await paste.locator('[data-own-code-paste-add]').click();
    await expect(page.locator('[data-own-code-file="Z_MATERIAL_STOCK_CALC.abap"]')).toBeVisible({ timeout: 30_000 });
  });

  test('"Start this example" reaches a signed run with no detour', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);
    await view.locator('[data-home-start-example]').click();
    // Straight to the project's entry, Analyze in the Business view, as a first visit (AB-2).
    await page.waitForURL(/\/project\/[^/?#]+\/analyze\?first=1/, { timeout: 60_000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    // The start signs at once (ADR-072): the project carries its active run.
    await expect
      .poll(async () => (await adminGetDoc('projects', projectId))?.activeRunId ?? null, { timeout: 120_000 })
      .toBeTruthy();
    // The run it names exists, belongs to this project and its signature verifies.
    const activeRunId = (await adminGetDoc('projects', projectId))!.activeRunId as string;
    const run = await adminGetDoc(`projects/${projectId}/runs`, activeRunId);
    expect(run, 'the active run names no run document').toBeTruthy();
    expect(run!.projectId).toBe(projectId);
    expect(verifyRunIntegrity(run!, process.env.AUDIT_SIGNING_KEY!)).toEqual({ valid: true });
    // Back home, the account has a project: the list, not the first view.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-projects]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-home-first-view]')).toHaveCount(0);
  });
});
