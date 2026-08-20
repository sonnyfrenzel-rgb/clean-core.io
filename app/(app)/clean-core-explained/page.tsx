import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, BookOpen, Lightbulb, AlertTriangle, GraduationCap,
  MessageSquareQuote, PlayCircle, ExternalLink, Check, Clock, Ban, Sparkles,
} from 'lucide-react';
import GuideShareBar from '@/components/GuideShareBar';
import { GUIDE_PARTS, GUIDE_FAQ, NOTE_LABELS, type NoteKind } from '@/lib/clean-core-guide';
import { CAPABILITIES, HONEST_SCOPE } from '@/lib/clean-core-capabilities';
import { CONTACT_EMAIL } from '@/lib/constants';

export const metadata: Metadata = {
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
};

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

const NOTE_STYLES: Record<NoteKind, { icon: typeof Lightbulb; ring: string; bg: string; text: string; label: string }> = {
  remember: { icon: BookOpen, ring: 'border-green-200', bg: 'bg-green-50', text: 'text-green-800', label: 'text-green-700' },
  tip: { icon: Lightbulb, ring: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-900', label: 'text-blue-700' },
  warning: { icon: AlertTriangle, ring: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-900', label: 'text-amber-700' },
  advanced: { icon: GraduationCap, ring: 'border-slate-300', bg: 'bg-slate-50', text: 'text-slate-800', label: 'text-slate-600' },
  jargon: { icon: MessageSquareQuote, ring: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-900', label: 'text-emerald-700' },
};

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
    <div className="space-y-10 animate-in fade-in duration-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div className="flex items-center justify-start">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-slate-50 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50"
        >
          <ArrowLeft size={14} /> Back to Homepage
        </Link>
      </div>

      {/* Hero */}
      <header className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-[2.5rem] p-8 sm:p-14 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(16,185,129,0.12),transparent_60%)] pointer-events-none" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-black text-green-400 tracking-wide uppercase">
            <BookOpen size={14} /> The complete explainer
          </span>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.02] text-slate-50 mt-6 mb-5">
            SAP Clean Core,{' '}<br />explained without the jargon
          </h1>
          <p className="text-lg sm:text-xl text-slate-300 leading-relaxed font-medium mb-8">
            What it means, why it suddenly matters, and what to actually do about your custom ABAP.
            Starts from nothing — no SAP background needed — and goes as far as grading every object
            in your estate.
          </p>
          <div className="flex flex-wrap gap-x-7 gap-y-2 text-[13px] font-bold text-slate-400">
            <span>{GUIDE_PARTS.length + 2} parts</span>
            <span>· About 20 minutes</span>
            <span>· Every term defined before it is used</span>
            <span>· Free to share</span>
          </div>
        </div>
      </header>

      <GuideShareBar />

      {/* Answer-first summary — what a hurried reader and an answer engine both take away */}
      <section className="bg-white border border-green-200 rounded-[2rem] p-7 sm:p-10 shadow-sm">
        <h2 className="text-[11px] font-black text-green-700 uppercase tracking-widest mb-4">
          The short answer
        </h2>
        <p className="text-xl sm:text-2xl font-bold text-gray-950 leading-snug mb-5">
          Clean Core means running SAP standard software without modifying it, and adding your own
          behaviour only through interfaces SAP has formally released and promised to keep stable.
        </p>
        <p className="text-gray-600 leading-relaxed max-w-3xl">
          The purpose is not tidiness. It is that upgrades stay routine instead of becoming projects,
          and that a move to the cloud remains possible at all — because SAP&apos;s cloud offerings
          simply do not run the older techniques. Everything below explains how to tell which of your
          code is affected, and what to do with each kind.
        </p>
      </section>

      {/* Table of contents */}
      <nav className="bg-white border border-gray-200 rounded-[2rem] p-7 sm:p-8 shadow-sm">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-5">What is in here</h2>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 list-none p-0 m-0">
          {GUIDE_PARTS.map((part) => (
            <li key={part.id} className="border-b border-gray-100 py-2.5">
              <a href={`#${part.id}`} className="group flex items-baseline gap-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0 w-12">
                  {part.eyebrow}
                </span>
                <span className="text-sm font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                  {part.title}
                </span>
              </a>
            </li>
          ))}
          <li className="border-b border-gray-100 py-2.5">
            <a href="#platform" className="group flex items-baseline gap-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0 w-12">Part 6</span>
              <span className="text-sm font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                How Clean-Core.io helps, concretely
              </span>
            </a>
          </li>
          <li className="border-b border-gray-100 py-2.5">
            <a href="#faq" className="group flex items-baseline gap-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest shrink-0 w-12">Part 7</span>
              <span className="text-sm font-bold text-gray-900 group-hover:text-green-700 transition-colors">
                Questions people actually ask
              </span>
            </a>
          </li>
        </ol>
      </nav>

      {/* The parts */}
      {GUIDE_PARTS.map((part) => (
        <section key={part.id} id={part.id} className="scroll-mt-8 space-y-5">
          <div className="border-b-2 border-gray-950 pb-5">
            <span className="text-[11px] font-black text-green-700 uppercase tracking-widest">{part.eyebrow}</span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight mt-2 mb-3">{part.title}</h2>
            <p className="text-gray-600 leading-relaxed max-w-3xl font-medium">{part.intro}</p>
          </div>

          {part.chapters.map((ch) => (
            <article key={ch.id} id={ch.id} className="bg-white border border-gray-200 rounded-[2rem] p-7 sm:p-10 shadow-sm scroll-mt-8">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-sm font-black text-green-700 tabular-nums shrink-0">{ch.number}</span>
                <h3 className="text-xl sm:text-2xl font-black text-gray-950 tracking-tight leading-snug">{ch.title}</h3>
              </div>

              {/* The lede carries the whole answer — everything after it is elaboration. */}
              <p className="text-lg text-gray-900 font-bold leading-relaxed border-l-4 border-green-500 pl-5 my-6">
                {ch.lede}
              </p>

              {ch.paragraphs.map((p, i) => (
                <p key={i} className="text-gray-700 leading-[1.75] mb-4 max-w-3xl">{p}</p>
              ))}

              {ch.terms && (
                <dl className="mt-6 space-y-0 border-t border-gray-200">
                  {ch.terms.map((t) => (
                    <div key={t.term} className="py-4 border-b border-gray-100 sm:grid sm:grid-cols-4 sm:gap-6">
                      <dt className="font-black text-gray-950 text-sm mb-1 sm:mb-0">{t.term}</dt>
                      <dd className="text-sm text-gray-600 leading-relaxed sm:col-span-3">{t.definition}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {ch.table && (
                <figure className="mt-7">
                  <figcaption className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3">
                    {ch.table.caption}
                  </figcaption>
                  <div className="overflow-x-auto rounded-2xl border border-gray-200">
                    <table className="doc-table w-full text-sm border-collapse sm:min-w-[34rem]">
                      <thead>
                        <tr className="bg-gray-50">
                          {ch.table.head.map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-gray-200">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ch.table.rows.map((row, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                data-label={ch.table!.head[j]}
                                className={`px-4 py-3 align-top leading-relaxed ${j === 0 ? 'font-bold text-gray-900' : 'text-gray-600'}`}
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
                  <aside key={i} className={`mt-6 flex gap-4 ${s.bg} border ${s.ring} rounded-2xl p-5`}>
                    <s.icon className={`w-5 h-5 shrink-0 mt-0.5 ${s.label}`} aria-hidden="true" />
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${s.label} mb-1.5`}>
                        {NOTE_LABELS[note.kind]}
                      </p>
                      <p className={`text-sm font-bold ${s.text} leading-snug mb-1`}>{note.title}</p>
                      <p className={`text-sm ${s.text} opacity-90 leading-relaxed`}>{note.text}</p>
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
        <div className="border-b-2 border-gray-950 pb-5">
          <span className="text-[11px] font-black text-green-700 uppercase tracking-widest">Part 6</span>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight mt-2 mb-3">
            How Clean-Core.io helps, concretely
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-3xl font-medium">
            Seven stages, one ABAP object at a time. Each is listed with what it produces, what it
            saves you, what it costs — and where it stops. The last column is the one worth reading.
          </p>
        </div>

        <div className="space-y-4">
          {CAPABILITIES.map((c) => (
            <article key={c.stage} className="bg-white border border-gray-200 rounded-[2rem] p-7 sm:p-8 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-3 mb-4">
                <span className="text-[10px] font-black text-green-700 uppercase tracking-widest bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
                  {c.stage}
                </span>
                <h3 className="text-xl font-black text-gray-950 tracking-tight">{c.title}</h3>
              </div>

              <p className="text-gray-800 leading-relaxed font-medium mb-5 max-w-3xl">{c.output}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-black text-green-700 uppercase tracking-widest mb-1.5">
                    <Check size={12} /> Benefit
                  </p>
                  <p className="text-sm text-green-900/90 leading-relaxed">{c.benefit}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                    <Clock size={12} /> Effort
                  </p>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.effort}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="flex items-center gap-1.5 text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1.5">
                    <Ban size={12} /> Where it stops
                  </p>
                  <p className="text-sm text-amber-900/90 leading-relaxed">{c.limit}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Honest scope */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-7 sm:p-10 text-white">
          <h3 className="text-xl font-black uppercase tracking-tight mb-2">Honest scope</h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-7 max-w-2xl">
            The governing principle of this project is <em>belegt, nicht behauptet</em> — proven, not
            claimed. A capability list without limits is a claim, so here are the limits.
          </p>
          <dl className="space-y-0">
            {HONEST_SCOPE.map((s) => (
              <div key={s.claim} className="py-4 border-b border-slate-800 last:border-0 sm:grid sm:grid-cols-3 sm:gap-6">
                <dt className="font-black text-white text-sm mb-1.5 sm:mb-0">{s.claim}</dt>
                <dd className="text-sm text-slate-300 leading-relaxed sm:col-span-2">{s.reality}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* FAQ — visible text and structured data from one source */}
      <section id="faq" className="scroll-mt-8 space-y-5">
        <div className="border-b-2 border-gray-950 pb-5">
          <span className="text-[11px] font-black text-green-700 uppercase tracking-widest">Part 7</span>
          <h2 className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight mt-2">
            Questions people actually ask
          </h2>
        </div>
        <div className="bg-white border border-gray-200 rounded-[2rem] p-7 sm:p-10 shadow-sm">
          <dl className="space-y-0">
            {GUIDE_FAQ.map((f) => (
              <div key={f.question} className="py-5 border-b border-gray-100 last:border-0">
                <dt className="text-lg font-black text-gray-950 mb-2 leading-snug">{f.question}</dt>
                <dd className="text-gray-600 leading-relaxed max-w-3xl">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Further reading — our own SAP Community write-ups */}
      <section className="bg-white border border-gray-200 rounded-[2rem] p-7 sm:p-10 shadow-sm">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-2">Going deeper</h2>
        <p className="text-gray-600 text-sm leading-relaxed mb-6 max-w-2xl">
          Two write-ups we published on the SAP Community, for readers who want the long form on
          classification and measurement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a
            href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-gray-200 rounded-2xl p-5 hover:border-green-300 hover:bg-green-50/40 transition-all group"
          >
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">SAP Community</p>
            <p className="font-black text-gray-950 leading-snug mb-1.5 group-hover:text-green-700 transition-colors">
              Clean Core Levels A–D: how to classify your custom ABAP
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              The full walkthrough of the grading model in Part 5, including what to do with grade C
              and D code.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-700 uppercase tracking-wider">
              Read on SAP Community <ExternalLink size={11} />
            </span>
          </a>
          <a
            href="https://community.sap.com/t5/technology-blog-posts-by-members/you-can-t-clean-what-you-can-t-see-visibility-and-kpis-for-the/ba-p/14448151"
            target="_blank"
            rel="noopener noreferrer"
            className="block border border-gray-200 rounded-2xl p-5 hover:border-green-300 hover:bg-green-50/40 transition-all group"
          >
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">SAP Community</p>
            <p className="font-black text-gray-950 leading-snug mb-1.5 group-hover:text-green-700 transition-colors">
              You can&apos;t clean what you can&apos;t see
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Visibility and KPIs for the extensibility dimension — which numbers actually tell you
              whether a programme is moving.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-700 uppercase tracking-wider">
              Read on SAP Community <ExternalLink size={11} />
            </span>
          </a>
        </div>
      </section>

      {/* Close */}
      <section className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-[2.5rem] p-8 sm:p-12 text-white text-center">
        <Sparkles className="w-8 h-8 mx-auto mb-5 text-green-200" />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4 leading-tight">
          Try it on one object
        </h2>
        <p className="text-green-50 leading-relaxed max-w-2xl mx-auto mb-8 text-lg">
          Reading about Clean Core only gets you so far. There are ready-made ABAP examples on the
          dashboard, so you can see a full analysis without extracting anything from your own system
          — about fifteen minutes, and it costs nothing.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/first-run"
            className="inline-flex items-center justify-center gap-2 bg-white text-green-800 px-8 py-4 rounded-xl font-black text-sm uppercase tracking-wider hover:bg-green-50 transition-colors"
          >
            <PlayCircle size={17} /> Your first run, step by step
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-green-800/40 border border-green-400/40 text-white px-8 py-4 rounded-xl font-black text-sm uppercase tracking-wider hover:bg-green-800/60 transition-colors"
          >
            Open the workspace <ArrowRight size={15} />
          </Link>
        </div>
        <p className="text-green-100/80 text-sm mt-8">
          Questions, corrections, or an object the engine handled badly?{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline font-bold">
            {CONTACT_EMAIL}
          </a>{' '}
          — a person answers.
        </p>
      </section>
    </div>
  );
}
