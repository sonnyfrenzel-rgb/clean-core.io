import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { ArrowLeft, Activity, ShieldCheck, Check, Sparkles, KeyRound, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';

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
const OG_IMAGE = 'https://clean-core.io/og-image.png';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Score: what it measures | Clean-Core.io',
  // 157 characters: long enough to carry the distinction, short enough that
  // Google shows the second half of it.
  description:
    "Our 0–100 score for how far custom ABAP is decoupled from the SAP standard core. Higher is better — not SAP's Technical Debt Score, which runs the other way.",
  alternates: {
    canonical: CANONICAL,
  },
  openGraph: {
    title: 'SAP Clean Core Score: what it measures | Clean-Core.io',
    description:
      "Our 0–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better — and it is not SAP's Technical Debt Score, which points the other way.",
    url: CANONICAL,
    type: 'article',
    images: [OG_IMAGE],
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
    question: "What does a Clean Core Score of 100% mean?",
    answer: "A score of 100% indicates that all analyzed customer-specific extensions align with SAP's published Clean Core guidelines. This means in-app modifications only run through released key-user apps, and side-by-side BTP extensions communicate via SAP-released interfaces. On these criteria the analyzed extensions are well-positioned for upgrades — subject to your own testing and validation."
  },
  {
    question: "Is the Clean Core Score the same as SAP's Technical Debt Score?",
    answer: "No, and the two point in opposite directions. The Clean Core Score is published by Clean-Core.io and runs from 0 to 100 where a higher number is better. SAP's Technical Debt Score, shown in the RISE with SAP methodology dashboard in SAP Cloud ALM, runs the other way: SAP describes it as a higher score indicating greater technical debt. Reading one as if it were the other inverts the answer."
  },
  {
    question: "Does SAP publish a Clean Core Score?",
    answer: "No. SAP publishes a Technical Debt Score and a Clean Core Share in SAP Cloud ALM, and a Clean Core Level A–D per object in its Cloudification Repository. There is no SAP metric called Clean Core Score. Ours is our own, and SAP has not endorsed, certified or reviewed it."
  },
  {
    question: "Does a high Clean Core Score mean lower costs?",
    answer: "We do not put a figure on that. The score measures code structure, not money, and no cost, saving or ROI figure is derived from it anywhere in the product. The Economics stage models upgrade effort only from rates you enter yourself, on assumptions it names, and calls the result a demonstration model rather than a business case."
  },
  {
    question: "How is the Clean Core Score calculated?",
    answer: "By deterministic static analysis, before any AI is involved. The engine parses the ABAP, resolves its data dependencies, and checks each SAP object it touches against SAP's published Cloudification Repository. Released interfaces, key-user extension points and modern ABAP Cloud syntax raise the score; direct database modifications and calls to objects SAP has not released lower it. The same input gives the same score every time."
  }
];

/** The score against SAP's three published figures — the table UX-088 asked for. */
const FIGURES = [
  {
    figure: 'Clean Core Score',
    who: 'Clean-Core.io (this site)',
    direction: 'Higher is better',
    scale: '0–100',
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
          "The Clean Core Score is Clean-Core.io's own 0–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better. It is not SAP's Technical Debt Score, which points the other way.",
        "url": CANONICAL,
        "dateModified": APP_RELEASE_DATE_ISO,
        "inLanguage": "en",
        "publisher": {
          "@type": "Organization",
          "name": "Clean-Core.io",
          "url": "https://clean-core.io"
        },
        "about": [
          { "@type": "DefinedTerm", "name": "Clean Core Score", "description": "A 0–100 measure, published by Clean-Core.io, of how far custom ABAP is decoupled from the SAP standard core. Higher is better." },
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-slate-50 px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200"
        >
          <ArrowLeft size={14} /> Back to Homepage
        </Link>
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Activity size={14} /> Code Metric
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            SAP Clean Core <span className="text-green-400">Score</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            One number, 0 to 100, for how far your custom ABAP is decoupled from the SAP standard core.
            Higher is better. It is our measure, not a figure SAP publishes — and it points the
            opposite way to SAP&rsquo;s Technical Debt Score.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block — marked speakable in the JSON-LD above. */}
      <div data-speakable>
        <QuickAnswer
          question="What is the SAP Clean Core Score, and is it an SAP figure?"
          answer="The Clean Core Score is Clean-Core.io's own 0–100 measure of how far custom ABAP is decoupled from the SAP standard core. Higher is better. It is computed by deterministic static analysis of the code and its data dependencies, weighting direct database modifications, calls to unreleased APIs, and key-user extensibility. SAP does not publish a Clean Core Score. SAP's own figures are the Technical Debt Score and Clean Core Share in SAP Cloud ALM and the Clean Core Level A–D per object — and the Technical Debt Score runs the other way, where a higher score means more technical debt."
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {/* Left 2 Columns: Text content */}
        <div className="md:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              What is the Clean Core Score?
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              The <strong>Clean Core Score</strong> is a single figure for how far customer-specific
              ABAP has been decoupled from the SAP standard. It runs from 0% (a fully modified legacy
              system) to 100% (standard ERP without modifications). <strong>Higher is better.</strong>
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              It is a property of code, not of a company. It is computed from the uploaded source and
              its data dependencies, deterministically, before any AI is involved — the same code
              gives the same score every time, and every verdict behind it can be traced to the SAP
              object it came from.
            </p>
            <p className="text-gray-700 leading-relaxed font-medium">
              By maintaining a &ldquo;clean core,&rdquo; companies keep core processes stable while
              innovations are realized side-by-side on the{' '}
              <strong>SAP Business Technology Platform (BTP)</strong> or in-app via released
              interfaces. The score says how far a given code base has got with that.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              Not SAP&rsquo;s score — and which way each one points
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              <strong>SAP publishes no Clean Core Score.</strong> The names in this field are close
              enough to be mistaken for one another, and one of them runs backwards, so here they are
              side by side. Clean-Core.io is an independent, community-built tool; SAP has not
              endorsed, certified or reviewed this score.
            </p>

            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Figure</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Published by</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Direction</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">What it says</th>
                  </tr>
                </thead>
                <tbody>
                  {FIGURES.map((f) => (
                    <tr key={f.figure} className={`border-t border-gray-100 align-top ${f.ours ? 'bg-green-50/60' : ''}`}>
                      <td className="px-4 py-3 font-bold text-gray-955 whitespace-nowrap">
                        {f.figure}
                        <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {f.scale}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 leading-relaxed font-medium">{f.who}</td>
                      <td className="px-4 py-3 font-bold text-gray-955 whitespace-nowrap">{f.direction}</td>
                      <td className="px-4 py-3 text-gray-600 leading-relaxed font-medium">{f.says}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <ArrowLeftRight className="text-amber-700 shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-amber-900 leading-relaxed font-medium">
                The one that catches people out: a <strong>high</strong> Clean Core Score is good news,
                and a <strong>high</strong> SAP Technical Debt Score is bad news. SAP&rsquo;s own
                description of that figure is &ldquo;a higher score indicating greater technical
                debt&rdquo;. If you are reading both in the same meeting, say which one you mean.
              </p>
            </div>

            <p className="text-gray-700 leading-relaxed font-medium">
              The one SAP figure we do reproduce is the per-object{' '}
              <Link href="/sap-clean-core-object-classification" className="text-green-600 font-bold hover:underline">
                Clean Core Level A–D
              </Link>
              , derived from SAP&rsquo;s published data. The rule that derives it, and the version of
              that rule, are written out on{' '}
              <Link href="/method/levels" className="text-green-600 font-bold hover:underline">
                how the A–D level is derived
              </Link>
              .
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              The Calculation Basis of the KPI
            </h2>
            <p className="text-gray-700 leading-relaxed font-medium">
              Our analysis algorithm evaluates uploaded custom code projects based on four key pillars:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <ShieldCheck className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">API &amp; Interface Release</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Checks whether the SAP APIs and Data Dictionary objects used are officially released by SAP for cloud extensions.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Activity className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">Degree of Coupling</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Measures how strongly custom tables and business processes are interwoven with SAP ERP modules.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <Sparkles className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">Modern ABAP Cloud</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Validates the usage of modern ABAP Cloud syntax (RAP Model) instead of outdated legacy ABAP reports.
                </p>
              </div>

              <div className="bg-slate-50 border border-gray-150 p-6 rounded-2xl space-y-2">
                <KeyRound className="text-green-600" size={24} />
                <h3 className="text-base font-bold text-gray-955">Key-User Extensibility</h3>
                <p className="text-xs text-gray-600 leading-relaxed font-medium">
                  Checks whether in-app changes go through released key-user extension points rather than modifying SAP objects.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-gray-955">
              What the score does not tell you
            </h2>
            <ul className="space-y-3 text-gray-700 leading-relaxed font-medium">
              <li className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                <span>
                  <strong className="text-gray-955">Not a cost, a saving or an ROI.</strong> The score
                  measures code structure. No money figure is derived from it anywhere in the product:
                  the analysis states none, the board deck states none, and the Economics stage models
                  upgrade effort only from rates you enter yourself, on assumptions it lists, and calls
                  the result a demonstration model rather than a business case.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                <span>
                  <strong className="text-gray-955">Not an SAP verdict.</strong> SAP ADT and the SAP
                  ABAP Test Cockpit (ATC), run against your target release, are the authoritative
                  checks. This is preparation for them, not a substitute, and not an SAP
                  certification.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                <span>
                  <strong className="text-gray-955">Not a promise about your upgrade.</strong> Static
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
          <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 space-y-6">
            <h3 className="font-black text-lg text-gray-955 uppercase tracking-tight">What the number gives you</h3>
            <ul className="space-y-3 font-bold text-sm text-gray-700">
              <li className="flex gap-2 items-start">
                <Check className="text-green-600 shrink-0 mt-0.5" size={16} /> One figure for a code base, on a published rule
              </li>
              <li className="flex gap-2 items-start">
                <Check className="text-green-600 shrink-0 mt-0.5" size={16} /> Every verdict traceable to SAP&rsquo;s own object data
              </li>
              <li className="flex gap-2 items-start">
                <Check className="text-green-600 shrink-0 mt-0.5" size={16} /> Critical couplings named with line numbers
              </li>
              <li className="flex gap-2 items-start">
                <Check className="text-green-600 shrink-0 mt-0.5" size={16} /> Recomputed on the server and signed into the run
              </li>
            </ul>
            <div className="pt-4 border-t border-gray-200">
              <Link
                href="/?auth=signup"
                className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md transition-all text-sm"
              >
                Calculate Score
              </Link>
            </div>
          </div>

          <div className="border border-slate-200 rounded-[2rem] p-6 space-y-4 bg-white">
            <h3 className="font-black text-sm text-gray-400 uppercase tracking-wider">Related Topics</h3>
            <div className="space-y-2 font-bold text-sm">
              <Link href="/abap-custom-code-analysis" className="block text-green-600 hover:underline">
                → ABAP Custom Code Analysis
              </Link>
              <Link href="/sap-clean-core-object-classification" className="block text-green-600 hover:underline">
                → Clean Core Object Classification (A–D)
              </Link>
              <Link href="/method/levels" className="block text-green-600 hover:underline">
                → How the A–D level is derived
              </Link>
              <Link href="/how-it-works" className="block text-green-600 hover:underline">
                → How the evidence engine works
              </Link>
              <Link href="/catalog" className="block text-green-600 hover:underline">
                → SAP object catalog
              </Link>
              <Link href="/reference-analysis" className="block text-green-600 hover:underline">
                → A worked example, end to end
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-slate-50 border border-gray-200 rounded-[2.5rem] p-8 space-y-6">
        <h2 className="text-2xl font-black text-gray-955">Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-bold text-sm">
          {faqs.map((faq, idx) => (
            <div key={idx} className="space-y-2">
              <h3 className="text-gray-955 font-black">{faq.question}</h3>
              <p className="text-gray-600 font-medium leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="text-center text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider pt-10 border-t border-gray-200">
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}
