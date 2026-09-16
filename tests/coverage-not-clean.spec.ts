import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';

/**
 * Code nobody assessed is not code that came back clean.
 *
 * `assessCoverage` records the constructs no detector claims, and the router
 * ignored it: a file of application-server dataset I/O produced no findings, so
 * the score stayed at 100, the Key User checkpoint read "Highly feasible.
 * Trivial extension", and the assumptions said "No legacy patterns detected"
 * (QA review of 33471220d6e9, 45737310a1d7). Roadmap 0.18.
 */

/** Dataset I/O: real ABAP, and nothing in the finding detectors looks at it. */
const UNASSESSED = [
  'REPORT z_file_transfer.',
  'DATA: lv_line TYPE string.',
  'START-OF-SELECTION.',
  "  OPEN DATASET '/tmp/in.dat' FOR INPUT IN TEXT MODE ENCODING DEFAULT.",
  '  DO.',
  '    READ DATASET lv_file INTO lv_line.',
  '    IF sy-subrc <> 0.',
  '      EXIT.',
  '    ENDIF.',
  '  ENDDO.',
  '  CLOSE DATASET lv_file.',
].join('\n');

/** Ordinary, fully assessed code with a real finding in it. */
const ASSESSED = [
  'REPORT z_order_write.',
  'START-OF-SELECTION.',
  '  UPDATE vbak SET erdat = @sy-datum WHERE vbeln = @lv_vbeln.',
].join('\n');

/**
 * Ordinary code the engine reads completely and finds nothing in.
 *
 * No `WRITE: /` — classic list output is itself one of the unassessed
 * constructs, which is the point of the whole exercise.
 */
const CLEAN = [
  'REPORT z_local_only.',
  'DATA: lt_items TYPE STANDARD TABLE OF ty_item,',
  '      ls_item  TYPE ty_item.',
  'START-OF-SELECTION.',
  '  ls_item-id = 1.',
  '  INSERT ls_item INTO TABLE lt_items.',
  '  LOOP AT lt_items INTO ls_item.',
  '    ADD 1 TO lv_count.',
  '  ENDLOOP.',
].join('\n');

const routeFor = (code: string) => routeExtensibility(buildAbapEvidence(code, 'spec.abap'), 'public');

test('an unassessed construct is reported as unassessed', () => {
  const evidence = buildAbapEvidence(UNASSESSED, 'unassessed.abap');
  expect(evidence.findings.length, 'no detector claims dataset I/O').toBe(0);
  expect(evidence.coverage.complete, 'and the coverage report says so').toBe(false);
  expect(evidence.coverage.gaps.length).toBeGreaterThan(0);
});

test('no findings plus incomplete coverage is not a trivial extension', () => {
  const route = routeFor(UNASSESSED);
  const keyUser = route.checkpoints.find((c) => c.checkpointName.includes('Key User'))!;
  expect(keyUser.evaluation, 'the claim that could not be earned').not.toContain('Trivial extension');
  expect(keyUser.evaluation).toContain('Not established');
  expect(keyUser.evaluation, 'and it names what was not read').toMatch(/not assessed/i);
  expect(keyUser.resultState, 'an unread object is not a preference').not.toBe('In-App Preferred');
});

test('the score and the confidence describe what was read', () => {
  const unread = routeFor(UNASSESSED);
  const clean = routeFor(CLEAN);
  expect(clean.cleanCoreScore, 'a fully read object keeps its score').toBe(100);
  expect(unread.cleanCoreScore, 'an unread one does not come out at 100').toBeLessThan(100);
  expect(unread.cleanCoreScore, 'and is not driven to zero either — it is unknown, not bad').toBeGreaterThanOrEqual(50);
  expect(unread.confidenceScore).toBeLessThan(clean.confidenceScore);
});

test('the assumptions say what was not assessed, with and without findings', () => {
  const unread = routeFor(UNASSESSED);
  expect(unread.assumptions.join(' ')).toMatch(/did not assess/i);
  expect(unread.assumptions.join(' '), 'the sentence that claimed a clean reading is gone').not.toContain('No legacy patterns detected —');

  const clean = routeFor(CLEAN);
  expect(clean.assumptions.join(' '), 'a complete reading with nothing found still says so plainly').toContain('No legacy patterns detected');
});

test('a fully assessed object with a finding is unchanged by this', () => {
  const route = routeFor(ASSESSED);
  expect(buildAbapEvidence(ASSESSED, 'assessed.abap').coverage.complete).toBe(true);
  expect(route.cleanCoreScore).toBeLessThan(100);
  expect(route.assumptions.join(' ')).not.toMatch(/did not assess/i);
});
