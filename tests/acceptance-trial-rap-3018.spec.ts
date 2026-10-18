import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseArgs, runTrialStage, toMarkdown, trialPackagesFrom, type SuiteReport } from '../scripts/acceptance/suite';
import {
  keptRapPackages,
  parseActivation,
  parsePull,
  parseUnit,
  pushProblems,
  trialMarkdown,
  trialRapPackage,
  trialTotals,
  type ActivationOutcome,
  type TrialRunner,
  type TrialTarget,
  type UnitOutcome,
} from '../scripts/acceptance/trial-rap';

/**
 * Roadmap 3.0.18 item 13: the ADT trial runner joins the acceptance suite — every RAP package the suite kept is pushed
 * to its trial repository, pulled into its original package, activated and run in ABAP Unit, and the numbers land in
 * the report. Server-free: the runner is a mock that answers in the words of `adt.mjs`; no SAP, no Git, no network.
 */

/** What `adt.mjs unit` prints (its own format, 18.10.2026). */
const UNIT_OUT = [
  'green   LTC_ENGINE_CASES=>TC_ENG_G12',
  'skipped LTC_GOLDEN_MASTER=>CASE_01  — warning/tolerable: case 1: no expected result of the original on record - not compared',
  'green   LTC_GOLDEN_MASTER=>BASELINE',
  "red     LTCL_TEST=>TEST_SLOT_OVERLAP  — failedAssertion/critical: Expected [2] Actual [0]",
  'green   LTCL_TEST=>TEST_EMPTY_PLAN',
  '',
  'ABAP Unit ZCL_PM_SHUTDOWN_LOGIC: 3 green, 1 red, 1 skipped, 5 methods',
].join('\n');

function keptPackage(root: string, name: string, opts: { longLine?: boolean } = {}): string {
  const dir = path.join(root, 'packages', name);
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.abapgit.xml'), '<asx:abap/>');
  fs.writeFileSync(path.join(dir, 'src', 'package.devc.xml'), '<x/>');
  for (const f of ['zcl_pm_shutdown_logic.clas.abap', 'zcl_pm_shutdown_logic.clas.xml', 'zif_pm_shutdown_access.intf.abap', 'zcl_pm_shutdown_access.clas.abap']) {
    fs.writeFileSync(path.join(dir, 'src', f), opts.longLine && f.endsWith('logic.clas.abap') ? `* ${'x'.repeat(300)}\n` : '* ok\n');
  }
  fs.writeFileSync(path.join(dir, 'src', 'zcl_pm_shutdown_logic.clas.testclasses.abap'), '* tests\n');
  return dir;
}

interface MockLog {
  calls: string[];
}

function mockRunner(log: MockLog, answers: { activations?: ActivationOutcome[]; unit?: UnitOutcome; pushOk?: boolean } = {}): TrialRunner {
  const activations = [...(answers.activations ?? [parseActivation('activating 11: ZCL_PM_SHUTDOWN_LOGIC, ZIF_PM_SHUTDOWN_ACCESS\nactivation: success\n')])];
  return {
    push(pkgDir, target: TrialTarget, label) {
      log.calls.push(`push ${path.basename(pkgDir)} ${target.repo} ${label}`);
      const problems = pushProblems(pkgDir);
      if (answers.pushOk === false || problems.length) return { ok: false, reason: problems.join('; ') || 'denied' };
      return { ok: true, reason: null };
    },
    pull(pkg) {
      log.calls.push(`pull ${pkg}`);
      return parsePull('\rR running        \rS Pull finished        \n(see the import log in the abapGit view for per-object messages)\n');
    },
    activate(part) {
      log.calls.push(`activate ${part}`);
      return activations.shift() ?? parseActivation('no inactive object containing X\n');
    },
    unit(cls) {
      log.calls.push(`unit ${cls}`);
      return answers.unit ?? parseUnit(UNIT_OUT);
    },
  };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cc-trial-'));

test.describe('the trial stage of the acceptance suite', () => {
  test('the output of adt.mjs: pull status, activation, ABAP Unit per test class', () => {
    expect(parsePull('\rR running   \rE Pull finished with errors   \n(see the import log in the abapGit view)\n')).toEqual({ ok: true, status: 'E', text: 'Pull finished with errors' });
    const a = parseActivation(
      'activating 3: ZCL_A, ZIF_A, ZCX_A\nactivation: FAILED\n  E ZCL_A Type "TT_CSV" is unknown /sap/bc/adt/oo/classes/zcl_a\n  W ZIF_A unused\nstill inactive: ZCL_A\n',
    );
    expect(a).toMatchObject({ activated: 3, success: false, warnings: 1, stillInactive: ['ZCL_A'] });
    expect(a.errors).toEqual(['ZCL_A Type "TT_CSV" is unknown /sap/bc/adt/oo/classes/zcl_a']);
    const u = parseUnit(UNIT_OUT);
    expect(u.methods).toHaveLength(5);
    expect(u.methods[3]).toEqual({ kind: 'red', testClass: 'ltcl_test', method: 'test_slot_overlap', message: 'failedAssertion/critical: Expected [2] Actual [0]' });
  });

  test('a kept package: pushed, pulled into its original package, activated, and ABAP Unit counted — engine apart from the model', () => {
    const root = tmp();
    try {
      const dir = keptPackage(root, 'pm-shutdown-slot-plan-rap-1');
      const log: MockLog = { calls: [] };
      const r = trialRapPackage(dir, 'pm-shutdown-slot-plan', 1, mockRunner(log), { label: 'acceptance package (test)' });
      expect(log.calls).toEqual([
        'push pm-shutdown-slot-plan-rap-1 ccio-trial-pm acceptance package (test)',
        // abapGit cannot move an object between packages: the original package of the 3.0.17 acceptance.
        'pull ZCCIO_SF_PM',
        'activate PM_SHUTDOWN',
        'unit ZCL_PM_SHUTDOWN_LOGIC',
      ]);
      expect(r.state).toBe('ran');
      expect(r.objects).toBe(3);
      expect(r.pull).toMatchObject({ status: 'S' });
      expect(r.activation).toMatchObject({ passes: 1, activated: 11, errors: 0 });
      // C(7): the engine's classes count; the model's class is a proposal and is counted apart.
      expect(r.engineUnit).toEqual({ green: 2, red: 0, skipped: 1 });
      expect(r.modelUnit).toEqual({ green: 1, red: 1, skipped: 0 });
      expect(r.red).toEqual(['model proposal, red in SAP: ltcl_test=>test_slot_overlap — failedAssertion/critical: Expected [2] Actual [0]']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('what the first activation leaves inactive gets a second pass; activation errors are recorded with their text', () => {
    const root = tmp();
    try {
      const dir = keptPackage(root, 'qm-inspection-evidence-rap-1');
      const log: MockLog = { calls: [] };
      const first = parseActivation('activating 11: ZCL_PM_SHUTDOWN_LOGIC\nactivation: FAILED\n  E ZIF_PM_SHUTDOWN_ACCESS dependency not active\nstill inactive: ZCL_PM_SHUTDOWN_LOGIC\n');
      const second = parseActivation('activating 1: ZCL_PM_SHUTDOWN_LOGIC\nactivation: success\n');
      const r = trialRapPackage(dir, 'qm-inspection-evidence', 1, mockRunner(log, { activations: [first, second] }), { label: 'x' });
      expect(log.calls.filter((c) => c.startsWith('activate'))).toHaveLength(2);
      expect(r.activation).toMatchObject({ passes: 2, activated: 12, errors: 0, stillInactive: [] });
      const stuck = trialRapPackage(dir, 'qm-inspection-evidence', 1, mockRunner(log, { activations: [first, first] }), { label: 'x' });
      expect(stuck.activation).toMatchObject({ passes: 2, errors: 1, stillInactive: ['ZCL_PM_SHUTDOWN_LOGIC'], messages: ['ZIF_PM_SHUTDOWN_ACCESS dependency not active'] });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('a program without a trial target is not run, with its reason; a line SAP refuses stops the push before it', () => {
    const root = tmp();
    try {
      const log: MockLog = { calls: [] };
      const fi = trialRapPackage(keptPackage(root, 'fi-journal-review-rap-1'), 'fi-journal-review', 1, mockRunner(log), { label: 'x' });
      expect(fi.state).toBe('not-run');
      expect(fi.reason).toMatch(/shows every import to all trial users/);
      const other = trialRapPackage(keptPackage(root, 'po-mm-po-approval-rap-1'), 'po-mm-po-approval', 1, mockRunner(log), { label: 'x' });
      expect(other.reason).toMatch(/no trial package and repository for po-mm-po-approval/);
      expect(log.calls).toEqual([]);
      const long = trialRapPackage(keptPackage(root, 'sd-return-credit-recon-rap-1', { longLine: true }), 'sd-return-credit-recon', 1, mockRunner(log), { label: 'x' });
      expect(long.state).toBe('failed');
      expect(long.reason).toMatch(/push to ccio-trial-sd failed: line over 255 characters: zcl_pm_shutdown_logic\.clas\.abap:1/);
      expect(log.calls.some((c) => c.startsWith('pull'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('the stage over a run folder: every kept RAP package, the Node ones left alone; totals and the report section', () => {
    const root = tmp();
    try {
      keptPackage(root, 'pm-shutdown-slot-plan-rap-1');
      keptPackage(root, 'qm-inspection-evidence-rap-1');
      fs.mkdirSync(path.join(root, 'packages', 'pm-shutdown-slot-plan-node-1'), { recursive: true });
      expect(keptRapPackages(path.join(root, 'packages')).map((p) => p.program)).toEqual(['pm-shutdown-slot-plan', 'qm-inspection-evidence']);
      expect(trialPackagesFrom([root]).map((p) => `${p.program}#${p.run}`)).toEqual(['pm-shutdown-slot-plan#1', 'qm-inspection-evidence#1']);
      expect(trialPackagesFrom([path.join(root, 'packages', 'qm-inspection-evidence-rap-1')]).map((p) => p.program)).toEqual(['qm-inspection-evidence']);
      const log: MockLog = { calls: [] };
      const records = runTrialStage(trialPackagesFrom([root]), mockRunner(log, { activations: [parseActivation('activating 11: A\nactivation: success\n'), parseActivation('activating 9: B\nactivation: success\n')] }), 'x');
      expect(trialTotals(records)).toEqual({ packages: 2, ran: 2, activated: 20, activationErrors: 0, engine: { green: 4, red: 0, skipped: 2 }, model: { green: 2, red: 2, skipped: 0 } });
      const md = trialMarkdown(records).join('\n');
      expect(md).toContain('## On the SAP trial (ADT runner)');
      expect(md).toContain('ABAP Unit, engine classes (counted, C(7)): 4 green, 0 red, 2 skipped');
      expect(md).toContain("the testing model's classes (a proposal, not evidence): 2 green, 2 red, 0 skipped");
      expect(md).toContain('- pm-shutdown-slot-plan: model proposal, red in SAP: ltcl_test=>test_slot_overlap');
      // In the suite's report, after the rest.
      const report = { runs: [], rows: [], totals: { rows: 0, gatePassed: 0, functionsWritten: 0, functionsTotal: 0, scenariosMatched: 0, scenariosTotal: 0, calls: 0, usd: 0, durationMs: 0 }, limits: [], diff: null, previous: null, commit: 'abcdef12', mode: 'dry', model: 'm', startedAt: 't', node: 'v', capUsd: 1, spentUsd: 0, capReached: false, runsPerProgram: 1, dirty: false, trial: records } as unknown as SuiteReport;
      expect(toMarkdown(report)).toContain('## On the SAP trial (ADT runner)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('--trial-rap needs the kept packages; the runner folder and owner can be named', () => {
    expect(() => parseArgs(['--trial-rap'], {})).toThrow(/--keep-packages/);
    const a = parseArgs(['--trial-rap', '--keep-packages', '--trial-runner', 'r', '--trial-owner', 'someone'], {});
    expect(a.trialRap).toBe(true);
    expect(a.trialRunner).toBe(path.resolve('r'));
    expect(a.trialOwner).toBe('someone');
    expect(parseArgs([], { CCIO_ADT_RUNNER: 'C:/x/adt-runner' }).trialRunner).toBe('C:/x/adt-runner');
    expect(parseArgs(['--trial-from', 'a,b'], {}).trialFrom).toEqual([path.resolve('a'), path.resolve('b')]);
  });
});
