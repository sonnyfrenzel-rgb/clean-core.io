import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readSource } from '../lib/first-look';

/**
 * Paper never claims a rule is unconfirmed when nobody has read whether it is
 * — QA review of 072f79996d01 (137f7c2ef0e4).
 *
 * The sheet reads the confirmations 1.5 s after the screen settles. Printed
 * before that read landed, or after it failed, every rule said "Not confirmed
 * yet" with a "reconstructed" basis chip — including rules the reader had
 * confirmed. Unread, it now says the decision was not read for this printout
 * and claims no basis.
 *
 * Rendered with the real React (`renderToStaticMarkup` runs no effect, which is
 * exactly the state before the read lands), bundled with esbuild the way
 * `tests/process-states-view.spec.ts` does.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'workspace-print-sheet');
const SOURCE = fs
  .readFileSync(path.join(ROOT, 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

type Sheet = (props: Record<string, unknown>) => React.ReactElement;
let WorkspacePrintSheet: Sheet;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'workspace', 'WorkspacePrintSheet.tsx')],
    outfile: path.join(OUT, 'WorkspacePrintSheet.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase', 'firebase/*'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  WorkspacePrintSheet = require(path.join(OUT, 'WorkspacePrintSheet.cjs')).default as Sheet;
});

function rows(html: string): string[] {
  return [...html.matchAll(/data-print-rule="[^"]+"[^>]*>([\s\S]*?)(?=<div[^>]*data-print-rule=|<\/section>)/g)].map((m) => m[1]);
}

const OPEN = { items: [], count: 0, noSource: false };

test('with a signed run and the confirmations not read yet, no rule is printed as unconfirmed', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspacePrintSheet, {
      project: { legacyCode: SOURCE, activeRunId: 'run-1' },
      projectId: 'P-1',
      reading: readSource(SOURCE),
      open: OPEN,
    }),
  );
  const printed = rows(html);
  expect(printed.length).toBeGreaterThan(0);
  for (const row of printed) {
    expect(row).not.toContain('Not confirmed yet');
    expect(row).not.toMatch(/data-provenance="reconstructed"/);
    expect(row).toContain('Not read for this printout');
  }
});

test('without a signed run nothing can have been confirmed, and the sheet says so', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspacePrintSheet, {
      project: { legacyCode: SOURCE, activeRunId: null },
      projectId: 'P-1',
      reading: readSource(SOURCE),
      open: OPEN,
    }),
  );
  const printed = rows(html);
  expect(printed.length).toBeGreaterThan(0);
  for (const row of printed) expect(row).toContain('Not confirmed yet');
});
