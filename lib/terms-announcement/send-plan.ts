import { createHash } from 'crypto';
import { isTestAccount } from '@/lib/test-accounts';

/**
 * The pure half of `scripts/send-terms-announcement.ts`: the command line, who
 * receives the notice, the six-week deadline, and what a log may show. No
 * database, no network — `tests/terms-announcement.spec.ts` runs all of it.
 */

/** Never more mails in one run than this: production shares the Resend daily quota. */
export const MAX_PER_RUN = 40;

/** Terms 10.1: the notice reaches the account at least six weeks before the day. */
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
}

export class AnnouncementArgsError extends Error {}

export function parseAnnouncementArgs(argv: readonly string[]): AnnouncementArgs {
  const args: AnnouncementArgs = { dryRun: true, confirm: null, limit: MAX_PER_RUN, out: null, sampleOnly: false };
  for (const a of argv) {
    if (a === '--send') args.dryRun = false;
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

/** The last day a notice may go out for an effective day: six weeks before it. */
export function lastNoticeDay(effectiveDateIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveDateIso);
  if (!m) throw new Error(`not an ISO date: ${effectiveDateIso}`);
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  day.setUTCDate(day.getUTCDate() - NOTICE_WEEKS * 7);
  return day.toISOString().slice(0, 10);
}

/** Why no notice may go out today for this effective day, or null. */
export function deadlineRefusal(effectiveDateIso: string | null, now: Date): string | null {
  if (!effectiveDateIso) return 'TERMS_EFFECTIVE_DATE_ISO is not set (lib/legal/open-values.ts)';
  const last = lastNoticeDay(effectiveDateIso);
  const today = berlinDay(now);
  if (today > last) {
    return `today (${today}, Berlin) is later than ${last}, six weeks before the effective day ${effectiveDateIso} — a notice now would be too late under Terms 10.1`;
  }
  return null;
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
  | 'suspended'
  | 'notActive'
  | 'alreadyAccepted'
  | 'alreadyNotified'
  | 'unresolved';

export interface RecipientPlan {
  recipients: Recipient[];
  skipped: Record<SkipReason, number>;
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
 * accounts (`lib/test-accounts.ts`), deleted, disabled or suspended accounts,
 * accounts that never became active (`pending`: no contract was concluded,
 * Terms 1.2), accounts that already accepted the target version, and accounts
 * whose notice is recorded — `sent`, or `sending` (asked of the provider and
 * never confirmed: a person checks the provider log; never sent twice).
 */
export function planRecipients(rows: readonly ProfileRow[], targetVersion: string): RecipientPlan {
  const skipped: Record<SkipReason, number> = {
    noEmail: 0,
    testAccount: 0,
    deleted: 0,
    suspended: 0,
    notActive: 0,
    alreadyAccepted: 0,
    alreadyNotified: 0,
    unresolved: 0,
  };
  const recipients: Recipient[] = [];
  const byAcceptedVersion: Record<string, number> = {};
  const seen = new Set<string>();
  for (const { uid, data } of rows) {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) { skipped.noEmail++; continue; }
    if (isTestAccount(email)) { skipped.testAccount++; continue; }
    const status = typeof data.status === 'string' ? data.status : 'pending';
    if (status === 'deleted' || data.disabled === true) { skipped.deleted++; continue; }
    if (status === 'suspended') { skipped.suspended++; continue; }
    if (status !== 'approved') { skipped.notActive++; continue; }
    const accepted = typeof data.termsVersionAccepted === 'string' && data.termsVersionAccepted ? data.termsVersionAccepted : null;
    if (accepted === targetVersion) { skipped.alreadyAccepted++; continue; }
    const rec = noticeRecord(data, targetVersion);
    if (rec?.state === 'sent') { skipped.alreadyNotified++; continue; }
    if (rec?.state === 'sending') { skipped.unresolved++; continue; }
    // Two profiles with one address get one notice.
    if (seen.has(email)) { skipped.alreadyNotified++; continue; }
    seen.add(email);
    recipients.push({ uid, email, accepted });
    const k = accepted ?? 'none';
    byAcceptedVersion[k] = (byAcceptedVersion[k] ?? 0) + 1;
  }
  // A stable order that is not the address: runs of at most MAX_PER_RUN continue where the last stopped.
  recipients.sort((a, b) => logRef(a.uid).localeCompare(logRef(b.uid)));
  return { recipients, skipped, byAcceptedVersion };
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
