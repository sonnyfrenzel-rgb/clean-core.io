import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import LegalPage from '@/components/legal/LegalPage';
import { legalDocumentBlocks } from '@/lib/legal/documents';
import { ARCHIVED_TERMS_VERSIONS } from '@/lib/terms-versions';
import { TERMS_VERSION } from '@/lib/constants';

/**
 * The Terms of Service, English version — v2.3.0, Fassung 1.1 (3.0.21).
 *
 * The words are in `lib/legal/texts/terms.en.ts` (German: `terms.de.ts`, at
 * `/terms/de`). The archived wording of `TERMS_VERSION` is generated from the
 * same source (`scripts/legal/archive-terms.ts`), so the page and the digest a
 * consent record carries cannot say different things
 * (`tests/legal-archive-sync.spec.ts`, `tests/terms-version-archive.spec.ts`).
 *
 * The list of published versions is navigation, not contract text: it sits in
 * `#previous-versions` and is not part of the archived wording. It lists every
 * archived version and links to each, and deliberately does not reproduce the
 * superseded ones here — an earlier text carries clauses this one replaced
 * (`tests/terms-consumer-law-guard.spec.ts`).
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Terms of Service & Community Guidelines | Clean-Core.io',
  description:
    'Terms of Service and Community Guidelines for Clean-Core.io, a free, non-commercial project for the SAP community. Governed by German law.',
  alternates: {
    canonical: 'https://clean-core.io/terms',
    languages: {
      en: 'https://clean-core.io/terms',
      de: 'https://clean-core.io/terms/de',
    },
  },
  openGraph: {
    title: 'Terms of Service & Community Guidelines | Clean-Core.io',
    description: 'Consolidated Terms of Service and Community Guidelines for Clean-Core.io.',
    url: 'https://clean-core.io/terms',
    type: 'website',
  },
});

const LINK = 'font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline';

function PublishedVersions() {
  return (
    <ul className="list-disc pl-5 space-y-2 text-sm text-cc-ink-muted" data-terms-archive>
      {ARCHIVED_TERMS_VERSIONS.map((archived) => (
        <li key={archived.version} data-terms-archive-entry={archived.version}>
          {archived.label} &mdash; effective {archived.effectiveOn}
          {archived.version === TERMS_VERSION ? ' (the version above, in force)' : ''} &mdash;{' '}
          <Link href={`/terms/versions/${archived.version}`} className={LINK}>
            read the full text
          </Link>
          {archived.translations?.map((t) => (
            <span key={t.lang}>
              {' · '}
              <Link href={`/terms/versions/${archived.version}/${t.lang}`} hrefLang={t.lang} className={LINK}>
                Deutsche Fassung
              </Link>
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <LegalPage
      lang="en"
      title="Terms of Service"
      subtitle="& Community Guidelines"
      blocks={legalDocumentBlocks('terms', 'en')}
      switchHref="/terms/de"
      switchDataAttr="data-terms-language-switch"
      renderAfterSection={{ 'previous-versions': <PublishedVersions /> }}
    />
  );
}
