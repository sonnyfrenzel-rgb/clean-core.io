import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  endTestGenProgress,
  enterTestGenStage,
  startTestGenProgress,
  testingExpectedLine,
  TEST_GEN_STAGE_ORDER,
  type TestGenProgress,
} from '../lib/testing-progress';

/**
 * Owner request 16.10.2026: "Testing braucht bei der Erstellung auch eine
 * Zeitangabe". While the suite is written the Testing tool shows what it is
 * doing — the stages in order, the elapsed time from the click, the expected
 * time of the model call — and once written one quiet line with the total, as
 * Documentation's card does (`tests/documentation-progress-rendered.spec.ts`).
 *
 * The real card, bundled with esbuild and rendered with the real React, for
 * the moments of one generation. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'testing-progress', String(process.pid));

type Card = (props: Record<string, unknown>) => React.ReactElement;
let Card: Card;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'testing', 'TestingProgress.tsx')],
    outfile: path.join(OUT, 'TestingProgress.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  Card = require(path.join(OUT, 'TestingProgress.cjs')).default as Card;
});

const CLICK = 1_000_000;
const render = (progress: TestGenProgress, now: number) => renderToStaticMarkup(React.createElement(Card, { progress, now }));
const stages = (html: string) =>
  [...html.matchAll(/data-test-gen-stage="([a-z]+)" data-stage-state="([a-z]+)"/g)].map((m) => [m[1], m[2]]);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('while the model writes: the stages in order, the elapsed time from the click, the expected time', () => {
  let p = startTestGenProgress(CLICK);
  p = enterTestGenStage(p, 'model', CLICK + 2_000);
  const html = render(p, CLICK + 72_000);
  expect(stages(html)).toEqual([
    ['source', 'done'],
    ['model', 'active'],
    ['checking', 'pending'],
    ['storing', 'pending'],
  ]);
  expect(stages(html).map(([k]) => k)).toEqual([...TEST_GEN_STAGE_ORDER]);
  expect(html).toContain('aria-busy="true"');
  expect(html).toMatch(/data-test-gen-elapsed=""[^>]*>1:12</);
  const t = text(html);
  expect(t).toContain('What this tool is doing');
  expect(t).toContain('done · 0:02');
  expect(t).toContain('Writing the scenarios and the suite');
  expect(t).toContain(' 1:10 ');
  expect(t).toContain(testingExpectedLine());
  expect(testingExpectedLine()).toMatch(/^Expected: about \d+–\d+ minutes for one model call \(estimate\)\./);
});

test('a second model call is counted, and its wait is the whole wait', () => {
  let p = startTestGenProgress(CLICK);
  p = enterTestGenStage(p, 'model', CLICK + 1_000);
  p = enterTestGenStage(p, 'checking', CLICK + 61_000);
  p = enterTestGenStage(p, 'model', CLICK + 62_000);
  const t = text(render(p, CLICK + 121_000));
  expect(t).toContain('2:00 · 2 calls');
});

test('written: one quiet line with the number of scenarios and the total, the steps one click away', () => {
  let p = startTestGenProgress(CLICK);
  p = enterTestGenStage(p, 'model', CLICK + 2_000);
  p = enterTestGenStage(p, 'checking', CLICK + 100_000);
  p = enterTestGenStage(p, 'storing', CLICK + 101_000);
  p = endTestGenProgress(p, 'written', CLICK + 105_000, 14);
  // Long after the end: the total stays where it stopped.
  const html = render(p, CLICK + 900_000);
  expect(html).toContain('data-test-gen-end="written"');
  expect(html).not.toContain('aria-busy');
  expect(html).not.toContain('What this tool is doing');
  expect(html).toContain('<details data-test-gen-fold="">');
  expect(html).toMatch(/data-test-gen-end-text=""[^>]*>Test suite written and saved: 14 scenarios\.</);
  expect(html).toMatch(/data-test-gen-elapsed=""[^>]*>1:45</);
  expect(stages(html).every(([, s]) => s === 'done')).toBe(true);
  // Not the expected time any more: it is done.
  expect(html).not.toContain('data-test-gen-expected');
});

test('stopped: the card stays, names the stage it stopped in, and the total stops', () => {
  let p = startTestGenProgress(CLICK);
  p = enterTestGenStage(p, 'model', CLICK + 2_000);
  p = endTestGenProgress(p, 'failed', CLICK + 50_000);
  const html = render(p, CLICK + 600_000);
  expect(html).toContain('data-test-gen-end="failed"');
  expect(stages(html)).toEqual([
    ['source', 'done'],
    ['model', 'failed'],
    ['checking', 'pending'],
    ['storing', 'pending'],
  ]);
  expect(html).toMatch(/data-test-gen-elapsed=""[^>]*>0:50</);
  expect(text(html)).toContain('Stopped while writing the scenarios and the suite — nothing was saved; the reason is below.');
});

test('the page draws the card from the hook, in both states of the step', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'testing', 'page.tsx'), 'utf8');
  expect(page.match(/<TestingProgress progress=\{genProgress\} \/>/g)?.length).toBe(2);
  const hook = fs.readFileSync(path.join(ROOT, 'hooks', 'useTestGeneration.ts'), 'utf8');
  for (const stage of ["enter('model')", "enter('checking')", "enter('storing')", 'startTestGenProgress(Date.now())', "'written'", "'failed'"]) {
    expect(hook).toContain(stage);
  }
});
