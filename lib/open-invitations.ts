import { effectiveStatus, type Invitation, type InvitationStatus } from '@/lib/invitations';

/**
 * Which invitations of a project are still waiting — pure, so the two owner
 * routes and a spec read the same rule (owner decision 01.10.2026).
 */

/** One invitation still waiting, as the owner is shown it. Nothing about anyone else. */
export interface OpenInvitation {
  id: string;
  /** The address it was sent to — the owner typed it. */
  email: string;
  invitedAt: string;
  expiresAt: string;
}

/** A Firestore Timestamp, a Date or an ISO string, as ISO — or ''. */
function isoOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  const maybe = value as { toDate?: () => Date } | null;
  if (maybe && typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
  return '';
}

/**
 * The open ones only, soonest expiry first. Accepted invitations are the
 * readers list's business, and revoked and expired ones grant nothing and are
 * not waiting for anybody.
 */
export function openInvitationsOf(
  docs: ReadonlyArray<{ id: string; data: () => Record<string, unknown> }>,
  projectId: string,
  now: Date = new Date(),
): OpenInvitation[] {
  const open: OpenInvitation[] = [];
  for (const doc of docs) {
    const data = doc.data() || {};
    if (data.projectId !== projectId) continue;
    const expiresAt = isoOf(data.expiresAt);
    const status = data.status as InvitationStatus;
    if (effectiveStatus({ status, expiresAt } as Pick<Invitation, 'status' | 'expiresAt'>, now) !== 'pending') continue;
    open.push({
      id: doc.id,
      email: typeof data.email === 'string' ? data.email : '',
      invitedAt: isoOf(data.invitedAt),
      expiresAt,
    });
  }
  return open.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
