import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { Suspense } from 'react';
import { 
  RotateCw, 
  Users, 
  Layers, 
  Globe, 
  Cpu, 
  Activity, 
  ShieldCheck, 
  Shield, 
  Check, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import PilotWarningBanner from '@/components/PilotWarningBanner';
import HeaderAuthButton from '@/components/HeaderAuthButton';
import HeroCTA from '@/components/HeroCTA';
import PricingCTA from '@/components/PricingCTA';
import FooterCTA from '@/components/FooterCTA';
import SapTrademarkNotice from '@/components/SapTrademarkNotice';
import LandingModals from '@/components/LandingModals';
import LandingSlideshow from '@/components/LandingSlideshow';
import QuickAnswer from '@/components/QuickAnswer';
import SectionHeader from '@/components/SectionHeader';
import SiteFooter from '@/components/SiteFooter';
import TransformationShowroom from '@/components/TransformationShowroom';
import TransformationReplay from '@/components/TransformationReplay';
import SamplePackageDownload from '@/components/SamplePackageDownload';
import { APP_VERSION, APP_RELEASE_DATE, APP_RELEASE_DATE_ISO } from '@/lib/version';
import { getCatalogStats } from '@/lib/abap/catalog-service';
import { SUPPORT_MATRIX } from '@/lib/abap/support-matrix';
import BenefitCard from '@/components/BenefitCard';
import { getReferenceAnalysis } from '@/lib/reference-analysis';

export const metadata: Metadata = withTwitterCard({
  title: 'SAP Clean Core Accelerator — Free ABAP Analysis | Clean-Core.io',
  description: 'Free SAP Clean Core tool: analyze custom ABAP, get a Clean Core Score, and generate the first Clean-Core-compliant RAP/CAP draft for review — with verifiable abapGit exports and ABAP-Unit tests. Community-built, complementary to SAP ADT/ATC.',
  alternates: {
    canonical: 'https://clean-core.io',
  },
  openGraph: {
    title: 'The SAP Architect\'s Clean Core Accelerator | Clean-Core.io',
    description: 'Free community tool that generates the first Clean-Core-compliant draft for review. Transforms legacy ABAP into RAP or CAP architectures with verifiable abapGit exports and ABAP-Unit tests.',
    url: 'https://clean-core.io',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The SAP Architect\'s Clean Core Accelerator | Clean-Core.io',
    description: 'Free community tool that generates the first Clean-Core-compliant draft for review. Transforms legacy ABAP into RAP or CAP architectures with verifiable abapGit exports and ABAP-Unit tests.',
  }
});

export default function Home() {
  const catalogStats = getCatalogStats();

  /**
   * The SAP-versus-Clean-Core.io comparison, defined once.
   *
   * It used to be two copies of the same array in the JSX below — one for the
   * stacked cards under `md`, one for the desktop rows — and they had drifted in
   * three places: the same cell was labelled "Not Supported" in one and "Not
   * Available" in the other, one row was titled "Sandbox Verification (BYOT)" and
   * the other "Sandbox Verification", and the object count said `23,000+` in both
   * while the trust badge directly above it rendered the live figure from the
   * catalog. On a page whose whole argument is "verifiable, not asserted", that
   * last one is the most expensive place on the site to carry a stale number.
   *
   * So the count is interpolated from the same `catalogStats` the badge uses, and
   * `level` is the single source for how a cell reads. Both renderers derive
   * their styling from it rather than comparing badge strings, which is what let
   * the labels drift apart in the first place.
   */
  const catalogObjects =
    catalogStats.classifiedObjects > 0
      ? `${catalogStats.classifiedObjects.toLocaleString('en-US')} objects`
      : '23,000+ objects';

  const comparisonRows: Array<{
    title: string;
    sap: { badge: string; level: 'partial' | 'weak' | 'none'; desc: string };
    cc: { badge: string; desc: string };
  }> = [
    {
      title: "Clean Core Violation Scanning",
      sap: { badge: "Static Check", level: "partial", desc: "Identifies unreleased APIs & direct database reads." },
      cc: { badge: "Automated", desc: "Calculates Local Compliance score & prioritizes packages." }
    },
    {
      title: "Developer HUD & Feedback",
      sap: { badge: "Static Logs", level: "weak", desc: "Requires manually parsing warning lists or waiting for PDF consulting reports." },
      cc: { badge: "Interactive", desc: "Visualizes compliance scores, code-minimap heatmaps, and developer checklists in real-time." }
    },
    {
      title: "SAP Object Successor Mapping",
      sap: { badge: "ATC Flags Only", level: "partial", desc: "SAP ATC flags unreleased API usage but doesn't resolve to successors." },
      cc: { badge: "Resolved + Synced", desc: `Maps against SAP's official Cloudification Repository (${catalogObjects}) with curated field-level precision. Auto-synced weekly.` }
    },
    {
      title: "Code Refactoring (Remediation)",
      sap: { badge: "Manual Only", level: "weak", desc: "Developers must rewrite legacy code from scratch." },
      cc: { badge: "Refactored", desc: "Converts legacy statements into BTP CAP Node.js/RAP syntax." }
    },
    // These two rows read "✕ Not Available" until v2.7.3, and both claims were
    // wrong in a way an SAP architect spots in under a minute. SAP ships ABAP Unit
    // and the CDS Test Double Framework, and it ships Signavio and Cloud ALM for
    // process modelling — this very site says two sentences later that its own
    // BPMN output is handed to Signavio. A page whose argument is "verifiable, not
    // asserted" cannot be the one place that is verifiably wrong about a
    // competitor. `~` is also the stronger claim: it names what the tool actually
    // adds instead of inventing a gap.
    {
      title: "Sandbox Verification (BYOT)",
      sap: { badge: "Frameworks Only", level: "partial", desc: "ABAP Unit and the CDS Test Double Framework are on board; the test environment is assembled by hand." },
      cc: { badge: "Validated", desc: "Runs test suites against your S/4HANA sandbox via encrypted, read-only connection. Never targets production." }
    },
    {
      title: "Business Process Blueprinting",
      sap: { badge: "Separate Licence", level: "partial", desc: "Not in the ATC/ADT core scope — covered by SAP Signavio and SAP Cloud ALM under their own licences." },
      cc: { badge: "Visualized", desc: "Generates BPMN 2.0 flows directly from the code analysis and hands the template to Signavio." }
    }
  ];

  // Both figures are computed from what actually ships, not typed into the copy:
  // the object count from the generated catalog artifact, the coverage split from
  // the same support matrix the engine runs on. If either changes, the landing
  // page changes with it — it cannot quietly drift into a claim.
  const constructs = Object.values(SUPPORT_MATRIX);
  const fullyCovered = constructs.filter((c) => c.level === 'fully').length;

  // The published reference run. Computed at request time from a file that ships
  // in this repository, so no figure below can drift from what the engine does.
  const reference = getReferenceAnalysis();
  const schemaJson = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://clean-core.io/#organization",
        "name": "Clean-Core.io",
        "url": "https://clean-core.io",
        "logo": "https://clean-core.io/logo.png",
        "sameAs": [
          "https://github.com/sonnyfrenzel-rgb/clean-core.io",
          "https://www.linkedin.com/company/clean-core-io"
        ],
        "founder": {
          "@type": "Person",
          "name": "Felix Frenzel",
          "jobTitle": "Founder & Community Builder",
          "url": "https://www.linkedin.com/in/felix-frenzel-3327741b8/",
          "sameAs": [
            "https://www.linkedin.com/in/felix-frenzel-3327741b8/",
            "https://github.com/sonnyfrenzel-rgb"
          ]
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://clean-core.io/#software",
        "name": "Clean-Core.io",
        "url": "https://clean-core.io",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "All",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "description": "Automated ABAP custom code analysis and S/4HANA modernization following official SAP Clean Core guidelines.",
        "datePublished": "2025-01-15",
        // Tracks the release constant so the freshness signal moves with every ship
        // instead of going stale at a hardcoded date.
        "dateModified": APP_RELEASE_DATE_ISO
      },
      {
        "@type": "FAQPage",
        "@id": "https://clean-core.io/#faq",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "What is the SAP Clean Core strategy?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "The Clean Core strategy keeps the ERP standard free of custom developments by extending via in-app key-user tools or side-by-side on SAP BTP."
            }
          },
          {
            "@type": "Question",
            "name": "How does Clean-Core.io help with ABAP modernization?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Clean-Core.io automatically analyzes ABAP code and converts it to SAP BTP CAP Node.js services or cloud-ready RAP components."
            }
          },
          {
            "@type": "Question",
            "name": "How do you accelerate SAP Clean Core custom ABAP refactoring?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Clean-Core.io accelerates Clean Core modernization — it speeds the work up for you, it doesn't blindly automate it. A deterministic engine parses your custom ABAP (classes, reports, custom tables) with deterministic static (token- and rule-based) and data-flow analysis, then maps direct database reads (e.g. VBAK, BSEG) to released successor APIs using SAP's official Cloudification Repository — the same source behind the SAP ABAP Test Cockpit (ATC) — plus hand-curated field-level mappings. Tightly-coupled logic is drafted into cloud-compliant SAP Business Technology Platform (BTP) Cloud Application Programming Model (CAP) services or in-app RESTful Application Programming Model (RAP) components for you to review. Every finding is evidence-backed and traceable — and frozen into a signed, exportable audit evidence pack."
            }
          },
          // The three below answer benefit-intent queries that already place on
          // this page (positions 2–10) without being marked up as question and
          // answer — the difference between text a reader scrolls past and
          // something an answer engine will quote. Every answer is the visible
          // BenefitCard copy restated, not a new claim; keep it that way, and
          // keep the market's favourite figures ("20–30% faster upgrades",
          // "reduce TCO by 62%") out of it. The German pair is deliberate: the
          // German phrasings hold the better positions on this English page.
          {
            "@type": "Question",
            "name": "What does a free SAP custom code assessment on Clean-Core.io give me?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Two answers, both as drafts you correct. First, what the program actually does — one sentence a process owner can contradict, and with it the process, the operating procedure, who owns which step, and what the code is still worth to the business, all in business language: the generator is not allowed a single technical term. Second, what it will cost to move — every finding split into what a released SAP successor settles, what is your decision, and what stays hand work, with the object-to-API mapping named object by object. The limits are published before you upload anything, and every run is frozen into a signed audit trail you can hand to a reviewer. It is free for the SAP community: no sales call, no trial, no card."
            }
          },
          {
            "@type": "Question",
            "name": "How does Clean Core reduce S/4HANA upgrade risk?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Custom code that reads or modifies the SAP standard directly is what makes an upgrade expensive: a core modification has to be reset in SPAU before the upgrade can proceed, native SQL bypasses the database abstraction the target model depends on, and every direct table read is a contract SAP never promised to keep. Clean core replaces those with released APIs — an upgrade-stable contract in place of the direct table read that carries the risk today — extended in-app with ABAP Cloud (RAP) or side-by-side on SAP BTP (CAP). Clean-Core.io names them in your own ABAP rather than guessing: findings are mapped against SAP's published Cloudification Repository object by object, and anything structurally out of reach for a generator is flagged and isolated instead of being transformed into something plausible and wrong."
            }
          },
          {
            "@type": "Question",
            "name": "Wie reduziert Clean Core das Upgrade-Risiko in S/4HANA?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Teurer wird ein Upgrade durch Eigenentwicklungen, die direkt auf dem SAP-Standard lesen oder ihn modifizieren: Eine Kernmodifikation muss in SPAU zurückgesetzt werden, bevor das Upgrade überhaupt laufen kann, Native SQL umgeht die Datenbankabstraktion, auf der das Zielmodell aufsetzt, und jeder direkte Tabellenzugriff ist ein Vertrag, den SAP nie zugesagt hat. Clean Core ersetzt das durch freigegebene APIs — ein upgrade-stabiler Vertrag anstelle des direkten Tabellenzugriffs, der heute das Risiko trägt — in-app mit ABAP Cloud (RAP) oder side-by-side auf der SAP BTP (CAP). Clean-Core.io benennt sie in Ihrem eigenen ABAP, statt sie zu raten: Befunde werden Objekt für Objekt gegen SAPs veröffentlichtes Cloudification Repository gemappt, und alles, was für einen Generator strukturell unerreichbar ist, wird markiert und isoliert statt in etwas Plausibles und Falsches überführt."
            }
          }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://clean-core.io" },
          { "@type": "ListItem", "position": 2, "name": "How It Works", "item": "https://clean-core.io/how-it-works" },
          { "@type": "ListItem", "position": 3, "name": "ABAP Analysis", "item": "https://clean-core.io/abap-custom-code-analysis" },
          { "@type": "ListItem", "position": 4, "name": "Clean Core Score", "item": "https://clean-core.io/clean-core-score" },
          { "@type": "ListItem", "position": 5, "name": "Knowledge Base", "item": "https://clean-core.io/knowledge" },
          { "@type": "ListItem", "position": 6, "name": "About", "item": "https://clean-core.io/about" }
        ]
      }
    ]
  };


  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJson) }}
      />

      {/* Pilot Warning Banner */}
      <PilotWarningBanner />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 text-green-600 hover:opacity-80 transition-opacity shrink-0">
            <div className="bg-green-600/10 p-2 rounded-xl hidden sm:block">
              <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg sm:text-2xl tracking-tight text-gray-900 leading-none">Clean-Core<span className="text-green-600">.io</span></span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-500 mt-1">Free Community Edition</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-7 xl:gap-9">
            <Link href="/clean-core-explained" className="whitespace-nowrap text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              Clean Core Explained
            </Link>
            <Link href="/how-it-works" className="whitespace-nowrap text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              How It Works
            </Link>
            <Link href="/sap-clean-core-object-classification" className="hidden xl:inline whitespace-nowrap text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              Classification A–D
            </Link>
            <Link href="/knowledge" className="whitespace-nowrap text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              Knowledge Base
            </Link>
          </nav>

          <div className="shrink-0 flex items-center gap-3">
             <div className="hidden 2xl:flex text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full items-center gap-1">
               <Users size={14} /> Free for the SAP Community
             </div>
             <HeaderAuthButton />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 md:pt-40 md:pb-56 overflow-hidden bg-slate-50/30">
        <style>{`
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(4deg); }
          }
          @keyframes float-slower {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(20px) rotate(-4deg); }
          }
          @keyframes drift-up-left {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.45; }
            85% { opacity: 0.45; }
            100% { transform: translateY(-500px) translateX(-25px); opacity: 0; }
          }
          @keyframes drift-up-right {
            0% { transform: translateY(120px) translateX(0); opacity: 0; }
            15% { opacity: 0.65; }
            85% { opacity: 0.65; }
            100% { transform: translateY(-500px) translateX(25px); opacity: 0; }
          }
          @keyframes pulse-slow {
            0%, 100% { transform: scale(1); opacity: 0.22; }
            50% { transform: scale(1.18); opacity: 0.32; }
          }
          .animate-float-slow {
            animation: float-slow 7.5s ease-in-out infinite;
          }
          .animate-float-slower {
            animation: float-slower 9.5s ease-in-out infinite;
          }
          .animate-pulse-slow {
            animation: pulse-slow 8.5s ease-in-out infinite;
          }
        `}</style>

        {/* Background Mesh Gradient Blobs */}
        <div className="absolute top-[10%] left-[5%] w-[380px] h-[380px] bg-indigo-300 rounded-full blur-[130px] opacity-25 animate-pulse-slow z-0 pointer-events-none" />
        <div className="absolute top-[22%] right-[5%] w-[420px] h-[420px] bg-emerald-300 rounded-full blur-[150px] opacity-20 animate-float-slow z-0 pointer-events-none" />
        <div className="absolute bottom-[10%] left-[20%] w-[450px] h-[450px] bg-teal-200 rounded-full blur-[140px] opacity-20 animate-float-slower z-0 pointer-events-none" />

        {/* Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808006_1px,transparent_1px),linear-gradient(to_bottom,#80808006_1px,transparent_1px)] bg-[size:40px_40px] z-0"></div>
        
        {/* Left Particle Column: Legacy ABAP */}
        <div className="hidden xl:flex absolute left-8 top-20 bottom-20 w-32 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: 'REPORT Z_LEGACY', top: '12%', delay: '0s' },
            { text: 'SELECT * FROM', top: '27%', delay: '1.8s' },
            { text: 'FORM GET_DATA', top: '44%', delay: '0.9s' },
            { text: 'CALL FUNCTION', top: '61%', delay: '2.5s' },
            { text: 'DATA: lv_count', top: '78%', delay: '3.4s' },
            { text: 'WRITE: / lv_val', top: '92%', delay: '4.8s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-slate-100 text-slate-400 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-slate-200/50 shadow-sm whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-left 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        {/* Right Particle Column: Modern TS */}
        <div className="hidden xl:flex absolute right-8 top-20 bottom-20 w-36 flex-col justify-around pointer-events-none overflow-hidden z-20">
          {[
            { text: "import { Router }", top: '17%', delay: '0.4s' },
            { text: 'async function', top: '32%', delay: '2.2s' },
            { text: 'express.json()', top: '49%', delay: '1.4s' },
            { text: 'callGemini()', top: '66%', delay: '3.0s' },
            { text: 'new PrismaClient()', top: '81%', delay: '0.1s' },
            { text: 'res.status(200)', top: '94%', delay: '4.2s' }
          ].map((item, idx) => (
            <div 
              key={idx}
              className="absolute bg-emerald-50 text-emerald-600 font-mono text-[10px] font-black px-3 py-1.5 rounded-lg border border-emerald-200/50 shadow-md shadow-emerald-500/5 whitespace-nowrap"
              style={{
                top: item.top,
                animation: `drift-up-right 9s linear infinite`,
                animationDelay: item.delay
              }}
            >
              {item.text}
            </div>
          ))}
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10 text-center">
          {/* Announcement — the newest thing we have made, in the most-seen spot on
              the site. Distinct from the eyebrow badge below it on purpose: dark
              chip, white pill, so the two read as announcement and category
              rather than competing for the same job. */}
          <div className="flex justify-center mb-5">
            <Link
              href="/clean-core-explained"
              className="group inline-flex items-center gap-2.5 pl-2 pr-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:border-green-300 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-700"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
              <Sparkles size={11} className="text-green-400" /> New
            </span>
            <span className="text-xs md:text-sm font-extrabold text-gray-800 group-hover:text-green-700 transition-colors">
              SAP Clean Core, explained without the jargon
            </span>
            <ArrowRight
              size={14}
              className="text-green-600 transition-transform duration-200 group-hover:translate-x-1"
            />
            </Link>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs md:text-sm mb-8 border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ShieldCheck className="w-4 h-4" />
            <span className="uppercase tracking-wider">Free for the SAP Community · Clean Core & ABAP Transformation</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-gray-950 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            The SAP Architect&apos;s <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">Clean Core Accelerator</span>
          </h1>
          <p className="text-base sm:text-lg md:text-2xl text-gray-700 max-w-3xl mx-auto mb-12 leading-relaxed font-light animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            Generate the first Clean-Core-compliant draft for review and approval &mdash; grounded in SAP&apos;s own published object data, with the limits named before you upload, and the expert&apos;s judgment never replaced.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
            <HeroCTA />
            {/* Third in the hierarchy, and now shaped like it. As a bordered
                pill it was a third button competing with two filled ones; the
                hero asked the reader to choose between three equals before the
                product had shown anything. */}
            <div className="flex items-center justify-center mt-1">
              <Link
                href="/how-it-works"
                className="text-xs sm:text-sm font-bold text-gray-500 hover:text-green-700 transition-colors flex items-center gap-1.5 px-2 py-2"
              >
                Explore How It Works &amp; Limitations <ArrowRight size={13} className="text-green-600" />
              </Link>
            </div>
          </div>
        </div>

        {/* GEO Quick Answer Block */}
        <div className="max-w-4xl mx-auto px-6 mt-16 relative z-20 animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-600">
          <QuickAnswer
            question="How do you accelerate SAP Clean Core custom ABAP refactoring?"
            answer="Clean-Core.io accelerates Clean Core modernization — it speeds the work up for you, it doesn't blindly automate it. A deterministic engine parses your custom ABAP (classes, reports, custom tables) with deterministic static (token- and rule-based) and data-flow analysis, then maps direct database reads (e.g. VBAK, BSEG) to released successor APIs using SAP's official Cloudification Repository — the same source behind the SAP ABAP Test Cockpit (ATC) — plus hand-curated field-level mappings. Tightly-coupled logic is drafted into cloud-compliant SAP Business Technology Platform (BTP) Cloud Application Programming Model (CAP) services or in-app RESTful Application Programming Model (RAP) components for you to review. Every finding is evidence-backed and traceable — and frozen into a signed, exportable audit evidence pack, so you get a faster first draft and a defensible decision trail with an architect always in the loop."
          />
        </div>
        
        {/*
          The proof, moved up.

          It used to sit after the process carousel, the business argument and the
          SAP tool matrix — the one section on this page a reader can check
          themselves, four screens below the claim it verifies. Grok, GPT-5.6-sol
          and GLM-5v each proposed moving it independently; GPT put the reason
          best: the first impression becomes less "AI landing page" and more
          "checkable architecture tool".

          Nothing in it changed except its place — and the process strip inside,
          which answers the question the two halves left out.
        */}
        {/* Transformation Showroom */}
        <section id="showroom" className="py-24 md:py-32 bg-slate-50/50 border-y border-gray-200/40 relative scroll-mt-14">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeader
              eyebrow="Three Worked Examples"
              title="See a real ABAP program transformed"
            >
              Three example programs, end to end: what each one is, what it does as a process, and
              what the engine turns it into. Every output below is a real transformation &mdash;
              verified, compiled and tested against Clean-Core Engine {APP_VERSION}. Your own code
              goes through the same seven steps.
            </SectionHeader>
            <Suspense fallback={null}>
              <TransformationReplay />
            </Suspense>
            <TransformationShowroom />
            <Suspense fallback={null}>
              <SamplePackageDownload />
            </Suspense>
          </div>
        </section>


        {/* Interactive Slideshow */}
        <div id="process" className="scroll-mt-14 relative z-20 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-700">
          {/* This was the only section on the page without a header, so it read as
              a widget floating between two arguments rather than as the step that
              follows the examples. Same eyebrow, same heading scale, same lead
              width as every other section. */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <SectionHeader
              eyebrow="The Seven Steps"
              title="How a transformation actually runs"
            >
              Upload, analyze, design, transform, test, document, deliver. Each step produces
              something you can read and check before the next one starts &mdash; and an architect
              signs the result, not the tool.
            </SectionHeader>
          </div>
          <LandingSlideshow />
        </div>

        {/* Benefit card, placed after the slideshow: the reader has seen what the
            product does, and this answers "so where does that leave me". Built
            around the two questions a legacy decision waits on — the business one
            first and larger, because the market answers only the technical one.
            Replaces the unprovable "save days" claim with a reproducible run. */}
        <div id="evidence" className="scroll-mt-14 max-w-6xl mx-auto px-6 mt-20 relative z-20 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-700">
          <SectionHeader
            eyebrow="One Reproducible Run"
            title="Nobody can say what this program does"
            titleId="benefit-heading"
            align="left"
          >
            Somewhere in your S/4HANA transformation a Z-object is blocking a keep, adapt or retire
            decision, because nobody can answer &ldquo;do we still need this?&rdquo; &mdash; so the
            row sits in the spreadsheet until the upgrade date makes it an emergency. Every custom
            code tool will size the work; none of them tells the business what the work is. This one
            answers both, with the limits published before you upload anything.
          </SectionHeader>
          <BenefitCard
            linesOfCode={reference.linesOfCode}
            totalFindings={reference.totalFindings}
            resolved={reference.resolved}
            decision={reference.decision}
            handedBack={reference.handedBack}
            handedBackKinds={reference.handedBackKinds}
            rollCall={reference.rollCall}
            businessDecisions={reference.businessDecisions}
            classifiedObjects={catalogStats.classifiedObjects}
            constructsTotal={constructs.length}
            constructsFullyCovered={fullyCovered}
          />
        </div>

        {/*
          The "Verifiable Integrity — No AI Black-Box Promises" section stood here.
          It made the same argument as the benefit card a thousand pixels above it,
          with the same three categories in the same three colours — Fully Grounded
          / Quirk Review / Manual Handover against settled / your call / hand work —
          and it was the louder of the two while being the one without a single
          number in it. The card had the evidence and whispered; this had the
          typography and shouted.

          Merged into the card: the three descriptions became the meaning printed
          under each computed number, which is where they were always going, and
          the methodology link moved with them. The card carries the dark treatment
          now, on the half that holds the proof.
        */}


        {/* Comparison Highlight Table */}
        <div id="toolchain" className="scroll-mt-14 max-w-6xl mx-auto px-6 mt-20 relative z-20 animate-in fade-in slide-in-from-bottom-28 duration-1000 delay-800">
          <div className="bg-white rounded-[2rem] p-6 sm:p-10 md:p-12 border border-slate-200 shadow-xl relative overflow-hidden">
            {/* Glowing Accent */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.04),transparent_45%)] pointer-events-none" />
            
            <div className="relative z-10">
              <SectionHeader
                eyebrow="Complements Your SAP Toolchain"
                title="How we complement your SAP tools"
                align="left"
              >
                The SAP ABAP Test Cockpit (ATC) is the authoritative check for Clean Core
                violations &mdash; keep using it. Clean-Core.io picks up from there: it maps each
                finding against SAP&apos;s Cloudification Repository and drafts BTP or RAP
                scaffolding for you to review, then validate back in your ABAP Development Tools
                (ADT) and ATC.
              </SectionHeader>
              <div className="text-center md:text-left -mt-10 mb-10">
              {catalogStats.classifiedObjects > 0 && (
                <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {catalogStats.classifiedObjects.toLocaleString('en-US')} classified SAP objects · Auto-synced from SAP&apos;s official repository
                </div>
              )}
              </div>
            </div>

            {/* Mobile View: Stacked Comparison Cards (hidden on desktop) */}
            <div className="space-y-5 md:hidden relative z-10">
              {comparisonRows.map((row, idx) => (
                <div key={idx} className="bg-slate-50 rounded-2xl border border-slate-200/80 overflow-hidden">
                  {/* Capability Title */}
                  <div className="bg-slate-100/80 px-5 py-3 border-b border-slate-200/60">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      {row.title}
                    </h4>
                  </div>
                  
                  <div className="divide-y divide-slate-200/50">
                    {/* SAP Side */}
                    <div className="px-5 py-4 space-y-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">SAP Native Tooling</span>
                      <span className={`inline-flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full ${
                        row.sap.level === 'partial'
                          ? 'text-slate-700 bg-slate-100 border border-slate-200/60' 
                          : 'text-slate-400 bg-slate-50 border border-slate-200/40'
                      }`}>
                        {row.sap.level === 'none' && <span className="text-red-400">✕</span>}
                        {row.sap.badge}
                      </span>
                      <p className="text-slate-500 text-xs leading-relaxed">{row.sap.desc}</p>
                    </div>

                    {/* Vs Divider */}
                    <div className="flex items-center px-5 py-0 relative">
                      <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 h-px bg-slate-200/60" />
                      <span className="relative z-10 mx-auto bg-slate-50 px-2.5 py-0.5 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">vs</span>
                    </div>

                    {/* Clean-Core.io Side */}
                    <div className="px-5 py-4 space-y-2 bg-emerald-50/30 border-l-[3px] border-l-emerald-400">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider block">clean-core.io</span>
                      <span className="inline-flex items-center gap-1.5 text-emerald-700 font-bold text-[11px] uppercase tracking-wider bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                        <span className="text-emerald-500">✓</span>
                        {row.cc.badge}
                      </span>
                      <p className="text-slate-700 text-xs leading-relaxed">{row.cc.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Comparison Rows (hidden on mobile) */}
            <div className="hidden md:block relative z-10 space-y-3">
              {/* Column Headers */}
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 px-2 pb-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capability</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SAP Native Tooling</div>
                <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Clean-Core.io</div>
              </div>

              {comparisonRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr] gap-4 items-stretch">
                  {/* Capability Name */}
                  <div className="flex items-center px-5 py-4 bg-slate-50/80 rounded-xl border border-slate-100">
                    <span className="font-bold text-sm text-slate-900 leading-snug">{row.title}</span>
                  </div>

                  {/* SAP Column */}
                  <div className="flex items-start gap-3 px-5 py-4 bg-slate-50/40 rounded-xl border border-slate-100/80">
                    <span className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      row.sap.level === 'partial' 
                        ? 'bg-amber-100 text-amber-600 border border-amber-200/60' 
                        : row.sap.level === 'weak' 
                        ? 'bg-slate-100 text-slate-400 border border-slate-200/60' 
                        : 'bg-red-50 text-red-400 border border-red-200/40'
                    }`}>
                      {row.sap.level === 'partial' ? '~' : row.sap.level === 'weak' ? '–' : '✕'}
                    </span>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className={`font-bold text-[11px] uppercase tracking-wider ${
                        row.sap.level === 'partial' ? 'text-amber-700' : row.sap.level === 'weak' ? 'text-slate-500' : 'text-red-400'
                      }`}>
                        {row.sap.badge}
                      </span>
                      <span className="text-xs text-slate-400 leading-relaxed">{row.sap.desc}</span>
                    </div>
                  </div>

                  {/* Clean-Core.io Column */}
                  <div className="flex items-start gap-3 px-5 py-4 bg-emerald-50/50 rounded-xl border border-emerald-200/50 relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-400 rounded-l-xl" />
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200/60 flex items-center justify-center text-[10px] font-black">✓</span>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-700">{row.cc.badge}</span>
                      <span className="text-xs text-slate-600 leading-relaxed">{row.cc.desc}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="capabilities" className="py-24 md:py-32 bg-white relative scroll-mt-14">
        <div className="max-w-7xl mx-auto px-6">
          <SectionHeader
            eyebrow="Live Today"
            title="What you can do today"
          >
            Every feature listed here is live and free to use &mdash; start with 5 transformations
            or bring your own API key for unlimited access.
          </SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'Extensibility Routing & Sign-Off',
                desc: 'Classifies legacy custom logic against SAP Clean Core guidelines, routes between In-App RAP and Side-by-Side CAP tracks, and gates transformation behind an explicit architecture decision.',
                link: '/features/extensibility-routing',
                testId: 'feature-extensibility-routing'
              },
              {
                icon: <Globe className="w-8 h-8 text-green-600" />,
                title: 'SAP Cloudification Catalog',
                desc: 'Maps legacy objects against SAP\'s official Cloudification Repository — the same source behind SAP ATC checks — layered with curated field-level mappings. Weekly auto-synced, versioned, and audit-traceable.',
                link: '/features/cloudification-catalog',
                testId: 'feature-sap-api-hub-mapping'
              },
              {
                icon: <Cpu className="w-8 h-8 text-green-600" />,
                title: 'Dual RAP & CAP Engine',
                desc: 'Generates clean In-App ABAP Cloud RAP handlers or decoupled BTP CAP services. Powered by a deterministic evidence resolver that linearizes OO inheritance chains before translation, reducing structural AI hallucinations.',
                link: '/features/rap-cap-engine',
                testId: 'feature-dual-rap-cap-engine'
              },
              {
                icon: <Activity className="w-8 h-8 text-green-600" />,
                title: 'Modernization Assessment',
                desc: 'Computes complexity and business-criticality scores, extracts a full code inventory, and maps data coupling with standard SAP table risk analysis — all before transformation.',
                link: '/features/modernization-assessment',
                isNew: true,
                testId: 'feature-business-value-audit-tco'
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-green-600" />,
                title: 'Compliance & Audit Evidence',
                desc: 'Visual compliance dashboard with exportable audit pack: input fingerprints, architecture decision records, model cards, and known limitations — ready for governance reviews.',
                link: '/features/audit-evidence',
                testId: 'feature-adt-cockpit-simulation'
              },
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'BPMN 2.0 & Business Standard Operating Procedures',
                desc: 'Maps modernized processes into standard BPMN 2.0 XML with swimlanes. Features a two-stage blueprint layer with Responsible-Accountable-Consulted-Informed (RACI) matrices, Level 5 Standard Operating Procedure (SOP) narratives, and internal compliance controls.',
                link: '/features/process-blueprints',
                testId: 'feature-bpmn-2-0-business-sop'
              }
            ].map((feature, idx) => (
              <div 
                key={idx}
                data-testid={feature.testId}
                className="bg-white/45 backdrop-blur-md p-8 md:p-10 rounded-[2.5rem] border border-gray-200/60 hover:border-green-400 hover:bg-white/95 transition-all hover:shadow-xl hover:shadow-green-500/5 group hover:-translate-y-1.5 duration-350 flex flex-col justify-between"
              >
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-8 border border-gray-100 shadow-sm group-hover:scale-110 transition-all duration-300 group-hover:bg-green-50 group-hover:shadow-md group-hover:border-green-200">
                    <div className="text-green-600 transition-colors">
                      {feature.icon}
                    </div>
                  </div>
                  <h3 className="text-2xl font-black mb-4 text-gray-955 tracking-tight flex items-center gap-2">
                    {feature.title}
                    {feature.isNew && (
                      <span className="px-2 py-0.5 bg-green-600 text-white text-[9px] font-black rounded-md uppercase tracking-wider">NEW</span>
                    )}
                  </h3>
                  <p className="text-gray-700 leading-relaxed font-medium text-sm md:text-base mb-6">{feature.desc}</p>
                </div>
                {feature.link && (
                  <Link 
                    href={feature.link}
                    className="text-green-600 hover:text-green-700 font-bold text-sm inline-flex items-center gap-1 hover:underline mt-auto"
                  >
                    Learn more <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section id="data" className="py-24 bg-slate-50/50 border-y border-gray-900/5 relative overflow-hidden scroll-mt-14">
        {/* Background ambient lighting */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <SectionHeader
            eyebrow="Sovereign & Secured"
            title="Your data stays yours"
          >
            European hosting, designed to support GDPR-aligned processing and erasure workflows,
            with self-service data erasure control. We built the security architecture the way
            we&apos;d want it for our own SAP systems.
          </SectionHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Globe className="w-6 h-6 text-green-600" />,
                title: "Belgium Hosting (Europe)",
                desc: "Application storage and primary processing run in the europe-west1 GCP region (Belgium); AI and transactional-email subprocessors are disclosed separately."
              },
              {
                icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
                title: "DSGVO / GDPR-aligned",
                desc: "Art. 17 DSGVO erasure: purge all your uploads and data in Settings. Transactional emails are routed via the Resend API; subprocessors process data under their own terms."
              },
              {
                icon: <Layers className="w-6 h-6 text-green-600" />,
                title: "Cloud-Native Security",
                desc: "Runs on Google Cloud Run with server-side encryption and stateless request handling — no persistent local data on the request path. Processing happens in managed, ephemeral containers."
              },
              {
                icon: <Shield className="w-6 h-6 text-green-600" />,
                title: "Hardened Stateless APIs",
                desc: "Your BYOK API credentials are encrypted in transit, proxied securely server-side, and never trained or exposed to public LLM builders."
              }
            ].map((trust, idx) => (
              <div 
                key={idx}
                className="bg-white/60 backdrop-blur-md p-6 rounded-3xl border border-gray-200/60 hover:border-green-400 hover:shadow-xl hover:shadow-green-500/5 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6 border border-gray-100 shadow-sm">
                    {trust.icon}
                  </div>
                  <h3 className="text-lg font-black text-gray-955 tracking-tight mb-2 uppercase">{trust.title}</h3>
                  <p className="text-gray-600 text-xs md:text-sm leading-relaxed font-medium">{trust.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Access & Capabilities Section */}
      <section className="py-24 md:py-32 bg-white relative overflow-hidden scroll-mt-14" id="access">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <SectionHeader
            eyebrow="100% Free — No Credit Card Required"
            title="Community access"
          >
            Every feature is included for free &mdash; no locked exports, no premium tiers. The
            only limit is 5 transformations; bring your own Gemini API key for unlimited runs.
            Both are 100&nbsp;% free.
          </SectionHeader>

          {/* The Free Community Model — positioning statement */}
          <div className="max-w-4xl mx-auto mb-16">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[
                { t: 'Free to use', d: 'Free for the SAP community — 5 transformations at no cost, or bring your own Gemini key (BYOK) for unlimited runs under your own terms.' },
                { t: 'Built on open standards & open data', d: 'Our object catalog is grounded in SAP’s Apache-2.0 Cloudification Repository, and your output is portable — standard abapGit and tests. You own what you generate. No lock-in.' },
                { t: 'Transparent by design', d: 'Every finding is tied to evidence and a source; coverage is shown per object — including the honest cases where there is no clean path. Belegt, nicht behauptet.' },
                { t: 'A complement, not a replacement', d: 'We accelerate the first assessment and draft. The architecture decisions — and the judgment — stay with you. An independent product, not affiliated with or endorsed by SAP SE.' },
              ].map((p) => (
                <div key={p.t} className="rounded-3xl border border-gray-200 bg-white p-6 text-left hover:border-emerald-300 hover:shadow-lg transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <h3 className="text-base font-black text-gray-900">{p.t}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{p.d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card 1: Free Community Edition (no API key needed) */}
            <div data-testid="card-sandbox" className="relative flex flex-col p-8 sm:p-10 rounded-[2.5rem] border border-gray-200 bg-white text-gray-900 hover:border-green-300 hover:shadow-xl transition-all duration-300">
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black">Free Community Edition</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200">No API key needed</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black">Free</span>
                  <span className="text-sm text-gray-500 font-medium">5 transformations</span>
                </div>
                <p className="text-xs md:text-sm font-medium mt-2 text-gray-500">Register with name and email &mdash; your workspace is live straight away.</p>
              </div>
              <ul className="space-y-3.5 mb-10 flex-grow">
                {[
                  'Full 7-stage modernization workflow — every feature included',
                  'Up to 5 ABAP-to-Cloud transformations (RAP / CAP)',
                  'Deterministic evidence engine + compliance & criticality scoring',
                  'SAP Business Accelerator Hub mapping & Clean Core routing',
                  'abapGit ZIP export, ABAP-Unit tests, BPMN & Confluence exports',
                  'Server-signed audit evidence pack'
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-bold">
                    <Check className="w-5 h-5 shrink-0 text-green-600" /> {f}
                  </li>
                ))}
              </ul>
              <PricingCTA cta="Get Started" highlight={false} disabled={false} />
            </div>

            {/* Card 2: Developer Upgrade (BYOK) */}
            <div data-testid="card-developer" className="relative flex flex-col p-8 sm:p-10 rounded-[2.5rem] border border-gray-900 bg-gray-950 text-white shadow-2xl transition-all duration-300">
              <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-green-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
                Unlimited · Free
              </div>
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black">Free + Your Own Key</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 px-3 py-1 rounded-full border border-green-500/20">BYOK</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black">Free</span>
                  <span className="text-sm text-gray-400 font-medium">Unlimited transformations</span>
                </div>
                <p className="text-xs md:text-sm font-medium mt-2 text-gray-400">Bring your own Google Gemini API key &mdash; encrypted and stored securely.</p>
              </div>
              <ul className="space-y-3.5 mb-10 flex-grow">
                {[
                  'Everything in the Free Community Edition — no features locked',
                  'Unlimited code transformations (via BYOK)*',
                  'Live S/4HANA sandbox connection (encrypted, read-only, admin-gated)',
                  'Ideal for developers running large or ongoing modernizations'
                ].map((f, i) => {
                  const isAll = f.toLowerCase().includes('includes all');
                  return (
                    <li key={i} className={`flex items-start gap-3 text-sm ${isAll ? 'text-green-400 font-extrabold tracking-wide uppercase text-xs border border-green-500/30 bg-green-500/5 px-3 py-2 rounded-xl' : 'font-bold'}`}>
                      <Check className={`w-5 h-5 shrink-0 ${isAll ? 'text-green-400' : 'text-green-400'}`} /> {f}
                    </li>
                  );
                })}
              </ul>
              <PricingCTA cta="Add Your Gemini Key" highlight={true} disabled={false} />
            </div>
          </div>

          {/* Live Tenant Security Profile */}
          <div className="mt-12 max-w-4xl mx-auto border border-dashed border-gray-200 rounded-3xl p-6 pt-4 relative">
            <div className="flex items-center justify-center gap-2 mb-5">
              <div className="h-px flex-1 bg-gray-200" />
              {/* No `whitespace-nowrap`. The label is 340px wide and sat between
                  two flex-1 rules, so on a narrow viewport it could not shrink and
                  pushed the whole page sideways instead. It fits on one line
                  wherever there is room and wraps, centred, where there is not. */}
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-2 text-center">
                S/4HANA Sandbox Connection — Security Profile
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: <Shield className="w-5 h-5 text-green-600" />, title: 'Sandbox Only · Read-Only', desc: 'Connections are restricted to non-production sandbox systems. Only OData metadata reads and test execution — no write operations, no production access.', link: '/tenant-security#read-only-scope' },
                { icon: <ShieldCheck className="w-5 h-5 text-green-600" />, title: 'Encrypted · Stateless', desc: 'Credentials are AES-256-GCM encrypted. SAP transaction data is processed statelessly in memory — no customer ERP data is persisted on our infrastructure.', link: '/tenant-security#stateless-processing' },
                { icon: <Globe className="w-5 h-5 text-green-600" />, title: 'Admin-Gated Onboarding', desc: 'Every sandbox connection request is manually reviewed and approved by an administrator before activation.', link: '/tenant-security#admin-onboarding-gate' }
              ].map((item, idx) => (
                <div key={idx} className="bg-gray-50 p-5 rounded-2xl border border-gray-200/60 text-center">
                  <div className="w-10 h-10 mx-auto bg-white rounded-xl flex items-center justify-center mb-3 border border-gray-100 shadow-sm">{item.icon}</div>
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-1">{item.title}</h4>
                  <p className="text-[11px] text-gray-500 leading-relaxed font-medium">{item.desc}</p>
                  {item.link && (
                    <Link href={item.link} className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-green-600 hover:text-green-700 uppercase tracking-wider hover:underline">
                      Learn more <ArrowRight size={10} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* BYOK Explainer */}
          <div className="mt-8 text-center text-xs md:text-sm text-gray-550 max-w-2xl mx-auto leading-relaxed border border-gray-100 bg-gray-50/50 p-5 rounded-3xl shadow-sm">
            <span className="font-extrabold text-gray-800 uppercase tracking-wider block mb-1">* BYOK (Bring Your Own Key)</span>
            Use your own Google Gemini API key to run unlimited transformations without any platform limits. Your API key is encrypted (AES-256-GCM) and stored in your authenticated user profile&mdash;it is used exclusively via our secure backend proxy and never exposed in plaintext.
            <span className="block mt-2 text-[11px] text-gray-500 font-medium">* Usage is subject to your Google Gemini API key quota and billing &mdash; clean-core.io does not charge any platform fees.</span>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <footer className="py-24 md:py-32 bg-gray-950 text-white text-center">
        <div className="max-w-4xl mx-auto px-6">
          <SectionHeader tone="dark" title="Verify it yourself">
            Import the generated abapGit package into your Eclipse ADT, compile the code, and run
            the ABAP-Unit tests &mdash; all in your own sandbox.
          </SectionHeader>
          <FooterCTA />

          <div id="site-footer" className="mt-20 pt-12 border-t border-gray-800 scroll-mt-24">
            <SiteFooter dark />
          </div>

          <div className="mt-16 pt-12 border-t border-gray-800 text-sm text-gray-500 font-light">
            <p>&copy; 2026 Clean-Core.io. All rights reserved.</p>
            <p className="mt-2 text-xs text-gray-600 font-mono font-bold uppercase tracking-wider">
              System Version: {APP_VERSION} • {APP_RELEASE_DATE}
            </p>
            <p className="mt-4 flex flex-wrap justify-center gap-4">
              <Link href="/impressum" className="hover:text-white transition-colors cursor-pointer">Legal Notice</Link>
              <span className="text-gray-800">|</span>
              <Link href="/datenschutz" className="hover:text-white transition-colors cursor-pointer">Privacy Policy</Link>
              <span className="text-gray-800">|</span>
              <Link href="/terms" className="hover:text-white transition-colors cursor-pointer">Terms of Service</Link>
              <span className="text-gray-800">|</span>
              <Link href="/licenses" className="hover:text-white transition-colors cursor-pointer">Licenses</Link>
            </p>
            <div className="mt-12 text-[10px] sm:text-[11px] text-gray-550 max-w-2xl mx-auto leading-relaxed border border-gray-900 bg-gray-950/50 p-6 rounded-2xl text-left space-y-3">
              <span className="font-extrabold text-gray-400 uppercase tracking-widest block border-b border-gray-900 pb-1.5">Legal Disclaimer & Verification Notice</span>
              <p>
                <strong>Free Community Modernization Platform:</strong> Clean-Core.io is a free, community-built SAP Clean Core modernization platform for architects and developers, maintained by Felix Frenzel. A free, non-commercial community project — no subscriptions or paid tiers. Provided for research and evaluation; generated outputs are drafts to review before productive use.
              </p>
              <p>
                <strong>AI-Assisted Drafts &mdash; Verify Before You Deploy:</strong> All solution designs, compliance scores, modular code transformations, and test suites are dynamically generated using third-party generative AI models (Google Gemini API). All artifacts are provided on an <em>&quot;AS IS&quot;</em> and <em>&quot;AS AVAILABLE&quot;</em> basis without warranties of any kind. This tool generates the first compliant draft&mdash;the architect reviews, tests, and approves. We provide the abapGit packages and ABAP-Unit tests so you can compile and verify every output in your own Eclipse ADT environment.
              </p>
              <p>
                <strong>Limitation of Liability:</strong> In no event shall the administrator, contributors, or developers be held liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of data, system crashes, integration failures, or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort arising in any way out of the use of this software, even if advised of the possibility of such damage.
              </p>
              <p>
                <strong>Data Privacy & GDPR:</strong> Primary application storage and compute run on European cloud nodes in the Belgium (europe-west1) region. Uploaded code is processed via server-side proxy layers and saved in your encrypted, access-controlled project workspace (not used by Google to train its models, per the Gemini API terms). Users retain the right to erasure (Art. 17 GDPR) via the settings dashboard; AI and email subprocessors are disclosed separately.
              </p>
              <div className="pt-1 border-t border-gray-900">
                <SapTrademarkNotice className="!text-gray-550" />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals & Overlays Controller */}
      <Suspense fallback={null}>
        <LandingModals />
      </Suspense>
    </div>
  );
}
