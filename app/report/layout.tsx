import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * The public header and footer for the reporting notes in English and in German
 * (`/report/de`) — the same frame as the Terms and the privacy policy (D.26).
 */
export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cc-page">
      <PublicHeader />
      <div id="main" tabIndex={-1} className="flex-1 bg-cc-surface">
        {children}
      </div>
      <PublicFooter />
    </div>
  );
}
