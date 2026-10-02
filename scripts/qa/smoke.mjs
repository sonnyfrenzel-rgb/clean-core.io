#!/usr/bin/env node
/**
 * Smoke check of a revision that was just deployed — what a QA engineer does
 * right after a release lands: is the new build the one serving, is it healthy
 * down to Firestore, do the key pages and their scripts answer, are the security
 * headers there, is the Ed25519 signing key published.
 *
 *   node scripts/qa/smoke.mjs                       dev: after a push to dev (qa-review.yml)
 *   node scripts/qa/smoke.mjs --target production   production: after a deploy from main (deploy.yml)
 *   node scripts/qa/smoke.mjs --open <file>         read a sealed result locally (QA_REVIEW_KEY from .env.local)
 *
 * The checks live in lib/smoke.mjs and are the same for both targets. Dev waits
 * for the deploy pipeline of its commit and always exits 0 — the QA loop reads
 * the sealed result (await.mjs). Production runs inside the pipeline after the
 * deploy job and exits 1 when a check fails, so the run turns red; it never
 * rolls back, it names the rollback.
 *
 * No model, no tokens, GETs only. The result is sealed like the review: a missing
 * security header on a public service is not something to announce in a public
 * log, so the log and the step summary say passed or failed and nothing more.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, seal } from './lib/crypto.mjs';
import { jobsOf, sleep, waitForRun } from './lib/gh.mjs';
import { commitIdOrNull } from './lib/git-delta.mjs';
import { SKIPPED_CHECKS, renderSmoke, rollbackCommands, runChecks, targetFrom, waitForRevision } from './lib/smoke.mjs';
import { LOCAL_DIR, loadDotEnv } from './lib/store.mjs';

const OUT_DIR = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');

/**
 * True only when the remote branch head is readable and is another commit: a newer
 * push has deployed (or will), and its own smoke check covers it. Unreadable is
 * not superseded — the check then fails closed.
 */
function supersededOn(branch, sha) {
  try {
    const head = execFileSync('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${branch}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\t')[0].trim();
    return /^[0-9a-f]{40}$/.test(head) && head !== sha;
  } catch {
    return false;
  }
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

function openLocally(file) {
  const secret = process.env.QA_REVIEW_KEY || loadDotEnv().QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not in the environment or .env.local.');
  console.log(renderSmoke(open(JSON.parse(readFileSync(file, 'utf8')), secret)));
}

async function main() {
  const argv = process.argv.slice(2);
  const openAt = argv.indexOf('--open');
  if (openAt >= 0) return openLocally(argv[openAt + 1]);

  const target = targetFrom(argv);
  const secret = process.env.QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not set. The smoke result is never written unsealed.');
  const sha = commitIdOrNull(process.env.QA_HEAD);
  if (!sha) throw new Error('QA_HEAD must be the pushed commit id.');
  const short = sha.slice(0, 12);

  // Dev runs in its own workflow and waits for the deploy; production runs in the
  // deploy workflow itself, behind a deploy job that succeeded.
  let pipeline = null;
  if (target.waitForPipeline) {
    const run = await waitForRun('deploy.yml', sha, { timeoutMs: 45 * 60_000 });
    pipeline = run ? { conclusion: run.timedOut ? 'timed out' : run.conclusion, jobs: jobsOf(run.databaseId) } : { conclusion: 'no pipeline run found', jobs: [] };
  }

  let revision = { serving: false, health: null };
  let routes = [];
  let checks = [];
  if (!pipeline || pipeline.conclusion === 'success') {
    const branch = target.name === 'production' ? 'main' : 'dev';
    revision = await waitForRevision(target.url, sha, { sleep, superseded: () => supersededOn(branch, sha) });
    if (revision.serving) ({ routes, checks } = await runChecks(target.url, sha));
  }

  const result = {
    version: 2,
    target: target.name,
    url: target.url,
    head: sha,
    run: { id: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || null },
    createdAt: new Date().toISOString(),
    pipeline,
    revision,
    routes,
    checks,
    skipped: SKIPPED_CHECKS,
    ok: (!pipeline || pipeline.conclusion === 'success') && revision.serving && routes.length > 0 && routes.every((r) => r.ok) && checks.every((c) => c.ok),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, target.file), JSON.stringify(seal(result, secret)));

  if (target.name !== 'production') {
    console.log(`QA smoke ${short}: completed, sealed`);
    summary(`### QA smoke\n\n\`${short}\` — completed, sealed.\n`);
    return;
  }

  // Production. The verdict is public by nature — a red run is visible — but what failed stays sealed.
  const artifact = `${target.artifact}-${sha}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
  if (revision.superseded) {
    console.log(`::notice::Production smoke ${short}: a newer commit is serving and main has moved on; its own run checks it.`);
    summary(`### Production smoke\n\n\`${short}\` — superseded: a newer commit is serving on ${target.url} and main has moved on. Its own run checks it.\n`);
    return;
  }
  const checked = ['revision serving this commit', 'deep health', 'pages and security headers', 'sign-in page and its scripts', 'Ed25519 signing key'].join(', ');
  const notChecked = SKIPPED_CHECKS.map((k) => k.name).join(', ');
  if (result.ok) {
    console.log(`Production smoke ${short}: passed, sealed`);
    summary(`### Production smoke\n\n\`${short}\` on ${target.url} — passed.\n\nChecked: ${checked}.\nNot checked here: ${notChecked} (reasons in the sealed result).\n`);
    return;
  }
  const rollback = rollbackCommands(target.service);
  console.log(`::error::Production smoke ${short}: FAILED. Details are sealed in artifact ${artifact}. Nothing was rolled back.`);
  summary(
    `### Production smoke\n\n\`${short}\` on ${target.url} — **FAILED**.\n\n` +
      `What failed is sealed in the artifact \`${artifact}\`; open it with \`node scripts/qa/smoke.mjs --open <file>\`.\n\n` +
      `Nothing was rolled back. If the release is broken, send all traffic back to the revision before it ` +
      `(docs/ARCHITECTURE.md, runbook):\n\n\`\`\`\n${rollback.join('\n')}\n\`\`\`\n`,
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`QA smoke failed: ${err?.message || err}`);
  process.exit(1);
});
