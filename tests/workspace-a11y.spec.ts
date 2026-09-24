import { test, expect, type Page } from '@playwright/test';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import firebaseConfig from '../firebase-config.json';

/**
 * Roadmap 3.0.4 — the accessibility base, checked on the rendered workspace.
 *
 * `DESIGN.md` §8 names what has to be proven on the page rather than in the
 * source: the heading outline `h1` → `h2` → `h3` per view, every live region
 * saying at most one thing per event, and the print image without its bars.
 * The roadmap line adds the keyboard, `forced-colors`, the phone in breakpoint
 * S with the order of §2.9, and "Keyboard shortcuts" in the Help menu.
 *
 * Every test here opens the real workspace of a seeded project, signed in as
 * an administrator with the preview switch on — the only account that has the
 * page today (roadmap 3.0.1 opens it). Needs the dev server and the emulators.
 */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'WorkspaceA11y123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A source with one decision, so the first look has a reveal line and a question. */
const BRANCHING = [
  'REPORT z_a11y_demo.',
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

const ADMIN = `${unique('a11y-admin')}@cleancore-test.io`;
const PROJECT_ID = unique('a11y-case');

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.click('a:has-text("Get Free Access"), button:has-text("Get Free Access")');
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', ADMIN);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]:has-text("Sign In")');
  await page.waitForTimeout(4000);
}

/** Opens the workspace in a view and waits until the first look has settled. */
async function openWorkspace(page: Page, view: 'business' | 'it' | 'management'): Promise<void> {
  await page.goto(`/project/${PROJECT_ID}?view=${view}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`[data-workspace-shell="${view}"]`)).toBeVisible({ timeout: 60000 });
  await expect(page.locator('[data-first-look="end-state"], [data-first-look="complete"]')).toBeVisible({
    timeout: 60000,
  });
}

/** The heading levels inside the page content, in document order. */
async function outline(page: Page): Promise<{ level: number; text: string }[]> {
  return page.locator('#main-content').evaluate((main) =>
    [...main.querySelectorAll('h1, h2, h3, h4, h5, h6')]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({ level: Number(el.tagName.slice(1)), text: (el.textContent || '').trim().slice(0, 40) })),
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('the workspace without a mouse, without sight, on a phone and on paper (roadmap 3.0.4)', () => {
  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, ADMIN, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Access', lastName: 'Ible', email: ADMIN,
      tier: 'pilot', status: 'approved', isAdmin: true, workspaceShell: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Order limit check', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: BRANCHING,
    });
  });

  test('the heading outline starts at h1 and never skips a level — in every view (§2.3, §8)', async ({ page }) => {
    test.setTimeout(300 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);

    for (const view of ['business', 'it', 'management'] as const) {
      await openWorkspace(page, view);
      // Management and IT load their answers from their own routes.
      await page.waitForTimeout(3000);
      const levels = await outline(page);
      expect(levels.length, `${view}: no headings`).toBeGreaterThan(3);
      expect(levels[0].level, `${view}: the page does not start at h1`).toBe(1);
      expect(levels.filter((h) => h.level === 1), `${view}: more than one h1`).toHaveLength(1);
      const skips: string[] = [];
      for (let i = 1; i < levels.length; i++) {
        if (levels[i].level > levels[i - 1].level + 1) {
          skips.push(`h${levels[i - 1].level} "${levels[i - 1].text}" → h${levels[i].level} "${levels[i].text}"`);
        }
      }
      expect(skips, `${view}: heading levels skipped:\n${skips.join('\n')}`).toEqual([]);
    }
  });

  test('every live region says one thing per event — the build-up announces the newest stage only (§2.8, §8)', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);

    // Record every text each polite region carries, from the first paint on.
    await page.addInitScript(() => {
      const seen: string[][] = [];
      (window as unknown as { __live: string[][] }).__live = seen;
      const watch = () => {
        const regions = [...document.querySelectorAll('[aria-live]')];
        regions.forEach((region, i) => {
          const text = (region.textContent || '').trim();
          seen[i] ||= [];
          if (text && seen[i][seen[i].length - 1] !== text) seen[i].push(text);
        });
      };
      new MutationObserver(watch).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto(`/project/${PROJECT_ID}?view=business&first=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-first-look="complete"], [data-first-look="end-state"]')).toBeVisible({
      timeout: 60000,
    });

    const live = page.locator('[data-first-look-live]');
    await expect(live, 'the first look has one live region, not one per branch').toHaveCount(1);
    await expect(live).toHaveAttribute('aria-live', 'polite');

    // One stage per announcement: the text never names two stage labels at once.
    const labels = ['Code read', 'Process recognised', 'In business language', 'This is your process'];
    const final = (await live.textContent()) || '';
    const named = labels.filter((label) => final.includes(`${label}:`));
    expect(named.length, `the region repeats earlier stages: "${final}"`).toBeLessThanOrEqual(1);

    const history = await page.evaluate(() => (window as unknown as { __live: string[][] }).__live);
    for (const texts of history) {
      for (const text of texts) {
        const inOne = labels.filter((label) => text.includes(`${label}:`));
        expect(inOne.length, `one announcement carried ${inOne.length} stages: "${text}"`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('the keyboard path: skip link, view switch with arrows, menus close on Escape and give the focus back (§1.6)', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);
    await openWorkspace(page, 'business');

    // The first Tab stop is the skip link, and it lands in the content.
    // Nothing has been clicked since the navigation, so Tab starts at the top.
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-skip-link]')).toBeFocused();
    await expect(page.locator('[data-skip-link]')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    // The focus ring is drawn on a focused control (§1.6): 2px, solid.
    const details = page.locator('[data-workspace-details-toggle]');
    await details.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await details.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(ring.style).toBe('solid');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);

    // The view switch is one tab stop; the arrows move the view.
    const selected = page.locator('[data-workspace-shell] [role="radiogroup"][aria-label="View"] [aria-checked="true"]');
    await selected.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/view=it/);
    await expect(page.locator('[data-workspace-shell="it"]')).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/view=business/);

    // "Tools" is a disclosure: Escape closes it and returns the focus.
    const tools = page.locator('[data-workspace-tools="menu"] button[aria-expanded]');
    await tools.focus();
    await page.keyboard.press('Enter');
    await expect(tools).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-workspace-tools-panel]')).toBeVisible();
    expect(await page.locator('[data-workspace-tools-panel][role="menu"]').count(), 'a menu role without menuitems').toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-workspace-tools-panel]')).toHaveCount(0);
    await expect(tools).toBeFocused();

    // The account menu does the same.
    const account = page.locator('[data-account-menu]');
    await expect(account).toHaveAttribute('aria-label', 'Account menu');
    await account.focus();
    await page.keyboard.press('Enter');
    await expect(account).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(account).toHaveAttribute('aria-expanded', 'false');
    await expect(account).toBeFocused();
  });

  test('"Keyboard shortcuts" in the Help menu — and on "?" — is a modal that gives the focus back (§5.9 item 12)', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);
    await openWorkspace(page, 'business');

    const help = page.locator('[data-help-menu-trigger]');
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-help-shortcuts-open]').click();

    const dialog = page.locator('dialog[data-keyboard-shortcuts]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Keyboard shortcuts');
    const modal = await dialog.evaluate((el) => el.matches(':modal'));
    expect(modal, 'the list opens as a modal dialog').toBe(true);
    const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(inside, 'the focus stayed behind the dialog').toBe(true);
    // The search the workspace really has is listed; a key nothing handles is not.
    await expect(dialog).toContainText('Search this project');
    await expect(dialog).not.toContainText('Minimap');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();

    // "?" from the page opens the same list; not while typing.
    await page.locator('#main-content').focus();
    await page.keyboard.press('Shift+Slash');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('forced-colors: the chosen view stays chosen and the focus ring stays visible (§1.1)', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({ forcedColors: 'active', viewport: { width: 1440, height: 1200 } });
    const page = await context.newPage();
    await signIn(page);
    await openWorkspace(page, 'business');

    const segments = await page
      .locator('[data-workspace-shell] [role="radiogroup"][aria-label="View"] [role="radio"]')
      .evaluateAll((els) =>
        els.map((el) => ({
          on: el.getAttribute('aria-checked') === 'true',
          background: getComputedStyle(el).backgroundColor,
        })),
      );
    const on = segments.filter((s) => s.on);
    const off = segments.filter((s) => !s.on);
    expect(on).toHaveLength(1);
    for (const segment of off) {
      expect(segment.background, 'the chosen view looks like the others without colour').not.toBe(on[0].background);
    }

    const toggle = page.locator('[data-workspace-details-toggle]');
    await toggle.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await toggle.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth };
    });
    expect(ring.style).toBe('solid');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);

    // The provenance chips keep their three forms (§4) — the word stays.
    const chips = await page.locator('[data-workspace-shell] [data-provenance]').evaluateAll((els) =>
      els.map((el) => (el.textContent || '').trim()),
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const word of chips) expect(word.length).toBeGreaterThan(0);

    await context.close();
  });

  test('a phone in breakpoint S: the order of §2.9, the toolbar as a menu, 44px targets, no sideways scroll', async ({
    browser,
  }) => {
    test.setTimeout(240 * 1000);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await signIn(page);
    await openWorkspace(page, 'business');

    // Process and reveal line → Not determined → Next step, in the DOM and on
    // the screen — so the focus order is the reading order (§1.6).
    const order = await page.evaluate(() => {
      const pick = (selector: string) => document.querySelector(selector);
      const blocks = [
        pick('[data-first-look]'),
        pick('#not-determined'),
        pick('[data-next-step]'),
        pick('[data-workspace-layer-section]'),
      ];
      const tops = blocks.map((el) => (el ? el.getBoundingClientRect().top + window.scrollY : -1));
      const dom = blocks.every((el, i) =>
        i === 0 || (blocks[i - 1] && el && blocks[i - 1]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
      return { tops, dom: Boolean(dom) };
    });
    expect(order.tops.every((t) => t >= 0), 'a block of §2.9 is missing').toBe(true);
    expect(order.dom, 'the DOM order is not the §2.9 order').toBe(true);
    for (let i = 1; i < order.tops.length; i++) {
      expect(order.tops[i], `block ${i} stands above block ${i - 1}`).toBeGreaterThan(order.tops[i - 1]);
    }

    // Nothing in the workspace is wider than a 390px screen.
    const overflow = await page.locator('[data-workspace-shell]').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, 'the workspace scrolls sideways on a phone').toBeLessThanOrEqual(1);

    // Touch targets: the view switch and every button of the workspace are 44px high.
    const heights = await page
      .locator('[data-workspace-shell] [role="radio"], [data-workspace-shell] [data-cc-button]')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ text: (el.textContent || '').trim().slice(0, 24), h: el.getBoundingClientRect().height })),
      );
    expect(heights.length).toBeGreaterThan(3);
    for (const target of heights) expect(target.h, `"${target.text}" is under 44px on touch`).toBeGreaterThanOrEqual(44);

    // In IT the toolbar is open on a wide screen — on S it is still a menu.
    await openWorkspace(page, 'it');
    await expect(page.locator('[data-workspace-tools="open"]')).toBeHidden();
    await expect(page.locator('[data-workspace-tools="menu"]')).toBeVisible();

    await context.close();
  });

  test('"Why?" is one 44px target on a phone (WG-03, §2.10)', async ({ browser }) => {
    test.setTimeout(240 * 1000);
    const admin: GalleryAdmin = await createGalleryAdmin('a11ywhy');
    const context = await browser.newContext({ isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await openGallery(page, admin, 390);

    const why = page.locator('[data-cc-why]').first();
    await why.scrollIntoViewIfNeeded();
    const box = await why.boundingBox();
    expect(box, 'no "Why?" in the gallery').not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(why).toHaveAttribute('aria-label', /^Why/);

    await context.close();
  });

  test('on paper: no bars, no background, cards outlined, chips with their word, links with their target (§7.1)', async ({
    page,
  }) => {
    test.setTimeout(240 * 1000);
    await page.setViewportSize({ width: 1440, height: 1200 });
    await signIn(page);
    await openWorkspace(page, 'it');

    await page.emulateMedia({ media: 'print' });

    // No tool or footer bars, no shell bar, no layer bar, no search.
    for (const selector of [
      'header',
      'footer',
      '[data-workspace-tools="open"]',
      '[data-workspace-tools="menu"]',
      '[data-workspace-layers]',
      '[data-command-search-trigger]',
      '[data-help-menu]',
    ]) {
      const visible = await page.locator(selector).evaluateAll((els) =>
        els.filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed')
          .filter((el) => getComputedStyle(el).display !== 'none').length,
      );
      expect(visible, `${selector} prints`).toBe(0);
    }

    // No background: the page is white, cards carry a 1px rule instead of a shadow.
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(body).toBe('rgb(255, 255, 255)');
    const cards = await page.locator('[data-workspace-shell] .cc-card').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, border: s.borderTopWidth, breakInside: s.breakInside };
      }),
    );
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.shadow).toBe('none');
      expect(card.border).toBe('1px');
      expect(card.breakInside).toBe('avoid');
    }

    // A chip prints its word and its icon, on white.
    const chips = await page.locator('[data-workspace-shell] [data-provenance]').evaluateAll((els) =>
      els.map((el) => ({
        word: (el.querySelector('[data-cc-provenance-label]')?.textContent || '').trim(),
        icons: el.querySelectorAll('svg').length,
        background: getComputedStyle(el).backgroundColor,
      })),
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip.word.length).toBeGreaterThan(0);
      expect(chip.icons).toBeGreaterThan(0);
      expect(chip.background).toBe('rgb(255, 255, 255)');
    }

    // A reference link names its target in brackets; an action shaped as a
    // button ("Open Analyze") does not — it is not a reference on paper.
    const pseudo = await page.evaluate(() => {
      const after = (el: Element | null) => (el ? getComputedStyle(el, '::after').content : 'missing');
      return {
        reference: after(document.querySelector('[data-workspace-shell] a[href]:not([data-cc-button]):not([href^="#"])')),
        action: after(document.querySelector('[data-workspace-shell] a[data-cc-button]')),
      };
    });
    expect(pseudo.reference, 'a printed reference link does not name its target').not.toBe('none');
    if (pseudo.action !== 'missing') expect(pseudo.action).toBe('none');
    await page.emulateMedia({ media: 'screen' });
  });
});
