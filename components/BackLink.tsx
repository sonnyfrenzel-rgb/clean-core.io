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
export default function BackLink() {
  const { profile } = useUserProfile();
  const signedIn = Boolean(profile);

  return (
    <Link
      data-back-link={signedIn ? 'workspace' : 'home'}
      href={signedIn ? '/dashboard' : '/'}
      className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-white px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50 hover:shadow-sm shadow-slate-100"
    >
      <ArrowLeft size={14} /> {signedIn ? 'Back to Workspace' : 'Back to Homepage'}
    </Link>
  );
}
