#!/usr/bin/env node
/**
 * Security audit of one release on `main` — the CI entry point
 * (.github/workflows/security-audit.yml, job `audit`).
 *
 *   node scripts/security/audit.mjs              CI: full audit, sealed with the public key
 *   SECURITY_AUDIT_MODE=self-test node scripts/security/audit.mjs
 *                                                the same path with a small model and a $1 cap — run on dev when
 *                                                the agent itself changes, so the whole chain is proven before main
 *
 * Guardrails (docs/SECURITY-AUDIT-AGENT.md §2): the model reads the repository
 * through Read/Grep/Glob and its consultants, and nothing else exists for it.
 * This job holds the model key and the public key only — it can seal a report
 * but not open one, and it never sees the mail key.
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiErrorHint, resultRecord, runToFiles } from './lib/cli.mjs';
import { PUBLIC_KEY_PATH, sealFor } from './lib/envelope.mjs';
import { surfaceMap } from './lib/surface.mjs';
import { AUDIT, CONSULTANTS, REPORT_SCHEMA } from './lib/team.mjs';

const SELF_TEST = process.env.SECURITY_AUDIT_MODE === 'self-test';
const WORK = join(AUDIT.workDir, 'work');
const OUT = join(AUDIT.workDir, 'out');

export const PROMPT = [
  'Run the full security audit of this repository at its current commit, as the CISO described in your system prompt.',
  'Start by reading .security-audit/work/surface.json. Delegate the five domains to the consultants defined for this session and run them in parallel.',
  'Verify every finding yourself before it enters the report. Cover every file in the map by at least one method and state the coverage.',
  'Your final answer is the structured report, written in German.',
].join('\n');

/** The CLI invocation as arguments that reference environment variables only — no value is ever part of the command text. */
export const CLI_COMMAND = [
  'exec npx --yes "$AUDIT_CLI" -p "$AUDIT_PROMPT"',
  '--model "$AUDIT_MODEL" --output-format json --no-session-persistence',
  '--restricted --strict-mcp-config',
  '--tools "$AUDIT_TOOLS" --disallowedTools "$AUDIT_DISALLOWED" --permission-mode dontAsk',
  '--agents "$AUDIT_AGENTS" --json-schema "$AUDIT_SCHEMA" --settings "$AUDIT_SETTINGS_FILE"',
  '--append-system-prompt-file "$AUDIT_BRIEF_FILE" --max-budget-usd "$AUDIT_BUDGET"',
].join(' ');

async function main() {
  mkdirSync(WORK, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  const surface = surfaceMap();
  writeFileSync(join(WORK, 'surface.json'), JSON.stringify(surface, null, 2));

  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set — the audit cannot run.');
  // Settings go in as a file: a long value on a command line is fragile, and a file is what the run can be checked against.
  const settingsFile = join(WORK, 'settings.json');
  writeFileSync(settingsFile, JSON.stringify(SELF_TEST ? { permissions: AUDIT.settings.permissions } : AUDIT.settings));

  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    // The model key is the only secret the CLI receives; nothing else of the runner's environment is passed on.
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    AUDIT_CLI: AUDIT.cli,
    AUDIT_PROMPT: SELF_TEST ? `${PROMPT}\n\nSelf-test of the audit pipeline: read surface.json and one API route, ask one consultant one short question, then return a minimal report.` : PROMPT,
    AUDIT_MODEL: SELF_TEST ? AUDIT.selfTestModel : AUDIT.model,
    AUDIT_TOOLS: (SELF_TEST ? AUDIT.tools.filter((t) => t !== 'Workflow') : AUDIT.tools).join(','),
    AUDIT_DISALLOWED: AUDIT.disallowedTools.join(','),
    AUDIT_AGENTS: JSON.stringify(CONSULTANTS),
    AUDIT_SCHEMA: JSON.stringify(REPORT_SCHEMA),
    AUDIT_SETTINGS_FILE: settingsFile,
    AUDIT_BRIEF_FILE: AUDIT.briefPath,
    AUDIT_BUDGET: String(SELF_TEST ? AUDIT.selfTestBudgetUsd : AUDIT.maxBudgetUsd),
  };

  const started = Date.now();
  // The transcript goes to files in the work directory: the public Actions log must not carry its text.
  const code = await runToFiles({ command: 'bash', args: ['-c', CLI_COMMAND], env, stdoutPath: join(WORK, 'result.json'), stderrPath: join(WORK, 'cli.stderr.log') });
  const record = resultRecord(readFileSync(join(WORK, 'result.json'), 'utf8'));

  // Only metadata ever reaches the log: status fields, numbers and a label from a fixed list — no text.
  const status = record
    ? `subtype=${String(record.subtype).slice(0, 40)} is_error=${Boolean(record.is_error)} api_error_status=${Number(record.api_error_status) || 'none'} hint=${apiErrorHint(record)} turns=${Number(record.num_turns) || 0} cost=$${Number(record.total_cost_usd || 0).toFixed(2)}`
    : 'no result record';
  if (code !== 0 || !record || record.is_error || !record.structured_output) {
    throw new Error(`the audit did not produce a report (exit ${code}; ${status}).`);
  }

  const payload = {
    version: 1,
    head: surface.head,
    createdAt: new Date().toISOString(),
    model: env.AUDIT_MODEL,
    cli: AUDIT.cli,
    selfTest: SELF_TEST,
    durationMs: Date.now() - started,
    costUsd: typeof record.total_cost_usd === 'number' ? record.total_cost_usd : null,
    turns: record.num_turns ?? null,
    permissionDenials: Array.isArray(record.permission_denials) ? record.permission_denials.map((d) => d?.tool_name || 'unknown') : [],
    surface: { files: surface.files.total, byDomain: surface.files.byDomain, apiRoutes: surface.apiRoutes.length, sinks: surface.sinks.length, dependencies: surface.dependencies.vulnerabilities || null },
    report: record.structured_output,
  };

  writeFileSync(join(OUT, 'security-audit.enc.json'), JSON.stringify(sealFor(payload, readFileSync(PUBLIC_KEY_PATH, 'utf8'))));

  const line = `Security audit ${surface.head.slice(0, 12)}: completed, sealed · ${status}`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Security audit\n\n${line}\n\nThe report is sealed and goes to the owner by mail.\n`);
}

main().catch((err) => {
  console.error(`Security audit failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
