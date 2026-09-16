/**
 * When printing a mail to the console counts as having delivered it.
 *
 * Three admin routes fell back to a console log whenever `RESEND_API_KEY` was
 * absent and then answered `{ success: true }` regardless. Locally that is
 * correct — the log *is* the delivery channel and the developer is reading it.
 * In production it means no request was made, nobody was told anything, and the
 * admin console reported the mail as sent (QA review of 33471220d6e9, finding
 * 14edf99a390c).
 *
 * `NODE_ENV` alone is the wrong test, for the reason `app/api/request-tenant-access`
 * already writes down: CI runs a production build against the Firebase emulators
 * with no mail key, which is not a misconfiguration. The emulator flag is the
 * discriminator the rest of the codebase uses for exactly this distinction.
 *
 * On the real deployment neither holds, and the caller must be told that nothing
 * was delivered rather than that everything went out.
 */
export function mockMailAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
}
