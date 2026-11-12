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
import { buildDemoProject } from '../lib/demo-project';
import { elementsOfPlane } from '../lib/process-map';
import { anchorText } from '../lib/bpmn/layout';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { sliceModel } from '../lib/bpmn/slice';
import { computeHomeMapSlice, HOME_SLICE_ELEMENTS } from '../lib/home-map-slice';
import { leaveHomeStart, pastedFileName, takeHomeStart } from '../lib/home-start-handoff';
import { WORKSPACE_PAGE_MESSAGES } from '../lib/messages/workspace';
import { adminGetDoc, adminSetDoc } from './helpers/admin-seed';
import { signInViaLanding } from './helpers/sign-in';
import { layoutCheck, PRODUCT_LAYOUT } from './helpers/overlap';

/**
 * AB-14a — the first view of a new account (home mockup v2.1, state 1;
 * `docs/design/analyze-business-first-plan.md`, AB-14a).
 *
 * Server-free half: the slice of the demo map is the demo map's own first
 * elements (H-O1, no hand-written name), the path's names are the tool bar's,
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
  'components/workspace/ToolPathStrip.tsx',
  'components/process-map/MapSlice.tsx',
];

/* --------------------------------------------------------------- server-free */

test.describe('the slice of the demo map (H-O1)', () => {
  test('its elements are the demo map\'s first ones, with the map\'s labels and anchors', () => {
    const slice = computeHomeMapSlice(HOME_SLICE_ELEMENTS);
    expect(slice, 'the slice was refused: an element differs from the demo map').not.toBeNull();
    const map = buildDemoProject().documentation.process!.model;
    const first = elementsOfPlane(map, null).slice(0, HOME_SLICE_ELEMENTS);
    expect(slice!.elements).toEqual(
      first.map((e) => ({ id: e.id, label: e.label, anchor: anchorText(e.anchor), fact: e.fact })),
    );
    expect(slice!.elements).toHaveLength(4);
    expect(slice!.objectName).toBe('Z_MM_PO_APPROVAL');
    expect(slice!.topLevelElements).toBe(elementsOfPlane(map, null).length);
    // Every element an anchor: what the view promises ("every step with its code lines").
    for (const e of slice!.elements) expect(e.anchor, e.label).toMatch(/^L\d+/);
  });

  test('the file draws those elements and nothing else, top to bottom', () => {
    const slice = computeHomeMapSlice(HOME_SLICE_ELEMENTS)!;
    const shapes = [...slice.xml.matchAll(/<bpmndi:BPMNShape id="[^"]+" bpmnElement="([^"]+)"/g)].map((m) => m[1]);
    expect(shapes.sort()).toEqual(slice.elements.map((e) => e.id).sort());
    // Each shape below the one before it.
    const ys = slice.elements.map((e) => {
      const m = new RegExp(`bpmnElement="${e.id}"[^>]*>\\s*<dc:Bounds x="[\\d.-]+" y="([\\d.-]+)"`).exec(slice.xml);
      return Number(m?.[1]);
    });
    for (let i = 1; i < ys.length; i++) expect(ys[i], `element ${i} is not below element ${i - 1}`).toBeGreaterThan(ys[i - 1]);
    // A slice, not the map: a few kilobytes.
    expect(slice.xml.length).toBeLessThan(16_000);
  });

  test('no name of the slice is written into the home page\'s code', () => {
    const slice = computeHomeMapSlice(HOME_SLICE_ELEMENTS)!;
    const own = [...HOME_FILES, 'lib/home-map-slice.ts'].map(code).join('\n');
    for (const e of slice.elements) expect(own, `"${e.label}" is hand-written`).not.toContain(e.label);
    const messages = JSON.stringify(WORKSPACE_PAGE_MESSAGES);
    for (const e of slice.elements) expect(messages, `"${e.label}" is in the catalogue`).not.toContain(e.label);
  });

  test('the cut changes nothing it keeps and leaves the model it was given alone', () => {
    const source = read('public/starter-examples/Z_MM_PO_APPROVAL.abap').replace(/\r\n/g, '\n');
    const model = buildExportModel(buildProcessSkeleton(source));
    const before = JSON.stringify(model.root.nodes.map((n) => [n.id, n.name, n.outgoing]));
    const keep = model.root.nodes.slice(0, 3).map((n) => n.id);
    const sliced = sliceModel(model, keep);
    expect(JSON.stringify(model.root.nodes.map((n) => [n.id, n.name, n.outgoing]))).toBe(before);
    expect(sliced.containers).toHaveLength(1);
    expect(sliced.root.nodes.map((n) => n.id)).toEqual(keep);
    expect(sliced.root.nodes.map((n) => n.name)).toEqual(model.root.nodes.slice(0, 3).map((n) => n.name));
    for (const f of sliced.root.flows) {
      expect(keep).toContain(f.sourceId);
      expect(keep).toContain(f.targetId);
    }
    expect(sliced.lanes).toEqual([]);
    expect(sliced.root.annotations).toEqual([]);
  });

  test('the slice is drawn by the Analyze map\'s renderer, not a new one', () => {
    const slice = code('components/process-map/MapSlice.tsx');
    expect(slice).toMatch(/import\('bpmn-js\/lib\/Viewer'\)/);
    expect(slice).toMatch(/from '\.\/bpmn-view'/);
    expect(slice).toContain('placeAnchor(');
    expect(slice).toContain("import './process-map.css'");
    // The reading map draws its anchors with the same function.
    expect(code('components/process-map/BpmnCanvas.tsx')).toContain('placeAnchor(');
    // The home page takes the picture from components/process-map, and draws no SVG of its own.
    const home = code('components/workspace/HomeFirstView.tsx');
    expect(home).toContain("import('@/components/process-map/MapSlice')");
    expect(home).not.toMatch(/<svg|<path|<rect/);
  });
});

test.describe('the path of the seven tools', () => {
  test('names and order are the tool bar\'s, never written twice', () => {
    const strip = code('components/workspace/ToolPathStrip.tsx');
    expect(strip).toContain("import { PHASES } from '@/lib/workflow-steps'");
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
    expect(branch.match(/variant="primary"/g) ?? []).toHaveLength(1);
    expect(branch).toMatch(/variant="primary"[\s\S]{0,400}home\.startExample/);
    const view = code('components/workspace/HomeFirstView.tsx');
    expect(view).not.toContain('variant="primary"');
    expect(view).toMatch(/variant="ghost"[\s\S]{0,200}data-home-choose-file/);
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
    expect(code('components/workspace/HomeFirstView.tsx')).not.toMatch(/\.text\(\)|FileReader|arrayBuffer/);
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
  await expect(view.locator('[data-home-map-slice="drawn"]')).toBeVisible({ timeout: 60_000 });
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

  test('one filled button, every example, the live slice and the path, and no duration', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);

    await expect(view.getByRole('heading', { level: 1 })).toHaveText('See your Z program as a business process');
    await expect(view).toContainText('Welcome, Mara.');

    // Exactly one filled button on the page, and it is the recommended example's.
    const primaries = page.locator('[data-cc-button="primary"]:visible');
    await expect(primaries).toHaveCount(1);
    await expect(primaries).toHaveText(/Start this example/);
    await expect(primaries).toHaveAttribute('data-example-start', 'Z_MM_PO_APPROVAL');
    await expect(view.locator('[data-cc-button="ghost"][data-home-choose-file]')).toBeVisible();

    // All seven shipped examples, each with the line count of its file.
    for (const e of STARTER_EXAMPLES) {
      const card = view.locator(`[data-example-card="${e.name}"]`);
      await expect(card, e.name).toBeVisible();
      await expect(card.locator(`[data-example-lines="${countSourceLines(read(`public/starter-examples/${e.file}`))}"]`)).toBeVisible();
    }
    await expect(view.locator('[data-example-card]')).toHaveCount(STARTER_EXAMPLES.length);

    // The slice: the demo map's first elements, their names and their lines.
    const slice = computeHomeMapSlice(HOME_SLICE_ELEMENTS)!;
    const drawn = view.locator('[data-home-map-slice="drawn"]');
    const anchors = await drawn.locator('.cc-map-anchor-code').allInnerTexts();
    expect(anchors.map((a) => a.trim()).sort()).toEqual(slice.elements.map((e) => e.anchor).filter(Boolean).sort());
    const svgText = (await drawn.locator('svg text').allTextContents()).join(' ').replace(/\s+/g, ' ');
    for (const e of slice.elements) {
      for (const word of e.label.split(/\s+/)) expect(svgText, e.label).toContain(word);
    }
    await expect(drawn).toHaveAttribute('aria-label', new RegExp(slice.elements[0].anchor!));

    // The path, in the tool bar's order.
    const steps = await view.locator('[data-home-path-step]').evaluateAll((els) => els.map((e) => e.getAttribute('data-home-path-step')));
    expect(steps).toEqual(PHASES.map((p) => p.key));

    // No duration claim (H-O2).
    const text = await view.innerText();
    expect(text).not.toMatch(/\bseconds?\b|\bminutes?\b/i);

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
        // The slice is one picture: its labels and anchors are bpmn-js's, placed by the layout.
        ignore: `${PRODUCT_LAYOUT.ignore}, [data-home-map-slice]`,
      });
      if (report.overlaps.length || report.clipped.length || report.overflowX > 0) {
        failures.push(`${name}: ${JSON.stringify({ overlaps: report.overlaps, clipped: report.clipped, overflowX: report.overflowX })}`);
      }
      if (name === '1440x900') {
        // v2.1 closed the gap bottom-left: the demo line ends where the start card ends.
        const gap = await page.evaluate(() => {
          const card = document.querySelector('[data-home-start]')!.getBoundingClientRect();
          const demo = [...document.querySelectorAll('[data-home-demo]')].find((d) => (d as HTMLElement).offsetParent !== null)!;
          return card.bottom - demo.getBoundingClientRect().bottom;
        });
        expect(gap, 'empty area under the demo line, bottom-left').toBeLessThanOrEqual(40);
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
    await paste.locator('textarea').fill(read('public/starter-examples/Z_MATERIAL_STOCK_CALC.txt'));
    await paste.locator('[data-own-code-paste-add]').click();
    await expect(page.locator('[data-own-code-file="Z_MATERIAL_STOCK_CALC.abap"]')).toBeVisible({ timeout: 30_000 });
  });

  test('"Start this example" reaches a signed run with no detour', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await signInViaLanding(page, EMAIL, PASSWORD);
    const view = await openHome(page);
    await view.locator('[data-home-start-example]').click();
    await page.waitForURL(/\/project\/[^/?#]+/, { timeout: 60_000 });
    const projectId = new URL(page.url()).pathname.split('/')[2];
    // The start signs at once (ADR-072): the project carries its active run.
    await expect
      .poll(async () => (await adminGetDoc('projects', projectId))?.activeRunId ?? null, { timeout: 120_000 })
      .toBeTruthy();
    // Back home, the account has a project: the list, not the first view.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-projects]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-home-first-view]')).toHaveCount(0);
  });
});
