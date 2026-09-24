/**
 * Deliverability seed test (roadmap 3.0.9): sends every mail the product sends,
 * rendered from the real templates, through the same Resend account with the
 * same senders and headers, to a handful of seed mailboxes — so that "does it
 * land in the inbox" is measured on the real thing, per provider, before any
 * lever is turned. Runbook: docs/MAIL-SEED-TEST.md.
 *
 * Usage:
 *   npx tsx scripts/mail-seed-test.ts <recipient-file>                    # dry run (default)
 *   npx tsx scripts/mail-seed-test.ts <recipient-file> --run-id 20260925-a
 *   npx tsx scripts/mail-seed-test.ts <recipient-file> --only welcome,survey
 *   npx tsx scripts/mail-seed-test.ts <recipient-file> --mail-tester <address> --only welcome
 *   MAIL_SEED_CONFIRM=20260925-a npx tsx scripts/mail-seed-test.ts <recipient-file> --run-id 20260925-a --send
 *
 * The recipient file lives outside the repository or in the gitignored
 * `scratch/`: one `<label> <address>` per line, `#` for comments. This
 * repository is public; no seed address belongs in it.
 *
 * Side effects, on purpose none: no Firestore, no outbox, no unsubscribe
 * registration, no user event, no signed token (see scripts/lib/mail-seed.ts).
 * The one thing outside this script's control is Resend's webhook: delivery
 * events for seed messages reach `/api/webhooks/resend` like any other and are
 * recorded in `email_events` under their message id — without a uid, without
 * `sentAt`, so they mirror onto no user row and are not counted by the weekly
 * usage report. Their subject carries the seed prefix.
 */

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
function argValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${flag} needs a value`);
  return v;
}

const PAUSE_MS = 700; // Resend allows two requests a second; same pace as send-survey.ts.
const ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readEnv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').find((l) => l.startsWith(`${key}=`));
    if (line) {
      const v = line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
      if (v) return v;
    }
  }
  return undefined;
}

/** Provider error bodies can echo the `to` field; nothing printed here carries an address. */
const maskAddresses = (text: string) => text.replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '[address]');

async function postWithRetry(key: string, payload: unknown, idempotencyKey: string) {
  let detail = 'no attempt made';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        return { ok: true as const, id };
      }
      detail = `${res.status} ${await res.text()}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) await sleep(PAUSE_MS * 2 ** attempt);
  }
  return { ok: false as const, detail: maskAddresses(detail) };
}

interface LogEntry { type: string; label: string; domain: string; status: 'sent' | 'failed'; messageId: string | null; detail: string | null; at: string }

async function main() {
  // A local tool. Its console names providers and subjects, and the public
  // Actions log is the one place a seed run must never happen.
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    throw new Error('mail-seed-test runs on a developer machine only, never in CI (public log).');
  }

  // Every template builds its links from APP_BASE_URL, which falls back to
  // http://localhost:3000 in a plain tsx run. Production is clean-core.io, so
  // the seed is too — set before the templates are loaded.
  if (!process.env.NEXT_PUBLIC_APP_URL) process.env.NEXT_PUBLIC_APP_URL = 'https://clean-core.io';
  const seed = await import('./lib/mail-seed');
  const { APP_BASE_URL } = await import('../lib/constants');

  if (has('--list-types')) {
    for (const t of seed.SEED_MAIL_TYPES) console.log(`${t.type.padEnd(22)}${t.audience.padEnd(9)}${t.source}`);
    return;
  }

  const file = argv.find((a, i) => !a.startsWith('--') && !['--run-id', '--only', '--mail-tester'].includes(argv[i - 1]));
  if (!file) throw new Error('usage: npx tsx scripts/mail-seed-test.ts <recipient-file> [--run-id <id>] [--only <types>] [--mail-tester <address>] [--send]');

  const recipients = seed.parseRecipientFile(fs.readFileSync(path.resolve(file), 'utf8'));
  const tester = argValue('--mail-tester');
  if (tester) recipients.push(...seed.parseRecipientFile(`mail-tester ${tester}`));

  const SEND = has('--send');
  const explicitRunId = argValue('--run-id');
  const runId = explicitRunId || seed.newRunId();
  if (!seed.isValidRunId(runId)) throw new Error('--run-id must be 4-32 letters, digits or dashes');

  // Refused before anything is rendered: a send needs the flag *and* a
  // confirmation that names this very run, so neither a stray flag nor a
  // leftover environment variable from yesterday's run is enough.
  if (SEND) {
    if (!explicitRunId) throw new Error('--send needs an explicit --run-id, and MAIL_SEED_CONFIRM set to the same value.');
    if (process.env.MAIL_SEED_CONFIRM !== runId) {
      throw new Error(`--send refused: set MAIL_SEED_CONFIRM=${runId} to confirm this run. Nothing was sent.`);
    }
    if (APP_BASE_URL !== 'https://clean-core.io') {
      throw new Error(`APP_BASE_URL is "${APP_BASE_URL}" — a seed must carry production links. Nothing was sent.`);
    }
  }

  const types = seed.selectTypes(argValue('--only'));
  const now = new Date();
  const plan = seed.planSeed(types, recipients, runId, now);

  const outDir = path.resolve('scratch', `mail-seed-${runId}`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const m of plan) fs.writeFileSync(path.join(outDir, `${m.type}__${m.label}.html`), m.html);
  const csv = path.join(outDir, 'placement.csv');
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, seed.placementCsv(types, recipients));
  fs.writeFileSync(
    path.join(outDir, 'plan.json'),
    // Labels and domains only — the addresses stay in the recipient file.
    JSON.stringify(plan.map((m) => ({
      type: m.type, audience: m.audience, source: m.source, label: m.label, domain: m.domain,
      subject: m.subject, htmlBytes: m.htmlBytes, textBytes: m.textBytes, headers: m.headers,
      hosts: m.hosts, foreignHosts: m.foreignHosts,
    })), null, 2),
  );

  console.log(`run       : ${runId}${SEND ? '' : '  (DRY RUN)'}`);
  console.log(`base url  : ${APP_BASE_URL}`);
  console.log(`types     : ${types.length}   recipients: ${recipients.length} (${recipients.map((r) => r.label).join(', ')})   messages: ${plan.length}`);
  console.log(`output    : ${path.relative(process.cwd(), outDir)}`);
  console.log('');
  for (const t of types) {
    const first = plan.find((m) => m.type === t.type)!;
    console.log(`${t.type}  [${t.audience}]  <- ${t.source}`);
    console.log(`  from     : ${String(first.payload.from)}${first.payload.reply_to ? `   reply-to: ${String(first.payload.reply_to)}` : '   (no reply-to)'}`);
    console.log(`  subject  : ${first.subject}`);
    console.log(`  size     : html ${first.htmlBytes} B, ${first.textBytes === null ? 'NO text part' : `text ${first.textBytes} B`}`);
    const headers = Object.keys(first.headers);
    console.log(`  headers  : ${headers.length ? headers.join(', ') : '(none beyond the provider defaults)'}`);
    console.log(`  links    : ${first.hosts.join(' ') || '(none)'}`);
    if (first.foreignHosts.length) console.log(`  NOTE     : links outside https://clean-core.io/: ${first.foreignHosts.join(' ')}`);
    for (const m of plan.filter((p) => p.type === t.type)) console.log(`    -> ${m.label} (${m.domain})`);
    console.log('');
  }

  if (!SEND) {
    console.log('DRY RUN — nothing sent. To send, pick a run id and confirm it:');
    console.log(`  MAIL_SEED_CONFIRM=${runId} npx tsx scripts/mail-seed-test.ts ${file} --run-id ${runId} --send`);
    return;
  }

  const key = readEnv('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not set (environment or .env.local). Nothing was sent.');

  // Resumable: a re-run of the same id skips what the log says went out. The
  // Idempotency-Key covers the retry inside one run as well.
  const logPath = path.join(outDir, 'send-log.json');
  const log: LogEntry[] = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
  const done = new Set(log.filter((e) => e.status === 'sent').map((e) => `${e.type}|${e.label}`));

  let sent = 0;
  let failed = 0;
  let first = true;
  for (const m of plan) {
    if (done.has(`${m.type}|${m.label}`)) { console.log(`  skip ${m.type} -> ${m.label} (already sent in this run)`); continue; }
    if (!first) await sleep(PAUSE_MS);
    first = false;
    const r = await postWithRetry(key, m.payload, m.idempotencyKey);
    const entry: LogEntry = {
      type: m.type, label: m.label, domain: m.domain,
      status: r.ok ? 'sent' : 'failed', messageId: r.ok ? r.id : null, detail: r.ok ? null : r.detail,
      at: new Date().toISOString(),
    };
    log.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
    if (r.ok) { sent++; console.log(`  sent ${m.type} -> ${m.label} (${r.id})`); }
    else { failed++; console.error(`  FAILED ${m.type} -> ${m.label}: ${r.detail}`); }
  }
  console.log('');
  console.log(`${sent} sent, ${failed} failed. Log: ${path.relative(process.cwd(), logPath)}`);
  console.log(`Now fill in ${path.relative(process.cwd(), csv)} (ordner: ${seed.PLACEMENT_FOLDERS.join(' | ')}).`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
