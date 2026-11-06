/**
 * Sends the notice of an amendment of the Terms of Service (Terms 10.1) to
 * every account with a contract — the announcement of Terms v2.3.0.
 *
 *   npx tsx scripts/send-terms-announcement.ts --sample-only
 *       renders the mail from the texts as they are now and writes it to
 *       tmp/terms-announcement/<version>/ — no database, no network
 *   npx tsx scripts/send-terms-announcement.ts
 *       DRY RUN (the default): reads the accounts, prints the recipient count,
 *       checks the published version pages and writes the rendered sample.
 *       Sends nothing.
 *   npx tsx scripts/send-terms-announcement.ts --send --confirm=<count>
 *       sends to at most 40 recipients (`--limit=<n>` for fewer), then stops;
 *       run the dry run again for the next batch and confirm its new count.
 *       On 09.11.2026 after 14:00 Berlin (or any later day) a real send does not
 *       start without `--late-ok`; every run prints the reminder.
 *   npx tsx scripts/send-terms-announcement.ts --test-to scratch/<file> [--send --confirm=<mails>] [--allow-placeholders]
 *       TEST SEND to the seed mailboxes: one "<label> <address>" per line, #
 *       for comments (the format of scripts/mail-seed-test.ts). Each recipient
 *       gets the exact final notice with its attachment and the community mail
 *       (`lib/terms-announcement/community-update.ts`), each subject prefixed
 *       "[TEST] "; at most 10 mails per run. It records no proof, writes nothing
 *       to Firestore, touches no account and ignores the send window and the
 *       six-week deadline; it still refuses while the wording carries an open-value
 *       marker, unless `--allow-placeholders`. Logs labels and counts, never an address.
 *
 * The notice is generated at run time from the live texts
 * (`lib/terms-announcement/changes.ts`): the clauses, their old and new
 * wording and the reasons are what the texts say on the day it runs.
 *
 * What makes a send refuse: no `--confirm` or a count that does not match; a
 * changed clause without a reason; an "[open: …]" marker still in the new
 * wording; German and English clause lists that differ; TERMS_EFFECTIVE_DATE_ISO
 * not set, or today later than six weeks before it; a version page that does
 * not answer 200; no RESEND_API_KEY outside the emulator.
 *
 * Proof of sending: besides the record on the profile (below), every sent
 * notice appends one line to `send-log.jsonl` beside the sample: account hash,
 * uid, version, time sent and the provider's message id (`sendLogLine`).
 *
 * Idempotent: before each mail the account's profile gets
 * `termsAmendmentNotices.<version>` in state `sending` (in a transaction, so two
 * runs cannot both claim it), and `sent` with the provider's message id and the
 * time afterwards. A re-run skips both. That record — version, effective day,
 * the digest of the change list and of the mail — is the proof of notice. A
 * record left in `sending` is never retried automatically: check the Resend log
 * and set it to `sent` or delete it.
 *
 * Never prints an address: counts and `acct_<hash>` only. The Actions logs of
 * this repository are public.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FieldPath, type DocumentReference, type QueryDocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { getAdminDb } from '../lib/firebase-admin';
import { sendTransactionalMail } from '../lib/transactional-mail';
import { USER_MAIL_FROM, USER_MAIL_REPLY_TO } from '../lib/constants';
import { unsubscribeUrls } from '../lib/community-mail';
import { buildCommunityUpdateMail, type CommunityUpdateMail } from '../lib/terms-announcement/community-update';
import { parseRecipientFile } from './lib/mail-seed';
import { TERMS_EFFECTIVE_DATE_ISO } from '../lib/legal/open-values';
import { currentTermsChanges, type TermsChanges } from '../lib/terms-announcement/changes';
import { buildTermsAnnouncementMail, type TermsAnnouncementMail } from '../lib/terms-announcement/mail';
import {
  AnnouncementArgsError,
  NOTICE_FIELD,
  deadlineRefusal,
  lastNoticeDay,
  logRef,
  maskAddresses,
  noticeIdempotencyKey,
  noticeRecord,
  parseAnnouncementArgs,
  planRecipients,
  sendLogLine,
  sendRefusal,
  sendWindowRefusal,
  sendWindowReminder,
  testSendPlan,
  testSubject,
} from '../lib/terms-announcement/send-plan';

/** The notice always links the production site, whatever this process's APP_BASE_URL says. */
const PUBLIC_BASE = 'https://clean-core.io';
const PAUSE_MS = 700;
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RESEND_API_KEY from the environment or .env.local; never printed. */
function loadResendKey(): boolean {
  if (process.env.RESEND_API_KEY) return true;
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return false;
  const line = fs.readFileSync(p, 'utf8').replace(/\r/g, '').split('\n').find((l) => l.startsWith('RESEND_API_KEY='));
  const v = line?.slice('RESEND_API_KEY='.length).replace(/^["']|["']$/g, '').trim();
  if (v) process.env.RESEND_API_KEY = v;
  return !!v;
}

function printChanges(c: TermsChanges): string[] {
  const problems: string[] = [];
  console.log(`terms     : ${c.from.label} (${c.from.version}) -> ${c.to.label} (${c.to.version})`);
  console.log(`changes   : ${c.changes.length} provisions, digest ${c.digest.slice(0, 16)}…`);
  for (const ch of c.changes) {
    console.log(`  ${ch.id.padEnd(11)} ${ch.kind.padEnd(8)} ${ch.reason ? `10.4 ${ch.reason.letters.join(',')}` : 'NO REASON'}`);
  }
  if (c.missingReasons.length) problems.push(`no reason for: ${c.missingReasons.join(', ')} (lib/terms-announcement/reasons.ts)`);
  if (c.openMarkers.length) problems.push(`open values still in the new wording: ${c.openMarkers.join(' ')}`);
  if (c.clauseIds.de.join('|') !== c.clauseIds.en.join('|')) problems.push('the German and English clause lists differ');
  if (c.staleReasons.length) console.log(`note      : reasons for clauses that no longer change: ${c.staleReasons.join(', ')}`);
  return problems;
}

/** The community mail as a sample: a placeholder unsubscribe link that no key has signed. */
function sampleCommunityMail(effective: string): CommunityUpdateMail {
  return buildCommunityUpdateMail({
    plannedDayIso: effective,
    consentedOnIso: null,
    unsubscribeUrl: unsubscribeUrls(PUBLIC_BASE, 'sample-token-not-signed').page,
    baseUrl: PUBLIC_BASE,
  });
}

function writeSample(dir: string, c: TermsChanges, mail: TermsAnnouncementMail | null, extra: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  // The HTML twin of the attachment is gone (06.11.2026); an old copy must not look current.
  for (const stale of fs.readdirSync(dir)) if (stale.startsWith('aenderungen-nutzungsbedingungen-') && stale.endsWith('.html')) fs.rmSync(path.join(dir, stale));
  if (mail) {
    fs.writeFileSync(path.join(dir, 'notice.html'), mail.html, 'utf8');
    fs.writeFileSync(path.join(dir, 'notice.txt'), mail.text, 'utf8');
    for (const a of mail.attachments) fs.writeFileSync(path.join(dir, a.filename), a.content, 'utf8');
    const community = sampleCommunityMail(TERMS_EFFECTIVE_DATE_ISO ?? '2026-12-22');
    fs.writeFileSync(path.join(dir, 'community-update.html'), community.html, 'utf8');
    fs.writeFileSync(path.join(dir, 'community-update.txt'), community.text, 'utf8');
  }
  const summary = {
    from: c.from,
    to: c.to,
    changesDigest: c.digest,
    changes: c.changes.map((ch) => ({ id: ch.id, kind: ch.kind, reason: ch.reason })),
    missingReasons: c.missingReasons,
    openMarkers: c.openMarkers,
    mail: mail
      ? {
          subject: mail.subject,
          sha256: mail.sha256,
          htmlBytes: Buffer.byteLength(mail.html),
          textBytes: Buffer.byteLength(mail.text),
          attachments: mail.attachments.map((a) => ({ filename: a.filename, bytes: Buffer.byteLength(a.content), sha256: a.sha256 })),
          paths: mail.paths,
        }
      : null,
    ...extra,
  };
  fs.writeFileSync(path.join(dir, 'notice.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`sample    : ${path.relative(process.cwd(), dir)}${path.sep} (notice.html, notice.txt, notice.json${mail ? `, ${mail.attachments.map((a) => a.filename).join(', ')}, community-update.html, community-update.txt` : ''})`);
}

async function checkPublished(paths: Record<'de' | 'en', string>): Promise<string[]> {
  const problems: string[] = [];
  for (const lang of ['de', 'en'] as const) {
    const url = `${PUBLIC_BASE}${paths[lang]}`;
    try {
      const res = await fetch(url, { redirect: 'manual' });
      console.log(`page      : ${paths[lang]} -> ${res.status}`);
      if (res.status !== 200) problems.push(`${url} answers ${res.status}, not 200 — the fixed version page must exist before the notice goes out`);
    } catch (e) {
      problems.push(`${url} could not be reached (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return problems;
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

  console.log(`reminder  : ${sendWindowReminder()}`);
  const changes = currentTermsChanges();
  const problems = printChanges(changes);
  const effective = TERMS_EFFECTIVE_DATE_ISO;
  console.log(`effective : ${effective ?? '(not set)'}${effective ? `, last day to send: ${lastNoticeDay(effective)}` : ''}`);
  const mail = effective ? buildTermsAnnouncementMail({ changes, effectiveDateIso: effective, baseUrl: PUBLIC_BASE }) : null;
  if (mail) {
    console.log(`subject   : ${mail.subject}`);
    console.log(`mail      : html ${Buffer.byteLength(mail.html)} bytes, text ${Buffer.byteLength(mail.text)} bytes, sha256 ${mail.sha256.slice(0, 16)}…`);
    for (const a of mail.attachments) console.log(`attachment: ${a.filename} ${Buffer.byteLength(a.content)} bytes, sha256 ${a.sha256.slice(0, 16)}…`);
    if (Buffer.byteLength(mail.html) > 102_000) console.log('note      : the HTML part is larger than 102 kB; Gmail shows the rest behind "View entire message".');
  }
  const outDir = path.resolve(args.out ?? path.join('tmp', 'terms-announcement', changes.to.version));

  if (args.sampleOnly) {
    writeSample(outDir, changes, mail, { mode: 'sample-only' });
    for (const p of problems) console.log(`NOT READY : ${p}`);
    return;
  }

  if (args.testTo) {
    await testSend(args, changes, effective, problems);
    return;
  }

  if (!mail) problems.push('TERMS_EFFECTIVE_DATE_ISO is not set (lib/legal/open-values.ts)');
  else problems.push(...(await checkPublished(mail.paths)));
  const late = deadlineRefusal(effective, new Date());
  if (late) problems.push(late);
  // The send day's cut-off: only a real send is held by it (the dry run reports it).
  const window = sendWindowRefusal(new Date(), args.lateOk);
  if (window) {
    if (args.dryRun) console.log(`note      : ${window}`);
    else problems.push(window);
  }

  const { db, FieldValue } = await getAdminDb();
  const users = await db.collection('users').get();
  const plan = planRecipients(users.docs.map((d: QueryDocumentSnapshot) => ({ uid: d.id, data: d.data() })), changes.to.version);
  console.log(`database  : ${EMULATOR ? 'EMULATOR' : 'production'} (${users.size} profiles)`);
  console.log(`recipients: ${plan.recipients.length}`);
  console.log(`skipped   : ${JSON.stringify(plan.skipped)}`);
  console.log(`suspended : ${plan.suspendedIncluded} among the recipients (they still hold a contract)`);
  console.log(`by version: ${JSON.stringify(plan.byAcceptedVersion)}`);
  if (plan.skipped.unresolved) console.log(`unresolved: ${plan.skipped.unresolved} notice(s) in state "sending" — check the Resend log before anything else`);
  const thisRun = Math.min(plan.recipients.length, args.limit);
  console.log(`this run  : ${thisRun} (at most ${args.limit} per run)`);

  writeSample(outDir, changes, mail, { mode: args.dryRun ? 'dry-run' : 'send', recipients: plan.recipients.length, skipped: plan.skipped, byAcceptedVersion: plan.byAcceptedVersion });

  const refusal = sendRefusal(args, plan.recipients.length);
  if (refusal === 'dry run') {
    for (const p of problems) console.log(`NOT READY : ${p}`);
    console.log(`DRY RUN — nothing sent. To send: --send --confirm=${plan.recipients.length}`);
    return;
  }
  if (refusal) problems.unshift(refusal);
  if (!loadResendKey() && !EMULATOR) problems.push('RESEND_API_KEY is not set (environment or .env.local)');
  if (problems.length || !mail || !effective) {
    for (const p of problems) console.error(`REFUSED   : ${p}`);
    process.exit(1);
  }

  const record = {
    termsVersion: changes.to.version,
    termsLabel: changes.to.label,
    fromVersion: changes.from.version,
    effectiveDate: effective,
    changesDigest: changes.digest,
    mailSha256: mail.sha256,
    attachments: mail.attachments.map((a) => ({ filename: a.filename, sha256: a.sha256 })),
    subject: mail.subject,
  };
  const field = (...rest: string[]) => new FieldPath(NOTICE_FIELD, changes.to.version, ...rest);

  const sendLog = path.join(outDir, 'send-log.jsonl');
  let sent = 0;
  let failed = 0;
  for (const [i, r] of plan.recipients.slice(0, thisRun).entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    const ref: DocumentReference = db.collection('users').doc(r.uid);
    const claimed = await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const rec = noticeRecord(snap.data() || {}, changes.to.version);
      if (rec && (rec.state === 'sent' || rec.state === 'sending')) return false;
      tx.update(ref, field(), { ...record, state: 'sending', claimedAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) {
      console.log(`  ${logRef(r.uid)} claimed by another run — skipped`);
      continue;
    }
    const outcome = await sendTransactionalMail({
      to: r.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
      label: 'terms-announcement',
      uid: r.uid,
      idempotencyKey: noticeIdempotencyKey(changes.to.version, r.uid),
    });
    if (outcome.delivered && (!outcome.mocked || EMULATOR)) {
      await ref.update(field('state'), 'sent', field('sentAt'), FieldValue.serverTimestamp(), field('messageId'), outcome.messageId);
      fs.appendFileSync(sendLog, sendLogLine({ uid: r.uid, sentAt: new Date(), messageId: outcome.messageId, version: changes.to.version, mailSha256: mail.sha256 }), 'utf8');
      sent++;
      console.log(`  ${logRef(r.uid)} sent (${outcome.messageId ?? 'mock'})`);
    } else {
      const detail = outcome.delivered ? 'mock delivery outside the emulator' : maskAddresses(outcome.detail);
      await ref.update(field('state'), 'failed', field('failedAt'), FieldValue.serverTimestamp(), field('detail'), detail);
      failed++;
      console.error(`  ${logRef(r.uid)} FAILED: ${detail}`);
    }
  }
  console.log('');
  console.log(`${sent} of ${thisRun} sent, ${failed} failed; ${plan.recipients.length - sent} still to notify.`);
  if (sent) console.log(`send log  : ${path.relative(process.cwd(), sendLog)} (${sent} line(s) added)`);
  if (failed) process.exitCode = 1;
}

/**
 * The test send to the seed mailboxes (owner, 06.11.2026): the exact final
 * notice with its attachment and the community mail, "[TEST] " in front of
 * each subject. Straight to Resend, not through `sendTransactionalMail`, which
 * writes an `email_events` record: a test send writes nothing to Firestore,
 * records no proof and touches no account. Prints labels and counts only.
 */
async function testSend(args: ReturnType<typeof parseAnnouncementArgs>, changes: TermsChanges, effective: string | null, problems: string[]): Promise<void> {
  const file = path.resolve(args.testTo as string);
  if (!fs.existsSync(file)) {
    console.error(`REFUSED   : recipient file not found (${path.relative(process.cwd(), file)})`);
    process.exit(1);
  }
  const recipients = parseRecipientFile(fs.readFileSync(file, 'utf8'));
  // No release date yet: the test renders the day the notice proposes.
  const day = effective ?? '2026-12-22';
  const mail = buildTermsAnnouncementMail({ changes, effectiveDateIso: day, baseUrl: PUBLIC_BASE });
  const community = sampleCommunityMail(day);
  const { mails, refusal } = testSendPlan(recipients, args, changes.openMarkers);
  console.log(`TEST SEND : ${recipients.length} recipient(s) (${recipients.map((r) => r.label).join(', ')}), ${mails.length} mail(s): notice with ${mail.attachments.map((a) => a.filename).join(', ')}, and the community mail`);
  console.log('test send : no proof, no Firestore write, no account; send window and six-week deadline not applied');
  for (const p of problems.filter((p) => !p.startsWith('open values'))) console.log(`note      : ${p}`);
  if (refusal === 'dry run') {
    console.log(`DRY RUN — nothing sent. To send: --test-to ${args.testTo} --send --confirm=${mails.length}${changes.openMarkers.length ? ' --allow-placeholders' : ''}`);
    return;
  }
  if (refusal) {
    console.error(`REFUSED   : ${refusal}`);
    process.exit(1);
  }
  if (!loadResendKey()) {
    console.error('REFUSED   : RESEND_API_KEY is not set (environment or .env.local)');
    process.exit(1);
  }
  const run = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  let sent = 0;
  for (const [i, m] of mails.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    const payload =
      m.kind === 'notice'
        ? {
            subject: testSubject(mail.subject),
            html: mail.html,
            text: mail.text,
            attachments: mail.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, 'utf8').toString('base64'), content_type: a.contentType })),
          }
        : {
            subject: testSubject(community.subject),
            html: community.html,
            text: community.text,
            headers: { 'List-Unsubscribe': `<${unsubscribeUrls(PUBLIC_BASE, 'sample-token-not-signed').oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          };
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `terms-notice-test/${run}/${m.recipient.label}/${m.kind}`,
        },
        body: JSON.stringify({ from: USER_MAIL_FROM, reply_to: USER_MAIL_REPLY_TO, to: m.recipient.address, ...payload }),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id?: string };
        sent++;
        console.log(`  ${m.recipient.label.padEnd(14)} ${m.kind.padEnd(16)} sent (${id ?? 'no id'})`);
      } else {
        const body = (await res.json().catch(() => ({}))) as { name?: unknown };
        console.error(`  ${m.recipient.label.padEnd(14)} ${m.kind.padEnd(16)} FAILED status=${res.status} error=${typeof body.name === 'string' ? body.name : 'unknown'}`);
      }
    } catch (e) {
      console.error(`  ${m.recipient.label.padEnd(14)} ${m.kind.padEnd(16)} FAILED ${maskAddresses(e instanceof Error ? e.message : String(e))}`);
    }
  }
  console.log(`${sent} of ${mails.length} test mails sent. Nothing recorded.`);
  if (sent < mails.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(maskAddresses(e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exit(1);
});
