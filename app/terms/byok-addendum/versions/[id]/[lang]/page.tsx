import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARCHIVED_BYOK_ADDENDUM_VERSIONS, archivedAddendum } from '@/lib/legal/byok-addendum-versions';
import { parseArchivedTerms, type TermsBlock } from '@/lib/terms-versions';

/**
 * One version of the Additional Agreement on Own Model Keys in one language,
 * at an address bound to both — the link the contract confirmation carries
 * for it (Terms 1.3: the confirmation "also includes any agreements you
 * accepted separately"; Additional Agreement clause 12; `publishedWordingPath`
 * in `lib/contract-confirmation-email.ts`).
 *
 * `/terms/byok-addendum` renders the agreement from its current source; this
 * page renders the archived file whose SHA-256 an acceptance record carries
 * (`lib/legal/byok-addendum-versions.ts`), so the address keeps showing the
 * words accepted after a later version replaces them. Prerendered from disk at
 * build time like the Terms archive (`app/terms/versions/[version]/page.tsx`):
 * an id or language that was never archived is a 404.
 */

export const dynamic = 'force-static';
export const dynamicParams = false;

type Params = { id: string; lang: string };

export function generateStaticParams(): Params[] {
  return ARCHIVED_BYOK_ADDENDUM_VERSIONS.flatMap((v) => v.files.map((f) => ({ id: v.id, lang: f.lang })));
}

function fileOf(params: Params) {
  const entry = archivedAddendum(decodeURIComponent(params.id));
  const file = entry?.files.find((f) => f.lang === params.lang);
  return entry && file ? { entry, file } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  const found = fileOf(p);
  const de = p.lang === 'de';
  return {
    title: found
      ? de
        ? `Zusatzvereinbarung zu eigenen Modellschlüsseln ${found.entry.id} (Archiv) | Clean-Core.io`
        : `Additional Agreement on Own Model Keys ${found.entry.id} (archived wording) | Clean-Core.io`
      : 'Additional Agreement on Own Model Keys | Clean-Core.io',
    alternates: { canonical: `https://clean-core.io/terms/byok-addendum/versions/${p.id}/${p.lang}` },
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

const LINK = 'font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline';

export default async function ArchivedAddendumPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const found = fileOf(p);
  if (!found) notFound();
  const { entry, file } = found;
  const de = file.lang === 'de';
  const blocks = parseArchivedTerms(fs.readFileSync(path.join(process.cwd(), file.file), 'utf8'));

  return (
    <main
      lang={file.lang}
      className="max-w-3xl mx-auto px-6 py-16 md:py-24"
      data-archived-addendum={entry.id}
      data-archived-lang={file.lang}
    >
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-4">
        {de ? 'Zusatzvereinbarung' : 'Additional Agreement'}{' '}
        <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">
          {entry.id}, {de ? 'archivierter Wortlaut' : 'archived wording'}
        </span>
      </h1>
      <p className="text-sm text-cc-ink-muted mb-8">
        {de ? (
          <>
            Diese Adresse zeigt den Wortlaut dieser Fassung unverändert und bleibt erreichbar, auch wenn eine spätere
            Fassung sie ersetzt. Die geltende Fassung steht unter{' '}
            <Link href="/terms/byok-addendum/de" className={LINK}>
              clean-core.io/terms/byok-addendum/de
            </Link>
            .
          </>
        ) : (
          <>
            This address shows the wording of this version unchanged and stays reachable after a later version
            replaces it. The version in force is at{' '}
            <Link href="/terms/byok-addendum" className={LINK}>
              clean-core.io/terms/byok-addendum
            </Link>
            .
          </>
        )}
      </p>
      <dl className="mb-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-cc-ink-muted font-semibold">{de ? 'Kennung' : 'Identifier'}</dt>
          <dd className="text-cc-ink font-cc-mono">{entry.id}</dd>
        </div>
        <div>
          <dt className="text-cc-ink-muted font-semibold">{de ? 'Gültig ab' : 'Effective from'}</dt>
          <dd className="text-cc-ink">{entry.effectiveOn[file.lang]}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-cc-ink-muted font-semibold">{de ? 'SHA-256 dieses Wortlauts' : 'SHA-256 of this text'}</dt>
          <dd className="text-cc-ink font-cc-mono text-xs break-all" data-archived-sha256>
            {file.sha256}
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
