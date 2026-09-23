import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { sha256Hex } from '../lib/artefact-digest';
import { buildBpmnExportFromSource, CC_NAMESPACE } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { deriveBusinessRules, rulesForElement } from '../lib/abap/business-rule-set';
import {
  buildNavigation,
  buildOverlays,
  formatMapAddress,
  mainPath,
  miniMap,
  parseMapAddress,
  pathsToHere,
  levelOf,
  planePath,
  planeProblems,
  readRunSwitches,
  resolveMapAddress,
  runVariant,
  searchProcess,
} from '../lib/process-navigation';

/**
 * Navigating a large process — roadmap 2.9.
 *
 * The step has one acceptance and it is a number:
 *
 * > **At the 1.000-line example, every step is reachable in at most three
 * > actions, by keyboard as by mouse.**
 *
 * So this file counts them. Not three of them: **all 77 flow nodes of that
 * example, one at a time, in the browser, on both paths.** The count is
 * asserted per node and the worst case is asserted at the end, which is the
 * only way a claim like that survives the next change to the tree.
 *
 * **What an action is**, written down once so that the number means something:
 * one decision a reader commits — a click on a named control, a key press, or
 * one typed address. Scrolling, hovering, moving the pointer and reading are
 * not actions; nor is the setup between two measurements, which this file does
 * explicitly and outside the count.
 *
 * The two paths measured are the two the view offers:
 *
 *   - **mouse** — click the row in the outline; for a step one level down,
 *     click its phase and then its row. One or two;
 *   - **keyboard** — `Ctrl+K`, the outline number, `Enter`. Three, from a page
 *     whose focus is on nothing, which is the state a reader actually starts in.
 *
 * The 1.000-line example is read from `public/starter-examples/` and normalised
 * to line feeds first. Its **raw byte count is never pinned**: the file is CRLF
 * here and LF in CI (`CLAUDE.md`, gotchas), and a test that asserted its length
 * would be red on one machine and green on the other for no reason at all.
 */

const EXAMPLE = path.resolve(
  __dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
);
const FILE_NAME = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PROCESS_NAME = 'Order fulfilment audit';

/** Line feeds only — the same bytes here and in CI. */
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

function rulesByNode(source: string, model: ProcessMapModel): Map<string, string[]> {
  const set = deriveBusinessRules(source);
  const out = new Map<string, string[]>();
  for (const element of model.elements) {
    if (!element.nodeId || out.has(element.nodeId)) continue;
    const found = rulesForElement(set, element.nodeId).map((rule) => rule.id);
    if (found.length > 0) out.set(element.nodeId, found);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The outline — one order, and the same one every time.
 * ------------------------------------------------------------------ */

test.describe('the outline of the 1.000-line example', () => {
  test('it is the 77 flow nodes on 16 levels, each with one address', () => {
    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);

    // The fixture, stated as the numbers the step was specified against. If the
    // engine ever draws this program differently these come first, and every
    // count below is measured against the model rather than against them.
    // 65 until roadmap 2.15: one `IF sy-subrc` of this program stood behind a
    // `CALL FUNCTION … EXCEPTIONS` that already carried a boundary event, and
    // the two of them are now the one element they always were.
    //
    // 64 on 8 levels until roadmap 2.17 (b). A `LOOP AT` over a table is a
    // collapsed sub-process with the body inside it now, so this program's nine
    // drawable loops each open a level of their own and each bring the end event
    // of that level with them; two routines that used to collapse into one step
    // stand as phases beside them. The depth the reader has to walk is measured
    // further down and is **unchanged**: three actions, never more.
    expect(model.elements).toHaveLength(77);
    expect(model.planes).toHaveLength(16);
    expect(model.traceability.anchored).toBe(77);
    expect(model.traceability.unanchored).toBe(0);

    expect(nav.order, 'an element of the model is not in the outline').toHaveLength(model.elements.length);
    expect(new Set(nav.order).size, 'an element stands twice in the outline').toBe(nav.order.length);

    const outlines = nav.order.map((id) => nav.entries.get(id)?.outline ?? '');
    expect(outlines.filter((outline) => !outline), 'an element with no address').toEqual([]);
    expect(new Set(outlines).size, 'two elements share an address').toBe(outlines.length);

    // The address says where the element is: `6.2` is the second element of the
    // level the sixth element of the top plane opens.
    for (const id of nav.order) {
      const entry = nav.entries.get(id);
      if (!entry) continue;
      expect(entry.outline.split('.').length - 1, `${entry.outline} is not at depth ${entry.depth}`)
        .toBe(entry.depth);
      if (entry.ancestors.length > 0) {
        const parent = nav.entries.get(entry.ancestors[entry.ancestors.length - 1]);
        expect(entry.outline.startsWith(`${parent?.outline}.`), `${entry.outline} is not under ${parent?.outline}`)
          .toBe(true);
      }
    }
  });

  test('the same source gives the same arrangement, every time', () => {
    const source = exampleSource();
    const first = buildNavigation(exampleModel(source));
    const second = buildNavigation(exampleModel(source));
    expect(second.order).toEqual(first.order);
    expect(second.order.map((id) => second.entries.get(id)?.outline))
      .toEqual(first.order.map((id) => first.entries.get(id)?.outline));
    expect(miniMap(exampleModel(source), second)).toEqual(miniMap(exampleModel(source), first));

    // And it is the same arrangement on another machine. The one thing that
    // reliably differs between this checkout and CI is the line ending of the
    // file in `public/` — CRLF here, LF there — so that is the difference the
    // test makes: the same program with carriage returns gives the same
    // addresses, and a reader who learnt that the credit check is 14 finds it
    // wherever the page is served from.
    const withCrLf = buildNavigation(exampleModel(source.replace(/\n/g, '\r\n')));
    expect(
      withCrLf.order.map((id) => withCrLf.entries.get(id)?.outline),
      'the arrangement depends on how the file ends its lines',
    ).toEqual(first.order.map((id) => first.entries.get(id)?.outline));
  });

  test('every address finds its own element and no other', () => {
    const model = exampleModel();
    const nav = buildNavigation(model);
    const wrong: string[] = [];
    for (const id of nav.order) {
      const outline = nav.entries.get(id)?.outline ?? '';
      const hits = searchProcess(model, nav, outline);
      if (hits[0]?.id !== id) wrong.push(`${outline} → ${hits[0]?.id ?? 'nothing'} instead of ${id}`);
    }
    expect(wrong, 'an address that does not reach its own step:').toEqual([]);

    // Which is exactly what names cannot do here, and why the address exists.
    expect(new Set(model.elements.map((element) => element.label)).size)
      .toBeLessThan(model.elements.length);
  });
});

/* ------------------------------------------------------------------ *
 * What each part claims.
 * ------------------------------------------------------------------ */

test.describe('the parts of the navigation say what the file says', () => {
  test('the path line is the chain of levels above the open one', () => {
    const model = exampleModel();
    const nav = buildNavigation(model);
    expect(planePath(nav, null)).toEqual([]);
    for (const plane of nav.planes.keys()) {
      if (plane === null) continue;
      const crumbs = planePath(nav, plane);
      expect(crumbs[crumbs.length - 1]).toBe(plane);
      expect(crumbs.slice(0, -1)).toEqual(nav.entries.get(plane)?.ancestors);
    }
  });

  test('the main path walks the default branches and reaches the end of the level', () => {
    const model = exampleModel();
    const nav = buildNavigation(model);
    const byId = new Map(model.elements.map((element) => [element.id, element]));

    // The top plane of a report holds four event blocks; a walk that stopped at
    // the first would call two of the 23 elements the main path.
    const top = mainPath(model, nav, null);
    expect(top.length).toBe((nav.planes.get(null) ?? []).length);
    expect(byId.get(top[top.length - 1])?.tag).toBe('endEvent');

    for (const plane of nav.planes.keys()) {
      const ids = nav.planes.get(plane) ?? [];
      const walk = mainPath(model, nav, plane);
      expect(walk.length, `the main path of ${plane ?? 'the top level'} is empty`).toBeGreaterThan(0);
      expect(new Set(walk).size, 'the main path visits an element twice').toBe(walk.length);

      // An element nothing inside the level points at is where a region begins.
      // A report's top level holds four of them, one per event block, so the
      // walk starts over rather than claiming a flow that is not in the file.
      const entered = new Set<string>();
      for (const id of ids) {
        for (const branch of byId.get(id)?.branches ?? []) {
          if (branch.to !== id && ids.includes(branch.to)) entered.add(branch.to);
        }
      }

      // Every step of the walk is either the start of a region or a flow the
      // file writes — and at a gateway it is the branch the file leaves without
      // a condition.
      for (let i = 0; i + 1 < walk.length; i += 1) {
        const next = walk[i + 1];
        if (!entered.has(next) || byId.get(next)?.tag === 'startEvent') continue;
        const branches = (byId.get(walk[i])?.branches ?? []).filter((branch) => branch.to !== walk[i]);
        expect(branches.map((branch) => branch.to), `${walk[i]} does not flow to ${next}`).toContain(next);
        const preferred = branches.find((branch) => branch.condition === '') ?? branches[0];
        expect(preferred?.to, `${walk[i]} took a branch that is not its default`).toBe(next);
      }
    }
  });

  test('"show paths to here" keeps every way there and drops the ways that go elsewhere', () => {
    const model = exampleModel();
    const nav = buildNavigation(model);
    const byOutline = new Map(
      nav.order.map((id) => [nav.entries.get(id)?.outline ?? '', id]),
    );

    // 7.5 is the message inside `IF p_upd = abap_true` inside `IF sy-subrc <> 0`.
    const target = byOutline.get('7.5') as string;
    const on = pathsToHere(model, nav, 'nd-151-0', target);
    const lit = [...on].map((id) => nav.entries.get(id)?.outline).sort();
    expect(lit).toEqual(['7.1', '7.3', '7.4', '7.5']);
    // 7.2 is the other arm of the first decision and 7.6 is past the target.
    expect(lit).not.toContain('7.2');
    expect(lit).not.toContain('7.6');
  });

  test('the problem line of a level says what is not determined, and nothing else', () => {
    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const rules = rulesByNode(source, model);

    for (const plane of nav.planes.keys()) {
      const problem = planeProblems(model, nav, plane, rules);
      const ids = nav.planes.get(plane) ?? [];
      const elements = model.elements.filter((element) => ids.includes(element.id));

      expect(problem.elements).toBe(elements.length);
      expect(problem.notDetermined).toBe(elements.filter((element) => element.anchor === null).length);
      expect(problem.determined).toBe(problem.notDetermined === 0);
      expect(problem.text.length, `${plane ?? 'the top level'} says nothing`).toBeGreaterThan(20);
      // It never beautifies: a level with something unanchored says the number.
      if (!problem.determined) expect(problem.text).toContain(String(problem.notDetermined));
      // And it never invents: every rule it names decides at an element of this level.
      for (const id of problem.hardCoded) {
        const carries = elements.some((element) => (element.nodeId ? rules.get(element.nodeId) ?? [] : []).includes(id));
        expect(carries, `${id} is claimed on a level it does not decide on`).toBe(true);
      }
      if (problem.hardCoded.length === 0) expect(problem.text).toContain('No hard-coded value decides here');
    }

    // The example is fully anchored, so every level says so — and that is a
    // statement the test would catch changing, not a shrug.
    const levels = [...nav.planes.keys()].map((plane) => planeProblems(model, nav, plane, rules));
    expect(levels.every((level) => level.determined)).toBe(true);
    expect(levels.filter((level) => level.hardCoded.length > 0).length,
      'no level of the example has a hard-coded value — the line would be vacuous').toBeGreaterThan(0);
  });

  test('the run variants are the selection-screen switches the code reads as switches', () => {
    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const switches = readRunSwitches(source, model);

    // The six `DESIGN.md` §5.9 item 7 names, and no others. `s_vkorg`, `p_days`,
    // `p_lim` and `p_file` are named by conditions too, but as values rather
    // than as switches — a toggle beside them would promise an effect the code
    // does not have.
    expect(switches.map((entry) => entry.name).sort())
      .toEqual(['p_alv', 'p_bdc', 'p_down', 'p_mail', 'p_rfc', 'p_upd']);
    for (const entry of switches) {
      expect(entry.checkbox, `${entry.name} is not declared as a checkbox`).toBe(true);
      expect(entry.flows, `${entry.name} gates nothing`).toBeGreaterThan(0);
      expect(source.split('\n')[entry.lineStart - 1].toLowerCase(), `${entry.name} is anchored at the wrong line`)
        .toContain(entry.name);
    }
    // The position each one starts at is the one the source declares.
    expect(Object.fromEntries(switches.map((entry) => [entry.name, entry.defaultOn]))).toEqual({
      p_upd: false, p_bdc: true, p_rfc: true, p_mail: false, p_down: true, p_alv: true,
    });

    const declared = new Map(switches.map((entry) => [entry.name, entry.defaultOn ?? true]));

    // A guard dims its own step and the level it opens — and nothing after it.
    // `CHECK p_rfc = abap_true.` at the head of `REMOTE_CREDIT_CHECK` is drawn
    // as the only arrow out of the step before it, so walking it as a fork would
    // claim the program stops there. It does not: it skips one routine.
    const withoutRfc = new Map(declared).set('p_rfc', false);
    const rfc = runVariant(model, nav, switches, withoutRfc);
    const dimmed = [...rfc.excluded].map((id) => nav.entries.get(id)?.outline).sort();
    expect(dimmed).toContain('14');
    // 5 until roadmap 2.17 (b): the `LOOP AT gt_orders` inside
    // `REMOTE_CREDIT_CHECK` is a level of its own now, so the routine the guard
    // closes has one address more under it. The guard still dims its own step
    // and what it opens, and still nothing after it.
    expect(dimmed.filter((outline) => outline?.startsWith('14.'))).toHaveLength(6);
    expect(dimmed, 'the step after the guard was declared unreachable').not.toContain('15');
    expect(dimmed).not.toContain('16');
    expect(rfc.sentence).toContain('p_rfc off');
    expect(rfc.sentence).toContain(`${rfc.excluded.size} of ${nav.order.length}`);

    // A fork is walked as a fork: the arm the switch closes, and what only that
    // arm reaches, are out.
    const withoutBdc = new Map(declared).set('p_bdc', false);
    const bdc = runVariant(model, nav, switches, withoutBdc);
    // 16.5 until roadmap 2.17 (b): the step sits inside the `LOOP AT gt_orders`
    // of `PROCESS_ACTIONS`, and that loop is a level of its own now, so its
    // address grew a segment. Which step it is did not change.
    expect([...bdc.excluded].map((id) => nav.entries.get(id)?.outline)).toContain('16.1.3');

    // And the positions the code declares are themselves a run: `p_upd` is
    // `DEFAULT ' '`, so two steps inside the authority check do not run.
    const asDeclared = runVariant(model, nav, switches, declared);
    expect([...asDeclared.excluded].map((id) => nav.entries.get(id)?.outline).sort())
      .toEqual(['16.1.3', '19', '7.4', '7.5']);
    expect(asDeclared.sentence).toContain('the run the code declares');
  });

  /**
   * A step is out of a run because of **its own** ways in — never because of
   * the flows leaving another element.
   *
   * `runVariant` used to carry an exception to that: a blocked flow that was
   * its source's only way on was walked past and its target struck out by hand,
   * which bought the right answer for a guard in a file that had no way past
   * one. It struck the target out *before* the fixpoint ran and nothing took it
   * back, so a step that a second, running branch reached was shown as not
   * running, together with the level under it (QA `00a4a41e73ac`). Since 2.6
   * writes the bypass into the file, the plain rule gets the guard right on its
   * own and the exception is gone.
   *
   * The file below is the smallest one that tells the two apart: `WRITE_LOG` is
   * reached through a switched-off flow from one branch and through a plain flow
   * from the other. It is written here rather than read out of an example
   * because the rule has to hold for **any** file a modeller hands back, not
   * only for the ones this engine writes today.
   */
  const twoWaysIn = (secondWayIn: boolean): string => [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"'
      + ` xmlns:cc="${CC_NAMESPACE}" id="definitions">`,
    '  <bpmn:process id="process" name="Two ways in" isExecutable="false">',
    '    <bpmn:startEvent id="s" name="START-OF-SELECTION" />',
    '    <bpmn:exclusiveGateway id="g" name="gv_mode" />',
    '    <bpmn:task id="t1" name="PREPARE_LOG" />',
    '    <bpmn:task id="t2" name="PREPARE_PLAIN" />',
    '    <bpmn:task id="j" name="WRITE_LOG" />',
    '    <bpmn:endEvent id="e" name="START-OF-SELECTION" />',
    '    <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="g" />',
    '    <bpmn:sequenceFlow id="f2" sourceRef="g" targetRef="t1" name="gv_mode = &apos;A&apos;" />',
    '    <bpmn:sequenceFlow id="f3" sourceRef="g" targetRef="t2" />',
    // The only way on from `t1`, and a switch decides it.
    '    <bpmn:sequenceFlow id="f4" sourceRef="t1" targetRef="j" name="p_log = abap_true" />',
    `    <bpmn:sequenceFlow id="f5" sourceRef="t2" targetRef="${secondWayIn ? 'j' : 'e'}" />`,
    '    <bpmn:sequenceFlow id="f6" sourceRef="j" targetRef="e" />',
    '  </bpmn:process>',
    '</bpmn:definitions>',
  ].join('\n');

  const TWO_WAYS_SOURCE = [
    'REPORT ztwoways.',
    "PARAMETERS p_log AS CHECKBOX DEFAULT 'X'.",
  ].join('\n');

  const twoWaysModel = (secondWayIn: boolean): ProcessMapModel => buildProcessMapModel({
    bpmn: {
      xml: twoWaysIn(secondWayIn),
      elementNode: {},
      stats: {
        flowNodes: 6, sequenceFlows: 6, subProcesses: 0, planes: 1, dataStores: 0,
        pools: 0, messageFlows: 0, guardBypasses: 0, lanes: 1, anchored: 0, unanchored: 6,
      },
    },
    named: applyNaming(namingContextOf(TWO_WAYS_SOURCE), null, 'no-key'),
    fileName: 'ztwoways.abap',
  });

  test('a step another branch reaches keeps running when a switch closes one way in', () => {
    const model = twoWaysModel(true);
    const nav = buildNavigation(model);
    const switches = readRunSwitches(TWO_WAYS_SOURCE, model);
    expect(switches.map((entry) => entry.name), 'the fixture declares one switch a flow names').toEqual(['p_log']);

    const off = runVariant(model, nav, switches, new Map([['p_log', false]]));
    expect([...off.excluded], 'WRITE_LOG is reached from the other branch').toEqual([]);
    expect(off.sentence).toContain('every step runs');
  });

  test('and is out of the run when that flow is the only way in', () => {
    const model = twoWaysModel(false);
    const nav = buildNavigation(model);
    const switches = readRunSwitches(TWO_WAYS_SOURCE, model);

    const off = runVariant(model, nav, switches, new Map([['p_log', false]]));
    expect([...off.excluded].map((id) => model.elements.find((e) => e.id === id)?.technicalName))
      .toEqual(['WRITE_LOG']);
    expect(off.sentence).toContain('1 of 6 steps do not run');
  });

  test('an overlay marks with a text identifier and changes no flow', () => {
    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const rules = rulesByNode(source, model);
    const overlays = buildOverlays(model, nav, rules);

    expect(overlays.map((overlay) => overlay.key)).toEqual(['hard-coded', 'not-determined', 'decisions']);
    for (const overlay of overlays) {
      expect(overlay.ids.length, `${overlay.key} counts more than there are elements`)
        .toBeLessThanOrEqual(model.elements.length);
      for (const id of overlay.ids) {
        expect(overlay.marks.get(id), `${overlay.key} marks ${id} with nothing`).toBeDefined();
      }
    }

    const hardCoded = overlays[0];
    expect(hardCoded.ids.length, 'no element carries a business rule — the overlay would be vacuous')
      .toBeGreaterThan(0);
    for (const id of hardCoded.ids) {
      expect(hardCoded.marks.get(id)).toMatch(/BR-\d+/);
    }
    expect(overlays[2].ids.length).toBe(
      model.elements.filter((element) => element.tag.endsWith('Gateway')).length,
    );
  });

  test('the address is a fragment, and it survives being written and read back', () => {
    const model = exampleModel();
    const nav = buildNavigation(model);
    const node = nav.order.find((id) => (nav.entries.get(id)?.ancestors.length ?? 0) > 0) as string;
    const plane = nav.entries.get(node)?.plane as string;

    const hash = formatMapAddress({ plane, node });
    expect(hash).toBe(`#map=${encodeURIComponent(plane)}&node=${encodeURIComponent(node)}`);
    expect(parseMapAddress(hash)).toEqual({ plane, node });
    expect(formatMapAddress({ plane: null, node: null })).toBe('');

    // A link outlives the source it was made on: an element the model does not
    // know opens the top level rather than an empty one, and a node always
    // brings its own level with it.
    expect(resolveMapAddress(nav, { plane: 'nd-does-not-exist', node: 'nd-gone' }))
      .toEqual({ plane: null, node: null });
    expect(resolveMapAddress(nav, { plane: null, node })).toEqual({ plane, node });
  });
});

/* ------------------------------------------------------------------ *
 * The acceptance, in the browser, on all 77 steps.
 * ------------------------------------------------------------------ */

const STAMP = Date.now();
const EMAIL = `processnav-${STAMP}@cleancore-test.io`;
const PASSWORD = 'ProcessNav123!';
const PROJECT_ID = `process-nav-${STAMP}`;
const RUN_ID = `process-nav-run-${STAMP}`;

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
  await page.locator('[data-process-outline-tree]').waitFor({ timeout: 90000 });
  // The outline is built from the model; the rules that feed the problem lines
  // arrive one dynamic import later.
  await expect
    .poll(async () => page.locator('[data-tree-node]').count(), { timeout: 60000 })
    .toBeGreaterThan(20);
}

/**
 * Back to the state the view opens in — every phase collapsed, nothing selected,
 * no address.
 *
 * Setup between two measurements, and **never counted**: it is the test putting
 * the page back, not a reader navigating. It asserts what it achieved, because
 * a measurement that started with the answer already on screen would count to
 * zero and pass.
 */
async function resetView(page: Page) {
  // The address first: the level on show is always reachable in the tree, so a
  // phase cannot be collapsed while the view stands inside it.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.history.replaceState(null, '', window.location.pathname);
    // The hook reads the address off the URL; replacing it silently would leave
    // React holding the old selection and the code card open.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(page.locator('[data-process-code-card]'),
    'the view did not go back to nothing selected').toHaveCount(0);

  // Deepest first: collapsing a phase takes its children's rows with it, so a
  // twisty read before the click would be gone by the time it is used.
  const open = await page.locator('[data-tree-node][aria-expanded="true"]').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-tree-node') ?? '',
      level: Number(el.getAttribute('aria-level') ?? '1'),
    })).sort((a, b) => b.level - a.level));
  for (const row of open) await page.locator(`[data-tree-twisty="${row.id}"]`).click();
  await expect(page.locator('[data-tree-node][aria-expanded="true"]'),
    'the view did not go back to the overview').toHaveCount(0);
}

test.describe('every step of the 1.000-line example, in at most three actions', () => {
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
      firstName: 'Process', lastName: 'Navigation', email: EMAIL,
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

    await adminSetDoc(`projects/${PROJECT_ID}/runs`, RUN_ID, {
      runId: RUN_ID, projectId: PROJECT_ID, userId: uid,
      createdAt: new Date().toISOString(), status: 'completed',
      inputFingerprint: fingerprint,
    });
  });

  test('the overview opens with the phases collapsed, each carrying its problem line', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const rules = rulesByNode(source, model);

    // §5.9 item 1: the map opens in the overview. The top level and nothing else.
    const rows = await page.locator('[data-tree-node]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-tree-node') ?? ''));
    expect(rows, 'the outline does not open on the top level alone').toEqual(nav.roots);

    const subProcesses = nav.roots.filter((id) => (nav.entries.get(id)?.children.length ?? 0) > 0);
    expect(subProcesses.length, 'the example has no collapsed phase to check').toBeGreaterThan(5);
    for (const id of subProcesses) {
      const row = page.locator(`[data-tree-node="${id}"]`);
      await expect(row, `${id} did not open collapsed`).toHaveAttribute('aria-expanded', 'false');
      // §5.9 item 4: a line of text, not a colour.
      const problem = planeProblems(model, nav, id, rules);
      await expect(page.locator(`[data-plane-problem="${id}"]`)).toHaveText(problem.text);
      await expect(row.locator('[data-plane-counters]')).toContainText(problem.counters);
    }
  });

  test('the measured acceptance: 77 steps, mouse and keyboard, both at most three', async ({ page }) => {
    test.setTimeout(900 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const model = exampleModel();
    const nav = buildNavigation(model);
    const counts: Array<{ outline: string; id: string; mouse: number; keyboard: number }> = [];

    for (const id of nav.order) {
      const entry = nav.entries.get(id);
      if (!entry) continue;
      const card = page.locator(`[data-process-code-card="${id}"]`);

      /* ---- with the mouse, from the overview ---- */
      await resetView(page);

      let mouse = 0;
      for (const ancestor of entry.ancestors) {
        await page.locator(`[data-tree-node="${ancestor}"]`).click();
        mouse += 1;
      }
      await expect(page.locator(`[data-tree-node="${id}"]`),
        `${entry.outline}: the row is not on screen after ${mouse} clicks`).toHaveCount(1);
      await page.locator(`[data-tree-node="${id}"]`).click();
      mouse += 1;

      await expect(card, `${entry.outline}: the code card did not open with the mouse`).toHaveCount(1);
      const afterMouse = await page.evaluate(() => window.location.hash);
      expect(afterMouse, `${entry.outline}: the address does not name the step`).toContain(`node=${id}`);
      // `levelOf`, not `entry.plane`: §5.9 item 1 says a collapsed sub-process
      // **opens** as its own level, so selecting one lands inside it. Until
      // 2.17 (b) the only sub-processes were routines on the top plane, whose
      // `plane` is null and which this guard therefore never looked at; a
      // `LOOP AT` is a sub-process one level in, and it made the difference
      // visible. The product has one rule for it and this is that rule.
      const level = levelOf(nav, id);
      if (level) {
        expect(afterMouse, `${entry.outline}: the address does not name the level`).toContain(`map=${level}`);
      }

      /* ---- with the keyboard, from a page whose focus is on nothing ---- */
      await resetView(page);

      let keyboard = 0;
      await page.keyboard.press('Control+KeyK');
      keyboard += 1;
      await expect(page.locator('[data-process-search-input]'),
        `${entry.outline}: Ctrl+K did not reach the search field`).toBeFocused();

      await page.keyboard.type(entry.outline);
      keyboard += 1;
      await expect(page.locator('[data-process-search-count]'),
        `${entry.outline}: the address is not the best hit`).toContainText('1 of ');

      await page.keyboard.press('Enter');
      keyboard += 1;

      await expect(card, `${entry.outline}: the code card did not open with the keyboard`).toHaveCount(1);
      // §5.9 item 9 — the search opens the level of the hit.
      const afterKeys = await page.evaluate(() => window.location.hash);
      expect(afterKeys, `${entry.outline}: the address does not name the step`).toContain(`node=${id}`);
      if (level) {
        expect(afterKeys, `${entry.outline}: the search did not open the level of the hit`)
          .toContain(`map=${level}`);
      }

      counts.push({ outline: entry.outline, id, mouse, keyboard });
    }

    /* ---- the measurement, stated ---- */
    expect(counts.length, 'not every step of the example was measured').toBe(77);
    const worstMouse = Math.max(...counts.map((count) => count.mouse));
    const worstKeyboard = Math.max(...counts.map((count) => count.keyboard));
    const over = counts.filter((count) => count.mouse > 3 || count.keyboard > 3);

    // The measured number is the result of this step, so it is printed rather
    // than only asserted: a green tick says "at most three", the line says what
    // it actually took.
    console.log(
      `2.9 acceptance — ${counts.length} steps on ${nav.planes.size} levels: `
      + `mouse ${Math.min(...counts.map((c) => c.mouse))}–${worstMouse}, `
      + `keyboard ${Math.min(...counts.map((c) => c.keyboard))}–${worstKeyboard}.`,
    );

    expect(over.map((count) => `${count.outline}: mouse ${count.mouse}, keyboard ${count.keyboard}`),
      'a step needs more than three actions').toEqual([]);
    expect(worstMouse).toBeLessThanOrEqual(3);
    expect(worstKeyboard).toBeLessThanOrEqual(3);
  });

  test('the level and the selection are in the URL, and Back does the expected thing', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);

    const model = exampleModel();
    const nav = buildNavigation(model);
    const deep = nav.order.find((id) => (nav.entries.get(id)?.ancestors.length ?? 0) > 0) as string;
    const plane = nav.entries.get(deep)?.plane as string;
    const outline = nav.entries.get(deep)?.outline;

    // A shared link opens exactly there.
    await page.goto(
      `/project/${PROJECT_ID}/documentation${formatMapAddress({ plane, node: deep })}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator('[data-process-outline-tree]').waitFor({ timeout: 90000 });
    await expect(page.locator(`[data-process-code-card="${deep}"]`), 'the link did not select the step')
      .toHaveCount(1);
    await expect(page.locator(`[data-process-crumb="${plane}"][aria-current="true"]`),
      'the link did not open the level of the step').toHaveCount(1);
    await expect(page.locator(`[data-tree-node="${deep}"]`), 'the row is not on screen')
      .toHaveAttribute('data-outline', outline ?? '');

    // A second step, then Back.
    const other = nav.roots[1];
    await page.locator(`[data-tree-node="${other}"]`).click();
    await expect.poll(async () => page.evaluate(() => window.location.hash))
      .toContain(`node=${encodeURIComponent(other)}`);

    await page.goBack();
    await expect.poll(
      async () => page.evaluate(() => window.location.hash),
      { message: 'Back did not return to the step the link opened' },
    ).toContain(`node=${encodeURIComponent(deep)}`);
    await expect(page.locator(`[data-process-code-card="${deep}"]`)).toHaveCount(1);

    await page.goForward();
    await expect.poll(
      async () => page.evaluate(() => window.location.hash),
      { message: 'Forward did not go back to the second step' },
    ).toContain(`node=${encodeURIComponent(other)}`);
  });

  test('the arrangement is the same after a reload, and the mini map is the outline', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const model = exampleModel();
    const nav = buildNavigation(model);

    const read = async () => ({
      outlines: await page.locator('[data-tree-node]').evaluateAll((els) =>
        els.map((el) => `${el.getAttribute('data-outline')}=${el.getAttribute('data-tree-node')}`)),
      cells: await page.locator('[data-minimap-cell]').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-minimap-cell') ?? '')),
      rows: await page.locator('[data-minimap-row]').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-minimap-row') ?? '')),
    });

    const before = await read();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openMap(page);
    const after = await read();

    expect(after.outlines, 'the outline moved between two loads of the same source').toEqual(before.outlines);
    expect(after.cells, 'the mini map moved between two loads of the same source').toEqual(before.cells);

    // And it is the arrangement the pure model gives, not one the browser made
    // up: the mini map is one row per level, each row the level in flow order.
    const rows = miniMap(model, nav);
    expect(before.rows).toEqual(rows.map((row) => row.plane ?? 'top'));
    expect(before.cells).toEqual(rows.flatMap((row) => row.cells.map((cell) => cell.id)));
    expect(before.cells.slice().sort()).toEqual(nav.order.slice().sort());

    // The outline is the outline order, and it is the order of the model.
    expect(before.outlines.map((row) => row.split('=')[1])).toEqual(nav.roots);
  });

  test('an overlay filters the outline and leaves the process alone', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const overlays = buildOverlays(model, nav, rulesByNode(source, model));
    const hardCoded = overlays[0];

    await expect(page.locator('[data-overlay-count="hard-coded"]')).toHaveText(String(hardCoded.ids.length));
    await expect(page.locator('[data-process-outline-count]'))
      .toHaveText(`${nav.order.length} elements on ${nav.planes.size} levels`);

    await page.locator('[data-overlay-toggle="hard-coded"]').click();
    await expect(page.locator('[data-process-outline-count]'))
      .toHaveText(`Showing ${hardCoded.ids.length} of ${nav.order.length} elements`);

    // Every marked element is reachable in the filtered tree, and every one of
    // them carries the text identifier rather than only a colour.
    for (const id of hardCoded.ids) {
      for (const ancestor of nav.entries.get(id)?.ancestors ?? []) {
        await page.locator(`[data-tree-node="${ancestor}"]`).click();
      }
      await expect(page.locator(`[data-tree-node="${id}"]`),
        `${id} is marked but not in the filtered outline`).toHaveCount(1);
      await expect(page.locator(`[data-tree-node="${id}"]`))
        .toContainText(hardCoded.marks.get(id) ?? '');
    }

    // The flow itself is untouched: the step list of the open level still holds
    // every element of that level (§5.9 item 8 — an overlay marks, it does not
    // change the process).
    await page.getByRole('radio', { name: 'Steps' }).click();
    const plane = await page.evaluate(() => new URLSearchParams(window.location.hash.slice(1)).get('map'));
    const expected = (nav.planes.get(plane) ?? nav.planes.get(null) ?? []).length;
    await expect(page.locator('[data-process-step-list] [data-step-node]')).toHaveCount(expected);
  });

  test('a path highlight lights the path and steps the rest back, without hiding it', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const model = exampleModel();
    const nav = buildNavigation(model);

    // A level whose main path is a *part* of it. On the top level of a report
    // every event block is on the main path, so the check there would pass
    // whatever the highlight did.
    const phase = nav.roots.find((id) => {
      const children = nav.entries.get(id)?.children ?? [];
      return children.length > 0 && mainPath(model, nav, id).length < children.length;
    });
    expect(phase, 'no level of the example has a main path shorter than itself').toBeTruthy();
    await page.locator(`[data-tree-node="${phase}"]`).click();

    const before = await page.locator('[data-tree-node]').count();
    await page.locator('[data-path-toggle="main"]').click();
    await expect(page.locator('[data-tree-node]'), 'the highlight hid rows instead of stepping them back')
      .toHaveCount(before);

    const onPath = new Set(mainPath(model, nav, phase as string));
    expect(onPath.size, 'the main path of the chosen level is empty').toBeGreaterThan(0);
    const lit = await page.locator('[data-tree-node]').evaluateAll((els) =>
      els.map((el) => `${el.getAttribute('data-tree-node')}:${el.getAttribute('data-lit')}`));
    const dimmed = lit.filter((row) => row.endsWith(':off'));
    expect(dimmed.length, 'nothing stepped back — the check would be vacuous').toBeGreaterThan(0);
    for (const row of lit) {
      const [id, state] = row.split(':');
      expect(state, `${id} is lit as ${state}`).toBe(onPath.has(id) ? 'on' : 'off');
    }

    await page.locator('[data-path-toggle="main"]').click();
    const cleared = await page.locator('[data-tree-node][data-lit="off"]').count();
    expect(cleared, 'one click did not clear the highlight').toBe(0);
  });

  test('a run variant dims what the switch closes and says so in a sentence', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await signIn(page);
    await openMap(page);

    const source = exampleSource();
    const model = exampleModel(source);
    const nav = buildNavigation(model);
    const switches = readRunSwitches(source, model);
    const declared = new Map(switches.map((entry) => [entry.name, entry.defaultOn ?? true]));

    // Off on first opening — a reader sees the process before a filter of it.
    await expect(page.locator('[data-process-variants]')).toHaveCount(0);
    await expect(page.locator('[data-tree-node][data-variant="out"]')).toHaveCount(0);

    await page.locator('[data-variants-toggle]').click();
    await expect(page.locator('[data-variant-sentence]'))
      .toHaveText(runVariant(model, nav, switches, declared).sentence);
    for (const entry of switches) {
      await expect(page.locator(`[data-run-switch="${entry.name}"]`))
        .toHaveAttribute('aria-pressed', String(entry.defaultOn ?? true));
    }

    await page.locator('[data-run-switch="p_rfc"]').click();
    const off = new Map(declared).set('p_rfc', false);
    const variant = runVariant(model, nav, switches, off);
    await expect(page.locator('[data-variant-sentence]')).toHaveText(variant.sentence);

    // The guarded step is out on the top level; the step after it is not.
    const guarded = nav.roots.find((id) => variant.excluded.has(id)) as string;
    await expect(page.locator(`[data-tree-node="${guarded}"]`)).toHaveAttribute('data-variant', 'out');
    await expect(page.locator(`[data-tree-node="${guarded}"] [data-variant-mark]`)).toHaveCount(1);
    const outOnTop = await page.locator('[data-tree-node][data-variant="out"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-tree-node') ?? ''));
    expect(outOnTop.every((id) => variant.excluded.has(id)),
      'a step is dimmed that the variant does not exclude').toBe(true);
  });
});
