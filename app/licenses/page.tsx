import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Third-Party Notices & Licenses | Clean-Core.io',
  description:
    'Open-source software and data that Clean-Core.io is built on, with the required attributions — including the SAP Cloudification Repository under Apache-2.0.',
  alternates: {
    canonical: 'https://clean-core.io/licenses',
  },
  openGraph: {
    title: 'Third-Party Notices & Licenses | Clean-Core.io',
    description:
      'Attributions for the open-source software and data Clean-Core.io is built on.',
    url: 'https://clean-core.io/licenses',
    type: 'website',
  },
};

/** Direct production dependencies grouped by their SPDX license (verified against installed packages). */
const COMPONENTS: { license: string; packages: string[] }[] = [
  {
    license: 'MIT',
    packages: [
      'next', 'react', 'react-dom', 'react-markdown', 'react-syntax-highlighter',
      'recharts', 'mermaid', 'motion', '@xyflow/react', '@hookform/resolvers',
      'marked', 'date-fns', 'clsx', 'tailwind-merge', 'exceljs', 'file-saver',
      'jsdom', 'jwks-rsa', 'pino', 'pino-pretty', 'postcss', 'autoprefixer',
      'esbuild', 'tsx', '@next/bundle-analyzer',
    ],
  },
  {
    license: 'Apache-2.0',
    packages: ['firebase', 'firebase-admin', '@google/genai', 'class-variance-authority'],
  },
  { license: 'ISC', packages: ['lucide-react'] },
  { license: 'MPL-2.0 OR Apache-2.0', packages: ['dompurify'] },
  { license: 'MIT OR GPL-3.0-or-later', packages: ['jszip'] },
];

/** Aggregate license breakdown across the full production dependency tree (CycloneDX SBOM). */
const TREE_SUMMARY: { license: string; count: number }[] = [
  { license: 'MIT', count: 540 },
  { license: 'Apache-2.0', count: 89 },
  { license: 'ISC', count: 69 },
  { license: 'BSD-3-Clause', count: 25 },
  { license: 'BlueOak-1.0.0', count: 5 },
  { license: 'BSD-2-Clause', count: 4 },
  { license: 'Other permissive (MIT-0, 0BSD, CC0-1.0, Unlicense, …)', count: 14 },
];

export default function LicensesPage() {
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
        <h1 className="text-3xl md:text-5xl font-black text-gray-950 tracking-tighter mb-4">
          Third-Party Notices <span className="text-gray-400 font-medium text-2xl md:text-3xl">&amp; Licenses</span>
        </h1>
        <p className="text-gray-600 leading-relaxed mb-12">
          Clean-Core.io is built on and incorporates third-party open-source software and data.
          We are grateful to their authors. This page provides the required attributions and license references.
        </p>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* SAP Cloudification Repository */}
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Data — SAP Cloudification Repository
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Clean-Core.io incorporates data from the <strong>SAP Cloudification Repository</strong>{' '}
                (<a href="https://github.com/SAP/abap-atc-cr-cv-s4hc" className="text-green-600 hover:underline font-semibold" target="_blank" rel="noopener noreferrer">github.com/SAP/abap-atc-cr-cv-s4hc</a>),
                © 2020–{new Date().getFullYear()} SAP SE or an SAP affiliate company and the{' '}
                <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">abap-atc-cr-cv-s4hc</code> contributors.
              </p>
              <p>
                Licensed under the <strong>Apache License, Version 2.0</strong>. A copy of the license is available at{' '}
                <a href="https://www.apache.org/licenses/LICENSE-2.0" className="text-green-600 hover:underline font-semibold" target="_blank" rel="noopener noreferrer">apache.org/licenses/LICENSE-2.0</a>.
              </p>
              <p>
                <strong className="text-gray-800">Modifications:</strong> the data has been normalized to Clean-Core.io&rsquo;s
                internal catalog schema and merged with Clean-Core.io&rsquo;s own curated mappings, which take precedence.
              </p>
              <p>
                <strong className="text-gray-800">No NOTICE file:</strong> the upstream repository does not ship an
                Apache <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">NOTICE</code> text file, so Apache-2.0 §4(d) does not apply.
              </p>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Direct components */}
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Software Components
            </h2>
            <p className="text-sm mb-5">
              Clean-Core.io&rsquo;s primary open-source components, grouped by license. Each component remains under its own
              license; the full license texts are available in the respective projects.
            </p>
            <div className="space-y-4">
              {COMPONENTS.map((group) => (
                <div key={group.license} className="rounded-2xl border border-gray-200 p-4">
                  <div className="text-[11px] font-black text-green-700 uppercase tracking-widest mb-2">{group.license}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.packages.map((pkg) => (
                      <code key={pkg} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{pkg}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Full tree summary */}
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              Full Dependency Tree
            </h2>
            <p className="text-sm mb-4">
              A complete CycloneDX SBOM is generated on every build in our CI pipeline. Across the full production
              dependency tree, license usage breaks down as follows — all permissive:
            </p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm border-collapse min-w-[320px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 px-2 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">License</th>
                    <th className="py-2 px-2 text-right text-[10px] font-bold text-gray-400 uppercase tracking-wider">Components</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {TREE_SUMMARY.map((row) => (
                    <tr key={row.license}>
                      <td className="py-2 px-2 text-gray-700">{row.license}</td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-gray-800">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* AI models */}
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              AI Models
            </h2>
            <p className="text-sm">
              AI processing uses the <strong>Google Gemini API</strong>. When you use your own key (BYOK), your use is
              governed by your agreement with Google and Google&rsquo;s applicable terms.
            </p>
          </section>

          {/* Trademarks */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              <strong className="text-slate-600">Trademark Notice:</strong> SAP, S/4HANA, ABAP and other SAP product
              names are trademarks of SAP SE, used for identification and reference only. Clean-Core.io is an independent
              project and is not affiliated with, or endorsed by, SAP SE (Apache-2.0 §6 grants no trademark rights).
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
