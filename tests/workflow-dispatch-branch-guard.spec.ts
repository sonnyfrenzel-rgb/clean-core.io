import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A workflow anyone with write access can start by hand runs the code of whatever branch it is started on. Where
 * that run pushes a bot branch or gets a cloud identity, the job is held to the default branch, the way
 * engine-release-capture.yml has always done it.
 */
const DIR = path.resolve(__dirname, '..', '.github', 'workflows');
const HELD = ['sync-catalog.yml', 'sync-architecture-center.yml', 'sync-dsag-guide.yml', 'sync-sap-identifiers.yml', 'sync-sap-references.yml', 'usage-report.yml', 'engine-release-capture.yml'];

/** The top-level jobs of a workflow file, each with its own text. */
function jobsOf(text: string): Array<{ name: string; body: string }> {
  const at = text.search(/^jobs:\s*$/m);
  const lines = text.slice(at).split(/\r?\n/).slice(1);
  const jobs: Array<{ name: string; body: string }> = [];
  for (const line of lines) {
    const head = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (head) jobs.push({ name: head[1], body: '' });
    else if (jobs.length && (line.startsWith('    ') || line.trim() === '')) jobs[jobs.length - 1].body += `${line}\n`;
    else if (/^\S/.test(line)) break;
  }
  return jobs;
}

test('every hand-startable job that pushes or takes a cloud identity runs only on main', () => {
  for (const file of HELD) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    expect(text, file).toMatch(/workflow_dispatch/);
    const jobs = jobsOf(text);
    expect(jobs.length, file).toBeGreaterThan(0);
    for (const job of jobs) {
      const own = /^ {4}if:.*github\.ref == 'refs\/heads\/main'/m.test(job.body);
      // A job that needs a held job is skipped with it.
      const needs = job.body.match(/^ {4}needs:\s*\[?([A-Za-z0-9_, -]+)\]?\s*$/m)?.[1].split(',').map((s) => s.trim()) ?? [];
      const inherited = needs.some((n) => /^ {4}if:.*github\.ref == 'refs\/heads\/main'/m.test(jobs.find((j) => j.name === n)?.body ?? ''));
      expect(own || inherited, `${file} job ${job.name} is not held to main`).toBe(true);
    }
  }
});

test('the list covers every dispatchable workflow that writes to the repository or asks for an ID token', () => {
  const ON_PURPOSE = new Set([
    // Deploys dev and main by branch; its own spec holds the branch mapping.
    'deploy.yml',
    // Read-only agents and checks, started by hand on main by convention; they write no branch.
    'qa-review.yml', 'qa-weekly-health.yml', 'security-audit.yml', 'security-ci.yml', 'ux-review.yml',
  ]);
  for (const file of fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const text = fs.readFileSync(path.join(DIR, file), 'utf8');
    if (!/workflow_dispatch/.test(text) || ON_PURPOSE.has(file)) continue;
    if (/contents:\s*write|id-token:\s*write/.test(text)) expect(HELD, file).toContain(file);
  }
});
