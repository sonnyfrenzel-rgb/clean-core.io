#!/usr/bin/env node
/**
 * The maintainer's end of the loop: wait for the QA run of a pushed commit,
 * fetch its sealed artifacts, open them locally and print what needs doing.
 *
 *   node scripts/qa/await.mjs [commit] [--timeout=60]           the delta review and smoke check of a push to dev
 *   node scripts/qa/await.mjs <commit> --full [--timeout=120]    the full review of a release on main
 *
 * Exit codes — the loop is driven by these, so they are part of the contract:
 *   0  go: no blocking finding and the smoke check passed (--full: no blocking finding and nothing unread)
 *   3  work to do: blocking findings, or the smoke check did not pass (--full: findings to verify and schedule)
 *   2  no result: the run failed, was superseded, timed out, or the loop is revoked — or the review read none of
 *      its code (verdict `no_review`): a run that read nothing has no result either, however many carried
 *      findings its report lists
 *
 * The review comes first. On dev the review job finishes a minute or two after
 * the push; the smoke check behind it waits for the Cloud Run deploy, which
 * takes fourteen. This used to wait for the whole run, so findings sat in an
 * artifact for twelve minutes while nothing happened. Now the review is
 * printed as soon as its job is done: with findings, that is the result (exit
 * 3, smoke noted as pending — the push that fixes them supersedes it anyway);
 * with a clean review, the smoke check is the only thing left to decide, so
 * the wait continues for it (Sonny, 16.09.2026).
 *
 * Plaintext reports are written under .qa-review/ (git-ignored) and nowhere else.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gh, ghJson, jobsOf, waitForJob, waitForRun } from './lib/gh.mjs';
import { git } from './lib/git-delta.mjs';
import { isBlocking, needsAnotherRound, readNothing, renderHeader, renderText } from './lib/report.mjs';
import { LOCAL_DIR, loadDotEnv, sealedReports } from './lib/store.mjs';

const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FULL = process.argv.includes('--full');
const timeoutMin = Number((process.argv.find((a) => a.startsWith('--timeout=')) || (FULL ? '--timeout=120' : '--timeout=60')).split('=')[1]);

function revoked() {
  try {
    return gh(['variable', 'get', 'QA_REVIEW_ENABLED']) === 'false';
  } catch {
    return false; // variable not set: the loop is on
  }
}

/**
 * A review that read nothing is not a list of work: its findings are the carried register, not a judgement of
 * this commit. Only the header is printed, and what to do about it.
 */
function reportNothingRead(report, file, full) {
  console.log(`\n${renderHeader(report)}`);
  console.log(`\n${report.findings.length} carried finding(s) unchanged — full report: ${file}`);
  console.log(
    full
      ? 'Nothing of this release was read; the reasons are under NOT REVIEWED above. Fix the cause on dev — the next release gets its full review.'
      : `Nothing of this delta was read. Review it in slices that fit: gh workflow run qa-review.yml --ref dev -f base=<sha> -f head=<sha>, oldest first (docs/QA-REVIEW-LOOP.md §8).`,
  );
}

function renderSmoke(s) {
  if (!s) return 'Smoke: no result.';
  const lines = [`Smoke ${s.ok ? 'OK' : 'NOT OK'} — pipeline ${s.pipeline.conclusion}; new revision serving: ${s.revision.serving ? 'yes' : 'no'}`];
  for (const j of s.pipeline.jobs.filter((j) => j.conclusion !== 'success')) lines.push(`  job ${j.name}: ${j.conclusion}`);
  for (const r of s.routes.filter((r) => !r.ok)) lines.push(`  ${r.path}: ${r.status || r.error}${r.missingHeaders?.length ? ` · missing headers ${r.missingHeaders.join(', ')}` : ''}`);
  return lines.join('\n');
}

/**
 * The artifacts of exactly this run and attempt, downloaded fresh. Called once
 * when the review job is done, and once more when the whole run is — the smoke
 * artifact does not exist the first time.
 */
function collect(run, short) {
  const jobs = jobsOf(run.databaseId);
  const attempt = String(ghJson(['run', 'view', String(run.databaseId), '--json', 'attempt'])?.attempt ?? '');
  // A fresh directory for exactly this run: artifacts left from an earlier run of
  // the same commit must never stand in for a newer run that produced none.
  const dir = join(LOCAL_DIR, 'runs', `${short}-${run.databaseId}-${attempt}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  try {
    gh(['run', 'download', String(run.databaseId), '-D', dir]);
  } catch {
    /* an artifact may be missing when its job failed or has not run yet; reported below */
  }
  // A result counts only when it belongs to this commit and this attempt, and its
  // job in this attempt succeeded. A re-run keeps the run id and the artifacts of
  // earlier attempts (QA reviews of 221f2d11768c and 2f9b128bafd4).
  const succeeded = (prefix) => jobs.some((j) => j.name.startsWith(prefix) && j.conclusion === 'success');
  const current = (meta) => !attempt || String(meta?.attempt ?? '') === attempt;
  return { jobs, dir, succeeded, current };
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
  const deadline = Date.now() + timeoutMin * 60_000;
  console.log(`Waiting for the QA run of ${short} (up to ${timeoutMin} min)…`);

  // A release on main is one job; a push to dev is two, and the review is not
  // made to wait for the smoke check.
  const wait = FULL ? waitForRun : (workflow, commit, opts) => waitForJob(workflow, commit, 'Delta review', opts);
  const run = await wait('qa-review.yml', sha, { timeoutMs: deadline - Date.now(), branch: FULL ? 'main' : 'dev' });
  if (!run) {
    console.log(`No QA run exists for ${short} on ${FULL ? 'main' : 'dev'}. Was it pushed there?`);
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

  let { jobs, dir, succeeded, current } = collect(run, short);
  if (FULL) {
    // A release on main has no smoke check here and gates nothing: the full review is read, verified and scheduled.
    const full = succeeded('Full review') ? sealedReports(dir, secret, 'qa-full.enc.json').find((r) => r.range?.head === sha && current(r.meta?.run)) || null : null;
    if (!full) {
      console.log(`QA run ${run.databaseId} produced no readable full review. Jobs: ${jobs.map((j) => `${j.name}=${j.conclusion}`).join(', ')}`);
      console.log(`Log (failed steps only): gh run view ${run.databaseId} --log-failed`);
      return 2;
    }
    writeFileSync(join(LOCAL_DIR, `${short}.full.json`), JSON.stringify(full, null, 2));
    if (readNothing(full)) {
      reportNothingRead(full, join(LOCAL_DIR, `${short}.full.json`), true);
      return 2;
    }
    console.log(`\n${renderText(full)}`);
    return isBlocking(full) || full.incomplete ? 3 : 0;
  }

  const review = succeeded('Delta review') ? sealedReports(dir, secret).find((r) => r.range?.head === sha && current(r.meta?.run)) || null : null;
  if (!review) {
    console.log(`QA run ${run.databaseId} produced no readable report. Jobs: ${jobs.map((j) => `${j.name}=${j.conclusion}`).join(', ')}`);
    console.log(`Log (failed steps only): gh run view ${run.databaseId} --log-failed`);
    return 2;
  }
  writeFileSync(join(LOCAL_DIR, `${short}.review.json`), JSON.stringify(review, null, 2));

  // Nothing read, nothing decided: not a go, and not a list of findings to work through either.
  if (readNothing(review)) {
    reportNothingRead(review, join(LOCAL_DIR, `${short}.review.json`), false);
    return 2;
  }

  // Findings first: the smoke check of a commit about to be superseded decides nothing.
  if (run.status !== 'completed' && needsAnotherRound(review)) {
    console.log(`\n${renderText(review)}\n\nSmoke: pending — the deploy of ${short} is still running. The findings above come first; the push that fixes them gets its own smoke check.`);
    return 3;
  }

  // A clean review: the smoke check is what remains to decide.
  let done = run;
  if (run.status !== 'completed') {
    console.log(`\n${renderText(review)}\n\nReview clean — waiting for the smoke check of ${short} (deploy running)…`);
    done = await waitForRun('qa-review.yml', sha, { timeoutMs: deadline - Date.now(), branch: 'dev' });
    if (!done || done.timedOut) {
      console.log(`Smoke check of ${short} has not finished after ${timeoutMin} min.`);
      return 2;
    }
    if (done.conclusion === 'cancelled') {
      console.log(`QA run for ${short} was superseded by a newer push before its smoke check. Await the newer head.`);
      return 2;
    }
    ({ jobs, dir, succeeded, current } = collect(done, short));
  }
  const smoke = succeeded('Smoke check') ? sealedReports(dir, secret, 'qa-smoke.enc.json').find((s) => s.head === sha && current(s.run)) || null : null;
  if (smoke) writeFileSync(join(LOCAL_DIR, `${short}.smoke.json`), JSON.stringify(smoke, null, 2));

  console.log(`\n${renderText(review)}\n\n${renderSmoke(smoke)}`);
  return needsAnotherRound(review) || !smoke?.ok ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`QA await failed: ${err?.message || err}`);
    process.exit(2);
  });
