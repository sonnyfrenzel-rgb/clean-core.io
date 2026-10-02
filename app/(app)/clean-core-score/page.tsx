import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { Activity, Check, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { publicButton } from '@/components/landing/public-button';
import CcTable from '@/components/cc/Table';
import { BTP_FIRST } from '@/lib/sap-naming';
import { scoreBandChartColor } from '@/lib/chart-colors';
import {
  SCORE_BANDS,
  SCORE_BANDS_SOURCE,
  SCORE_DEDUCTIONS,
  SCORE_FLOOR,
  SCORE_NATURE,
  UNASSESSED_POINTS_CAP,
  UNASSESSED_POINTS_PER_KIND,
  bandRange,
  scoreBandsProse,
  scoreDeductionsProse,
} from '@/lib/clean-core-score';

/**
 * The Clean Core Score, explained — and told apart from SAP's own figures.
 *
 * Roadmap 0.3. Two things changed here and both were overdue.
 *
 * 1. The name stays (Sonny, 16.09.2026) and gets made known. SAP publishes no
 *    "Clean Core Score". What SAP does publish in the RISE with SAP methodology
 *    dashboard in SAP Cloud ALM is a Technical Debt Score — SAP's own wording is
 *    "a higher score indicating greater technical debt" — plus a Clean Core
 *    Share, and a Clean Core Level A–D per object. Ours runs the other way:
 *    higher is better. A reader who meets both names in one week and is told
 *    neither of them apart will read one of the two backwards, which is UX-088.
 *    So the distinction is on the page, in the FAQ, and in the JSON-LD a machine
 *    lifts the answer from.
 *
 * 2. The TCO promises are gone. The page used to say "predict your TCO savings"
 *    in the hero, "Calculates the reduction in testing and development costs"
 *    as a pillar of the score, and "A high score dramatically minimizes this
 *    testing effort" in an answer that shipped as schema.org markup. The product
 *    computes none of that: `lib/tco-model.ts` refuses to produce a figure
 *    without a signed baseline and the reader's own rates, and it labels what it
 *    does produce a demonstration model. A public page promising the opposite is
 *    not marketing latitude, it is the page contradicting the product.
 *
 * What replaces them is not silence: the score is a code-structure measure, and
 * the page now says so, says what it is not, and points at the Economics stage
 * for the only place a figure is ever put on anything.
 */

const CANONICAL = 'https://clean-core.io/clean-core-score';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Score: what it measures | Clean-Core.io',
  // 157 characters: long enough to carry the distinction, short enough that
  // Google shows the second half of it.
  description:
    "Our 5–100 score for how far custom ABAP is decoupled from the SAP standard core. Higher is better — not SAP's Technical Debt Score, which runs the other way.",
  alternates: {
    canonical: CANONICAL,
  },
  openGraph: {
    title: 'SAP Clean Core Score: what it measures | Clean-Core.io',
    description:
      "Our 5–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better — and it is not SAP's Technical Debt Score, which points the other way.",
    url: CANONICAL,
    type: 'article',
  }
});

/**
 * The FAQ, which is also the JSON-LD.
 *
 * One source for both, because the visible answer and the answer a generative
 * engine quotes must be the same sentence. The second and third entries are
 * UX-088: they are the ones an answer engine is most likely to lift when
 * somebody asks whether this is an SAP number.
 */
const faqs = [
  {
    question: "What is a good Clean Core Score?",
    answer: `${SCORE_BANDS_SOURCE}: ${scoreBandsProse()} Higher is better. ${SCORE_NATURE}.`,
  },
  {
    question: "What does a Clean Core Score of 100 mean?",
    answer: "A score of 100 means that no construct the analysis assessed produced a scored finding against SAP's published Clean Core guidelines. It says nothing about the constructs the analysis lists as not assessed, so a 100 is alignment only for the assessed part of the code — read the list of unassessed constructs before relying on it. On these criteria the assessed code is well-positioned for upgrades — subject to your own testing and validation."
  },
  {
    question: "Is the Clean Core Score the same as SAP's Technical Debt Score?",
    answer: "No, and the two point in opposite directions. The Clean Core Score is published by Clean-Core.io and runs from 5 to 100 where a higher number is better. SAP's Technical Debt Score, shown in the RISE with SAP methodology dashboard in SAP Cloud ALM, runs the other way: SAP describes it as a higher score indicating greater technical debt. Reading one as if it were the other inverts the answer."
  },
  {
    question: "Does SAP publish a Clean Core Score?",
    answer: "No. SAP publishes a Technical Debt Score and a Clean Core Share in SAP Cloud ALM, and a Clean Core Level A–D per object in its Cloudification Repository. There is no SAP metric called Clean Core Score. Ours is our own, and SAP has not endorsed, certified or reviewed it."
  },
  {
    question: "Does a high Clean Core Score mean lower costs?",
    answer: "We do not put a figure on that. The score measures code structure, not money, and neither the analysis nor the board deck derives a cost, saving or ROI figure from it. The Economics stage is the one place it enters a money figure: it models upgrade effort from rates you enter yourself and the score of the signed run, on assumptions it names, and calls the result a demonstration model rather than a business case."
  },
  {
    question: "How is the Clean Core Score calculated?",
    answer: `By deterministic static analysis, before any AI is involved. The engine parses the ABAP, resolves its data dependencies and checks each SAP object it touches against SAP's published Cloudification Repository. ${scoreDeductionsProse()} The same input gives the same score every time.`
  }
];

/** The score against SAP's three published figures — the table UX-088 asked for. */
const FIGURES = [
  {
    figure: 'Clean Core Score',
    who: 'Clean-Core.io (this site)',
    direction: 'Higher is better',
    scale: '5–100',
    says: 'How far the analysed custom ABAP is decoupled from the SAP standard core.',
    ours: true,
  },
  {
    figure: 'Technical Debt Score',
    who: 'SAP — RISE with SAP methodology dashboard, SAP Cloud ALM',
    direction: 'Higher is worse',
    scale: 'SAP’s own',
    says: 'SAP’s wording: “a higher score indicating greater technical debt”.',
    ours: false,
  },
  {
    figure: 'Clean Core Share',
    who: 'SAP — SAP Cloud ALM',
    direction: 'Higher is better',
    scale: 'Share',
    says: 'How much of the landscape already follows the clean core approach.',
    ours: false,
  },
  {
    figure: 'Clean Core Level A–D',
    who: 'SAP — Cloudification Repository, per object',
    direction: 'A is best, D is worst',
    scale: 'A / B / C / D',
    says: 'What SAP says about one object: released, classic, internal or not recommended.',
    ours: false,
  },
];

/**
 * The public knowledge-page look (block D, D.23a): `--cc-*` tokens instead of
 * the palette, nothing heavier than 800, nothing under 11 px, the generous
 * public radii (DESIGN.md §1.4, ADR-051). The hero is light with the landing
 * page's mesh at .18 — the dark gradient banner it replaces was a surface the
 * product does not have.
 */
const PAGE = 'mx-auto max-w-5xl space-y-12 px-4 py-10 text-cc-ink sm:px-6';
const HERO = 'relative overflow-hidden rounded-3xl border border-cc-line bg-cc-surface p-8 shadow-cc sm:p-12';
const HERO_MESH =
  'radial-gradient(38% 42% at 10% 12%,var(--cc-seq-3) 0%,transparent 70%),radial-gradient(34% 40% at 90% 10%,var(--cc-brand) 0%,transparent 70%),radial-gradient(46% 40% at 55% 62%,var(--cc-chart-3) 0%,transparent 72%)';
const EYEBROW =
  'inline-flex items-center gap-2 rounded-full border border-cc-line bg-cc-brand-surface px-4 py-1 text-xs font-bold uppercase tracking-[0.08em] text-cc-brand-strong';
const H1 = 'text-4xl font-extrabold leading-none tracking-[-0.035em] text-cc-ink sm:text-6xl';
const H2 = 'text-3xl font-extrabold tracking-[-0.03em] text-cc-ink';
const BODY = 'font-medium leading-relaxed text-cc-ink';
const CHECK_TOP = 'mt-1 shrink-0 text-cc-brand-strong';
const SIDE_CARD = 'rounded-3xl border border-cc-line p-6';
const SIDE_TITLE = 'text-lg font-bold text-cc-ink';
const SIDE_LIST = 'space-y-3 text-sm font-semibold text-cc-ink';
const SIDE_LABEL = 'cc-text-label text-cc-ink-muted';
const LINK =
  'font-semibold text-cc-brand-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';
const SIDE_LINK = `block ${LINK}`;
const FAQ_BOX = 'space-y-6 rounded-3xl border border-cc-line bg-cc-surface-muted p-8';
const FAQ_TITLE = 'text-2xl font-extrabold text-cc-ink';
const FOOTER_LINE =
  'border-t border-cc-line pt-10 text-center font-cc-mono text-xs font-semibold uppercase tracking-wider text-cc-ink-muted';

const PILLAR = 'space-y-2 rounded-2xl border border-cc-line bg-cc-surface-muted p-6';
const PILLAR_TEXT = 'text-sm font-medium leading-relaxed text-cc-ink-muted';

export default function CleanCoreScorePage() {
  /**
   * One @graph, four nodes.
   *
   * FAQPage was here already and is the node with the highest citation
   * probability. TechArticle carries the E-E-A-T half — a named publisher and a
   * date that moves with the release — and the WebPage node marks the quick
   * answer as speakable, which is what a voice assistant reads out. None of it
   * claims an author with credentials, because there is not one: this is a
   * community project, and inventing a byline to win a citation would be the
   * same genre of lie the rest of this page just had removed.
   */
  const schemaJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${CANONICAL}#faq`,
        "mainEntity": faqs.map(faq => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
      },
      {
        "@type": "TechArticle",
        "@id": `${CANONICAL}#article`,
        "headline": "SAP Clean Core Score: what it measures",
        "description":
          "The Clean Core Score is Clean-Core.io's own 5–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better. It is not SAP's Technical Debt Score, which points the other way.",
        "url": CANONICAL,
        "dateModified": APP_RELEASE_DATE_ISO,
        "inLanguage": "en",
        "publisher": {
          "@type": "Organization",
          "name": "Clean-Core.io",
          "url": "https://clean-core.io"
        },
        "about": [
          { "@type": "DefinedTerm", "name": "Clean Core Score", "description": "A 5–100 measure, published by Clean-Core.io, of how far custom ABAP is decoupled from the SAP standard core. Higher is better." },
          { "@type": "Thing", "name": "SAP Clean Core" },
          { "@type": "Thing", "name": "ABAP custom code" }
        ],
        "isPartOf": { "@type": "WebSite", "name": "Clean-Core.io", "url": "https://clean-core.io" }
      },
      {
        "@type": "WebPage",
        "@id": CANONICAL,
        "url": CANONICAL,
        "name": "SAP Clean Core Score: what it measures",
        "speakable": {
          "@type": "SpeakableSpecification",
          "cssSelector": ["[data-speakable]"]
        }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${CANONICAL}#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Clean-Core.io", "item": "https://clean-core.io" },
          { "@type": "ListItem", "position": 2, "name": "Clean Core Score", "item": CANONICAL }
        ]
      }
    ]
  };

  return (
    <div className={PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero Banner */}
      <div className={HERO}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: HERO_MESH }} />
        <div className="relative max-w-4xl space-y-6">
          <div className={EYEBROW}>
            <Activity size={14} aria-hidden="true" /> Code Metric
          </div>
          <h1 className={H1}>
            SAP Clean Core <span className="text-cc-brand-strong">Score</span>
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-cc-ink-muted">
            One number, 5 to 100, for how far your custom ABAP is decoupled from the SAP standard core.
            Higher is better. It is our measure, not a figure SAP publishes — and it points the
            opposite way to SAP&rsquo;s Technical Debt Score.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block — marked speakable in the JSON-LD above. */}
      <div data-speakable>
        <QuickAnswer
          question="What is the SAP Clean Core Score, and is it an SAP figure?"
          answer="The Clean Core Score is Clean-Core.io's own 5–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better. It is computed by deterministic static analysis of the code and its data dependencies, weighting direct database modifications, calls to unreleased APIs, and key-user extensibility. SAP does not publish a Clean Core Score. SAP's own figures are the Technical Debt Score and Clean Core Share in SAP Cloud ALM and the Clean Core Level A–D per object — and the Technical Debt Score runs the other way, where a higher score means more technical debt."
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-8 pt-4 md:grid-cols-3">
        {/* Left 2 Columns: Text content */}
        <div className="space-y-8 md:col-span-2">
          <section className="space-y-4">
            <h2 className={H2}>
              What is the Clean Core Score?
            </h2>
            <p className={BODY}>
              The <strong>Clean Core Score</strong> is a single figure for how far customer-specific
              ABAP has been decoupled from the SAP standard. It runs from {SCORE_FLOOR} (the floor, however much was
              found) to 100 (nothing in the assessed code cost a point). <strong>Higher is better.</strong>
            </p>
            <p className={BODY}>
              It is a property of code, not of a company. It is computed from the uploaded source and
              its data dependencies, deterministically, before any AI is involved — the same code
              gives the same score every time, and every verdict behind it can be traced to the code
              it came from — and, where it rests on SAP&apos;s catalog, to the SAP object as well.
            </p>
            <p className={BODY}>
              By maintaining a &ldquo;clean core,&rdquo; companies keep core processes stable while
              innovations are realized side-by-side on the{' '}
              <strong>{BTP_FIRST}</strong> or in-app via released
              interfaces. The score says how far a given code base has got with that.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>
              Not SAP&rsquo;s score — and which way each one points
            </h2>
            <p className={BODY}>
              <strong>SAP publishes no Clean Core Score.</strong> The names in this field are close
              enough to be mistaken for one another, and one of them runs backwards, so here they are
              side by side. Clean-Core.io is an independent, community-built tool; SAP has not
              endorsed, certified or reviewed this score.
            </p>

            <div className="rounded-2xl border border-cc-line bg-cc-surface px-2 pt-3">
              <CcTable
                caption="The Clean Core Score next to SAP's three published figures"
                columns={[
                  { key: 'figure', label: 'Figure' },
                  { key: 'who', label: 'Published by' },
                  { key: 'direction', label: 'Direction' },
                  { key: 'says', label: 'What it says' },
                ]}
                rows={FIGURES.map((f) => ({
                  key: f.figure,
                  emphasis: f.ours,
                  cells: {
                    figure: (
                      <span className="font-bold text-cc-ink">
                        {f.figure}
                        <span className="block font-cc-mono text-[11px] font-semibold uppercase tracking-wider text-cc-ink-muted">
                          {f.scale}
                        </span>
                      </span>
                    ),
                    who: <span className="leading-relaxed text-cc-ink-muted">{f.who}</span>,
                    direction: <span className="whitespace-nowrap font-bold text-cc-ink">{f.direction}</span>,
                    says: <span className="leading-relaxed text-cc-ink-muted">{f.says}</span>,
                  },
                }))}
              />
            </div>

            <div className="flex gap-3 rounded-2xl border border-cc-warning-border bg-cc-warning-bg p-5">
              <ArrowLeftRight className="mt-1 shrink-0 text-cc-warning" size={18} aria-hidden="true" />
              <p className="text-sm font-medium leading-relaxed text-cc-ink">
                The one that catches people out: a <strong>high</strong> Clean Core Score is good news,
                and a <strong>high</strong> SAP Technical Debt Score is bad news. SAP&rsquo;s own
                description of that figure is &ldquo;a higher score indicating greater technical
                debt&rdquo;. If you are reading both in the same meeting, say which one you mean.
              </p>
            </div>

            <p className={BODY}>
              The one SAP figure we do reproduce is the per-object{' '}
              <Link href="/sap-clean-core-object-classification" className={LINK}>
                Clean Core Level A–D
              </Link>
              , derived from SAP&rsquo;s published data. The rule that derives it, and the version of
              that rule, are written out on{' '}
              <Link href="/method/levels" className={LINK}>
                how the A–D level is derived
              </Link>
              .
            </p>
          </section>

          <section className="space-y-4" data-score-bands-section="">
            <h2 className={H2}>What a good score is — and a bad one</h2>
            <p className={BODY}>
              {SCORE_BANDS_SOURCE}. Each band&rsquo;s meaning is something the deductions below guarantee
              for every score in it. {SCORE_NATURE}.
            </p>
            <ol className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {[...SCORE_BANDS].reverse().map((band) => (
                <li key={band.key} data-score-band={band.key} className={PILLAR}>
                  <p className="m-0 flex items-center gap-2 font-cc-mono text-sm font-bold text-cc-ink">
                    <span aria-hidden={true} data-score-swatch={band.key} className={`h-2 w-4 rounded-cc-row ${scoreBandChartColor(band.key).bg}`} />
                    {bandRange(band)}
                  </p>
                  <h3 className="m-0 text-base font-bold text-cc-ink">{band.label}</h3>
                  <p className={PILLAR_TEXT}>{band.meaning}</p>
                  <p className="m-0 text-xs font-medium leading-relaxed text-cc-ink-muted">{band.because}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>How the score is computed</h2>
            <p className={BODY}>
              The score starts at 100 and takes points off for each kind of construct found in the code. The
              first finding of a kind costs most, each further one less, and every kind has a cap — so the
              score says how many kinds of problem there are more than how often each occurs. It never goes
              below {SCORE_FLOOR}. Each kind of construct the engine could not assess takes{' '}
              {UNASSESSED_POINTS_PER_KIND} more points (at most {UNASSESSED_POINTS_CAP}), because what was not
              read cannot count as clean.
            </p>
            <div className="rounded-2xl border border-cc-line bg-cc-surface px-2 pt-3">
              <CcTable
                caption="Points taken off the Clean Core Score per kind of construct"
                columns={[
                  { key: 'kind', label: 'Kind of construct' },
                  { key: 'first', label: 'First finding', numeric: true },
                  { key: 'more', label: 'Each further', numeric: true },
                  { key: 'cap', label: 'At most', numeric: true },
                ]}
                rows={SCORE_DEDUCTIONS.map((rule) => ({
                  key: rule.kind,
                  cells: {
                    kind: <span className="font-semibold text-cc-ink">{rule.label}</span>,
                    first: `−${rule.first}`,
                    more: `−${rule.additional}`,
                    cap: `−${rule.cap}`,
                  },
                }))}
              />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>
              What the score does not tell you
            </h2>
            <ul className="space-y-3 font-medium leading-relaxed text-cc-ink">
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cc-neutral-border" />
                <span>
                  <strong className="text-cc-ink">Not a cost, a saving or an ROI.</strong> The score
                  measures code structure. The analysis states no money figure and the board deck
                  states none. The Economics stage is the one place the score enters one: it models
                  upgrade effort from rates you enter yourself and the score of the signed run, on
                  assumptions it lists, and calls the result a demonstration model rather than a
                  business case.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cc-neutral-border" />
                <span>
                  <strong className="text-cc-ink">Not an SAP verdict.</strong> SAP ADT and the SAP
                  ABAP Test Cockpit (ATC), run against your target release, are the authoritative
                  checks. This is preparation for them, not a substitute, and not an SAP
                  certification.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cc-neutral-border" />
                <span>
                  <strong className="text-cc-ink">Not a promise about your upgrade.</strong> Static
                  analysis cannot resolve everything — dynamic calls, Dynpro flows and batch input are
                  named rather than guessed at. A score is evidence for a decision, and the decision
                  stays with you.
                </span>
              </li>
            </ul>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className={`${SIDE_CARD} space-y-6 bg-cc-surface-muted`}>
            <h3 className={SIDE_TITLE}>What the number gives you</h3>
            <ul className={SIDE_LIST}>
              <li className="flex items-start gap-2">
                <Check className={CHECK_TOP} size={16} aria-hidden="true" /> One figure for a code base, on a published rule
              </li>
              <li className="flex items-start gap-2">
                <Check className={CHECK_TOP} size={16} aria-hidden="true" /> Every verdict traceable to the code, catalog verdicts to SAP&rsquo;s object data
              </li>
              <li className="flex items-start gap-2">
                <Check className={CHECK_TOP} size={16} aria-hidden="true" /> Critical couplings named with line numbers
              </li>
              <li className="flex items-start gap-2">
                <Check className={CHECK_TOP} size={16} aria-hidden="true" /> Recomputed on the server and signed into the run
              </li>
            </ul>
            <div className="border-t border-cc-line pt-4">
              <Link href="/?auth=signup" className={`${publicButton('primary')} w-full`}>
                Calculate Score
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Related Topics</h3>
            <div className="space-y-2 text-sm">
              <Link href="/abap-custom-code-analysis" className={SIDE_LINK}>
                → ABAP Custom Code Analysis
              </Link>
              <Link href="/sap-clean-core-object-classification" className={SIDE_LINK}>
                → Clean Core Object Classification (A–D)
              </Link>
              <Link href="/method/levels" className={SIDE_LINK}>
                → How the A–D level is derived
              </Link>
              <Link href="/how-it-works" className={SIDE_LINK}>
                → How the evidence engine works
              </Link>
              <Link href="/catalog" className={SIDE_LINK}>
                → SAP object catalog
              </Link>
              <Link href="/reference-analysis" className={SIDE_LINK}>
                → A worked example, end to end
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className={FAQ_BOX}>
        <h2 className={FAQ_TITLE}>Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 gap-6 text-sm md:grid-cols-2">
          {faqs.map((faq, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="font-bold text-cc-ink">{faq.question}</h3>
              <p className="font-medium leading-relaxed text-cc-ink-muted">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className={FOOTER_LINE}>
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}
