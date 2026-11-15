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

test('the way into the tour stands above the map on every visit, first or later', () => {
  // Since v3.1.0 the Business view is Analyze's (AB-2): "Walk me through it" stands in the summary above the
  // map on the first visit and every later one (mockup state 3), so there is no first-visit place to swap with
  // — the paced build-up it once had to follow retired with AB-3. The workspace has no walk slot any more.
  const shell = read('components/workspace/WorkspaceShell.tsx');
  expect(shell).not.toMatch(/BUSINESS_ORDER|ProcessTourEntry|buildUp/);
  const business = read('components/analyze/AnalyzeBusiness.tsx');
  const invitation = business.indexOf('data-analyze-invitation=""');
  expect(invitation).toBeGreaterThan(-1);
  expect(invitation).toBeLessThan(business.indexOf('<WorkspaceProcess'));
  // Only "I'll look around myself" moves it, to one quiet line under the map — never the visit.
  expect(business).toContain('const invitation = signed !== null && !lookingAround;');
  expect(business).not.toMatch(/firstLookSeen\([^)]*\)[^;]*invitation/);
});
