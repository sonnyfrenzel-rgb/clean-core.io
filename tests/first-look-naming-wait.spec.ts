import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NAMING_WAIT_MS } from '../lib/first-look';

/**
 * The first insights' wait for the stored naming (QA review of a 3.0.x build).
 *
 * The end state needs stage 3's naming, or the decision to stand without one.
 * A naming read that never settled once kept the first look on "reading" for
 * good. Since v3.1.0 there is no paced build-up whose clock could end the wait
 * (plan AB-3): the card has one wait of its own, and that is the only rule left.
 * Server-free.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('the first insights do not wait for the naming forever', () => {
  test('the wait is short, and FirstLook runs it on a timer of its own', () => {
    expect(NAMING_WAIT_MS).toBeGreaterThan(0);
    expect(NAMING_WAIT_MS).toBeLessThanOrEqual(5000);
    const firstLook = read('components/workspace/FirstLook.tsx');
    expect(firstLook).toContain('setTimeout(() => setNamingWaited(true), NAMING_WAIT_MS)');
    // Once the wait is over the end state stands with the names it has; a naming arriving later still applies.
    expect(firstLook).toContain('const namingNow = naming ?? (namingWaited ? NO_NAMING : null);');
    // A new reading starts the wait over.
    expect(firstLook).toContain('setNamingWaited(false);');
  });

  test('nothing in the card waits for a build-up clock any more', () => {
    const firstLook = read('components/workspace/FirstLook.tsx');
    expect(firstLook).not.toMatch(/BUILD_UP|namingWaitOver|requestAnimationFrame\(tick\)/);
  });
});
