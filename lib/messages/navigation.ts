/**
 * The two ways back, and their names — owner 06.10.2026: "we need two
 * different terms, 'back to workspace' (the project's workspace, e.g. its IT
 * view) and back to 'My workspace' (the list of all projects) — otherwise you
 * lose track."
 *
 *   - **My workspace** is the list of all projects (`/dashboard`). Every link
 *     to it says "My workspace"; a way back says "Back to My workspace" and
 *     adds "all projects", so the reader knows the list is where it leads.
 *   - **The project workspace** is one project's object page
 *     (`/project/<id>`, in the view and layer the reader left it). A stage's
 *     way back says "Back to project workspace", then the project's name and
 *     the view it returns to — "Order limit check · IT view".
 *
 * Small and free of imports on purpose: `components/BackLink.tsx` sits on
 * public pages and should not carry the whole workspace catalogue to name one
 * link. It is also a part of `lib/workspace-messages.ts`, so the catalogue
 * guard (`tests/cc-style-guard.spec.ts`) reads it like every other part, and
 * `tests/back-link-wording.spec.ts` holds the wording.
 */
export const NAVIGATION_MESSAGES = {
  'nav.myWorkspace': 'My workspace',
  'nav.backToMyWorkspace': 'Back to My workspace',
  'nav.allProjects': 'all projects',
  'nav.goToMyWorkspace': 'Go to My workspace',
  'nav.backToProjectWorkspace': 'Back to project workspace',
} as const;

export type NavigationMessageKey = keyof typeof NAVIGATION_MESSAGES;

export function nav(key: NavigationMessageKey): string {
  return NAVIGATION_MESSAGES[key];
}

/** "IT view" — the view a way back returns to, named as a view so it is not read as a team. */
export function navViewLabel(viewLabel: string): string {
  return `${viewLabel} view`;
}
