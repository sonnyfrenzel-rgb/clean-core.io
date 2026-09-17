import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { getLevelRuleVersion } from '../lib/abap/catalog-service';
import {
  buildFirstLook,
  codeReadStage,
  businessLanguageStage,
  processStage,
  readSource,
  readTables,
  STAGE_LABELS,
  type FirstLookFigure,
} from '../lib/first-look';
import { preAnsweredQuestion } from '../lib/ask-this-case';
import { availableCoachMarks, COACH_MARKS, nextCoachMark } from '../lib/coach-marks';
import { applyNaming } from '../lib/process-naming';
import {
  describeStarterExampleCost,
  STARTER_BADGE_FREE,
  STARTER_BADGE_RAN_BEFORE,
} from '../lib/run-cost';
import type { Project } from '../lib/types';

/**
 * Roadmap 2.7 — the first look, and the one rule the row states twice:
 *
 *   > **Jede Zahl aus dem Run.** Keine Animation, die eine Zahl zeigt, die nicht
 *   > aus der Analyse stammt … Wenn eine Etappe nichts zu zeigen hat, sagt sie das.
 *
 * Everything below is measured against that. The figures are not pinned to
 * engine output — `tests/korpus-engine.spec.ts` is the ratchet for what the
 * engine says, and a second copy of its numbers here would fail twice for one
 * change. What is pinned is where each figure comes from, what a missing one
 * reads as, and that nothing on this screen is invented: a count with no run
 * behind it must be a word, the condition in the pre-answered question must be
 * the source's own text, and a stage with no work behind it must say so.
 */

const ROOT = path.resolve(__dirname, '..');

/**
 * Source with its comments taken out — a comment calls nothing.
 *
 * The same helper `tests/claims-honesty-guard.spec.ts` uses, and for the same
 * reason one layer down: the files below explain in prose *why* they never touch
 * Firestore, and a scan that cannot tell an explanation from a call would forbid
 * the explanation.
 */
const withoutComments = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** A source with a decision whose first branch ends the flow, and a rule on it. */
const BRANCHING = [
  'REPORT z_first_look_demo.',
  '',
  'DATA lv_amount TYPE p DECIMALS 2.',
  '',
  'START-OF-SELECTION.',
  "  SELECT SINGLE * FROM kna1 INTO @DATA(ls_kna1) WHERE kunnr = '0000001000'.",
  '  IF lv_amount > 5000.',
  "    MESSAGE 'Above the limit' TYPE 'E'.",
  '  ELSE.',
  '    PERFORM book_order.',
  '  ENDIF.',
  '',
  'FORM book_order.',
  "  UPDATE zorders SET status = 'B'.",
  'ENDFORM.',
  '',
].join('\n');

/** A source with no branch at all — the case that has no question to answer. */
const STRAIGHT = ['REPORT z_no_branch.', '', 'START-OF-SELECTION.', "  WRITE 'done'.", ''].join('\n');

function projectWith(overrides: Partial<Project>): Project {
  return { name: 'Case', ...overrides } as Project;
}

function figure(figures: FirstLookFigure[], key: string): FirstLookFigure {
  const found = figures.find((f) => f.key === key);
  if (!found) throw new Error(`no figure "${key}" — the assertion would be vacuous`);
  return found;
}

test.describe('every number comes from the run, or is a word', () => {
  test('a project nobody has analysed has no finding count — not a zero', () => {
    const stage = codeReadStage(projectWith({ legacyCode: BRANCHING }), readTables(BRANCHING));

    const findings = figure(stage.figures, 'findings');
    expect(findings.value, 'a finding count appeared without a run').toBeNull();
    expect(findings.origin).toBe('absent');
    expect(findings.absentReason).toBe('not analysed');
    expect(stage.result).toContain('no finding count');
    expect(stage.result, 'the stage reported a measurement it does not have').not.toMatch(/\b0 findings\b/);
  });

  test('and one with a run reads its worklist, marked as coming from the run', () => {
    const stage = codeReadStage(
      projectWith({
        legacyCode: BRANCHING,
        activeRunId: 'run-1',
        worklist: [{ id: 'CC-001' }, { id: 'CC-002' }] as unknown as Project['worklist'],
      }),
      readTables(BRANCHING),
    );

    const findings = figure(stage.figures, 'findings');
    expect(findings.value).toBe('2');
    expect(findings.origin).toBe('run');
  });

  test('a worklist without a run is not a finding count either', () => {
    // `activeRunId` is written only by /api/runs/create. A worklist left behind
    // on a project document is not the result of a run that exists.
    const stage = codeReadStage(
      projectWith({ legacyCode: BRANCHING, worklist: [{ id: 'CC-001' }] as unknown as Project['worklist'] }),
      readTables(BRANCHING),
    );
    expect(figure(stage.figures, 'findings').value).toBeNull();
  });

  test('the line count prefers the one the run signed, and says which it is', () => {
    const counted = codeReadStage(projectWith({ legacyCode: BRANCHING }), readTables(BRANCHING));
    expect(figure(counted.figures, 'lines').origin).toBe('engine');
    expect(figure(counted.figures, 'lines').value).toBe(String(BRANCHING.split('\n').length));

    const signed = codeReadStage(
      projectWith({
        legacyCode: BRANCHING,
        auditMetadata: { inputFingerprint: { lineCount: 907 } } as Project['auditMetadata'],
      }),
      readTables(BRANCHING),
    );
    expect(figure(signed.figures, 'lines').origin).toBe('run');
    expect(figure(signed.figures, 'lines').value).toBe('907');
  });

  test('a project with no source says every stage did not run, and shows no zero', () => {
    const look = buildFirstLook(projectWith({}));
    expect(look.noSource).toBe(true);
    expect(look.stages.map((s) => s.id)).toEqual([
      'code-read',
      'process-recognised',
      'business-language',
      'your-process',
    ]);
    for (const stage of look.stages) {
      expect(stage.state, `${stage.id} claimed to have run`).toBe('did-not-run');
      expect(stage.figures, `${stage.id} printed a figure for work that never happened`).toEqual([]);
    }
    expect(look.processName.name).toBeNull();
    expect(look.traceability.nodes).toBe(0);
  });
});

test.describe('the four stages of DESIGN.md §5.2', () => {
  test('carry the four labels, in order', () => {
    const look = buildFirstLook(projectWith({ legacyCode: BRANCHING }), readSource(BRANCHING));
    expect(look.stages.map((s) => s.label)).toEqual([
      STAGE_LABELS['code-read'],
      STAGE_LABELS['process-recognised'],
      STAGE_LABELS['business-language'],
      STAGE_LABELS['your-process'],
    ]);
  });

  test('"In business language" says it did not run, with the reason, when nothing named anything', () => {
    const reading = readSource(BRANCHING);
    const named = applyNaming(reading.context, null);
    const stage = businessLanguageStage(named);

    expect(stage.state).toBe('did-not-run');
    expect(stage.figures).toEqual([]);
    // The one sentence, from `applyNaming` — not a second one written here.
    expect(stage.result).toBe(named.notice);
    expect(stage.result).toContain('Not generated');
  });

  test('a process the engine drew reports steps and decisions it actually has', () => {
    const reading = readSource(BRANCHING);
    const stage = processStage(reading.skeleton);
    expect(stage.state).toBe('measured');

    const decisions = figure(stage.figures, 'decisions');
    expect(Number(decisions.value)).toBe(
      reading.skeleton.nodes.filter((n) => n.kind === 'gateway').length,
    );
    expect(Number(decisions.value)).toBeGreaterThan(0);
    for (const f of stage.figures) expect(f.origin, `${f.key} claimed to come from a run`).toBe('engine');
  });

  test('traceability is anchored-of-total and comes from the naming context', () => {
    const reading = readSource(BRANCHING);
    const look = buildFirstLook(projectWith({ legacyCode: BRANCHING }), reading);
    const named = applyNaming(reading.context, null);

    expect(look.traceability.anchored).toBe(named.counts.anchored);
    expect(look.traceability.nodes).toBe(named.counts.nodes);
    expect(look.traceability.sentence).toContain(
      `${named.counts.anchored} of ${named.counts.nodes}`,
    );
  });

  test('the reveal line says the rule stands in the program and nothing more', () => {
    const look = buildFirstLook(projectWith({ legacyCode: BRANCHING }), readSource(BRANCHING));
    const stage = look.stages[3];

    if (look.reveal.count > 0) {
      expect(stage.result).toContain('hard-coded in the program');
      // The claim §5.1 forbids: that nobody ever wrote the rule down.
      expect(stage.result).not.toMatch(/undocumented|nowhere|not documented/i);
      for (const rule of look.reveal.rules) {
        expect(rule.property).toBe('hard-coded');
        expect(rule.anchors.length, `${rule.id} has no line`).toBeGreaterThan(0);
        for (const anchor of rule.anchors) expect(anchor).toMatch(/^L\d+(-\d+)?$/);
      }
    } else {
      expect(stage.result).toContain('No hard-coded business rule');
    }
  });
});

test.describe('the question that is already answered', () => {
  test('is built from a branch of the code, with the condition as written', () => {
    const reading = readSource(BRANCHING);
    const answer = preAnsweredQuestion(reading.skeleton, reading.ruleSet);

    expect(answer.kind).toBe('answered');
    if (answer.kind !== 'answered') return;

    // The question repeats a token of the source. Not a paraphrase: paraphrasing
    // is roadmap 2.4's job and needs a model behind it.
    const gateway = reading.skeleton.nodes.find((n) => n.id === answer.nodeId);
    expect(gateway, 'the question names a node the skeleton does not have').toBeTruthy();
    expect(answer.question).toBe(`What happens when ${gateway?.label}?`);
    expect(BRANCHING.toUpperCase()).toContain(String(gateway?.label).split(' ')[0].toUpperCase());
    expect(answer.anchor).toMatch(/^L\d+(-\d+)?$/);
    expect(answer.branches.length).toBeGreaterThan(1);
  });

  test('prefers a decision one of whose branches ends the flow', () => {
    const reading = readSource(BRANCHING);
    const answer = preAnsweredQuestion(reading.skeleton, reading.ruleSet);
    expect(answer.kind).toBe('answered');
    if (answer.kind !== 'answered') return;
    expect(
      answer.branches.some((b) => b.endsFlow),
      'the chosen decision has no branch that ends the flow, and one exists',
    ).toBe(true);
  });

  test('is deterministic — the same source gives the same question', () => {
    const a = readSource(BRANCHING);
    const b = readSource(BRANCHING);
    expect(JSON.stringify(preAnsweredQuestion(a.skeleton, a.ruleSet))).toBe(
      JSON.stringify(preAnsweredQuestion(b.skeleton, b.ruleSet)),
    );
  });

  test('does not exist at all when the source has no branch, and says why', () => {
    const reading = readSource(STRAIGHT);
    expect(reading.skeleton.nodes.filter((n) => n.kind === 'gateway')).toEqual([]);

    const answer = preAnsweredQuestion(reading.skeleton, reading.ruleSet);
    expect(answer.kind).toBe('none');
    if (answer.kind !== 'none') return;
    expect(answer.reason).toContain('no branch');
  });

  test('never reaches a model: the module imports no client, prompt or stage', () => {
    const src = withoutComments(fs.readFileSync(path.join(ROOT, 'lib/ask-this-case.ts'), 'utf8'));
    for (const forbidden of ['gemini', 'callModel', 'buildNamingPrompt', 'fetch(', 'ModelStage']) {
      expect(src, `"${forbidden}" reached the pre-answered question`).not.toContain(forbidden);
    }
  });
});

test.describe('the three coach marks', () => {
  test('are the three of DESIGN.md §6.2, in its order', () => {
    expect(COACH_MARKS.map((m) => m.title)).toEqual([
      'Select the decision',
      'This is what we could not determine',
      'Your next step',
    ]);
  });

  test('a mark with nothing to point at is not offered', () => {
    const withDecision = availableCoachMarks({ hasDecision: true, hasNextStep: true });
    expect(withDecision.map((m) => m.id)).toEqual(['decision', 'not-determined', 'next-step']);

    const without = availableCoachMarks({ hasDecision: false, hasNextStep: false });
    expect(without.map((m) => m.id)).toEqual(['not-determined']);
  });

  test('one at a time, and gone once dismissed', () => {
    const available = availableCoachMarks({ hasDecision: true, hasNextStep: true });
    expect(nextCoachMark(available, [])?.id).toBe('decision');
    expect(nextCoachMark(available, ['decision'])?.id).toBe('not-determined');
    expect(nextCoachMark(available, ['decision', 'not-determined', 'next-step'])).toBeNull();
  });

  test('nothing about them touches the account (ADR-036)', () => {
    for (const rel of [
      'lib/coach-marks.ts',
      'hooks/useCoachMarks.ts',
      'components/workspace/CoachMarks.tsx',
    ]) {
      // Comments out: these three files explain *why* the account is not
      // involved, and naming `firestore.rules` in that explanation is the point.
      const src = withoutComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      for (const forbidden of ['firestore', 'getDb(', 'setDoc', 'updateDoc', '/api/']) {
        expect(src, `${rel} writes coach-mark state somewhere other than the browser`).not.toContain(
          forbidden,
        );
      }
    }
    // And the one place the state does live is still the browser's.
    expect(withoutComments(fs.readFileSync(path.join(ROOT, 'lib/coach-marks.ts'), 'utf8'))).toContain(
      'localStorage',
    );
  });
});

test.describe('the quota line is the one the product already has', () => {
  test('both wordings come from lib/run-cost.ts and are not written twice', () => {
    const free = describeStarterExampleCost(
      { transformationsLimit: 5, starterExamplesUsed: {} },
      'Z_MM_PO_APPROVAL',
    );
    expect(free.badge).toBe(STARTER_BADGE_FREE);
    expect(free.rerunWarning).toBeNull();

    const again = describeStarterExampleCost(
      { transformationsLimit: 5, starterExamplesUsed: { Z_MM_PO_APPROVAL: true } },
      'Z_MM_PO_APPROVAL',
    );
    expect(again.badge).toBe(STARTER_BADGE_RAN_BEFORE);
    expect(again.rerunWarning).toContain('uses 1 of your 5 free analysis runs');
  });

  test('and neither screen carries a literal copy of them', () => {
    for (const rel of ['components/StarterExamples.tsx', 'components/workspace/NewProject.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} writes the badge itself instead of reading the rule`).not.toContain(
        STARTER_BADGE_FREE,
      );
      expect(src, `${rel} writes the badge itself instead of reading the rule`).not.toContain(
        STARTER_BADGE_RAN_BEFORE,
      );
    }
  });
});

/* ======================================================================== *
 * And what the browser paints.
 *
 * The half above is arithmetic; this half is the half that matters, for the
 * reason `tests/landing-style-guard.spec.ts` gives: a source check is satisfied
 * by a component that quietly fetches the same sentence from somewhere else.
 * ======================================================================== */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'FirstLook123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the first look on screen', () => {
  const ADMIN = `${unique('firstlook-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('firstlook-project');
  const EMPTY_ID = unique('firstlook-empty');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'First', lastName: 'Look', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });

    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'uploaded',
      legacyCode: BRANCHING,
    });

    // A project with nothing on it: the case where every stage has to say so.
    await adminSetDoc('projects', EMPTY_ID, {
      name: 'Nothing staged', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
    });
  });

  test('builds up in the four stages of §5.2, is skippable, and every figure says where it is from', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1400 });
    await signIn(page, ADMIN);

    await page.goto(`/project/${PROJECT_ID}?first=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    // The engine is fast on this source, so the build-up may already be over.
    // What must hold either way: the four stages, in order, each with its own
    // sentence, and a Skip that is a real, reachable control while it runs.
    const first = page.locator('[data-first-look]');
    await expect(first).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look-stage]')).toHaveCount(4, { timeout: 60000 });
    expect(
      await page.locator('[data-first-look-stage]').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-first-look-stage')),
      ),
    ).toEqual(['code-read', 'process-recognised', 'business-language', 'your-process']);

    // Not one figure without an origin, and not one absent figure printed as 0.
    const figures = await page.locator('[data-first-look-figure]').evaluateAll((els) =>
      els.map((el) => ({
        key: el.getAttribute('data-first-look-figure') || '',
        origin: el.getAttribute('data-origin') || '',
        text: (el.textContent || '').trim(),
      })),
    );
    expect(figures.length, 'no figures rendered — the check would be vacuous').toBeGreaterThan(3);
    for (const f of figures) {
      expect(['run', 'engine', 'absent'], `${f.key} has no origin`).toContain(f.origin);
    }
    const findings = figures.find((f) => f.key === 'findings');
    expect(findings?.origin, 'a project with no run reported a finding count').toBe('absent');
    expect(findings?.text).toContain('not analysed');

    // Traceability, the reveal line and the decisions are all on the screen.
    await expect(page.locator('[data-first-look-traceability]')).toBeVisible();
    await expect(page.locator('[data-first-look-reveal]')).toBeVisible();
    await expect(page.locator('[data-first-look-decisions]')).toHaveAttribute('data-count', /[1-9]/);
  });

  test('a second visit has no build-up — it opens in the end state', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);

    // No `?first=1`: this is what every ordinary visit to a workspace looks like.
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-first-look]')).toHaveAttribute('data-first-look', 'end-state', {
      timeout: 60000,
    });
    await expect(page.locator('[data-first-look-skip]')).toHaveCount(0);
  });

  test('prefers-reduced-motion shows the end state, not a faster build-up', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await signIn(page, ADMIN);

    await page.goto(`/project/${PROJECT_ID}?first=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const look = page.locator('[data-first-look]');
    await expect(look).toHaveAttribute('data-reduced-motion', 'true', { timeout: 60000 });
    await expect(look).toHaveAttribute('data-first-look', 'end-state', { timeout: 60000 });
    // The end state, so there is nothing left to skip.
    await expect(page.locator('[data-first-look-skip]')).toHaveCount(0);
    await context.close();
  });

  test('the pre-answered question stands there, out of the code and without a model call', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?first=1`, { waitUntil: 'domcontentloaded' });

    const card = page.locator('[data-ask-this-case]');
    await expect(card).toBeVisible({ timeout: 60000 });
    await expect(card).toHaveAttribute('data-ask-this-case', 'answered');

    const question = (await page.locator('[data-ask-question]').textContent()) || '';
    expect(question.startsWith('What happens when ')).toBe(true);
    // The condition is the source's own text, not a paraphrase.
    const condition = question.replace(/^What happens when /, '').replace(/\?$/, '');
    expect(BRANCHING.toUpperCase()).toContain(condition.split(' ')[0].toUpperCase());

    // Both halves of "ohne Modellaufruf und ohne das Kontingent anzutasten".
    const note = (await page.locator('[data-ask-no-model]').textContent()) || '';
    expect(note).toContain('No model call');
    expect(note).toContain('Not counted');

    // And at least one branch ends the flow, with a line behind it.
    await expect(page.locator('[data-ask-branch="ends-flow"]').first()).toBeVisible();
  });

  test('the three coach marks appear one at a time and go away for good', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}?first=1`, { waitUntil: 'domcontentloaded' });

    const mark = page.locator('[data-coach-mark]');
    await expect(mark).toHaveCount(1, { timeout: 60000 });
    await expect(mark).toHaveAttribute('data-coach-mark', 'decision');

    await page.click('[data-coach-mark-dismiss="decision"]');
    await expect(mark).toHaveAttribute('data-coach-mark', 'not-determined');
    await page.click('[data-coach-mark-dismiss="not-determined"]');
    await expect(mark).toHaveAttribute('data-coach-mark', 'next-step');
    await page.click('[data-coach-mark-dismiss="next-step"]');
    await expect(mark).toHaveCount(0);

    // Gone across a reload, because the browser remembers — and nothing else does.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-coach-mark]')).toHaveCount(0);

    // "Show tips again" brings them back (§6.2).
    await page.click('[data-coach-marks-reset]');
    await expect(page.locator('[data-coach-mark]')).toHaveCount(1);
  });

  test('a project with nothing staged says so four times and paints no zero', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${EMPTY_ID}?first=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-workspace-shell]')).toBeVisible({ timeout: 60000 });

    const states = await page.locator('[data-first-look-stage]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-state')),
    );
    expect(states).toEqual(['did-not-run', 'did-not-run', 'did-not-run', 'did-not-run']);
    await expect(page.locator('[data-first-look-figure]')).toHaveCount(0);
    await expect(page.locator('[data-first-look-result]')).toHaveAttribute(
      'data-first-look-result',
      'none',
    );
  });
});

test.describe('"New project" explains before it starts', () => {
  const ADMIN = `${unique('newproject-admin')}@cleancore-test.io`;

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'New', lastName: 'Project', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
  });

  test('carries the core sentence, the three lines and the three glances', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await signIn(page, ADMIN);
    await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('[data-new-project-core]')).toContainText('every statement tied to a line');
    await expect(page.locator('[data-new-project-difference]')).toHaveCount(3);
    await expect(page.locator('[data-new-project-glances]')).toBeVisible();

    // The ladder is A–D, in order, and never green.
    expect(
      await page.locator('[data-new-project-ladder] [data-level]').evaluateAll((els) =>
        els.map((el) => el.getAttribute('data-level')),
      ),
    ).toEqual(['A', 'B', 'C', 'D']);
    await expect(page.locator('[data-new-project-level-caveat]')).toContainText(
      'never part of a signed audit pack',
    );
  });

  test('the catalog figures come from the catalog, not from the copy', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });

    const artifacts = getLevelRuleVersion().artifacts;
    expect(artifacts.length, 'no synced artifacts — the check would be vacuous').toBeGreaterThan(0);

    for (const artifact of artifacts) {
      const row = page.locator(`[data-catalog-artifact="${artifact.file}"]`);
      await expect(row, `${artifact.file} is not named on the page`).toBeVisible();
      // `en` on both sides: `DESIGN.md` §3 fixes the format, and a bare
      // `toLocaleString()` compares the runner's locale with the browser's.
      await expect(row).toContainText(artifact.entries.toLocaleString('en'));
      await expect(row.locator('[data-catalog-synced]')).toHaveText(artifact.fetchedAt);
    }

    // And no sync date is written into the copy: the module that holds the words
    // has no date in it at all.
    const copy = fs.readFileSync(path.join(ROOT, 'lib/new-project-content.ts'), 'utf8');
    expect(copy, 'a date was typed into the copy — DESIGN.md §6.1.1: "nie fest im Text"').not.toMatch(
      /\b20\d{2}-\d{2}-\d{2}\b/,
    );
  });

  test('says what a start costs before the click, in the product’s one wording', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });

    // An example: free the first time, and the sentence says both halves.
    await expect(page.locator('[data-new-project-quota="example"]')).toContainText(
      'examples don’t use your analysis runs the first time',
    );
    expect(
      await page.locator('[data-example-quota]').evaluateAll((els) =>
        [...new Set(els.map((el) => (el.textContent || '').trim()))],
      ),
    ).toEqual([STARTER_BADGE_FREE]);

    // Own code: the quota sentence out of `lib/run-cost.ts`, with the number.
    await page.click('[data-start-choice="own-code"]');
    await expect(page.locator('[data-new-project-quota="own-code"]')).toContainText(
      'Uses 1 of your 5 free analysis runs',
    );
    await expect(page.locator('[data-new-project-start="own-code"]')).toContainText(
      'Continue to upload',
    );
  });
});
