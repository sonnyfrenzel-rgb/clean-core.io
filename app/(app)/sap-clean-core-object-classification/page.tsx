import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { Layers, Check } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import QuickAnswer from '@/components/QuickAnswer';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { publicButton } from '@/components/landing/public-button';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { CcTag } from '@/components/cc/Tag';
import CcTable from '@/components/cc/Table';
import { getPublishedGradeDistribution } from '@/lib/abap/catalog-service';
import { ABCD_META, GRADES, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Object Classification (A–D) | Clean-Core.io',
  description: 'SAP now classifies clean-core technical objects into A, B, C and D by API release status, upgrade safety and extensibility compliance — replacing the older Tier 1/2/3 wording. Learn the model and how Clean-Core.io derives it.',
  alternates: {
    canonical: 'https://clean-core.io/sap-clean-core-object-classification',
  },
  openGraph: {
    title: 'SAP Clean Core Object Classification (A–D) | Clean-Core.io',
    description: 'The A/B/C/D cloud-readiness classification for SAP clean-core technical objects, and how Clean-Core.io applies it to your custom code.',
    url: 'https://clean-core.io/sap-clean-core-object-classification',
    type: 'website',
  },
});

const faqs = [
  {
    question: 'What changed from Tier 1/2/3 to A/B/C/D?',
    answer: "SAP's Cloudification Repository governs which technical objects are clean-core ready. The classification of released/recommended objects moved from the older Tier 1/2/3 wording to a four-grade cloud-readiness scheme — A, B, C, D — driven by API release status, upgrade safety and extensibility compliance. It makes assessing custom code faster and technical-debt control clearer.",
  },
  {
    question: 'How does Clean-Core.io assign an A–D grade?',
    answer: 'As an experimental preview estimate. It is a heuristic derived from the evidence the engine already computes — access type, risk level, object type and whether the object is custom. It is a fast orientation aid, not an authoritative SAP ATC classification, and it is not part of the signed audit pack. Every grade should be verified with SAP ADT/ATC for your target release.',
  },
  {
    question: 'What should I do with grade D objects?',
    answer: 'Grade D objects (unreleased dependencies, direct writes to standard tables, kernel or dynpro usage) are the upgrade blockers. They should be replaced — mapped to a released API/CDS view, wrapped behind a clean interface, or re-architected — before the code can be considered Clean Core.',
  },
];

/** Which SAP state produced each level — shown next to the census counts. */
const CENSUS_STATES: Record<CloudReadinessGrade, string> = {
  A: 'released',
  B: 'classicAPI',
  C: 'deprecated with successor',
  D: 'noAPI · notToBeReleased · deprecated without successor',
  Unknown: 'no state published',
};

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
const CHECK = 'shrink-0 text-cc-brand-strong';
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

export default function CleanCoreClassificationPage() {
  // Server component: reads the generated artifacts directly, no client payload.
  const census = getPublishedGradeDistribution();

  const schemaJson = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <div className={PAGE}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson).replace(/</g, '\\u003c') }} />

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero */}
      <div className={HERO}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18]" style={{ background: HERO_MESH }} />
        <div className="relative max-w-4xl space-y-6">
          <div className={EYEBROW}>
            <Layers size={14} aria-hidden="true" /> Clean Core Classification
          </div>
          <h1 className={H1}>
            Object Classification <span className="text-cc-brand-strong">A–D</span>
          </h1>
          <p className="max-w-2xl text-lg font-medium leading-relaxed text-cc-ink-muted">
            SAP grades clean-core extensions A, B, C or D by API release status, upgrade safety and extensibility compliance — superseding the older Tier 1/2/3 model. Here is the model, the full distribution across SAP’s published data, and how Clean-Core.io derives a grade for your custom code.
          </p>
        </div>
      </div>

      {/* GEO Quick Answer */}
      <QuickAnswer
        question="What is the A/B/C/D Clean Core object classification?"
        answer="It is SAP's cloud-readiness classification for technical objects. A = released SAP APIs and extension points; B = classic SAP APIs, SAP-recommended; C = internal SAP APIs, conditionally clean; D = not-recommended objects and technologies, to be replaced. Clean-Core.io derives the grade from SAP's own published object data — the Cloudification Repository release states plus SAP's classicAPI/noAPI classification file — so a graded object is a lookup, not an estimate. It gives a clearer way to assess custom code and plan upgrade-safe SAP development than a binary clean/not-clean view."
      />

      {/* Main */}
      <div className="grid grid-cols-1 gap-8 pt-4 md:grid-cols-3">
        <div className="space-y-8 md:col-span-2">
          <section className="space-y-4">
            <h2 className={H2}>From Tier 1/2/3 to A/B/C/D</h2>
            <p className={BODY}>
              The Cloudification Repository is the key governance tool for SAP Clean Core analysis. It classifies technical objects by <strong>API release status, upgrade safety and extensibility compliance</strong>. The community has moved from the older Tier 1/2/3 wording to a clearer four-grade cloud-readiness scheme:
            </p>
            <div className="space-y-4 pt-2">
              {/* The level wears the one identifier of DESIGN.md §4.1 — its colour
                  from §1.8 (A information, never green), not one of its own. */}
              {GRADES.map((g) => (
                <div key={g} className="flex items-start gap-4 rounded-2xl border border-cc-line bg-cc-surface p-5">
                  <span className="shrink-0 pt-1">
                    <CcCleanCoreLevel value={g} />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-cc-ink">{ABCD_META[g].label}</h3>
                      <CcTag>ATC (our reading): {ABCD_META[g].atcReading}</CcTag>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-cc-ink-muted">{ABCD_META[g].description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className={BODY}>
              The classification flow is simple: <strong>object identification → repository lookup → grade classification → remediation decision → Clean Core alignment.</strong>
            </p>
            {/*
              The lookup step is the one that needs its own page: SAP publishes
              two files answering different questions, and which one wins decides
              22 objects. Summarising that here would flatten it back into the
              single letter that made it unreadable in the first place.
            */}
            <p className={BODY}>
              The repository lookup merges two SAP files that answer different questions, and the
              order of that merge is a decision rather than a detail.{' '}
              <Link href="/method/levels" className={LINK}>
                The precedence rule is published in full
              </Link>
              , with the counts behind each branch and the objects where the two files disagree.
            </p>
          </section>

          {/*
            The A-D census of SAP's own published data. This is the one figure on
            this topic that nobody else has packaged: it falls out of the catalog
            sync, so it is dated, versioned and traceable to a file hash rather
            than asserted. It describes SAP's data, not any customer's code --
            said plainly below so it cannot be mis-cited as a customer benchmark.
          */}
          <section className="space-y-4">
            <h2 className={H2}>
              A–D across everything SAP publishes
            </h2>
            <p className={BODY}>
              Applying the rules above to SAP&rsquo;s own two repository files grades{' '}
              <strong>{census.totalObjects.toLocaleString('en-US')}</strong> objects. This is a census of
              SAP&rsquo;s published data &mdash; <strong>not</strong> a benchmark of any customer&rsquo;s
              custom code, where the mix looks very different.
            </p>
            <div className="rounded-2xl border border-cc-line bg-cc-surface px-2 pt-3">
              <CcTable
                caption="A–D across everything SAP publishes"
                columns={[
                  { key: 'level', label: 'Level' },
                  { key: 'state', label: 'SAP state' },
                  { key: 'objects', label: 'Objects', numeric: true },
                  { key: 'share', label: 'Share', numeric: true },
                ]}
                rows={GRADES.map((g) => ({
                  key: g,
                  cells: {
                    level: (
                      <span key="level" className="inline-flex items-center gap-2">
                        <CcCleanCoreLevel value={g} />
                        <span className="font-bold text-cc-ink">{ABCD_META[g].short}</span>
                      </span>
                    ),
                    state: <span key="state" className="text-cc-ink-muted">{CENSUS_STATES[g]}</span>,
                    objects: <span key="objects" className="font-bold">{census.distribution[g].toLocaleString('en-US')}</span>,
                    share: (
                      <span key="share" className="text-cc-ink-muted">
                        {((census.distribution[g] / census.totalObjects) * 100).toFixed(1)}&thinsp;%
                      </span>
                    ),
                  },
                }))}
              />
            </div>
            <p className="text-xs leading-relaxed text-cc-ink-muted">
              Sources, so the figures can be reproduced: <code>objectReleaseInfoLatest.json</code>{' '}
              (sha256 {census.releaseSource.sha256}, fetched {census.releaseSource.fetchedAt}) and{' '}
              <code>objectClassifications_SAP.json</code> (sha256 {census.classificationSource.sha256},
              fetched {census.classificationSource.fetchedAt}), both from the{' '}
              <a href="https://github.com/SAP/abap-atc-cr-cv-s4hc" target="_blank" rel="noreferrer" className="underline hover:text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus">
                SAP Cloudification Repository
              </a>{' '}
              (Apache-2.0). Counted by Clean-Core.io {APP_VERSION}. Objects appearing in both files are
              counted once, with the released state taking precedence.
            </p>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={H2}>How Clean-Core.io applies it</h2>
              <CcTag>Catalog-backed · two-tier</CcTag>
            </div>
            <p className={BODY}>
              Every grade carries its provenance, because the two are not equally strong. Where SAP has published a state for an object, the grade is a <strong>lookup</strong>: <code>released</code> &rarr; A, <code>classicAPI</code> &rarr; B, <code>noAPI</code> and <code>notToBeReleased</code> &rarr; D, <code>deprecated</code> &rarr; C with a successor and D without. An SAP object listed in neither file is graded C, which is what the clean core level concept defines level C to be &mdash; SAP-internal, not classified for customer use. Only your own Z/Y objects, which SAP cannot have classified, fall back to a <strong>heuristic</strong> over access type, risk and object type, and they are labelled as estimated wherever they appear.
            </p>
            <p className={BODY}>
              It remains <strong>not</strong> an authoritative SAP ATC classification and is <strong>not</strong> part of the signed audit pack. Verify every grade with SAP ADT / ATC for your specific target release &mdash; a grade is release-dependent, and an object released in 2025 is still unreleased against a 2023 target.
            </p>
            <p className={BODY}>
              Used that way it speeds up first-pass triage and the technical-debt conversation — a starting point for the defensible A–D remediation plan you then confirm against SAP's own tooling.
            </p>
            <p className={BODY}>
              For a hands-on walkthrough of the A–D model — how to classify each object and what to do with grade C and D code — see our SAP Community post:{' '}
              <a
                href="https://community.sap.com/t5/technology-blog-posts-by-members/clean-core-levels-a-d-how-to-classify-your-custom-abap-and-what-to-do-with/ba-p/14437956"
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
              >
                Clean Core Levels A–D: how to classify your custom ABAP ↗
              </a>.
            </p>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className={`${SIDE_CARD} space-y-6 bg-cc-surface-muted`}>
            <h3 className={SIDE_TITLE}>Why it matters</h3>
            <ul className={SIDE_LIST}>
              <li className="flex items-center gap-2"><Check className={CHECK} size={16} aria-hidden="true" /> Faster custom-code assessment</li>
              <li className="flex items-center gap-2"><Check className={CHECK} size={16} aria-hidden="true" /> Clear technical-debt control</li>
              <li className="flex items-center gap-2"><Check className={CHECK} size={16} aria-hidden="true" /> Upgrade-stable development</li>
              <li className="flex items-center gap-2"><Check className={CHECK} size={16} aria-hidden="true" /> Defensible A–D remediation plan</li>
            </ul>
            <div className="border-t border-cc-line pt-4">
              <Link href="/?auth=signup" className={`${publicButton('primary')} w-full`}>
                Classify your code
              </Link>
            </div>
          </div>

          <div className={`${SIDE_CARD} space-y-4 bg-cc-surface`}>
            <h3 className={SIDE_LABEL}>Related Topics</h3>
            <div className="space-y-2 text-sm">
              <Link href="/abap-custom-code-analysis" className={SIDE_LINK}>→ ABAP Custom Code Analysis</Link>
              <Link href="/clean-core-score" className={SIDE_LINK}>→ What is the Clean Core Score?</Link>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
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

      <div className={FOOTER_LINE}>
        Clean-Core.io {APP_VERSION} • {APP_RELEASE_DATE} • Free Community Edition
      </div>
    </div>
  );
}
