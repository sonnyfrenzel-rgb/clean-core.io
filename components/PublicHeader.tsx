import Link from 'next/link';
import { Menu, RotateCw } from 'lucide-react';
import HeaderAuthButton from '@/components/HeaderAuthButton';

/**
 * The header of every public page outside the app shell — block D, D.24, UX-082
 * ("two header patterns on public pages").
 *
 * Until D.24 the landing page had one header and the catalog and the feature
 * pages had another: a different height, a 9 px black-weight edition line, a
 * dark "Home" pill with a green hover, and no sign-in at all. A reader who went
 * from the landing page into the catalog crossed into what looked like a second
 * site. This is the landing page's header (roadmap 3.0.6), lifted out of
 * `app/page.tsx` unchanged in what it offers — logo home, the pages with search
 * reach, the sign-in button in the same place — so every public page wears it.
 *
 * The skip link comes with it: it has to be the first Tab stop, and the header
 * is the first thing on the page. The page puts `id="main"` (or `skipTo`) on
 * its content.
 *
 * `signInHref`: the landing page opens its sign-in dialog for `?auth=signin`
 * (`components/LandingModals.tsx`). That dialog is mounted on the landing page
 * only, so elsewhere the button has to go there — `/?auth=signin`. A relative
 * `?auth=signin` on `/catalog` would be a button that does nothing.
 */

/** The pages with search reach — the desktop row and the phone menu read the same list. */
export const PUBLIC_NAV: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/clean-core-explained', label: 'Clean Core Explained' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/sap-clean-core-object-classification', label: 'Classification A–D' },
  { href: '/catalog', label: 'SAP Object Catalog' },
  { href: '/knowledge', label: 'Knowledge Base' },
];

export default function PublicHeader({
  skipTo = '#main',
  signInHref = '/?auth=signin',
}: {
  skipTo?: string;
  signInHref?: string;
}) {
  return (
    <>
      <a
        href={skipTo}
        data-skip-link=""
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-cc-row focus:outline-2 focus:outline-offset-2 focus:outline-cc-focus"
      >
        <span className="block rounded-cc-row border border-cc-line bg-cc-surface px-4 py-3 text-sm font-semibold text-cc-ink shadow-cc-dialog">
          Skip to content
        </span>
      </a>

      <header data-public-header="" className="sticky top-0 z-50 border-b border-cc-line bg-cc-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Clean-Core.io home">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-cc-brand-surface text-cc-brand">
              <RotateCw size={20} aria-hidden="true" />
            </span>
            <span className="hidden flex-col min-[400px]:flex">
              <span className="text-base font-extrabold leading-tight tracking-[-0.02em] text-cc-ink sm:text-lg">
                Clean-Core<span className="text-cc-brand-strong">.io</span>
              </span>
              <span className="text-xs font-semibold leading-tight text-cc-ink-muted">Free Community Edition</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 xl:flex">
            {PUBLIC_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap py-2 text-[15px] font-semibold text-cc-ink-muted hover:text-cc-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HeaderAuthButton signInHref={signInHref} />
            <details className="group relative xl:hidden">
              <summary
                aria-label="Menu"
                className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-cc-field-border bg-cc-surface text-cc-ink [&::-webkit-details-marker]:hidden"
              >
                <Menu size={18} aria-hidden="true" />
              </summary>
              <nav
                aria-label="Main"
                className="absolute right-0 top-12 hidden w-64 max-w-[calc(100vw-2rem)] rounded-2xl group-open:block border border-cc-line bg-cc-surface p-2 shadow-cc-dialog"
              >
                {PUBLIC_NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="flex min-h-11 items-center px-3 text-base font-semibold text-cc-ink underline-offset-4 hover:underline"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>
    </>
  );
}
