import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { atcQualityGate, isSecurityFinding } from '../lib/abap/atc-quality-gate';
import type { AtcFinding } from '../lib/abap/atc-model';

/**
 * DSAG guideline review B10 (owner 13.10.2026): when an ATC import is joined,
 * legacy findings may be baselined, security findings never.
 * DSAG ABAP guideline: application-lifecycle-management/ensuring-quality.md § Quality Gates im Release-Prozess
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const f = (over: Partial<AtcFinding>): AtcFinding => ({ objectName: 'ZREPORT', message: 'Unused variable LV_X', priority: 'info', ...over });

test.describe('ATC quality gate', () => {
  test('a security finding is never baselined; the rest may be', () => {
    const gate = atcQualityGate({
      findings: [
        f({}),
        f({ message: 'Performance: SELECT in loop', priority: 'warning' }),
        f({ checkTitle: 'Security: potential SQL injection', message: 'Dynamic WHERE from input', priority: 'error' }),
        f({ message: 'Directory traversal in OPEN DATASET', priority: 'error' }),
        f({ checkId: 'CL_CI_TEST_FOO', message: 'Missing AUTHORITY-CHECK before CALL TRANSACTION', priority: 'error' }),
      ],
    });
    expect(gate.baseline.map((x) => x.message)).toEqual(['Unused variable LV_X', 'Performance: SELECT in loop']);
    expect(gate.securityOpen).toHaveLength(3);
    expect(gate.state).toBe('holds');
  });

  test('an exemption in ATC keeps a security finding out of the open list — and out of the baseline', () => {
    const exempted = f({ message: 'Hard-coded password in source', priority: 'error', exempted: true });
    const gate = atcQualityGate({ findings: [exempted, f({})] });
    expect(gate.securityOpen).toHaveLength(0);
    expect(gate.securityExempted).toEqual([exempted]);
    expect(gate.baseline).not.toContain(exempted);
    // The legacy finding beside it waits for a person (QA 5a559787: f45d35bb0e72).
    expect(gate.state).toBe('unreviewed');
    expect(atcQualityGate({ findings: [exempted] }).state).toBe('no-open-security');
  });

  test('a finding our words miss is never cleared by the gate alone (QA 5a559787: f45d35bb0e72)', () => {
    const payroll = f({ checkId: 'Z_HR_007', checkTitle: 'Payroll export', message: 'Employee salary table written to a public spool', priority: 'error' });
    expect(isSecurityFinding(payroll)).toBe(false);
    const gate = atcQualityGate({ findings: [payroll] });
    expect(gate.baseline).toEqual([payroll]);
    expect(gate.state).toBe('unreviewed');
    expect(gate.state).not.toBe('no-open-security');
    expect(atcQualityGate({ findings: [] }).state).toBe('no-open-security');
  });

  test('an exempted legacy finding is still baseline, and nothing is lost or counted twice', () => {
    const findings = [f({ exempted: true }), f({ message: 'Cross-site scripting in BSP' }), f({ message: 'Obsolete statement MOVE' })];
    const gate = atcQualityGate({ findings });
    expect(gate.baseline.length + gate.securityOpen.length + gate.securityExempted.length).toBe(findings.length);
    expect(isSecurityFinding(findings[1])).toBe(true);
    expect(isSecurityFinding(findings[2])).toBe(false);
  });

  test('a credential or encryption finding under a customer check id is a security finding (QA 03501b79: a7381891b061)', () => {
    const plain = f({ checkId: 'Z_ATC_042', checkTitle: 'Plain-text password in custom configuration', message: 'Password is stored without encryption', priority: 'error' });
    const gate = atcQualityGate({ findings: [plain] });
    expect(gate.securityOpen).toEqual([plain]);
    expect(gate.baseline).toEqual([]);
    for (const message of [
      'Credentials written to the application log',
      'Secret key held in a constant',
      'Data sent unencrypted over HTTP',
      'Sensitive personal data written to the spool',
      'Privilege escalation through SUBMIT',
      'Missing permission check before update',
    ]) expect(isSecurityFinding(f({ message })), message).toBe(true);
  });

  test('the panel shows the gate, names the reading as ours, and claims no pass', () => {
    const src = read('components/analyze/AtcFindingsPanel.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\s+/g, ' ');
    expect(src).toContain('<AtcQualityGateNote gate={gate} />');
    expect(src).toMatch(/never baselined/);
    expect(src).toMatch(/our reading of ATC&apos;s check name and message/);
    expect(src).toMatch(/not a security sign-off/);
    // The reading goes by words and can miss one: the baseline waits for a person (QA 03501b79: a7381891b061).
    expect(src).toMatch(/the reading goes by words, so it can miss one/);
    expect(src).toMatch(/once a person has checked that none of them is a security finding/);
    expect(src).toMatch(/gate\.state === 'unreviewed' \? ' Until then the gate is not cleared, and this screen does not clear it/);
    expect(src).not.toMatch(/passed ATC|ATC found no issues|security verified/i);
  });
});
