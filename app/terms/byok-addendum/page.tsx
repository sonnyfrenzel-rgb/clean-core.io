import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import ByokAddendumPage from '@/components/legal/ByokAddendumPage';

/** The Additional Agreement on Own Model Keys (ZV-BYOK-1.0), English version. Words: `lib/legal/texts/byok-addendum.en.ts`. */

export const metadata: Metadata = withTwitterCard({
  title: 'Additional Agreement on Own Model Keys | Clean-Core.io',
  description:
    'The Additional Agreement on Own Model Keys (ZV-BYOK-1.0) for storing your own Anthropic key on Clean-Core.io: recipient, transfer, model, costs and ending.',
  alternates: {
    canonical: 'https://clean-core.io/terms/byok-addendum',
    languages: {
      en: 'https://clean-core.io/terms/byok-addendum',
      de: 'https://clean-core.io/terms/byok-addendum/de',
    },
  },
  openGraph: {
    title: 'Additional Agreement on Own Model Keys | Clean-Core.io',
    description: 'ZV-BYOK-1.0 — the agreement you accept when you store your own Anthropic key.',
    url: 'https://clean-core.io/terms/byok-addendum',
    type: 'website',
  },
});

export default function ByokAddendumEnPage() {
  return <ByokAddendumPage lang="en" />;
}
