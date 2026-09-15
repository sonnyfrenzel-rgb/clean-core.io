#!/usr/bin/env node
/**
 * The maintainer's inbox for UX reviews: wait for the review of a commit, open
 * the sealed report, fetch its screenshots, show what the register has not
 * decided on yet.
 *
 *   node scripts/ux/inbox.mjs [commit] [--timeout=90]   wait for that commit's review (default: origin/main) and show it
 *   node scripts/ux/inbox.mjs --brief                   SessionStart: the latest review, silent when all is decided
 *
 * Exit codes: 0 nothing undecided · 3 findings to decide · 2 no result (failed, timed out, revoked).
 * Plaintext and screenshots stay under .ux-review/ (git-ignored).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open } from '../qa/lib/crypto.mjs';
import { artifactNames, gh, ghJson, jobsOf, latestArtifact, waitForRun } from '../qa/lib/gh.mjs';
import { containsOrUnknown, git } from '../qa/lib/git-delta.mjs';
import { loadDotEnv } from '../qa/lib/store.mjs';
import { loadRegister, untriaged } from './lib/register.mjs';
import { renderText } from './lib/report.mjs';

const BRIEF = process.argv.includes('--brief');
const DIR = '.ux-review/inbox';
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const timeoutMin = Number((process.argv.find((a) => a.startsWith('--timeout=')) || '--timeout=90').split('=')[1]);

function revoked() {
  try {
    return gh(['variable', 'get', 'UX_REVIEW_ENABLED']) === 'false';
  } catch {
    return false;
  }
}

function download(runId, name, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  gh(['run', 'download', String(runId), '--name', name, '-D', dir]);
}

function fetchReport(run, secret) {
  if (!jobsOf(run.databaseId).some((j) => j.name.startsWith('Review') && j.conclusion === 'success')) return null;
  const names = artifactNames(run.databaseId);
  const reportName = latestArtifact(names, 'ux-review', run.headSha);
  if (!reportName) return null;
  const dir = join(DIR, reportName);
  try {
    download(run.databaseId, reportName, dir);
  } catch {
    return null;
  }
  const sealed = join(dir, 'ux-review.enc.json');
  if (!existsSync(sealed)) return null;
  const report = open(JSON.parse(readFileSync(sealed, 'utf8')), secret);

  // The screenshots, so a finding can be checked against the picture it cites.
  const shotsName = latestArtifact(names, 'ux-capture', run.headSha);
  let shots = null;
  if (shotsName && !BRIEF) {
    shots = join(DIR, shotsName);
    try {
      download(run.databaseId, shotsName, shots);
    } catch {
      shots = null;
    }
  }
  return { report, shots };
}

async function main() {
  if (revoked()) {
    if (!BRIEF) console.log('UX review revoked (UX_REVIEW_ENABLED=false).');
    return 2;
  }
  const secret = process.env.UX_REVIEW_KEY || loadDotEnv().UX_REVIEW_KEY;
  if (!secret) throw new Error('UX_REVIEW_KEY is not in the environment or .env.local.');

  let run;
  if (BRIEF) {
    run = (ghJson(['run', 'list', '--workflow', 'ux-review.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId,headSha,createdAt']) || [])[0];
    if (!run) return 0;
  } else {
    const sha = git(['rev-parse', arg || 'origin/main']);
    console.log(`Waiting for the UX review of ${sha.slice(0, 12)} (up to ${timeoutMin} min)…`);
    run = await waitForRun('ux-review.yml', sha, { timeoutMs: timeoutMin * 60_000, intervalMs: 60_000 });
    if (!run || run.timedOut || run.conclusion === 'cancelled') {
      console.log(`No finished UX review for ${sha.slice(0, 12)}${run?.timedOut ? ' yet' : ''}.`);
      return 2;
    }
  }

  const fetched = fetchReport(run, secret);
  if (!fetched) {
    if (BRIEF) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `UX agent: review run ${run.databaseId} produced no readable report — see gh run view ${run.databaseId} --log-failed.` } }));
    else console.log(`UX review run ${run.databaseId} produced no readable report: gh run view ${run.databaseId} --log-failed`);
    return 2;
  }

  const { report, shots } = fetched;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${report.range.head.slice(0, 12)}.json`), JSON.stringify(report, null, 2));
  const undecided = untriaged(report.findings, loadRegister(), { head: report.range.head, isAncestorOf: containsOrUnknown });

  if (BRIEF) {
    if (!undecided.length || report.mode === 'self-test') return 0;
    const bySeverity = ['critical', 'high', 'medium', 'low'].map((s) => `${undecided.filter((f) => f.severity === s).length} ${s}`).join(', ');
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `UX agent: the ${report.mode} review of ${report.range.head.slice(0, 7)} has ${undecided.length} undecided finding(s) (${bySeverity}). Use the ux-review-intake skill: node scripts/ux/inbox.mjs ${report.range.head.slice(0, 12)}, verify each against code and screenshot, decide with scripts/ux/register.mjs, schedule accepted ones into docs/ROADMAP.md §13.`,
        },
      }),
    );
    return 0;
  }

  console.log(`\n${renderText(report, { untriaged: undecided })}`);
  if (shots) console.log(`\nScreenshots: ${shots}/ (Read a .jpg to check a finding)`);
  console.log(`\nUndecided: ${undecided.length ? undecided.map((f) => `[${f.fingerprint}]${f.reopened ? ' (marked fixed, reported again)' : ''}`).join(', ') : 'none'}`);
  return undecided.length ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (BRIEF) process.exit(0);
    console.error(`UX inbox failed: ${String(err?.message || err).split('\n')[0]}`);
    process.exit(2);
  });
