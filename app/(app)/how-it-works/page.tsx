import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { GitBranch, PenLine, Ruler, ChevronDown, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { supportMatrixRows, LEVEL_LABEL } from '@/lib/abap/support-matrix';
import SupportLevelMark from '@/components/analyze/SupportLevelMark';
import CcTable from '@/components/cc/Table';
import { BTP, BTP_FIRST } from '@/lib/sap-naming';
import { DECISION_OPTIONS, DECISION_OPTION_LABELS, DECISION_OPTION_MEANINGS } from '@/lib/decision-options';
import { PROVENANCE, PROVENANCE_VALUES } from '@/lib/provenance';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';

export const metadata: Metadata = withTwitterCard({
  title: 'How It Works: From ABAP to a Signed Run | Clean-Core.io',
  description: 'How Clean-Core.io reads custom ABAP before any model does, checks SAP objects against SAP\'s Cloudification Repository, and where the model starts.',
  alternates: {
    canonical: 'https://clean-core.io/how-it-works',
  },
  openGraph: {
    title: 'How It Works: From ABAP to a Signed Run | Clean-Core.io',
    description: 'How Clean-Core.io reads custom ABAP before any model does, maps SAP objects against SAP’s Cloudification Repository, and where the language model starts — with its coverage and limits.',
    url: 'https://clean-core.io/how-it-works',
    type: 'website',
  }
});

const faqs = [
  {
    question: 'What does Clean-Core.io do with one ABAP program, in order?',
    answer: 'It reads the program with a deterministic engine and reconstructs its business process as BPMN, with a line anchor on every element or the reason it has none. It grades every SAP object the code uses Level A–D from SAP’s published Cloudification Repository and object classification. The Management view then asks for one decision — keep, rebuild, move to SAP standard or retire — and Design, Transformation and Testing carry the same evidence to a target design, a code draft and test scenarios. Every completed analysis is stored as an immutable run signed by the server with HMAC.'
  },
  {
    question: 'Which ABAP constructs are automatically transformed?',
    answer: 'Direct database reads (SELECT on standard SAP tables like VBAK, BSEG, LIKP), simple wrapper classes, and remote function calls (CALL FUNCTION … DESTINATION) are fully supported. A local function-module call with a static name is not assessed yet; the analysis lists it as not assessed rather than passing it. Complex SQL joins, BAdI implementations, and enhancement spots are partially supported with manual review flags. The coverage matrix on this page is the list the engine flags against.'
  },
  {
    question: 'What role does the language model play?',
    answer: 'The language model (Google Gemini) writes after the engine and on its evidence: plain business names for process steps, the narrative of the analysis, the target design, the transformed code draft and the test scenarios. Everything it writes is marked as a Model proposal until a person confirms it. The process, the business rules, Level A–D, the findings, the Clean Core Score and the table-to-successor lookups come from the engine and SAP’s published Cloudification Repository, never from the model.'
  },
  {
    question: 'Who makes the decision — keep, rebuild, move to SAP standard or retire?',
    answer: 'The person reading the Management view. Clean-Core.io prepares the decision and shows what it rests on; it does not take it. The decision is recorded by the signed-in account — a self-declaration, not a mandate. Keep, move to SAP standard and retire build nothing; a rebuild is signed off in Design, where the target route is chosen.'
  },
  {
    question: 'Can I verify the generated code yourself?',
    answer: `Yes. A transformation on the ABAP Cloud (RAP) route produces a package laid out for abapGit — a src/ directory and a .abapgit.xml written from the project itself — together with generated ABAP-Unit test classes, so you can read every line and run the tests in your own system. The CAP route on ${BTP} produces Node.js code with a generated test suite in TypeScript instead, not ABAP-Unit. We have not imported one into a real SAP system, so we do not claim the package activates without adjustment: the object metadata is generated, not produced by abapGit’s own serializer. Treat it as a starting point for an import rather than an import that is known to succeed.`
  },
  {
    question: 'What does a signed run prove?',
    answer: 'Where a result came from and that it has not changed since — not that it is correct. A run is signed by the server with HMAC; the audit pack exported from it is signed over the run with HMAC and Ed25519, and the Ed25519 signature can be checked offline against the published public key. Level A–D is deliberately not part of the signed audit pack: it is an orientation, and ABAP Test Cockpit stays the authority.'
  }
];

// Coverage data is rendered from SUPPORT_MATRIX (single source of truth).
// Do NOT hardcode a coverage table here — the drift test enforces this so the
// page can never diverge from the engine's actual support behaviour.
const coverageRows = supportMatrixRows();

/**
 * The chain of 3.0, in the order a project walks it (roadmap 3.0.8, item 2).
 * Each step names where the work is done, so a reader of the public repository
 * can check the sentence against the code.
 */
const CHAIN_SOURCES = {
  process: 'lib/abap/process-skeleton.ts · lib/abap/business-rules.ts',
  levels: 'lib/abap/abcd-classification.ts · lib/clean-core-score.ts',
  decision: 'lib/decision-options.ts',
  build: 'Design · Transformation · Testing',
  signed: 'app/api/runs/create/route.ts · lib/audit-pack.ts',
} as const;

const deterministicItems = [
  'The process as BPMN, with a line anchor or the reason there is none',
  'Business rules hard-coded in the program',
  'Level A–D per SAP object, under a versioned rule',
  'Findings and the Clean Core Score',
  'Successors from SAP’s Cloudification Repository',
  'The process description in Documentation',
  'What could not be determined, with the reason',
  'Signatures over runs and audit packs',
];

const llmItems = [
  'Plain business names for process steps',
  'The narrative of the analysis',
  'The target design',
  'The transformed code draft (RAP or CAP)',
  'Test scenarios',
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
const SOURCE_LINE = 'font-cc-mono text-xs font-semibold text-cc-ink-muted [overflow-wrap:anywhere]';
const TEXT_LINK =
  'font-semibold text-cc-brand-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus';

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
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(techArticleSchema) }}
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
            One chain from a custom ABAP program to a decision and a signed record: the process as BPMN with line anchors, Level A–D for every SAP object, the decision, then design, code draft and tests. The engine reads the code first; what a language model writes comes after it and is marked as a Model proposal.
          </p>
        </div>
      </div>

      {/* Quick Answer */}
      <QuickAnswer
        question="How does Clean-Core.io work?"
        answer={`A deterministic engine reads one custom ABAP program and reconstructs its business process as BPMN, with a line anchor on every element or the reason it has none. Every SAP object the code uses is graded Level A–D from SAP's published Cloudification Repository (${catalogObjects}), and the Management view asks for one decision: keep, rebuild, move to SAP standard or retire. Design, code draft and tests are built on that evidence as Model proposals for a person to review, and every completed analysis is stored as an immutable run signed by the server.`}
      />

      {/* Section A: the chain of 3.0 (roadmap 3.0.8, item 2) */}
      <section className="space-y-6" aria-labelledby="chain-title">
        <div className="space-y-2">
          <h2 id="chain-title" className={H2}>
            From the code to a signed run, step by step
          </h2>
          <p className="font-medium text-cc-ink-muted">
            Five steps on the same evidence. Each one says where its statements come from, and each points back to the lines of code it rests on.
          </p>
        </div>

        <ol className="m-0 list-none space-y-4 p-0">
          <li className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">1</div>
              <h3 className={H3}>The process, read from the code</h3>
            </div>
            <p className={STAGE_TEXT}>
              The engine parses the program without a language model; the same file gives the same result. It reconstructs the business process the program runs as BPMN — start and end events, tasks, decision points and sub-processes — with a line anchor on every element, or the reason it has none. Literals in conditions, such as tolerances, plants or date limits, become business rules with their line, which the Business view answers with keep, change, drop or clarify. Code no entry point reaches is listed, not drawn. Plain business names a language model proposes are marked as a Model proposal.
            </p>
            <p className={SOURCE_LINE}>In the code: {CHAIN_SOURCES.process}</p>
          </li>

          <li className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">2</div>
              <h3 className={H3}>Level A–D for every SAP object</h3>
            </div>
            <p className={STAGE_TEXT}>
              Every SAP object the code uses is looked up in SAP&apos;s published Cloudification Repository and object classification ({catalogObjects}) and graded Level A–D under a versioned rule; an SAP object the code writes directly is Level D, whatever its own level. The findings give the Clean Core Score, 5–100, higher is better — Clean-Core.io&apos;s own grade, not an SAP measure. The level is an orientation: ABAP Test Cockpit stays the authority. How the level is derived:{' '}
              <Link href="/method/levels" className={TEXT_LINK}>the rule and its version</Link>.
            </p>
            <p className={SOURCE_LINE}>In the code: {CHAIN_SOURCES.levels}</p>
          </li>

          <li className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">3</div>
              <h3 className={H3}>The decision, in the Management view</h3>
            </div>
            <p className={STAGE_TEXT}>
              The Management view asks one question of the program and shows what the answer rests on — the need, the options, the costs as a simulation on your own assumptions, the architecture — and what still blocks it. Clean-Core.io prepares the decision; the signed-in account records it, a self-declaration, not a mandate.
            </p>
            <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DECISION_OPTIONS.map((option) => (
                <div key={option} className="rounded-2xl border border-cc-line bg-cc-surface-muted p-4">
                  <dt className="text-sm font-bold text-cc-ink">{DECISION_OPTION_LABELS[option]}</dt>
                  <dd className="mt-1 text-sm font-medium leading-relaxed text-cc-ink-muted">{DECISION_OPTION_MEANINGS[option]}</dd>
                </div>
              ))}
            </dl>
            <p className={SOURCE_LINE}>In the code: {CHAIN_SOURCES.decision}</p>
          </li>

          <li className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">4</div>
              <h3 className={H3}>Design, code draft and tests</h3>
            </div>
            <p className={STAGE_TEXT}>
              Design reads the functional and non-functional requirements from the code and proposes a target: ABAP Cloud (RAP) inside SAP S/4HANA, or CAP on {BTP_FIRST}. Transformation drafts the target code from the source, the analysis and the design; its plan names every finding at its line. Testing derives test scenarios. On the CAP track they run against mocks in an isolated runner, and the server records what ran on which code. On the RAP track they are an ABAP Unit class that runs only in your own SAP system; you record its result as an imported file or your own confirmation, never as proven. All three are Model proposals built on the signed run — drafts to review, not a finished product.
            </p>
            <p className={SOURCE_LINE}>In the workspace: {CHAIN_SOURCES.build}</p>
          </li>

          <li className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STAGE_NUMBER} aria-hidden="true">5</div>
              <h3 className={H3}>A signed run, and an audit pack anyone can check</h3>
            </div>
            <p className={STAGE_TEXT}>
              Every completed analysis is stored as an immutable run, signed by the server with HMAC. The audit pack exported from it is signed over the run with HMAC and Ed25519, and the Ed25519 signature can be checked offline against the published public key, or on{' '}
              <Link href="/verify-pack" className={TEXT_LINK}>Verify an audit pack</Link>. A signature proves where a result came from and that it has not changed since — not that it is right.
            </p>
            <p className={SOURCE_LINE}>In the code: {CHAIN_SOURCES.signed}</p>
          </li>
        </ol>
      </section>

      {/* Section B: Deterministic vs LLM */}
      <section className="space-y-6">
        <h2 className={H2}>
          What the engine computes, what the model writes
        </h2>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Deterministic Column */}
          <div className={STAGE_CARD}>
            <div className="flex items-center gap-3">
              <div className={STEP_ICON}>
                <Ruler size={20} aria-hidden="true" />
              </div>
              <h3 className={H3}>Deterministic engine</h3>
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
              <h3 className={H3}>Language model (Google Gemini)</h3>
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

      {/* Section B2: provenance — every value and meaning read from lib/provenance.ts */}
      <section className="space-y-6" aria-labelledby="provenance-title">
        <div className="space-y-2">
          <h2 id="provenance-title" className={H2}>
            Where each statement comes from
          </h2>
          <p className="font-medium text-cc-ink-muted">
            Every statement in a project carries one of {PROVENANCE_VALUES.length} provenance values. The value says who stands behind it — the engine, a file, a person, the model — and what is still open.
          </p>
        </div>
        <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROVENANCE_VALUES.map((value) => (
            <div key={value} className="space-y-2 rounded-2xl border border-cc-line bg-cc-surface p-4">
              <dt>
                <CcProvenanceChip value={value} />
              </dt>
              <dd className="text-sm font-medium leading-relaxed text-cc-ink-muted">{PROVENANCE[value].meaning}</dd>
            </div>
          ))}
        </dl>
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
