import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { BUILD_UP_BUDGET, NAMING_WAIT_MS, namingWaitOver } from '../lib/first-look-buildup';

/**
 * The first look's wait for the stored naming (QA review of dd8e99691c8d).
 *
 * The end state needs stage 3's naming, or the decision to stand without one.
 * That decision used to come only from Skip or from the build-up's clock
 * reaching its end — and the clock runs only while a build-up plays. With
 * reduced motion, or on a page that asked for no build-up, a naming read that
 * never settled kept the first look on "reading" for good. Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the first look does not wait for the naming forever', () => {
  test('with nothing animating, the naming wait of its own ends the wait at elapsed 0', () => {
    expect(namingWaitOver({ skipped: false, animate: false, elapsed: 0, waited: true })).toBe(true);
    expect(namingWaitOver({ skipped: false, animate: false, elapsed: 0, waited: false })).toBe(false);
  });

  test('while the build-up plays, its budget decides as before — the own wait does not cut it short', () => {
    expect(namingWaitOver({ skipped: false, animate: true, elapsed: 0, waited: true })).toBe(false);
    expect(namingWaitOver({ skipped: false, animate: true, elapsed: BUILD_UP_BUDGET.endAt, waited: false })).toBe(true);
    expect(namingWaitOver({ skipped: true, animate: false, elapsed: 0, waited: false })).toBe(true);
  });

  test('the wait is short beside the build-up, and FirstLook runs it on a timer of its own', () => {
    expect(NAMING_WAIT_MS).toBeGreaterThan(0);
    expect(NAMING_WAIT_MS).toBeLessThan(BUILD_UP_BUDGET.endAt);
    const firstLook = read('components/workspace/FirstLook.tsx');
    expect(firstLook).toContain('setTimeout(() => setNamingWaited(true), NAMING_WAIT_MS)');
    expect(firstLook).toContain('namingWaitOver({ skipped, animate, elapsed, waited: namingWaited })');
    // A new reading starts the wait over.
    expect(firstLook).toContain('setNamingWaited(false);');
  });
});
