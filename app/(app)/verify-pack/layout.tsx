import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';

/**
 * The page is a client component, so its metadata lives here. Without it the
 * page introduced itself with the site's default title.
 */
const title = 'Verify a signed audit pack | Clean-Core.io';
const description =
  'Check that a Clean-Core.io audit pack is complete, unchanged and signed, in your browser. A signature proves origin and integrity, not correct code.';

export const metadata: Metadata = withTwitterCard({
  title,
  description,
  alternates: { canonical: 'https://clean-core.io/verify-pack' },
  openGraph: { title, description, url: 'https://clean-core.io/verify-pack', type: 'website' },
});

export default function VerifyPackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
