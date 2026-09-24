import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { CC_MESSAGES } from '../lib/cc-messages';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';

/**
 * The design system renders itself the same way every time.
 *
 * Built the way `tests/workflow-style-guard.spec.ts` is built, for the reason
 * given there: a source guard can be satisfied by a component that quietly
 * accepts a `className` override, and computed style cannot. So the source half
 * of this file checks that the override does not exist, and the rendered half
 * measures what the browser actually painted.
 *
 * What it is holding in place, stated as numbers rather than taste: **four**
 * button styles (the product had 78), **one** card-title style, type never
 * below 11px, one modal at a time with the page behind it inert, and every
 * visible string of a new component coming from the message catalogue rather
 * than from the middle of a JSX tree.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

function componentSources(): { rel: string; text: string }[] {
  const dir = path.resolve(ROOT, 'components/cc');
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(tsx|ts)$/.test(name))
    .map((name) => ({
      rel: `components/cc/${name}`,
      text: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

test.describe('the components cannot be overridden from outside', () => {
  test('no component in the design system accepts a className', () => {
    // A top-level member of an exported props type, at two-space indent. Not
    // `className` wherever it appears: `CcField` *hands one out* to its render
    // prop, and the icon components of lucide declare one — neither is a way in
    // from outside, and a guard that cannot tell the two apart gets relaxed.
    const offenders: string[] = [];
    for (const { rel, text } of componentSources()) {
      for (const block of text.matchAll(/export interface \w+Props[^{]*\{([\s\S]*?)\n\}/g)) {
        if (/^ {2}className\s*\??\s*:/m.test(block[1])) offenders.push(rel);
      }
      // An inline prop literal on the component itself.
      for (const block of text.matchAll(/export default function \w+\([\s\S]*?\}:\s*\{([\s\S]*?)\n\}\)/g)) {
        if (/^ {2}className\s*\??\s*:/m.test(block[1])) offenders.push(rel);
      }
    }
    expect(
      offenders,
      `these take a className, which is the hole every style guard leaks through:\n${offenders.join('\n')}`,
    ).toEqual([]);

    // And the two that extend the DOM's own attributes have to say so.
    for (const rel of ['components/cc/Button.tsx', 'components/cc/IconButton.tsx']) {
      expect(read(rel), `${rel} spreads HTML attributes without omitting className`).toMatch(
        /Omit<[^,]*,\s*'className'/,
      );
    }
  });

  test('the four button variants are declared in one place', () => {
    const src = read('components/cc/Button.tsx');
    const variants = /export type CcButtonVariant =([^;]+);/.exec(src);
    expect(variants, 'CcButtonVariant is gone').not.toBeNull();
    const names = [...variants![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(names.sort(), 'DESIGN.md §1.5 says four, and names them').toEqual([
      'dark',
      'ghost',
      'primary',
      'secondary',
    ]);
  });

  test('there is one meaning of modal, and both modal components use it', () => {
    // D.5a: `CcMessageBox` and `CcDialog` are modal through `./modal.ts`, not
    // through two copies of it. Two copies are two answers to "is the page
    // behind inert?" the day one of them is fixed and the other is not.
    for (const rel of ['components/cc/MessageBox.tsx', 'components/cc/Dialog.tsx']) {
      const src = read(rel);
      expect(src, `${rel} does not use the shared modal hook`).toMatch(/useCcModal(<\w+>)?\(/);
      expect(src, `${rel} switches the page inert by itself`).not.toMatch(/setAttribute\('inert'/);
      expect(src, `${rel} is not announced as modal`).toContain('aria-modal="true"');
      expect(src, `${rel} is not named by its title`).toContain('aria-labelledby={titleId}');
      expect(src, `${rel} is not portalled to body, so inert would switch it off too`).toMatch(
        /createPortal\([\s\S]*document\.body/,
      );
    }
  });

  test('the toast cannot be asked for an error', () => {
    // §2.6: a toast is never for an error, because it removes itself before the
    // reader has decided what to do. Enforced by there being no way to ask.
    const src = read('components/cc/Toast.tsx');
    expect(src, 'CcToast grew a state prop').not.toMatch(/\bstate\s*\??\s*:/);
    expect(src).toContain('role="status"');
  });

  test('every visible string of a component comes from the catalogue', () => {
    // Text sitting between two tags, containing at least one word. Anything
    // interpolated (`{t('…')}`, `{children}`, a prop) has braces in it and does
    // not match — which is the distinction being drawn.
    // Both sides exclude the newline: without it, the `>` closing a generic
    // (`useRef<HTMLDivElement>`) pairs with the `<` opening the next one three
    // lines down and the whole statement in between reads as interface copy.
    const pattern = />([^<>{}\n]*[A-Za-z]{2,}[^<>{}\n]*)</g;
    const offenders: string[] = [];
    for (const { rel, text } of componentSources()) {
      // Comments carry prose by design.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(pattern)) {
        const literal = m[1].trim();
        if (!literal) continue;
        offenders.push(`${rel}: "${literal.slice(0, 60)}"`);
      }
    }
    expect(
      offenders,
      `hard-coded interface text (DESIGN.md §3 — every visible string of a new surface is a key):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('and every key in the catalogue is a real sentence of the product', () => {
    for (const [key, value] of Object.entries(CC_MESSAGES)) {
      expect(value.trim().length, `${key} is empty`).toBeGreaterThan(0);
      expect(value, `${key} carries a raw markdown or template marker`).not.toMatch(/[*_`{}]/);
    }
  });
});

test.describe('and paint themselves consistently', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccstyle');
  });

  test('every card title is the same title', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const titles = await page.locator('[data-cc-card-title]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          text: (el.textContent || '').trim().slice(0, 30),
          key: [s.fontSize, s.fontWeight, s.fontFamily, s.letterSpacing, s.textTransform, s.color].join(' | '),
        };
      }),
    );

    expect(titles.length, 'no card titles rendered').toBeGreaterThan(5);
    const distinct = [...new Set(titles.map((t) => t.key))];
    expect(
      distinct,
      `card titles disagree:\n${titles.map((t) => `${t.text.padEnd(32)} ${t.key}`).join('\n')}`,
    ).toHaveLength(1);
  });

  test('four button styles, each identical to itself', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const buttons = await page.locator('[data-cc-button]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          variant: el.getAttribute('data-cc-button') || '',
          density: el.getAttribute('data-cc-density') || '',
          tone: el.getAttribute('data-cc-tone') || '',
          text: (el.textContent || '').trim().slice(0, 24),
          key: [s.backgroundColor, s.color, s.borderTopColor, s.borderTopWidth, s.borderRadius, s.fontWeight].join(' | '),
          height: s.minHeight,
        };
      }),
    );

    expect(buttons.length, 'no buttons rendered').toBeGreaterThan(5);

    const variants = [...new Set(buttons.map((b) => b.variant))].sort();
    expect(variants, 'DESIGN.md §1.5: exactly four').toEqual(['dark', 'ghost', 'primary', 'secondary']);

    for (const variant of variants) {
      // `tone="danger"` is the one sanctioned difference inside a variant: a
      // destructive ghost carries error *text*, never a red surface (§1.5).
      const sameVariant = buttons.filter((b) => b.variant === variant && b.tone === 'default');
      const keys = [...new Set(sameVariant.map((b) => b.key))];
      expect(
        keys,
        `\`${variant}\` renders in ${keys.length} different ways:\n${sameVariant.map((b) => `${b.text.padEnd(26)} ${b.key}`).join('\n')}`,
      ).toHaveLength(1);
    }

    // The four are actually four, as painted — not four names on two looks.
    const looks = new Set(buttons.filter((b) => b.tone === 'default').map((b) => b.key));
    expect(
      looks.size,
      'two variants are painted the same; a name that changes nothing is not a variant',
    ).toBe(4);

    // 32px compact, 40px cozy (§1.5).
    const heights = new Map<string, Set<string>>();
    for (const b of buttons) {
      if (!heights.has(b.density)) heights.set(b.density, new Set());
      heights.get(b.density)!.add(b.height);
    }
    expect([...(heights.get('compact') ?? [])]).toEqual(['32px']);
    if (heights.has('cozy')) expect([...heights.get('cozy')!]).toEqual(['40px']);
  });

  test('the heading outline never skips a level', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const levels = await page
      .locator('[data-cc-gallery] h1, [data-cc-gallery] h2, [data-cc-gallery] h3, [data-cc-gallery] h4')
      .evaluateAll((els) =>
        els.map((el) => ({
          level: Number(el.tagName.slice(1)),
          text: (el.textContent || '').trim().slice(0, 40),
        })),
      );

    expect(levels.length, 'no headings').toBeGreaterThan(5);
    expect(levels[0].level, 'the page does not start at h1').toBe(1);

    const skips: string[] = [];
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level > levels[i - 1].level + 1) {
        skips.push(`h${levels[i - 1].level} "${levels[i - 1].text}" → h${levels[i].level} "${levels[i].text}"`);
      }
    }
    expect(skips, `heading levels skipped (DESIGN.md §2.3):\n${skips.join('\n')}`).toEqual([]);
  });

  test('the message box is modal, and gives the focus back', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const opener = page.getByRole('button', { name: 'Open message box' });
    await opener.click();
    await page.waitForSelector('[data-cc-message-box]');

    const state = await page.evaluate(() => {
      const layer = document.querySelector('[data-cc-message-box-layer]');
      const box = document.querySelector('[data-cc-message-box]');
      const siblings = Array.from(document.body.children).filter((n) => !n.contains(layer as Node));
      return {
        focusInside: !!box && box.contains(document.activeElement),
        modal: box?.getAttribute('aria-modal'),
        siblingCount: siblings.length,
        inertSiblings: siblings.filter((n) => n.hasAttribute('inert')).length,
        boxes: document.querySelectorAll('[data-cc-message-box]').length,
      };
    });

    expect(state.modal, 'the box is not announced as modal').toBe('true');
    expect(state.focusInside, 'the focus is still behind the box').toBe(true);
    expect(state.boxes, 'more than one confirmation is open at a time (ADR-028)').toBe(1);
    expect(state.siblingCount, 'nothing behind the box — the check would be vacuous').toBeGreaterThan(0);
    expect(
      state.inertSiblings,
      'the page behind the box is still reachable (DESIGN.md §2.6)',
    ).toBe(state.siblingCount);

    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-cc-message-box]', { state: 'detached' });

    const returned = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? '',
    );
    expect(returned, 'Escape left the focus nowhere').toBe('Open message box');

    // And the page behind is usable again.
    const stillInert = await page.evaluate(
      () => Array.from(document.body.children).filter((n) => n.hasAttribute('inert')).length,
    );
    expect(stillInert, 'the page stayed inert after the box closed').toBe(0);
  });

  test('the dialog is modal, keeps the focus, and gives it back', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const opener = page.getByRole('button', { name: 'Open dialog' });
    await opener.click();

    // Named by its title, described by its lead — what a screen reader says
    // first when the focus lands inside.
    const dialog = page.getByRole('dialog', { name: 'Invite a reader' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(/bound to one confirmed e-mail address/);
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

    const state = await page.evaluate(() => {
      const layer = document.querySelector('[data-cc-dialog-layer]');
      const box = document.querySelector('[data-cc-dialog]');
      const siblings = Array.from(document.body.children).filter((n) => !n.contains(layer as Node));
      return {
        focusTag: document.activeElement?.tagName ?? '',
        focusInside: !!box && box.contains(document.activeElement),
        siblingCount: siblings.length,
        inertSiblings: siblings.filter((n) => n.hasAttribute('inert')).length,
        layerInert: !!layer?.closest('[inert]'),
      };
    });
    expect(state.focusInside, 'the focus is still behind the dialog').toBe(true);
    expect(state.focusTag, 'a form dialog starts on its first field').toBe('INPUT');
    expect(state.siblingCount, 'nothing behind the dialog — the check would be vacuous').toBeGreaterThan(0);
    expect(state.inertSiblings, 'the page behind the dialog is still reachable (DESIGN.md §2.6)').toBe(
      state.siblingCount,
    );
    expect(state.layerInert, 'the dialog switched itself off').toBe(false);

    // Typing re-renders the page that owns the dialog. The focus stays where
    // the person is typing instead of jumping back to the start.
    const email = dialog.getByRole('textbox', { name: /E-mail address/ });
    await page.keyboard.type('reader@example.com');
    await expect(email).toBeFocused();
    await expect(email).toHaveValue('reader@example.com');

    // The focus trap, both directions: however often Tab is pressed, the focus
    // never leaves the dialog.
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press(key);
        const inside = await page.evaluate(
          () => !!document.querySelector('[data-cc-dialog]')?.contains(document.activeElement),
        );
        expect(inside, `${key} #${i + 1} left the dialog`).toBe(true);
      }
    }

    // The dimmed page is not a way out: a stray click must not take typed text.
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener, 'Escape left the focus nowhere').toBeFocused();
    const stillInert = await page.evaluate(
      () => Array.from(document.body.children).filter((n) => n.hasAttribute('inert')).length,
    );
    expect(stillInert, 'the page stayed inert after the dialog closed').toBe(0);

    // The close button is the other way out, and Enter in a field submits.
    await opener.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await opener.click();
    await expect(email).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog, 'Enter in the field did not submit the form').toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('every field with an asterisk says aria-required on its control (QA c07adecd2fb5, 14f0276e65ff)', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    // The dialog's field counts too, so open it.
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Invite a reader' })).toBeVisible();

    const fields = await page.locator('[data-cc-field]').evaluateAll((els) =>
      els
        .filter((el) => el.querySelector('label [data-cc-required-mark]'))
        .map((el) => {
          const control = el.querySelector('input, select, textarea, [role]:not(label)');
          return {
            label: (el.querySelector('label')?.textContent || '').trim(),
            ariaRequired: control?.getAttribute('aria-required') ?? null,
          };
        }),
    );
    expect(fields.length, 'no required field on the gallery — the check would be vacuous').toBeGreaterThan(2);
    expect(
      fields.filter((f) => f.ariaRequired !== 'true').map((f) => f.label),
      'an asterisk without aria-required on the control (DESIGN.md §2.7)',
    ).toEqual([]);
  });

  test('the message popover lists the checks and jumps to their element', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    // One name that says what and how many; the badge is not read twice.
    const trigger = page.getByRole('button', { name: 'Checks, 3 open' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const panel = page.getByRole('dialog', { name: 'Checks' });
    await expect(panel).toBeVisible();
    // Not modal: the page stays usable while the list is open.
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    expect(
      await page.evaluate(() => Array.from(document.body.children).some((n) => n.hasAttribute('inert'))),
      'the popover made the page inert',
    ).toBe(false);
    expect(
      await page.evaluate(
        () => !!document.querySelector('[data-cc-message-popover-panel]')?.contains(document.activeElement),
      ),
      'the focus did not move into the list',
    ).toBe(true);

    // The state is said in words, not only shown as an icon colour (§1.1).
    const items = panel.locator('[data-cc-check]');
    await expect(items).toHaveCount(3);
    await expect(items.first()).toContainText('Warning:');
    await expect(items.nth(2)).toContainText('Information:');

    // Three "Go to" buttons, three different names.
    const names = await panel
      .getByRole('button')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    expect(names).toEqual(['Go to Gateway Price deviation', 'Go to Path Plant 1000', 'Go to Lane Approver']);

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger, 'Escape left the focus nowhere').toBeFocused();

    // The jump: the popover closes and the element the hint is about has the focus.
    await trigger.click();
    await panel.getByRole('button', { name: 'Go to Lane Approver' }).click();
    await expect(panel).toBeHidden();
    const focused = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focused, 'Go to did not take the reader to the element').toBe('ds-check-lane');
  });

  test('the filter bar announces its count, and no-match is not the empty state', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const count = page.locator('[data-cc-filter-count]');
    await expect(count).toHaveAttribute('aria-live', 'polite');
    await expect(count).toHaveText('3 findings');

    // Nothing is filtered, so there is no way out to offer yet.
    expect(await page.locator('[data-cc-clear-filters]').count()).toBe(0);

    await page.locator('[data-cc-filter-bar] input[type="search"]').fill('NOTHING_MATCHES_THIS');
    await expect(count).toHaveText('0 of 3 findings');

    await expect(page.locator('[data-cc-empty-state="no-matches"]')).toBeVisible();
    expect(
      await page.locator('[data-cc-demo="findings"] [data-cc-empty-state="empty"]').count(),
      'the empty state was shown for a filter that excluded everything (DESIGN.md §2.4)',
    ).toBe(0);

    // Two ways out, both leading back to the full list.
    expect(await page.locator('[data-cc-clear-filters]').count()).toBe(1);
    await page.locator('[data-cc-empty-state="no-matches"] button').click();
    await expect(count).toHaveText('3 findings');
  });

  test('a long run says what it costs, cancels, and ends an error in an action', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    // The price, before the click, as two separate claims (§2.8).
    const quota = await page.locator('[data-cc-run-cost-quota]').first().textContent();
    const model = await page.locator('[data-cc-run-cost-model]').first().textContent();
    expect(quota, 'the action does not say what it spends').toMatch(/free analysis runs|Not counted|already analysed|Gemini key/);
    expect(model, 'whether a model is called is a separate statement').toMatch(/model/i);

    // No invented percentage anywhere in the run indicator.
    const runText = (await page.locator('[data-cc-run-indicator]').innerText()).replace(/\s+/g, ' ');
    expect(runText, 'a long run shows stages, never a percentage it does not have').not.toMatch(/\b\d{1,3}\s?%/);
    expect(runText, 'a loading state that plays at thinking (DESIGN.md §3.1)').not.toMatch(/thinking/i);

    // Cancel is there the whole time, not only between stages.
    await expect(page.locator('[data-cc-run-cancel]')).toBeVisible();

    // The live region says the stage and its result, once.
    await expect(page.locator('[data-cc-run-live]')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('[data-cc-run-live]')).toHaveText('Code read: 668 lines, 3 programs');

    // The counters are not announced — a screen reader reading a counter is a
    // screen reader that gets switched off.
    await expect(page.locator('[data-cc-run-counters]')).toHaveAttribute('aria-hidden', 'true');

    // A failure ends in something to do.
    const errorStrip = page.locator('[data-cc-run-indicator] [data-cc-message-strip="error"]');
    await expect(errorStrip).toBeVisible();
    expect(await errorStrip.locator('button').count()).toBeGreaterThan(0);
  });

  test('the toast is polite, and goes away on its own', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    await page.getByRole('button', { name: 'Show toast' }).click();
    const toast = page.locator('[data-cc-toast]');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'status');
    expect(await page.locator('[data-cc-toast]').count(), 'at most one toast at a time').toBe(1);
    await expect(toast).toBeHidden({ timeout: 8000 });
  });
});
