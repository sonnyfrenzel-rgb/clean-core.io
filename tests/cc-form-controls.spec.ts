import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import { parseColor } from './helpers/contrast';

/**
 * The form controls of `DESIGN.md` §2.7 — block D, step D.5b.
 *
 * Checkbox, radio group, select, textarea and switch, built on the parts of
 * `CcField` so label, help text, asterisk and value state are one family. What
 * this file holds in place, as behaviour rather than as markup:
 *
 *   - every control has a name a screen reader speaks (§2.7, WCAG 4.1.2);
 *   - the keyboard does what the role promises — Space ticks a box, Space and
 *     Enter flip a switch, arrows move a radio choice and Tab enters the group
 *     once (§1.6);
 *   - a value state is icon **and** text, the control says `aria-invalid` and
 *     points at the message, the border takes the state colour — and the state
 *     goes when the input becomes right;
 *   - the edge of a plain control is `--cc-field-border`, and the height is
 *     32px compact, 40px cozy;
 *   - the switch is `role="switch"` with `aria-checked` (UX-065);
 *   - under `forced-colors` a ticked box and a switched-on switch still look
 *     different from their opposites.
 *
 * The contrast, 11px and focus-ring sweeps of `cc-token-guard` cover these
 * controls too, because they are on the gallery; the focus test here walks
 * this section on its own, because the sweep there stops after 60 stops.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const CONTROLS = ['Checkbox', 'RadioGroup', 'Select', 'Textarea', 'Switch'] as const;
const DEMO = '[data-cc-demo="form-controls"]';

test.describe('the controls are built from the field, not beside it', () => {
  test('every control takes its label parts from CcField', () => {
    for (const name of CONTROLS) {
      const src = read(`components/cc/${name}.tsx`);
      expect(src, `${name} does not use the field's parts`).toMatch(/from '\.\/Field'/);
      // A second hand-written asterisk or value-state line is a second look.
      expect(src, `${name} writes its own asterisk`).not.toMatch(/>\s*\*\s*</);
      expect(src, `${name} writes its own value-state line`).not.toMatch(/data-cc-value-state=/);
    }
  });

  test('the switch is a switch, and the radio group has a legend', () => {
    const sw = read('components/cc/Switch.tsx');
    expect(sw).toContain('role="switch"');
    expect(sw).toMatch(/aria-checked=\{checked\}/);
    const radio = read('components/cc/RadioGroup.tsx');
    expect(radio).toMatch(/<fieldset[\s\S]*<legend/);
  });
});

test.describe('and behave as their roles promise', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccform');
  });

  test('every control has a spoken name', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    await expect(demo.getByRole('checkbox', { name: 'Include test systems' })).toBeVisible();
    await expect(demo.getByRole('switch', { name: 'Show line anchors' })).toBeVisible();
    await expect(demo.getByRole('radiogroup', { name: /Scope of the analysis/ })).toBeVisible();
    await expect(demo.getByRole('radio', { name: 'A package' })).toBeVisible();
    await expect(demo.getByRole('combobox', { name: /^Systems/ })).toBeVisible();
    await expect(demo.getByRole('textbox', { name: /Note for the project/ })).toBeVisible();

    // And nothing in the section is nameless.
    const nameless = await demo.locator('input, select, textarea, [role="switch"]').evaluateAll((els) =>
      els
        .filter((el) => {
          const labels = (el as HTMLInputElement).labels;
          return !(labels && labels.length > 0) && !el.getAttribute('aria-labelledby') && !el.getAttribute('aria-label');
        })
        .map((el) => el.outerHTML.slice(0, 80)),
    );
    expect(nameless, 'controls without a label').toEqual([]);

    // The help text is spoken with the control it belongs to.
    await expect(demo.getByRole('checkbox', { name: 'Include test systems' })).toHaveAccessibleDescription(
      'QAS and DEV calls are counted separately from production.',
    );
  });

  test('the keyboard: Space ticks, Space and Enter flip, arrows choose, Tab enters a group once', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const box = demo.getByRole('checkbox', { name: 'Include test systems' });
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await page.keyboard.press('Space');
    await expect(box).not.toBeChecked();

    const sw = demo.getByRole('switch', { name: 'Show line anchors' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Enter');
    await expect(sw).toHaveAttribute('aria-checked', 'true');

    // A disabled switch cannot be flipped at all.
    const locked = demo.getByRole('switch', { name: 'Share with invited readers' });
    await expect(locked).toBeDisabled();

    const group = demo.getByRole('radiogroup', { name: /Scope of the analysis/ });
    await expect(group).toHaveAttribute('aria-required', 'true');
    const program = group.getByRole('radio', { name: 'One program' });
    const pkg = group.getByRole('radio', { name: 'A package' });
    await expect(program).toBeChecked();
    await program.focus();
    await page.keyboard.press('ArrowDown');
    await expect(pkg).toBeChecked();
    await expect(pkg).toBeFocused();
    // The disabled third option is skipped: down again wraps to the first.
    await page.keyboard.press('ArrowDown');
    await expect(program).toBeChecked();

    // Tab leaves the group from the chosen option instead of walking its options.
    await page.keyboard.press('Tab');
    const after = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return { type: el?.type ?? '', name: el?.name ?? '', value: el?.value ?? '' };
    });
    const groupName = await program.getAttribute('name');
    expect(after.name === groupName && after.type === 'radio', 'Tab walked from option to option').toBe(false);
  });

  test('a value state is icon and text, is spoken, colours the border, and goes when the input is right', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const lines = await demo.locator('[data-cc-value-state]').evaluateAll((els) =>
      els.map((el) => ({
        state: el.getAttribute('data-cc-value-state'),
        icons: el.querySelectorAll('svg').length,
        text: (el.textContent || '').trim(),
      })),
    );
    // Three states stand on the page at load (warning follows a choice below), each with an icon and words.
    expect([...new Set(lines.map((l) => l.state))].sort()).toEqual(['error', 'information', 'success']);
    for (const line of lines) {
      expect(line.icons, `the ${line.state} line has no icon`).toBe(1);
      expect(line.text.length, `the ${line.state} line has no text`).toBeGreaterThan(10);
    }

    const errorToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cc-error').trim(),
    );
    const fieldToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cc-field-border').trim(),
    );
    const borderOf = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => getComputedStyle(el).borderTopColor);

    // The checkbox in error: invalid, described by its message, red edge.
    const yearEnd = demo.getByRole('checkbox', { name: /year-end close/ });
    await expect(yearEnd).toHaveAttribute('aria-invalid', 'true');
    await expect(yearEnd).toHaveAttribute('aria-required', 'true');
    await expect(yearEnd).toHaveAccessibleDescription(/Tick this once the file includes a year-end close/);
    expect(parseColor(await borderOf(yearEnd))).toEqual(parseColor(errorToken));

    // Put it right, and the state goes with the message.
    await yearEnd.check();
    await expect(yearEnd).not.toHaveAttribute('aria-invalid', 'true');
    await expect(yearEnd).not.toHaveAttribute('aria-describedby', /.+/);

    // The radio group in error says so as a group.
    const decision = demo.getByRole('radiogroup', { name: /Decision/ });
    await expect(decision).toHaveAttribute('aria-invalid', 'true');
    await expect(decision).toHaveAccessibleDescription(/Choose one option/);
    await decision.getByRole('radio', { name: 'Keep' }).check();
    await expect(decision).not.toHaveAttribute('aria-invalid', 'true');

    // The textarea: invalid until a reason is written.
    const reason = demo.getByRole('textbox', { name: /Reason for the decision/ });
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(parseColor(await borderOf(reason))).toEqual(parseColor(errorToken));
    await reason.fill('Replaced by the standard release strategy.');
    await expect(reason).not.toHaveAttribute('aria-invalid', 'true');

    // A plain control carries the field border (§2.7).
    const plain = demo.getByRole('checkbox', { name: 'Include test systems' });
    expect(parseColor(await borderOf(plain))).toEqual(parseColor(fieldToken));
    const systems = demo.getByRole('combobox', { name: /^Systems/ });
    expect(parseColor(await borderOf(systems))).toEqual(parseColor(fieldToken));

    // The select's warning appears only once a choice asks for it.
    await systems.selectOption('all');
    await expect(systems).toHaveAccessibleDescription(/also holds DEV/);
  });

  test('32px compact, 40px cozy', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    const heightOf = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => Math.round(el.getBoundingClientRect().height));

    expect(await heightOf(demo.getByRole('combobox', { name: /^Systems/ }))).toBe(32);
    expect(await heightOf(demo.getByRole('combobox', { name: /Usage period/ }))).toBe(40);

    // A checkbox or switch row is the target: its row is the control's height.
    const rowOf = (name: string, role: 'checkbox' | 'switch') =>
      demo.getByRole(role, { name }).locator('xpath=ancestor::span[contains(@class,"min-h-")][1]');
    expect(await heightOf(rowOf('Include test systems', 'checkbox'))).toBe(32);
    expect(await heightOf(rowOf('Remember this filter', 'checkbox'))).toBe(40);
    expect(await heightOf(rowOf('Show line anchors', 'switch'))).toBe(32);
  });

  test('every control in the section shows the focus ring when tabbed to', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const focusToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cc-focus').trim(),
    );
    const expected = parseColor(focusToken);

    // Start on the section's heading and walk it with the keyboard.
    await page.locator('#ds-form-controls').click();
    const ringless: string[] = [];
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate((demo) => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest(demo)) return null;
        const s = getComputedStyle(el);
        return {
          kind: el.getAttribute('role') || (el as HTMLInputElement).type || el.tagName.toLowerCase(),
          width: s.outlineWidth,
          style: s.outlineStyle,
          color: s.outlineColor,
          name: el.id,
        };
      }, DEMO);
      if (!ring) {
        if (kinds.size > 0) break; // walked out of the section
        continue;
      }
      kinds.add(ring.kind);
      if (parseFloat(ring.width) < 2 || ring.style === 'none' || JSON.stringify(parseColor(ring.color)) !== JSON.stringify(expected)) {
        ringless.push(`${ring.kind} ${ring.name}: ${ring.width} ${ring.style} ${ring.color}`);
      }
    }

    expect([...kinds].sort(), 'the walk did not reach every kind of control').toEqual(
      ['checkbox', 'radio', 'select-one', 'switch', 'textarea'].sort(),
    );
    expect(ringless, 'no focus ring (DESIGN.md §1.6)').toEqual([]);
  });

  test('forced-colors: ticked and unticked, on and off stay different', async ({ browser }) => {
    test.setTimeout(180 * 1000);
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await openGallery(page, admin);
    const demo = page.locator(DEMO);

    // The box is handed back to the system, which draws its own tick.
    const appearance = await demo
      .locator('input[type="checkbox"], input[type="radio"]')
      .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).appearance))]);
    expect(appearance, 'a painted box loses its tick under forced-colors').toEqual(['auto']);

    // The switch keeps a thumb whose colour and place say on or off.
    const thumbs = await demo.locator('[role="switch"]').evaluateAll((els) =>
      els.map((el) => {
        const thumb = el.querySelector('[data-cc-switch-thumb]') as HTMLElement;
        const s = getComputedStyle(thumb);
        return {
          on: el.getAttribute('aria-checked') === 'true',
          bg: s.backgroundColor,
          x: Math.round(thumb.getBoundingClientRect().left - el.getBoundingClientRect().left),
        };
      }),
    );
    const on = thumbs.filter((t) => t.on);
    const off = thumbs.filter((t) => !t.on);
    expect(on.length).toBeGreaterThan(0);
    expect(off.length).toBeGreaterThan(0);
    for (const a of on) {
      for (const b of off) {
        expect(a.bg, 'on and off thumbs share a colour under forced-colors').not.toBe(b.bg);
        expect(a.x, 'the thumb does not move').toBeGreaterThan(b.x);
      }
    }

    await context.close();
  });
});
