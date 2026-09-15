#!/usr/bin/env node
/**
 * The maintainer's end of the loop: wait for the QA run of a pushed commit,
 * fetch its sealed artifacts, open them locally and print what needs doing.
 *
 *   node scripts/qa/await.mjs [commit] [--timeout=60]
 *
 * Exit codes — the loop is driven by these, so they are part of the contract:
 *   0  go: no open critical/high/medium finding and the smoke check passed
 *   3  work to do: blocking findings, or the smoke check did not pass
 *   2  no result: the run failed, was superseded, timed out, or the loop is revoked
 *
 * Plaintext reports are written under .qa-review/ (git-ignored) and nowhere else.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gh, jobsOf, waitForRun } from './lib/gh.mjs';
import { git } from './lib/git-delta.mjs';
import { isBlocking, renderText } from './lib/report.mjs';
import { LOCAL_DIR, loadDotEnv, sealedReports } from './lib/store.mjs';

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const timeoutMin = Number((process.argv.find((a) => a.startsWith('--timeout=')) || '--timeout=60').split('=')[1]);

function revoked() {
  try {
    return gh(['variable', 'get', 'QA_REVIEW_ENABLED']) === 'false';
  } catch {
    return false; // variable not set: the loop is on
  }
}

function renderSmoke(s) {
  if (!s) return 'Smoke: no result.';
  const lines = [`Smoke ${s.ok ? 'OK' : 'NOT OK'} — pipeline ${s.pipeline.conclusion}; new revision serving: ${s.revision.serving ? 'yes' : 'no'}`];
  for (const j of s.pipeline.jobs.filter((j) => j.conclusion !== 'success')) lines.push(`  job ${j.name}: ${j.conclusion}`);
  for (const r of s.routes.filter((r) => !r.ok)) lines.push(`  ${r.path}: ${r.status || r.error}${r.missingHeaders?.length ? ` · missing headers ${r.missingHeaders.join(', ')}` : ''}`);
  return lines.join('\n');
}

async function main() {
  if (revoked()) {
    console.log('QA loop revoked (repository variable QA_REVIEW_ENABLED=false). Nothing to wait for.');
    return 2;
  }
  const secret = process.env.QA_REVIEW_KEY || loadDotEnv().QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not in the environment or .env.local.');

  const sha = git(['rev-parse', arg || 'HEAD']);
  const short = sha.slice(0, 12);
  console.log(`Waiting for the QA run of ${short} (up to ${timeoutMin} min)…`);

  const run = await waitForRun('qa-review.yml', sha, { timeoutMs: timeoutMin * 60_000 });
  if (!run) {
    console.log(`No QA run exists for ${short}. Was it pushed to dev?`);
    return 2;
  }
  if (run.timedOut) {
    console.log(`QA run ${run.databaseId} for ${short} has not finished after ${timeoutMin} min.`);
    return 2;
  }
  if (run.conclusion === 'cancelled') {
    console.log(`QA run for ${short} was superseded by a newer push. Await the newer head — its review covers this delta too.`);
    return 2;
  }

  const jobs = jobsOf(run.databaseId);
  // A fresh directory for exactly this run: artifacts left from an earlier run of
  // the same commit must never stand in for a newer run that produced none (QA
  // review of 221f2d11768c, finding 59546a3291c2).
  const dir = join(LOCAL_DIR, 'runs', `${short}-${run.databaseId}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    gh(['run', 'download', String(run.databaseId), '-D', dir]);
  } catch {
    /* an artifact may be missing when its job failed; reported below */
  }

  // And a report only counts for the commit it was made for.
  const review = sealedReports(dir, secret).find((r) => r.range?.head === sha) || null;
  const smoke = sealedReports(dir, secret, 'qa-smoke.enc.json').find((s) => s.head === sha) || null;
  if (!review) {
    console.log(`QA run ${run.databaseId} produced no readable report. Jobs: ${jobs.map((j) => `${j.name}=${j.conclusion}`).join(', ')}`);
    console.log(`Log (failed steps only): gh run view ${run.databaseId} --log-failed`);
    return 2;
  }

  writeFileSync(join(LOCAL_DIR, `${short}.review.json`), JSON.stringify(review, null, 2));
  if (smoke) writeFileSync(join(LOCAL_DIR, `${short}.smoke.json`), JSON.stringify(smoke, null, 2));

  console.log(`\n${renderText(review)}\n\n${renderSmoke(smoke)}`);
  return isBlocking(review) || !smoke?.ok ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`QA await failed: ${err?.message || err}`);
    process.exit(2);
  });
