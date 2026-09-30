import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * The whitepaper lives at the top level, outside the app shell, and used to
 * draw a header and footer of its own — a third pattern next to the landing
 * page's and the catalog's. Block D, D.25b gives it the one public frame
 * (D.24, UX-082), as `app/catalog/layout.tsx` does. The PDF download that sat
 * in its old header now sits under the hero.
 */
export default function WhitepaperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cc-page">
      <PublicHeader />
      <div id="main" tabIndex={-1} className="flex-1">
        {children}
      </div>
      <PublicFooter />
    </div>
  );
}
