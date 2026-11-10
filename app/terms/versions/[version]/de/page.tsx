import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARCHIVED_TERMS_VERSIONS, archivedTerms, parseArchivedTerms, type TermsBlock } from '@/lib/terms-versions';

/**
 * The German wording of an archived Terms version — from v2.3.0 on, which can
 * be concluded in German (section 1.4). Same rules as the English archive page
 * next to it: the bytes on disk are the bytes on screen, with the digest a
 * consent in German carries.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return ARCHIVED_TERMS_VERSIONS.filter((v) => v.translations?.some((t) => t.lang === 'de')).map((v) => ({
    version: v.version,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ version: string }> }): Promise<Metadata> {
  const { version } = await params;
  const entry = archivedTerms(version);
  return {
    title: entry ? `Nutzungsbedingungen ${entry.label} (Archiv) | Clean-Core.io` : 'Nutzungsbedingungen (Archiv) | Clean-Core.io',
    alternates: { canonical: `https://clean-core.io/terms/versions/${version}/de` },
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

export default async function ArchivedTermsDePage({ params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const entry = archivedTerms(version);
  const de = entry?.translations?.find((t) => t.lang === 'de');
  if (!entry || !de) notFound();
  const blocks = parseArchivedTerms(fs.readFileSync(path.join(process.cwd(), de.file), 'utf8'));

  return (
    <main lang="de" className="max-w-3xl mx-auto px-6 py-16 md:py-24" data-archived-terms={entry.version} data-archived-lang="de">
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-4">
        Nutzungsbedingungen{' '}
        <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">{entry.label}, Archiv</span>
      </h1>
      <p className="text-sm text-cc-ink-muted mb-8">
        Die geltenden Nutzungsbedingungen stehen unter{' '}
        <Link href="/terms/de" className="font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline">
          clean-core.io/terms/de
        </Link>
        .
      </p>
      <dl className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-cc-ink-muted font-semibold">Fassung</dt>
          <dd className="text-cc-ink font-cc-mono">{entry.version}</dd>
        </div>
        <div>
          <dt className="text-cc-ink-muted font-semibold">Gültig ab</dt>
          <dd className="text-cc-ink">{de.effectiveOn}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-cc-ink-muted font-semibold">SHA-256 dieses Wortlauts</dt>
          <dd className="text-cc-ink font-cc-mono text-xs break-all" data-archived-sha256>
            {de.sha256}
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
