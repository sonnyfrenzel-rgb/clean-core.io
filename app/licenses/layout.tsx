import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * `/licenses` lives at the top level, outside the app shell, and drew a header
 * of its own (a back arrow and the logo). Block D, D.25b gives it the one
 * public frame (D.24, UX-082), as `app/catalog/layout.tsx` does.
 */
export default function LicensesLayout({ children }: { children: React.ReactNode }) {
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
