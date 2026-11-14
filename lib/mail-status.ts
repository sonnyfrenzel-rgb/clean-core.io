/**
 * How a delivery status moves when the provider reports an event — one rule
 * for every delivery record (`lib/email-events.ts`,
 * `lib/invitation-delivery-record.ts`). Pure.
 *
 * Ordered worst-to-best is deliberate: a message that bounces after a delivery
 * event has still bounced. Only a strictly higher rank replaces the current
 * one, except for the terminal negatives, which always win.
 */
export const RANK: Record<string, number> = {
  'email.sent': 1,
  'email.delivery_delayed': 2,
  'email.delivered': 3,
};
export const TERMINAL_NEGATIVE: ReadonlySet<string> = new Set(['email.bounced', 'email.complained']);

/**
 * Open and click tracking. It is switched off in the mail provider's account,
 * and the platform does not record either event: a webhook that carries one
 * is acknowledged and dropped (`lib/email-events.ts`), so switching tracking
 * on in the provider's settings cannot quietly start a record of who opened
 * or clicked a mail. The weekly report counts delivery only.
 *
 * Kept as a list so a delivery record written while tracking may have been on,
 * whose status is still one of these, reads as what it implies: delivered
 * (`isDeliveredStatus`).
 */
export const ENGAGEMENT_EVENTS: ReadonlySet<string> = new Set(['email.opened', 'email.clicked']);

/** An open or a click: never recorded. */
export function isEngagementEvent(type: string | null | undefined): boolean {
  return typeof type === 'string' && ENGAGEMENT_EVENTS.has(type);
}

/** Delivered — including an older record whose status is an open or a click, which implies delivery. */
export function isDeliveredStatus(status: string | null | undefined): boolean {
  return status === 'email.delivered' || isEngagementEvent(status);
}

/** The rank of a status; an older record's open or click ranks as the delivery it implies. */
export function rankOf(status: string | null | undefined): number {
  if (typeof status !== 'string') return 0;
  return RANK[isEngagementEvent(status) ? 'email.delivered' : status] ?? 0;
}

/** Whether an incoming event replaces the current status. */
export function mailStatusWins(current: string | null | undefined, incoming: string): boolean {
  if (TERMINAL_NEGATIVE.has(incoming)) return true;
  if (!current) return true;
  if (TERMINAL_NEGATIVE.has(current)) return false;
  return rankOf(incoming) > rankOf(current);
}
