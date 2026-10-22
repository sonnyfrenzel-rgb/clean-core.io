import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';

/**
 * Die Nutzungsbedingungen, deutsche Fassung — v2.3.0, Fassung 1.1 (3.0.21).
 *
 * From v2.3.0 the contract can be concluded in German or English (section
 * 1.4); the version accepted in that language governs. The words are in
 * `lib/legal/texts/terms.de.ts`; the archive holds them as
 * `docs/terms/<TERMS_VERSION>.de.md`.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Nutzungsbedingungen und Community-Richtlinien | Clean-Core.io',
  description:
    'Nutzungsbedingungen und Community-Richtlinien von Clean-Core.io, einem unentgeltlichen Community-Projekt für die SAP-Community. Es gilt deutsches Recht.',
  alternates: {
    canonical: 'https://clean-core.io/terms/de',
    languages: {
      de: 'https://clean-core.io/terms/de',
      en: 'https://clean-core.io/terms',
    },
  },
  openGraph: {
    title: 'Nutzungsbedingungen und Community-Richtlinien | Clean-Core.io',
    description: 'Konsolidierte Nutzungsbedingungen und Community-Richtlinien von Clean-Core.io.',
    url: 'https://clean-core.io/terms/de',
    type: 'website',
  },
});

export default function TermsDePage() {
  return (
    <LegalPage
      lang="de"
      title="Nutzungsbedingungen"
      subtitle="und Community-Richtlinien"
      blocks={legalDocumentBlocks('terms', 'de')}
      switchHref="/terms"
      switchDataAttr="data-terms-language-switch"
      renderAfterSection={{
        'previous-versions': (
          <p className="text-sm text-cc-ink-muted">
            <Link
              href="/terms#previous-versions"
              hrefLang="en"
              className="font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline"
            >
              Liste der veröffentlichten Fassungen (englische Fassung)
            </Link>
          </p>
        ),
      }}
    />
  );
}
