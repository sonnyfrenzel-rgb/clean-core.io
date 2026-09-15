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

/**
 * The artifact `<prefix>-<sha>-<attempt>` of the latest attempt that produced
 * one. A re-run of only a later job adds an attempt without a new artifact, so
 * the newest attempt is not always the one — and a download timestamp never is.
 */
export function latestArtifact(names, prefix, sha) {
  const re = new RegExp(`^${prefix}-${String(sha).replace(/[^0-9a-f]/g, '')}-(\\d+)$`);
  return (
    names
      .map((name) => ({ name, attempt: Number(re.exec(name)?.[1]) }))
      .filter((a) => a.attempt > 0)
      .sort((a, b) => b.attempt - a.attempt)[0]?.name || null
  );
}

/** Names of the unexpired artifacts of a run. */
export const artifactNames = (runId) => ghJson(['api', `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`, '--jq', '[.artifacts[] | select(.expired == false) | .name]']) || [];

/**
 * The newest run of `workflow` for exactly this commit, or null while none has been created yet.
 *
 * `branch` matters once a commit reaches `main`: it then has a run on `dev` and one on `main`, and the newest
 * of the two is not the one a caller waiting for the other asked about.
 */
export function runFor(workflow, sha, branch = null) {
  const args = ['run', 'list', '--workflow', workflow, '--commit', sha, '--limit', '5', '--json', 'databaseId,headSha,status,conclusion,createdAt,event'];
  if (branch) args.push('--branch', branch);
  const runs = ghJson(args) || [];
  return runs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
}

export function jobsOf(runId) {
  return (ghJson(['run', 'view', String(runId), '--json', 'jobs'])?.jobs || []).map((j) => ({ name: j.name, conclusion: j.conclusion || j.status }));
}

/** Poll until the run for `sha` has completed or the deadline passes. */
export async function waitForRun(workflow, sha, { timeoutMs, intervalMs = 30_000, onTick, branch = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = runFor(workflow, sha, branch);
    if (run?.status === 'completed') return run;
    if (Date.now() > deadline) return run ? { ...run, timedOut: true } : null;
    onTick?.(run);
    await sleep(intervalMs);
  }
}
