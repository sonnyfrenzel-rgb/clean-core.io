import type { Metadata } from 'next';

/**
 * An invitation link is addressed to one confirmed e-mail address. It is never
 * a page for a search engine, so it says so — and `app/robots.ts` keeps
 * crawlers off `/invitation/` in the first place.
 */
export const metadata: Metadata = {
  title: 'Invitation to read a project | Clean-Core.io',
  robots: { index: false, follow: false },
};

export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
