#!/usr/bin/env node
/**
 * The earlier sealed UX reports a review builds on (.github/workflows/ux-review.yml, step "Fetch earlier sealed
 * reports"): the newest runs that produced one, found through the artifacts API instead of a fixed window of runs.
 * A dev push the agent skips produces no artifact, and forty of them in a row used to hide every earlier report —
 * the next release then started a full review again (QA review of a0c108513165, finding c903686aa3de).
 *
 *   node scripts/ux/fetch-reports.mjs <dir> [--exclude-run=<id>] [--max=30]
 *
 * Self-tests count towards the maximum, so it is generous: the review needs one real report among them, and each
 * report carries the full-review baseline forward (lib/report.mjs). No secret is needed or read here.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gh, ghJson } from '../qa/lib/gh.mjs';
import { collectArtifacts, reviewRuns } from './lib/history.mjs';

const dir = process.argv[2];
const option = (name, fallback) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=')[1];
const exclude = Number(option('exclude-run', 0));
const max = Number(option('max', 30));

if (!dir) {
  console.error('Usage: node scripts/ux/fetch-reports.mjs <dir> [--exclude-run=<id>] [--max=30]');
  process.exit(2);
}

const { artifacts, complete } = collectArtifacts((page) =>
  ghJson(['api', `repos/{owner}/{repo}/actions/artifacts?per_page=100&page=${page}`, '--jq', '{raw: (.artifacts | length), items: [.artifacts[] | {name, expired, runId: .workflow_run.id, headSha: .workflow_run.head_sha}]}']) || { raw: 0, items: [] },
);
const runs = reviewRuns(artifacts).filter((r) => r.databaseId !== exclude).slice(0, max);

let found = 0;
for (const run of runs) {
  const target = join(dir, String(run.databaseId));
  mkdirSync(target, { recursive: true });
  try {
    gh(['run', 'download', String(run.databaseId), '--pattern', 'ux-review-*', '-D', target]);
    found++;
  } catch {
    // An artifact that expired between listing and download is simply not there.
  }
}
// Counts only: the log is public, and names or shas of reports say nothing a reader needs.
console.log(`Earlier UX reports: ${found} downloaded${complete ? '' : ' (artifact history longer than the lookup limit)'}.`);
