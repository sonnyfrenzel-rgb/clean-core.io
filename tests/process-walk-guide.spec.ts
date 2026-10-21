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
import {
  ABAP_TOKEN,
  buildWalkGuide,
  plainShare,
  restrictGuide,
  resumeStop,
  walkStops,
  walkSummary,
  type WalkGuide,
  type WalkLine,
} from '../lib/process-walk-guide';
import type { StateEntry } from '../lib/process-states';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap "3.0.20 — with it", part (1) — owner report of 21.10.2026: the
 * Business view's walk-through showed "Step 96 of 96: Background run given or
 * no file?" beside an ABAP excerpt, asked "Does the business still need this
 * step?" before the reader knew what the step does, sat below the fold, and
 * said nothing in plain language.
 *
 * Server-free: the guide is a pure function of the source and its map; the
 * component is bundled and rendered to static markup.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function mapOf(file: string): { source: string; model: ProcessMapModel } {
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  return { source, model };
}

const PO = mapOf('Z_MM_PO_APPROVAL.abap');
const BIG = mapOf('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
const guideOf = (m: { source: string; model: ProcessMapModel }) => buildWalkGuide(m.source, m.model, walkOrder(m.model, null));
const PO_GUIDE = guideOf(PO);
const BIG_GUIDE = guideOf(BIG);

const linesOf = (guide: WalkGuide): WalkLine[] =>
  Object.values(guide.byId).flatMap((s) => [s.happens, s.matters, s.ifGone, ...s.decides, ...(s.data ? [s.data] : [])]);
const step = (guide: WalkGuide, title: string) => Object.values(guide.byId).find((s) => s.title === title)!;

test.describe('every step of the walk is said in plain words, anchored to its lines', () => {
  for (const [name, m, guide] of [['the PO demo', PO, PO_GUIDE], ['the 1,000-line example', BIG, BIG_GUIDE]] as const) {
    test(`${name}: each walk step has an engine-written plain sentence`, () => {
      const order = walkOrder(m.model, null);
      expect(Object.keys(guide.byId).sort()).toEqual([...order].sort());
      const { plain, total } = plainShare(guide);
      // Measured 21.10.2026: 25 of 25 (PO), 52 of 52 (1,000 lines). The walk
      // before said none — a label and a yes/no question.
      expect(plain / total).toBeGreaterThanOrEqual(0.95);
    });

    test(`${name}: no sentence reads as code, and every anchor is a real line`, () => {
      const lineCount = m.source.split('\n').length;
      for (const line of linesOf(guide)) {
        expect(line.text, line.text).not.toMatch(ABAP_TOKEN);
        expect(line.text).not.toMatch(/\bIF\b|\bENDIF\b|\bPERFORM\b|\bSELECT\b/);
        expect(line.text.trim().length).toBeGreaterThan(0);
        if (line.anchor) {
          expect(line.anchor.lineStart).toBeGreaterThanOrEqual(1);
          expect(line.anchor.lineEnd).toBeLessThanOrEqual(lineCount);
          expect(line.anchor.lineEnd).toBeGreaterThanOrEqual(line.anchor.lineStart);
        }
      }
      // What happens, why and if it goes are said for every step, each with lines when the step has them.
      for (const s of Object.values(guide.byId)) {
        if (s.anchor) {
          expect(s.happens.anchor, s.title).not.toBeNull();
          expect(s.ifGone.anchor, s.title).not.toBeNull();
        }
      }
    });
  }

  test('a decision says its question and what each answer does', () => {
    const currency = step(PO_GUIDE, 'Currency not EUR?');
    expect(currency.happens.text).toBe('It checks: Currency not EUR? If yes, it goes on to “Convert to EUR”. If no, it carries on.');
    expect(currency.happens.anchor).toEqual({ lineStart: 69, lineEnd: 69 });
    const sales = step(BIG_GUIDE, 'Sales organization given?');
    expect(sales.happens.text).toContain('If no, the run stops with an error message.');
    expect(sales.matters.text).toMatch(/^It is a control/);
    expect(sales.data?.text).toBe('It looks at sales organization.');
  });

  test('what decides a step names the branch it stands in (3.0.18 enclosing branches)', () => {
    const order = step(PO_GUIDE, 'Order number given?');
    expect(order.decides.map((d) => d.text)).toContain('Only when account assignment category is F.');
    const outer = order.decides.find((d) => d.text.startsWith('Only when'))!;
    expect(outer.anchor).toEqual({ lineStart: 205, lineEnd: 205 });
    const auth = BIG_GUIDE.byId[Object.keys(BIG_GUIDE.byId).find((id) => BIG_GUIDE.byId[id].title === 'Not authorized?' && BIG_GUIDE.byId[id].anchor?.lineStart === 211)!];
    expect(auth.decides.map((d) => d.text)).toContain('Only when update selected.');
  });

  test('a read and a write name the data by its business name, with the table beside it', () => {
    expect(step(PO_GUIDE, 'Read purchase requisition').data?.text).toBe('It reads purchase requisitions (EBAN).');
    expect(step(BIG_GUIDE, 'Process actions').data?.text).toBe('It creates an entry in ZSD_ORD_RISK.');
    expect(step(BIG_GUIDE, 'Process actions').matters.text).toMatch(/changes data in the system/);
  });
});

test.describe('phases, technical steps and the summary', () => {
  test('business steps are grouped by phase, each phase in one piece', () => {
    const phaseOfStep = BIG_GUIDE.business.map((id) => BIG_GUIDE.byId[id].phase);
    const seen = new Set<string>();
    let last: string | null = null;
    for (const phase of phaseOfStep) {
      if (phase !== last) {
        expect(seen.has(phase), `phase ${phase} is split`).toBe(false);
        seen.add(phase);
        last = phase;
      }
    }
    expect(BIG_GUIDE.phases.map((p) => p.label)).toContain('Validate selection');
  });

  test('logging, file handling, run switches and loops are set apart, a business rule is not', () => {
    const groups = Object.fromEntries(BIG_GUIDE.technical.map((g) => [g.group, g.stepIds.map((id) => BIG_GUIDE.byId[id].title)]));
    expect(groups.logging).toEqual(expect.arrayContaining(['Persist run log', 'Write run statistics']));
    expect(groups.files).toEqual(expect.arrayContaining(['File given?', 'Save a file to the user\'s PC']));
    expect(groups.switches).toEqual(expect.arrayContaining(['Update selected?', 'Trace selected and background run not set?']));
    expect(groups.setup).toEqual(expect.arrayContaining(['Initialize run', 'For each order']));
    const business = BIG_GUIDE.business.map((id) => BIG_GUIDE.byId[id].title);
    expect(business).toEqual(expect.arrayContaining(['Sales organization given?', 'Action?', 'Display result list', 'Credit exposure read']));
    // "Not found, or stock below the ordered quantity" is a rule, though its first arm is a technical check.
    const stock = Object.values(BIG_GUIDE.byId).find((s) => s.anchor?.lineStart === 333)!;
    expect(stock.technical).toBeNull();
    expect(stock.happens.text).toContain('unrestricted stock below order quantity');
    // A permission check is the business's, not a technical guard.
    expect(Object.values(PO_GUIDE.byId).find((s) => s.title === 'Not authorized?')!.technical).toBeNull();
  });

  test('the stops: business steps, the technical steps once, then the summary', () => {
    const stops = walkStops(BIG_GUIDE);
    expect(stops.filter((s) => s.kind === 'technical')).toHaveLength(1);
    expect(stops[stops.length - 1]).toEqual({ kind: 'summary' });
    expect(stops.filter((s) => s.kind === 'step').map((s) => (s.kind === 'step' ? s.id : ''))).toEqual(BIG_GUIDE.business);
    const technical = stops.find((s) => s.kind === 'technical');
    expect(technical && technical.kind === 'technical' ? technical.ids.length : 0).toBe(
      BIG_GUIDE.technical.reduce((n, g) => n + g.stepIds.length, 0),
    );
  });

  const entry = (subject: string, state: StateEntry['state'], note: string | null = null): StateEntry => ({
    subject, kind: 'element', state, note, account: { uid: 'u', name: 'U' }, confirmedAt: '2026-10-21T08:00:00.000Z', revision: 2,
  });

  test('the walk resumes at the first open stop; a Clarify stays open; all answered opens the summary', () => {
    const stops = walkStops(PO_GUIDE);
    const [first, second] = PO_GUIDE.business;
    expect(resumeStop(stops, {})).toBe(0);
    expect(resumeStop(stops, { [first]: entry(first, 'keep') })).toBe(1);
    expect(resumeStop(stops, { [first]: entry(first, 'clarify') })).toBe(0);
    const all = Object.fromEntries(Object.keys(PO_GUIDE.byId).map((id) => [id, entry(id, 'keep')]));
    expect(resumeStop(stops, all)).toBe(stops.length - 1);
    expect(second).toBeTruthy();
  });

  test('the summary says what the business still needs, from the answers on record', () => {
    const [a, b, c, d] = PO_GUIDE.business;
    const summary = walkSummary(PO_GUIDE, {
      [a]: entry(a, 'keep'),
      [b]: entry(b, 'change', 'Use the SAP standard release strategy'),
      [c]: entry(c, 'drop', 'Nobody uses it'),
      [d]: entry(d, 'clarify', 'Ask purchasing'),
    });
    expect(summary.keep.map((i) => i.id)).toEqual([a]);
    expect(summary.change[0]).toMatchObject({ id: b, note: 'Use the SAP standard release strategy' });
    expect(summary.drop.map((i) => i.id)).toEqual([c]);
    expect(summary.clarify.map((i) => i.id)).toEqual([d]);
    expect(summary.open).toHaveLength(PO_GUIDE.business.length - 4);
    expect(summary.technical.total).toBe(PO_GUIDE.technical.reduce((n, g) => n + g.stepIds.length, 0));
  });

  test('only elements the route can store an answer for are walked', () => {
    const subjects = new Set(PO_GUIDE.business.slice(0, 3));
    const narrowed = restrictGuide(PO_GUIDE, subjects);
    expect(narrowed.business).toEqual(PO_GUIDE.business.slice(0, 3));
    expect(narrowed.technical).toEqual([]);
    expect(restrictGuide(PO_GUIDE, null)).toBe(PO_GUIDE);
  });

  test('deterministic: the same source says the same thing', () => {
    expect(JSON.stringify(guideOf(PO))).toBe(JSON.stringify(PO_GUIDE));
  });
});

/* ------------------------------------------------------------- rendered */

async function load(file: string): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'process-walk-guide', String(process.pid), `${path.basename(file, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, 'components', 'workspace', file)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out).default;
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test.describe('the walk-through on screen (server-free render)', () => {
  test('a step is said before it is asked, the code one fold down, and no "Step n of n: label" heading', async () => {
    const Walk = await load('ProcessWalkThrough.tsx');
    const stops = walkStops(PO_GUIDE);
    const at = stops.findIndex((s) => s.kind === 'step' && PO_GUIDE.byId[s.id].title === 'Currency not EUR?');
    const id = (stops[at] as { id: string }).id;
    const html = renderToStaticMarkup(
      React.createElement(Walk, {
        projectId: 'p1',
        guide: PO_GUIDE,
        stops,
        at,
        answers: {},
        subjectOf: (sid: string) => ({ subject: sid, kind: 'element', label: 'x', detail: 'Decision', anchor: null }),
        owner: true,
        answering: null,
        onAnswer: () => {},
        onAnswerMany: () => {},
        onGo: () => {},
        onClose: () => {},
        onOpenLines: () => {},
        source: PO.source,
        fileName: 'Z_MM_PO_APPROVAL.abap',
      }),
    );
    const text = textOf(html);
    expect(html).toContain(`data-walk-step="${at + 1}"`);
    expect(html).toContain(`data-workspace-walk-step-id="${id}"`);
    const said = text.indexOf('What happens here');
    const asked = text.indexOf('Does the business still need this step?');
    expect(said).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(said);
    for (const part of ['Why it matters', 'What decides it', 'What data it touches', 'If it goes']) {
      const at2 = text.indexOf(part);
      expect(at2, part).toBeGreaterThan(said);
      expect(at2, part).toBeLessThan(asked);
    }
    expect(text).toContain('If yes, it goes on to “Convert to EUR”.');
    // The code is folded, with its lines on the closed fold.
    expect(html).toContain('data-workspace-walk-code=""');
    expect(text).toContain('The code behind this step');
    expect(text).toContain('Line 69');
    // The phase is said, and the old heading is gone.
    expect(text).toMatch(/Phase \d+ of \d+: Read requisition/);
    expect(text).not.toMatch(/Step \d+ of \d+: /);
    // The answer control is there for the owner, after the explanation.
    expect(html).toContain('data-state-confirm=');
  });

  test('closed, the walk-through says what it is, its shape and its progress', async () => {
    const Walk = await load('ProcessWalkThrough.tsx');
    const html = renderToStaticMarkup(
      React.createElement(Walk, {
        projectId: 'p1', guide: BIG_GUIDE, stops: walkStops(BIG_GUIDE), at: null, answers: {}, subjectOf: () => null,
        owner: true, answering: null, onAnswer: () => {}, onAnswerMany: () => {}, onGo: () => {}, onClose: () => {},
        onOpenLines: () => {}, source: BIG.source, fileName: 'Z.abap',
      }),
    );
    const text = textOf(html);
    expect(html).toContain('id="process-walk"');
    expect(html).toContain('data-workspace-walk-start=""');
    expect(text).toContain('Walk through the process in plain words');
    expect(text).toMatch(/\d+ business steps in \d+ phases · \d+ technical steps answered once/);
    expect(html).toContain('data-workspace-walk-phase="technical"');
  });

  test('the technical stop asks once for the whole group; the summary lists the open steps', async () => {
    const Walk = await load('ProcessWalkThrough.tsx');
    const stops = walkStops(BIG_GUIDE);
    const base = {
      projectId: 'p1', guide: BIG_GUIDE, stops, answers: {}, owner: true, answering: null,
      subjectOf: (sid: string) => ({ subject: sid, kind: 'element', label: sid, detail: '', anchor: null }),
      onAnswer: () => {}, onAnswerMany: () => {}, onGo: () => {}, onClose: () => {}, onOpenLines: () => {},
      source: BIG.source, fileName: 'Z.abap',
    };
    const technical = renderToStaticMarkup(React.createElement(Walk, { ...base, at: stops.findIndex((s) => s.kind === 'technical') }));
    expect(technical.match(/data-state-confirm=/g)).toHaveLength(1);
    expect(textOf(technical)).toContain('Logging and statistics (');
    const summary = renderToStaticMarkup(React.createElement(Walk, { ...base, at: stops.length - 1 }));
    expect(textOf(summary)).toContain('What the business still needs');
    expect(summary).toContain(`data-workspace-walk-summary-part="open" data-count="${BIG_GUIDE.business.length}"`);
  });

  test('the entry at the top of the Business view opens the walk', async () => {
    const Entry = await load('ProcessWalkEntry.tsx');
    const html = renderToStaticMarkup(React.createElement(Entry, { projectId: 'p1', answered: 3 }));
    expect(html).toContain('data-workspace-walk-entry-open=""');
    expect(textOf(html)).toContain('3 steps answered so far.');
  });
});

test.describe('where it stands and what it writes', () => {
  test('the entry comes right after "Next step", before the first look; the walk stands above the map', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    const block = shell.match(/const BUSINESS_ORDER[^=]*=\s*\[([\s\S]*?)\];/)![1];
    const order = [...block.matchAll(/^\s*'([a-zA-Z]+)',/gm)].map((m) => m[1]);
    expect(order.slice(0, 3)).toEqual(['nextStep', 'walk', 'firstLook']);
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process.indexOf('<ProcessWalkThrough')).toBeGreaterThan(-1);
    expect(process.search(/<ProcessMap\s/)).toBeGreaterThan(-1);
    expect(process.indexOf('<ProcessWalkThrough')).toBeLessThan(process.search(/<ProcessMap\s/));
    expect(process).not.toContain('function WalkStep(');
  });

  test('answers go through the process-states route as before — no new client-written field', () => {
    const process = read('components/workspace/WorkspaceProcess.tsx');
    expect(process).toContain('confirmProcessStates(');
    for (const rel of ['components/workspace/ProcessWalkThrough.tsx', 'components/workspace/ProcessWalkEntry.tsx', 'lib/process-walk-guide.ts', 'lib/process-walk-request.ts']) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/firebase|setDoc|updateDoc|addDoc|fetch\(/);
    }
  });

  test('the guide is engine-only: no model, no network', () => {
    const src = read('lib/process-walk-guide.ts');
    expect(src).not.toMatch(/gemini|openai|anthropic|\/api\//i);
  });
});
