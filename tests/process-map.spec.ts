import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { CC_NAMESPACE, buildBpmnExportFromSource } from '../lib/bpmn/export';
import { UNANCHORED, applyNaming, namingContextOf } from '../lib/process-naming';
import {
  LEGEND_VALUES,
  RECONSTRUCTION_NAMESPACE,
  buildProcessMapModel,
  codeCardLines,
  parseBpmn,
  traceabilityOf,
} from '../lib/process-map';

/**
 * The process map — roadmap 2.5.
 *
 * Three things the step is measured on, and this file checks each of them in
 * the place where it can actually fail:
 *
 *   1. **The legend is the file's.** The status of an element comes out of
 *      `cc:trace/@status` in the BPMN of 2.6 and is not decided here. The test
 *      that matters is the one with a status the map has never seen: a view that
 *      writes "reconstructed" on everything passes a check against a file that
 *      only ever says "reconstructed", and fails this one.
 *   2. **A click opens the code card on the real lines.** Not "about here": the
 *      highlighted lines are compared to the source, by number and by text.
 *   3. **Without a mouse, as an equal.** Checked in the browser, against the
 *      rendered page. A source guard is satisfied by a component that quietly
 *      passes a `className` through; rendered focus is not.
 *
 * The fixture is a small ABAP report with a decision and one `FORM` that no
 * `ENDFORM` closes — which is the way the skeleton produces an element with no
 * line anchor, so the `Unanchored` half of the legend is a real element and not
 * a mocked one.
 */

const FILE_NAME = 'Z_MAP_FIXTURE.abap';

/** Line feeds only: the same bytes here and in CI (`CLAUDE.md`, gotchas). */
const FIXTURE = [
  'REPORT z_map_fixture.',                    // 1
  '',                                         // 2
  'START-OF-SELECTION.',                      // 3
  '  PERFORM check_limit.',                   // 4
  '  PERFORM post_document.',                 // 5
  '',                                         // 6
  'FORM check_limit.',                        // 7
  "  IF lv_amount > '5000'.",                 // 8
  '    MESSAGE e001(zmm).',                   // 9
  '  ELSE.',                                  // 10
  "    UPDATE zmm_log SET note = 'ok'.",      // 11
  '  ENDIF.',                                 // 12
  'ENDFORM.',                                 // 13
  '',                                         // 14
  'FORM post_document.',                      // 15
  "  IF lv_kind = 'A'.",                      // 16
  '    INSERT INTO zmm_doc VALUES ls_row.',   // 17
  '  ELSE.',                                  // 18
  "    UPDATE zmm_doc SET flag = 'X'.",       // 19
  '  ENDIF.',                                 // 20
  "  CALL FUNCTION 'Z_SEND_MAIL'.",           // 21
  '',                                         // 22 — no ENDFORM: the end of this
].join('\n');                                 //      routine has nothing to anchor to

function fixtureModel() {
  const bpmn = buildBpmnExportFromSource(FIXTURE, {
    processName: 'Emergency purchase approval',
    sourceFileName: FILE_NAME,
  });
  const named = applyNaming(namingContextOf(FIXTURE), null, 'no-key');
  return { bpmn, model: buildProcessMapModel({ bpmn, named, fileName: FILE_NAME }) };
}

/* ------------------------------------------------------------------ *
 * The model — read out of the file, not decided beside it.
 * ------------------------------------------------------------------ */

test.describe('the map reads the file roadmap 2.6 writes', () => {
  test('it reads the namespace 2.6 writes, and the file declares it', () => {
    expect(RECONSTRUCTION_NAMESPACE).toBe(CC_NAMESPACE);
    const { bpmn } = fixtureModel();
    expect(parseBpmn(bpmn.xml).namespace).toBe(CC_NAMESPACE);
  });

  test('every flow node of the file becomes an element, with its trace', () => {
    const { bpmn, model } = fixtureModel();
    const parsed = parseBpmn(bpmn.xml);
    expect(parsed.elements).toHaveLength(bpmn.stats.flowNodes);
    expect(parsed.elements.filter((e) => e.trace === null), 'a flow node with no trace').toEqual([]);
    expect(model.elements).toHaveLength(bpmn.stats.flowNodes);
    // Sequence flows carry a trace too, and their conditions reach the model.
    expect(parsed.flows.length).toBe(bpmn.stats.sequenceFlows);
  });

  test('the status of an element is the status in the file, whatever it says', () => {
    // The whole point of reading `@status` rather than writing it: the day
    // roadmap 3.5 records that somebody confirmed a step, the legend follows
    // without a line changing here. A view that hard-coded `reconstructed`
    // passes every check against today's file and fails this one.
    const { bpmn, model } = fixtureModel();
    const target = model.elements[1].id;
    const doctored = bpmn.xml.replace(
      new RegExp(`(<bpmn:\\w+ id="${target}"[\\s\\S]*?<cc:trace status=")reconstructed`),
      '$1confirmed',
    );
    expect(doctored, 'the fixture was not altered — the test would be vacuous').not.toBe(bpmn.xml);

    const named = applyNaming(namingContextOf(FIXTURE), null, 'no-key');
    const changed = buildProcessMapModel({ bpmn: { ...bpmn, xml: doctored }, named, fileName: FILE_NAME });

    expect(changed.elements.find((e) => e.id === target)?.status).toBe('confirmed');
    const legend = Object.fromEntries(changed.legend.map((entry) => [entry.value, entry.count]));
    expect(legend.confirmed).toBe(1);
    expect(legend.reconstructed).toBe(model.elements.length - 1);
    expect(legend.proven).toBe(0);
  });

  test('the legend names Reconstructed, Confirmed and Proven, in that order', () => {
    expect(LEGEND_VALUES).toEqual(['reconstructed', 'confirmed', 'proven']);
    const { model } = fixtureModel();
    expect(model.legend.map((entry) => entry.label)).toEqual(['Reconstructed', 'Confirmed', 'Proven']);
  });

  test('an element without a line anchor is Unanchored, with the reason and in the quote', () => {
    const { bpmn, model } = fixtureModel();
    expect(bpmn.stats.unanchored, 'the fixture lost its unclosed FORM').toBeGreaterThan(0);

    const unanchored = model.elements.filter((element) => element.anchor === null);
    expect(unanchored.length).toBe(bpmn.stats.unanchored);
    for (const element of unanchored) {
      expect(element.evidenceLabel).toBe(UNANCHORED);
      expect(element.unanchoredReason, `${element.id} says nothing about why`).toBeTruthy();
      expect(element.accessibleName.toLowerCase()).toContain(UNANCHORED.toLowerCase());
    }
    expect(model.traceability.sentence.toLowerCase()).toContain(UNANCHORED.toLowerCase());
  });

  test('the quote is 2.6ʼs count, not a second one', () => {
    const { bpmn, model } = fixtureModel();
    expect(model.traceability).toEqual(traceabilityOf(bpmn.stats));
    expect(model.traceability.anchored).toBe(bpmn.stats.anchored);
    expect(model.traceability.flowNodes).toBe(bpmn.stats.flowNodes);
    // Floored at one decimal: only every element anchored reads 100 %.
    expect(model.traceability.percent).toBeLessThan(100);
    expect(traceabilityOf({ flowNodes: 4, anchored: 4, unanchored: 0 }).percent).toBe(100);
    expect(traceabilityOf({ flowNodes: 3, anchored: 2, unanchored: 1 }).percent).toBe(66.6);
  });

  test('every element has a spoken name made of art, title, anchor and provenance', () => {
    const { model } = fixtureModel();
    for (const element of model.elements) {
      expect(element.accessibleName, `${element.id} has no name`).not.toBe(element.id);
      expect(element.accessibleName.startsWith(`${element.kind}:`), element.accessibleName).toBe(true);
      expect(element.accessibleName).toMatch(/reconstructed\.$/);
      if (element.anchor) {
        expect(element.accessibleName).toContain(`line${element.anchor.lineStart === element.anchor.lineEnd ? '' : 's'} ${element.anchor.lineStart}`);
      }
    }
  });

  test('a decision carries the condition the code writes, and every branch', () => {
    const { model } = fixtureModel();
    const decision = model.elements.find((element) => element.tag === 'exclusiveGateway');
    expect(decision, 'the fixture has no decision').toBeTruthy();
    expect(decision?.branches.length).toBeGreaterThan(1);
    const conditions = decision?.branches.map((branch) => branch.condition) ?? [];
    expect(conditions.some((c) => c.includes('lv_amount') || c.includes('lv_kind')), conditions.join(' | ')).toBe(true);
    // The unconditional branch is kept, not dropped: "what happens otherwise" is
    // part of the decision.
    expect(conditions.some((c) => c === '')).toBe(true);
  });

  test('names with an ampersand and quotes survive the round trip', () => {
    const bpmn = buildBpmnExportFromSource(FIXTURE, {
      processName: 'Prüfung & "Freigabe" <B>',
      sourceFileName: FILE_NAME,
    });
    expect(parseBpmn(bpmn.xml).processName).toBe('Prüfung & "Freigabe" <B>');
  });

  test('the step list and the map are one list, in one order', () => {
    const { model } = fixtureModel();
    const fromPlanes = model.planes.flatMap((plane) => plane.elementIds);
    expect(fromPlanes).toEqual(model.elements.map((element) => element.id));
    expect(new Set(fromPlanes).size, 'an element appears on two planes').toBe(fromPlanes.length);
    // The top plane starts where the program starts.
    expect(model.elements[0].tag).toBe('startEvent');
  });
});

/* ------------------------------------------------------------------ *
 * The code card — the real lines, and no others.
 * ------------------------------------------------------------------ */

test.describe('the code card marks the lines the anchor names', () => {
  test('the highlighted lines are the anchorʼs lines, by number and by text', () => {
    const { model } = fixtureModel();
    const lines = FIXTURE.split('\n');
    let checked = 0;

    for (const element of model.elements) {
      if (!element.anchor) continue;
      const card = codeCardLines(FIXTURE, element.anchor);
      const highlighted = card.filter((line) => line.highlighted).map((line) => line.number);
      const expected: number[] = [];
      for (let n = element.anchor.lineStart; n <= element.anchor.lineEnd; n += 1) expected.push(n);
      expect(highlighted, `${element.id} marks the wrong lines`).toEqual(expected);

      for (const line of card) {
        expect(line.tokens.map((token) => token.text).join(''), `line ${line.number} is not the source`)
          .toBe(lines[line.number - 1]);
      }
      checked += 1;
    }
    expect(checked, 'no anchored element in the fixture').toBeGreaterThan(3);
  });

  test('it does not run off either end of the file', () => {
    const card = codeCardLines(FIXTURE, { lineStart: 1, lineEnd: 1 });
    expect(card[0].number).toBe(1);
    const lines = FIXTURE.split('\n');
    const tail = codeCardLines(FIXTURE, { lineStart: lines.length, lineEnd: lines.length });
    expect(tail[tail.length - 1].number).toBe(lines.length);
  });

  test('a literal in a condition is coloured as one — it is the hidden rule', () => {
    const card = codeCardLines(FIXTURE, { lineStart: 8, lineEnd: 8 }, 0);
    expect(card).toHaveLength(1);
    const literals = card[0].tokens.filter((token) => token.kind === 'literal').map((token) => token.text);
    expect(literals).toContain("'5000'");
    expect(card[0].tokens.some((token) => token.kind === 'keyword' && token.text.toUpperCase() === 'IF')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The rendered map — keyboard, legend, code card.
 * ------------------------------------------------------------------ */

const STAMP = Date.now();
const EMAIL = `processmap-${STAMP}@cleancore-test.io`;
const PASSWORD = 'ProcessMap123!';
const PROJECT_ID = `process-map-${STAMP}`;
const RUN_ID = `process-map-run-${STAMP}`;
let idToken = '';

const readRules = () => fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8');

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the map on the page, without a mouse', () => {
  // One account, one project, two tests that both open the same page: in
  // parallel they would race each other's first visit into the quote.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    idToken = await cred.user.getIdToken();

    await adminSetDoc('users', uid, {
      firstName: 'Process', lastName: 'Map', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    const fingerprint = {
      sha256: sha256Hex(FIXTURE),
      fileName: FILE_NAME,
      lineCount: FIXTURE.split('\n').length,
      byteSize: FIXTURE.length,
      objectType: 'Report',
      uploadedAt: new Date().toISOString(),
    };

    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval',
      userId: uid,
      createdAt: new Date(),
      status: 'documented',
      legacyCode: FIXTURE,
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
    });

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed',
      inputFingerprint: fingerprint,
    });
  });

  test('legend, quote, keyboard, code card and the equal step list', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page);

    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    const map = page.locator('[data-process-map]');
    await map.waitFor({ timeout: 60000 });

    const { model } = fixtureModel();

    // --- the legend names all three, with the counts the file gives -------
    for (const value of LEGEND_VALUES) {
      await expect(page.locator(`[data-legend-entry="${value}"]`)).toBeVisible();
      const expected = model.legend.find((entry) => entry.value === value)?.count ?? 0;
      await expect(page.locator(`[data-legend-count="${value}"]`)).toHaveText(String(expected));
    }
    await expect(page.locator('[data-legend-count="unanchored"]'))
      .toHaveText(String(model.traceability.unanchored));
    await expect(page.locator('[data-process-map-traceability]'))
      .toContainText(`${model.traceability.anchored} of ${model.traceability.flowNodes}`);

    // --- the map is one tab stop, and its nodes are named -----------------
    const canvas = page.locator('[data-process-map-canvas]');
    await canvas.waitFor({ timeout: 60000 });
    await expect.poll(
      async () => canvas.locator('[data-map-node]').count(),
      { timeout: 60000, message: 'bpmn-js drew no node buttons' },
    ).toBeGreaterThan(3);

    const nameless = await canvas.locator('[data-map-node]').evaluateAll((els) =>
      els.filter((el) => {
        const name = el.getAttribute('aria-label') || '';
        return !name || name === el.getAttribute('data-map-node');
      }).map((el) => el.getAttribute('data-map-node') || '?'),
    );
    expect(nameless, 'map nodes with a bare id for a name').toEqual([]);

    const stops = () => canvas.locator('[data-map-node][tabindex="0"]').count();
    expect(await stops(), 'the map is not exactly one tab stop').toBe(1);

    // Tab into the map from the segmented control above it.
    //
    // Roadmap 2.9 put the navigator between the two — the path line, the filter
    // row, the search field and the outline — so the map is no longer the very
    // next stop. What 2.5 holds is unchanged and is checked here in full: the
    // map is reachable from the keyboard, it is **one** stop, and every stop on
    // the way to it announces itself. A count of Tab presses was never the
    // claim; a reader who cannot name the control they have landed on is.
    await page.locator('[data-cc-segmented] [data-cc-segment="on"]').focus();
    let firstFocused: string | null = null;
    const onTheWay: string[] = [];
    for (let press = 0; press < 25 && !firstFocused; press += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        return {
          node: element?.getAttribute('data-map-node') ?? null,
          name: (element?.getAttribute('aria-label') || element?.textContent || '').trim(),
        };
      });
      if (stop.node) firstFocused = stop.node;
      else onTheWay.push(stop.name);
    }
    expect(firstFocused, 'Tab never reached a node of the map').toBeTruthy();
    expect(onTheWay.filter((name) => !name), 'a tab stop on the way to the map announces nothing').toEqual([]);

    // --- the arrow keys move along the flow, and Enter opens the code -----
    await page.keyboard.press('ArrowRight');
    const second = await page.evaluate(() => document.activeElement?.getAttribute('data-map-node'));
    expect(second, 'ArrowRight did not move the focus').not.toBe(firstFocused);
    expect(second).toBeTruthy();
    expect(await stops(), 'moving the focus left two tab stops behind').toBe(1);

    await page.keyboard.press('Enter');
    const card = page.locator(`[data-process-code-card="${second}"]`);
    await card.waitFor({ timeout: 15000 });

    const element = model.elements.find((e) => e.id === second);
    expect(element, `${second} is not an element of the model`).toBeTruthy();
    if (element?.anchor) {
      const marked = await card.locator('[data-cc-code-line="highlighted"]').allInnerTexts();
      const expected: number[] = [];
      for (let n = element.anchor.lineStart; n <= element.anchor.lineEnd; n += 1) expected.push(n);
      expect(marked.length, 'the code card marked the wrong number of lines').toBe(expected.length);
      const sourceLines = FIXTURE.split('\n');
      for (const [index, text] of marked.entries()) {
        const number = expected[index];
        expect(text, `the marked line is not line ${number}`).toContain(String(number));
        expect(text.replace(/\s+/g, ' ')).toContain(sourceLines[number - 1].trim().replace(/\s+/g, ' '));
      }
    } else {
      await expect(card.locator('[data-process-code-card-unanchored]')).toContainText(UNANCHORED);
    }

    // --- Escape closes it and gives the focus back to the node ------------
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    const afterEscape = await page.evaluate(() => document.activeElement?.getAttribute('data-map-node'));
    expect(afterEscape, 'Escape did not return the focus to the node').toBe(second);

    // --- "Map | Steps": the same list, and one tab stop there too ---------
    await page.getByRole('radio', { name: 'Steps' }).click();
    const list = page.locator('[data-process-step-list]');
    await list.waitFor({ timeout: 15000 });
    const topPlane = model.planes[0].elementIds;
    await expect(list.locator('[data-step-node]')).toHaveCount(topPlane.length);
    expect(
      await list.locator('[data-step-node]').evaluateAll((els) => els.map((el) => el.getAttribute('data-step-node'))),
      'the step list is not the map in the same order',
    ).toEqual(topPlane);
    expect(await list.locator('[data-step-node][tabindex="0"]').count()).toBe(1);

    await list.locator('[data-step-node]').first().focus();
    await page.keyboard.press('ArrowDown');
    const inList = await page.evaluate(() => document.activeElement?.getAttribute('data-step-node'));
    expect(inList, 'ArrowDown did not move inside the step list').toBe(topPlane[1]);
    await page.keyboard.press('Enter');
    await page.locator(`[data-process-code-card="${topPlane[1]}"]`).waitFor({ timeout: 15000 });
  });

  test('the traceability quote is measured by the server and kept with the model', async ({ page, request }) => {
    test.setTimeout(240 * 1000);
    const path = `/api/projects/${PROJECT_ID}/process-map`;
    const headers = { Authorization: `Bearer ${idToken}` };

    // Nothing measures itself into existence: before anyone looks, there is none.
    const before = await request.get(path, { headers });
    expect(before.status(), await before.text()).toBe(200);

    await signIn(page);
    await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-process-map]').waitFor({ timeout: 60000 });

    await expect.poll(
      async () => {
        const res = await request.get(path, { headers });
        if (!res.ok()) return null;
        return ((await res.json()) as { record: { sourceSha256?: string } | null }).record?.sourceSha256 ?? null;
      },
      { timeout: 90000, message: 'opening the map stored no quote for this source' },
    ).toBe(sha256Hex(FIXTURE));

    const res = await request.get(path, { headers });
    const record = ((await res.json()) as { record: Record<string, unknown> }).record;
    const { bpmn } = fixtureModel();
    expect(record.flowNodes).toBe(bpmn.stats.flowNodes);
    expect(record.anchored).toBe(bpmn.stats.anchored);
    expect(record.unanchored).toBe(bpmn.stats.unanchored);
    expect(record.fileName).toBe(FILE_NAME);
    expect(record.runId).toBe(RUN_ID);
    // Counted out of the file's own traces, like the legend.
    expect(record.statuses).toEqual({ reconstructed: bpmn.stats.flowNodes });

    // The quote is not part of the trust chain: no client can write it, and
    // `firestore.rules` has no match for the collection it lives in.
    const rules = readRules();
    expect(rules, 'process_map grew a rule — it is written by the Admin SDK alone')
      .not.toContain('process_map');
  });
});
