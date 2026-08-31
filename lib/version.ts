export const APP_VERSION = 'v2.8.0';
export const APP_RELEASE_DATE = 'August 31, 2026';

/**
 * Same date as APP_RELEASE_DATE, in ISO 8601 (YYYY-MM-DD), for schema.org
 * `dateModified` and any other machine-readable date output.
 *
 * Kept as an explicit literal rather than derived from APP_RELEASE_DATE:
 * `new Date('August 20, 2026').toISOString()` resolves the string at local
 * midnight and then converts to UTC, which shifts the date one day back in
 * every positive UTC offset (CET included). Update both constants together.
 */
export const APP_RELEASE_DATE_ISO = '2026-08-31';
