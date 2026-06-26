import type { Metadata } from 'next';
import { BookOpen, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import HowToClient from '@/components/HowToClient';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

// Server-side Metadata configuration for SEO & GEO Crawlers
export const metadata: Metadata = {
  title: 'SAP S/4HANA Clean Core Modernization Guide | Clean-Core.io',
  description: 'Follow our interactive walkthrough to learn how to refactor legacy ABAP structures into modern Node.js and TypeScript BTP applications.',
  alternates: {
    canonical: 'https://clean-core.io/how-to',
  },
  openGraph: {
    title: 'SAP S/4HANA Clean Core Modernization Guide | Clean-Core.io',
    description: 'Follow our interactive walkthrough to learn how to refactor legacy ABAP structures into modern Node.js and TypeScript BTP applications.',
    url: 'https://clean-core.io/how-to',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
};

const steps = [
  {
    title: "Phase 1: Technical Analytics",
    text: "Upload custom legacy ABAP source files. The static analysis engine parses custom code and calculates a compliance baseline."
  },
  {
    title: "Phase 2: Solution Design",
    text: "Design the side-by-side target architecture. Map custom legacy structures to versioned API routes and Node.js BTP applications."
  },
  {
    title: "Phase 3: Code Transformation",
    text: "Audit the code conversion. The editor translates legacy ABAP statements into modern Node.js CAP TypeScript services."
  },
  {
    title: "Phase 4: Testing & Sandbox",
    text: "Execute tests in a secure sandbox. Run simulations against S/4HANA tenants to verify compliance."
  },
  {
    title: "Phase 5: Process Blueprint",
    text: "Document business processes. Export BPMN 2.0 XML diagrams designed for direct import into SAP Signavio or SAP Build."
  },
  {
    title: "Phase 6: Project Delivery",
    text: "Download the completed BTP cloud service ZIP bundle including schema definitions, controllers, and tests."
  }
];

export default function HowToPage() {
  // Generate dynamic HowTo JSON-LD schema for crawlers
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "SAP S/4HANA Clean Core Modernization Guide",
    "description": "Learn how to analyze, refactor, and deploy legacy ERP custom code side-by-side on SAP BTP using artificial intelligence.",
    "step": steps.map((step, idx) => ({
      "@type": "HowToStep",
      "position": idx + 1,
      "name": step.title,
      "text": step.text
    }))
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-300">
      
      {/* HowTo JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      {/* Back to Workspace Navigation Link */}
      <div className="flex items-center justify-start">
        <Link 
          href="/dashboard" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-green-600 transition-all bg-white px-5 py-2.5 rounded-full border border-gray-200 hover:border-green-200 hover:bg-green-50/50 hover:shadow-sm shadow-slate-100"
        >
          <ArrowLeft size={14} /> Back to Workspace
        </Link>
      </div>

      {/* Upper Glassmorphic Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
              <BookOpen size={14} /> How-to Tutorials
            </div>
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-4 py-1.5 rounded-full text-xs font-bold text-slate-350 tracking-wide uppercase">
              Version {APP_VERSION} ({APP_RELEASE_DATE})
            </div>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            Clean-Core.io <span className="text-green-400">How-to</span>
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            Learn how enterprise architects safely analyze, refactor, and deploy legacy ERP custom code side-by-side on SAP BTP using artificial intelligence.
          </p>
        </div>
      </div>

      {/* Client-side Slideshow Component */}
      <HowToClient />

    </div>
  );
}
