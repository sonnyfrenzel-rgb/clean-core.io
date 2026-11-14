import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from './helpers/test';
import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { signInThroughForm } from './helpers/seed-project';
import { seedLayoutProject } from './helpers/analyze-layout';
import { examplePath } from './helpers/starter-example-files';
import { signInViaLanding } from './helpers/sign-in';
import { applyNaming, NAMING_FORMAT_VERSION, NAMING_MADE_FROM_FACTS, namingContextOf, type ProcessNamingRecord } from '../lib/process-naming';
import { buildProcessMapModel, xmlWithNames, xmlWithShownNames } from '../lib/process-map';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { sliceViewbox } from '../components/process-map/MapSlice';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary, workflowLine } from '../lib/program-summary-text';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { processDocumentationToMarkdown, type ProcessDocumentation } from '../lib/process-documentation';
import { aiOriginMarksIn } from '../lib/ai-marking';

/**
 * What the acceptance run of 3.1.0 found on Analyze, Business (owner example A, 12./13.11.2026), each with the check
 * that fails without its fix. Reproduced on the starter examples and on a minimal program written for this spec —
 * never on the owner's program.
 *
 *   1. The map started below the fold at 1440 × 900: six lines of text about the map stood above the canvas, and
 *      three lines of tool hints above the page. The canvas now comes first under the summary (mockup state 3).
 *   2. A click on a named step opened nothing: bpmn-js's overlay around an AI name lay over the step and took the
 *      click.
 *   3. The code panel squeezed the canvas to a strip: the map drew its own code card and its outline column inside
 *      the width the panel left (mockup state 7 is the target).
 *   4. The tour's canvas said the engine's names while its chips and the step list said the model's.
 *   5. "What this program does" opened on "A report that reads no table by name" for a program that runs a status
 *      workflow in its own objects.
 *   6. Every Analyze load sent `process-revisions` and `customer-texts` before the session was restored: HTTP 401.
 *   7. The delivery package marked every AI name "not-recorded", although the naming carries its model.
 *   8. Leaving the home view of a new account threw "SVGMatrix scale non-finite" (the map slice fitted a frame of
 *      width 0).
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ------------------------------------------------------------------ server-free */

test.describe('server-free: the fixes as code', () => {
  test('4. the shown names are written into the file the tour draws; nothing else of it changes', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">',
      '<bpmn:process id="P">',
      '<bpmn:task id="T1" name="Prepare the run"><bpmn:incoming>F1</bpmn:incoming></bpmn:task>',
      '<bpmn:startEvent id="S1" />',
      '<bpmn:task id="T2" name="Keep me" />',
      '</bpmn:process>',
      '<bpmndi:BPMNShape id="T1_di" bpmnElement="T1" />',
      '</bpmn:definitions>',
    ].join('\n');
    const out = xmlWithNames(xml, new Map([['T1', 'Prepares the run & "checks"'], ['S1', 'Run starts']]));
    expect(out).toContain('<bpmn:task id="T1" name="Prepares the run &amp; &quot;checks&quot;">');
    expect(out).toContain('<bpmn:startEvent id="S1" name="Run starts" />');
    expect(out).toContain('<bpmn:task id="T2" name="Keep me" />');
    // The diagram's shape names its element by `bpmnElement`, not `id`: untouched.
    expect(out).toContain('<bpmndi:BPMNShape id="T1_di" bpmnElement="T1" />');
    expect(xmlWithNames(xml, new Map())).toBe(xml);
    expect(
      xmlWithShownNames({
        xml,
        elements: [
          { id: 'T1', businessName: 'Prepares the run' },
          { id: 'T2', businessName: null },
        ] as unknown as Parameters<typeof xmlWithShownNames>[0]['elements'],
      }),
    ).toContain('id="T1" name="Prepares the run"');
    // The tour draws it.
    expect(read('components/workspace/ProcessTour.tsx')).toMatch(/xml=\{tourXml\}/);
  });

  test('2. the overlay around an AI name lets the click through to the step', () => {
    const css = read('components/process-map/process-map.css');
    const rule = /\.cc-map-canvas \.djs-overlay-cc-name,\s*\.cc-map-canvas \.djs-overlay-cc-name-pen,\s*\.cc-map-canvas \.djs-overlay-cc-name-wait \{\s*pointer-events: none;/;
    expect(css).toMatch(rule);
  });

  test('8. a frame of no width is not fitted: no view box of width 0, no non-finite scale', () => {
    const inner = { x: 10, y: 20, width: 600, height: 200 };
    expect(sliceViewbox(inner, 0)).toBeNull();
    expect(sliceViewbox(inner, Number.NaN)).toBeNull();
    expect(sliceViewbox({ ...inner, width: 0 }, 400)).toBeNull();
    const placed = sliceViewbox(inner, 400)!;
    expect(Number.isFinite(placed.viewbox.width) && placed.viewbox.width > 0).toBe(true);
    expect(Number.isFinite(placed.height) && placed.height > 0).toBe(true);
  });

  /** A program that keeps its records in its own objects and moves them through a status workflow — no table. */
  const WORKFLOW = [
    'REPORT zt_memory_flow.',
    "CONSTANTS: gc_draft TYPE char10 VALUE 'DRAFT',",
    "           gc_submitted TYPE char10 VALUE 'SUBMITTED',",
    "           gc_approved TYPE char10 VALUE 'APPROVED'.",
    'TYPES: BEGIN OF ty_req, id TYPE i, state TYPE char10, END OF ty_req.',
    'CLASS lcl_flow DEFINITION.',
    '  PUBLIC SECTION.',
    '    METHODS run.',
    '  PRIVATE SECTION.',
    '    DATA ms_req TYPE ty_req.',
    '    METHODS submit.',
    '    METHODS approve.',
    'ENDCLASS.',
    'CLASS lcl_flow IMPLEMENTATION.',
    '  METHOD run.',
    '    ms_req-id = 1.',
    '    ms_req-state = gc_draft.',
    '    submit( ).',
    '    approve( ).',
    "    WRITE: / ms_req-id, ms_req-state.",
    '  ENDMETHOD.',
    '  METHOD submit.',
    '    IF ms_req-state <> gc_draft.',
    '      RETURN.',
    '    ENDIF.',
    '    ms_req-state = gc_submitted.',
    '  ENDMETHOD.',
    '  METHOD approve.',
    '    IF ms_req-state <> gc_submitted.',
    '      RETURN.',
    '    ENDIF.',
    '    ms_req-state = gc_approved.',
    '  ENDMETHOD.',
    'ENDCLASS.',
    'START-OF-SELECTION.',
    '  NEW lcl_flow( )->run( ).',
  ].join('\n');

  test('5. a program that runs a status workflow in its own objects opens on the workflow, from engine 3.1.0', () => {
    const facts = programSummaryFactsOf(WORKFLOW, { engineVersion: ENGINE_READS_310_FROM });
    expect(facts.workflow?.states).toEqual(['Draft', 'Submitted', 'Approved']);
    const said = businessInShort(programSummary(facts), { codes: false }).map((l) => l.text);
    expect(said[0]).toBe('It runs a state workflow with 3 states: draft, submitted and approved.');
    // It does not replace what the engine proved: the purpose line still stands after it.
    expect(said.some((t) => /reads no table by name/.test(t))).toBe(true);

    // An engine before 3.1.0 keeps its picture: no workflow, the old first sentence.
    const older = programSummaryFactsOf(WORKFLOW, { engineVersion: '3.0.23' });
    expect(older.workflow).toBeUndefined();
    expect(businessInShort(programSummary(older), { codes: false })[0].text).not.toMatch(/workflow/);
    expect(workflowLine(null)).toBeNull();
    expect(workflowLine({ field: 'status', states: ['Open'], lines: [3] })).toBeNull();
  });

  test('7. each AI name in the process documentation carries the model the naming was recorded from', () => {
    const { doc, md } = processDocumentationToMarkdownProbe(null);
    expect(doc.naming.origin).toEqual({ provider: 'google-gemini', modelId: 'gemini-receipt-model' });
    // The mark itself, as the Markdown writes it for every named step.
    const marks = aiOriginMarksIn(md);
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every((m) => m.provider === 'google-gemini' && m.model === 'gemini-receipt-model')).toBe(true);
    // A document stored before 3.1.0 has no origin: "not-recorded", as before.
    const before = aiOriginMarksIn(processDocumentationToMarkdownProbe({ origin: undefined }).md);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((m) => m.provider === 'not-recorded')).toBe(true);
    // The package header names the same model when every mark agrees.
    expect(read('lib/delivery-package.ts')).toMatch(/documentation: namingAuthorshipOf\(entries\) \?\? UNRECORDED_AUTHORSHIP\.documentation/);
  });

  test('6. the readers Analyze calls on its first render wait for the session before they read the token', () => {
    for (const file of ['lib/customer-texts-client.ts', 'lib/process-revisions-client.ts', 'lib/process-states-client.ts', 'hooks/useWorkspaceRevision.ts']) {
      const code = read(file);
      const wait = code.indexOf('authStateReady');
      const token = code.indexOf('currentUser');
      expect(wait, `${file} reads the token without waiting for the session`).toBeGreaterThan(-1);
      expect(wait, `${file} reads the user before the session is restored`).toBeLessThan(token);
    }
  });
});

/**
 * The PO example's documentation with a naming on record, built the way the Documentation stage builds it — the
 * naming's origin travels from the stored record through the map into the document — with `over` laid over its
 * naming fields.
 */
function processDocumentationToMarkdownProbe(over: Partial<ProcessDocumentation['naming']> | null): { doc: ProcessDocumentation; md: string } {
  const source = fs.readFileSync(examplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const bpmn = buildBpmnExportFromSource(source, { processName: 'Z_MM_PO_APPROVAL.abap', sourceFileName: 'Z_MM_PO_APPROVAL.abap' });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), namingOf(source)), fileName: 'Z_MM_PO_APPROVAL.abap' });
  const built = buildProcessDocumentation({ source, map });
  const doc = over ? { ...built, naming: { ...built.naming, ...over } } : built;
  return { doc, md: processDocumentationToMarkdown(doc) };
}

/** A naming as the route stores it from a facts context: a name of its own for every task and decision point. */
function namingOf(source: string): ProcessNamingRecord {
  const context = namingContextOf(source);
  const nodes = context.skeleton.nodes.filter((n) => n.kind === 'task' || n.kind === 'gateway');
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest: context.digest,
    names: nodes.map((n, i) => ({ id: n.id, technicalName: n.label, name: n.kind === 'gateway' ? `Probe question ${i + 1}?` : `Probe step ${i + 1}` })),
    lanes: [],
    discarded: { total: 0, byRule: {} },
    origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-receipt-model', byok: false, issuedAt: Date.now(), textSha256: 'a'.repeat(64) },
    namedAt: new Date().toISOString(),
    madeFrom: NAMING_MADE_FROM_FACTS,
  };
}

/* --------------------------------------------------------------------- rendered */

const PO = fs.readFileSync(examplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');

/** The naming is on record from the start (the map shows it at once), and nothing asks a model. */
async function storedNaming(page: Page, projectId: string): Promise<void> {
  const record = namingOf(PO);
  await page.route(`**/api/projects/${projectId}/process-naming`, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ record }) }),
  );
  await page.route('**/api/gemini', (route: Route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'No model in this spec.' }) }));
}

test.describe('rendered: Analyze, Business on the seeded PO example at 1440 × 900', () => {
  test.describe.configure({ mode: 'serial' });

  test('1, 6: the canvas starts in the first screen under the summary; no request goes out without a session', async ({ page }) => {
    test.setTimeout(360_000);
    const seeded = await seedLayoutProject('acc310-fold');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    const refused: string[] = [];
    page.on('response', (res) => {
      if (res.status() === 401 && res.url().includes('/api/projects/')) refused.push(new URL(res.url()).pathname);
    });
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-business="ready"] [data-workspace-process="ready"] [data-process-map-canvas]')).toBeVisible({ timeout: 120_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    await page.evaluate(() => window.scrollTo(0, 0));

    const canvas = (await page.locator('[data-process-map-canvas]').boundingBox())!;
    // Mockup state 3: the canvas at about y = 410 of 900. Before the fix it began at about 880.
    expect(canvas.y, 'the canvas starts below the first screen').toBeLessThan(560);
    expect(Math.min(900, canvas.y + canvas.height) - canvas.y, 'less than 300 px of the canvas in the first screen').toBeGreaterThanOrEqual(300);
    // "Map | Steps" leads the canvas's own row; what reads about the map stands under the canvas.
    await expect(page.locator('[data-map-view-tools]').getByRole('radio', { name: /Map/ })).toBeVisible();
    const title = (await page.locator('[data-process-map-title]').boundingBox())!;
    expect(title.y, 'the map\'s title and counts stand above the canvas').toBeGreaterThan(canvas.y + canvas.height - 1);
    await expect(page.locator('[data-process-map-outline-column]')).toBeHidden();
    // One row of tools above the page, its soft-gate note at its end.
    await expect(page.locator('[data-stage-header] [data-tools-hint]')).toHaveCount(0);

    expect(refused, 'requests sent before the session was restored').toEqual([]);
  });

  test('2, 3, 4: a click on a named step opens its code beside the map; the canvas keeps its width; the tour says the same names', async ({ page }) => {
    test.setTimeout(360_000);
    const seeded = await seedLayoutProject('acc310-click');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    await storedNaming(page, seeded.po);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    const named = page.locator('[data-map-node][data-map-named="ai"]');
    await expect(named.first()).toBeAttached({ timeout: 120_000 });
    await expect(page.locator('[data-map-name]').first()).toBeVisible();

    // What a reader's pointer hits at the middle of a named step: the step, not the name laid over it.
    const target = named.first();
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? { overlay: !!el.closest('.djs-overlay-cc-name, .djs-overlay-cc-name-pen'), node: !!el.closest('[data-map-node]') || !!el.closest('.djs-element') } : null;
    }, [box.x + box.width / 2, box.y + box.height / 2] as const);
    expect(hit?.overlay, 'the AI name takes the click').toBe(false);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const panel = page.locator('[data-analyze-code-panel]');
    await expect(panel, 'a click on a named step opened no code').toBeVisible({ timeout: 30_000 });
    await expect(panel.locator('#analyze-code-panel-title')).toHaveText(/Probe (step|question) \d+/);
    // Mockup state 7: one code panel beside the map, the canvas keeps most of the width, its tools in one row.
    await expect(page.locator('[data-process-map-details]')).toHaveCount(0);
    const canvas = (await page.locator('[data-process-map-canvas]').boundingBox())!;
    expect(canvas.width, 'the code panel squeezes the canvas').toBeGreaterThanOrEqual(600);
    // The acceptance run saw them stacked one under the other; side by side they may wrap once, never stack.
    const boxes = await Promise.all(['[data-map-zoom-out]', '[data-map-zoom-in]', '[data-map-fit]', '[data-map-fullscreen-toggle]'].map(async (s) => (await page.locator(s).boundingBox())!));
    const zoomRow = boxes.slice(0, 3).map((b) => b.y);
    expect(Math.max(...zoomRow) - Math.min(...zoomRow), 'zoom out, zoom in and fit do not stand in one row').toBeLessThanOrEqual(6);
    expect(boxes[3].y, 'full screen fell under the other tools').toBeLessThanOrEqual(Math.min(...zoomRow) + 6);

    // The tour's own canvas draws the names its chips say.
    await page.locator('[data-analyze-code-close]').click();
    await page.locator('[data-analyze-walk]').first().click();
    const tourMap = page.locator('.cc-tour-map');
    await expect(tourMap.locator('svg text').first()).toBeAttached({ timeout: 60_000 });
    await expect
      .poll(async () => (await tourMap.locator('svg text').allTextContents()).join(' '), { timeout: 30_000 })
      // An SVG label wraps into lines, and the lines' text runs together: "Probe question12?".
      .toMatch(/Probe (step|question)\s*\d+/);
  });
});

test.describe('rendered: leaving the first view of a new account', () => {
  test('8. no page error when the live slice of the map goes away', async ({ page }) => {
    test.setTimeout(300_000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const email = `acc310-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;
    const password = 'HomeLeave123!';
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Lea', lastName: 'Home', email, tier: 'pilot', status: 'approved', activatedAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInViaLanding(page, email, password);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const view = page.locator('[data-home-first-view]');
    await expect(view.locator('[data-home-map-slice="drawn"]')).toBeVisible({ timeout: 90_000 });
    errors.length = 0;
    // Leave in the app (no reload), as a reader does: the paste way in.
    await view.locator('[data-home-paste]').click();
    await page.waitForURL(/\/admin\/new-project\/upload/, { timeout: 45_000 });
    await page.waitForTimeout(1500);
    expect(errors.filter((m) => /SVGMatrix|non-finite/i.test(m)), 'leaving the first view threw').toEqual([]);
  });
});
