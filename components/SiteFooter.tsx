import Link from 'next/link';
import { RotateCw } from 'lucide-react';
import { clsx } from 'clsx';

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
 */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/knowledge', label: 'Knowledge Base' },
      { href: '/catalog', label: 'SAP Object Catalog' },
      { href: '/clean-core-score', label: 'Clean Core Score' },
      { href: '/sap-clean-core-object-classification', label: 'Object Classification (A–D)' },
      { href: '/abap-custom-code-analysis', label: 'ABAP Code Analysis' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { href: '/about', label: 'About' },
      { href: '/how-to', label: 'How-To Guide' },
      { href: '/whitepaper', label: 'Whitepaper' },
      { href: '/changelog', label: 'Changelog' },
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

export default function SiteFooter({ dark = false }: { dark?: boolean }) {
  return (
    <div className={clsx('max-w-4xl mx-auto', dark ? 'text-gray-400' : 'text-gray-600')}>
      {/* Branded back-to-home — lands you back on the landing footer (same spot). */}
      <div className="flex flex-col items-center text-center mb-10">
        <Link
          href="/#site-footer"
          aria-label="Back to Clean-Core.io home"
          className={clsx('inline-flex items-center gap-2 transition-opacity hover:opacity-80', dark ? 'text-white' : 'text-gray-900')}
        >
          <span className={clsx('p-1.5 rounded-lg', dark ? 'bg-green-500/15' : 'bg-green-600/10')}>
            <RotateCw className="w-4 h-4 text-green-500" />
          </span>
          <span className="font-bold text-base tracking-tight">
            Clean-Core<span className="text-green-500">.io</span>
          </span>
        </Link>
        <span className={clsx('text-[10px] font-black uppercase tracking-widest mt-2', dark ? 'text-gray-500' : 'text-gray-400')}>
          Free Community Edition · complementary to SAP tooling
        </span>
      </div>

      <nav aria-label="Footer" className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 text-left max-w-3xl mx-auto">
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h3 className={clsx('text-[10px] font-black uppercase tracking-widest mb-3', dark ? 'text-gray-500' : 'text-gray-400')}>
              {col.heading}
            </h3>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={clsx('text-xs font-medium transition-colors', dark ? 'hover:text-white' : 'hover:text-green-700')}
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
