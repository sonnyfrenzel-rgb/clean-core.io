import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  ArrowRight,
  Archive,
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  ChevronDown,
  Code2,
  EyeOff,
  FileCheck,
  Hammer,
  Info,
  Key,
  Layers,
  Link2,
  ListChecks,
  Lock,
  MapPin,
  RefreshCw,
  Server,
  Trash2,
  Users,
} from 'lucide-react';
import PublicHeader from '@/components/PublicHeader';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import LandingModals from '@/components/LandingModals';
import SectionHeader from '@/components/SectionHeader';
import { SITE_FOOTER_COLUMNS } from '@/components/SiteFooter';
import AuthLink from '@/components/landing/AuthLink';
import StageTimeline, { type TimelineStage } from '@/components/landing/StageTimeline';
import { publicButton } from '@/components/landing/public-button';
import HeroWorkspace from '@/components/landing/HeroWorkspace';
import BpmnPlaneSvg from '@/components/landing/BpmnPlaneSvg';
import ProcessMapPanel from '@/components/landing/ProcessMapPanel';
import CleanCoreSchema from '@/components/landing/CleanCoreSchema';
import ViewsStageCard, { type StageCardView } from '@/components/landing/ViewsStageCard';
import { LevelLadder, EvidenceStepper, ExamplePicker } from '@/components/landing/LandingPickers';
import CatalogLookup from '@/components/landing/CatalogLookup';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcCleanCoreLevel } from '@/components/cc/Identifier';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { getReferenceAnalysis } from '@/lib/reference-analysis';
import { getObjectDimensions } from '@/lib/abap/catalog-service';
import { getAllCatalogObjectNames, objectToSlug } from '@/lib/abap/catalog-index';
import { CLEAN_CORE_LEVEL } from '@/lib/clean-core-level';
import { PROVENANCE, type ProvenanceValue } from '@/lib/provenance';
import { PUBLIC_CLOUD_FIT_BUCKETS, PUBLIC_CLOUD_FIT_BUCKET_LABELS, PUBLIC_CLOUD_FIT_BUCKET_MEANINGS } from '@/lib/abap/public-cloud-fit';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { TRUST_CLAIMS, TRUST_PLEDGE, SECURITY_MODEL_URL, type TrustClaim } from '@/lib/trust-claims';
import { DEMO_OBJECT_NAME, DEMO_PROJECT_TITLE, DEMO_ROUTE, DEMO_SOURCE_FILE, DEMO_STRIP_NOTICE, DEMO_INVITATION } from '@/lib/demo-marks';
import { TOUR_STATIONS, TOUR_INVITATION_TITLE, TOUR_INVITATION_ACTION, tourPositionLabel } from '@/lib/demo-tour';
import { landingHero, landingProcess } from '@/lib/landing-process';
import { heroSnippets } from '@/lib/landing-hero';
import { STAGE_SHOT_CAPTION, STAGE_SHOT_SOURCE, landingShotSrc, stageShot } from '@/lib/landing-shots';
import { landingStages } from '@/lib/landing-stages';
import { landingShotSize } from '@/lib/landing-shot-size';
import { LANDING_FAQ } from '@/lib/landing-faq';
import '@/components/landing/landing.css';

/**
 * The public start page — roadmap 3.0.6, a faithful build of
 * `docs/roadmap/clean-core-landing-v3_0.html` (accepted 15.09.2026) on the
 * design tokens. Layout, density and behaviour are the mockup's; the styles are
 * its stylesheet moved onto tokens in `components/landing/landing.css`.
 *
 * Three rules hold the page together:
 *
 *   - **Every product picture is the product's own output.** The hero and the
 *     process section draw the BPMN the export writes for the shipped examples
 *     (`lib/landing-process.ts`); the seven stages are captures of the demo
 *     project or of a real run of the example, each captioned as such
 *     (`lib/landing-shots.ts`). Nothing is drawn for the page.
 *   - **Every figure and every claim is read, not typed.** Object counts from
 *     `lib/facts.ts`, the reference run from `lib/reference-analysis.ts`, levels
 *     and successors from the catalog at render time, provenance words from
 *     `lib/provenance.ts`, the four buckets from `lib/abap/public-cloud-fit.ts`,
 *     the trust lines from `lib/trust-claims.ts`, the tour from
 *     `lib/demo-tour.ts` — each of those has its own guard.
 *   - **One header.** Every section title comes from `SectionHeader`
 *     (`tests/landing-style-guard.spec.ts`).
 *
 * SAP BTP is called "SAP Business AI Platform (formerly SAP BTP)" at its first
 * mention and "BAIP" after it (roadmap 3.0.15). A quote of the engine's own
 * recommendation keeps the words the engine wrote.
 */
export const revalidate = 300;

/**
 * Title and description follow the searches that already reach this page
 * (roadmap 3.0.6: "SAP Clean Core Accelerator", "ABAP code analysis") and say
 * the approved USP. The description stays under ~160 characters so Google
 * shows it whole; the social card carries the full short USP.
 */
const HOME_TITLE = 'SAP Clean Core Accelerator — Free ABAP Analysis to BPMN | Clean-Core.io';
const HOME_SHARE_TITLE = 'Clean-Core.io — SAP Clean Core Accelerator for custom ABAP';
const HOME_SHARE_DESCRIPTION =
  'From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check. The process as BPMN with line anchors, SAP clean core level A–D per object, signed runs. Free for the SAP community.';

export const metadata: Metadata = withTwitterCard({
  title: HOME_TITLE,
  description:
    'Free SAP clean core tool: reads custom ABAP before any model does, draws its process as BPMN with line anchors, grades SAP objects A–D, drafts code and tests.',
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

/**
 * One real SAP object per level for the ladder, graded at render time. An
 * object is shown under a level only while the catalog still puts it there.
 */
const LEVEL_EXAMPLES: Array<{ name: string; note: string }> = [
  { name: 'I_SALESDOCUMENT', note: 'Released CDS view.' },
  { name: 'BAPI_PO_CREATE1', note: 'Classic BAPI SAP still recommends for classic ABAP.' },
  { name: 'REUSE_ALV_GRID_DISPLAY', note: 'An SAP object neither repository file lists — internal by default.' },
  { name: 'VBAK', note: 'Sales document table, not to be released.' },
];

/** Objects with a catalog page the lookup offers as a first click. */
const CATALOG_EXAMPLES = ['VBAK', 'BSEG', 'KNA1', 'CDHDR', 'DD07T'];
/** Objects the lookup's "Try" chips fill in. */
const LOOKUP_TRY = ['BAPI_PO_CREATE1', 'GUI_UPLOAD', 'BSEG'];

/** The icon a trust line carries — `lib/trust-claims.ts` keeps icons out of the claim. */
const TRUST_ICON: Record<TrustClaim['icon'], React.ReactNode> = {
  residency: <MapPin size={18} aria-hidden="true" />,
  access: <Lock size={18} aria-hidden="true" />,
  proxy: <Server size={18} aria-hidden="true" />,
  seal: <FileCheck size={18} aria-hidden="true" />,
  tracking: <EyeOff size={18} aria-hidden="true" />,
  erasure: <Trash2 size={18} aria-hidden="true" />,
  training: <Key size={18} aria-hidden="true" />,
  security: <BookOpen size={18} aria-hidden="true" />,
  free: <Users size={18} aria-hidden="true" />,
};

const BUCKET_ICON: Record<string, React.ReactNode> = {
  retire: <Archive size={18} aria-hidden="true" />,
  'no-catalogued-path': <Lock size={18} aria-hidden="true" />,
  rebuild: <Hammer size={18} aria-hidden="true" />,
  keep: <Check size={18} aria-hidden="true" />,
};

/** When an object lands in a bucket — `DESIGN.md` §5.6, as `lib/abap/public-cloud-fit.ts` checks it. */
const BUCKET_RULE: Record<string, string> = {
  retire:
    'The rule it serves is confirmed “Drop”, or a usage import shows no executions over at least 13 months — then it is a candidate, an open check, not a verdict.',
  'no-catalogued-path':
    'Needed, below the target platform’s bar, and SAP’s Cloudification Repository names no released API and no successor for it.',
  rebuild:
    'Needed, below the bar, and a successor or an extension path is named — and every modification or own write to an SAP table.',
  keep: 'Needed and permitted on the target platform: Public Edition level A only, Private Edition level A or B.',
};

const PROVENANCE_GROUPS: Array<{ form: string; meaning: string; values: ProvenanceValue[] }> = [
  { form: 'Filled', meaning: 'settled', values: ['proven', 'confirmed', 'stale'] },
  { form: 'Outline', meaning: 'derived or imported', values: ['reconstructed', 'imported', 'not-determined'] },
  { form: 'Dashed', meaning: 'provisional', values: ['proposed', 'simulation', 'demonstrated-mock'] },
];

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith('http');
  return external ? (
    <a href={href} className="textlink" rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} className="textlink">
      {children}
    </Link>
  );
}

const ARROW = <ArrowRight className="i" aria-hidden="true" />;

export default function Home() {
  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const reference = getReferenceAnalysis();
  const withPage = new Set(getAllCatalogObjectNames());
  const referenceExample = STARTER_EXAMPLES.find((e) => e.name === reference.fileName.replace(/(_\d+LOC)?\.abap$/i, '')) ?? STARTER_EXAMPLES[STARTER_EXAMPLES.length - 1];
  const lines = (n: number) => n.toLocaleString('en-US');
  const hero = landingHero(DEMO_SOURCE_FILE, DEMO_OBJECT_NAME);
  const heroData = heroSnippets(hero, DEMO_SOURCE_FILE);
  const referenceProcess = landingProcess(reference.fileName, reference.fileName.replace(/(_\d+LOC)?\.abap$/i, ''));
  const catalogHref = (name: string) => (withPage.has(name) ? `/catalog/${objectToSlug(name)}` : '/sap-clean-core-object-classification');
  const referenceTechnical = landingProcess(reference.fileName, referenceProcess.program, 'technical');
  // A phone reads the same levels top to bottom rather than scrolling sideways.
  const referenceVertical = {
    plain: landingProcess(reference.fileName, referenceProcess.program, 'plain', 'TB'),
    technical: landingProcess(reference.fileName, referenceProcess.program, 'technical', 'TB'),
  };

  /* The A–D ladder: each level with a real object the catalog puts there today. */
  const ladder = (['A', 'B', 'C', 'D'] as const).map((level) => {
    const example = LEVEL_EXAMPLES.find((e) => getObjectDimensions(e.name).graded.grade === level);
    const dims = example ? getObjectDimensions(example.name) : null;
    const predecessor = example
      ? ['VBAK', 'VBAP', 'MARA', 'KNA1'].find((t) => getObjectDimensions(t).successors.some((s) => s.name === example.name))
      : undefined;
    return {
      level,
      levelChip: <CcCleanCoreLevel value={level} />,
      label: CLEAN_CORE_LEVEL[level].label,
      detail: example ? (
        <>
          <div className="obj">
            <CcCleanCoreLevel value={level} />
            {withPage.has(example.name) ? (
              <Link href={catalogHref(example.name)}>
                <code>{example.name}</code>
              </Link>
            ) : (
              <code>{example.name}</code>
            )}
            <CcProvenanceChip value="imported" note="SAP release data" />
          </div>
          <p>
            {example.note}
            {predecessor ? (
              <>
                {' '}
                SAP&apos;s own release data names it as the successor of table <Link href={catalogHref(predecessor)}>{predecessor}</Link>.
              </>
            ) : dims?.releaseState ? (
              <> Release state in SAP&apos;s data: {dims.releaseState}.</>
            ) : null}
          </p>
        </>
      ) : (
        <p>No example object on this level in the catalog today.</p>
      ),
    };
  });

  /* The catalog lookup: real values for the objects this page carries. */
  const lookupNames = [...new Set([...CATALOG_EXAMPLES, ...LOOKUP_TRY])];
  const lookupHits = lookupNames.map((name) => {
    const d = getObjectDimensions(name);
    return {
      name,
      levelChip: <CcCleanCoreLevel value={d.graded.grade} />,
      state: d.releaseState ?? d.classificationState ?? 'not listed',
      successor: d.successors[0]?.name ?? null,
      href: catalogHref(name),
      hrefLabel: withPage.has(name) ? 'Open catalog page' : 'How objects are classified',
    };
  });

  /* The three views of one real rule of the demo: plant 1000 skips the limit check. */
  const plantRule = hero.rules.shown.find((r) => r.label.includes("'1000'")) ?? hero.rules.shown[0];
  const views: StageCardView[] = [
    {
      key: 'business',
      label: 'Business',
      question: 'Do I still need this?',
      answer: 'Requisitions for plant 1000 are approved without the limit check',
      detail: (
        <>
          <span className="tag">hard-coded in program</span>
          <span className="seg" aria-label="Rule decision: Keep, Change or Drop">
            <span>Keep</span>
            <span>Change</span>
            <span>Drop</span>
          </span>
        </>
      ),
    },
    {
      key: 'it',
      label: 'IT',
      question: 'What exactly, where to?',
      answer: 'Sets gv_skip_limit, and DECIDE_APPROVAL then leaves out CHECK_LIMIT',
      detail: (
        <>
          <code>{DEMO_OBJECT_NAME}</code>
          <span className="anc">L88</span>
          <span className="anc">L425</span>
          <span>a literal in the code, not customizing</span>
        </>
      ),
    },
    {
      key: 'management',
      label: 'Management',
      question: 'What do I risk, what do I decide?',
      answer: 'Not decided yet — keep, change or drop is yours',
      detail: (
        <>
          <span>Costs appear only as</span>
          <CcProvenanceChip value="simulation" note="your assumptions" />
        </>
      ),
    },
  ];

  /* The demo window: the real tour, at its third station. */
  const tourIndex = 2;
  const station = TOUR_STATIONS[tourIndex];
  const demoSteps = hero.process.planes[0].nodes
    .filter((n) => n.tag !== 'startEvent' && n.tag !== 'endEvent' && n.tag !== 'boundaryEvent' && n.anchor)
    .sort((a, b) => a.box.x - b.box.x)
    .slice(0, 4);

  /** The seven stages for the timeline: words from `lib/landing-stages.ts`, one capture each. */
  const stages: TimelineStage[] = landingStages().map((stage) => ({
    ...stage,
    src: landingShotSrc(stageShot(stage.key)),
    alt: `${stage.title} stage of ${STAGE_SHOT_SOURCE[stage.key] === 'run' ? 'a real run of the example program' : 'the demo project'} ${DEMO_OBJECT_NAME}: ${stage.shows}.`,
    caption: STAGE_SHOT_CAPTION[STAGE_SHOT_SOURCE[stage.key]],
    ...landingShotSize(stageShot(stage.key)),
  }));

  const examples = [...STARTER_EXAMPLES].sort((a, b) => (a.name === DEMO_OBJECT_NAME ? -1 : b.name === DEMO_OBJECT_NAME ? 1 : b.lines - a.lines));

  /**
   * The chain of evidence: process → design → code draft → tests → handover,
   * each with the provenance it really carries. Nothing here claims more than
   * `lib/landing-stages.ts` and `lib/evidence-chain.ts` say of the same stage.
   */
  const chainSteps: Array<{ key: string; t: string; d: string; pv: ProvenanceValue; mark: string; href: string }> = [
    { key: 'process', t: 'Process', d: `The business process as BPMN, read from the code. Every element points to its line, or says why it has none — the plant 1000 rule of the demo to L${plantRule.line}.`, pv: 'reconstructed', mark: 'line anchor', href: '#process' },
    { key: 'design', t: 'Design', d: 'A target design for the route the evidence points to, built on the run the server signed — a proposal until you record the target you accept.', pv: 'proposed', mark: 'run reference', href: '#stage-design' },
    { key: 'code', t: 'Code draft', d: 'The transformed code, generated from the source, the analysis and the design; its plan names every finding at its line. A draft you review, not a finished product.', pv: 'proposed', mark: 'line anchor', href: '#stage-transformation' },
    { key: 'tests', t: 'Tests', d: 'Test scenarios for the generated code, run in an isolated runner against mocks. The server records what ran, on which code.', pv: 'demonstrated-mock', mark: 'test receipt', href: '#stage-testing' },
    { key: 'handover', t: 'Handover', d: 'An audit pack the server signs over the run, with HMAC and Ed25519, that anyone can verify offline.', pv: 'proven', mark: 'signature', href: '#stage-delivery' },
  ];

  /**
   * The FAQ, once — `lib/landing-faq.ts`. The visible accordion, the JSON-LD
   * `FAQPage` and `/llms-full.txt` read the same list, so they cannot say
   * different things (roadmap 3.0.6).
   */
  const faq = LANDING_FAQ;

  /**
   * Where Clean-Core.io stands next to SAP's own tools. Defined once and
   * rendered once — a table on wide screens that stacks on a phone through CSS,
   * not a second copy (`tests/landing-consistency-guard.spec.ts`).
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
   * Structured data. Every sentence is one the page also says: the USP from
   * `llms.txt`, the FAQ from `lib/landing-faq.ts`, version and date from
   * `lib/version.ts`. No rating, no review, no figure typed in.
   */
  const schemaJson = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://clean-core.io/#organization',
        name: 'Clean-Core.io',
        url: 'https://clean-core.io',
        logo: 'https://clean-core.io/logo.png',
        description: 'An independent community project for the SAP community, not affiliated with or endorsed by SAP SE.',
        sameAs: ['https://github.com/sonnyfrenzel-rgb/clean-core.io', 'https://www.linkedin.com/company/clean-core-io'],
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
          'SAP clean core level A–D for every SAP object the code uses, read from SAP’s published Cloudification Repository',
          'Clean Core Score, 0–100, higher is better, in four bands — published by Clean-Core.io, not an SAP metric',
          'Business, IT and Management views of the same project',
          'Target design, transformed RAP or CAP code draft and test scenarios, run in an isolated runner against mocks',
          'Every completed analysis sealed as a signed run (HMAC); audit pack for handover signed over the run with HMAC and Ed25519',
          'Read access by invitation, bound to one confirmed e-mail address, until it is withdrawn; an invitation link nobody accepts expires',
          'Demo project with a guided tour',
          'Stored in the EU; no analytics, advertising or tracking cookies',
        ],
        screenshot: stages.slice(0, 3).map((st) => ({
          '@type': 'ImageObject',
          url: `https://clean-core.io${st.src}`,
          caption: st.alt,
        })),
        softwareVersion: APP_VERSION,
        datePublished: '2025-01-15',
        // Moves with every release instead of going stale at a typed date.
        dateModified: APP_RELEASE_DATE_ISO,
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://clean-core.io/#faq',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          ...(f.lang ? { inLanguage: f.lang } : {}),
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        // The start page is the root of the trail, so its trail is itself. The
        // earlier list of six pages described a hierarchy the site does not
        // have and would have shown as one under the start page's search result.
        '@type': 'BreadcrumbList',
        itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Clean-Core.io', item: 'https://clean-core.io' }],
      },
    ],
  };

  return (
    <div className="lp3 min-h-screen bg-cc-page text-cc-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }} />

      {/* The public header (block D, D.24): logo, the pages with search reach,
          and the sign-in button where it always was — `?auth=signin`. */}
      <PublicHeader signInHref="?auth=signin" />

      <main id="main">
        {/* 1 · hero */}
        <section className="hero" id="hero" aria-labelledby="hero-title">
          <div className="mesh" aria-hidden="true" />
          <div className="gridbg" aria-hidden="true" />
          <div className="wrap">
            <div className="hero-copy">
              <p className="kicker">
                <Users className="i" aria-hidden="true" />
                Free for the SAP Community
              </p>
              <h1 id="hero-title">
                <span className="h1k">SAP Clean Core Accelerator</span>
                <span className="h1m">From custom ABAP nobody understands to a reviewed, tested rebuild.</span>
              </h1>
              <p className="hero-lead">
                Clean-Core.io reads the program before any model does, draws the process it runs — and carries the same
                evidence on to a target design, a transformed code draft and tests in an isolated runner. Every step
                points to the line it came from; what a model suggested is marked; what could not be determined is said.
              </p>
              <div className="cta-row">
                <AuthLink to={DEMO_ROUTE} testId="hero-demo">
                  See the whole chain in the demo <ArrowRight size={18} aria-hidden="true" />
                </AuthLink>
                <Link href="#start" className={publicButton('secondary')}>
                  Start with your own code
                </Link>
              </div>
              {/* The chain of evidence, compact (owner's USP decision, 01.10.2026): five real links,
                  each to the place on this page that shows its step. The explanation stays in #what. */}
              <div className="hchain" data-hero-chain="">
                <p className="hchain-k" id="hchain-title">
                  One chain of evidence
                </p>
                <ol aria-labelledby="hchain-title">
                  {chainSteps.map((c, i) => (
                    <li key={c.key}>
                      <a href={c.href} data-hero-chain-step={c.key}>
                        <span className="no" aria-hidden="true">
                          {i + 1}
                        </span>
                        <span className="tx">
                          <span className="t">{c.t}</span>
                          <span className="m">{c.mark}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
              <p className="hlimits" data-hero-limits="">
                The code is a draft for review. Tests run in an isolated runner against mocks, not in your S/4HANA
                system. A signature proves where a run came from and that it is unchanged — not that it is right.
              </p>
              <p className="cta-note">
                Free for the SAP community. The demo project is waiting in your workspace after you sign in — nothing you do there is saved.
              </p>
              <p className="linkrow" style={{ justifyContent: 'center' }}>
                <TextLink href="/how-it-works">How it works, and its limits{ARROW}</TextLink>
                <TextLink href="/whitepaper">Read the whitepaper</TextLink>
              </p>
            </div>

            <figure className="hero-shot" aria-labelledby="shot-cap">
              <figcaption className="shot-cap" id="shot-cap">
                Demo project · fictitious code — hover or focus a line anchor or a step: its code line and its step light
                up together. Select one to keep it.
              </figcaption>
              <HeroWorkspace
                program={DEMO_OBJECT_NAME}
                title={DEMO_PROJECT_TITLE}
                rules={hero.rules}
                notDetermined={heroData.notDetermined}
                snippets={heroData.snippets}
                initial={heroData.initial}
                mapTitle={`The first steps of ${DEMO_OBJECT_NAME} as BPMN, reconstructed from the code`}
                mapNote="Excerpt · first steps"
                anchoredSentence={`${hero.process.anchored} of ${hero.process.flowNodes} elements of the whole program carry a line anchor.`}
                diagram={
                  <>
                    <div className="flow-wide">
                      <BpmnPlaneSvg
                        plane={hero.plane}
                        idPrefix="hero"
                        fit
                        maxHeight={520}
                        title={`The first steps of ${DEMO_OBJECT_NAME} as BPMN, reconstructed from the code: each step with the decisions in it that end the process. Every element carries its line anchor.`}
                      />
                    </div>
                    {/* A phone gets the same excerpt drawn narrow, at its own width, never scrolled sideways. */}
                    <div className="flow-narrow">
                      <BpmnPlaneSvg
                        plane={hero.planeNarrow}
                        idPrefix="hero-n"
                        fit
                        title={`The first steps of ${DEMO_OBJECT_NAME} as BPMN, reconstructed from the code. Every element carries its line anchor.`}
                      />
                    </div>
                  </>
                }
              />
            </figure>
          </div>
        </section>

        {/* 2 · what */}
        <section className="sec alt" id="what" aria-labelledby="what-title">
          <div className="wrap">
            <SectionHeader eyebrow="In one sentence" title="What is Clean-Core.io?" titleId="what-title">
              Other tools explain code, or rewrite it. Clean-Core.io does both — on one chain of evidence.
            </SectionHeader>
            {/* The contrast (owner's USP decision, 01.10.2026): categories only — what each kind of tool
                does, no names, nothing claimed about anyone else. */}
            <ul className="diff" data-landing-contrast="">
              {[
                {
                  icon: <BookOpen className="i" aria-hidden="true" />,
                  title: 'Tools that explain code',
                  text: 'Explain what a program does — in words, a summary or a diagram.',
                },
                {
                  icon: <RefreshCw className="i" aria-hidden="true" />,
                  title: 'Tools that rewrite code',
                  text: 'Produce new code from the old program.',
                },
              ].map((d) => (
                <li key={d.title} className="dcard">
                  <span className="ic">{d.icon}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                </li>
              ))}
              <li className="dcard us">
                <span className="ic">
                  <Link2 className="i" aria-hidden="true" />
                </span>
                <h3>Clean-Core.io</h3>
                <p>Explains, rebuilds, tests — one chain of evidence.</p>
                <p className="more">
                  Reads your code before any model does, so every finding points to a line. Says what it could not
                  determine, and never passes an assumption off as a fact.
                </p>
              </li>
            </ul>
            {/* The chain of evidence: one band, five steps, each with the mark that says where it
                stands — words from `lib/provenance.ts`. The hero carries the compact version. */}
            <div className="chain" data-landing-chain="">
              <h3>One chain of evidence</h3>
              <p className="sub2">
                Five steps on the same evidence. Each one says where it stands, and each points back to the line of
                code it came from.
              </p>
              <ol className="chain5">
                {chainSteps.map((c, i) => (
                  <li key={c.key} data-chain-step={c.key}>
                    <span className="no" aria-hidden="true">
                      {i + 1}
                    </span>
                    <h4>{c.t}</h4>
                    <p>{c.d}</p>
                    <p className="mark">
                      <CcProvenanceChip value={c.pv} />
                      <span className="tag">{c.mark}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <p className="honest">
                The code is a draft for review, not a finished product. The tests run in an isolated runner against
                mocks: they check the generated code against test scenarios, not that it runs in your S/4HANA system. A
                signature proves where a run came from and that it is unchanged — not that it is right.
              </p>
            </div>
            <p className="deep">
              Deep dives: <Link href="/abap-custom-code-analysis">ABAP code analysis</Link>
              <Link href="/features/extensibility-routing">Extensibility routing</Link>
              <Link href="/features/audit-evidence">Audit evidence</Link>
              <Link href="/features/modernization-assessment">Modernization assessment</Link>
              <Link href="/how-to">How-to guide</Link>
            </p>
          </div>
        </section>

        {/* 3 · views */}
        <section className="sec" id="views" aria-labelledby="views-title">
          <div className="wrap">
            <SectionHeader eyebrow="Three views" title="One case, three views" titleId="views-title">
              Business, IT and Management look at the same facts. Each view answers its own question — Do I still need
              this? What exactly, where to? What do I risk, what do I decide? — and none of them changes a result.
            </SectionHeader>
            <div className="three" data-views="">
              <div>
                <ViewsStageCard
                  views={views}
                  label={`Example · ${DEMO_PROJECT_TITLE} · fictitious code`}
                  fact={
                    <>
                      <span className="k">Rule {plantRule.id}</span> <code title={plantRule.label}>{plantRule.label.replace(/\b[a-z]{2}_[a-z0-9_]+-(?=[a-z])/g, '')}</code>
                      <span className="anc hot">L{plantRule.line}</span>
                    </>
                  }
                />
                <p className="vnote">
                  A view orders what you see. It is never stored with a project, a run, a signature or an audit pack, and
                  it changes no result. You confirm as the signed-in account — a self-declaration, not an organisational
                  mandate.
                </p>
              </div>
              <ul className="vlist">
                {[
                  {
                    icon: <Briefcase className="i" aria-hidden="true" />,
                    name: 'Business',
                    q: 'Do I still need this, and what changes for me?',
                    a: 'Opens with the process, its business rules — the hard-coded ones too — standard fit, and what could not be determined.',
                  },
                  {
                    icon: <Code2 className="i" aria-hidden="true" />,
                    name: 'IT',
                    q: 'What exactly, where to, and is it right?',
                    a: 'Opens with the findings at their line, the successor SAP names, and the chain from requirement to anchor, finding and target draft.',
                  },
                  {
                    icon: <BarChart3 className="i" aria-hidden="true" />,
                    name: 'Management',
                    q: 'What do I risk, what do I decide?',
                    a: 'Opens with what is backed by evidence, what stands in the way of a decision, the four buckets and the open decision — costs only as a simulation.',
                  },
                ].map((v, i) => (
                  <li key={v.name} data-view-item="" className={i === 0 ? 'cur' : undefined}>
                    <h3>
                      {v.icon}
                      {v.name}
                    </h3>
                    <p className="q">{v.q}</p>
                    <p className="a">{v.a}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4 · clean core */}
        <section className="sec alt" id="clean-core" aria-labelledby="cc-title">
          <div className="wrap">
            <SectionHeader eyebrow="SAP S/4HANA clean core" title="What does clean core mean?" titleId="cc-title">
              Clean core keeps SAP S/4HANA standard. Clean core extensibility means extensions use only released,
              upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP Business AI Platform (formerly
              SAP BTP).
            </SectionHeader>
            <div className="cc2">
              <div className="pcard">
                <h3>What clean core means</h3>
                <p className="t">
                  Keep the SAP core standard: extensions use only released, upgrade-stable interfaces — in-app with ABAP
                  Cloud or side-by-side on BAIP.
                </p>
                <CleanCoreSchema />
                <p className="linkrow">
                  <TextLink href="/clean-core-explained">Clean core, explained without the jargon{ARROW}</TextLink>
                  <TextLink href="/knowledge">Knowledge base</TextLink>
                </p>
              </div>
              <div className="pcard">
                <h3>The four levels</h3>
                <p className="sub2">Select a level to see what it means and a real SAP object on it.</p>
                <div data-landing-ladder="">
                  <LevelLadder items={ladder} />
                </div>
                <p className="honest">
                  Levels follow SAP&apos;s clean core level concept. The level shown for an object is our reading of
                  SAP&apos;s published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test
                  Cockpit.
                </p>
                <p className="linkrow">
                  <TextLink href="/method/levels">How levels are assigned</TextLink>
                  <TextLink href="/sap-clean-core-object-classification">Object classification A–D</TextLink>
                  <TextLink href="/clean-core-score">Clean Core Score — a grade, not a compliance percentage</TextLink>
                </p>
              </div>
            </div>
            <div className="pcard flowcard">
              <h3>Where the evidence comes from</h3>
              <p className="sub2">Select a station to see what it contributes.</p>
              <EvidenceStepper
                items={[
                  { key: 'source', t: 'Your ABAP source', d: 'Every statement keeps its program, include and line — that is what a line anchor points to. Includes that were not uploaded are named as not determined.', pv: 'reconstructed' as const },
                  { key: 'engine', t: 'Deterministic engine', d: 'Parses the code and finds the constructs, rules and SAP objects without a language model. The same file gives the same result.', pv: 'reconstructed' as const },
                  { key: 'sap', t: 'SAP’s published data', d: `The Cloudification Repository and SAP’s object classification, ${catalogObjects}, synced ${facts.catalogSyncDate}.`, pv: 'imported' as const },
                  { key: 'imports', t: 'Your imports, optional', d: 'ATC results and usage data you upload. They are marked as imported, never as proven.', pv: 'imported' as const },
                  { key: 'model', t: 'A language model', d: 'Business names and drafts come last and are marked as a model proposal until someone confirms them.', pv: 'proposed' as const },
                ].map((s) => ({
                  key: s.key,
                  title: s.t,
                  detail: (
                    <>
                      <div className="top">
                        <b>{s.t}</b>
                        <CcProvenanceChip value={s.pv} />
                      </div>
                      <p>{s.d}</p>
                    </>
                  ),
                }))}
              />
            </div>
          </div>
        </section>

        {/* 5 · catalog */}
        <section className="sec" id="catalog" aria-labelledby="catalog-title">
          <div className="wrap">
            <SectionHeader eyebrow="SAP Cloudification Repository viewer" title="Look up an SAP object's release state and successor" titleId="catalog-title">
              The SAP object catalog is a free viewer of SAP&apos;s Cloudification Repository and object classification:{' '}
              {catalogObjects} classified, each with release state, clean core level and successor, synced {facts.catalogSyncDate}.
            </SectionHeader>
            <div className="pcard lookup">
              <CatalogLookup hits={lookupHits} tryNames={LOOKUP_TRY} initial="VBAK" />
              <p className="lk-examples">
                Catalog pages:{' '}
                {CATALOG_EXAMPLES.filter((n) => withPage.has(n)).map((n, i) => (
                  <span key={n}>
                    {i > 0 && ' · '}
                    <Link href={`/catalog/${objectToSlug(n)}`}>{n}</Link>
                  </span>
                ))}
              </p>
              <p className="linkrow">
                <TextLink href="/catalog">Open the SAP object catalog{ARROW}</TextLink>
                <TextLink href="/catalog/browse/a">Browse A–Z</TextLink>
                <TextLink href="/catalog/module/mm">Materials Management</TextLink>
                <TextLink href="/sap-cloudification">SAP cloudification, explained</TextLink>
                <TextLink href="/features/cloudification-catalog">About the catalog</TextLink>
              </p>
            </div>
          </div>
        </section>

        {/* 6 · process */}
        <section className="sec alt" id="process" aria-labelledby="process-title">
          <div className="wrap">
            <SectionHeader eyebrow="From code to process" title="How is the process reconstructed from ABAP?" titleId="process-title">
              Clean-Core.io draws the process as BPMN from what the ABAP code does, puts a line anchor on every element, or the reason it has none,
              and names what the code cannot show instead of drawing it.
            </SectionHeader>
            <div className="lp-intro">
              <h3>Large processes stay readable</h3>
              <p>
                Levels instead of zoom: the map opens as an overview of phases. Open a phase in place, follow the path
                at the top, or read the same level as a list of steps. Try it on the {lines(referenceProcess.lines)}-line
                example — with the mouse, the keyboard, or as a list of steps.
              </p>
            </div>
            <ProcessMapPanel process={referenceProcess} technical={referenceTechnical} vertical={referenceVertical} title={referenceProcess.program} />
            <div className="feat4">
              {[
                { t: 'Every element points to its lines', d: 'Start and end events, tasks, decisions and sub-processes each carry a line anchor. Decisions keep their condition from the code; proposed lanes are marked as proposals, never as your organisation.' },
                { t: 'Business rules come out of the code', d: 'Literals in conditions — tolerances, plants, vendor lists, date limits — become rule candidates with their anchor. You keep, change or drop each one.' },
                { t: 'Unreached code is named, not drawn', d: 'Forms no entry point calls stay off the map and are listed underneath with their lines. Identical forms are grouped, technical helpers fold into their caller.' },
                { t: 'Leaves as a BPMN 2.0 XML file', d: 'Export the process as standard BPMN 2.0 XML; collapsed sub-processes stay real sub-processes. Import into SAP Signavio has not been verified yet. There is no connection to a Signavio workspace — only files.' },
              ].map((f) => (
                <div key={f.t} className="feat">
                  <h3>{f.t}</h3>
                  <p>{f.d}</p>
                </div>
              ))}
            </div>
            <p className="deep">
              Deep dives: <Link href="/features/process-blueprints">Process blueprints</Link>
              <Link href="/features/rap-cap-engine">RAP and CAP drafts</Link>
              <Link href="/features/cloudification-catalog">Cloudification catalog</Link>
            </p>
          </div>
        </section>

        {/* 7 · verify */}
        <section className="sec" id="verify" aria-labelledby="verify-title">
          <div className="wrap">
            <SectionHeader eyebrow="One reproducible run" title="Verify it yourself" titleId="verify-title">
              Run the published {lines(referenceExample.lines)}-line example and you get the same result: the engine is
              deterministic, the source file ships with the product, and every completed analysis is sealed as a signed run
              you can verify.
            </SectionHeader>
            <div className="refgrid">
              <div className="pcard" data-landing-reference="">
                <h3>The reference run</h3>
                <p className="sub2">
                  <code>{reference.fileName}</code>, analysed by the same engine the product uses, computed from the file when
                  the page is built.
                </p>
                <div className="bignum">
                  <div>
                    <b>{lines(reference.linesOfCode)}</b>lines of code
                  </div>
                  <div>
                    <b>{reference.totalFindings}</b>findings
                  </div>
                </div>
                <ul className="bucket3">
                  {[reference.resolved, reference.decision, reference.handedBack].map((b) => (
                    <li key={b.label}>
                      <span className="c">{b.count}</span>
                      <div>
                        <b>{b.label}</b>
                        <p>{b.meaning}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="linkrow">
                  <TextLink href="/reference-analysis">Open the reference run{ARROW}</TextLink>
                </p>
              </div>
              <div className="pcard">
                <h3>SAP objects this run touched</h3>
                <p className="sub2">
                  With the successor from SAP&apos;s own release data. Where the engine uses a curated field-level mapping
                  instead, the finding says so.
                </p>
                <ul className="roll" data-landing-rollcall="">
                  {reference.rollCall
                    .filter((o) => o.fromSapData && o.successor)
                    .slice(0, 8)
                    .map((o) => (
                      <li key={o.name}>
                        {withPage.has(o.name) ? <Link href={`/catalog/${objectToSlug(o.name)}`}>{o.name}</Link> : <span className="nm">{o.name}</span>}
                        <ArrowRight className="i" aria-hidden="true" />
                        <code>{o.successor}</code>
                      </li>
                    ))}
                </ul>
                {reference.businessDecisions[0] && (
                  <p className="honest">
                    One finding lands on the business: {reference.businessDecisions[0].title}{' '}
                    (L{reference.businessDecisions[0].lineStart}). The engine&apos;s recommendation, quoted unedited:
                    &ldquo;{reference.businessDecisions[0].recommendation}&rdquo;
                  </p>
                )}
              </div>
            </div>
            <ol className="verify3">
              <li>
                <b>1 · Import the draft</b>Import the generated abapGit package into Eclipse ADT.
              </li>
              <li>
                <b>2 · Compile and test</b>Compile the code and run the ABAP Unit tests in your own sandbox.
              </li>
              <li>
                <b>3 · Check the seal</b>Verify the signed audit pack — <TextLink href="/verify-pack">verify a pack</TextLink>.
              </li>
            </ol>
          </div>
        </section>

        {/* 8 · honest */}
        <section className="sec alt" id="honest" aria-labelledby="honest-title">
          <div className="wrap">
            <SectionHeader eyebrow="Honest by design" title="How do I know what is proven and what is not?" titleId="honest-title">
              Every statement carries its source as a word, an icon and a shape. Nothing simulated passes as proven:
              missing stays missing, simulated stays simulated, reconstructed stays reconstructed.
            </SectionHeader>
            <div className="hon">
              <div className="pcard">
                <h3>Where a statement comes from</h3>
                <p className="sub2">One fixed list. The shape says how firm a statement is.</p>
                {PROVENANCE_GROUPS.map((g) => (
                  <div key={g.form} className="pvgroup">
                    <p className="gk">
                      <span className="k">{g.form}</span>
                      <span>{g.meaning}</span>
                    </p>
                    {g.values.map((v) => (
                      <div key={v} className="pvrow">
                        <span>
                          <CcProvenanceChip value={v} />
                        </span>
                        <span>{PROVENANCE[v].meaning}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="pcard">
                <h3>Four buckets, one rule per object</h3>
                <p className="sub2">
                  The first rule that applies wins, and every assignment shows its evidence. The buckets depend on the
                  project&apos;s target platform.
                </p>
                {PUBLIC_CLOUD_FIT_BUCKETS.map((b, i) => (
                  <div key={b} className={`bucket${i === 0 ? ' first' : ''}`}>
                    <span className="bi">{BUCKET_ICON[b]}</span>
                    <div>
                      <h4>{PUBLIC_CLOUD_FIT_BUCKET_LABELS[b]}</h4>
                      <p>{BUCKET_RULE[b]}</p>
                      <p className="m">{PUBLIC_CLOUD_FIT_BUCKET_MEANINGS[b]}</p>
                      {b === 'retire' && (
                        <p className="why13">
                          <b>Why 13 months:</b> period-end and year-end programs run once a year, so a shorter usage
                          window never makes an object a retire candidate.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                <p className="honest">
                  The same level B object is Keep in Private Edition and Rebuild or {PUBLIC_CLOUD_FIT_BUCKET_LABELS['no-catalogued-path']} in Public
                  Edition. Change the target platform and the page says what moved.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 9 · toolchain — one array, one renderer; it stacks on a phone through CSS. */}
        <section className="sec" id="toolchain" aria-labelledby="tools-title">
          <div className="wrap">
            <SectionHeader eyebrow="Next to your SAP tools" title="Does it replace SAP's own tools?" titleId="tools-title">
              No. ABAP Test Cockpit stays the authoritative check, ADT stays where code is built and tested, and SAP&apos;s
              agents fix code inside your system; Clean-Core.io prepares the evidence and the decision around them.
            </SectionHeader>
            <div className="tools" role="table" aria-label="SAP tools and how Clean-Core.io relates to them" data-landing-tools="">
              <div className="tools-row head" role="row">
                <span role="columnheader">SAP tool</span>
                <span role="columnheader">What it is for</span>
                <span role="columnheader">How Clean-Core.io relates</span>
              </div>
              {toolchainRows.map((row) => (
                <div key={row.tool} className="tools-row" role="row">
                  <span role="rowheader">{row.tool}</span>
                  <span role="cell">
                    <span className="h">What it is for</span>
                    {row.purpose}
                  </span>
                  <span role="cell">
                    <span className="h">How Clean-Core.io relates</span>
                    {row.relation}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 10 · demo */}
        <section className="sec alt" id="demo" aria-labelledby="demo-title">
          <div className="wrap">
            <SectionHeader eyebrow="Demo project" title="Can I try it before I upload my own code?" titleId="demo-title">
              Yes. Every account has the same demo project: the engine&apos;s reading of the example{' '}
              {DEMO_OBJECT_NAME} on every stage — fictitious code, a guided tour, and nothing you do there is saved or counted.
            </SectionHeader>
            <div className="demo">
              <figure className="win" aria-label={`Preview: the demo project with the guided tour at station ${tourPositionLabel(tourIndex)}`}>
                <div className="wbar">
                  <span className="wlogo">
                    <span className="m">
                      <RefreshCw className="i" aria-hidden="true" />
                    </span>
                    <span>
                      Clean-Core<em>.io</em>
                    </span>
                  </span>
                  <span className="wpath">
                    My workspace <ArrowRight className="i" aria-hidden="true" /> <b>{DEMO_PROJECT_TITLE}</b>
                  </span>
                </div>
                <div className="wbody">
                  <div className="strip">
                    <Info className="i" aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 220 }}>
                      <b>{DEMO_STRIP_NOTICE}</b> <span className="u">{DEMO_INVITATION}</span>
                    </span>
                    <span className="wbtn">
                      <RefreshCw className="i" aria-hidden="true" />
                      Reset demo
                    </span>
                  </div>
                  <div className="demo-head">
                    <div>
                      <p className="w-eyebrow">Demo project</p>
                      <div className="w-title">
                        <p className="tt">{DEMO_PROJECT_TITLE}</p>
                        <span className="tag">Demo</span>
                      </div>
                    </div>
                    <span className="views" aria-label="View: Business">
                      <span className="on">Business</span>
                      <span>IT</span>
                      <span>Management</span>
                    </span>
                  </div>
                  <div className="nextin">
                    <ListChecks className="i" aria-hidden="true" />
                    <div style={{ minWidth: 0 }}>
                      <p className="k">At the end of the tour</p>
                      <p className="nt">{TOUR_INVITATION_TITLE}</p>
                    </div>
                    <span className="wbtn primary">{TOUR_INVITATION_ACTION}</span>
                  </div>
                  <div className="coachzone">
                    <div className="minimap" aria-label="Process steps">
                      {demoSteps.map((n, i) => (
                        <span key={n.id} style={{ display: 'contents' }}>
                          <span className={`mn${i === 2 ? ' sel' : ''}`}>
                            {n.name} <span className="a">L{n.anchor?.lineStart}</span>
                          </span>
                          <span className="mnar">{i < demoSteps.length - 1 ? '→' : '→ …'}</span>
                        </span>
                      ))}
                    </div>
                    <div className="coach" role="note">
                      <span className="cn">{tourPositionLabel(tourIndex)}</span>
                      <b>{station.title}</b>
                      <p>{station.body}</p>
                      <div className="ca">
                        <span className="wbtn">Next</span>
                        <span>Pause tour</span>
                        <span>End tour</span>
                      </div>
                    </div>
                  </div>
                </div>
              </figure>
              <div className="dside">
                <h3>What the tour walks through</h3>
                <ol className="stations">
                  {TOUR_STATIONS.map((s) => (
                    <li key={s.place}>{s.title}</li>
                  ))}
                </ol>
                <ul className="facts">
                  <li>
                    <RefreshCw className="i" aria-hidden="true" />
                    <span>Confirm, decide, filter and edit. The state lives only in your browser and is gone with “Reset demo”.</span>
                  </li>
                  <li>
                    <Check className="i" aria-hidden="true" />
                    <span>Nothing counts against your analysis runs, and a demo run is never signed.</span>
                  </li>
                  <li>
                    <Layers className="i" aria-hidden="true" />
                    <span>One demo for every account, rebuilt when the engine or its rules change — always on the current product.</span>
                  </li>
                </ul>
                <div className="dcta">
                  <AuthLink to={DEMO_ROUTE}>
                    Explore the demo <ArrowRight size={18} aria-hidden="true" />
                  </AuthLink>
                  <p>Needs a free account. The demo is the first row in My workspace.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/*
          The seven stages, as the tools of the workspace, and the way into them —
          not in the mockup; kept by Sonny's decision of 24.09.2026 as the place the
          seven stages are shown, each with a capture of the demo project.
        */}
        <section id="workspace-tools" aria-labelledby="workspace-tools-title" className="sec">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionHeader eyebrow="The seven stages" title="The tools in your workspace" titleId="workspace-tools-title">
              Behind the three views sit seven stages, each a tool you open from the workspace. Each one produces
              something you can read and check before the next — and a person signs the result, not the tool. The
              demo project walks through all of them with a guided tour.
            </SectionHeader>
          </div>
          <StageTimeline stages={stages} />
          <div className="mx-auto mt-10 max-w-7xl px-4 text-center sm:px-6">
            <AuthLink to={DEMO_ROUTE} testId="tools-demo">
              Take the tour in the demo <ArrowRight size={18} aria-hidden="true" />
            </AuthLink>
          </div>
        </section>

        {/* 11 · start */}
        <section className="sec" id="start" aria-labelledby="start-title">
          <div className="wrap">
            <SectionHeader eyebrow="Start · free" title="How do I start, and what does it cost?" titleId="start-title">
              Nothing — Clean-Core.io is free. Each of the {STARTER_EXAMPLES.length} examples runs once at no cost, your own
              code uses one of five free analysis runs, and after that you continue with your own Gemini API key.
            </SectionHeader>
            <ol className="steps3">
              {[
                { t: 'Create a free account', d: 'Sign up with Google or with e-mail and password. No payment, no card.' },
                { t: 'Open the demo, an example or your code', d: 'The engine reads the source first. The process, its rules and what could not be determined appear with line anchors.' },
                { t: 'Confirm and decide', d: 'Confirm the rules, decide per object and hand over. Every completed analysis is sealed as a signed, unchangeable run.' },
              ].map((s, i) => (
                <li key={s.t}>
                  <span className="no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="start3">
              <div className="pcard">
                <h3>Try an example</h3>
                <p className="sub2">{STARTER_EXAMPLES.length} fictitious programs. Select one to see what it shows.</p>
                <ExamplePicker
                  items={examples.map((e) => ({
                    key: e.name,
                    name: e.name,
                    meta: `${lines(e.lines)} · ${e.size}`,
                    detail: (
                      <>
                        <p className="nm">{e.name}</p>
                        <div className="meta">
                          <span className="tag">{lines(e.lines)} lines</span>
                          <span className="tag">{e.size}</span>
                          {e.name === DEMO_OBJECT_NAME && <span className="tag">basis of the demo project</span>}
                        </div>
                        <p>{e.summary}</p>
                        <p className="shows">Shows: {e.demonstrates}</p>
                        <p className="free">
                          <Check className="i" aria-hidden="true" />
                          <span>Free the first time you run it. Running it again uses one of your analysis runs — you are told before it starts.</span>
                        </p>
                        <div className="go">
                          <AuthLink to="/dashboard" variant="primary">
                            Open an example
                          </AuthLink>
                        </div>
                      </>
                    ),
                  }))}
                />
              </div>
              <div className="access">
                <div data-testid="card-sandbox" className="acard">
                  <span className="tag2">No API key needed</span>
                  <h3>Free Community Edition</h3>
                  <ul>
                    <li>
                      <ListChecks className="i" aria-hidden="true" />
                      <span>Five free analysis runs per account — once, not per month</span>
                    </li>
                    <li>
                      <Check className="i" aria-hidden="true" />
                      <span>Each example free the first time</span>
                    </li>
                    <li>
                      <Layers className="i" aria-hidden="true" />
                      <span>Every stage and every view included</span>
                    </li>
                  </ul>
                  <div className="full">
                    <AuthLink to="/dashboard" variant="secondary">
                      Get Started
                    </AuthLink>
                  </div>
                </div>
                <div data-testid="card-developer" className="acard key">
                  <span className="tag2">Your own Gemini key</span>
                  <h3>Free, with your own key</h3>
                  <ul>
                    <li>
                      <Key className="i" aria-hidden="true" />
                      <span>No quota on analysis runs</span>
                    </li>
                    <li>
                      <Lock className="i" aria-hidden="true" />
                      <span>Your key is stored encrypted and used only through our server</span>
                    </li>
                    <li>
                      <Info className="i" aria-hidden="true" />
                      <span>Google bills your key under your own agreement with Google</span>
                    </li>
                  </ul>
                  <div className="full">
                    <AuthLink to="/settings" variant="secondary">
                      Add Your Gemini Key
                    </AuthLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 12 · trust — the lines of `lib/trust-claims.ts`, each with the document that says so. */}
        <section className="sec alt" id="trust" aria-labelledby="trust-title">
          <div className="wrap">
            <SectionHeader eyebrow="Your code and your trust" title="Your data stays yours" titleId="trust-title">
              Your code is stored in the EU, reaches the Google Gemini API only through our server, and is never sold or
              commercially used. Each line below links to the document that says so.
            </SectionHeader>
            <div className="trust">
              <div className="pcard">
                <h3>What you confirm</h3>
                <p className="confirm">
                  {TRUST_PLEDGE.text} (
                  {TRUST_PLEDGE.sources.map((s, i) => (
                    <span key={s.href}>
                      {i > 0 && ', '}
                      <Link href={s.href}>{s.label}</Link>
                    </span>
                  ))}
                  )
                </p>
                <h3 className="h3gap">What we do so you can trust us</h3>
                <div data-landing-trust="">
                  {TRUST_CLAIMS.filter((c) => c.id !== 'free').map((c, i) => (
                    <div key={c.id} className={`tline${i === 0 ? ' first' : ''}`}>
                      <span className="ti">{TRUST_ICON[c.icon]}</span>
                      <div>
                        <p>{c.text}</p>
                        <p className="src">
                          {c.sources.map((s, k) => (
                            <span key={s.href + s.label}>
                              {k > 0 && ' · '}
                              {s.href.startsWith('http') ? (
                                <a href={s.href} rel="noopener noreferrer" target="_blank">
                                  {s.label}
                                </a>
                              ) : (
                                <Link href={s.href}>{s.label}</Link>
                              )}
                            </span>
                          ))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pcard freecard">
                <h3>A free community project</h3>
                {TRUST_CLAIMS.filter((c) => c.id === 'free').map((c) => (
                  <div key={c.id}>
                    <p className="big">{c.text}</p>
                    <p className="src">
                      {c.sources.map((s, k) => (
                        <span key={s.href + s.label}>
                          {k > 0 && ' · '}
                          <Link href={s.href}>{s.label}</Link>
                        </span>
                      ))}
                    </p>
                  </div>
                ))}
                <p className="honest">
                  Clean-Core.io is independent and not affiliated with or endorsed by SAP SE. Generated output is a draft
                  that you review before any productive use. The code of this product is public:{' '}
                  <a href="https://github.com/sonnyfrenzel-rgb/clean-core.io" rel="noopener noreferrer" target="_blank" className="textlink">
                    github.com/sonnyfrenzel-rgb/clean-core.io
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 13 · FAQ — the same list as the JSON-LD FAQPage above. */}
        <section className="sec" id="faq" aria-labelledby="faq-title">
          <div className="wrap">
            <SectionHeader eyebrow="FAQ" title="Questions people ask first" titleId="faq-title" />
            <div className="acc" data-landing-faq="">
              {faq.map((f, i) => (
                <details key={f.q} open={i === 0} lang={f.lang} className="acc-item">
                  <summary>
                    <h3 data-faq-question="">{f.q}</h3>
                    <span className="chev" aria-hidden="true">
                      <ChevronDown className="i" />
                    </span>
                  </summary>
                  <div className="acc-a">
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
              <AuthLink to={DEMO_ROUTE}>
                Explore the demo <ArrowRight size={18} aria-hidden="true" />
              </AuthLink>
              <Link href="/whitepaper" className={publicButton('ghost')}>
                Read the whitepaper
              </Link>
            </div>
          </div>
          <nav className="foot-grid4" aria-label="Footer">
            <div>
              <Link href="/" className="brand" aria-label="Clean-Core.io home">
                <span className="mark">
                  <RefreshCw className="i" aria-hidden="true" />
                </span>
                <span>
                  <span className="nm">
                    Clean-Core<em>.io</em>
                  </span>
                  <span className="sub">Free Community Edition · complementary to SAP tooling</span>
                </span>
              </Link>
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
        <LandingModals />
      </Suspense>
    </div>
  );
}
