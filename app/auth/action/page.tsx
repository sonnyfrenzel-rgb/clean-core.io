import type { Metadata } from 'next';
import Link from 'next/link';
import AuthActionClient from './AuthActionClient';

/**
 * `/auth/action` — where the address-confirmation mail links to (roadmap 3.0.9).
 *
 * The link used to point at Firebase's default handler on
 * `<project>.firebaseapp.com`; now it points here, on the domain the mail comes
 * from (`lib/auth-action-link.ts`). The page redeems the one-time code in the
 * browser with the Firebase client SDK. Not in the sitemap, not indexed, and no
 * referrer leaves it: the URL carries a live one-time code.
 */
export const metadata: Metadata = {
  title: 'Confirm your email address | Clean-Core.io',
  description: 'Confirm the email address of your Clean-Core.io account.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export const dynamic = 'force-dynamic';

export default async function AuthActionPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; oobCode?: string }>;
}) {
  const { mode, oobCode } = await searchParams;

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

        <h1 className="text-3xl font-extrabold text-cc-ink tracking-tight mb-3">Confirm your email address</h1>

        <AuthActionClient mode={typeof mode === 'string' ? mode : ''} oobCode={typeof oobCode === 'string' ? oobCode : ''} />

        <p className="text-xs text-cc-ink-muted mt-8 leading-relaxed">
          Clean-Core.io · Felix Frenzel · Hellerstraße 9 · 96047 Bamberg · Germany
        </p>
      </div>
    </main>
  );
}
