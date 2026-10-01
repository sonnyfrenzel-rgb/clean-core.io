import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * The catalog pages live at the top level, outside the app shell, so they carry the
 * public header and footer themselves — the same ones as the landing page
 * (block D, D.24, UX-082: one header on every public page). The logo returns
 * to the landing page; the sign-in button opens the landing page's sign-in
 * dialog, because that is where it is mounted.
 */
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
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
