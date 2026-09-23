/**
 * Bulk sender for the community update mail.
 *
 * Deliberately a script and not an API route: a web-exposed endpoint that mails
 * every account is an attack surface with no upside, and a send is something you
 * want to watch happen rather than trigger from a browser.
 *
 * Safety properties, in the order they matter:
 *   - Dry run by default. `--apply` is required to send anything.
 *   - Suppressions win. Anyone in `email_suppressions` is skipped, always.
 *   - Idempotent, in the outbox sense (`lib/survey/outbox.ts`): the record is
 *     claimed in a transaction *before* the provider is asked and settled after,
 *     and the request carries a deterministic `Idempotency-Key`. It used to be
 *     written after Resend had accepted the message, so a crash or a failed
 *     Firestore write in between left a delivered mail with no record and the
 *     next run mailed that person a second copy (QA review of 33471220d6e9,
 *     finding 6d40362efbf6). A record in `sending` is neither resent nor
 *     counted — a person checks the provider log and settles it.
 *   - Test accounts excluded. The CI creates a user per pipeline run — they are
 *     the large majority of the `users` collection and must never be mailed.
 *   - Batched with a pause. A first bulk send from a domain that has only ever
 *     sent transactional mail is a reputation event; spreading it out matters.
 *
 * Usage:
 *   npx tsx scripts/send-community-mail.ts                  # dry run, default campaign
 *   npx tsx scripts/send-community-mail.ts --apply          # send
 *   npx tsx scripts/send-community-mail.ts --apply --only me@example.com
 *   npx tsx scripts/send-community-mail.ts --apply --limit 5
 *   npx tsx scripts/send-community-mail.ts --campaign community-update-v2.3
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createUnsubscribeToken, normaliseEmail } from '../lib/unsubscribe-token';
import { isTestAccount } from '../lib/test-accounts';
import { claimSend, completeSend, failSend, sendIdempotencyKey } from '../lib/survey/outbox';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { escapeHtml } from '../lib/export-safety';

const PROJECT_ID = 'cleancore-491216';
// Imported rather than hardcoded so a database migration cannot leave the
// sender reading a retired database.
const DATABASE_ID = FIRESTORE_DB_ID;

/**
 * One entry per mail that has gone out, keyed by the id recorded in `email_sends`.
 *
 * Registered together rather than edited in place so the campaign id, the subject
 * and the two template files cannot drift apart — and so re-running an older
 * campaign still skips exactly the people who already received it.
 */
interface Campaign {
  subject: string;
  /** Basename under docs/emails/ — both .html and .md must exist. */
  template: string;
}

const CAMPAIGNS: Record<string, Campaign> = {
  'community-update-v2.3': {
    subject: 'Clean-Core.io 2.3 is live — and everyone has five fresh transformations',
    template: 'community-update-v2.3',
  },
  'clean-core-explained': {
    subject: 'SAP Clean Core, explained without the jargon',
    template: 'clean-core-explained',
  },
};

/** The campaign a bare invocation sends. Update when a newer mail supersedes it. */
const DEFAULT_CAMPAIGN = 'clean-core-explained';

const FROM = 'Felix Frenzel — Clean-Core.io <info@clean-core.io>';
const REPLY_TO = 'info@clean-core.io';
const BASE_URL = 'https://clean-core.io';

const BATCH_SIZE = 25;
const PAUSE_MS = 60_000;

const APPLY = process.argv.includes('--apply');
const ONLY = argValue('--only');
const LIMIT = Number(argValue('--limit') || 0);
const CAMPAIGN = argValue('--campaign') || DEFAULT_CAMPAIGN;

const campaign = CAMPAIGNS[CAMPAIGN];
if (!campaign) {
  console.error(`Unknown campaign "${CAMPAIGN}". Known: ${Object.keys(CAMPAIGNS).join(', ')}`);
  process.exit(1);
}
const SUBJECT = campaign.subject;

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readEnv(key: string): string {
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .replace(/\r/g, '')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (line) {
      const v = line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
      if (v) return v;
    }
  }
  throw new Error(`${key} is not set in .env.local or .env`);
}

/**
 * Fill the placeholders — and escape what goes in, because one of the values is
 * the recipient's own `firstName`, which the browser may write
 * (`userClientUpdateKeys()` in firestore.rules). Until 23.09.2026 it was
 * interpolated into the HTML mail as-is, so an account could put markup into
 * the letter it received (security audit of v2.14.0, SEC-2026-353). It reaches
 * only that one recipient and mail clients strip most of it, which is why this
 * is one line rather than a template rewrite.
 */
function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    // The unsubscribe link is built here, two lines from the token that signs
    // it, and it goes into the plain-text letter as well as the HTML one, where
    // an escaped `&` would be wrong. Everything else is account data.
    (out, [k, v]) => out.split(`{{${k}}}`).join(/_URL$/.test(k) ? v : escapeHtml(v)),
    template,
  );
}

interface Recipient {
  uid: string;
  email: string;
  firstName: string;
}

async function loadRecipients(db: Firestore): Promise<{ recipients: Recipient[]; skipped: Record<string, number>; unresolved: string[] }> {
  const [users, suppressions, sends] = await Promise.all([
    db.collection('users').get(),
    db.collection('email_suppressions').get(),
    db.collection('email_sends').where('campaign', '==', CAMPAIGN).get(),
  ]);

  const suppressed = new Set(suppressions.docs.map((d) => normaliseEmail(d.data().email || '')));
  // The record is written before the provider is asked (see the loop in main),
  // so the states mean: `sent` — accepted and recorded; `sending` — the provider
  // was asked and the outcome was never written, which is a message that may
  // well have gone out; `failed` — the provider refused. Only the last is asked
  // again. Records without a state predate the outbox and were only ever written
  // after success.
  const alreadySent = new Set<string>();
  const unresolved: string[] = [];
  for (const d of sends.docs) {
    const email = normaliseEmail(d.data().email || '');
    const state = d.data().state as string | undefined;
    if (state === 'failed') continue;
    if (state === 'sending') unresolved.push(email);
    alreadySent.add(email);
  }

  const skipped = { noEmail: 0, testAccount: 0, suppressed: 0, alreadySent: 0, unresolved: unresolved.length, deleted: 0, notSelected: 0 };
  const recipients: Recipient[] = [];

  for (const doc of users.docs) {
    const u = doc.data();
    const email = normaliseEmail(u.email || '');

    if (!email) { skipped.noEmail++; continue; }
    if (isTestAccount(email)) { skipped.testAccount++; continue; }
    if (u.status === 'deleted' || u.disabled === true) { skipped.deleted++; continue; }
    if (suppressed.has(email)) { skipped.suppressed++; continue; }
    if (alreadySent.has(email)) { skipped.alreadySent++; continue; }
    if (ONLY && email !== normaliseEmail(ONLY)) { skipped.notSelected++; continue; }

    recipients.push({
      uid: doc.id,
      email,
      firstName: (u.firstName || '').trim() || 'there',
    });
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  return { recipients: LIMIT > 0 ? recipients.slice(0, LIMIT) : recipients, skipped, unresolved };
}

async function main() {
  const resendKey = readEnv('RESEND_API_KEY');
  process.env.PILOT_APPROVAL_SECRET = readEnv('PILOT_APPROVAL_SECRET');

  const htmlTemplate = fs
    .readFileSync(`docs/emails/${campaign.template}.html`, 'utf8')
    .replace(/^<!--[\s\S]*?-->\s*/, '');
  const md = fs.readFileSync(`docs/emails/${campaign.template}.md`, 'utf8').replace(/\r/g, '');
  const fence = '```text\n';
  const textTemplate = md.slice(md.indexOf(fence) + fence.length).split('\n```')[0];

  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(app, DATABASE_ID);

  const { recipients, skipped, unresolved } = await loadRecipients(db);

  console.log(`campaign : ${CAMPAIGN}`);
  console.log(`subject  : ${SUBJECT}`);
  console.log(`from     : ${FROM}`);
  console.log('');
  console.log('skipped  :', Object.entries(skipped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' ') || 'nothing');
  if (unresolved.length) {
    // Not resent, not counted: nobody knows whether these went out. A person
    // checks the provider's log and sets the record to `sent` or `failed`.
    console.log(`unresolved: ${unresolved.length} send(s) started and never recorded — check the provider log: ${unresolved.join(', ')}`);
  }
  console.log(`sending  : ${recipients.length} recipient(s)`);
  console.log('');
  for (const r of recipients) console.log(`  ${r.email}  (${r.firstName})`);
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN — nothing was sent. Re-run with --apply.');
    return;
  }
  if (recipients.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    console.log(`--- batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} recipient(s) ---`);

    for (const r of batch) {
      const token = createUnsubscribeToken(r.email);
      const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?t=${encodeURIComponent(token)}`;
      const vars = { FIRST_NAME: r.firstName, EMAIL: r.email, UNSUBSCRIBE_URL: unsubscribeUrl };

      // The outbox record, claimed in a transaction before the provider is
      // asked and under a deterministic id. Whatever happens after — a crash, a
      // failed write, a second process running beside this one — a re-run finds
      // the claim and does not ask the provider twice.
      // (lib/survey/outbox.ts holds the transaction; tests/survey-outbox.spec.ts
      // runs it against the emulator.)
      if (!(await claimSend(db, CAMPAIGN, r))) {
        console.log(`  claimed by another run: ${r.email} — skipped`);
        continue;
      }

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
            // Same campaign, same address, same key — so a request this run
            // repeats after a lost response cannot become a second copy.
            'Idempotency-Key': sendIdempotencyKey(CAMPAIGN, r.email),
          },
          body: JSON.stringify({
            from: FROM,
            to: [r.email],
            reply_to: REPLY_TO,
            subject: SUBJECT,
            html: render(htmlTemplate, vars),
            text: render(textTemplate, vars),
            headers: {
              // RFC 8058 — required by Gmail and Yahoo for bulk senders.
              'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }),
        });

        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const { id } = (await res.json()) as { id: string };

        await completeSend(db, CAMPAIGN, r.uid, id);

        sent++;
        console.log(`  sent ${r.email} (${id})`);
      } catch (error) {
        failed++;
        const detail = error instanceof Error ? error.message : String(error);
        // A refusal is final for this run and the record says so, which is what
        // makes the next run try this person again. If this write fails too the
        // record stays in `sending`: reported as unresolved above, never resent.
        await failSend(db, CAMPAIGN, r.uid, detail).catch(() => {});
        console.error(`  FAILED ${r.email}: ${detail}`);
      }
    }

    const more = i + BATCH_SIZE < recipients.length;
    if (more) {
      console.log(`  pausing ${PAUSE_MS / 1000}s before the next batch…`);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  }

  console.log('');
  console.log(`Done. ${sent} sent, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
