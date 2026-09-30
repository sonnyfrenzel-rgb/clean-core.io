import PublicHeader from '@/components/PublicHeader';
import { PublicFooter } from '@/components/SiteFooter';

/**
 * The public header and footer for the privacy policy in English and in German (`/datenschutz/de`) — block D, D.26.
 *
 * Until D.26 the legal pages drew a header of their own (a back arrow and the
 * logo) and no footer, so a reader who followed the footer link from the
 * landing page arrived on what looked like a different site. They now wear the
 * same frame as every other public page (D.24, UX-082). Only the frame changed:
 * the text inside `<main>` is the legal text word for word.
 */
export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
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
