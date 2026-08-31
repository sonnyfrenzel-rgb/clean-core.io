/**
 * Sends the daily interim result of the activation survey — to the admin, once a
 * day, while the survey is open.
 *
 * It exits quietly when there is nothing to report: before the invitation goes
 * out, and more than a day after the survey closed. A cron that mails "0 of 0"
 * every morning forever teaches its reader to ignore it, and the one morning it
 * matters is the morning it gets deleted unread.
 *
 * One digest is sent after the close as the final count, and then it stops.
 *
 * Usage:
 *   npx tsx scripts/send-survey-digest.ts             # dry run: prints the summary
 *   npx tsx scripts/send-survey-digest.ts --apply     # send
 *   npx tsx scripts/send-survey-digest.ts --apply --to someone@example.com
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { SURVEY_CAMPAIGN } from '../lib/survey/definition';
import { summarise, headline, type SurveyResponse } from '../lib/survey/store';
import {
  renderSurveyDigestEmail,
  renderSurveyDigestSubject,
  renderSurveyDigestText,
} from '../lib/survey/digest-email';
import { wrapEmailDocument } from '../lib/email-layout';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const DEFAULT_RECIPIENT = 'sonny.frenzel@googlemail.com';
const FROM = 'Clean-Core.io Report <info@clean-core.io>';

const APPLY = process.argv.includes('--apply');
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const maybe = v as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  const to = argValue('--to') || DEFAULT_RECIPIENT;

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const campaignSnap = await db.collection('survey_campaigns').doc(SURVEY_CAMPAIGN).get();
  if (!campaignSnap.exists) {
    console.log(`No campaign document for ${SURVEY_CAMPAIGN} — the invitation has not gone out.`);
    return;
  }
  const campaign = campaignSnap.data() || {};
  const invited = Number(campaign.invited || 0);
  const closesAt = toDate(campaign.closesAt);

  const msLeft = closesAt ? closesAt.getTime() - Date.now() : 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

  // One final count on the day it closes, then silence.
  if (closesAt && Date.now() > closesAt.getTime() + 24 * 60 * 60 * 1000) {
    console.log(`Survey closed on ${closesAt.toISOString().slice(0, 10)} — nothing more to send.`);
    return;
  }

  const responsesSnap = await db
    .collection('survey_responses')
    .where('campaign', '==', SURVEY_CAMPAIGN)
    .get();

  const responses: SurveyResponse[] = responsesSnap.docs.map((d) => {
    const r = d.data();
    return {
      campaign: r.campaign,
      uid: r.uid,
      email: r.email || '',
      name: r.name || '',
      answers: (r.answers as Record<string, string>) || {},
      comment: r.comment ?? null,
      linkFetchedAt: toDate(r.linkFetchedAt),
      confirmedAt: toDate(r.confirmedAt),
      updatedAt: toDate(r.updatedAt),
    };
  });

  // The response document is written by the public vote route, which knows the
  // uid and nothing else. Names and addresses are joined in here, where the read
  // is authenticated, rather than copied into a publicly writable document.
  const missing = responses.filter((r) => !r.email);
  if (missing.length > 0) {
    const users = await db.getAll(...missing.map((r) => db.collection('users').doc(r.uid)));
    const byUid = new Map(users.map((u) => [u.id, u.data() || {}]));
    for (const r of missing) {
      const u = byUid.get(r.uid);
      if (!u) continue;
      r.email = u.email || '';
      r.name = [u.firstName, u.lastName].filter(Boolean).join(' ');
    }
  }

  const summary = summarise(SURVEY_CAMPAIGN, invited, responses);
  const subject = renderSurveyDigestSubject(summary, daysLeft);

  console.log(`campaign : ${SURVEY_CAMPAIGN}`);
  console.log(`subject  : ${subject}`);
  console.log(`to       : ${to}`);
  console.log('');
  console.log(renderSurveyDigestText(summary, daysLeft));

  if (!APPLY) {
    console.log('DRY RUN — nothing sent. Re-run with --apply.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${readEnv('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: 'info@clean-core.io',
      subject,
      html: wrapEmailDocument(renderSurveyDigestEmail(summary, daysLeft), 'Survey interim result'),
      text: renderSurveyDigestText(summary, daysLeft),
    }),
  });

  if (!res.ok) throw new Error(`Resend rejected the digest: ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  console.log('');
  console.log(`sent (${id}) — ${headline(summary)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
