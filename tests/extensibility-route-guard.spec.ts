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
