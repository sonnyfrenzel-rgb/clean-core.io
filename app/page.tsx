import type { Metadata } from 'next';
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
  ArrowRight
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
import SiteFooter from '@/components/SiteFooter';
import TransformationShowroom from '@/components/TransformationShowroom';
import TransformationReplay from '@/components/TransformationReplay';
import SamplePackageDownload from '@/components/SamplePackageDownload';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { getCatalogStats } from '@/lib/abap/catalog-service';

export const metadata: Metadata = {
  title: 'The SAP Architect\'s Clean Core Accelerator | Clean-Core.io',
  description: 'Free community tool that generates the first Clean-Core-compliant draft for review. Transforms legacy ABAP into RAP or CAP architectures with verifiable abapGit exports and ABAP-Unit tests.',
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
};

export default function Home() {
  const catalogStats = getCatalogStats();
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
        "dateModified": "2026-06-26"
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
              "text": "Clean-Core.io accelerates Clean Core modernization — it speeds the work up for you, it doesn't blindly automate it. A deterministic engine parses your custom ABAP (classes, reports, custom tables) with syntax-tree and data-flow analysis, then maps direct database reads (e.g. VBAK, BSEG) to released successor APIs using SAP's official Cloudification Repository — the same source behind the SAP ABAP Test Cockpit (ATC) — plus hand-curated field-level mappings. Tightly-coupled logic is drafted into cloud-compliant SAP Business Technology Platform (BTP) Cloud Application Programming Model (CAP) services or in-app RESTful Application Programming Model (RAP) components for you to review. Every finding is evidence-backed — proven, not claimed — and frozen into a signed, exportable audit evidence pack."
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
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/how-it-works" className="text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              How It Works
            </Link>
            <Link href="/sap-tier-2-extensions" className="text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              Tier 2 Extensions
            </Link>
            <Link href="/knowledge" className="text-xs font-black text-gray-600 hover:text-green-600 transition-colors uppercase tracking-wider">
              Knowledge Base
            </Link>
          </nav>

          <div className="shrink-0 flex items-center gap-3">
             <div className="hidden sm:flex text-xs font-semibold bg-gray-100 text-gray-600 px-3 py-1 rounded-full items-center gap-1">
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs md:text-sm mb-8 border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ShieldCheck className="w-4 h-4" />
            <span className="uppercase tracking-wider">Free for the SAP Community · Clean Core & ABAP Transformation</span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.85] text-gray-950 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            The SAP Architect&apos;s <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-500">Clean Core Accelerator</span>
          </h1>
          <p className="text-base sm:text-lg md:text-2xl text-gray-700 max-w-3xl mx-auto mb-12 leading-relaxed font-light animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200">
            Generate the first Clean-Core-compliant draft for review and approval. Save days of manual mapping and boilerplate generation&mdash;without replacing the judgment of the expert.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500">
            <HeroCTA />
            <div className="flex items-center justify-center mt-3">
              <Link 
                href="/how-it-works" 
                className="text-xs sm:text-sm font-extrabold text-gray-600 hover:text-green-600 hover:border-green-400 hover:bg-green-50/10 transition-all flex items-center gap-2 px-6 py-2.5 rounded-full border border-gray-200 bg-white/70 backdrop-blur-sm shadow-sm"
              >
                Explore How It Works & Limitations <ArrowRight size={14} className="text-green-600" />
              </Link>
            </div>
          </div>
        </div>

        {/* GEO Quick Answer Block */}
        <div className="max-w-4xl mx-auto px-6 mt-16 relative z-20 animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-600">
          <QuickAnswer
            question="How do you accelerate SAP Clean Core custom ABAP refactoring?"
            answer="Clean-Core.io accelerates Clean Core modernization — it speeds the work up for you, it doesn't blindly automate it. A deterministic engine parses your custom ABAP (classes, reports, custom tables) with syntax-tree and data-flow analysis, then maps direct database reads (e.g. VBAK, BSEG) to released successor APIs using SAP's official Cloudification Repository — the same source behind the SAP ABAP Test Cockpit (ATC) — plus hand-curated field-level mappings. Tightly-coupled logic is drafted into cloud-compliant SAP Business Technology Platform (BTP) Cloud Application Programming Model (CAP) services or in-app RESTful Application Programming Model (RAP) components for you to review. Every finding is evidence-backed — proven, not claimed — and frozen into a signed, exportable audit evidence pack, so you get a faster first draft and a defensible decision trail with an architect always in the loop."
          />
        </div>
        
        {/* Interactive Slideshow */}
        <div className="relative z-20 animate-in fade-in slide-in-from-bottom-24 duration-1000 delay-700">
          <LandingSlideshow />
        </div>

        {/* Verifiable Integrity & Honest Limits Section */}
        <div className="max-w-6xl mx-auto px-6 mt-20 relative z-20 animate-in fade-in slide-in-from-bottom-28 duration-1000 delay-750">
          <div className="bg-slate-900 text-white rounded-[2rem] p-8 sm:p-12 border border-slate-800 shadow-2xl relative overflow-hidden">
            {/* Ambient glows */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.06),transparent_45%)] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(245,158,11,0.04),transparent_40%)] pointer-events-none" />

            <div className="relative z-10 max-w-4xl mx-auto text-center space-y-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-green-400 bg-green-500/10 text-[10px] font-black uppercase tracking-wider border border-green-500/20">
                Methodological Honesty
              </span>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-none text-slate-50 uppercase">
                Verifiable Integrity.<br />No AI Black-Box Promises.
              </h2>
              <p className="text-slate-300 text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
                Clean-Core.io accelerates your ABAP-to-Clean-Core migration&mdash;deterministic, with transparent coverage and honest limitations. You see exactly what is automated, what needs review, and what is structurally blocked per transformation&mdash;<strong>proven, not claimed.</strong>
              </p>

              {/* Grid of the three categories */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-left">
                {/* Card 1: Fully Grounded */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Fully Grounded</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Standard tables mapped to released CDS views, static calls, and single-class inheritance. Verified with a green result-set diff.
                  </p>
                </div>

                {/* Card 2: Quirk Review */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>Quirk Review</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Complex Joins (3+ tables), `FOR ALL ENTRIES` and `INTO CORRESPONDING` are flagged. Remediated via strict custom prompt rules.
                  </p>
                </div>

                {/* Card 3: Manual Handover */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-sm uppercase tracking-wider">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span>Manual Handover</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    GUI Dynpro screens, dynamic call routing, and kernel internals cannot be resolved by AI. Isolated cleanly for architect refactoring.
                  </p>
                </div>
              </div>

              <div className="pt-6">
                <Link 
                  href="/how-it-works"
                  className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-slate-900 font-black text-xs uppercase px-6 py-3.5 rounded-xl transition-all shadow-md tracking-wider"
                >
                  <span>Explore the full methodology</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison Highlight Table */}
        <div className="max-w-6xl mx-auto px-6 mt-20 relative z-20 animate-in fade-in slide-in-from-bottom-28 duration-1000 delay-800">
          <div className="bg-white rounded-[2rem] p-6 sm:p-10 md:p-12 border border-slate-200 shadow-xl relative overflow-hidden">
            {/* Glowing Accent */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(16,185,129,0.04),transparent_45%)] pointer-events-none" />
            
            <div className="relative z-10 text-center md:text-left mb-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-emerald-700 bg-emerald-50 text-[10px] font-black uppercase tracking-wider mb-4 border border-emerald-100">
                Complements Your SAP Toolchain
              </span>
              <h3 className="text-2xl sm:text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-none mb-4 uppercase">
                How We Complement Your SAP Tools
              </h3>
              <p className="text-slate-500 text-sm md:text-base max-w-3xl font-medium leading-relaxed">
The SAP ABAP Test Cockpit (ATC) is the authoritative check for Clean Core violations — keep using it. Clean-Core.io picks up from there: it maps each finding against SAP&apos;s Cloudification Repository and drafts BTP or RAP scaffolding for you to review, then validate back in your ABAP Development Tools (ADT) and ATC.
              </p>
              {catalogStats.classifiedObjects > 0 && (
                <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {catalogStats.classifiedObjects.toLocaleString()} classified SAP objects · Auto-synced from SAP&apos;s official repository
                </div>
              )}
            </div>

            {/* Mobile View: Stacked Comparison Cards (hidden on desktop) */}
            <div className="space-y-5 md:hidden relative z-10">
              {[
                {
                  title: "Clean Core Violation Scanning",
                  sap: { badge: "Static Check", desc: "Identifies unreleased APIs & direct database reads." },
                  cc: { badge: "Automated", desc: "Calculates Local Compliance score & prioritizes packages." }
                },
                {
                  title: "Developer HUD & Feedback",
                  sap: { badge: "Static Logs", desc: "Requires manually parsing warning lists or waiting for PDF consulting reports." },
                  cc: { badge: "Interactive", desc: "Visualizes compliance scores, code-minimap heatmaps, and developer checklists in real-time." }
                },
                {
                  title: "SAP Object Successor Mapping",
                  sap: { badge: "ATC Flags Only", desc: "SAP ATC flags unreleased API usage but doesn't resolve to successors." },
                  cc: { badge: "Resolved + Synced", desc: "Maps against SAP's official Cloudification Repository (23,000+ objects) with curated field-level precision. Auto-synced weekly." }
                },
                {
                  title: "Code Refactoring (Remediation)",
                  sap: { badge: "Manual Only", desc: "Developers must rewrite legacy code from scratch." },
                  cc: { badge: "Refactored", desc: "Converts legacy statements into BTP CAP Node.js/RAP syntax." }
                },
                {
                  title: "Sandbox Verification (BYOT)",
                  sap: { badge: "Not Supported", desc: "Requires separate manual testing frameworks." },
                  cc: { badge: "Validated", desc: "Runs test suites against your S/4HANA sandbox via encrypted, read-only connection. Never targets production." }
                },
                {
                  title: "Business Process Blueprinting",
                  sap: { badge: "Not Supported", desc: "No process flow visualization available." },
                  cc: { badge: "Visualized", desc: "Generates Business Process Model and Notation (BPMN 2.0) flows directly from custom code analysis." }
                }
              ].map((row, idx) => (
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
                        row.sap.badge === 'Static Check' 
                          ? 'text-slate-700 bg-slate-100 border border-slate-200/60' 
                          : 'text-slate-400 bg-slate-50 border border-slate-200/40'
                      }`}>
                        {row.sap.badge === 'Not Supported' && <span className="text-red-400">✕</span>}
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

              {[
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
                  cc: { badge: "Resolved + Synced", desc: "Maps against SAP's official Cloudification Repository (23,000+ objects) with curated field-level precision. Auto-synced weekly." }
                },
                {
                  title: "Code Refactoring (Remediation)",
                  sap: { badge: "Manual Only", level: "weak", desc: "Developers must rewrite legacy code from scratch." },
                  cc: { badge: "Refactored", desc: "Converts legacy statements into BTP CAP Node.js/RAP syntax." }
                },
                {
                  title: "Sandbox Verification",
                  sap: { badge: "Not Available", level: "none", desc: "Requires separate manual testing frameworks." },
                  cc: { badge: "Validated", desc: "Runs test suites against your S/4HANA sandbox via encrypted, read-only connection. Never targets production." }
                },
                {
                  title: "Business Process Blueprinting",
                  sap: { badge: "Not Available", level: "none", desc: "No process flow visualization available." },
                  cc: { badge: "Visualized", desc: "Generates Business Process Model and Notation (BPMN 2.0) flows directly from custom code analysis." }
                }
              ].map((row, idx) => (
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

      {/* Transformation Showroom */}
      <section className="py-24 md:py-32 bg-slate-50/50 border-y border-gray-200/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-green-700 bg-green-50 text-[10px] font-black uppercase tracking-wider mb-4 border border-green-100">
              Real Verified Output
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">Transformation Showroom</h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Representative engine outputs. Every example is a real transformation&mdash;verified, compiled, and tested against Clean-Core Engine {APP_VERSION}.</p>
          </div>
          <Suspense fallback={null}>
            <TransformationReplay />
          </Suspense>
          <TransformationShowroom />
          <Suspense fallback={null}>
            <SamplePackageDownload />
          </Suspense>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 md:py-32 bg-white relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">What You Can Do Today</h2>
            <p className="text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Every feature listed here is live and free to use&mdash;start with 5 transformations or bring your own API key for unlimited access.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'Extensibility Routing & Sign-Off',
                desc: 'Classifies legacy custom logic against SAP Clean Core guidelines, routes between In-App RAP and Side-by-Side CAP tracks, and gates transformation behind an explicit architecture decision.',
                link: '/sap-tier-2-extensions',
                testId: 'feature-extensibility-routing'
              },
              {
                icon: <Globe className="w-8 h-8 text-green-600" />,
                title: 'SAP Cloudification Catalog',
                desc: 'Maps legacy objects against SAP\'s official Cloudification Repository — the same source behind SAP ATC checks — layered with curated field-level mappings. Weekly auto-synced, versioned, and audit-traceable.',
                link: '/how-it-works',
                testId: 'feature-sap-api-hub-mapping'
              },
              {
                icon: <Cpu className="w-8 h-8 text-green-600" />,
                title: 'Dual RAP & CAP Engine',
                desc: 'Generates clean In-App ABAP Cloud RAP handlers or decoupled BTP CAP services. Powered by a deterministic AST resolver that linearizes OO inheritance chains before translation, preventing structural AI hallucinations.',
                link: '/how-it-works',
                testId: 'feature-dual-rap-cap-engine'
              },
              {
                icon: <Activity className="w-8 h-8 text-green-600" />,
                title: 'Modernization Assessment',
                desc: 'Computes complexity and business-criticality scores, extracts a full code inventory, and maps data coupling with standard SAP table risk analysis — all before transformation.',
                link: '/how-it-works',
                isNew: true,
                testId: 'feature-business-value-audit-tco'
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-green-600" />,
                title: 'Compliance & Audit Evidence',
                desc: 'Visual compliance dashboard with exportable audit pack: input fingerprints, architecture decision records, model cards, and known limitations — ready for governance reviews.',
                link: '/how-it-works',
                testId: 'feature-adt-cockpit-simulation'
              },
              {
                icon: <Layers className="w-8 h-8 text-green-600" />,
                title: 'BPMN 2.0 & Business Standard Operating Procedures',
                desc: 'Maps modernized processes into standard BPMN 2.0 XML with swimlanes. Features a two-stage blueprint layer with Responsible-Accountable-Consulted-Informed (RACI) matrices, Level 5 Standard Operating Procedure (SOP) narratives, and internal compliance controls.',
                link: '/knowledge',
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
      <section className="py-24 bg-slate-50/50 border-y border-gray-900/5 relative overflow-hidden">
        {/* Background ambient lighting */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-green-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="text-[10px] md:text-xs font-black bg-green-50 text-[#006b2c] px-3.5 py-1.5 rounded-full border border-green-150 uppercase tracking-widest inline-flex items-center gap-1.5 mb-4 select-none">
              🛡️ Sovereign & Secured
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-gray-955 tracking-tighter mb-4">
              Your Data Stays Yours
            </h2>
            <p className="text-gray-600 font-medium text-sm md:text-base max-w-xl mx-auto leading-relaxed">
              European hosting, GDPR-compliant by design, with full self-service data erasure control. We built the security architecture the way we&apos;d want it for our own SAP systems.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: <Globe className="w-6 h-6 text-green-600" />,
                title: "Belgium Hosting (Europe)",
                desc: "All workspaces, analytical engines, and database systems are hosted strictly in the europe-west1 GCP region (Belgium) ensuring high-speed processing."
              },
              {
                icon: <ShieldCheck className="w-6 h-6 text-green-600" />,
                title: "DSGVO / GDPR Compliant",
                desc: "Full enforcement of Art. 17 DSGVO. Purge all user footprints, uploads, and data in Settings. Transactional emails are securely routed via Resend API with DSGVO imprints."
              },
              {
                icon: <Layers className="w-6 h-6 text-green-600" />,
                title: "Cloud-Native Security",
                desc: "Fully containerized on Google Cloud Run with server-side encryption, stateless APIs, and zero persistent local data. All processing happens in hardened, ephemeral containers."
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
      <section className="py-24 md:py-32 bg-white relative overflow-hidden" id="access">
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-emerald-700 bg-emerald-50 text-[10px] font-black uppercase tracking-wider mb-4 border border-emerald-100">
              100% Free &mdash; No Credit Card Required
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-6 text-gray-950 tracking-tighter">Community Access</h2>
            <p className="text-base sm:text-lg md:text-xl text-gray-700 max-w-2xl mx-auto font-light">Every feature is included for free — no locked exports, no premium tiers. The only limit is 5 transformations; bring your own Gemini API key for unlimited runs. Both are 100% free.</p>
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
                <p className="text-xs md:text-sm font-medium mt-2 text-gray-500">Register with name and email &mdash; approval within 24 hours.</p>
              </div>
              <ul className="space-y-3.5 mb-10 flex-grow">
                {[
                  'Full 7-stage modernization workflow — every feature included',
                  'Up to 5 ABAP-to-Cloud transformations (RAP / CAP)',
                  'Deterministic evidence engine + compliance & criticality scoring',
                  'SAP API Business Hub mapping & Clean Core routing',
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
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 whitespace-nowrap px-2">
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
          <h2 className="text-3xl sm:text-4xl md:text-6xl font-black mb-8 tracking-tighter">Verify It Yourself</h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-12 font-light max-w-2xl mx-auto">Import the generated abapGit package into your Eclipse ADT, compile the code, and run the ABAP-Unit tests&mdash;all in your own sandbox.</p>
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
            </p>
            <div className="mt-12 text-[10px] sm:text-[11px] text-gray-550 max-w-2xl mx-auto leading-relaxed border border-gray-900 bg-gray-950/50 p-6 rounded-2xl text-left space-y-3">
              <span className="font-extrabold text-gray-400 uppercase tracking-widest block border-b border-gray-900 pb-1.5">Legal Disclaimer & Verification Notice</span>
              <p>
                <strong>Free Community Modernization Platform:</strong> Clean-Core.io is a free, community-powered research and Modernization Platform for SAP architects and developers, maintained by Felix Frenzel. No commercial licensing, subscriptions, or paid services are offered.
              </p>
              <p>
                <strong>AI-Assisted Drafts &mdash; Verify Before You Deploy:</strong> All solution designs, compliance scores, modular code transformations, and test suites are dynamically generated using third-party generative AI models (Google Gemini API). All artifacts are provided on an <em>&quot;AS IS&quot;</em> and <em>&quot;AS AVAILABLE&quot;</em> basis without warranties of any kind. This tool generates the first compliant draft&mdash;the architect reviews, tests, and approves. We provide the abapGit packages and ABAP-Unit tests so you can compile and verify every output in your own Eclipse ADT environment.
              </p>
              <p>
                <strong>Limitation of Liability:</strong> In no event shall the administrator, contributors, or developers be held liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, loss of data, system crashes, integration failures, or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort arising in any way out of the use of this software, even if advised of the possibility of such damage.
              </p>
              <p>
                <strong>Data Privacy & GDPR:</strong> This platform is deployed on secure European cloud nodes in the Belgium (europe-west1) region. Secure stateless proxy layers ensure that uploaded code is processed transiently and saved in your encrypted, user-isolated project workspace (never utilized by Google for LLM model training). All users retain the absolute right to immediate, recursive erasure (Art. 17 GDPR) via the settings dashboard.
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
