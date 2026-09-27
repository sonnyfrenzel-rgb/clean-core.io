import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import type { ProcessDocumentation } from '../lib/process-documentation';
import { validateStatementAnswer } from '../lib/business-statement-prompt';
import {
  STATEMENT_COST_LINE,
  STATEMENT_SOURCE_NAME,
  applyStatementProposal,
  statementProposalContextOf,
  type ProposalView,
  type StatementProposalRecord,
} from '../lib/statement-proposal';
import type { StatementProposalPanelProps } from '../components/documentation/StatementProposal';

/**
 * What the documentation renders with the model's sentences — roadmap 17.10.
 *
 * Rendered, not grepped, and bundled with esbuild first for the reason
 * `tests/process-states-view.spec.ts` gives: Playwright compiles the JSX of a
 * `.tsx` it transforms into its own component-test representation.
 *
 * Four claims, each the decision of 27.09.2026 on the screen:
 *
 *   1. **without a proposal the page is what it was** — no pair, no mark, no
 *      empty box, and an invited reader sees nothing to press;
 *   2. **proposal on top, evidence beneath** — at the element and in the list,
 *      *Model proposal* first, *Reconstructed* after it, both through the chip;
 *   3. **a contradiction is marked, quietly** — words, the reason one action
 *      deeper, and not a chip, because it is not a provenance;
 *   4. **the button says what it costs before it is pressed**, and only the
 *      owner has one.
 */

const ROOT = path.resolve(__dirname, '..');
// One bundle per worker process: the four tests run in parallel, each worker
// runs `beforeAll`, and two writers of one file hand a third a half-written
// bundle ("Unterminated string constant").
const OUT = path.resolve(ROOT, 'tmp', 'statement-proposal-view', String(process.pid));

type View = (props: { doc: ProcessDocumentation; proposal?: StatementProposalPanelProps }) => React.ReactElement;
let ProcessDocumentationView: View;

const SOURCE = [
  'REPORT z_lieferung_pruefen.',                        // 1
  'START-OF-SELECTION.',                                // 2
  '  SELECT SINGLE * FROM likp INTO gs_likp',           // 3
  '    WHERE vbeln = p_vbeln.',                         // 4
  '  IF sy-subrc <> 0.',                                // 5
  '    MESSAGE e001(zlf) INTO gv_dummy.',               // 6
  '    RETURN.',                                        // 7
  '  ENDIF.',                                           // 8
  "  WRITE: / 'Lieferung', gs_likp-vbeln.",             // 9
].join('\n');

const B_READ = 'Die Lieferung wird zur eingegebenen Lieferungsnummer gelesen.';
const B_MISSING = 'Gibt es die Lieferung nicht, wird die Fehlermeldung E001 angezeigt.';

function recordFor(source: string): StatementProposalRecord {
  const context = statementProposalContextOf(source);
  const answer = JSON.stringify({
    statements: [
      { text: B_READ, anchors: [`${STATEMENT_SOURCE_NAME}:3`], element: null, uncertainty: null },
      { text: B_MISSING, anchors: [`${STATEMENT_SOURCE_NAME}:5`], element: null, uncertainty: null },
    ],
  });
  const validated = validateStatementAnswer(context.statementContext, answer);
  return {
    formatVersion: 1,
    digest: context.digest,
    statements: validated.statements,
    discarded: validated.discarded,
    origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, issuedAt: 1, textSha256: 'x' },
    proposedAt: '2026-09-27T10:00:00.000Z',
  };
}

function docOf(source: string): ProcessDocumentation {
  const fileName = 'z_lieferung_pruefen.abap';
  const bpmn = buildBpmnExportFromSource(source, { processName: fileName, sourceFileName: fileName });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName });
  return buildProcessDocumentation({ source, map });
}

const panel = (view: ProposalView | null, canRequest: boolean): StatementProposalPanelProps => ({
  view, canRequest, byok: false, requesting: false, message: null, onRequest: () => {},
});

const render = (doc: ProcessDocumentation, proposal?: StatementProposalPanelProps) =>
  renderToStaticMarkup(React.createElement(ProcessDocumentationView, { doc, proposal }));

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'documentation', 'ProcessDocumentationView.tsx')],
    outfile: path.join(OUT, 'ProcessDocumentationView.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  ProcessDocumentationView = require(path.join(OUT, 'ProcessDocumentationView.cjs')).default as View;
});

test('without a proposal the page is what it was, and a reader sees nothing to press', () => {
  const doc = docOf(SOURCE);
  const before = render(doc);
  expect(before).not.toMatch(/data-statement-/);
  // A reader, nothing stored: identical to the page before 17.10.
  expect(render(doc, panel(applyStatementProposal(SOURCE, null), false))).toBe(before);
  // A proposal for an earlier source is not drawn either — the reader gets the evidence alone.
  const stale = render(doc, panel(applyStatementProposal(SOURCE, recordFor(`${SOURCE}\n  CLEAR gv_dummy.`)), false));
  expect(stale).not.toMatch(/data-statement-pair|data-statement-proposed/);
});

test('the owner gets one button, with what it costs said before the click', () => {
  const html = render(docOf(SOURCE), panel(applyStatementProposal(SOURCE, null), true));
  expect(html).toContain('data-statement-proposal-panel="not-requested"');
  expect(html).toContain('Propose business sentences');
  expect(html).toContain(STATEMENT_COST_LINE);
  expect(html).not.toMatch(/data-statement-pair/);
});

test('proposal on top, evidence beneath — at the element and in the list', () => {
  const doc = docOf(SOURCE);
  const html = render(doc, panel(applyStatementProposal(SOURCE, recordFor(SOURCE)), true));

  // At an element: the pair, B then A, each with its chip.
  const pair = html.slice(html.indexOf('data-statement-pair'));
  const b = pair.indexOf('data-provenance="proposed"');
  const a = pair.indexOf('data-provenance="reconstructed"');
  expect(b, 'no Model proposal chip at the element').toBeGreaterThan(-1);
  expect(a, 'the evidence was dropped for the proposal').toBeGreaterThan(b);

  // In the whole-program list: every engine sentence is still there.
  const list = html.slice(html.indexOf('data-doc-statements'));
  for (const statement of doc.statements) expect(list).toContain(statement.text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#x27;'));
  expect(list).toContain(B_READ);
  expect(list.indexOf(B_READ)).toBeLessThan(list.indexOf(doc.statements.find((s) => s.anchors.some((r) => r.lineStart === 3))!.text.slice(0, 20)));
  expect(html).toContain('Ask the model again');
});

test('a contradiction is marked with words and a reason, and is not a chip', () => {
  const html = render(docOf(SOURCE), panel(applyStatementProposal(SOURCE, recordFor(SOURCE)), false));
  const at = html.indexOf('data-statement-contradiction="contradicts"');
  expect(at, 'the MESSAGE … INTO sentence is not marked').toBeGreaterThan(-1);
  const mark = html.slice(at, html.indexOf('</details>', at));
  expect(mark).toContain('Contradicts the evidence');
  expect(mark).toContain('MESSAGE … INTO fills the message variables and displays nothing.');
  expect(mark).not.toContain('data-provenance');
  expect(html.slice(html.lastIndexOf('<details', at), at)).toMatch(/^<details/);
  // Only the one sentence is marked; the read is not.
  expect(html.match(/data-statement-contradiction="/g)?.length).toBe(2); // element cell + list row
  // A reader sees the proposal and its mark, and nothing to press.
  expect(html).not.toContain('Propose business sentences');
  expect(html).not.toContain('Ask the model again');
});
