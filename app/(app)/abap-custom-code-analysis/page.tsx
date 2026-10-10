import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { ScanSearch, Activity, ShieldCheck, Link2, Check } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { publicButton } from '@/components/landing/public-button';
import { BTP, BTP_FIRST } from '@/lib/sap-naming';
import CcTable from '@/components/cc/Table';

/**
 * ABAP static-analysis tools side by side (roadmap 3.0.8, item 7). Honest by
 * construction: each row says what the tool does and where it is stronger, and
 * states only what the tool's own public documentation says — no version-bound
 * figures, no rule counts, no prices. Checked against those sources on
 * 2026-10-10: SAP Help for ATC and Code Inspector; github.com/abaplint/abaplint
 * (MIT, TypeScript, abapGit file format, CLI, CI, VS Code); owasp.org/abap-code-scanner
 * (MIT, Python CLI, exported source offline, injection / secrets / cryptography /
 * dynamic statements, commercial editions by RedRays); docs.sonarsource.com,
 * "Languages overview" (ABAP in the commercial editions, not in the Community Build).
 */
const TOOL_COMPARISON_AS_OF = '2026-10';
const TOOL_COLUMNS = [
  { key: 'tool', label: 'Tool' },
  { key: 'does', label: 'What it does' },
  { key: 'stronger', label: 'Where it is stronger' },
  { key: 'together', label: 'Next to Clean-Core.io' },
] as const;
const TOOL_ROWS = [
  {
    tool: 'ABAP Test Cockpit (ATC) and Code Inspector (SAP)',
    does: 'SAP’s check framework inside the ABAP system. Code Inspector provides the checks, ATC runs them for developers and centrally, including readiness checks for SAP S/4HANA and for ABAP Cloud, with an exemption process for accepted findings.',
    stronger: 'It is the authority. It runs in your system and sees what an outside tool cannot: the dictionary, where-used lists and the release state of every object for your release.',
    together: 'Clean-Core.io reads the same Cloudification Repository outside the system and shows its reading as Level A–D. Confirm with ATC; ATC results can be imported to compare them with the engine.',
  },
  {
    tool: 'abaplint (open source)',
    does: 'A linter for ABAP under the MIT licence, written in TypeScript. It reads code serialized with abapGit and runs on the command line, in CI pipelines and in VS Code, with its rules configured per repository.',
    stronger: 'Fast, scriptable checks on every commit, outside any SAP system, across a whole repository — syntax, style and correctness rules a team can make a gate.',
    together: 'Different questions: abaplint checks how a repository is written; Clean-Core.io explains what one program does and carries that to a decision.',
  },
  {
    tool: 'OWASP ABAP Code Scanner (open source)',
    does: 'A static application security testing tool for ABAP from an OWASP project, under the MIT licence: a Python command-line scanner for exported ABAP source that runs offline, with checks for injection, hard-coded secrets, weak cryptography and insecure dynamic statements. Commercial editions are offered by RedRays.',
    stronger: 'Security. It looks for vulnerabilities, which Clean-Core.io does not check for at all.',
    together: 'Run it for security findings; Clean-Core.io adds the process, Level A–D and the decision for the same program.',
  },
  {
    tool: 'SonarQube (SonarSource)',
    does: 'A code quality and security platform. ABAP analysis is part of its commercial editions, not of the free Community Build, with rules for bugs, maintainability and vulnerabilities, quality gates and dashboards.',
    stronger: 'Continuous quality over a whole code base and many languages, with quality gates in the pipeline and a history per project.',
    together: 'Different scope: SonarQube tracks code quality over time; Clean-Core.io answers what happens to one custom program in a clean core programme.',
  },
  {
    tool: 'Clean-Core.io',
    does: 'A free web workspace for one custom ABAP program: the process as BPMN with line anchors, Level A–D for every SAP object it uses, one decision — keep, rebuild, move to SAP standard or retire — then a design, a code draft and tests, sealed as a signed run.',
    stronger: 'Explaining to the business what a program does and carrying the same evidence to a decision, with what it could not determine named.',
    together: 'It is not a security scanner, not a linter for a whole repository and not the authority on release state; it reads uploaded source, not your system.',
  },
];

export const metadata: Metadata = withTwitterCard({
  title: 'Free ABAP Custom Code Analysis for S/4HANA | Clean-Core.io',
  description: 'Free static analysis of custom ABAP in the browser: table access, unreleased calls and modifications, mapped to released SAP APIs. Complements SAP ATC.',
  alternates: {
    canonical: 'https://clean-core.io/abap-custom-code-analysis',
  },
  openGraph: {
    title: 'Free ABAP Custom Code Analysis for S/4HANA | Clean-Core.io',
    description: 'A free tool for static analysis of custom ABAP: detect risky table access, unreleased calls and modifications, and map them to released SAP APIs for a clean S/4HANA core.',
    url: 'https://clean-core.io/abap-custom-code-analysis',
    type: 'website',
  }
});

const faqs = [
  {
    question: "Why do classic S/4HANA upgrades fail?",
    answer: "Many SAP systems exhibit tight coupling between custom ABAP code and standard SAP tables. During upgrades, these underlying data structures change, leading to system errors and massive testing efforts."
  },
  {
    question: "How does automated ABAP analysis help?",
    answer: "The analysis isolates modifications in the ABAP code and automatically maps direct access to tables like VBAK, LIKP, or BSEG to their official successors via SAP's Cloudification Repository, layered with curated field-level entries — decoupling the system deterministically."
  },
  {
    question: "Is there a free ABAP static code analysis tool?",
    answer: "Yes. Clean-Core.io runs free static analysis of custom ABAP in the browser — no install. It parses your code deterministically, flags risky table access, unreleased calls and modifications, and maps them to released SAP APIs. It is a free community tool, complementary to SAP ADT and ATC."
  },
  {
    question: "How do I find custom code that will break an S/4HANA upgrade?",
    answer: "Run a static analysis that checks each database access and API call against SAP's released-object contract (the Cloudification Repository). Direct writes to standard tables, unreleased or not-to-be-released objects, modifications and native SQL are the usual upgrade blockers — the analysis surfaces them as line-level evidence so you can prioritise remediation."
  },
  {
    question: "Does static ABAP analysis replace SAP ATC?",
    answer: "No — it is complementary. SAP ATC (ABAP Test Cockpit) stays the authoritative in-system check. Clean-Core.io gives a fast, free first-pass assessment plus a target-architecture and remediation view around those findings; always verify with SAP ADT/ATC before acting."
  },
  {
    question: "What ABAP code analysis tools are available?",
    answer: "The authoritative, in-system tools are SAP ABAP Test Cockpit (ATC) with Code Inspector, and ABAP Development Tools (ADT), which run inside your SAP system. Outside the system there are abaplint, an open-source linter for code serialized with abapGit; the OWASP ABAP Code Scanner, an open-source security scanner for exported source; and SonarQube, whose commercial editions analyse ABAP for code quality and security. Clean-Core.io is a free, browser-based workspace for one program: it parses the ABAP deterministically, reconstructs the process, grades every SAP object Level A–D and leads to a decision. Confirm findings with ATC for your target release."
  },
  {
    question: "Can it identify unused or dead ABAP custom code?",
    answer: "Static analysis flags the risky and non-compliant patterns — direct standard-table access, unreleased or not-to-be-released objects, modifications and native SQL — and objects that have no released successor. Detecting genuinely unused (dead) code, however, needs runtime usage data, which comes from SAP's ABAP Call Monitor (SCMON) / Usage & Procedure Logging inside the system. The two are complementary: static analysis tells you what is risky, runtime usage tells you what is actually still called."
  },
  {
    question: "How do I plan SAP custom code remediation?",
    answer: `Prioritise by risk. Use the A–D readiness grade to fix the highest-risk objects first, re-point direct table reads to released CDS views or OData APIs, and route the remaining logic to in-app ABAP Cloud (RAP) or side-by-side CAP on ${BTP_FIRST}. Objects with no released path are flagged for re-architecture rather than a drop-in successor. Every step is deterministic evidence for an architect to confirm with SAP ADT/ATC.`
  }
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
const BODY = 'font-medium leading-relaxed text-cc-ink';
const STEP_ICON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cc-line bg-cc-brand-surface text-cc-brand-strong';
const STEP_TEXT = 'mt-1 text-sm font-medium text-cc-ink-muted';
const CHECK = 'shrink-0 text-cc-brand-strong';
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

export default function AbapAnalysisPage() {

  /**
   * The object count is read from lib/facts.ts, never typed into the copy. It
   * said `23,000+` here while the landing page rendered the live figure two
   * scrolls away — on pages that argue for verifiability, a stale number is the
   * most expensive kind of mistake. Roadmap 0.2 (`UX-E14-F01:R0`) removed the
   * fallback literal itself, not just its appearance in the markup.
   */
  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const schemaJson = {
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

  return (
    <div className={PAGE}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(schemaJson) }}
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
            <ScanSearch size={14} aria-hidden="true" /> Core Technology
          </div>
          <h1 className={H1}>
            ABAP Static Code <span className="text-cc-brand-strong">Analysis</span>
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-cc-ink-muted">
            A free tool to run static analysis on your custom ABAP — detect risky table access and unreleased calls, then map them to released SAP APIs. Decouple legacy systems into an upgrade-safe S/4HANA architecture.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer Block */}
      <QuickAnswer
        question="Why analyze custom ABAP code before an S/4HANA upgrade?"
        answer={`Legacy SAP systems often have tight syntax coupling to standard tables (e.g. VBAK, BSEG, LIKP) or unreleased function modules. During an S/4HANA migration, database structures change, which breaks custom programs. Automated custom code analysis detects these dependencies and maps direct database reads to modern, cloud-released OData APIs and CAP (on ${BTP_FIRST}) or RAP architectures, preventing upgrade blockages.`}
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-8 pt-4 md:grid-cols-3">
        {/* Left 2 Columns: Text content */}
        <div className="space-y-8 md:col-span-2">
          <section className="space-y-4">
            <h2 className={H2}>
              The Challenge: Custom Code as an Upgrade Blocker
            </h2>
            <p className={BODY}>
              In SAP ERP systems that have grown over decades, there are often thousands of lines of custom ABAP developments. Many of these directly access standard tables or unreleased SAP function modules. During an upgrade to <strong>SAP S/4HANA</strong>, this tight coupling leads to system breakages, high modernization costs, and months of testing phases.
            </p>
            <p className={BODY}>
              Manual <strong>ABAP custom code analysis</strong> and subsequent refactoring is extremely time-consuming. This is exactly where the free Clean-Core.io tool comes in: it reads your legacy ABAP, runs a deterministic <strong>static code analysis</strong>, and traces data flows to isolate the dependencies automatically.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>
              How the Automated Pipeline Works
            </h2>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>Deterministic Static Parsing</h3>
                  <p className={STEP_TEXT}>
                    The ABAP source is scanned deterministically with token- and rule-based static analysis. This detects control flows, database operations (SELECT, INSERT, UPDATE, MODIFY, DELETE), and external calls — before any AI runs.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <Link2 size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>SAP Cloudification Catalog</h3>
                  <p className={STEP_TEXT}>
                    Detected table accesses are resolved against SAP&apos;s official Cloudification Repository ({catalogObjects} classified objects) layered with curated field-level entries. Each mapping links to the official successor with its source layer and confidence level.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className={STEP_ICON}>
                  <Activity size={20} aria-hidden="true" />
                </div>
                <div>
                  <h3 className={H3}>Target Architecture Routing</h3>
                  <p className={STEP_TEXT}>
                    Based on the determined degree of coupling, the router decides whether the code should be rewritten in-app in ABAP Cloud (RAP) or decoupled as a side-by-side service on {BTP} (Node.js CAP).
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className={H2}>
              What the ABAP static analysis detects
            </h2>
            <p className={BODY}>
              The scan surfaces the clean-core risks that most often block an S/4HANA upgrade, each as concrete, line-level evidence:
            </p>
            <ul className="space-y-2 font-medium text-cc-ink">
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Direct standard-table access</strong> (reads and writes to VBAK, BSEG, LIKP, KNA1 …) with the released API or CDS successor where the catalog lists one — an access without a listed successor stays marked as unresolved.</span></li>
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Unreleased or not-to-be-released objects</strong> and remote function calls, checked against SAP&apos;s Cloudification Repository. A local <code>CALL FUNCTION</code> is not assessed yet, and the result lists it as not assessed.</span></li>
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Modifications, implicit enhancements and native SQL</strong> — the not-recommended patterns that break on upgrade.</span></li>
              <li className="flex gap-2"><Check className={CHECK_TOP} size={16} aria-hidden="true" /> <span><strong>Dynpro / classic UI, BDC and RFC coupling</strong> that needs a redesign rather than a lift-and-shift.</span></li>
            </ul>
            <p className={BODY}>
              Every finding is deterministic evidence for a qualified architect to review — not a black-box verdict. It is complementary to SAP ADT and ATC, not a replacement.
            </p>
          </section>
        </div>

        {/* Right Column: Key Metrics / Sidebar */}
        <div className="space-y-6">
          <div className={`${SIDE_CARD} space-y-6 bg-cc-surface-muted`}>
            <h3 className={SIDE_TITLE}>Benefits at a glance</h3>
            <ul className={SIDE_LIST}>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> First pass in minutes, not a workshop
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Released successors where SAP names one
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Level A–D for every SAP object used
              </li>
              <li className="flex items-center gap-2">
                <Check className={CHECK} size={16} aria-hidden="true" /> Reduces technical upgrade debt
              </li>
            </ul>
            <div className="border-t border-cc-line pt-4">
              <Link href="/?auth=signup" className={`${publicButton('primary')} w-full`}>
                Analyze for Free
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Related Topics</h3>
            <div className="space-y-2 text-sm">
              <Link href="/clean-core-score" className={SIDE_LINK}>
                → What is the Clean Core Score?
              </Link>
              <Link href="/sap-clean-core-object-classification" className={SIDE_LINK}>
                → Clean Core Object Classification (A–D)
              </Link>
              <Link href="/sap-cloudification" className={SIDE_LINK}>
                → SAP Cloudification: how to cloudify ABAP
              </Link>
              <Link href="/knowledge" className={SIDE_LINK}>
                → SAP Clean Core guide (RAP vs CAP)
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Further reading</h3>
            <a
              href="https://community.sap.com/t5/technology-blog-posts-by-members/you-can-t-clean-what-you-can-t-see-visibility-and-kpis-for-the/ba-p/14448151"
              target="_blank"
              rel="noopener noreferrer"
              className={`${SIDE_LINK} text-sm`}
            >
              → You can&apos;t clean what you can&apos;t see: visibility &amp; KPIs (SAP Community) ↗
            </a>
          </div>
        </div>
      </div>

      {/* ABAP static-analysis tools compared (roadmap 3.0.8, item 7) */}
      <section className="space-y-6" aria-labelledby="tools-title">
        <div className="space-y-2">
          <h2 id="tools-title" className={H2}>
            ABAP static analysis tools compared
          </h2>
          <p className={BODY}>
            Which tool answers which question — as of {TOOL_COMPARISON_AS_OF}. Each row states what the tool&apos;s own public documentation says; check it there for your version. They are not alternatives to each other so much as answers to different questions, and several of them belong in the same programme.
          </p>
        </div>
        <div className="rounded-2xl border border-cc-line bg-cc-surface px-2 pt-3">
          <CcTable
            caption={`ABAP static analysis tools compared, as of ${TOOL_COMPARISON_AS_OF}`}
            columns={TOOL_COLUMNS}
            rows={TOOL_ROWS.map((r) => ({
              key: r.tool,
              cells: {
                tool: <strong className="font-bold text-cc-ink">{r.tool}</strong>,
                does: <span className="text-cc-ink-muted">{r.does}</span>,
                stronger: <span className="text-cc-ink-muted">{r.stronger}</span>,
                together: <span className="text-cc-ink-muted">{r.together}</span>,
              },
            }))}
          />
        </div>
      </section>

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
