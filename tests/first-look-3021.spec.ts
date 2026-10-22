import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProcess } from '../lib/first-look';
import { firstLookExcerpt } from '../lib/first-look-excerpt';
import { DECIDES_SHOWN, IN_SHORT_WORDS, changesOnTop, decidesOnTop, firstLookBrief, splitPurpose } from '../lib/first-look-brief';
import { deriveBusinessRulesFrom } from '../lib/abap/business-rule-set';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { processChanges, processStory } from '../lib/process-story';
import { codeGivesAway } from '../lib/first-look-findings';
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

test.describe('the drawing beside the steps sets the test-data switch apart (fix, 22.10.2026)', () => {
  const proc = readProcess(RECEIPT);

  test('from engine 3.0.20 the receipt check\'s drawing no longer opens with the demo cases', () => {
    const names = firstLookExcerpt(proc.skeleton, RECEIPT, 5, '3.0.20').nodes.map((n) => n.name);
    expect(names.join(' | ')).not.toMatch(/apply case/i);
    expect(names.join(' | ')).not.toMatch(/demo/i);
    // The process is still drawn: the switch is passed over, not the program.
    expect(names.length).toBeGreaterThan(2);
  });

  test('a run signed by an older engine draws what it drew then', () => {
    const names = firstLookExcerpt(proc.skeleton, RECEIPT, 5, '3.0.19').nodes.map((n) => n.name);
    expect(names.join(' | ')).toMatch(/apply case/i);
  });
});

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

  test(`"In short" is one sentence of at most ${IN_SHORT_WORDS} words on every starter example`, () => {
    for (const example of STARTER_EXAMPLES) {
      const { brief } = opening(read(`public/starter-examples/${example.file}`));
      expect(brief.inShort, example.file).not.toBeNull();
      expect(brief.inShort!.text.split(/\s+/).length, `${example.file}: ${brief.inShort!.text}`).toBeLessThanOrEqual(IN_SHORT_WORDS);
      expect(brief.startedBy, example.file).not.toBeNull();
      expect(brief.comesOut, example.file).not.toBeNull();
    }
  });
});

test.describe('"What it decides" and the basket line count the same rules (fix, 22.10.2026)', () => {
  test(`at most ${DECIDES_SHOWN} statements, weightiest first, from the business basket only`, () => {
    const { explanation } = opening(PO);
    const top = decidesOnTop(explanation);
    expect(top.lines.length).toBe(DECIDES_SHOWN);
    expect(top.lines.length + top.more).toBe(explanation.questions.length);
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
    expect(top.lines.length + top.more).toBe(explanation.questions.length);
  });
});

test.describe('rendered (BusinessOpening, static markup) — the 3.0.21 layout', () => {
  async function loadOpening(): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
    const out = path.join(ROOT, 'tmp', 'first-look-3021', String(process.pid), 'BusinessOpening.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'workspace', 'BusinessOpening.tsx')],
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

  function propsFor(source: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    const o = opening(source);
    const top = decidesOnTop(o.explanation);
    return {
      name: 'Z_MM_PO_APPROVAL',
      nameIsProposed: false,
      programName: 'Z_MM_PO_APPROVAL',
      nameReason: null,
      brief: o.brief,
      story: o.story,
      rules: top.lines,
      rulesMore: top.more,
      rulesNone: '',
      changes: processChanges(o.proc.skeleton, source, 5, ENGINE).changes,
      changesMore: 0,
      changesNone: '',
      inShort: { lines: o.lines, level: o.summary.level, proposal: null, authorClaim: null },
      givesAway: codeGivesAway({ source, engineVersion: ENGINE, skeleton: o.proc.skeleton, facts: o.facts, testData: o.story.testData ?? null }),
      elsewhere: { documentation: '/project/p/documentation', it: '/project/p?view=it' },
      details: null,
      ...extra,
    };
  }

  /** The page above the "How this was read" fold. */
  const onTop = (html: string): string => html.slice(0, html.indexOf('data-cc-disclosure'));

  test('PO approval: five blocks on top — in short, who · in · out, steps, what the code gives away, decides beside changes', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(React.createElement(Opening, propsFor(PO)));
    const top = onTop(html);
    expect(top).toContain('data-program-in-short="compact"');
    expect(top).toContain('Creates purchase orders and starts workflows in SAP.');
    expect(top).toContain('data-first-look-who-in-out="3"');
    expect(top).toContain('data-process-story=""');
    expect(top).toMatch(/data-code-gives-away="\d"/);
    expect(top).toContain('data-story-decides=""');
    expect(top).toContain('data-story-changes=""');
    // One line per step: what a step checks and where it can end are not on top.
    expect(top).not.toContain('Checks:');
    expect(top).not.toContain('Can end here:');
    expect(top).not.toContain('technical check');
    // The level is said once, by the card's chip; no second chip and no level sentence on top.
    expect(top).not.toContain('Reconstructed from the code — not confirmed by the business.');
    // No decision asked and no count of open questions on top.
    expect(top).not.toContain('data-story-open');
    expect(top).not.toContain('data-story-decide-rules');
  });

  test('every step stands on one line with its anchor; the checks and stops are one fold down', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(React.createElement(Opening, propsFor(PO)));
    const { story } = opening(PO);
    expect((html.match(/data-process-story-step="/g) ?? []).length).toBe(story.steps.length);
    const fold = html.slice(html.indexOf('data-first-look-details'));
    expect(fold).toContain('data-process-story-detail=');
    expect(fold).toContain('Checks: ');
    expect(fold).toContain('Can end here: ');
  });

  test('"What the code gives away": each finding with its line and who to ask; "+ N more" leads to Documentation and IT', async () => {
    const Opening = await loadOpening();
    const props = propsFor(PO);
    const givesAway = props.givesAway as ReturnType<typeof codeGivesAway>;
    const html = renderToStaticMarkup(React.createElement(Opening, props));
    expect((html.match(/data-code-finding="/g) ?? []).length).toBe(givesAway.findings.length);
    for (const f of givesAway.findings) {
      expect(html).toContain(`data-code-finding-anchor="${f.anchor}"`);
    }
    expect(html).toContain('Read from the code');
    const forced = renderToStaticMarkup(React.createElement(Opening, { ...props, givesAway: { ...givesAway, more: 2 } }));
    expect(forced).toContain('data-code-gives-away-more="2"');
    expect(forced).toContain('href="/project/p/documentation"');
    expect(forced).toContain('href="/project/p?view=it"');
  });

  test('nothing found: the block says none of the seven signs was found — never "clean"', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(
      React.createElement(Opening, propsFor(PO, { givesAway: { findings: [], more: 0, checked: 7, testSwitch: null } })),
    );
    expect(html).toContain('data-code-gives-away-none=""');
    expect(html).toContain('None of the seven signs found.');
    expect(html.toLowerCase()).not.toMatch(/\bclean\b(?! core)/);
  });

  test('a program with rules but no question for the business does not say "no value is hard-coded"', async () => {
    const Opening = await loadOpening();
    const html = renderToStaticMarkup(
      React.createElement(Opening, propsFor(PO, { rules: [], rulesMore: 0, rulesNone: 'No question for the business: the one value fixed in the code is a technical setting.' })),
    );
    expect(html).toContain('No question for the business');
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
  test('freight: checks on a field the code gives no words for are counted one fold down, never named', async () => {
    const out = path.join(ROOT, 'tmp', 'first-look-3021', String(process.pid), 'BusinessOpening-unsaid.cjs');
    await build({
      entryPoints: [path.join(ROOT, 'components', 'workspace', 'BusinessOpening.tsx')],
      outfile: out, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
      alias: { '@': ROOT }, logLevel: 'silent',
    });
    const Opening = require(out).default;
    const source = read('public/starter-examples/Z_SD_FREIGHT_RATE_CHECK.abap');
    const proc = readProcess(source);
    const story = processStory(proc.skeleton, source, null, '3.0.21');
    const unsaid = story.steps.reduce((n, s) => n + (s.unsaid ?? 0), 0);
    expect(unsaid).toBeGreaterThan(0);
    const html = renderToStaticMarkup(
      React.createElement(Opening, {
        name: 'Z_SD_FREIGHT_RATE_CHECK', nameIsProposed: false, programName: 'Z_SD_FREIGHT_RATE_CHECK', nameReason: null,
        story, rules: [], rulesMore: 0, rulesNone: '', changes: [], changesMore: 0, changesNone: '', details: null,
      }),
    );
    const fold = html.slice(html.indexOf('data-first-look-details'));
    expect(fold).toContain('data-process-story-unsaid=');
    expect(fold).toContain('on a field the code gives no words for');
    expect(html).not.toMatch(/Vsbed|Gewei|Voleh/);
  });
});

test.describe('"Ask this case" leaves the Business view (owner decision 22.10.2026, DESIGN.md §5.3)', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');

  test('the Business order has no "Ask this case"; IT renders it under its own answer', () => {
    const order = /const BUSINESS_ORDER[^=]*=\s*\[([\s\S]*?)\];/.exec(shell)?.[1] ?? '';
    expect(order).toContain("'firstLook'");
    expect(order.replace(/\/\/.*$/gm, '')).not.toContain("'ask'");
    expect(shell).toMatch(/view === 'it' \? contentBlocks\.ask : null/);
  });

  test('the decision tip is offered in Business only where the map stands', () => {
    expect(shell).toMatch(/hasDecision: answer\?\.kind === 'answered' && \(view !== 'business' \|\| decisionTipAtMap\)/);
  });
});
