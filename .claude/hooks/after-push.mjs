#!/usr/bin/env node
/**
 * PostToolUse hook (Bash|PowerShell): after a push to `dev` or `main`, put the
 * agents' next step into Claude's context. Silent for every other command.
 *
 * - dev  → the QA agent reviews the delta; run the qa-review-loop skill.
 * - main → the security agent audits the release (report by mail and through
 *          scripts/security/inbox.mjs), the UX agent reviews it (scripts/ux/inbox.mjs)
 *          and the QA agent reviews its whole code base (scripts/qa/await.mjs --full).
 *
 * Never blocks, never fails the tool call: any error here exits 0 without output.
 */
import { execFileSync } from 'node:child_process';

const PUSH_TO = (branch) => new RegExp(`\\bgit\\s+push\\b[^\\n;&|]*?(?:\\s|:)(?:refs/heads/)?${branch}(?=\\s|$|;|&|\\|)`);

function tipOf(branch) {
  try {
    return execFileSync('git', ['rev-parse', `origin/${branch}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '<pushed-sha>';
  }
}

function emit(text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }));
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    const command = String(JSON.parse(raw)?.tool_input?.command || '');
    if (!/\bgit\s+push\b/.test(command) || /--dry-run|\s-n(\s|$)/.test(command)) return;

    if (PUSH_TO('dev').test(command)) {
      const sha = tipOf('dev');
      emit(
        `QA agent: a push to dev (${sha.slice(0, 12)}) starts the sealed QA review and smoke check. ` +
          `Invoke the qa-review-loop skill and run \`node scripts/qa/await.mjs ${sha} --timeout=60\` with run_in_background. ` +
          'Verify every finding before changing code; ask Sonny before any push to main.',
      );
    } else if (PUSH_TO('main').test(command)) {
      const sha = tipOf('main');
      emit(
        `Security agent: a push to main (${sha.slice(0, 12)}) starts the full sealed security audit. ` +
          `Its German report goes to Sonny by mail; fetch it with \`node scripts/security/inbox.mjs ${sha}\` (run_in_background), ` +
          'verify the findings and schedule confirmed ones into the roadmap by priority — IDs and priority only in public files, details stay sealed. ' +
          `UX agent: the same push starts the UX review of the release; use the ux-review-intake skill with \`node scripts/ux/inbox.mjs ${sha}\` (run_in_background). ` +
          `QA agent: the same push starts the full code review of the release; run \`node scripts/qa/await.mjs ${sha} --full\` (run_in_background), verify each finding like a delta finding and fix confirmed ones on dev as a roadmap step — it gates nothing.`,
      );
    }
  } catch {
    /* a hook must never break the tool call */
  }
});
