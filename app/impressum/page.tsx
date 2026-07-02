import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Impressum – Legal Notice | Clean-Core.io',
  description: 'Legal notice (Impressum) for Clean-Core.io according to § 5 TMG. Contact information, responsible person, and disclaimer.',
  alternates: {
    canonical: 'https://clean-core.io/impressum',
  },
  openGraph: {
    title: 'Impressum – Legal Notice | Clean-Core.io',
    description: 'Legal notice (Impressum) for Clean-Core.io according to § 5 TMG.',
    url: 'https://clean-core.io/impressum',
    type: 'website',
  },
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-lg tracking-tight text-gray-900">Clean-Core<span className="text-green-600">.io</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-black text-gray-950 tracking-tighter mb-12">
          Legal Notice <span className="text-gray-400 font-medium text-2xl md:text-3xl">(Impressum)</span>
        </h1>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Information according to § 5 TMG
            </h2>
            <p className="text-base">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Contact
            </h2>
            <p className="text-base">
              Phone: +49 151 59200157<br />
              E-Mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a><br />
              Website: <a href="https://www.clean-core.io" className="text-green-600 hover:underline font-semibold">www.clean-core.io</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Responsible for Content under § 18 Abs. 2 MStV
            </h2>
            <p className="text-base">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </section>

          <hr className="border-gray-100" />

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Disclaimer
            </h2>
            <div className="space-y-4 text-sm text-gray-600">
              <p>
                <strong className="text-gray-800">Liability for Content:</strong> The contents of our pages were created with the greatest care. Since this is a non-commercial, collaborative research pilot application (Free Community Edition), we cannot assume any guarantee for the accuracy, completeness, error-free code transformation, or continuous availability of the provided modernization results.
              </p>
              <p>
                <strong className="text-gray-800">Copyright:</strong> The content and works created by the site operator on these pages are subject to German copyright law. Contributions from third parties are marked as such. Reproduction, editing, and distribution require written consent.
              </p>
            </div>
          </section>

          <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
            <p className="text-sm text-amber-800 font-bold">
              Important Note: Clean-Core.io is a purely academic, non-commercial tool for testing modern software architectures in the context of legacy code. No paid services are offered.
            </p>
          </div>

          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-600">Trademark Notice:</strong> SAP, S/4HANA, ABAP, BTP, SAP Signavio, SAP Build, and SAP Cloud ALM are trademarks or registered trademarks of SAP SE or its affiliates. Clean-Core.io is an independent project and is not endorsed, certified, or sponsored by SAP SE unless explicitly stated.
            </p>
          </div>

          <div className="pt-8 border-t border-gray-100 text-center text-[10px] text-gray-400 font-black font-mono uppercase tracking-wider">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </main>
    </div>
  );
}
