import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SUPPORT_MATRIX, HOW_IT_WORKS_BASE, type ConstructType } from '../lib/abap/support-matrix';

const HOW_IT_WORKS_PAGE = path.resolve(__dirname, '../app/(app)/how-it-works/page.tsx');

function readPage(): string {
  return fs.readFileSync(HOW_IT_WORKS_PAGE, 'utf8');
}

test.describe('support matrix integrity', () => {
  const entries = Object.values(SUPPORT_MATRIX);

  test('every entry is internally consistent', () => {
    for (const e of entries) {
      expect(e.title.trim().length).toBeGreaterThan(0);
      expect(e.notes.trim().length).toBeGreaterThan(0);
      expect(['fully', 'partial', 'not-supported']).toContain(e.level);
      expect(e.anchor).toMatch(/^[a-z0-9-]+$/); // url-safe anchor
    }
  });

  test('anchors are unique (deep links never collide)', () => {
    const anchors = entries.map((e) => e.anchor);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  test('keys match their construct field', () => {
    for (const key of Object.keys(SUPPORT_MATRIX) as ConstructType[]) {
      expect(SUPPORT_MATRIX[key].construct).toBe(key);
    }
  });

  test('the documented base URL matches the engine constant', () => {
    expect(HOW_IT_WORKS_BASE).toBe('https://clean-core.io/how-it-works');
  });
});

test.describe('how-it-works page is data-driven from SUPPORT_MATRIX', () => {
  test('the page exists', () => {
    expect(fs.existsSync(HOW_IT_WORKS_PAGE)).toBe(true);
  });

  test('renders the coverage matrix from the single source of truth', () => {
    const page = readPage();
    // Must consume the matrix module + its renderer + label maps.
    expect(page).toMatch(/from\s+['"]@\/lib\/abap\/support-matrix['"]/);
    expect(page).toMatch(/supportMatrixRows|SUPPORT_MATRIX/);
    expect(page).toContain('LEVEL_LABEL');
    expect(page).toContain('LEVEL_EMOJI');
  });

  test('wires per-construct fields (title, notes) and anchors for deep links', () => {
    const page = readPage();
    expect(page).toContain('row.title');
    expect(page).toContain('row.notes');
    expect(page).toContain('row.anchor'); // anchor id rendered -> #anchor deep links resolve
  });

  test('does NOT reintroduce a hardcoded coverage table', () => {
    const page = readPage();
    // Human labels must come from LEVEL_LABEL (matrix), never hardcoded literals.
    expect(page).not.toMatch(/Fully Supported|Not Supported/);
    // No re-introduced literal coverage array.
    expect(page).not.toMatch(/const\s+coverageRows\s*=\s*\[/);
  });
});
