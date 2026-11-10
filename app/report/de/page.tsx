import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';

/**
 * Reporting illegal content, German version — the page section 7 of the German
 * Terms of Service (version of 23.10.2026) points to. The words are in
 * `lib/legal/texts/report.de.ts`.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Rechtswidrige Inhalte melden | Clean-Core.io',
  description:
    'So melden Sie Inhalte auf Clean-Core.io, die Sie für rechtswidrig halten: was eine Meldung enthalten sollte, wohin Sie sie senden und wie es weitergeht.',
  alternates: {
    canonical: 'https://clean-core.io/report/de',
    languages: {
      de: 'https://clean-core.io/report/de',
      en: 'https://clean-core.io/report',
    },
  },
  openGraph: {
    title: 'Rechtswidrige Inhalte melden | Clean-Core.io',
    description: 'Was eine Meldung rechtswidriger Inhalte enthalten sollte, wohin Sie sie senden und wie es weitergeht.',
    url: 'https://clean-core.io/report/de',
    type: 'website',
  },
});

export default function ReportDePage() {
  return (
    <LegalPage
      lang="de"
      title="Rechtswidrige Inhalte melden"
      blocks={legalDocumentBlocks('report', 'de')}
      switchHref="/report"
      switchDataAttr="data-report-language-switch"
    />
  );
}
