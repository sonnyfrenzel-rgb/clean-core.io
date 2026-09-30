/**
 * Own work is Rebuild before the level and platform gates, and the headline
 * does not speak for objects it never assigned.
 *
 * QA full review of v2.20.0 (fc787674705f): ceb59bbace90, 50eec718700f.
 *
 * Serverless: pure functions.
 */
import { test, expect } from '@playwright/test';
import {
  assignPublicCloudFit,
  publicCloudFitHeadline,
  summarizePublicCloudFit,
  type PublicCloudFitObjectInput,
} from '../lib/abap/public-cloud-fit';

function input(over: Partial<PublicCloudFitObjectInput> = {}): PublicCloudFitObjectInput {
  return {
    objectName: 'ZOBJ',
    level: 'C',
    levelProvenance: 'catalog',
    dropDecision: null,
    usage: null,
    catalog: { state: 'deprecated', pathEvidence: 'none-named' },
    hasModification: false,
    hasOwnWriteAccess: false,
    ...over,
  };
}

test('ceb59bbace90 — a modification is Rebuild with an unknown level and with no platform', () => {
  for (const [over, platform] of [
    [{ level: 'Unknown' as const, hasModification: true }, 'private' as const],
    [{ hasModification: true }, null],
    [{ level: 'Unknown' as const, hasOwnWriteAccess: true }, null],
  ] as const) {
    const a = assignPublicCloudFit(input(over), platform);
    expect(a.bucket, JSON.stringify({ over, platform })).toBe('rebuild');
    expect(a.rule).toBe('rebuild-own-work');
  }
});

test('ceb59bbace90 — without own work the gates still answer "not assigned"', () => {
  expect(assignPublicCloudFit(input({ level: 'Unknown' }), 'private').reason?.code).toBe('level-not-determined');
  expect(assignPublicCloudFit(input(), null).reason?.code).toBe('target-platform-not-set');
});

test('50eec718700f — the headline does not say "no object is waiting" over unassigned objects', () => {
  const assignments = [
    assignPublicCloudFit(input({ objectName: 'ZA', level: 'A', catalog: { pathEvidence: 'successor-named' } }), 'public'),
    assignPublicCloudFit(input({ objectName: 'ZB', level: 'Unknown' }), 'public'),
  ];
  const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'public', usageImported: true });
  expect(summary.counts.notAssigned).toBe(1);
  const headline = publicCloudFitHeadline(summary);
  expect(headline).not.toMatch(/^No object is waiting/);
  expect(headline).toMatch(/1 object is not assigned/);
});
