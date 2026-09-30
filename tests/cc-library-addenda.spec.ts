import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import type { CcStateTextState } from '../components/cc/StateText';

/**
 * What waves 2 and 3 of block D found missing in the library — step D.5e.
 *
 *   1. A named layer scale. The dialog and the message box sat on `z-50`, the
 *      green assistant button on `z-[80]`: it covered every dialog, and on a
 *      phone the dialog's main button.
 *   2. A dialog that cannot be dismissed, only answered (the terms gate).
 *   3. A layer open on the first render does not throw the page away with a
 *      hydration error.
 *   4. `ref` reaches the button element.
 *   5. `CcStateText`: a state in words with a dot, for what is not on a fixed list.
 *   6. Small things: object status on the grid, the message strip's text a
 *      block that makes room on a phone.
 *   7. A control in a row that opens does not open the row as well.
 *
 * The rendered half runs on the gallery (`app/(app)/admin/design-system`,
 * section "Layers, state text and rows that open") and on the fixture
 * `app/(app)/admin/design-system/first-render`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const LAYERS = ['popover', 'sticky', 'float', 'overlay', 'toast'] as const;

// `CcStateText` cannot be asked for green: `success` is not one of its states.
type AcceptsSuccess = 'success' extends CcStateTextState ? true : false;
const stateTextHasNoGreen: AcceptsSuccess = false;
void stateTextHasNoGreen;

test.describe('the layer scale, in the source', () => {
  test('five named layers, bottom to top, each a utility', () => {
    const css = read('app/globals.css');
    const values = LAYERS.map((name) => {
      const m = css.match(new RegExp(`^\\s*--cc-z-${name}:\\s*(\\d+);`, 'm'));
      expect(m, `--cc-z-${name} is not declared in app/globals.css`).not.toBeNull();
      expect(css, `z-cc-${name} generates nothing without its @theme alias`).toMatch(
        new RegExp(`^\\s*--z-index-cc-${name}:\\s*var\\(--cc-z-${name}\\);`, 'm'),
      );
      return Number(m![1]);
    });
    const sorted = [...values].sort((a, b) => a - b);
    expect(values, `the layers must rise in this order: ${LAYERS.join(' < ')}`).toEqual(sorted);
    expect(new Set(values).size, 'two layers share a value').toBe(values.length);
  });

  test('the library stacks only on the scale', () => {
    const expected: Record<string, string> = {
      'components/cc/Dialog.tsx': 'z-cc-overlay',
      'components/cc/MessageBox.tsx': 'z-cc-overlay',
      'components/cc/WhyPopover.tsx': 'z-cc-popover',
      'components/cc/MessagePopover.tsx': 'z-cc-popover',
      'components/cc/Toast.tsx': 'z-cc-toast',
    };
    for (const [rel, cls] of Object.entries(expected)) {
      expect(read(rel), `${rel} should stack on ${cls}`).toContain(cls);
    }
    const bare: string[] = [];
    for (const name of fs.readdirSync(path.resolve(ROOT, 'components/cc'))) {
      const rel = `components/cc/${name}`;
      read(rel)
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\*|\/\/)/.test(line)) return;
          for (const m of line.matchAll(/(?<![\w-])z-(?:\d+|\[[^\]]+\])(?![\w-])/g)) bare.push(`${rel}:${i + 1} ${m[0]}`);
        });
    }
    expect(bare, `a number of its own instead of a layer of the scale:\n${bare.join('\n')}`).toEqual([]);
  });
});

test.describe('the library additions of D.5e, rendered', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    // Seeding through the emulator can take half a minute on a busy machine.
    test.setTimeout(120 * 1000);
    admin = await createGalleryAdmin('cc-d5e');
  });

  test('an open dialog lies above a helper on the floating layer', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.getByRole('button', { name: 'Show a floating helper' }).click();
    const probe = page.locator('[data-cc-z-probe]');
    await expect(probe).toBeVisible();

    // Before the dialog: the helper is what a click there reaches.
    const box = (await probe.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-cc-z-probe]'), at);
    expect(before, 'the probe is not on top of the page — the test would prove nothing').toBe(true);

    await page.getByRole('button', { name: 'Open a dialog over it' }).click();
    const dialog = page.getByRole('dialog', { name: 'Above every floating helper' });
    await expect(dialog).toBeVisible();

    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return { inLayer: !!el?.closest('[data-cc-dialog-layer]'), inProbe: !!el?.closest('[data-cc-z-probe]') };
    }, at);
    expect(hit.inProbe, 'the floating helper covers the open dialog').toBe(false);
    expect(hit.inLayer, 'the point should belong to the dimmed layer of the dialog').toBe(true);

    // And nothing, the real assistant button included, covers the dialog's own buttons.
    const done = dialog.getByRole('button', { name: 'Done' });
    const d = (await done.boundingBox())!;
    const onDone = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() ?? null,
      { x: d.x + d.width / 2, y: d.y + d.height / 2 },
    );
    expect(onDone).toBe('Done');

    // Every other fixed element on the page — the real assistant button among
    // them — lies under the dimmed layer too.
    const above = await page.evaluate(() => {
      const layer = document.querySelector('[data-cc-dialog-layer]')!;
      const out: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        if (layer.contains(el) || getComputedStyle(el).position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (top && !layer.contains(top)) out.push(el.outerHTML.slice(0, 120));
      }
      return out;
    });
    expect(above, `fixed elements above an open dialog:\n${above.join('\n')}`).toEqual([]);

    const z = await page.evaluate(() => ({
      layer: getComputedStyle(document.querySelector('[data-cc-dialog-layer]')!).zIndex,
      probe: getComputedStyle(document.querySelector('[data-cc-z-probe]')!).zIndex,
    }));
    expect(Number(z.layer)).toBeGreaterThan(Number(z.probe));
  });

  test('on a phone, a helper where the assistant button sits does not cover the dialog', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin, 390);
    await page.getByRole('button', { name: 'Show a floating helper' }).click();
    await page.getByRole('button', { name: 'Open a dialog over it' }).click();
    const dialog = page.getByRole('dialog', { name: 'Above every floating helper' });
    await expect(dialog).toBeVisible();
    // Every corner and the centre of every button in the dialog reaches the dialog.
    const covered = await page.evaluate(() => {
      const out: string[] = [];
      const dlg = document.querySelector('[data-cc-dialog]')!;
      for (const el of Array.from(dlg.querySelectorAll('button'))) {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || !dlg.contains(top)) out.push(`${el.textContent?.trim() || el.getAttribute('aria-label')} under ${top?.outerHTML.slice(0, 80)}`);
      }
      return out;
    });
    expect(covered).toEqual([]);
  });

  test('a dialog that must be answered: no close button, Escape and the page do nothing', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const opener = page.getByRole('button', { name: 'Open the question' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Accept the updated terms to continue' });
    await expect(dialog).toBeVisible();

    // The caller's data-* attributes reach the layer.
    const layer = page.locator('[data-cc-dialog-layer][data-cc-demo="must-answer"]');
    await expect(layer).toHaveCount(1);
    await expect(layer).toHaveAttribute('data-cc-dismissible', 'false');

    await expect(dialog.locator('[data-cc-dialog-close]')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /close/i })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dialog, 'Escape closed a dialog that has to be answered').toBeVisible();

    await page.mouse.click(5, 5);
    await expect(dialog, 'the dimmed page closed a dialog that has to be answered').toBeVisible();

    // Still modal: the focus stays inside.
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await dialog.getByRole('button', { name: 'Accept' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('[data-cc-demo-answer]')).toHaveText('Answered: accepted');
    await expect(opener).toBeFocused();
  });

  test('a dismissible dialog still has its close button and Escape', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.getByRole('button', { name: 'Open a dialog over it' }).click();
    const dialog = page.getByRole('dialog', { name: 'Above every floating helper' });
    await expect(dialog.locator('[data-cc-dialog-close]')).toHaveCount(1);
    await expect(page.locator('[data-cc-dialog-layer]')).not.toHaveAttribute('data-cc-dismissible', /.*/);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('CcButton hands its ref to the button element', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.getByRole('button', { name: 'Focus it through the ref' }).click();
    await expect(page.locator('[data-cc-demo-ref]')).toHaveText('The ref holds a button');
    await expect(page.locator('[data-cc-demo="ref-target"]')).toBeFocused();
  });

  test('state text: a word and a dot 4 px apart, no outline — and the object status matches it', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const texts = await page.locator('[data-cc-state-text]').evaluateAll((els) =>
      els.map((el) => {
        const inner = el.lastElementChild as HTMLElement;
        const dot = inner.querySelector('[data-cc-state-dot]') as HTMLElement | null;
        return {
          state: el.getAttribute('data-cc-state-text'),
          word: (el.querySelector('[data-cc-state-text-label]')?.textContent ?? '').trim(),
          border: getComputedStyle(el).borderTopWidth,
          gap: getComputedStyle(inner).columnGap,
          dotHidden: dot?.getAttribute('aria-hidden'),
          dotSize: dot ? dot.getBoundingClientRect().width : 0,
          size: getComputedStyle(el).fontSize,
          svg: el.querySelectorAll('svg').length,
        };
      }),
    );
    expect(texts.length).toBeGreaterThanOrEqual(5);
    // Four states — never `success`: a free word in green would claim a proof (ADR-007).
    expect(new Set(texts.map((t) => t.state))).toEqual(new Set(['information', 'warning', 'error', 'neutral']));
    for (const t of texts) {
      expect(t.word, `a ${t.state} state text without its word`).not.toBe('');
      expect(t.border).toBe('0px');
      expect(t.gap, 'dot and word stand one grid step apart').toBe('4px');
      expect(t.dotHidden).toBe('true');
      expect(t.dotSize).toBe(8);
      expect(t.size).toBe('12px');
      expect(t.svg, 'a state text has no icon — that would make it a chip').toBe(0);
    }

    const statusGaps = await page
      .locator('[data-cc-object-status] > span:last-child')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).columnGap));
    expect(statusGaps.length).toBeGreaterThan(0);
    expect(new Set(statusGaps), 'object status is off the 4 px grid (R18)').toEqual(new Set(['4px']));
  });

  test('a control in a row that opens is the control’s, not the row’s', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator('[data-cc-demo="row-open"]');
    const row = demo.locator('[data-cc-table-row="Z_MM_PO_APPROVAL"]');
    await row.getByRole('button', { name: 'Rename' }).click();
    await expect(demo.locator('[data-cc-demo-pressed]')).toHaveText('1');
    await expect(demo.locator('[data-cc-demo-opened]'), 'the button opened the row as well').toHaveText('0');

    await row.locator('[data-cc-table-cell="lines"]').click();
    await expect(demo.locator('[data-cc-demo-opened]')).toHaveText('1');
    await expect(demo.locator('[data-cc-demo-pressed]')).toHaveText('1');
  });

  test('the message strip holds its text in a block, and on a phone the actions make room', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin, 390);
    const strip = page.locator('[data-cc-message-strip="error"]').filter({ hasText: 'Business names were not created.' }).first();
    const text = strip.locator('[data-cc-message-strip-text]');
    expect(await text.evaluate((el) => el.tagName)).toBe('DIV');
    const widths = await strip.evaluate((el) => ({
      strip: el.getBoundingClientRect().width,
      text: (el.querySelector('[data-cc-message-strip-text]') as HTMLElement).getBoundingClientRect().width,
    }));
    // Before D.5e the two buttons kept their width and the text was squeezed to
    // a word a line — about 60 px on a 390 px screen.
    expect(widths.text, `text column ${widths.text}px in a ${widths.strip}px strip`).toBeGreaterThan(widths.strip * 0.6);
  });
});

test.describe('a layer open on the very first render', () => {
  // No account needed: the fixture shows a sample sentence and nothing else,
  // and it has to be server-rendered before any profile could be read.
  for (const variant of ['dialog', 'box'] as const) {
    test(`the ${variant === 'dialog' ? 'dialog' : 'message box'} opens without a hydration error`, async ({ page }) => {
      test.setTimeout(180 * 1000);
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`/admin/design-system/first-render${variant === 'box' ? '?layer=box' : ''}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-cc-first-render]');
      // The server rendered the page without the layer, and it is still the page.
      const layer = variant === 'dialog' ? '[data-cc-dialog-layer]' : '[data-cc-message-box-layer]';
      await expect(page.locator(layer)).toHaveCount(1);
      await expect(page.getByRole('dialog', { name: 'Open on the first render' })).toBeVisible();
      await page.waitForTimeout(1500);

      // The failure this guards against throws the tree away ("Hydration
      // failed …"). An attribute that differs elsewhere in the shell is
      // reported as "A tree hydrated but some attributes …" — a different
      // problem in a different file, and not this layer's to answer.
      const hydration = errors.filter((e) => /Hydration failed|error while hydrating/i.test(e));
      expect(hydration, hydration.join('\n---\n')).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(page.locator('[data-cc-first-render-state]')).toHaveAttribute('data-cc-first-render-state', 'closed');
    });
  }
});

test.describe('CcTable from a server component (D.33)', () => {
  test('cells need no key of their own, and the row the page is about is set apart in ink', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    // /clean-core-score is a server component that hands CcTable its cells;
    // before D.33 every one of them had to carry a key nobody used.
    await page.goto('/clean-core-score', { waitUntil: 'networkidle', timeout: 180_000 });
    const table = page.locator('[data-cc-table]').first();
    await expect(table).toBeVisible();
    expect(errors.filter((e) => /unique "key" prop/.test(e)), 'React asked for a key').toEqual([]);
    expect(read('app/(app)/clean-core-score/page.tsx'), 'the page works around the table again').not.toMatch(/<span key="/);

    const ours = table.locator('[data-cc-table-emphasis]');
    await expect(ours).toHaveCount(1);
    await expect(ours).toContainText('Clean Core Score');
    const look = await ours.evaluate((el) => {
      const probe = document.createElement('div');
      probe.style.color = 'var(--cc-ink)';
      probe.style.background = 'var(--cc-surface-muted)';
      document.body.appendChild(probe);
      const tokens = { ink: getComputedStyle(probe).color, muted: getComputedStyle(probe).backgroundColor };
      probe.remove();
      return {
        ...tokens,
        background: getComputedStyle(el).backgroundColor,
        bar: getComputedStyle(el.querySelector('td')!).boxShadow,
      };
    });
    // Ours is not a proof, so never the green of "evidenced" (§1.1, ADR-007).
    expect(look.background).toBe(look.muted);
    expect(look.bar).toContain(look.ink);
  });
});
