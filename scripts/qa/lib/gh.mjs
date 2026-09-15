import { execFileSync } from 'node:child_process';

/**
 * The GitHub CLI, read-only. The token it runs with in CI has `contents: read`
 * and `actions: read` and nothing else, so even a wrong argument here cannot
 * write to the repository.
 */

export function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

export function ghJson(args) {
  return JSON.parse(gh(args) || 'null');
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The newest run of `workflow` for exactly this commit, or null while none has been created yet. */
export function runFor(workflow, sha) {
  const runs = ghJson(['run', 'list', '--workflow', workflow, '--commit', sha, '--limit', '5', '--json', 'databaseId,status,conclusion,createdAt,event']) || [];
  return runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

export function jobsOf(runId) {
  return (ghJson(['run', 'view', String(runId), '--json', 'jobs'])?.jobs || []).map((j) => ({ name: j.name, conclusion: j.conclusion || j.status }));
}

/** Poll until the run for `sha` has completed or the deadline passes. */
export async function waitForRun(workflow, sha, { timeoutMs, intervalMs = 30_000, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = runFor(workflow, sha);
    if (run?.status === 'completed') return run;
    if (Date.now() > deadline) return run ? { ...run, timedOut: true } : null;
    onTick?.(run);
    await sleep(intervalMs);
  }
}
