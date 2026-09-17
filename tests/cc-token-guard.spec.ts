import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import { parseColor, ratioOf, round2 } from './helpers/contrast';

/**
 * Semantic tokens, and the two ways a colour goes wrong here.
 *
 * The first is the one `tests/landing-style-guard.spec.ts` already found 131
 * times: a colour class naming a shade that was never declared. Tailwind emits
 * *nothing* for it, so the element inherits, and the failure is invisible —
 * `text-gray-955` next to `text-gray-950` was not two shades apart, it was one
 * styled element and one unstyled one. The same trap is open one namespace
 * over: `text-cc-inkmuted` is a typo that renders as "whatever the parent was".
 *
 * The second is the literal. `#0b1c30` written into a component is a colour
 * that has left the system: it cannot be found by a search for the token, it
 * does not move when the token moves, and nothing knows what it *means*. The
 * product got to 78 button styles that way.
 *
 * So: no hex, no palette shade, no undeclared `cc-` token in the new namespace,
 * and — because a source check can be satisfied by a stylesheet it does not
 * read — the contrast of every declared pair is recomputed from the **rendered**
 * `:root`. A token that fails to reach the browser fails this suite; a token
 * whose value drifts below its WCAG floor fails it with the number.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/**
 * Everything roadmap 1.5 built, plus everything built on it since. The old
 * product is not in scope here.
 *
 * `components/workspace` and the workspace route joined in roadmap 1.4: the
 * shell is the first real screen made of these components, and a screen that
 * could write `#0b1c30` or `text-gray-500` beside them would undo the namespace
 * in the first place it is used.
 */
const CC_DIRS = [
  'components/cc',
  'app/(app)/admin/design-system',
  'components/workspace',
  'app/(app)/project/[projectId]/page.tsx',
  // Roadmap 2.5. The process map sits inside a stage page of the old product,
  // where `#0b1c30` and `text-gray-500` are still everywhere; a new component
  // that copied its neighbours would be the first leak in the namespace.
  'components/process-map',
];

function collect(dirRel: string): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const target = path.resolve(ROOT, dirRel);
  // A single file is as legitimate a scope as a directory: the workspace route
  // is one page next to six stage pages that are not in this namespace.
  if (fs.statSync(target).isFile()) {
    return [{ rel: dirRel.replace(/\\/g, '/'), text: fs.readFileSync(target, 'utf8') }];
  }
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      out.push({ rel: path.relative(ROOT, full).replace(/\\/g, '/'), text: fs.readFileSync(full, 'utf8') });
    }
  };
  walk(path.resolve(ROOT, dirRel));
  return out;
}

function ccSources() {
  return CC_DIRS.flatMap(collect);
}

/** Every `--cc-*` name declared in `app/globals.css`, with its literal value. */
function declaredTokens(): Map<string, string> {
  const css = read('app/globals.css');
  const tokens = new Map<string, string>();
  for (const m of css.matchAll(/^\s*(--cc-[a-z0-9-]+):\s*([^;]+);/gm)) {
    tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

/** Every Tailwind theme alias — what `bg-cc-*`, `rounded-cc-*` etc. may name. */
function declaredUtilityNames(): Set<string> {
  const css = read('app/globals.css');
  const names = new Set<string>();
  for (const m of css.matchAll(/^\s*--(?:color|radius|shadow|font)-(cc-[a-z0-9-]+):/gm)) {
    names.add(m[1]);
  }
  // `shadow-cc` has no suffix: the alias is `--shadow-cc`.
  if (/^\s*--shadow-cc:/m.test(css)) names.add('cc');
  return names;
}

test.describe('the new namespace uses tokens and nothing else', () => {
  test('no hex literal in any component of the design system', () => {
    const offenders: string[] = [];
    for (const { rel, text } of ccSources()) {
      text.split('\n').forEach((line, i) => {
        // A hex colour, anywhere: a class, an inline style, a constant.
        for (const m of line.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g)) {
          offenders.push(`${rel}:${i + 1}  ${m[0]} — ${line.trim().slice(0, 110)}`);
        }
      });
    }
    expect(
      offenders,
      `hex literals where a token belongs (DESIGN.md §1.1):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('no Tailwind palette colour in any component of the design system', () => {
    const PALETTES =
      'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
    const UTILITIES =
      'text|bg|border|ring|divide|outline|decoration|accent|caret|fill|stroke|shadow|from|via|to|placeholder';
    const pattern = new RegExp(`\\b(?:${UTILITIES})-(?:${PALETTES})-\\d{2,3}\\b`, 'g');

    // No exemptions, including for the gallery's own access-denied panel: a
    // guard with a hole in it is a guard with a hole in it.
    const offenders: string[] = [];
    for (const { rel, text } of ccSources()) {
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(pattern)) {
          offenders.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(
      offenders,
      `palette colours in the cc namespace — every colour there names a semantic token:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('every cc utility names a declared token', () => {
    const declared = declaredUtilityNames();
    expect(declared.size, 'no cc theme aliases found — the scan would pass vacuously').toBeGreaterThan(20);

    const pattern =
      /\b(?:text|bg|border|ring|outline|fill|stroke|decoration|placeholder|shadow|rounded|font)-(cc-[a-z0-9-]+)\b/g;
    const offenders: string[] = [];
    for (const { rel, text } of ccSources()) {
      text.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(pattern)) {
          if (!declared.has(m[1])) offenders.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(
      offenders,
      `these classes generate no CSS — the element silently inherits. Declare the token in @theme:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('the type floor is written down as a token', () => {
    expect(declaredTokens().get('--cc-text-min')).toBe('11px');
  });
});

test.describe('the tokens as the browser sees them', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('cctoken');
  });

  test('every declared token reaches :root, and the pairs hold their contrast', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const names = [
        'cc-page', 'cc-surface', 'cc-surface-muted', 'cc-surface-dark', 'cc-ink', 'cc-ink-muted',
        'cc-line', 'cc-field-border', 'cc-brand', 'cc-brand-strong', 'cc-brand-deep',
        'cc-brand-surface', 'cc-focus', 'cc-on-dark',
        'cc-success', 'cc-success-bg', 'cc-success-border',
        'cc-warning', 'cc-warning-bg', 'cc-warning-border', 'cc-warning-line',
        'cc-error', 'cc-error-bg', 'cc-error-border',
        'cc-information', 'cc-information-bg', 'cc-information-border',
        'cc-neutral', 'cc-neutral-bg', 'cc-neutral-border',
        'cc-overlay', 'cc-code-bg', 'cc-code-ink', 'cc-code-muted',
        'cc-code-keyword', 'cc-code-literal', 'cc-code-name',
      ];
      const out: Record<string, string> = {};
      for (const name of names) out[name] = style.getPropertyValue(`--${name}`).trim();
      return out;
    });

    const missing = Object.entries(tokens)
      .filter(([, value]) => value === '')
      .map(([name]) => name);
    expect(
      missing,
      `declared in app/globals.css but absent from the rendered :root — the utility that names them emits nothing:\n${missing.join('\n')}`,
    ).toEqual([]);

    // DESIGN.md §1.1, recomputed. Text needs 4.5:1; a border or a focus ring
    // that has to be seen needs 3:1 against the surface it sits on (WCAG 1.4.11).
    const TEXT_PAIRS: [string, string, string][] = [
      ['cc-ink', 'cc-surface', 'body ink on a card'],
      ['cc-ink-muted', 'cc-surface', 'secondary text on a card'],
      ['cc-ink', 'cc-page', 'body ink on the page'],
      ['cc-ink-muted', 'cc-surface-muted', 'secondary text on a row'],
      ['cc-on-dark', 'cc-brand-strong', 'white on the primary action'],
      ['cc-on-dark', 'cc-brand-deep', 'white on the pressed primary action'],
      ['cc-on-dark', 'cc-overlay', 'white on the overlay'],
      ['cc-on-dark', 'cc-surface-dark', 'white on the dark button'],
      ['cc-success', 'cc-success-bg', 'proven'],
      ['cc-warning', 'cc-warning-bg', 'provisional'],
      ['cc-error', 'cc-error-bg', 'failed'],
      ['cc-information', 'cc-information-bg', 'imported and confirmed'],
      ['cc-neutral', 'cc-neutral-bg', 'not determined'],
      ['cc-code-ink', 'cc-code-bg', 'code'],
      ['cc-code-muted', 'cc-code-bg', 'line numbers and comments'],
      ['cc-code-keyword', 'cc-code-bg', 'ABAP keywords'],
      ['cc-code-literal', 'cc-code-bg', 'literals'],
      ['cc-code-name', 'cc-code-bg', 'names'],
      ['cc-brand-strong', 'cc-brand-surface', 'secondary button text'],
    ];

    const LINE_PAIRS: [string, string, string][] = [
      ['cc-field-border', 'cc-surface', 'field and ghost-button border'],
      ['cc-focus', 'cc-surface', 'focus ring'],
      ['cc-focus', 'cc-page', 'focus ring on the page'],
      ['cc-brand-strong', 'cc-brand-surface', 'secondary button border'],
      ['cc-error', 'cc-surface', 'error value state and outline chip'],
      ['cc-warning-line', 'cc-surface', 'warning value state and dashed chip'],
      ['cc-success', 'cc-surface', 'success value state'],
      ['cc-information', 'cc-surface', 'information value state and outline chip'],
      ['cc-neutral', 'cc-surface', 'not-determined outline chip'],
      ['cc-code-name', 'cc-code-bg', 'focus ring on the code surface'],
    ];

    const failures: string[] = [];
    const measure = (pairs: [string, string, string][], floor: number, kind: string) => {
      for (const [fg, bg, what] of pairs) {
        const ratio = ratioOf(tokens[fg], tokens[bg]);
        if (ratio === null) {
          failures.push(`${kind} ${what}: could not read --${fg} (${tokens[fg]}) on --${bg} (${tokens[bg]})`);
          continue;
        }
        if (ratio < floor) {
          failures.push(
            `${kind} ${what}: --${fg} on --${bg} is ${round2(ratio)}:1, needs ${floor}:1`,
          );
        }
      }
    };

    measure(TEXT_PAIRS, 4.5, 'text');
    measure(LINE_PAIRS, 3, 'line');

    expect(
      failures,
      `token pairs below their WCAG floor (DESIGN.md §1.1):\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  test('nothing rendered is smaller than 11px', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const small = await page.locator('[data-cc-gallery] *').evaluateAll((els) =>
      els
        .filter((el) => {
          const text = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || '').trim())
            .join('');
          if (!text) return false;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
          return parseFloat(s.fontSize) < 11;
        })
        .slice(0, 20)
        .map((el) => {
          const s = getComputedStyle(el);
          return `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 60)}"> ${s.fontSize} — "${(el.textContent || '').trim().slice(0, 40)}"`;
        }),
    );

    expect(
      small,
      `type below the 11px floor of DESIGN.md §1.2:\n${small.join('\n')}`,
    ).toEqual([]);
  });

  test('every text on every rendered surface clears its contrast floor', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const measured = await page.locator('[data-cc-gallery] *').evaluateAll((els) => {
      /**
       * The opaque colour actually behind an element.
       *
       * Not "the first ancestor with a background": the highlighted code line is
       * a 28%-alpha blue over near-black, and stopping at it would compare the
       * text against a colour nobody can see. Layers are collected upwards until
       * one is opaque, then composited back down.
       */
      const backgroundOf = (start: Element): string => {
        const layers: number[][] = [];
        let node: Element | null = start;
        while (node) {
          const parsed = /rgba?\(([^)]+)\)/.exec(getComputedStyle(node).backgroundColor);
          if (parsed) {
            const parts = parsed[1].split(/[\s,/]+/).filter(Boolean).map(Number);
            const alpha = parts.length > 3 ? parts[3] : 1;
            if (alpha > 0) {
              layers.push([parts[0], parts[1], parts[2], alpha]);
              if (alpha >= 1) break;
            }
          }
          node = node.parentElement;
        }
        let r = 255;
        let g = 255;
        let b = 255;
        for (let i = layers.length - 1; i >= 0; i--) {
          const [lr, lg, lb, la] = layers[i];
          r = lr * la + r * (1 - la);
          g = lg * la + g * (1 - la);
          b = lb * la + b * (1 - la);
        }
        return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
      };

      return els
        .filter((el) => {
          const own = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => (n.textContent || '').trim())
            .join('');
          if (own.length < 2) return false;
          const s = getComputedStyle(el);
          return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.5;
        })
        .map((el) => {
          const s = getComputedStyle(el);
          return {
            color: s.color,
            background: backgroundOf(el),
            size: parseFloat(s.fontSize),
            weight: parseInt(s.fontWeight, 10) || 400,
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
            cls: (el.getAttribute('class') || '').slice(0, 60),
          };
        });
    });

    expect(measured.length, 'nothing measured — the check would be vacuous').toBeGreaterThan(40);

    const failures: string[] = [];
    for (const item of measured) {
      // WCAG large text: 18.66px bold, or 24px.
      const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700);
      const floor = large ? 3 : 4.5;
      const ratio = ratioOf(item.color, item.background);
      if (ratio === null) {
        failures.push(`unreadable colours: ${item.color} on ${item.background} — "${item.text}"`);
        continue;
      }
      if (ratio < floor) {
        failures.push(
          `${round2(ratio)}:1 (needs ${floor}) — ${item.color} on ${item.background}, ${item.size}px/${item.weight} "${item.text}" [${item.cls}]`,
        );
      }
    }

    expect(
      failures,
      `rendered text below its contrast floor:\n${failures.join('\n')}`,
    ).toEqual([]);
  });

  test('every focusable element shows the focus ring', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const focusToken = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--cc-focus').trim(),
    );
    const expected = parseColor(focusToken);
    expect(expected, `--cc-focus is not a colour: "${focusToken}"`).not.toBeNull();

    // Tabbed, not `el.focus()`. `:focus-visible` is a heuristic about how the
    // element got the focus, and a programmatic call is exactly the case where
    // browsers may decide not to show the ring — a check built on it can pass
    // while no keyboard user ever sees one.
    await page.locator('[data-cc-gallery] h1').first().click();

    const ringless: string[] = [];
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        if (!el.closest('[data-cc-gallery]')) return null;
        const s = getComputedStyle(el);
        return {
          width: s.outlineWidth,
          style: s.outlineStyle,
          color: s.outlineColor,
          tag: el.tagName,
          cls: el.getAttribute('class') || '',
        };
      });
      if (!ring) continue;
      seen += 1;
      if (parseFloat(ring.width) < 2 || ring.style === 'none') {
        ringless.push(
          `<${ring.tag.toLowerCase()} class="${ring.cls.slice(0, 60)}"> outline ${ring.width} ${ring.style} ${ring.color}`,
        );
      }
    }

    expect(seen, 'nothing inside the gallery took keyboard focus').toBeGreaterThan(10);
    expect(
      ringless,
      `no focus ring on keyboard focus (DESIGN.md §1.6 — never outline:none without a replacement):\n${ringless.join('\n')}`,
    ).toEqual([]);
  });
});
