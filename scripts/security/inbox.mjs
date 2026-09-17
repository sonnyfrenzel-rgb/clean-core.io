#!/usr/bin/env node
/**
 * The maintainer's inbox for security audits: wait for the audit of a commit,
 * open the sealed report with the private key, show what the register has not
 * decided on yet.
 *
 *   node scripts/security/inbox.mjs [commit] [--timeout=150]   wait for that commit's audit and show it
 *   node scripts/security/inbox.mjs --brief                    SessionStart: the latest audit, silent when all is triaged
 *
 * Exit codes: 0 nothing untriaged · 3 findings to triage · 2 no result (failed, timed out, revoked).
 * Plaintext stays under .security-audit/ (git-ignored).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactNames, gh, ghJson, jobsOf, waitForRun } from '../qa/lib/gh.mjs';
import { containsOrUnknown, git } from '../qa/lib/git-delta.mjs';
import { loadDotEnv } from '../qa/lib/store.mjs';
import { auditArtifact, fetchSealed, openWith, privateKeyFrom } from './lib/envelope.mjs';
import { renderAuditMail } from './lib/mail.mjs';
import { loadRegister, untriaged } from './lib/register.mjs';

const BRIEF = process.argv.includes('--brief');
const DIR = '.security-audit/inbox';
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const timeoutMin = Number((process.argv.find((a) => a.startsWith('--timeout=')) || '--timeout=150').split('=')[1]);

function revoked() {
  try {
    return gh(['variable', 'get', 'SECURITY_AUDIT_ENABLED']) === 'false';
  } catch {
    return false;
  }
}

async function fetchReport(run, privateKey) {
  const audited = jobsOf(run.databaseId).some((j) => j.name.startsWith('Audit') && j.conclusion === 'success');
  if (!audited) return null;
  // Exactly one artifact, chosen by name — never by which of several downloads landed last (finding 4fb3804a2d49).
  const artifact = auditArtifact(artifactNames(run.databaseId), run.headSha);
  if (!artifact) return null;
  // Its own download directory per invocation: parallel SessionStart hooks shared one and raced (lib/envelope.mjs).
  const raw = fetchSealed(artifact, (dir) => gh(['run', 'download', String(run.databaseId), '--name', artifact, '-D', dir]), DIR);
  if (raw === null) return null;
  return { payload: openWith(JSON.parse(raw), privateKey), sealedSha256: createHash('sha256').update(raw).digest('hex') };
}

async function main() {
  if (revoked()) {
    if (!BRIEF) console.log('Security audit revoked (SECURITY_AUDIT_ENABLED=false).');
    return 2;
  }
  const privateKey = privateKeyFrom(process.env.SECURITY_AUDIT_PRIVATE_KEY || loadDotEnv().SECURITY_AUDIT_PRIVATE_KEY);

  let run;
  if (BRIEF) {
    run = (ghJson(['run', 'list', '--workflow', 'security-audit.yml', '--branch', 'main', '--status', 'success', '--limit', '1', '--json', 'databaseId,headSha,createdAt']) || [])[0];
    if (!run) return 0;
  } else {
    const sha = git(['rev-parse', arg || 'origin/main']);
    console.log(`Waiting for the security audit of ${sha.slice(0, 12)} (up to ${timeoutMin} min)…`);
    run = await waitForRun('security-audit.yml', sha, { timeoutMs: timeoutMin * 60_000, intervalMs: 60_000 });
    if (!run || run.timedOut || run.conclusion === 'cancelled') {
      console.log(`No finished security audit for ${sha.slice(0, 12)}${run?.timedOut ? ' yet' : ''}.`);
      return 2;
    }
  }

  const fetched = await fetchReport(run, privateKey);
  if (!fetched) {
    if (BRIEF) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `Security agent: the audit run ${run.databaseId} produced no readable report — see gh run view ${run.databaseId} --log-failed.` } }));
    else console.log(`Audit run ${run.databaseId} produced no readable report: gh run view ${run.databaseId} --log-failed`);
    return 2;
  }

  const { payload, sealedSha256 } = fetched;
  writeFileSync(join(DIR, `${payload.head.slice(0, 12)}.json`), JSON.stringify(payload, null, 2));
  const version = (() => {
    try {
      return `v${JSON.parse(git(['show', `${payload.head}:package.json`])).version}`;
    } catch {
      return 'v?';
    }
  })();
  const mail = renderAuditMail(payload, { version, runUrl: `run ${run.databaseId}`, sealedSha256 });
  const open = untriaged(mail.findings, loadRegister(privateKey), { head: payload.head, isAncestorOf: containsOrUnknown });

  if (BRIEF) {
    if (!open.length || payload.selfTest) return 0;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `Security agent: the audit of ${version} (${payload.head.slice(0, 7)}) has ${open.length} untriaged finding(s): ${open.map((f) => `${f.id} ${f.severity}`).join(', ')}. Use the security-audit-intake skill: node scripts/security/inbox.mjs ${payload.head.slice(0, 12)}, verify each, decide with scripts/security/register.mjs, schedule confirmed ones into docs/ROADMAP.md by priority (IDs only).`,
        },
      }),
    );
    return 0;
  }

  console.log(`\n${mail.text}\n\nUntriaged: ${open.length ? open.map((f) => `${f.id} [${f.fingerprint}]${f.reopened ? ' (marked fixed, reported again)' : ''}`).join(', ') : 'none'}`);
  return open.length ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    if (BRIEF) process.exit(0);
    console.error(`Security inbox failed: ${String(err?.message || err).split('\n')[0]}`);
    process.exit(2);
  });
