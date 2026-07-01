import type { Metadata } from 'next';
import { Shield, ShieldCheck, Globe, Lock, Server, Eye, KeyRound, Users, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';

export const metadata: Metadata = {
  title: 'Tenant Security — How We Protect Your S/4HANA Connection | Clean-Core.io',
  description: 'Understand how Clean-Core.io secures live S/4HANA tenant connections: read-only scopes, stateless processing, and manual admin onboarding gates.',
  alternates: {
    canonical: 'https://clean-core.io/tenant-security',
  },
  openGraph: {
    title: 'Tenant Security — How We Protect Your S/4HANA Connection | Clean-Core.io',
    description: 'Understand how Clean-Core.io secures live S/4HANA tenant connections: read-only scopes, stateless processing, and manual admin onboarding gates.',
    url: 'https://clean-core.io/tenant-security',
    type: 'website',
  }
};

export default function TenantSecurityPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 animate-in fade-in duration-300 bg-white min-h-screen text-gray-900 font-sans">

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackButton />
      </div>

      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-[2.5rem] p-8 sm:p-12 shadow-2xl relative overflow-hidden border border-slate-700/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none"></div>
        <div className="relative z-10 max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-green-500/15 border border-green-400/30 px-4 py-1.5 rounded-full text-xs font-bold text-green-400 tracking-wide uppercase">
            <Shield size={14} /> Tenant Security
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none text-slate-50">
            How We Protect Your <span className="text-green-400">S/4HANA</span> Connection
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed max-w-2xl font-medium">
            When you connect a live S/4HANA tenant, security is non-negotiable. Here is exactly how Clean-Core.io handles your credentials, data, and access — with full transparency.
          </p>
        </div>
      </div>

      {/* Section 1: Read-Only Scope */}
      <section id="read-only-scope" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center border border-green-100 shadow-sm shrink-0">
            <Shield className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-950">Read-Only Scope</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">No write operations — ever.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 sm:p-8 space-y-5">
          <p className="text-gray-700 leading-relaxed font-medium">
            Every tenant connection is strictly limited to <strong>read-only OData metadata requests</strong> and test executions. Clean-Core.io never writes, modifies, or deletes any data on your S/4HANA system.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-5 h-5 text-green-600" />
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">What We Read</h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 font-medium">
                <li className="flex items-start gap-2"><span className="text-green-600 font-bold mt-0.5">✓</span> OData service metadata ($metadata endpoints)</li>
                <li className="flex items-start gap-2"><span className="text-green-600 font-bold mt-0.5">✓</span> ABAP Unit test results from test execution</li>
                <li className="flex items-start gap-2"><span className="text-green-600 font-bold mt-0.5">✓</span> Custom code analysis reports (ATC/SCI)</li>
              </ul>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-red-500" />
                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">What We Never Do</h4>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 font-medium">
                <li className="flex items-start gap-2"><span className="text-red-500 font-bold mt-0.5">✕</span> No POST, PUT, PATCH, or DELETE operations</li>
                <li className="flex items-start gap-2"><span className="text-red-500 font-bold mt-0.5">✕</span> No transport releases or workbench changes</li>
                <li className="flex items-start gap-2"><span className="text-red-500 font-bold mt-0.5">✕</span> No data exports or bulk reads from business tables</li>
              </ul>
            </div>
          </div>

          <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 text-xs text-amber-900 font-medium leading-relaxed">
            <strong>Recommendation:</strong> We strongly advise creating a <strong>dedicated technical communication user</strong> with minimal, read-only authorizations (e.g., S_SERVICE scope restricted to metadata endpoints) on your S/4HANA system for Clean-Core.io connections.
          </div>
        </div>
      </section>

      {/* Section 2: Stateless Processing */}
      <section id="stateless-processing" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center border border-green-100 shadow-sm shrink-0">
            <ShieldCheck className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-950">Secure Storage &amp; Stateless Transit</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Encrypted credentials and transient business data.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 sm:p-8 space-y-5">
          <p className="text-gray-700 leading-relaxed font-medium">
            Your connection credentials are encrypted using AES-256-GCM and stored securely on Google Cloud Platform in Europe (completely blocked from direct client SDK access). All actual business data (such as transactional records or metadata lists) retrieved from your S/4HANA OData tenant is processed transiently and never persisted, cached, or logged on our servers. Uploaded code files are stored in your encrypted, user-isolated project workspace, which you can permanently delete at any time.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-center">
              <KeyRound className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2">Credential Isolation</h4>
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                Credentials are decrypted only within the server-side proxy at execution time. They are never exposed to client-side APIs or browser storage.
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-center">
              <Server className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2">Stateless Business Transit</h4>
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                The backend OData transit layer is fully stateless. No business records or transaction responses are stored after execution.
              </p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm text-center">
              <Globe className="w-8 h-8 text-green-600 mx-auto mb-3" />
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider mb-2">EU-Region Hosting</h4>
              <p className="text-xs text-gray-600 font-medium leading-relaxed">
                All processing happens in the GCP europe-west1 (Belgium) region, ensuring GDPR-compliant data residency within the European Union.
              </p>
            </div>
          </div>

          <div className="bg-green-50/50 border border-green-200/60 rounded-xl p-4 text-xs text-green-900 font-medium leading-relaxed">
            <strong>BTP Destination Service:</strong> For maximum security, we recommend importing your connection as a standard <strong>BTP HTTP Destination JSON</strong> instead of manually entering credentials. This inherits your existing BTP connectivity profiles and OAuth configurations.
          </div>
        </div>
      </section>

      {/* Section 3: Admin Onboarding Gate */}
      <section id="admin-onboarding-gate" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center border border-green-100 shadow-sm shrink-0">
            <Users className="w-7 h-7 text-green-600" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-gray-950">Admin Onboarding Gate</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Manual review and approval for every connection request.</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-gray-200 rounded-[2rem] p-6 sm:p-8 space-y-5">
          <p className="text-gray-700 leading-relaxed font-medium">
            To prevent misuse during the community pilot, <strong>every tenant connection request is manually reviewed and approved</strong> by our admin team before activation. There is no self-service provisioning — this is by design.
          </p>

          <div className="space-y-4">
            <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">How the Approval Process Works</h4>

            <div className="space-y-3">
              {[
                { step: '1', title: 'You Submit a Connection Request', desc: 'After signing in, navigate to your project settings and submit a tenant connection request with your system details (hostname, client, communication user).' },
                { step: '2', title: 'Admin Review', desc: 'Our team receives a notification and manually reviews the request. We verify the legitimacy of the connection details and the requesting user account.' },
                { step: '3', title: 'Approval or Feedback', desc: 'Once approved, your tenant connection is activated and you receive an email confirmation. If we have questions, we reach out before activation.' },
                { step: '4', title: 'Active Monitoring', desc: 'Connected tenants are monitored for unusual activity. Access can be revoked at any time if misuse is detected.' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                  <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white text-sm font-black shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-gray-900">{item.title}</h5>
                    <p className="text-xs text-gray-600 font-medium leading-relaxed mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 text-xs text-amber-900 font-medium leading-relaxed">
            <strong>Why manual approval?</strong> Since this is a free community pilot, we want to ensure every connection is legitimate and intentional. This protects both the platform and your system from unintended exposure.
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="text-center pt-4 pb-8">
        <p className="text-sm text-gray-500 font-medium mb-4">
          Questions about tenant security? Reach out anytime.
        </p>
        <div className="flex items-center justify-center gap-3">
          <a
            href="mailto:info@clean-core.io"
            className="inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all shadow-md hover:shadow-lg"
          >
            Contact Us
          </a>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-bold text-sm hover:bg-gray-200 transition-all border border-gray-200"
          >
            About the Project
          </Link>
        </div>
      </div>
    </div>
  );
}
