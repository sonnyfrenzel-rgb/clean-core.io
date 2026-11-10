/**
 * The frame every project page stands in — the workspace and its seven tools
 * (roadmap 3.0.21, points 1 and 13; owner decisions 22.10.2026).
 *
 * **The way in.** A project link arrives from a mail, a bookmark, or a tab whose
 * session has expired. Signed out, it used to answer with the 404 — "There is no
 * page at this address… the link has a typo" — for a link that was perfectly
 * good. Now a signed-out reader goes to the sign-in and comes back to the link
 * (`signInLinkFor`, `lib/return-path.ts`). A signed-in account that may not read
 * the project reads one sentence and the way to its own list — the same sentence
 * for "there is no such project" and "it is not yours", because telling the two
 * apart would let anyone ask whether a project exists.
 *
 * **The reader.** An invited reader sees one strip at the top of the workspace
 * and of every tool — "Shared with you for reading by <owner> — read only." —
 * instead of having to collect the same fact from a note beside each control.
 *
 * Pure and without imports: the frame is a client component, and the server
 * route that answers it and the specs read the same functions.
 */

/** What the server answered about this account and this project (`GET /api/projects/{id}?for=access`). */
export type ProjectAccess =
  | { kind: 'owner' }
  | { kind: 'reader'; ownerName: string | null }
  | { kind: 'none' }
  | { kind: 'unknown' };

/** What the frame does. */
export type ProjectGate = 'checking' | 'sign-in' | 'no-access' | 'open';

/**
 * `signedIn` is `undefined` until Firebase has restored the session. Only an
 * answer of "no access" closes the frame: a read that failed — the network, a
 * suspended account, a token from before the second factor — leaves the page
 * to say what it says about a failed load, so the frame never claims a project
 * is missing when it merely could not ask.
 */
export function projectGate(signedIn: boolean | undefined, access: ProjectAccess | undefined): ProjectGate {
  if (signedIn === undefined) return 'checking';
  if (!signedIn) return 'sign-in';
  if (access?.kind === 'none') return 'no-access';
  return 'open';
}

/** The status code of the access answer, read as the frame needs it. 404 is the route's one refusal for "not there" and "not yours". */
export function accessFromAnswer(status: number, body: unknown): ProjectAccess {
  if (status === 404) return { kind: 'none' };
  if (status !== 200 || !body || typeof body !== 'object') return { kind: 'unknown' };
  const { role, ownerName } = body as { role?: unknown; ownerName?: unknown };
  if (role === 'owner') return { kind: 'owner' };
  if (role === 'reader') return { kind: 'reader', ownerName: typeof ownerName === 'string' && ownerName.trim() ? ownerName.trim() : null };
  return { kind: 'unknown' };
}

/** The owner's name as a reader is shown it: first and last name, at most 80 characters, or nothing. */
export function readerFacingOwnerName(firstName: unknown, lastName: unknown): string | null {
  const name = [firstName, lastName]
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  return name ? name.slice(0, 80) : null;
}

/** The one sentence for a signed-in account that may not read the project. */
export const NO_ACCESS_SENTENCE = 'This project does not exist or is not shared with this account.';

/** Shown while a signed-out reader is on the way to the sign-in. */
export const TO_SIGN_IN_SENTENCE = 'Taking you to the sign-in — you come back to this page afterwards.';

/** The strip an invited reader sees on the workspace and on every tool. */
export function readerStripSentence(ownerName: string | null): string {
  return ownerName ? `Shared with you for reading by ${ownerName} — read only.` : 'Shared with you for reading — read only.';
}
