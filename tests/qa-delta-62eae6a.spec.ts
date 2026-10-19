import { test, expect } from '@playwright/test';
import { guardCaseAnswer, type CaseFact } from '../lib/case-answer';
import {
  ABAP_UNIT_EVIDENCE_LINE,
  ENGINE_CLASS_WORDS,
  RESERVED_TEST_CLASSES,
  abapTestEvidence,
  abapTestEvidenceSentences,
  isEngineTestClass,
} from '../lib/testing-abap-unit';

test.describe('the engine-class label names every class the engine count holds (779d5e16c924)', () => {
  const engineClasses = RESERVED_TEST_CLASSES.filter(isEngineTestClass);

  test('ltc_counterparts is counted, so the sentence, TRACE.md and the placement note name it', () => {
    expect(engineClasses).toContain('ltc_counterparts');
    for (const c of engineClasses) {
      expect(ENGINE_CLASS_WORDS.split(/,\s*/)).toContain(c);
      expect(ABAP_UNIT_EVIDENCE_LINE).toContain(c);
    }
    // A package whose only engine test method sits in ltc_counterparts: counted, and the label says where.
    const files = [
      { path: 'src/zcl_x_logic.clas.abap', content: 'CLASS zcl_x_logic DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n    METHODS run.\nENDCLASS.\nCLASS zcl_x_logic IMPLEMENTATION.\n  METHOD run.\n  ENDMETHOD.\nENDCLASS.\n' },
      {
        path: 'src/zcl_x_logic.clas.testclasses.abap',
        content: 'CLASS ltc_counterparts DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.\n  PRIVATE SECTION.\n    METHODS tc_01 FOR TESTING.\nENDCLASS.\nCLASS ltc_counterparts IMPLEMENTATION.\n  METHOD tc_01.\n    NEW zcl_x_logic( )->run( ).\n  ENDMETHOD.\nENDCLASS.\n',
      },
    ];
    const e = abapTestEvidence(files, null);
    expect(e?.engine?.methods).toBe(1);
    expect(abapTestEvidenceSentences(e!)[0]).toContain('ltc_counterparts');
  });
});

/**
 * Findings of the QA delta review of 62eae6a082bb, server-free.
 */

test.describe('a refusal does not shield a claim joined with a plain "and" (043251ff3ca5)', () => {
  const facts: CaseFact[] = [
    { id: 'a', kind: 'element', title: 'Show the report', detail: 'WRITE / gv_title', anchor: 'L2' },
  ];

  test('the claim after "and" is read as a claim: unanchored, it is dropped with its sentence', () => {
    const g = guardCaseAnswer(
      'The evidence does not answer whether the report deletes data and it deletes all customer records. It displays the report [L2].',
      facts,
    );
    expect(g.sentences[0].verdict).toBe('unanchored');
    expect(g.outcome).toBe('shown');
    if (g.outcome === 'shown') {
      expect(g.text).not.toContain('customer records');
      expect(g.dropped).toBe(1);
    }
    // Anchored, but naming what the cited fact does not hold.
    const k = guardCaseAnswer('The facts do not say who calls it and the report deletes table KNA1 [L2].', facts);
    expect(k.sentences[0].verdict).toBe('unsupported');
    expect(k.sentences[0].missing).toContain('KNA1');
  });

  test('an "and" inside the refusal is no clause of its own: the refusal stays a decline', () => {
    for (const text of [
      'The evidence does not say whether the report reads and writes the table.',
      'The facts do not show who schedules and monitors the job [L2].',
    ]) {
      const g = guardCaseAnswer(text, facts);
      expect(g.sentences[0].verdict, text).toBe('declined');
      expect(g.outcome).toBe('refused');
      if (g.outcome === 'refused') expect(g.reason).toBe('declined');
    }
  });
});
