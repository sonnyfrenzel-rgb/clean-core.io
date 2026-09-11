import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { renderSecurityAlert, failedJobsFrom } from '../lib/security-alert-email';

/**
 * A red scheduled Security CI run reaches the admin (backlog, 10 Sept; decided
 * 11 Sept: mail, not a GitHub issue).
 *
 * On 7 September the Monday run went red on six High advisories and stayed red
 * for three days while a critical Next.js advisory ran in production. A
 * scheduled run that fails tells no one, and nobody pushed that week.
 *
 * Mail because the repository is public: an issue would announce the open
 * window to everyone before the admin had read it.
 */
const ROOT = path.resolve(__dirname, '..');
const workflow = () => fs.readFileSync(path.resolve(ROOT, '.github/workflows/security-ci.yml'), 'utf8');

test.describe('the workflow', () => {
  test('mails on a red scheduled run, after all three gates', () => {
    const wf = workflow();
    const job = wf.slice(wf.indexOf('  alert-admin:'));
    expect(job, 'no alert-admin job').not.toBe('');
    expect(job).toMatch(/needs:\s*\[secret-scan,\s*dependency-audit,\s*sbom\]/);
    expect(job).toContain("github.event_name == 'schedule'");
    expect(job).toContain("contains(needs.*.result, 'failure')");
    // `always()`: without it a failed dependency skips this job instead of running it.
    expect(job).toContain('always()');
    expect(job).toContain('scripts/send-security-alert.ts --apply');
    expect(job).toContain('RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}');
  });

  test('never announces it in a public issue', () => {
    expect(workflow()).not.toMatch(/gh issue (create|comment)/);
    expect(workflow()).not.toMatch(/issues:\s*write/);
  });

  test('context reaches the script as environment, not as shell text', () => {
    const job = workflow().slice(workflow().indexOf('  alert-admin:'));
    const run = job.slice(job.indexOf('run: npx tsx'));
    expect(run.split('\n')[0]).not.toContain('${{');
  });
});

test.describe('the mail', () => {
  const NEEDS = JSON.stringify({
    'secret-scan': { result: 'success', outputs: {} },
    'dependency-audit': { result: 'failure', outputs: {} },
    sbom: { result: 'cancelled', outputs: {} },
  });

  test('names the failed jobs as GitHub shows them, and only the failed ones', () => {
    expect(failedJobsFrom(NEEDS)).toEqual(['Dependency audit (npm audit)']);
    expect(failedJobsFrom('not json')).toEqual([]);
    expect(failedJobsFrom(undefined)).toEqual([]);
  });

  test('says what failed, what it means and where the run is', () => {
    const m = renderSecurityAlert({
      failedJobs: failedJobsFrom(NEEDS),
      runUrl: 'https://github.com/o/r/actions/runs/42',
      runStartedAt: '2026-09-14T06:03:00Z',
    });
    expect(m.subject).toBe('Security CI is red — scheduled run of 2026-09-14');
    expect(m.text).toContain('Dependency audit (npm audit): A High or Critical advisory');
    expect(m.text).toContain('https://github.com/o/r/actions/runs/42');
    expect(m.text).toContain('\n\nFailed:\n');
    expect(m.html).toContain('href="https://github.com/o/r/actions/runs/42"');
  });

  test('a test run says so in the subject and the body', () => {
    const m = renderSecurityAlert({ failedJobs: [], runUrl: 'u', runStartedAt: '2026-09-11T12:00:00Z', test: true });
    expect(m.subject.startsWith('[TEST] ')).toBe(true);
    expect(m.text).toMatch(/^TEST — this is a manual check/);
    expect(m.html).toContain('<strong>TEST</strong>');
  });

  test('nothing from the run context is rendered as markup', () => {
    const m = renderSecurityAlert({ failedJobs: ['<img src=x onerror=alert(1)>'], runUrl: '"><script>', runStartedAt: '2026-09-11' });
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).not.toContain('"><script>');
    expect(m.html).toContain('&lt;img src=x');
  });
});
