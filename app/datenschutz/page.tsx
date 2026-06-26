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
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our Pilot program.
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
              We process personal data of our users only as far as necessary to provide a functional pilot platform as well as our contents and services.
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges.
              </li>
              <li>
                <strong className="text-gray-800">Firestore User Profiles:</strong> We store metadata about your platform usage (e.g., number of performed code transformations, system limits, as well as your first and last name) in our secure database.
              </li>
              <li>
                <strong className="text-gray-800">Bring Your Own Key (BYOK):</strong> If you configure your own Google Gemini API key in the settings, this key is encrypted and stored in our secure Firestore instance. It is used exclusively to forward your transformation requests directly via a secure backend proxy to the Gemini API, never exposing your key to the browser.
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
                <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong>. Our integration utilizes stateless API requests, meaning that your uploaded codes and projects are never stored or used to train Google&apos;s foundational AI models.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              4. Cloud Node Hosting &amp; Third-Party Services
            </h2>
            <p className="text-base mb-4">
              To provide this service, we rely on the following trusted cloud services:
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google Cloud Platform &amp; Firebase:</strong> Hosted on secure European servers in the <strong>Belgium (europe-west1)</strong> region for low-latency, fully GDPR-compliant authentication and database operations.
              </li>
              <li>
                <strong className="text-gray-800">Google Gemini API:</strong> Generative AI models used exclusively for code transformation, utilizing secure stateless proxy layers.
              </li>
            </ul>
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
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              To exercise these rights, particularly to cascadingly erase all your data immediately, you can trigger account deletion directly in your Profile Settings under the <strong>Danger Zone</strong>, which will permanently and instantly wipe all database and authentication entries. Alternatively, contact us at <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
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
