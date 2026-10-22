/**
 * The platform key's daily model budget, with a circuit breaker (SEC-01).
 *
 * Every account has an hourly limit on model calls (`lib/model-hourly-limit.ts`),
 * but nothing bounded the community key as a whole: enough accounts, each
 * within its own limit, could spend it without end. This counts the calls
 * served with the platform key per UTC day in one Firestore document and,
 * once the day's cap is reached, opens the breaker: every further platform
 * call that day is refused before the provider is asked, from memory once this
 * instance has seen the breaker open.
 *
 * Calls on an account's own key (BYOK) are never counted and never refused
 * here — they spend the account's own budget, not the community's.
 *
 * Configured by `PLATFORM_MODEL_DAILY_CALLS` (a positive whole number); unset
 * or unreadable, the safe default below applies. The count is an increment, not
 * a transaction, so concurrent calls never contend for the document; at the
 * edge of the cap a handful of calls in flight can pass together, which a
 * breaker may allow and a bill will not notice.
 *
 * The document holds a date and two numbers — no account, no content — and
 * carries `expiresAt` for a Firestore TTL policy.
 */

export const PLATFORM_BUDGET_COLLECTION = 'platform_model_budget';

/**
 * The default cap: far above what the product spends (94 platform calls in
 * the 14 days to 22.10.2026, a full engine-led generation is at most 64), far
 * below what a farm of accounts would.
 */
export const DEFAULT_PLATFORM_MODEL_DAILY_CALLS = 2_000;
const MAX_CONFIGURABLE_DAILY_CALLS = 1_000_000;

export const PLATFORM_BUDGET_CODE = 'platform-model-budget-exhausted';

export function platformBudgetMessage(): string {
  return (
    `The community model key has reached its daily limit (${PLATFORM_BUDGET_CODE}). ` +
    'It opens again at midnight UTC. Everything the engine computes without a model still works, and an own model key in Settings is not affected.'
  );
}

/** The cap in force: `PLATFORM_MODEL_DAILY_CALLS` when it is a sane whole number, else the default. */
export function platformDailyCallCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PLATFORM_MODEL_DAILY_CALLS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_PLATFORM_MODEL_DAILY_CALLS;
  const n = Number(raw);
  return n >= 1 && n <= MAX_CONFIGURABLE_DAILY_CALLS ? n : DEFAULT_PLATFORM_MODEL_DAILY_CALLS;
}

/** The UTC day a call is counted on, `YYYY-MM-DD`. */
export function budgetDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whether a day's document still admits a call. Decided by the count alone:
 * `open` and `openedAt` record when the breaker tripped, for the operator, and
 * a cap raised by a redeploy admits calls again the same day. An unreadable
 * count reads as zero.
 */
export function budgetAdmits(stored: { calls?: unknown } | undefined, cap: number): boolean {
  const calls = typeof stored?.calls === 'number' && Number.isFinite(stored.calls) ? stored.calls : 0;
  return calls < cap;
}

/** The minimal Firestore surface this needs, so a test can hand in a stand-in. */
export interface BudgetStore {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ data(): Record<string, unknown> | undefined }>;
      set(data: Record<string, unknown>, opts: { merge: true }): Promise<unknown>;
    };
  };
}

/** The day this instance has seen the breaker open, if any. Reset by the day changing. */
let openedOn: string | null = null;

/** For tests only: forget what this instance has seen. */
export function resetPlatformBudgetMemory(): void {
  openedOn = null;
}

/**
 * Count one platform-key call, or refuse it when the day's cap is reached.
 * Throws when the store cannot be read or written; the caller answers that
 * like the hourly limiter does, without spending the key.
 */
export async function reservePlatformModelCall(
  db: BudgetStore,
  increment: (n: number) => unknown,
  opts: { now?: Date; cap?: number } = {},
): Promise<{ ok: true } | { ok: false }> {
  const now = opts.now ?? new Date();
  const day = budgetDay(now);
  if (openedOn === day) return { ok: false };
  const cap = opts.cap ?? platformDailyCallCap();
  const ref = db.collection(PLATFORM_BUDGET_COLLECTION).doc(day);
  const expiresAt = new Date(Date.parse(`${day}T00:00:00.000Z`) + 3 * 24 * 60 * 60 * 1000);
  if (!budgetAdmits((await ref.get()).data(), cap)) {
    openedOn = day;
    await ref.set({ open: true, openedAt: now.toISOString(), cap, expiresAt }, { merge: true });
    return { ok: false };
  }
  await ref.set({ calls: increment(1), cap, expiresAt }, { merge: true });
  return { ok: true };
}
