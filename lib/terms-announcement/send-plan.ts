import { createHash } from 'crypto';
import { isTestAccount } from '@/lib/test-accounts';

/**
 * The pure half of `scripts/send-terms-announcement.ts`: the command line, who
 * receives the notice, the six-week deadline, and what a log may show. No
 * database, no network — `tests/terms-announcement.spec.ts` runs all of it.
 */

/** Never more mails in one run than this: production shares the Resend daily quota. */
export const MAX_PER_RUN = 40;

/** Terms 10.1: the notice reaches the account at least six weeks before the day (receipt day not counted, `lastNoticeDay`). */
export const NOTICE_WEEKS = 6;

/** The profile field (a map keyed by Terms version id) that records a sent notice. Written by the Admin SDK only. */
export const NOTICE_FIELD = 'termsAmendmentNotices';

/* ------------------------------------------------------------------ arguments */

export interface AnnouncementArgs {
  /** True unless `--send` is given. */
  dryRun: boolean;
  /** `--confirm=<n>`: the recipient count the dry run printed. */
  confirm: number | null;
  /** `--limit=<n>`, at most MAX_PER_RUN. */
  limit: number;
  /** `--out=<dir>` for the rendered sample. */
  out: string | null;
  /** `--sample-only`: render the mail from the texts; no database, no network. */
  sampleOnly: boolean;
  /** `--late-ok`: start a real send after the cut-off of the send day (`sendWindowRefusal`). */
  lateOk: boolean;
  /** `--test-to <file>` / `--test-to=<file>`: the test send to the seed mailboxes (`testSendPlan`). */
  testTo: string | null;
  /** `--allow-placeholders`: a test send may go out while the texts still carry an open-value marker. */
  allowPlaceholders: boolean;
}

export class AnnouncementArgsError extends Error {}

export function parseAnnouncementArgs(argv: readonly string[]): AnnouncementArgs {
  const args: AnnouncementArgs = {
    dryRun: true,
    confirm: null,
    limit: MAX_PER_RUN,
    out: null,
    sampleOnly: false,
    lateOk: false,
    testTo: null,
    allowPlaceholders: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--send') args.dryRun = false;
    else if (a === '--late-ok') args.lateOk = true;
    else if (a === '--allow-placeholders') args.allowPlaceholders = true;
    else if (a === '--test-to') {
      const file = argv[i + 1];
      if (!file || file.startsWith('--')) throw new AnnouncementArgsError('--test-to needs a recipient file');
      args.testTo = file;
      i++;
    } else if (a.startsWith('--test-to=')) {
      args.testTo = a.slice('--test-to='.length);
      if (!args.testTo) throw new AnnouncementArgsError('--test-to needs a recipient file');
    }
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--sample-only') args.sampleOnly = true;
    else if (a.startsWith('--confirm=')) {
      const n = Number(a.slice('--confirm='.length));
      if (!Number.isInteger(n) || n < 0) throw new AnnouncementArgsError(`--confirm needs a whole number, got "${a.slice(10)}"`);
      args.confirm = n;
    } else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (!Number.isInteger(n) || n < 1) throw new AnnouncementArgsError(`--limit needs a whole number of at least 1, got "${a.slice(8)}"`);
      if (n > MAX_PER_RUN) throw new AnnouncementArgsError(`--limit may not exceed ${MAX_PER_RUN} (the Resend daily quota is shared with production)`);
      args.limit = n;
    } else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else throw new AnnouncementArgsError(`unknown argument "${a}"`);
  }
  // `--send` together with `--dry-run` is a contradiction, and the safe reading wins.
  if (argv.includes('--dry-run') || args.sampleOnly) args.dryRun = true;
  return args;
}

/**
 * Why a real send may not start, or null. The dry run never sends; a send needs
 * `--confirm` equal to the number of eligible recipients, so the count the
 * operator read in the dry run is the count that is mailed — a database that
 * changed in between stops the run instead of mailing a different list.
 */
export function sendRefusal(args: AnnouncementArgs, eligible: number): string | null {
  if (args.dryRun) return 'dry run';
  if (args.confirm === null) return `--send needs --confirm=<recipient count>; the dry run counts ${eligible}`;
  if (args.confirm !== eligible) return `--confirm=${args.confirm} does not match the ${eligible} eligible recipients — run the dry run again`;
  return null;
}

/* ------------------------------------------------------------------ the deadline */

/** The Berlin calendar day of a moment, ISO. */
export function berlinDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** An ISO day moved by whole days. */
export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/**
 * The last day a notice may be received for an effective day.
 *
 * Six weeks (Terms 10.1), counted the way BGB section 187(1) and 188(2) count
 * them: the day the notice is received does not count, so the period starts on
 * the day after it, and the Terms take effect on the day after the period
 * ends. The last day of receipt is therefore the effective day minus 43 days:
 * for 22 December 2026 it is Monday 9 November 2026 (period 10 November to
 * 21 December). A notice on 10 November is one day short for 22 December.
 */
export function lastNoticeDay(effectiveDateIso: string): string {
  return addDays(effectiveDateIso, -(NOTICE_WEEKS * 7 + 1));
}

/**
 * What to do when the notice cannot go out in time: move the effective day.
 * Mail, attachment and the in-app dialog all read TERMS_EFFECTIVE_DATE_ISO.
 */
export function deadlineFallback(effectiveDateIso: string): string {
  return (
    `If the notice cannot go out on ${lastNoticeDay(effectiveDateIso)}, set TERMS_EFFECTIVE_DATE_ISO to the next day ` +
    `(e.g. ${addDays(effectiveDateIso, 1)}) before sending; mail, attachment and dialog all read that constant.`
  );
}

/** Why no notice may go out today for this effective day, or null. */
export function deadlineRefusal(effectiveDateIso: string | null, now: Date): string | null {
  if (!effectiveDateIso) return 'TERMS_EFFECTIVE_DATE_ISO is not set (lib/legal/open-values.ts)';
  const last = lastNoticeDay(effectiveDateIso);
  const today = berlinDay(now);
  if (today > last) {
    return (
      `today (${today}, Berlin) is later than ${last}, the last day a notice can be received six weeks before the effective day ` +
      `${effectiveDateIso} (Terms 10.1; the day of receipt does not count), so a notice now would be too late. ${deadlineFallback(effectiveDateIso)}`
    );
  }
  return null;
}

/**
 * The day the notice goes out and the hour by which a real send must have
 * started (owner, 06.11.2026: on 09.11 by early afternoon). After that a real
 * send refuses to start unless `--late-ok` is given; the dry run and the test
 * send are not affected.
 */
export const NOTICE_SEND_DAY = '2026-11-09';
export const NOTICE_SEND_CUTOFF = '14:00';

/** Berlin wall-clock time of a moment, `YYYY-MM-DD HH:MM`. */
export function berlinMinute(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** The reminder every run prints. */
export function sendWindowReminder(): string {
  return `the notice goes out on ${NOTICE_SEND_DAY} by ${NOTICE_SEND_CUTOFF} (Berlin); a real send after that needs --late-ok`;
}

/** Why a real send may not start now, or null. Later than the cut-off of the send day, or any later day, refuses. */
export function sendWindowRefusal(now: Date, lateOk: boolean, day: string = NOTICE_SEND_DAY, cutoff: string = NOTICE_SEND_CUTOFF): string | null {
  if (lateOk) return null;
  const at = berlinMinute(now);
  if (at < `${day} ${cutoff}`) return null;
  return `it is ${at} in Berlin, past ${cutoff} on ${day}: a real send does not start now without --late-ok`;
}

/* ------------------------------------------------------------------ stale version ids */

/**
 * Version ids the notice must never name: the draft id v2.3.0 carried before
 * the release date fixed it (2026-11-09). A notice that still names it links a
 * draft address and states a version id no consent record carries.
 */
export const STALE_TERMS_VERSION_IDS: readonly string[] = ['2026-10-23'];

/** Why the rendered notice may not go out because it names a stale version id, or null. */
export function staleVersionRefusal(
  parts: { html: string; text: string; attachments: readonly { filename: string; content: string }[] },
  stale: readonly string[] = STALE_TERMS_VERSION_IDS,
): string | null {
  const where: string[] = [];
  for (const id of stale) {
    if (parts.html.includes(id)) where.push(`mail HTML (${id})`);
    if (parts.text.includes(id)) where.push(`mail text (${id})`);
    for (const a of parts.attachments) if (a.filename.includes(id) || a.content.includes(id)) where.push(`${a.filename} (${id})`);
  }
  return where.length ? `stale version id in the notice: ${where.join(', ')}` : null;
}

/* ------------------------------------------------------------------ the test send */

/** Every test mail carries this in front of its subject. */
export const TEST_SUBJECT_PREFIX = '[TEST] ';

/** At most this many mails per test run: the Resend daily quota is shared with production. */
export const MAX_TEST_MAILS = 10;

export function testSubject(subject: string): string {
  return `${TEST_SUBJECT_PREFIX}${subject}`;
}

/** The mails a test send makes for each recipient: the notice with its attachment, and the community mail. */
export const TEST_MAIL_KINDS = ['notice', 'community-update'] as const;
export type TestMailKind = (typeof TEST_MAIL_KINDS)[number];

export interface TestSendPlanEntry<R extends { label: string }> {
  recipient: R;
  kind: TestMailKind;
}

/**
 * What a test send would send, or why it may not. `--confirm` is the number of
 * mails the dry run printed. Never more than MAX_TEST_MAILS; open-value
 * markers stop it unless `--allow-placeholders`. Nothing here reads or writes
 * an account: a test send records no proof.
 */
export function testSendPlan<R extends { label: string }>(
  recipients: readonly R[],
  args: Pick<AnnouncementArgs, 'dryRun' | 'confirm' | 'allowPlaceholders'>,
  openMarkers: readonly string[],
): { mails: TestSendPlanEntry<R>[]; refusal: string | null } {
  const mails = recipients.flatMap((recipient) => TEST_MAIL_KINDS.map((kind) => ({ recipient, kind })));
  let refusal: string | null = null;
  if (mails.length > MAX_TEST_MAILS) refusal = `${mails.length} test mails, at most ${MAX_TEST_MAILS} per run: shorten the recipient file`;
  else if (args.dryRun) refusal = 'dry run';
  else if (openMarkers.length && !args.allowPlaceholders) refusal = `open values still in the wording (${openMarkers.join(' ')}); add --allow-placeholders to test anyway`;
  else if (args.confirm === null) refusal = `--send needs --confirm=<mail count>; the dry run counts ${mails.length}`;
  else if (args.confirm !== mails.length) refusal = `--confirm=${args.confirm} does not match the ${mails.length} test mails`;
  return { mails, refusal };
}

/* ------------------------------------------------------------------ the send log */

/**
 * One line of the local send log (JSON Lines, beside the sample): the proof
 * of when each notice went out and the provider's message id, per account.
 * The uid and its `acct_` hash, never the address.
 */
export function sendLogLine(entry: { uid: string; sentAt: Date; messageId: string | null; version: string; mailSha256: string }): string {
  return `${JSON.stringify({
    account: logRef(entry.uid),
    uid: entry.uid,
    version: entry.version,
    sentAt: entry.sentAt.toISOString(),
    messageId: entry.messageId,
    mailSha256: entry.mailSha256,
  })}\n`;
}

/* ------------------------------------------------------------------ recipients */

export interface ProfileRow {
  uid: string;
  data: Record<string, unknown>;
}

export interface Recipient {
  uid: string;
  email: string;
  /** The version the account holds now, for the count by version. */
  accepted: string | null;
}

export type SkipReason =
  | 'noEmail'
  | 'testAccount'
  | 'deleted'
  | 'notActive'
  | 'alreadyAccepted'
  | 'alreadyNotified'
  | 'unresolved';

export interface RecipientPlan {
  recipients: Recipient[];
  skipped: Record<SkipReason, number>;
  /** Suspended accounts among the recipients: they still hold a contract (owner, 06.11.2026). */
  suspendedIncluded: number;
  /** How many eligible accounts hold which accepted version ("none" for no record). */
  byAcceptedVersion: Record<string, number>;
}

/** The notice record of `version` on a profile, if any. */
export function noticeRecord(data: Record<string, unknown>, version: string): { state?: unknown } | null {
  const map = data[NOTICE_FIELD];
  if (!map || typeof map !== 'object') return null;
  const rec = (map as Record<string, unknown>)[version];
  return rec && typeof rec === 'object' ? (rec as { state?: unknown }) : null;
}

/**
 * Who receives the notice of `targetVersion`.
 *
 * Every account with a contract, whatever its community-mail setting: this is
 * the contractual notice of Terms 10.1, not community mail, so neither the
 * opt-in nor the community suppression list applies. Left out: no address, CI
 * accounts (`lib/test-accounts.ts`), deleted accounts, accounts that never
 * became active (`pending`: no contract was concluded, Terms 1.2), accounts that already accepted the target version, and accounts
 * whose notice is recorded — `sent`, or `sending` (asked of the provider and
 * never confirmed: a person checks the provider log; never sent twice).
 */
export function planRecipients(rows: readonly ProfileRow[], targetVersion: string): RecipientPlan {
  const skipped: Record<SkipReason, number> = {
    noEmail: 0,
    testAccount: 0,
    deleted: 0,
    notActive: 0,
    alreadyAccepted: 0,
    alreadyNotified: 0,
    unresolved: 0,
  };
  const recipients: Recipient[] = [];
  const byAcceptedVersion: Record<string, number> = {};
  const seen = new Set<string>();
  let suspendedIncluded = 0;
  for (const { uid, data } of rows) {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) { skipped.noEmail++; continue; }
    if (isTestAccount(email)) { skipped.testAccount++; continue; }
    const status = typeof data.status === 'string' ? data.status : 'pending';
    if (status === 'deleted') { skipped.deleted++; continue; }
    // A suspended account still holds a contract and gets the notice (owner, 06.11.2026):
    // status 'suspended', a disabled sign-in, or the pre-v2.4.2 revocation that wrote
    // 'pending' with the limit zeroed (`activateAccount`, lib/firebase-admin.ts).
    const suspended = status === 'suspended' || data.disabled === true || (status === 'pending' && data.transformationsLimit === 0);
    if (status !== 'approved' && !suspended) { skipped.notActive++; continue; }
    const accepted = typeof data.termsVersionAccepted === 'string' && data.termsVersionAccepted ? data.termsVersionAccepted : null;
    if (accepted === targetVersion) { skipped.alreadyAccepted++; continue; }
    const rec = noticeRecord(data, targetVersion);
    if (rec?.state === 'sent') { skipped.alreadyNotified++; continue; }
    if (rec?.state === 'sending') { skipped.unresolved++; continue; }
    // Two profiles with one address get one notice.
    if (seen.has(email)) { skipped.alreadyNotified++; continue; }
    seen.add(email);
    recipients.push({ uid, email, accepted });
    if (suspended) suspendedIncluded++;
    const k = accepted ?? 'none';
    byAcceptedVersion[k] = (byAcceptedVersion[k] ?? 0) + 1;
  }
  // A stable order that is not the address: runs of at most MAX_PER_RUN continue where the last stopped.
  recipients.sort((a, b) => logRef(a.uid).localeCompare(logRef(b.uid)));
  return { recipients, skipped, suspendedIncluded, byAcceptedVersion };
}

/* ------------------------------------------------------------------ the log */

/**
 * What a log line may name for an account: a short hash of the uid. Never the
 * address — the repository's Actions logs are public, and the survey scripts
 * leaked addresses into them before (15.09.2026).
 */
export function logRef(uid: string): string {
  return `acct_${createHash('sha256').update(uid).digest('hex').slice(0, 10)}`;
}

/** Any address in a provider message, masked. */
export function maskAddresses(text: string): string {
  return text.replace(/[^\s@"'<>()]+@[^\s@"'<>()]+/g, '[address]');
}

/** The Resend idempotency key of one notice: no address in it. */
export function noticeIdempotencyKey(version: string, uid: string): string {
  return `terms-notice/${version}/${logRef(uid)}`;
}
