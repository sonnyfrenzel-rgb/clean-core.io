import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  PROVENANCE,
  PROVENANCE_LABELS,
  PROVENANCE_VALUES,
  RETIRED_PROVENANCE_WORDINGS,
  isProvenanceLabel,
} from '../lib/provenance';
import { OBJECT_STATUS_VALUES } from '../lib/object-status';
import { SEVERITY, SEVERITY_VALUES } from '../lib/severity';
import { createGalleryAdmin, openGallery, GALLERY_PATH, type GalleryAdmin } from './helpers/cc-gallery';

/**
 * One provenance list, and no badge that says anything else.
 *
 * Before `lib/provenance.ts` the product wrote provenance freehand. Nine
 * concepts, about twenty spellings: "AI Generated" and "Model estimate" and
 * "Simulated" were three different claims wearing one another's clothes, and
 * "Signed off" — a person's word — was green next to "Signed run", which is a
 * cryptographic fact. For an audience whose whole question is *says who?*, that
 * is not untidy, it is the product failing at its one job.
 *
 * The mechanism is that `CcProvenanceChip` has no `label` prop: it takes a
 * value and reads the word from the list. So a wrong badge cannot be written,
 * only mis-valued, and TypeScript catches that. This file checks the mechanism
 * is still the mechanism, and then checks the rendered result — because the
 * form is the second cue (ADR-017) and a form only exists once it is painted.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/**
 * Everything roadmap 1.5 built, plus the workspace shell roadmap 1.4 built on
 * it. The shell is the first screen that states provenance about a real
 * project, so it is the first place a freehand badge would actually be read.
 */
const CC_SOURCE_DIRS = [
  'components/cc',
  'app/(app)/admin/design-system',
  'components/workspace',
  // Roadmap 2.5: the process map is the second screen built on these
  // components, and its legend is a provenance legend — the one place where a
  // freehand word for "reconstructed" would be read as the definition of the
  // vocabulary rather than a use of it.
  'components/process-map',
];

function ccSources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
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
  for (const dir of CC_SOURCE_DIRS) walk(path.resolve(ROOT, dir));
  return out;
}

/**
 * A severity word with a colour of its own — the free badge ADR-049 replaces.
 *
 * A source heuristic: a line that names one of the five words *as a value* —
 * a string literal (`'High'`), an object key (`High:`) or JSX text (`>High<`) —
 * with a colour class or a hex literal on the same line or the two either side.
 * Comments are stripped first; they carry prose about severities on purpose.
 * `components/cc/Identifier.tsx` never matches, because `CcSeverity` takes its
 * classes from `STATE_CLASSES` rather than spelling them next to a word.
 */
const SEVERITY_TOKEN = /(['"`>]\s*(Critical|High|Medium|Low|Info)\s*['"`<])|(^|[\s{,])(Critical|High|Medium|Low|Info)\s*:\s*['"`#]/;
const COLOUR =
  /(?<![\w-])(?:bg|text|border|fill|stroke)-(?:cc-(?:error|warning|information|neutral|success)|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3})|#[0-9a-fA-F]{3,8}\b/;

function freeSeverityBadges(text: string): { line: number; snippet: string }[] {
  // Comments go, but their newlines stay, so a hit keeps its line number.
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lines = code.split('\n');
  const hits: { line: number; snippet: string }[] = [];
  lines.forEach((line, i) => {
    if (!SEVERITY_TOKEN.test(line)) return;
    const window = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
    if (COLOUR.test(window)) hits.push({ line: i + 1, snippet: line.trim().slice(0, 100) });
  });
  return hits;
}

test.describe('the list itself', () => {
  test('nine values, each with a word, an icon, a state and a form', () => {
    expect(PROVENANCE_VALUES).toHaveLength(9);
    for (const value of PROVENANCE_VALUES) {
      const entry = PROVENANCE[value];
      expect(entry.label.trim().length, `${value} has no label`).toBeGreaterThan(0);
      expect(entry.icon.trim().length, `${value} has no icon`).toBeGreaterThan(0);
      expect(entry.key, `${value} has no message key`).toMatch(/^provenance\./);
      expect(entry.meaning.trim().length, `${value} does not say what it means`).toBeGreaterThan(10);
    }
    expect(new Set(PROVENANCE_LABELS).size, 'two values share a label').toBe(9);
  });

  test('green belongs to `proven` and to nothing else', () => {
    const green = PROVENANCE_VALUES.filter((v) => PROVENANCE[v].state === 'success');
    expect(green, 'success is the state of Proven alone — DESIGN.md §1.1').toEqual(['proven']);
  });

  test('a claim is not a proof, and stale is not an error', () => {
    // Confirmed is a self-declaration of the signed-in account (ADR-007).
    expect(PROVENANCE.confirmed.state).toBe('information');
    // Stale means recompute, not wrong.
    expect(PROVENANCE.stale.state).toBe('warning');
    expect(PROVENANCE['not-determined'].state).toBe('neutral');
  });

  test('the three forms carry the values DESIGN.md §4 gives them', () => {
    const byForm = (form: string) => PROVENANCE_VALUES.filter((v) => PROVENANCE[v].form === form);
    expect(byForm('filled')).toEqual(['proven', 'confirmed', 'stale']);
    expect(byForm('outline')).toEqual(['reconstructed', 'imported', 'not-determined']);
    expect(byForm('dashed')).toEqual(['proposed', 'simulation', 'demonstrated-mock']);
  });

  test('the fifth list: five severities, never green, colours as ADR-049 gives them', () => {
    expect(SEVERITY_VALUES).toEqual(['Critical', 'High', 'Medium', 'Low', 'Info']);
    const states = Object.fromEntries(SEVERITY_VALUES.map((v) => [v, SEVERITY[v].state]));
    expect(states).toEqual({
      Critical: 'error',
      High: 'error',
      Medium: 'warning',
      Low: 'neutral',
      Info: 'information',
    });
    for (const value of SEVERITY_VALUES) {
      // The word is the value: a severity is printed exactly as the engine writes it.
      expect(SEVERITY[value].label).toBe(value);
      expect(SEVERITY[value].key).toMatch(/^severity\./);
    }
  });

  test('the retired wordings are recognised as not being labels', () => {
    for (const wording of Object.keys(RETIRED_PROVENANCE_WORDINGS)) {
      expect(isProvenanceLabel(wording), `"${wording}" is being accepted as a label`).toBe(false);
    }
    for (const label of PROVENANCE_LABELS) {
      expect(isProvenanceLabel(label)).toBe(true);
      expect(isProvenanceLabel(label.toUpperCase()), 'a second spelling is a second value').toBe(true);
    }
  });
});

test.describe('nothing can write a badge of its own', () => {
  test('the chip takes a value, never a label', () => {
    const src = read('components/cc/ProvenanceChip.tsx');
    expect(src, 'CcProvenanceChip grew a free-text label').not.toMatch(/\blabel\s*[?]?\s*:\s*(string|React\.ReactNode)/);
    expect(src, 'CcProvenanceChip grew free children').not.toMatch(/children\s*[?]?\s*:/);
    expect(src, 'the label no longer comes from lib/provenance.ts').toContain("from '@/lib/provenance'");
  });

  test('only the chip emits a provenance badge', () => {
    const emitters = ccSources()
      .filter((f) => /data-provenance=/.test(f.text))
      .map((f) => f.rel);
    expect(
      emitters,
      `more than one component paints a provenance badge:\n${emitters.join('\n')}`,
    ).toEqual(['components/cc/ProvenanceChip.tsx']);
  });

  test('only CcSeverity emits a severity identifier', () => {
    const emitters = ccSources()
      .filter((f) => /data-cc-severity=|data-cc-identifier="severity"/.test(f.text))
      .map((f) => f.rel);
    expect(emitters, `more than one component paints a severity:\n${emitters.join('\n')}`).toEqual([
      'components/cc/Identifier.tsx',
    ]);
    const src = read('components/cc/Identifier.tsx');
    expect(src, 'CcSeverity no longer reads its word from lib/severity.ts').toContain("from '@/lib/severity'");
    const props = src.match(/export function CcSeverity\(\{[^}]*\}:\s*\{([^}]*)\}/);
    expect(props, 'CcSeverity is not declared as a component with a props literal').not.toBeNull();
    expect(props![1], 'CcSeverity grew a free-text label or children').not.toMatch(/\b(label|children)\b/);
  });

  test('the free-severity detector recognises the badges the product paints today', () => {
    // Written the way they stand in the Altbestand on 24.09.2026 — the targets
    // of the Lane B/C steps. If the detector stops seeing these, the guard
    // below passes for the wrong reason.
    const painted = [
      `  Critical: 'bg-red-100 text-red-700',`,
      `ef.severity === 'Critical' ? 'bg-red-100 text-red-700' :`,
      `<span className={\`rounded-full text-[10px] \${colors[gap.severity as 'High' | 'Medium' | 'Low'] || 'bg-slate-50 text-slate-700'}\`}>`,
      `const sevBg = g.severity === 'High' ? '#ffebe6' : '#e6fcff';`,
      `<span className="rounded bg-cc-error-bg px-2 text-cc-error">High</span>`,
    ];
    for (const sample of painted) {
      expect(freeSeverityBadges(sample).length, `not recognised: ${sample}`).toBeGreaterThan(0);
    }
    const fine = [
      `<CcSeverity value="High" />`,
      `{row.id} · {row.severity}`,
      `<span className="text-cc-ink-muted">Low usage</span>`,
      `const SAMPLE = { Critical: 2, High: 5 };`,
    ];
    for (const sample of fine) {
      expect(freeSeverityBadges(sample), `a false alarm: ${sample}`).toEqual([]);
    }
  });

  test('no severity is painted freehand in the new namespace', () => {
    const offenders: string[] = [];
    for (const { rel, text } of ccSources()) {
      for (const hit of freeSeverityBadges(text)) offenders.push(`${rel}:${hit.line}: ${hit.snippet}`);
    }
    expect(
      offenders,
      `a severity with a colour of its own — use CcSeverity (DESIGN.md §4.1, ADR-049):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  test('no retired wording appears as text in the new namespace', () => {
    const offenders: string[] = [];
    for (const { rel, text } of ccSources()) {
      for (const wording of Object.keys(RETIRED_PROVENANCE_WORDINGS)) {
        // The wording at the start of a string literal or of a JSX text node.
        // Not "anywhere in the file": `lib/provenance.ts` lists them on purpose,
        // and so does this spec.
        const pattern = new RegExp(`['">]\\s*${wording.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
        if (pattern.test(text)) {
          offenders.push(`${rel}: "${wording}" — say ${RETIRED_PROVENANCE_WORDINGS[wording]} instead`);
        }
      }
    }
    expect(
      offenders,
      `provenance written freehand (DESIGN.md §4):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

test.describe('and the rendered badge says one of the nine', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccprov');
  });

  test('every badge on the page carries a label from the list, and its form', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const chips = await page.locator('[data-provenance]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          value: el.getAttribute('data-provenance') || '',
          form: el.getAttribute('data-cc-form') || '',
          label: (el.querySelector('[data-cc-provenance-label]')?.textContent || '').trim(),
          icons: el.querySelectorAll('svg').length,
          radius: s.borderTopLeftRadius,
          borderStyle: s.borderTopStyle,
          borderWidth: s.borderTopWidth,
          background: s.backgroundColor,
          color: s.color,
        };
      }),
    );

    expect(chips.length, 'no provenance chips rendered').toBeGreaterThanOrEqual(9);

    const wrongLabel = chips.filter((c) => !PROVENANCE_LABELS.includes(c.label));
    expect(
      wrongLabel.map((c) => `${c.value} → "${c.label}"`),
      'a badge says something that is not one of the nine',
    ).toEqual([]);

    const mismatched = chips.filter(
      (c) => PROVENANCE[c.value as keyof typeof PROVENANCE]?.form !== c.form,
    );
    expect(
      mismatched.map((c) => `${c.value}: rendered ${c.form}, list says ${PROVENANCE[c.value as keyof typeof PROVENANCE]?.form}`),
      'a chip is painted in a form the list does not give it',
    ).toEqual([]);

    // Word and icon, every time — §4. A chip without its icon does not read on
    // a printout or to a screen reader that does not announce colour.
    const iconless = chips.filter((c) => c.icons === 0).map((c) => c.value);
    expect(iconless, 'chips with no icon').toEqual([]);

    // The pill is the provenance form and nothing else wears it.
    const notPill = chips.filter((c) => parseFloat(c.radius) < 100).map((c) => `${c.value} ${c.radius}`);
    expect(notPill, 'a provenance chip is a pill (DESIGN.md §1.4)').toEqual([]);

    // The three forms are actually three, as painted.
    const filled = chips.filter((c) => c.form === 'filled');
    const outline = chips.filter((c) => c.form === 'outline');
    const dashed = chips.filter((c) => c.form === 'dashed');
    expect(filled.length, 'no filled chip rendered').toBeGreaterThan(0);
    expect(outline.length, 'no outline chip rendered').toBeGreaterThan(0);
    expect(dashed.length, 'no dashed chip rendered').toBeGreaterThan(0);

    for (const chip of dashed) {
      expect(chip.borderStyle, `${chip.value} is dashed in the list but solid on screen`).toBe('dashed');
    }
    for (const chip of [...filled, ...outline]) {
      expect(chip.borderStyle, `${chip.value} is not dashed in the list but is on screen`).toBe('solid');
    }
    // Filled has a fill; outline and dashed stand on the surface.
    for (const chip of filled) {
      expect(chip.background, `${chip.value} is filled in the list but transparent on screen`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
    }
    // The token's *value*, not its spelling. A custom property comes back as
    // authored, and the production build minifies `#ffffff` to `#fff` — so this
    // compared green on the dev server and red in CI, for a colour that never
    // changed (QA review of 1d3068c8020f). Resolved through the browser, both
    // spellings answer `rgb(255, 255, 255)`, which is also the form the computed
    // background below is compared against.
    const surface = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--cc-surface)';
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    });
    expect(surface, 'the surface token is not the white the chips stand on').toBe('rgb(255, 255, 255)');
    for (const chip of [...outline, ...dashed]) {
      expect(chip.background, `${chip.value} should stand on the surface, not on a fill`).toBe(
        'rgb(255, 255, 255)',
      );
    }
  });

  test('the five vocabularies do not look like one another', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const shapes = await page.evaluate(() => {
      const shapeOf = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const s = getComputedStyle(el);
        return {
          radius: s.borderTopLeftRadius,
          borderWidth: s.borderTopWidth,
          borderStyle: s.borderTopStyle,
          icons: el.querySelectorAll('svg').length,
        };
      };
      return {
        provenance: shapeOf('[data-provenance]'),
        objectStatus: shapeOf('[data-cc-object-status]'),
        identifier: shapeOf('[data-cc-identifier]'),
        tag: shapeOf('[data-cc-tag="rule-property"]'),
        severity: shapeOf('[data-cc-identifier="severity"]'),
      };
    });

    expect(shapes.provenance, 'no provenance chip').not.toBeNull();
    expect(shapes.objectStatus, 'no object status').not.toBeNull();
    expect(shapes.identifier, 'no identifier').not.toBeNull();
    expect(shapes.tag, 'no rule-property tag').not.toBeNull();
    expect(shapes.severity, 'no severity').not.toBeNull();

    // Pill with an icon.
    expect(parseFloat(shapes.provenance!.radius)).toBeGreaterThan(100);
    expect(shapes.provenance!.icons).toBeGreaterThan(0);

    // Text with a dot: no outline at all, so it can never read as a chip (ADR-023).
    expect(
      parseFloat(shapes.objectStatus!.borderWidth),
      'an object status grew a border — it would read as a provenance chip',
    ).toBe(0);

    // Identifier: a 4px rectangle.
    expect(shapes.identifier!.radius).toBe('4px');

    // Tag: a 4px rectangle with no icon.
    expect(shapes.tag!.radius).toBe('4px');
    expect(shapes.tag!.icons, 'a rule-property tag has no icon').toBe(0);

    // Severity: an identifier like the level (ADR-049) — a 4px rectangle with a
    // visible edge and no icon, so it is never a pill and never a dot.
    expect(shapes.severity!.radius, 'a severity is a 4px identifier, not a pill').toBe('4px');
    expect(parseFloat(shapes.severity!.borderWidth), 'a severity has lost its edge').toBeGreaterThan(0);
    expect(shapes.severity!.borderStyle).toBe('solid');
    expect(shapes.severity!.icons, 'a severity carries its word, not an icon').toBe(0);
  });

  test('every object status is text as well as colour', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const statuses = await page.locator('[data-cc-object-status]').evaluateAll((els) =>
      els.map((el) => ({
        value: el.getAttribute('data-cc-object-status') || '',
        label: (el.querySelector('[data-cc-object-status-label]')?.textContent || '').trim(),
      })),
    );
    expect(statuses.length).toBeGreaterThanOrEqual(OBJECT_STATUS_VALUES.length);
    const wordless = statuses.filter((s) => s.label.length === 0).map((s) => s.value);
    expect(wordless, 'a status is a colour with no word (DESIGN.md §2.4)').toEqual([]);
  });

  test('`--cc-success` paints only what is actually backed', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const strays = await page.evaluate(() => {
      const success = getComputedStyle(document.documentElement)
        .getPropertyValue('--cc-success')
        .trim();
      // #047857 as the browser reports it.
      const asRgb = (hex: string) => {
        const n = parseInt(hex.replace('#', ''), 16);
        return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      };
      const target = asRgb(success);
      const allowed =
        '[data-provenance="proven"], [data-cc-object-status="done"], [data-cc-message-strip="success"], [data-cc-value-state="success"], [data-cc-run-stage="done"]';

      return Array.from(document.querySelectorAll('[data-cc-gallery] *'))
        .filter((el) => getComputedStyle(el).color === target)
        .filter((el) => !el.closest(allowed))
        .slice(0, 10)
        .map(
          (el) =>
            `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 60)}"> "${(el.textContent || '').trim().slice(0, 40)}"`,
        );
    });

    expect(
      strays,
      `green means proven in the workspace (DESIGN.md §1.1, ADR-007). These are green without being backed:\n${strays.join('\n')}`,
    ).toEqual([]);
  });

  test('and no chip wears the shape of the primary action', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);

    const strays = await page.evaluate(() => {
      const strong = getComputedStyle(document.documentElement)
        .getPropertyValue('--cc-brand-strong')
        .trim();
      const n = parseInt(strong.replace('#', ''), 16);
      const target = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
      return Array.from(document.querySelectorAll('[data-cc-form]'))
        .filter((el) => getComputedStyle(el).backgroundColor === target)
        .map((el) => el.getAttribute('data-provenance') || '?');
    });

    expect(
      strays,
      'the primary action has a form no chip has (DESIGN.md §1.1) — these chips took it',
    ).toEqual([]);
  });
});

test.describe('the forms survive where colour stops', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    admin = await createGalleryAdmin('ccforced');
  });

  test('filled, outline and dashed stay three under forced-colors', async ({ browser }) => {
    test.setTimeout(180 * 1000);
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    await openGallery(page, admin);

    const byForm = await page.locator('[data-provenance]').evaluateAll((els) => {
      const out: Record<string, { width: string; style: string }[]> = {};
      for (const el of els) {
        const s = getComputedStyle(el);
        const form = el.getAttribute('data-cc-form') || '?';
        (out[form] ||= []).push({ width: s.borderTopWidth, style: s.borderTopStyle });
      }
      return out;
    });

    expect(Object.keys(byForm).sort()).toEqual(['dashed', 'filled', 'outline']);
    // The fill is gone here, so `filled` has to say "settled" with a thicker line.
    for (const chip of byForm.filled) expect(parseFloat(chip.width)).toBeGreaterThanOrEqual(2);
    for (const chip of byForm.outline) expect(chip.style).toBe('solid');
    for (const chip of byForm.dashed) expect(chip.style).toBe('dashed');
    for (const chip of byForm.outline) expect(parseFloat(chip.width)).toBeLessThan(2);

    await context.close();
  });

  test('and in print, where the word is all there is', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.emulateMedia({ media: 'print' });

    const chips = await page.locator('[data-provenance]').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          form: el.getAttribute('data-cc-form') || '',
          width: s.borderTopWidth,
          background: s.backgroundColor,
          label: (el.querySelector('[data-cc-provenance-label]')?.textContent || '').trim(),
          icons: el.querySelectorAll('svg').length,
        };
      }),
    );

    expect(chips.length).toBeGreaterThanOrEqual(9);
    for (const chip of chips) {
      expect(chip.background, 'a printed chip has no fill (DESIGN.md §7.1)').toBe('rgb(255, 255, 255)');
      expect(chip.label.length, 'a printed chip still carries its word').toBeGreaterThan(0);
      expect(chip.icons, 'a printed chip still carries its icon').toBeGreaterThan(0);
      if (chip.form === 'filled') expect(parseFloat(chip.width)).toBeGreaterThanOrEqual(2);
    }

    await page.emulateMedia({ media: 'screen' });
  });
});

test.describe('and the page it all stands on is not public', () => {
  test('a signed-out visitor is not shown the design system', async ({ page }) => {
    await page.goto(GALLERY_PATH, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const visible = await page.locator('[data-cc-gallery]').count();
    expect(visible, 'the gallery renders without an admin account').toBe(0);
  });
});
