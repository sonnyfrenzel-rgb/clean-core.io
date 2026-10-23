import type { Metadata } from 'next';
import Link from 'next/link';
import UnsubscribeClient from '../UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Unsubscribe from invitations | Clean-Core.io',
  description: 'Stop receiving invitations to Clean-Core.io projects and portfolios.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The unsubscribe link of an invitation mail (C10 for a project, C12 for a
 * portfolio) lands here, with the token in the fragment — which never reaches
 * the server. `UnsubscribeClient` reads it in the browser and posts it to
 * `/api/unsubscribe/invitations` only when the person confirms, never on this
 * GET, which link scanners follow.
 */
export default function InvitationUnsubscribePage() {
  return (
    <main className="min-h-screen bg-cc-page flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <Link href="/" className="inline-block mb-8">
          <span className="text-2xl font-extrabold text-cc-ink tracking-tight">
            Clean-Core<span className="text-cc-brand-strong">.io</span>
          </span>
          <span className="block cc-text-label text-cc-ink-muted mt-1">
            Free Community SAP Modernization Platform
          </span>
        </Link>

        <h1 className="text-3xl font-extrabold text-cc-ink tracking-tight mb-3">Invitations</h1>

        <UnsubscribeClient list="invitations" />

        <p className="text-xs text-cc-ink-muted mt-8 leading-relaxed">
          Clean-Core.io · Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany
        </p>
      </div>
    </main>
  );
}
