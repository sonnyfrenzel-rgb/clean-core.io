import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { WORKSPACE_VIEWS, VIEW_QUESTIONS } from '../lib/workspace-model';
import {
  STAGE_DWELL_MS,
  STAGE_EXAMPLE_FILE,
  travellingFact,
} from '../lib/three-views-stage';

/**
 * The three views in motion — roadmap 6.1, `DESIGN.md` §6.1.1.
 *
 * Two halves, and the second is the one that could not be faked by a source
 * check: the stage on the page really runs once, really stops, and really keeps
 * the anchor in place while everything around it changes.
 *
 * The first half is about honesty. §6.1.1 sketches a Management column reading
 * *„Rebuild — part of decision DEC-1"*, and there is no DEC-1 in the example —
 * so the test that matters most here is the one that fails if anybody ever types
 * it in. The stage sits on the one page whose second difference line promises
 * the product *"never passes an assumption off as a fact"*; a staged fact here
 * would cost more than the stage is worth.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
const exampleSource = () => read(path.join('public', 'starter-examples', STAGE_EXAMPLE_FILE));

test.describe('the fact is derived from the example, not written beside it', () => {
  test('the engine reads the vendor check out of the example, with its own anchors', () => {
    const source = exampleSource();
    const fact = travellingFact(source);
    expect(fact, 'the example carries no check against a table of its own any more').not.toBeNull();
    if (!fact) return;

    // The program names itself; nothing here was told what it is called.
    expect(fact.program).toBe('Z_MM_PO_APPROVAL');
    expect(fact.table).toBe('ZMM_VEND_BLOCK');

    // The anchor is a range out of the skeleton, and it points at lines that
    // really hold this check. Pinning the numbers is deliberate: the anchor is
    // the whole claim of this stage, and an anchor that quietly moved onto
    // another routine would still render perfectly.
    expect(fact.anchor).toMatch(/^L\d+-\d+$/);
    const [from, to] = fact.anchor.slice(1).split('-').map(Number);
    const lines = source.split(/\r?\n/).slice(from - 1, to).join('\n');
    expect(lines.toUpperCase()).toContain('ZMM_VEND_BLOCK');
    expect(lines.toUpperCase()).toContain('SELECT');
  });

  test('three panels, in the one order, each with its own question', () => {
    const fact = travellingFact(exampleSource());
    expect(fact).not.toBeNull();
    if (!fact) return;
    expect(fact.panels.map((p) => p.view)).toEqual([...WORKSPACE_VIEWS]);
    for (const panel of fact.panels) {
      // The same sentence the workspace prints under its own switcher (§2.3) —
      // read from the same module, never a second wording of the same question.
      expect(panel.question).toBe(VIEW_QUESTIONS[panel.view]);
      expect(panel.lines.length).toBeGreaterThan(0);
    }
    expect(fact.panels[0].options, 'Business offers Keep · Change · Drop (§6.1.1)').toEqual([
      'Keep',
      'Change',
      'Drop',
    ]);
  });

  test('the Business line quotes the program, and the quote is in the program', () => {
    const source = exampleSource();
    const fact = travellingFact(source);
    if (!fact) throw new Error('no fact');
    const consequence = fact.panels[0].lines.find((l) => l.key === 'consequence');
    expect(consequence).toBeDefined();
    const quoted = /“([^”]+)”/.exec(consequence?.text ?? '');
    expect(quoted, 'the Business panel states a consequence without quoting the source').not.toBeNull();
    expect(source).toContain(`'${quoted?.[1]}'`);
  });

  test('nothing is decided, nothing is graded, and no DEC-1 is invented', () => {
    const fact = travellingFact(exampleSource());
    if (!fact) throw new Error('no fact');
    const all = fact.panels.flatMap((p) => p.lines);
    const text = all.map((l) => l.text).join(' ');

    // The four buckets of §5.6 put an object with no catalog entry under
    // *not assigned*. Every one of these words on this stage would be a claim
    // about an example nobody has decided anything about.
    for (const word of ['Rebuild', 'Retire', 'DEC-1', 'Blocked by SAP']) {
      expect(text, `the stage claims "${word}" about an undecided example`).not.toContain(word);
    }
    // A customer table has no SAP catalog entry, so it carries no level letter.
    expect(text).not.toMatch(/\blevel [ABCD]\b/i);

    // Management's whole answer here is an absence, and it says so with the
    // chip rather than in prose.
    const management = fact.panels.find((p) => p.view === 'management');
    expect(management?.lines.map((l) => l.provenance)).toEqual(
      management?.lines.map(() => 'not-determined'),
    );
    // And the IT panel names the absence §6.1.1 asks for word for word.
    const it = fact.panels.find((p) => p.view === 'it');
    expect(it?.lines.map((l) => l.text).join(' ')).toContain(
      'estimated from the code, no SAP catalog entry',
    );
  });

  test('a source with no check of its own gets no stage at all', () => {
    // Not a placeholder, not an empty panel: `null`, and the page renders
    // nothing. The other seven examples are the fixture — at least one of them
    // has no `SELECT` on a Z-table that the program then branches on.
    expect(travellingFact('REPORT z_nothing.\nWRITE 1.\n')).toBeNull();
  });

  test('the module is pure — no React, no Firestore, no model', () => {
    const src = read('lib/three-views-stage.ts');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['react', 'firebase', 'gemini', 'fetch(']) {
      expect(code.toLowerCase(), `lib/three-views-stage.ts reaches for ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });
});

/* ------------------------------------------------------------- on the page */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'ThreeViews123!';
const ADMIN = `three-views-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@cleancore-test.io`;

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** Part 1 is folded after the first visit — this is a fresh browser each time. */
async function openStage(page: Page): Promise<void> {
  await page.goto('/admin/new-project', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-cc-new-project]')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-three-views-stage]')).toBeVisible({ timeout: 30000 });
}

test.describe('the stage on "New project"', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Three', lastName: 'Views', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('the switcher is the workspace one: Business, IT, Management — Business selected', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);
    await openStage(page);

    const segments = page.locator(
      '[data-three-views-stage] [data-cc-segmented][aria-label="View"] button[role="radio"]',
    );
    expect(await segments.evaluateAll((els) => els.map((el) => el.textContent?.trim()))).toEqual([
      'Business',
      'IT',
      'Management',
    ]);
    // ADR-002: the case opens in Business, here as in the workspace.
    await expect(page.locator('[data-three-views-panel]')).toHaveAttribute(
      'data-three-views-panel',
      'business',
    );
  });

  test('one pass through all three, then it stops on Business with Replay', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);
    await openStage(page);

    /**
     * A tight sample that ends when the thing it watches settles, not on a
     * timeout — the lesson of the two specs that waited for a window on
     * 2026-09-16. The stage says when it has stopped, so a miss ends in an
     * assertion about what was seen rather than in twenty silent seconds.
     */
    const seen = new Set<string>();
    const deadline = Date.now() + 4 * STAGE_DWELL_MS + 10000;
    let stopped = false;
    while (Date.now() < deadline) {
      const state = await page.locator('[data-three-views-stage]').getAttribute('data-three-views-auto');
      const shown = await page.locator('[data-three-views-panel]').getAttribute('data-three-views-panel');
      if (shown) seen.add(shown);
      if (state === 'stopped') {
        stopped = true;
        break;
      }
      await page.waitForTimeout(120);
    }

    expect(stopped, 'the stage never stopped — §6.1.1 forbids an endless loop').toBe(true);
    expect([...seen].sort(), 'the pass did not reach all three views').toEqual([
      'business',
      'it',
      'management',
    ]);
    // It comes to rest where it started, and the only way back in is Replay.
    await expect(page.locator('[data-three-views-panel]')).toHaveAttribute(
      'data-three-views-panel',
      'business',
    );
    await expect(page.locator('[data-three-views-replay]')).toBeVisible();
  });

  test('a click takes over, and the anchor does not move with it', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);
    await openStage(page);

    const anchor = page.locator('[data-three-views-anchor-line]');
    const before = (await anchor.textContent())?.trim();
    expect(before).toMatch(/^L\d+/);

    await page
      .locator('[data-three-views-stage] [data-cc-segmented][aria-label="View"] button[role="radio"]', {
        hasText: 'Management',
      })
      .click();

    await expect(page.locator('[data-three-views-panel]')).toHaveAttribute(
      'data-three-views-panel',
      'management',
    );
    await expect(page.locator('[data-three-views-stage]')).toHaveAttribute(
      'data-three-views-auto',
      'stopped',
    );

    // "Der Anker bleibt fest an seinem Platz" — the sign that this is the same
    // fact. It has to survive a dwell, too: if the automatic change were still
    // running underneath, the panel would move on and the anchor with it.
    await page.waitForTimeout(STAGE_DWELL_MS + 800);
    await expect(page.locator('[data-three-views-panel]')).toHaveAttribute(
      'data-three-views-panel',
      'management',
    );
    expect((await anchor.textContent())?.trim()).toBe(before);
  });

  test('reduced motion stands still: three columns, no switcher, nothing running', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openStage(page);

    await expect(page.locator('[data-three-views-stage]')).toHaveAttribute(
      'data-three-views-stage',
      'columns',
    );
    await expect(page.locator('[data-three-views-stage]')).toHaveAttribute(
      'data-three-views-auto',
      'stopped',
    );
    await expect(page.locator('[data-three-views-panel]')).toHaveCount(3);
    await expect(
      page.locator('[data-three-views-stage] [data-cc-segmented][aria-label="View"]'),
    ).toHaveCount(0);
    // And it stays still: a dwell later, still three columns.
    await page.waitForTimeout(STAGE_DWELL_MS + 500);
    await expect(page.locator('[data-three-views-panel]')).toHaveCount(3);
  });

  test('"Skip intro" is on the stage and folds part 1 away', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);
    await openStage(page);
    await expect(page.locator('[data-three-views-skip]')).toBeVisible();
    await page.locator('[data-three-views-skip]').click();
    await expect(page.locator('[data-new-project-intro]')).toHaveAttribute(
      'data-new-project-intro',
      'folded',
    );
    await expect(page.locator('[data-three-views-stage]')).toHaveCount(0);
  });

  test('the stage calls no model and asks nothing of the network', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page);

    const calls: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (/\/api\/gemini|generativelanguage\.googleapis\.com|\/starter-examples\//.test(url)) {
        calls.push(`${route.request().method()} ${url}`);
      }
      return route.continue();
    });

    await openStage(page);
    // A whole pass, and not one request: the reading happened on the server,
    // and the panels are props.
    await page.waitForTimeout(3 * STAGE_DWELL_MS + 1500);
    expect(calls, `the stage reached the network: ${JSON.stringify(calls)}`).toEqual([]);
  });
});
