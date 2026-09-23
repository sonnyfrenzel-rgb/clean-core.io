import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import {
  managementAnswers,
  runHistoryEntry,
  ruleVersionLabel,
  scoreTrend,
  type RunHistoryEntry,
} from '../lib/management-answers';
import { isProvenanceValue } from '../lib/provenance';
import { workflowSteps } from '../lib/workflow-steps';
import { sha256Hex } from '../lib/artefact-digest';
import type { Project } from '../lib/types';

/**
 * Roadmap 6.4 — the Management view's answers.
 *
 * The row names four things and every one of them is a way to lie by arithmetic,
 * so each gets its own check:
 *
 *   - **„was bestätigt ist"** is `proven`, not `done`. A design the account
 *     signed off is on record and nothing checked it; counted as confirmed it
 *     becomes the number somebody quotes in a board paper.
 *   - **„was fehlt"** has to include what the engine stepped over, as its own
 *     figure, with `null` — not `0` — when nothing was assessed at all.
 *   - **„was eine Entscheidung binden würde"** is a list with evidence per
 *     line, and the blockers are named rather than counted into a share.
 *   - **„Clean Core Score mit Regelversion und Verlauf"**, and the clause that
 *     governs it: *ein Verlauf vergleicht nur Runs derselben Regelversion*. A
 *     line across a rule change is a change of scale, and a line through one
 *     point is an invented second observation.
 *
 * The derivation is driven, not read: every state below is built from fixtures
 * the components could not produce — five runs across two rule versions, a run
 * with no analyzer version, a project whose runs could not be read at all.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------- fixtures */

const V1 = { rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08' };
const V2 = { ...V1, sapApiCatalogVersion: 'cat-2026-09' };

const rawRun = (over: Record<string, unknown> = {}) => ({
  runId: 'run-1',
  createdAt: '2026-09-01T10:00:00.000Z',
  cleanCoreScore: 62,
  ...V1,
  ...over,
});

const entry = (over: Record<string, unknown> = {}): RunHistoryEntry => {
  const parsed = runHistoryEntry(rawRun(over));
  if (!parsed) throw new Error('fixture is not a run');
  return parsed;
};

const SOURCE = 'REPORT z_mm_po_approval.\nWRITE 1.\n';

/**
 * A project with a signed run, a generated design and a sign-off on it.
 *
 * The fingerprint is the **real** digest of `SOURCE`. A made-up one makes
 * `staleness()` report that the source moved after the run, so every phase
 * turns stale and the fixture quietly stops being the case it is named after —
 * which is exactly what the first version of this file did: it asserted things
 * about a sign-off on a project whose design the contract had already written
 * off as built for a previous source.
 */
const signedOff: Project = {
  name: 'Emergency purchase approval',
  legacyCode: SOURCE,
  activeRunId: 'run-1',
  cleanCoreScore: 62,
  solutionDesign: '# Target architecture\nRAP.\n',
  approvedByArchitect: true,
  approvedBy: 'S. Frenzel',
  auditMetadata: {
    inputFingerprint: {
      sha256: sha256Hex(SOURCE),
      fileName: 'Z_MM_PO_APPROVAL.abap',
      lineCount: 640,
      byteSize: 21_400,
      uploadedAt: '2026-09-01T09:00:00.000Z',
      objectType: 'Report',
    },
  },
};

const bare: Project = { name: 'Nothing analysed yet', legacyCode: 'REPORT z_bare.\nWRITE 1.\n' };
const empty: Project = { name: 'Nothing at all' };

const figureOf = (view: ReturnType<typeof managementAnswers>, answer: string, key: string) => {
  const card = view.answers.find((a) => a.id === answer);
  if (!card) throw new Error(`no answer ${answer}`);
  const figure = card.figures.find((f) => f.key === key);
  if (!figure) throw new Error(`no figure ${key} on ${answer}`);
  return figure;
};

/* ------------------------------------------- 1. „bestätigt" is the narrow word */

test.describe('what is confirmed', () => {
  test('a design the account signed off is NOT counted as confirmed', () => {
    const steps = workflowSteps(signedOff);
    const design = steps.find((s) => s.key === 'design');
    // The premise of the test, stated rather than assumed: the phase contract
    // itself calls this phase done and unproven.
    expect(design?.done, 'the fixture no longer has a finished design').toBe(true);
    expect(design?.proven, 'the phase contract now calls a sign-off proven').toBe(false);

    const view = managementAnswers(signedOff, [entry()], null);
    const proven = figureOf(view, 'confirmed', 'proven');
    const claimed = figureOf(view, 'confirmed', 'self-declared');

    expect(proven.value, 'only the signed run is backed by evidence').toBe(`1 of ${steps.length}`);
    expect(proven.provenance).toBe('proven');
    // The sign-off is on record, counted apart, and says what it is worth.
    expect(claimed.value).toBe(`1 of ${steps.length}`);
    expect(claimed.provenance).toBe('confirmed');

    const claim = view.answers
      .find((a) => a.id === 'confirmed')!
      .items.find((i) => i.key === 'claimed-design');
    expect(claim?.detail).toContain('a claim by the signed-in account, not a proof');
  });

  test('the two are never added into one figure', () => {
    const view = managementAnswers(signedOff, [entry()], null);
    const card = view.answers.find((a) => a.id === 'confirmed')!;
    const total = workflowSteps(signedOff).length;
    // "2 of 7" anywhere in this card would be the sum of a proof and a claim.
    for (const figure of card.figures) {
      expect(figure.value, 'a proof and a claim were added up').not.toBe(`2 of ${total}`);
    }
    expect(card.headline).toContain('a claim, not a proof');
  });

  test('every provenance value used is one of the nine', () => {
    const view = managementAnswers(signedOff, [entry()], { items: [], count: 0, noSource: false });
    for (const answer of view.answers) {
      for (const figure of answer.figures) expect(isProvenanceValue(figure.provenance)).toBe(true);
      for (const item of answer.items) expect(isProvenanceValue(item.provenance)).toBe(true);
    }
  });
});

/* ------------------------------------------------------- 2. what is missing */

test.describe('what is missing', () => {
  test('not determined is its own figure and is null, not zero, without a source', () => {
    const view = managementAnswers(empty, [], { items: [], count: 0, noSource: true });
    const figure = figureOf(view, 'missing', 'not-determined');
    expect(figure.value, 'a zero would report an assessment that never ran').toBeNull();
    expect(figure.absentReason).toContain('no source has been staged');
    expect(figure.provenance).toBe('not-determined');
  });

  test('a counted zero and an unassessed source are different answers', () => {
    const assessed = figureOf(
      managementAnswers(bare, [], { items: [], count: 0, noSource: false }),
      'missing',
      'not-determined',
    );
    expect(assessed.value).toBe('0');
    expect(assessed.absentReason).toBeUndefined();
  });

  test('every open phase is named with the contract’s own words', () => {
    const view = managementAnswers(bare, [], null);
    const card = view.answers.find((a) => a.id === 'missing')!;
    const open = workflowSteps(bare).filter((s) => !s.done);
    expect(card.items.length).toBe(open.length);
    for (const step of open) {
      const item = card.items.find((i) => i.key === `open-${step.key}`);
      expect(item?.detail, `${step.key} carries a sentence of this module’s own`).toBe(step.detail);
    }
  });
});

/* --------------------------------------------- 3. what a decision would bind */

test.describe('what a decision would bind, and what blocks it', () => {
  test('without a run there is nothing to bind, and that is the first blocker', () => {
    const view = managementAnswers(bare, [], null);
    const bound = figureOf(view, 'decision', 'bound');
    expect(bound.value).toBeNull();
    expect(bound.absentReason).toContain('no signed run');

    const card = view.answers.find((a) => a.id === 'decision')!;
    expect(card.items[0].key).toBe('no-run');
    expect(card.items[0].detail).toContain('not on record');
  });

  test('with a run the binding names the run and the source digest', () => {
    const card = managementAnswers(signedOff, [entry()], null).answers.find((a) => a.id === 'decision')!;
    const run = card.items.find((i) => i.key === 'run');
    const source = card.items.find((i) => i.key === 'source');
    expect(run?.detail).toContain('run-1');
    expect(source?.detail).toContain('640 lines');
    expect(source?.detail).toContain(sha256Hex(SOURCE).slice(0, 12));
  });

  test('a blocker is a line with its own evidence, never a share', () => {
    const card = managementAnswers(signedOff, [entry()], null).answers.find((a) => a.id === 'decision')!;
    const blocking = card.figures.find((f) => f.key === 'blocking')!;
    // A count of named lines, and no percentage anywhere in the card.
    expect(Number(blocking.value)).toBeGreaterThan(0);
    for (const item of card.items) expect(item.detail).not.toMatch(/\d\s?%/);
    expect(blocking.coverage.sentence).toContain('each with its own line and evidence');
  });
});

/* ------------------------------------- 4. score, rule version and the history */

test.describe('the Clean Core Score, its rule version and its history', () => {
  test('no run, no score — and the reason instead of a number', () => {
    const trend = scoreTrend(bare, []);
    expect(trend.state).toBe('no-run');
    expect(trend.score).toBeNull();
    expect(trend.sentence).toContain('No signed run');

    const figure = figureOf(managementAnswers(bare, [], null), 'score', 'clean-core-score');
    expect(figure.value).toBeNull();
    expect(figure.absentReason).toBe('no signed run');
  });

  test('a run without all three version fields has no rule version to compare', () => {
    const incomplete = entry({ analyzerVersion: undefined });
    expect(ruleVersionLabel(incomplete)).toBeNull();
    const trend = scoreTrend(signedOff, [incomplete]);
    expect(trend.state).toBe('no-rule-version');
    expect(trend.points).toEqual([]);
    expect(trend.sentence).toContain('no complete rule version');
  });

  test('one run of a rule version is not a history, and no line is drawn', () => {
    const trend = scoreTrend(signedOff, [entry()]);
    expect(trend.state).toBe('single-run');
    expect(trend.points.length).toBe(1);
    expect(trend.sentence).toContain('There is no history');
    expect(trend.sentence).toContain('a line through one point would invent the second');
  });

  test('runs of another rule version are named as a break, never plotted', () => {
    const history = [
      entry({ runId: 'run-1', createdAt: '2026-09-01T10:00:00.000Z', cleanCoreScore: 62 }),
      entry({ runId: 'run-0', createdAt: '2026-08-01T10:00:00.000Z', cleanCoreScore: 40, ...V2 }),
      entry({ runId: 'run-x', createdAt: '2026-07-01T10:00:00.000Z', cleanCoreScore: 30, ...V2 }),
    ];
    const trend = scoreTrend(signedOff, history);

    expect(trend.points.map((p) => p.runId), 'a run of another rule version was plotted').toEqual([
      'run-1',
    ]);
    expect(trend.breaks).toEqual([{ ruleVersion: ruleVersionLabel(history[1]), runs: 2 }]);
    expect(trend.sentence).toContain('not drawn');
    expect(trend.sentence).toContain('a different rule is a different scale, not a development');
    // And the coverage of the figure says what was left out, by name.
    expect(trend.coverage.sentence).toBe(
      '1 of 3 runs on this project · 2 on another rule version',
    );
  });

  test('two runs of the SAME rule version are a history, in points and in time order', () => {
    const history = [
      entry({ runId: 'run-2', createdAt: '2026-09-10T10:00:00.000Z', cleanCoreScore: 74 }),
      entry({ runId: 'run-1', createdAt: '2026-09-01T10:00:00.000Z', cleanCoreScore: 62 }),
    ];
    const trend = scoreTrend({ ...signedOff, activeRunId: 'run-2' }, history);
    expect(trend.state).toBe('trend');
    expect(trend.points.map((p) => p.runId)).toEqual(['run-1', 'run-2']);
    expect(trend.sentence).toContain('62 → 74, up 12 points');
    // Points, not percent: the score is a grade, not a share of anything.
    expect(trend.sentence).not.toMatch(/%/);
  });

  test('a run on this rule version with no score is excluded by name, not silently', () => {
    const history = [
      entry({ runId: 'run-2', createdAt: '2026-09-10T10:00:00.000Z', cleanCoreScore: 74 }),
      entry({ runId: 'run-1', createdAt: '2026-09-01T10:00:00.000Z', cleanCoreScore: 101 }),
    ];
    const trend = scoreTrend({ ...signedOff, activeRunId: 'run-2' }, history);
    expect(trend.withoutScore, 'a score outside 0–100 is not a score').toBe(1);
    expect(trend.coverage.sentence).toContain('1 on this rule version with no score');
  });

  test('runs that could not be read are not an empty history', () => {
    const trend = scoreTrend(signedOff, null);
    expect(trend.state).toBe('unreadable');
    expect(trend.sentence).toContain('An empty chart would say there were none');
  });

  test('the score card says what the number is and what it is not', () => {
    const card = managementAnswers(signedOff, [entry()], null).answers.find((a) => a.id === 'score')!;
    const meaning = card.items.find((i) => i.key === 'meaning')!;
    expect(meaning.detail).toContain('not a compliance percentage');
    expect(meaning.detail).toContain('higher is better');
  });
});

/* ------------------------------------------------- 5. no portfolio, no model */

test.describe('the shape of the module', () => {
  test('it is pure: no React, no Firestore, no fetch, no model call', () => {
    const src = read('lib/management-answers.ts');
    const imports = src.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(imports.length, 'no import at all — is this the right file?').toBeGreaterThan(2);
    for (const line of imports) {
      expect(line, 'an answer of this view must be derivable without a browser').not.toMatch(
        /react|firebase|firestore|gemini/i,
      );
    }
    expect(src, 'the module reaches the network').not.toContain('fetch(');
  });

  test('it cannot see a second project', () => {
    const src = read('lib/management-answers.ts');
    // Not a style rule: a management view that could take a list of projects is
    // one refactor away from the portfolio the roadmap row excludes.
    expect(src).not.toMatch(/projects:\s*(readonly\s*)?Project\[\]/);
    expect(src).not.toMatch(/Project\[\]/);
  });
});

/* -------------------------------------------------------- 6. on the screen */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientDb = initializeFirestore(firebaseApp, {}, firebaseConfig.firestoreDatabaseId);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}
try {
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
} catch {
  /* already connected */
}

const PASSWORD = 'ManagementView123!';
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

test.describe('a project with no runs, in the Management view', () => {
  const ADMIN = `${unique('mgmt-admin')}@cleancore-test.io`;
  const BARE_ID = unique('mgmt-bare');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Management', lastName: 'Admin', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    // Staged source, no run, and therefore no `runs` subcollection at all.
    await adminSetDoc('projects', BARE_ID, {
      name: 'Nothing analysed yet', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_bare.\nWRITE 1.\n',
    });
  });

  test('it shows no score, no history and the reason for both', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, ADMIN);
    await page.goto(`/project/${BARE_ID}?view=management`, { waitUntil: 'domcontentloaded' });

    const view = page.locator('[data-management-view=""]');
    await expect(view, 'the Management answers never arrived').toBeVisible({ timeout: 60000 });

    await expect(page.locator('[data-management-headline]')).toContainText('No signed run');

    // The score: a word and its reason, never a number.
    const score = page.locator('[data-management-figure="clean-core-score"]');
    await expect(score.locator('[data-figure-absent]')).toHaveText('Not determined');
    await expect(score.locator('[data-figure-value]')).toHaveCount(0);
    await expect(score.locator('[data-figure-absent-reason]')).toHaveText('no signed run');

    // The history: not an empty chart, a sentence that says a history needs runs.
    const history = page.locator('[data-management-figure="history"]');
    await expect(history.locator('[data-figure-absent-reason]')).toContainText(
      'No signed run, so there is no Clean Core Score',
    );

    // Every figure on the screen carries its coverage — the promise 3.0.10 has
    // to be able to draw, and the one it cannot add afterwards.
    const figures = page.locator('[data-management-figure]');
    const covers = page.locator('[data-management-figure] [data-figure-coverage]');
    await expect(figures).not.toHaveCount(0);
    expect(await covers.count()).toBe(await figures.count());

    // And no portfolio: this screen compares this project with nothing.
    await expect(view).toContainText('No comparison with any other');
  });
});
