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
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import { readSource } from '../lib/first-look';
import { GLOSSARY_ITEMS } from '../lib/glossary';
import {
  findGlossaryTerm,
  parseWhatIsQuestion,
  glossaryAnswerFor,
  glossaryAnswerText,
} from '../lib/glossary-lookup';
import {
  buildWorkspaceSearchIndex,
  searchWorkspace,
  SEARCH_KIND_LABEL,
} from '../lib/workspace-search';
import type { Project, WorklistItem } from '../lib/types';

/**
 * Roadmap 6.6 — search in the project (⌘K) and the glossary.
 *
 * Three claims, checked at three different distances from the browser:
 *
 *   1. **The index is honest about its five categories** (elements, rules,
 *      findings, source lines, glossary) — checked as pure data, against a
 *      real reading of real ABAP (`BRANCHING` below, shared with
 *      `tests/first-look.spec.ts`'s own fixture in shape) rather than a
 *      hand-built fixture that could disagree with what the engine actually
 *      produces.
 *   2. **A glossary answer never reaches a model call** — checked twice: once
 *      by construction (the functions involved are synchronous and return
 *      before any `await` could have happened, and the modules that implement
 *      them import neither `lib/gemini.ts` nor `fetch`), and once from the
 *      browser (`/api/gemini` is intercepted and asserted unreached while the
 *      dialog answers "What is Clean Core?").
 *   3. **The dialog is a dialog** — `role="dialog"`, `aria-modal`, a focus trap,
 *      Escape, and a way in that needs no keyboard shortcut — checked by
 *      driving a real browser, the only way any of that can be proven.
 */

/** Shares its shape with `tests/first-look.spec.ts`'s `BRANCHING`: a gateway
 *  with a hard-coded rule on it, and a call activity — enough for the index to
 *  have at least one real element and one real rule to find. */
const SOURCE = [
  'REPORT z_workspace_search_demo.',
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

/* ============================================================ the index */

test.describe('the index — elements, rules, findings, glossary', () => {
  const reading = readSource(SOURCE);
  const project: Project = { name: 'Search fixture', legacyCode: SOURCE, worklist: WORKLIST };

  test('every result names a kind that is one of the five the roadmap row lists', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'p1', project, reading });
    expect(index.length).toBeGreaterThan(0);
    const kinds = new Set(index.map((r) => r.kind));
    for (const kind of kinds) {
      expect(['element', 'rule', 'finding', 'source-line', 'glossary']).toContain(kind);
    }
    // A result list that cannot be acted on is a list: every kind is present
    // and, other than glossary (which answers in place), carries a real href.
    for (const result of index) {
      expect(result.href !== null || result.kind === 'glossary', `${result.id} has no way to act on it`).toBe(true);
    }
  });

  test('the gateway and its rule are both in the index, each with the right anchor', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'proj-1', project, reading });

    const gateway = index.find((r) => r.kind === 'element' && r.title.includes('lv_amount'));
    expect(gateway, 'the IF gateway is not in the element index').toBeTruthy();
    expect(gateway!.anchor).toMatch(/^L\d+/);
    expect(gateway!.href).toBe('/project/proj-1/documentation');

    const rule = index.find((r) => r.kind === 'rule');
    expect(rule, 'the hard-coded threshold produced no rule').toBeTruthy();
    expect(rule!.id).toMatch(/^rule:BR-/);
    expect(rule!.anchor).toMatch(/^L\d+/);
    expect(rule!.href).toBe('/project/proj-1/documentation');
  });

  test('a project with no reading and no worklist has no elements, rules or findings — only the glossary', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'p2', project: null, reading: null });
    expect(index.every((r) => r.kind === 'glossary')).toBe(true);
    expect(index.length).toBe(Object.keys(GLOSSARY_ITEMS).length);
  });

  test('the worklist becomes findings that link to the analyze stage', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'proj-2', project, reading: null });
    const finding = index.find((r) => r.kind === 'finding');
    expect(finding).toBeTruthy();
    expect(finding!.title).toBe(WORKLIST[0].title);
    expect(finding!.anchor).toBe('L14');
    expect(finding!.href).toBe('/project/proj-2/analyze');
  });

  test('start and end events are not searchable elements — they are flow boilerplate, not things to find', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'p3', project, reading });
    const elementKinds = index.filter((r) => r.kind === 'element').map((r) => r.detail.split(' · ')[0]);
    expect(elementKinds).not.toContain('start');
    expect(elementKinds).not.toContain('end');
  });

  test('every glossary result carries the no-model-call answer text and says what it is', () => {
    const index = buildWorkspaceSearchIndex({ projectId: 'p4', project: null, reading: null });
    for (const [key, item] of Object.entries(GLOSSARY_ITEMS)) {
      const result = index.find((r) => r.id === `glossary:${key}`);
      expect(result, `${key} is missing from the index`).toBeTruthy();
      expect(result!.glossaryAnswer).toBe(glossaryAnswerText(item));
      expect(result!.href, 'a glossary hit has nothing to navigate to — it already is the answer').toBeNull();
    }
  });

  test('SEARCH_KIND_LABEL names all five kinds, once each, in plain words', () => {
    expect(Object.keys(SEARCH_KIND_LABEL).sort()).toEqual(
      ['element', 'finding', 'glossary', 'rule', 'source-line'].sort(),
    );
    for (const label of Object.values(SEARCH_KIND_LABEL)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

/* ============================================================ searching it */

test.describe('searching the index', () => {
  const reading = readSource(SOURCE);
  const project: Project = { name: 'Search fixture', legacyCode: SOURCE, worklist: WORKLIST };
  const index = buildWorkspaceSearchIndex({ projectId: 'p1', project, reading });

  test('an empty query finds nothing — a live filter answers "so far", not "everything"', () => {
    expect(searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, '')).toEqual([]);
    expect(searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, '   ')).toEqual([]);
  });

  test('a query matches case-insensitively across title, detail and anchor', () => {
    const byTitle = searchWorkspace(index, { projectId: 'p1' }, 'LV_AMOUNT');
    expect(byTitle.some((r) => r.kind === 'element')).toBe(true);

    // The detail line reads "<node kind> · <region>" — "gateway" is not
    // capitalised anywhere in the source, so a hit here can only come from a
    // case-insensitive match on that field, not on the title.
    const byDetail = searchWorkspace(index, { projectId: 'p1' }, 'GATEWAY');
    expect(byDetail.some((r) => r.kind === 'element' && r.detail.startsWith('gateway'))).toBe(true);

    const byAnchor = searchWorkspace(index, { projectId: 'p1' }, 'l14');
    // "l14" also parses as a line-number query with no legacyCode supplied here,
    // so it is matched on the finding's own anchor text instead.
    expect(byAnchor.some((r) => r.kind === 'finding' && r.anchor === 'L14')).toBe(true);
  });

  test('an exact title match ranks ahead of one that merely contains the query', () => {
    const hits = searchWorkspace(index, { projectId: 'p1' }, 'clean core');
    const titles = hits.filter((r) => r.kind === 'glossary').map((r) => r.title);
    // "Clean Core" itself, and nothing that merely mentions it in its longer
    // `term`/`detail`, so the exact entry has to be the very first glossary hit.
    expect(titles[0]).toBe('Clean Core');
  });

  test('a bare line number finds that source line, quoted from the real file', () => {
    const hits = searchWorkspace(index, { projectId: 'proj-9', legacyCode: SOURCE }, '7');
    const hit = hits.find((r) => r.kind === 'source-line');
    expect(hit, 'line 7 was not found').toBeTruthy();
    expect(hit!.anchor).toBe('L7');
    expect(hit!.detail).toBe(SOURCE.split('\n')[6].trim());
    expect(hit!.href).toBe('/project/proj-9/documentation');
  });

  test('"L7" and "l 7" are read the same way as "7"', () => {
    for (const q of ['L7', 'l7', 'l 7']) {
      const hits = searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, q);
      expect(hits.some((r) => r.kind === 'source-line' && r.anchor === 'L7'), `"${q}" missed line 7`).toBe(true);
    }
  });

  test('a line number past the end of the file finds no source line', () => {
    const hits = searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, String(SOURCE.split('\n').length + 50));
    expect(hits.some((r) => r.kind === 'source-line')).toBe(false);
  });

  test('a one- or two-character query does not scan the source text — only a line number can be that short', () => {
    const hits = searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, 'IF');
    expect(hits.some((r) => r.kind === 'source-line')).toBe(false);
  });

  test('a three-or-more character query finds matching lines, capped rather than unbounded', () => {
    const hits = searchWorkspace(index, { projectId: 'p1', legacyCode: SOURCE }, 'ENDIF');
    const lines = hits.filter((r) => r.kind === 'source-line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  test('with no source staged, a line-shaped query still answers from the fixed index alone', () => {
    // No `legacyCode` in the context — the same query some other kind's anchor
    // happens to share must not throw for want of a file to scan.
    expect(() => searchWorkspace(index, { projectId: 'p1' }, '14')).not.toThrow();
  });
});

/* ============================================================ the glossary lookup */

test.describe('answering "What is …?" from the glossary — no model call', () => {
  test('an exact term, case- and spacing-insensitive, is found', () => {
    expect(findGlossaryTerm('RAP')?.key).toBe('RAP');
    expect(findGlossaryTerm('rap')?.key).toBe('RAP');
    expect(findGlossaryTerm('  Clean   Core  ')?.key).toBe('Clean Core');
  });

  test('a term named inside a longer sentence is found', () => {
    expect(findGlossaryTerm('tell me about SAP BTP please')?.key).toBe('SAP BTP');
  });

  test('a short query only matches when it is at least three characters', () => {
    expect(findGlossaryTerm('core')?.key).toBe('Clean Core');
    expect(findGlossaryTerm('a')).toBeNull();
  });

  test('nothing in the glossary answers a query that names no term', () => {
    expect(findGlossaryTerm('how do I reset my password')).toBeNull();
  });

  test('`DESIGN.md` §6.1\'s own example question parses to a term query', () => {
    // The mockup's example is "What is a released API?" — parsing is checked
    // on its own so a content gap (the glossary key is "Released Interface",
    // not "released API") shows up as "no match", never as a parse failure.
    expect(parseWhatIsQuestion('What is a released API?')).toBe('released API');
    expect(parseWhatIsQuestion('What is Clean Core?')).toBe('Clean Core');
    expect(parseWhatIsQuestion("What's BTP")).toBe('BTP');
    expect(parseWhatIsQuestion('How do I upload code?')).toBeNull();
  });

  test('a "What is …?" question about a known term is answered from the entry', () => {
    const answer = glossaryAnswerFor('What is Clean Core?');
    expect(answer?.key).toBe('Clean Core');
    expect(answer?.answer).toBe(glossaryAnswerText(GLOSSARY_ITEMS['Clean Core']));
  });

  test('a "What is …?" question about an unknown term has no glossary answer', () => {
    expect(glossaryAnswerFor('What is BYOK?')).toBeNull();
  });

  test('the answer is the entry\'s own words — never longer than definition + implication', () => {
    const answer = glossaryAnswerFor('RAP')!;
    expect(answer.answer).toBe(`${GLOSSARY_ITEMS.RAP.definition} ${GLOSSARY_ITEMS.RAP.cleanCoreImplication}`);
  });
});

/* ============================================================ no model call, by construction */

test.describe('no model call — proven from the source, not just claimed in a comment', () => {
  const ROOT = path.resolve(__dirname, '..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  test('the glossary lookup imports neither the Gemini proxy nor `fetch`', () => {
    const src = read('lib/glossary-lookup.ts');
    expect(src).not.toMatch(/from ['"]@\/lib\/gemini['"]/);
    expect(src).not.toMatch(/\bfetch\(/);
  });

  test('the search index imports neither the Gemini proxy nor `fetch`', () => {
    const src = read('lib/workspace-search.ts');
    expect(src).not.toMatch(/from ['"]@\/lib\/gemini['"]/);
    expect(src).not.toMatch(/\bfetch\(/);
  });

  test('the glossary answer resolves synchronously — a model call is necessarily asynchronous', () => {
    // `glossaryAnswerFor` returns a plain object, not a Promise. A function
    // that had to await a network response could not do that: this is a
    // property of the *type* of what comes back, not a timing measurement.
    const result = glossaryAnswerFor('What is Clean Core?');
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result?.answer).toBe('string');
  });

  test('the chatbot checks the glossary before anything else in `handleSend`', () => {
    // Source-level, like `tests/signavio-claims-guard.spec.ts`'s own checks:
    // inside `handleSend`, the glossary lookup has to come before both of the
    // branches that can spend a model call, and has to return rather than
    // fall through into either.
    //
    // Measured against the two branches rather than against the first
    // `callGemini(` in the file: since roadmap 6.8 the component also has an
    // in-project helper, declared above `handleSend`, which calls the model on
    // grounded evidence. Where that helper is *declared* says nothing about
    // the order things run in, and the old file-order comparison would fail on
    // a component that is still correct.
    const src = read('components/GlossaryChatbot.tsx');
    const glossaryCheckAt = src.indexOf('glossaryAnswerFor(text)');
    // Matched as a pattern rather than a literal, so the guard does not depend
    // on whether this working copy was checked out with CRLF or LF.
    const projectBranchAt = src.search(/if \(projectId\) \{\s+try \{/);
    const knowledgeAt = src.indexOf('buildKnowledgeBase()');
    expect(glossaryCheckAt, 'GlossaryChatbot no longer checks the glossary at all').toBeGreaterThan(-1);
    expect(projectBranchAt, 'the in-project branch is gone — check this test, not the component').toBeGreaterThan(-1);
    expect(knowledgeAt, 'GlossaryChatbot no longer calls the model at all — check this test, not the component').toBeGreaterThan(-1);
    expect(glossaryCheckAt).toBeLessThan(projectBranchAt);
    expect(glossaryCheckAt).toBeLessThan(knowledgeAt);
    // And the glossary branch returns — it does not fall through into either.
    expect(src.slice(glossaryCheckAt, projectBranchAt)).toMatch(/return;/);
  });
});

/* ================================================================ the dialog, in a browser */

const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(app);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceSearch123!';
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

test.describe('the ⌘K dialog, opened by an administrator who turned the workspace on', () => {
  const ADMIN = `${unique('search-admin')}@cleancore-test.io`;
  const PROJECT_ID = unique('search-project');
  let adminUid = '';

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    adminUid = cred.user.uid;
    await adminSetCustomClaim(adminUid, { admin: true });
    await adminSetDoc('users', adminUid, {
      firstName: 'Search', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Emergency purchase approval', userId: adminUid,
      createdAt: new Date(), status: 'created',
      legacyCode: SOURCE,
      worklist: WORKLIST,
    });
  });

  test('a visible, labelled button opens it — no keyboard shortcut required', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const trigger = page.locator('[data-command-search-trigger]');
    await expect(trigger, 'no visible way into the search that does not need a keyboard shortcut').toBeVisible();
    await trigger.click();

    const dialog = page.locator('[data-command-search]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Focus starts in the field — a reader can type immediately.
    await expect(page.locator('[data-command-search-input]')).toBeFocused();
  });

  test('Ctrl+K opens it too, from anywhere on the page', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    await page.keyboard.press('Control+k');
    await expect(page.locator('[data-command-search]')).toBeVisible();
  });

  test('the focus is trapped, Escape closes it, and the opener gets the focus back', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    const trigger = page.locator('[data-command-search-trigger]');
    await trigger.focus();
    await trigger.click();
    await expect(page.locator('[data-command-search]')).toBeVisible();

    // Shift+Tab from the field (the first focusable element) wraps to the
    // last one inside the dialog rather than escaping onto the page behind it.
    await page.keyboard.press('Shift+Tab');
    const activeInsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-command-search]');
      return !!dialog && dialog.contains(document.activeElement);
    });
    expect(activeInsideDialog, 'Shift+Tab left the dialog — a keyboard trap the other way round').toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-command-search]')).toHaveCount(0);
    await expect(trigger, 'closing did not return focus to the control that opened it').toBeFocused();
  });

  test('every result says what kind of thing it is', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    await page.locator('[data-command-search-trigger]').click();
    await page.fill('[data-command-search-input]', 'lv_amount');
    const hit = page.locator('[data-command-search-hit="element"]').first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText('Element');
  });

  test('a finding links to the Analyze stage, where the worklist actually renders', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    await page.locator('[data-command-search-trigger]').click();
    await page.fill('[data-command-search-input]', WORKLIST[0].title);
    const hit = page.locator('[data-command-search-hit="finding"]').first();
    await expect(hit).toBeVisible();
    await hit.locator('button').click();
    await page.waitForURL(`**/project/${PROJECT_ID}/analyze`);
  });

  test('a glossary answer appears in place, says "No model call", and no request reaches /api/gemini', async ({ page }) => {
    test.setTimeout(180 * 1000);

    let geminiCalled = false;
    await page.route('**/api/gemini', async (route) => {
      geminiCalled = true;
      await route.fulfill({ status: 500, body: 'a glossary answer must never reach this route' });
    });

    await signIn(page, ADMIN);
    await page.goto(`/project/${PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-workspace-shell]', { timeout: 60000 });

    await page.locator('[data-command-search-trigger]').click();
    await page.fill('[data-command-search-input]', 'Clean Core');

    const glossaryHit = page.locator('[data-command-search-hit="glossary"]').first();
    await expect(glossaryHit).toBeVisible();
    await expect(glossaryHit.locator('[data-command-search-glossary-answer]')).toBeVisible();
    await expect(glossaryHit.locator('[data-command-search-no-model-call]')).toHaveText('No model call');
    await expect(glossaryHit.locator('[data-command-search-glossary-source]')).toContainText('Source not yet recorded');

    // Give any accidental fire-and-forget call a moment to have shown up.
    await page.waitForTimeout(500);
    expect(geminiCalled, 'the glossary answer reached the Gemini proxy').toBe(false);
  });
});
