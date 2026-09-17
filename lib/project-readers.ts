/**
 * Who may read a project besides its owner — roadmap 5.4 and 5.5.
 *
 * One carrier, one place: `projects/{projectId}.readers`, a list of uids whose
 * invitation was accepted and not revoked. `firestore.rules` believes that
 * field and nothing else, this module is the only place that computes it, and
 * every server route that answers for a non-owner reads the same field on the
 * same document. That is what makes a revocation immediate: it is a single
 * write, and after it every path — the rule, the hydration route, the overview
 * — answers "no" from the same fact.
 *
 * Deliberately *not* mirrored onto `projects/{id}/runs/{runId}`. A rule on the
 * run subcollection could then answer without a get(), but a revocation would
 * have to succeed in as many documents as the project has runs, and a
 * revocation that must land everywhere is weaker than one that lands in a
 * single place. Runs stay owner-only in the rules; a reader gets their contents
 * through `GET /api/projects/{projectId}`.
 *
 * Pure: no Firestore, no Admin SDK, no `window`. The callers do the I/O.
 */

import type { Invitation } from './invitation-types';

/** The one field `firestore.rules` reads. Named once, so a rename is one edit. */
export const PROJECT_READERS_FIELD = 'readers';

/** The uids on a project document, defensively: anything that is not a list of strings is no list at all. */
export function projectReaders(projectData: unknown): string[] {
  if (!projectData || typeof projectData !== 'object') return [];
  const value = (projectData as Record<string, unknown>)[PROJECT_READERS_FIELD];
  if (!Array.isArray(value)) return [];
  return value.filter((uid): uid is string => typeof uid === 'string' && uid.length > 0);
}

/**
 * May this uid read the project?
 *
 * The same sentence the rule says, so that a server route and the rules cannot
 * drift apart: owner, or a uid on the readers list. Not "admin" — the operator's
 * read of a project was taken away on 16.09.2026 and 5.4 does not give it back.
 */
export function mayReadProject(projectData: unknown, uid: string | null | undefined): boolean {
  if (!uid) return false;
  const owner = (projectData as { userId?: unknown } | null)?.userId;
  if (typeof owner === 'string' && owner === uid) return true;
  return projectReaders(projectData).includes(uid);
}

/** Owner and reader are different answers, and the routes need to tell them apart. */
export function isProjectOwner(projectData: unknown, uid: string | null | undefined): boolean {
  if (!uid) return false;
  const owner = (projectData as { userId?: unknown } | null)?.userId;
  return typeof owner === 'string' && owner === uid;
}

/** The readers list with `uid` added once — the accept path. */
export function readersAfterGrant(current: unknown, uid: string): string[] {
  const readers = projectReaders(current);
  return readers.includes(uid) ? readers : [...readers, uid];
}

/** The readers list with `uid` gone — the revoke path. Idempotent. */
export function readersAfterRevoke(current: unknown, uid: string): string[] {
  return projectReaders(current).filter((existing) => existing !== uid);
}

/**
 * One line of the owner's overview: who has Einsicht, and since when.
 *
 * Roadmap 5.5 asks for "wer seit wann", and both halves come off the server's
 * own record of the invitation — `acceptedBy` and `acceptedAt` are written by
 * the Admin SDK from the server clock, never from a browser. The address shown
 * is the one the account actually signed in with (`acceptedBy.email`), not the
 * address the invitation was addressed to: those are the same address by the
 * time an invitation is accepted, and showing the one that was *used* is the
 * one that is a fact rather than an intention.
 */
export interface ProjectReaderEntry {
  invitationId: string;
  uid: string;
  email: string;
  /** ISO 8601, server clock — when the invitation was accepted. */
  since: string;
  /** The name the owner typed the invitation under, for the overview's byline. */
  invitedByName: string;
}

/**
 * The overview, derived from the invitations rather than from the uid list.
 *
 * The uid list is what the rule believes; it carries no name and no date, so it
 * cannot answer "seit wann". The invitations carry both. An entry appears only
 * when the two agree: an accepted invitation whose uid is still on the list.
 * A uid on the list with no accepted invitation behind it is a bug worth seeing
 * rather than hiding, so it is returned separately instead of being dropped.
 */
export function projectReaderOverview(
  projectData: unknown,
  invitations: Invitation[],
): { entries: ProjectReaderEntry[]; unaccountedUids: string[] } {
  const readers = projectReaders(projectData);
  const entries: ProjectReaderEntry[] = [];
  const accounted = new Set<string>();

  for (const invitation of invitations) {
    if (invitation.status !== 'accepted') continue;
    const uid = invitation.acceptedBy?.uid;
    if (!uid || !readers.includes(uid) || accounted.has(uid)) continue;
    accounted.add(uid);
    entries.push({
      invitationId: invitation.id,
      uid,
      email: invitation.acceptedBy?.email ?? invitation.email,
      since: invitation.acceptedAt ?? invitation.invitedAt,
      invitedByName: invitation.invitedBy?.name ?? '',
    });
  }

  entries.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
  return { entries, unaccountedUids: readers.filter((uid) => !accounted.has(uid)) };
}
