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
import { TERMS_VERSION } from '../lib/constants';
import { signInViaLanding } from './helpers/sign-in';

/**
 * The name on the button is the name of the thing that opens.
 *
 * Roadmap 6.8 renamed the assistant inside a project to „Ask this case" and
 * left the shell alone: the header and the account menu still said „Ask AI",
 * which `DESIGN.md` §3.1 forbids by name, and both opened a panel that calls
 * itself something else. The fix is not one word everywhere. There is one
 * assistant (ADR-043) with two boundaries, and `components/GlossaryChatbot.tsx`
 * picks between them from the path — `/project/<id>` gives it a project and it
 * then answers only from that project's evidence; anywhere else it answers
 * product and SAP questions. „Ask this case" on the workspace overview would
 * name a case that is not there, so the trigger travels with the boundary.
 *
 * Which is why the browser half of this spec does not compare two strings: it
 * clicks the trigger and reads the panel that appears, in both places. A label
 * that agrees with a constant proves nothing; a label that agrees with the
 * panel is the claim.
 */
const ROOT = path.resolve(__dirname, '..');

/* ================================================ the word that may not appear */

test.describe('the forbidden label, in the source', () => {
  /** Everything that ships to a browser from the authenticated shell outward. */
  const DIRS = ['app', 'components'];

  function sources(): { rel: string; text: string }[] {
    const out: { rel: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;
        out.push({
          rel: path.relative(ROOT, full).replace(/\\/g, '/'),
          text: fs.readFileSync(full, 'utf8'),
        });
      }
    };
    for (const dir of DIRS) walk(path.resolve(ROOT, dir));
    return out;
  }

  test('no interface text says "Ask AI" any more', () => {
    const files = sources();
    expect(files.length, 'nothing scanned — the check would be vacuous').toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const { rel, text } of files) {
      // Comments are read out, and only comments: the rule is about what a
      // reader sees. Several files explain the rename and have to be able to
      // quote the wording they replaced — including this spec's own subject,
      // `app/(app)/layout.tsx`.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        if (/Ask\s+AI/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
        }
      });
    }

    expect(
      offenders,
      `"Ask AI" is called "Ask this case" in a project and "Ask the assistant" outside it (DESIGN.md §3.1):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/* ============================================== the label against the real panel */

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const clientAuth = getAuth(app);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'AssistantLabel123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SOURCE = [
  'REPORT z_assistant_label_demo.',
  '',
  'DATA lv_amount TYPE p DECIMALS 2.',
  '',
  'START-OF-SELECTION.',
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

/**
 * Clicks a trigger until the panel is really open.
 *
 * The triggers live in the layout and paint before the page under them has
 * hydrated, so a single click can land on an element that is not listening
 * yet. `toPass` re-runs the whole block, and the assertion is its last line:
 * a panel that never opens fails this spec rather than skipping it. Only the
 * click is conditional — this opens a toggle-shaped assistant, and a second
 * click on an open panel would close it again.
 */
async function openFrom(page: Page, trigger: ReturnType<Page['locator']>): Promise<void> {
  await expect(trigger).toBeVisible({ timeout: 90000 });
  const panel = page.locator('[data-chatbot-scope]');
  await expect(async () => {
    const alreadyOpen = await panel.isVisible().catch(() => false);
    if (!alreadyOpen) await trigger.click({ timeout: 15000 });
    await expect(panel, 'the assistant panel never opened').toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60000 });
}

async function signIn(page: Page, email: string): Promise<void> {
  await signInViaLanding(page, email, PASSWORD);
}

/**
 * Owner decision 30.09.2026 (QA 795c0e739916): the assistant sends only the
 * current question, never the conversation so far. The panel has to say so
 * before a follow-up is typed, and say it to the screen reader too — the note
 * is the input's description, not a line floating near it.
 */
async function expectIndependentQuestionNote(page: Page): Promise<void> {
  const note = page.locator('[data-chatbot-independent]');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Each question is answered on its own');
  await expect(note).toContainText('include the context you need');
  const input = page.getByLabel('Your question');
  const describedBy = (await input.getAttribute('aria-describedby')) ?? '';
  const noteText = (await note.innerText()).trim();
  const descriptions = await Promise.all(
    describedBy.split(/\s+/).filter(Boolean).map((id) => page.locator(`[id="${id}"]`).innerText()),
  );
  expect(
    descriptions.map((d) => d.trim()),
    'the input is not described by the note that its question is answered on its own',
  ).toContain(noteText);
}

test.describe('what the header button promises, and what opens', () => {
  test('outside a project it offers the assistant, and the assistant is what opens', async ({ page }) => {
    test.setTimeout(120 * 1000);

    // `/knowledge` is inside the authenticated shell and reachable signed out,
    // so the header is real and the path is provably not a project path.
    await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });

    const trigger = page.locator('[data-assistant-trigger="header"]');
    await expect(trigger).toBeVisible({ timeout: 90000 });
    await expect(trigger, 'the shell still advertises "Ask AI"').toContainText('Ask the assistant');
    await expect(trigger, 'a case is promised where there is no case').not.toContainText('Ask this case');

    await openFrom(page, trigger);

    // What actually opened: the general assistant, not the case one.
    await expect(page.locator('[data-chatbot-title]')).toHaveText('SAP Modernization Assistant');
    await expect(page.locator('[data-chatbot-scope]')).not.toContainText('evidence of this project');
    await expectIndependentQuestionNote(page);
  });
});

test.describe('and inside a project', () => {
  const OWNER = `${unique('assistant-label')}@cleancore-test.io`;
  const LIVE_PROJECT = unique('assistant-label-project');

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Assistant', lastName: 'Label', email: OWNER,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', LIVE_PROJECT, {
      name: 'Emergency purchase approval', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: SOURCE,
    });
  });

  test('the same button offers the case, and the case-bound assistant opens', async ({ page }) => {
    test.setTimeout(240 * 1000);

    await signIn(page, OWNER);
    await page.goto(`/project/${LIVE_PROJECT}/analyze`, { waitUntil: 'domcontentloaded' });

    const trigger = page.locator('[data-assistant-trigger="header"]');
    await expect(trigger).toBeVisible({ timeout: 90000 });
    await expect(trigger, 'the header does not follow the boundary into a project').toContainText('Ask this case');

    await openFrom(page, trigger);

    // The panel names the same thing the button did, and states the boundary
    // that makes the name true.
    await expect(page.locator('[data-chatbot-title]')).toHaveText('Ask this case');
    await expect(page.locator('[data-chatbot-scope]')).toContainText('only from the evidence of this project');
    await expectIndependentQuestionNote(page);
  });
});

test.describe('Escape hands the focus back to what opened the panel', () => {
  /**
   * QA review of 60b94e108964 (39bca17901ef). Escape used to focus the floating
   * toggle. With the desktop toggle switched off in the profile, that toggle is
   * `md:hidden` the moment the panel closes, so a reader who opened the panel
   * from the header was left with the focus on the body.
   */
  const OWNER = `${unique('assistant-focus')}@cleancore-test.io`;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Assistant', lastName: 'Focus', email: OWNER,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: new Date(),
      desktopChatbotEnabled: false,
    });
  });

  test('opened from the header with the desktop toggle off, Escape returns to the header button', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1280, height: 900 });

    await signIn(page, OWNER);
    await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });

    const trigger = page.locator('[data-assistant-trigger="header"]');
    await openFrom(page, trigger);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-chatbot-scope]')).toBeHidden();
    // The premise: the floating toggle is not there to take the focus.
    await expect(page.locator('[data-chatbot-toggle]')).toBeHidden();
    await expect(trigger, 'the focus fell on the body instead of the button that opened the panel').toBeFocused();
  });
});

test.describe('one entry per width (D.8, Sonny 30.09.2026)', () => {
  /**
   * The shell bar carries the assistant from `sm` up; the floating button is
   * off there unless the reader saved it on, and it is the way in on a phone,
   * where the shell bar has no room for the header button. Counted on the
   * visible entries rather than asserted on one element, so a third entry
   * appearing anywhere turns this red.
   */
  const DEFAULT_OWNER = `${unique('assistant-entry')}@cleancore-test.io`;
  const OPTED_IN = `${unique('assistant-entry-on')}@cleancore-test.io`;
  const ENTRIES = '[data-assistant-trigger="header"], [data-chatbot-toggle]';

  const seed = async (email: string, extra: Record<string, unknown>) => {
    const cred = await createUserWithEmailAndPassword(clientAuth, email, PASSWORD);
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Assistant', lastName: 'Entry', email,
      tier: 'pilot', status: 'approved',
      transformationsUsed: 0, transformationsLimit: 5, createdAt: new Date(),
      termsVersionAccepted: TERMS_VERSION, termsAcceptedAt: new Date(),
      ...extra,
    });
  };

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    // No `desktopChatbotEnabled` at all: the profile of everyone who never saved it.
    await seed(DEFAULT_OWNER, {});
    await seed(OPTED_IN, { desktopChatbotEnabled: true });
  });

  async function visibleEntries(page: Page): Promise<string[]> {
    return page.locator(ENTRIES).evaluateAll((els) =>
      els
        .filter((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => (el.hasAttribute('data-chatbot-toggle') ? 'floating' : 'header')),
    );
  }

  test('a default profile has exactly one entry at 1280 px (the header) and the floating one at 390 px', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, DEFAULT_OWNER);
    await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-assistant-trigger="header"]')).toBeVisible({ timeout: 90000 });
    // Wait for the profile to land, so "hidden" is not just "not loaded yet".
    await expect(page.locator('[data-account-menu]')).not.toHaveText('', { timeout: 60000 });
    await expect.poll(() => visibleEntries(page), { timeout: 30000 }).toEqual(['header']);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => visibleEntries(page), { timeout: 30000 }).toEqual(['floating']);
    await openFrom(page, page.locator('[data-chatbot-toggle]'));
  });

  test('a saved "on" keeps the floating button on desktop', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, OPTED_IN);
    await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-chatbot-toggle]')).toBeVisible({ timeout: 90000 });
    await openFrom(page, page.locator('[data-chatbot-toggle]'));
  });
});
