import { test, expect } from '@playwright/test';
import { designOnOpen, type DesignOnOpenInput } from '../lib/design-on-open';

/**
 * When opening Design writes the solution design (ADR-070, amended
 * 03.10.2026) — QA f63973a2cf05: the stale-design path had no test.
 */
const base: DesignOnOpenInput = {
  hasDesign: false,
  stale: { design: false, sourceChanged: false },
  owner: true,
  runLoadFailed: false,
  missingPrerequisites: 0,
};

test('none on record: written for the owner', () => {
  expect(designOnOpen(base)).toEqual({ wanted: true, canStart: true });
});

test('one on record for a previous basis: written again', () => {
  expect(designOnOpen({ ...base, hasDesign: true, stale: { design: true, sourceChanged: false } })).toEqual({ wanted: true, canStart: true });
});

test('a current one on record: never written again', () => {
  expect(designOnOpen({ ...base, hasDesign: true }).wanted).toBe(false);
});

test('a changed source wants a new analysis first, not a design', () => {
  const r = designOnOpen({ ...base, hasDesign: true, stale: { design: true, sourceChanged: true } });
  expect(r.wanted).toBe(false);
  expect(designOnOpen({ ...base, stale: { design: false, sourceChanged: true } }).canStart).toBe(false);
});

test('an invited reader, a run that did not load, or a missing prerequisite starts nothing', () => {
  expect(designOnOpen({ ...base, owner: false }).canStart).toBe(false);
  expect(designOnOpen({ ...base, runLoadFailed: true }).canStart).toBe(false);
  expect(designOnOpen({ ...base, missingPrerequisites: 1 }).canStart).toBe(false);
});
