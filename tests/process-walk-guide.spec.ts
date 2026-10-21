import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import {
  ABAP_TOKEN,
  buildWalkGuide,
  plainShare,
  type WalkGuide,
  type WalkLine,
} from '../lib/process-walk-guide';
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

test.describe('phases and technical steps', () => {
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

  test('deterministic: the same source says the same thing', () => {
    expect(JSON.stringify(guideOf(PO))).toBe(JSON.stringify(PO_GUIDE));
  });
});

test.describe('what it writes', () => {
  test('the guide is engine-only: no model, no network, no answer', () => {
    const src = read('lib/process-walk-guide.ts');
    expect(src).not.toMatch(/gemini|openai|anthropic|\/api\//i);
    expect(src).not.toMatch(/firebase|setDoc|updateDoc|addDoc|fetch\(/);
  });

  test('every step says what it is for the business — what the tour picks its stations by', () => {
    const roles = (title: string) => step(BIG_GUIDE, title).role;
    expect(roles('Process actions')).toBe('change');
    expect(roles('Credit exposure read')).toBe('remote');
    expect(roles('Sales organization given?')).toBe('control');
    expect(roles('Send summary mail')).toBe('mail');
    expect(roles('Display result list')).toBe('output');
    expect(step(PO_GUIDE, 'Not authorized?').role).toBe('permission');
    expect(step(PO_GUIDE, 'Read purchase requisition').role).toBe('read');
  });
});
