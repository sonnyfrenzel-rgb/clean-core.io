import Link from 'next/link';
import { SearchX } from 'lucide-react';
import CcLinkButton from '@/components/cc/LinkButton';

/**
 * The 404 of every route without a nearer `not-found` — block D, D.26; restyled
 * onto the cc library for 3.0 (gap audit 3.0, §17).
 *
 * The workspace's `notFound()` bubbles past the `(app)` layout to this page as
 * well, so it carries no account menu of its own
 * (`tests/demo-workspace-tour.spec.ts`). It used to wear the full public
 * header, pill buttons and footer — inside the signed-in app too. It is now the
 * empty-state card of the workspace: one heading, one sentence, one primary
 * action and one quiet one.
 *
 * A server component cannot know who is signed in without a session read this
 * page should not make, so it offers both ways: My workspace (which sends a
 * visitor without a session to sign in) and the homepage. The `h1` stays the
 * bare "404": the rendered guards recognise a missing page by exactly that.
 * Next marks a not-found response `noindex` on its own.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center bg-cc-page px-4 py-12"
    >
      <div className="w-full max-w-md">
        <div className="mb-4 text-center">
          <Link
            href="/"
            className="text-[15px] font-bold text-cc-ink no-underline hover:underline"
          >
            Clean-Core<span className="text-cc-brand-strong">.io</span>
          </Link>
        </div>
        <div
          data-not-found=""
          className="rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface px-4 py-8 text-center shadow-cc"
        >
          <div className="mb-2 flex justify-center text-cc-ink-muted">
            <SearchX size={20} aria-hidden="true" />
          </div>
          <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">404</h1>
          <p className="mx-auto mt-1 mb-4 max-w-sm text-[13px] font-medium text-cc-ink-muted">
            There is no page at this address. It may have moved, or the link has a typo.
          </p>
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <CcLinkButton href="/dashboard" variant="primary" density="cozy">
              Go to My workspace
            </CcLinkButton>
            <CcLinkButton href="/" variant="ghost" density="cozy">
              Go to the homepage
            </CcLinkButton>
          </div>
        </div>
        <p className="mt-4 text-center text-[12px] font-semibold text-cc-ink-muted">
          <Link href="/impressum" className="text-cc-ink-muted underline underline-offset-2 hover:text-cc-ink">
            Legal notice
          </Link>
          {' · '}
          <Link href="/datenschutz" className="text-cc-ink-muted underline underline-offset-2 hover:text-cc-ink">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}
