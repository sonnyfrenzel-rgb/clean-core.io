import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import {
  ArrowRight,
  Archive,
  Check,
  CircleHelp,
  Code2,
  Eye,
  EyeOff,
  FileCheck,
  FileCode,
  Hammer,
  Key,
  Layers,
  Lock,
  MapPin,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Users,
  BookOpen,
  BarChart3,
  Briefcase,
  Menu,
  CircleSlash,
  RotateCw,
} from 'lucide-react';
import HeaderAuthButton from '@/components/HeaderAuthButton';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import LandingModals from '@/components/LandingModals';
import SectionHeader from '@/components/SectionHeader';
import SiteFooter from '@/components/SiteFooter';
import AuthLink from '@/components/landing/AuthLink';
import ViewsStage, { type StageView } from '@/components/landing/ViewsStage';
import StageTimeline, { type TimelineStage } from '@/components/landing/StageTimeline';
import { publicButton } from '@/components/landing/public-button';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { getFacts, formatObjectCount } from '@/lib/facts';
import { getReferenceAnalysis } from '@/lib/reference-analysis';
import { gradeSapObject } from '@/lib/abap/catalog-service';
import { getAllCatalogObjectNames, objectToSlug } from '@/lib/abap/catalog-index';
import { CLEAN_CORE_LEVEL } from '@/lib/clean-core-level';
import { PROVENANCE, type ProvenanceValue } from '@/lib/provenance';
import { PUBLIC_CLOUD_FIT_BUCKETS, PUBLIC_CLOUD_FIT_BUCKET_LABELS, PUBLIC_CLOUD_FIT_BUCKET_MEANINGS } from '@/lib/abap/public-cloud-fit';
import { STARTER_EXAMPLES } from '@/lib/starter-examples';
import { TRUST_CLAIMS, TRUST_PLEDGE, SECURITY_MODEL_URL, type TrustClaim } from '@/lib/trust-claims';
import { DEMO_OBJECT_NAME, DEMO_ROUTE } from '@/lib/demo-marks';
import { landingShotSrc, stageShot } from '@/lib/landing-shots';
import { landingStages } from '@/lib/landing-stages';
import { landingShotSize } from '@/lib/landing-shot-size';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';

/**
 * The public start page — roadmap 3.0.6, built along
 * `docs/roadmap/clean-core-landing-v3_0.html` (accepted 15.09.2026) and
 * `DESIGN.md`.
 *
 * Three rules hold the page together:
 *
 *   - **Every product view is the real workspace.** The pictures are captures of
 *     the demo project `Z_MM_PO_APPROVAL` (`lib/landing-shots.ts`, taken by
 *     `tests/capture-screens.spec.ts` with `CAPTURE_LANDING=1`), never a drawing.
 *   - **Every figure and every claim is read, not typed.** Object counts from
 *     `lib/facts.ts`, the reference run from `lib/reference-analysis.ts`, levels
 *     from the catalog at render time, provenance words from `lib/provenance.ts`,
 *     the four buckets from `lib/abap/public-cloud-fit.ts`, the trust lines from
 *     `lib/trust-claims.ts` — each of those has its own guard.
 *   - **One header.** Every section title comes from `SectionHeader`
 *     (`tests/landing-style-guard.spec.ts`).
 *
 * The pilot banner is gone: "Powered by Generative AI" is the kind of line
 * `DESIGN.md` §3.1 forbids. The transformation showroom is gone as well, and
 * did not move to /how-it-works (Sonny, 24.09.2026): drawn examples cannot be
 * the real workspace, so the page points into the demo with its tour instead
 * (section `#workspace-tools`).
 */
export const revalidate = 300;

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Accelerator — Free ABAP Code Analysis | Clean-Core.io',
  description:
    'Free community tool for SAP custom code: a deterministic ABAP static code analysis, the business process reconstructed from the code with a line anchor on every element, the SAP clean core Level A–D of each SAP object from the Cloudification Repository, and a signed run for every completed analysis.',
  alternates: {
    canonical: 'https://clean-core.io',
  },
  openGraph: {
    title: 'SAP Clean Core Accelerator | Clean-Core.io',
    description:
      'Understand a piece of custom ABAP and decide what happens to it. Every statement is tied to a line of your code; what could not be determined is said, not guessed. Free for the SAP community.',
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SAP Clean Core Accelerator | Clean-Core.io',
    description:
      'Understand a piece of custom ABAP and decide what happens to it. Every statement is tied to a line of your code; what could not be determined is said, not guessed. Free for the SAP community.',
  },
});

/** The navigation to the pages with search reach — header and phone menu read the same list. */
const NAV: Array<{ href: string; label: string }> = [
  { href: '/clean-core-explained', label: 'Clean Core Explained' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/sap-clean-core-object-classification', label: 'Classification A–D' },
  { href: '/catalog', label: 'SAP Object Catalog' },
  { href: '/knowledge', label: 'Knowledge Base' },
];

/**
 * Real SAP objects for each level, graded at render time. An example is shown
 * under a level only while the catalog still puts it there — a list typed next
 * to the ladder would drift the first time SAP reclassifies an object.
 */
const LEVEL_EXAMPLES: Array<{ name: string; note: string }> = [
  { name: 'I_PRODUCT', note: 'Released CDS view.' },
  { name: 'BAPI_PO_CREATE1', note: 'Classic BAPI SAP still recommends for classic ABAP.' },
  { name: 'REUSE_ALV_GRID_DISPLAY', note: 'An SAP object neither repository file lists — internal by default.' },
  { name: 'VBAK', note: 'Sales document table, not to be released; SAP names a successor.' },
];

/** Objects with a catalog page the lookup offers as a first click. */
const CATALOG_EXAMPLES = ['VBAK', 'BSEG', 'KNA1', 'CDHDR', 'DD07T'];

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
  'no-catalogued-path': <CircleSlash size={18} aria-hidden="true" />,
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

const PROVENANCE_CHIP: Record<string, string> = {
  filled: 'border',
  outline: 'border bg-white',
  dashed: 'border border-dashed bg-white',
};
const STATE_CHIP: Record<string, string> = {
  success: 'text-cc-success bg-cc-success-bg border-cc-success-border',
  information: 'text-cc-information bg-cc-information-bg border-cc-information-border',
  warning: 'text-cc-warning bg-cc-warning-bg border-cc-warning-line',
  neutral: 'text-cc-neutral bg-cc-neutral-bg border-cc-neutral',
  error: 'text-cc-error bg-cc-error-bg border-cc-error-border',
};
const LEVEL_CHIP: Record<CloudReadinessGrade, string> = {
  A: 'bg-cc-information-bg border-cc-information-border text-cc-information',
  B: 'bg-gray-100 border-gray-300 text-gray-700',
  C: 'bg-cc-warning-bg border-cc-warning-border text-cc-warning',
  D: 'bg-cc-error-bg border-cc-error-border text-cc-error',
  Unknown: 'bg-cc-neutral-bg border-cc-neutral-border text-cc-neutral',
};

function LevelChip({ grade }: { grade: CloudReadinessGrade }) {
  return (
    <span
      className={`inline-flex h-6 min-w-[26px] items-center justify-center rounded border px-1.5 text-[13px] font-semibold ${LEVEL_CHIP[grade]}`}
      aria-label={`Level ${CLEAN_CORE_LEVEL[grade].code}`}
    >
      {CLEAN_CORE_LEVEL[grade].code}
    </span>
  );
}

function ProvenanceWord({ value }: { value: ProvenanceValue }) {
  const p = PROVENANCE[value];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-px text-xs font-semibold leading-[18px] whitespace-nowrap ${PROVENANCE_CHIP[p.form]} ${STATE_CHIP[p.state]}`}
      data-provenance={value}
    >
      {p.label}
    </span>
  );
}

function Anchor({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-6 items-center rounded border border-cc-line bg-gray-100 px-1.5 font-cc-mono text-xs font-semibold text-gray-800">
      {children}
    </span>
  );
}

function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = href.startsWith('http');
  const cls =
    'inline-flex items-center gap-1 font-semibold text-cc-brand-strong underline decoration-green-300 underline-offset-4 hover:decoration-cc-brand-strong';
  return external ? (
    <a href={href} className={cls} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** A product picture in a window frame. The picture is always a capture, never a drawing. */
function Shot({ shot, alt, caption, priority = false }: { shot: Parameters<typeof landingShotSrc>[0]; alt: string; caption?: string; priority?: boolean }) {
  const size = landingShotSize(shot);
  return (
    <figure className="m-0">
      {caption && <figcaption className="mb-3 text-center text-sm font-medium text-cc-ink-muted">{caption}</figcaption>}
      <div className="overflow-hidden rounded-[20px] border border-gray-300 bg-white shadow-[0_24px_64px_rgb(11_28_48/0.10)]">
        <Image
          src={landingShotSrc(shot)}
          alt={alt}
          width={size.width}
          height={size.height}
          priority={priority}
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="h-auto w-full"
        />
      </div>
    </figure>
  );
}

const CARD = 'min-w-0 rounded-3xl border border-cc-line bg-cc-surface p-5 sm:p-8';

export default function Home() {
  const facts = getFacts();
  const catalogObjects = formatObjectCount(facts);
  const reference = getReferenceAnalysis();
  const withPage = new Set(getAllCatalogObjectNames());
  const referenceExample = STARTER_EXAMPLES.find((e) => e.name === reference.fileName.replace(/(_\d+LOC)?\.abap$/i, '')) ?? STARTER_EXAMPLES[STARTER_EXAMPLES.length - 1];
  const demoExample = STARTER_EXAMPLES.find((e) => e.name === DEMO_OBJECT_NAME);
  const lines = (n: number) => n.toLocaleString('en-US');

  const ladder = (['A', 'B', 'C', 'D'] as const).map((level) => ({
    level,
    label: CLEAN_CORE_LEVEL[level].label,
    examples: LEVEL_EXAMPLES.filter((e) => gradeSapObject(e.name).grade === level),
  }));

  const catalogExamples = CATALOG_EXAMPLES.filter((n) => withPage.has(n)).map((name) => ({
    name,
    grade: gradeSapObject(name),
    successor: reference.rollCall.find((o) => o.name === name && o.fromSapData)?.successor ?? null,
  }));

  const views: StageView[] = [
    {
      key: 'business',
      label: 'Business',
      question: 'Do I still need this, and what changes for me?',
      src: landingShotSrc('business'),
      alt: `Business view of the demo project ${DEMO_OBJECT_NAME}: the process, its rules hard-coded in the program with their line anchors, and what could not be determined.`,
      ...landingShotSize('business'),
    },
    {
      key: 'it',
      label: 'IT',
      question: 'What exactly, where to, and is it right?',
      src: landingShotSrc('it'),
      alt: `IT view of the demo project ${DEMO_OBJECT_NAME}: findings, the chain from requirement to anchor, finding and target draft, and the clean core levels across the findings.`,
      ...landingShotSize('it'),
    },
    {
      key: 'management',
      label: 'Management',
      question: 'What do I risk, what do I decide?',
      src: landingShotSrc('management'),
      alt: `Management view of the demo project ${DEMO_OBJECT_NAME}: what is backed by evidence, what stands in the way of a decision, and the four buckets.`,
      ...landingShotSize('management'),
    },
  ];

  /** The seven stages for the timeline: words from `lib/landing-stages.ts`, one capture each. */
  const stages: TimelineStage[] = landingStages().map((stage) => ({
    ...stage,
    src: landingShotSrc(stageShot(stage.key)),
    alt: `${stage.title} stage of the demo project ${DEMO_OBJECT_NAME}: ${stage.shows}.`,
    ...landingShotSize(stageShot(stage.key)),
  }));

  /**
   * The FAQ, once. The visible accordion and the JSON-LD `FAQPage` read this
   * list, so the two cannot say different things (roadmap 3.0.6).
   */
  const faq: Array<{ q: string; a: string; more?: { href: string; label: string }; lang?: string }> = [
    {
      q: 'What is SAP clean core?',
      a: 'Clean core keeps the SAP S/4HANA standard unmodified: extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP BTP. SAP’s clean core level concept grades what an extension uses from A (released APIs and extension points) to D (not recommended: modifications, implicit enhancements, writes to SAP tables).',
      more: { href: '/clean-core-explained', label: 'Clean core, explained without the jargon' },
    },
    {
      q: 'What does Clean-Core.io do with my ABAP?',
      a: 'A deterministic engine reads the program before any language model does. It reconstructs the business process with a line anchor on every element, lists the business rules hard-coded in the program, shows the clean core level of each SAP object the code uses, and names what it could not determine. Every completed analysis is sealed as a signed run. Generated code is a draft you review.',
      more: { href: '/how-it-works', label: 'How it works, and its limits' },
    },
    {
      q: 'Is my code used to train models?',
      a: TRUST_CLAIMS.find((c) => c.id === 'training')!.text,
      more: { href: '/datenschutz#source-code', label: 'Privacy Policy §3' },
    },
    {
      q: 'What does it cost?',
      a: 'Nothing. Clean-Core.io is a free community project with no paid tier, and we accept no payment. An account has five analysis runs; each starter example is free the first time you run it. After that you continue with your own Gemini API key, which Google bills under your own agreement with Google.',
    },
    {
      q: 'Does it replace ABAP Test Cockpit?',
      a: 'No. ABAP Test Cockpit stays the check to rely on. The level Clean-Core.io shows is its reading of SAP’s published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit, and import your ATC results to compare them with the engine.',
    },
    {
      q: 'Does it work with SAP Signavio?',
      a: 'Clean-Core.io exports the process as a standard BPMN 2.0 XML file. Import into SAP Signavio has not been verified yet, so we do not claim it, and there is no connection to a Signavio workspace.',
    },
    {
      q: 'What is the SAP Cloudification Repository viewer?',
      a: 'The SAP object catalog on Clean-Core.io shows SAP’s published Cloudification Repository and object classification: for each SAP object its release state, clean core level and, where SAP names one, its successor — synced from SAP’s public repository. It needs no account.',
      more: { href: '/catalog', label: 'Open the SAP object catalog' },
    },
    {
      q: 'Who can see my projects?',
      a: 'Only the account that created a project, and anyone that account invites. An invitation is bound to one confirmed e-mail address, gives read access including the source code, expires, and can be revoked at any time. There are no public links.',
    },
    {
      q: 'Can I try the demo without an account?',
      a: 'No. The demo project lives in your workspace, so it needs a free account. Inside it nothing you do is saved, and nothing counts against your analysis runs.',
    },
    {
      q: 'How does clean core reduce S/4HANA upgrade risk?',
      a: 'Custom code that reads or modifies the SAP standard directly is what makes an upgrade expensive: a modification has to be adjusted in SPAU before the upgrade can proceed, native SQL bypasses the database abstraction, and every direct table read relies on a structure SAP never promised to keep. Clean core replaces those with released APIs. Clean-Core.io names them in your own ABAP, object by object against SAP’s published Cloudification Repository, and flags what a generator cannot reach instead of transforming it into something plausible and wrong.',
    },
    {
      q: 'Wie reduziert Clean Core das Upgrade-Risiko in S/4HANA?',
      a: 'Teuer wird ein Upgrade durch Eigenentwicklungen, die direkt auf dem SAP-Standard lesen oder ihn modifizieren: Eine Modifikation muss in SPAU angepasst werden, bevor das Upgrade weiterlaufen kann, Native SQL umgeht die Datenbankabstraktion, und jeder direkte Tabellenzugriff baut auf einer Struktur, die SAP nie zugesagt hat. Clean Core ersetzt das durch freigegebene APIs. Clean-Core.io benennt sie in Ihrem eigenen ABAP, Objekt für Objekt gegen SAPs veröffentlichtes Cloudification Repository, und markiert, was ein Generator nicht erreicht, statt es in etwas Plausibles und Falsches zu überführen.',
      lang: 'de',
    },
    {
      q: 'Is Clean-Core.io an SAP product?',
      a: 'No. It is an independent community project, not affiliated with or endorsed by SAP SE. It follows SAP’s clean core level concept and reads SAP’s published Cloudification Repository.',
    },
  ];

  /**
   * Where Clean-Core.io stands next to SAP's own tools. Defined once and
   * rendered once — a table on wide screens that stacks on a phone through CSS,
   * not a second copy (`tests/landing-consistency-guard.spec.ts`).
   */
  const toolchainRows: Array<{ tool: string; purpose: string; relation: string }> = [
    {
      tool: 'ABAP Test Cockpit (ATC)',
      purpose: 'The authoritative check for clean core violations — keep using it.',
      relation: `Reads the same SAP Cloudification Repository (${catalogObjects} classified objects) and shows its reading as level A–D. Import ATC results to compare them with the engine.`,
    },
    {
      tool: 'ABAP Development Tools (ADT)',
      purpose: 'Where ABAP is developed, compiled and unit-tested; ABAP Unit and the CDS Test Double Framework are on board.',
      relation: 'Generated drafts arrive as an abapGit package that you import, compile and test there.',
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

  const schemaJson = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://clean-core.io/#organization',
        name: 'Clean-Core.io',
        url: 'https://clean-core.io',
        logo: 'https://clean-core.io/logo.png',
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
        '@type': 'SoftwareApplication',
        '@id': 'https://clean-core.io/#software',
        name: 'Clean-Core.io',
        url: 'https://clean-core.io',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'All',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description:
          'Free community tool for SAP custom code: deterministic ABAP static code analysis, the business process reconstructed from the code with line anchors, the SAP clean core Level A–D of each SAP object from the Cloudification Repository, and signed runs.',
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
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://clean-core.io' },
          { '@type': 'ListItem', position: 2, name: 'How It Works', item: 'https://clean-core.io/how-it-works' },
          { '@type': 'ListItem', position: 3, name: 'ABAP Analysis', item: 'https://clean-core.io/abap-custom-code-analysis' },
          { '@type': 'ListItem', position: 4, name: 'Clean Core Score', item: 'https://clean-core.io/clean-core-score' },
          { '@type': 'ListItem', position: 5, name: 'Knowledge Base', item: 'https://clean-core.io/knowledge' },
          { '@type': 'ListItem', position: 6, name: 'About', item: 'https://clean-core.io/about' },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-cc-page font-sans text-cc-ink">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:shadow-xl"
      >
        Skip to content
      </a>

      {/* Header — logo, the pages with search reach, and the sign-in button where it always was. */}
      <header className="sticky top-0 z-50 border-b border-cc-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Clean-Core.io home">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-cc-brand-surface text-cc-brand">
              <RotateCw size={20} aria-hidden="true" />
            </span>
            <span className="hidden flex-col min-[400px]:flex">
              <span className="text-base font-extrabold leading-tight tracking-[-0.02em] text-cc-ink sm:text-lg">
                Clean-Core<span className="text-cc-brand">.io</span>
              </span>
              <span className="text-xs font-semibold leading-tight text-cc-ink-muted">Free Community Edition</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap py-1.5 text-[15px] font-semibold text-cc-ink-muted hover:text-cc-ink">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <HeaderAuthButton />
            <details className="group relative lg:hidden">
              <summary
                aria-label="Menu"
                className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-cc-field-border bg-white text-cc-ink [&::-webkit-details-marker]:hidden"
              >
                <Menu size={18} aria-hidden="true" />
              </summary>
              <nav aria-label="Main" className="absolute right-0 top-12 hidden w-64 max-w-[calc(100vw-2rem)] rounded-2xl group-open:block border border-cc-line bg-white p-2 shadow-cc-dialog">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-cc-ink hover:bg-cc-surface-muted">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* 1 · hero */}
        <section id="hero" aria-labelledby="hero-title" className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              background:
                'radial-gradient(38% 42% at 10% 12%,#6366f1 0%,transparent 70%),radial-gradient(34% 40% at 90% 10%,#16a34a 0%,transparent 70%),radial-gradient(46% 40% at 55% 62%,#0d9488 0%,transparent 72%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.18] [mask-image:linear-gradient(#000,transparent_60%)]"
            style={{
              backgroundImage: 'linear-gradient(to right,#94a3b8 1px,transparent 1px),linear-gradient(to bottom,#94a3b8 1px,transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-cc-line bg-white px-3.5 py-1.5 text-sm font-semibold text-cc-ink-muted shadow-cc">
                <Users size={16} className="text-cc-brand-strong" aria-hidden="true" /> Free for the SAP Community
              </p>
              <h1 id="hero-title" className="mt-6 text-balance font-extrabold tracking-[-0.035em] text-cc-ink">
                <span className="block text-4xl leading-[1.05] sm:text-5xl md:text-[64px]">SAP Clean Core Accelerator</span>
                <span className="mt-3 block text-2xl leading-tight text-cc-ink-muted sm:text-3xl md:text-4xl">
                  Understand a piece of custom ABAP and decide what happens to it.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg font-medium leading-relaxed text-cc-ink-muted md:text-xl">
                Every statement is tied to a line of your code. Clean-Core.io reads the program before any model does,
                reconstructs the process it runs, and tells you what it could not determine.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <AuthLink to={DEMO_ROUTE} testId="hero-demo">
                  Explore the demo <ArrowRight size={18} aria-hidden="true" />
                </AuthLink>
                <Link href="#start" className={publicButton('secondary')}>
                  Start with your own code
                </Link>
              </div>
              <p className="mt-3.5 text-sm font-medium text-cc-ink-muted">
                Free for the SAP community. The demo project is waiting in your workspace after you sign in — nothing you do there is saved.
              </p>
              <p className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
                <TextLink href="/how-it-works">
                  How it works, and its limits <ArrowRight size={14} aria-hidden="true" />
                </TextLink>
                <TextLink href="/whitepaper">Read the whitepaper</TextLink>
              </p>
            </div>
            <div className="mx-auto mt-14 max-w-6xl">
              <Shot
                shot="hero"
                priority
                caption={`The demo project ${DEMO_OBJECT_NAME} in the workspace — fictitious code, captured from the product.`}
                alt={`The workspace with the demo project ${DEMO_OBJECT_NAME} open in the Business view: the demo notice, the title with its line count and catalog version, the three views, the seven stages as tools, and the first layer.`}
              />
            </div>
          </div>
        </section>

        {/* 2 · what */}
        <section id="what" aria-labelledby="what-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="In one sentence" title="What is Clean-Core.io?" titleId="what-title">
              Clean-Core.io is a free community tool for SAP custom code: a deterministic ABAP static code analysis reads
              your program, reconstructs its business process with a line anchor on every element, shows SAP&apos;s clean
              core level for each SAP object it uses, and seals every completed analysis as a signed run.
            </SectionHeader>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  icon: <FileCode size={20} aria-hidden="true" />,
                  title: 'Code first',
                  text: 'Reads your code before any model does. Every finding points to a line.',
                  links: [
                    { href: '/abap-custom-code-analysis', label: 'ABAP code analysis' },
                    { href: '/features/extensibility-routing', label: 'Extensibility routing' },
                  ],
                },
                {
                  icon: <CircleHelp size={20} aria-hidden="true" />,
                  title: 'Honest about limits',
                  text: 'Says what it could not determine — and never passes an assumption off as a fact.',
                  links: [
                    { href: '/features/audit-evidence', label: 'Audit evidence' },
                    { href: '/features/modernization-assessment', label: 'Modernization assessment' },
                  ],
                },
                {
                  icon: <Eye size={20} aria-hidden="true" />,
                  title: 'Three views',
                  text: 'One case, three views: Business, IT and Management see the same facts, each answering its own question.',
                  links: [
                    { href: '/how-it-works', label: 'How it works' },
                    { href: '/how-to', label: 'How-to guide' },
                  ],
                },
              ].map((d) => (
                <div key={d.title} className={CARD}>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-cc-brand-surface text-cc-brand-strong">{d.icon}</span>
                  <h3 className="mt-4 text-lg font-bold text-cc-ink">{d.title}</h3>
                  <p className="mt-2 text-base font-medium leading-relaxed text-cc-ink-muted">{d.text}</p>
                  <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {d.links.map((l) => (
                      <TextLink key={l.href} href={l.href}>
                        {l.label}
                      </TextLink>
                    ))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3 · views */}
        <section id="views" aria-labelledby="views-title" className="scroll-mt-20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Three views" title="One case, three views" titleId="views-title">
              Business, IT and Management look at the same facts. Each view answers its own question — Do I still need
              this? What exactly, where to? What do I risk, what do I decide? — and none of them changes a result.
            </SectionHeader>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
              <div>
                <ViewsStage views={views} />
                <p className="mt-4 text-sm font-medium leading-relaxed text-cc-ink-muted">
                  A view orders what you see. It is never stored with a project, a run, a signature or an audit pack, and
                  it changes no result. You confirm as the signed-in account — a self-declaration, not an organisational
                  mandate.
                </p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {[
                  {
                    icon: <Briefcase size={18} aria-hidden="true" />,
                    name: 'Business',
                    q: 'Do I still need this, and what changes for me?',
                    a: 'Opens with the process, its business rules — the hard-coded ones too — standard fit, and what could not be determined.',
                  },
                  {
                    icon: <Code2 size={18} aria-hidden="true" />,
                    name: 'IT',
                    q: 'What exactly, where to, and is it right?',
                    a: 'Opens with the findings at their line, the successor SAP names, and the chain from requirement to anchor, finding and target draft.',
                  },
                  {
                    icon: <BarChart3 size={18} aria-hidden="true" />,
                    name: 'Management',
                    q: 'What do I risk, what do I decide?',
                    a: 'Opens with what is backed by evidence, what stands in the way of a decision, the four buckets and the open decision — costs only as a simulation.',
                  },
                ].map((v) => (
                  <li key={v.name} className={CARD}>
                    <h3 className="flex items-center gap-2 text-base font-bold text-cc-ink">
                      <span className="text-cc-brand-strong">{v.icon}</span>
                      {v.name}
                    </h3>
                    <p className="mt-1 text-base font-semibold text-cc-ink">{v.q}</p>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-cc-ink-muted">{v.a}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4 · clean core */}
        <section id="clean-core" aria-labelledby="cc-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="SAP S/4HANA clean core" title="What does clean core mean?" titleId="cc-title">
              Clean core keeps SAP S/4HANA standard. Clean core extensibility means extensions use only released,
              upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP BTP.
            </SectionHeader>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">What clean core means</h3>
                <p className="mt-2 text-base font-medium leading-relaxed text-cc-ink-muted">
                  Keep the SAP core standard. An extension reaches it only through released interfaces:
                </p>
                <ol className="mt-4 flex list-none flex-col gap-3 p-0">
                  {[
                    { k: 'In-app', v: 'ABAP Cloud inside S/4HANA, against released APIs and extension points.', ok: true },
                    { k: 'Side-by-side', v: 'An application on SAP BTP that talks to S/4HANA through a released API.', ok: true },
                    { k: 'Modification', v: 'Changes SAP code. It has to be adjusted at every upgrade — what clean core avoids.', ok: false },
                  ].map((r) => (
                    <li key={r.k} className="flex gap-3 rounded-xl border border-cc-line bg-cc-surface-muted p-3.5">
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${r.ok ? 'bg-cc-information-bg text-cc-information' : 'bg-cc-error-bg text-cc-error'}`}>
                        {r.ok ? <Check size={14} aria-hidden="true" /> : <CircleSlash size={14} aria-hidden="true" />}
                      </span>
                      <span className="text-sm font-medium leading-relaxed text-cc-ink">
                        <b className="font-bold">{r.k}.</b> {r.v}
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <TextLink href="/clean-core-explained">
                    Clean core, explained without the jargon <ArrowRight size={14} aria-hidden="true" />
                  </TextLink>
                  <TextLink href="/knowledge">Knowledge base</TextLink>
                </p>
              </div>
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">The four levels</h3>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">Each with a real SAP object the catalog puts there today.</p>
                <ol className="mt-4 flex list-none flex-col gap-2.5 p-0" data-landing-ladder="">
                  {ladder.map((l) => (
                    <li key={l.level} className="rounded-xl border border-cc-line p-3.5">
                      <p className="flex items-center gap-2.5 text-sm font-semibold text-cc-ink">
                        <LevelChip grade={l.level} />
                        <span className="first-letter:uppercase">{l.label}</span>
                      </p>
                      {l.examples.map((e) => (
                        <p key={e.name} className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-cc-ink-muted">
                          {withPage.has(e.name) ? (
                            <Link href={`/catalog/${objectToSlug(e.name)}`} className="font-cc-mono font-semibold text-cc-ink underline underline-offset-4">
                              {e.name}
                            </Link>
                          ) : (
                            <code className="font-cc-mono font-semibold text-cc-ink">{e.name}</code>
                          )}
                          <span>{e.note}</span>
                          <ProvenanceWord value="imported" />
                        </p>
                      ))}
                    </li>
                  ))}
                </ol>
                <p className="mt-4 text-sm font-medium leading-relaxed text-cc-ink-muted">
                  Levels follow SAP&apos;s clean core level concept. The level shown for an object is our reading of
                  SAP&apos;s published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test
                  Cockpit.
                </p>
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <TextLink href="/method/levels">How levels are assigned</TextLink>
                  <TextLink href="/sap-clean-core-object-classification">Object classification A–D</TextLink>
                  <TextLink href="/clean-core-score">Clean Core Score — a grade, not a compliance percentage</TextLink>
                </p>
              </div>
            </div>
            <div className={`${CARD} mt-6`}>
              <h3 className="text-lg font-bold text-cc-ink">Where the evidence comes from</h3>
              <ol className="mt-4 grid list-none gap-3 p-0 md:grid-cols-5">
                {[
                  { t: 'Your ABAP source', d: 'Every statement keeps its program, include and line — that is what a line anchor points to. Includes that were not uploaded are named as not determined.', pv: 'reconstructed' as const },
                  { t: 'Deterministic engine', d: 'Parses the code and finds the constructs, rules and SAP objects without a language model. The same file gives the same result.', pv: 'reconstructed' as const },
                  { t: 'SAP’s published data', d: `The Cloudification Repository and SAP’s object classification, ${catalogObjects} objects, synced ${facts.catalogSyncDate}.`, pv: 'imported' as const },
                  { t: 'Your imports, optional', d: 'ATC results and usage data you upload. They are marked as imported, never as proven.', pv: 'imported' as const },
                  { t: 'A language model', d: 'Business names and drafts come last and are marked as a model proposal until someone confirms them.', pv: 'proposed' as const },
                ].map((s, i) => (
                  <li key={s.t} className="rounded-xl border border-cc-line bg-cc-surface-muted p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-cc-ink">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-cc-ink text-xs font-bold text-white">{i + 1}</span>
                      {s.t}
                    </p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-cc-ink-muted">{s.d}</p>
                    <p className="mt-2">
                      <ProvenanceWord value={s.pv} />
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* 5 · catalog */}
        <section id="catalog" aria-labelledby="catalog-title" className="scroll-mt-20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="SAP Cloudification Repository viewer" title="Look up an SAP object's release state and successor" titleId="catalog-title">
              The SAP object catalog is a free viewer of SAP&apos;s Cloudification Repository and object classification:{' '}
              {catalogObjects} classified objects with release state, clean core level and successor, synced {facts.catalogSyncDate}.
            </SectionHeader>
            <div className={`${CARD} mx-auto max-w-5xl`}>
              <form role="search" action="/catalog" method="get">
                <label htmlFor="landing-lookup" className="text-sm font-semibold text-cc-ink">
                  SAP object name
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="landing-lookup"
                    name="q"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="for example VBAK or BAPI_PO_CREATE1"
                    className="min-h-12 flex-1 rounded-full border border-cc-field-border bg-white px-5 font-cc-mono text-base text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
                  />
                  <button type="submit" className={publicButton('secondary')}>
                    <Search size={18} aria-hidden="true" /> Look up
                  </button>
                </div>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">Tables, CDS views, BAPIs, function modules and classes.</p>
              </form>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <caption className="sr-only">Example objects from the catalog</caption>
                  <thead>
                    <tr className="border-b border-cc-line text-xs font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">
                      <th scope="col" className="py-2 pr-4">Object</th>
                      <th scope="col" className="py-2 pr-4">Level</th>
                      <th scope="col" className="py-2 pr-4">Release state</th>
                      <th scope="col" className="py-2">Successor SAP names</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogExamples.map((o) => (
                      <tr key={o.name} className="border-b border-cc-line last:border-0">
                        <td className="py-2.5 pr-4">
                          <Link href={`/catalog/${objectToSlug(o.name)}`} className="font-cc-mono font-semibold text-cc-ink underline underline-offset-4">
                            {o.name}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4">
                          <LevelChip grade={o.grade.grade} />
                        </td>
                        <td className="py-2.5 pr-4 font-medium text-cc-ink-muted">{o.grade.state ?? 'not listed'}</td>
                        <td className="py-2.5 font-cc-mono text-cc-ink">{o.successor ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <TextLink href="/catalog">
                  Open the SAP object catalog <ArrowRight size={14} aria-hidden="true" />
                </TextLink>
                <TextLink href="/catalog/browse/a">Browse A–Z</TextLink>
                <TextLink href="/catalog/module/mm">Materials Management</TextLink>
                <TextLink href="/sap-cloudification">SAP cloudification, explained</TextLink>
                <TextLink href="/features/cloudification-catalog">About the catalog</TextLink>
              </p>
            </div>
          </div>
        </section>

        {/* 6 · process */}
        <section id="process" aria-labelledby="process-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="From code to process" title="How is the process reconstructed from ABAP?" titleId="process-title">
              Clean-Core.io draws the process as BPMN from what the ABAP code does, puts a line anchor on every element,
              and names what the code cannot show instead of drawing it.
            </SectionHeader>
            <Shot
              shot="process"
              caption={`The process map of the demo project, one level down — captured from the workspace.`}
              alt={`The process map of ${DEMO_OBJECT_NAME} opened at one sub-process: levels and outline on the left, the BPMN diagram in the middle, path and overlay filters above it, and the count of elements that carry a line anchor.`}
            />
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {[
                { t: 'Every element points to its lines', d: 'Start and end events, tasks, decisions and sub-processes each carry a line anchor. Decisions keep their condition from the code; proposed lanes are marked as proposals, never as your organisation.' },
                { t: 'Business rules come out of the code', d: 'Literals in conditions — tolerances, plants, vendor lists, date limits — become rule candidates with their anchor. You keep, change or drop each one.' },
                { t: 'Large processes stay readable', d: 'Levels instead of zoom: the map opens as an overview, a sub-process opens in place, and the same content is available as a list of steps.' },
                { t: 'Leaves as a BPMN 2.0 XML file', d: 'Export the process as standard BPMN 2.0 XML; collapsed sub-processes stay real sub-processes. There is no connection to a Signavio workspace.' },
              ].map((f) => (
                <div key={f.t} className={CARD}>
                  <h3 className="text-base font-bold text-cc-ink">{f.t}</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-cc-ink-muted">{f.d}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
              <span className="font-medium text-cc-ink-muted">Deep dives:</span>
              <TextLink href="/features/process-blueprints">Process blueprints</TextLink>
              <TextLink href="/features/rap-cap-engine">RAP and CAP drafts</TextLink>
              <TextLink href="/features/cloudification-catalog">Cloudification catalog</TextLink>
            </p>
          </div>
        </section>

        {/* 7 · verify */}
        <section id="verify" aria-labelledby="verify-title" className="scroll-mt-20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="One reproducible run" title="Verify it yourself" titleId="verify-title">
              Run the published {lines(referenceExample.lines)}-line example and you get the same result: the engine is
              deterministic, the source file ships with the product, and every completed analysis is sealed as a signed run
              you can verify.
            </SectionHeader>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={CARD} data-landing-reference="">
                <h3 className="text-lg font-bold text-cc-ink">The reference run</h3>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">
                  <code className="break-all font-cc-mono">{reference.fileName}</code>, analysed by the same engine the product uses,
                  computed from the file when the page is built.
                </p>
                <div className="mt-5 flex flex-wrap gap-8">
                  <p className="text-sm font-medium text-cc-ink-muted">
                    <b className="block text-4xl font-extrabold tracking-[-0.02em] text-cc-ink">{lines(reference.linesOfCode)}</b>
                    lines of code
                  </p>
                  <p className="text-sm font-medium text-cc-ink-muted">
                    <b className="block text-4xl font-extrabold tracking-[-0.02em] text-cc-ink">{reference.totalFindings}</b>
                    findings
                  </p>
                </div>
                <ul className="mt-5 flex list-none flex-col gap-3 p-0">
                  {[reference.resolved, reference.decision, reference.handedBack].map((b) => (
                    <li key={b.label} className="flex gap-4 rounded-xl border border-cc-line bg-cc-surface-muted p-3.5">
                      <span className="w-10 shrink-0 text-2xl font-extrabold text-cc-ink">{b.count}</span>
                      <span>
                        <b className="text-sm font-bold text-cc-ink">{b.label}</b>
                        <span className="mt-0.5 block text-sm font-medium leading-relaxed text-cc-ink-muted">{b.meaning}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm">
                  <TextLink href="/reference-analysis">
                    Open the reference run <ArrowRight size={14} aria-hidden="true" />
                  </TextLink>
                </p>
              </div>
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">SAP objects this run touched</h3>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">
                  With the successor from SAP&apos;s own release data. Where the engine uses a curated field-level mapping
                  instead, the finding says so.
                </p>
                <ul className="mt-4 flex list-none flex-col gap-2 p-0" data-landing-rollcall="">
                  {reference.rollCall
                    .filter((o) => o.fromSapData && o.successor)
                    .slice(0, 8)
                    .map((o) => (
                      <li key={o.name} className="flex flex-wrap items-center gap-2 text-sm">
                        {withPage.has(o.name) ? (
                          <Link href={`/catalog/${objectToSlug(o.name)}`} className="font-cc-mono font-semibold text-cc-ink underline underline-offset-4">
                            {o.name}
                          </Link>
                        ) : (
                          <code className="font-cc-mono font-semibold text-cc-ink">{o.name}</code>
                        )}
                        <ArrowRight size={14} className="text-cc-ink-muted" aria-hidden="true" />
                        <code className="font-cc-mono text-cc-ink">{o.successor}</code>
                      </li>
                    ))}
                </ul>
                {reference.businessDecisions[0] && (
                  <p className="mt-5 text-sm font-medium leading-relaxed text-cc-ink-muted">
                    One finding lands on the business: {reference.businessDecisions[0].title}{' '}
                    <Anchor>L{reference.businessDecisions[0].lineStart}</Anchor>. The engine&apos;s recommendation, quoted
                    unedited: &ldquo;{reference.businessDecisions[0].recommendation}&rdquo;
                  </p>
                )}
              </div>
            </div>
            <ol className="mt-6 grid list-none gap-4 p-0 md:grid-cols-3">
              <li className={CARD}>
                <b className="block text-base font-bold text-cc-ink">1 · Import the draft</b>
                <span className="mt-1 block text-sm font-medium text-cc-ink-muted">Import the generated abapGit package into Eclipse ADT.</span>
              </li>
              <li className={CARD}>
                <b className="block text-base font-bold text-cc-ink">2 · Compile and test</b>
                <span className="mt-1 block text-sm font-medium text-cc-ink-muted">Compile the code and run the ABAP Unit tests in your own sandbox.</span>
              </li>
              <li className={CARD}>
                <b className="block text-base font-bold text-cc-ink">3 · Check the seal</b>
                <span className="mt-1 block text-sm font-medium text-cc-ink-muted">
                  Verify the signed audit pack — <TextLink href="/verify-pack">verify a pack</TextLink>.
                </span>
              </li>
            </ol>
          </div>
        </section>

        {/* 8 · honest */}
        <section id="honest" aria-labelledby="honest-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Honest by design" title="How do I know what is proven and what is not?" titleId="honest-title">
              Every statement carries its source as a word and a shape. Nothing simulated passes as proven: missing stays
              missing, simulated stays simulated, reconstructed stays reconstructed.
            </SectionHeader>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">Where a statement comes from</h3>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">One fixed list. The shape says how firm a statement is.</p>
                {PROVENANCE_GROUPS.map((g) => (
                  <div key={g.form} className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">
                      {g.form} · {g.meaning}
                    </p>
                    <ul className="mt-2 flex list-none flex-col gap-2 p-0">
                      {g.values.map((v) => (
                        <li key={v} className="grid grid-cols-[150px_minmax(0,1fr)] items-start gap-3 text-sm">
                          <span>
                            <ProvenanceWord value={v} />
                          </span>
                          <span className="font-medium text-cc-ink-muted">{PROVENANCE[v].meaning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">Four buckets, one rule per object</h3>
                <p className="mt-2 text-sm font-medium text-cc-ink-muted">
                  The first rule that applies wins, and every assignment shows its evidence. The buckets depend on the
                  project&apos;s target platform.
                </p>
                <ul className="mt-4 flex list-none flex-col gap-3 p-0">
                  {PUBLIC_CLOUD_FIT_BUCKETS.map((b) => (
                    <li key={b} className="flex gap-3 rounded-xl border border-cc-line bg-cc-surface-muted p-3.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-cc-ink">{BUCKET_ICON[b]}</span>
                      <span>
                        <b className="text-sm font-bold text-cc-ink">{PUBLIC_CLOUD_FIT_BUCKET_LABELS[b]}</b>
                        <span className="mt-0.5 block text-sm font-medium leading-relaxed text-cc-ink">{BUCKET_RULE[b]}</span>
                        <span className="mt-0.5 block text-sm font-medium leading-relaxed text-cc-ink-muted">{PUBLIC_CLOUD_FIT_BUCKET_MEANINGS[b]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm font-medium leading-relaxed text-cc-ink-muted">
                  <b className="font-bold text-cc-ink">Why 13 months:</b> period-end and year-end programs run once a year,
                  so a shorter usage window never makes an object a retire candidate. The same level B object is Keep in
                  Private Edition and Rebuild or No catalogued path in Public Edition.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 9 · toolchain */}
        <section id="toolchain" aria-labelledby="tools-title" className="scroll-mt-20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Next to your SAP tools" title="Does it replace SAP's own tools?" titleId="tools-title">
              No. ABAP Test Cockpit stays the authoritative check and ADT stays where code is built and tested;
              Clean-Core.io prepares the evidence and the decision around them.
            </SectionHeader>
            <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-cc-line bg-cc-surface">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="hidden md:table-header-group">
                  <tr className="border-b border-cc-line bg-cc-surface-muted text-xs font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">
                    <th scope="col" className="px-5 py-3">SAP tool</th>
                    <th scope="col" className="px-5 py-3">What it is for</th>
                    <th scope="col" className="px-5 py-3">How Clean-Core.io relates</th>
                  </tr>
                </thead>
                <tbody>
                  {toolchainRows.map((row) => (
                    <tr key={row.tool} className="block border-b border-cc-line last:border-0 md:table-row" data-landing-tool="">
                      <th scope="row" className="block px-5 pt-4 pb-1 font-bold text-cc-ink md:table-cell md:py-4 md:align-top">
                        {row.tool}
                      </th>
                      <td className="block px-5 py-1 font-medium text-cc-ink-muted md:table-cell md:py-4 md:align-top">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] md:hidden">What it is for · </span>
                        {row.purpose}
                      </td>
                      <td className="block px-5 pt-1 pb-4 font-medium text-cc-ink md:table-cell md:py-4 md:align-top">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-cc-ink-muted md:hidden">How Clean-Core.io relates · </span>
                        {row.relation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 10 · demo */}
        <section id="demo" aria-labelledby="demo-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Demo project" title="Can I try it before I upload my own code?" titleId="demo-title">
              Yes. Every account has the same fully worked demo project, built from a real run of the example{' '}
              {DEMO_OBJECT_NAME} — fictitious code, a guided tour, and nothing you do there is saved or counted.
            </SectionHeader>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
              <Shot
                shot="tour"
                caption="The demo project with its guided tour — captured from the workspace."
                alt={`The demo project ${DEMO_OBJECT_NAME} with the tour open at its first station, “What this code decides”, and the Next, Pause tour and End tour buttons.`}
              />
              <div>
                <h3 className="text-lg font-bold text-cc-ink">What the tour walks through</h3>
                <ol className="mt-3 grid list-decimal grid-cols-2 gap-x-6 gap-y-1 pl-5 text-sm font-medium text-cc-ink-muted">
                  {['Reveal line', 'Not determined', 'Map and source', 'Levels of a large process', 'Confirm a rule', 'Standard fit', 'IT chain', 'Management view', 'Four buckets', 'Costs as simulation', 'Decision', 'Handover'].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <ul className="mt-5 flex list-none flex-col gap-2.5 p-0 text-sm font-medium text-cc-ink">
                  <li className="flex gap-2.5">
                    <Layers size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Confirm, decide, filter and edit. The state lives only in your browser and is gone with “Reset demo”.
                  </li>
                  <li className="flex gap-2.5">
                    <Check size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Nothing counts against your analysis runs, and a demo run is never signed.
                  </li>
                  <li className="flex gap-2.5">
                    <ShieldCheck size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> One demo for every account, rebuilt when the engine or its rules change.
                  </li>
                </ul>
                <div className="mt-6">
                  <AuthLink to={DEMO_ROUTE}>
                    Explore the demo <ArrowRight size={18} aria-hidden="true" />
                  </AuthLink>
                  <p className="mt-2 text-sm font-medium text-cc-ink-muted">Needs a free account. The demo is the first row in your workspace.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/*
          The seven stages, as the tools of the workspace, and the way into them.
          The transformation showroom that stood here — three drawn examples, a
          timed replay and a sample package — was removed on 24.09.2026 (Sonny):
          what the tools produce is shown by the demo project and its tour, in the
          real workspace, not by markup drawn for this page.
        */}
        <section id="workspace-tools" aria-labelledby="workspace-tools-title" className="scroll-mt-20 py-20 md:py-24">
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
        <section id="start" aria-labelledby="start-title" className="scroll-mt-20 border-y border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Start · free" title="How do I start, and what does it cost?" titleId="start-title">
              Nothing — Clean-Core.io is free. Each of the {STARTER_EXAMPLES.length} examples runs once at no cost, your own
              code uses one of five free analysis runs, and after that you continue with your own Gemini API key.
            </SectionHeader>
            <ol className="grid list-none gap-4 p-0 md:grid-cols-3">
              {[
                { t: 'Create a free account', d: 'Sign up with Google or with e-mail and password. No payment, no card.' },
                { t: 'Open the demo, an example or your code', d: 'The engine reads the source first. The process, its rules and what could not be determined appear with line anchors.' },
                { t: 'Confirm and decide', d: 'Confirm the rules, decide per object and hand over. Every completed analysis is sealed as a signed, unchangeable run.' },
              ].map((s, i) => (
                <li key={s.t} className={`${CARD} flex gap-4`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cc-ink text-base font-bold text-white" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    <b className="block text-base font-bold text-cc-ink">{s.t}</b>
                    <span className="mt-1 block text-sm font-medium leading-relaxed text-cc-ink-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">Try an example</h3>
                <p className="mt-1 text-sm font-medium text-cc-ink-muted">
                  {STARTER_EXAMPLES.length} fictitious programs. Each is free the first time you run it; running it again
                  uses one of your analysis runs, and you are told before it starts.
                </p>
                <ul className="mt-4 flex list-none flex-col gap-2 p-0" data-landing-examples="">
                  {[...STARTER_EXAMPLES]
                    .sort((a, b) => b.lines - a.lines)
                    .map((e) => (
                      <li key={e.name}>
                        <details className="group rounded-xl border border-cc-line bg-cc-surface-muted open:bg-white">
                          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                            <code className="font-cc-mono text-sm font-semibold text-cc-ink">{e.name}</code>
                            <span className="text-xs font-medium text-cc-ink-muted">
                              {lines(e.lines)} lines · {e.size}
                              {e.name === demoExample?.name ? ' · basis of the demo project' : ''}
                            </span>
                          </summary>
                          <div className="px-4 pb-4 text-sm font-medium leading-relaxed">
                            <p className="text-cc-ink">{e.summary}</p>
                            <p className="mt-1 text-cc-ink-muted">Shows: {e.demonstrates}</p>
                          </div>
                        </details>
                      </li>
                    ))}
                </ul>
                <div className="mt-5">
                  <AuthLink to="/dashboard" variant="primary">
                    Open an example
                  </AuthLink>
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <div data-testid="card-sandbox" className={CARD}>
                  <span className="inline-flex rounded-full border border-cc-line bg-cc-surface-muted px-2.5 py-0.5 text-xs font-semibold text-cc-ink-muted">
                    No API key needed
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-cc-ink">Free Community Edition</h3>
                  <ul className="mt-3 flex list-none flex-col gap-2 p-0 text-sm font-medium text-cc-ink">
                    <li className="flex gap-2.5"><Check size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Five free analysis runs per account — once, not per month</li>
                    <li className="flex gap-2.5"><Check size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Each example free the first time</li>
                    <li className="flex gap-2.5"><Check size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Every stage and every view included</li>
                  </ul>
                  <div className="mt-5">
                    <AuthLink to="/dashboard" variant="secondary">
                      Get Started
                    </AuthLink>
                  </div>
                </div>
                <div data-testid="card-developer" className={CARD}>
                  <span className="inline-flex rounded-full border border-cc-line bg-cc-surface-muted px-2.5 py-0.5 text-xs font-semibold text-cc-ink-muted">
                    Your own Gemini key
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-cc-ink">Free, with your own key</h3>
                  <ul className="mt-3 flex list-none flex-col gap-2 p-0 text-sm font-medium text-cc-ink">
                    <li className="flex gap-2.5"><Key size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> No quota on analysis runs</li>
                    <li className="flex gap-2.5"><Lock size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Your key is stored encrypted and used only through our server</li>
                    <li className="flex gap-2.5"><CircleHelp size={18} className="shrink-0 text-cc-brand-strong" aria-hidden="true" /> Google bills your key under your own agreement with Google</li>
                  </ul>
                  <div className="mt-5">
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
        <section id="trust" aria-labelledby="trust-title" className="scroll-mt-20 py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="Your code and your trust" title="Your data stays yours" titleId="trust-title">
              Your code is stored in the EU, reaches the Google Gemini API only through our server, and is never sold or
              commercially used. Each line below links to the document that says so.
            </SectionHeader>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">What you confirm</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-cc-ink">
                  {TRUST_PLEDGE.text}{' '}
                  <span className="text-cc-ink-muted">
                    ({TRUST_PLEDGE.sources.map((s, i) => (
                      <span key={s.href}>
                        {i > 0 && ', '}
                        <TextLink href={s.href}>{s.label}</TextLink>
                      </span>
                    ))})
                  </span>
                </p>
                <h3 className="mt-6 text-lg font-bold text-cc-ink">What we do so you can trust us</h3>
                <ul className="mt-3 flex list-none flex-col gap-3 p-0" data-landing-trust="">
                  {TRUST_CLAIMS.filter((c) => c.id !== 'free').map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cc-brand-surface text-cc-brand-strong">{TRUST_ICON[c.icon]}</span>
                      <span className="text-sm font-medium leading-relaxed text-cc-ink">
                        {c.text}
                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                          {c.sources.map((s) => (
                            <TextLink key={s.href + s.label} href={s.href}>
                              {s.label}
                            </TextLink>
                          ))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={CARD}>
                <h3 className="text-lg font-bold text-cc-ink">A free community project</h3>
                {TRUST_CLAIMS.filter((c) => c.id === 'free').map((c) => (
                  <div key={c.id}>
                    <p className="mt-2 text-lg font-semibold leading-relaxed text-cc-ink">{c.text}</p>
                    <p className="mt-2 flex flex-wrap gap-x-3 text-xs">
                      {c.sources.map((s) => (
                        <TextLink key={s.href + s.label} href={s.href}>
                          {s.label}
                        </TextLink>
                      ))}
                    </p>
                  </div>
                ))}
                <p className="mt-6 text-sm font-medium leading-relaxed text-cc-ink-muted">
                  Clean-Core.io is independent and not affiliated with or endorsed by SAP SE. Generated output is a draft
                  that you review before any productive use. The code of this product is public:{' '}
                  <TextLink href="https://github.com/sonnyfrenzel-rgb/clean-core.io">github.com/sonnyfrenzel-rgb/clean-core.io</TextLink>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 13 · FAQ — the same list as the JSON-LD FAQPage above. */}
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-cc-line bg-cc-surface py-20 md:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <SectionHeader eyebrow="FAQ" title="Questions people ask first" titleId="faq-title" />
            <div className="flex flex-col gap-3" data-landing-faq="">
              {faq.map((f, i) => (
                <details key={f.q} open={i === 0} lang={f.lang} className="group rounded-2xl border border-cc-line bg-cc-page">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 [&::-webkit-details-marker]:hidden">
                    <h3 className="text-base font-bold text-cc-ink" data-faq-question="">
                      {f.q}
                    </h3>
                    <ArrowRight size={16} className="shrink-0 text-cc-ink-muted transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
                  </summary>
                  <div className="px-5 pb-5 text-sm font-medium leading-relaxed text-cc-ink-muted">
                    <p data-faq-answer="">{f.a}</p>
                    {f.more && (
                      <p className="mt-2">
                        <TextLink href={f.more.href}>{f.more.label}</TextLink>
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
      <footer id="site-footer" className="scroll-mt-24 bg-cc-ink py-16 text-white md:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex flex-col items-center gap-5 text-center">
            <p className="text-2xl font-extrabold tracking-[-0.02em] md:text-3xl">Read the code before you decide.</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <AuthLink to={DEMO_ROUTE}>
                Explore the demo <ArrowRight size={18} aria-hidden="true" />
              </AuthLink>
              <Link href="/whitepaper" className={publicButton('ghost')}>
                Read the whitepaper
              </Link>
            </div>
          </div>
          <div className="mt-14 border-t border-white/15 pt-12">
            <SiteFooter dark />
          </div>
          <div className="mt-10 border-t border-white/15 pt-8 text-center text-sm text-gray-300">
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              <Link href="/impressum" className="hover:text-white">Legal Notice</Link>
              <Link href="/datenschutz" className="hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-white">Terms of Service</Link>
              <Link href="/licenses" className="hover:text-white">Licenses</Link>
              <a href={SECURITY_MODEL_URL} className="hover:text-white" rel="noopener noreferrer" target="_blank">SECURITY.md on GitHub</a>
            </p>
            <p className="mx-auto mt-6 max-w-2xl text-xs leading-relaxed text-gray-300">
              Generated output is a draft that you review, test and approve before any productive use. The platform is
              provided free of charge and without warranty (<Link href="/terms" className="underline hover:text-white">Terms of Service</Link>).
            </p>
            <div className="mx-auto mt-4 max-w-2xl">
              <SapTrademarkNotice className="!text-gray-300" />
            </div>
            <p className="mt-6 font-cc-mono text-xs text-gray-300">
              © 2026 Clean-Core.io · Version {APP_VERSION} · {APP_RELEASE_DATE}
            </p>
          </div>
        </div>
      </footer>

      <Suspense fallback={null}>
        <LandingModals />
      </Suspense>
    </div>
  );
}
