/**
 * Which pages of the signed-in shell (`app/(app)/layout.tsx`) a visitor opens
 * without an account — privacy policy section 7: such a page contacts nobody
 * but clean-core.io until the reader opens the sign-in dialog
 * (`noRequestWithoutSignIn` in lib/legal/open-values.ts).
 *
 * The shell starts the Firebase Auth SDK on a public page only when the
 * first-party signed-in hint is set or this page has started Auth already
 * (lib/auth-hint.ts, hooks/useAuthWanted.ts); on every other page of the shell
 * it starts Auth as it always did, because that page cannot work without
 * knowing who is signed in.
 *
 * Both lists are written in the folder form of `app/(app)/` (`[stage]` for a
 * dynamic segment), and every `page.tsx` under `app/(app)/` stands in exactly
 * one of them — tests/public-no-google-before-signin-guard.spec.ts derives the
 * routes from the files and fails on a page in neither list or in both.
 *
 * `/demo/workspace` is public although it needs an account: without the hint
 * it sends the visitor to the sign-in dialog without starting Auth on the way
 * (components/demo/DemoWorkspaceShell.tsx). `/demo/analyze` is the same in its
 * Business view, where the demo opens since 3.1.0
 * (components/demo/DemoAnalyzeBusiness.tsx); its IT and Management views are
 * the public Analyze stage as before. A returning reader whose browser
 * holds a session but not yet the hint finds the session there and comes back
 * (components/LandingModals.tsx).
 *
 * No imports: the module is read by the shell before it decides to load
 * Firebase, and by server-free specs.
 */

/** Pages a visitor reaches without an account (the sitemap's pages, the demo, the verification page). */
export const PUBLIC_SHELL_ROUTES: readonly string[] = [
  '/about',
  '/abap-custom-code-analysis',
  // A test fixture without a gate (tests/cc-library-addenda.spec.ts): it renders for anyone.
  '/admin/design-system/first-render',
  '/clean-core-explained',
  '/clean-core-score',
  '/demo',
  '/demo/[stage]',
  '/demo/[stage]/requirements',
  '/demo/analyze',
  '/demo/workspace',
  '/first-run',
  '/how-it-works',
  '/how-to',
  '/knowledge',
  '/sap-clean-core-object-classification',
  '/sap-cloudification',
  '/tenant-security',
  '/trust',
  '/verify-pack',
];

/** Pages that need a signed-in account; they start Auth on every load, as before. */
export const SIGNED_IN_SHELL_ROUTES: readonly string[] = [
  '/admin',
  '/admin/approve-tenant',
  '/admin/design-system',
  '/admin/new-project',
  '/admin/new-project/upload',
  '/admin/workspace',
  '/dashboard',
  '/invitation/[projectId]/[invitationId]',
  '/portfolio',
  '/portfolio/invitation/[selectionId]/[invitationId]',
  '/portfolio/shared/[selectionId]',
  '/project/[projectId]',
  '/project/[projectId]/analyze',
  '/project/[projectId]/delivery',
  '/project/[projectId]/design',
  '/project/[projectId]/design/requirements',
  '/project/[projectId]/documentation',
  '/project/[projectId]/tco',
  '/project/[projectId]/testing',
  '/project/[projectId]/transformation',
  '/settings',
];

/**
 * Pages that need an account but show their own signed-out state: an invitation
 * link offers "Sign in" and "Create an account" to a reader who is not signed in
 * (roadmap 3.0.21 (4)). The shell does not send them away (app/(app)/layout.tsx);
 * without the signed-in hint they render that state without starting Auth
 * (useAuthWanted), so opening a mailed link asks nobody but us (privacy policy
 * section 7, network capture 09.11.2026).
 */
export const OWN_SIGNED_OUT_VIEW_ROUTES: readonly string[] = [
  '/invitation/[projectId]/[invitationId]',
  '/portfolio/invitation/[selectionId]/[invitationId]',
];

/** A route in folder form as a matcher for a pathname: a dynamic segment matches one segment. */
export function routeMatcher(route: string): RegExp {
  const body = route
    .split('/')
    .map((segment) => (/^\[[^\]]+\]$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}/?$`);
}

const PUBLIC_MATCHERS = PUBLIC_SHELL_ROUTES.map(routeMatcher);

/**
 * Whether `pathname` (no query, no fragment — what `usePathname()` returns) is
 * a public page of the shell. A path in neither list — a mistyped address the
 * shell renders as not found — counts as not public, so the shell behaves as it
 * did before this list existed.
 */
export function isPublicShellPath(pathname: string): boolean {
  return PUBLIC_MATCHERS.some((matcher) => matcher.test(pathname));
}

const OWN_SIGNED_OUT_VIEW_MATCHERS = OWN_SIGNED_OUT_VIEW_ROUTES.map(routeMatcher);

/** Whether `pathname` is a page that needs an account but shows its own signed-out state. */
export function hasOwnSignedOutView(pathname: string): boolean {
  return OWN_SIGNED_OUT_VIEW_MATCHERS.some((matcher) => matcher.test(pathname));
}
