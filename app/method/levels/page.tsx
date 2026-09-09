import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileCode2, GitMerge, AlertTriangle } from 'lucide-react';
import { withTwitterCard } from '@/lib/page-metadata';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import QuickAnswer from '@/components/QuickAnswer';
import { getLevelDerivationCensus, getCatalogStats } from '@/lib/abap/catalog-service';
import { ABCD_META, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';

/**
 * How the A–D level is derived — the rule, published.
 *
 * This page exists because of a measurable failure, not a documentation wish. In
 * September 2026 two independent code reviews of this repository read the
 * derivation and both filed the same priority-zero defect: SAP's classification
 * file lists CL_BCS and twenty-one others as `classicAPI` while the site grades
 * them D. Both concluded the release state was wrongly overruling the
 * classification. Both were wrong, and the reasoning that shows why lived in a
 * source comment neither of them opened.
 *
 * A rule that two careful readers get backwards is not a documentation problem
 * downstream of the product; it is the product. So the precedence is published
 * here in the order the code checks it, with the counts computed from the
 * artifacts at build time rather than typed in, and with the contested case
 * worked through instead of asserted.
 *
 * Every number on this page comes from getLevelDerivationCensus(). If a catalog
 * sync changes the data, the page changes with it — nothing here can go stale
 * quietly.
 */

const CANONICAL = 'https://clean-core.io/method/levels';

export const metadata: Metadata = withTwitterCard({
  title: 'How the Clean Core A–D Level Is Derived | Clean-Core.io',
  description:
    'The exact rule Clean-Core.io uses to turn SAP\'s two Cloudification Repository files into a clean core level A–D — the order of precedence, the counts behind each branch, and the twenty-two objects where the two files disagree.',
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'How the Clean Core A–D Level Is Derived | Clean-Core.io',
    description:
      'SAP publishes two files that answer different questions. This is the precedence rule that merges them into one level, with the counts and the contested cases.',
    url: CANONICAL,
    type: 'article',
  },
});

/** Human wording for a state pairing, used in the census table. */
function describe(release: string | null, classification: string | null): string {
  if (release && classification) return `${release} + ${classification}`;
  return release ?? classification ?? 'listed in neither file';
}

export default function LevelDerivationPage() {
  // Server component: reads the generated artifacts directly, no client payload.
  const census = getLevelDerivationCensus();
  const stats = getCatalogStats();

  const contested = census.combinations.filter(
    (c) => c.releaseState && c.classificationState && c.grade !== 'A',
  );
  const contestedTotal = contested.reduce((sum, c) => sum + c.objects, 0);
  // Counted, not `contestedTotal - 1`. The prose says "21 of the 22 carry a
  // successor" and that has to stay a measurement, or the next catalog sync
  // turns it into a confident falsehood.
  const contestedWithSuccessor = contested.reduce((sum, c) => sum + c.withSuccessor, 0);
  const contestedWithout = contestedTotal - contestedWithSuccessor;

  const schemaJson = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: 'How the Clean Core A–D level is derived',
    description:
      'The precedence rule that merges SAP\'s object release information and classic API classification into a single clean core level.',
    url: CANONICAL,
    dateModified: APP_RELEASE_DATE,
    isPartOf: { '@type': 'WebSite', name: 'Clean-Core.io', url: 'https://clean-core.io' },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }} />

      <div>
        <Link
          href="/sap-clean-core-object-classification"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} /> Clean core levels A–D
        </Link>
      </div>

      <header className="space-y-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-gray-500">
          Method
        </span>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05] text-gray-950">
          How the A–D level is derived
        </h1>
        <p className="text-lg text-gray-600 leading-relaxed max-w-3xl">
          SAP publishes two files that answer two different questions. The level is a merge of
          both, and the order the merge happens in decides the answer for{' '}
          <span className="font-bold text-gray-950">{contestedTotal} objects</span> where the two
          files disagree. That order is written out here, in the sequence the code checks it, with
          every count taken from the catalog rather than typed in.
        </p>
      </header>

      <QuickAnswer
        question="Which file wins when SAP's two catalogs disagree?"
        answer="The release file. If SAP will not release an object for ABAP Cloud but has named a successor for it, the level is not B — level B means 'acceptable where no level A path exists', and a named successor is that path. This affects 22 objects, including CL_BCS and CL_HTTP_CLIENT."
      />

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-5">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">The two files</h2>
        <p className="text-gray-600 leading-relaxed max-w-3xl">
          Both come from SAP&rsquo;s{' '}
          <a
            href="https://github.com/SAP/abap-atc-cr-cv-s4hc"
            className="font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            Cloudification Repository
          </a>
          . They are near-disjoint: {census.inBoth.toLocaleString('en-US')} of{' '}
          {census.totalObjects.toLocaleString('en-US')} objects appear in both, so the second file
          is additional coverage rather than a second opinion on the first.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-400">
              <FileCode2 size={16} />
              <span className="font-mono text-xs font-bold">objectReleaseInfo</span>
            </div>
            <p className="mt-2 font-bold text-gray-950">Can ABAP Cloud use this object?</p>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              States <span className="font-mono text-xs">released</span>,{' '}
              <span className="font-mono text-xs">deprecated</span> and{' '}
              <span className="font-mono text-xs">notToBeReleased</span>, and the successors SAP
              names for the objects it is retiring.
            </p>
            <p className="mt-3 text-2xl font-black text-gray-950 tabular-nums">
              {(census.releaseFileOnly + census.inBoth).toLocaleString('en-US')}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">objects</p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-gray-400">
              <FileCode2 size={16} />
              <span className="font-mono text-xs font-bold">objectClassifications_SAP</span>
            </div>
            <p className="mt-2 font-bold text-gray-950">What does classic ABAP using it count as?</p>
            <p className="mt-1 text-sm text-gray-600 leading-relaxed">
              States <span className="font-mono text-xs">classicAPI</span> and{' '}
              <span className="font-mono text-xs">noAPI</span> — whether SAP considers the object
              fair game for classic extensions, or not for customer use at all.
            </p>
            <p className="mt-3 text-2xl font-black text-gray-950 tabular-nums">
              {(census.classificationFileOnly + census.inBoth).toLocaleString('en-US')}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">objects</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Synced from the repository; catalog as of {stats.syncDate || 'the last sync'}.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-5">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">
          The rule, in the order it is checked
        </h2>
        <p className="text-gray-600 leading-relaxed max-w-3xl">
          Each row is one branch. The first one that matches decides, so a row only sees the
          objects the rows above it did not claim — which is what makes the order a decision rather
          than a formatting choice.
        </p>

        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">#</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">SAP state</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Level</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Why</th>
              </tr>
            </thead>
            <tbody>
              {RULES.map((rule, i) => (
                <tr key={rule.state} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400 tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                    {rule.state}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black border ${ABCD_META[rule.grade].badge}`}
                    >
                      {rule.grade}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 leading-relaxed">{rule.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed max-w-3xl">
          A customer object (Z*, Y*) carries no SAP classification at all, and neither does a
          namespaced object SAP does not list — those fall through to the engine&rsquo;s own
          evidence and are labelled as estimated rather than looked up.
        </p>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-5">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">
          What that produces, counted
        </h2>
        <p className="text-gray-600 leading-relaxed max-w-3xl">
          Every pairing that occurs in the data, with the level it produces. Computed from the
          artifacts when this page was built — not maintained by hand.
        </p>

        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Pairing</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500">Level</th>
                <th className="px-4 py-3 text-[11px] font-black uppercase tracking-widest text-gray-500 text-right">Objects</th>
              </tr>
            </thead>
            <tbody>
              {census.combinations.map((c) => {
                const disputed = Boolean(c.releaseState && c.classificationState && c.grade !== 'A');
                return (
                  <tr
                    key={`${c.releaseState}-${c.classificationState}-${c.grade}`}
                    className={`border-t border-gray-100 ${disputed ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-900">
                      {describe(c.releaseState, c.classificationState)}
                      {disputed && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                          <GitMerge size={10} /> files disagree
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-black border ${ABCD_META[c.grade].badge}`}
                      >
                        {c.grade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">
                      {c.objects.toLocaleString('en-US')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={18} />
            <h2 className="text-xl font-black tracking-tight">
              The {contestedTotal} objects that look like a bug
            </h2>
          </div>

          <p className="mt-3 text-amber-900 leading-relaxed">
            Take <span className="font-mono font-bold">CL_BCS</span>, the classic class for sending
            mail. The classification file calls it <span className="font-mono">classicAPI</span> —
            an API classic ABAP may use, which on its own is level B. The release file calls it{' '}
            <span className="font-mono">notToBeReleased</span> and names{' '}
            <span className="font-mono font-bold">CL_BCS_MAIL_MESSAGE</span> as its successor. We
            publish D.
          </p>

          <p className="mt-3 text-amber-900 leading-relaxed">
            That reads as the release state wrongly overruling SAP&rsquo;s own classification, and
            it is the reading two independent code reviews of this project arrived at in September
            2026. The answer is in what level B means:{' '}
            <span className="font-bold">acceptable where no level A path exists</span>. Where SAP
            has named a successor, a level A path does exist, and calling the old object
            &ldquo;SAP-recommended&rdquo; would tell you to keep writing against something SAP has
            already replaced. Of the {contestedTotal} objects in this position,{' '}
            {contestedWithSuccessor} carry an explicit successor
            {contestedWithout === 1 ? ' and one does not' : contestedWithout > 1 ? ` and ${contestedWithout} do not` : ''}.
          </p>

          <p className="mt-3 text-amber-900 leading-relaxed">
            Reasonable people can disagree with that call — it is an interpretation of SAP&rsquo;s
            level definitions, not a quotation of them. What should not happen is disagreeing with
            it by accident, which is why the object pages now show both files side by side and why
            this page exists at all.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black tracking-tight text-gray-950">What this level is not</h2>
        <ul className="space-y-3 text-gray-600 leading-relaxed max-w-3xl">
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
            <span>
              <span className="font-bold text-gray-950">Not an ATC verdict.</span> Each level
              carries an ATC severity in our data, and it is labelled as{' '}
              <em>our reading</em> rather than SAP doctrine. We have not found an SAP source that
              states the mapping outright. ADT/ATC against your target release is the authority;
              this is preparation for that check, not a substitute.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
            <span>
              <span className="font-bold text-gray-950">Not part of the signed audit pack.</span>{' '}
              The level is an orientation aid. A wrong grade must never become signed material, so
              it is deliberately excluded from what the signature covers.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
            <span>
              <span className="font-bold text-gray-950">Not a guess when the data is missing.</span>{' '}
              An object SAP lists nowhere returns <span className="font-mono text-xs">Unknown</span>{' '}
              rather than a plausible-looking letter.
            </span>
          </li>
        </ul>
      </section>

      <footer className="border-t border-gray-200 pt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/catalog" className="font-bold text-gray-900 hover:text-gray-600">
          Browse the object catalog →
        </Link>
        <Link
          href="/sap-clean-core-object-classification"
          className="font-bold text-gray-900 hover:text-gray-600"
        >
          What the levels mean →
        </Link>
        <span className="text-gray-400 ml-auto">
          {APP_VERSION} · {APP_RELEASE_DATE}
        </span>
      </footer>
    </div>
  );
}

/**
 * The branches of `gradeFromSapStates`, in order.
 *
 * Kept next to the page rather than derived from the function: the point is that
 * a reader can compare this list against the source and see they agree. A
 * generated list would only ever agree with itself.
 * `tests/level-rule-page-guard.spec.ts` fails if the two drift apart.
 */
const RULES: { state: string; grade: CloudReadinessGrade; why: string }[] = [
  {
    state: 'released',
    grade: 'A',
    why: 'SAP has released it for ABAP Cloud. This wins outright, including for the objects the classic file also names.',
  },
  {
    state: 'notToBeReleased',
    grade: 'D',
    why: 'SAP will not release it. There is no level A path through this object, and in almost every case SAP names what to use instead.',
  },
  {
    state: 'deprecated + successor',
    grade: 'C',
    why: 'On its way out, but SAP has named the replacement — usable while you migrate, with a deadline attached.',
  },
  {
    state: 'deprecated, no successor',
    grade: 'D',
    why: 'On its way out with nothing named to replace it. Anything built on it has to be re-thought, not re-pointed.',
  },
  {
    state: 'classicAPI',
    grade: 'B',
    why: 'SAP classifies it as fair game for classic ABAP, and no release-file state has claimed it above.',
  },
  {
    state: 'noAPI',
    grade: 'D',
    why: 'SAP classifies it as not intended for customer use.',
  },
  {
    state: 'listed in neither file',
    grade: 'C',
    why: 'An SAP object with no published classification is what the level C definition describes — internal, usable with a changelog check before each upgrade.',
  },
];
