import { test, expect, type Page } from './helpers/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  NO_PROGRESS,
  analyzeStage,
  markLaterToolOpened,
  markWalked,
  progressKeys,
  progressOfSnapshot,
  progressSnapshot,
  readProgress,
  setNextHidden,
  softGateShown,
  whatNextOpenAt,
  whatNextShown,
  type ProgressStore,
} from '../lib/analyze-progress';
import { WALKED_BEFORE } from '../lib/messages/analyze-business';
import { PHASE_PURPOSE } from '../lib/workflow-steps';
import { seedLayoutProject } from './helpers/analyze-layout';
import { signInThroughForm } from './helpers/seed-project';

/**
 * After the walk-through — plan `docs/design/analyze-business-first-plan.md` §4.2, AB-4 (O1, O8, N9, P6, P8; mockup
 * states 6, 9, 9b, 10 and 17; ADR-118). Owner decisions 06.11.2026: "Analysis-only is a complete outcome. Two equal
 * endings"; the gate is soft — "Best after the business walk-through", nothing locked, no confirmation step; after
 * the tour a lightweight card "What you can do next", whose "Hide" is remembered per project in the browser only.
 *
 * Server-free: the progress model (`lib/analyze-progress.ts`) against a store, the two components rendered to static
 * markup, the source guards — and, in a browser with real `localStorage` on an intercepted origin (no server), "Hide"
 * surviving a reload with a second project unaffected and nothing sent anywhere. The rendered half (`rendered:` in the
 * title) needs the emulators and a server.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const OUT = path.join(ROOT, 'tmp', 'analyze-endings', String(process.pid));

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(OUT, 'node', `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** A browser's storage, as a map: what one tab writes, the next page load reads. */
function memoryStore(): ProgressStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/* ------------------------------------------------------------ the progress model */

test.describe('the progress model, in the browser only (pure)', () => {
  test('walked: the last station shown once counts; the browser keeps that it happened, never the day (O1, privacy policy 1.3)', () => {
    const store = memoryStore();
    expect(readProgress(store, 'p1')).toEqual(NO_PROGRESS);
    expect(markWalked(store, 'p1')).toBe(true);
    expect(markWalked(store, 'p1')).toBe(false);
    expect(readProgress(store, 'p1').walked).toBe(true);
    // Owner decision 15.11.2026 (variant A): the stored value is a constant, and nothing in it is a date or a time.
    const stored = store.data.get('cc.analyze.walked.p1');
    expect(stored).toBe('1');
    expect(stored).not.toMatch(/\d{4}|-|:|T|Z/);
    // A day an earlier build wrote still counts as walked; an empty value does not.
    const older = memoryStore();
    older.setItem('cc.analyze.walked.p1', '2026-11-13');
    expect(readProgress(older, 'p1').walked).toBe(true);
    expect(markWalked(older, 'p1')).toBe(false);
    older.setItem('cc.analyze.walked.p2', '');
    expect(readProgress(older, 'p2').walked).toBe(false);
    // The return visit names no day, and the module has no way to write or show one.
    expect(WALKED_BEFORE).toBe('Welcome back · you walked through it before');
    expect(WALKED_BEFORE).not.toMatch(/\d/);
    const source = read('lib/analyze-progress.ts');
    expect(source).not.toMatch(/new Date|getFullYear|getMonth|getDate|toISOString|Date\.now|walkedDayLabel|dayOf/);
    for (const rel of ['hooks/useAnalyzeProgress.ts', 'components/analyze/AnalyzeBusiness.tsx', 'components/demo/DemoAnalyzeBusiness.tsx', 'lib/messages/analyze-business.ts']) {
      expect(read(rel), rel).not.toMatch(/walkedDayLabel|walkedOnDay|walkedOn|walked through on/);
    }
  });

  test('"Hide" survives a reload, and a second project is unaffected (N9)', () => {
    const store = memoryStore();
    markWalked(store, 'p1');
    markWalked(store, 'p2');
    expect(setNextHidden(store, 'p1', true)).toBe(true);
    // A reload: a new page reads the same storage.
    const reloaded = memoryStore();
    for (const [k, v] of store.data) reloaded.setItem(k, v);
    expect(readProgress(reloaded, 'p1').nextHidden).toBe(true);
    expect(whatNextShown(readProgress(reloaded, 'p1'))).toBe(false);
    expect(readProgress(reloaded, 'p2').nextHidden).toBe(false);
    expect(whatNextShown(readProgress(reloaded, 'p2'))).toBe(true);
    // The quiet link brings it back.
    setNextHidden(reloaded, 'p1', false);
    expect(whatNextShown(readProgress(reloaded, 'p1'))).toBe(true);
    expect(reloaded.data.has('cc.analyze.nextHidden.p1')).toBe(false);
    // Keys per project, under the names the plan gives.
    expect(progressKeys('p1')).toEqual({ walked: 'cc.analyze.walked.p1', nextHidden: 'cc.analyze.nextHidden.p1', toolOpened: 'cc.analyze.toolOpened.p1' });
  });

  test('a store that refuses reads "nothing yet" and writes nothing, silently', () => {
    const broken: ProgressStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readProgress(broken, 'p1')).toEqual(NO_PROGRESS);
    expect(markWalked(broken, 'p1')).toBe(false);
    expect(setNextHidden(broken, 'p1', true)).toBe(false);
    expect(markLaterToolOpened(broken, 'p1')).toBe(false);
    expect(readProgress(null, 'p1')).toEqual(NO_PROGRESS);
  });

  test('the page states: ready, tour, done this visit, a later return; the soft gate until walked; the card after', () => {
    const walked = { ...NO_PROGRESS, walked: true };
    expect(analyzeStage({ progress: NO_PROGRESS, touring: false, finishedThisVisit: false })).toBe('ready');
    expect(analyzeStage({ progress: NO_PROGRESS, touring: true, finishedThisVisit: false })).toBe('tour');
    expect(analyzeStage({ progress: walked, touring: false, finishedThisVisit: true })).toBe('done');
    expect(analyzeStage({ progress: walked, touring: false, finishedThisVisit: false })).toBe('return');
    expect(softGateShown(NO_PROGRESS)).toBe(true);
    expect(softGateShown(walked)).toBe(false);
    expect(whatNextShown(NO_PROGRESS)).toBe(false);
    expect(whatNextShown(walked)).toBe(true);
    // Open from 1024 px; one collapsed line at 768 px and on a phone (the 4.1 adjustment (1)).
    expect(whatNextOpenAt(1440)).toBe(true);
    expect(whatNextOpenAt(1024)).toBe(true);
    expect(whatNextOpenAt(1023)).toBe(false);
    expect(whatNextOpenAt(768)).toBe(false);
    expect(whatNextOpenAt(390)).toBe(false);
    // The snapshot round-trips.
    for (const p of [NO_PROGRESS, walked, { walked: true, nextHidden: true, laterToolOpened: true }]) {
      expect(progressOfSnapshot(progressSnapshot(p))).toEqual(p);
    }
  });

  test('no Firestore write, no server field, no call: the progress, its hook, the endings and the card', () => {
    for (const rel of ['lib/analyze-progress.ts', 'hooks/useAnalyzeProgress.ts', 'components/analyze/AnalyzeEndings.tsx', 'components/analyze/WhatNextCard.tsx']) {
      expect(read(rel), rel).not.toMatch(/firebase|firestore|getDb|setDoc|updateDoc|addDoc|fetch\(|\/api\//);
    }
    // The page writes the walk-through to the browser through the hook, and nowhere else.
    const business = read('components/analyze/AnalyzeBusiness.tsx');
    expect(business).toContain("useAnalyzeProgress(projectId || null)");
    expect(business).not.toMatch(/localStorage/);
  });
});

/* ------------------------------------------------------------ the two endings */

test.describe('the two endings (server-free render)', () => {
  const props = { owner: true, rules: 7, designHref: '/project/p1/design', anotherHref: '/dashboard' };

  test('equal: both secondary, both links — nothing primary, nothing locked, no confirmation', async () => {
    const Endings = await load('components/analyze/AnalyzeEndings.tsx');
    for (const variant of ['compact', 'full'] as const) {
      const html = renderToStaticMarkup(React.createElement(Endings, { ...props, variant }));
      const opens = [...html.matchAll(/<a [^>]*data-analyze-ending-open="(redesign|another)"[^>]*>/g)];
      expect(opens.map((m) => m[1]).sort(), variant).toEqual(['another', 'redesign']);
      for (const [tag] of opens) expect(tag, variant).toContain('data-cc-button="secondary"');
      expect(html, variant).not.toContain('data-cc-button="primary"');
      expect(html, variant).not.toMatch(/disabled|aria-disabled|role="dialog"|role="alertdialog"|<button/);
      expect(html).toMatch(/href="\/project\/p1\/design"/);
      expect(html).toMatch(/href="\/dashboard"/);
      expect(textOf(html)).toContain('Re-design this program');
      expect(textOf(html)).toContain('Analyze another Z program');
    }
  });

  test('P6: what the reader does is counted from the rules, never a duration', async () => {
    const Endings = await load('components/analyze/AnalyzeEndings.tsx');
    const full = textOf(renderToStaticMarkup(React.createElement(Endings, { ...props, variant: 'full' })));
    expect(full).toContain('What you do: one decision per business rule, 7 rules.');
    expect(full).toContain('Nothing changes in SAP.');
    const one = textOf(renderToStaticMarkup(React.createElement(Endings, { ...props, rules: 1, variant: 'full' })));
    expect(one).toContain('one decision per business rule, 1 rule.');
    const reading = textOf(renderToStaticMarkup(React.createElement(Endings, { ...props, rules: null, variant: 'compact' })));
    expect(reading).toContain('decide on each business rule.');
    for (const text of [full, one, reading]) expect(text).not.toMatch(/minute|hour|\babout \d/i);
  });

  test('P8: an invited reader is told the owner can re-design it; the other ending opens the reader\'s own list', async () => {
    const Endings = await load('components/analyze/AnalyzeEndings.tsx');
    for (const variant of ['compact', 'full'] as const) {
      const html = renderToStaticMarkup(React.createElement(Endings, { ...props, owner: false, variant }));
      expect(textOf(html), variant).toContain('The owner can re-design it.');
      expect(html, variant).not.toContain('data-analyze-ending-open="redesign"');
      expect(html, variant).not.toContain('/project/p1/design');
      expect(html, variant).toMatch(/<a [^>]*href="\/dashboard"/);
    }
  });

  test('the full section carries the quiet link back to "What you can do next" when the page hands it in (9b)', async () => {
    const Endings = await load('components/analyze/AnalyzeEndings.tsx');
    const html = renderToStaticMarkup(
      React.createElement(Endings, { ...props, variant: 'full' }, React.createElement('button', { 'data-analyze-what-next-show': '' }, 'What you can do next')),
    );
    expect(html).toContain('data-analyze-what-next-show=""');
    expect(textOf(html)).toContain('That was the process.');
  });
});

/* ------------------------------------------------------------ "What you can do next" */

test.describe('"What you can do next" (server-free render)', () => {
  test('one line on the server and the first frame; the other views by the view switch, the other tools by their purpose; Hide', async () => {
    const Card = await load('components/analyze/WhatNextCard.tsx');
    const html = renderToStaticMarkup(React.createElement(Card, { onHide: () => {} }));
    expect(html).toContain('data-analyze-what-next="closed"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-analyze-what-next-hide=""');
    const text = textOf(html);
    expect(text).toContain('What you can do next');
    expect(text).toContain('Same program, same analysis. Use the view switch above.');
    for (const key of ['design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'] as const) {
      expect(html).toContain(`data-analyze-what-next-tool="${key}"`);
    }
    // The tools' sentences are the tool bar's own (one source).
    expect(text).toContain(PHASE_PURPOSE.documentation);
    expect(html).not.toContain('data-analyze-what-next-tool="analyze"');
    expect(html).not.toContain('data-cc-button="primary"');
  });

  test('it stands below the endings, after the walk-through only; the quiet link where it was hidden', () => {
    const business = read('components/analyze/AnalyzeBusiness.tsx');
    expect(business.indexOf('data-analyze-what-next-show')).toBeLessThan(business.indexOf('<WhatNextCard'));
    expect(business).toMatch(/\{signed !== null && walked && !touring \? \(/);
    expect(business).toContain('whatNextShown(progress) ? <WhatNextCard onHide={() => setNextHidden(true)} /> : null');
    expect(business).toMatch(/progress\.nextHidden \? \([\s\S]{0,200}onClick=\{\(\) => setNextHidden\(false\)\}/);
  });
});

/* ------------------------------------------------------------ the soft gate */

test.describe('the soft gate (source guards)', () => {
  const business = read('components/analyze/AnalyzeBusiness.tsx');
  const bar = read('components/workspace/ToolBar.tsx');

  test('a later tool clicked before the walk-through holds for one note — never Analyze, never after it, never a modified click', () => {
    expect(business).toMatch(/if \(walked \|\| tool\.key === 'analyze' \|\| !href\) return;\s*event\.preventDefault\(\);/);
    expect(bar).toMatch(/event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
    // Every tool stays a link with its href: nothing is locked or disabled.
    expect(bar).toContain('href={stageHref({ ...link_, path: tool.path })}');
    expect(bar).not.toMatch(/aria-disabled|disabled=\{/);
  });

  test('the note: why, "Walk through first" and "Continue to …" (a link) — going on counts as walked (O1); no duration (O7)', () => {
    expect(business).toContain('data-analyze-soft-gate=""');
    expect(business).toMatch(/data-analyze-soft-gate-walk=""/);
    expect(business).toMatch(/<span onClickCapture=\{markWalked\}>\s*<CcLinkButton href=\{gate\.href\} variant="ghost" data-analyze-soft-gate-continue="">/);
    // The hint beside the tools goes once the walk-through is done; the bar keeps its one-row shape.
    expect(business).toContain("toolsNote={softGateShown(progress) ? wt('abiz.softGate') : null}");
    expect(business).toContain('toolsCompact');
    const messages = read('lib/messages/analyze-business.ts');
    const gate = messages.slice(messages.indexOf("'abiz.gateTitle'"), messages.indexOf("'abiz.gateWalk'") + 60);
    expect(gate).not.toMatch(/minute/);
    expect(messages).toMatch(/export function gateBody\(tool: string\): string \{\s*return `It makes \$\{tool\} easier to follow\.`;/);
  });
});

/* ------------------------------------------- "Hide" in a real browser, no server */

const ORIGIN = 'http://analyze-endings.harness';
let harnessJs = '';

async function harnessScript(): Promise<string> {
  if (harnessJs) return harnessJs;
  fs.mkdirSync(OUT, { recursive: true });
  const entry = [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import WhatNextCard from './components/analyze/WhatNextCard';",
    "import { useAnalyzeProgress } from './hooks/useAnalyzeProgress';",
    "import { whatNextShown } from './lib/analyze-progress';",
    'function Page({ id }: { id: string }) {',
    '  const { progress, markWalked, setNextHidden } = useAnalyzeProgress(id);',
    '  React.useEffect(() => { markWalked(); }, [markWalked]);',
    '  return (<div data-project={id}>',
    '    {progress.nextHidden ? <button data-analyze-what-next-show="" onClick={() => setNextHidden(false)}>What you can do next</button> : null}',
    '    {whatNextShown(progress) ? <WhatNextCard onHide={() => setNextHidden(true)} onView={() => {}} /> : null}',
    '  </div>);',
    '}',
    "createRoot(document.getElementById('page')!).render(<Page id={location.hash.slice(1)} />);",
  ].join('\n');
  await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'tsx', sourcefile: 'endings-harness.tsx' },
    outfile: path.join(OUT, 'harness.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: { '@': ROOT },
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  harnessJs = fs.readFileSync(path.join(OUT, 'harness.js'), 'utf8');
  return harnessJs;
}

async function serve(page: Page, sent: string[]): Promise<void> {
  const js = await harnessScript();
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(ORIGIN)) {
      sent.push(url);
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="page"></div><script>${js.replace(/<\/script/g, '<\\/script')}</script></body></html>`,
    });
  });
}

test.describe('"Hide" in a browser (server-free, intercepted origin)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('survives a reload, leaves a second project alone, and sends nothing anywhere', async ({ page }) => {
    test.setTimeout(120_000);
    const sent: string[] = [];
    await serve(page, sent);
    await page.goto(`${ORIGIN}/analyze#p1`);
    const card = page.locator('[data-analyze-what-next]');
    // Open from 1024 px.
    await expect(card).toHaveAttribute('data-analyze-what-next', 'open');
    await page.locator('[data-analyze-what-next-hide]').click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-analyze-what-next-show]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-project="p1"]')).toBeVisible();
    await expect(page.locator('[data-analyze-what-next-show]')).toBeVisible();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('cc.analyze.nextHidden.p1'))).toBe('1');
    // A second project is unaffected.
    await page.goto(`${ORIGIN}/analyze#p2`);
    await page.reload();
    await expect(page.locator('[data-project="p2"]')).toBeVisible();
    await expect(card).toBeVisible();
    await expect(page.locator('[data-analyze-what-next-show]')).toHaveCount(0);
    // The quiet link brings p1's back.
    await page.goto(`${ORIGIN}/analyze#p1`);
    await page.reload();
    await page.locator('[data-analyze-what-next-show]').click();
    await expect(card).toBeVisible();
    expect(sent, 'a request left the page').toEqual([]);
  });

  test('one collapsed line at 768 px that opens in place', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 768, height: 1024 });
    await serve(page, []);
    await page.goto(`${ORIGIN}/analyze#p3`);
    const card = page.locator('[data-analyze-what-next]');
    await expect(card).toHaveAttribute('data-analyze-what-next', 'closed');
    // One line: its title and "Hide"; the views and tools are not shown until it is opened. (The harness carries no
    // stylesheet, so the line is measured by what it says, not by its height — the height and the one line are measured
    // in the rendered spec below, at 768 px.)
    expect((await card.innerText()).replace(/\s+/g, ' ').trim()).toBe('What you can do next Hide');
    await expect(card.locator('[data-analyze-what-next-tools]')).toBeHidden();
    await page.locator('[data-analyze-what-next-toggle]').click();
    await expect(card).toHaveAttribute('data-analyze-what-next', 'open');
  });
});

/* ------------------------------------------------------------------ rendered */

test.describe('rendered: the endings and the soft gate in Analyze, Business (needs the emulators and a server)', () => {
  test('the soft gate holds Design once, nothing locked; after the tour the endings and "What you can do next"; Hide survives a reload without a write', async ({ page, browser }) => {
    test.setTimeout(420_000);
    const seeded = await seedLayoutProject('ab4-endings');
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, seeded);
    // The page grades the findings' objects once on load (`/api/abcd-classify`, a read). On a fast server the
    // whole walk below fits before that answer, so it is awaited here and cannot fall into the Hide window.
    const levelLookup = page.waitForResponse((res) => res.url().includes('/api/abcd-classify'), { timeout: 120_000 });
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-walk=""]')).toBeVisible({ timeout: 120_000 });
    await levelLookup;
    await expect(page.locator('[data-stage-tools-note]')).toHaveText('Best after the business walk-through');

    // A modified click is never held: Ctrl/Cmd-click opens Design in a new tab, as the browser does it, and no note
    // stands on the page (the gate's handler returns before `preventDefault` on any modifier).
    const designLink = page.locator('[data-stage-tools="open"] a[data-workspace-tool="design"]');
    const newTab = page.context().waitForEvent('page', { timeout: 30_000 });
    await designLink.click({ modifiers: ['ControlOrMeta'] });
    const opened = await newTab;
    await opened.waitForURL(new RegExp(`/project/${seeded.po}/design`), { waitUntil: 'commit', timeout: 60_000 });
    await opened.close();
    await expect(page.locator('[data-analyze-soft-gate]')).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(`/project/${seeded.po}/analyze`);

    // State 10: Design clicked before the walk-through — one calm note, the page stays.
    await designLink.click();
    const note = page.locator('[data-analyze-soft-gate]');
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();
    expect(new URL(page.url()).pathname).toBe(`/project/${seeded.po}/analyze`);
    await expect(note.locator('a[data-analyze-soft-gate-continue]')).toHaveAttribute('href', new RegExp(`/project/${seeded.po}/design`));

    // Walk to the end: the endings on the last card.
    await note.locator('[data-analyze-soft-gate-walk]').click();
    const tour = page.locator('[data-process-tour][data-tour-mode="inline"]');
    await expect(tour).toBeVisible({ timeout: 60_000 });
    const total = await page.locator('[data-tour-dots] i').count();
    for (let i = 0; i <= total; i += 1) await page.keyboard.press('ArrowRight');
    await expect(tour).toHaveAttribute('data-tour-at', 'end');
    await page.locator('[data-tour-finish]').click();

    // States 9: the hint is gone, the summary carries the endings, the full endings and the card stand below the text.
    await expect(page.locator('[data-stage-tools-note]')).toHaveCount(0);
    await expect(page.locator('[data-analyze-walked]')).toBeVisible();
    await expect(page.locator('[data-analyze-endings="full"]')).toBeVisible();
    const endings = page.locator('[data-analyze-ending-open]');
    for (const variant of await endings.evaluateAll((els) => els.map((el) => el.getAttribute('data-cc-button')))) expect(variant).toBe('secondary');
    await expect(page.locator('main [data-cc-button="primary"]:visible')).toHaveCount(0);
    const card = page.locator('[data-analyze-what-next]');
    await expect(card).toHaveAttribute('data-analyze-what-next', 'open');
    const below = await page.evaluate(() => {
      const a = document.querySelector('[data-analyze-endings="full"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-analyze-what-next]')!.getBoundingClientRect();
      return b.top >= a.bottom;
    });
    expect(below, 'the card does not stand below the endings').toBe(true);

    // At 768 px, with the product's stylesheet: one collapsed line — the title and "Hide" side by side, no taller than
    // one row of the card — that opens in place.
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(card).toHaveAttribute('data-analyze-what-next', 'closed');
    const line = await card.evaluate((el) => {
      const title = el.querySelector('[data-analyze-what-next-toggle]')!.getBoundingClientRect();
      const hide = el.querySelector('[data-analyze-what-next-hide]')!.getBoundingClientRect();
      return { height: el.getBoundingClientRect().height, titleTop: title.top, hideTop: hide.top, titleH: title.height, hideH: hide.height };
    });
    expect(Math.abs(line.titleTop + line.titleH / 2 - (line.hideTop + line.hideH / 2)), 'the title and "Hide" are not on one line').toBeLessThan(4);
    expect(line.height, 'the collapsed card is more than one line').toBeLessThanOrEqual(Math.max(line.titleH, line.hideH) + 32);
    await expect(card.locator('[data-analyze-what-next-tools]')).toBeHidden();
    await card.locator('[data-analyze-what-next-toggle]').click();
    await expect(card).toHaveAttribute('data-analyze-what-next', 'open');
    await expect(card.locator('[data-analyze-what-next-tools]')).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });

    // 9b: Hide, a reload, still hidden — and no Firestore write on the way.
    const writes: string[] = [];
    page.on('request', (req) => {
      // `/api/csp-report` is the browser's own report-only CSP telemetry (here a listener closing its channel to the
      // emulator host): the browser sends it, not Hide, and it stores nothing (ADR-065).
      if (req.url().includes('/api/csp-report')) return;
      if (/\/Write\/channel|:commit|documents\/[^?]*\?|\/api\//.test(req.url()) && req.method() !== 'GET') writes.push(`${req.method()} ${req.url()}`);
    });
    await page.locator('[data-analyze-what-next-hide]').click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-analyze-what-next-show]')).toBeVisible();
    expect(writes, 'Hide wrote to the server').toEqual([]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-analyze-walked]')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('[data-analyze-what-next-show]')).toBeVisible();
    await expect(card).toHaveCount(0);

    // State 17 on a second visit: "Welcome back", no banner; a second project is unaffected.
    await expect(page.locator('[data-analyze-walked="return"]')).toContainText('Welcome back · you walked through it before');
    expect(
      await page.evaluate((id) => window.localStorage.getItem(`cc.analyze.walked.${id}`), seeded.po),
      'the browser keeps that the walk-through was done, not the day (privacy policy 1.3)',
    ).toBe('1');
    const other = await seedLayoutProject('ab4-endings-other');
    // The other account signs in through the form, which a signed-in browser does not show: the same browser's
    // storage (where the walk-through is kept) in a new context, without the first account's session.
    const second = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 1440, height: 900 } });
    const page2 = await second.newPage();
    await signInThroughForm(page2, other);
    await page2.goto(`/project/${other.po}/analyze`, { waitUntil: 'domcontentloaded' });
    await expect(page2.locator('[data-analyze-walk=""]')).toBeVisible({ timeout: 120_000 });
    await expect(page2.locator('[data-analyze-walked]')).toHaveCount(0);
    await expect(page2.locator('[data-stage-tools-note]')).toHaveText('Best after the business walk-through');
    expect(
      await page2.evaluate((id) => window.localStorage.getItem(`cc.analyze.walked.${id}`), seeded.po),
      'the walk-through of the first project is not in the browser the second project opens in',
    ).not.toBeNull();
    await second.close();
  });

  test('an invited reader: the owner can re-design it, the other ending opens the reader\'s own list (P8)', async ({ browser }) => {
    test.setTimeout(300_000);
    const seeded = await seedLayoutProject('ab4-reader-owner');
    const reader = await seedLayoutProject('ab4-reader');
    const { adminMergeDoc } = await import('./helpers/admin-seed');
    await adminMergeDoc('projects', seeded.po, { readers: [reader.uid] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript((id) => window.localStorage.setItem(`cc.analyze.walked.${id}`, '1'), seeded.po);
    await signInThroughForm(page, reader);
    await page.goto(`/project/${seeded.po}/analyze`, { waitUntil: 'domcontentloaded' });
    const full = page.locator('[data-analyze-endings="full"]');
    await expect(full).toBeVisible({ timeout: 120_000 });
    await expect(full).toContainText('The owner can re-design it.');
    await expect(page.locator('[data-analyze-ending-open="redesign"]')).toHaveCount(0);
    await expect(full.locator('[data-analyze-ending-open="another"]')).toHaveAttribute('href', '/dashboard');
    await page.close();
  });
});
