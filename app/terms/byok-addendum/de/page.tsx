import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import ByokAddendumPage from '@/components/legal/ByokAddendumPage';

/** The Additional Agreement on Own Model Keys (ZV-BYOK-1.0), German version. Words: `lib/legal/texts/byok-addendum.de.ts`. */

export const metadata: Metadata = withTwitterCard({
  title: 'Zusatzvereinbarung zu eigenen Modellschlüsseln | Clean-Core.io',
  description:
    'Die Zusatzvereinbarung zu eigenen Modellschlüsseln (ZV-BYOK-1.0) für einen eigenen Anthropic-Schlüssel bei Clean-Core.io: Empfänger, Übermittlung, Modell, Kosten und Beendigung.',
  alternates: {
    canonical: 'https://clean-core.io/terms/byok-addendum/de',
    languages: {
      de: 'https://clean-core.io/terms/byok-addendum/de',
      en: 'https://clean-core.io/terms/byok-addendum',
    },
  },
  openGraph: {
    title: 'Zusatzvereinbarung zu eigenen Modellschlüsseln | Clean-Core.io',
    description: 'ZV-BYOK-1.0 — die Vereinbarung, die Sie beim Hinterlegen eines eigenen Anthropic-Schlüssels annehmen.',
    url: 'https://clean-core.io/terms/byok-addendum/de',
    type: 'website',
  },
});

export default function ByokAddendumDePage() {
  return <ByokAddendumPage lang="de" />;
}
