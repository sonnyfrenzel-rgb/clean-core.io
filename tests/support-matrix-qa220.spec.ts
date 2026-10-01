/**
 * The public support matrix promises no more than the engine does.
 *
 * QA full review of v2.20.0 (fc787674705f): e84c70e76802, 75c4af75264e,
 * 67f11bad0b1d. `coverage.ts` records a local CALL FUNCTION as not assessed,
 * and a CDS match is a candidate (`tests/engine-honesty-guard.spec.ts`), so the
 * notes may not say "resolved" or "deterministic mapping".
 *
 * Serverless: reads the matrix object.
 */
import { test, expect } from '@playwright/test';
import { SUPPORT_MATRIX } from '../lib/abap/support-matrix';
import { assessCoverage } from '../lib/abap/coverage';

test('e84c70e76802 — direct SELECT is not advertised as a deterministic mapping', () => {
  expect(SUPPORT_MATRIX['direct-select'].notes).not.toMatch(/deterministic mapping/i);
  expect(SUPPORT_MATRIX['direct-select'].notes).toMatch(/candidate/i);
});

test('75c4af75264e — simple wrappers are not promised full decomposition and generation', () => {
  expect(SUPPORT_MATRIX['simple-wrapper'].notes).not.toMatch(/full AST decomposition/i);
  expect(SUPPORT_MATRIX['simple-wrapper'].notes).toMatch(/review/i);
});

test('67f11bad0b1d — a static call is not advertised as resolved while coverage says unassessed', () => {
  const gaps = assessCoverage("REPORT zt.\nCALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'.").unassessed.map((u) => u.gap);
  expect(gaps, 'the premise: the engine does not assess a local call').toContain('local-function-call');
  expect(SUPPORT_MATRIX['static-call'].notes).not.toMatch(/resolved to equivalent/i);
  expect(SUPPORT_MATRIX['static-call'].notes).toMatch(/not assessed/i);
});

test('50f3aac27c45 — a static call is not advertised at the "fully" level while a local call goes unassessed', () => {
  // The notes were narrowed (67f11bad0b1d); the level still said `fully`, and
  // the public page draws its mark from the level, not the notes.
  const local = assessCoverage("REPORT zt.\nCALL FUNCTION 'Z_LOCAL_FM'.").unassessed.map((u) => u.gap);
  const remote = assessCoverage("REPORT zt.\nCALL FUNCTION 'Z_REMOTE_FM' DESTINATION 'NONE'.").unassessed.map((u) => u.gap);
  expect(local, 'the premise: a local call is not assessed').toContain('local-function-call');
  expect(remote, 'the premise: the RFC form is assessed').not.toContain('local-function-call');
  expect(SUPPORT_MATRIX['static-call'].level).toBe('partial');
  expect(SUPPORT_MATRIX['static-call'].notes).toMatch(/DESTINATION/);
});
