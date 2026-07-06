import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
  description: 'Privacy policy (Datenschutzerklärung) for Clean-Core.io. GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
  alternates: {
    canonical: 'https://clean-core.io/datenschutz',
  },
  openGraph: {
    title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
    description: 'GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
    url: 'https://clean-core.io/datenschutz',
    type: 'website',
  },
};

export default function DatenschutzPage() {
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
          Privacy Policy <span className="text-gray-400 font-medium text-2xl md:text-3xl">(Datenschutzerklärung)</span>
        </h1>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              1. Privacy at a Glance
            </h2>
            <p className="text-base mb-3">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our platform (Free Community Edition).
            </p>
            <p className="text-sm text-gray-500">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              2. Data Collection &amp; Processing Purposes
            </h2>
            <p className="text-base mb-4">
              We process personal data of our users only as far as necessary to provide a functional platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges.
              </li>
              <li>
                <strong className="text-gray-800">Firestore User Profiles:</strong> We store metadata about your platform usage (e.g., number of performed code transformations, system limits, as well as your first and last name) in our secure database.
              </li>
              <li>
                <strong className="text-gray-800">Bring Your Own Key (BYOK):</strong> Providing your own key is optional; without it, transformations use a shared community key within your free quota. If you configure your own Google Gemini API key in the settings, this key is encrypted and stored in our secure Firestore instance. It is used exclusively to forward your transformation requests directly via a secure backend proxy to the Gemini API, never exposing your key to the browser.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              3. Processing of Source Code &amp; Project Assets
            </h2>
            <p className="text-base mb-3">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl">
              <p className="text-sm text-green-800">
                <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong> using stateless API requests. Under Google&apos;s applicable API data-use terms, this content is not used to train Google&apos;s foundational AI models. When you use your own key (BYOK), the terms of your own Google account additionally apply.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              4. Hosting &amp; Subprocessors
            </h2>
            <p className="text-base mb-4">
              To provide this service, we rely on the following subprocessors:
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google Cloud Platform &amp; Firebase:</strong> Hosting, authentication, and database operations on European servers in the <strong>Belgium (europe-west1)</strong> region — data residency in the EU, operated in line with GDPR requirements.
              </li>
              <li>
                <strong className="text-gray-800">Google Gemini API:</strong> Generative AI models used exclusively for code transformation, via secure stateless proxy layers.
              </li>
              <li>
                <strong className="text-gray-800">Resend:</strong> Transactional email delivery (e.g. access-approval and status notifications). Your email address is processed to send these messages.
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              <strong>International transfers:</strong> Google and Resend are US-based providers. Where personal data is transferred outside the EU/EEA, it is safeguarded by the EU Standard Contractual Clauses (SCCs) and the providers&apos; data-processing terms; hosting and storage of your projects remain in the EU (europe-west1).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              5. Your Rights Under GDPR (including Art. 17 Deletion)
            </h2>
            <p className="text-base mb-4">
              Since our platform is hosted in compliance with EU regulations, you have all rights under the General Data Protection Regulation (GDPR):
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
              <li>Right of Access (Art. 15 GDPR)</li>
              <li>Right to Rectification (Art. 16 GDPR)</li>
              <li>Right to Erasure / &quot;Right to be Forgotten&quot; (Art. 17 GDPR)</li>
              <li>Right to Restriction of Processing (Art. 18 GDPR)</li>
              <li>Right to Data Portability (Art. 20 GDPR)</li>
              <li>Right to Withdraw Consent (Art. 7 Abs. 3 GDPR)</li>
              <li>Right to Lodge a Complaint with a Supervisory Authority (Art. 77 GDPR)</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              To exercise these rights, particularly to erase your data, you can trigger account deletion directly in your Profile Settings under the <strong>Danger Zone</strong>, which immediately deletes your live database and authentication entries. Residual copies in encrypted backups age out within 30 days (see section 6). Alternatively, contact us at <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              6. Legal Basis &amp; Data Retention
            </h2>
            <p className="text-base mb-3">
              <strong>Legal basis (Art. 6 GDPR):</strong> We process account and usage data to perform the service you request (Art. 6(1)(b)), to operate and secure the platform under our legitimate interest (Art. 6(1)(f)), and — where applicable — on your consent (Art. 6(1)(a)), which you may withdraw at any time.
            </p>
            <p className="text-base">
              <strong>Retention:</strong> Personal data is retained for the life of your account and removed on account erasure (Art. 17); residual copies in encrypted backups age out within 30 days. Security audit records may be kept longer where required for accountability. Detailed per-collection retention is documented in our internal data-retention policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              7. Cookies &amp; Tracking
            </h2>
            <p className="text-base">
              Clean-Core.io uses only strictly necessary cookies and local storage required to authenticate you and maintain your session via Google Firebase Authentication. We do not use analytics, advertising, or tracking cookies, and we embed no third-party marketing or profiling trackers. Because only essential, functional storage is used, no cookie-consent banner is required (§ 25(2) TDDDG / ePrivacy Directive).
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
