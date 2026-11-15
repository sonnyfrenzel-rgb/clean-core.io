import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseArchivedTerms, type TermsBlock } from '@/lib/terms-versions';
import {
  PRIVACY_POLICY_CURRENT,
  privacyVersion,
  privacyVersionPath,
  publishedPrivacyVersions,
  type PrivacyVersionId,
} from '@/lib/legal/privacy-versions';
import type { LegalLang } from '@/lib/legal/open-values';

/**
 * One version of the privacy policy at its fixed address — `/datenschutz/versions/<id>` (English) and
 * `/datenschutz/versions/<id>/de` (German) — read from its archived file (`lib/legal/privacy-versions.ts`).
 *
 * The same rules as the Terms archive (`app/terms/versions/[version]/page.tsx`): the bytes on disk are the bytes on
 * screen, read at build time (the route files are `force-static`), with the digest printed so the file and the page
 * can be compared. A version not yet in force in this build is no page (404), so a text is never public before its
 * day. Not indexed: an old policy competing with the current one in search would be read as the current one.
 */

const LINK = 'font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline';

export function archivedPrivacyMetadata(id: PrivacyVersionId, lang: LegalLang): Metadata {
  const v = privacyVersion(id);
  return {
    title: lang === 'de' ? `Datenschutzerklärung, Fassung ${v.id} (Archiv) | Clean-Core.io` : `Privacy Policy, version ${v.id} (archived) | Clean-Core.io`,
    alternates: { canonical: `https://clean-core.io${privacyVersionPath(v.id, lang)}` },
    robots: { index: false, follow: true },
  };
}

function Block({ block }: { block: TermsBlock }) {
  if (block.kind === 'heading') {
    return block.level === 1 ? (
      <h2 className="text-2xl font-extrabold text-cc-ink tracking-tight">{block.text}</h2>
    ) : (
      <h3 className="text-xl font-bold text-cc-ink tracking-tight pt-4">{block.text}</h3>
    );
  }
  if (block.kind === 'list') {
    return (
      <ul className="list-disc pl-5 space-y-2 text-sm text-cc-ink-muted">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-base">
      {block.lines.map((line, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

export default function ArchivedPrivacyPage({ id, lang }: { id: PrivacyVersionId; lang: LegalLang }) {
  if (!publishedPrivacyVersions().some((v) => v.id === id)) notFound();
  const v = privacyVersion(id);
  const blocks = parseArchivedTerms(fs.readFileSync(path.join(process.cwd(), v.files[lang]), 'utf8'));
  const inForce = v.id === PRIVACY_POLICY_CURRENT.id;
  const de = lang === 'de';
  const current = de ? '/datenschutz/de' : '/datenschutz';

  return (
    <main lang={lang} className="max-w-3xl mx-auto px-6 py-16 md:py-24" data-archived-privacy={v.id} data-archived-lang={lang}>
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-4">
        {de ? 'Datenschutzerklärung' : 'Privacy Policy'}{' '}
        <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">
          {de ? `Fassung ${v.id}, Archiv` : `version ${v.id}, archived`}
        </span>
      </h1>
      <div
        className={inForce ? 'p-4 bg-cc-brand-surface border border-cc-line rounded-xl mb-10' : 'p-4 bg-cc-warning-bg border border-cc-warning-border rounded-xl mb-10'}
        data-archived-current={inForce ? 'true' : 'false'}
      >
        <p className={inForce ? 'text-sm text-cc-ink-muted' : 'text-sm text-cc-warning'}>
          {inForce
            ? de
              ? 'Dies ist die geltende Fassung. Diese Adresse zeigt ihren archivierten Wortlaut unverändert und bleibt erreichbar, wenn eine spätere Fassung sie ablöst. Die geltende Datenschutzerklärung steht unter '
              : 'This is the version in force. This address shows its archived wording unchanged and stays reachable after a later version replaces it. The current privacy policy is at '
            : de
              ? `Diese Fassung gilt nicht mehr. Sie steht hier unverändert, weil sie ab dem ${v.date.de} galt. Die geltende Datenschutzerklärung steht unter `
              : `This version is no longer current. It is reproduced here unchanged because it applied from ${v.date.en}. The current privacy policy is at `}
          <Link href={current} className={LINK}>
            clean-core.io{current}
          </Link>
          .
        </p>
      </div>
      <dl className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-cc-ink-muted font-semibold">{de ? 'Fassung' : 'Version'}</dt>
          <dd className="text-cc-ink font-cc-mono" data-archived-version>
            {v.id}
          </dd>
        </div>
        <div>
          <dt className="text-cc-ink-muted font-semibold">{de ? 'Stand' : 'As of'}</dt>
          <dd className="text-cc-ink" data-archived-date>
            {v.date[lang]}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-cc-ink-muted font-semibold">{de ? 'SHA-256 dieses Wortlauts' : 'SHA-256 of this text'}</dt>
          <dd className="text-cc-ink font-cc-mono text-xs break-all" data-archived-sha256>
            {v.sha256[lang]}
          </dd>
        </div>
      </dl>
      <article className="space-y-6 text-cc-ink leading-relaxed" data-archived-text>
        {blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </article>
    </main>
  );
}

/** The list of every published version, under the current policy: navigation, not part of its text. */
export function PublishedPrivacyVersions({ lang }: { lang: LegalLang }) {
  const de = lang === 'de';
  return (
    <section className="mt-12" data-privacy-versions="" aria-labelledby="privacy-versions-title">
      <h2 id="privacy-versions-title" className="text-xl font-bold text-cc-ink tracking-tight mb-3">
        {de ? 'Veröffentlichte Fassungen' : 'Published versions'}
      </h2>
      <ul className="list-disc pl-5 space-y-1 text-sm text-cc-ink">
        {publishedPrivacyVersions()
          .slice()
          .reverse()
          .map((v) => (
            <li key={v.id}>
              <Link href={privacyVersionPath(v.id, lang)} className={LINK} data-privacy-version-link={v.id}>
                {de ? `Fassung ${v.id}, Stand ${v.date.de}` : `Version ${v.id}, as of ${v.date.en}`}
              </Link>
              {v.id === PRIVACY_POLICY_CURRENT.id ? (de ? ' (geltend)' : ' (in force)') : ''}
            </li>
          ))}
      </ul>
    </section>
  );
}
