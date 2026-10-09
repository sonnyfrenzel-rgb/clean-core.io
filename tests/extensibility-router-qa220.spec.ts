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

test('b0bad443beaa — a classic enhancement or a dynpro is not rated "Highly Compatible" with ABAP Cloud (QA full review of 69b4f522e5ea)', () => {
  const ENHANCEMENT = 'REPORT zcc_enh.\nENHANCEMENT 1 zenh_order.\n  lv_x = 1.\nENDENHANCEMENT.';
  const DYNPRO = 'REPORT zcc_dyn.\nCALL SCREEN 100.';
  for (const code of [ENHANCEMENT, DYNPRO]) {
    const report = route(code, 'private');
    expect(report.recommendedRoute, `${code}: the route stays on-stack`).toBe('In-App (ABAP Cloud)');
    expect(report.comparativeAnalysis.inAppABAPCloud.technicalFeasibility, code).toBe('Partially Compatible');
    expect(report.comparativeAnalysis.inAppABAPCloud.fitDetails, code).not.toMatch(/excellent fit/i);
    expect(checkpoint(report, 'In-App Developer').evaluation, code).not.toMatch(/^High compatibility|Standard reads/);
    expect(checkpoint(report, 'Side-by-Side').evaluation, code).not.toMatch(/Simple reads/);
  }
});

test('00b028c43e63 — a program whose only construct is COMMIT WORK is not rated "High compatibility" with ABAP Cloud', () => {
  const COMMIT_ONLY = 'REPORT zcc_commit.\nCOMMIT WORK.';
  for (const deployment of ['private', 'public'] as const) {
    const report = route(COMMIT_ONLY, deployment);
    expect(buildAbapEvidence(COMMIT_ONLY, 'zcc_qa220.abap', deployment).findings.map((f) => f.kind), 'the premise: the commit is the only finding').toEqual(['commit-work']);
    expect(report.recommendedRoute, `${deployment}: a commit forces no side-by-side split`).toBe('In-App (ABAP Cloud)');
    const inApp = checkpoint(report, 'In-App Developer');
    expect(inApp.evaluation, deployment).not.toMatch(/^High compatibility|Standard reads/);
    expect(inApp.evaluation, 'it names the remedy').toMatch(/RAP save sequence/);
    expect(report.comparativeAnalysis.inAppABAPCloud.technicalFeasibility, deployment).toBe('Partially Compatible');
    expect(report.comparativeAnalysis.inAppABAPCloud.fitDetails, deployment).not.toMatch(/excellent fit/i);
    expect(checkpoint(report, 'Side-by-Side').evaluation, deployment).not.toMatch(/Simple reads/);
    expect(report.rationale, 'the rationale says how it is addressed on-stack').toMatch(/RAP save sequence/);
  }
  // A program without a commit keeps the sentence out of its report.
  expect(route(READ_ONLY).rationale).not.toMatch(/COMMIT WORK/);
});
