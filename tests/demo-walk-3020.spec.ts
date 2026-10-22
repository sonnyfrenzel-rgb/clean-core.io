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
import { buildProcessTour, tourReadingOf } from '../lib/process-tour';
import { DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.20, owner decision 21.10.2026 (7), and the tour that replaced
 * the walk-through the same day: the public demo gets the guided tour an own
 * project gets. It asks nothing, so the demo shows it as it is, and reworded
 * by no model — the demo calls none. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCE = readExample(DEMO_SOURCE_FILE).replace(/\r\n/g, '\n');
const { bpmn, technical } = buildReadingExports(SOURCE, { processName: DEMO_SOURCE_FILE, sourceFileName: DEMO_SOURCE_FILE });
const MODEL = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(SOURCE), null), fileName: DEMO_SOURCE_FILE });
const TOUR = buildProcessTour(buildWalkGuide(SOURCE, MODEL, walkOrder(MODEL, null)), MODEL, tourReadingOf(SOURCE));

async function load(rel: string, name = 'default'): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'demo-walk-3020', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
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

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('closed, the demo shows the way into the tour, and nothing opens by itself', async () => {
  const Demo = await load('components/demo/DemoWalkThrough.tsx');
  const html = renderToStaticMarkup(React.createElement(Demo, { model: MODEL, source: SOURCE, initialTour: TOUR }));
  expect(html).toContain('data-tour-entry-open=""');
  expect(html).not.toContain('data-process-tour=""');
});

test('in the tour: said as the demo\'s, nothing to answer', async () => {
  const Layer = await load('components/workspace/ProcessTour.tsx', 'ProcessTourLayer');
  const html = renderToStaticMarkup(React.createElement(Layer, { tour: TOUR, model: MODEL, onClose: () => {}, demo: true, designHref: '/demo/design' }));
  const text = textOf(html);
  expect(text).toContain('Demo: the same tour your own project gets.');
  expect(html).not.toContain('data-state-confirm=');
  expect(html).not.toContain('role="radio"');
  // Owner decision 22.10.2026: the tour opens on its overview, the demo's too; the first station follows.
  expect(html).toContain('data-tour-at="overview"');
  expect(text).toContain('What this process is about');
  const first = textOf(renderToStaticMarkup(React.createElement(Layer, { tour: TOUR, model: MODEL, onClose: () => {}, demo: true, initialStation: 0 })));
  expect(first).toContain(TOUR.stations[0].title);
});

test('the demo shows it in the Business view, above the map, and it reaches nothing that stores or calls a model', () => {
  const shell = read('components/demo/DemoWorkspaceShell.tsx');
  expect(shell.indexOf('<DemoWalkThrough')).toBeGreaterThan(-1);
  expect(shell.indexOf('<DemoWalkThrough')).toBeLessThan(shell.indexOf('{mapCard}'));
  const demo = read('components/demo/DemoWalkThrough.tsx');
  expect(demo).not.toMatch(/fetch\(|-client'|gemini|usePlainWording|process-states-client|firebase/);
  expect(demo).toContain('demo={true}');
});
