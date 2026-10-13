import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GENERATION_STAGE_ORDER,
  SINGLE_CALL_STAGE_ORDER,
  enterStage,
  finishStages,
  generationStages,
  originalFactsLines,
  scaffoldFactsLines,
  withFacts,
  type GenerationStage,
  type GenerationStageLog,
} from '../lib/transformation-chain';

/**
 * The generation screen draws the stages in workflow order, with the states,
 * facts and retry details the events gave them — QA review of 5a559787
 * (c34d0742d5a0). `tests/transformation-chain.spec.ts` ("the stages") holds
 * `generationStages` as data; this renders the screen the transformation page
 * draws — `<GenerationChain stages={generationStages(stageLog, genPath)} />`,
 * `tests/generation-progress.spec.ts` holds that wiring — and reads the order
 * off the markup, so a screen that sorted, dropped or reordered them fails
 * here even while the data stays right.
 *
 * Events are entered out of the screen's order on purpose where the page can
 * do so (a repair round enters the checks again after the repairs).
 *
 * Rendered, not grepped: bundled with esbuild and rendered with the real React,
 * the pattern of `tests/findings-focus-names.spec.ts`. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'generation-chain-order', String(process.pid));

type Chain = (props: {
  program: string | null;
  slots: unknown[];
  lit: boolean;
  stages: GenerationStage[];
  startedAt: number | null;
  now: number;
  phaseKey: string;
}) => React.ReactElement;
let GenerationChain: Chain;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'transformation', 'GenerationChain.tsx')],
    outfile: path.join(OUT, 'GenerationChain.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  GenerationChain = require(path.join(OUT, 'GenerationChain.cjs')).default as Chain;
});

const render = (log: GenerationStageLog, genPath: 'engine-led' | 'single-call', now: number) =>
  renderToStaticMarkup(
    React.createElement(GenerationChain, { program: 'ZCO_ALLOC', slots: [], lit: true, stages: generationStages(log, genPath), startedAt: 1000, now, phaseKey: 'model' }),
  );

/** `[key, state]` of every drawn stage, in document order. */
const drawn = (html: string) =>
  [...html.matchAll(/<[^>]*\bdata-generation-stage="([^"]+)"[^>]*>/g)].map((m) => [m[1], /\bdata-stage-state="([^"]+)"/.exec(m[0])?.[1]]);

test('engine-led: scaffold, fills, checks, repairs, storing — in that order, with the states the events gave', () => {
  let log = enterStage({}, 'scaffold', 1000);
  log = withFacts(log, 'scaffold', scaffoldFactsLines({ units: 20, guards: 15, decimals: 1, inputs: 4, cases: 26, fixtures: 0, dropped: 0 }));
  log = enterStage(log, 'fills', 1200);
  log = enterStage(log, 'checks', 9000);
  log = enterStage(log, 'repairs', 9500);
  // The re-check after a repair round enters the checks again.
  log = enterStage(log, 'checks', 9800);
  const html = render(log, 'engine-led', 10_000);
  expect(drawn(html)).toEqual([
    ['scaffold', 'done'],
    ['fills', 'done'],
    ['checks', 'active'],
    ['repairs', 'done'],
    ['storing', 'pending'],
  ]);
  expect(drawn(html).map(([k]) => k)).toEqual([...GENERATION_STAGE_ORDER]);
  expect(html).toContain('20 functions, each anchored to its ABAP lines');
});

test('engine-led before any repair: the repairs step is not promised', () => {
  const html = render(enterStage({}, 'scaffold', 1000), 'engine-led', 2000);
  expect(drawn(html)).toEqual([
    ['scaffold', 'active'],
    ['fills', 'pending'],
    ['checks', 'pending'],
    ['storing', 'pending'],
  ]);
});

test('single call: facts, model, checks, storing in order; the retry is drawn with its detail; a failure stops the running stage', () => {
  let log = enterStage({}, 'facts', 1000);
  log = withFacts(log, 'facts', originalFactsLines({ guards: [1, 2, 3], decimals: [1], inputs: [1, 2] }));
  log = enterStage(log, 'model', 2000, { attempt: { n: 1, of: 2 } });
  log = enterStage(log, 'model', 9000, { attempt: { n: 2, of: 2 }, detail: 'Retrying once' });
  let html = render(log, 'single-call', 10_000);
  expect(drawn(html)).toEqual([
    ['facts', 'done'],
    ['model', 'active'],
    ['checks', 'pending'],
    ['storing', 'pending'],
  ]);
  expect(drawn(html).map(([k]) => k)).toEqual([...SINGLE_CALL_STAGE_ORDER]);
  expect(html).toMatch(/data-generation-stage-detail=""[^>]*>Retrying once</);
  expect(html).toContain('3 checks that refuse, stop or skip — kept with their lines');

  log = finishStages(enterStage(log, 'checks', 10_000), 10_500, 'failed');
  html = render(log, 'single-call', 11_000);
  expect(drawn(html)).toEqual([
    ['facts', 'done'],
    ['model', 'done'],
    ['checks', 'failed'],
    ['storing', 'pending'],
  ]);
});
