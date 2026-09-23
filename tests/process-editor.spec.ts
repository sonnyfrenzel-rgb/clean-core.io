import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { recomputeStoredRunHash, signRunHash } from '../lib/run-signature';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import {
  CLEAN_CORE_HINT_RULES,
  DEVIATES_WITHOUT_STATE,
  GATEWAY_WITHOUT_CONDITION,
  LANE_RECONSTRUCTED_ONLY,
  TASK_WITHOUT_ANCHOR,
  cleanCoreHints,
  countHints,
  hintSentence,
} from '../lib/process-hints';
import { EDITOR_PALETTE } from '../components/process-map/BpmnEditor';

/**
 * The editor and its check hints — roadmap 3.1 and 3.3.
 *
 * The two steps are measured together because 3.3 is written as *"Prüfhinweise
 * **beim Modellieren**"*: a hint that nobody can provoke is not a hint, and an
 * editor whose drawing is never checked is the half of 3.1 that matters least.
 *
 * Two halves, and the split is on purpose:
 *
 *   - **the four rules, at the source.** They are pure — XML in, hints out — so
 *     they are measured on the 1.000-line example without a browser, on the
 *     reconstruction and on the same file with one step and one decision drawn
 *     into it. The numbers are asserted, not described;
 *   - **the editor, rendered.** A palette is a surface: whether it can be
 *     reached by Tab, whether a button says what it makes, and whether pressing
 *     it puts an element on the canvas cannot be read off the source. So the
 *     second half signs in, opens the map, switches to editing and presses the
 *     keys a reader would press.
 *
 * The one rule of 3.3 — *hints, never blocks* — is asserted as such, in the
 * browser: with hints on the canvas, **Save is pressable**, the element stays,
 * and switching the hints off changes nothing but the list.
 */

const EXAMPLE = path.resolve(
  __dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
);
const FILE_NAME = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PROCESS_NAME = 'Order fulfilment audit';

/** Line feeds only — the same bytes here and in CI (`CLAUDE.md`, gotchas). */
function exampleSource(): string {
  return fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');
}

function exampleModel(source = exampleSource()): ProcessMapModel {
  const bpmn = buildBpmnExportFromSource(source, {
    processName: PROCESS_NAME,
    sourceFileName: FILE_NAME,
  });
  const named = applyNaming(namingContextOf(source), null, 'no-key');
  return buildProcessMapModel({ bpmn, named, fileName: FILE_NAME });
}

function labelsOf(model: ProcessMapModel): Map<string, string> {
  return new Map(model.elements.map((element) => [element.id, element.label]));
}

/* ------------------------------------------------------------------ *
 * The four rules, on the 1.000-line example.
 * ------------------------------------------------------------------ */

test.describe('the four rules of roadmap 3.3', () => {
  test('on the reconstruction they report the two lanes and nothing else', () => {
    const model = exampleModel();
    const hints = cleanCoreHints({
      xml: model.xml,
      labels: labelsOf(model),
      proposedLanes: model.lanes,
    });
    const counts = countHints(hints);

    // Every element of this example carries a line anchor — the navigation spec
    // asserts the same 77 of 77 (64 until roadmap 2.17 (b) gave nine loop bodies
    // a plane of their own) — so the two rules about a missing anchor have
    // nothing to say, and saying nothing is the right answer rather than a gap.
    expect(model.traceability.unanchored).toBe(0);
    expect(model.traceability.anchored).toBe(77);
    expect(counts.byRule.get(TASK_WITHOUT_ANCHOR) ?? 0).toBe(0);
    expect(counts.byRule.get(DEVIATES_WITHOUT_STATE) ?? 0).toBe(0);

    // **Two numbers moved here, in two different steps, and they are worth
    // keeping apart.**
    //
    // Roadmap 2.16 put a `laneSet` in the file: two lanes, reconstructed from
    // an `AUTHORITY-CHECK` object and an `IN UPDATE TASK`. Rule 3 reports every
    // lane nobody has confirmed, so 0 → 2, and it is the rule working rather
    // than a defect — §8 forbids a role mandate and this is where the file says
    // so out loud.
    //
    // Roadmap 2.17 (b) took the other six away. They were all six `LOOP AT`
    // gateways: the product warning that a decision it had drawn itself says
    // nothing, at a place where the code takes no decision at all. 2.17 stopped
    // drawing the gateway — a `LOOP AT` over a table is a multi-instance
    // activity now — so 6 → 0 without rule 2 being touched.
    expect(counts.byRule.get(LANE_RECONSTRUCTED_ONLY)).toBe(2);
    expect(counts.byRule.get(GATEWAY_WITHOUT_CONDITION) ?? 0).toBe(0);
    expect(counts.total).toBe(2);

    // A hint is named and readable. A lane is not a flow node, so it is not in
    // `model.elements` — the name it carries is the evidence token 2.16 read
    // out of the source, and the hint has to say it.
    expect(hints.map((hint) => hint.elementLabel).sort()).toEqual(['UPDATE TASK', 'V_VBAK_VKO']);
    for (const hint of hints) {
      expect(hint.elementId, 'a hint without an element').toBeTruthy();
      expect(hint.message).toContain(hint.elementLabel);
      expect(hint.message).toContain('nobody has confirmed');
      expect(hint.message.length).toBeGreaterThan(30);
    }
  });

  test('one unlabelled branch is a default flow, and is never reported', () => {
    const model = exampleModel();
    const reported = new Set(
      cleanCoreHints({ xml: model.xml, labels: labelsOf(model) })
        .filter((hint) => hint.ruleId === GATEWAY_WITHOUT_CONDITION)
        .map((hint) => hint.elementId),
    );
    const decisions = model.elements.filter((element) => element.tag === 'exclusiveGateway');

    // 19 and 13 until roadmap 2.15: two of this level's decisions only read a
    // return code behind a step and became the boundary event on it. 17 and 11
    // until roadmap 2.17 (b), where the six the rule reported were **all six**
    // `LOOP AT` gateways and stopped being gateways at all.
    //
    // 12 and 12 since: the nine loops left the count, and two routines that used
    // to collapse into a single step — `SELECT_ITEMS` and `PERSIST_RUN_LOG`,
    // both built around a `LOOP AT` — now stand as phases and bring four
    // decisions of their own onto a plane of the file. Every one of the twelve
    // is quiet, and the assertion below is what makes that mean something: each
    // of them carries a condition on all but at most one branch, which is what
    // BPMN calls a default flow and what the rule is written to leave alone.
    expect(decisions).toHaveLength(12);
    const quiet = decisions.filter((element) => !reported.has(element.id));
    expect(quiet).toHaveLength(12);
    for (const element of quiet) {
      const conditions = element.branches.map((branch) => branch.condition);
      expect(
        conditions.filter((condition) => !condition.trim()).length,
        `${element.id} was left quiet although it says nothing`,
      ).toBeLessThan(2);
    }
  });

  test('told apart by where the gateway comes from: reconstructed warns, modelled informs', () => {
    // Roadmap 3.3, §16 V7 (22.09.2026). The rule used to say `warn` everywhere.
    // Over the reference stock of 1.246 SAP standard diagrams that is 554 of
    // 1.320 XOR splits (42,0 %) and 310 of 1.246 diagrams (24,9 %) — a hint at
    // almost every second diagram, which teaches a reader to skim the list.
    // So: at a reconstructed gateway the code always had a condition and a
    // missing one is an engine defect (`warn`); at a modelled one a reader is
    // allowed to leave the decision open (`info`).
    const model = exampleModel();
    const labels = labelsOf(model);

    // Reconstructed: a gateway the engine drew and could not put a condition on
    // stays the strongest word the list uses. Since 2.17 (b) the 1.000-line
    // example has none — its six were all `LOOP AT` gateways, and a loop is no
    // longer a gateway — so the reconstructed half is measured on a drawing
    // that carries the trace 2.6 writes, further down in this test.
    expect(
      cleanCoreHints({ xml: model.xml, labels }).filter((hint) => hint.ruleId === GATEWAY_WITHOUT_CONDITION),
    ).toEqual([]);

    // Modelled: a decision drawn in the editor of 3.1, two branches, neither
    // says what decides. It carries no `cc:trace`, because there is nothing in
    // the source for it to point at.
    const drawn = model.xml.replace(
      '</bpmn:process>',
      '<bpmn:exclusiveGateway id="Gateway_drawn" name="Needs approval?" />'
      + '<bpmn:task id="Task_yes" name="Approve" /><bpmn:task id="Task_no" name="Reject" />'
      + '<bpmn:sequenceFlow id="Flow_drawn_yes" sourceRef="Gateway_drawn" targetRef="Task_yes" />'
      + '<bpmn:sequenceFlow id="Flow_drawn_no" sourceRef="Gateway_drawn" targetRef="Task_no" />'
      + '</bpmn:process>',
    );
    const gateway = cleanCoreHints({ xml: drawn, labels })
      .find((hint) => hint.ruleId === GATEWAY_WITHOUT_CONDITION && hint.elementId === 'Gateway_drawn');
    expect(gateway, 'the modelled decision was not reported at all').toBeTruthy();
    expect(gateway?.severity).toBe('info');
    expect(gateway?.message).toContain('Needs approval?');

    // And the rule is told apart by provenance only — the same drawing with the
    // trace 2.6 writes is the engine's, and is a `warn` again.
    const asReconstructed = drawn.replace(
      '<bpmn:exclusiveGateway id="Gateway_drawn" name="Needs approval?" />',
      '<bpmn:exclusiveGateway id="Gateway_drawn" name="Needs approval?">'
      + '<cc:trace status="reconstructed" node="n_drawn" kind="branch" lineStart="10" lineEnd="12" />'
      + '</bpmn:exclusiveGateway>',
    );
    const again = cleanCoreHints({ xml: asReconstructed, labels })
      .find((hint) => hint.ruleId === GATEWAY_WITHOUT_CONDITION && hint.elementId === 'Gateway_drawn');
    expect(again?.severity).toBe('warn');
  });

  test('a step and a decision drawn by hand are both reported, by name', () => {
    const model = exampleModel();
    const labels = labelsOf(model);
    const drawn = model.xml.replace(
      '</bpmn:process>',
      '<bpmn:task id="Task_hand" name="Approve by hand" />'
      + '<bpmn:exclusiveGateway id="Gateway_hand" name="Over the limit?" /></bpmn:process>',
    );
    const hints = cleanCoreHints({ xml: drawn, labels, proposedLanes: model.lanes });
    const counts = countHints(hints);

    // The step is rule 1's and the decision is rule 4's, and neither element
    // collects two hints saying the same thing.
    expect(counts.byRule.get(TASK_WITHOUT_ANCHOR)).toBe(1);
    expect(counts.byRule.get(DEVIATES_WITHOUT_STATE)).toBe(1);
    // 8 until 2.16 added the two lanes (→ 10) and 2.17 (b) took the six
    // `LOOP AT` gateways away (→ 4): the two drawn elements plus the two lanes.
    expect(counts.total).toBe(4);
    expect(counts.byRule.get(LANE_RECONSTRUCTED_ONLY)).toBe(2);

    const task = hints.find((hint) => hint.elementId === 'Task_hand');
    expect(task?.ruleId).toBe(TASK_WITHOUT_ANCHOR);
    expect(task?.message).toContain('Approve by hand');
    expect(task?.message).toContain('no line anchor');

    const gateway = hints.find((hint) => hint.elementId === 'Gateway_hand');
    expect(gateway?.ruleId).toBe(DEVIATES_WITHOUT_STATE);
    expect(gateway?.message).toContain('Over the limit?');
    expect(gateway?.message).toContain('no state');

    // And the state of roadmap 3.5, when there is one, ends the hint.
    const withState = cleanCoreHints({
      xml: drawn,
      labels,
      states: new Map([['Gateway_hand', 'change-deliberately']]),
    });
    expect(withState.some((hint) => hint.elementId === 'Gateway_hand')).toBe(false);
  });

  test('a lane is reported whether it was proposed or drawn, and never as evidence', () => {
    const model = exampleModel();
    const withLane = model.xml.replace(
      '<bpmn:process',
      '<bpmn:process id="lanes-here"><bpmn:laneSet><bpmn:lane id="Lane_ops" name="Operations" />'
      + '</bpmn:laneSet></bpmn:process><bpmn:process',
    );
    const hints = cleanCoreHints({
      xml: withLane,
      labels: labelsOf(model),
      proposedLanes: [
        { key: 'sales', name: 'Sales', anchored: false },
        { key: 'finance', name: 'Finance', anchored: true },
      ],
    });
    const lanes = hints.filter((hint) => hint.ruleId === LANE_RECONSTRUCTED_ONLY);

    // Four, and they are three different things. `Operations` is a lane drawn
    // into the file by hand; `Sales` is an unanchored proposal; `UPDATE TASK`
    // and `V_VBAK_VKO` are the two lanes roadmap 2.16 reconstructs from this
    // program's own `IN UPDATE TASK` and `AUTHORITY-CHECK OBJECT`. The anchored
    // proposal `Finance` rests on something in the code and is left alone.
    expect(lanes.map((hint) => hint.elementLabel).sort())
      .toEqual(['Operations', 'Sales', 'UPDATE TASK', 'V_VBAK_VKO']);
    for (const hint of lanes) expect(hint.severity).toBe('info');
    expect(lanes.some((hint) => hint.elementLabel === 'Finance')).toBe(false);

    // **What 2.16 shifted in this rule, and what it did not.** A reconstructed
    // lane is not a proposal any more — it is read out of a statement, named
    // after the token that statement writes and anchored at its line — so the
    // hint stopped calling it one. It is still reported, and at the same
    // strength, because the half of the sentence that matters is the other
    // half: nobody has confirmed that this is who does the work, and §8 of the
    // roadmap forbids the product from saying they did.
    const reconstructed = lanes.find((hint) => hint.elementLabel === 'V_VBAK_VKO');
    expect(reconstructed?.message).toContain('is reconstructed from the code');
    expect(reconstructed?.message).toContain('nobody has confirmed');
    expect(lanes.find((hint) => hint.elementLabel === 'Operations')?.message).toContain('is a proposal');
  });

  test('the four rules are the four the roadmap names, and a hint never blocks', () => {
    expect(CLEAN_CORE_HINT_RULES.map((rule) => rule.id)).toEqual([
      TASK_WITHOUT_ANCHOR,
      GATEWAY_WITHOUT_CONDITION,
      LANE_RECONSTRUCTED_ONLY,
      DEVIATES_WITHOUT_STATE,
    ]);

    const model = exampleModel();
    const counts = countHints(cleanCoreHints({ xml: model.xml, labels: labelsOf(model) }));
    // Countable, and the sentence that carries the count says what a hint is not.
    // 6 until 2.16 put two lanes in the file and 2.17 (b) took the six `LOOP AT`
    // gateways out of it.
    expect(hintSentence(counts)).toContain('2 check hints');
    expect(hintSentence(counts)).toContain('never stop you saving');
    expect(hintSentence(countHints([]))).toBe('No check hints on this model.');

    // The strongest word the list uses. `DESIGN.md` §2.7 keeps `error` for a
    // state that cannot go on, and no hint is one.
    for (const hint of cleanCoreHints({ xml: model.xml, labels: labelsOf(model) })) {
      expect(['warn', 'info']).toContain(hint.severity);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The editor, in the browser.
 * ------------------------------------------------------------------ */

const STAMP = Date.now();
const EMAIL = `processeditor-${STAMP}@cleancore-test.io`;
const PASSWORD = 'ProcessEditor123!';
const PROJECT_ID = `process-editor-${STAMP}`;
const RUN_ID = `process-editor-run-${STAMP}`;

async function signIn(page: Page) {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

async function openMap(page: Page) {
  await page.goto(`/project/${PROJECT_ID}/documentation`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-process-map]').waitFor({ timeout: 90000 });
  await page.locator('[data-process-map-canvas]').waitFor({ timeout: 90000 });
}

/** Into editing, and wait until the modeller has drawn the copy it was given. */
async function openEditor(page: Page) {
  await page.locator('[data-process-edit-toggle]').click();
  await page.locator('[data-process-editor]').waitFor({ timeout: 60000 });
  await expect
    .poll(async () => page.locator('[data-draft-row]').count(), { timeout: 60000 })
    .toBeGreaterThan(20);
  await expect
    .poll(async () => page.locator('[data-process-editor-canvas] .djs-shape').count(), { timeout: 60000 })
    .toBeGreaterThan(5);
}

test.describe('the editor of roadmap 3.1', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch { /* already connected */ }

    const cred = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD);
    const uid = cred.user.uid;
    const source = exampleSource();

    await adminSetDoc('users', uid, {
      firstName: 'Process', lastName: 'Editor', email: EMAIL,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    const fingerprint = {
      sha256: sha256Hex(source),
      fileName: FILE_NAME,
      lineCount: source.split('\n').length,
      byteSize: source.length,
      objectType: 'Report',
      uploadedAt: new Date().toISOString(),
    };

    await adminSetDoc('projects', PROJECT_ID, {
      name: PROCESS_NAME,
      userId: uid,
      createdAt: new Date(),
      status: 'documented',
      legacyCode: source,
      activeRunId: RUN_ID,
      inputFingerprint: fingerprint,
    });

    // Signed the way `api/runs/create` signs one. Since the QA finding of
    // 33e0feb4fe87 the revision store loads this document and verifies its HMAC
    // before it reconstructs anything, so an unsigned fixture would make the
    // stage's baseline call fail for a reason that has nothing to do with 3.1.
    const unsignedRun = {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed',
      inputFingerprint: fingerprint,
    };
    const runHash = recomputeStoredRunHash(unsignedRun);
    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      ...unsignedRun,
      runHash,
      signature: signRunHash(runHash, process.env.AUDIT_SIGNING_KEY!),
    });
  });

  test('the palette offers every element the roadmap names, each one a button with a name', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);
    await openEditor(page);

    // The roadmap's own list: pools and lanes, start/intermediate/end events,
    // exclusive and parallel gateways, task types, sub-process, data object,
    // message flow, annotation. Asserted as BPMN types, so a button that was
    // renamed but creates nothing new cannot satisfy it.
    const types = await page.locator('[data-palette-item]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-palette-type') ?? ''));
    expect(types).toEqual(EDITOR_PALETTE.map((entry) => entry.type));
    expect(new Set(types)).toEqual(new Set([
      'bpmn:Participant', 'bpmn:Lane', 'bpmn:SubProcess',
      'bpmn:StartEvent', 'bpmn:IntermediateThrowEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway',
      'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SendTask', 'bpmn:ReceiveTask',
      'bpmn:ManualTask', 'bpmn:BusinessRuleTask', 'bpmn:ScriptTask',
      'bpmn:DataObjectReference', 'bpmn:MessageFlow', 'bpmn:TextAnnotation',
    ]));

    // Every one of them is a real control with a spoken name, not a drag handle.
    for (const entry of EDITOR_PALETTE) {
      const button = page.locator(`[data-palette-item="${entry.id}"]`);
      await expect(button, `${entry.id} is not a button`).toHaveJSProperty('tagName', 'BUTTON');
      await expect(button).toHaveText(entry.label);
      await expect(button).toBeEnabled();
    }
  });

  test('a step drawn with the keyboard lands on the canvas and in the list', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);
    await openEditor(page);

    const before = await page.locator('[data-draft-row]').count();
    const shapesBefore = await page.locator('[data-process-editor-canvas] .djs-shape').count();

    // Pick a step in the list with the keyboard only: focus the list, then the
    // arrow keys. This is the path a reader without a mouse takes, and the
    // canvas is an SVG, so it is the only one.
    const first = await page.locator('[data-draft-row]').first().getAttribute('data-draft-row');
    await page.locator('[data-draft-row]').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const anchorTo = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute('data-draft-row') ?? '');
    expect(anchorTo, 'the arrow keys did not move the focus inside the list').toBeTruthy();
    expect(anchorTo, 'two presses of ArrowDown left the focus on the first row').not.toBe(first);
    await expect(page.locator(`[data-draft-row="${anchorTo}"]`)).toHaveAttribute('aria-selected', 'true');

    // And draw, with Enter on a named button.
    await page.locator('[data-palette-item="user-task"]').focus();
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => page.locator('[data-draft-row]').count(), { timeout: 30000 })
      .toBe(before + 1);
    expect(await page.locator('[data-process-editor-canvas] .djs-shape').count())
      .toBeGreaterThan(shapesBefore);

    // The new element is in the list, marked as drawn rather than read.
    const drawn = page.locator('[data-draft-row][data-drawn="true"]');
    await expect(drawn).toHaveCount(1);
    await expect(drawn).toContainText('User step');
  });

  test('the hints name what was drawn, count it, switch off — and block nothing', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);
    await openEditor(page);

    // The reconstruction's own hints are there before anything is drawn, and
    // the standard rules of bpmnlint arrive beside them. Until 2.17 (b) these
    // were six `LOOP AT` gateways; they are the two lanes of 2.16 now, which is
    // what the source half of this file counts too.
    await expect
      .poll(async () => Number(await page.locator('[data-hints-count]').innerText()), { timeout: 60000 })
      .toBeGreaterThanOrEqual(2);
    await page.locator('[data-hints-toggle]').click();
    await expect(page.locator(`[data-hint-rule="${LANE_RECONSTRUCTED_ONLY}"]`).first()).toBeVisible();
    // bpmnlint and its rule modules are a dynamic import, so the standard rules
    // arrive after the four. Polled rather than read once: a count taken in the
    // gap would be zero here and non-zero on a machine that compiled faster.
    await expect
      .poll(async () => page.locator('[data-hint-source="bpmnlint"]').count(), { timeout: 60000 })
      .toBeGreaterThan(0);

    const before = Number(await page.locator('[data-hints-count]').innerText());

    // Draw a task. It carries no anchor, so rule 1 has something to say about it.
    await page.locator('[data-draft-row]').first().click();
    await page.locator('[data-palette-item="task"]').click();

    await expect
      .poll(async () => page.locator(`[data-hint-rule="${TASK_WITHOUT_ANCHOR}"]`).count(), { timeout: 30000 })
      .toBe(1);
    const hint = page.locator(`[data-hint-rule="${TASK_WITHOUT_ANCHOR}"]`).first();
    await expect(hint).toContainText('no line anchor');
    // It names the element it means, and pressing it selects that element.
    const named = await hint.getAttribute('data-hint-element');
    expect(named).toBeTruthy();
    await hint.click();
    await expect(page.locator(`[data-draft-row="${named}"]`)).toHaveAttribute('aria-selected', 'true');
    expect(Number(await page.locator('[data-hints-count]').innerText())).toBeGreaterThan(before);

    // **Hints, not blocks.** With hints on the model, Save is pressable, it
    // answers, and the drawn element is still on the canvas afterwards. Since
    // 3.2 the answer is a revision rather than a sentence about a step that has
    // not been built — the hints are the thing under test either way, and what
    // matters here is that a model with hints on it is kept, not refused.
    const save = page.locator('[data-editor-save]');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator('[data-editor-saved]')).toContainText(/Saved as revision \d+\./, { timeout: 30000 });
    await expect(page.locator('[data-draft-row][data-drawn="true"]')).toHaveCount(1);

    // Switchable: off means an empty list and a count of nothing, and drawing
    // goes on working with the hints off.
    await page.locator('[data-hints-switch]').uncheck();
    await expect(page.locator('[data-hints-count]')).toHaveText('0');
    await expect(page.locator('[data-process-hint]')).toHaveCount(0);
    const rows = await page.locator('[data-draft-row]').count();
    await page.locator('[data-palette-item="end-event"]').click();
    await expect
      .poll(async () => page.locator('[data-draft-row]').count(), { timeout: 30000 })
      .toBe(rows + 1);
  });

  test('editing leaves the reconstructed Ist exactly as it was', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const model = exampleModel();
    const traceability = await page.locator('[data-process-map-traceability]').innerText();
    const rowsBefore = await page.locator('[data-tree-node]').count();
    expect(traceability).toContain(model.traceability.sentence);
    // The drawing itself, not only the sentence above it: an editor that handed
    // its draft back to the reading canvas would show two shapes more here and
    // every count derived from the model would still agree with itself.
    const shapesBefore = await page.locator('[data-process-map-canvas] .djs-shape').count();
    expect(shapesBefore).toBeGreaterThan(10);

    await openEditor(page);
    await page.locator('[data-draft-row]').first().click();
    await page.locator('[data-palette-item="service-task"]').click();
    await page.locator('[data-palette-item="exclusive-gateway"]').click();
    await expect(page.locator('[data-draft-row][data-drawn="true"]')).toHaveCount(2);

    // Back to reading. Phase 3's acceptance: *"die Ist-Revision nach dem
    // Bearbeiten ist unverändert"* — so the sentence over the map, the outline
    // and the number of shapes are the numbers of the reconstruction.
    await page.locator('[data-process-edit-toggle]').click();
    await page.locator('[data-process-map-canvas]').waitFor({ timeout: 60000 });
    await expect(page.locator('[data-process-map-traceability]')).toHaveText(traceability);
    expect(await page.locator('[data-tree-node]').count()).toBe(rowsBefore);
    await expect
      .poll(async () => page.locator('[data-process-map-canvas] .djs-shape').count(), { timeout: 60000 })
      .toBe(shapesBefore);
    // 2.5 puts one button over every flow node of every level; 65 of them is
    // the reconstruction and 67 would be the two elements drawn above.
    await expect
      .poll(async () => page.locator('[data-process-map-canvas] [data-map-node]').count(), { timeout: 60000 })
      .toBe(model.elements.length);

    // And the draft is not lost by looking away: going back finds both elements.
    await openEditor(page);
    await expect(page.locator('[data-draft-row][data-drawn="true"]')).toHaveCount(2);

    // Discard throws the draft away and opens the reconstruction again.
    await page.locator('[data-editor-discard]').click();
    await expect
      .poll(async () => page.locator('[data-draft-row][data-drawn="true"]').count(), { timeout: 30000 })
      .toBe(0);
  });
});
