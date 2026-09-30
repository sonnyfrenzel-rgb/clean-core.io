import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';
import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';
import { publicButton } from '@/components/landing/public-button';

/**
 * The 404 of every route without a nearer `not-found` — block D, D.26.
 *
 * It wears the public header and footer (D.24): a reader who mistyped a URL is
 * on the public site, and the header gives them the pages a search engine would
 * have sent them to. The workspace's `notFound()` bubbles past the `(app)`
 * layout to this page as well, so it carries no account menu of its own
 * (`tests/demo-workspace-tour.spec.ts`).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-cc-page">
      <PublicHeader />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="w-full max-w-lg rounded-3xl border border-cc-line bg-cc-surface p-10 shadow-cc">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cc-surface-muted">
            <SearchX className="h-10 w-10 text-cc-ink-muted" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-6xl font-extrabold tracking-tight text-cc-ink">404</h1>
          <h2 className="mb-4 text-xl font-bold text-cc-ink">Page Not Found</h2>
          <p className="mb-8 font-medium text-cc-ink-muted">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className={publicButton('primary')}>
              <ArrowLeft size={18} aria-hidden="true" /> Back to Home
            </Link>
            <Link href="/how-it-works" className={publicButton('ghost')}>
              How It Works
            </Link>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
