import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { adminSetDoc } from './helpers/admin-seed';
import { readSource, decisionLines } from '../lib/first-look';
import { buildWorkspaceSearchIndex } from '../lib/workspace-search';
import {
  answerCase,
  caseGroundingPrompt,
  citedAnchors,
  gatherCaseEvidence,
  preAnsweredDecisionAnswer,
  questionTerms,
  NO_CASE_EVIDENCE,
  PRE_ANSWERED_QUESTION,
  UNANCHORED_PROPOSAL,
  MAX_CASE_FACTS,
} from '../lib/case-answer';
import { inspectModelText } from '../lib/model-text';
import { PROVENANCE } from '../lib/provenance';
import type { Project, WorklistItem } from '../lib/types';

/**
 * Roadmap 6.8 — „Ask this case" through the assistant that already exists.
 *
 * The step's whole value is a boundary, so the tests are mostly about what
 * does **not** happen:
 *
 *   1. **A question the project's evidence cannot answer gets no answer.** Not
 *      a hedged one, not a general SAP one — none, and no model call either.
 *      This is checked as data (`answerCase` returns `no-evidence` with no
 *      prompt to send) and again in a browser, with `/api/gemini` intercepted
 *      and asserted unreached.
 *   2. **Every in-project statement is bound to a line anchor.** Evidence
 *      without an anchor never becomes a fact; a model reply that cites none
 *      of the anchors it was handed is dropped rather than shown.
 *   3. **The knowledge base of `lib/chatbot-knowledge.ts` is out of reach
 *      inside a project.** Source-level, because the defect would be an
 *      ordering one: a branch that falls through on its own error path would
 *      answer from general SAP knowledge exactly when nobody is watching.
 *   4. **Roadmap 6.6 still holds.** The glossary answer is still reached before
 *      anything else and still costs no model call — this step added a path in
 *      front of the model, and had to not add one in front of the glossary.
 */

/** The same shape `tests/workspace-search.spec.ts` uses: one gateway with a
 *  hard-coded threshold, one call activity, one table write. */
const SOURCE = [
  'REPORT z_ask_this_case_demo.',
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

const WORKLIST: WorklistItem[] = [
  {
    id: 'CC-001',
    title: 'Custom table write outside a released API',
    category: 'Finding',
    severity: 'High',
    location: 'FORM book_order',
    recommendation: 'Route the write through a released business object.',
    status: 'open',
    effort: 'Medium',
    targetAnchor: 'L14',
  },
];

const PROJECT_ID = 'ask-this-case-fixture';
const reading = readSource(SOURCE);
const project: Project = { name: 'Emergency purchase approval', legacyCode: SOURCE, worklist: WORKLIST };
const index = buildWorkspaceSearchIndex({ projectId: PROJECT_ID, project, reading });
const decisions = decisionLines(reading.skeleton);
const context = { projectId: PROJECT_ID, legacyCode: SOURCE };

/* ==================================================== the question, taken apart */

test.describe('what the assistant searches for', () => {
  test('question words and filler are dropped; names out of the code are kept', () => {
    const terms = questionTerms('Where does this program write to zorders?');
    expect(terms).toContain('zorders');
    expect(terms).not.toContain('where');
    expect(terms).not.toContain('does');
    expect(terms).not.toContain('this');
  });

  test('a line reference survives, however short', () => {
    // `l14` is three characters and would pass the length floor anyway; `l7`
    // is two and would not, which is why line tokens are exempted explicitly.
    expect(questionTerms('What happens at L7?')).toContain('l7');
  });
});

/* ============================================ evidence: anchored, or not evidence */

test.describe('the evidence of this project', () => {
  test('every fact carries a line anchor — an unanchored one never becomes a fact', () => {
    const facts = gatherCaseEvidence(index, context, 'What happens with lv_amount?');
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(fact.anchor, `${fact.id} became a fact without an anchor`).toMatch(/^L\d+(-\d+)?$/);
    }
  });

  test('a glossary entry is never evidence about the code', () => {
    // "Clean Core" is in the same index (roadmap 6.6) and would match here.
    // General SAP knowledge is exactly what an in-project answer may not rest
    // on, so it is dropped before anything is built from it.
    const facts = gatherCaseEvidence(index, context, 'Is this Clean Core compliant?');
    for (const fact of facts) {
      expect(fact.kind).not.toBe('glossary');
    }
  });

  test('the evidence is capped — a dump is not evidence', () => {
    const facts = gatherCaseEvidence(index, context, 'lv_amount zorders kna1 book_order status amount');
    expect(facts.length).toBeLessThanOrEqual(MAX_CASE_FACTS);
  });
});

/* ======================================== the answer that is not invented (the point) */

test.describe('a question this project cannot answer', () => {
  const QUESTION = 'How many licence units will SAP charge us for this after the migration?';

  test('ends in "no evidence" — and there is nothing to send a model', () => {
    const answer = answerCase(index, context, QUESTION, decisions);
    expect(answer.mode).toBe('no-evidence');
    expect(answer.facts).toHaveLength(0);
    expect(answer.anchors).toHaveLength(0);
    // The decisive assertion: the `grounded` branch is the only one that
    // carries a prompt, so a `no-evidence` answer has nothing a caller could
    // send even if it wanted to.
    expect('prompt' in answer).toBe(false);
  });

  test('the wording says what was searched and what would help — not just "no"', () => {
    const answer = answerCase(index, context, QUESTION, decisions);
    expect(answer.mode).toBe('no-evidence');
    if (answer.mode === 'grounded') return;
    expect(answer.text).toBe(NO_CASE_EVIDENCE);
    expect(NO_CASE_EVIDENCE).toMatch(/elements, business rules, findings and source lines/);
  });

  test('it makes no claim of its own: no figure, no percentage, no recommendation', () => {
    // The failure this guards is the one `tests/no-fabricated-figures.spec.ts`
    // names one layer down: a "we could not determine that" sentence that
    // still slips a number into the reader's head.
    expect(NO_CASE_EVIDENCE).not.toMatch(/\d+\s*%/);
    expect(NO_CASE_EVIDENCE).not.toMatch(/\b(should|recommend|typically|usually|generally)\b/i);
  });
});

/* ============================================ the question answered in advance (2.7) */

test.describe('the pre-answered question, out of the branches of the code', () => {
  test('every branch it names carries the anchor it stands on', () => {
    const pre = preAnsweredDecisionAnswer(decisions);
    expect(pre, 'this fixture branches — there should be a pre-answer').toBeTruthy();
    expect(pre!.question).toBe(PRE_ANSWERED_QUESTION);
    for (const fact of pre!.facts) {
      expect(fact.anchor).toMatch(/^L\d+(-\d+)?$/);
      expect(pre!.text).toContain(fact.anchor);
    }
  });

  test('asked out loud, it is answered without a model call', () => {
    const answer = answerCase(index, context, PRE_ANSWERED_QUESTION, decisions);
    expect(answer.mode).toBe('deterministic');
    expect('prompt' in answer).toBe(false);
    expect(answer.anchors.length).toBeGreaterThan(0);
  });

  test('a source that branches nowhere gets no pre-answer at all', () => {
    // Offering the chip and then answering "in 0 places" teaches nothing.
    expect(preAnsweredDecisionAnswer([])).toBeNull();
    expect(preAnsweredDecisionAnswer([{ nodeId: 'g1', label: 'IF', anchor: null, branches: [] }])).toBeNull();
  });
});

/* ================================================= the grounded call, and its return */

test.describe('what the model is given, and what comes back', () => {
  const QUESTION = 'What does the program do with lv_amount?';

  test('the prompt carries the evidence and the question — and no knowledge base', () => {
    const answer = answerCase(index, context, QUESTION, decisions);
    expect(answer.mode).toBe('grounded');
    if (answer.mode !== 'grounded') return;

    for (const anchor of answer.anchors) expect(answer.prompt).toContain(anchor);
    expect(answer.prompt).toContain(QUESTION);
    // The out-of-project prompt carries the platform positioning and the whole
    // glossary. This one may carry neither: that is the boundary.
    expect(answer.prompt).not.toMatch(/Clean-Core\.io/);
    expect(answer.prompt).not.toMatch(/Knowledge Hub/i);
    expect(answer.prompt).not.toMatch(/BTP extensions/i);
  });

  test('the prompt tells the model that "the evidence does not answer this" is a correct answer', () => {
    const prompt = caseGroundingPrompt('anything', [
      { id: 'x', kind: 'element', title: 'IF lv_amount > 5000', detail: 'gateway', anchor: 'L7' },
    ]);
    expect(prompt).toMatch(/does not answer the question, say so/i);
    expect(prompt).toContain('L7');
  });

  test('a reply that cites none of the anchors it was given is refused', () => {
    // This is the check that survives a model answering from memory anyway.
    const generic = 'Custom table writes should be replaced by a released business object on BTP.';
    expect(citedAnchors(generic, ['L7', 'L14'])).toHaveLength(0);
  });

  test('a citation is matched whole — L12 is not a citation of L120', () => {
    expect(citedAnchors('The threshold stands at L12.', ['L120'])).toHaveLength(0);
    expect(citedAnchors('The threshold stands at L120.', ['L120'])).toEqual(['L120']);
    // A range cited by its first line still counts: that is how a reply
    // usually shortens `L380-412`, and refusing it would drop a good answer.
    expect(citedAnchors('See L380.', ['L380-412'])).toEqual(['L380-412']);
  });

  test('the refusal wording says why, and promises the evidence it then shows', () => {
    expect(UNANCHORED_PROPOSAL).toMatch(/unsupported/);
    expect(UNANCHORED_PROPOSAL).toMatch(/listed below/);
  });
});

/* ================================================================ the house voice */

test.describe('the fixed wordings pass the §3.1 filter', () => {
  for (const [name, text] of [
    ['NO_CASE_EVIDENCE', NO_CASE_EVIDENCE],
    ['UNANCHORED_PROPOSAL', UNANCHORED_PROPOSAL],
    ['PRE_ANSWERED_QUESTION', PRE_ANSWERED_QUESTION],
  ] as const) {
    test(`${name} carries no AI tell, no symbolism and no raw Markdown`, () => {
      const findings = inspectModelText(text, 'screen');
      expect(findings.map((f) => `${f.kind}: ${f.term}`)).toEqual([]);
    });
  }
});

/* ============================================ the boundary, proven from the module graph */

test.describe('no model call and no knowledge base, by construction', () => {
  const ROOT = path.resolve(__dirname, '..');
  // Normalised to LF: the working copies here are CRLF on Windows and LF in
  // CI, and a guard that asserts on the order of two lines must not depend on
  // which of the two checked it out.
  const read = (rel: string) =>
    fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\r\n').join('\n');

  test('lib/case-answer.ts imports neither the Gemini proxy nor `fetch`', () => {
    const src = read('lib/case-answer.ts');
    expect(src).not.toMatch(/from ['"]\.\/gemini['"]/);
    expect(src).not.toMatch(/from ['"]@\/lib\/gemini['"]/);
    expect(src).not.toMatch(/\bfetch\(/);
  });

  test('the in-project branch returns before the knowledge base is ever built', () => {
    const src = read('components/GlossaryChatbot.tsx');
    const branchAt = src.indexOf('if (projectId) {\n      try {');
    const knowledgeAt = src.indexOf('buildKnowledgeBase()');
    expect(branchAt, 'the in-project branch is gone — check this test, not the component').toBeGreaterThan(-1);
    expect(knowledgeAt, 'the knowledge base is gone — check this test, not the component').toBeGreaterThan(-1);
    expect(branchAt).toBeLessThan(knowledgeAt);
    // And it returns on every path, including its own `catch`: falling through
    // would answer a question about somebody's ABAP out of general SAP
    // knowledge exactly when something had already gone wrong.
    const branch = src.slice(branchAt, knowledgeAt);
    expect(branch).toMatch(/\}\s*\n\s*return;\n\s*\}/);
  });

  test('roadmap 6.6 still stands: the glossary is checked before anything else', () => {
    const src = read('components/GlossaryChatbot.tsx');
    const glossaryAt = src.indexOf('glossaryAnswerFor(text)');
    const projectBranchAt = src.indexOf('if (projectId) {\n      try {');
    const knowledgeAt = src.indexOf('buildKnowledgeBase()');
    expect(glossaryAt).toBeGreaterThan(-1);
    // Both paths this step touched sit behind the glossary check, and the
    // glossary branch returns before either can run. Measured against the two
    // branches rather than the first `callGemini(` in the file: that one now
    // lives in the in-project helper, which is declared above `handleSend`
    // and says nothing about the order things run in.
    expect(glossaryAt).toBeLessThan(projectBranchAt);
    expect(glossaryAt).toBeLessThan(knowledgeAt);
    expect(src.slice(glossaryAt, projectBranchAt)).toMatch(/return;/);
  });

  test('the assistant names no model stage — so it charges no quota', () => {
    // `app/api/gemini/route.ts` honours the per-stage switch and the run route
    // does the metering; a caller that names no stage spends nothing. Roadmap
    // 6.8: "Zählt nicht aufs Kontingent."
    const src = read('components/GlossaryChatbot.tsx');
    for (const call of src.match(/callGemini\([^;]*?\);/g) ?? []) {
      expect(call, 'the assistant started naming a model stage — that would charge the quota').not.toMatch(/stage/);
    }
  });

  test('model text reaches the screen through lib/model-text.ts', () => {
    const src = read('components/GlossaryChatbot.tsx');
    expect(src).toMatch(/cleanModelText\(/);
  });
});

/* ================================================================ in a real browser */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(app);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'AskThisCase123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Opens the assistant and waits until its panel is really there.
 *
 * Clicked in a loop rather than once because the trigger is in the layout and
 * paints before the page it sits on has hydrated: a single click can land on
 * an element that is not listening yet, and the spec then fails on the panel
 * instead of on the thing it is about. The loop re-checks the panel *before*
 * each click, so a slow first click is never undone by a second one.
 */
async function openChat(page: Page): Promise<void> {
  const toggle = page.locator('[data-chatbot-toggle]').first();
  await expect(toggle).toBeVisible({ timeout: 90000 });
  const panel = page.locator('[data-chatbot-scope]');

  // Nothing here is optional: the assertion is the last line of the block and
  // `toPass` re-runs the whole block until it holds, so a panel that never
  // opens fails the spec. The one thing that is conditional is the *click* —
  // this is a toggle, and clicking it again on an open panel would close it.
  //
  // The visibility is read into a named result first, rather than asked inline
  // inside the condition, because `tests/no-vacuous-tests.spec.ts` is
  // deliberately crude and repo-wide (this comment is worded around its pattern
  // too — quoting the shape it forbids trips it just as well),
  // and it is right to be: it cannot tell a gate on a click from a gate on an
  // assertion, and the shape it forbids is the one that hid three dead specs
  // for months.
  await expect(async () => {
    const alreadyOpen = await panel.isVisible().catch(() => false);
    if (!alreadyOpen) await toggle.click({ timeout: 15000 });
    await expect(panel, 'the assistant panel never opened').toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000 });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

test.describe('the assistant, inside a project, in a browser', () => {
  const OWNER = `${unique('ask-case')}@cleancore-test.io`;
  const LIVE_PROJECT = unique('ask-case-project');

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Ask', lastName: 'Case', email: OWNER,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', LIVE_PROJECT, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: SOURCE,
      worklist: WORKLIST,
    });
  });

  test('a question the evidence cannot answer reaches no model, and invents nothing', async ({ page }) => {
    test.setTimeout(240 * 1000);

    let geminiCalled = false;
    await page.route('**/api/gemini', async (route) => {
      geminiCalled = true;
      await route.fulfill({ status: 500, body: 'an unevidenced question must never reach this route' });
    });

    await signIn(page, OWNER);
    await page.goto(`/project/${LIVE_PROJECT}/analyze`, { waitUntil: 'domcontentloaded' });

    const toggle = page.locator('[data-chatbot-toggle]').first();
    await expect(toggle).toBeVisible({ timeout: 90000 });
    await expect(toggle, 'the assistant still advertises itself as "Ask AI"').toContainText('Ask this case');
    await openChat(page);

    // The panel says which boundary is in force before anything is typed.
    await expect(page.locator('[data-chatbot-scope]')).toContainText('only from the evidence of this project');

    await page.fill('input[placeholder*="Ask"]', 'How many licence units will SAP charge us for this?');
    await page.keyboard.press('Enter');

    const badge = page.locator('[data-chatbot-case-answer]').last();
    await expect(badge).toBeVisible({ timeout: 30000 });
    await expect(badge.locator('[data-chatbot-provenance]')).toHaveText(PROVENANCE['not-determined'].label);
    await expect(badge.locator('[data-chatbot-no-model-call]')).toBeVisible();
    // No anchor, because there is no statement to anchor.
    await expect(badge.locator('[data-chatbot-anchors]')).toHaveCount(0);

    expect(geminiCalled, '/api/gemini was called for a question with no evidence behind it').toBe(false);
  });

  test('the pre-answered question is answered from the branches, with anchors and no model call', async ({ page }) => {
    test.setTimeout(240 * 1000);

    let geminiCalled = false;
    await page.route('**/api/gemini', async (route) => {
      geminiCalled = true;
      await route.fulfill({ status: 500, body: 'the pre-answered question must never reach this route' });
    });

    await signIn(page, OWNER);
    await page.goto(`/project/${LIVE_PROJECT}/analyze`, { waitUntil: 'domcontentloaded' });
    await openChat(page);

    await page.fill('input[placeholder*="Ask"]', PRE_ANSWERED_QUESTION);
    await page.keyboard.press('Enter');

    const badge = page.locator('[data-chatbot-case-answer]').last();
    await expect(badge).toBeVisible({ timeout: 30000 });
    await expect(badge.locator('[data-chatbot-provenance]')).toHaveText(PROVENANCE.reconstructed.label);
    await expect(badge.locator('[data-chatbot-anchors]')).toContainText(/L\d+/);
    expect(geminiCalled, 'the pre-answered question reached the model').toBe(false);
  });
});
