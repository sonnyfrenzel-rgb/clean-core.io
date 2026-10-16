import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ShieldCheck, Lock, MapPin, Trash2, FileCheck2, Server, Network, Route, type LucideIcon } from 'lucide-react';
import BackLink from '@/components/BackLink';
import { APP_VERSION } from '@/lib/version';
import { PROVIDER_TERMS } from '@/lib/model-providers';

export const metadata: Metadata = withTwitterCard({
  title: 'Trust & Privacy — Clean-Core.io',
  description:
    'How Clean-Core.io handles your data: EU-hosted primary storage and compute, encrypted credentials, disclosed subprocessors, GDPR rights and self-erasure.',
  alternates: { canonical: 'https://clean-core.io/trust' },
  openGraph: {
    title: 'Trust & Privacy — Clean-Core.io',
    description:
      'EU-hosted primary storage and compute, encrypted credentials, server-authoritative evidence, disclosed subprocessors, and your GDPR rights. Transparency for individual architects, developers and decision-makers.',
    url: 'https://clean-core.io/trust',
    type: 'website',
  },
});

const Section = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) => (
  <section className="bg-cc-surface border border-cc-line rounded-2xl p-6 mb-6">
    <h2 className="flex items-center gap-3 text-lg font-extrabold text-cc-ink mb-3">
      <span className="bg-cc-brand-strong p-2 rounded-xl shrink-0"><Icon className="w-5 h-5 text-cc-on-dark" aria-hidden="true" /></span>
      {title}
    </h2>
    <div className="text-sm text-cc-ink-muted leading-relaxed space-y-3">{children}</div>
  </section>
);

export default function TrustPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <BackLink />
      <p className="text-xs font-bold tracking-widest text-cc-brand-strong uppercase mb-2 mt-4">Trust &amp; Privacy</p>
      <h1 className="text-3xl md:text-4xl font-extrabold text-cc-ink tracking-tight mb-3">How we handle your data</h1>
      <p className="text-cc-ink-muted leading-relaxed mb-8">
        Clean-Core.io is a free, community-built tool. Trust is earned by being specific, so this page
        states plainly what we store, where, and what rights you have — no legalese padding.
        <span className="text-cc-ink-muted"> (Reflects {APP_VERSION}.)</span>
      </p>

      <Section icon={MapPin} title="Data residency — EU-hosted">
        <p>
          Application storage and primary processing run in Google Cloud Firestore and Cloud Run in{' '}
          <strong>europe-west1 (Belgium, EU)</strong>. AI processing (Google Gemini API) and transactional
          email (Resend) are disclosed subprocessors that may process data under their own terms and
          transfer safeguards.
        </p>
      </Section>

      {/* Roadmap 3.0.15 — "where your code goes", per provider. The providers'
          own terms are linked, not paraphrased: what a provider does with API
          data, for how long and where, is its statement to make and to change. */}
      <Section icon={Route} title="Where your code goes">
        <div data-trust-code-destinations="">
          <p>
            The findings, the extensibility route and the Clean Core Score are computed by our own engine on our
            server; no model takes part in them. Only the steps that write text — the analysis narrative, business
            names and sentences, the design, the code proposal, the documentation and the test suite — send your
            code to a language model, and always from our server, never from your browser. Which provider receives
            it depends on the key:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li data-trust-provider="gemini">
              <strong>No own key, or your own Google Gemini key</strong> — the code goes to the Google Gemini API.{' '}
              {PROVIDER_TERMS.gemini.map((t, i) => (
                <span key={t.href}>
                  {i > 0 ? ' · ' : ''}
                  <a href={t.href} rel="noopener noreferrer" target="_blank" className="text-cc-brand-strong font-semibold underline-offset-2 hover:underline">{t.label}</a>
                </span>
              ))}
            </li>
            <li data-trust-provider="anthropic">
              <strong>Your own Anthropic key</strong> — the code goes to the Anthropic API (Claude), on your key.{' '}
              {PROVIDER_TERMS.anthropic.map((t, i) => (
                <span key={t.href}>
                  {i > 0 ? ' · ' : ''}
                  <a href={t.href} rel="noopener noreferrer" target="_blank" className="text-cc-brand-strong font-semibold underline-offset-2 hover:underline">{t.label}</a>
                </span>
              ))}
            </li>
          </ul>
          <p>
            With your own key set, no call of your account uses the platform key: if your key is missing or the
            provider refuses it, the step stops and says so. Settings shows, per stage, which provider, model and
            key answered last, and the audit pack and the delivery package&apos;s <code className="bg-cc-surface-muted px-1 py-0.5 rounded font-cc-mono text-xs">STATUS.md</code> name
            the provider, model and key owner of the signed analysis.
          </p>
          <p data-trust-engine-only="">
            <strong>Code that may not leave:</strong> run the analysis without a model, and switch the model stages
            off in Settings. The deterministic evidence — findings, route, Clean Core Score — is complete and
            signed either way, and no code is sent to any model provider.
          </p>
        </div>
      </Section>

      <Section icon={Lock} title="Encryption of sensitive data">
        <p>
          S/4HANA credentials (BYOT) and your own model API key (BYOK, Gemini or Anthropic) are encrypted at rest with
          <strong> AES-256-GCM</strong> in a server-only collection that client apps cannot read.
          Passwords/keys follow a write-only pattern — they are never returned to the browser.
        </p>
        {/*
          This line used to promise "MFA backup codes are hashed (scrypt + server
          pepper)". Roadmap 0.13 (16.09.2026) replaced the application-level TOTP
          with Firebase's own factor and removed the codes, the pepper and
          `lib/mfa.ts` along with it — so the sentence had been describing a
          mechanism that no longer exists anywhere in this codebase, on the one
          page whose whole argument is that our claims can be checked
          (SECURITY.md §3.5, settings page). What replaced it is stated instead
          of merely deleted: a reader who came here for the backup codes needs
          the answer, not a gap.
        */}
        <p>
          Two-factor sign-in uses Firebase Authentication&apos;s own TOTP factor, enrolled by your
          browser against Firebase directly — no secret and no code ever reaches our server.
          <strong> There are no backup codes</strong>; if you lose your authenticator, write to us from
          your account address and an administrator removes the factor after confirming with you, so
          you can set it up again.
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
          <li><strong>Google Cloud / Firebase</strong> (EU, europe-west1) — hosting (Cloud Run) and database (Firestore).</li>
          <li><strong>Firebase Authentication</strong> — sign-in; a Google service not tied to a region, covered by the international-transfer safeguards in the privacy policy.</li>
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
          runs in CI. Full detail in <Link href="/how-it-works" className="text-cc-brand-strong font-semibold underline-offset-2 hover:underline">how it works</Link> and the project&apos;s SECURITY documentation.
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
          A public <code className="bg-cc-surface-muted px-1 py-0.5 rounded font-cc-mono text-xs">/api/health</code> probe
          reports liveness. We keep a documented data-retention registry and an incident-response playbook,
          including the GDPR 72-hour breach-notification obligation.
        </p>
      </Section>

      <p className="text-xs text-cc-ink-muted mt-8">
        Questions about data handling? Reach us via the in-app support form. This page is transparency,
        not a contract; enterprise procurement documents are available on request.
      </p>
    </main>
  );
}
