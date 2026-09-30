import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';
import { TERMS_VERSION } from '../lib/constants';
import { adminSetDoc } from './helpers/admin-seed';
import { createGalleryAdmin, openGallery, type GalleryAdmin } from './helpers/cc-gallery';
import { signInViaLanding } from './helpers/sign-in';

/**
 * What waves 2 to 4 of block D left for the library — step D.31.
 *
 *   1. The terms gate is a `CcDialog` (its own spec, `terms-reaccept-gate`,
 *      executes it; the caret-on-Accept marker is checked here in the source).
 *   2. The shell and the floating helpers stack on the named layers, not on
 *      numbers of their own — and the skip link is not covered by the bar.
 *   3. "Back to workspace" does not print, for every stage, from `StageHeader`.
 *   4. Under `forced-colors` an SVG chart segment becomes an outline in the
 *      theme's colour, and "not determined" stays dashed.
 *   5. Library: a checkbox label with a link, `data-*` on checkbox, switch,
 *      field and link button, a link button that leaves the product, a text
 *      role for key figures, and the accordion's info reachable by keyboard.
 *
 * The rendered half runs on the gallery (section "Verdicts, figures and links
 * that leave") and, for print, on a seeded Economics stage.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
/** Code only — the prose in comments names the old values on purpose. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BARE_Z = /(?<![\w-])z-(?:\d+|\[[^\]]+\])(?![\w-])/g;

test.describe('D.31 in the source', () => {
  test('the shell and the floating helpers stack on the scale', () => {
    const expected: Record<string, string[]> = {
      'app/(app)/layout.tsx': ['sticky top-0 z-cc-sticky', 'focus:z-cc-float'],
      'components/GlossaryChatbot.tsx': ['bottom-4 z-cc-float', 'bottom-20 z-cc-float'],
      'components/GlossaryTerm.tsx': ['z-cc-popover', 'max-md:z-cc-overlay'],
      'components/VerificationRail.tsx': ['z-cc-float'],
      'components/CollapsibleAccordion.tsx': ['z-cc-popover'],
    };
    for (const [rel, classes] of Object.entries(expected)) {
      const src = code(rel);
      for (const cls of classes) expect(src, `${rel} should stack with ${cls}`).toContain(cls);
      const bare = [...src.matchAll(BARE_Z)].map((m) => m[0]);
      expect(bare, `${rel}: a number of its own instead of a layer of the scale`).toEqual([]);
    }
  });

  test('"Back to workspace" does not print, from the header every stage shares', () => {
    const header = code('components/StageHeader.tsx');
    // Both forms: the link, and the placeholder that holds its place.
    expect(header.match(/BACK_LINK_CLASS\} cc-no-print/g) ?? [], 'StageHeader: the back link prints').toHaveLength(2);
    const tco = read('app/(app)/project/[projectId]/tco/page.tsx');
    expect(tco, 'Economics still hides the back link by itself').not.toContain('[data-stage-back]');
  });

  test('a key figure is a text role, and Economics uses it', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/@utility cc-text-figure \{[^}]*font-size:\s*22px;[^}]*font-weight:\s*800;[^}]*tabular-nums/);
    const tco = read('app/(app)/project/[projectId]/tco/page.tsx');
    expect(tco).not.toMatch(/text-\[22px\] font-extrabold/);
    expect(tco.match(/cc-text-figure/g) ?? []).toHaveLength(3);
  });

  test('forced-colors has a rule for SVG chart segments', () => {
    const css = read('app/globals.css');
    const start = css.search(/@media \(forced-colors: active\) \{\s*\[data-cc-form\]/);
    expect(start, 'no forced-colors block for chips and charts').toBeGreaterThan(-1);
    const forced = css.slice(start);
    expect(forced).toMatch(/svg \[data-chart-segment\] \{\s*fill: Canvas;\s*stroke: CanvasText;/);
    expect(forced).toMatch(/svg \[data-chart-segment\]\[data-not-determined\] \{\s*stroke-dasharray:/);
  });

  test('the accordion names states, not colours, and so do its callers', () => {
    const acc = code('components/CollapsibleAccordion.tsx');
    expect(acc).toMatch(/badgeSeverity\?: 'neutral' \| 'warning' \| 'error'/);
    for (const rel of [
      'app/(app)/project/[projectId]/delivery/page.tsx',
      'components/analyze/AbcdClassificationPanel.tsx',
      'components/analyze/CodeInventoryTable.tsx',
      'components/analyze/DataCouplingTable.tsx',
      'components/analyze/ModuleHeatmap.tsx',
    ]) {
      const line = read(rel).split('\n').find((l) => l.includes('badgeSeverity='));
      expect(line, `${rel} no longer passes badgeSeverity`).toBeTruthy();
      expect(line!, `${rel} passes a colour name`).not.toMatch(/'(green|amber|red)'/);
    }
    // The info is its own button, not an icon inside the header button.
    expect(acc).toContain('data-accordion-info');
    expect(acc).not.toMatch(/<Info[^>]*onMouseEnter/);
  });

  test('a dialog without a field can name where the caret starts', () => {
    expect(read('components/cc/modal.ts')).toContain("'[data-cc-initial-focus]:not([disabled])'");
    expect(read('components/TermsReacceptGate.tsx')).toMatch(/data-terms-gate-accept data-cc-initial-focus=""/);
  });
});

test.describe('D.31 on the gallery', () => {
  let admin: GalleryAdmin;

  test.beforeAll(async () => {
    test.setTimeout(120 * 1000);
    admin = await createGalleryAdmin('cc-d31');
  });

  test('controls with markup and data names, a link that leaves, a key figure', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const demo = page.locator('[data-cc-demo="d31"]');
    await demo.scrollIntoViewIfNeeded();

    // The label carries a link, and is still the box's name.
    const box = demo.locator('input[type="checkbox"][data-cc-demo-checkbox="rich"]');
    await expect(box).toHaveCount(1);
    await expect(demo.getByRole('checkbox', { name: 'I have read the Terms' })).toHaveAttribute('data-cc-demo-checkbox', 'rich');
    await expect(demo.getByRole('link', { name: 'Terms', exact: true })).toHaveAttribute('href', '/terms');
    await box.check();
    await expect(box).toBeChecked();

    await expect(demo.getByRole('switch', { name: 'Show line anchors' })).toHaveAttribute('data-cc-demo-switch', 'anchors');
    await expect(demo.locator('[data-cc-demo-field="name"][data-cc-field]')).toHaveCount(1);

    const external = demo.locator('a[data-cc-demo-external]');
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(external).toHaveAttribute('data-cc-button', 'ghost');
    await expect(external.locator('[data-cc-external-mark]')).toBeVisible();
    await expect(
      demo.getByRole('link', { name: 'SAP Business Accelerator Hub (opens in a new tab)' }),
      'the new tab is not announced in the link name',
    ).toHaveCount(1);

    const figure = await demo.locator('[data-cc-demo-figure]').evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight, numeric: s.fontVariantNumeric };
    });
    expect(figure).toEqual({ size: '22px', weight: '800', numeric: 'tabular-nums' });
  });

  test('the accordion explains itself to a keyboard', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    const acc = page.locator('[data-cc-demo-accordion]');
    await acc.scrollIntoViewIfNeeded();
    const toggle = acc.getByRole('button', { name: /Code inventory/ }).first();
    await toggle.focus();
    await page.keyboard.press('Tab');
    const info = acc.locator('[data-accordion-info]');
    await expect(info, 'Tab from the header does not reach the info button').toBeFocused();
    const tip = acc.locator('[data-accordion-tooltip]');
    await expect(tip).toBeVisible();
    await expect(info).toHaveAttribute('aria-describedby', (await tip.getAttribute('id'))!);
    // Not clipped by the card: it opens above the header, outside the card, so
    // no box between it and the page may cut off what overflows.
    const clipping = await tip.evaluate((el) => {
      const stop = el.closest('[data-cc-demo-accordion]');
      const out: string[] = [];
      for (let n = el.parentElement; n && n !== stop; n = n.parentElement) {
        const o = getComputedStyle(n).overflow;
        if (o !== 'visible') out.push(`${n.className} (${o})`);
      }
      return out;
    });
    expect(clipping, 'a box around the explanation clips it').toEqual([]);

    await page.keyboard.press('Escape');
    await expect(tip, 'Escape does not close the explanation').toBeHidden();
    await expect(info).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(tip).toBeVisible();
    // The header toggle still toggles.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('the skip link is not covered by the shell bar', async ({ page }) => {
    test.setTimeout(180 * 1000);
    await openGallery(page, admin);
    await page.evaluate(() => window.scrollTo(0, 0));
    const skip = page.locator('[data-skip-link]');
    await skip.focus();
    await expect(skip).toBeVisible();
    const b = (await skip.boundingBox())!;
    const onSkip = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-skip-link]'),
      { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    );
    expect(onSkip, 'the focused skip link lies under the shell bar').toBe(true);
  });

  test('forced-colors: SVG segments are outlines in the theme colour, "no verdict" stays dashed', async ({ browser }) => {
    test.setTimeout(180 * 1000);
    const context = await browser.newContext({ forcedColors: 'active' });
    const page = await context.newPage();
    try {
      await openGallery(page, admin);
      const chart = page.locator('[data-cc-demo-verdict-chart]');
      await chart.scrollIntoViewIfNeeded();
      const segments = chart.locator('svg [data-chart-segment]');
      await expect(segments, 'the ring segments do not carry data-chart-segment into the SVG').toHaveCount(3);
      const styles = await segments.evaluateAll((els) =>
        els.map((el) => {
          const s = getComputedStyle(el);
          return { fill: s.fill, stroke: s.stroke, dash: s.strokeDasharray, nd: el.hasAttribute('data-not-determined') };
        }),
      );
      const system = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.color = 'CanvasText';
        probe.style.backgroundColor = 'Canvas';
        document.body.appendChild(probe);
        const s = getComputedStyle(probe);
        const out = { text: s.color, canvas: s.backgroundColor };
        probe.remove();
        return out;
      });
      for (const s of styles) {
        expect(s.fill, 'a segment kept its own fill under forced-colors').toBe(system.canvas);
        expect(s.stroke, 'a segment is not outlined in the theme text colour').toBe(system.text);
      }
      const nd = styles.filter((s) => s.nd);
      expect(nd, 'exactly one not-determined slice').toHaveLength(1);
      expect(nd[0].dash, '"no verdict" lost its dashes').not.toBe('none');
      for (const s of styles.filter((x) => !x.nd)) expect(s.dash).toBe('none');
    } finally {
      await context.close();
    }
  });
});

test.describe('D.31 on paper', () => {
  test('a stage prints without "Back to workspace"', async ({ page }) => {
    test.setTimeout(240 * 1000);
    const app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    const auth = getAuth(app);
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    } catch {
      /* already connected */
    }
    const email = `cc-d31-print-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@cleancore-test.io`;
    const password = `spec-${process.pid}-Aa1!`;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await adminSetDoc('users', uid, {
      firstName: 'Print', lastName: 'Stage', email, tier: 'pilot', status: 'approved',
      activatedAt: new Date(), transformationsUsed: 1, transformationsLimit: 5,
      termsVersionAccepted: TERMS_VERSION, mfaEnabled: false, createdAt: new Date(),
    });
    const id = `cc-d31-print-${Date.now()}`;
    await adminSetDoc('projects', id, {
      name: 'Print fixture', userId: uid, createdAt: new Date(), status: 'analyzed',
      legacyCode: "WRITE: / 'x'.", analysis: JSON.stringify({ cleanCoreScore: 62 }), cleanCoreScore: 62, activeRunId: 'r1',
    });
    await adminSetDoc(`projects/${id}/runs`, 'r1', {
      runId: 'r1', projectId: id, userId: uid, createdAt: new Date().toISOString(), status: 'completed', cleanCoreScore: 62,
    });

    await signInViaLanding(page as Page, email, password, { pauseMs: 3500 });
    await page.goto(`/project/${id}/tco`, { waitUntil: 'domcontentloaded' });
    const back = page.locator('[data-stage-back]');
    await expect(back, 'the stage has no way back on screen — the print check would prove nothing').toBeVisible({ timeout: 60000 });
    await page.emulateMedia({ media: 'print' });
    await expect(back, '"Back to workspace" prints').toBeHidden();
    await expect(page.locator('[data-stage-title]')).toBeVisible();
  });
});
