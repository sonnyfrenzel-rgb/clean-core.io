/**
 * CR-04 — no technology verdict from a single legacy symptom.
 *
 * A write to the customer's own Z-table used to set the recommendation to
 * Side-by-Side (BTP) on its own, in both deployment models, with the rationale
 * "Custom tables and side-effect logging require decoupled Side-by-Side
 * architecture (CAP)". For Private Edition / RISE that is backwards: custom
 * persistence in the customer namespace is the developer-extensibility case —
 * a Dictionary object with a RAP business object on it, on-stack. A Z-table is
 * not a clean core violation; writing to SAP's tables is.
 *
 * The boundary confirmed with the SAP architect before the rule was changed:
 * Private Edition / RISE keeps custom persistence on-stack, Public Edition's
 * strict SaaS model still routes it Side-by-Side. The deployment decides, not
 * the construct — which is the whole point of the finding.
 */
import { test, expect } from '@playwright/test';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';

/** A program whose only notable act is writing to its own Z-table. */
const CUSTOM_WRITE_ONLY = [
  'REPORT z_custom_persist.',
  'DATA ls_row TYPE zcust_log.',
  'ls_row-id = 1.',
  'INSERT zcust_log FROM ls_row.',
  'UPDATE zcust_log FROM ls_row.',
].join('\n');

function route(code: string, deployment: 'public' | 'private') {
  return routeExtensibility(buildAbapEvidence(code, 'z_custom_persist.abap', deployment), deployment);
}

test.describe('custom persistence is judged by deployment, not by the construct', () => {
  test('Private Edition keeps custom persistence on-stack', () => {
    const report = route(CUSTOM_WRITE_ONLY, 'private');

    expect(
      report.recommendedRoute,
      'a Z-table write alone must not push a RISE customer off the stack',
    ).toBe('In-App (ABAP Cloud)');
  });

  test('Public Edition still routes custom persistence Side-by-Side', () => {
    const report = route(CUSTOM_WRITE_ONLY, 'public');

    expect(report.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
  });

  test('the two deployments genuinely disagree on the same source', () => {
    // The regression this pins is the old behaviour, where both were BTP and the
    // deployment made no difference at all to this construct.
    expect(route(CUSTOM_WRITE_ONLY, 'private').recommendedRoute).not.toBe(
      route(CUSTOM_WRITE_ONLY, 'public').recommendedRoute,
    );
  });

  test('the on-stack rationale explains itself rather than just asserting', () => {
    const { rationale } = route(CUSTOM_WRITE_ONLY, 'private');

    expect(rationale).toMatch(/developer extensibility/i);
    // The sentence that stops the next reader re-filing this as a bug.
    expect(rationale).toMatch(/not a clean core violation/i);
  });

  test('the Public Edition rationale names the edition, not the construct', () => {
    const { rationale } = route(CUSTOM_WRITE_ONLY, 'public');
    expect(rationale).toMatch(/Public Edition/i);
  });
});

test.describe('the symptoms that legitimately still force Side-by-Side', () => {
  const cases: Array<{ name: string; code: string }> = [
    {
      name: 'RFC call',
      code: ["REPORT z_rfc.", "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'."].join('\n'),
    },
    {
      name: 'BDC / CALL TRANSACTION',
      code: ['REPORT z_bdc.', "CALL TRANSACTION 'VA01'."].join('\n'),
    },
    {
      name: 'Native SQL',
      code: ['REPORT z_native.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n'),
    },
  ];

  for (const c of cases) {
    test(`${c.name} still routes Side-by-Side in Private Edition`, () => {
      // Narrowing the custom-write rule must not quietly narrow the others.
      expect(route(c.code, 'private').recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    });
  }
});

/**
 * Retirement is the one recommendation that says "this code can go", and it was
 * reachable by an argument that is empty (052d2fe8f51c).
 *
 * `codeInventory.every(i => i.criticality === 'Low')` is true for an empty
 * array, and a snippet without a REPORT, a class or a FORM produces no
 * inventory at all — so "no custom business logic" was concluded from having
 * recognised nothing rather than from having looked. Nothing asked what the
 * code writes either, and a custom-table write returns earlier while a standard
 * one fell through: `UPDATE vbak`, twelve lines, came back as a candidate for
 * retirement.
 */
test.describe('no retirement verdict from an empty argument', () => {
  const architecture = (code: string) =>
    recommendArchitecture(code, extractCodeInventory(code), extractDataCoupling(code));

  test('a destructive write to an SAP standard table is never proposed for retirement', () => {
    const code = ['UPDATE vbak SET erdat = sy-datum WHERE vbeln = lv_vbeln.'].join('\n');
    expect(architecture(code).architecture, 'a write to VBAK proposed for deletion').not.toBe('retire');
  });

  test('a snippet the parser recognises nothing in is not "no custom business logic"', () => {
    const code = ['lv_a = 1.', 'lv_b = lv_a + 2.'].join('\n');
    expect(extractCodeInventory(code), 'the premise of the test: no inventory at all').toHaveLength(0);
    expect(architecture(code).architecture).not.toBe('retire');
  });

  test('a small low-criticality routine that touches nothing still is', () => {
    // The guard removes an unearned verdict, not the verdict.
    const code = ['FORM add_two.', '  lv_a = lv_a + 2.', 'ENDFORM.'].join('\n');
    expect(extractCodeInventory(code).map((i) => i.criticality)).toEqual(['Low']);
    expect(architecture(code).architecture).toBe('retire');
  });
});

test.describe('the architecture panel agrees with the router', () => {
  test('RAP is not described as unsuitable for custom persistence', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'components/ArchitectSignOff.tsx'),
      'utf8',
    );

    // The panel and the router are two surfaces for one rule. When they disagree
    // the reader believes whichever they saw first, so the flat claim must be gone.
    expect(
      /notFor:\s*'Custom Z-table persistence/.test(src),
      'the panel must not tell a RISE customer that RAP cannot hold their own tables',
    ).toBe(false);
  });
});
