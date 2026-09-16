import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * There is no dark mode, and this is what keeps it that way.
 *
 * What was removed in roadmap 1.6 (decision 15.09.2026) was never a theme. It
 * was a sheet of `.dark` overrides in `app/globals.css` that repainted a
 * hand-picked list of utility classes with `!important` — `.bg-white`,
 * `.text-gray-900`, `.border-slate-200` and about forty more — plus 22 `dark:`
 * variants scattered across two components. Everything the list did not name
 * stayed light. Measured on the release that triggered this: the dashboard
 * table kept a white background under a near-black page, and the project row
 * lost almost all of its contrast. The UX review found the same thing from the
 * outside without seeing the code (UX-023, UX-044, UX-061, UX-062).
 *
 * A half-dark surface is worse than an honestly light one, and it is worse in a
 * way nobody notices while building: the developer has the switch on Light.
 * That is exactly the failure mode a guard is for.
 *
 * Three kinds of check here, and the last is the one that cannot be talked out
 * of a failure:
 *
 *   - Source: no `dark:` variant in the product, no `.dark` rule in the CSS.
 *   - Wiring: nothing puts the class back on `<html>`, reads the profile's dead
 *     `theme` field, keeps a `theme` key in localStorage, or asks the browser
 *     for `prefers-color-scheme`. A removal that leaves the switch wired up is
 *     one commit away from coming back.
 *   - Rendered: forcing `class="dark"` onto the live document changes no colour
 *     anywhere on the page. A source guard can be satisfied by a stylesheet the
 *     scan does not read; computed style cannot.
 *
 * When dark mode is built for real in 3.0, on the semantic colour tokens
 * `DESIGN.md` defines, this file is what gets deleted — deliberately, in that
 * commit, rather than eroded one `dark:` class at a time.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** Everything that ships to a browser. Tests and the review agents' own tooling are not product surface. */
const PRODUCT_DIRS = ['app', 'components', 'hooks', 'lib'];

type SourceFile = { rel: string; text: string };

function collectSources(): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
        continue;
      }
      if (!/\.(tsx|ts|css)$/.test(entry.name)) continue;
      files.push({ rel: path.relative(ROOT, full).replace(/\\/g, '/'), text: fs.readFileSync(full, 'utf8') });
    }
  };
  for (const dir of PRODUCT_DIRS) walk(path.join(ROOT, dir));
  return files;
}

/** Offending lines as `file:line  text`, so a failure names the place instead of the count. */
function findLines(files: SourceFile[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const { rel, text } of files) {
    text.split('\n').forEach((line, i) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 140)}`);
    });
  }
  return hits;
}

test.describe('no dark mode in the source', () => {
  test('no `dark:` variant anywhere in the product', () => {
    // `dark:` followed by a non-space is the Tailwind variant and nothing else —
    // an object key (`{ dark: true }`) and a type (`theme?: 'light' | 'dark'`)
    // both fail that shape, so neither is dragged in as a false positive. The
    // leading guard keeps `something-dark:` from counting.
    const offenders = findLines(collectSources(), /(?<![\w-])dark:(?=\S)/);
    expect(
      offenders,
      `dark: variants are back — there is no dark mode to complete them, so these render on a light surface:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('no `.dark` rule in any stylesheet', () => {
    const css = collectSources().filter((f) => f.rel.endsWith('.css'));
    expect(css.length, 'no stylesheet found — the scan would pass vacuously').toBeGreaterThan(0);
    // `.dark` exactly: `.dark-surface` or `.darkroom` would be a different class.
    const offenders = findLines(css, /\.dark(?![\w-])/);
    expect(offenders, `\`.dark\` overrides are back:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('nothing wires a theme up again', () => {
    const files = collectSources();
    const offenders = [
      // The class on <html> the overrides used to hang off.
      ...findLines(files, /classList\.(add|remove|toggle|contains)\(\s*['"`]dark['"`]/),
      // The browser's own preference — "system" was a third of the old switch.
      ...findLines(files, /prefers-color-scheme/),
      // Where the choice used to be cached between the profile loading and the paint.
      ...findLines(files, /(local|session)Storage\.(get|set|remove)Item\(\s*['"`]theme['"`]/),
      // And the dead profile field itself: it stays on old accounts, unread.
      ...findLines(files, /\bprofile\s*\??\.\s*theme\b/),
    ];
    expect(
      offenders,
      `dark mode is being wired back up:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('the settings page offers no theme switch', () => {
    const src = read('app/(app)/settings/page.tsx');
    // The section itself still exists, so a passing check here is a real one.
    expect(src, 'the System Preferences section is gone — check this guard still tests something').toContain('System Preferences');
    expect(src, 'the Visual Theme selector is back').not.toContain('Visual Theme');
    expect(src, 'a theme preference state is back').not.toContain('themePreference');
    // Saving preferences must not write `theme` back onto the account.
    expect(src, 'the preferences form writes the theme field again').not.toMatch(/theme\s*:\s*\w/);
  });

  test('the field stays on the account, and stays unread', () => {
    // Removing it would be a migration of account data, and sign-up and account
    // stay unchanged. So it is declared, documented as dead, and not read —
    // which is what the wiring check above enforces.
    const hook = read('hooks/useUserProfile.ts');
    expect(hook, "the profile's theme field was removed — that is a migration, not a removal").toMatch(
      /theme\?:\s*'light'\s*\|\s*'dark'\s*\|\s*'system'/,
    );
  });
});

test.describe('and none in the rendered page', () => {
  test('forcing class="dark" onto the document changes no colour', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const diffs = await page.evaluate(() => {
      // Transitions would hand back the *starting* colour on the first read
      // after the class lands, which is how a rule that does fire reads as one
      // that does not. Neither property is compared below, so silencing them
      // cannot mask anything either.
      const freeze = document.createElement('style');
      freeze.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(freeze);

      const root = document.documentElement;
      const els = [document.body, ...Array.from(document.querySelectorAll('body *'))];
      const snapshot = () =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return [s.backgroundColor, s.color, s.borderTopColor, s.backgroundImage, s.fill].join(' | ');
        });

      // Both reads happen inside one synchronous block: no frame passes between
      // them, so nothing but the class can account for a difference.
      const before = snapshot();
      const had = root.classList.contains('dark');
      root.classList.add('dark');
      const after = snapshot();
      if (!had) root.classList.remove('dark');
      freeze.remove();

      const changed: string[] = [];
      for (let i = 0; i < els.length && changed.length < 10; i++) {
        if (before[i] === after[i]) continue;
        const el = els[i];
        const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 5).join(' ');
        changed.push(`<${el.tagName.toLowerCase()} class="${cls}">\n    light: ${before[i]}\n    dark:  ${after[i]}`);
      }
      return { count: els.length, changed };
    });

    expect(diffs.count, 'nothing rendered — the comparison would be vacuous').toBeGreaterThan(50);
    expect(
      diffs.changed,
      `something still repaints under class="dark" — a surface that changes without a theme behind it is the half-dark state this removed:\n${diffs.changed.join('\n')}`,
    ).toEqual([]);
  });
});
