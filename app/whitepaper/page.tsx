import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Download, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: 'The Clean Core Accelerator — Community Whitepaper | Clean-Core.io',
  description: 'Free community accelerator for SAP Clean Core modernization: a deterministic evidence engine first, then AI — Clean-Core-compliant drafts and signed audit evidence for architect review. Readable version of the downloadable PDF.',
  alternates: {
    canonical: 'https://clean-core.io/whitepaper',
  },
  openGraph: {
    title: 'The Clean Core Accelerator — Community Whitepaper | Clean-Core.io',
    description: 'Evidence-first SAP Clean Core modernization: benefits, security model, RAP/CAP routing and a signed audit pack. Complementary to SAP tooling.',
    url: 'https://clean-core.io/whitepaper',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
};

/* ─── Content mirrors the downloadable PDF (linkedin whitepaper) ─── */

const benefitsEvidence = [
  { title: 'Evidence, Not Opinions', desc: 'A deterministic evidence scanner with token- and rule-based ABAP analysis maps custom-table access, RFC calls and dynpro patterns to concrete findings — before any AI runs. A defensible baseline you can take into an audit, not a black-box guess.' },
  { title: 'Days → Minutes', desc: 'Manually finding released SAP APIs and rewriting legacy ABAP into RAP classes or CAP services takes days to weeks. Clean-Core.io produces the first qualified draft plus evidence in minutes — the expert reviews instead of starting from a blank page.' },
  { title: 'Upgrade Resilience', desc: 'Replacing unreleased database dependencies with officially released SAP APIs (e.g. I_Customer, API_PRODUCT_SRV) helps keep your ERP core upgrade-stable — reducing coupling between custom code and the core update cycle.' },
  { title: 'Automated Test Stubs', desc: 'Matching unit tests are generated with the code — ABAP Unit doubles for RAP, or Express/Node suites for CAP — and executed in a sandboxed Node process (filesystem-scoped and time-limited). QA starts covered, not empty.' },
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
  { title: 'Tenant Security', desc: 'Optional S/4HANA connections are strictly read-only (OData metadata reads and test execution) — no write operations. Credentials are encrypted at rest (AES-256-GCM), stored server-side only and never returned to the browser; live connections are restricted to an administrator-managed allowlist; every live-tenant request is admin-approved before activation.' },
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
  { table: 'BSEG', label: 'Accounting Segment', target: 'CDS View I_JournalEntry' },
  { table: 'MARA', label: 'Material Master', target: 'OData API API_PRODUCT_SRV' },
  { table: 'VBAK', label: 'Sales Header', target: 'RAP Entity I_SalesOrderTP' },
];

const doesDo = [
  'Generates a first Clean-Core-compliant draft plus signed evidence.',
  'Runs deterministic analysis before any AI.',
  'Recommends RAP / CAP with a transparent rationale.',
  'Produces tests, BPMN, TCO and an audit pack.',
];

const doesNotDo = [
  'Perform or guarantee an automated migration.',
  'Replace SAP’s own tools (ADT, ATC) or expert judgment.',
  'Deliver production-ready code without architect review.',
  'Claim any affiliation with or endorsement by SAP SE.',
];

/* ─── Component ─── */

export default function WhitepaperPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 mt-0.5">Whitepaper</span>
            </div>
          </Link>
          <a
            href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf"
            download
            className="flex items-center gap-2 text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider px-4 py-2 rounded-full border border-gray-200 hover:border-green-400 bg-white/70 backdrop-blur-sm"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
        </div>
      </header>

      {/* ─── Cover / Hero ─── */}
      <section className="relative py-24 md:py-36 overflow-hidden bg-slate-50/30">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] z-0" />
        <div className="absolute top-[15%] left-[8%] w-[340px] h-[340px] bg-emerald-300 rounded-full blur-[120px] opacity-20 z-0 pointer-events-none" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-indigo-300 rounded-full blur-[140px] opacity-15 z-0 pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs mb-8 border border-emerald-100 shadow-sm">
            <ShieldCheck className="w-4 h-4" />
            <span className="uppercase tracking-wider">Free Community Edition · Edition 2.1</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-7xl font-black tracking-tighter mb-6 leading-[0.9] text-gray-950">
            The Clean Core{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">
              Accelerator
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
            A free, community-built accelerator for SAP Clean Core modernization. It runs a deterministic evidence engine first, then AI — turning legacy custom ABAP into Clean-Core-compliant drafts and cryptographically signed audit evidence for architect review. Complementary to SAP’s own tooling, never a replacement.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto text-left">
            {[
              { label: 'Author', value: 'Felix Frenzel' },
              { label: 'Platform', value: 'Clean-Core.io' },
              { label: 'Classification', value: 'Public · Community Guide' },
              { label: 'Edition', value: `2.1 · ${APP_VERSION}` },
            ].map((m) => (
              <div key={m.label} className="bg-white/80 backdrop-blur-sm border border-gray-200/80 rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">{m.label}</div>
                <div className="text-sm font-semibold text-gray-800">{m.value}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-6 max-w-xl mx-auto">
            Audience: SAP architects · developers · transformation leads · security &amp; audit reviewers
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-6 py-16 md:py-24 space-y-28">

        {/* 01 — Introduction */}
        <section id="introduction">
          <SectionEyebrow number="01" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-6">What is Clean-Core.io?</h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            Clean Core means keeping the standard SAP ERP core untouched. When custom code is mixed directly into standard classes and tables, every future S/4HANA update becomes slow, risky and expensive. Clean-Core.io turns that uncertainty into a structured, evidence-backed modernization backlog.
          </p>
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6 mb-8">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-green-700 mb-2">The governing principle — “belegt, nicht behauptet” (proven, not claimed)</div>
            <p className="text-sm text-gray-700 leading-relaxed">
              A deterministic ABAP evidence engine runs before any AI. Every finding, score and routing decision is tied to concrete evidence in your code. The AI writes the human-readable narrative on top — and that narrative is deliberately excluded from the signed evidence, so a signature always attests to server-computed facts, not to free text.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-green-700 mb-3">What it is</div>
              <p className="text-sm text-gray-600 leading-relaxed">An assessment, evidence and governance accelerator — fast enough for exploration, structured enough for governance, honest enough to hold up under review.</p>
            </div>
            <div className="bg-red-50/50 border border-red-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-red-700 mb-3">What it is not</div>
              <p className="text-sm text-gray-600 leading-relaxed">A replacement for enterprise-architecture approval, SAP release checks, privacy review, penetration testing or production migration governance.</p>
            </div>
          </div>
        </section>

        {/* 02 — Benefits I */}
        <section id="benefits-evidence">
          <SectionEyebrow number="02" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Benefits, Part 1 — Evidence &amp; Speed</h2>
          <p className="text-gray-600 leading-relaxed mb-8">Clean-Core.io is not a code translator — it is an evidence-first Clean Core accelerator. Architects, developers and decision-makers get immediate, defensible advantages:</p>
          <CardGrid cards={benefitsEvidence} />
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6 mt-8">
            <p className="text-sm text-gray-700 leading-relaxed">
              A guided 7-stage workflow takes you from Analyze → Design → Transformation → Documentation → Testing → TCO → Delivery, and lets you export a compiled package with all modularized files, standard abapGit export and tests.
            </p>
          </div>
        </section>

        {/* 03 — Benefits II */}
        <section id="benefits-governance">
          <SectionEyebrow number="03" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Benefits, Part 2 — Transparency &amp; Governance</h2>
          <p className="text-gray-600 leading-relaxed mb-8">Version 2.1 makes the reasoning inspectable and the progress auditable — so a recommendation survives scrutiny in a board room, not just a demo.</p>
          <CardGrid cards={benefitsGovernance} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            {[
              { v: '3 Scores', l: 'Clean Core · Complexity · Criticality' },
              { v: 'BPMN 2.0', l: '+ RACI & Level-5 SOP blueprints' },
              { v: 'TCO & ROI', l: 'Upgrade-impact calculator' },
            ].map((s) => (
              <div key={s.v} className="bg-slate-50 border border-gray-200 rounded-2xl p-5 text-center">
                <div className="text-lg font-black text-gray-900">{s.v}</div>
                <div className="text-[11px] font-semibold text-gray-500 mt-1">{s.l}</div>
              </div>
            ))}
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6 mt-4">
            <p className="text-sm text-gray-700 leading-relaxed"><strong>Portable by design:</strong> outputs are standard — abapGit ZIP, ABAP-Unit / Express tests, BPMN 2.0 XML (importable into SAP Signavio or SAP Build) and a signed audit pack. You own what you generate. No lock-in.</p>
          </div>
        </section>

        {/* 04 — Security I */}
        <section id="security-keys">
          <SectionEyebrow number="04" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Security, Part 1 — Your Keys &amp; Your Code</h2>
          <p className="text-gray-600 leading-relaxed mb-8">Proprietary legacy source code is a highly confidential business asset. Clean-Core.io is engineered with strict, verifiable boundaries around credentials and AI processing.</p>
          <CardGrid cards={securityKeys} />
          <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-6 mt-8">
            <p className="text-sm text-amber-800 leading-relaxed"><strong>Honest boundary:</strong> for the paid Gemini API the “not used for training” terms apply directly; if you bring a free-tier key, Google’s free-tier data-use terms govern instead. We state the applicable terms rather than an absolute promise we cannot control.</p>
          </div>
        </section>

        {/* 05 — Security II */}
        <section id="security-trust">
          <SectionEyebrow number="05" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Security, Part 2 — Trust Chain &amp; Data Protection</h2>
          <p className="text-gray-600 leading-relaxed mb-8">The output is only trustworthy if it is tamper-evident and your data is handled to EU standards. Both are built in.</p>
          <CardGrid cards={securityTrust} />
        </section>

        {/* 06 — Technical */}
        <section id="technical">
          <SectionEyebrow number="06" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Technical: RAP vs. CAP &amp; API Mapping</h2>
          <p className="text-gray-600 leading-relaxed mb-8">During analysis, the engine decides — from syntax and coupling evidence — which extensibility path best fits each object:</p>

          <div className="hidden md:block border border-gray-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1.5fr_1.5fr] bg-slate-900 text-white">
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-emerald-400 border-r border-slate-700">Dimension</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400 border-r border-slate-700">In-App ABAP Cloud (RAP)</div>
              <div className="p-4 text-[10px] font-black uppercase tracking-wider text-gray-400">Side-by-Side (BTP CAP)</div>
            </div>
            {rapCapRows.map((row, i) => (
              <div key={i} className={`grid grid-cols-[1fr_1.5fr_1.5fr] ${i !== rapCapRows.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="p-4 text-xs font-bold text-green-700 border-r border-gray-100">{row.dim}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed border-r border-gray-100">{row.rap}</div>
                <div className="p-4 text-xs text-gray-600 leading-relaxed">{row.cap}</div>
              </div>
            ))}
          </div>
          <div className="md:hidden space-y-4">
            {rapCapRows.map((row, i) => (
              <div key={i} className="border border-gray-200 rounded-2xl p-5 space-y-2">
                <div className="text-sm font-black text-green-700">{row.dim}</div>
                <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">RAP: </span><span className="text-xs text-gray-600">{row.rap}</span></div>
                <div><span className="text-[10px] font-black uppercase tracking-wider text-gray-400">CAP: </span><span className="text-xs text-gray-600">{row.cap}</span></div>
              </div>
            ))}
          </div>

          <div className="border border-gray-200 rounded-2xl p-6 mt-6">
            <div className="text-xs font-black uppercase tracking-wider text-gray-900 mb-3">Automated API mapping</div>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">Direct reads and writes to internal tables carry different Clean Core weight — direct writes to standard tables are the more critical case. The engine maps such access to released standard interfaces, grounded in SAP’s Apache-2.0 Cloudification Repository:</p>
            <div className="space-y-2">
              {apiMappings.map((m) => (
                <div key={m.table} className="flex items-center gap-3 text-sm">
                  <code className="font-mono font-bold text-green-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">{m.table}</code>
                  <span className="text-gray-400 text-xs">{m.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <span className="text-gray-700 text-xs font-medium">{m.target}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-emerald-50/70 border border-emerald-200 border-l-4 border-l-green-600 rounded-xl p-6 mt-6">
            <p className="text-sm text-gray-700 leading-relaxed"><strong>Built on open data:</strong> the object catalog is grounded in SAP’s Apache-2.0-licensed Cloudification Repository, merged with Clean-Core.io’s curated mappings. The platform is free to use and built on open standards — the reasoning is transparent, the outputs are portable.</p>
          </div>
        </section>

        {/* 07 — Honest Scope */}
        <section id="scope">
          <SectionEyebrow number="07" total="08" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-gray-950 mb-4">Honest Scope</h2>
          <p className="text-gray-600 leading-relaxed mb-8">Trust is built on being clear about the boundaries. Here is what Clean-Core.io deliberately does — and does not — do.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-green-700 mb-3">What it does</div>
              <ul className="space-y-2">
                {doesDo.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-gray-600"><CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />{d}</li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50/50 border border-amber-200/70 rounded-2xl p-6">
              <div className="text-xs font-black uppercase tracking-wider text-amber-700 mb-3">What it does not do</div>
              <ul className="space-y-2">
                {doesNotDo.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-gray-600"><span className="w-2 h-2 rounded-sm bg-amber-500 shrink-0 mt-1.5" />{d}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-6 mt-4">
            <p className="text-sm text-amber-800 leading-relaxed">All generated output is a draft for expert evaluation. Review, test and approve it with a qualified SAP architect before any productive use. Clean-Core.io is a free, non-commercial community project provided for research and evaluation — independent, and not affiliated with SAP SE or Google LLC.</p>
          </div>
        </section>

        {/* 08 — CTA */}
        <section id="get-started">
          <SectionEyebrow number="08" total="08" />
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 sm:p-12 border border-slate-800 shadow-2xl relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.06),transparent_45%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(245,158,11,0.04),transparent_40%)] pointer-events-none" />
            <div className="relative z-10 space-y-6">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter text-white leading-tight">Start with a non-production sample</h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                Generate the first Clean-Core-compliant draft for review, walk the decision with your SAP architect, and export a governed delivery package. Start with 5 free transformations, or bring your own Gemini API key (BYOK) for unlimited access — no credit card required.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-4 pt-2">
                <Link href="/?auth=signin" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg hover:shadow-2xl hover:-translate-y-0.5">
                  Get started <ArrowRight className="w-4 h-4" />
                </Link>
                <a href="/Clean-Core_S4HANA_Modernization_Whitepaper.pdf" download className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white px-6 py-4 rounded-xl font-bold text-sm transition-all border border-white/10">
                  <Download className="w-4 h-4" /> Download PDF
                </a>
              </div>
            </div>
            <div className="relative z-10 mt-10 pt-8 border-t border-white/10 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 font-black text-lg">FF</div>
              <div>
                <div className="text-sm font-bold text-white">Felix Frenzel</div>
                <div className="text-xs text-slate-400">Founder &amp; Community Architect · Bamberg, Germany</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 p-1 rounded-md"><div className="w-2 h-2 rounded-sm bg-green-600" /></div>
            <span className="font-bold text-gray-600">Clean-Core<span className="text-gray-400">.io</span></span>
          </div>
          <span>Community Whitepaper · Edition 2.1 · {APP_VERSION}</span>
          <Link href="/impressum" className="hover:text-green-600 transition-colors">Impressum</Link>
        </div>
      </footer>
    </div>
  );
}

/* ─── Reusable subcomponents ─── */

function SectionEyebrow({ number, total }: { number: string; total: string }) {
  return (
    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-green-600 mb-3">
      Section {number} / {total}
    </div>
  );
}

function CardGrid({ cards }: { cards: { title: string; desc: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((c) => (
        <div key={c.title} className="border border-gray-200 rounded-2xl p-6">
          <div className="text-sm font-black text-gray-900 mb-2">{c.title}</div>
          <p className="text-xs text-gray-600 leading-relaxed">{c.desc}</p>
        </div>
      ))}
    </div>
  );
}
