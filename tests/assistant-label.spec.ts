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
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
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
  });
});
