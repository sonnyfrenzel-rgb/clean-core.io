/**
 * Sends the activation survey invitation.
 *
 * Built on the send outbox in `lib/survey/outbox.ts`, because a bulk send is
 * the one operation here with no undo. Suppressions win, CI
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
import { claimSend, completeSend, failSend, recordInvited, sendIdempotencyKey } from '../lib/survey/outbox';
import { wrapEmailDocument } from '../lib/email-layout';
import { FIRESTORE_DB_ID, APP_BASE_URL } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const FROM = 'Felix from Clean-Core.io <info@clean-core.io>';
const REPLY_TO = 'info@clean-core.io';
const BASE_URL = 'https://clean-core.io';

/**
 * Resend allows two requests a second. This loop awaited one fetch and started
 * the next, which from a CI runner is four to eight a second — so a share of the
 * thirty-odd messages would come back 429, and the old loop logged FAILED and
 * moved on. Those people simply never get asked, the workflow still goes green,
 * and the survey closes in seven days, so the next scheduled run is too late to
 * be a fix. A pause and three attempts cost twenty-five seconds.
 */
const PAUSE_MS = 700;
const ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POSTs one message, retrying the failures that are worth retrying.
 *
 * `idempotencyKey` is what makes those retries safe. A timeout, a 429 or a 5xx
 * can all reach the caller after Resend has already accepted the message, and
 * the attempt after it would then deliver a second copy — the outbox record
 * only stops the *next run*, not the retry inside this one (QA review of
 * 33471220d6e9, finding 2b0cacd91960). The key is derived from the campaign and
 * the address, so every attempt of every run carries the same one.
 */
async function sendWithRetry(
  key: string,
  payload: unknown,
  idempotencyKey: string,
): Promise<{ ok: true; id: string } | { ok: false; detail: string }> {
  let detail = 'no attempt made';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id: string };
        return { ok: true, id };
      }
      detail = `${res.status} ${await res.text()}`;
      // 4xx other than 429 is the message being wrong, and sending it again
      // will not make it right.
      if (res.status !== 429 && res.status < 500) return { ok: false, detail };
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
    }
    if (attempt < ATTEMPTS) {
      const backoff = PAUSE_MS * 2 ** attempt;
      console.log(`    attempt ${attempt} failed (${detail}) — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  return { ok: false, detail };
}

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

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const maybe = v as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * This runs in the Actions log of a public repository. The recipient list is
 * the community's addresses and first names, and it used to be printed in
 * full before every send — plus once more per address on success or failure —
 * so anyone reading the log had the list without an account. Addresses are
 * shown only by a run on a local machine; CI sees counts, positions and
 * provider ids. Provider error bodies can echo the `to` field, so they are
 * masked before they are logged.
 */
const LOCAL = !process.env.CI && !process.env.GITHUB_ACTIONS;
const maskAddresses = (text: string) => text.replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '[address]');

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
  // A send record is written *before* the provider is asked (see the loop in
  // main), so the states mean: `sent` — accepted and recorded; `sending` — the
  // provider was asked and the outcome was never written, which is a message
  // that may well have gone out; `failed` — the provider refused. Only the last
  // is asked again. Records without a state predate the outbox and were only
  // ever written after success.
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

    recipients.push({ uid: doc.id, email, firstName: (u.firstName || '').trim() });
  }

  recipients.sort((a, b) => a.email.localeCompare(b.email));
  return { recipients, skipped, unresolved };
}

async function main() {
  /**
   * Every link in this mail is built from APP_BASE_URL, and APP_BASE_URL falls
   * back to http://localhost:3000 when NEXT_PUBLIC_APP_URL is unset — which it is
   * in any plain `npx tsx` run, and in any workflow step that forgets to pass it.
   * That is exactly what happened to the first three test sends: the message
   * looked right, and every option pointed at the reader's own machine.
   *
   * A survey with dead links is worse than no survey. It reaches thirty-six
   * people, they tap, nothing happens, and the one chance to ask them is spent —
   * quietly, because the send reports success either way. So this refuses.
   */
  if (!APP_BASE_URL.startsWith('https://')) {
    throw new Error(
      `APP_BASE_URL is "${APP_BASE_URL}" — refusing to send links nobody can open. ` +
        'Set NEXT_PUBLIC_APP_URL=https://clean-core.io for this step.',
    );
  }

  const resendKey = APPLY ? readEnv('RESEND_API_KEY') : '';
  process.env.PILOT_APPROVAL_SECRET = readEnv('PILOT_APPROVAL_SECRET');

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const { recipients, skipped, unresolved } = await loadRecipients(db);

  // The closing date is read before it is computed. A resumed send — the weekly
  // cron coming round, or a re-run after a crash — used to derive `closesAt`
  // from its own start time and mail that to the remaining recipients, while
  // the campaign document, the survey page and the digest all kept the date
  // the first run had set. Those people were told a closing day nobody else
  // was working to. The date the campaign opened with is the date everyone
  // gets; only a campaign that has not opened yet gets a new one.
  const campaignRef = db.collection('survey_campaigns').doc(SURVEY_CAMPAIGN);
  const openCampaign = ONLY ? null : (await campaignRef.get()).data();
  const resumed = !!openCampaign?.sentAt;
  const storedClosesAt = resumed ? toDate(openCampaign?.closesAt) : null;
  const closesAt = storedClosesAt ?? new Date(Date.now() + SURVEY_OPEN_DAYS * 24 * 60 * 60 * 1000);
  // The link outlives the survey by a day so a late tap gets the "closed" page
  // rather than a broken one.
  const tokenExpiry = closesAt.getTime() + 24 * 60 * 60 * 1000;
  const closesOn = closesAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`campaign  : ${SURVEY_CAMPAIGN}${resumed ? ' (already open — resuming)' : ''}`);
  console.log(`subject   : ${SURVEY_SUBJECT}`);
  console.log(`from      : ${FROM}`);
  console.log(`closes    : ${closesOn}`);
  console.log(`recipients: ${recipients.length}`);
  console.log(`skipped   : ${JSON.stringify(skipped)}`);
  if (unresolved.length) {
    // Not resent, not counted: nobody knows whether these went out. A person
    // checks the provider's log and sets the record to `sent` or `failed`.
    console.log(`unresolved: ${unresolved.length} send(s) started and never recorded — check the provider log; ${LOCAL ? unresolved.join(', ') : 'listed only by a local run'}`);
  }
  console.log('');
  if (LOCAL) {
    for (const r of recipients) console.log(`  ${r.email}${r.firstName ? ` (${r.firstName})` : ''}`);
  } else {
    console.log(`  (${recipients.length} address${recipients.length === 1 ? '' : 'es'} — listed only by a local run)`);
  }
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
  //
  // `invited` is no longer the size of the recipient list. It used to be
  // written up front as everyone eligible, and a resumed run then added its
  // own list on top — which is exactly the people whose sends had failed the
  // first time and were already counted. It is now derived: after the loop,
  // the campaign document is set to the number of send records in state
  // `sent` (plus records from before the outbox, which were only ever written
  // after success). A counter incremented per send would drift the moment one
  // increment failed after its record was written; a count recomputed from the
  // records cannot. A record stuck in `sending` is not counted, not resent, and
  // reported above as unresolved — the count may run short by those, never long.
  if (!ONLY) {
    if (resumed) {
      // The opening and closing dates were set the first time and must not move:
      // silently extending a survey people were told closes on a given day is a
      // small lie with a long tail.
      await campaignRef.set({ resumedAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log('campaign already open — dates left as they were');
    } else {
      await campaignRef.set(
        {
          campaign: SURVEY_CAMPAIGN,
          sentAt: FieldValue.serverTimestamp(),
          closesAt,
          invited: 0,
        },
        { merge: true },
      );
      console.log('campaign document written');
    }
  } else {
    console.log('--only: test send, campaign document left untouched');
  }

  let sent = 0;
  let failed = 0;
  for (const [index, r] of recipients.entries()) {
    // Paced under Resend's two-a-second limit. Before the first message too:
    // nothing is gained by racing to the front of the queue.
    if (index > 0) await sleep(PAUSE_MS);

    const token = createSurveyToken(SURVEY_CAMPAIGN, r.uid, tokenExpiry);
    const unsubscribeUrl = `${BASE_URL}/api/unsubscribe?t=${encodeURIComponent(createUnsubscribeToken(r.email))}`;

    // The outbox record, claimed before the provider is asked and under a
    // deterministic id. It used to be added after the provider had accepted
    // the message — so a crash or a failed write in between left a delivered
    // mail with no record, and the next run, seeing no record, sent it again.
    // Now the record is there first; whatever happens after, a re-run finds it
    // and does not ask the provider twice.
    //
    // Claimed in a transaction, not merely written: two `--apply` processes —
    // a manual run beside the cron — both read the recipient list before
    // either had written, both wrote `sending`, both sent. The transaction
    // reads the record and writes it in one step, so the second process
    // finds the claim and skips.
    // (lib/survey/outbox.ts holds the transaction; tests/survey-outbox.spec.ts runs it against the emulator.)
    if (!ONLY) {
      const claimed = await claimSend(db, SURVEY_CAMPAIGN, r);
      if (!claimed) {
        console.log(`  claimed by another run: ${LOCAL ? r.email : `#${index + 1}`} — skipped`);
        continue;
      }
    }

    const input = {
      name: escapeHtml(r.firstName),
      recipient: escapeHtml(r.email),
      token,
      closesOn,
      unsubscribeUrl,
    };

    const result = await sendWithRetry(resendKey, {
      from: FROM,
      to: [r.email],
      reply_to: REPLY_TO,
      subject: SURVEY_SUBJECT,
      html: wrapEmailDocument(renderSurveyInviteEmail(input), 'Clean-Core.io survey'),
      text: renderSurveyInviteText(input),
      headers: {
        // RFC 8058. Gmail and Yahoo require both of these from a bulk sender, and
        // `/api/unsubscribe` answers the POST they make.
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }, sendIdempotencyKey(SURVEY_CAMPAIGN, r.email));

    if (!result.ok) {
      failed++;
      // A refusal is final for this run and the record says so, which is what
      // makes the next run try this person again.
      if (!ONLY) await failSend(db, SURVEY_CAMPAIGN, r.uid, maskAddresses(result.detail));
      console.error(
        LOCAL ? `  FAILED ${r.email}: ${result.detail}` : `  FAILED #${index + 1}: ${maskAddresses(result.detail)}`,
      );
      continue;
    }
    const { id } = result;

    if (!ONLY) await completeSend(db, SURVEY_CAMPAIGN, r.uid, id);

    sent++;
    console.log(LOCAL ? `  sent ${r.email} (${id})` : `  sent #${index + 1} (${id})`);
  }

  if (!ONLY) {
    const invited = await recordInvited(db, SURVEY_CAMPAIGN, campaignRef);
    console.log(`invited (from send records): ${invited}`);
  }

  console.log('');
  console.log(`${sent} of ${recipients.length} sent, ${failed} failed.`);
  // A red run. Every failure here is a person who does not get asked, and the
  // survey closes before the next scheduled send would pick them up.
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
