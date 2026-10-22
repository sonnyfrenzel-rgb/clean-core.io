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
import { ABAP_TOKEN, buildWalkGuide, type WalkGuide } from '../lib/process-walk-guide';
import { asideSentence, buildProcessTour, MAX_STATIONS, tourReadingOf, type ProcessTour } from '../lib/process-tour';
import { STARTER_EXAMPLES } from '../lib/starter-examples';
import { readExample } from './helpers/starter-example-files';

/**
 * Owner decision 21.10.2026: the walk-through "cannot be used like this — it
 * shows something at the top and at the bottom of the process without you
 * getting it onto one screen". It became a guided tour on the BPMN map, for
 * understanding only: per station the map moves to the element and marks it,
 * a small card beside it says in plain business words what happens, why it
 * matters and where it goes next — no question, no answer, no code — and only
 * business steps are stations, a handful per phase, phases as chapters.
 *
 * Server-free: the tour is a pure function of the guide and the map; the
 * layer is bundled and rendered to static markup. The browser half — the map
 * and the card on one screen at 1440 × 900 and 390 × 844 — is
 * `tests/process-tour-screens.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function readOf(file: string): { source: string; model: ProcessMapModel; guide: WalkGuide; tour: ProcessTour } {
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  return { source, model, guide, tour: buildProcessTour(guide, model, tourReadingOf(source)) };
}

const BIG = readOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const PO = readOf('Z_MM_PO_APPROVAL.abap');

test.describe('the stations: business steps only, a handful per phase, phases as chapters', () => {
  test('the 1,000-line example: 52 walk steps become at most 12 stations; the PO demo 25 become 6 to 12', () => {
    // Measured 21.10.2026: 52 → 12 (12 chapters) and 25 → 7 (5 chapters).
    expect(BIG.tour.walkSteps).toBe(52);
    expect(BIG.tour.stations.length).toBeLessThanOrEqual(MAX_STATIONS);
    expect(BIG.tour.stations.length).toBeGreaterThanOrEqual(6);
    expect(PO.tour.walkSteps).toBe(25);
    expect(PO.tour.stations.length).toBeGreaterThanOrEqual(6);
    expect(PO.tour.stations.length).toBeLessThanOrEqual(MAX_STATIONS);
  });

  for (const example of STARTER_EXAMPLES) {
    test(`${example.name}: no technical step, no phase box with steps inside, no name twice in a chapter, every chapter in order`, () => {
      const { tour, guide, model } = readOf(example.file);
      expect(tour.stations.length).toBeGreaterThan(0);
      const byId = new Map(model.elements.map((e) => [e.id, e]));
      for (const station of tour.stations) {
        const step = guide.byId[station.id];
        expect(step.technical, station.title).toBeNull();
        expect(byId.get(station.id)?.plane ?? null).toBe(station.plane);
        const chapter = tour.chapters[station.chapter];
        const phase = guide.phases.find((p) => p.id === chapter.id)!;
        if (byId.get(station.id)?.opensPlane) {
          // A phase box is a station only where nothing inside it is.
          expect(phase.stepIds.every((id) => id === station.id || byId.get(id)?.opensPlane)).toBe(true);
        }
      }
      for (const chapter of tour.chapters) {
        const titles = chapter.stations.map((i) => tour.stations[i].title.toLowerCase());
        expect(new Set(titles).size).toBe(titles.length);
        expect(chapter.stations.length).toBeGreaterThan(0);
        expect(chapter.first).toBe(chapter.stations[0]);
      }
      // Stations run in walk order, chapter by chapter.
      const order = guide.business;
      const at = tour.stations.map((s) => order.indexOf(s.id));
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      expect(tour.stations.map((s) => s.chapter)).toEqual([...tour.stations.map((s) => s.chapter)].sort((a, b) => a - b));
    });
  }

  test('what the tour leaves out is said once per part, in one sentence', () => {
    expect(asideSentence({ decisions: 0, steps: 0, technical: { checks: 12 } })).toBe('In this part the program also makes 12 technical checks.');
    expect(asideSentence({ decisions: 2, steps: 1, technical: { logging: 1 } })).toBe(
      'In this part the program also checks 2 more conditions, takes 1 more step and writes a log or statistics in 1 place.',
    );
    expect(asideSentence({ decisions: 0, steps: 0, technical: {} })).toBeNull();
    // Every technical step of the 1,000-line example is counted somewhere.
    const technical = BIG.guide.technical.reduce((n, g) => n + g.stepIds.length, 0);
    const said = BIG.tour.stations
      .map((s) => s.aside ?? '')
      .join(' ')
      .match(/(?:makes|looks at|in) (\d+) (?:technical|run|place)/g)!
      .map((m) => Number(/(\d+)/.exec(m)![1]))
      .reduce((a, b) => a + b, 0);
    expect(said).toBe(technical);
    for (const station of BIG.tour.stations) {
      if (station.aside) expect(BIG.tour.chapters[station.chapter].first).toBe(BIG.tour.stations.indexOf(station));
    }
  });

  test('each station says where the process goes next — a new part one level down; the purpose sentence opens the tour', () => {
    // Owner decision 22.10.2026 (5): "Then the part … begins" moves behind "More about it"; the step after,
    // inside a part, stays on the card. (8): the purpose sentence moved from the end card to the overview.
    const [first, second] = PO.tour.stations;
    expect(first.next).toBeNull();
    expect(first.nextPart).toBe(`Then the part “${PO.tour.chapters[second.chapter].label}” begins.`);
    const inPart = PO.tour.stations.findIndex((s, i) => PO.tour.stations[i + 1]?.chapter === s.chapter);
    expect(PO.tour.stations[inPart].next).toBe(`Then it goes on to “${PO.tour.stations[inPart + 1].title}”.`);
    expect(PO.tour.stations[inPart].nextPart).toBeNull();
    expect(PO.tour.stations[PO.tour.stations.length - 1].next).toBe('This is the last step of the tour.');
    expect(PO.tour.overview.purpose[0]?.text).toMatch(/^Creates purchase orders/);
    expect(BIG.tour.overview.purpose.map((l) => l.text).join(' ')).toMatch(/sales orders/);
  });

  test('nothing on a card reads as code', () => {
    for (const { tour } of [BIG, PO]) {
      for (const s of tour.stations) {
        for (const text of [s.happens.text, s.matters.text, s.next ?? '', s.nextPart ?? '', s.aside ?? '']) {
          expect(text, text).not.toMatch(ABAP_TOKEN);
          expect(text).not.toMatch(/\bIF\b|\bPERFORM\b|\bSELECT\b|\bBR-\d+/);
        }
      }
    }
  });

  test('deterministic: the same source tours the same way', () => {
    expect(JSON.stringify(readOf('Z_MM_PO_APPROVAL.abap').tour)).toBe(JSON.stringify(PO.tour));
  });
});

/* ------------------------------------------------------------- rendered */

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'process-tour', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
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

test.describe('the tour on screen (server-free render)', () => {
  test('a station: its title, two or three plain sentences, the way on, the lines folded — and no question, no answer, no code', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const at = PO.tour.stations.findIndex((s) => s.title === 'Currency not EUR?');
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: at }));
    const text = textOf(html);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(`data-tour-at="${at + 1}"`);
    expect(text).toContain(`Step ${at + 1} of ${PO.tour.stations.length}`);
    expect(text).toContain('It checks: Currency not EUR? If yes, it goes on to “Convert to EUR”. If no, it carries on.');
    expect(text).toContain('It is a business rule: it decides which way each case goes.');
    // The next part begins after it: said one level down, not on the card (owner decision 22.10.2026).
    expect(html).not.toContain('data-tour-next-sentence=""');
    expect(html).toContain('data-tour-next-part=""');
    expect(text.slice(0, text.indexOf('More about it'))).not.toContain('Then the part');
    // The map moves to the element: the canvas is told which, and names it for a screen reader.
    expect(html).toContain('data-process-tour-map=""');
    expect(html).toContain('aria-label="Process map, highlighted: Currency not EUR?"');
    // The chapters, with the one on screen.
    expect(html.match(/data-tour-chapter="\d+"/g)).toHaveLength(PO.tour.chapters.length);
    expect(html).toContain('aria-current="step"');
    // Lines only one fold down.
    expect(text).toContain('More about it');
    const card = text.slice(0, text.indexOf('More about it'));
    expect(card).not.toMatch(/\bL\d+\b/);
    // Nothing asked, nothing to answer.
    expect(text).not.toMatch(/Does the business still need|Keep|Drop|Clarify/);
    expect(html).not.toContain('role="radio"');
    expect(html).not.toContain('data-state-confirm');
    expect(html).toContain('data-tour-back=""');
    expect(html).toContain('data-tour-next=""');
  });

  test('table codes stay one fold down, not on the card', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const at = BIG.tour.stations.findIndex((s) => s.happens.text.includes('(VBAK)'));
    expect(at).toBeGreaterThan(-1);
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: BIG.tour, model: BIG.model, onClose: () => {}, initialStation: at }));
    const narration = /data-tour-narration=""[^>]*>([\s\S]*?)<div data-tour-more/.exec(html)![1];
    expect(narration).not.toContain('VBAK');
  });

  test('the end: "That was the process" and a quiet link to the questions in Design — no recap', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const html = renderToStaticMarkup(
      React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, initialStation: PO.tour.stations.length, designHref: '/project/p1/design' }),
    );
    const text = textOf(html);
    expect(html).toContain('data-tour-at="end"');
    expect(text).toContain('That was the process');
    // Owner decision 22.10.2026 (8): the purpose sentence moved to the overview; the end recaps nothing.
    expect(html).not.toContain('data-tour-closing');
    expect(text).not.toContain('Creates purchase orders');
    expect(html).toMatch(/<a[^>]*href="\/project\/p1\/design"[^>]*data-tour-to-design=""|<a[^>]*data-tour-to-design=""[^>]*href="\/project\/p1\/design"/);
    expect(text).toContain('Answer the questions for the business in Design');
    expect(html).toContain('data-tour-again=""');
  });

  test('while it is read, the tour says so', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: null, model: PO.model, onClose: () => {} }));
    expect(html).toContain('data-tour-at="reading"');
    expect(textOf(html)).toContain('Reading the steps out of the code');
  });

  test('a reworded sentence carries its chip, the engine sentence one fold down', async () => {
    const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
    const say = (text: string) => ({ text: `Plainly: ${text}`, engine: text, worded: true });
    const html = renderToStaticMarkup(React.createElement(Layer, { tour: PO.tour, model: PO.model, onClose: () => {}, say, initialStation: 0 }));
    expect(html).toContain('data-tour-worded="yes"');
    expect(html).toContain('data-worded-chip=""');
    expect(html).toContain('data-worded-engine=""');
    expect(textOf(html)).toContain(PO.tour.stations[0].happens.text);
  });

  test('the entry opens the tour, and says nothing about answers', async () => {
    const Entry = await load('components/workspace/ProcessTourEntry.tsx');
    const html = renderToStaticMarkup(React.createElement(Entry, { projectId: 'p1' }));
    expect(html).toContain('data-tour-entry-open=""');
    expect(textOf(html)).toContain('Walk through the process');
    expect(textOf(html)).not.toMatch(/answered/);
  });
});

test.describe('the camera and the card (pure)', () => {
  test('the element sits left of centre beside the card, wholly inside the map, on a wide screen; centred on a phone', async () => {
    const Canvas = await load('components/process-map/TourCanvas.tsx', 'cameraFor');
    const placed = (await load('components/process-map/TourCanvas.tsx', 'placedBox')) as unknown as (b: object, v: object, o: object) => { x: number; y: number; width: number; height: number };
    const cameraFor = Canvas as unknown as (b: object, o: object, a: string) => { x: number; y: number; width: number; height: number };
    const cardPlace = (await load('components/workspace/ProcessTour.tsx', 'cardPlace')) as unknown as (b: object, c: object, a: object) => { left: number; top: number };
    const element = { x: 2400, y: 900, width: 120, height: 80 };
    const wide = { width: 1440, height: 760 };
    const view = cameraFor(element, wide, 'side');
    const box = placed(element, view, wide);
    expect(box.x + box.width / 2).toBeCloseTo(1440 * 0.3, 0);
    expect(box.y + box.height / 2).toBeCloseTo(380, 0);
    const card = cardPlace(box, { width: 380, height: 420 }, wide);
    expect(card.left).toBeGreaterThan(box.x + box.width);
    expect(card.left + 380).toBeLessThanOrEqual(1440 - 16);
    expect(card.top).toBeGreaterThanOrEqual(16);
    expect(card.top + 420).toBeLessThanOrEqual(760 - 16);
    const phone = { width: 390, height: 370 };
    const p = placed(element, cameraFor(element, phone, 'center'), phone);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(390);
    expect(p.x + p.width / 2).toBeCloseTo(195, 0);
  });
});

test.describe('where it stands and what it writes', () => {
  test('the old walk-through is gone: its step page, its question, its technical stop, its summary and its entry card', () => {
    for (const rel of ['components/workspace/ProcessWalkThrough.tsx', 'components/workspace/ProcessWalkEntry.tsx']) {
      expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(false);
    }
    const guide = read('lib/process-walk-guide.ts');
    expect(guide).not.toMatch(/export function (walkStops|resumeStop|walkSummary|restrictGuide)\b/);
    const messages = read('lib/messages/workspace-walk.ts');
    expect(messages).not.toContain('Does the business still need');
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process).not.toContain('ProcessWalkThrough');
    expect(process).toContain('<ProcessTour ');
    expect(process).not.toContain('WALK_TECHNICAL_SUBJECT');
  });

  test('the tour opens only on a click — from the top of the Business view or the First insights — and never by itself', () => {
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process).toMatch(/const \[tourOpen, setTourOpen\] = useState\(false\)/);
    expect(process.match(/setTourOpen\(true\)/g)).toHaveLength(1);
    expect(process).toMatch(/if \(takeProcessWalkRequest\(projectId\)\) setTourOpen\(true\)/);
    const shell = read('components/workspace/WorkspaceShell.tsx');
    expect(shell).toContain('<ProcessTourEntry projectId={projectId} />');
    expect(shell).toMatch(/onWalk=\{view === 'business' && signed !== null \? \(\) => requestProcessWalk\(projectId\) : undefined\}/);
    expect(read('components/workspace/FirstLook.tsx')).toContain('data-first-look-walk=""');
    const tour = read('components/workspace/ProcessTour.tsx');
    expect(tour).not.toMatch(/setInterval|autoplay|auto-play/i);
  });

  test('the tour writes nothing and reads no answer; reduced motion jumps instead of gliding', () => {
    for (const rel of ['components/workspace/ProcessTour.tsx', 'components/workspace/ProcessTourEntry.tsx', 'components/process-map/TourCanvas.tsx', 'lib/process-tour.ts', 'components/demo/DemoWalkThrough.tsx']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/firebase|setDoc|updateDoc|addDoc|fetch\(|confirmProcessStates|StateChoice|process-states/);
    }
    expect(read('components/process-map/TourCanvas.tsx')).toMatch(/prefers-reduced-motion: reduce[\s\S]*levelChanged \|\| reducedMotion\(\)/);
    expect(read('lib/process-tour.ts')).not.toMatch(/gemini|openai|anthropic|\/api\//i);
  });

  test('the demo gets the same tour, and calls no model', () => {
    const shell = read('components/demo/DemoWorkspaceShell.tsx');
    expect(shell.indexOf('<DemoWalkThrough')).toBeGreaterThan(-1);
    expect(shell.indexOf('<DemoWalkThrough')).toBeLessThan(shell.indexOf('{mapCard}'));
    const demo = read('components/demo/DemoWalkThrough.tsx');
    expect(demo).toContain('<ProcessTour ');
    expect(demo).toContain('demo={true}');
    expect(demo).not.toMatch(/usePlainWording|gemini|-client'/);
  });
});
