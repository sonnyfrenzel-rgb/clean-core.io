import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * The method pages live at the top level, outside the app shell, like the
 * catalog — and until block D, D.25a, `/method/levels` had no header or footer
 * at all: a reader who followed "The full rule" from an object page landed on
 * a page with no way back but the browser. Same frame as `app/catalog/layout.tsx`
 * (D.24, UX-082: one header on every public page).
 */
export default function MethodLayout({ children }: { children: React.ReactNode }) {
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
