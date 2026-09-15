/**
 * The accepted mockups 2.8 are the target picture of 3.0, and Sonny's rule (15.09.2026) is that they are found
 * 1:1 in the roadmap. A screen without a row in ROADMAP.md §5, or a row naming a step that does not exist, is how
 * a drawn element quietly never gets built. This guard reads both files as text — no browser, no emulator.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const roadmap = read('docs/ROADMAP.md');
const mockups = read('docs/roadmap/clean-core-mockups-v2_8.html');

const STEP = /^\d+\.\d+(?:\.\d+)?$/;
const steps = new Set([...roadmap.matchAll(/^\| (\d+\.\d+(?:\.\d+)?) \|/gm)].map((m) => m[1]));

function section5(): string {
  const start = roadmap.indexOf('## 5. Abgleich mit den Mockups');
  const end = roadmap.indexOf('## 6.', start);
  expect(start, 'ROADMAP.md §5 is missing').toBeGreaterThan(-1);
  expect(end, 'ROADMAP.md §6 must follow §5').toBeGreaterThan(start);
  return roadmap.slice(start, end);
}

/** Rows of the mapping table: screen id and the steps named in its last cell. */
function mappingRows(): Array<{ screen: string; steps: string[]; line: string }> {
  const lines = section5().split('\n').filter((line) => /^\| s\d+\b/.test(line));
  const rows = lines
    // An escaped pipe inside a cell ("Map \| Steps") is text, not a column border.
    .map((line) => ({ line, m: line.replace(/\\\|/g, '¦').match(/^\| (s\d+)\b[^|]*\|[^|]*\|([^|]+)\|\s*$/) }))
    .filter((r) => r.m)
    .map(({ line, m }) => ({ line, screen: m![1], steps: m![2].split(',').map((s) => s.trim()).filter(Boolean) }));
  // Every screen row is read — a row the pattern cannot parse would otherwise pass unchecked.
  expect(rows.map((r) => r.line), 'a §5 row has an unexpected shape').toEqual(lines);
  return rows;
}

test.describe('the mockups are found 1:1 in the roadmap', () => {
  test('the step table is readable', () => {
    for (const expected of ['0.9', '0.10', '0.11', '1.8', '2.9', '6.8', '3.0.7']) expect(steps.has(expected), `step ${expected}`).toBe(true);
  });

  test('every screen of the mockups has at least one row in §5', () => {
    const screens = [...mockups.matchAll(/<section class="screen[^"]*" id="(s\d+)"/g)].map((m) => m[1]);
    expect(screens.length).toBeGreaterThanOrEqual(16);
    const mapped = new Set(mappingRows().map((r) => r.screen));
    for (const screen of screens) expect(mapped.has(screen), `${screen} has no row in ROADMAP.md §5`).toBe(true);
  });

  test('every row names only steps that exist', () => {
    const rows = mappingRows();
    expect(rows.length).toBeGreaterThan(40);
    for (const row of rows) {
      expect(row.steps.length, `no step in: ${row.line}`).toBeGreaterThan(0);
      for (const step of row.steps) {
        expect(STEP.test(step), `"${step}" is not a step number in: ${row.line}`).toBe(true);
        expect(steps.has(step), `step ${step} does not exist (row: ${row.line})`).toBe(true);
      }
    }
  });

  test('every roadmap marker drawn in the mockups points at a step that exists', () => {
    const pins = [...mockups.matchAll(/<span class="pin"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) {
      for (const token of pin.split(/[·,/ –-]+/).map((s) => s.trim()).filter((s) => STEP.test(s))) {
        expect(steps.has(token), `mockup marker "${pin}" names step ${token}, which the roadmap does not have`).toBe(true);
      }
    }
  });
});
