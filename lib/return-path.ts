/**
 * Where sign-in is allowed to send somebody afterwards — roadmap 5.1.
 *
 * An invitation link is useless if opening it while signed out drops the reader
 * on the dashboard: they came for one project, they arrive at somebody's
 * workspace, and the link is spent. So the sign-in modal carries the target in
 * `?next=` and returns to it.
 *
 * That parameter is attacker-controlled by definition — it travels in a URL
 * that anybody can write and mail. A `next` of `https://clean-core.io.evil.example`
 * turns our own login into the credible first half of a phishing flow: the
 * victim signs in on the real site, with the real certificate, and is handed to
 * somebody else's page still believing they are here. That is an open redirect,
 * and it is the one thing this module exists to make impossible.
 *
 * **A target is one of ours as written, or it is nothing.** It is never
 * repaired, never stripped, never re-encoded and never decoded first. Every
 * published open-redirect bypass is a bypass of some cleaning step — a second
 * slash, a backslash the browser normalises, a percent-encoding the validator
 * decodes after it has checked, a `@` that moves the authority. There is no
 * cleaning step here to bypass: the string either matches one of the
 * application's own route shapes character for character, or `safeReturnPath`
 * returns `null` and the caller falls back to the dashboard.
 *
 * Pure, no imports: the sign-in modal is a client component and the specs are
 * server-less.
 */

/**
 * The application's own routes a sign-in may return to.
 *
 * Deliberately a short list rather than "anything under `app/`". A route that
 * nobody arrives at from a mailed link has no business being a redirect target,
 * and a list that grows only when somebody writes a line here is a list that
 * can be read.
 *
 * `{id}` is a Firestore document id: letters, digits, `-` and `_`. No dots, so
 * no `..`; no slashes, so no escaping the segment.
 */
const ID = '[A-Za-z0-9_-]{1,128}';

/** The seven stage folders under `app/(app)/project/[projectId]/`. */
const STAGES = 'analyze|design|transformation|documentation|testing|tco|delivery';

const ALLOWED_TARGETS: RegExp[] = [
  /^\/dashboard$/,
  /^\/settings$/,
  /^\/admin$/,
  /^\/first-run$/,
  /^\/demo$/,
  /^\/knowledge$/,
  /^\/trust$/,
  /^\/verify-pack$/,
  // Roadmap 5.1: the reason this module exists.
  new RegExp(`^/invitation/${ID}/${ID}$`),
  new RegExp(`^/project/${ID}$`),
  new RegExp(`^/project/${ID}/(?:${STAGES})$`),
];

/**
 * The internal path to return to after sign-in, or `null`.
 *
 * `null` means "discard it" — not "clean it up". The caller sends the person to
 * the dashboard, which is where they would have gone with no `next` at all.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > 512) return null;

  // One absolute path of unreserved characters. This alone rules out an
  // absolute URL (`:`), a query or a fragment (`?`, `#`), a userinfo trick
  // (`@`), any percent-encoding (`%`), any traversal (`.`), a backslash that a
  // browser would read as a slash, whitespace and every control character.
  if (!/^\/[A-Za-z0-9/_-]*$/.test(raw)) return null;
  // `//evil` and `/\evil` are protocol-relative URLs to a browser, not paths.
  if (raw.includes('//')) return null;

  return ALLOWED_TARGETS.some((pattern) => pattern.test(raw)) ? raw : null;
}

/**
 * `/?auth=signin&next=<path>` — the sign-in link for a page that wants the
 * reader back afterwards.
 *
 * The path is validated here too, so a caller cannot build a link this module
 * would later refuse to honour and leave the reader at a dead end.
 */
export function signInLinkFor(path: string): string {
  const target = safeReturnPath(path);
  return target ? `/?auth=signin&next=${encodeURIComponent(target)}` : '/?auth=signin';
}
