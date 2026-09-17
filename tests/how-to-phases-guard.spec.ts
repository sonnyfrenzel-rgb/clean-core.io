import { test, expect, type Page } from '@playwright/test';
import { PHASES } from '../lib/workflow-steps';
import { HOW_TO_PHASE_CONTENT } from '../lib/how-to-content';

/**
 * Roadmap 0.2, UX-102: /how-to describes the product that exists.
 *
 * The page kept two lists of its own — one for the `HowTo` JSON-LD that search
 * engines read, one for the walkthrough — and both said six phases where the
 * product has seven, in another order, with Node.js and TypeScript promised on a
 * track that generates RAP artefacts. Nothing tied either list to `PHASES` in
 * `lib/workflow-steps.ts`, the one order the stepper, the rail, the dashboard
 * and the delivery page read.
 *
 * Both checks read the page the server renders, not the source: a component can
 * carry a literal that never passes through the content module, and a module
 * nobody imports proves nothing.
 *
 *   1. The JSON-LD steps and the walkthrough are `PHASES` — count, order, titles.
 *   2. No sentence on the page names Node.js, TypeScript, package.json or XSUAA
 *      unless it says it is talking about the CAP track — neither in what a
 *      crawler reads (meta and JSON-LD) nor in what a reader can open. The
 *      walkthrough is walked phase by phase with every question opened, because
 *      most of its text is not in the DOM until someone clicks.
 */

const TRACK_WORDS = /Node\.js|TypeScript|package\.json|XSUAA/i;
const NAMES_THE_CAP_TRACK = /\bCAP track\b/i;

/** Sentences that promise a CAP-only technology without saying so. */
function unscopedTrackClaims(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter((s) => TRACK_WORDS.test(s) && !NAMES_THE_CAP_TRACK.test(s));
}

interface HowToSchema {
  '@type': string;
  description?: string;
  step?: Array<{ '@type': string; position: number; name: string; text: string }>;
}

/** The `HowTo` block among the JSON-LD the server sent, exactly as a crawler receives it. */
function howToSchemaIn(html: string): HowToSchema | undefined {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]) as HowToSchema | { '@graph': HowToSchema[] },
  );
  return blocks.flatMap((b) => ('@graph' in b ? b['@graph'] : [b])).find((b) => b['@type'] === 'HowTo');
}

/** Every string anywhere in a value. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

/** Click a phase in the index until the walkthrough shows it — a click before hydration is lost. */
async function openPhase(page: Page, key: string) {
  const slide = page.locator('[data-how-to-slide]');
  await expect(async () => {
    await page.locator(`[data-how-to-phase-index="${key}"]`).click();
    await expect(slide).toHaveAttribute('data-how-to-slide', key, { timeout: 1_000 });
  }).toPass({ timeout: 90_000 });
}

test.describe('the how-to page lists the phases the product has', () => {
  test('the content module has words for exactly the phases in PHASES', () => {
    expect(Object.keys(HOW_TO_PHASE_CONTENT).sort()).toEqual(PHASES.map((p) => p.key).sort());
    for (const phase of PHASES) {
      const words = HOW_TO_PHASE_CONTENT[phase.key];
      expect(words.summary.trim(), `${phase.key} has a summary`).not.toBe('');
      expect(words.questions.length, `${phase.key} has questions`).toBeGreaterThan(0);
    }
  });

  test('the HowTo JSON-LD the server renders is PHASES: count, order and titles', async ({ request }) => {
    test.setTimeout(240_000);
    const res = await request.get('/how-to', { timeout: 200_000 });
    expect(res.status()).toBe(200);
    const schema = howToSchemaIn(await res.text());
    expect(schema, 'the page renders a HowTo block').toBeTruthy();

    const steps = schema!.step ?? [];
    expect(steps.map((s) => s.name)).toEqual(PHASES.map((p) => p.label));
    expect(steps.map((s) => s.position)).toEqual(PHASES.map((p) => p.n));
    for (const s of steps) expect(s.text.trim(), `step ${s.name} has a text`).not.toBe('');
  });

  test('the walkthrough renders the same phases in the same order', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/how-to', { waitUntil: 'domcontentloaded', timeout: 200_000 });

    const index = page.locator('[data-how-to-phase-index]');
    await expect(index).toHaveCount(PHASES.length);
    expect(await index.evaluateAll((els) => els.map((el) => el.getAttribute('data-how-to-phase-index')))).toEqual(
      PHASES.map((p) => p.key),
    );
    expect((await index.allInnerTexts()).map((t) => t.replace(/^\s*\d+\s*/, '').trim())).toEqual(PHASES.map((p) => p.label));

    // Walked backwards on purpose: the first slide is what the server renders
    // anyway, so starting there would not show that the index drives the slide.
    for (const phase of [...PHASES].reverse()) {
      await openPhase(page, phase.key);
      await expect(page.locator('[data-how-to-slide-title]')).toHaveText(phase.label);
      await expect(page.locator('[data-how-to-slide]')).toContainText(`Phase ${phase.n} of ${PHASES.length}`);
    }
  });
});

test.describe('the how-to page promises no CAP-only technology on both tracks', () => {
  test('the check catches the sentences that were there and lets a scoped one through', () => {
    // Both from the page as it was on 17.09.2026.
    expect(unscopedTrackClaims('Audit the code conversion. The editor translates legacy ABAP statements into modern Node.js CAP TypeScript services.')).toHaveLength(1);
    expect(unscopedTrackClaims("Click 'Download Handover Package' to export a complete ZIP bundle with package.json configs, tests, and markdown documentation.")).toHaveLength(1);
    expect(unscopedTrackClaims('On the CAP track it is asked for a Node.js (TypeScript) project.')).toEqual([]);
  });

  test('what a crawler reads — the descriptions and the HowTo block — names no CAP-only technology unscoped', async ({ page, request }) => {
    test.setTimeout(240_000);
    const html = await (await request.get('/how-to', { timeout: 200_000 })).text();
    const schema = howToSchemaIn(html);
    expect(schema, 'the page renders a HowTo block').toBeTruthy();
    const corpus = stringsIn(schema);

    await page.goto('/how-to', { waitUntil: 'domcontentloaded', timeout: 200_000 });
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) {
      const content = await page.locator(selector).getAttribute('content');
      expect(content, `${selector} is rendered`).toBeTruthy();
      corpus.push(content!);
    }

    const offenders = [...new Set(corpus.flatMap(unscopedTrackClaims))];
    expect(offenders, `sentences a crawler reads on /how-to that promise a CAP-only technology on both tracks:\n${offenders.join('\n')}`).toEqual([]);
  });

  test('what a reader can open — every phase, every answer — names no CAP-only technology unscoped', async ({ page }) => {
    test.setTimeout(300_000);
    const corpus: string[] = [];
    await page.goto('/how-to', { waitUntil: 'domcontentloaded', timeout: 200_000 });

    // Every phase, with every question opened: most of the walkthrough is not in
    // the DOM until someone clicks.
    let answersOpened = 0;
    for (const phase of PHASES) {
      await openPhase(page, phase.key);
      const questions = page.locator('[data-how-to-slide] details');
      const count = await questions.count();
      expect(count, `${phase.key} shows its questions`).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const question = questions.nth(i);
        // Retried for the same reason as the phase click: a click that lands
        // before hydration opens the disclosure and the first render closes it
        // again, which is a race in the test and not a defect in the page.
        await expect(async () => {
          if (await question.evaluate((el: HTMLDetailsElement) => !el.open)) await question.locator('summary').click();
          await expect(question).toHaveAttribute('open', '', { timeout: 1_000 });
        }).toPass({ timeout: 30_000 });
        answersOpened += 1;
      }
      corpus.push(await page.locator('[data-how-to-page]').innerText());
    }
    expect(answersOpened).toBeGreaterThanOrEqual(PHASES.length);

    const offenders = [...new Set(corpus.flatMap(unscopedTrackClaims))];
    expect(offenders, `sentences a reader can open on /how-to that promise a CAP-only technology on both tracks:\n${offenders.join('\n')}`).toEqual([]);
  });
});
