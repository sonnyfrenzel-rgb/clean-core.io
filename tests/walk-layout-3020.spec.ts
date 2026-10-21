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
import { buildWalkGuide } from '../lib/process-walk-guide';
import { buildProcessTour } from '../lib/process-tour';
import { readExample } from './helpers/starter-example-files';

/**
 * CI of 18a3d8e3: with the walk-through in the
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
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase/*', 'lucide-react', 'next/*', 'bpmn-js/lib/*'],
    loader: { '.css': 'empty' },
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  return require(out)[name];
}

test('a chapter chip of the tour wraps its name instead of widening the page', async () => {
  const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
  const file = 'Z_MM_PO_APPROVAL.abap';
  const source = readExample(file).replace(/\r\n/g, '\n');
  const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
  const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
  const tour = buildProcessTour(buildWalkGuide(source, model, walkOrder(model, null)), model, null);
  const html = renderToStaticMarkup(React.createElement(Layer, { tour, model, onClose: () => {} }));
  const chips = [...html.matchAll(/<li class="([^"]*)"><button[^>]*data-tour-chapter="\d+"[^>]*>([\s\S]*?)<\/button>/g)];
  expect(chips.length).toBe(tour.chapters.length);
  for (const [, li, inner] of chips) {
    expect(li.split(' ')).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
    // The button keeps its one style; the name inside it may wrap.
    expect(inner).toMatch(/<span class="[^"]*\bwhitespace-normal\b[^"]*">/);
  }
});

test('on a new project\'s first visit the tour entry follows the first look; on every later visit the tour entry comes first', () => {
  const shell = read('components/workspace/WorkspaceShell.tsx');
  // The order stays the owner's: next step, walk, first look.
  const block = shell.match(/const BUSINESS_ORDER[^=]*=\s*\[([\s\S]*?)\];/)![1];
  expect([...block.matchAll(/^\s*'([a-zA-Z]+)',/gm)].map((m) => m[1]).slice(0, 3)).toEqual(['nextStep', 'walk', 'firstLook']);
  // The `walk` slot is empty during the build-up …
  expect(shell).toMatch(/walk:\s*view === 'business' && signed !== null && !buildUp \?/);
  // … and the first look's block carries the entry under it then.
  const firstLook = shell.slice(shell.indexOf('firstLook: ('), shell.indexOf('ask: answer ?'));
  expect(firstLook.indexOf('<FirstLook')).toBeLessThan(firstLook.indexOf('<ProcessTourEntry'));
  expect(firstLook).toMatch(/signed !== null && buildUp \?/);
});
