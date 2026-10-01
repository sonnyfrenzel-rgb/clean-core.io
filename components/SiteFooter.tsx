import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { clsx } from 'clsx';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';

/**
 * Shared site footer — identical on the landing, the (app) marketing pages and the
 * catalog, so every page "comes out" at the same footer.
 *
 * - Branded back-to-home row links to `/#site-footer`, returning the visitor to the
 *   landing footer (the same spot they left from) in a consistent look & feel.
 * - Full internal-link map gives every indexable page a crawl-depth-1 path to the core
 *   pages (SEO: avoids "Discovered – currently not indexed").
 *
 * `dark` renders for a dark background (landing footer); default is the light in-app footer.
 *
 * Block D, D.24: tokens instead of the palette, the micro-label (11 px, 600,
 * uppercase, 0.08em — DESIGN.md §1.2) instead of 10 px in black weight, and no
 * green hover (ADR-007: green means "backed by evidence", not "you are
 * pointing here"). The links and their order are unchanged.
 */
/** The link map, also read by the landing page's footer (roadmap 3.0.6), so the two cannot differ. */
export const SITE_FOOTER_COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/knowledge', label: 'Knowledge Base' },
      { href: '/catalog', label: 'SAP Object Catalog' },
      { href: '/clean-core-score', label: 'Clean Core Score' },
      { href: '/sap-clean-core-object-classification', label: 'Object Classification (A–D)' },
      { href: '/abap-custom-code-analysis', label: 'ABAP Code Analysis' },
      { href: '/sap-cloudification', label: 'SAP Cloudification' },
      { href: '/method/levels', label: 'How Levels A–D Are Derived' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/about', label: 'About' },
      { href: '/clean-core-explained', label: 'Clean Core Explained' },
      { href: '/first-run', label: 'Your First Run' },
      { href: '/how-to', label: 'How-To Guide' },
      { href: '/whitepaper', label: 'Whitepaper' },
      { href: '/reference-analysis', label: 'Reference Analysis' },
      // `/facts` had no internal link at all — only the sitemap knew it, and it
      // is the page an answer engine should cite a number from.
      { href: '/facts', label: 'Facts & Figures' },
      { href: '/verify-pack', label: 'Verify an Audit Pack' },
      { href: '/trust', label: 'Trust & Transparency' },
      { href: '/tenant-security', label: 'Tenant Security' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/impressum', label: 'Legal Notice' },
      { href: '/datenschutz', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
      { href: '/licenses', label: 'Licenses' },
    ],
  },
];

const MICRO_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em]';

export default function SiteFooter({ dark = false }: { dark?: boolean }) {
  const muted = dark ? 'text-cc-on-dark/70' : 'text-cc-ink-muted';
  return (
    <div className={clsx('max-w-4xl mx-auto', muted)}>
      {/* Branded back-to-home — lands you back on the landing footer (same spot). */}
      <div className="flex flex-col items-center text-center mb-10">
        <Link
          href="/#site-footer"
          aria-label="Back to Clean-Core.io home"
          className={clsx('inline-flex items-center gap-2 transition-opacity hover:opacity-80', dark ? 'text-cc-on-dark' : 'text-cc-ink')}
        >
          <span className={clsx('p-2 rounded-cc-row', dark ? 'bg-cc-brand/15' : 'bg-cc-brand-surface')}>
            <RotateCw className="w-4 h-4 text-cc-brand" aria-hidden="true" />
          </span>
          <span className="font-bold text-base tracking-tight">
            {/* `--cc-brand` is 3.3:1 on white, an accent and not text (§1.1): on
                the light footer the word takes the strong brand. */}
            Clean-Core<span className={dark ? 'text-cc-brand' : 'text-cc-brand-strong'}>.io</span>
          </span>
        </Link>
        <span className={clsx(MICRO_LABEL, 'mt-2', muted)}>Free Community Edition · complementary to SAP tooling</span>
      </div>

      <nav aria-label="Footer" className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 text-left max-w-3xl mx-auto">
        {SITE_FOOTER_COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className={clsx(MICRO_LABEL, 'mb-3', muted)}>{col.heading}</h3>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={clsx(
                      'text-xs font-medium underline-offset-4 hover:underline',
                      dark ? 'hover:text-cc-on-dark' : 'hover:text-cc-ink',
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

/**
 * The footer of the public pages outside the app shell — the catalog and the
 * feature pages (block D, D.24). The same light footer the app shell renders on
 * its public pages (`app/(app)/layout.tsx`): the link map, then the trademark
 * notice, which those pages had been missing although they name more SAP
 * objects than any other.
 */
export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-cc-line bg-cc-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <SiteFooter />
        <div className="mt-8 pt-6 border-t border-cc-line text-center">
          <SapTrademarkNotice className="max-w-3xl mx-auto" />
        </div>
      </div>
    </footer>
  );
}
