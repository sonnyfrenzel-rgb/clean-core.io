export const APP_VERSION = 'v2.13.0';
export const APP_RELEASE_DATE = 'September 18, 2026';

/**
 * Same date as APP_RELEASE_DATE, in ISO 8601 (YYYY-MM-DD), for schema.org
 * `dateModified` and any other machine-readable date output.
 *
 * Kept as an explicit literal rather than derived from APP_RELEASE_DATE:
 * `new Date('August 20, 2026').toISOString()` resolves the string at local
 * midnight and then converts to UTC, which shifts the date one day back in
 * every positive UTC offset (CET included). Update both constants together.
 */
export const APP_RELEASE_DATE_ISO = '2026-09-18';

/**
 * The same date again, written the way a German reader expects it, for the
 * German privacy policy at `/datenschutz/de`.
 *
 * A third literal rather than a formatter: `toLocaleDateString('de-DE')` on a
 * string parsed at local midnight walks into the same off-by-one this file
 * already documents above, and a date that is one day wrong in a legal document
 * is worse than one more line to keep in step. Update all four together.
 */
export const APP_RELEASE_DATE_DE = '18. September 2026';
