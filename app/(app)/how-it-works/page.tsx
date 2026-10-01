import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { GitBranch, Database, Code2, PenLine, Ruler, ChevronDown, CheckCircle2 } from 'lucide-react';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { supportMatrixRows, LEVEL_LABEL } from '@/lib/abap/support-matrix';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import CcTable from '@/components/cc/Table';

export const metadata: Metadata = withTwitterCard({
  title: 'How It Works — Transformation Methodology & Coverage | Clean-Core.io',
  description: 'Understand the Clean-Core.io transformation pipeline: deterministic ABAP parsing, SAP API Hub mapping, and target code generation with an honest coverage matrix.',
  alternates: {
    canonical: 'https://clean-core.io/how-it-works',
  },
  openGraph: {
    title: 'How It Works — Transformation Methodology & Coverage | Clean-Core.io',
    description: 'Understand the Clean-Core.io transformation pipeline: deterministic ABAP parsing, SAP API Hub mapping, and target code generation.',
    url: 'https://clean-core.io/how-it-works',
    type: 'website',
  }
});

const faqs = [
  {
    question: 'Which ABAP constructs are automatically transformed?',
    answer: 'Direct database reads (SELECT on standard SAP tables like VBAK, BSEG, LIKP), simple wrapper classes, and remote function calls (CALL FUNCTION … DESTINATION) are fully supported. A local function-module call with a static name is not assessed yet; the analysis lists it as not assessed rather than passing it. Complex SQL joins, BAdI implementations, and enhancement spots are partially supported with manual review flags.'
  },
  {
    question: 'What role does the LLM play in the transformation?',
    answer: 'The LLM (Google Gemini) handles semantic understanding of business logic context, generates human-readable documentation, and produces the final target code. All table-to-API mappings are deterministic lookups against SAP\'s official Cloudification Repository (the same data source behind SAP ATC checks), layered with curated field-level entries — never LLM guesses.'
  },
  {
    question: 'Can I verify the generated code yourself?',
    answer: 'Yes. A transformation on the ABAP Cloud (RAP) route produces a package laid out for abapGit — a src/ directory and a .abapgit.xml written from the project itself — together with generated ABAP-Unit test classes, so you can read every line and run the tests in your own system. The BTP CAP route produces Node.js code with a generated test suite in TypeScript instead, not ABAP-Unit. We have not imported one into a real SAP system, so we do not claim the package activates without adjustment: the object metadata is generated, not produced by abapGit’s own serializer. Treat it as a starting point for an import rather than an import that is known to succeed.'
  }
];

// Coverage data is rendered from SUPPORT_MATRIX (single source of truth).
// Do NOT hardcode a coverage table here — the drift test enforces this so the
// page can never diverge from the engine's actual support behaviour.
const coverageRows = supportMatrixRows();

const deterministicItems = [
  'Table-to-API mapping',
  'AST parsing',
  'CDS view structure',
  'abapGit packaging',
  'Compliance scoring',
];

const llmItems = [
  'Business logic interpretation',
  'Documentation generation',
  'Test scenario description',
  'Code comments and naming',
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
const H3 = 'text-lg font-bold text-cc-ink';
const STEP_ICON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cc-line bg-cc-brand-surface text-cc-brand-strong';
const CHECK = 'shrink-0 text-cc-brand-strong';
const FAQ_BOX = 'space-y-6 rounded-3xl border border-cc-line bg-cc-surface-muted p-8';
const FAQ_TITLE = 'text-2xl font-extrabold text-cc-ink';
const FOOTER_LINE =
  'border-t border-cc-line pt-10 text-center font-cc-mono text-xs font-semibold uppercase tracking-wider text-cc-ink-muted';

const STAGE_CARD = 'space-y-4 rounded-3xl border border-cc-line bg-cc-surface p-6';
const STAGE_NUMBER = 'flex h-10 w-10 items-center justify-center rounded-xl bg-cc-ink text-sm font-bold text-cc-on-dark';
const STAGE_TEXT = 'text-sm font-medium leading-relaxed text-cc-ink-muted';

export default function HowItWorksPage() {

  /**
   * The object count is read from lib/facts.ts, never typed into the copy. It
   * said `23,000+` here while the landing page rendered the live figure two
   * scrolls away — on pages that argue for verifiability, a stale number is the
   * most expensive kind of mistake. Roadmap 0.2 (`UX-E14-F01:R0`) removed the
   * fallback literal itself, not just its appearance in the markup.
   */
  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  const techArticleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": "How Clean-Core.io Transforms Legacy ABAP",
    "description": "Technical deep-dive into the Clean-Core.io transformation pipeline.",
    "author": {
      "@type": "Person",
      "name": "Felix Frenzel"
    }
  };

  return (
    <div className={PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleSchema) }}
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
            <GitBranch size={14} aria-hidden="true" /> Methodology
          </div>
          <h1 className={H1}>
            How It <span className="text-cc-brand-strong">Works</span>
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-cc-ink-muted">
            Three stages — deterministic parsing and mapping, then model-generated target code for your review. Transparent, verifiable coverage — honest limitations.
          </p>
        </div>
      </div>

      {/* Quick Answer */}
      <QuickAnswer
        question="How does Clean-Core.io transform legacy ABAP code?"
        answer="The pipeline uses deterministic AST parsing to extract table references and function module calls, maps them to official successors via SAP's Cloudification Repository (auto-synced weekly) layered with curated field-level entries, and generates target code in your chosen architecture (ABAP Cloud RAP or BTP CAP). The LLM writes the target code and the documentation on top of that evidence — never the critical table-to-API mappings."
      />

      {/* Section A: Pipeline Overview */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className={H2}>
            The Transformation Pipeline
          </h2>
          <p className="font-medium text-cc-ink-muted">
            Two deterministic stages and one model-generated one — from legacy ABAP to a draft in the target architecture.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Step 1: Parse */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">1</div>
              <h3 className={H3}>Parse</h3>
            </div>
            <div className={STEP_ICON}>
              <Code2 size={20} aria-hidden="true" />
            </div>
            <p className={STAGE_TEXT}>
              Legacy ABAP code is parsed into an Abstract Syntax Tree (AST). Direct database reads, function module calls, and class dependencies are extracted and classified.
            </p>
          </div>

          {/* Step 2: Map */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">2</div>
              <h3 className={H3}>Map</h3>
            </div>
            <div className={STEP_ICON}>
              <Database size={20} aria-hidden="true" />
            </div>
            <p className={STAGE_TEXT}>
              Extracted table references (e.g., VBAK, BSEG, LIKP) are resolved against a layered catalog: SAP&apos;s official Cloudification Repository ({catalogObjects}, auto-synced weekly) provides authoritative coverage, while hand-curated entries add field-level mapping precision. Every finding carries its source layer and the catalog version for audit traceability.
            </p>
          </div>

          {/* Step 3: Generate */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">3</div>
              <h3 className={H3}>Generate</h3>
            </div>
            <div className={STEP_ICON}>
              <GitBranch size={20} aria-hidden="true" />
            </div>
            <p className={STAGE_TEXT}>
              Target code is generated by the model for the selected architecture: ABAP Cloud RAP (CDS Views + Behavior Definitions) or Side-by-Side BTP CAP (Node.js services + schema definitions). It is a draft to compile and validate in your own system. Tests are generated alongside — ABAP-Unit classes on the RAP route, a TypeScript suite on the CAP route.
            </p>
          </div>
        </div>
      </section>

      {/* Section B: Deterministic vs LLM */}
      <section className="space-y-6">
        <h2 className={H2}>
          Deterministic Rules vs. LLM Generation
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Deterministic Column */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STEP_ICON}>
                <Ruler size={20} aria-hidden="true" />
              </div>
              <h3 className={H3}>Deterministic (Rule-Based)</h3>
            </div>
            <ul className="space-y-3 text-sm font-semibold text-cc-ink">
              {deterministicItems.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className={CHECK} size={16} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* LLM Column — a neutral mark for model work: no robot, no sparkle
              (DESIGN.md §1.7, §3.1). */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cc-line bg-cc-surface text-cc-ink-muted">
                <PenLine size={20} aria-hidden="true" />
              </div>
              <h3 className={H3}>LLM-Assisted (Google Gemini)</h3>
            </div>
            <ul className="space-y-3 text-sm font-semibold text-cc-ink">
              {llmItems.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <PenLine className="shrink-0 text-cc-ink-muted" size={16} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Section C: Coverage Matrix (data-driven from SUPPORT_MATRIX) */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className={H2}>
            Coverage Matrix
          </h2>
          <p className="font-medium text-cc-ink-muted">
            What works today, what needs help, and what we don&apos;t support yet. This matrix is the
            single source the transformation engine flags against — it is always current.
          </p>
        </div>

        {/* One table on every width: CcTable turns its rows into cards on S
            (DESIGN.md §2.4, §2.9), so the #anchor deep links resolve on a phone
            too — they used to point into a table hidden below md. */}
        <div className="rounded-2xl border border-cc-line bg-cc-surface px-2 pt-3">
          <CcTable
            caption="Coverage matrix"
            columns={[
              { key: 'construct', label: 'Construct' },
              { key: 'level', label: 'Support Level' },
              { key: 'notes', label: 'Notes' },
            ]}
            rows={coverageRows.map((row) => ({
              key: row.construct,
              cells: {
                construct: (
                  <span key="construct" id={row.anchor} className="scroll-mt-24 font-bold text-cc-ink">
                    {row.title}
                  </span>
                ),
                level: <SupportLevelMark level={row.level} label={LEVEL_LABEL[row.level]} key="level" />,
                notes: <span key="notes" className="text-cc-ink-muted">{row.notes}</span>,
              },
            }))}
          />
        </div>
      </section>

      {/* Section D: FAQ */}
      <div className={FAQ_BOX}>
        <h2 className={FAQ_TITLE}>Frequently Asked Questions (FAQ)</h2>
        <div className="grid grid-cols-1 gap-6 text-sm">
          {faqs.map((faq, idx) => (
            <details key={idx} className="group overflow-hidden rounded-2xl border border-cc-line bg-cc-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-6 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus">
                <h3 className="pr-4 font-bold text-cc-ink">{faq.question}</h3>
                <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-cc-ink-muted transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="px-6 pb-5">
                <p className="font-medium leading-relaxed text-cc-ink-muted">{faq.answer}</p>
              </div>
            </details>
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
