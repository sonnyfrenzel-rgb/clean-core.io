import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';

/**
 * Reporting illegal content, English version — the page section 7 of the Terms
 * of Service v2.3.0 points to (owner decision 22./23.10.2026).
 *
 * The words are in `lib/legal/texts/report.en.ts` (German: `report.de.ts`, at
 * `/report/de`). This page only frames the text.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Reporting Illegal Content | Clean-Core.io',
  description:
    'How to report content on Clean-Core.io you consider illegal: what a report should contain, where to send it, and what happens next.',
  alternates: {
    canonical: 'https://clean-core.io/report',
    languages: {
      en: 'https://clean-core.io/report',
      de: 'https://clean-core.io/report/de',
    },
  },
  openGraph: {
    title: 'Reporting Illegal Content | Clean-Core.io',
    description: 'What a report of illegal content should contain, where to send it, and what happens next.',
    url: 'https://clean-core.io/report',
    type: 'website',
  },
});

export default function ReportPage() {
  return (
    <LegalPage
      lang="en"
      title="Reporting Illegal Content"
      blocks={legalDocumentBlocks('report', 'en')}
      switchHref="/report/de"
      switchDataAttr="data-report-language-switch"
    />
  );
}
