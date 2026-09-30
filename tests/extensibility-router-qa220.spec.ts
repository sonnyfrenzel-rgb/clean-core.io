/**
 * The router's checkpoints and tracks say only what the evidence carries.
 *
 * QA full review of v2.20.0 (fc787674705f):
 *   1d5ab9d90793 — a finding count read as proof of Key User feasibility;
 *   c658f64f147e — "Safe upgrades guaranteed" as fixed text;
 *   e08f739fe79e — a Private Edition write to SAP's rows rated "High compatibility";
 *   2b515958f925 — any side-by-side trigger read as "Perfect fit" for CAP persistence.
 *
 * Serverless: pure functions over text.
 */
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';

const route = (code: string, deployment: 'public' | 'private' = 'private') =>
  routeExtensibility(buildAbapEvidence(code, 'zcc_qa220.abap', deployment), deployment);

const checkpoint = (report: ReturnType<typeof route>, name: string) =>
  report.checkpoints.find((c) => c.checkpointName.includes(name))!;

const READ_ONLY = 'REPORT zcc_read.\nSELECT * FROM vbak INTO TABLE @DATA(lt).';
const STANDARD_WRITE = 'REPORT zcc_write.\nUPDATE vbak SET netwr = 0 WHERE vbeln = lv_vbeln.';
const RFC = "REPORT zcc_rfc.\nCALL FUNCTION 'Z_REMOTE' DESTINATION 'NONE'.";

test('1d5ab9d90793 — the Key User checkpoint does not grade feasibility from a count', () => {
  for (const code of [READ_ONLY, STANDARD_WRITE, RFC]) {
    const keyUser = checkpoint(route(code), 'Key User');
    expect(keyUser.evaluation, code).not.toMatch(/Highly feasible|Trivial extension|^Infeasible/);
    expect(keyUser.evaluation, 'and it says what it did not assess').toMatch(/not assessed/i);
    expect(keyUser.resultState, 'a count is not a preference').toBe('Neutral');
  }
});

test('c658f64f147e — no checkpoint impact states a guarantee about the analysed code', () => {
  for (const code of [READ_ONLY, STANDARD_WRITE, RFC]) {
    for (const c of route(code).checkpoints) {
      expect(c.cleanCoreImpact, `${c.checkpointName}: ${code}`).not.toMatch(
        /guaranteed|Maximum upgrade safety|^Clean core compliant/i,
      );
    }
  }
});

test('e08f739fe79e — a direct write to an SAP table on Private Edition is not "High compatibility"', () => {
  const report = route(STANDARD_WRITE, 'private');
  expect(report.recommendedRoute, 'the route stays on-stack').toBe('In-App (ABAP Cloud)');
  const inApp = checkpoint(report, 'In-App Developer');
  expect(inApp.evaluation).not.toMatch(/^High compatibility/);
  expect(inApp.evaluation).toMatch(/released write API|BAPI|RAP action/);
  expect(report.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).toBe('Partially Compatible');
  expect(report.comparativeAnalysis.inAppABAPCloud.fitDetails).not.toMatch(/excellent fit/i);

  // The rating it had is kept where it was earned.
  const clean = route(READ_ONLY, 'private');
  expect(checkpoint(clean, 'In-App Developer').evaluation).toMatch(/^High compatibility/);
  expect(clean.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).toBe('Highly Compatible');
});

test('2b515958f925 — an RFC call does not make CAP persistence a "perfect fit"', () => {
  const report = route(RFC, 'private');
  expect(report.recommendedRoute).toBe('Side-by-Side (SAP BTP)');
  const fit = report.comparativeAnalysis.sideBySideBTP.fitDetails;
  expect(fit).not.toMatch(/perfect fit|safely isolates/i);
  expect(fit, 'it names what chose the route').toMatch(/RFC/i);
});
