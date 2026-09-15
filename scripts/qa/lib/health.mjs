import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gh, ghJson } from './gh.mjs';
import { redactSecrets } from './redact.mjs';

/**
 * Weekly pipeline health — the part of QA that nobody pushes: scheduled
 * workflows that went red on a Monday morning, and bot branches holding an
 * update nobody opened.
 *
 * Why it exists: the catalog sync failed on 7 and 14 September because Actions
 * may not open pull requests. The data had synced; the update sat unseen on a
 * branch, and a red scheduled run tells no one.
 *
 * No model, no tokens — only `gh` reads.
 */

const RED = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
const IGNORED_CONCLUSIONS = new Set(['cancelled', 'skipped', 'neutral', '']);
const STALE_AFTER_DAYS = 8;

/** Branches a scheduled bot pushes to instead of opening a pull request. */
export const BOT_BRANCHES = ['chore/sync-cloudification-repo'];

export function workflowFiles(dir = '.github/workflows') {
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8');
      return { file, name: (text.match(/^name:\s*(.+)$/m)?.[1] || file).trim(), scheduled: /^\s*schedule:/m.test(text) };
    });
}

/**
 * The verdict for one workflow from its recent runs (newest first).
 * Red is the newest run that finished with a result; a scheduled workflow whose
 * last scheduled run is older than eight days has stopped running, which is red
 * in a different colour.
 */
export function assess(workflow, runs, now = Date.now()) {
  const finished = runs.filter((r) => r.status === 'completed' && !IGNORED_CONCLUSIONS.has(r.conclusion || ''));
  const latest = finished[0] || null;
  if (!latest) return { ...workflow, state: runs.length ? 'no-result' : 'never-run', latest: null };

  if (RED.has(latest.conclusion)) return { ...workflow, state: 'failing', latest, failingSince: sinceWhenFailing(finished) };

  if (workflow.scheduled) {
    const lastScheduled = runs.find((r) => r.event === 'schedule');
    const age = lastScheduled ? (now - Date.parse(lastScheduled.createdAt)) / 86_400_000 : Infinity;
    if (age > STALE_AFTER_DAYS) return { ...workflow, state: 'stale', latest, lastScheduledAt: lastScheduled?.createdAt || null };
  }
  return { ...workflow, state: 'ok', latest };
}

function sinceWhenFailing(finished) {
  let since = finished[0].createdAt;
  for (const r of finished) {
    if (!RED.has(r.conclusion)) break;
    since = r.createdAt;
  }
  return since;
}

/** The failed job, step and the first error line of a run — redacted, and short. */
export function failureDetail(runId) {
  const jobs = (ghJson(['run', 'view', String(runId), '--json', 'jobs'])?.jobs || []).filter((j) => RED.has(j.conclusion));
  let error = null;
  try {
    const log = gh(['run', 'view', String(runId), '--log-failed']);
    const line = log.split('\n').find((l) => l.includes('##[error]'));
    error = line ? redactSecrets(line.replace(/^.*##\[error\]/, '')).text.slice(0, 300) : null;
  } catch {
    /* logs expire; the job name is still worth reporting */
  }
  return {
    jobs: jobs.map((j) => ({ name: j.name, steps: (j.steps || []).filter((s) => RED.has(s.conclusion)).map((s) => s.name) })),
    error,
  };
}

/** A bot branch ahead of main is an update waiting for someone. */
export function pendingBranch(repo, branch) {
  try {
    const cmp = ghJson(['api', `repos/${repo}/compare/main...${branch}`]);
    if (!cmp?.ahead_by) return null;
    return {
      branch,
      aheadBy: cmp.ahead_by,
      since: cmp.commits?.[0]?.commit?.committer?.date || null,
      files: (cmp.files || []).map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions })).slice(0, 20),
    };
  } catch {
    return null; // branch absent: nothing pending
  }
}

export function collect({ repo, now = Date.now() } = {}) {
  const workflows = workflowFiles().map((wf) => {
    let runs;
    try {
      runs = ghJson(['run', 'list', '--workflow', wf.file, '--limit', '10', '--json', 'databaseId,status,conclusion,createdAt,event,headBranch']) || [];
    } catch {
      // Typically a workflow that exists locally or on dev but not yet on the
      // default branch — GitHub answers 404. One unreadable workflow must not
      // hide the state of all the others.
      return { ...wf, state: 'unknown', latest: null };
    }
    const verdict = assess(wf, runs, now);
    return verdict.state === 'failing' ? { ...verdict, detail: failureDetail(verdict.latest.databaseId) } : verdict;
  });
  const pending = BOT_BRANCHES.map((b) => pendingBranch(repo, b)).filter(Boolean);
  return {
    version: 1,
    createdAt: new Date(now).toISOString(),
    workflows,
    pending,
    ok: workflows.every((w) => ['ok', 'never-run', 'unknown'].includes(w.state)) && pending.length === 0,
  };
}

export function renderHealth(h) {
  const lines = [`Pipeline health ${h.createdAt.slice(0, 10)} — ${h.ok ? 'all green, nothing pending' : 'needs attention'}`];
  for (const w of h.workflows.filter((w) => w.state === 'failing')) {
    lines.push(`  RED   ${w.name} (${w.file}) since ${w.failingSince?.slice(0, 10)} — run ${w.latest.databaseId}`);
    for (const j of w.detail?.jobs || []) lines.push(`        job ${j.name}${j.steps.length ? ` · step ${j.steps.join(', ')}` : ''}`);
    if (w.detail?.error) lines.push(`        error: ${w.detail.error}`);
  }
  for (const w of h.workflows.filter((w) => w.state === 'stale')) lines.push(`  STALE ${w.name} (${w.file}) — last scheduled run ${w.lastScheduledAt?.slice(0, 10) || 'never'}`);
  for (const p of h.pending) lines.push(`  PENDING ${p.branch}: ${p.aheadBy} commit(s) ahead of main since ${p.since?.slice(0, 10)} — ${p.files.map((f) => `${f.path} +${f.additions}/-${f.deletions}`).join(', ')}`);
  return lines.join('\n');
}
