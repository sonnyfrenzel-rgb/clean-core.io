import type { Firestore } from 'firebase-admin/firestore';
import { isTestAccount } from './test-accounts';

/**
 * Weekly adoption metrics for the admin report.
 *
 * The question the report exists to answer is not "how much was used" but "is
 * adoption moving". So every headline number is a week-over-week comparison, and
 * the hero figure is the activation rate — how many approved accounts have ever
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

export interface Cohort {
  uid: string;
  email: string;
  name: string;
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
  /** Registered during the reporting week — worth a personal follow-up. */
  newAccounts: { name: string; email: string; when: Date | null }[];
  /** Completed their first ever analysis during the week — the adoption signal. */
  newlyActivated: { name: string; email: string; runs: number }[];
  /** Ran out of free units — a conversation, not a problem. */
  reachedLimit: { name: string; email: string }[];
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  const maybe = value as { toDate?: () => Date };
  if (typeof maybe.toDate === 'function') return maybe.toDate();
  const parsed = new Date(value as string);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const inWindow = (d: Date | null, from: Date, to: Date) => !!d && d >= from && d < to;

/**
 * @param periodEnd end of the reporting week (exclusive); defaults to now
 */
export async function buildUsageReport(db: Firestore, periodEnd: Date = new Date()): Promise<UsageReport> {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const periodStart = new Date(periodEnd.getTime() - WEEK_MS);
  const previousStart = new Date(periodStart.getTime() - WEEK_MS);

  const [usersSnap, projectsSnap, runsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('projects').get(),
    db.collectionGroup('runs').get(),
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
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || 'Unbenannt',
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
    runs: runs.filter((r) => inWindow(r.at, from, to)).length,
    projects: projects.filter((p) => inWindow(p.at, from, to)).length,
    // One metered run is one unit; unmetered accounts consume none.
    units: runs.filter((r) => inWindow(r.at, from, to) && !byUid.get(r.userId)?.unmetered).length,
  });

  const activatedUids = new Set(firstRunByUser.keys());

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
    newAccounts: cohort
      .filter((u) => inWindow(u.createdAt, periodStart, periodEnd))
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .map((u) => ({ name: u.name, email: u.email, when: u.createdAt })),
    newlyActivated: [...firstRunByUser.entries()]
      .filter(([, at]) => inWindow(at, periodStart, periodEnd))
      .map(([uid]) => {
        const u = byUid.get(uid)!;
        return { name: u.name, email: u.email, runs: runCountInPeriod.get(uid) || 0 };
      })
      .sort((a, b) => b.runs - a.runs),
    reachedLimit: cohort
      .filter((u) => u.atLimit)
      .map((u) => ({ name: u.name, email: u.email })),
  };
}
