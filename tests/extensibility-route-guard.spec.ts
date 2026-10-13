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
 *
 * From engine 3.0.12 (`ON_STACK_CONSTRUCTS_FROM`, DSAG guide review C1) the
 * Public Edition keeps custom persistence on-stack too — developer
 * extensibility holds custom tables there — and BDC, native SQL and a local
 * RFC no longer choose the route; only an RFC call to another system does.
 * Runs of an earlier engine keep the rule they were signed with, so the
 * tests below pin both.
 */
import { test, expect } from '@playwright/test';
import { ON_STACK_CONSTRUCTS_FROM, routeDrivers, routeExtensibility, rfcCallTarget } from '../lib/abap/extensibility-router';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { extractCodeInventory, extractDataCoupling, recommendArchitecture } from '../lib/abap/code-assessment';
import { APP_VERSION } from '../lib/version';

/** A program whose only notable act is writing to its own Z-table. */
const CUSTOM_WRITE_ONLY = [
  'REPORT z_custom_persist.',
  'DATA ls_row TYPE zcust_log.',
  'ls_row-id = 1.',
  'INSERT zcust_log FROM ls_row.',
  'UPDATE zcust_log FROM ls_row.',
].join('\n');

// Evidence and route of one engine, as a run of that engine signs them: since
// 3.0.12 the evidence itself is version-gated (a local RFC is no outbound call).
function route(code: string, deployment: 'public' | 'private', engine: string = APP_VERSION) {
  return routeExtensibility(buildAbapEvidence(code, 'z_custom_persist.abap', deployment, undefined, engine), deployment, engine);
}

/** An engine before 3.0.12 — the rule a run signed then keeps. */
const OLD = 'v3.0.11';
/** The first engine of the on-stack rule. */
const NEW = ON_STACK_CONSTRUCTS_FROM;

const driversOf = (code: string, deployment: 'public' | 'private', engine: string) =>
  routeDrivers(buildAbapEvidence(code, 'z.abap', deployment, undefined, engine), deployment, engine).map((d) => d.kind);

test.describe('custom persistence is judged by deployment, not by the construct', () => {
  test('Private Edition keeps custom persistence on-stack', () => {
    const report = route(CUSTOM_WRITE_ONLY, 'private');

    expect(
      report.recommendedRoute,
      'a Z-table write alone must not push a RISE customer off the stack',
    ).toBe('In-App (ABAP Cloud)');
  });

  test('before 3.0.12 the Public Edition routes custom persistence Side-by-Side', () => {
    const report = route(CUSTOM_WRITE_ONLY, 'public', OLD);

    expect(report.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
  });

  test('before 3.0.12 the two deployments genuinely disagree on the same source', () => {
    // The regression this pins is the behaviour before CR-04, where both were
    // BTP and the deployment made no difference at all to this construct.
    expect(route(CUSTOM_WRITE_ONLY, 'private', OLD).recommendedRoute).not.toBe(
      route(CUSTOM_WRITE_ONLY, 'public', OLD).recommendedRoute,
    );
  });

  test('from 3.0.12 the Public Edition keeps custom persistence on-stack as well', () => {
    const report = route(CUSTOM_WRITE_ONLY, 'public', NEW);
    expect(report.recommendedRoute).toBe('In-App (ABAP Cloud)');
    expect(driversOf(CUSTOM_WRITE_ONLY, 'public', NEW)).toEqual([]);
    expect(report.rationale).toMatch(/holds custom tables on-stack through developer extensibility/);
    expect(report.rationale).toMatch(/forces no side-by-side split/);
    expect(report.assumptions.join('\n')).not.toMatch(/not yet decoupled/);
    expect(report.targetArtifact).toBe('RAP Business Object');
  });

  test('from 3.0.12 a write to an SAP standard table is a finding to replace in the Public Edition, not a route', () => {
    const WRITE_VBAK = 'REPORT z_sw.\nUPDATE vbak SET erdat = sy-datum WHERE vbeln = lv_v.';
    expect(route(WRITE_VBAK, 'public', OLD).recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    const now = route(WRITE_VBAK, 'public', NEW);
    expect(now.recommendedRoute).toBe('In-App (ABAP Cloud)');
    expect(now.rationale).toMatch(/a side-by-side service cannot write SAP's tables either/);
    expect(now.rationale).toMatch(/a released API or a RAP action of a released business object/);
    // Not a BAPI: the Public Edition offers custom code released APIs only.
    expect(now.rationale).not.toMatch(/BAPI/);
    expect(now.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).toBe('Partially Compatible');
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

test.describe('the symptoms that forced Side-by-Side before 3.0.12', () => {
  const cases: Array<{ name: string; code: string }> = [
    {
      name: 'RFC call',
      code: ["REPORT z_rfc.", "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'."].join('\n'),
    },
    {
      name: 'BDC / CALL TRANSACTION',
      // Batch input is `USING <bdcdata>`; without it the call is SAP GUI
      // navigation and stays on-stack (roadmap 3.0.7).
      code: ['REPORT z_bdc.', "CALL TRANSACTION 'VA01' USING lt_bdc."].join('\n'),
    },
    {
      name: 'Native SQL',
      code: ['REPORT z_native.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n'),
    },
  ];

  for (const c of cases) {
    test(`${c.name} routes Side-by-Side in Private Edition under an engine before 3.0.12`, () => {
      // Narrowing the custom-write rule must not quietly narrow the others.
      expect(route(c.code, 'private', OLD).recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    });
  }
});

test.describe('from 3.0.12 only an RFC call to another system forces Side-by-Side (DSAG guide review C1)', () => {
  const BDC = ['REPORT z_bdc.', "CALL TRANSACTION 'VA01' USING lt_bdc."].join('\n');
  const NATIVE = ['REPORT z_native.', 'EXEC SQL.', 'SELECT 1 FROM DUAL', 'ENDEXEC.'].join('\n');
  const RFC_OUT = ["REPORT z_rfc.", "CALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'."].join('\n');
  const RFC_VAR = ["REPORT z_rfc.", "CALL FUNCTION 'Z_REMOTE' DESTINATION lv_dest."].join('\n');
  const RFC_NONE = ["REPORT z_rfc.", "CALL FUNCTION 'Z_LOCAL' DESTINATION 'NONE'."].join('\n');
  const RFC_GROUP = ["REPORT z_rfc.", "CALL FUNCTION 'Z_PARALLEL' STARTING NEW TASK lv_task DESTINATION IN GROUP DEFAULT."].join('\n');
  const RFC_PARAM = ["REPORT z_rfc.", "CALL FUNCTION 'RFC_CONNECTION_CLOSE'", '  EXPORTING', '    destination = lv_dest', '  EXCEPTIONS', '    OTHERS = 1.'].join('\n');

  for (const deployment of ['private', 'public'] as const) {
    test(`BDC stays on-stack, with the guide's answer — ${deployment}`, () => {
      expect(driversOf(BDC, deployment, OLD)).toContain('bdc');
      expect(driversOf(BDC, deployment, NEW)).toEqual([]);
      const r = route(BDC, deployment, NEW);
      expect(r.recommendedRoute).toBe('In-App (ABAP Cloud)');
      expect(r.rationale).toContain('The BDC screen automation (1');
      expect(r.rationale).toMatch(/replaced on-stack by the released API of the same business object/);
      expect(r.rationale).toMatch(/influence request to SAP/);
      // A wrapper needs an unreleased API to wrap — only outside the Public Edition.
      if (deployment === 'private') expect(r.rationale).toMatch(/wrapper around the classic API/);
      else expect(r.rationale).toMatch(/offers no classic API to wrap/);
      expect(r.rationale).not.toMatch(/which is a side-by-side integration/);
    });

    test(`native SQL stays on-stack as ABAP SQL / CDS — ${deployment}`, () => {
      expect(driversOf(NATIVE, deployment, OLD)).toContain('native-sql');
      expect(driversOf(NATIVE, deployment, NEW)).toEqual([]);
      const r = route(NATIVE, deployment, NEW);
      expect(r.recommendedRoute).toBe('In-App (ABAP Cloud)');
      expect(r.rationale).toMatch(/rewritten on-stack in ABAP SQL against released CDS views/);
      expect(r.rationale).not.toMatch(/moved to a decoupled service/);
      expect(r.checkpoints[2].evaluation).toMatch(/^Partial compatibility\..*native SQL/);
    });

    test(`an RFC call to another system still routes Side-by-Side — ${deployment}`, () => {
      for (const code of [RFC_OUT, RFC_VAR]) {
        expect(driversOf(code, deployment, NEW)).toEqual(['rfc-call']);
        expect(route(code, deployment, NEW).recommendedRoute).toBe('Side-by-Side (SAP BTP)');
        expect(route(code, deployment, NEW).rationale).toMatch(/^RFC integrations are present\./);
      }
    });

    test(`a local RFC call stays on-stack — ${deployment}`, () => {
      for (const code of [RFC_NONE, RFC_GROUP]) {
        expect(driversOf(code, deployment, OLD)).toEqual(['rfc-call']);
        expect(driversOf(code, deployment, NEW)).toEqual([]);
        const r = route(code, deployment, NEW);
        expect(r.recommendedRoute).toBe('In-App (ABAP Cloud)');
        expect(r.assumptions.join('\n')).not.toMatch(/RFC destinations are not yet migrated/);
      }
    });

    // The evidence of a 3.0.12 run carries no `rfc-call` finding for a local
    // destination at all (`rfcDestinationOf`, the RFC detector of the DSAG
    // review), so the router's own reading of a local `rfc-call` is checked
    // here on an engine-3.0.11 finding handed to the 3.0.12 router — the
    // router unit, not a pair a run signs.
    test(`the router reads an rfc-call finding with a local destination as staying in this system — ${deployment}`, () => {
      const routed = (code: string) =>
        routeExtensibility(buildAbapEvidence(code, 'z.abap', deployment, undefined, OLD), deployment, NEW);
      for (const code of [RFC_NONE, RFC_GROUP]) {
        const r = routed(code);
        expect(r.recommendedRoute).toBe('In-App (ABAP Cloud)');
        expect(r.rationale).toMatch(/stay in this system \(1×/);
      }
      expect(routed(RFC_GROUP).rationale).toMatch(/CL_ABAP_PARALLEL/);
      expect(routed(RFC_NONE).rationale).not.toMatch(/CL_ABAP_PARALLEL/);
    });
  }

  test('where an RFC call goes is read off the statement', () => {
    const target = (snippet: string | null) => rfcCallTarget({ snippet });
    expect(target("CALL FUNCTION 'X' DESTINATION 'NONE'.")).toBe('local');
    expect(target("CALL FUNCTION 'X' DESTINATION 'none'.")).toBe('local');
    expect(target("CALL FUNCTION 'X' STARTING NEW TASK 'T1' DESTINATION IN GROUP DEFAULT.")).toBe('local');
    expect(target("CALL FUNCTION 'X' STARTING NEW TASK 'T1' DESTINATION IN GROUP p_grp.")).toBe('local');
    // A parameter named DESTINATION is not the addition: the call itself is local.
    expect(target("CALL FUNCTION 'RFC_CONNECTION_CLOSE' EXPORTING destination = lv_dest.")).toBe('local');
    expect(target("CALL FUNCTION 'X' DESTINATION 'ERP_PRD'.")).toBe('outbound');
    expect(target("CALL FUNCTION 'X' DESTINATION 'BACK'.")).toBe('outbound');
    expect(target("CALL FUNCTION 'X' DESTINATION lv_dest.")).toBe('outbound');
    expect(target("CALL FUNCTION 'X' DESTINATION ls_cust-rfcdest.")).toBe('outbound');
    // No statement to read: the rule every RFC had before 3.0.12.
    expect(target(null)).toBe('outbound');
    // A findings row carries the answer instead of the statement.
    expect(rfcCallTarget({ rfcTarget: 'local' })).toBe('local');
  });

  test('a parameter named DESTINATION is no route driver', () => {
    expect(driversOf(RFC_PARAM, 'private', NEW)).toEqual([]);
  });

  test('BDC next to an outbound RFC: the RFC chooses the route, the BDC sentence says what replaces it', () => {
    const code = `${BDC}\nCALL FUNCTION 'Z_REMOTE' DESTINATION 'SOMESYS'.`;
    const r = route(code, 'private', NEW);
    expect(r.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    expect(driversOf(code, 'private', NEW)).toEqual(['rfc-call']);
    expect(r.rationale).toMatch(/^RFC integrations are present\./);
    expect(r.rationale).toContain('The BDC screen automation (1');
    expect(r.evidenceCounts.supportingFindings).toBe(1);
  });

  test('a run signed before 3.0.12 recomputes to the route and words it signed', () => {
    const r = route(BDC, 'private', OLD);
    expect(r.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
    expect(r.rationale).toBe('Detected 1 BDC screen automation(s) (CALL TRANSACTION). Screen automation depends on SAP GUI dynpros that carry no stability contract; it has to be replaced by a released API, which is a side-by-side integration where none exists on-stack.');
    expect(r.checkpoints.map((c) => c.checkpointName)).toContain('In-App Developer Extensibility (Tier 1)');
  });
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
