/**
 * How a delivery status moves when the provider reports an event — one rule
 * for every delivery record (`lib/email-events.ts`,
 * `lib/invitation-delivery-record.ts`). Pure.
 *
 * Ordered worst-to-best is deliberate: a message that bounces after a delivery
 * event has still bounced, and the summary must not be overwritten by a later
 * `opened` from a scanner. Only a strictly higher rank replaces the current one,
 * except for the terminal negatives, which always win.
 */
export const RANK: Record<string, number> = {
  'email.sent': 1,
  'email.delivery_delayed': 2,
  'email.delivered': 3,
  'email.opened': 4,
  'email.clicked': 5,
};
export const TERMINAL_NEGATIVE: ReadonlySet<string> = new Set(['email.bounced', 'email.complained']);

/** Whether an incoming event replaces the current status. */
export function mailStatusWins(current: string | null | undefined, incoming: string): boolean {
  if (TERMINAL_NEGATIVE.has(incoming)) return true;
  if (!current) return true;
  if (TERMINAL_NEGATIVE.has(current)) return false;
  return (RANK[incoming] ?? 0) > (RANK[current] ?? 0);
}
