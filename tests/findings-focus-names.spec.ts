import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calmTitle, type FocusPick } from '../lib/findings-view';

/**
 * The focus cards' "Show in the list" buttons can be told apart by name — QA
 * review of ead81747aa34 (ec9fe1846fae).
 *
 * Up to three cards sit side by side, each with the same visible button. A
 * screen-reader user moving from button to button heard "Show in the list"
 * three times. The accessible name now starts with the visible words (label in
 * name) and ends with the card's own title.
 *
 * Rendered, not grepped: bundled with esbuild and rendered with the real React,
 * the pattern of `tests/process-states-view.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'findings-focus-names');

type Focus = (props: { picks: readonly FocusPick[]; onShow?: (kind: string) => void }) => React.ReactElement;
let FindingsFocus: Focus;

test.beforeAll(async () => {
  test.setTimeout(120 * 1000);
  fs.mkdirSync(OUT, { recursive: true });
  await build({
    entryPoints: [path.resolve(ROOT, 'components', 'analyze', 'FindingsFocus.tsx')],
    outfile: path.join(OUT, 'FindingsFocus.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': ROOT },
    logLevel: 'silent',
  });
  FindingsFocus = require(path.join(OUT, 'FindingsFocus.cjs')).default as Focus;
});

function pick(kind: string, title: string): FocusPick {
  return {
    row: {
      finding: { kind, title, severity: 'High', lineStart: 10, snippet: '' } as unknown as FocusPick['row']['finding'],
      lines: [10],
      snippets: [],
    } as FocusPick['row'],
    why: 'High',
    reason: null,
  };
}

/** The accessible name of each button: its text content, tags stripped. */
function buttonNames(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(),
  );
}

test('each "Show in the list" button carries its card title in its accessible name', () => {
  const picks = [
    pick('direct-update', 'Direct UPDATE on standard table EKKO'),
    pick('select-star', 'SELECT * on MARA'),
    pick('submit', 'Dynamic SUBMIT'),
  ];
  const html = renderToStaticMarkup(React.createElement(FindingsFocus, { picks, onShow: () => {} }));
  const names = buttonNames(html);
  expect(names).toHaveLength(3);
  expect(new Set(names).size).toBe(3);
  for (const [i, name] of names.entries()) {
    // Label in name: the visible words come first, then the card's title.
    expect(name.startsWith('Show in the list')).toBe(true);
    expect(name).toContain(calmTitle(picks[i].row.finding.title));
  }
});
