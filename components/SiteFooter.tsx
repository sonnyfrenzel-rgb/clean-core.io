import Link from 'next/link';
import { clsx } from 'clsx';

/**
 * Shared site footer with a full internal-link map to every indexable page.
 *
 * SEO purpose: give ALL pages (landing + the marketing pages under the (app) shell) a
 * crawl-depth-1 link path to every core page, so Google/AI crawlers can reach and
 * prioritise them instead of leaving them "Discovered – currently not indexed".
 *
 * `dark` renders for a dark background (the landing footer); default is the light
 * in-app footer.
 */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Product',
    links: [
      { href: '/how-it-works', label: 'How It Works' },
      { href: '/knowledge', label: 'Knowledge Base' },
      { href: '/catalog', label: 'SAP Object Catalog' },
      { href: '/clean-core-score', label: 'Clean Core Score' },
      { href: '/sap-tier-2-extensions', label: 'Tier 2 Extensions' },
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
    ],
  },
];

export default function SiteFooter({ dark = false }: { dark?: boolean }) {
  return (
    <nav
      aria-label="Footer"
      className={clsx(
        'grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-8 text-left max-w-3xl mx-auto',
        dark ? 'text-gray-400' : 'text-gray-600',
      )}
    >
      {COLUMNS.map((col) => (
        <div key={col.heading}>
          <h3
            className={clsx(
              'text-[10px] font-black uppercase tracking-widest mb-3',
              dark ? 'text-gray-500' : 'text-gray-400',
            )}
          >
            {col.heading}
          </h3>
          <ul className="space-y-2">
            {col.links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={clsx(
                    'text-xs font-medium transition-colors',
                    dark ? 'hover:text-white' : 'hover:text-green-700',
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
  );
}
