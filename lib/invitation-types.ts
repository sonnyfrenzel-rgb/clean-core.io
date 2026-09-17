/**
 * The invitation record, as types only.
 *
 * ⚠️ TEMPORARY. The shape below is the data contract for roadmap 5.1–5.5, and
 * the file that owns it is `lib/invitations.ts`, built in parallel by the strand
 * that implements inviting and accepting. This module exists so that 5.4
 * (Einsicht) and 5.5 (Übersicht und Widerruf) could be built against the
 * contract before that file landed; at the merge it is deleted and every import
 * of it is redirected to `lib/invitations.ts`.
 *
 * It declares no behaviour on purpose — no reads, no writes, no defaults — so
 * that there is nothing here to disagree with the real implementation about.
 */

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  projectId: string;
  /** Lower-cased and trimmed. */
  email: string;
  invitedBy: { uid: string; name: string };
  /** Server clock, ISO 8601. */
  invitedAt: string;
  /** Server clock, ISO 8601. */
  expiresAt: string;
  status: InvitationStatus;
  acceptedBy: { uid: string; email: string } | null;
  acceptedAt: string | null;
  revokedAt: string | null;
}
