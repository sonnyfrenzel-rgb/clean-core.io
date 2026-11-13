import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProcess, readRules } from '../lib/first-look';
import {
  aroundPlainSentences,
  aroundTheMap,
  DOES_SENTENCES,
  everySentence,
  groupSteps,
  modelPurposeOf,
  questionsOf,
  QUESTIONS_SHOWN,
  runAt,
  RUNS_MAX,
  WHY_CAUTION,
  type AroundTheMapText,
} from '../lib/around-the-map';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { unreadCodesOf } from '../lib/program-summary-check';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

/**
 * The text around the map — Analyze, Business view (plan `docs/design/analyze-business-first-plan.md` §4.2, AB-6;
 * ADR-116; mockup `docs/roadmap/analyze-business-first-mockup.html`, states 3, 5 and 9). Server-free: the pure text
 * model (`lib/around-the-map.ts`), a static render of `components/analyze/AroundTheMap.tsx`, and the page's source.
 *
 *   - every sentence has its line, on every starter example;
 *   - a model's wording that names an object the engine did not read is dropped (N5);
 *   - engine text carries no AI chip; the chip stands only on a block a model wrote.
 *
 * It also pins the measurement the plan asked for (§3, "Questions to settle with the business"): which of the
 * mockup's six question kinds the engine produces on the PO approval example.
 */

const ROOT = path.resolve(__dirname, '..');
const ENGINE = ENGINE_READS_310_FROM;
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const INVOICE = read('public/starter-examples/Z_INVOICE_EXTRACTOR.txt');
const FIXTURE = read('tests/fixtures/first-look/zmm-receipt-invoice-check.abap');

function textOf(source: string, extra: { narrative?: string | null; engineVersion?: string } = {}): AroundTheMapText {
  const engineVersion = extra.engineVersion ?? ENGINE;
  const proc = readProcess(source);
  return aroundTheMap({
    source,
    skeleton: proc.skeleton,
    ruleSet: readRules(source, proc, engineVersion),
    processFacts: proc.facts,
    engineVersion,
    narrative: extra.narrative ?? null,
  });
}

const narrativeOf = (asIsContext: string) => JSON.stringify({ asIsContext, summary: '' });

test.describe('no sentence without its line', () => {
  for (const example of STARTER_EXAMPLES) {
    test(`${example.file}: every sentence of the five blocks carries a line inside the source`, () => {
      const source = read(`public/starter-examples/${example.file}`);
      const lines = source.split('\n').length;
      const text = textOf(source);
      const all = everySentence(text);
      expect(all.length).toBeGreaterThan(4);
      for (const s of all) {
        const m = /^L(\d+)(?:-(\d+))?$/.exec(s.anchor);
        expect(m, `"${s.text}" has no line`).not.toBeNull();
        const from = Number(m![1]);
        const to = m![2] ? Number(m![2]) : from;
        expect(from).toBeGreaterThan(0);
        expect(to).toBeLessThanOrEqual(lines);
        expect(to).toBeGreaterThanOrEqual(from);
        expect(s.text.trim().length, s.anchor).toBeGreaterThan(0);
      }
      // Two sentences on what it does, at most four paragraphs, at most six questions.
      expect(text.does.sentences.length).toBeLessThanOrEqual(DOES_SENTENCES);
      expect(text.does.sentences.length).toBeGreaterThan(0);
      expect(text.runs.length).toBeLessThanOrEqual(RUNS_MAX);
      expect(text.runs.length).toBeGreaterThan(0);
      expect(text.questions.length).toBeLessThanOrEqual(QUESTIONS_SHOWN);
    });
  }

  test('a step the engine gave no line is not said; the paragraphs keep the code\'s order', () => {
    const text = textOf(PO);
    const starts = text.runs.flatMap((r) => r.steps.map((s) => Number(/^L(\d+)/.exec(s.step.anchor)![1])));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // The engine's story, every step with a line, in four paragraphs: nothing lost, nothing added.
    expect(starts.length).toBe(text.story.steps.filter((s) => s.anchor).length);
  });

  test('the steps are cut into at most four paragraphs, the larger ones first', () => {
    expect(groupSteps([1, 2, 3, 4, 5, 6, 7, 8]).map((g) => g.length)).toEqual([2, 2, 2, 2]);
    expect(groupSteps([1, 2, 3, 4, 5]).map((g) => g.length)).toEqual([2, 1, 1, 1]);
    expect(groupSteps([1, 2]).map((g) => g.length)).toEqual([1, 1]);
    expect(groupSteps([])).toEqual([]);
  });
});

test.describe('"What this program does": the model\'s wording only after the check (N5)', () => {
  const proc = readProcess(INVOICE);
  const facts = programSummaryFactsOf(INVOICE, { skeleton: proc.skeleton, engineVersion: ENGINE });

  test('a faithful wording stands, marked as the model\'s, each sentence on the engine\'s line', () => {
    const narrative = narrativeOf('It lists billing documents for a billing date and type. It can also write them to a file on the server [L58].');
    const text = textOf(INVOICE, { narrative });
    expect(text.does.by).toBe('model');
    expect(text.does.sentences.map((s) => s.text)).toEqual(['It lists billing documents for a billing date and type.', 'It can also write them to a file on the server.']);
    const engine = textOf(INVOICE).does.sentences.map((s) => s.anchor);
    expect(text.does.sentences.map((s) => s.anchor)).toEqual(engine);
  });

  test('a proposal naming an unread object is dropped, and the engine\'s sentences stand', () => {
    // A business object of the glossary the program never reads: purchase orders.
    expect(textOf(INVOICE, { narrative: narrativeOf('It lists billing documents and their purchase orders.') }).does.by).toBe('engine');
    // A table code the program never touches.
    expect(textOf(INVOICE, { narrative: narrativeOf('It lists billing documents from VBRK and EKKO.') }).does.by).toBe('engine');
    // A custom name the glossary does not know — the purpose check alone lets it through; this one does not.
    const custom = 'It lists billing documents and stores them in ZBILL_ARCHIVE.';
    expect(unreadCodesOf(custom, facts)).toEqual(['ZBILL_ARCHIVE']);
    expect(modelPurposeOf(narrativeOf(custom), facts)).toBeNull();
    expect(textOf(INVOICE, { narrative: narrativeOf(custom) }).does.by).toBe('engine');
    // A claim the facts contradict: it posts, but the code changes no data.
    expect(textOf(INVOICE, { narrative: narrativeOf('It posts billing documents.') }).does.by).toBe('engine');
    // Words in capitals are not names; the program's own name and the tables it reads are known.
    expect(unreadCodesOf('A CSV list of VBRK rows for Z_INVOICE_EXTRACTOR.', facts)).toEqual([]);
  });

  test('"Why it exists" is the engine\'s: the purpose from the names, the quoted header, and the fixed caution', () => {
    const text = textOf(INVOICE, { narrative: narrativeOf('It lists billing documents for a billing date and type.') });
    expect(text.why.sentences.map((s) => s.text)).toEqual(['Extracts invoices, billing documents and materials.']);
    expect(text.why.authorClaim?.text).toBe('Reads billing documents and extracts them to a local server CSV file');
    // The purpose from the names is not said twice: "What this program does" leaves it to "Why it exists".
    expect(text.does.sentences.some((s) => s.text.startsWith('Extracts invoices'))).toBe(false);
    expect(WHY_CAUTION).toBe('The code does not say this in words. Confirm it with the process owner.');
  });
});

test.describe('who is involved and the questions — the engine\'s, each with its line', () => {
  test('PO approval: who starts it and who must be authorised, by what the authorization protects', () => {
    const who = textOf(PO).who;
    expect(who.map((w) => w.role)).toEqual(['Who starts it', 'The person who runs it']);
    expect(who[1].text).toBe('needs the authorization for purchase requisitions by purchasing group (M_BANF_EKG).');
    // Never a job title the code does not name (roadmap §8: no role mandates).
    expect(who.map((w) => `${w.role} ${w.text}`).join(' ')).not.toMatch(/\b(buyer|manager|department head|CFO)\b/i);
  });

  test('IT\'s questions stay in IT: only a finding a business reader or a user is asked about is listed', () => {
    const findings = [
      { reader: 'fixed-scope' as const, text: 'Fixed in the code. Does that still hold?', anchor: 'L10', ask: 'business' as const },
      { reader: 'authority' as const, text: 'Is the change permission checked elsewhere?', anchor: 'L20', ask: 'it' as const },
      { reader: 'ignored-input' as const, text: 'Is the field still needed?', anchor: 'L30', ask: 'users' as const },
    ];
    const asked = questionsOf(findings, null);
    expect(asked.questions.map((q) => q.id)).toEqual(['fixed-scope', 'ignored-input']);
    expect(asked.questions.every((q) => q.from === 'finding')).toBe(true);
  });

  test('the measurement of plan §3: which of the mockup\'s six question kinds the engine asks on the PO example', () => {
    const proc = readProcess(PO);
    const ex = explainBusinessRules(PO, readRules(PO, proc, ENGINE), proc.facts, ENGINE);
    // Every question the engine asks, listed or counted: six on the page, the rest in Design.
    const listed = questionsOf([], ex);
    expect(listed.questions.length + listed.more).toBe(ex.questions.length);
    const at = (line: number) => ex.questions.some((q) => q.statement.anchors.some((a) => a.lineStart <= line && a.lineEnd >= line));
    // Produced: the 5 % limit for a hold (line 315), the 50,000.00 emergency limit (325), plant 1000 without a
    // limit check (95), and the department head's approval set at once (432) — said as the facts, not as the
    // mockup's consequence ("the order is created before anyone approves").
    expect(at(315)).toBe(true);
    expect(at(325)).toBe(true);
    expect(at(95)).toBe(true);
    expect(at(432)).toBe(true);
    // Not produced: the test run that still creates a purchase order (39, 407–411) and the two missing parts (363, 396).
    expect(at(407) || at(39)).toBe(false);
    expect(at(363) || at(396)).toBe(false);
  });
});

test.describe('"you are here": the hook the walk-through drives (AB-4)', () => {
  test('a station\'s node, or a line of it, names the paragraph that holds it', () => {
    const text = textOf(PO);
    expect(runAt(text.runs, null)).toBeNull();
    for (let i = 0; i < text.runs.length; i += 1) {
      expect(runAt(text.runs, { nodeId: text.runs[i].nodeIds[0] })).toBe(i);
      expect(runAt(text.runs, { line: text.runs[i].lines[0][0] })).not.toBeNull();
    }
    expect(runAt(text.runs, { nodeId: 'no-such-node' })).toBeNull();
  });
});

test.describe('the plain wording rewords the engine\'s summary and steps only', () => {
  test('offered: the summary when the engine wrote it, and the steps — each with its line', () => {
    const engine = textOf(PO);
    const offered = aroundPlainSentences(engine);
    expect(offered.length).toBe(engine.does.sentences.length + engine.runs.reduce((n, r) => n + r.steps.length, 0));
    expect(offered.every((s) => s.anchor !== null)).toBe(true);
    const model = textOf(INVOICE, { narrative: narrativeOf('It lists billing documents for a billing date and type.') });
    // A model's wording is never reworded again.
    expect(aroundPlainSentences(model).some((s) => s.text.startsWith('It lists billing documents'))).toBe(false);
  });
});

test.describe('rendered (static markup)', () => {
  type Mod = {
    default: (props: Record<string, unknown>) => React.ReactElement | null;
    WhatThisProgramDoes: (props: Record<string, unknown>) => React.ReactElement | null;
  };
  let mod: Mod | null = null;
  async function load(): Promise<Mod> {
    if (mod) return mod;
    const out = path.join(ROOT, 'tmp', 'analyze-around-the-map', String(process.pid), 'AroundTheMap.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'analyze', 'AroundTheMap.tsx')],
      outfile: out,
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    mod = require(out) as Mod;
    return mod;
  }
  const render = (el: React.ReactElement) => renderToStaticMarkup(el);
  /** The sentences on the page and the anchors they carry. */
  const sentencesIn = (html: string) => [...html.matchAll(/data-around-sentence="" data-anchor="([^"]*)"/g)].map((m) => m[1]);

  test('engine text carries no AI chip — every block says Reconstructed', async () => {
    const { default: Around, WhatThisProgramDoes } = await load();
    const text = textOf(PO);
    const html = render(React.createElement(Around, { text, state: 'ready', designHref: '/project/p/design#rule-questions' }));
    const top = render(React.createElement(WhatThisProgramDoes, { text, state: 'ready' }));
    for (const h of [html, top]) {
      expect(h).not.toContain('data-provenance="proposed"');
      expect(h).not.toContain('data-worded-chip');
      expect(h).toContain('data-provenance="reconstructed"');
    }
    expect(top).toContain('data-around-does="engine"');
    // Every sentence on the page carries its line, and every line of the model is on the page.
    const shown = sentencesIn(html + top);
    expect(shown.length).toBe(everySentence(text).length);
    expect(shown.every((a) => /^L\d+(?:-\d+)?$/.test(a))).toBe(true);
    // The fixed caution, the basket line into Design, and the note that IT has its own questions.
    expect(html).toContain(WHY_CAUTION);
    expect(html).toContain('data-rule-basket-line=""');
    expect(html).toContain('href="/project/p/design#rule-questions"');
    expect(html).toContain('IT has its own questions in the IT view.');
  });

  test('the AI chip stands only on the block a model wrote', async () => {
    const { default: Around, WhatThisProgramDoes } = await load();
    const model = textOf(INVOICE, { narrative: narrativeOf('It lists billing documents for a billing date and type.') });
    const top = render(React.createElement(WhatThisProgramDoes, { text: model, state: 'ready' }));
    expect(top).toContain('data-around-does="model"');
    expect(top).toContain('data-provenance="proposed"');
    const below = render(React.createElement(Around, { text: model, state: 'ready' }));
    expect(below).not.toContain('data-provenance="proposed"');
    // A plain wording of one step: the chip on "How it runs" alone, the engine's sentence one fold down.
    const step = model.runs[0].steps[0].step.text;
    const say = (t: string) => (t === step ? { text: 'It reads the billing documents.', engine: t, worded: true } : { text: t, engine: t, worded: false });
    const worded = render(React.createElement(Around, { text: model, state: 'ready', say }));
    const runs = worded.slice(worded.indexOf('data-around-runs'), worded.indexOf('data-around-why-who'));
    expect(runs).toContain('It reads the billing documents.');
    expect(runs).toContain('data-worded-chip=""');
    expect(runs).toContain('data-worded-engine-sentence=""');
    expect(worded.slice(worded.indexOf('data-around-why-who'))).not.toContain('data-worded-chip');
  });

  test('placeholders while the text arrives; the summary steps aside while the tour runs', async () => {
    const { default: Around, WhatThisProgramDoes } = await load();
    const waiting = render(React.createElement(Around, { text: null, state: 'reading' }));
    expect(waiting).toContain('data-around-the-map="reading"');
    expect((waiting.match(/data-around-waiting=""/g) ?? []).length).toBe(4);
    expect(waiting).not.toContain('data-provenance');
    const top = render(React.createElement(WhatThisProgramDoes, { text: null, state: 'reading', actions: React.createElement('button', { 'data-analyze-walk': '' }, 'Walk me through it') }));
    expect(top).toContain('data-around-waiting=""');
    expect(top).toContain('data-analyze-walk=""');
    expect(render(React.createElement(WhatThisProgramDoes, { text: textOf(PO), state: 'ready', hidden: true }))).toBe('');
    const failed = render(React.createElement(Around, { text: null, state: 'failed' }));
    expect(failed).toContain('data-around-the-map="failed"');
  });

  test('"you are here" marks the paragraph the tour stands in', async () => {
    const { default: Around } = await load();
    const text = textOf(PO);
    const html = render(React.createElement(Around, { text, state: 'ready', here: { nodeId: text.runs[2].nodeIds[0] } }));
    expect((html.match(/data-around-run-here=""/g) ?? []).length).toBe(1);
    expect(html).toMatch(/data-around-run="3" data-around-run-here="" aria-current="step"/);
    expect(html).toContain('you are here');
    expect(render(React.createElement(Around, { text, state: 'ready' }))).not.toContain('data-around-run-here');
  });

  test('the demo\'s fixture: the test data stands apart from the steps, with its line', async () => {
    const { default: Around } = await load();
    const text = textOf(FIXTURE, { engineVersion: '3.0.20' });
    expect(text.testData?.text).toContain('runs on 30 test cases of its own');
    const html = render(React.createElement(Around, { text, state: 'ready' }));
    expect(html).toContain('data-around-test-data=""');
    expect(html).not.toContain('Apply case');
  });
});

test.describe('the page (source guards)', () => {
  const business = read('components/analyze/AnalyzeBusiness.tsx');
  const demo = read('components/demo/DemoAnalyzeBusiness.tsx');

  test('summary, map, text, then the two endings — in that order; the interim First insights blocks are gone', () => {
    const at = (needle: string) => business.indexOf(needle);
    expect(at('<WhatThisProgramDoes')).toBeGreaterThan(-1);
    expect(at('<WorkspaceProcess')).toBeGreaterThan(at('<WhatThisProgramDoes'));
    expect(at('<AroundTheMap')).toBeGreaterThan(at('<WorkspaceProcess'));
    // AB-4 (3.2.0): the two endings in full stand under the text where "Next step" stood.
    expect(at('data-analyze-what-next-show')).toBeGreaterThan(at('<AroundTheMap'));
    for (const gone of ['components/workspace/BusinessOpening.tsx', 'components/workspace/FirstLook.tsx']) {
      expect(fs.existsSync(path.join(ROOT, gone)), gone).toBe(false);
    }
    expect(business).not.toMatch(/<FirstLook\b|<BusinessOpening\b|import [^\n]*(?:FirstLook|BusinessOpening)\b|businessInShort\(/);
    // Every line anchor on the page opens the code beside the map.
    expect(business).toMatch(/<WhatThisProgramDoes[\s\S]{0,120}onAnchor=\{openAnchor\}/);
    expect(business).toMatch(/<AroundTheMap[\s\S]{0,200}onAnchor=\{openAnchor\}/);
  });

  test('the demo shows the same components, asks no model, and its basket line names no Design', () => {
    expect(demo).toContain('<WhatThisProgramDoes');
    expect(demo).toContain("useAroundTheMap({ project, projectId: 'demo', owner: false, model: false, source })");
    // AB-4 drives "you are here" with `here`, as in a project.
    expect(demo).toContain('<AroundTheMap text={around.text} state={around.state} designHref={null} here={here} />');
    expect(demo).not.toMatch(/<FirstLook\b/);
  });

  test('only the owner\'s visit may ask for a plain wording; the model text is the narrative already signed', () => {
    const hook = read('hooks/useAroundTheMap.ts');
    expect(business).toContain('useAroundTheMap({ project, projectId, owner, source: signed?.source ?? legacyCode })');
    expect(hook).toContain('autoAllowed: availability.autoSteps,');
    expect(hook).toContain("active: model && sentences !== null,");
    // No naming is read and no model is asked for the text itself: the narrative is the signed run's.
    expect(hook).not.toMatch(/fetchProcessNaming|\/api\/gemini|fetch\(/);
  });
});
