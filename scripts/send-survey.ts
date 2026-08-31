/**
 * Sends the activation survey invitation.
 *
 * Built on the same rails as `send-community-mail.ts`, and for the same reason:
 * a bulk send is the one operation here with no undo. Suppressions win, CI
 * accounts never receive anything, and a recipient who already has a send record
 * for this campaign is skipped — so a re-run after a crash resumes rather than
 * mails everyone twice.
 *
 * The campaign document is written *before* the first message goes out. If the
 * process dies halfway through, the survey still knows when it opened and when it
 * closes, and the digest still works.
 *
 * Usage:
 *   npx tsx scripts/send-survey.ts                          # dry run, prints the list
 *   npx tsx scripts/send-survey.ts --only me@example.com    # dry run for one person
 *   npx tsx scripts/send-survey.ts --apply --only me@…      # the test send
 *   npx tsx scripts/send-survey.ts --apply                  # the real thing
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isTestAccount } from '../lib/test-accounts';
import { createUnsubscribeToken, normaliseEmail } from '../lib/unsubscribe-token';
import { createSurveyToken } from '../lib/survey/token';
import { SURVEY_CAMPAIGN, SURVEY_OPEN_DAYS, SURVEY_SUBJECT } from '../lib/survey/definition';
import { renderSurveyInviteEmail, renderSurveyInviteText } from '../lib/survey/invite-email';
import { wrapEmailDocument } from '../lib/email-layout';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const FROM = 'Felix from Clean-Core.io <info@clean-core.io>';
const REPLY_TO = 'info@clean-core.io';
const BASE_URL = 'https://clean-core.io';

const APPLY = process.argv.includes('--apply');
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const ONLY = argValue('--only');

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key] as string;
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
  throw new Error(`${key} is not set (environment or .env.local)`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Recipient {
  uid: string;
  email: string;
  firstName: string;
}

async function loadRecipients(db: Firestore) {
  const [users, suppressions, sends] = await Promise.all([
    db.collection('users').get(),
    db.collection('email_suppressions').get(),
    db.collection('email_sends').where('campaign', '==', SURVEY_CAMPAIGN).get(),
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

    recipients.push({ uid: doc.id, email, firstName: (u.firstName || '').trim() });
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  return { recipients, skipped };
}

async function main() {
  const resendKey = APPLY ? readEnv('RESEND_API_KEY') : '';
  process.env.PILOT_APPROVAL_SECRET = readEnv('PILOT_APPROVAL_SECRET');

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const { recipients, skipped } = await loadRecipients(db);

  const now = Date.now();
  const closesAt = new Date(now + SURVEY_OPEN_DAYS * 24 * 60 * 60 * 1000);
  // The link outlives the survey by a day so a late tap gets the "closed" page
  // rather than a broken one.
  const tokenExpiry = closesAt.getTime() + 24 * 60 * 60 * 1000;
  const closesOn = closesAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`campaign  : ${SURVEY_CAMPAIGN}`);
  console.log(`subject   : ${SURVEY_SUBJECT}`);
  console.log(`from      : ${FROM}`);
  console.log(`closes    : ${closesOn}`);
  console.log(`recipients: ${recipients.length}`);
  console.log(`skipped   : ${JSON.stringify(skipped)}`);
  console.log('');
  for (const r of recipients) console.log(`  ${r.email}${r.firstName ? ` (${r.firstName})` : ''}`);
  console.log('');

  if (!APPLY) {
    console.log('DRY RUN — nothing sent. Re-run with --apply.');
    return;
  }
  if (recipients.length === 0) {
    console.log('Nothing to send.');
    return;
  }

  // Written first: a crash mid-send must not lose the fact that it opened.
  // `--only` is the test send and must not start the clock for everyone.
  if (!ONLY) {
    const campaignRef = db.collection('survey_campaigns').doc(SURVEY_CAMPAIGN);
    const existing = await campaignRef.get();
    if (existing.exists && existing.data()?.sentAt) {
      // A second run — the weekly cron coming round again, or a resumed send.
      // The opening and closing dates were set the first time and must not move:
      // silently extending a survey people were told closes on a given day is a
      // small lie with a long tail.
      await campaignRef.set(
        { invited: FieldValue.increment(recipients.length), resumedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      console.log('campaign already open — dates left as they were, invited count topped up');
    } else {
      await campaignRef.set(
        {
          campaign: SURVEY_CAMPAIGN,
          sentAt: FieldValue.serverTimestamp(),
          closesAt,
          invited: recipients.length,
        },
        { merge: true },
      );
      console.log('campaign document written');
    }
  } else {
    console.log('--only: test send, campaign document left untouched');
  }

  let sent = 0;
  for (const r of recipients) {
    const token = createSurveyToken(SURVEY_CAMPAIGN, r.uid, tokenExpiry);
    const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(r.email))}`;

    const input = {
      name: escapeHtml(r.firstName),
      recipient: escapeHtml(r.email),
      token,
      closesOn,
      unsubscribeUrl,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [r.email],
        reply_to: REPLY_TO,
        subject: SURVEY_SUBJECT,
        html: wrapEmailDocument(renderSurveyInviteEmail(input), 'Clean-Core.io survey'),
        text: renderSurveyInviteText(input),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });

    if (!res.ok) {
      console.error(`  FAILED ${r.email}: ${res.status} ${await res.text()}`);
      continue;
    }
    const { id } = (await res.json()) as { id: string };

    // The send record is what makes a re-run resume instead of duplicate.
    if (!ONLY) {
      await db.collection('email_sends').add({
        campaign: SURVEY_CAMPAIGN,
        email: r.email,
        uid: r.uid,
        providerId: id,
        sentAt: FieldValue.serverTimestamp(),
      });
    }

    sent++;
    console.log(`  sent ${r.email} (${id})`);
  }

  console.log('');
  console.log(`${sent} of ${recipients.length} sent.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
