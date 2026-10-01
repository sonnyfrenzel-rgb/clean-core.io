import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { buildReadingExports } from '../lib/bpmn/export';
import { parseBpmn } from '../lib/process-map';
import type { ProcessRevisionRecord } from '../lib/process-revisions';
import { signInViaLanding } from './helpers/sign-in';
import { TERMS_VERSION } from '../lib/constants';

/**
 * The professional editor (owner, 01.10.2026: "a real professional BPMN editor
 * before 3.0") — what was added on top of roadmap 3.1, measured in the browser:
 *
 *   - bpmn-js's own tools are on (palette, context pad, replace menu, keyboard)
 *     **beside** the keyboard palette and the element list, not instead of them;
 *   - the properties panel edits the plain name, the documentation and the type,
 *     keeps the line anchor through a type change, and what it changes is what a
 *     saved revision holds;
 *   - "Technical names" shows the code's token without making it the name;
 *   - a BPMN 2.0 file imports as the next revision — summary first, anchors only
 *     where the Ist has them — and a broken file is refused with a sentence;
 *   - "Compare with Ist" names what was added; "Tidy layout" is one undo step;
 *   - the newest revision saved anywhere is offered when the editor opens;
 *   - through all of it, revision 1 — the reconstructed Ist — is byte for byte
 *     what it was.
 */

const EXAMPLE = path.resolve(
  __dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
);
const FILE_NAME = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PROCESS_NAME = 'Order fulfilment audit';
const SOURCE = fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');

const STAMP = Date.now();
const EMAIL = `editorpro-${STAMP}@cleancore-test.io`;
const PASSWORD = 'EditorPro123!';
const PROJECT_ID = `editor-pro-${STAMP}`;
const RUN_ID = `editor-pro-run-${STAMP}`;
let idToken = '';

/** The plain reading the page draws — what the editor opens and compares against. */
function istXml(): string {
  return buildReadingExports(SOURCE, { processName: PROCESS_NAME, sourceFileName: FILE_NAME }).bpmn.xml;
}

async function storedRevision(request: APIRequestContext, n: number): Promise<ProcessRevisionRecord | null> {
  const res = await request.get(`/api/projects/${PROJECT_ID}/process-revisions?revision=${n}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status() !== 200) return null;
  return (await res.json()).record as ProcessRevisionRecord;
}

async function openEditor(page: Page) {
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-map]').waitFor({ timeout: 90000 });
  await page.locator('[data-process-map-canvas]').waitFor({ timeout: 90000 });
  await page.locator('[data-process-edit-toggle]').click();
  await page.locator('[data-process-editor]').waitFor({ timeout: 60000 });
  await expect.poll(async () => page.locator('[data-draft-row]').count(), { timeout: 60000 }).toBeGreaterThan(20);
  await expect
    .poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 })
    .toBeGreaterThan(5);
}

/** A reconstructed task of the top level, with its line anchor. */
function anchoredTask(): { id: string; name: string; technicalName: string; lineStart: number } {
  const element = parseBpmn(istXml()).elements.find(
    (e) => e.plane === null && /task$/i.test(e.tag) && e.trace?.lineStart != null && e.trace?.technicalName,
  );
  if (!element || !element.trace) throw new Error('no anchored task on the top level');
  return { id: element.id, name: element.name, technicalName: element.trace.technicalName!, lineStart: element.trace.lineStart! };
}

test.describe('the professional BPMN editor', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }
    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    idToken = await cred.user.getIdToken();
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Editor', lastName: 'Pro', email: EMAIL,
      tier: 'pilot', status: 'approved', termsVersionAccepted: TERMS_VERSION,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    const fingerprint = {
      sha256: sha256Hex(SOURCE), fileName: FILE_NAME, lineCount: SOURCE.split('\n').length,
      byteSize: SOURCE.length, objectType: 'Report', uploadedAt: new Date().toISOString(),
    };
    await adminSetDoc('projects', PROJECT_ID, {
      name: PROCESS_NAME, userId: uid, createdAt: new Date(), status: 'documented',
      legacyCode: SOURCE, activeRunId: RUN_ID, inputFingerprint: fingerprint,
    });
    const unsignedRun = {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed', inputFingerprint: fingerprint,
    };
    const runHash = recomputeStoredRunHash(unsignedRun);
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      ...unsignedRun, runHash, signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
    });
  });

  test('bpmn-js tools are on beside the keyboard palette: palette, context pad, replace menu, undo by keyboard', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);

    // The native palette with its tools, and the button palette above the canvas.
    await expect(page.locator('[data-process-editor-canvas] .djs-palette')).toBeVisible();
    await expect(page.locator('[data-process-editor-canvas] .djs-palette [data-action="lasso-tool"]')).toBeVisible();
    await expect(page.locator('[data-process-editor-canvas] .djs-palette [data-action="space-tool"]')).toBeVisible();
    await expect(page.locator('[data-process-editor-canvas] .djs-palette [data-action="global-connect-tool"]')).toBeVisible();
    await expect(page.locator('[data-palette-item="user-task"]')).toBeVisible();
    await expect(page.locator('[data-editor-elements]')).toBeVisible();

    // Select a task from the list: the context pad opens on the canvas, the wrench opens the replace menu.
    const task = anchoredTask();
    await page.locator(`[data-draft-row="${task.id}"]`).click();
    await expect(page.locator('.djs-context-pad.open, .djs-context-pad')).toBeVisible();
    await page.locator('.djs-context-pad [data-action="replace"]').click();
    await expect(page.locator('.djs-popup')).toBeVisible();
    await page.keyboard.press('Escape');

    // Append with the context pad, then take it back with Ctrl+Z on the canvas.
    const rows = await page.locator('[data-draft-row]').count();
    await page.locator(`[data-draft-row="${task.id}"]`).click();
    await page.locator('.djs-context-pad [data-action="append.append-task"]').click();
    await expect.poll(async () => page.locator('[data-draft-row]').count(), { timeout: 30000 }).toBe(rows + 1);
    await expect(page.locator('[data-editor-undo]')).toBeEnabled();
    // Appending opens the new task's name for typing; Escape leaves it, then the canvas has the keyboard.
    await page.keyboard.press('Escape');
    await page.locator('[data-process-editor-canvas] svg[tabindex="0"]').focus();
    await page.keyboard.press('Control+z');
    await expect.poll(async () => page.locator('[data-draft-row]').count(), { timeout: 30000 }).toBe(rows);

    // The toolbar is there and named.
    for (const hook of ['data-editor-tidy', 'data-editor-compare', 'data-editor-import', 'data-editor-fit', 'data-editor-fullscreen-toggle']) {
      await expect(page.locator(`[${hook}]`)).toBeVisible();
    }
    await expect(page.locator('[data-editor-minimap]')).toBeVisible();
  });

  test('properties: the plain name is edited, the technical name stays, the type changes and the anchor survives into the revision', async ({ page, request }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const task = anchoredTask();
    const ist = await storedRevisionAfterBaseline(request);

    await page.locator(`[data-draft-row="${task.id}"]`).click();
    const panel = page.locator(`[data-editor-properties="${task.id}"]`);
    await expect(panel).toBeVisible();
    // The plain name is in the field; the token is shown read-only beside it.
    await expect(panel.locator('[data-editor-name]')).toHaveValue(task.name);
    await expect(panel.locator('[data-editor-technical-name]')).toContainText(task.technicalName);
    await expect(panel.locator('[data-editor-provenance]')).toContainText(`L${task.lineStart}`);

    await panel.locator('[data-editor-name]').fill('Check the order with the customer');
    await panel.locator('[data-editor-rename]').click();
    await expect(page.locator(`[data-draft-row="${task.id}"]`)).toContainText('Check the order with the customer');
    // Canvas label follows the plain name.
    await expect(page.locator(`[data-process-editor-canvas] [data-element-id="${task.id}"]`)).toContainText('Check the order');

    await panel.locator('textarea').fill('Agreed with sales on 1 October.');
    await panel.locator('[data-editor-name]').focus(); // blur applies the documentation
    await page.locator(`[data-editor-properties="${task.id}"] select`).first().selectOption('bpmn:UserTask');
    await expect(page.locator(`[data-draft-row="${task.id}"]`)).toContainText('User step');
    // The type changed; the element is still the reconstructed one, with its anchor.
    await expect(page.locator(`[data-draft-row="${task.id}"]`)).toHaveAttribute('data-drawn', 'false');
    await expect(page.locator(`[data-editor-properties="${task.id}"] [data-editor-provenance]`)).toContainText(`L${task.lineStart}`);

    // Technical names: the list speaks the token, the name is unchanged.
    await page.locator('[data-process-technical-toggle]').click();
    await expect(page.locator(`[data-draft-row="${task.id}"]`)).toContainText(task.technicalName);
    await page.locator('[data-process-technical-toggle]').click();

    await page.locator('[data-editor-save]').click();
    await expect(page.locator('[data-editor-saved]')).toContainText(/Saved as revision (\d+)\./, { timeout: 30000 });
    const savedText = await page.locator('[data-editor-saved]').innerText();
    const n = Number(/revision (\d+)/.exec(savedText)?.[1]);
    const record = await storedRevision(request, n);
    expect(record).toBeTruthy();
    const saved = parseBpmn(record!.xml).elements.find((e) => e.id === task.id);
    expect(saved?.tag).toBe('userTask');
    expect(saved?.name).toBe('Check the order with the customer');
    expect(saved?.trace?.technicalName).toBe(task.technicalName);
    expect(saved?.trace?.lineStart).toBe(task.lineStart);
    expect(record!.xml).toContain('Agreed with sales on 1 October.');

    // The Ist is what it was.
    const after = await storedRevision(request, 1);
    expect(after?.xmlSha256).toBe(ist.xmlSha256);
  });

  test('compare with the Ist names what was added and marks it on the canvas; tidy layout is one undo step', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);

    await page.locator('[data-draft-row]').first().click();
    await page.locator('[data-palette-item="manual-task"]').click();
    const drawn = page.locator('[data-draft-row][data-drawn="true"]');
    await expect(drawn).toHaveCount(1);
    const drawnId = await drawn.getAttribute('data-draft-row');

    await page.locator('[data-editor-compare]').click();
    await expect(page.locator('[data-editor-diff]')).toBeVisible();
    await expect(page.locator('[data-editor-diff-summary]')).toContainText('1 element added');
    await expect(page.locator(`[data-editor-diff-item="${drawnId}"]`)).toBeVisible();
    await expect(page.locator(`[data-process-editor-canvas] .djs-element.cc-diff-added[data-element-id="${drawnId}"]`)).toHaveCount(1);

    const before = await page.locator('[data-process-editor-canvas] .djs-shape').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-element-id')}:${el.getAttribute('transform')}`).sort().join('|'));
    await page.locator('[data-editor-tidy]').click();
    await expect(page.locator('[data-editor-note]')).toContainText('Laid out again');
    const moved = await page.locator('[data-process-editor-canvas] .djs-shape').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-element-id')}:${el.getAttribute('transform')}`).sort().join('|'));
    expect(moved).not.toBe(before);
    await expect(page.locator('[data-editor-overlaps]')).toHaveAttribute('data-editor-overlaps', '0', { timeout: 10000 });
    await page.locator('[data-editor-undo]').click();
    await expect.poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-element-id')}:${el.getAttribute('transform')}`).sort().join('|'))).toBe(before);
    await page.locator('[data-editor-discard]').click();
  });

  test('a Signavio-style file imports as the next revision, with a summary first and anchors only from the Ist', async ({ page, request }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const ist = await storedRevisionAfterBaseline(request);

    // As a tool that rewrites ids and drops our extensions hands the export back,
    // plus one task drawn there that claims lines 1–5 for itself.
    const file = istXml()
      .replace('</bpmn:process>', '<bpmn:task id="Signavio_Task_1" name="Approve in Signavio"><bpmn:extensionElements><cc:trace status="proven" lineStart="1" lineEnd="5" /></bpmn:extensionElements></bpmn:task></bpmn:process>')
      .replace(/(<bpmndi:BPMNPlane[^>]*bpmnElement="collaboration"[^>]*>)/, '$1<bpmndi:BPMNShape id="Signavio_Task_1_di" bpmnElement="Signavio_Task_1"><dc:Bounds x="200" y="40" width="120" height="80" /></bpmndi:BPMNShape>')
      .replace(/"nd-/g, '"sid-nd-');
    expect(file).toContain('Signavio_Task_1_di');

    await page.locator('[data-editor-import-file]').setInputFiles({
      name: 'order-from-signavio.bpmn', mimeType: 'application/xml', buffer: Buffer.from(file, 'utf8'),
    });
    const dialog = page.locator('[data-editor-import="ready"]');
    await expect(dialog).toBeVisible({ timeout: 30000 });
    await expect(dialog.locator('[data-editor-import-summary]')).toContainText('order-from-signavio.bpmn');
    await expect(dialog.locator('[data-import-by-name]')).toBeVisible();
    // Recognised are nearly all; the task drawn in the other tool is among the few that are not.
    expect(Number(await dialog.locator('[data-import-outside]').getAttribute('data-import-outside'))).toBeLessThanOrEqual(7);
    await expect(dialog.locator('[data-import-list="added"]')).toContainText('Approve in Signavio');
    await expect(dialog).toContainText('Line anchors or statuses written in the file itself were not taken over.');

    await dialog.locator('[data-editor-import-save]').click();
    await expect(dialog.locator('[data-editor-import-saved]')).toContainText(/Saved as revision (\d+)\./, { timeout: 30000 });
    const n = Number(/revision (\d+)/.exec(await dialog.locator('[data-editor-import-saved]').innerText())?.[1]);
    await dialog.locator('[data-editor-import-cancel]').click();

    const record = await storedRevision(request, n);
    const parsed = parseBpmn(record!.xml);
    const added = parsed.elements.find((e) => e.id === 'Signavio_Task_1');
    expect(added?.trace, 'a line anchor the file claimed was kept').toBeNull();
    // Elements recognised by name carry the Ist's id and the Ist's anchor again.
    const istById = new Map(parseBpmn(istXml()).elements.map((e) => [e.id, e]));
    const anchored = parsed.elements.filter((e) => e.trace?.lineStart != null);
    expect(anchored.length).toBeGreaterThan(30);
    for (const element of anchored) expect(element.trace?.lineStart).toBe(istById.get(element.id)?.trace?.lineStart);

    // The canvas shows the saved model; the drawn task says where it came from.
    await page.locator('[data-draft-row="Signavio_Task_1"]').click();
    await expect(page.locator('[data-editor-properties="Signavio_Task_1"] [data-editor-provenance]')).toHaveAttribute('data-editor-provenance', 'imported');

    expect((await storedRevision(request, 1))?.xmlSha256).toBe(ist.xmlSha256);
  });

  test('a broken file is refused with a sentence, and nothing is saved', async ({ page, request }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const history = await request.get(`/api/projects/${PROJECT_ID}/process-revisions`, { headers: { Authorization: `Bearer ${idToken}` } });
    const before = ((await history.json()).revisions as unknown[]).length;

    for (const [name, body, words] of [
      ['broken.bpmn', '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process', /not a readable BPMN 2\.0 document/],
      ['entity.bpmn', '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY e SYSTEM "file:///etc/passwd">]><d>&e;</d>', /document type or entities/],
      ['nolayout.bpmn', istXml().replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, ''), /no diagram layout/],
    ] as const) {
      await page.locator('[data-editor-import-file]').setInputFiles({ name, mimeType: 'application/xml', buffer: Buffer.from(body, 'utf8') });
      const dialog = page.locator('[data-editor-import="refused"]');
      await expect(dialog).toBeVisible({ timeout: 30000 });
      await expect(dialog.locator('[data-editor-import-refusal]')).toHaveText(words);
      await expect(dialog.locator('[data-editor-import-save]')).toHaveCount(0);
      await dialog.locator('[data-editor-import-cancel]').click();
    }
    const after = await request.get(`/api/projects/${PROJECT_ID}/process-revisions`, { headers: { Authorization: `Bearer ${idToken}` } });
    expect(((await after.json()).revisions as unknown[]).length).toBe(before);
  });

  test('the newest revision saved anywhere is offered when the editor opens on the reconstruction', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await openEditor(page);
    const offer = page.locator('[data-editor-newer]');
    await expect(offer).toBeVisible({ timeout: 30000 });
    await page.locator('[data-editor-open-newer]').click();
    await expect(page.locator('[data-draft-row="Signavio_Task_1"]')).toBeVisible();
    await expect(page.locator('[data-editor-started]')).toContainText('Editing revision');

    // Saving from here is based on that revision: a change is accepted, not refused as "moved".
    await page.locator('[data-draft-row="Signavio_Task_1"]').click();
    await page.locator('[data-palette-item="end-event"]').click();
    await page.locator('[data-editor-save]').click();
    await expect(page.locator('[data-editor-saved]')).toContainText(/Saved as revision \d+\./, { timeout: 30000 });

    // And the export hands out what is on the canvas.
    const download = page.waitForEvent('download');
    await page.locator('[data-editor-export="bpmn"]').click();
    const file = await (await download).path();
    const xml = fs.readFileSync(file!, 'utf8');
    expect(xml).toContain('Signavio_Task_1');
    expect(xml).toContain('cc:trace');
  });

  test('on a phone the editor says why it is not offered, and the map stays readable', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInViaLanding(page, EMAIL, PASSWORD);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-process-map]').waitFor({ timeout: 90000 });
    const width = () => page.evaluate(() => document.documentElement.scrollWidth);
    const before = await width();
    await page.locator('[data-process-edit-toggle]').click();
    await expect(page.locator('[data-process-editor-phone]')).toBeVisible();
    await expect(page.locator('[data-process-editor]')).toHaveCount(0);
    // The notice adds no width of its own to the page.
    expect(await width()).toBeLessThanOrEqual(before);
  });
});

/** Revision 1 — asked for once the stage has had the chance to write it. */
async function storedRevisionAfterBaseline(request: APIRequestContext): Promise<ProcessRevisionRecord> {
  let record: ProcessRevisionRecord | null = null;
  await expect.poll(async () => {
    record = await storedRevision(request, 1);
    return record !== null;
  }, { timeout: 30000 }).toBe(true);
  return record as unknown as ProcessRevisionRecord;
}
