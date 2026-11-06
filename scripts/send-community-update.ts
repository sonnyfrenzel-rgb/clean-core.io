/**
 * Sends the short community mail on what is planned next (version 3.5, the own
 * Claude key, a simpler interface, a clearer start page) — the block the notice
 * of the Terms amendment no longer carries (legal statements of 06.11.2026, M1).
 *
 *   npx tsx scripts/send-community-update.ts
 *       DRY RUN (the default): reads the accounts and the suppression list,
 *       prints the counts and writes the rendered sample. Sends nothing.
 *   npx tsx scripts/send-community-update.ts --send --confirm=<count>
 *       sends to at most 40 recipients (`--limit=<n>` for fewer), then stops;
 *       run the dry run again for the next batch.
 *
 * Community mail, not a contractual notice: only accounts that switched
 * community mail on and are not on the suppression list receive it — the one
 * gate every community sender calls (`communityMailBlock`,
 * `lib/community-mail.ts`), the keyed suppression entries included. Every mail
 * carries an unsubscribe link in the body and the RFC 8058 header.
 *
 * Idempotent through the send outbox (`lib/survey/outbox.ts`): a record per
 * recipient is claimed before the provider is asked; a re-run skips `sent` and
 * `sending`. Never prints an address: counts and `acct_<hash>` only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { communityMailBlock, unsubscribeUrls } from '../lib/community-mail';
import { createUnsubscribeToken, normaliseEmail } from '../lib/unsubscribe-token';
import { accountHashOf } from '../lib/pseudonym';
import { claimSend, completeSend, failSend, sendIdempotencyKey } from '../lib/survey/outbox';
import { FIRESTORE_DB_ID, USER_MAIL_FROM, USER_MAIL_REPLY_TO } from '../lib/constants';
import { TERMS_EFFECTIVE_DATE_ISO } from '../lib/legal/open-values';
import { COMMUNITY_UPDATE_CAMPAIGN, buildCommunityUpdateMail } from '../lib/terms-announcement/community-update';
import { AnnouncementArgsError, logRef, maskAddresses, parseAnnouncementArgs, sendRefusal } from '../lib/terms-announcement/send-plan';

const PROJECT_ID = 'cleancore-491216';
const BASE_URL = 'https://clean-core.io';
const PAUSE_MS = 700;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readEnv(key: string, required = true): string {
  if (process.env[key]) return process.env[key] as string;
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').find((l) => l.startsWith(`${key}=`));
    const v = line?.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
    if (v) {
      process.env[key] = v;
      return v;
    }
  }
  if (required) throw new Error(`${key} is not set (environment or .env.local)`);
  return '';
}

function toIsoDay(v: unknown): string | null {
  const maybe = v as { toDate?: () => Date } | null | undefined;
  const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : v ? new Date(v as string) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

async function main() {
  let args;
  try {
    args = parseAnnouncementArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof AnnouncementArgsError) {
      console.error(e.message);
      process.exit(2);
    }
    throw e;
  }
  if (args.testTo || args.sampleOnly) {
    console.error('This script has no test or sample mode: scripts/send-terms-announcement.ts --test-to or --sample-only renders and test-sends this mail too.');
    process.exit(2);
  }
  const plannedDay = TERMS_EFFECTIVE_DATE_ISO ?? '2026-12-22';
  process.env.PILOT_APPROVAL_SECRET = readEnv('PILOT_APPROVAL_SECRET');
  readEnv('PSEUDONYM_PEPPER', false);

  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);
  const [users, suppressions, sends] = await Promise.all([
    db.collection('users').get(),
    db.collection('email_suppressions').get(),
    db.collection('email_sends').where('campaign', '==', COMMUNITY_UPDATE_CAMPAIGN).get(),
  ]);

  // Clear-text entries (before 3.0.21) and keyed entries (the id is the keyed hash).
  const suppressed = new Set(suppressions.docs.map((d) => normaliseEmail(d.data().email || '')).filter(Boolean));
  const keyedIds = new Set(suppressions.docs.filter((d) => d.data().keyed === true).map((d) => d.id));
  if (keyedIds.size && !process.env.PSEUDONYM_PEPPER) {
    console.error('REFUSED   : the suppression list has keyed entries and PSEUDONYM_PEPPER is not set, so they cannot be matched');
    process.exit(1);
  }
  for (const doc of users.docs) {
    const email = normaliseEmail(doc.data().email || '');
    if (email && keyedIds.size && keyedIds.has(accountHashOf(email))) suppressed.add(email);
  }
  const done = new Set(sends.docs.filter((d) => d.data().state !== 'failed').map((d) => d.data().uid as string));

  const skipped: Record<string, number> = { alreadySent: 0 };
  const recipients: { uid: string; email: string; consentedOn: string | null }[] = [];
  for (const doc of users.docs) {
    const u = doc.data();
    const block = communityMailBlock(u, suppressed);
    if (block) {
      skipped[block] = (skipped[block] ?? 0) + 1;
      continue;
    }
    if (done.has(doc.id)) {
      skipped.alreadySent++;
      continue;
    }
    recipients.push({ uid: doc.id, email: normaliseEmail(u.email), consentedOn: toIsoDay(u.communityMail?.consentedAt) });
  }
  recipients.sort((a, b) => logRef(a.uid).localeCompare(logRef(b.uid)));
  const thisRun = Math.min(recipients.length, args.limit);

  console.log(`campaign  : ${COMMUNITY_UPDATE_CAMPAIGN}`);
  console.log(`recipients: ${recipients.length} (opted in, not suppressed, not yet sent)`);
  console.log(`skipped   : ${JSON.stringify(skipped)}`);
  console.log(`this run  : ${thisRun}`);

  const sample = buildCommunityUpdateMail({
    plannedDayIso: plannedDay,
    consentedOnIso: null,
    unsubscribeUrl: unsubscribeUrls(BASE_URL, 'sample-token-not-signed').page,
    baseUrl: BASE_URL,
  });
  const dir = path.resolve(args.out ?? path.join('tmp', 'community-update', COMMUNITY_UPDATE_CAMPAIGN));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'community-update.html'), sample.html, 'utf8');
  fs.writeFileSync(path.join(dir, 'community-update.txt'), sample.text, 'utf8');
  console.log(`subject   : ${sample.subject}`);
  console.log(`sample    : ${path.relative(process.cwd(), dir)}${path.sep}`);

  const refusal = sendRefusal(args, recipients.length);
  if (refusal === 'dry run') {
    console.log(`DRY RUN — nothing sent. To send: --send --confirm=${recipients.length}`);
    return;
  }
  if (refusal) {
    console.error(`REFUSED   : ${refusal}`);
    process.exit(1);
  }
  const key = readEnv('RESEND_API_KEY');

  let sent = 0;
  let failed = 0;
  for (const [i, r] of recipients.slice(0, thisRun).entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    if (!(await claimSend(db, COMMUNITY_UPDATE_CAMPAIGN, r))) {
      console.log(`  ${logRef(r.uid)} claimed by another run — skipped`);
      continue;
    }
    const urls = unsubscribeUrls(BASE_URL, createUnsubscribeToken(r.email));
    const mail = buildCommunityUpdateMail({ plannedDayIso: plannedDay, consentedOnIso: r.consentedOn, unsubscribeUrl: urls.page, baseUrl: BASE_URL });
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': sendIdempotencyKey(COMMUNITY_UPDATE_CAMPAIGN, r.email),
        },
        body: JSON.stringify({
          from: USER_MAIL_FROM,
          reply_to: USER_MAIL_REPLY_TO,
          to: [r.email],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: { 'List-Unsubscribe': `<${urls.oneClick}>, <mailto:${USER_MAIL_REPLY_TO}?subject=Unsubscribe>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        }),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        await completeSend(db, COMMUNITY_UPDATE_CAMPAIGN, r.uid, id);
        sent++;
        console.log(`  ${logRef(r.uid)} sent (${id})`);
      } else {
        const detail = `status=${res.status}`;
        await failSend(db, COMMUNITY_UPDATE_CAMPAIGN, r.uid, detail);
        failed++;
        console.error(`  ${logRef(r.uid)} FAILED ${detail}`);
      }
    } catch (e) {
      const detail = maskAddresses(e instanceof Error ? e.message : String(e));
      await failSend(db, COMMUNITY_UPDATE_CAMPAIGN, r.uid, detail);
      failed++;
      console.error(`  ${logRef(r.uid)} FAILED ${detail}`);
    }
  }
  console.log(`${sent} of ${thisRun} sent, ${failed} failed; ${recipients.length - sent} still to send.`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(maskAddresses(e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exit(1);
});
