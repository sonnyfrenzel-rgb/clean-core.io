import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readProcess } from '../lib/first-look';
import { firstLookExcerpt } from '../lib/first-look-excerpt';

/**
 * Roadmap 3.0.21 — "First insights becomes the strongest page of the app"
 * (owner decisions 22.10.2026), the presentation half. Server-free: the engine
 * and the pure helpers the page lays out.
 */

const ROOT = path.resolve(__dirname, '..');
const RECEIPT = fs
  .readFileSync(path.join(ROOT, 'tests', 'fixtures', 'first-look', 'zmm-receipt-invoice-check.abap'), 'utf8')
  .replace(/\r\n/g, '\n');

test.describe('the drawing beside the steps sets the test-data switch apart (fix, 22.10.2026)', () => {
  const proc = readProcess(RECEIPT);

  test('from engine 3.0.20 the receipt check\'s drawing no longer opens with the demo cases', () => {
    const names = firstLookExcerpt(proc.skeleton, RECEIPT, 5, '3.0.20').nodes.map((n) => n.name);
    expect(names.join(' | ')).not.toMatch(/apply case/i);
    expect(names.join(' | ')).not.toMatch(/demo/i);
    // The process is still drawn: the switch is passed over, not the program.
    expect(names.length).toBeGreaterThan(2);
  });

  test('a run signed by an older engine draws what it drew then', () => {
    const names = firstLookExcerpt(proc.skeleton, RECEIPT, 5, '3.0.19').nodes.map((n) => n.name);
    expect(names.join(' | ')).toMatch(/apply case/i);
  });
});
