import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProcess, readRules } from '../lib/first-look';
import { DECIDES_SHOWN, IN_SHORT_WORDS, changesOnTop, decidesOnTop, firstLookBrief, isNegativeClause, splitPurpose } from '../lib/first-look-brief';
import { deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { processStory } from '../lib/process-story';
import { aroundTheMap } from '../lib/around-the-map';
import { STARTER_EXAMPLES } from '../lib/starter-examples';

/**
 * Roadmap 3.0.21 — "First insights becomes the strongest page of the app"
 * (owner decisions 22.10.2026), the presentation half: at most five blocks on
 * top in about one screen, one line per step, "What the code gives away", and
 * "Ask this case" out of the Business view. Server-free: the engine, the pure
 * helpers the page lays out, one static render and the shell's source.
 *
 * Read for engine 3.0.20 — the readings the 3.0.21 gate adds are pinned in
 * their own spec; this one pins the layout.
 */

const ROOT = path.resolve(__dirname, '..');
const ENGINE = '3.0.20';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const RECEIPT = read('tests/fixtures/first-look/zmm-receipt-invoice-check.abap');
const PO = read('public/starter-examples/Z_MM_PO_APPROVAL.abap');
const DELIVERY = read('public/starter-examples/Z_SD_DELIVERY_PRIORITY.abap');

function opening(source: string) {
  const proc = readProcess(source);
  const rules = deriveBusinessRulesFrom(source, proc.facts, proc.skeleton, ENGINE);
  const facts = programSummaryFactsOf(source, { skeleton: proc.skeleton, ruleSet: rules, engineVersion: ENGINE });
  const summary = programSummary(facts);
  const lines = businessInShort(summary, { codes: false });
  const explanation = explainBusinessRules(source, rules, proc.facts, ENGINE);
  const story = processStory(proc.skeleton, source, null, ENGINE);
  return { proc, rules, facts, summary, lines, explanation, story, brief: firstLookBrief(lines) };
}

/**
 * `AroundTheMap` (plan AB-6, 3.2.0), bundled for a static render; `tag` keeps parallel describes apart. The
 * First insights opening (`BusinessOpening`) it replaced stood below the map until 3.1.0.
 */
async function loadAroundFor(tag: string): Promise<{
  default: (props: Record<string, unknown>) => React.ReactElement | null;
  WhatThisProgramDoes: (props: Record<string, unknown>) => React.ReactElement | null;
}> {
  const out = path.join(ROOT, 'tmp', 'first-look-3021', `${process.pid}-${tag}`, 'AroundTheMap.cjs');
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
  return require(out);
}

/** The text around the map, read for `engine` from `source`. */
function aroundOf(source: string, engine = ENGINE) {
  const proc = readProcess(source);
  return aroundTheMap({ source, skeleton: proc.skeleton, ruleSet: readRules(source, proc, engine), processFacts: proc.facts, engineVersion: engine });
}

// The drawing beside the steps (the main-line excerpt, `lib/first-look-excerpt.ts`) retired with
// the paced build-up in v3.1.0 (plan AB-3): the map above the first insights is the picture of the
// process. The step list's own setting-apart of the test-data switch is held below.

test.describe('the top blocks, cut from the engine\'s own sentences (lib/first-look-brief.ts)', () => {
  test('the purpose sentence is cut only at the summary\'s own seams', () => {
    expect(splitPurpose('Creates purchase orders and starts workflows in SAP, reading purchase requisitions and suppliers, selected by purchase requisition number.')).toEqual({
      head: 'Creates purchase orders and starts workflows in SAP',
      tail: 'purchase requisitions and suppliers, selected by purchase requisition number',
    });
    expect(splitPurpose('Creates sales orders in SAP, selected by customer and material.')).toEqual({
      head: 'Creates sales orders in SAP',
      tail: 'selected by customer and material',
    });
    expect(splitPurpose('Posts goods movements in SAP.')).toEqual({ head: 'Posts goods movements in SAP', tail: null });
  });

  test('PO approval: in short, started by, goes in, comes out — each with its line', () => {
    const { brief } = opening(PO);
    expect(brief.inShort?.text).toBe('Creates purchase orders and starts workflows in SAP.');
    expect(brief.goesIn?.text).toBe('Purchase requisitions and suppliers, selected by purchase requisition number.');
    expect(brief.startedBy?.text).toMatch(/^A user starts it from a selection screen/);
    expect(brief.comesOut?.text).toBe('A list on screen.');
    for (const line of [brief.inShort, brief.goesIn, brief.startedBy, brief.comesOut]) expect(line?.anchor).toMatch(/^L\d+/);
  });

  test('the purpose from the program\'s names leads where there is one', () => {
    const { brief } = opening(RECEIPT);
    expect(brief.inShort?.text).toMatch(/^Checks supplier invoices against purchase orders and goods receipts, within a tolerance\./);
  });

  test(`"In short" is at most two sentences and ${IN_SHORT_WORDS} words on every starter example, and names what the program does`, () => {
    for (const example of STARTER_EXAMPLES) {
      const { brief, lines } = opening(read(`public/starter-examples/${example.file}`));
      expect(brief.inShort, example.file).not.toBeNull();
      expect(brief.inShort!.text.split(/\s+/).length, `${example.file}: ${brief.inShort!.text}`).toBeLessThanOrEqual(IN_SHORT_WORDS);
      expect(brief.inShort!.parts.length, example.file).toBeLessThanOrEqual(2);
      // Every part is cut from a summary line it names — the key a plain wording of that line has.
      for (const p of brief.inShort!.parts) expect(lines.map((l) => l.text), example.file).toContain(p.line);
      expect(isNegativeClause(brief.inShort!.parts[0].text), `${example.file}: ${brief.inShort!.text}`).toBe(false);
      expect(brief.startedBy, example.file).not.toBeNull();
      expect(brief.comesOut, example.file).not.toBeNull();
    }
  });

  test('the receipt check: the purpose from its names and what it works on, two short sentences (owner 23.10.2026)', () => {
    const { brief } = opening(RECEIPT);
    expect(brief.inShort?.parts.map((p) => p.text)).toEqual([
      'Checks supplier invoices against purchase orders and goods receipts, within a tolerance.',
      'A read-only report that gets its data through SAP function calls on supplier invoices, purchase orders and goods movements.',
    ]);
  });
});

test.describe('"In short" never leads with what the program does not do (owner, 23.10.2026)', () => {
  // A report of the owner's shape: selection screen, demo cases, a list on screen, a CSV download, no table by name.
  const BROKER = read('tests/fixtures/first-look/report-demo-cases-download.abap');

  test('the negative clauses are recognised; a sentence of what it does is not', () => {
    expect(isNegativeClause('A read-only report that reads no table by name.')).toBe(true);
    expect(isNegativeClause('It does not post or change data in SAP.')).toBe(true);
    expect(isNegativeClause('A read-only report on billing documents and billing document items.')).toBe(false);
    expect(isNegativeClause('Creates purchase orders and starts workflows in SAP.')).toBe(false);
  });

  test('a report that reads no table by name opens with what comes out, not with "reads no table by name"', () => {
    const { brief, lines } = opening(BROKER);
    // What the 22.10.2026 rebuild put on top — still in the summary, one fold down.
    expect(lines.map((l) => l.text)).toContain('A read-only report that reads no table by name.');
    expect(brief.inShort?.text).toBe('The result is a list on screen; it can also save it as a file on the user\'s PC.');
    expect(brief.inShort?.text).not.toMatch(/no table by name/);
    // "Comes out" is not said a second time under it.
    expect(brief.comesOut).toBeNull();
    expect(brief.startedBy?.text).toMatch(/^A user starts it from a selection screen/);
  });

  test('the guard: wherever a summary line says what the program does, the lead is not a negative clause', () => {
    const sources = [...STARTER_EXAMPLES.map((e) => read(`public/starter-examples/${e.file}`)), RECEIPT, BROKER];
    for (const source of sources) {
      const { brief, lines } = opening(source);
      const doing = lines.some((l) => (l.key === 'purpose' || l.key === 'reads' || l.key === 'result') && !isNegativeClause(l.text));
      if (doing) expect(isNegativeClause(brief.inShort!.parts[0].text), brief.inShort!.text).toBe(false);
    }
  });

  test('a plain wording on record of an engine sentence stands in its place, with the AI-generated chip (AB-6)', async () => {
    // Since 3.2.0 "What this program does" above the map carries the engine's sentences (AB-6); a plain wording on
    // record stands in place with the chip, the engine's sentence one fold down — as "In short" did in the opening.
    const { WhatThisProgramDoes } = await loadAroundFor('in-short');
    const text = aroundOf(BROKER);
    const first = text.does.sentences[0];
    expect(isNegativeClause(first.text), first.text).toBe(false);
    const worded = 'Shows supplier delivery commitments as a list and can save them as a CSV file.';
    const say = (t: string, anchor: { lineStart: number; lineEnd: number } | null) =>
      t === first.text && anchor ? { text: worded, engine: t, worded: true, origin: null } : { text: t, engine: t, worded: false, origin: null };
    const html = renderToStaticMarkup(React.createElement(WhatThisProgramDoes, { text, state: 'ready', say }));
    expect(html).toContain(worded);
    expect(html).toContain('data-worded-chip');
    expect(html).toContain('data-worded-engine-sentence=""');
  });
});

test.describe('"What it decides" and the basket line count the same rules (fix, 22.10.2026)', () => {
  test(`at most ${DECIDES_SHOWN} statements, weightiest first, from the business basket only`, () => {
    const { explanation } = opening(PO);
    const top = decidesOnTop(explanation);
    expect(top.lines.length).toBe(DECIDES_SHOWN);
    expect(top.lines.reduce((n, l) => n + 1 + (l.also?.length ?? 0), 0) + top.more).toBe(explanation.questions.length);
    expect(top.lines[0].text).toMatch(/deviation percent is above 5/);
    expect(top.lines.every((l) => /^L\d+/.test(l.anchor ?? ''))).toBe(true);
    // A statement of what the code does — never the question asked in Design.
    expect(top.lines.some((l) => /\?$/.test(l.text))).toBe(false);
  });

  test('delivery priority: a rule the basket counts as technical is not listed as a business decision', () => {
    const { explanation } = opening(DELIVERY);
    const top = decidesOnTop(explanation);
    const businessIds = new Set(explanation.baskets.business);
    for (const line of top.lines) {
      const question = explanation.questions.find((q) => q.id === line.id)!;
      expect(question.ruleIds.every((id) => businessIds.has(id))).toBe(true);
    }
    expect(top.lines.reduce((n, l) => n + 1 + (l.also?.length ?? 0), 0) + top.more).toBe(explanation.questions.length);
  });

  test('one sentence never stands twice: two questions of one statement are one line with both lines (owner decision 23.10.2026)', () => {
    const { explanation } = opening(PO);
    const [first, second, ...rest] = explanation.questions;
    const twin = { ...second, id: 'Q-TWIN', statement: { ...first.statement, anchors: [{ lineStart: 900, lineEnd: 901 }] } };
    const doubled = { ...explanation, questions: [first, twin, second, ...rest] };
    const top = decidesOnTop(doubled);
    expect(top.lines.map((l) => l.text.toLowerCase()).filter((t) => t === first.statement.text.toLowerCase())).toHaveLength(1);
    expect(top.lines[0].also).toEqual([{ id: 'Q-TWIN', anchor: 'L900-901' }]);
    // The freed place goes to the next question; nothing is counted twice or lost.
    expect(top.lines.map((l) => l.id)).toEqual([first.id, second.id, rest[0].id]);
    expect(top.lines.reduce((n, l) => n + 1 + (l.also?.length ?? 0), 0) + top.more).toBe(doubled.questions.length);
    // On every starter example no statement stands twice.
    for (const source of [PO, DELIVERY]) {
      const texts = decidesOnTop(opening(source).explanation).lines.map((l) => l.text.toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});

test.describe('rendered (AroundTheMap, static markup) — the 3.0.21 rules carried into the text around the map (AB-6)', () => {
  test('PO approval: the steps in the code order, each with its line; the level said by the chip, never a decision asked', async () => {
    const { default: Around } = await loadAroundFor('layout');
    const text = aroundOf(PO);
    const html = renderToStaticMarkup(React.createElement(Around, { text, state: 'ready', designHref: '/project/p/design#rule-questions' }));
    const { story } = opening(PO);
    // One sentence per step of the story, each with its line (the checks and stops on the same line, muted).
    for (const step of story.steps.filter((s) => s.anchor)) expect(html).toContain(`data-anchor="${step.anchor}"`);
    // The level is said by the chips, not by a level sentence; no rule is decided here.
    expect(html).not.toContain('Reconstructed from the code — not confirmed by the business.');
    expect(html).not.toContain('data-story-decide-rules');
    expect(html).not.toContain('data-rule-decide');
  });

  test('a program with rules but no question for the business does not say "no value is hard-coded"', async () => {
    const { default: Around } = await loadAroundFor('no-question');
    const text = aroundOf(DELIVERY);
    expect(text.questions).toEqual([]);
    expect(text.basket?.technical).toBeGreaterThan(0);
    const html = renderToStaticMarkup(React.createElement(Around, { text, state: 'ready', designHref: null }));
    expect(html).toContain('The code raises no question for the business that the engine can name.');
    expect(html).toContain('technical rule stays as coded');
    expect(html).not.toContain('No value is hard-coded');
  });
});

test.describe('"What it changes" on top: three, in business words first', () => {
  test('a change named by a table or a transaction gives way to one in words; nothing is dropped', () => {
    const all = [
      { text: 'Create entry in ZMM_PO_APPR', anchor: 'L353' },
      { text: 'Create purchase order', anchor: 'L475' },
      { text: 'Create purchase order (ME21N) by simulated entry', anchor: 'L515' },
      { text: 'Update purchase requisition', anchor: 'L240' },
      { text: 'Start workflow', anchor: 'L421' },
    ];
    const top = changesOnTop(all, 2);
    expect(top.changes.map((c) => c.text)).toEqual(['Create purchase order', 'Update purchase requisition', 'Start workflow']);
    expect(top.more).toBe(4);
    expect(changesOnTop(all.slice(0, 1)).changes.map((c) => c.text)).toEqual(['Create entry in ZMM_PO_APPR']);
  });
});

test.describe('the readings of the 3.0.21 gate on the page', () => {
  test('freight: a check on a field the code gives no words for is never named — on the page around the map either', async () => {
    const { default: Around } = await loadAroundFor('unsaid');
    const source = read('public/starter-examples/Z_SD_FREIGHT_RATE_CHECK.abap');
    const proc = readProcess(source);
    const story = processStory(proc.skeleton, source, null, '3.0.21');
    const unsaid = story.steps.reduce((n, s) => n + (s.unsaid ?? 0), 0);
    expect(unsaid).toBeGreaterThan(0);
    // Read for 3.1.0, where the dictionary names the rule questions' fields too (H5).
    const html = renderToStaticMarkup(React.createElement(Around, { text: aroundOf(source, '3.1.0'), state: 'ready' }));
    expect(html).not.toMatch(/Vsbed|Gewei|Voleh/i);
  });
});

test.describe('"Ask this case" leaves the Business view (owner decision 22.10.2026, DESIGN.md §5.3)', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');

  test('Business has no "Ask this case"; IT renders it under its own answer', () => {
    // Business is Analyze's page since v3.1.0 (AB-2, ADR-109): no "Ask this case" there either.
    expect(read('components/analyze/AnalyzeBusiness.tsx')).not.toContain('AskThisCase');
    expect(shell).not.toContain('BUSINESS_ORDER');
    expect(shell).toMatch(/view === 'it' \? askThisCase : null/);
  });

  test('the decision tip pointed at the Business map; with the map in Analyze it is offered in no view of the workspace', () => {
    // Analyze, Business has no coach marks (plan P7: the invitation bar and the tour lead); IT and
    // Management offer only their own tips, and neither list names the decision point.
    expect(shell).toContain("const IT_COACH_ORDER: readonly CoachMarkId[] = ['next-step', 'not-determined'];");
    expect(shell).toContain("const MANAGEMENT_COACH_MARKS: readonly CoachMarkId[] = ['next-step'];");
    expect(shell).toContain("only: view === 'management' ? MANAGEMENT_COACH_MARKS : view === 'it' ? IT_COACH_ORDER : undefined,");
    expect(read('components/analyze/AnalyzeBusiness.tsx')).not.toMatch(/useCoachMarks|CoachMarkNote/);
  });
});
