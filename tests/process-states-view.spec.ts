import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  STATE_MEANING,
  markAffectedDerivations,
  markFor,
  readProcessStates,
  type DerivationMark,
  type ProcessStates,
  type StateEntry,
  type StateSubject,
} from '../lib/process-states';

/**
 * What a confirmation card actually renders — roadmap 3.5.
 *
 * Rendered and not grepped: a source guard is satisfied by a component that
 * fetches the same sentence from somewhere else, which is the reasoning of
 * `tests/landing-style-guard.spec.ts`. The two components are **bundled with
 * esbuild and then rendered**, the pattern of
 * `tests/diagram-sanitizer-guard.spec.ts`, because Playwright compiles the JSX
 * of any `.tsx` it transforms into its own component-test representation —
 * importing them here directly yields objects React refuses to render. The
 * bundle is plain JavaScript calling the real `react/jsx-runtime`, so what is
 * asserted below is the markup the browser gets.
 *
 * Four claims:
 *
 *   1. **nothing is pre-selected.** A subject with no confirmation renders no
 *      chosen segment, because the absence of an answer is not an answer;
 *   2. **every confirmation shows a name and a time** — the phase's acceptance
 *      condition, on the screen rather than only in the store;
 *   3. **Keep says what it means.** The help text says the answer is about the
 *      need and preserves no ABAP — the one misreading that would make the whole
 *      step a lie;
 *   4. **a marking marks.** An element a changed rule was drawn into carries the
 *      sentence; an element nothing changed carries none, and an element with no
 *      line range carries no invented anchor (C23-A06).
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'process-states-view');

type Card = (props: {
  subject: StateSubject;
  entry: StateEntry | null;
  mark?: DerivationMark | null;
  onConfirm: (state: string, note: string | null) => void;
}) => React.ReactElement;

type Summary = (props: { states: ProcessStates; revision: number }) => React.ReactElement;

let StateChoice: Card;
let StateSummary: Summary;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of ['StateChoice', 'StateSummary']) {
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'process-states', `${name}.tsx`)],
      outfile: path.join(OUT, `${name}.cjs`),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      // The same React instance the renderer uses, or the element types do not match.
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
  }
  /* eslint-disable @typescript-eslint/no-require-imports */
  StateChoice = require(path.join(OUT, 'StateChoice.cjs')).default as Card;
  StateSummary = require(path.join(OUT, 'StateSummary.cjs')).default as Summary;
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const ELEMENT: StateSubject = {
  subject: 'Gateway_price',
  kind: 'element',
  label: 'Price deviation > 5 %?',
  detail: 'Decision',
  anchor: 'lines 398 to 414',
};

const UNANCHORED: StateSubject = {
  subject: 'Task_manual',
  kind: 'element',
  label: 'Buyer review',
  detail: 'Step',
  anchor: null,
};

const RULE: StateSubject = {
  subject: 'BR-002',
  kind: 'rule',
  label: 'IF gv_netpr > 5000',
  detail: 'Holds the requisition when the price deviates more than 5 % from the info record.',
  anchor: 'lines 398 to 414',
};

const ENTRY: StateEntry = {
  subject: 'BR-002',
  kind: 'rule',
  state: 'keep',
  note: null,
  account: { uid: 'uid-mara', name: 'Mara Weber' },
  confirmedAt: '2026-09-17T08:42:00.000Z',
  revision: 3,
};

test('a subject with no confirmation has no chosen answer and says so', () => {
  const html = renderToStaticMarkup(
    React.createElement(StateChoice, { subject: ELEMENT, entry: null, onConfirm: () => {} }),
  );

  // All four words are offered…
  for (const word of ['Keep', 'Change deliberately', 'Drop', 'Clarify']) {
    expect(html, `${word} is not on the card`).toContain(word);
  }
  // …and none of them is on.
  expect(html).not.toContain('data-state-option-on="yes"');
  expect(html).toContain('aria-checked="false"');
  expect(html).not.toContain('aria-checked="true"');
  expect(html).toContain('data-state-value="undecided"');
  expect(html).toContain('data-state-undecided="Gateway_price"');
  expect(html).toContain('Not confirmed.');
  // No answer, no note field: a required field under an answer nobody gave.
  expect(html).not.toContain('data-state-note="Gateway_price"');
  expect(html).toContain('lines 398 to 414');
});

test('every confirmation shows the name and the time it carries', () => {
  const html = renderToStaticMarkup(
    React.createElement(StateChoice, { subject: RULE, entry: ENTRY, onConfirm: () => {} }),
  );

  expect(html).toContain('data-state-confirmed="BR-002"');
  expect(html).toContain('Mara Weber');
  // The same UTC-to-the-minute wording the revision history uses, so a reader
  // does not meet two time formats on one screen.
  expect(html).toContain('2026-09-17 08:42 UTC');
  expect(html).toContain('revision 3');
  expect(html).toContain('data-state-value="keep"');
  // The answer on record is the one shown as chosen, and it is the only one.
  expect(html).toMatch(/data-state-option="keep"[^>]*data-state-option-on="yes"/);
  expect(html).not.toMatch(/data-state-option="drop"[^>]*data-state-option-on="yes"/);
  // And no tick that reads as proof: an account said this, which is not a finding.
  expect(html.toLowerCase()).not.toContain('verified');
});

test('Keep says it is about the need and not about the code', () => {
  const html = renderToStaticMarkup(
    React.createElement(StateChoice, { subject: RULE, entry: ENTRY, onConfirm: () => {} }),
  );
  expect(html).toContain('Keep says the business still needs this');
  expect(html).toContain('preserves no ABAP');

  // And the sentence the whole screen carries says the same thing once.
  expect(STATE_MEANING).toContain('not what the code must stay');
});

test('a changed rule marks the element it was drawn into, and nothing else', () => {
  // Two rules with derivations of their own: BR-002 moves, BR-001 does not.
  // `Task_manual` is the discriminator — it is drawn from a rule, so a marking
  // that marks everything it is told about would reach it.
  const subjects = { elements: ['Gateway_price', 'Task_manual'], rules: ['BR-001', 'BR-002'] };
  const states = readProcessStates(
    [
      { ...ENTRY, state: 'change', note: 'Tolerance per material group.', revision: 4 },
      { ...ENTRY, subject: 'BR-001', state: 'keep', revision: 4 },
    ],
    subjects,
  );
  const marks = markAffectedDerivations(states, [
    { rule: 'BR-002', elements: ['Gateway_price'] },
    { rule: 'BR-001', elements: ['Task_manual'] },
  ]);
  expect(marks.map((m) => m.element)).toEqual(['Gateway_price']);

  const marked: DerivationMark | null = markFor(marks, 'Gateway_price');
  const loud = renderToStaticMarkup(
    React.createElement(StateChoice, { subject: ELEMENT, entry: null, mark: marked, onConfirm: () => {} }),
  );
  expect(loud).toContain('data-state-mark="Gateway_price"');
  expect(loud).toContain('Change deliberately: BR-002');
  expect(loud).toContain('This element was drawn from that rule');

  // The other element is drawn from no changed rule. It gets no mark — and, with
  // no line range in the source, no invented anchor either (C23-A06).
  const quiet = renderToStaticMarkup(
    React.createElement(StateChoice, {
      subject: UNANCHORED,
      entry: null,
      mark: markFor(marks, 'Task_manual'),
      onConfirm: () => {},
    }),
  );
  expect(quiet).not.toContain('data-state-mark=');
  expect(quiet).not.toContain('data-state-anchor=');
  expect(quiet).not.toContain('BR-002');
});

test('the summary counts the answers that were not given', () => {
  const subjects = { elements: ['A', 'B', 'C'], rules: ['BR-001', 'BR-002'] };
  const states = readProcessStates(
    [
      { ...ENTRY, subject: 'BR-001', state: 'keep', revision: 1 },
      { ...ENTRY, subject: 'A', kind: 'element', state: 'drop', note: 'gone', revision: 2 },
    ],
    subjects,
  );
  const html = renderToStaticMarkup(React.createElement(StateSummary, { states, revision: 2 }));

  expect(html).toContain('Not confirmed');
  expect(html).toMatch(/data-state-count="undecided"[^>]*>3</);
  expect(html).toMatch(/data-state-count="keep"[^>]*>1</);
  expect(html).toMatch(/data-state-count="drop"[^>]*>1</);
  expect(html).toContain('1 kept, 0 to change, 1 dropped, 0 to clarify, 3 of 5 not yet confirmed.');
  expect(html).toContain('Revision 1 of the process stays as it was reconstructed.');
});
