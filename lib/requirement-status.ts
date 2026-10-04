import type { SemanticState } from '@/lib/provenance';

/**
 * Where one requirement of the specification stands — a fixed list (DESIGN.md
 * §4.1, ADR-078), next to `lib/provenance.ts` and the requirement priority.
 *
 *   - **Draft** — written down, nobody has said yes or no to it yet.
 *   - **Accepted** — the account said it belongs in the specification: a
 *     self-declaration of the signed-in account, never a mandate, so it carries
 *     the colour of *Confirmed*, never the green of *Proven*.
 *   - **Needs clarification** — somebody has to answer a question first; it is
 *     counted with the open decisions.
 *   - **Rejected** — kept in the document so the implementer sees what is not
 *     to be built, and why.
 *
 * Shape: an identifier — rectangle, radius 4 px, icon and word in 12 px / 600
 * (§1.2) — in the state's foreground on a white surface. It is not an object
 * status (text with a dot) and not a provenance chip (pill): it says what the
 * account decided about one requirement, nothing about where it came from.
 */
export type RequirementStatus = 'draft' | 'accepted' | 'clarify' | 'rejected';

export const REQUIREMENT_STATUSES: readonly RequirementStatus[] = Object.freeze([
  'draft',
  'accepted',
  'clarify',
  'rejected',
] as RequirementStatus[]);

export const REQUIREMENT_STATUS_LABEL: Readonly<Record<RequirementStatus, string>> = Object.freeze({
  draft: 'Draft',
  accepted: 'Accepted',
  clarify: 'Needs clarification',
  rejected: 'Rejected',
});

export const REQUIREMENT_STATUS_STATE: Readonly<Record<RequirementStatus, SemanticState>> = Object.freeze({
  draft: 'neutral',
  accepted: 'information',
  clarify: 'warning',
  rejected: 'error',
});

export function isRequirementStatus(value: unknown): value is RequirementStatus {
  return typeof value === 'string' && (REQUIREMENT_STATUSES as readonly string[]).includes(value);
}
