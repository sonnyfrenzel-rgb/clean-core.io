import Link from 'next/link';
import { Upload, ScanLine, PenTool, Cpu, FlaskConical, FileText, PackageCheck, Mail, Clock, FileCode2, Sparkles } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/constants';

/**
 * "Your first run" — the practical activation guide.
 *
 * Sits above the narrated walkthrough on /how-to: the tour explains what the
 * platform is, this explains what to actually do in the next fifteen minutes.
 * Every claim here is grounded in the shipped workflow — the step order matches
 * `components/Stepper.tsx`, the accepted formats match the upload inputs on the
 * dashboard and the analyze stage, and the cost line matches `reserveRunQuota`.
 */

const STEPS = [
  {
    icon: Upload,
    stage: 'Upload',
    minutes: '1 min',
    title: 'Pick a starter example, or add your own object',
    body: 'On the dashboard, one click on a starter example creates the project and takes you straight into the analysis. Bringing your own object works the same way — create a project, then paste the source or upload a file.',
  },
  {
    icon: ScanLine,
    stage: 'Analyze',
    minutes: '2 min',
    title: 'Get your Clean Core Score and the evidence behind it',
    body: 'A deterministic engine parses the source before any AI runs: findings with line references, database coupling, a code inventory, and complexity and criticality scores. It then recommends the extensibility route — in-app ABAP Cloud (RAP) or side-by-side BTP (CAP) — and seals the result as a signed, immutable Run.',
  },
  {
    icon: PenTool,
    stage: 'Design',
    minutes: '3 min',
    title: 'Draft the target architecture',
    body: 'The solution design maps the legacy structures onto the recommended route, including released SAP APIs from the Business Accelerator Hub instead of direct table access, plus the non-functional requirements.',
  },
  {
    icon: Cpu,
    stage: 'Transformation',
    minutes: '3 min',
    title: 'Review the generated code side by side',
    body: 'Legacy ABAP on the left, the generated RAP or CAP implementation on the right, scroll-synchronised so you can audit statement by statement. This is a first compliant draft for an architect to review — not a deployment artifact.',
  },
  {
    icon: FlaskConical,
    stage: 'Testing',
    minutes: '2 min',
    title: 'Generate and run the test suite',
    body: 'ABAP Unit test classes are generated against the transformed logic and executed in an isolated sandbox, with the results reported back per test case.',
  },
  {
    icon: FileText,
    stage: 'Documentation',
    minutes: '2 min',
    title: 'Produce the technical and business documentation',
    body: 'BPMN 2.0 process diagrams for import into SAP Signavio or SAP Build, alongside the business-facing procedures and control points — exportable to Confluence.',
  },
  {
    icon: PackageCheck,
    stage: 'Delivery',
    minutes: '1 min',
    title: 'Take the package with you',
    body: 'An abapGit-compatible ZIP with the generated sources and tests, plus the audit evidence pack — the signed record of exactly what was analysed, by which engine version, and what it concluded.',
  },
];

export default function FirstRunGuide() {
  return (
    <section className="space-y-8" aria-labelledby="first-run-heading">
      {/* Intro */}
      <div className="bg-white border border-gray-200 rounded-[2rem] p-8 sm:p-10 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <span className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest">
            <Clock size={12} /> About 15 minutes
          </span>
          <span className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 text-gray-600 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest">
            Costs 1 of your 5 transformations
          </span>
        </div>

        <h2 id="first-run-heading" className="text-3xl sm:text-4xl font-black text-gray-950 tracking-tight leading-tight mb-4">
          Your first run, start to finish
        </h2>

        <p className="text-gray-600 leading-relaxed max-w-3xl mb-8 font-medium">
          The seven stages below are one continuous pass over a single ABAP object. You do not
          have to plan a project or connect a system to begin — pick one object, and the workflow
          carries it all the way to a downloadable package.
        </p>

        {/* Fastest path: no own code needed */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-4">
          <h3 className="flex items-center gap-2 text-sm font-black text-green-900 uppercase tracking-wide mb-3">
            <Sparkles size={16} className="text-green-600" /> You do not need your own code to start
          </h3>
          <p className="text-sm text-green-900/80 leading-relaxed mb-3">
            Every account has a set of ready-made starter examples on the dashboard — realistic,
            fictional legacy reports, from a 99-line stock valuation to a 1,000-line order-fulfilment
            audit. They are the same objects the analysis engine is regression-tested against, so what
            you see is what it is genuinely good at. One click starts the analysis; nothing has to be
            extracted from your own system first.
          </p>
          <p className="text-xs text-green-900/60 leading-relaxed">
            This is the shortest route to seeing whether the output is worth your time. Bring your own
            object afterwards, once you know what to expect.
          </p>
        </div>

        {/* What to bring */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <h3 className="flex items-center gap-2 text-sm font-black text-gray-900 uppercase tracking-wide mb-4">
            <FileCode2 size={16} className="text-green-600" /> When you bring your own object
          </h3>
          <ul className="space-y-3 text-sm text-gray-700 leading-relaxed">
            <li>
              <strong className="text-gray-900">One custom ABAP object.</strong> A report, a class, or a
              function module. Somewhere between 100 and 1,500 lines works best — enough substance for
              the engine to find something, small enough to review in one sitting.
            </li>
            <li>
              <strong className="text-gray-900">As a <code className="font-mono text-[0.85em] bg-white border border-gray-200 rounded px-1 py-0.5">.abap</code> or <code className="font-mono text-[0.85em] bg-white border border-gray-200 rounded px-1 py-0.5">.txt</code> file</strong>, or simply pasted in.
              In ADT or SE80, open the object and copy the source.
            </li>
            <li>
              <strong className="text-gray-900">Source code only.</strong> No system connection, no
              credentials, no business data — nothing is read out of your SAP system. If you would
              rather not use production code, a piece of code from a sandbox or a training system
              works just as well for a first look.
            </li>
          </ul>
        </div>
      </div>

      {/* The seven stages */}
      <ol className="space-y-3 list-none p-0 m-0">
        {STEPS.map((step, i) => (
          <li
            key={step.stage}
            className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 flex gap-5 items-start shadow-sm"
          >
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center text-green-600">
                <step.icon size={18} />
              </div>
              <span className="text-[10px] font-black text-gray-400 tabular-nums">{i + 1}/7</span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                <span className="text-[10px] font-black text-green-700 uppercase tracking-widest bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  {step.stage}
                </span>
                <span className="text-[11px] font-bold text-gray-400">{step.minutes}</span>
              </div>
              <h3 className="text-base font-black text-gray-950 mb-1.5 leading-snug">{step.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Cost + support */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">What it costs</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            One transformation is one ABAP object. All seven stages above are included — and running
            the analysis again on the same source is free, so you can retry without spending anything.
            Bring your own Google Gemini key and there is no limit at all.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide mb-3">
            <Mail size={15} className="text-green-400" /> Stuck anywhere?
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed mb-4">
            Write to us and a person answers — whether it is a question about the output, an object
            the engine handled badly, or something that simply did not work.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-2 bg-white text-slate-900 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-green-50 transition-colors"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <div className="text-center pt-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-4 rounded-xl font-black text-sm uppercase tracking-wider shadow-lg transition-all"
        >
          Start your first run
        </Link>
      </div>
    </section>
  );
}
