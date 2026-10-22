import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';

/**
 * The privacy policy, English version — Fassung 1.1 (3.0.21).
 *
 * The words are in `lib/legal/texts/privacy.en.ts`; the German version, which
 * prevails, in `lib/legal/texts/privacy.de.ts`. Values the owner still has to
 * give come from `lib/legal/open-values.ts`. This page only frames the text.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
  description: 'Privacy policy (Datenschutzerklärung) for Clean-Core.io. GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
  alternates: {
    canonical: 'https://clean-core.io/datenschutz',
    languages: {
      en: 'https://clean-core.io/datenschutz',
      de: 'https://clean-core.io/datenschutz/de',
    },
  },
  openGraph: {
    title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
    description: 'GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
    url: 'https://clean-core.io/datenschutz',
    type: 'website',
  },
});

export default function DatenschutzPage() {
  return (
    <LegalPage
      lang="en"
      title="Privacy Policy"
      subtitle="(Datenschutzerklärung)"
      blocks={legalDocumentBlocks('privacy', 'en')}
      switchHref="/datenschutz/de"
      switchDataAttr="data-privacy-language-switch"
    />
  );
}
