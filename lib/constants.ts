/**
 * Centralised application constants.
 * 
 * All project IDs and similar magic values that were
 * previously scattered across the codebase are now defined here.
 */

/** Firebase project ID used for Firestore REST API calls. */
export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'cleancore-491216';

/** Firestore database ID. */
export const FIRESTORE_DB_ID = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || 'clean-core-eu';

/** Contact email shown in UI and email footers. */
export const CONTACT_EMAIL = 'info@clean-core.io';

/**
 * Free community transformation quota granted per account (a one-time,
 * lifetime allotment — not reset daily/monthly). Single source of truth for the
 * client default and the server-side quota gate (`reserveRunQuota`).
 *
 * The metered unit is one **analysis run** — one ABAP source object taken through
 * the evidence engine — charged in `/api/runs/create`. The six downstream workflow
 * stages and the glossary chatbot are unmetered, and re-analysing the same source
 * fingerprint is free. That keeps "5 ABAP-to-Cloud transformations" and "full
 * 7-stage workflow included" (landing page, Terms §6) simultaneously true.
 *
 * Roadmap 0.9: the shipped starter examples sit outside this count altogether the
 * first time an account runs each of them, and are counted normally every time
 * after that — including past the re-analysis exemption above.
 *
 * NOTE: the Firestore users-create rule independently hardcodes
 * `transformationsLimit == 5`; if this value changes, that rule must change too.
 */
export const COMMUNITY_QUOTA = 5;

/**
 * Current Terms of Service version, recorded on the user profile at signup
 * (`termsVersionAccepted`) so a later Terms change can request re-consent and
 * the accepted version is provable. Kept in sync with the effective date on /terms.
 */
export const TERMS_VERSION = '2026-09-18';

/**
 * The versions under which the platform may still be used.
 *
 * § 10.3 of the Terms: somebody who does not accept a proposed amendment **may
 * carry on under the Terms as they stood before it**. So a stale acceptance is
 * not, by itself, a reason to refuse anybody — which is what the gate used to
 * do, and what would have made that clause false on the day it shipped.
 *
 * A version leaves this list only when the operator has ended the contracts
 * resting on it, which § 10.3 allows solely by giving at least 30 days' notice
 * in text form. Removing an entry here is therefore an act with a deadline
 * behind it, not a tidy-up: it locks out everybody still on that version, and
 * it must not happen before those notices have gone out and the period has run.
 *
 * The current version is always in force. New sign-ups accept `TERMS_VERSION`
 * and nothing else.
 */
export const TERMS_VERSIONS_IN_FORCE: readonly string[] = [
  '2026-09-18',
  // v2.0.0, and listed on purpose (Sonny, 18.09.2026).
  //
  // Every account that exists on the day 2026-09-18 ships accepted this one —
  // it is what production served until then. Leaving it out would have refused
  // all of them at every protected route until they clicked, which is a lockout
  // of the whole community on release day and flatly contradicts § 10.3, which
  // the same release introduces. A QA review caught it before it shipped.
  //
  // So they are asked, not shut out: the banner offers the new version, "not
  // now" leaves the product working, and the old Terms keep governing that
  // account until the operator ends them with the 30 days' notice § 10.3
  // requires. Removing this entry is that act, and nothing less.
  '2026-07-07',
];

/** True when an account holding `accepted` may still use the platform. */
export function termsVersionInForce(accepted: string | null | undefined): boolean {
  // A profile with no accepted version at all is grandfathered elsewhere; this
  // answers only the question it is asked.
  return typeof accepted === 'string' && TERMS_VERSIONS_IN_FORCE.includes(accepted);
}

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

/**
 * The Gemini model the product calls, in one place.
 *
 * It was written out at every call site instead — twelve of them across
 * `app/`, `components/`, `hooks/` and `lib/` — so the "default" parameter in
 * `lib/gemini.ts` was never the default of anything: every caller passed the
 * string. Changing the model meant editing twelve files and hoping none was
 * missed, which is how a product ends up half on one model and half on another
 * without anyone deciding it.
 *
 * Sonny, 23.09.2026: `gemini-3.8-flash`. The reason is availability before
 * quality. The previous default, `gemini-3-flash-preview`, is a preview model —
 * `app/api/gemini/route.ts` says so itself ("PREVIEW = opt-in canary (may
 * change or retire)") — and the 3-flash line never reached GA: Google shipped
 * 3.5, 3.6, 3.7 and 3.8 flash as GA and left it behind. A product whose promise
 * is a signed run cannot rest on a model that may be withdrawn.
 *
 * What a model change can and cannot move: the narrative only.
 * `app/api/runs/create/route.ts` overwrites the model's numbers with the ones
 * the server computed before it signs anything, and the provenance of the text
 * says `narrative` rather than `narrative-attested`. Historical receipts keep
 * the model they were issued under; nothing here rewrites them.
 */
export const PRODUCT_GEMINI_MODEL = 'gemini-3.8-flash';

/**
 * The model of the naming stage — the one stage that does not use the product
 * default (roadmap 17.3, Sonny 24.09.2026, option C).
 *
 * ADR-025 asks the naming stage for speed, and it is the stage with the
 * strictest validation and no contact with a signature: every name is checked
 * by `validateNamingAnswer` and carries `proposed`. Measured on the eight
 * starter examples, three passes each, with the prompt that asks for starts,
 * ends and decisions by name: `gemini-3.5-flash-lite` answered in 2.0 s median
 * (18 of 24 within 3 s) against 4.6 s (2 of 24) for the default, and named 96 %
 * of the start, end and decision nodes (default 100 %) and 66 % of all nodes
 * (default 82 %). `docs/ROADMAP.md` §17 carries the full table.
 */
export const NAMING_GEMINI_MODEL = 'gemini-3.5-flash-lite';
