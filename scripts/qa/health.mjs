#!/usr/bin/env node
/**
 * Weekly pipeline health (docs/QA-REVIEW-LOOP.md §9).
 *
 *   node scripts/qa/health.mjs            maintainer: print the state; exit 0 all green, 3 needs attention
 *   node scripts/qa/health.mjs --seal     CI (qa-weekly-health.yml): sealed record, public line says only that it ran
 *   node scripts/qa/health.mjs --brief    SessionStart hook: silent when green, a short context note otherwise
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seal } from './lib/crypto.mjs';
import { gh } from './lib/gh.mjs';
import { collect, renderHealth } from './lib/health.mjs';
import { LOCAL_DIR } from './lib/store.mjs';

const SEAL = process.argv.includes('--seal');
const BRIEF = process.argv.includes('--brief');

function repo() {
  return process.env.GITHUB_REPOSITORY || gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
}

function revoked() {
  try {
    return gh(['variable', 'get', 'QA_REVIEW_ENABLED']) === 'false';
  } catch {
    return false;
  }
}

async function main() {
  if (BRIEF && revoked()) return 0;
  const health = collect({ repo: repo() });

  if (SEAL) {
    const secret = process.env.QA_REVIEW_KEY;
    if (!secret) throw new Error('QA_REVIEW_KEY is not set. The health record is never written unsealed.');
    const out = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'qa-health.enc.json'), JSON.stringify(seal(health, secret)));
    console.log('QA pipeline health: completed, sealed');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### QA pipeline health\n\nCompleted, sealed.\n');
    return 0;
  }

  if (BRIEF) {
    if (health.ok) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `${renderHealth(health)}\nQA agent, weekly duty: find the root cause of every RED/STALE workflow (gh run view <id> --log-failed) and handle every PENDING bot branch — fix what is ours, raise what needs Sonny (settings, secrets, infra). See the qa-review-loop skill, section 7.`,
        },
      }),
    );
    return 0;
  }

  console.log(renderHealth(health));
  return health.ok ? 0 : 3;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const message = `QA pipeline health failed: ${String(err?.message || err).split('\n')[0]}`;
    if (BRIEF) {
      // At session start a failed check is said once and never blocks — a silent hook hides exactly this.
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${message} — run node scripts/qa/health.mjs to see why.` } }));
      process.exit(0);
    }
    console.error(message);
    process.exit(2);
  });
