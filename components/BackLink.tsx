'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * The way back from a public page, and there is one.
 *
 * UX-015 ("back navigation behaves differently per page") and UX-104
 * ("/first-run's back-jump puts signed-out readers behind the login"). The eleven
 * public pages inside the app shell had four answers between them:
 *
 *   "Back to Workspace" → /dashboard   /how-to, /first-run
 *   "Back to Dashboard" → /dashboard   /verify-pack
 *   <BackButton> → router.back()       /knowledge, /how-it-works, /about,
 *                                      /tenant-security, /trust
 *   "Back to Homepage" → /             /clean-core-explained, /clean-core-score,
 *                                      /abap-custom-code-analysis,
 *                                      /sap-clean-core-object-classification,
 *                                      /sap-cloudification
 *
 * Every one of them is reachable without an account and every one is in the
 * sitemap, so each answer is wrong for half the readers. `/dashboard` is behind
 * the login: a visitor who arrived from a search result is offered a way "back"
 * to a sign-in dialog they have never seen. `router.back()` has nowhere to go
 * when the page *is* the first one in the history, which is exactly the case for
 * a reader who arrived from a search result — the button simply does nothing.
 * And `/` is a dead end for someone signed in, who came from their workspace.
 *
 * The decision is the one `app/(app)/layout.tsx` already applies to the logo
 * (UX-104's pattern, and the reason `tests/landing-consistency-guard.spec.ts`
 * pins `href={profile ? '/dashboard' : '/'}` there): home is the workspace for
 * someone signed in and the landing page for everyone else. The label says which
 * one it is, so the link never promises a place the click does not reach.
 *
 * Server-rendered as the signed-out version, which is also what a crawler should
 * follow: a hard `/dashboard` on eleven indexable pages skews the internal link
 * graph towards a route robots cannot enter.
 *
 * `/settings` keeps its own `/dashboard` link on purpose: it redirects anyone
 * without a profile away, so the signed-out half of this component could never
 * render there.
 */
/**
 * How a way back looks, here and above every stage (`StageHeader`): a link,
 * not a button — 13 px / 600 in `--cc-ink-muted`, arrow on the left
 * (`DESIGN.md` §2.3). It used to be a pill with its own white surface, a border
 * and a green hover, one of the product's 78 button styles; a way back is not
 * an action, and green in the workspace means "proven" (§1.1).
 */
export const BACK_LINK_CLASS =
  'inline-flex items-center gap-1 cc-text-identifier text-cc-ink-muted no-underline hover:text-cc-ink hover:underline';

export default function BackLink() {
  const { profile } = useUserProfile();
  const signedIn = Boolean(profile);

  return (
    <Link
      data-back-link={signedIn ? 'workspace' : 'home'}
      href={signedIn ? '/dashboard' : '/'}
      className={BACK_LINK_CLASS}
    >
      <ArrowLeft size={16} aria-hidden="true" /> {signedIn ? 'Back to workspace' : 'Back to homepage'}
    </Link>
  );
}
