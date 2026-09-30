import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Download, ShieldCheck, ArrowRight, Check, X } from 'lucide-react';
import SectionHeader from '@/components/SectionHeader';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import { publicButton } from '@/components/landing/public-button';
import { APP_VERSION } from '@/lib/version';
import { getReferenceAnalysis } from '@/lib/reference-analysis';
import { SUPPORT_MATRIX } from '@/lib/abap/support-matrix';

// Search demand for this page is the generic term — "clean core whitepaper",
// "sap clean core whitepaper", "sap clean core pdf" — not the product name. The
// title led with "The Clean Core Accelerator", so the snippet never matched the
// query: position 12 at 0% CTR over three months. Lead with what was searched for.
export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Whitepaper — Free Modernization Guide (PDF) | Clean-Core.io',
  description: 'Free SAP Clean Core whitepaper: how to assess custom ABAP, route it to in-app RAP or side-by-side BTP CAP, and keep a defensible audit trail. Read it here or download the PDF. Community-built, complementary to SAP ADT and ATC.',
  alternates: {
    canonical: 'https://clean-core.io/whitepaper',
  },
  openGraph: {
    title: 'SAP Clean Core Whitepaper — Free Modernization Guide (PDF) | Clean-Core.io',
    description: 'Free SAP Clean Core whitepaper: custom ABAP assessment, RAP vs. CAP routing, security model and signed audit evidence. Complementary to SAP tooling.',
    url: 'https://clean-core.io/whitepaper',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
});

/* ─── Content mirrors the downloadable PDF (linkedin whitepaper) ─── */

const benefitsEvidence = [
  { title: 'Evidence, Not Opinions', desc: 'A deterministic evidence scanner with token- and rule-based ABAP analysis maps custom-table access, RFC calls and dynpro patterns to concrete findings — before any AI runs. A defensible baseline you can take into an audit, not a black-box guess.' },
  { title: 'The Documentation Nobody Wrote', desc: 'For most legacy programs the documentation was never written or is long gone, the process behind it was never described, and the person who built it has left. The source is the one document that still says what the thing does. A run reads it back in both directions — down into released SAP APIs for the developer, up into process, roles and procedure for the business — and hands both sides a draft to correct rather than a blank page.' },
  { title: 'Upgrade Resilience', desc: 'Replacing unreleased database dependencies with officially released SAP APIs (e.g. I_Customer, API_PRODUCT_SRV) helps keep your ERP core upgrade-stable — reducing coupling between custom code and the core update cycle.' },
  { title: 'Automated Test Stubs', desc: 'Matching unit tests are generated with the code — Express/Node suites for CAP run against mocks in a restricted Node process (filesystem-scoped and time-limited); ABAP Unit doubles for RAP are generated, and their run is simulated, never counted as passed. QA starts covered, not empty.' },
];

const benefitsGovernance = [
  { title: '“Why This Route & Score”', desc: 'A transparency panel shows exactly why a route (RAP / CAP) and score were chosen: the deterministic router rationale, a confidence indicator, and the driving data-coupling findings by risk. Evidence you can defend.' },
  { title: 'Module Risk Heatmap', desc: 'A LOC-weighted treemap of detected ABAP objects grouped by module: tile size = share of the codebase, colour = worst criticality inside it. See at a glance which modules carry the most weight and the most risk.' },
  { title: 'Architecture Decision Record', desc: 'Every signed evidence pack includes a Markdown ADR: the decision, the engine recommendation and any architect override, the rationale, considered options, scope & consequences, and known limitations.' },
  { title: 'Run-Over-Run Progress', desc: 'Because every analysis is an immutable, signed run, the board deck can show a tamper-evident trend: Clean Core Score, findings and complexity deltas versus the previous run — remediation progress, not a re-editable slide.' },
];

const securityKeys = [
  { title: 'BYOK — Server-Side AES-256-GCM', desc: 'Bring Your Own Key is optional: without it, every account gets 5 free transformations on a shared community key; with your own Google Gemini key, usage is unlimited. Your key is encrypted at rest with AES-256-GCM in a server-only store — never returned to the browser (only the last four characters are shown), and used solely via a secure server-side proxy.' },
  { title: 'Keys Never Reach the Client', desc: 'Every AI call is proxied through a hardened server route: a strict model allowlist, a prompt-size cap, per-user rate limiting, and an MFA gate on sensitive actions. Provider keys never touch client code.' },
  { title: 'Model-Training Isolation', desc: 'Under Google’s applicable Gemini API data-use terms, the code you send is not used to train Google’s foundational models. When you use your own key (BYOK), the terms of your own Google account apply. Your IP stays yours.' },
  { title: 'Tenant Security', desc: 'Optional S/4HANA connections are strictly read-only (a connection check, OData metadata reads and one read-only call; running tests against the tenant is locked) — no write operations. Credentials are encrypted at rest (AES-256-GCM), stored server-side only and never returned to the browser; live connections are restricted to an administrator-managed allowlist; every live-tenant request is admin-approved before activation.' },
];

const securityTrust = [
  { title: 'Immutable, Signed Runs', desc: 'Every analysis is captured as an immutable, HMAC-signed “Run”. The evidence pack is generated and signed server-side, so a valid signature protects the integrity of the generated package; provenance is shown per evidence class.' },
  { title: 'Three-Tier Verification', desc: 'Anyone can verify a pack’s manifest hash and signature. The AI narrative is deliberately excluded from the signed payload — the signature attests to evidence, not to free text.' },
  { title: 'EU-Hosted & Art. 17 Erasure', desc: 'Application storage and primary processing run in europe-west1 (Belgium). Account deletion runs an idempotent, multi-system erasure of your live database and authentication entries; residual encrypted backups age out within 30 days. AI and email subprocessors are disclosed separately under their own terms and transfer safeguards.' },
  { title: 'Hardening & Supply Chain', desc: 'A Content-Security-Policy (with documented compatibility exceptions), server-side HTML sanitization, CI secret scanning, a dependency-audit gate and a CycloneDX SBOM generated by the security workflow. Only strictly necessary Firebase Auth storage — no analytics or marketing trackers.' },
];

const rapCapRows = [
  { dim: 'Runtime engine', rap: 'Runs natively within the S/4HANA core.', cap: 'Runs decoupled on SAP BTP (Node.js/TS).' },
  { dim: 'Interfaces', rap: 'Synchronous released CDS views.', cap: 'Decoupled via OData APIs or Event Mesh.' },
  { dim: 'RISE compliance', rap: 'Strict SaaS compliance (zero core modifications).', cap: 'Upgrade-resilient classic custom API wrappers.' },
  { dim: 'Focus case', rap: 'Immediate database updates and transactional locks.', cap: 'Customer portals, mobile apps, external SaaS.' },
];

const apiMappings = [
  { table: 'KNA1', label: 'Customer Master', target: 'CDS View I_Customer' },
  { table: 'BSEG', label: 'Accounting Segment', target: 'CDS View I_JournalEntryItem' },
  { table: 'MARA', label: 'Material Master', target: 'OData API API_PRODUCT_SRV' },
  { table: 'VBAK', label: 'Sales Header', target: 'RAP Entity I_SalesOrderTP' },
];

const doesDo = [
  'Generates a first Clean-Core-compliant draft plus signed evidence.',
  'Runs deterministic analysis before any AI.',
  'Recommends RAP / CAP with a transparent rationale.',
  'Produces tests, BPMN 2.0 XML, a cost simulation and an audit pack.',
];

const doesNotDo = [
  'Perform or guarantee an automated migration.',
  'Replace SAP’s own tools (ADT, ATC) or expert judgment.',
  'Deliver production-ready code without architect review.',
  'Transform SAP GUI dynpro screens, core modifications, native SQL, dynamic call routing or kernel internals — these are flagged and handed back, never guessed at.',
  'Promise a time saving. How long the work takes depends on the decisions, and those stay with you.',
  'Claim any affiliation with or endorsement by SAP SE.',
];

/* ─── Shared classes (block D, D.25b: the --cc-* tokens on a public page) ─── */

/** A card on the page ground. Public pages keep their large radius (E-5, DESIGN.md §1.4). */
const CARD = 'rounded-2xl border border-cc-line bg-cc-surface';

/** An editorial callout: the brand as an accent line, never as a surface under text. */
const CALLOUT = 'rounded-2xl border border-cc-line border-l-4 border-l-cc-brand-strong bg-cc-surface-muted p-6';

/** The micro-label over a card or a list (§1.2). */
const LABEL = 'cc-text-label text-cc-ink-muted';

const LINK = 'font-semibold text-cc-ink underline underline-offset-4 decoration-cc-field-border hover:decoration-cc-ink';

const PDF_HREF = '/Clean-Core_S4HANA_Modernization_Whitepaper.pdf';

/* ─── Component ─── */

export default function WhitepaperPage() {
  // Computed at render time from the shipped reference file and the same support
  // matrix the engine runs on — so the whitepaper cannot drift into a claim.
  const reference = getReferenceAnalysis();
  const constructs = Object.values(SUPPORT_MATRIX);
  const constructCount = constructs.length;
  const fullyCovered = constructs.filter((c) => c.level === 'fully').length;
  const partialCover = constructs.filter((c) => c.level === 'partial').length;
  const notCovered = constructs.filter((c) => c.level === 'not-supported').length;

  return (
    <div className="font-sans text-cc-ink">
      {/* ─── Cover / Hero ─── */}
      <section className="relative overflow-hidden bg-cc-page py-24 md:py-36">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,var(--cc-field-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--cc-field-border)_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.06]" />
        <div className="pointer-events-none absolute top-[15%] left-[8%] z-0 h-[340px] w-[340px] rounded-full bg-cc-brand opacity-[0.18] blur-[120px]" />
        <div className="pointer-events-none absolute right-[10%] bottom-[10%] z-0 h-[400px] w-[400px] rounded-full bg-cc-seq-2 opacity-[0.15] blur-[140px]" />

        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-cc-brand-strong/25 bg-cc-brand-surface px-4 py-2 text-xs font-bold text-cc-brand-strong">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span className="uppercase tracking-[0.08em]">Free Community Edition</span>
          </div>

          <h1 className="mb-6 text-3xl font-extrabold leading-[0.95] tracking-[-0.03em] text-cc-ink sm:text-4xl md:text-7xl">
            The Clean Core{' '}
            <span className="text-cc-brand-strong">Accelerator</span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-base font-medium leading-relaxed text-cc-ink-muted sm:text-lg md:text-xl">
            A free, community-built accelerator for SAP Clean Core modernization. It runs a deterministic evidence engine first, then AI — turning legacy custom ABAP into Clean-Core-compliant drafts and cryptographically signed audit evidence for architect review. Complementary to SAP’s own tooling, never a replacement.
          </p>

          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-4 text-left md:grid-cols-4">
            {[
              { label: 'Author', value: 'Felix Frenzel' },
              { label: 'Platform', value: 'Clean-Core.io' },
              { label: 'Classification', value: 'Public · Community Guide' },
              { label: 'Edition', value: APP_VERSION },
            ].map((m) => (
              <div key={m.label} className={`${CARD} p-3`}>
                <div className={`${LABEL} mb-1`}>{m.label}</div>
                <div className="text-sm font-semibold text-cc-ink">{m.value}</div>
              </div>
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-xl text-xs font-semibold text-cc-ink-muted">
            Audience: SAP architects · developers · transformation leads · security &amp; audit reviewers
          </p>

          <div className="mt-8">
            <a href={PDF_HREF} download className={publicButton('secondary', 'sm')}>
              <Download className="h-4 w-4" aria-hidden="true" /> PDF
            </a>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-4xl space-y-28 px-6 py-16 md:py-24">

        {/* 01 — Introduction */}
        <section id="introduction">
          <SectionHeader align="left" eyebrow={<SectionNumber number="01" total="08" />} title="What is Clean-Core.io?">
            Clean Core means keeping the standard SAP ERP core untouched. When custom code is mixed directly into standard classes and tables, every future S/4HANA update becomes slow, risky and expensive. Clean-Core.io turns that uncertainty into a structured, evidence-backed modernization backlog.
          </SectionHeader>
          <div className={`${CALLOUT} mb-8`}>
            <div className={`${LABEL} mb-2`}>The governing principle — “belegt, nicht behauptet” (proven, not claimed)</div>
            <p className="text-sm leading-relaxed text-cc-ink">
              A deterministic ABAP evidence engine runs before any AI. Every finding, score and routing decision is tied to concrete evidence in your code. The AI writes the human-readable narrative on top — and that narrative is deliberately excluded from the signed evidence, so a signature always attests to server-computed facts, not to free text.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${CARD} p-6`}>
              <div className={`${LABEL} mb-3`}>What it is</div>
              <p className="text-sm leading-relaxed text-cc-ink-muted">An assessment, evidence and governance accelerator — fast enough for exploration, structured enough for governance, honest enough to hold up under review.</p>
            </div>
            <div className={`${CARD} p-6`}>
              <div className={`${LABEL} mb-3`}>What it is not</div>
              <p className="text-sm leading-relaxed text-cc-ink-muted">A replacement for enterprise-architecture approval, SAP release checks, privacy review, penetration testing or production migration governance.</p>
            </div>
          </div>
        </section>

        {/* 02 — Benefits I */}
        <section id="benefits-evidence">
          <SectionHeader align="left" eyebrow={<SectionNumber number="02" total="08" />} title={<>Benefits, Part 1 — Evidence &amp; Speed</>}>
            Clean-Core.io is not a code translator — it is an evidence-first Clean Core accelerator. Architects, developers and decision-makers get immediate, defensible advantages:
          </SectionHeader>
          <CardGrid cards={benefitsEvidence} />
          <div className={`${CALLOUT} mt-8`}>
            <p className="text-sm leading-relaxed text-cc-ink">
              {/*
                This promised "a compiled package". Nothing in this product compiles
                ABAP — the delivery stage labels its own handover "not compiled or
                tested", the terms two sections up disclaim compilation status, and the
                landing page asks the reader to compile the package in their own ADT.
                A whitepaper that contradicts all three is where an architect forms the
                expectation (QA ce41dce9ccd5, 2f60dc7f9d20). It now says what the export
                is: the files, the layout and the generated tests, for compiling and
                activating in your system.
              */}
              Each project opens in one workspace with three views — Business, IT and Management — and the seven stages Analyze · Design · Transformation · Documentation · Testing · Economics · Delivery as its tools. Delivery lets you export the generated package — all modularized files, standard abapGit layout and the generated tests — to compile, activate and test in your own system.
            </p>
          </div>
        </section>

        {/* 03 — Benefits II */}
        <section id="benefits-governance">
          <SectionHeader align="left" eyebrow={<SectionNumber number="03" total="08" />} title={<>Benefits, Part 2 — Transparency &amp; Governance</>}>
            Clean-Core.io makes the reasoning inspectable and the progress auditable — so a recommendation survives scrutiny in a board room, not just a demo.
          </SectionHeader>
          <CardGrid cards={benefitsGovernance} />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { v: '3 Scores', l: 'Clean Core · Complexity · Criticality' },
              { v: 'BPMN 2.0', l: '+ RACI & Level-5 SOP blueprints' },
              { v: 'Economics', l: 'A simulation on your own figures' },
            ].map((s) => (
              <div key={s.v} className="rounded-2xl border border-cc-line bg-cc-surface-muted p-5 text-center">
                <div className="text-lg font-extrabold text-cc-ink">{s.v}</div>
                <div className="mt-1 text-xs font-semibold text-cc-ink-muted">{s.l}</div>
              </div>
            ))}
          </div>
          <div className={`${CALLOUT} mt-4`}>
            <p className="text-sm leading-relaxed text-cc-ink"><strong>Portable by design:</strong> outputs are standard — abapGit ZIP, ABAP-Unit / Express tests, BPMN 2.0 XML files (there is no connection to a Signavio workspace) and a signed audit pack. You own what you generate. No lock-in.</p>
          </div>
        </section>

        {/* 04 — Security I */}
        <section id="security-keys">
          <SectionHeader align="left" eyebrow={<SectionNumber number="04" total="08" />} title={<>Security, Part 1 — Your Keys &amp; Your Code</>}>
            Proprietary legacy source code is a highly confidential business asset. Clean-Core.io is engineered with strict, verifiable boundaries around credentials and AI processing.
          </SectionHeader>
          <CardGrid cards={securityKeys} />
          <div className="mt-8">
            <CcMessageStrip state="warning" headline="Honest boundary:">
              for the paid Gemini API the “not used for training” terms apply directly; if you bring a free-tier key, Google’s free-tier data-use terms govern instead. We state the applicable terms rather than an absolute promise we cannot control.
            </CcMessageStrip>
          </div>
        </section>

        {/* 05 — Security II */}
        <section id="security-trust">
          <SectionHeader align="left" eyebrow={<SectionNumber number="05" total="08" />} title={<>Security, Part 2 — Trust Chain &amp; Data Protection</>}>
            The output is only trustworthy if it is tamper-evident and your data is handled to EU standards. Both are built in.
          </SectionHeader>
          <CardGrid cards={securityTrust} />
        </section>

        {/* 06 — Technical */}
        <section id="technical">
          <SectionHeader align="left" eyebrow={<SectionNumber number="06" total="08" />} title={<>Technical: RAP vs. CAP &amp; API Mapping</>}>
            During analysis, the engine decides — from syntax and coupling evidence — which extensibility path best fits each object:
          </SectionHeader>

          <div className={`${CARD} overflow-hidden p-3`}>
            <CcTable
              caption="RAP versus CAP by dimension"
              columns={[
                { key: 'dim', label: 'Dimension', width: '22%' },
                { key: 'rap', label: 'In-App ABAP Cloud (RAP)' },
                { key: 'cap', label: 'Side-by-Side (BTP CAP)' },
              ]}
              rows={rapCapRows.map((row) => ({
                key: row.dim,
                cells: {
                  dim: <span className="font-bold">{row.dim}</span>,
                  rap: <span className="leading-relaxed text-cc-ink-muted">{row.rap}</span>,
                  cap: <span className="leading-relaxed text-cc-ink-muted">{row.cap}</span>,
                },
              }))}
            />
          </div>

          <div className={`${CARD} mt-6 p-6`}>
            <div className={`${LABEL} mb-3`}>Automated API mapping</div>
            <p className="mb-4 text-sm leading-relaxed text-cc-ink-muted">Direct reads and writes to internal tables carry different Clean Core weight — direct writes to standard tables are the more critical case. The engine maps such access to released standard interfaces, grounded in SAP’s Apache-2.0 Cloudification Repository:</p>
            <div className="space-y-2">
              {apiMappings.map((m) => (
                <div key={m.table} className="flex flex-wrap items-center gap-3 text-sm">
                  <code className="rounded border border-cc-line bg-cc-surface-muted px-2 py-0.5 font-cc-mono font-bold text-cc-ink">{m.table}</code>
                  <span className="text-xs font-semibold text-cc-ink-muted">{m.label}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-cc-ink-muted" aria-hidden="true" />
                  <span className="text-sm font-medium text-cc-ink">{m.target}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={`${CALLOUT} mt-6`}>
            <p className="text-sm leading-relaxed text-cc-ink"><strong>Built on open data:</strong> the object catalog is grounded in SAP’s Apache-2.0-licensed Cloudification Repository, merged with Clean-Core.io’s curated mappings. The platform is free to use and built on open standards — the reasoning is transparent, the outputs are portable.</p>
          </div>
        </section>

        {/* 07 — Honest Scope */}
        <section id="scope">
          <SectionHeader align="left" eyebrow={<SectionNumber number="07" total="08" />} title="Evidence — a run you can reproduce">
            Claims about tools like this are usually unverifiable. This one is not. The figures below
            come from analysing a legacy ABAP program that ships in our public repository, computed
            when this page is rendered rather than written into it. Download the file, run it, and
            compare.
          </SectionHeader>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { k: 'Lines of ABAP', v: reference.linesOfCode.toLocaleString('en-US') },
              { k: 'Findings', v: String(reference.totalFindings) },
              { k: 'Clean Core Score', v: String(reference.cleanCoreScore) },
              { k: 'Construct classes tracked', v: String(constructCount) },
            ].map((x) => (
              <div key={x.k} className={`${CARD} p-4`}>
                <div className="text-2xl font-extrabold tabular-nums text-cc-ink">{x.v}</div>
                <div className={`${LABEL} mt-1`}>{x.k}</div>
              </div>
            ))}
          </div>
          <p className="mb-4 font-medium leading-relaxed text-cc-ink">
            Of those {reference.totalFindings} findings,{' '}
            <strong>{reference.resolved.count} resolve to a released SAP successor</strong> looked up
            in SAP&rsquo;s own published data,{' '}
            <strong>{reference.decision.count} need an architect&rsquo;s decision</strong> because
            business intent has to be weighed against the target design, and{' '}
            <strong>{reference.handedBack.count} are handed back untouched</strong> as structurally
            out of reach for any generator. Of the {constructCount} ABAP construct classes we track,{' '}
            {fullyCovered} are fully covered, {partialCover} require sign-off and {notCovered} are not
            supported — published per class, before you upload anything.
          </p>
          <p className="mb-16 text-sm leading-relaxed text-cc-ink-muted">
            One synthetic reference program is not a codebase, and your ratio will differ. It is
            published so the method and the boundary can be checked, not as a forecast.{' '}
            <Link href="/reference-analysis" className={LINK}>
              See the full run
            </Link>.
          </p>

          <SectionHeader align="left" title="Honest Scope">
            Trust is built on being clear about the boundaries. Here is what Clean-Core.io deliberately does — and does not — do.
          </SectionHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${CARD} p-6`}>
              <div className={`${LABEL} mb-3`}>What it does</div>
              <ul className="space-y-2">
                {doesDo.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-cc-ink-muted"><Check className="mt-0.5 h-4 w-4 shrink-0 text-cc-ink" aria-hidden="true" />{d}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-cc-warning-border bg-cc-warning-bg p-6">
              <div className="cc-text-label mb-3 text-cc-warning">What it does not do</div>
              <ul className="space-y-2">
                {doesNotDo.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-cc-ink"><X className="mt-0.5 h-4 w-4 shrink-0 text-cc-warning" aria-hidden="true" />{d}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-4">
            <CcMessageStrip state="warning">
              All generated output is a draft for expert evaluation. Review, test and approve it with a qualified SAP architect before any productive use. Clean-Core.io is a free, non-commercial community project provided for research and evaluation — independent, and not affiliated with SAP SE or Google LLC.
            </CcMessageStrip>
          </div>
        </section>

        {/* 08 — CTA */}
        <section id="get-started">
          <SectionHeader align="left" eyebrow={<SectionNumber number="08" total="08" />} title="Start with a non-production sample">
            Generate the first Clean-Core-compliant draft for review, walk the decision with your SAP architect, and export a governed delivery package. Start with 5 free transformations, or bring your own Gemini API key (BYOK) for unlimited access — no credit card required.
          </SectionHeader>
          <div className="rounded-[28px] border border-cc-line bg-cc-surface p-8 shadow-sm sm:p-12">
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <Link href="/?auth=signin" className={publicButton('primary')}>
                Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href={PDF_HREF} download className={publicButton('secondary')}>
                <Download className="h-4 w-4" aria-hidden="true" /> Download PDF
              </a>
            </div>
            <div className="mt-10 flex items-center gap-4 border-t border-cc-line pt-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-cc-brand-strong/25 bg-cc-brand-surface text-lg font-extrabold text-cc-brand-strong">FF</div>
              <div>
                <div className="text-sm font-bold text-cc-ink">Felix Frenzel</div>
                <div className="text-xs font-semibold text-cc-ink-muted">Founder &amp; Community Architect · Bamberg, Germany</div>
              </div>
            </div>
          </div>
          <p className="mt-10 text-center text-xs font-semibold text-cc-ink-muted">Community Whitepaper · {APP_VERSION}</p>
        </section>
      </main>
    </div>
  );
}

/* ─── Reusable subcomponents ─── */

function SectionNumber({ number, total }: { number: string; total: string }) {
  return (
    <>
      Section {number} / {total}
    </>
  );
}

function CardGrid({ cards }: { cards: { title: string; desc: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {cards.map((c) => (
        <div key={c.title} className={`${CARD} p-6`}>
          <div className="mb-2 text-sm font-bold text-cc-ink">{c.title}</div>
          <p className="text-sm leading-relaxed text-cc-ink-muted">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}
