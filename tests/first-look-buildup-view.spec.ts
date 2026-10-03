import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource, readTableAccess } from '../lib/first-look';

/**
 * What the build-up of the first look tells a screen reader (QA review of
 * 247b20c16e38, e580fdfe66d4).
 *
 * The stage heading changes from "Code read" to "In business language" while
 * the process grows; a sighted reader sees it change, so a blind reader has to
 * hear it. Rendered and not grepped, bundled with esbuild the way
 * `tests/process-states-view.spec.ts` does it: what is asserted is the markup
 * the browser gets.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'first-look-buildup-view');
const SRC = fs
  .readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

type BuildUp = (props: Record<string, unknown>) => React.ReactElement;
let FirstLookBuildUp: BuildUp;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'workspace', 'FirstLookBuildUp.tsx')],
    outfile: path.join(OUT, 'FirstLookBuildUp.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  FirstLookBuildUp = require(path.join(OUT, 'FirstLookBuildUp.cjs')).default as BuildUp;
});

function render(elapsed: number): string {
  const reading = readSource(SRC);
  return renderToStaticMarkup(
    React.createElement(FirstLookBuildUp, {
      source: SRC,
      sourceName: 'Z_MM_PO_APPROVAL.abap',
      access: readTableAccess(SRC),
      skeleton: reading.skeleton,
      named: null,
      elapsed,
      onSkip: () => {},
    }),
  );
}

/** The text of every element that is a live region, in document order. */
function liveRegions(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(\w+)[^>]*\baria-live="(polite|assertive)"[^>]*>([\s\S]*?)<\/\1>/g)) {
    out.push(m[3].replace(/<[^>]+>/g, '').trim());
  }
  return out;
}

test('the stage of the build-up is a live region, and it says the stage that is on screen', () => {
  const start = render(0);
  const end = render(60_000);
  expect(liveRegions(start), 'no live region announces the stage').toEqual(['Code read']);
  // The last moment is the map (ADR-072).
  expect(liveRegions(end)).toEqual(['Process map']);
  // Only the stage: the counters change every few hundred milliseconds and
  // would talk over the reader if they were live as well.
  expect(start).not.toMatch(/data-first-look-counters=""[^>]*aria-live/);
});

test('the first look is marked seen only once the workspace is ready and showing it', () => {
  // Carried QA finding bd900406a5fb: it was marked when it was asked for, before
  // the project loaded, so a failed load cost the reader their first look.
  const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'page.tsx'), 'utf8');
  const calls = page.match(/markFirstLookSeen\(/g) ?? [];
  expect(calls).toHaveLength(1);
  expect(page).toContain("if (state === 'ready' && buildUp === true && projectId) markFirstLookSeen(projectId);");
});
