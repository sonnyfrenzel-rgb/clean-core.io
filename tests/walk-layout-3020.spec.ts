import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { walkOrder } from '../lib/process-walk';
import { buildWalkGuide, walkStops } from '../lib/process-walk-guide';
import { readExample } from './helpers/starter-example-files';

/**
 * CI of 18a3d8e3: with the walk-through and the fit-to-standard offer in the
 * Business view, (1) a 390 px phone scrolled sideways by 37 px
 * (`tests/workspace-start.spec.ts:180`, `tests/first-look-pacing.spec.ts:315`)
 * and (2) a new project's process story left the first screen of a
 * 1440 × 1000 window (`tests/first-look-map.spec.ts:68`, ADR-072). The layout
 * is fixed, not the specs; these server-free checks pin the fix, and the
 * three rendered specs are what proves it in a browser.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'walk-layout-3020', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
  await build({
    entryPoints: [path.join(ROOT, rel)],
    outfile: out,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

test('the fit-to-standard offer lets its chip and its link wrap — side by side they were wider than a phone', async () => {
  const Offer = await load('components/fit/FitToStandardOffer.tsx', 'FitOfferCard');
  const gate = { outcome: 'offered', primary: 'A', classes: ['A'], reason: '' };
  const html = renderToStaticMarkup(React.createElement(Offer, { gate, href: '/x', confirmed: null }));
  const row = /<div class="([^"]*)"><span data-provenance=/.exec(html)?.[1] ?? '';
  expect(row.split(' ')).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
});

test('a phase chip of the walk wraps its name instead of widening the page', async () => {
  const Walk = await load('components/workspace/ProcessWalkThrough.tsx');
  const file = 'Z_MM_PO_APPROVAL.abap';
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const guide = buildWalkGuide(source, model, walkOrder(model, null));
  const html = renderToStaticMarkup(
    React.createElement(Walk, {
      projectId: 'p1', guide, stops: walkStops(guide), at: null, answers: {}, subjectOf: () => null, owner: true, answering: null,
      onAnswer: () => {}, onAnswerMany: () => {}, onGo: () => {}, onClose: () => {}, onOpenLines: () => {}, source, fileName: file,
    }),
  );
  const chips = [...html.matchAll(/<li class="([^"]*)"><button[^>]*data-workspace-walk-phase="[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
  expect(chips.length).toBeGreaterThan(0);
  for (const [, li, inner] of chips) {
    expect(li.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
    // The button keeps `whitespace-nowrap`; the name inside it may wrap.
    expect(inner).toMatch(/<span class="[^"]*\bwhitespace-normal\b[^"]*">/);
  }
});

test('on a new project\'s first visit the walk entry and the offer follow the first look; on every later visit the walk comes first', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');
  // The order stays the owner's: next step, walk, first look.
  const block = shell.match(/const BUSINESS_ORDER[^=]*=\s*\[([\s\S]*?)\];/)![1];
  expect([...block.matchAll(/^\s*'([a-zA-Z]+)',/gm)].map((m) => m[1]).slice(0, 3)).toEqual(['nextStep', 'walk', 'firstLook']);
  // The `walk` slot is empty during the build-up …
  expect(shell).toMatch(/walk:\s*view === 'business' && signed !== null && !buildUp \?/);
  // … and the first look's block carries the entry and the offer under it then.
  const firstLook = shell.slice(shell.indexOf('firstLook: ('), shell.indexOf('ask: answer ?'));
  expect(firstLook.indexOf('<FirstLook')).toBeLessThan(firstLook.indexOf('<ProcessWalkEntry'));
  expect(firstLook).toMatch(/signed !== null && buildUp \?/);
  expect(firstLook.indexOf('<FirstLook')).toBeLessThan(firstLook.indexOf('<FitToStandardOffer'));
  expect(shell).toContain("view !== 'it' && !buildUp ? <FitToStandardOffer");
});
