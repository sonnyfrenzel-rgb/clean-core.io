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
/** The same sheet with the level lookup answered — see `STUB` below. */
let GradedSheet: Sheet;

/**
 * The lookup as it answers once `/api/abcd-classify` is back: EBAN graded C for
 * a read, LFA1 left without a grade (the route found no row for it). Swapped in
 * for the real hook at bundle time, so the sheet's own code is what renders.
 */
const STUB = `
export function useAbcdCatalogLookup(objects, target) {
  globalThis.__printLookupTarget = target;
  return {
    status: 'ready',
    grades: { 'EBAN@read': { grade: 'C' } },
    noPath: {},
  };
}
`;

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
  fs.writeFileSync(path.join(OUT, 'lookup-stub.js'), STUB);
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'workspace', 'WorkspacePrintSheet.tsx')],
    outfile: path.join(OUT, 'WorkspacePrintSheetGraded.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'firebase', 'firebase/*'],
    alias: { '@': ROOT },
    plugins: [
      {
        name: 'lookup-stub',
        setup(b) {
          b.onResolve({ filter: /useAbcdCatalogLookup$/ }, () => ({ path: path.join(OUT, 'lookup-stub.js') }));
        },
      },
    ],
    logLevel: 'silent',
  });
  GradedSheet = require(path.join(OUT, 'WorkspacePrintSheetGraded.cjs')).default as Sheet;
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

/*
 * Owner decision 01.10.2026 ("Clean core level anzeigen ja auf dem Druckblatt"):
 * the sheet prints SAP's clean core level A–D per SAP object, read under the
 * project's target profile, with a legend — and "not determined" where there
 * is no grade. Never a letter before the lookup has answered.
 */

function objectRows(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/data-print-object="([^"]+)"[^>]*>([\s\S]*?)(?=<div[^>]*data-print-object=|<\/div><dl)/g)) {
    out.set(m[1], m[2]);
  }
  return out;
}

test('every SAP object the code names prints with its clean core level, under the project target', () => {
  const html = renderToStaticMarkup(
    React.createElement(GradedSheet, {
      project: { legacyCode: SOURCE, activeRunId: null, s4Deployment: 'private' },
      projectId: 'P-1',
      reading: readSource(SOURCE),
      open: OPEN,
    }),
  );
  expect((globalThis as Record<string, unknown>).__printLookupTarget).toEqual({ edition: 'private', release: '' });
  const printed = objectRows(html);
  expect(printed.has('EBAN@read')).toBe(true);
  expect(printed.has('LFA1@read')).toBe(true);
  expect(printed.get('EBAN@read')).toContain('data-print-level="C"');
  expect(printed.get('EBAN@read')).toContain('internal SAP APIs');
  // No row in the answer: not determined, never a guessed letter.
  expect(printed.get('LFA1@read')).toContain('data-print-level="Unknown"');
  expect(printed.get('LFA1@read')).toContain('not determined');
  // The legend names all four levels and the missing grade.
  const legend = html.slice(html.indexOf('data-print-legend'));
  for (const word of ['released SAP APIs', 'classic SAP APIs', 'internal SAP APIs', 'not recommended', 'not determined']) {
    expect(legend).toContain(word);
  }
  expect(html).toContain('not part of the signed run');
});

test('before the level lookup answers, no object prints a level', () => {
  const html = renderToStaticMarkup(
    React.createElement(WorkspacePrintSheet, {
      project: { legacyCode: SOURCE, activeRunId: null },
      projectId: 'P-1',
      reading: readSource(SOURCE),
      open: OPEN,
    }),
  );
  const printed = objectRows(html);
  expect(printed.size).toBeGreaterThan(0);
  for (const row of printed.values()) {
    expect(row).toContain('data-print-level="loading"');
    expect(row).toContain('Not read for this printout');
    expect(row).not.toContain('data-cc-identifier="clean-core-level"');
  }
});

test('the level stays out of the signed audit pack', () => {
  const pack = fs.readFileSync(path.join(ROOT, 'lib', 'audit-pack.ts'), 'utf8');
  expect(pack).not.toMatch(/WorkspacePrintSheet|useAbcdCatalogLookup|clean-core-level/);
});
