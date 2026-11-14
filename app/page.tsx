import { jsonLdHtml } from '@/lib/json-ld';
import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, Check, ChevronDown, Users } from 'lucide-react';
import PublicHeader from '@/components/PublicHeader';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import LandingModalsLazy from '@/components/landing/LandingModalsLazy';
import SectionHeader from '@/components/SectionHeader';
import { SITE_FOOTER_COLUMNS } from '@/components/SiteFooter';
import AuthLink from '@/components/landing/AuthLink';
import { publicButton } from '@/components/landing/public-button';
import HeroMapBuild from '@/components/landing/HeroMapBuild';
import RuleAnswer from '@/components/landing/RuleAnswer';
import CopyLinkButton from '@/components/landing/CopyLinkButton';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { getReferenceAnalysis } from '@/lib/reference-analysis';
import { getAllCatalogObjectNames, objectToSlug } from '@/lib/abap/catalog-index';
import { CLEAN_CORE_LEVEL } from '@/lib/clean-core-level';
import { PUBLIC_CLOUD_FIT_BUCKETS, PUBLIC_CLOUD_FIT_BUCKET_LABELS } from '@/lib/abap/public-cloud-fit';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { TRUST_CLAIMS, SECURITY_MODEL_URL } from '@/lib/trust-claims';
import { DEMO_OBJECT_NAME, DEMO_PROJECT_TITLE, DEMO_SOURCE_FILE } from '@/lib/demo-marks';
import { landingHero } from '@/lib/landing-process';
import { heroBuild, demoLadder, DEMO_FIGURES, RULE_SENTENCES } from '@/lib/landing-35';
import { PHASES } from '@/lib/workflow-steps';
import { BTP, BTP_FIRST } from '@/lib/sap-naming';
import { LANDING_FAQ } from '@/lib/landing-faq';
import '@/components/landing/landing-35.css';

/**
 * The public start page — landing page 3.5 (roadmap row 3.5.0, item 7), a
 * build of the accepted mockup `docs/roadmap/landing-35-mockup.html` with the
 * owner's decisions of 13.11.2026: the hero picture is the map building up
 * (O1 = B), the story comes before the price (O2), the calls to action are the
 * showcase's own words (O3), the catalog lookup lives on its own page (O7),
 * the header offers "Sign in" and "Start free" (O9).
 *
 * One shared story for Business, IT and Management: a plain headline for
 * everyone, one line per reader in every section, details on demand in the
 * "For IT" folds. No reader gate, no measurement: a signed-out visit contacts
 * only its own origin.
 *
 * What holds the page together, as before:
 *
 *   - **Every figure and every claim is read, not typed.** The hero map and its
 *     names from the engine (`lib/landing-35.ts`), the rules from
 *     `pickHeroRules`, levels from the catalog at render time, the demo's
 *     figures from `lib/demo-release.json`, the reference run from
 *     `lib/reference-analysis.ts`, the trust lines from `lib/trust-claims.ts`,
 *     the FAQ from `lib/landing-faq.ts`.
 *   - **No drawn product picture.** Where the mockup draws a screen of the
 *     product, the page keeps a marked place for the capture that will show it.
 *   - **One header.** Every section title comes from `SectionHeader`
 *     (`tests/landing-style-guard.spec.ts`).
 */
export const revalidate = 300;

/**
 * Title and description follow the searches that already reach this page
 * ("SAP Clean Core Accelerator", "ABAP code analysis"). The description stays
 * under ~160 characters so Google shows it whole; the social card carries the
 * approved short USP (owner decision 01.10.2026), which the whitepaper's
 * title repeats.
 */
const HOME_TITLE = 'SAP Clean Core Accelerator · ABAP Analysis | Clean-Core.io';
const HOME_SHARE_TITLE = 'Clean-Core.io — SAP Clean Core Accelerator for custom ABAP';
const HOME_SHARE_DESCRIPTION =
  'From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check. The process as BPMN with line anchors, SAP clean core level A–D per object, signed runs. Free for the SAP community.';

export const metadata: Metadata = withTwitterCard({
  title: HOME_TITLE,
  description:
    'Free SAP clean core tool: reads custom ABAP before any model, draws its process as BPMN with line anchors, grades SAP objects A–D, drafts code and tests.',
  alternates: {
    canonical: 'https://clean-core.io',
  },
  openGraph: {
    title: HOME_SHARE_TITLE,
    description: HOME_SHARE_DESCRIPTION,
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
});

/** The public showcase (roadmap row 3.5.0, item 8): no account, no third-party request, no model call. */
const SHOWCASE = '/demo';
/** The showcase's length, as its story is counted — the link text must stay true (owner, 13.11.2026). */
const SHOWCASE_CTA = 'Watch the 4-minute demo';
const DO_CTA = 'Analyse your own Z program — free account';
/** The repository the product publishes as its own. */
const REPO = 'https://github.com/sonnyfrenzel-rgb/clean-core.io';

/** When an object lands in a bucket — `DESIGN.md` §5.6, as `lib/abap/public-cloud-fit.ts` checks it. */
const BUCKET_RULE: Record<string, string> = {
  retire:
    'The rule it serves is confirmed “Drop”, or a usage import shows no executions over at least 13 months — then it is a candidate, an open check, not a verdict.',
  'no-catalogued-path':
    'Needed, below the target platform’s bar, and SAP’s Cloudification Repository names no released API and no successor for it.',
  rebuild:
    'Needed, below the bar, and a successor or an extension path is named — and every modification or own write to an SAP table.',
  keep: 'Needed and permitted on the target platform: SAP S/4HANA Cloud Public Edition (part of SAP Cloud ERP) level A only, SAP Cloud ERP Private (formerly SAP S/4HANA Cloud Private Edition) level A or B.',
};

const ARROW = <ArrowRight size={18} aria-hidden="true" />;

/** What each reader finds in a section: one line each, never a gate. */
function ForYou({ business, it, management }: { business: React.ReactNode; it: React.ReactNode; management: React.ReactNode }) {
  return (
    <ul className="foryou" aria-label="What each reader finds here">
      <li>
        <span className="who">Business</span>
        <span>{business}</span>
      </li>
      <li>
        <span className="who">IT</span>
        <span>{it}</span>
      </li>
      <li>
        <span className="who">Management</span>
        <span>{management}</span>
      </li>
    </ul>
  );
}

/** A "For IT" fold: the dense facts, one click down. */
function ForIt({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="deep">
      <summary>
        <span className="lv">For IT</span>
        {title}
        <ChevronDown size={18} className="ch" aria-hidden="true" />
      </summary>
      <div className="in">{children}</div>
    </details>
  );
}

/**
 * The place a product picture will stand. The mockup draws these screens; the
 * page shows only captures of the product (roadmap row 3.5.0, item 4), so until
 * those exist the place says what it will show.
 */
function CaptureToCome({ name, shows }: { name: string; shows: string[] }) {
  return (
    <figure className="capture-todo" data-capture-todo={name} aria-label={`Product picture to come: ${name}`}>
      <span className="k">Picture follows with the 3.5 captures</span>
      <b>{name}</b>
      <ul>
        {shows.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </figure>
  );
}

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith('http') ? (
    <a href={href} className="textlink" rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} className="textlink">
      {children}
    </Link>
  );
}

export default function Home() {
  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const reference = getReferenceAnalysis();
  const withPage = new Set(getAllCatalogObjectNames());
  const lines = (n: number) => n.toLocaleString('en-US');
  const hero = landingHero(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME);
  const build = heroBuild(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME);
  const ladder = demoLadder();
  const demoExample = STARTER_EXAMPLES.find((e) => e.name === DEMO_OBJECT_NAME);
  const holdRule = hero.rules.shown[0];
  const trust = (id: string) => TRUST_CLAIMS.find((c) => c.id === id)!;
  const architectureUrl = SECURITY_MODEL_URL.replace(/SECURITY\.md$/, 'docs/ARCHITECTURE.md');
  const catalogHref = (name: string) => (withPage.has(name) ? `/catalog/${objectToSlug(name)}` : '/sap-clean-core-object-classification');

  /**
   * Where Clean-Core.io stands next to SAP's own tools. Defined once and
   * rendered once — a table that stacks on a phone through CSS, not a second
   * copy (`tests/landing-consistency-guard.spec.ts`).
   */
  const toolchainRows: Array<{ tool: string; purpose: string; relation: string }> = [
    {
      tool: 'ABAP Test Cockpit (ATC)',
      purpose: 'The authoritative check for clean core violations — keep using it.',
      relation: `Reads the same SAP Cloudification Repository (${catalogObjects}, classified) and shows its reading as level A–D. Import ATC results to compare them with the engine.`,
    },
    {
      tool: 'ABAP Development Tools (ADT)',
      purpose: 'Where ABAP is developed, compiled and unit-tested; ABAP Unit and the CDS Test Double Framework are on board.',
      relation: 'Generated drafts arrive as an abapGit package that you import, compile and test there.',
    },
    {
      tool: 'Joule for Developers and the Custom Code Migration Agent',
      purpose: 'SAP’s AI for ABAP developers, inside your system: it explains code and fixes what ATC finds, under SAP’s licence.',
      relation: 'They tell developers what to fix. Clean-Core.io shows the business what the code does and carries the same evidence through a design, a code draft and tests to a decision; what stays goes to them. ATC stays the authority.',
    },
    {
      tool: 'SAP Signavio',
      purpose: 'Process modelling, under its own licence.',
      relation: 'The process leaves as a BPMN 2.0 XML file. Import into SAP Signavio has not been verified yet; there is no connection to a Signavio workspace.',
    },
    {
      tool: 'SAP Cloud ALM',
      purpose: 'Project and application lifecycle, under SAP’s licence.',
      relation: 'No adapter. The handover package is a set of files you take along.',
    },
  ];

  /**
   * Structured data. Every sentence is one the page also says; the FAQ is the
   * visible list (`lib/landing-faq.ts`); version and date from `lib/version.ts`.
   * No rating, no review, no figure typed in. The screenshots return with the
   * 3.5 captures; a VideoObject only once the video is published.
   */
  const schemaJson = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://clean-core.io/#organization',
        name: 'Clean-Core.io',
        // Answer engines mixed the name up with a cleaning-business CRM and a
        // listed company that use "CleanCore". The spelling with the domain, the
        // topics and the disambiguating sentence say which Clean-Core this is;
        // nothing here names the others.
        alternateName: ['clean-core.io', 'Clean-Core.io SAP clean core accelerator'],
        disambiguatingDescription:
          'A free community web app for SAP custom ABAP and SAP clean core. Not the cleaning-business software or the listed company that use the name CleanCore.',
        url: 'https://clean-core.io',
        logo: 'https://clean-core.io/logo.png',
        description: 'An independent community project for the SAP community, not affiliated with or endorsed by SAP SE.',
        knowsAbout: [
          'SAP clean core',
          'SAP Cloudification Repository',
          'ABAP custom code analysis',
          { '@type': 'Thing', name: 'ABAP', sameAs: 'https://en.wikipedia.org/wiki/ABAP' },
          { '@type': 'Thing', name: 'SAP S/4HANA', sameAs: 'https://en.wikipedia.org/wiki/SAP_S/4HANA' },
          { '@type': 'Thing', name: 'Business Process Model and Notation', sameAs: 'https://en.wikipedia.org/wiki/Business_Process_Model_and_Notation' },
          'ABAP RESTful Application Programming Model (RAP)',
          'SAP Cloud Application Programming Model (CAP)',
        ],
        sameAs: [REPO, 'https://www.linkedin.com/company/clean-core-io'],
        founder: {
          '@type': 'Person',
          name: 'Felix Frenzel',
          jobTitle: 'Founder & Community Builder',
          url: 'https://www.linkedin.com/in/felix-frenzel-3327741b8/',
          sameAs: ['https://www.linkedin.com/in/felix-frenzel-3327741b8/', 'https://github.com/sonnyfrenzel-rgb'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://clean-core.io/#website',
        name: 'Clean-Core.io',
        url: 'https://clean-core.io',
        inLanguage: 'en',
        publisher: { '@id': 'https://clean-core.io/#organization' },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://clean-core.io/#software',
        name: 'Clean-Core.io',
        url: 'https://clean-core.io',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'SAP custom code analysis and clean core modernization',
        operatingSystem: 'Web browser',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        publisher: { '@id': 'https://clean-core.io/#organization' },
        description: `${HOME_SHARE_DESCRIPTION} Not affiliated with or endorsed by SAP SE.`,
        featureList: [
          'Deterministic ABAP static code analysis that reads the program before any language model does',
          'Business process reconstructed from ABAP as BPMN 2.0, with a line anchor on every element or the reason it has none',
          'BPMN editor with revisions; BPMN 2.0 XML export and import (no SAP Signavio connection; import into SAP Signavio not verified)',
          'Business rules hard-coded in the program, each with its line, to keep, change, drop or clarify',
          'SAP clean core level A–D for each SAP object the code uses, or Unknown where SAP’s published data holds no answer, derived by Clean-Core.io’s versioned rule from the states SAP publishes in its Cloudification Repository — an orientation; ABAP Test Cockpit stays the authority',
          'Clean Core Score, 5–100, higher is better, in four bands — published by Clean-Core.io, not an SAP metric',
          'Business, IT and Management views of the same project; an indication for the decision, never the decision',
          'Target design, transformed RAP or CAP code draft and test scenarios — for CAP run against mocks in an isolated runner, for RAP an ABAP Unit class that runs only in your own system',
          'Every completed analysis sealed as a signed run (HMAC); audit pack for handover signed over the run with HMAC and Ed25519',
          'Read access by invitation, bound to one confirmed e-mail address, until it is withdrawn; an invitation link nobody accepts expires',
          'Own model key: Google Gemini; Claude by Anthropic from 23 December 2026',
          'A four-minute demo without an account',
          'Stored in the EU; no analytics, advertising or tracking cookies',
        ],
        softwareVersion: APP_VERSION,
        datePublished: '2025-01-15',
        // Moves with every release instead of going stale at a typed date.
        dateModified: APP_RELEASE_DATE_ISO,
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://clean-core.io/#faq',
        mainEntity: LANDING_FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          ...(f.lang ? { inLanguage: f.lang } : {}),
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        // The start page is the root of the trail, so its trail is itself.
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Clean-Core.io', item: 'https://clean-core.io' }],
      },
    ],
  };

  const shareBody = (lens: string) =>
    `mailto:?subject=${encodeURIComponent(lens === 'it' ? 'Clean-Core.io — what a Z program does' : 'Clean-Core.io — a decision basis for custom code')}&body=${encodeURIComponent(
      `A 4-minute demo, no account needed: https://clean-core.io${SHOWCASE}#lens=${lens}`,
    )}`;

  return (
    <div className="lp35 min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(schemaJson) }} />

      <PublicHeader signInHref="?auth=signin" />

      <main id="main">
        {/* 0 · hero */}
        <section className="hero" id="hero" aria-labelledby="hero-title">
          <div className="wrap">
            <div className="hero-copy">
              <p className="kicker">
                <Users aria-hidden="true" />
                Free for the SAP community
              </p>
              <h1 id="hero-title">
                <span className="h1k">SAP Clean Core Accelerator</span>
                <span className="h1m">Know what your custom ABAP does — and what to do with it.</span>
              </h1>
              <p className="hero-lead">
                Clean-Core.io reads a Z program and shows the business process it runs, the rules hidden in it and what
                stands between it and a clean core. Every step points to its line of code.
              </p>
              <div className="cta-row">
                <Link href={SHOWCASE} className={publicButton('primary')} data-cta-see="">
                  <span className="whitespace-normal">{SHOWCASE_CTA}</span> {ARROW}
                </Link>
                <AuthLink to="/dashboard" variant="secondary" testId="hero-start">
                  <span className="whitespace-normal">{DO_CTA}</span>
                </AuthLink>
              </div>
              <p className="cta-note">
                <b>The demo needs no account</b> — one fictitious program, read end to end. <b>Free to start:</b> five
                analysis runs of your own code and every example once, no card.
              </p>
            </div>

            <figure className="shot" aria-labelledby="shot-cap">
              <figcaption id="shot-cap">
                Example · {DEMO_OBJECT_NAME}, a fictitious program shipped with the product · the main flow as the engine
                reads it
              </figcaption>
              <div className="win">
                <div className="wbar">
                  <span className="dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="path">
                    My workspace › <b>{DEMO_PROJECT_TITLE}</b> › Analyze
                  </span>
                  <span className="seg" aria-hidden="true">
                    <span className="on">Business</span>
                    <span>IT</span>
                    <span>Management</span>
                  </span>
                </div>
                <div className="wbody">
                  <div className="does">
                    <div className="t">
                      <h3>What this program does</h3>
                      <p>
                        It approves emergency purchase requisitions and creates the purchase order in SAP. A price more
                        than 5&nbsp;% above the agreed one holds the requisition for a buyer{' '}
                        <span className="ln">L{holdRule.line}</span>.
                      </p>
                    </div>
                  </div>
                  <div className="map" data-hero-map="">
                    <p className="part">
                      The main flow · {build.shownSteps} of its {build.totalSteps} steps
                    </p>
                    <HeroMapBuild
                      elements={build.elements}
                      hiddenOnPhone={build.hiddenOnPhone}
                      label={`The main flow of ${DEMO_OBJECT_NAME} as a map, every element with its line`}
                    />
                    <div className="legend">
                      <span>
                        <span className="ln">L{holdRule.line}</span> line of code
                      </span>
                      <span>□ step · ◇ decision · ○ start and end</span>
                    </div>
                  </div>
                </div>
              </div>
            </figure>

            {/* The three reader entries: orientation, never a gate. */}
            <nav className="readers" aria-labelledby="readers-k">
              <p className="k" id="readers-k">
                One page for three questions
              </p>
              <ul>
                <li>
                  <a href="#process">
                    <span className="who">Business</span>
                    <span className="q">What does this program do in our process, and which rules are hidden in it?</span>
                    <span className="gets">The process as a map in plain words, and every hard-coded rule to keep, change or drop.</span>
                    <span className="go">Read the process →</span>
                  </a>
                </li>
                <li>
                  <a href="#for-it">
                    <span className="who">IT</span>
                    <span className="q">What does it touch, where does it break clean core, how do we rebuild it?</span>
                    <span className="gets">Findings at their line, SAP objects graded A–D, the route, a code draft and tests.</span>
                    <span className="go">The facts for IT →</span>
                  </a>
                </li>
                <li>
                  <a href="#decide">
                    <span className="who">Management</span>
                    <span className="q">What do we risk, what does it cost, what do we decide?</span>
                    <span className="gets">One page: what it is for, an indication, the risk and the options to decide on.</span>
                    <span className="go">The decision →</span>
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </section>

        {/* 1 · process */}
        <section className="sec alt" id="process" aria-labelledby="process-title">
          <div className="wrap">
            <SectionHeader eyebrow="From code to process" title="What does this program actually do?" titleId="process-title">
              Clean-Core.io draws the process the code runs as a map you can walk through, and writes what it does in
              plain words, with every sentence pointing to its line.
            </SectionHeader>
            <ForYou
              business="The steps in your words, who is involved, and how a case can end."
              it="Every element carries its line, read by the engine before any model."
              management="What the program is for, before anyone decides about it."
            />
            <CaptureToCome
              name="Analyze, Business view: the walk-through on the map"
              shows={[
                `The walk-through stopped at a decision point of ${DEMO_OBJECT_NAME}, with its line.`,
                'The text around the map — how it runs, who is involved, questions for the business.',
                'The two charts: how a case can end, and what it changes or only reads.',
                'The two endings: re-design this program, or analyse another one.',
              ]}
            />
            <ForIt title="How the map is built, and what leaves as a file">
              <ul>
                <li>
                  A deterministic ABAP engine parses the program first — no model. The same file gives the same map.
                  Start and end events, tasks, decision points and sub-processes each carry a line anchor, or the reason
                  they have none.
                </li>
                <li>
                  Business names come from a model only with the engine&apos;s facts per element, swap in visibly and
                  carry the <CcProvenanceChip value="proposed" /> mark. Without facts, the engine&apos;s own label stays.
                </li>
                <li>
                  Object-oriented programs: classes, methods and a status field with its transitions read as the process;
                  technical methods fold into their caller.
                </li>
                <li>
                  Full screen with the step list, search and an <b>Edit</b> switch; every save is a new revision, the
                  reconstruction stays revision 1.
                </li>
                <li>
                  Export and import as standard BPMN 2.0 XML. Import into SAP Signavio is not verified; there is no
                  connection to a Signavio workspace.
                </li>
              </ul>
            </ForIt>
            <p className="linkrow">
              Deep dives: <TextLink href="/features/process-blueprints">Process blueprints</TextLink>
              <TextLink href="/abap-custom-code-analysis">ABAP code analysis</TextLink>
              <TextLink href="/features/extensibility-routing">Extensibility routing</TextLink>
              <TextLink href="/features/rap-cap-engine">RAP and CAP drafts</TextLink>
              <TextLink href="/features/modernization-assessment">Modernization assessment</TextLink>
              <TextLink href="/features/audit-evidence">Audit evidence</TextLink>
              <TextLink href="/features/cloudification-catalog">Cloudification catalog</TextLink>
            </p>
          </div>
        </section>

        {/* 2 · rules */}
        <section className="sec" id="rules" aria-labelledby="rules-title">
          <div className="wrap">
            <SectionHeader eyebrow="Rules in the code" title="Which business rules are hidden in the code?" titleId="rules-title">
              Limits, plants and tolerances written into a program decide real cases. Clean-Core.io lists each one with
              its line, so the business can say what still holds.
            </SectionHeader>
            <ForYou
              business="Answer each rule: keep, change, drop or clarify."
              it="Hard-coded literals, not customizing, with their line."
              management="Which decisions are the business's to make before a rebuild."
            />
            <div className="rules" role="list" aria-label="Three rules of the example, read from the code">
              {hero.rules.shown.map((r, i) => {
                const sentence = RULE_SENTENCES[r.label];
                return (
                  <div key={r.id} className="card rule" role="listitem" data-landing-rule={r.label}>
                    <div>
                      <p className="rt">{sentence?.text ?? r.plain}</p>
                      <p className="rm">
                        <span className="ln">L{r.line}</span>
                        <code>{r.label}</code>
                        <CcProvenanceChip value="reconstructed" />
                        {sentence && <span>{sentence.effect}</span>}
                      </p>
                    </div>
                    <RuleAnswer initial={i === 0 ? 'Keep' : i === 1 ? 'Clarify' : undefined} />
                  </div>
                );
              })}
            </div>
            <p className="honest">
              Three of the {hero.rules.total} rules the engine reads from the fictitious demo program. The answers here
              are only a picture; in the product they are recorded as the signed-in account — a self-declaration, not a
              mandate.
            </p>
            <p className="linkrow">
              <TextLink href={SHOWCASE}>See the rules in the demo →</TextLink>
            </p>
          </div>
        </section>

        {/* 3 · clean core */}
        <section className="sec alt" id="clean-core" aria-labelledby="cc-title">
          <div className="wrap">
            <SectionHeader eyebrow="SAP clean core" title="How far is it from a clean core, and where can it go?" titleId="cc-title">
              Clean core keeps SAP standard untouched: extensions use only what SAP releases for them. Clean-Core.io
              shows, object by object, how far a program is from that, and the route that fits.
            </SectionHeader>
            <ForYou
              business="Why an upgrade can hurt, in one sentence per part."
              it="Level A–D per SAP object from SAP's published data; the route with its reason."
              management="How much of it can stay, and what has to be rebuilt."
            />
            <div className="cc">
              <div className="card ladder" data-landing-ladder="">
                <h3>Four levels, the SAP objects of the example</h3>
                <p className="sub2">A is what SAP releases for extensions; D is what SAP advises against.</p>
                {ladder.map((step) => (
                  <div key={step.level} className="lv">
                    <CcCleanCoreLevel value={step.level} />
                    <div>
                      <b>
                        Level {step.level} · {CLEAN_CORE_LEVEL[step.level].label}
                      </b>
                      {step.objects.length === 0 ? (
                        <p>
                          {step.level === 'A'
                            ? 'Upgrade-stable. What a rebuild aims for. No object of the example is on A yet.'
                            : 'No object of the example on this level.'}
                        </p>
                      ) : (
                        step.objects.map((o) => (
                          <div key={o.code} className="obj">
                            {o.label && <span>{o.label}</span>}
                            {withPage.has(o.code) ? (
                              <Link href={catalogHref(o.code)}>
                                <code>{o.code}</code>
                              </Link>
                            ) : (
                              <code>{o.code}</code>
                            )}
                            <span className="ln">L{o.line}</span>
                            {o.source === 'catalog' ? <CcProvenanceChip value="imported" note="SAP release data" /> : <CcProvenanceChip value="reconstructed" />}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card routes">
                <h3>Where it can go</h3>
                <p className="sub2">The route follows the evidence. You choose; ATC stays the authority.</p>
                <div className="route">
                  <b>Key user tools</b>
                  <p>Small changes SAP&apos;s key user tools cover: custom fields, custom logic, custom CDS views. Each candidate with its limit.</p>
                </div>
                <div className={`route${DEMO_FIGURES.recommendedRoute.startsWith('In-App') ? ' ind' : ''}`}>
                  {DEMO_FIGURES.recommendedRoute.startsWith('In-App') && <span className="tag">indicated for the example</span>}
                  <b>In-app with ABAP Cloud</b>
                  <p>On the stack, with released APIs; a RAP draft as an abapGit package.</p>
                </div>
                <div className={`route${DEMO_FIGURES.recommendedRoute.startsWith('Side') ? ' ind' : ''}`}>
                  {DEMO_FIGURES.recommendedRoute.startsWith('Side') && <span className="tag">indicated for the example</span>}
                  <b>Side-by-side on {BTP}</b>
                  <p>Beside the core, on {BTP_FIRST}; a CAP draft.</p>
                </div>
              </div>
            </div>
            <ForIt title="Where the levels come from, and the free SAP object catalog">
              <ul>
                <li>
                  Levels are Clean-Core.io&apos;s versioned reading of the states SAP publishes in its Cloudification
                  Repository and object classification — an orientation, never part of a signed audit pack. Confirm with
                  ABAP Test Cockpit; import ATC results to compare them with the engine.
                </li>
                <li>
                  The free SAP object catalog shows each object&apos;s release state, level and successor, without an
                  account — {catalogObjects} classified, synced {facts.catalogSyncDate}.{' '}
                  <TextLink href="/catalog">Open the SAP object catalog →</TextLink>
                </li>
                <li>
                  Target platforms: SAP S/4HANA Cloud Public Edition (part of SAP Cloud ERP) keeps level A only; SAP Cloud
                  ERP Private keeps level A or B. Change the target and the page says what moved.
                </li>
              </ul>
            </ForIt>
            <p className="linkrow">
              <TextLink href="/clean-core-explained">Clean core, explained without the jargon →</TextLink>
              <TextLink href="/method/levels">How levels are assigned</TextLink>
              <TextLink href="/sap-clean-core-object-classification">Object classification A–D</TextLink>
              <TextLink href="/clean-core-score">Clean Core Score</TextLink>
              <TextLink href="/knowledge">Knowledge base</TextLink>
            </p>
          </div>
        </section>

        {/* 4 · decide */}
        <section className="sec" id="decide" aria-labelledby="decide-title">
          <div className="wrap">
            <SectionHeader eyebrow="The decision" title="What do we risk, and what do we decide?" titleId="decide-title">
              Keep it, rebuild it, move to SAP standard or retire it. Clean-Core.io gives an indication with its reasons —
              the decision stays yours.
            </SectionHeader>
            <ForYou
              business="The open questions that block a decision, in plain words."
              it="One rule per object decides its bucket; every assignment shows its evidence."
              management="Everything on one page: indication, risk, options, next steps."
            />
            <CaptureToCome
              name="Analyze, Management view: the decision on one page"
              shows={[
                'What the program is for, and the indication from the analysis — an indication, not a decision.',
                `Four figures: records it changes, ${DEMO_FIGURES.rulesRevealed} rules in the code, Clean Core Score ${DEMO_FIGURES.cleanCoreScore} of 100, how often it runs.`,
                'The options to decide on; effort only where Economics computes it with your own rates.',
              ]}
            />
            <ForIt title="Four buckets, one rule per object">
              <div className="buckets">
                {PUBLIC_CLOUD_FIT_BUCKETS.map((b) => (
                  <div key={b} className="card bucket">
                    <b>{PUBLIC_CLOUD_FIT_BUCKET_LABELS[b]}</b>
                    <p>{BUCKET_RULE[b]}</p>
                  </div>
                ))}
              </div>
              <p>The first rule that applies wins. Why 13 months: period-end and year-end programs run once a year.</p>
            </ForIt>
          </div>
        </section>

        {/* 5 · after the decision */}
        <section className="sec alt" id="after" aria-labelledby="after-title">
          <div className="wrap">
            <SectionHeader eyebrow="After the decision" title="What happens after the decision?" titleId="after-title">
              The same evidence carries on: a target design, a code draft, tests, documentation your company can use, the
              costs and a handover. Each tool produces something you can read and check.
            </SectionHeader>
            <ol className="stages" aria-label="The seven tools of a project">
              {PHASES.map((p, i) => (
                <li key={p.key} className={i === 0 ? 'cur' : undefined} data-landing-phase={p.key}>
                  <span className="no">{p.n}</span>
                  <span data-landing-phase-title="">{p.label}</span>
                </li>
              ))}
            </ol>
            <ForYou
              business="Documentation that answers first, ready for your own template."
              it="A RAP or CAP draft, test scenarios, an abapGit package."
              management="Costs only as a simulation on your own assumptions."
            />
            <div className="after">
              <CaptureToCome
                name="Documentation, Overview"
                shows={['The answer first, five tabs with counts, the process as tiles with their lines.', 'Export as the one primary action.']}
              />
              <div className="card limits">
                <h3>What it is, and what it is not</h3>
                <ul>
                  <li>
                    The code is a <b>draft for review</b>, not a finished product.
                  </li>
                  <li>CAP tests run in an isolated runner against mocks — not in your SAP system.</li>
                  <li>On the RAP track the tests are an ABAP Unit class for your own system; you record its result there.</li>
                  <li>
                    Costs appear only as a <CcProvenanceChip value="simulation" /> on your assumptions.
                  </li>
                  <li>A person signs the result, not the tool.</li>
                </ul>
                <p className="linkrow">
                  <TextLink href="/how-it-works">How it works, and its limits →</TextLink>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6 · evidence */}
        <section className="sec" id="evidence" aria-labelledby="evidence-title">
          <div className="wrap">
            <SectionHeader eyebrow="Evidence you can check" title="Can we check what it says?" titleId="evidence-title">
              Yes. Every statement says where it comes from, and every completed analysis is sealed as a signed run that
              anyone can verify — also years later, also outside the product.
            </SectionHeader>
            <ForYou
              business="What is read from the code, what AI wrote, what is still open."
              it="Signed runs and an audit pack with an offline verifier."
              management="A decision you can defend in an audit."
            />
            <div className="ev">
              <div className="card prov">
                <h3>Where a statement comes from</h3>
                <div className="prow">
                  <span>
                    <CcProvenanceChip value="reconstructed" />
                  </span>
                  <span>Read from the code by the engine, with its line.</span>
                </div>
                <div className="prow">
                  <span>
                    <CcProvenanceChip value="imported" />
                  </span>
                  <span>SAP&apos;s data, or your ATC and usage files.</span>
                </div>
                <div className="prow">
                  <span>
                    <CcProvenanceChip value="proposed" />
                  </span>
                  <span>Written by a model; marked until someone confirms it.</span>
                </div>
                <div className="prow">
                  <span>
                    <CcProvenanceChip value="not-determined" />
                  </span>
                  <span>The code cannot show it — said, not guessed.</span>
                </div>
                <div className="prow">
                  <span>
                    <CcProvenanceChip value="simulation" />
                  </span>
                  <span>Your assumptions, never passed off as fact.</span>
                </div>
              </div>
              <div className="card receipt" data-landing-reference="">
                <h3>
                  The reference run <CcProvenanceChip value="reconstructed" />
                </h3>
                <dl>
                  <dt>Program</dt>
                  <dd>
                    <code>{reference.fileName}</code> · {lines(reference.linesOfCode)} lines of code
                  </dd>
                  <dt>Findings</dt>
                  <dd>{reference.totalFindings} findings</dd>
                  <dt>Engine</dt>
                  <dd>deterministic · the same file gives the same result, computed when the page is built</dd>
                  <dt>In the product</dt>
                  <dd>every completed analysis is a signed run (HMAC); its audit pack is signed with HMAC and Ed25519 and verifies offline</dd>
                </dl>
                <ul className="bucket3">
                  {[reference.resolved, reference.decision, reference.handedBack].map((b) => (
                    <li key={b.label}>
                      <span className="c">{b.count}</span>
                      <div>
                        <b>{b.label}</b>
                        <p>{b.meaning}</p>
                        {b.uncalled > 0 && <p>{b.uncalled} of them in routines the program never calls.</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="note">
                  A signature proves where a run came from and that it is unchanged — not that it is right. A demo run is
                  never signed.
                </p>
              </div>
            </div>
            <ForIt title="The reference run in detail: the SAP objects it touched">
              <div data-landing-rollcall-card="">
                <p>
                  With the successor from SAP&apos;s own release data. Where the engine uses a curated field-level mapping
                  instead, the finding says so.
                </p>
                <ul className="roll" data-landing-rollcall="">
                  {reference.rollCall
                    .filter((o) => o.fromSapData && o.successor)
                    .slice(0, 8)
                    .map((o) => (
                      <li key={o.name}>
                        {withPage.has(o.name) ? <Link href={`/catalog/${objectToSlug(o.name)}`}>{o.name}</Link> : <span>{o.name}</span>}
                        <ArrowRight aria-hidden="true" />
                        <code>{o.successor}</code>
                      </li>
                    ))}
                </ul>
                {reference.businessDecisions[0] && (
                  <p className="honest">
                    One finding lands on the business: {reference.businessDecisions[0].title} (L
                    {reference.businessDecisions[0].lineStart}). The engine&apos;s recommendation, quoted unedited: &ldquo;
                    {reference.businessDecisions[0].recommendation}&rdquo;
                  </p>
                )}
              </div>
            </ForIt>
            <p className="linkrow">
              <TextLink href="/verify-pack">Verify an audit pack →</TextLink>
              <TextLink href="/reference-analysis">Open the reference run</TextLink>
            </p>
          </div>
        </section>

        {/* 7 · your code, and the facts for IT */}
        <section className="sec alt" id="for-it" aria-labelledby="forit-title">
          <div className="wrap">
            <SectionHeader eyebrow="Your code · for IT in depth" title="What happens to your code?" titleId="forit-title">
              It is stored in the EU, only you and the people you invite can open it, and it is never sold. Below, the
              facts IT asks for before anyone uploads a line.
            </SectionHeader>
            <ForYou
              business="Whether you may upload the program, and who will see it."
              it="What is deterministic, what a model writes, what leaves your system."
              management="Where the data lives and who answers for it, for your risk register."
            />
            {/* The trust lines verbatim from lib/trust-claims.ts, each with the document that says so. */}
            <ul className="trust3" data-landing-trust="">
              {[
                { title: 'Stored in the EU', claims: [trust('residency'), trust('tracking')] },
                { title: 'Only you, and whom you invite', claims: [trust('access')] },
                { title: 'Never sold; training under your key’s terms', claims: [trust('training'), trust('free')] },
              ].map((card) => (
                <li key={card.title} className="card">
                  <b>{card.title}</b>
                  {card.claims.map((c) => (
                    <p key={c.id}>{c.text}</p>
                  ))}
                  <p className="src">
                    {card.claims
                      .flatMap((c) => c.sources)
                      .map((s, k) => (
                        <span key={s.href + s.label}>
                          {k > 0 && ' · '}
                          <Link href={s.href}>{s.label}</Link>
                        </span>
                      ))}
                  </p>
                </li>
              ))}
            </ul>
            <div className="card itfacts">
              <h3>
                <span className="pill">For IT</span> The facts, precisely
              </h3>
              <p>Everything here is in the code, the Privacy Policy or SECURITY.md — follow the links.</p>
              <dl className="facts2">
                <div className="fx">
                  <dt>Engine first</dt>
                  <dd>
                    A deterministic ABAP engine reads the program before any model: findings at their line, the route, the
                    score. The engine itself calls no model.
                  </dd>
                </div>
                <div className="fx">
                  <dt>What a model writes</dt>
                  <dd>
                    Business names, text, designs and code drafts — marked <CcProvenanceChip value="proposed" />, and in
                    every exported artefact as a header comment and a metadata field.
                  </dd>
                </div>
                <div className="fx">
                  <dt>Line anchors</dt>
                  <dd>Every element of the map, every finding and every sentence of the text points to program, include and line, or says why it cannot.</dd>
                </div>
                <div className="fx">
                  <dt>Levels A–D</dt>
                  <dd>From SAP&apos;s Cloudification Repository and object classification, by a versioned rule. ATC stays the authority; import ATC results to compare.</dd>
                </div>
                <div className="fx">
                  <dt>Routes</dt>
                  <dd>Key user candidates, in-app with ABAP Cloud (RAP), side-by-side on {BTP} (CAP) — each with its reasons and limits.</dd>
                </div>
                <div className="fx">
                  <dt>Signed runs</dt>
                  <dd>Every completed analysis is an immutable run, signed by the server with HMAC. The audit pack exported from it is signed with HMAC and Ed25519 and verifies offline.</dd>
                </div>
                <div className="fx">
                  <dt>abapGit</dt>
                  <dd>Upload an abapGit package (your dictionary texts stay with the project); drafts leave as an abapGit package for ADT.</dd>
                </div>
                <div className="fx">
                  <dt>Model calls</dt>
                  <dd>Only through our server; keys never reach the browser. Platform model: Google Gemini.</dd>
                </div>
                <div className="fx">
                  <dt>Own key (BYOK)</dt>
                  <dd>
                    Your own Gemini key, stored encrypted; from 23 December 2026 also your own Claude key (Anthropic). The
                    provider bills you under your own agreement.
                  </dd>
                </div>
                <div className="fx">
                  <dt>What is kept</dt>
                  <dd>Your code and the generated artefacts, in the EU, until you delete them; backup copies age out within 30 days. Access logs as the Privacy Policy §9 says.</dd>
                </div>
                <div className="fx">
                  <dt>Open by design</dt>
                  <dd>
                    The source code is public, including the security rules (firestore.rules) and the security model in
                    SECURITY.md: <TextLink href={REPO}>github.com/sonnyfrenzel-rgb/clean-core.io</TextLink>.
                  </dd>
                </div>
                <div className="fx">
                  <dt>Not an SAP product</dt>
                  <dd>Independent, not affiliated with or endorsed by SAP SE.</dd>
                </div>
              </dl>
            </div>
            <ForIt title="Next to SAP's own tools">
              <div className="toolt" role="table" aria-label="SAP tools and how Clean-Core.io relates to them" data-landing-tools="">
                <div className="tr head" role="row">
                  <span role="columnheader">SAP tool</span>
                  <span role="columnheader">How Clean-Core.io relates</span>
                </div>
                {toolchainRows.map((row) => (
                  <div key={row.tool} className="tr" role="row">
                    <span role="rowheader">
                      <b>{row.tool}</b>
                      <small>{row.purpose}</small>
                    </span>
                    <span role="cell">{row.relation}</span>
                  </div>
                ))}
              </div>
            </ForIt>
            <div className="card itpath" data-landing-it-path="">
              <p>
                <b>See it with your own code: 3 steps.</b> Create a free account, upload a file or an abapGit package, and
                the process map appears first.
              </p>
              <AuthLink to="/admin/new-project/upload" variant="secondary" size="sm" testId="it-own-code">
                Analyse your own Z program
              </AuthLink>
            </div>
            <p className="linkrow">
              <TextLink href={SECURITY_MODEL_URL}>SECURITY.md on GitHub →</TextLink>
              <TextLink href={architectureUrl}>Architecture</TextLink>
              <TextLink href="/trust">Trust and privacy</TextLink>
            </p>
          </div>
        </section>

        {/* 8 · start */}
        <section className="sec" id="start" aria-labelledby="start-title">
          <div className="wrap">
            <SectionHeader eyebrow="Start · free" title="What does it cost, and how do we start?" titleId="start-title">
              Nothing. Watch the demo without an account; create a free account to analyse your own program.
            </SectionHeader>
            <ForYou
              business="Bring the Z program nobody can explain any more."
              it="A file, pasted code or an abapGit package; your own key after five runs."
              management="No contract and no payment; or send the demo to IT."
            />
            <div className="start">
              <ol className="card steps">
                <li>
                  <span className="no" aria-hidden="true">
                    1
                  </span>
                  <div>
                    <h3>{SHOWCASE_CTA}</h3>
                    <p>
                      One fictitious program, {DEMO_OBJECT_NAME}
                      {demoExample ? ` (${lines(demoExample.lines)} lines)` : ''}, read end to end. No account, nothing
                      saved, no AI call.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="no" aria-hidden="true">
                    2
                  </span>
                  <div>
                    <h3>Create a free account</h3>
                    <p>With Google, or with e-mail and password. No payment, no card.</p>
                  </div>
                </li>
                <li>
                  <span className="no" aria-hidden="true">
                    3
                  </span>
                  <div>
                    <h3>Bring your own Z program</h3>
                    <p>Upload a file or an abapGit package, or paste the code. The process map appears first.</p>
                  </div>
                </li>
              </ol>
              <div className="card price" data-testid="card-price">
                <h3>Free Community Edition</h3>
                <ul>
                  <li>
                    <Check aria-hidden="true" />
                    <span>
                      <b>Five free analysis runs</b> per account — once, not per month.
                    </span>
                  </li>
                  <li>
                    <Check aria-hidden="true" />
                    <span>
                      Each of the <b>{STARTER_EXAMPLES.length} examples</b> free the first time.
                    </span>
                  </li>
                  <li>
                    <Check aria-hidden="true" />
                    <span>Every tool and every view included.</span>
                  </li>
                  <li>
                    <Check aria-hidden="true" />
                    <span>
                      <b>No quota with your own key</b> — Google Gemini, or from 23 December 2026 Claude by Anthropic. The
                      provider bills it under your own agreement; we take no payment.
                    </span>
                  </li>
                </ul>
                <div className="full">
                  <AuthLink to="/dashboard" variant="primary" testId="start-own-code">
                    <span className="whitespace-normal">{DO_CTA}</span>
                  </AuthLink>
                  <Link href={SHOWCASE} className={publicButton('secondary')} data-cta-see="">
                    {SHOWCASE_CTA}
                  </Link>
                </div>
              </div>
            </div>
            <div className="card share">
              <p>
                <b>Not your decision alone?</b> Send the 4-minute demo on — it needs no account.
              </p>
              {/* mailto links and a copy button: nothing goes to our server. */}
              <div className="acts">
                <a className={publicButton('secondary', 'sm')} href={shareBody('it')}>
                  Send to your IT colleague
                </a>
                <a className={publicButton('secondary', 'sm')} href={shareBody('management')}>
                  Send to your manager
                </a>
                <CopyLinkButton url={`https://clean-core.io${SHOWCASE}`}>Copy the link</CopyLinkButton>
              </div>
            </div>
          </div>
        </section>

        {/* 9 · FAQ — the same list as the JSON-LD FAQPage above. */}
        <section className="sec alt" id="faq" aria-labelledby="faq-title">
          <div className="wrap">
            <SectionHeader eyebrow="FAQ" title="Questions people ask before they start" titleId="faq-title" />
            <div className="acc" data-landing-faq="">
              {LANDING_FAQ.map((f, i) => (
                <details key={f.q} open={i === 0} lang={f.lang}>
                  <summary>
                    <h3 data-faq-question="">{f.q}</h3>
                    <ChevronDown size={18} className="ch" aria-hidden="true" />
                  </summary>
                  <div className="a">
                    <p data-faq-answer="">{f.a}</p>
                    {f.more && (
                      <p>
                        <Link href={f.more.href}>{f.more.label}</Link>
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer — every page with search reach, the legal pages, the version. */}
      <footer id="site-footer" className="foot">
        <div className="wrap">
          <div className="foot-top">
            <p>Read the code before you decide.</p>
            <div className="cta-row">
              <Link href={SHOWCASE} className={publicButton('primary')} data-cta-see="">
                {SHOWCASE_CTA}
              </Link>
              <AuthLink to="/dashboard" variant="ghost" testId="footer-start">
                Start free
              </AuthLink>
            </div>
          </div>
          <nav className="foot-grid" aria-label="Footer">
            <div>
              <p className="brand">
                Clean-Core<em>.io</em>
              </p>
              <p className="blurb">
                A free community project for the SAP community: from a custom ABAP program nobody can explain to a
                decision with evidence.
              </p>
            </div>
            {SITE_FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="fk">{col.heading}</p>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                  {col.heading === 'Legal' && (
                    <li>
                      <a href={SECURITY_MODEL_URL} rel="noopener noreferrer" target="_blank">
                        SECURITY.md on GitHub
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </nav>
          <p className="disc">
            Generated output is a draft that you review, test and approve before any productive use (
            <Link href="/terms">Terms of Service</Link>). The platform is provided free of charge and without warranty.
          </p>
          <div className="disc">
            <SapTrademarkNotice />
          </div>
          <p className="copy">
            © 2026 Clean-Core.io · Version {APP_VERSION} · {APP_RELEASE_DATE}
          </p>
        </div>
      </footer>

      <Suspense fallback={null}>
        <LandingModalsLazy />
      </Suspense>
    </div>
  );
}
