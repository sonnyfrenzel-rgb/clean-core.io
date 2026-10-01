import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { Shield, ShieldCheck, Globe, Lock, Server, Eye, KeyRound, Users, Check, X } from 'lucide-react';
import Link from 'next/link';
import BackLink from '@/components/BackLink';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { publicButton } from '@/components/landing/public-button';

export const metadata: Metadata = withTwitterCard({
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
});

export default function TenantSecurityPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 min-h-screen text-cc-ink">

      {/* Navigation */}
      <div className="flex items-center justify-start">
        <BackLink />
      </div>

      {/* Hero Banner */}
      <div className="bg-cc-surface rounded-3xl p-8 sm:p-12 border border-cc-line">
        <div className="max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 bg-cc-brand-surface border border-cc-brand px-4 py-1 rounded-full text-xs font-bold text-cc-brand-strong tracking-wide uppercase">
            <Shield size={14} aria-hidden="true" /> Tenant Security
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-none text-cc-ink">
            How We Protect Your <span className="text-cc-brand-strong">S/4HANA</span> Connection
          </h1>
          <p className="text-lg text-cc-ink-muted leading-relaxed max-w-2xl font-medium">
            When you connect a live S/4HANA tenant, security is non-negotiable. Here is exactly how Clean-Core.io handles your credentials, data, and access — with full transparency.
          </p>
        </div>
      </div>

      {/* Section 1: Read-Only Scope */}
      <section id="read-only-scope" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cc-brand-surface flex items-center justify-center border border-cc-brand shrink-0">
            <Shield className="w-7 h-7 text-cc-brand-strong" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">Read-Only Scope</h2>
            <p className="text-sm text-cc-ink-muted font-medium mt-1">No write operations — ever.</p>
          </div>
        </div>

        <div className="bg-cc-surface border border-cc-line rounded-3xl p-6 sm:p-8 space-y-5">
          <p className="text-cc-ink leading-relaxed font-medium">
            Every tenant connection is strictly limited to a <strong>connection check, read-only OData metadata requests</strong> and read-only OData GET requests, each one started by you. Running generated tests against the tenant is locked until the isolated live runner has passed its review. Clean-Core.io never writes, modifies, or deletes any data on your S/4HANA system.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-cc-surface-muted p-5 rounded-xl border border-cc-line">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-5 h-5 text-cc-brand-strong" aria-hidden="true" />
                <h3 className="text-sm font-extrabold text-cc-ink uppercase tracking-wider">What We Read</h3>
              </div>
              <ul className="space-y-2 text-sm text-cc-ink-muted font-medium">
                <li className="flex items-start gap-2"><Check size={16} strokeWidth={3} aria-hidden="true" className="text-cc-success mt-0.5 shrink-0" /> OData service metadata ($metadata endpoints)</li>
                <li className="flex items-start gap-2"><Check size={16} strokeWidth={3} aria-hidden="true" className="text-cc-success mt-0.5 shrink-0" /> Read-only OData responses for the entities you choose to read</li>
              </ul>
            </div>
            <div className="bg-cc-surface-muted p-5 rounded-xl border border-cc-line">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-cc-error" aria-hidden="true" />
                <h3 className="text-sm font-extrabold text-cc-ink uppercase tracking-wider">What We Never Do</h3>
              </div>
              <ul className="space-y-2 text-sm text-cc-ink-muted font-medium">
                <li className="flex items-start gap-2"><X size={16} strokeWidth={3} aria-hidden="true" className="text-cc-error mt-0.5 shrink-0" /> No POST, PUT, PATCH, or DELETE operations</li>
                <li className="flex items-start gap-2"><X size={16} strokeWidth={3} aria-hidden="true" className="text-cc-error mt-0.5 shrink-0" /> No transport releases or workbench changes</li>
                <li className="flex items-start gap-2"><X size={16} strokeWidth={3} aria-hidden="true" className="text-cc-error mt-0.5 shrink-0" /> No data exports or bulk reads from business tables</li>
              </ul>
            </div>
          </div>

          <CcMessageStrip state="information" headline="Recommendation:">
            We strongly advise creating a <strong>dedicated technical communication user</strong> with minimal, read-only authorizations (e.g., S_SERVICE scope restricted to metadata endpoints) on your S/4HANA system for Clean-Core.io connections.
          </CcMessageStrip>
        </div>
      </section>

      {/* Section 2: Stateless Processing */}
      <section id="stateless-processing" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cc-brand-surface flex items-center justify-center border border-cc-brand shrink-0">
            <ShieldCheck className="w-7 h-7 text-cc-brand-strong" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">Secure Storage &amp; Stateless Transit</h2>
            <p className="text-sm text-cc-ink-muted font-medium mt-1">Encrypted credentials and transient business data.</p>
          </div>
        </div>

        <div className="bg-cc-surface border border-cc-line rounded-3xl p-6 sm:p-8 space-y-5">
          <p className="text-cc-ink leading-relaxed font-medium">
            Your connection credentials are encrypted using AES-256-GCM and stored securely on Google Cloud Platform in Europe (completely blocked from direct client SDK access). All actual business data (such as transactional records or metadata lists) retrieved from your S/4HANA OData tenant is processed transiently and never persisted, cached, or logged on our servers. Uploaded code files are stored in your encrypted, user-isolated project workspace, which you can permanently delete at any time.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-cc-surface-muted p-5 rounded-xl border border-cc-line text-center">
              <KeyRound className="w-8 h-8 text-cc-brand-strong mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-xs font-extrabold text-cc-ink uppercase tracking-wider mb-2">Credential Isolation</h3>
              <p className="text-xs text-cc-ink-muted font-medium leading-relaxed">
                Credentials are decrypted only within the server-side proxy at execution time. They are never exposed to client-side APIs or browser storage.
              </p>
            </div>
            <div className="bg-cc-surface-muted p-5 rounded-xl border border-cc-line text-center">
              <Server className="w-8 h-8 text-cc-brand-strong mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-xs font-extrabold text-cc-ink uppercase tracking-wider mb-2">Stateless Business Transit</h3>
              <p className="text-xs text-cc-ink-muted font-medium leading-relaxed">
                The backend OData transit layer is fully stateless. No business records or transaction responses are stored after execution.
              </p>
            </div>
            <div className="bg-cc-surface-muted p-5 rounded-xl border border-cc-line text-center">
              <Globe className="w-8 h-8 text-cc-brand-strong mx-auto mb-3" aria-hidden="true" />
              <h3 className="text-xs font-extrabold text-cc-ink uppercase tracking-wider mb-2">EU-Region Hosting</h3>
              <p className="text-xs text-cc-ink-muted font-medium leading-relaxed">
                Hosting, the database and every call to your tenant run in the GCP europe-west1 (Belgium) region. The Gemini API and the mail provider are separate subprocessors, named with their transfer safeguards in the privacy policy.
              </p>
            </div>
          </div>

          <CcMessageStrip state="information" headline="BTP Destination Service:">
            For maximum security, we recommend importing your connection as a standard <strong>BTP HTTP Destination JSON</strong> instead of manually entering credentials. This inherits your existing BTP connectivity profiles and OAuth configurations.
          </CcMessageStrip>
        </div>
      </section>

      {/* Section 3: Admin Onboarding Gate */}
      <section id="admin-onboarding-gate" className="scroll-mt-24 space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cc-brand-surface flex items-center justify-center border border-cc-brand shrink-0">
            <Users className="w-7 h-7 text-cc-brand-strong" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-cc-ink">Admin Onboarding Gate</h2>
            <p className="text-sm text-cc-ink-muted font-medium mt-1">Manual review and approval for every connection request.</p>
          </div>
        </div>

        <div className="bg-cc-surface border border-cc-line rounded-3xl p-6 sm:p-8 space-y-5">
          <p className="text-cc-ink leading-relaxed font-medium">
            To prevent misuse during the Free Community Edition, <strong>every tenant connection request is manually reviewed and approved</strong> by our admin team before activation. There is no self-service provisioning — this is by design.
          </p>

          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-cc-ink uppercase tracking-wider">How the Approval Process Works</h3>

            <div className="space-y-3">
              {[
                { step: '1', title: 'You Submit a Connection Request', desc: 'After signing in, open Settings and submit a tenant connection request with a short motivation; your name and e-mail address come from your account. The system details (hostname, client, communication user) are entered only after approval.' },
                { step: '2', title: 'Admin Review', desc: 'Our team receives a notification and manually reviews the request. We check the requesting user account and the stated use before anything is activated.' },
                { step: '3', title: 'Approval or Feedback', desc: 'Once approved, your tenant connection is activated and you receive an email confirmation. If we have questions, we reach out before activation.' },
                { step: '4', title: 'Active Monitoring', desc: 'Connected tenants are monitored for unusual activity. Access can be revoked at any time if misuse is detected.' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4 bg-cc-surface-muted p-4 rounded-xl border border-cc-line">
                  <div className="w-8 h-8 rounded-lg bg-cc-brand-strong flex items-center justify-center text-cc-on-dark text-sm font-bold shrink-0">
                    {item.step}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-cc-ink">{item.title}</h4>
                    <p className="text-xs text-cc-ink-muted font-medium leading-relaxed mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <CcMessageStrip state="information" headline="Why manual approval?">
            Since this is a Free Community Edition, we want to ensure every connection is legitimate and intentional. This protects both the platform and your system from unintended exposure.
          </CcMessageStrip>
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="text-center pt-4 pb-8">
        <p className="text-sm text-cc-ink-muted font-medium mb-4">
          Questions about tenant security? Reach out anytime.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="mailto:info@clean-core.io"
            className={publicButton('secondary', 'sm')}
          >
            Contact Us
          </a>
          <Link
            href="/verify-pack"
            className={publicButton('primary', 'sm')}
          >
            <ShieldCheck size={16} aria-hidden="true" /> Verify Audit Pack
          </Link>
          <Link
            href="/about"
            className={publicButton('ghost', 'sm')}
          >
            About the Project
          </Link>
        </div>
      </div>
    </div>
  );
}
