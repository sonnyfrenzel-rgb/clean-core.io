#!/usr/bin/env node
/**
 * Smoke check of the revision a push to `dev` deployed — what a QA engineer does
 * right after a release lands: did the pipeline pass, is the new build the one
 * serving, do the key pages answer, are the security headers there.
 *
 * No model, no tokens. The result is sealed like the review: a missing security
 * header on a public service is not something to announce in a public log.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_URL, SMOKE_HEADERS, SMOKE_ROUTES } from './lib/config.mjs';
import { seal } from './lib/crypto.mjs';
import { jobsOf, sleep, waitForRun } from './lib/gh.mjs';
import { commitIdOrNull } from './lib/git-delta.mjs';
import { LOCAL_DIR } from './lib/store.mjs';

const OUT_DIR = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');

async function fetchWithTimeout(url, ms = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'clean-core-qa-smoke' } });
    return { res, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/** Wait until /api/health reports this commit, so the checks run against the new revision and not the one before it. */
async function waitForRevision(sha, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const { res } = await fetchWithTimeout(`${DEV_URL}/api/health`);
      last = await res.json();
      if (last?.commit && sha.startsWith(last.commit)) return { serving: true, health: last };
    } catch {
      /* the revision may be switching over */
    }
    await sleep(20_000);
  }
  return { serving: false, health: last };
}

export async function checkRoutes() {
  const routes = [];
  for (const path of SMOKE_ROUTES) {
    try {
      const { res, ms } = await fetchWithTimeout(`${DEV_URL}${path}`);
      routes.push({ path, status: res.status, ms, ok: res.status === 200 });
      if (path === '/') {
        const missing = SMOKE_HEADERS.filter((h) => !res.headers.get(h));
        routes.at(-1).missingHeaders = missing;
        routes.at(-1).ok = routes.at(-1).ok && missing.length === 0;
      }
    } catch (err) {
      routes.push({ path, status: 0, ms: null, ok: false, error: err?.name === 'AbortError' ? 'timeout' : 'network error' });
    }
  }
  return routes;
}

async function main() {
  const secret = process.env.QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not set. The smoke result is never written unsealed.');
  const sha = commitIdOrNull(process.env.QA_HEAD);
  if (!sha) throw new Error('QA_HEAD must be the pushed commit id.');

  const run = await waitForRun('deploy.yml', sha, { timeoutMs: 45 * 60_000 });
  const pipeline = run ? { conclusion: run.timedOut ? 'timed out' : run.conclusion, jobs: jobsOf(run.databaseId) } : { conclusion: 'no pipeline run found', jobs: [] };

  let revision = { serving: false, health: null };
  let routes = [];
  if (pipeline.conclusion === 'success') {
    revision = await waitForRevision(sha);
    routes = await checkRoutes();
  }

  const result = {
    version: 1,
    head: sha,
    run: { id: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || null },
    createdAt: new Date().toISOString(),
    target: DEV_URL,
    pipeline,
    revision,
    routes,
    ok: pipeline.conclusion === 'success' && revision.serving && routes.every((r) => r.ok),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'qa-smoke.enc.json'), JSON.stringify(seal(result, secret)));
  console.log(`QA smoke ${sha.slice(0, 12)}: completed, sealed`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### QA smoke\n\n\`${sha.slice(0, 12)}\` — completed, sealed.\n`);
}

main().catch((err) => {
  console.error(`QA smoke failed: ${err?.message || err}`);
  process.exit(1);
});
