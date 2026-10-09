import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readProcess, readRules } from '../lib/first-look';
import { businessNextStep } from '../lib/business-next-step';
import { rulesStatus, draftProblems, draftFrom, editorRules } from '../lib/rules-editor';
import { processStory, processChanges } from '../lib/process-story';
import { preAnsweredQuestion } from '../lib/ask-this-case';
import { summaryWithoutTables, programInputsOf, plainWordingFor } from '../lib/business-card';
import { BUSINESS_LAYERS, BUSINESS_LAYER_ELSEWHERE, BUSINESS_MAP_ID } from '../lib/business-layers';
import { walkOrder, walkProgress } from '../lib/process-walk';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf, NAMING_FORMAT_VERSION } from '../lib/process-naming';
import { nextOpenPoint } from '../lib/next-step';
import { COACH_MARK_IDS, COACH_MARK_STORAGE_KEY } from '../lib/coach-marks';
import type { ProcessStateView, StateEntry } from '../lib/process-states';
import type { Project } from '../lib/types';
import { adminSetDoc } from './helpers/admin-seed';
import { seedStageProject, signInThroughForm } from './helpers/seed-project';

/**
 * The Business view, reworked with the owner on 03.10.2026:
 *
 *   - **one next action, from the real state** — "Confirm the rule" stood as
 *     the page's green primary over a rule that was already confirmed, a
 *     second primary a screen lower; now the rules' answers and the phase
 *     contract decide one "Next step" at the top (`lib/business-next-step.ts`);
 *   - **a business-first opening** — the process as numbered plain steps, what
 *     it decides and changes, the figures and the code one fold down;
 *   - **deciding on the rules**, named as what it is, with four visible answers;
 *   - **a section bar that reads as navigation**, without the sections Business
 *     does not need;
 *   - **"Ask this case" in plain words**, the code one fold down;
 *   - **business names** offered only where a model can produce them, and the
 *     **steps answered from the Business view**, with a walk-through.
 */

const read = (file: string) =>
  fs.readFileSync(path.resolve('public/starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
const EXPENSE = read('Z_EMPLOYEE_EXPENSE_VAL.txt');
const PO = read('Z_MM_PO_APPROVAL.abap');
const ABAP_TOKENS = /sy-subrc|\bIF\b|<>|abap_true|abap_false/;

function view(ruleIds: string[], answered: Array<[string, StateEntry['state']]>): ProcessStateView {
  return {
    formatVersion: 1,
    revision: answered.length > 0 ? 2 : 0,
    baselineRevision: 1,
    subjects: ruleIds.map((id) => ({ subject: id, kind: 'rule' as const, label: id, detail: '', anchor: null })),
    entries: answered.map(([subject, state], i) => ({
      subject,
      kind: 'rule' as const,
      state,
      note: null,
      account: { uid: 'u1', name: 'Mara Weber' },
      confirmedAt: `2026-10-0${i + 1}T08:00:00.000Z`,
      revision: 2,
    })),
    links: [],
  };
}

/* ------------------------------------------------------------ pure parts */

test.describe('the next step of the Business view, as a pure function', () => {
  const analysed = { name: 'P', legacyCode: PO, activeRunId: 'r1', status: 'analyzed' } as unknown as Project;
  const point = nextOpenPoint(analysed);

  test('open rules come first, with their count, while the owner can answer them', () => {
    const status = rulesStatus({ ok: true, view: view(['BR-001', 'BR-002', 'BR-003'], [['BR-001', 'keep']]) }, null);
    const step = businessNextStep({ point, rules: status, owner: true });
    expect(step.kind).toBe('rules');
    if (step.kind === 'rules') {
      expect(step.open).toEqual(['BR-002', 'BR-003']);
      expect(step.then?.key).toBe(point?.key);
    }
  });

  test('with every rule answered there is no rule step — the phase step is the one action', () => {
    const status = rulesStatus({ ok: true, view: view(['BR-001'], [['BR-001', 'keep']]) }, null);
    expect(status).toMatchObject({ total: 1, confirmed: 1, open: [], lastAt: '2026-10-01T08:00:00.000Z' });
    expect(status?.by).toEqual([{ uid: 'u1', name: 'Mara Weber' }]);
    expect(businessNextStep({ point, rules: status, owner: true })).toEqual({ kind: 'phase', point });
  });

  test('a Clarify is an open question, not an answer', () => {
    const status = rulesStatus({ ok: true, view: view(['BR-001'], [['BR-001', 'clarify']]) }, null);
    expect(status?.open).toEqual(['BR-001']);
  });

  test('no rules, a reader, or Analyze still open: the phase step', () => {
    const none = rulesStatus({ ok: true, view: view([], []) }, null);
    expect(businessNextStep({ point, rules: none, owner: true }).kind).toBe('phase');
    const open = rulesStatus({ ok: false, code: 'no-baseline' }, ['BR-001']);
    expect(open?.open).toEqual(['BR-001']);
    expect(businessNextStep({ point, rules: open, owner: false }).kind).toBe('phase');
    const fresh = nextOpenPoint({ name: 'P', legacyCode: PO } as unknown as Project);
    expect(fresh?.key).toBe('analyze');
    expect(businessNextStep({ point: fresh, rules: open, owner: true }).kind).toBe('phase');
  });

  test('nothing is known while the answers are not read — no action is offered as if it were', () => {
    expect(rulesStatus(null, ['BR-001'])).toBeNull();
    expect(rulesStatus({ ok: false, code: 'unreachable' }, ['BR-001'])).toBeNull();
  });
});

test.describe('the business-first opening, as pure functions', () => {
  const reading = readProcess(PO);

  test('Z_MM_PO_APPROVAL reads as five to eight plain steps, each with its line', () => {
    const story = processStory(reading.skeleton, PO);
    expect(story.steps.length).toBeGreaterThanOrEqual(5);
    expect(story.steps.length).toBeLessThanOrEqual(8);
    for (const step of story.steps) {
      expect(step.anchor, `${step.text} has no line`).toMatch(/^L\d+(-\d+)?$/);
      expect(`${step.text} ${step.checks.join(' ')} ${step.stops.join(' ')}`).not.toMatch(ABAP_TOKENS);
    }
    expect(story.steps[0].text).toBe('Check authority');
    expect(story.proposedNames).toBe(false);
  });

  test('a stored business name is used, and the story says it is a model proposal', () => {
    const node = reading.skeleton.nodes.find((n) => n.label === 'CHECK_AUTHORITY' && n.kind === 'sub-process');
    const story = processStory(reading.skeleton, PO, new Map([[node!.id, 'Check the buyer may approve']]));
    expect(story.steps[0].text).toBe('Check the buyer may approve');
    expect(story.proposedNames).toBe(true);
  });

  test('what it changes is named in the map’s words, creating first', () => {
    const { changes } = processChanges(reading.skeleton, PO);
    expect(changes.map((c) => c.text)).toContain('Create purchase order');
    for (const change of changes) expect(change.anchor).toMatch(/^L\d+/);
  });

  test('a program without tables says what it works on, not what the page cannot say', () => {
    const facts = readProcess(EXPENSE).facts;
    const summary = summaryWithoutTables(programInputsOf(facts));
    expect(summary.kind).toBe('none');
    expect(summary.sentence).not.toMatch(/cannot say/);
    expect(summary.sentence).toContain('P_PERNR');
    expect(summary.sentence).toContain('prints a list');
  });
});

test.describe('"Ask this case" for a business reader, as a pure function', () => {
  test('Z_MM_PO_APPROVAL: a plain question and plain branches; the code keeps its own words', () => {
    const reading = readProcess(PO);
    const answer = preAnsweredQuestion(reading.skeleton, readRules(PO, reading), PO);
    expect(answer.kind).toBe('answered');
    if (answer.kind !== 'answered') return;
    expect(answer.plainQuestion).toBeTruthy();
    expect(answer.plainQuestion).not.toMatch(ABAP_TOKENS);
    const plain = answer.branches.map((b) => b.plain).filter(Boolean) as string[];
    expect(plain.length).toBeGreaterThan(0);
    for (const sentence of plain) expect(sentence).not.toMatch(ABAP_TOKENS);
    expect(answer.question).toMatch(/^What happens when IF /);
    expect(answer.anchor).toMatch(/^L\d+/);
    // A rule with a plain name stands on it — the business choice, not a sy-subrc check.
    expect(answer.rules.length).toBeGreaterThan(0);
  });
});

test.describe('deciding on the rules, as pure functions', () => {
  test('Clarify needs its question, like Change and Drop need their reason', () => {
    const reading = readProcess(PO);
    const rules = editorRules(readRules(PO, reading), plainWordingFor(PO, reading.skeleton));
    const [a] = rules.map((r) => r.id);
    expect(draftProblems({ ...draftFrom(rules, {}), [a]: { state: 'clarify', note: '' } })).toEqual([{ ruleId: a, kind: 'missing' }]);
    expect(draftProblems({ ...draftFrom(rules, {}), [a]: { state: 'clarify', note: 'Ask purchasing who owns plant 1000' } })).toEqual([]);
  });
});

test.describe('the sections Business shows, and the walk-through order', () => {
  test('Business keeps Standard fit and Evidence & controls; Need & process leads to its map (ADR-080)', () => {
    expect([...BUSINESS_LAYERS]).toEqual(['standard', 'evidence']);
    expect(BUSINESS_LAYER_ELSEWHERE.need).toBe('map');
    expect(BUSINESS_MAP_ID).toBe('process-map');
  });

  test('the walk follows the main path depth first and resumes at the first unanswered step', () => {
    const { bpmn, technical } = buildReadingExports(PO, { processName: 'PO', sourceFileName: 'Z_MM_PO_APPROVAL.abap' });
    const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(PO), null), fileName: 'Z_MM_PO_APPROVAL.abap' });
    const order = walkOrder(model, null);
    expect(order.length).toBeGreaterThan(5);
    const byId = new Map(model.elements.map((e) => [e.id, e]));
    expect(order.every((id) => !byId.get(id)?.event)).toBe(true);
    // The first top-level step comes first; its own level follows it.
    const first = byId.get(order[0]);
    expect(first?.plane).toBeNull();
    if (first?.opensPlane) expect(byId.get(order[1])?.plane).toBe(first.opensPlane);
    const answered: Record<string, StateEntry> = {
      [order[0]]: { subject: order[0], kind: 'element', state: 'keep', note: null, account: { uid: 'u', name: 'U' }, confirmedAt: '2026-10-03T00:00:00.000Z', revision: 2 },
    };
    expect(walkProgress(order, answered)).toEqual({ answered: 1, total: order.length, resumeAt: 1 });
  });
});

/* -------------------------------------------------------------- rendered */

async function idToken(email: string, password: string): Promise<string> {
  const res = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  return ((await res.json()) as { idToken: string }).idToken;
}

test.describe('the Business view on screen', () => {
  test.describe.configure({ mode: 'serial' });
  const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
  let account: Awaited<ReturnType<typeof seedStageProject>>;
  let token = '';
  const ids = { confirmed: '', open: '', po: '' };

  async function project(id: string, file: string, source: string) {
    await adminSetDoc('projects', id, { name: file.replace(/\..*$/, ''), userId: account.uid, createdAt: new Date(), status: 'created', legacyCode: source });
    const res = await fetch(`${BASE}/api/runs/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, s4Deployment: 'private', analysis: '', uploadedFileName: file }),
    });
    expect(res.ok, `the run of ${id} was not signed: ${res.status}`).toBe(true);
  }

  async function confirmAllRules(id: string) {
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    expect((await fetch(`${BASE}/api/projects/${id}/process-revisions`, { method: 'POST', headers: h, body: '{}' })).ok).toBe(true);
    const { view: v } = (await (await fetch(`${BASE}/api/projects/${id}/process-states`, { headers: h })).json()) as { view: ProcessStateView };
    const rules = v.subjects.filter((s) => s.kind === 'rule');
    const res = await fetch(`${BASE}/api/projects/${id}/process-states`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        baseRevision: v.revision,
        choices: rules.map((r) => ({ subject: r.subject, kind: 'rule', state: 'keep', valueSource: { kind: 'business-requirement', note: null } })),
      }),
    });
    expect(res.ok).toBe(true);
  }

  /**
   * The tips dismissed, for the two tests that measure where things stand on
   * the screen. A first visit shows the tour, whose first tip stands in the
   * flow above "Next step" and moves what follows down by its height. (It
   * used to scroll the page to the map 0.8 s and 1.5 s after it appeared; on
   * CI that landed between the scroll and the measurement, so the bar
   * measured 240 px and the next step -1888 px. Since 04.10.2026 a tip moves
   * the page only after "Next".) The tour has its own spec
   * (`coach-mark-placement.spec.ts`); here the layout is measured without it.
   */
  async function withoutTips(page: Page) {
    await page.addInitScript(
      ([key, ids]) => window.localStorage.setItem(key as string, JSON.stringify(ids)),
      [COACH_MARK_STORAGE_KEY, [...COACH_MARK_IDS]] as const,
    );
  }

  async function open(page: Page, id: string) {
    await page.goto(`/project/${id}?view=business`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-first-look-business]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-next-step]')).toBeVisible({ timeout: 60_000 });
  }

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    account = await seedStageProject({ prefix: 'bizclear', acceptTerms: true });
    token = await idToken(account.email, account.password);
    ids.confirmed = `${account.projectId}-done`;
    ids.open = `${account.projectId}-open`;
    ids.po = `${account.projectId}-po`;
    await project(ids.confirmed, 'Z_EMPLOYEE_EXPENSE_VAL.txt', EXPENSE);
    await project(ids.open, 'Z_EMPLOYEE_EXPENSE_VAL.txt', EXPENSE);
    await project(ids.po, 'Z_MM_PO_APPROVAL.abap', PO);
    await confirmAllRules(ids.confirmed);
  });

  test('every rule confirmed: no confirm action anywhere, the done state says who and when, one primary', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, ids.confirmed);

    await expect(page.locator('[data-workspace-rules-block] [data-rules-done]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-workspace-rules-block] [data-rules-done-by]')).toContainText('by you');
    await expect(page.locator('[data-workspace-rules-block] [data-rules-done-by] [data-cc-date]')).toBeVisible();
    await expect(page.getByRole('button', { name: /Confirm the rule/ })).toHaveCount(0);
    await expect(page.locator('[data-first-look-confirm-rules]')).toHaveCount(0);
    await expect(page.locator('[data-next-step-key="rules"]')).toHaveCount(0);
    await expect(page.locator('[data-rules-edit]')).toHaveText(/Review rules/);
    await expect(page.locator('[data-workspace-shell] [data-cc-button="primary"]:visible')).toHaveCount(1);
  });

  test('a rule without an answer: the one primary is to decide on it, with the count', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, ids.open);

    const step = page.locator('[data-next-step-key="rules"]');
    await expect(step).toHaveAttribute('data-open', '1', { timeout: 60_000 });
    const action = page.locator('[data-next-step-rules]');
    await expect(action).toHaveText(/Decide on 1 rule/);
    await expect(page.locator('[data-workspace-shell] [data-cc-button="primary"]:visible')).toHaveCount(1);

    // The figures are one fold down, and agree with the rules card and the section bar.
    const fact = page.locator('[data-first-look-fact="rules-confirmed"]');
    await expect(fact).toBeHidden();
    await expect(fact).toHaveAttribute('data-total', '1');
    await expect(page.locator('[data-workspace-rules-block] [data-rule]')).toHaveCount(1);
    // Need & process is not a section of Business (ADR-080): the map and the
    // rules card above are the process, and nothing summarises it a second time.
    await expect(page.locator('[data-workspace-layer="need"]')).toHaveCount(0);
    await expect(page.locator('[data-workspace-layer-process]')).toHaveCount(0);

    // The action opens the rules in their answering mode.
    await action.click();
    await expect(page.locator('[data-rules-editor="edit"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Decide on the business rules' })).toBeVisible();
  });

  test('deciding on the rules: four named answers, the count moves, Change needs its text', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInThroughForm(page, account);
    await open(page, ids.po);
    const entry = page.locator('[data-rules-edit]');
    await expect(entry).toHaveText(/Decide on rules/, { timeout: 60_000 });
    await entry.click();
    const editor = page.locator('[data-rules-editor="edit"]');
    await expect(editor).toBeVisible({ timeout: 30_000 });

    const first = editor.locator('[data-rule-edit]').first();
    const group = first.getByRole('radiogroup');
    for (const name of ['Keep', 'Change deliberately', 'Drop', 'Clarify']) {
      const radio = group.getByRole('radio', { name: new RegExp(`^${name}`) });
      await expect(radio).toBeVisible();
      await expect(radio).toHaveAttribute('aria-describedby', /.+/);
    }
    const progress = editor.locator('[data-rules-progress]');
    await expect(progress).toHaveAttribute('data-answered', '0');
    await group.getByRole('radio', { name: /^Change deliberately/ }).click();
    await expect(progress).toHaveAttribute('data-answered', '1');
    await page.locator('[data-rules-save]').click();
    await expect(first.getByRole('textbox').first()).toHaveAttribute('aria-invalid', 'true');

    // Nothing is cut off at 1280: the answering screen stays inside the page.
    const right = await editor.evaluate((el) => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(1280);
    await page.locator('[data-rules-discard]').click();
  });

  test('the opening is the process in plain steps; the figures and the code are one fold down', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, ids.po);
    const opening = page.locator('[data-first-look-business]');
    const steps = opening.locator('[data-process-story-step]');
    expect(await steps.count()).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < (await steps.count()); i++) await expect(steps.nth(i).locator('[data-cc-anchor]').first()).toBeVisible();
    const visible = await opening.evaluate((el) => (el as HTMLElement).innerText);
    expect(visible).not.toMatch(ABAP_TOKENS);
    expect(visible).not.toContain('Linked to the code');
    await expect(page.locator('[data-first-look-details] [data-first-look-traceability]')).toBeHidden();
    await opening.getByRole('button', { name: /How this was read/ }).click();
    await expect(page.locator('[data-first-look-details] [data-first-look-traceability]')).toBeVisible();

    // "Ask this case": plain on top, the code under "Show the code".
    const ask = page.locator('[data-ask-this-case="answered"]');
    await expect(ask).toHaveAttribute('data-ask-wording', 'plain');
    const question = (await ask.locator('[data-ask-question]').innerText()).trim();
    expect(question).not.toMatch(ABAP_TOKENS);
    await expect(ask.locator('[data-ask-plain] [data-cc-anchor]').first()).toBeVisible();
    await expect(ask.locator('[data-ask-code-question]')).toBeHidden();
    await ask.getByRole('button', { name: /Show the code/ }).click();
    await expect(ask.locator('[data-ask-code-question]')).toHaveText(ABAP_TOKENS);
  });

  test('the section bar is a named tab list without Costs and Architecture, sticky, moved by arrow keys', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await withoutTips(page);
    await signInThroughForm(page, account);
    await open(page, ids.po);
    await expect(page.locator('[data-coach-mark]')).toHaveCount(0);
    const tabs = page.getByRole('tablist', { name: 'Sections of this process' });
    await expect(tabs).toBeVisible();
    await expect(tabs.locator('[data-workspace-layer="costs"]')).toHaveCount(0);
    await expect(tabs.locator('[data-workspace-layer="architecture"]')).toHaveCount(0);
    await expect(tabs.locator('[data-workspace-layer="need"]')).toHaveCount(0);
    // It opens on Standard fit, the first of its sections with content (ADR-080).
    const standard = tabs.getByRole('tab', { name: /Standard fit/ });
    await expect(standard).toHaveAttribute('aria-selected', 'true');
    await standard.focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('tab', { name: /Evidence & controls/ })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.getByRole('tab', { name: /Evidence & controls/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(standard).toHaveAttribute('aria-selected', 'true');

    // Sticky: scrolled into the section, the bar stays under the shell bar.
    // Only once the section is taller than the screen: Standard fit reads its table
    // after the tab is chosen, and scrolled while it is still 85 px tall the
    // page sits at its own end, the wheel moves nothing, and the bar is measured
    // in the flow (240 px on CI) instead of stuck.
    await expect
      .poll(() => page.locator('[data-workspace-layer-section]').evaluate((el) => el.getBoundingClientRect().height - window.innerHeight), {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    await page.locator('[data-workspace-layer-section]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.mouse.wheel(0, 300);
    const top = await page.locator('nav[data-workspace-layers]').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(40);
    expect(top).toBeLessThanOrEqual(80);

    // A link into a section Business no longer shows lands where it lives now.
    await page.goto(`/project/${ids.po}?view=business#costs`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/project/${ids.po}/tco`), { timeout: 60_000 });
    // An old back link into Need & process stays in Business and lands on the
    // map (ADR-080): the address becomes the map's, and no section is chosen.
    await page.goto(`/project/${ids.po}?view=business#need`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL((url) => url.pathname === `/project/${ids.po}` && url.search === '?view=business' && url.hash === '#process-map', { timeout: 60_000 });
    await expect(page.locator('[data-workspace-shell="business"]')).toBeVisible();
    await expect(page.locator('#process-map[data-workspace-process-block]')).toBeInViewport({ timeout: 30_000 });
    await expect(page.locator('[data-workspace-layer="need"]')).toHaveCount(0);
  });

  test('business names: no "Not generated" notice, the action only with a model, a stored name is a model proposal', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    // No model: no action, and no apology for it.
    await page.route('**/api/model-stages', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stages: { naming: true }, keyAvailable: false, keySource: null }) }),
    );
    await open(page, ids.po);
    await expect(page.locator('[data-workspace-process="ready"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-process-map]')).not.toContainText('Not generated');
    await expect(page.locator('[data-workspace-suggest-names]')).toHaveCount(0);
    await page.unroute('**/api/model-stages');

    // A model is available: the one optional action, with its cost said.
    await page.route('**/api/model-stages', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stages: { naming: true }, keyAvailable: true, keySource: 'community' }) }),
    );
    await open(page, ids.po);
    await expect(page.locator('[data-workspace-suggest-names]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-workspace-suggest-names] [data-cc-run-cost-model]')).toHaveText('Calls the model');

    // A stored naming (the fixture of a model answer, as the route stores it):
    // the opening names the step by it and marks it as a model proposal.
    const context = namingContextOf(PO);
    const node = context.skeleton.nodes.find((n) => n.label === 'CHECK_AUTHORITY' && n.kind === 'sub-process')!;
    await adminSetDoc(`projects/${ids.po}/process_naming`, 'current', {
      formatVersion: NAMING_FORMAT_VERSION,
      digest: context.digest,
      names: [{ id: node.id, technicalName: node.label, name: 'Check the buyer may approve' }],
      lanes: [],
      discarded: { total: 0, byRule: {} },
      origin: { source: 'model', receipt: 'verified', provider: 'fixture', modelId: 'fixture', byok: false, issuedAt: Date.now(), textSha256: '0'.repeat(64) },
      namedAt: new Date(),
    });
    await open(page, ids.po);
    const step = page.locator('[data-process-story-step="1"]');
    await expect(step).toContainText('Check the buyer may approve', { timeout: 60_000 });
    await expect(page.locator('[data-first-look-business] [data-provenance="proposed"]').first()).toBeVisible();
    await expect(page.locator('[data-workspace-suggest-names]')).toHaveCount(0);
  });

  test('a step answered from the Business view raises Confirmed; the walk resumes at the first open step; no Proven', async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInThroughForm(page, account);
    await open(page, ids.open);
    await expect(page.locator('[data-workspace-process="ready"]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-legend-entry="proven"]')).toHaveCount(0);
    const confirmed = page.locator('[data-legend-count="confirmed"]');
    await expect(confirmed).toHaveText('0');

    await page.locator('[data-workspace-walk-start]').click();
    const walk = page.locator('[data-workspace-walk]');
    await expect(walk).toHaveAttribute('data-walk-step', '1');
    await walk.getByRole('radio', { name: /^Keep/ }).first().click();
    await walk.locator('[data-state-confirm]').click();
    await expect(confirmed).toHaveText('1', { timeout: 30_000 });
    // The answer carries the account and the server's time.
    await expect(walk.locator('[data-state-account]')).toBeVisible();
    await expect(walk.locator('[data-state-time]')).not.toBeEmpty();
    await walk.locator('[data-workspace-walk-close]').click();
    await expect(page.locator('[data-workspace-walk-start]')).toHaveText(/Continue/);
    await page.locator('[data-workspace-walk-start]').click();
    await expect(walk).toHaveAttribute('data-walk-step', '2');
  });

  test('on a phone: the next step comes first, and nothing scrolls sideways', async ({ browser }) => {
    test.setTimeout(300_000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await withoutTips(page);
    await signInThroughForm(page, account);
    await open(page, ids.po);
    await expect(page.locator('[data-coach-mark]')).toHaveCount(0);
    const tops = await page.evaluate(() =>
      ['[data-next-step]', '[data-first-look]'].map((sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1),
    );
    expect(tops[0]).toBeGreaterThanOrEqual(0);
    expect(tops[0]).toBeLessThan(tops[1]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the Business view scrolls sideways on a phone').toBeLessThanOrEqual(1);
    // The map's canvas stands inside its card: its right edge (border included)
    // is not cut off by the card. What the canvas draws inside it is a matter
    // of zoom (ADR-072: never below 40 % on a phone), panned by touch.
    const canvas = page.locator('[data-workspace-process="ready"] [data-process-map-canvas]').first();
    await expect(canvas).toBeVisible({ timeout: 90_000 });
    const edges = await canvas.evaluate((el) => {
      const card = el.closest('.cc-card') ?? el.parentElement!;
      return { canvas: el.getBoundingClientRect().right, card: card.getBoundingClientRect().right, screen: document.documentElement.clientWidth };
    });
    expect(edges.canvas, 'the map canvas runs past the right edge of its card').toBeLessThanOrEqual(edges.card + 0.5);
    expect(edges.card, 'the map card runs past the screen').toBeLessThanOrEqual(edges.screen + 0.5);
    await page.locator('[data-rules-edit]').click();
    await expect(page.locator('[data-rules-editor="edit"]')).toBeVisible({ timeout: 30_000 });
    const overflowEditing = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflowEditing, 'the answering screen scrolls sideways on a phone').toBeLessThanOrEqual(1);
    await context.close();
  });
});
