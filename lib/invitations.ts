/**
 * Einsicht per Einladung — the shape of an invitation, and nothing else.
 *
 * Roadmap phase 5 (`docs/ROADMAP.md`, Fassung 2.8): sharing is *read access by
 * invitation* — a link bound to one confirmed e-mail address, including source
 * code, with expiry and revocation. There is exactly one level: reading. No
 * rights tiers, no raw-code switch, no guest without an account.
 *
 * This module is pure on purpose. It imports nothing from Firestore, nothing
 * from `firebase-admin` and nothing from React, so the route that writes an
 * invitation (5.2), the route that accepts one (5.3), the read view (5.4) and
 * the owner's overview (5.5) all agree on one set of field names without any of
 * them having to load the others' machinery. A spec can import it on its own.
 *
 * **Every field comes from the server.** Times are this server's clock,
 * `invitedBy` is the verified ID token and the profile behind it, `acceptedBy`
 * is the accepting token. Nothing here is ever read out of a request body —
 * an invitation whose author, expiry or acceptance the caller chooses is not a
 * grant, it is a form.
 */

/* ------------------------------------------------------------------ status */

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface Invitation {
  id: string;
  projectId: string;
  /** Kleingeschrieben und getrimmt. Die Adresse, an die eingeladen wurde. */
  email: string;
  invitedBy: { uid: string; name: string };
  invitedAt: string;              // Serveruhr, ISO 8601
  expiresAt: string;              // Serveruhr, ISO 8601
  status: InvitationStatus;
  acceptedBy: { uid: string; email: string } | null;
  acceptedAt: string | null;      // Serveruhr
  revokedAt: string | null;       // Serveruhr
}

/* ------------------------------------------------------------------ storage */

/**
 * `projects/{projectId}/invitations/{id}`, written **only** by the Admin SDK.
 *
 * `firestore.rules` has no match for this subcollection, so no browser reads or
 * writes it — the same shape roadmap 3.2 uses for `process_revisions`. Project
 * and account deletion take the invitations with them, because both call
 * `recursiveDelete` on the project document and that descends into every
 * subcollection, named or not.
 */
export const INVITATION_COLLECTION = 'invitations';

/** `projects/{projectId}/invitations` — a path, not a handle. */
export function invitationCollectionPath(projectId: string): string {
  return `projects/${projectId}/${INVITATION_COLLECTION}`;
}

/**
 * The uids with an accepted, un-revoked invitation — **on the project document
 * itself**, written exclusively by the Admin SDK and absent from the client
 * allowlist in `firestore.rules`.
 *
 * The placement is the whole point, and it is a rules decision rather than a
 * modelling one. A rule can compare `readers` against `request.auth.uid` on the
 * *same document that is being read*: no extra document lookup, no second
 * round trip, nothing to pay per evaluation. A rule-side `get()` into the
 * invitations subcollection would cost one document read for every rule
 * evaluation — and `firestore.rules` already carries two notes saying that
 * `get()` produced evaluation errors in the emulator, which is why
 * `getUserData()` and the Firestore-backed `isAdmin()` were removed from it.
 *
 * It is server-only for the obvious reason: a field a browser could write is a
 * field a browser can use to invite itself.
 */
export const PROJECT_READERS_FIELD = 'readers';

/* ------------------------------------------------------------------- expiry */

/** Default lifetime of an invitation, in days. */
export const INVITATION_DEFAULT_DAYS = 14;
/** The longest an owner may keep one open. */
export const INVITATION_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The expiry the server puts on an invitation.
 *
 * A caller may ask for fewer days; anything outside 1…90 collapses to the
 * default rather than being honoured, so a body cannot mint a grant that
 * outlives the policy.
 */
export function invitationExpiry(invitedAt: Date, days?: unknown): Date {
  const asked = typeof days === 'number' && Number.isInteger(days) ? days : INVITATION_DEFAULT_DAYS;
  const bounded = asked >= 1 && asked <= INVITATION_MAX_DAYS ? asked : INVITATION_DEFAULT_DAYS;
  return new Date(invitedAt.getTime() + bounded * DAY_MS);
}

/* ------------------------------------------------------------------ ceiling */

/**
 * How many invitations one project may have waiting at the same time.
 *
 * Three (Sonny, 18.09.2026). The rate limit in the route already caps how
 * *fast* invitations go out; it cannot cap the standing state, and the standing
 * state is what matters here. Twenty an hour, hour after hour, is inside the
 * rate and is not what sharing a project looks like — it is what a mailer with
 * a Clean-Core.io return address looks like, sending to addresses their owners
 * never gave us.
 *
 * Only *open* invitations hold a slot (`isOpen`). Accepted, revoked and expired
 * ones do not, so withdrawing one frees it in the same moment: an owner who
 * mistyped an address corrects it immediately instead of waiting out a
 * fortnight's expiry. Three open invitations plus any number of accepted
 * readers is therefore a normal state, not a blocked one.
 */
export const INVITATION_MAX_OPEN = 3;

/** The code the route returns when the ceiling is reached. */
export const INVITATION_TOO_MANY_CODE = 'too-many-open';

/**
 * What the owner reads when the ceiling is reached.
 *
 * It names the number and the way out in one sentence, because "too many
 * requests" would be a lie — nothing here is about speed, and waiting does not
 * help. Withdrawing does.
 */
export function invitationTooManyMessage(max: number = INVITATION_MAX_OPEN): string {
  return `This project already has ${max} invitation${max === 1 ? '' : 's'} waiting to be accepted. Withdraw one before sending another.`;
}

/* -------------------------------------------------------------------- email */

/**
 * The address an invitation is bound to: trimmed and lower-cased, or `null`.
 *
 * Lower-casing is what makes "the account address equals the invited address" a
 * comparison rather than a coin flip — mail addresses are routinely written
 * with capitals, and `Person@Example.com` and `person@example.com` are the same
 * mailbox. The same normalisation is applied to the *account's* address before
 * the two are compared, so neither side can win by choosing its spelling.
 */
export function normaliseInvitedEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value.length === 0 || value.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

/* ------------------------------------------------------------------- status */

/**
 * What an invitation is *now*, rather than what its `status` field last said.
 *
 * Expiry is a moment, not an event: nothing runs at midnight to rewrite a
 * document, so a `pending` invitation whose `expiresAt` has passed is expired
 * and every reader of it has to see that without a sweeper having visited. A
 * revocation and an acceptance are decisions and are stored as such.
 */
export function effectiveStatus(
  invitation: Pick<Invitation, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): InvitationStatus {
  if (invitation.status === 'revoked') return 'revoked';
  if (invitation.status === 'accepted') return 'accepted';
  const at = Date.parse(invitation.expiresAt);
  if (!Number.isFinite(at) || at <= now.getTime()) return 'expired';
  return 'pending';
}

/** An invitation that may still be accepted. */
export function isOpen(
  invitation: Pick<Invitation, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  return effectiveStatus(invitation, now) === 'pending';
}

/**
 * An invitation that currently grants reading.
 *
 * Deliberately independent of `expiresAt`: an accepted invitation is a grant
 * the owner made and can take back, and the reader's uid is on the project
 * document from the moment it was accepted. What ends the reading is a
 * revocation (5.5) — which removes the uid — and nothing else.
 */
export function grantsAccess(invitation: Pick<Invitation, 'status'>): boolean {
  return invitation.status === 'accepted';
}

/* --------------------------------------------------------------- the answer */

/**
 * The one answer a link gives when it does not open.
 *
 * A forwarded link handed to another account, an address that does not match,
 * an invitation that expired, one the owner revoked, one that never existed,
 * one belonging to another project — **all of them get this sentence and this
 * code**, with the same HTTP status. A route that distinguished them would be a
 * probe: the difference between "no such invitation" and "not for you" tells an
 * attacker that an invitation exists and, by iterating, for whom. None of the
 * distinctions would change what the reader has to do, either — ask the owner.
 *
 * Two answers *are* separate, and neither says anything about an invitation:
 * "you are not signed in" and "confirm your address first". Both depend only on
 * the caller's own account, are returned before the invitation is looked at,
 * and are therefore the same for an address nobody ever invited.
 */
export const INVITATION_CLOSED_CODE = 'invitation-closed';
export const INVITATION_CLOSED_MESSAGE =
  'This invitation cannot be opened with this account. Ask the person who shared the project to send a new invitation to the address you signed in with.';

/* ---------------------------------------------------------------- the link */

/**
 * The path the invitation mail points at, and the only target sign-in returns
 * to for an invitation. A path, not a URL: the caller prefixes `APP_BASE_URL`,
 * which is derived from configuration rather than from a request header.
 */
export function invitationLinkPath(projectId: string, invitationId: string): string {
  return `/invitation/${projectId}/${invitationId}`;
}

/* ---------------------------------------------------------------- the offer */

/**
 * What the owner is handing over, in the words the dialog has to use.
 *
 * `docs/ROADMAP.md` phase 5, "Fertig, wenn": *der Einladungsdialog sagt
 * ausdrücklich „inklusive Quellcode"*. It is a sentence in the dialog, not a
 * tooltip and not a popover — somebody who is about to give a third party the
 * ABAP of a customer system should not have to hover over anything to find that
 * out. `tests/invitation-flow.spec.ts` reads it out of the rendered dialog.
 */
export const INVITATION_SCOPE_SENTENCE =
  'They can read this project in full, including the ABAP source code you uploaded.';

/** The other half of the same honesty: what an invitation does *not* hand over. */
export const INVITATION_LIMITS_SENTENCE =
  'Reading only. Analysing, confirming, signing and exporting stay with you, and you can withdraw the invitation at any time.';

/**
 * The same two facts, addressed to the person who was invited.
 *
 * The two sentences above are written for the owner standing in the invite
 * dialog — "**they** can read this project", "the source code **you** uploaded",
 * "**you** can withdraw it". The invitation mail reused them verbatim, so the
 * recipient was told that somebody else could read a project, that they had
 * uploaded code they have never seen, and that they could withdraw an invitation
 * that is not theirs to withdraw (found 18.09.2026, while reading the mail out
 * for a legal review).
 *
 * Same facts, same order, second person: the reader of a mail is the reader of
 * the project, and the limits are limits *on them*. Kept here beside the
 * owner-facing pair so the two can never drift into saying different things.
 */
export const INVITATION_SCOPE_SENTENCE_RECIPIENT =
  'You can read this project in full, including the ABAP source code that was uploaded to it.';

/** What an invitation does not give the person who accepts it. */
export const INVITATION_LIMITS_SENTENCE_RECIPIENT =
  'Reading only. Analysing, confirming, signing and exporting stay with the owner, and the owner can withdraw your access at any time.';

/**
 * What the owner is told once the invitation has gone out.
 *
 * Our transactional mail reaches inboxes unevenly — DNS for the sender has been
 * correct since 01.09.2026 and messages still land in spam folders often enough
 * to matter (Sonny, 16.09.2026; roadmap 3.0.9). The owner is the only person who
 * can do anything about that: they know the recipient and can tell them to look.
 *
 * So it is said here, at the moment it is actionable, rather than left for the
 * owner to discover from silence. "Delivered" and "read" are different claims,
 * and a product that knows the first is unreliable should not let the second be
 * assumed.
 */
export const INVITATION_SPAM_HINT =
  'Mail does not always land in the inbox. If they do not see it within a few minutes, ask them to check their spam or junk folder — and tell them it comes from info@clean-core.io.';
