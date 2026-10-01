import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * `/facts` lives at the top level, outside the app shell, and had no header or
 * footer at all — only a "Back to homepage" link. Block D, D.25b gives it the
 * one public frame (D.24, UX-082), as `app/catalog/layout.tsx` does.
 */
export default function FactsLayout({ children }: { children: React.ReactNode }) {
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
