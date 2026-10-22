import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LegalBlock } from '@/lib/legal/markup';

/**
 * Renders a legal text from `lib/legal/markup.ts` blocks.
 *
 * No hooks, no state: it renders the same in a server page and inside the
 * sign-up dialog, so the words in both places are one set of words. Every
 * `## Heading {#anchor}` opens a `<section id>` — the anchors other pages link
 * to (`/datenschutz#source-code`, `/terms#third-party-ai`, …) stay where they were.
 */

const LINK = 'font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline [overflow-wrap:anywhere]';

const AUTOLINK =
  /(https?:\/\/[^\s)„“"]+)|(info@clean-core\.io)|(?<![\w./@-])(clean-core\.io\/[a-z0-9/-]*[a-z0-9])|(?<=\()(\/(?:datenschutz|terms|how-it-works)(?:\/[a-z-]+)*)(?=\))/g;

function linkify(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(AUTOLINK)) {
    let match = m[0];
    // A sentence may end right after a URL; the full stop is not part of it.
    const trailing = /[.,;:]+$/.exec(match)?.[0] ?? '';
    if (trailing) match = match.slice(0, -trailing.length);
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const key = `${keyBase}-l${n++}`;
    if (m[1]) {
      out.push(
        <a key={key} href={match} target="_blank" rel="noopener noreferrer" className={LINK}>
          {match}
        </a>,
      );
    } else if (m[2]) {
      out.push(
        <a key={key} href={`mailto:${match}`} className={LINK}>
          {match}
        </a>,
      );
    } else {
      const href = m[3] ? match.slice('clean-core.io'.length) : match;
      out.push(
        <Link key={key} href={href} className={LINK}>
          {match}
        </Link>,
      );
    }
    last = start + match.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `**bold**` and links. */
export function LegalInline({ text, keyBase = 'i' }: { text: string; keyBase?: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={`${keyBase}-b${i}`} className="font-semibold text-cc-ink">
            {linkify(part, `${keyBase}-b${i}`)}
          </strong>
        ) : (
          <span key={`${keyBase}-t${i}`}>{linkify(part, `${keyBase}-t${i}`)}</span>
        ),
      )}
    </>
  );
}

function Block({ block, k, compact }: { block: LegalBlock; k: string; compact?: boolean }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 3 ? (
        <h3 className="text-lg font-bold tracking-tight text-cc-ink mb-2 mt-4">
          <LegalInline text={block.text} keyBase={k} />
        </h3>
      ) : (
        <h2 className={compact ? 'm-0 mb-2 cc-text-h3 text-cc-ink' : 'text-xl font-bold tracking-tight text-cc-ink mb-3'}>
          <LegalInline text={block.text} keyBase={k} />
        </h2>
      );
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-2 mb-3">
          {block.items.map((item, i) => (
            <li key={`${k}-${i}`} className={compact ? 'cc-text-cell' : 'text-base'}>
              <LegalInline text={item} keyBase={`${k}-${i}`} />
            </li>
          ))}
        </ul>
      );
    case 'box':
      return (
        <div className="p-4 mb-3 bg-cc-surface-muted border border-cc-line rounded-2xl">
          <p className={compact ? 'm-0 cc-text-cell' : 'text-base m-0'}>
            <LegalInline text={block.text} keyBase={k} />
          </p>
        </div>
      );
    default:
      return (
        <p className={compact ? 'm-0 mb-2 cc-text-cell' : 'text-base mb-3'}>
          {block.lines.map((line, i) => (
            <span key={`${k}-${i}`}>
              {i > 0 ? <br /> : null}
              <LegalInline text={line} keyBase={`${k}-${i}`} />
            </span>
          ))}
        </p>
      );
  }
}

/** Blocks without sections — for a page that draws its own frame per section (the trust page). */
export function LegalBlockList({ blocks, compact = false }: { blocks: LegalBlock[]; compact?: boolean }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={`x${i}`} block={b} k={`x${i}`} compact={compact} />
      ))}
    </>
  );
}

/**
 * The document body. The level-1 title is left to the page (it carries the
 * page's own styling and a subtitle); `omitSectionIds` drops anchors where two
 * documents share one page and must not collide.
 */
export default function LegalDocument({
  blocks,
  compact = false,
  omitSectionIds = [],
  renderAfterSection,
}: {
  blocks: LegalBlock[];
  compact?: boolean;
  omitSectionIds?: string[];
  /** Extra content placed at the end of the section with this anchor (the version list). */
  renderAfterSection?: Record<string, ReactNode>;
}) {
  const preamble: LegalBlock[] = [];
  const sections: { heading: LegalBlock & { kind: 'heading' }; body: LegalBlock[] }[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level === 1) continue;
    if (b.kind === 'heading' && b.level === 2) {
      sections.push({ heading: b, body: [] });
      continue;
    }
    if (sections.length) sections[sections.length - 1].body.push(b);
    else preamble.push(b);
  }
  return (
    <div className={compact ? 'space-y-5 text-cc-ink' : 'space-y-10 text-cc-ink leading-relaxed'} data-legal-document="">
      {preamble.length > 0 && (
        <div>
          {preamble.map((b, i) => (
            <Block key={`p${i}`} block={b} k={`p${i}`} compact={compact} />
          ))}
        </div>
      )}
      {sections.map((s, si) => {
        const id = s.heading.id && !omitSectionIds.includes(s.heading.id) ? s.heading.id : undefined;
        return (
          <section key={`s${si}`} id={id} className={id ? 'scroll-mt-20' : undefined}>
            <Block block={s.heading} k={`s${si}h`} compact={compact} />
            {s.body.map((b, bi) => (
              <Block key={`s${si}b${bi}`} block={b} k={`s${si}b${bi}`} compact={compact} />
            ))}
            {s.heading.id && renderAfterSection?.[s.heading.id]}
          </section>
        );
      })}
    </div>
  );
}
