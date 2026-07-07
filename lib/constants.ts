/**
 * Centralised application constants.
 * 
 * All project IDs and similar magic values that were
 * previously scattered across the codebase are now defined here.
 */

/** Firebase project ID used for Firestore REST API calls. */
export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'cleancore-491216';

/** Firestore database ID. */
export const FIRESTORE_DB_ID = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || 'ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e';

/** Contact email shown in UI and email footers. */
export const CONTACT_EMAIL = 'info@clean-core.io';

/**
 * Free community transformation quota granted per account (a one-time,
 * lifetime allotment — not reset daily/monthly). Single source of truth for the
 * client default and the server-side quota gate (`reserveTransformationQuota`).
 * NOTE: the Firestore users-create rule independently hardcodes
 * `transformationsLimit == 5`; if this value changes, that rule must change too.
 */
export const COMMUNITY_QUOTA = 5;

/**
 * Current Terms of Service version, recorded on the user profile at signup
 * (`termsVersionAccepted`) so a later Terms change can request re-consent and
 * the accepted version is provable. Kept in sync with the effective date on /terms.
 */
export const TERMS_VERSION = '2026-07-07';

/**
 * Canonical base URL of the application (no trailing slash).
 *
 * Used instead of `request.headers.get('host')` to prevent Host-Header
 * injection attacks (CWE-644).  Reads NEXT_PUBLIC_APP_URL first, then
 * VERCEL_URL (set automatically on Vercel), falling back to localhost.
 */
export const APP_BASE_URL: string =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
