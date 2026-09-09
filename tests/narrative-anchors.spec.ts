import { test, expect } from '@playwright/test';
import {
  anchorNarrative,
  splitSentences,
  anchorInstruction,
} from '../lib/abap/narrative-anchors';
import type { EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * A narrative sentence either points at code or admits it does not.
 *
 * Traceability is the first condition both roadmaps put on the business side of
 * this product, and the reason is competitive rather than tidy: an uncited
 * narrative is an LLM opinion, and that is what every consultancy in the market
 * already sells. What makes it worth anything here is that each sentence can be
 * checked against the line it came from.
 *
 * The distinction these tests exist to hold is between *missing* and *invented*.
 * A sentence with no citation is honestly unevidenced. A sentence citing F-999
 * is wearing evidence it does not have, and collapsing the two into "not
 * anchored" would hide the more serious one inside the milder one.
 */

function finding(id: string, lineStart: number, lineEnd?: number): EvidenceFinding {
  return {
    id,
    kind: 'standard-table-read' as EvidenceFinding['kind'],
    title: `finding ${id}`,
    severity: 'High',
    confidence: 'High',
    source: 'static-parser',
    lineStart,
    lineEnd,
    snippet: 'SELECT * FROM VBAK',
    technicalDetail: '',
    cleanCoreImpact: '',
    recommendation: '',
    targetOptions: [],
  };
}

const FINDINGS = [finding('F-001', 380, 412), finding('F-002', 77)];
const LINES = 907;

test.describe('a citation is checked, not trusted', () => {
  test('a valid finding id resolves to its lines', () => {
    const r = anchorNarrative('It checks orders against the credit limit [F-001].', FINDINGS, LINES);
    expect(r.sentences[0].status).toBe('anchored');
    expect(r.sentences[0].anchors[0]).toMatchObject({
      kind: 'finding',
      findingId: 'F-001',
      lineStart: 380,
      lineEnd: 412,
    });
    // The marker is not left in the prose a reader sees.
    expect(r.sentences[0].text).toBe('It checks orders against the credit limit.');
  });

  test('an invented finding id is rejected, not counted as evidence', () => {
    const r = anchorNarrative('It posts to the ledger [F-999].', FINDINGS, LINES);
    expect(
      r.sentences[0].status,
      'a citation to a finding that does not exist must not read as anchored — ' +
        'that is a sentence wearing evidence it does not have',
    ).toBe('invalid-anchor');
    expect(r.sentences[0].rejected).toEqual(['[F-999]']);
    expect(r.anchoredCount).toBe(0);
    expect(r.invalidCount).toBe(1);
  });

  test('a line range past the end of the file is rejected', () => {
    const r = anchorNarrative('It writes a log [L9000-9100].', FINDINGS, LINES);
    expect(r.sentences[0].status).toBe('invalid-anchor');
  });

  test('a line range inside the file is accepted', () => {
    const r = anchorNarrative('It blocks the delivery [L401-410].', FINDINGS, LINES);
    expect(r.sentences[0].anchors[0]).toMatchObject({ kind: 'lines', lineStart: 401, lineEnd: 410 });
  });

  test('a backwards range is rejected', () => {
    const r = anchorNarrative('Something [L410-401].', FINDINGS, LINES);
    expect(r.sentences[0].status).toBe('invalid-anchor');
  });

  test('an uncited sentence is unevidenced, and kept', () => {
    const r = anchorNarrative('Consider a phased rollout.', FINDINGS, LINES);
    expect(r.sentences[0].status).toBe('unevidenced');
    expect(
      r.sentences,
      'an uncited sentence must survive into the output. Dropping it leaves a ' +
        'narrative that reads as fully sourced with its gaps invisible.',
    ).toHaveLength(1);
  });
});

test.describe('the rate is a measurement, not a flourish', () => {
  test('it is the share of sentences carrying a valid anchor', () => {
    const r = anchorNarrative(
      'It reads VBAK [F-001]. It checks authority [F-002]. Consider a phased rollout. It posts nothing [F-999].',
      FINDINGS,
      LINES,
    );
    expect(r.totalCount).toBe(4);
    expect(r.anchoredCount).toBe(2);
    expect(r.unevidencedCount).toBe(1);
    expect(r.invalidCount).toBe(1);
    expect(r.traceabilityRate).toBe(50);
  });

  test('no sentences is null, never a hundred per cent', () => {
    const r = anchorNarrative('', FINDINGS, LINES);
    expect(
      r.traceabilityRate,
      'a rate over zero sentences is exactly the kind of figure this product ' +
        'keeps having to remove',
    ).toBeNull();
    expect(r.totalCount).toBe(0);
  });
});

test.describe('sentence splitting does not invent boundaries', () => {
  test('abbreviations do not end a sentence', () => {
    expect(splitSentences('Use a released API, e.g. I_SalesDocument, instead. Then retire it.'))
      .toHaveLength(2);
  });

  test('a decimal or a release number does not end a sentence', () => {
    expect(splitSentences('Rel. 2023 introduced it. It is stable.')).toHaveLength(2);
  });

  test('a single sentence with no terminator still counts', () => {
    expect(splitSentences('One statement with no full stop')).toHaveLength(1);
  });
});

test.describe('the instruction and the parser stay in step', () => {
  test('the instruction offers only anchor forms the parser accepts', () => {
    const instruction = anchorInstruction(FINDINGS);
    // Every example the prompt shows has to survive the validator, or the model
    // is being told to produce output that will be marked as fabricated.
    for (const example of ['[F-001]', '[L380-412]']) {
      const r = anchorNarrative(`Example ${example}.`, FINDINGS, LINES);
      expect(r.sentences[0].status, `the prompt shows ${example} and the parser rejects it`).toBe('anchored');
    }
    expect(instruction).toContain('F-001');
    expect(instruction).toContain('[L380-412]');
  });
});
