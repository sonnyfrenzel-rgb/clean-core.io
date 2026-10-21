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
import { DEMO_SOURCE_FILE } from '../lib/demo-marks';
import { readExample } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.20, owner decision 21.10.2026 (7): the public demo gets the
 * walk-through an own project leads with — read only: the answers are shown
 * and disabled, and it says "Demo: nothing is saved". Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SOURCE = readExample(DEMO_SOURCE_FILE).replace(/\r\n/g, '\n');
const { bpmn, technical } = buildReadingExports(SOURCE, { processName: DEMO_SOURCE_FILE, sourceFileName: DEMO_SOURCE_FILE });
const MODEL = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(SOURCE), null), fileName: DEMO_SOURCE_FILE });
const GUIDE = buildWalkGuide(SOURCE, MODEL, walkOrder(MODEL, null));

async function load(rel: string): Promise<(props: Record<string, unknown>) => React.ReactElement | null> {
  const out = path.join(ROOT, 'tmp', 'demo-walk-3020', String(process.pid), `${path.basename(rel, '.tsx')}.cjs`);
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
  return require(out).default;
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('closed, the demo walk says what it is and that nothing is saved', async () => {
  const Demo = await load('components/demo/DemoWalkThrough.tsx');
  const html = renderToStaticMarkup(React.createElement(Demo, { model: MODEL, source: SOURCE, fileName: DEMO_SOURCE_FILE, initialGuide: GUIDE }));
  expect(html).toContain('data-workspace-walk-start=""');
  expect(html).toContain('data-workspace-walk-demo=""');
  expect(textOf(html)).toContain('Demo: nothing is saved.');
});

test('at a step: said first, the answers shown and disabled, no answer control that writes', async () => {
  const Walk = await load('components/workspace/ProcessWalkThrough.tsx');
  const stops = walkStops(GUIDE);
  const base = {
    projectId: 'demo', guide: GUIDE, stops, answers: {}, subjectOf: () => null, owner: false, answering: null,
    onAnswer: () => {}, onAnswerMany: () => {}, onGo: () => {}, onClose: () => {}, onOpenLines: () => {},
    source: SOURCE, fileName: DEMO_SOURCE_FILE, demo: true,
  };
  for (const at of [stops.findIndex((s) => s.kind === 'step'), stops.findIndex((s) => s.kind === 'technical')].filter((i) => i >= 0)) {
    const html = renderToStaticMarkup(React.createElement(Walk, { ...base, at }));
    const text = textOf(html);
    expect(html).toContain('data-workspace-walk-demo=""');
    expect(text).toContain('Demo: nothing is saved.');
    expect(html).not.toContain('data-state-confirm=');
    const radios = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(4);
    for (const r of radios) expect(r).toContain('disabled=""');
    // Not the reader's note of an invited account.
    expect(text).not.toContain('Only the owner of the project answers.');
  }
});

test('the demo shows it in the Business view, above the map, and it reaches nothing that stores or calls a model', () => {
  const shell = read('components/demo/DemoWorkspaceShell.tsx');
  expect(shell.indexOf('<DemoWalkThrough')).toBeGreaterThan(-1);
  expect(shell.indexOf('<DemoWalkThrough')).toBeLessThan(shell.indexOf('{mapCard}'));
  const demo = read('components/demo/DemoWalkThrough.tsx');
  expect(demo).not.toMatch(/fetch\(|-client'|gemini|usePlainWording|process-states-client|firebase/);
  expect(demo).toContain('demo={true}');
});
