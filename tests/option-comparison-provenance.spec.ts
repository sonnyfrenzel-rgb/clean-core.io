import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * The design's option comparison wears the "proposed" chip only over a
 * comparison the model wrote — QA review of 5a559787 (9af97544d758). A design
 * written before the comparison existed, or one whose comparison cannot be
 * read, proposes nothing, and the chip said it did.
 *
 * Rendered, not grepped: bundled with esbuild and rendered with the real React,
 * the pattern of `tests/findings-focus-names.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'option-comparison-provenance', String(process.pid));

type Comparison = (props: { design: unknown }) => React.ReactElement;
let OptionComparison: Comparison;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'design', 'OptionComparison.tsx')],
    outfile: path.join(OUT, 'OptionComparison.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  OptionComparison = require(path.join(OUT, 'OptionComparison.cjs')).default as Comparison;
});

const render = (design: unknown) => renderToStaticMarkup(React.createElement(OptionComparison, { design }));
const proposedChips = (html: string) => (html.match(/data-provenance="proposed"/g) ?? []).length;

const READY = {
  optionComparison: {
    options: [
      { option: 'standard', targetRelease: 'S/4HANA 2023', fitGap: 'SAP allocation covers the cycle; the gap is the custom key.', effort: 'Low', runningCost: 'None beyond licence', dataContract: 'ACDOCA' },
      { option: 'rap', targetRelease: 'S/4HANA 2023', fitGap: 'Rebuilds the key on-stack.', effort: 'Medium', runningCost: 'Runs on the stack', dataContract: 'ACDOCA' },
      { option: 'cap', targetRelease: 'S/4HANA 2023', fitGap: 'Covers all.', effort: 'High', runningCost: 'Own runtime', dataContract: 'ACDOCA via API' },
    ],
    recommended: 'rap',
    decisionReason: 'The custom allocation key per plant is not configurable in SAP allocation, and no external user needs the result.',
    requirementOthersMiss: 'An allocation key per plant that the standard cycle cannot express.',
  },
};

test('an absent comparison is not labelled proposed', () => {
  const html = render({});
  expect(html).toContain('data-option-comparison="absent"');
  expect(proposedChips(html)).toBe(0);
});

test('an unreadable comparison is not labelled proposed', () => {
  for (const design of [{ optionComparison: 'garbled' }, { optionComparison: { options: [] } }, { optionComparison: { options: READY.optionComparison.options } }]) {
    const html = render(design);
    expect(html).toContain('data-option-comparison="malformed"');
    expect(proposedChips(html)).toBe(0);
  }
});

test('a comparison the model wrote is labelled proposed, once', () => {
  const html = render(READY);
  expect(html).toContain('data-option-comparison="ready"');
  expect(proposedChips(html)).toBe(1);
});
