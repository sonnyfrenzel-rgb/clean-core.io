/**
 * The switch the new interface grows behind — roadmap 1.4.
 *
 * `docs/ROADMAP.md`, preamble: *"neue UI wächst hinter einem Admin-Schalter bis
 * 3.0"*. Step 1.5 built the language and put its gallery behind the admin
 * console's own `profile.isAdmin` check, saying in its own header that the real
 * switch belongs here. This is it.
 *
 * Three facts live in this file and nothing else does:
 *
 *   1. the field name, once, so the route that writes it and the screens that
 *      read it cannot drift apart;
 *   2. `workspaceShellEnabled` — the one reading of it, which is deliberately
 *      **two** conditions and not one: the flag is on *and* the account is an
 *      administrator. A flag left behind on an account that later loses its
 *      admin rights does not keep the preview open;
 *   3. `workspaceShellEligible` — who may turn it on at all, so the settings
 *      surface and the server route ask the same question.
 *
 * Deliberately pure and import-free, like `lib/model-stages.ts`: the browser
 * reads it in a client component, the API route reads it on the server, and a
 * second copy of "who may see the new shell" is exactly the drift that lets an
 * unfinished interface reach a community account.
 *
 * **Not a security boundary, and it does not need to be.** Nothing behind the
 * switch is privileged: it is the same project, read through the same Firestore
 * rules by the same account, drawn differently. What the switch protects is the
 * community's experience of a finished product, not anybody's data. The reason
 * it is nevertheless server-written is narrower and worth stating: a flag the
 * browser could set would make "what does a normal account see" unanswerable,
 * and that question is the acceptance criterion of this whole phase
 * (`docs/ROADMAP.md` §Phase 1: *"und sich bei ausgeschaltetem Schalter für
 * Nutzer nichts ändert"*).
 */

/**
 * The field on `users/{uid}`.
 *
 * Written **only** by `POST /api/workspace-shell` through the Admin SDK.
 * `firestore.rules` limits a client's own writes to `userClientUpdateKeys()`,
 * which this name is deliberately not in — so the switch cannot be set from a
 * browser console **and no rules change was needed to introduce it**. Rules on
 * this project are deployed by hand; a step that needed one would have to say
 * so out loud, and this one does not.
 *
 * The same shape roadmap 1.2 used for `modelStages`. Copying a solved pattern
 * is the point: two server-written user preferences that behave differently
 * would each need to be understood on their own.
 */
export const WORKSPACE_SHELL_FIELD = 'workspaceShell';

/** What a reader of this flag needs off the profile. Nothing else. */
export interface WorkspaceShellSubject {
  /**
   * Server-written. Absent or `false` means the account sees the product it saw
   * yesterday, which is what every account sees until an administrator opts
   * their own account in.
   */
  workspaceShell?: boolean | null;
  /** The admin console's own flag, on the same document. */
  isAdmin?: boolean | null;
}

/**
 * May this account turn the preview on for itself?
 *
 * Administrators only, and only for their own account — there is no field here
 * for turning it on for somebody else, on purpose. "Small and obvious" was the
 * brief, and an admin-operated switch over other people's interfaces is neither.
 */
export function workspaceShellEligible(subject: WorkspaceShellSubject | null | undefined): boolean {
  return subject?.isAdmin === true;
}

/**
 * Is the preview on for this account right now?
 *
 * The `=== true` on both halves is not decoration. A half-written document, a
 * string `"true"` out of a hand-edited console, or a missing field must all
 * read as off: the safe direction for an unfinished interface is closed.
 */
export function workspaceShellEnabled(subject: WorkspaceShellSubject | null | undefined): boolean {
  return subject?.workspaceShell === true && workspaceShellEligible(subject);
}
