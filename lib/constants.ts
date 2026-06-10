/**
 * Centralised application constants.
 * 
 * All admin emails, project IDs, and similar magic values that were
 * previously scattered across the codebase are now defined here.
 */

/** Emails that are treated as super-admins regardless of the Firestore isAdmin field. */
export const ADMIN_EMAILS: ReadonlySet<string> = new Set([
  'sonny.frenzel@gmail.com',
  'sonny.frenzel@googlemail.com',
  'info@clean-core.io',
]);

/** Check whether an email belongs to a hardcoded admin. */
export function isHardcodedAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

/** Firebase project ID used for Firestore REST API calls. */
export const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'cleancore-491216';

/** Firestore database ID. */
export const FIRESTORE_DB_ID = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || 'ai-studio-e57d33e3-9092-46bd-9c18-ac19c9a8b67e';

/** Contact email shown in UI and email footers. */
export const CONTACT_EMAIL = 'info@clean-core.io';
