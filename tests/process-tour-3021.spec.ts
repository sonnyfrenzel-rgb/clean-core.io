import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide, CASE_LIST_BRIEF_FROM, type WalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour, countSentence, OVERVIEW_PARTS, tourReadingOf, type ProcessTour } from '../lib/process-tour';
import { walkPlainSentences } from '../lib/plain-wording';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.21, the guided tour — owner decisions 22.10.2026 on the phone
 * analysis:
 *
 *   - an **overview** before station 1, "What this process is about", with
 *     only engine-written lines, not counted ("Step 1 of N" stays);
 *   - a long **case list** said short on the card, the full list one level down;
 *   - the aside ("… makes 5 technical checks") and "Then the part … begins"
 *     **one level down**;
 *   - the First insights' "Checks: …" and "Can end here: …" **moved into the
 *     tour**, at the station they belong to, without what it already says;
 *   - **three layouts** (wide, a phone upright, a phone on its side) chosen by
 *     the same media queries in CSS and in the component, never a wide first
 *     paint on a phone; a **swipe** on the card; the end card without a recap.
 *
 * Server-free: the tour is a pure function; the layer is bundled and rendered
 * to static markup. The browser half — every station at 1440 × 900, 390 × 844,
 * 390 × 664, 844 × 390 and 667 × 375 — is `tests/process-tour-screens.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The tour of an example for the given engine (map and reading alike); this release's engine when none is given. */
function readOf(file: string, engineVersion?: string): { source: string; model: ProcessMapModel; guide: WalkGuide; tour: ProcessTour } {
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file, ...(engineVersion ? { exporterVersion: engineVersion } : {}) });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  return { source, model, guide, tour: buildProcessTour(guide, model, tourReadingOf(source, engineVersion)) };
}

const PO = readOf('Z_MM_PO_APPROVAL.abap');
/**
 * The PO example on the 3.0.20 engine. Two 3.0.21 readings meet on its "Check requisition" part: the map draws
 * the run of guard checks "Material given?" / "Release indicator set?" as one task "2 checks" (roadmap 3.0.21 "The
 * BPMN reconstruction stays at the business level"), and a raw field check is said with the program's own message
 * (roadmap 3.0.21 "First insights becomes the strongest page"). The older engine keeps guarding that a station does
 * not repeat its own title or a station of its part; the 3.0.21 reading is asserted beside it.
 */
const PO_3020 = readOf('Z_MM_PO_APPROVAL.abap', '3.0.20');
const BIG = readOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const STOCK = readOf('Z_MATERIAL_STOCK_CALC.txt');

const station = (tour: ProcessTour, title: string) => {
  const found = tour.stations.find((s) => s.title === title);
  if (!found) throw new Error(`no station ${title}`);
  return found;
};

test.describe('the overview: what this process is about, engine-written, before station 1', () => {
  test('the PO example: purpose, who starts it, where it starts and ends, the result, the count', () => {
    const o = PO.tour.overview;
    // Roadmap 3.0.21 "First insights becomes the strongest page" (owner decisions 22.10.2026): the wider purpose the
    // program's names support (approval) is shown whenever it exists, and leads, as for the 1,000-line example.
    expect(o.purpose.map((l) => l.text)).toEqual([
      'Covers the approval of purchase orders and purchase requisitions.',
      'Creates purchase orders and starts workflows in SAP, reading purchase requisitions and suppliers, selected by purchase requisition number.',
    ]);
    // The 3.0.20 engine reads no approval aim from the names: the purpose sentence alone.
    expect(PO_3020.tour.overview.purpose.map((l) => l.text)).toEqual([
      'Creates purchase orders and starts workflows in SAP, reading purchase requisitions and suppliers, selected by purchase requisition number.',
    ]);
    expect(o.trigger?.text).toBe("A user starts it from a selection screen with 4 inputs; it runs in the user's session.");
    expect(o.route).toBe('It starts at “Run starts with the entered selection” and ends at “Done”.');
    expect(o.result?.text).toBe('The result is a list on screen.');
    expect(o.involved).toBeNull();
    expect(o.count).toBe('7 steps in 5 parts: Check authority, Read requisition, Check requisition, Read info record and Decide approval.');
    // Every line read from the code carries its lines.
    for (const line of [...o.purpose, o.trigger!, o.result!]) expect(line.anchor, line.text).not.toBeNull();
  });

  test('the aim the program\'s names support leads, and who else takes part is only what the code shows', () => {
    // ZLEGACY_ORDER_FULFILLMENT_AUDIT: "audit" in the name, the objects in the code (lib/abap/program-domain.ts).
    expect(BIG.tour.overview.purpose[0].text).toBe('Audits customers, sales orders and stock.');
    expect(BIG.tour.overview.purpose[1].text).toMatch(/^Changes sales orders in SAP/);
    // A remote call and a mail step are in the code; no lane a model proposed (the map has none here either way).
    expect(BIG.tour.overview.involved).toBe('It also asks another system and sends an e-mail.');
    expect(BIG.tour.overview.route).toBe('It starts at “Selection entered” and ends at “Done”.');
    // Twelve parts: the first and the last; the full list is the part select.
    expect(BIG.tour.overview.count).toBe('12 steps in 12 parts, from “Validate selection” to “Send summary mail”.');
  });

  test('nothing is invented: without the engine\'s reading only the map\'s route and the count are said', () => {
    const bare = buildProcessTour(PO.guide, PO.model, null);
    expect(bare.overview.purpose).toEqual([]);
    expect(bare.overview.trigger).toBeNull();
    expect(bare.overview.result).toBeNull();
    expect(bare.overview.route).toBe(PO.tour.overview.route);
    expect(bare.overview.count).toBe(PO.tour.overview.count);
    // The stations do not change with the reading, only the story notes at them.
    expect(bare.stations.map((s) => s.id)).toEqual(PO.tour.stations.map((s) => s.id));
    expect(bare.stations.every((s) => s.story.length === 0)).toBe(true);
    expect(tourReadingOf('this is not ABAP at all')?.story ?? []).toEqual([]);
  });

  test('the count sentence', () => {
    expect(countSentence(1, ['Read orders'])).toBe('1 step in 1 part: Read orders.');
    expect(countSentence(3, ['A', 'B'])).toBe('3 steps in 2 parts: A and B.');
    const many = Array.from({ length: OVERVIEW_PARTS + 1 }, (_, i) => `Part ${i + 1}`);
    expect(countSentence(9, many)).toBe(`9 steps in ${many.length} parts, from “Part 1” to “Part ${many.length}”.`);
    expect(countSentence(0, [])).toBe('0 steps in 0 parts.');
  });
});

test.describe('the card says less; "More about it" says the rest', () => {
  test('a long case list is said short on the card, the full list one level down', () => {
    const cases = station(PO.tour, 'Which case applies?');
    expect(cases.happens.text).toBe('It tells 3 cases apart.');
    expect(cases.cases?.text).toMatch(/^It tells 3 cases apart, in this order — /);
    expect(cases.cases!.text.length).toBeGreaterThan(CASE_LIST_BRIEF_FROM);
    // A value list (CASE) in its own short form.
    const type = station(STOCK.tour, 'Material type?');
    expect(type.happens.text).toBe('It looks at the material type and goes one of 4 ways, depending on its value.');
    expect(type.cases?.text).toMatch(/^It looks at the material type and goes a different way for each value — /);
    // A short sentence stays as it is.
    const currency = station(PO.tour, 'Currency not EUR?');
    expect(currency.cases).toBeNull();
    expect(currency.happens.text).toBe('It checks: Currency not EUR? If yes, it goes on to “Convert to EUR”. If no, it carries on.');
    // The guide keeps the full sentence as "what happens", so a model's plain wording stays keyed on it.
    const step = PO.guide.byId[cases.id];
    expect(step.happens.text).toBe(cases.cases!.text);
    expect(walkPlainSentences(PO.guide).map((s) => s.text)).toContain(cases.cases!.text);
    expect(walkPlainSentences(PO.guide).map((s) => s.text)).not.toContain('It tells 3 cases apart.');
  });

  test('every card stays short: what happens is at most the brief threshold or a sentence of its own', () => {
    for (const { tour } of [PO, BIG, STOCK]) {
      for (const s of tour.stations) {
        if (/cases apart|depending on its value/.test(s.happens.text)) expect(s.happens.text.length, s.title).toBeLessThanOrEqual(CASE_LIST_BRIEF_FROM);
      }
    }
  });

  test('the First insights\' checks and stops are at the station they belong to, without what the part already says', () => {
    // On the 3.0.20 engine "Material given?" and "Release indicator set?" are stations of their own.
    const material = station(PO_3020.tour, 'Material given?');
    const [own] = material.story;
    expect(own.step).toBe('Check requisition');
    expect(own.checks).toEqual(['Mmsta 01 or Z9', 'Account assignment category', 'Order number given', 'Plant 1000']);
    // "Material given" is this station's title and "Release indicator set" a station of the same part.
    expect(own.checks).not.toContain('Material given');
    expect(own.checks).not.toContain('Release indicator set');
    expect(own.stops).toEqual(['no material']);
    // From engine 3.0.21 the two guards are one task "2 checks", whose title names neither, so the story names
    // both; the material status check is said with the program's own message (roadmap rows above PO_3020).
    expect(PO.tour.stations.some((s) => s.title === 'Material given?' || s.title === 'Release indicator set?')).toBe(false);
    const guards = station(PO.tour, '2 checks');
    expect(guards.happens.text).toBe('It applies 2 checks and shows a message.');
    const [own21] = guards.story;
    expect(own21.step).toBe('Check requisition');
    expect(own21.checks).toEqual(['Material given', 'Release indicator set', 'Material is blocked for purchasing in this plant', 'Account assignment category', 'Order number given', 'Plant 1000']);
    expect(own21.stops).toEqual(['no material', 'release indicator set']);
    // The message number is a code: not said.
    const authority = station(PO.tour, 'Not authorized?');
    expect(authority.story).toEqual([{ step: 'Check authority', checks: [], stops: ['no purchase requisition found'] }]);
    // A story step off the walk goes where the one before it went, and says which it is.
    const info = station(PO.tour, 'Found and price unit above 0?');
    expect(info.story.map((n) => n.step)).toEqual(['Read info record', 'Check price']);
    expect(info.story[1].checks).toEqual(['Reference price above 0', 'Deviation percent above 5']);
    // A station that is the story step itself names no step.
    const scores = station(BIG.tour, 'Calculate risk scores');
    expect(scores.story[0].step).toBeNull();
    expect(scores.story[0].checks).toContain('Net value above credit limit');
  });

  test('a check the station already says in what decides it is not said twice', () => {
    for (const { tour } of [PO, BIG]) {
      for (const s of tour.stations) {
        const said = s.decides.map((d) => d.text.replace(/^Decided by:\s*/i, '').replace(/^the\s+/i, '').replace(/[.?]$/, '').toLowerCase());
        for (const note of s.story) for (const c of note.checks) expect(said, `${s.title}: ${c}`).not.toContain(c.replace(/^the\s+/i, '').toLowerCase());
      }
    }
  });
});

/* ------------------------------------------------------------- rendered */

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'process-tour-3021', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*', 'bpmn-js/lib/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test.describe('on screen (server-free render)', () => {
  test('the tour opens on the overview: the whole map, the business lines, no step counted, Back off', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {} }));
    const text = textOf(html);
    expect(html).toContain('data-tour-at="overview"');
    expect(html).toContain('data-tour-overview=""');
    expect(text).toContain('What this process is about');
    expect(text).toContain('Creates purchase orders and starts workflows in SAP');
    expect(text).toContain('It starts at “Run starts with the entered selection” and ends at “Done”.');
    expect(text).toContain(PO.tour.overview.count);
    expect(text).not.toMatch(/Step \d+ of \d+/);
    expect(html).toContain('aria-label="Process map, the whole process"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-tour-back=""|<button[^>]*data-tour-back=""[^>]*disabled=""/);
    // The part select offers the overview.
    expect(html).toMatch(/<option value="overview" selected="">Overview<\/option>/);
  });

  test('a station: the short case list, the aside and the next part only one level down, the story lines there too', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    // The 3.0.20 engine's station "Material given?", and from 3.0.21 the task "2 checks" of the same guards (see PO_3020).
    for (const [read, title, checks, stops] of [
      [PO_3020, 'Material given?', 'Checks: Mmsta 01 or Z9 · Account assignment category · Order number given · Plant 1000', 'Can end here: no material'],
      [PO, '2 checks', 'Checks: Material given · Release indicator set · Material is blocked for purchasing in this plant · Account assignment category · Order number given · Plant 1000', 'Can end here: no material · release indicator set'],
    ] as const) {
      const at = read.tour.stations.findIndex((s) => s.title === title);
      expect(at, title).toBeGreaterThanOrEqual(0);
      const html = renderToStaticMarkup(React.createElement(Layer, { tour: read.tour, model: read.model, onClose: () => {}, initialStation: at }));
      const text = textOf(html);
      const card = text.slice(0, text.indexOf('More about it'));
      expect(card).not.toContain('Checks:');
      expect(card).not.toContain('Can end here');
      expect(card).not.toContain('In this part the program also');
      const more = text.slice(text.indexOf('More about it'));
      expect(more).toContain('Around “Check requisition”:');
      expect(more).toContain(checks);
      expect(more).toContain(stops);
      expect(more).toContain(read.tour.stations[at].aside!);
      // The business lines stand first one level down, before the lines in the code.
      expect(more.indexOf('Checks:')).toBeLessThan(more.indexOf('Lines in the code'));
    }

    const caseAt = PO.tour.stations.findIndex((s) => s.title === 'Which case applies?');
    const caseHtml = renderToStaticMarkup(React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: caseAt }));
    const caseText = textOf(caseHtml);
    const caseCard = caseText.slice(0, caseText.indexOf('More about it'));
    expect(caseCard).toContain('It tells 3 cases apart.');
    expect(caseCard).not.toContain('in this order');
    expect(caseText.slice(caseText.indexOf('More about it'))).toContain('The cases, one by one');
    expect(caseHtml).toContain('data-tour-cases=""');
  });

  test('on a phone (the first paint of a server render) "More about it" is a closed panel with "Back to the map", outside the card', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: 0 }));
    expect(html).toContain('data-tour-mode="stacked"');
    expect(html).toMatch(/<section[^>]*data-tour-more-panel=""[^>]*hidden=""/);
    expect(textOf(html)).toContain('Back to the map');
    // The panel is not inside the card, and the buttons are not inside the card either: Next is pinned under it.
    const card = /<article[^>]*data-tour-card="[^"]*"[^>]*>([\s\S]*?)<\/article>/.exec(html)![1];
    expect(card).not.toContain('data-tour-more-panel');
    expect(card).not.toContain('data-tour-next');
    expect(html.indexOf('</article>')).toBeLessThan(html.indexOf('data-tour-nav=""'));
    expect(html).toMatch(/aria-expanded="false"[^>]*data-tour-more-open=""/);
    // The close button is an icon with a name, its words only on a wide screen.
    expect(html).toMatch(/aria-label="Close the tour"[^>]*data-tour-close=""/);
  });

  test('the end says "That was the process" and leads to Design; "Start again" goes back to the overview', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const html = renderToStaticMarkup(
      React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: PO.tour.stations.length, designHref: '/d' }),
    );
    expect(textOf(html)).toContain('That was the process');
    expect(textOf(html)).not.toContain(PO.tour.overview.purpose[0].text);
    expect(read('components/workspace/ProcessTour.tsx')).toMatch(/onClick=\{\(\) => go\(OVERVIEW\)\} data-tour-again=""/);
  });
});

test.describe('the layouts, the swipe and the first paint (pure and source)', () => {
  test('the same two media queries decide the layout in CSS and in the component', async () => {
    const tourModule = await load('components/workspace/ProcessTour.tsx', 'TOUR_WIDE');
    const wide = tourModule as unknown as string;
    const landscape = (await load('components/workspace/ProcessTour.tsx', 'TOUR_LANDSCAPE')) as unknown as string;
    expect(wide).toBe('(min-width: 768px) and (min-height: 560px)');
    expect(landscape).toBe('(max-width: 1023px) and (max-height: 559px) and (orientation: landscape)');
    const css = read('components/process-map/process-map.css');
    expect(css).toContain(`@media ${wide} {`);
    expect(css).toContain(`@media ${landscape} {`);
    const modeOf = (await load('components/workspace/ProcessTour.tsx', 'tourModeOf')) as unknown as (m: (q: string) => boolean) => string;
    // A tiny evaluator of the two queries for a window size.
    const at = (w: number, h: number) =>
      modeOf((q) => (q === wide ? w >= 768 && h >= 560 : q === landscape ? w <= 1023 && h <= 559 && w > h : false));
    expect(at(1440, 900)).toBe('wide');
    expect(at(390, 844)).toBe('stacked');
    expect(at(390, 664)).toBe('stacked');
    expect(at(844, 390)).toBe('landscape');
    expect(at(667, 375)).toBe('landscape');
    // A short desktop window is not a phone on its side.
    expect(at(1280, 500)).toBe('stacked');
  });

  test('the layout is read at once, never a wide first paint on a phone', () => {
    const src = read('components/workspace/ProcessTour.tsx');
    expect(src).toMatch(/useState<TourMode>\(\(\) => \(typeof window === 'undefined' \? 'stacked' : readMode\(\)\)\)/);
    expect(src).not.toMatch(/useState\(true\)/);
  });

  test('the card scrolls on its own and never the page behind; Next keeps clear of a phone\'s home bar', () => {
    const css = read('components/process-map/process-map.css');
    const card = /\.cc-tour-card \{([\s\S]*?)\}/.exec(css)![1];
    expect(card).toContain('max-height: 46dvh;');
    expect(card).toContain('overscroll-behavior: contain;');
    expect(card).toContain('touch-action: pan-y;');
    expect(/\.cc-tour-nav \{([\s\S]*?)\}/.exec(css)![1]).toContain('max(env(safe-area-inset-bottom), 0px)');
    expect(/\.cc-tour-side \{([\s\S]*?)\}/.exec(css.slice(css.indexOf('@media (max-width: 1023px)')))![1]).toContain('flex: 0 0 min(42%, 360px);');
  });

  test('a swipe: sideways and far enough, never a mostly upward drag', async () => {
    const swipeStep = (await load('components/workspace/ProcessTour.tsx', 'swipeStep')) as unknown as (dx: number, dy: number) => number;
    expect(swipeStep(-120, 4)).toBe(1);
    expect(swipeStep(120, -6)).toBe(-1);
    expect(swipeStep(-30, 0)).toBe(0);
    expect(swipeStep(-80, 100)).toBe(0);
    // Only on the card: the map keeps its own panning.
    const src = read('components/workspace/ProcessTour.tsx');
    expect(src.match(/onPointerUp=/g)).toHaveLength(1);
    expect(src).toMatch(/<article[\s\S]*?onPointerUp=\{onPointerUp\}/);
    expect(src).toMatch(/event\.pointerType === 'mouse' \? null/);
  });

  test('both callers hand the tour the engine\'s reading of the whole program', () => {
    expect(read('components/workspace/WorkspaceProcess.tsx')).toContain('t.tourReadingOf(signed.source, tourEngine)');
    expect(read('components/demo/DemoWalkThrough.tsx')).toContain('t.tourReadingOf(source, APP_VERSION)');
    expect(read('lib/process-tour.ts')).not.toMatch(/export function tourClosingOf/);
  });
});
