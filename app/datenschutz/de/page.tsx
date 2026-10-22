import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';

/**
 * Die Datenschutzerklärung, deutsche Fassung — Fassung 1.1 (3.0.21). Sie ist
 * maßgeblich, wenn die beiden Fassungen je voneinander abweichen.
 *
 * Why it exists: Art. 12(1) GDPR requires the information in clear and plain
 * language; the controller, the supervisory authority and most of the
 * community are German-speaking. Why the English version keeps `/datenschutz`:
 * every link in the product points there, and the trust card before the upload
 * quotes it (`tests/trust-card-guard.spec.ts`).
 *
 * The words are in `lib/legal/texts/privacy.de.ts`; both versions have the
 * same sections and anchors (`tests/privacy-policy-parity.spec.ts`).
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Datenschutzerklärung | Clean-Core.io',
  description:
    'Datenschutzerklärung von Clean-Core.io: Verarbeitung nach DSGVO, Ihre Rechte nach Art. 15–21 DSGVO, Widerspruchsrecht und Löschung (Art. 17).',
  alternates: {
    canonical: 'https://clean-core.io/datenschutz/de',
    languages: {
      de: 'https://clean-core.io/datenschutz/de',
      en: 'https://clean-core.io/datenschutz',
    },
  },
  openGraph: {
    title: 'Datenschutzerklärung | Clean-Core.io',
    description: 'Verarbeitung nach DSGVO, Ihre Rechte nach Art. 15–21 DSGVO und Löschung (Art. 17).',
    url: 'https://clean-core.io/datenschutz/de',
    type: 'website',
  },
});

export default function DatenschutzDePage() {
  return (
    <LegalPage
      lang="de"
      title="Datenschutzerklärung"
      blocks={legalDocumentBlocks('privacy', 'de')}
      switchHref="/datenschutz"
      switchDataAttr="data-privacy-language-switch"
    />
  );
}
