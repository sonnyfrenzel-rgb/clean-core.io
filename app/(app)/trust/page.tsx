import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, Lock, MapPin, Trash2, FileCheck2, Server, Network } from 'lucide-react';
import BackButton from '@/components/BackButton';
import { APP_VERSION } from '@/lib/version';

export const metadata: Metadata = {
  title: 'Trust & Privacy — Clean-Core.io',
  description:
    'How Clean-Core.io handles your data: EU-hosted primary storage and compute, encrypted credentials, server-authoritative evidence, disclosed subprocessors, and your GDPR rights including self-service erasure. Plain and honest — built for the SAP community.',
  alternates: { canonical: 'https://clean-core.io/trust' },
  openGraph: {
    title: 'Trust & Privacy — Clean-Core.io',
    description:
      'EU-hosted primary storage and compute, encrypted credentials, server-authoritative evidence, disclosed subprocessors, and your GDPR rights. Transparency for individual architects, developers and decision-makers.',
    url: 'https://clean-core.io/trust',
    type: 'website',
  },
};

const Section = ({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) => (
  <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
    <h2 className="flex items-center gap-3 text-lg font-black text-slate-900 mb-3">
      <span className="bg-emerald-600 p-2 rounded-xl shrink-0"><Icon className="w-5 h-5 text-white" /></span>
      {title}
    </h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </section>
);

export default function TrustPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <BackButton />
      <p className="text-xs font-bold tracking-widest text-emerald-600 uppercase mb-2 mt-4">Trust &amp; Privacy</p>
      <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-3">How we handle your data</h1>
      <p className="text-slate-600 leading-relaxed mb-8">
        Clean-Core.io is a free, community-built tool. Trust is earned by being specific, so this page
        states plainly what we store, where, and what rights you have — no legalese padding.
        <span className="text-slate-400"> (Reflects {APP_VERSION}.)</span>
      </p>

      <Section icon={MapPin} title="Data residency — EU-hosted">
        <p>
          Application storage and primary processing run in Google Cloud Firestore and Cloud Run in{' '}
          <strong>europe-west1 (Belgium, EU)</strong>. AI processing (Google Gemini API) and transactional
          email (Resend) are disclosed subprocessors that may process data under their own terms and
          transfer safeguards.
        </p>
      </Section>

      <Section icon={Lock} title="Encryption of sensitive data">
        <p>
          S/4HANA credentials (BYOT) and your own Gemini API key (BYOK) are encrypted at rest with
          <strong> AES-256-GCM</strong> in a server-only collection that client apps cannot read.
          Passwords/keys follow a write-only pattern — they are never returned to the browser.
          MFA backup codes are hashed (scrypt + server pepper).
        </p>
      </Section>

      <Section icon={FileCheck2} title="Server-authoritative evidence">
        <p>
          Every analysis is frozen into an immutable, HMAC-signed <strong>Run</strong>. Audit packs carry
          a SHA-256 manifest and signature so a third party can verify integrity independently. We label
          verification honestly: <em>authentic</em> → <em>integrity-only</em> → <em>failed</em> — we never
          show a green check we cannot back up cryptographically.
        </p>
      </Section>

      <Section icon={Network} title="Subprocessors">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google Cloud / Firebase</strong> (EU) — hosting, database, authentication.</li>
          <li><strong>Google Gemini API</strong> — AI transformation of the code you submit for analysis.</li>
          <li><strong>Resend</strong> — transactional email (access approvals/notifications).</li>
        </ul>
        <p>We add no advertising or analytics trackers that sell your data.</p>
      </Section>

      <Section icon={ShieldCheck} title="Security controls">
        <p>
          Server-side auth on all mutating routes, admin gating with an allowlist, multi-layer SSRF
          defense on S/4HANA connections, a strict Content-Security-Policy, DOMPurify sanitization, and
          server-side quota/rate limiting. Supply-chain hygiene (secret scanning, dependency audit, SBOM)
          runs in CI. Full detail in <Link href="/how-it-works" className="text-emerald-700 font-semibold hover:underline">how it works</Link> and the project&apos;s SECURITY documentation.
        </p>
      </Section>

      <Section icon={Trash2} title="Your rights — including erasure">
        <p>
          You can export your evidence at any time. Under GDPR Art. 17 you can delete your account from
          Settings; a server-side cascade permanently removes your profile, projects, analysis runs,
          uploads, encrypted S/4HANA and BYOK credentials, and MFA data. The completeness of this deletion
          is enforced by an automated test on every build. Residual copies in encrypted backups age out
          within 30 days.
        </p>
      </Section>

      <Section icon={Server} title="Operational transparency">
        <p>
          A public <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">/api/health</code> probe
          reports liveness. We keep a documented data-retention registry and an incident-response playbook,
          including the GDPR 72-hour breach-notification obligation.
        </p>
      </Section>

      <p className="text-xs text-slate-400 mt-8">
        Questions about data handling? Reach us via the in-app support form. This page is transparency,
        not a contract; enterprise procurement documents are available on request.
      </p>
    </main>
  );
}
