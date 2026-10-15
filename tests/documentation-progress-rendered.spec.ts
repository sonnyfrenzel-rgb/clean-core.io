import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DOC_STAGE_ORDER, documentationProgress, type DocPartView, type DocProgressInput } from '../lib/documentation-progress';

/**
 * Roadmap 3.0.13 — the Documentation tool says what it is doing from the first
 * paint (owner, dev acceptance 14.10.2026). The page derives five stages from
 * what it holds (`lib/documentation-progress.ts`) and draws them with
 * `components/documentation/DocumentationProgress.tsx`. This renders the real
 * card — bundled with esbuild, rendered with the real React, as
 * `tests/generation-chain-order-rendered.spec.ts` renders Transformation's — for
 * the moments of one opening, with a model answer that takes its time, and
 * reads the order, the states, the elapsed time and the end off the markup.
 *
 * `tests/documentation-progress-page.spec.ts` drives the same card on the page
 * with a delayed stub answer. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'documentation-progress', String(process.pid));

type Card = (props: Record<string, unknown>) => React.ReactElement;
let Card: Card;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'documentation', 'DocumentationProgress.tsx')],
    outfile: path.join(OUT, 'DocumentationProgress.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  Card = require(path.join(OUT, 'DocumentationProgress.cjs')).default as Card;
});

const OPENED = 1_000_000;

const base: DocProgressInput = {
  loading: false,
  loadError: null,
  signedSource: true,
  runFact: '668 lines of Z_MM_PO_APPROVAL.abap, signed by the active run.',
  map: { status: 'ready', reason: null, fact: 'Process with 14 steps and 5 decisions.' },
  description: { writing: false, error: null, onRecord: true, legacy: false, reader: false, blocked: null },
  business: {
    phase: 'idle', error: null, failedAt: null, onRecord: false, absence: null, availabilityLoading: false,
    expected: 'Expected: about 1–3 minutes (estimate).', plan: 'One model call for 49 steps.', parts: null,
  },
  wrote: { description: false, business: false },
};

type Times = Record<string, { startedAt: number | null; endedAt: number | null }>;

function render(input: DocProgressInput, times: Times, now: number, extra: Record<string, unknown> = {}) {
  const { stages, end } = documentationProgress(input);
  return renderToStaticMarkup(React.createElement(Card, { stages, end, times, openedAt: OPENED, now, onRetry: () => undefined, ...extra }));
}

/** `[key, state]` of every drawn stage, in document order. */
const drawn = (html: string) =>
  [...html.matchAll(/<li[^>]*\bdata-doc-stage="([^"]+)"[^>]*>/g)].map((m) => [m[1], /\bdata-stage-state="([^"]+)"/.exec(m[0])?.[1]]);
const timeOf = (html: string, key: string) => {
  const at = html.indexOf(`data-doc-stage="${key}"`);
  const m = /data-doc-stage-time=""[^>]*>([^<]*)</.exec(html.slice(at));
  return m?.[1] ?? null;
};
const total = (html: string) => /data-doc-progress-elapsed=""[^>]*>([^<]*)</.exec(html)?.[1];

test('one opening, with a model answer that takes its time: the stages appear in order, and the elapsed time moves', () => {
  // 0.2 s — the project is being loaded: something is said from the first paint.
  let html = render({ ...base, loading: true }, { run: { startedAt: OPENED, endedAt: null } }, OPENED + 200);
  expect(drawn(html)).toEqual([['run', 'active'], ['process', 'pending'], ['description', 'pending'], ['business', 'pending'], ['storing', 'pending']]);
  expect(drawn(html).map(([k]) => k)).toEqual([...DOC_STAGE_ORDER]);
  expect(html).toContain('What this tool is doing');
  expect(html).toContain('Reading the signed run');

  // 1.5 s — the process is read from the code.
  html = render({ ...base, map: { status: 'loading', reason: null, fact: null }, description: { ...base.description, onRecord: false } },
    { run: { startedAt: OPENED, endedAt: OPENED + 900 }, process: { startedAt: OPENED + 900, endedAt: null } }, OPENED + 1500);
  expect(drawn(html)).toEqual([['run', 'done'], ['process', 'active'], ['description', 'pending'], ['business', 'pending'], ['storing', 'pending']]);
  expect(html).toContain('668 lines of Z_MM_PO_APPROVAL.abap, signed by the active run.');
  expect(timeOf(html, 'run')).toBe('done · 0:00');

  // 3 s — the description is written (no model).
  html = render({ ...base, description: { ...base.description, writing: true, onRecord: false } }, {}, OPENED + 3000);
  expect(drawn(html)).toEqual([['run', 'done'], ['process', 'done'], ['description', 'active'], ['business', 'pending'], ['storing', 'pending']]);
  expect(html).toContain('no model');

  // 5 s, then 47 s — the model writes the SOP and RACI: the expected time stands, the elapsed time moves.
  const writing = { ...base, business: { ...base.business, phase: 'model' as const }, wrote: { description: true, business: false } };
  const times: Times = { business: { startedAt: OPENED + 5000, endedAt: null } };
  const early = render(writing, times, OPENED + 5000);
  const late = render(writing, times, OPENED + 47_000);
  expect(drawn(early)).toEqual([['run', 'done'], ['process', 'done'], ['description', 'done'], ['business', 'active'], ['storing', 'pending']]);
  expect(early).toContain('Expected: about 1–3 minutes (estimate).');
  expect(early).toContain('One model call for 49 steps.');
  expect(early).toContain('Written and stored now.');
  expect(timeOf(early, 'business')).toBe('0:00');
  expect(timeOf(late, 'business')).toBe('0:42');
  expect(total(early)).toBe('0:05');
  expect(total(late)).toBe('0:47');
  expect(late).toContain('aria-busy="true"');

  // 48 s — stored.
  html = render({ ...writing, business: { ...writing.business, phase: 'storing' } }, {}, OPENED + 48_000);
  expect(drawn(html)).toEqual([['run', 'done'], ['process', 'done'], ['description', 'done'], ['business', 'done'], ['storing', 'active']]);

  // The end: written, the steps folded behind one line, the total stopped.
  html = render({ ...writing, business: { ...writing.business, phase: 'idle', onRecord: true }, wrote: { description: true, business: true } }, {}, OPENED + 90_000, { endedAt: OPENED + 49_000 });
  expect(html).toContain('data-doc-progress-end="written"');
  expect(html).toContain('Written — the process description and the SOP and RACI are stored with this project.');
  expect(html).toContain('data-doc-progress-fold=""');
  expect(total(html)).toBe('0:49');
  expect(drawn(html).every(([, state]) => state === 'done')).toBe(true);
});

test('a stop says where and why, with Try again; nothing to write says why', () => {
  let html = render({ ...base, business: { ...base.business, error: 'The model did not answer within 885 seconds, so nothing was saved.', failedAt: 'model' } }, {}, OPENED + 900_000);
  expect(html).toContain('data-doc-progress-end="failed"');
  expect(drawn(html)).toEqual([['run', 'done'], ['process', 'done'], ['description', 'done'], ['business', 'failed'], ['storing', 'pending']]);
  expect(html).toContain('Stopped at “Writing the SOP and the RACI”: The model did not answer within 885 seconds, so nothing was saved.');
  expect(html).toContain('data-doc-progress-retry=""');
  expect(html).toContain('Try again');

  html = render({ ...base, business: { ...base.business, error: 'The project would outgrow its document.', failedAt: 'storing' } }, {}, OPENED + 1000);
  expect(drawn(html).slice(3)).toEqual([['business', 'done'], ['storing', 'failed']]);

  html = render({ ...base, business: { ...base.business, absence: 'The model is switched off for Documentation in your settings.' } }, {}, OPENED + 1000);
  expect(html).toContain('data-doc-progress-end="nothing"');
  expect(html).toContain('Nothing more to write — The model is switched off for Documentation in your settings.');
  expect(drawn(html).slice(3)).toEqual([['business', 'skipped'], ['storing', 'skipped']]);
  expect(html).not.toContain('data-doc-progress-retry');

  html = render({ ...base, signedSource: false }, {}, OPENED + 1000);
  expect(html).toContain('There is no source the active run signed.');
  expect(drawn(html).map(([, s]) => s)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'skipped']);

  html = render({ ...base, business: { ...base.business, onRecord: true } }, {}, OPENED + 1000);
  expect(html).toContain('data-doc-progress-end="up-to-date"');
});

test('a program written in parts shows every part with its own state and time', () => {
  const parts: DocPartView[] = [
    { index: 0, steps: 60, state: 'written', startedAt: OPENED, endedAt: OPENED + 72_000 },
    { index: 1, steps: 26, state: 'writing', startedAt: OPENED + 72_000, endedAt: null },
    { index: 2, steps: 55, state: 'writing', startedAt: OPENED + 72_000, endedAt: null },
    { index: 3, steps: 55, state: 'waiting', startedAt: null, endedAt: null },
  ];
  const html = render({
    ...base,
    business: { ...base.business, phase: 'model', parts, plan: 'Written in 4 parts of up to 60 steps — 196 steps in all.', expected: 'Expected: about 3–9 minutes (estimate).' },
  }, { business: { startedAt: OPENED, endedAt: null } }, OPENED + 100_000, { parts });
  const drawnParts = [...html.matchAll(/data-doc-part="(\d)" data-part-state="([a-z]+)"/g)].map((m) => [m[1], m[2]]);
  expect(drawnParts).toEqual([['1', 'written'], ['2', 'writing'], ['3', 'writing'], ['4', 'waiting']]);
  expect(html).toContain('Part 1 of 4 · 60 steps');
  expect(html).toContain('written · 1:12');
  expect(html).toContain('writing · 0:28');
  expect(html).toContain('Written in 4 parts of up to 60 steps');
});

test('a stage that runs again after a stop starts a new attempt: its time is not the stopped attempt plus the pause (QA b6694384a2f3)', () => {
  const { nextDocStageTimes } = require(path.join(OUT, 'DocumentationProgress.cjs')) as {
    nextDocStageTimes: (prev: Times, stages: Array<{ key: string; state: string }>, at: number) => Times;
  };
  const stage = (state: string) => [{ key: 'business', state }];
  let times = nextDocStageTimes({}, stage('active'), OPENED);
  expect(times.business).toEqual({ startedAt: OPENED, endedAt: null });
  times = nextDocStageTimes(times, stage('failed'), OPENED + 30_000);
  expect(times.business).toEqual({ startedAt: OPENED, endedAt: OPENED + 30_000 });
  // *Try again* five minutes later.
  times = nextDocStageTimes(times, stage('active'), OPENED + 330_000);
  expect(times.business).toEqual({ startedAt: OPENED + 330_000, endedAt: null });
  // Still running: another change of states keeps the attempt's start.
  times = nextDocStageTimes(times, stage('active'), OPENED + 340_000);
  expect(times.business).toEqual({ startedAt: OPENED + 330_000, endedAt: null });
});
