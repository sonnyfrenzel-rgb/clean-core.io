import { test, expect } from '@playwright/test';
import { whatChangedSince, WHAT_CHANGED } from '../lib/terms-changes';
import { TERMS_VERSION } from '../lib/constants';

/**
 * The gate's "What changed" is never empty (owner, 03.10.2026, dev): an account
 * that had accepted the unpublished 6 October draft of v2.2.0 compared newer
 * than every entry and was shown an empty box over "accept the Terms".
 */
const versions = (accepted: string | null) => whatChangedSince(accepted).map((e) => e.version);

test('an account on a published earlier version sees every change since it', () => {
  expect(versions('2026-07-07')).toEqual(WHAT_CHANGED.filter((e) => e.version > '2026-07-07').map((e) => e.version));
  expect(versions('2026-09-18')).toContain(TERMS_VERSION);
  expect(versions('2026-09-18')).not.toContain('2026-09-18');
});

test('an account with no acceptance sees them all', () => {
  expect(versions(null)).toEqual(WHAT_CHANGED.map((e) => e.version));
});

test('an account that accepted an unpublished date still sees what the version in force changed', () => {
  expect(versions('2026-10-06')).toContain(TERMS_VERSION);
  expect(versions('2099-01-01').length).toBeGreaterThan(0);
});

test('nothing ever leaves the box empty', () => {
  for (const accepted of [null, '2026-07-07', '2026-09-18', TERMS_VERSION, '2026-10-06', 'garbage']) {
    expect(whatChangedSince(accepted).length, String(accepted)).toBeGreaterThan(0);
  }
});
