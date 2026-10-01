/**
 * A valid citation does not hide an invented one in the same sentence.
 *
 * QA full review of v2.20.0 (fc787674705f), a42b040e23a5.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { anchorNarrative } from '../lib/abap/narrative-anchors';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

const FINDINGS = [{ id: 'CC-001', lineStart: 10, lineEnd: 12 } as unknown as EvidenceFinding];

test('a42b040e23a5 — a sentence with one valid and one invented citation is not counted as sourced', () => {
  const r = anchorNarrative('The write is unsafe [CC-001] and SAP confirms it [FAKE-9].', FINDINGS, 100);
  expect(r.sentences[0].status).toBe('invalid-anchor');
  expect(r.sentences[0].rejected).toEqual(['[FAKE-9]']);
  expect(r.sentences[0].anchors.map((a) => a.findingId), 'the valid anchor is still shown').toEqual(['CC-001']);
  expect(r.anchoredCount).toBe(0);
  expect(r.invalidCount).toBe(1);
  expect(r.traceabilityRate).toBe(0);
});

test('a42b040e23a5 — a sentence with only valid citations stays anchored', () => {
  expect(anchorNarrative('The write is unsafe [CC-001].', FINDINGS, 100).sentences[0].status).toBe('anchored');
});
