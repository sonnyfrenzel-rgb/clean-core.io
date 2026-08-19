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
 *   - Idempotent. Every send is recorded in `email_sends`; a re-run skips whoever
 *     already received this campaign, so an interrupted run is safe to resume.
 *   - Test accounts excluded. The CI creates a user per pipeline run — they are
 *     the large majority of the `users` collection and must never be mailed.
 *   - Batched with a pause. A first bulk send from a domain that has only ever
 *     sent transactional mail is a reputation event; spreading it out matters.
 *
 * Usage:
 *   npx tsx scripts/send-community-mail.ts                  # dry run
 *   npx tsx scripts/send-community-mail.ts --apply          # send
 *   npx tsx scripts/send-community-mail.ts --apply --only me@example.com
 *   npx tsx scripts/send-community-mail.ts --apply --limit 5
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createUnsubscribeToken, normaliseEmail } from '../lib/unsubscribe-token';
import { isTestAccount } from '../lib/test-accounts';

const PROJECT_ID = 'cleancore-491216';
const DATABASE_ID = 'ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e';

/** Bump when a genuinely new mail goes out, so `email_sends` stays per-campaign. */
const CAMPAIGN = 'community-update-v2.3';
const SUBJECT = 'Clean-Core.io 2.3 is live — and everyone has five fresh transformations';
const FROM = 'Felix Frenzel — Clean-Core.io <info@clean-core.io>';
const REPLY_TO = 'info@clean-core.io';
const BASE_URL = 'https://clean-core.io';

const BATCH_SIZE = 25;
const PAUSE_MS = 60_000;

const APPLY = process.argv.includes('--apply');
const ONLY = argValue('--only');
const LIMIT = Number(argValue('--limit') || 0);

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

function render(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [k, v]) => out.split(`{{${k}}}`).join(v),
    template,
  );
}

interface Recipient {
  uid: string;
  email: string;
  firstName: string;
}

async function loadRecipients(db: Firestore): Promise<{ recipients: Recipient[]; skipped: Record<string, number> }> {
  const [users, suppressions, sends] = await Promise.all([
    db.collection('users').get(),
    db.collection('email_suppressions').get(),
    db.collection('email_sends').where('campaign', '==', CAMPAIGN).get(),
  ]);

  const suppressed = new Set(suppressions.docs.map((d) => normaliseEmail(d.data().email || '')));
  const alreadySent = new Set(sends.docs.map((d) => normaliseEmail(d.data().email || '')));

  const skipped = { noEmail: 0, testAccount: 0, suppressed: 0, alreadySent: 0, deleted: 0, notSelected: 0 };
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
  return { recipients: LIMIT > 0 ? recipients.slice(0, LIMIT) : recipients, skipped };
}

async function main() {
  const resendKey = readEnv('RESEND_API_KEY');
  process.env.PILOT_APPROVAL_SECRET = readEnv('PILOT_APPROVAL_SECRET');

  const htmlTemplate = fs
    .readFileSync('docs/emails/community-update-v2.3.html', 'utf8')
    .replace(/^<!--[\s\S]*?-->\s*/, '');
  const md = fs.readFileSync('docs/emails/community-update-v2.3.md', 'utf8').replace(/\r/g, '');
  const fence = '```text\n';
  const textTemplate = md.slice(md.indexOf(fence) + fence.length).split('\n```')[0];

  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(app, DATABASE_ID);

  const { recipients, skipped } = await loadRecipients(db);

  console.log(`campaign : ${CAMPAIGN}`);
  console.log(`subject  : ${SUBJECT}`);
  console.log(`from     : ${FROM}`);
  console.log('');
  console.log('skipped  :', Object.entries(skipped).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(' ') || 'nothing');
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

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
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

        // Recorded before moving on, so an interruption never double-sends.
        await db
          .collection('email_sends')
          .doc(`${CAMPAIGN}:${createHash('sha256').update(r.email).digest('hex')}`)
          .set({
            campaign: CAMPAIGN,
            email: r.email,
            uid: r.uid,
            providerId: id,
            sentAt: FieldValue.serverTimestamp(),
          });

        sent++;
        console.log(`  sent ${r.email} (${id})`);
      } catch (error) {
        failed++;
        console.error(`  FAILED ${r.email}: ${error instanceof Error ? error.message : String(error)}`);
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
