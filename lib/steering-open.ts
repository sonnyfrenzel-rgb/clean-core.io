/**
 * "Open the steering one-pager" from wherever a manager looks for it — the
 * decision card and the Export menu (owner, 04.10.2026: "much better but
 * hardly findable"). The page itself stays one component under the decision
 * (`components/workspace/SteeringOnePager.tsx`); these entries only ask it to
 * open, through a window event, the way "Show tips again" asks the open screen
 * to reread its tips (`lib/show-tips-again.ts`). A link with
 * `#steering-one-pager` opens it on arrival too.
 *
 * No account field, no route, no write anywhere.
 */
export const STEERING_OPEN_EVENT = 'cc-open-steering-one-pager';
export const STEERING_ANCHOR = 'steering-one-pager';

export function openSteeringOnePager(): void {
  try {
    window.dispatchEvent(new CustomEvent(STEERING_OPEN_EVENT));
  } catch {
    /* no window — nothing on screen to open */
  }
}
