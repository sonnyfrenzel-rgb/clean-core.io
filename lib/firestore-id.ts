/**
 * One check for every document id a route takes from its caller.
 *
 * A Firestore document id that arrives in a request body, a query string or a
 * path parameter is validated here before it forms any document path. The
 * accepted form is the one Firestore's own auto-ids and every id this product
 * mints already have: letters, digits, `-` and `_`, 1 to 128 characters. It is
 * the same form `lib/return-path.ts` and `lib/s4-proxy-capability.ts` accept.
 *
 * The check refuses rather than repairs: an id that does not have this form is
 * not an id of ours, and a stripped variant of it would name a different
 * document (SEC-2026-514).
 *
 * `tests/firestore-id-guard.spec.ts` holds every route under `app/api` to it.
 */
export const FIRESTORE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isFirestoreId(value: unknown): value is string {
  return typeof value === 'string' && FIRESTORE_ID_PATTERN.test(value);
}
