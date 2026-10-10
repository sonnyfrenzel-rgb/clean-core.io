import { execFileSync } from 'node:child_process';

/**
 * The GitHub CLI, read-only. The token it runs with in CI has `contents: read`
 * and `actions: read` and nothing else, so even a wrong argument here cannot
 * write to the repository.
 */

export function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

/**
 * The state of an agent's kill switch, a repository variable such as
 * QA_REVIEW_ENABLED: 'revoked' when it reads `false`, 'on' when it holds
 * anything else or does not exist, and 'unknown' when it could not be read
 * (no network, no gh login, an API error). Callers treat 'unknown' like
 * 'revoked' and stop.
 */
export function killSwitch(name, run = gh) {
  try {
    return run(['variable', 'get', name]) === 'false' ? 'revoked' : 'on';
  } catch (err) {
    const said = `${err?.stderr ?? ''}\n${err?.message ?? ''}`;
    return /variable .* was not found|HTTP 404/i.test(said) ? 'on' : 'unknown';
  }
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

/**
 * The newest completed manual run (workflow_dispatch) on `branch` whose delta-review artifact is named after `sha`,
 * or null. A slice is dispatched on the tip of dev, so its run's own commit is that tip and `runFor` cannot find it;
 * since 10.10.2026 the artifact carries the reviewed head instead (qa-review.yml, review.mjs). A run still in
 * progress has no artifact yet: the caller keeps polling.
 */
export function sliceRunFor(workflow, sha, branch = 'dev', { list = ghJson, names = artifactNames } = {}) {
  const head = String(sha).replace(/[^0-9a-f]/g, '');
  if (head.length !== 40) return null;
  const runs = list(['run', 'list', '--workflow', workflow, '--event', 'workflow_dispatch', '--branch', branch, '--limit', '10', '--json', 'databaseId,headSha,status,conclusion,createdAt,event']) || [];
  const re = new RegExp(`^qa-review-${head}-\\d+$`);
  return (
    runs
      .filter((r) => r.status === 'completed')
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .find((r) => names(r.databaseId).some((n) => re.test(n))) || null
  );
}

export function jobsOf(runId) {
  return (ghJson(['run', 'view', String(runId), '--json', 'jobs'])?.jobs || []).map((j) => ({ name: j.name, conclusion: j.conclusion || j.status }));
}

/** Poll until the run for `sha` has completed or the deadline passes. */
/**
 * Waits until one job of the run — named by prefix — has finished, or the run
 * has. Returns the run as `runFor` sees it, plus `jobDone` with that job's
 * conclusion when it was the job and not the run that ended the wait.
 *
 * The delta review of a push to dev is done a minute or two after the push;
 * the smoke check behind it waits for the Cloud Run deploy, which takes
 * fourteen minutes. Waiting for the whole run meant waiting fourteen minutes
 * for findings that had been sitting in an artifact for twelve of them
 * (Sonny, 16.09.2026).
 */
export async function waitForJob(workflow, sha, jobPrefix, { timeoutMs, intervalMs = 30_000, onTick, branch = null, find = runFor } = {}) {
  const deadline = Date.now() + timeoutMs;
  const ended = new Set(['success', 'failure', 'cancelled', 'skipped']);
  for (;;) {
    const run = find(workflow, sha, branch);
    if (run?.status === 'completed') return run;
    if (run) {
      const job = jobsOf(run.databaseId).find((j) => j.name.startsWith(jobPrefix));
      if (job && ended.has(job.conclusion)) return { ...run, jobDone: job.conclusion };
    }
    if (Date.now() > deadline) return run ? { ...run, timedOut: true } : null;
    onTick?.(run);
    await sleep(intervalMs);
  }
}

export async function waitForRun(workflow, sha, { timeoutMs, intervalMs = 30_000, onTick, branch = null, find = runFor } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const run = find(workflow, sha, branch);
    if (run?.status === 'completed') return run;
    if (Date.now() > deadline) return run ? { ...run, timedOut: true } : null;
    onTick?.(run);
    await sleep(intervalMs);
  }
}
