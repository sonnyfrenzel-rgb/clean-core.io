import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import {
  ArrowRight, BookOpen, Lightbulb, AlertTriangle, GraduationCap,
  MessageSquareQuote, PlayCircle, ExternalLink, Check, Clock, Ban,
} from 'lucide-react';
import GuideShareBar from '@/components/GuideShareBar';
import SectionHeader from '@/components/SectionHeader';
import { publicButton } from '@/components/landing/public-button';
import { CcTag } from '@/components/cc/Tag';
import { GUIDE_PARTS, GUIDE_FAQ, NOTE_LABELS, type NoteKind } from '@/lib/clean-core-guide';
import { CAPABILITIES, HONEST_SCOPE } from '@/lib/clean-core-capabilities';
import { CONTACT_EMAIL } from '@/lib/constants';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Explained — From First Principles to Practice | Clean-Core.io',
  description:
    'What SAP Clean Core actually means, explained without the jargon: why modifications break upgrades, in-app versus side-by-side extensibility, RAP versus CAP, and the A–D grading model for classifying custom ABAP. Written for beginners, useful for architects.',
  keywords: [
    'SAP Clean Core', 'Clean Core explained', 'SAP Clean Core extensibility',
    'RAP vs CAP', 'ABAP Cloud', 'custom code remediation', 'S/4HANA migration',
    'released SAP APIs', 'Clean Core levels A-D',
  ],
  alternates: { canonical: 'https://clean-core.io/clean-core-explained' },
  openGraph: {
    title: 'SAP Clean Core Explained — From First Principles to Practice',
    description:
      'Why modifications break upgrades, in-app versus side-by-side, RAP versus CAP, and how to grade your custom ABAP A–D. No prior SAP knowledge assumed.',
    url: 'https://clean-core.io/clean-core-explained',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
});

/**
 * The long-form Clean Core explainer.
 *
 * Structured answer-first throughout — every chapter opens with a one-sentence
 * lede before elaborating, because that is what both a hurried reader and an AI
 * answer engine take away. The FAQ is emitted as structured data from the same
 * source as the visible text, so the two can never drift apart.
 *
 * Named "Clean Core Explained", not the obvious alternative: "For Dummies" is a
 * registered trademark of John Wiley & Sons, who publish SAP titles in that
 * series. The didactic form — short chapters, margin notes, every term defined
 * before use — is not protected, and is what actually makes the format work.
 */

/**
 * The margin notes, in the product's state tokens (block D, D.23a). The kind is
 * carried by the icon and the label word; the colour only supports it. "Remember"
 * takes the brand surface rather than success green — green means proven
 * (ADR-007), and a note to remember is not a proof.
 */
const NOTE_STYLES: Record<NoteKind, { icon: typeof Lightbulb; box: string; label: string }> = {
  remember: { icon: BookOpen, box: 'border-cc-line bg-cc-brand-surface', label: 'text-cc-brand-strong' },
  tip: { icon: Lightbulb, box: 'border-cc-information-border bg-cc-information-bg', label: 'text-cc-information' },
  warning: { icon: AlertTriangle, box: 'border-cc-warning-border bg-cc-warning-bg', label: 'text-cc-warning' },
  advanced: { icon: GraduationCap, box: 'border-cc-neutral-border bg-cc-neutral-bg', label: 'text-cc-neutral' },
  jargon: { icon: MessageSquareQuote, box: 'border-cc-line bg-cc-surface-muted', label: 'text-cc-ink-muted' },
};

/** The landing page's hero mesh, from tokens, at .18 (DESIGN.md §1.4, ADR-051). */
const HERO_MESH =
  'radial-gradient(38% 42% at 10% 12%,var(--cc-seq-3) 0%,transparent 70%),radial-gradient(34% 40% at 90% 10%,var(--cc-brand) 0%,transparent 70%),radial-gradient(46% 40% at 55% 62%,var(--cc-chart-3) 0%,transparent 72%)';
const CARD = 'rounded-3xl border border-cc-line bg-cc-surface';
/** A part opens with the one public section header; the rule under it is the part break. */
const PART_HEAD = 'border-b-2 border-cc-ink pb-5 [&>div]:mb-0';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';
const TOC_LINK = `group flex items-baseline gap-3 rounded-cc-row ${FOCUS}`;
const TOC_EYEBROW = 'cc-text-label w-14 shrink-0 text-cc-ink-muted';
const TOC_TITLE = 'text-sm font-bold text-cc-ink transition-colors group-hover:text-cc-brand-strong';
const FACET_LABEL = 'cc-text-label mb-2 flex items-center gap-2';
const READ_CARD = `group block rounded-2xl border border-cc-line p-5 transition-colors hover:border-cc-brand-strong ${FOCUS}`;
const READ_TITLE = 'mb-2 font-bold leading-snug text-cc-ink transition-colors group-hover:text-cc-brand-strong';
const READ_MORE = 'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cc-brand-strong';

export default function CleanCoreExplainedPage() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        headline: 'SAP Clean Core Explained — From First Principles to Practice',
        description: metadata.description,
        author: { '@type': 'Organization', name: 'Clean-Core.io' },
        publisher: { '@type': 'Organization', name: 'Clean-Core.io' },
        mainEntityOfPage: 'https://clean-core.io/clean-core-explained',
        articleSection: GUIDE_PARTS.map((p) => p.title),
      },
      {
        '@type': 'FAQPage',
        mainEntity: GUIDE_FAQ.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  };

  return (
    <div className="space-y-10 text-cc-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero — light, with the landing page's mesh at .18 (DESIGN.md §1.4) */}
      <header className="relative overflow-hidden rounded-3xl border border-cc-line bg-cc-surface p-8 shadow-cc sm:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: HERO_MESH }} />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-cc-line bg-cc-brand-surface px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong">
            <BookOpen size={14} aria-hidden="true" /> The complete explainer
          </span>
          <h1 className="mt-6 mb-5 text-4xl font-extrabold leading-[1.02] tracking-[-0.035em] text-cc-ink sm:text-6xl">
            SAP Clean Core,{' '}<br />explained without the jargon
          </h1>
          <p className="mb-8 text-lg font-medium leading-relaxed text-cc-ink-muted sm:text-xl">
            What it means, why it suddenly matters, and what to actually do about your custom ABAP.
            Starts from nothing — no SAP background needed — and goes as far as grading every object
            in your estate.
          </p>
          <div className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] font-semibold text-cc-ink-muted">
            <span>{GUIDE_PARTS.length + 2} parts</span>
            <span>· About 20 minutes</span>
            <span>· Every term defined before it is used</span>
            <span>· Free to share</span>
          </div>
        </div>
      </header>

      <GuideShareBar />

      {/* Answer-first summary — what a hurried reader and an answer engine both take away */}
      <section className={`${CARD} p-7 sm:p-10`}>
        <h2 className="cc-text-label mb-4 text-cc-brand-strong">
          The short answer
        </h2>
        <p className="mb-5 text-xl font-bold leading-snug text-cc-ink sm:text-2xl">
          Clean Core means running SAP standard software without modifying it, and adding your own
          behaviour only through interfaces SAP has formally released and promised to keep stable.
        </p>
        <p className="max-w-3xl leading-relaxed text-cc-ink-muted">
          The purpose is not tidiness. It is that upgrades stay routine instead of becoming projects,
          and that a move to the cloud remains possible at all — because SAP&apos;s cloud offerings
          simply do not run the older techniques. Everything below explains how to tell which of your
          code is affected, and what to do with each kind.
        </p>
      </section>

      {/* Table of contents */}
      <nav className={`${CARD} p-7 sm:p-8`}>
        <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-cc-ink">What is in here</h2>
        <ol className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-1 p-0 md:grid-cols-2">
          {GUIDE_PARTS.map((part) => (
            <li key={part.id} className="border-b border-cc-line py-2">
              <a href={`#${part.id}`} className={TOC_LINK}>
                <span className={TOC_EYEBROW}>
                  {part.eyebrow}
                </span>
                <span className={TOC_TITLE}>
                  {part.title}
                </span>
              </a>
            </li>
          ))}
          <li className="border-b border-cc-line py-2">
            <a href="#platform" className={TOC_LINK}>
              <span className={TOC_EYEBROW}>Part 6</span>
              <span className={TOC_TITLE}>
                How Clean-Core.io helps, concretely
              </span>
            </a>
          </li>
          <li className="border-b border-cc-line py-2">
            <a href="#faq" className={TOC_LINK}>
              <span className={TOC_EYEBROW}>Part 7</span>
              <span className={TOC_TITLE}>
                Questions people actually ask
              </span>
            </a>
          </li>
        </ol>
      </nav>

      {/* The parts */}
      {GUIDE_PARTS.map((part) => (
        <section key={part.id} id={part.id} className="scroll-mt-8 space-y-5">
          <div className={PART_HEAD}>
            <SectionHeader align="left" eyebrow={part.eyebrow} title={part.title}>
              {part.intro}
            </SectionHeader>
          </div>

          {part.chapters.map((ch) => (
            <article key={ch.id} id={ch.id} className={`${CARD} scroll-mt-8 p-7 sm:p-10`}>
              <div className="mb-3 flex items-baseline gap-3">
                <span className="shrink-0 text-sm font-bold tabular-nums text-cc-brand-strong">{ch.number}</span>
                <h3 className="text-xl font-extrabold leading-snug tracking-tight text-cc-ink sm:text-2xl">{ch.title}</h3>
              </div>

              {/* The lede carries the whole answer — everything after it is elaboration. */}
              <p className="my-6 border-l-4 border-cc-brand pl-5 text-lg font-bold leading-relaxed text-cc-ink">
                {ch.lede}
              </p>

              {ch.paragraphs.map((p, i) => (
                <p key={i} className="mb-4 max-w-3xl leading-[1.75] text-cc-ink">{p}</p>
              ))}

              {ch.terms && (
                <dl className="mt-6 space-y-0 border-t border-cc-line">
                  {ch.terms.map((t) => (
                    <div key={t.term} className="border-b border-cc-line py-4 sm:grid sm:grid-cols-4 sm:gap-6">
                      <dt className="mb-1 text-sm font-bold text-cc-ink sm:mb-0">{t.term}</dt>
                      <dd className="text-sm leading-relaxed text-cc-ink-muted sm:col-span-3">{t.definition}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {ch.table && (
                <figure className="mt-7">
                  <figcaption className="cc-text-label mb-3 text-cc-ink-muted">
                    {ch.table.caption}
                  </figcaption>
                  <div className="overflow-x-auto rounded-2xl border border-cc-line">
                    <table role="table" className="doc-table w-full border-collapse text-sm sm:min-w-[34rem]">
                      <thead role="rowgroup">
                        <tr role="row" className="bg-cc-surface-muted">
                          {ch.table.head.map((h) => (
                            <th key={h} role="columnheader" className="cc-text-label border-b border-cc-line px-4 py-3 text-left text-cc-ink-muted">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {ch.table.rows.map((row, i) => (
                          <tr key={i} role="row" className="border-b border-cc-line last:border-0">
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                role="cell"
                                data-label={ch.table!.head[j]}
                                className={`px-4 py-3 align-top leading-relaxed ${j === 0 ? 'font-bold text-cc-ink' : 'text-cc-ink-muted'}`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </figure>
              )}

              {ch.notes?.map((note, i) => {
                const s = NOTE_STYLES[note.kind];
                return (
                  <aside key={i} className={`mt-6 flex gap-4 rounded-2xl border p-5 ${s.box}`}>
                    <s.icon className={`mt-1 h-5 w-5 shrink-0 ${s.label}`} aria-hidden="true" />
                    <div>
                      <p className={`cc-text-label mb-2 ${s.label}`}>
                        {NOTE_LABELS[note.kind]}
                      </p>
                      <p className="mb-1 text-sm font-bold leading-snug text-cc-ink">{note.title}</p>
                      <p className="text-sm leading-relaxed text-cc-ink">{note.text}</p>
                    </div>
                  </aside>
                );
              })}
            </article>
          ))}
        </section>
      ))}

      {/* Part 6 — the platform, concretely */}
      <section id="platform" className="scroll-mt-8 space-y-5">
        <div className={PART_HEAD}>
          <SectionHeader align="left" eyebrow="Part 6" title="How Clean-Core.io helps, concretely">
            Seven stages, one ABAP object at a time. Each is listed with what it produces, what it
            saves you, what it costs — and where it stops. The last column is the one worth reading.
          </SectionHeader>
        </div>

        <div className="space-y-4">
          {CAPABILITIES.map((c) => (
            <article key={c.stage} className={`${CARD} p-7 sm:p-8`}>
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <CcTag>{c.stage}</CcTag>
                <h3 className="text-xl font-extrabold tracking-tight text-cc-ink">{c.title}</h3>
              </div>

              <p className="mb-5 max-w-3xl font-medium leading-relaxed text-cc-ink">{c.output}</p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-cc-line bg-cc-brand-surface p-4">
                  <p className={`${FACET_LABEL} text-cc-brand-strong`}>
                    <Check size={12} aria-hidden="true" /> Benefit
                  </p>
                  <p className="text-sm leading-relaxed text-cc-ink">{c.benefit}</p>
                </div>
                <div className="rounded-xl border border-cc-line bg-cc-surface-muted p-4">
                  <p className={`${FACET_LABEL} text-cc-ink-muted`}>
                    <Clock size={12} aria-hidden="true" /> Effort
                  </p>
                  <p className="text-sm leading-relaxed text-cc-ink-muted">{c.effort}</p>
                </div>
                <div className="rounded-xl border border-cc-warning-border bg-cc-warning-bg p-4">
                  <p className={`${FACET_LABEL} text-cc-warning`}>
                    <Ban size={12} aria-hidden="true" /> Where it stops
                  </p>
                  <p className="text-sm leading-relaxed text-cc-ink">{c.limit}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Honest scope — a card on the muted surface; the product has no dark
            panel outside code and overlays (DESIGN.md §1.1). */}
        <div className="rounded-3xl border border-cc-line bg-cc-surface-muted p-7 sm:p-10">
          <h3 className="mb-2 text-xl font-extrabold uppercase tracking-tight text-cc-ink">Honest scope</h3>
          <p className="mb-7 max-w-2xl text-sm leading-relaxed text-cc-ink-muted">
            The governing principle of this project is <em>belegt, nicht behauptet</em> — proven, not
            claimed. A capability list without limits is a claim, so here are the limits.
          </p>
          <dl className="space-y-0">
            {HONEST_SCOPE.map((s) => (
              <div key={s.claim} className="border-b border-cc-line py-4 last:border-0 sm:grid sm:grid-cols-3 sm:gap-6">
                <dt className="mb-2 text-sm font-bold text-cc-ink sm:mb-0">{s.claim}</dt>
                <dd className="text-sm leading-relaxed text-cc-ink-muted sm:col-span-2">{s.reality}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FAQ — visible text and structured data from one source */}
      <section id="faq" className="scroll-mt-8 space-y-5">
        <div className={PART_HEAD}>
          <SectionHeader align="left" eyebrow="Part 7" title="Questions people actually ask" />
        </div>
        <div className={`${CARD} p-7 sm:p-10`}>
          <dl className="space-y-0">
            {GUIDE_FAQ.map((f) => (
              <div key={f.question} className="border-b border-cc-line py-5 last:border-0">
                <dt className="mb-2 text-lg font-bold leading-snug text-cc-ink">{f.question}</dt>
                <dd className="max-w-3xl leading-relaxed text-cc-ink-muted">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Further reading — our own SAP Community write-ups */}
      <section className={`${CARD} p-7 sm:p-10`}>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-cc-ink">Going deeper</h2>
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-cc-ink-muted">
          Two write-ups we published on the SAP Community, for readers who want the long form on
          classification and measurement.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <a
            href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
            target="_blank"
            rel="noopener noreferrer"
            className={READ_CARD}
          >
            <p className="cc-text-label mb-2 text-cc-ink-muted">SAP Community</p>
            <p className={READ_TITLE}>
              Clean Core Levels A–D: how to classify your custom ABAP
            </p>
            <p className="mb-3 text-sm leading-relaxed text-cc-ink-muted">
              The full walkthrough of the grading model in Part 5, including what to do with grade C
              and D code.
            </p>
            <span className={READ_MORE}>
              Read on SAP Community <ExternalLink size={12} aria-hidden="true" />
            </span>
          </a>
          <a
            href="https://community.sap.com/t5/technology-blog-posts-by-members/you-can-t-clean-what-you-can-t-see-visibility-and-kpis-for-the/ba-p/14448151"
            target="_blank"
            rel="noopener noreferrer"
            className={READ_CARD}
          >
            <p className="cc-text-label mb-2 text-cc-ink-muted">SAP Community</p>
            <p className={READ_TITLE}>
              You can&apos;t clean what you can&apos;t see
            </p>
            <p className="mb-3 text-sm leading-relaxed text-cc-ink-muted">
              Visibility and KPIs for the extensibility dimension — which numbers actually tell you
              whether a programme is moving.
            </p>
            <span className={READ_MORE}>
              Read on SAP Community <ExternalLink size={12} aria-hidden="true" />
            </span>
          </a>
        </div>
      </section>

      {/* Close — the brand surface and the public buttons, no gradient banner */}
      <section className="rounded-3xl border border-cc-line bg-cc-brand-surface p-8 text-center sm:p-12">
        <h2 className="mb-4 text-3xl font-extrabold leading-tight tracking-[-0.03em] text-cc-ink sm:text-4xl">
          Try it on one object
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-cc-ink-muted">
          Reading about Clean Core only gets you so far. There are ready-made ABAP examples on the
          dashboard, so you can see a full analysis without extracting anything from your own system
          — about fifteen minutes, and it costs nothing.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/first-run" className={publicButton('primary')}>
            <PlayCircle size={18} aria-hidden="true" /> Your first run, step by step
          </Link>
          <Link href="/dashboard" className={publicButton('secondary')}>
            Open the workspace <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <p className="mt-8 text-sm text-cc-ink-muted">
          Questions, corrections, or an object the engine handled badly?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cc-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus">
            {CONTACT_EMAIL}
          </a>{' '}
          — a person answers.
        </p>
      </section>
    </div>
  );
}
