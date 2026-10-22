import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_RELEASE_DATE, APP_RELEASE_DATE_DE, APP_VERSION } from '@/lib/version';
import type { LegalLang } from '@/lib/legal/open-values';
import type { LegalBlock } from '@/lib/legal/markup';
import LegalDocument from '@/components/legal/LegalDocument';

/**
 * The frame of every published legal text: the language switch above `<main>`
 * (outside it, so it is not read as part of the text), the title, the text
 * itself, and the version line. The words come only from the blocks.
 */
export default function LegalPage({
  lang,
  title,
  subtitle,
  blocks,
  switchHref,
  switchDataAttr,
  dataAttrs,
  beforeText,
  renderAfterSection,
}: {
  lang: LegalLang;
  title: string;
  subtitle?: string;
  blocks: LegalBlock[];
  /** The other language version. */
  switchHref: string;
  /** e.g. `data-privacy-language-switch` — kept so existing checks find the switch. */
  switchDataAttr: string;
  dataAttrs?: Record<string, string>;
  beforeText?: ReactNode;
  renderAfterSection?: Record<string, ReactNode>;
}) {
  const other = lang === 'de' ? 'en' : 'de';
  return (
    <>
      <nav
        lang={lang}
        aria-label={lang === 'de' ? 'Sprachfassung' : 'Language version'}
        className="max-w-3xl mx-auto px-6 pt-8 flex justify-end"
      >
        <Link
          href={switchHref}
          hrefLang={other}
          lang={other}
          {...{ [switchDataAttr]: other }}
          className="cc-text-label text-cc-ink-muted underline-offset-4 hover:text-cc-brand-strong hover:underline"
        >
          {lang === 'de' ? 'English version' : 'Deutsche Fassung'}
        </Link>
      </nav>

      <main lang={lang} className="max-w-3xl mx-auto px-6 pt-8 pb-16 md:pt-10 md:pb-24" {...dataAttrs}>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-8">
          {title}
          {subtitle ? <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl"> {subtitle}</span> : null}
        </h1>
        {beforeText}
        <LegalDocument blocks={blocks} renderAfterSection={renderAfterSection} />
        <div className="mt-10 pt-8 border-t border-cc-line text-center cc-text-label font-cc-mono text-cc-ink-muted">
          Clean-Core.io {APP_VERSION} ({lang === 'de' ? APP_RELEASE_DATE_DE : APP_RELEASE_DATE})
        </div>
      </main>
    </>
  );
}
