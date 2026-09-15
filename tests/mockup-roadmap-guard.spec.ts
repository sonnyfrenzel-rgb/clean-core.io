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

  test('the views always read Business · IT · Management, never with Management in the middle (ADR-044)', () => {
    // Every element whose class list contains a switcher class, whatever else it carries; the three labels that follow
    // its opening tag, in document order. The count is exact: a new switcher has to be looked at, not waved through.
    const switchers = [...mockups.matchAll(/class="(?:[^"]*\s)?(?:views|minisegs|seg14)(?:\s[^"]*)?"[^>]*>/g)].map((m) =>
      [...mockups.slice(m.index! + m[0].length, m.index! + m[0].length + 600).matchAll(/>(Business|IT|Management)</g)]
        .slice(0, 3)
        .map((x) => x[1])
        .join(' · '),
    );
    expect(switchers.length).toBe(18);
    for (const order of switchers) expect(order).toBe('Business · IT · Management');

    // In prose and tables, every place that names all three views names them in this order — any permutation fails.
    const W = '(Business|IT|Management)';
    // A list may wrap onto the next line ("Business-, IT- und\n   Management-Sicht").
    const GAP = '[^A-Za-z]{1,8}(?:(?:and|und)[^A-Za-z]{1,6})?';
    const listed = (text: string) =>
      [...text.matchAll(new RegExp(`\\b${W}\\b${GAP}\\b${W}\\b${GAP}\\b${W}\\b`, 'g'))]
        .map((m) => [m[1], m[2], m[3]])
        .filter((words) => new Set(words).size === 3)
        .map((words) => words.join(' · '));
    for (const [file, atLeast] of [['DESIGN.md', 3], ['docs/ROADMAP.md', 4]] as const) {
      const found = listed(read(file));
      expect(found.length, `${file} should name the three views in order at least ${atLeast} times`).toBeGreaterThanOrEqual(atLeast);
      for (const order of found) expect(order, file).toBe('Business · IT · Management');
    }
    expect(listed('Management · IT · Business and IT, Business and Management')).toEqual(['Management · IT · Business', 'IT · Business · Management']);
  });

  test('every section of the accepted landing page has a row in §5, naming steps that exist', () => {
    const landing = read('docs/roadmap/clean-core-landing-v3_0.html');
    // The desktop frame is the page; the phone frame repeats it.
    const desktop = landing.slice(landing.indexOf('id="L0"'), landing.indexOf('id="L1"') > 0 ? landing.indexOf('id="L1"') : undefined);
    const sections = [...new Set([...desktop.matchAll(/<section[^>]*\sid="([a-z][a-z-]*)"/g)].map((m) => m[1]))];
    expect(sections.length).toBeGreaterThanOrEqual(10);
    const rows = section5()
      .replace(/\\\|/g, '¦')
      .split('\n')
      .map((line) => line.match(/^\| Landing · ([a-z-]+) \|[^|]*\|([^|]+)\|\s*$/))
      .filter(Boolean)
      .map((m) => ({ id: m![1], steps: m![2].split(',').map((s) => s.trim()) }));
    const mapped = new Set(rows.map((r) => r.id));
    for (const id of sections) expect(mapped.has(id), `landing section "${id}" has no row in ROADMAP.md §5`).toBe(true);
    for (const id of ['header', 'hero', 'site-footer']) expect(mapped.has(id), `landing ${id} row`).toBe(true);
    for (const row of rows) for (const step of row.steps) expect(steps.has(step), `Landing · ${row.id} names step ${step}, which does not exist`).toBe(true);
  });

  test('every roadmap marker drawn in the mockups points at a step that exists', () => {
    const pins = [...mockups.matchAll(/<span class="pin"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(pins.length).toBeGreaterThan(0);
    // A marker is made of steps, step ranges, DESIGN.md sections and decision numbers — nothing else. A marker
    // without a single step, or with a token that is none of these ("TBD", "1.8x"), fails instead of passing empty.
    const SECTION = /^§\d+(?:\.\d+)*$/;
    const ADR = /^ADR-\d{3}$/;
    const RANGE = /^(\d+\.\d+(?:\.\d+)?)–(\d+\.\d+(?:\.\d+)?)$/;
    for (const pin of pins) {
      const tokens = pin.split(/\s*[·,/]\s*|\s+/).map((s) => s.trim()).filter(Boolean);
      expect(tokens.length, `empty marker "${pin}"`).toBeGreaterThan(0);
      const named: string[] = [];
      for (const token of tokens) {
        const range = token.match(RANGE);
        if (STEP.test(token)) named.push(token);
        else if (range) named.push(range[1], range[2]);
        else expect(SECTION.test(token) || ADR.test(token), `mockup marker "${pin}" has an unknown token "${token}"`).toBe(true);
      }
      expect(named.length + tokens.filter((t) => SECTION.test(t) || ADR.test(t)).length, `marker "${pin}" names nothing`).toBeGreaterThan(0);
      for (const step of named) expect(steps.has(step), `mockup marker "${pin}" names step ${step}, which the roadmap does not have`).toBe(true);
    }
  });
});
