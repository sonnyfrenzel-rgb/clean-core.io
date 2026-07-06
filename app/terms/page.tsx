import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Terms of Service & Community Guidelines | Clean-Core.io',
  description:
    'The consolidated Terms of Service and Community Guidelines for Clean-Core.io — a free, non-commercial community project for the SAP community. Governed by German law.',
  alternates: {
    canonical: 'https://clean-core.io/terms',
  },
  openGraph: {
    title: 'Terms of Service & Community Guidelines | Clean-Core.io',
    description:
      'Consolidated Terms of Service and Community Guidelines for Clean-Core.io.',
    url: 'https://clean-core.io/terms',
    type: 'website',
  },
};

export default function TermsPage() {
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
          Terms of Service <span className="text-gray-400 font-medium text-2xl md:text-3xl">&amp; Community Guidelines</span>
        </h1>
        <p className="text-gray-600 leading-relaxed mb-12">
          Consolidated version — effective 8 July 2026 (v2.0.0). This document is the single authoritative version of the
          Terms of Service and Community Guidelines for the website and application available at clean-core.io (the
          &ldquo;Platform&rdquo;). It replaces and supersedes any prior text shown in the onboarding gate or the landing
          sign-up modal.
        </p>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          {/* Provider */}
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">Provider / Operator (Imprint)</h2>
            <p className="text-base">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany<br />
              Phone: +49 151 59200157<br />
              E-mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>
            </p>
            <p className="text-sm text-gray-500 mt-3">
              Clean-Core.io is a private, non-commercial community project for the SAP community. It is operated by the
              above-named individual and is not affiliated with, endorsed by, or connected to SAP SE or Google LLC.
            </p>
          </section>

          <hr className="border-gray-100" />

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">1. Scope and Purpose</h2>
            <p className="text-base mb-3">
              Clean-Core.io is a free community program provided solely for research and evaluation purposes in the domain
              of automated code modernization (ABAP to Cloud-Native, including Node.js). By registering for or using the
              Platform, you accept these Terms of Service and Community Guidelines (the &ldquo;Terms&rdquo;). If you do not
              agree, you may not use the Platform.
            </p>
            <p className="text-base">
              The Platform is intended for professional and evaluation use. By participating, you help shape and improve
              this community utility.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">2. Free Community Edition; No Fee</h2>
            <p className="text-base mb-3">
              Access to the Platform is provided completely free of charge. No payment, subscription, or consideration is
              required or accepted.
            </p>
            <p className="text-base">
              Because the Platform is provided free of charge and on a voluntary community basis, there is no entitlement to
              availability, specific features, support, or continued operation. The operator may modify, suspend, or
              discontinue the Platform, in whole or in part, at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">3. Nature of Generated Output; Mandatory Architect Review</h2>
            <p className="text-base mb-3">
              All modernization analyses, source code, and related artifacts produced by the Platform are automatically
              synthesized drafts. They are illustrative only and are not fit for productive use in their delivered state.
            </p>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <p className="text-sm text-amber-800">
                <strong>Architect Directive:</strong> Before applying, compiling, or deploying any generated code or
                artifact in a test, staging, or production environment, all files must be thoroughly inspected, validated,
                and approved by qualified software architects. You remain solely responsible for reviewing, testing, and
                approving any output before use.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">4. AI Code Generation and Limitation of Liability</h2>
            <p className="text-base mb-3">
              Modernization analyses and source code are generated automatically by generative AI models. The operator
              gives no warranty or guarantee as to the reliability, correctness, completeness, security, merchantability,
              fitness for a particular purpose, or compilation status of any output, to the extent permitted by law.
            </p>
            <p className="text-base mb-3">
              <strong>Limitation of liability:</strong> The operator is liable without limitation for damages arising from
              injury to life, body, or health caused by a breach of duty by the operator, and for damages caused
              intentionally or by gross negligence. Because the Platform is provided free of charge, the operator is
              otherwise liable only for intent and gross negligence.
            </p>
            <p className="text-base mb-3">
              Mandatory statutory liability, including under the German Product Liability Act (Produkthaftungsgesetz) and
              for the culpable breach of essential contractual obligations (Kardinalpflichten), remains unaffected. Where
              liability for slight negligence exists for the breach of an essential contractual obligation, it is limited to
              the foreseeable damage typical for this type of contract.
            </p>
            <p className="text-base">
              Nothing in these Terms excludes or limits liability that cannot be excluded or limited under applicable
              mandatory law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">5. Third-Party AI Services and Bring-Your-Own-Key (BYOK)</h2>
            <p className="text-base mb-3">
              The Platform relies on third-party generative AI services provided by Google (the Google Gemini API) to
              produce output. Providing your own key is optional: without it, the Platform uses a shared community key
              within the free quota (see section 6); with your own key, usage is not quota-limited. Where you provide your
              own API key (&ldquo;Bring Your Own Key&rdquo; / BYOK), that key is
              stored encrypted and is used solely to forward your requests to the Google Gemini API on your behalf via a
              secure backend proxy; your key is never exposed to the browser. Your use of the Google Gemini API is
              additionally subject to Google&rsquo;s own terms and privacy policy, over which the operator has no control.
            </p>
            <p className="text-base">
              Do not submit any content to the Platform that you are not permitted to disclose to the relevant third-party
              AI provider. The operator is not responsible for the processing of data by such third-party providers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">6. Usage Limits / Quota</h2>
            <p className="text-base">
              To keep the Platform available to the community, usage without your own API key is subject to a quota:
              currently a total of 5 transformations/analyses per user account. This is a one-time allotment and is not
              reset on a daily or monthly basis. When you provide your own Google Gemini API key (BYOK, see section 5), no
              quota applies. The operator may adjust, introduce, or remove quotas at any time to protect the stability and
              fair use of the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">7. Community Guidelines and Code of Conduct</h2>
            <p className="text-base mb-3">
              As a participant in the Free Community Edition, you agree to constructive and respectful rules of engagement:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
              <li>Do not upload malicious software, illegal scripts, or proprietary source code that violates intellectual property rights or confidentiality obligations.</li>
              <li>Maintain a respectful, collaborative, and professional tone in all community spaces.</li>
              <li>Report system hallucinations, security vulnerabilities, or compilation errors to help continuously refine the engine.</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              The operator may, at its discretion and without notice, remove content and suspend or terminate access for any
              user who violates these Terms or the Code of Conduct.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">8. Your Content, Intellectual Property, and Responsibility</h2>
            <p className="text-base mb-3">
              You warrant that you are entitled to upload and process any content, code, or data you submit to the Platform,
              and that doing so does not infringe any third-party rights (including intellectual property rights) or breach
              any confidentiality or data-protection obligation.
            </p>
            <p className="text-base mb-3">
              You retain all rights in the content you submit. To the extent required to operate the Platform, you grant the
              operator a non-exclusive, revocable right to process your submissions solely for the purpose of providing the
              service to you.
            </p>
            <p className="text-base">
              You indemnify and hold the operator harmless against third-party claims arising from your unlawful or
              contractually non-compliant use of the Platform, unless you are not responsible for the breach.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">9. Data Protection</h2>
            <p className="text-base">
              Personal data is processed in accordance with the EU General Data Protection Regulation (GDPR) and applicable
              German data-protection law. Details on the nature, scope, and purpose of processing are set out in the
              separate <Link href="/datenschutz" className="text-green-600 hover:underline font-semibold">Privacy Policy (Datenschutzerklärung)</Link> available on the Platform at clean-core.io.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">10. Changes to These Terms</h2>
            <p className="text-base">
              The operator may amend these Terms where necessary, for example to reflect changes in the Platform, in the
              third-party services used, or in the applicable law. The current version is published on the Platform.
              Continued use of the Platform after changes take effect constitutes acceptance of the amended Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">11. Governing Law and Jurisdiction</h2>
            <p className="text-base mb-3">
              These Terms and any dispute arising out of or in connection with them are governed by the laws of the Federal
              Republic of Germany, excluding the UN Convention on Contracts for the International Sale of Goods (CISG).
              Mandatory consumer-protection provisions of the country in which a consumer has their habitual residence remain
              unaffected.
            </p>
            <p className="text-base">
              To the extent permitted by law, the place of jurisdiction for all disputes is Bamberg, Germany. This choice of
              jurisdiction does not apply to consumers where prohibited by mandatory law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">12. Severability</h2>
            <p className="text-base">
              Should any provision of these Terms be or become invalid or unenforceable, the validity of the remaining
              provisions shall not be affected. The invalid or unenforceable provision shall be replaced by a valid
              provision that comes as close as legally possible to the economic purpose of the original provision.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">Contact</h2>
            <p className="text-base">
              Questions regarding these Terms can be directed to:<br />
              Felix Frenzel<br />
              Hellerstraße 9, 96047 Bamberg, Germany<br />
              Phone: +49 151 59200157<br />
              E-mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>
            </p>
          </section>

          <div className="pt-8 border-t border-gray-100 text-center text-[10px] text-gray-400 font-black font-mono uppercase tracking-wider">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </main>
    </div>
  );
}
