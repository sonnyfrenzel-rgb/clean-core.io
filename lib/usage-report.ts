import type { DocumentData } from 'firebase-admin/firestore';
import { isTestAccount } from './test-accounts';

/**
 * Weekly adoption metrics for the admin report.
 *
 * The question the report exists to answer is not "how much was used" but "is
 * adoption moving". So every headline number is a week-over-week comparison, and
 * the hero figure is the activation rate — how many active accounts have ever
 * completed an analysis, against how many exist. At the time of writing that was
 * 10 of 30, which is the number worth watching.
 *
 * Activity is derived from `runs.createdAt`, not `users.updatedAt`: the latter is
 * only written by `reserveRunQuota` and is simply absent on older accounts, so it
 * would silently understate everything. Runs are the honest signal — one run is one
 * ABAP object taken through the engine.
 *
 * Note that `runs.createdAt` is an ISO **string** (written in /api/runs/create),
 * while the other collections use Firestore Timestamps. ISO strings sort
 * lexicographically, so range comparison still works, but the two must not be
 * conflated.
 */

/**
 * One account as the report counts it. `email` is here for one reason only —
 * `isTestAccount` decides by the address — and it never leaves this module:
 * nothing in `UsageReport` carries it.
 */
export interface Cohort {
  uid: string;
  email: string;
  createdAt: Date | null;
  used: number;
  limit: number;
  distinctObjects: number;
  byok: boolean;
  unmetered: boolean;
  status: string;
  atLimit: boolean;
}

export interface PeriodMetrics {
  registrations: number;
  activations: number;
  /** Distinct accounts that ran at least one analysis — breadth, not volume. */
  activeAccounts: number;
  runs: number;
  projects: number;
  units: number;
}

export interface UsageReport {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  totals: {
    accounts: number;
    activated: number;
    neverStarted: number;
    atLimit: number;
    byok: number;
    unitsUsed: number;
    unitsGranted: number;
    objectsAnalysed: number;
    runsAllTime: number;
  };
  /*
   * Figures only, since 30.09.2026 (Sonny). The three fields below used to be
   * lists of people — name and address of every new account, every account
   * that ran its first analysis and every account at its limit — and the mail
   * carried them out of our infrastructure through a mail provider into an
   * inbox, while `usage_reports` kept a copy that an account erasure never
   * reached. The report asks whether adoption is moving; the numbers answer
   * that, and "who" is in the admin panel, behind a login and a second factor.
   * Nothing in this interface may name, address or identify an account.
   */
  /** Accounts registered during the reporting week. */
  newAccounts: number;
  /**
   * Accounts that completed their first ever analysis during the week — the
   * adoption signal. One entry per such account: how many analyses it ran this
   * week, largest first. The length is the count; no entry says whose it is.
   */
  newlyActivated: number[];
  /** Accounts that have used up their free units — a conversation, not a problem. */
  reachedLimit: number;
  /** What became of the mail the platform sent this week. */
  delivery: DeliveryMetrics;
}

/**
 * Mail the platform sent during the week, and what the provider reported back.
 *
 * A 200 from Resend only means "queued", so before the webhook existed there was
 * nothing to count here: every record sat at `email.sent` for ever. `awaiting` is
 * that state — sent, no verdict yet — and it is reported rather than hidden,
 * because a week where it stays high means the webhook is not wired up, not that
 * the mail failed.
 */
export interface DeliveryMetrics {
  sent: number;
  delivered: number;
  delayed: number;
  bounced: number;
  complained: number;
  opened: number;
  /** Sent, but no delivery event has arrived. */
  awaiting: number;
  /**
   * Messages that did not reach their reader, counted per kind of mail and
   * outcome — `welcome` bounced twice, say. Not per recipient: the address is
   * the recipient, and the provider's reason text usually repeats it, so
   * neither is carried (30.09.2026, figures only).
   */
  failures: { kind: string; status: string; count: number }[];
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const inWindow = (d: Date | null, from: Date, to: Date) => !!d && d >= from && d < to;

/** Failed messages, counted per kind and outcome; most frequent first. */
function countFailures(failed: { kind: string; status: string }[]): DeliveryMetrics['failures'] {
  const counts = new Map<string, { kind: string; status: string; count: number }>();
  for (const m of failed) {
    const key = `${m.status} ${m.kind}`;
    const entry = counts.get(key) ?? { kind: m.kind, status: m.status, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.status.localeCompare(b.status) || a.kind.localeCompare(b.kind),
  );
}

/**
 * What the report reads, and all of it. The Admin SDK's `Firestore` satisfies
 * it, and so does the dependency-free REST client the Friday job uses
 * (`scripts/lib/firestore-rest.ts`): that job holds an OIDC permission and runs
 * no third-party package beside it (QA review, fa0aaea6cc47).
 */
export interface UsageReportSource {
  collection(name: string): { get(): Promise<{ docs: { id: string; data(): DocumentData }[] }> };
  collectionGroup(name: string): { get(): Promise<{ docs: { id: string; data(): DocumentData }[] }> };
}

/**
 * @param periodEnd end of the reporting week (exclusive); defaults to now
 */
export async function buildUsageReport(db: UsageReportSource, periodEnd: Date = new Date()): Promise<UsageReport> {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const periodStart = new Date(periodEnd.getTime() - WEEK_MS);
  const previousStart = new Date(periodStart.getTime() - WEEK_MS);

  const [usersSnap, projectsSnap, runsSnap, mailSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('projects').get(),
    db.collectionGroup('runs').get(),
    // Written by the send calls and by /api/webhooks/resend. Read in full: the
    // collection holds one document per message, and the platform sends a
    // handful a week.
    db.collection('email_events').get(),
  ]);

  // CI accounts are excluded everywhere: they outnumber real users several times
  // over and would make every trend meaningless.
  const cohort: Cohort[] = usersSnap.docs
    .map((d) => {
      const u = d.data();
      const tier = u.tier || 'pilot';
      const byok = u.byokConfigured === true;
      const unmetered = tier === 'enterprise' || byok;
      const used = typeof u.transformationsUsed === 'number' ? u.transformationsUsed : 0;
      const limit = typeof u.transformationsLimit === 'number' ? u.transformationsLimit : 5;
      return {
        uid: d.id,
        email: (u.email || '').toLowerCase(),
        createdAt: toDate(u.createdAt),
        used,
        limit,
        distinctObjects: u.chargedInputs ? Object.keys(u.chargedInputs).length : 0,
        byok,
        unmetered,
        status: u.status || 'pending',
        atLimit: !unmetered && limit > 0 && used >= limit,
      };
    })
    .filter((u) => !isTestAccount(u.email));

  const realUids = new Set(cohort.map((u) => u.uid));
  const byUid = new Map(cohort.map((u) => [u.uid, u]));

  // Runs, oldest first, so the first entry per user is their activation moment.
  const runs = runsSnap.docs
    .map((d) => ({ userId: (d.data().userId || '') as string, at: toDate(d.data().createdAt) }))
    .filter((r) => r.at && realUids.has(r.userId))
    .sort((a, b) => a.at!.getTime() - b.at!.getTime());

  const firstRunByUser = new Map<string, Date>();
  const runCountInPeriod = new Map<string, number>();
  for (const r of runs) {
    if (!firstRunByUser.has(r.userId)) firstRunByUser.set(r.userId, r.at!);
    if (inWindow(r.at, periodStart, periodEnd)) {
      runCountInPeriod.set(r.userId, (runCountInPeriod.get(r.userId) || 0) + 1);
    }
  }

  const projects = projectsSnap.docs
    .map((d) => ({ userId: (d.data().userId || '') as string, at: toDate(d.data().createdAt) }))
    .filter((p) => realUids.has(p.userId));

  const period = (from: Date, to: Date): PeriodMetrics => ({
    registrations: cohort.filter((u) => inWindow(u.createdAt, from, to)).length,
    activations: [...firstRunByUser.values()].filter((d) => inWindow(d, from, to)).length,
    // Ten analyses by one person and ten by ten people mean very different things.
    activeAccounts: new Set(runs.filter((r) => inWindow(r.at, from, to)).map((r) => r.userId)).size,
    runs: runs.filter((r) => inWindow(r.at, from, to)).length,
    projects: projects.filter((p) => inWindow(p.at, from, to)).length,
    // One metered run is one unit; unmetered accounts consume none.
    units: runs.filter((r) => inWindow(r.at, from, to) && !byUid.get(r.userId)?.unmetered).length,
  });

  const activatedUids = new Set(firstRunByUser.keys());

  // Mail sent inside the reporting window. Test recipients are excluded on the
  // same rule as the cohort: CI sends far more mail than real users do, and it
  // would swamp every count here.
  const FAILED = new Set(['email.bounced', 'email.complained']);
  const mail = mailSnap.docs
    .map((d) => {
      const m = d.data();
      const to: string[] = Array.isArray(m.to) ? m.to : m.to ? [m.to] : [];
      return {
        to: to[0] || '',
        kind: (m.kind || 'mail') as string,
        status: (m.status || 'email.sent') as string,
        sentAt: toDate(m.sentAt),
      };
    })
    .filter((m) => inWindow(m.sentAt, periodStart, periodEnd) && !isTestAccount(m.to));

  const countBy = (status: string) => mail.filter((m) => m.status === status).length;
  const delivery: DeliveryMetrics = {
    sent: mail.length,
    delivered: countBy('email.delivered'),
    delayed: countBy('email.delivery_delayed'),
    bounced: countBy('email.bounced'),
    complained: countBy('email.complained'),
    // Opened implies delivered; counted separately rather than folded in, so the
    // delivered figure stays a count of messages that arrived.
    opened: mail.filter((m) => m.status === 'email.opened' || m.status === 'email.clicked').length,
    awaiting: countBy('email.sent'),
    failures: countFailures(mail.filter((m) => FAILED.has(m.status))),
  };

  return {
    generatedAt: new Date(),
    periodStart,
    periodEnd,
    current: period(periodStart, periodEnd),
    previous: period(previousStart, periodStart),
    totals: {
      accounts: cohort.length,
      activated: activatedUids.size,
      neverStarted: cohort.filter((u) => !activatedUids.has(u.uid)).length,
      atLimit: cohort.filter((u) => u.atLimit).length,
      byok: cohort.filter((u) => u.byok).length,
      unitsUsed: cohort.filter((u) => !u.unmetered).reduce((s, u) => s + u.used, 0),
      unitsGranted: cohort.filter((u) => !u.unmetered).reduce((s, u) => s + u.limit, 0),
      objectsAnalysed: cohort.reduce((s, u) => s + u.distinctObjects, 0),
      runsAllTime: runs.length,
    },
    newAccounts: cohort.filter((u) => inWindow(u.createdAt, periodStart, periodEnd)).length,
    newlyActivated: [...firstRunByUser.entries()]
      .filter(([, at]) => inWindow(at, periodStart, periodEnd))
      .map(([uid]) => runCountInPeriod.get(uid) || 0)
      .sort((a, b) => b - a),
    reachedLimit: cohort.filter((u) => u.atLimit).length,
    delivery,
  };
}

/**
 * What the Friday job stores in `usage_reports`, field by field.
 *
 * Named rather than spread: `{ ...report }` stored whatever the report happened
 * to carry, and when it carried people, the snapshot kept them for good. The
 * recipient is not stored either — it is the administrator's address, and the
 * provider id already identifies the message. Timestamps stay `Date`s; the
 * Admin SDK writes them as Firestore Timestamps.
 */
export function usageReportSnapshot(report: UsageReport, extra: { providerId: string }) {
  const { current, previous, totals, delivery } = report;
  return {
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    current: { ...current },
    previous: { ...previous },
    totals: { ...totals },
    newAccounts: report.newAccounts,
    newlyActivated: [...report.newlyActivated],
    reachedLimit: report.reachedLimit,
    delivery: {
      sent: delivery.sent,
      delivered: delivery.delivered,
      delayed: delivery.delayed,
      bounced: delivery.bounced,
      complained: delivery.complained,
      opened: delivery.opened,
      awaiting: delivery.awaiting,
      failures: delivery.failures.map((f) => ({ kind: f.kind, status: f.status, count: f.count })),
    },
    providerId: extra.providerId,
  };
}
