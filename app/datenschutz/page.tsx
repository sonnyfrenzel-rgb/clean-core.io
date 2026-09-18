import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';

export const metadata: Metadata = withTwitterCard({
  title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
  description: 'Privacy policy (Datenschutzerklärung) for Clean-Core.io. GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
  alternates: {
    canonical: 'https://clean-core.io/datenschutz',
    languages: {
      en: 'https://clean-core.io/datenschutz',
      de: 'https://clean-core.io/datenschutz/de',
    },
  },
  openGraph: {
    title: 'Datenschutzerklärung – Privacy Policy | Clean-Core.io',
    description: 'GDPR-compliant data processing, your rights under Art. 15-20 GDPR, and data erasure (Art. 17).',
    url: 'https://clean-core.io/datenschutz',
    type: 'website',
  },
});

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
          <Link
            href="/datenschutz/de"
            hrefLang="de"
            data-privacy-language-switch="de"
            className="text-xs font-black uppercase tracking-wider text-gray-500 hover:text-green-600 transition-colors"
          >
            Deutsche Fassung
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-black text-gray-950 tracking-tighter mb-4">
          Privacy Policy <span className="text-gray-400 font-medium text-2xl md:text-3xl">(Datenschutzerklärung)</span>
        </h1>
        <p className="text-sm text-gray-500 mb-12">
          This English version and the{' '}
          <Link href="/datenschutz/de" hrefLang="de" className="text-green-600 hover:underline font-semibold">
            German version
          </Link>{' '}
          say the same thing. Should they ever differ, <strong>the German version prevails</strong> — we are a German controller under a German supervisory authority, and a translation should not be able to change what we owe you.
        </p>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              1. Privacy at a Glance
            </h2>
            <p className="text-base mb-3">
              Protecting your personal data is our top priority. Below, we inform you about what data we collect, process, and store during your visit and use of our platform (Free Community Edition).
            </p>
            <p className="text-sm text-gray-500 mb-3">
              <strong>Controller:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, E-Mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
            <p className="text-sm text-gray-500">
              <strong>Data protection officer:</strong> none has been appointed. Clean-Core.io is run by one person; the thresholds of Art. 37 GDPR and § 38 BDSG are not met — we do not employ twenty or more people on data processing, our core activity is not regular systematic monitoring, and we process no special categories of data. Write to the address above for any data-protection question; it reaches the controller directly.
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
                <strong className="text-gray-800">Google Authentication (Firebase Auth):</strong> To sign in, we use Google Sign-In. This securely reads your name, email address, and profile picture from your Google account to authenticate your user session and establish access privileges. <em>Legal basis: Art. 6(1)(b) GDPR.</em>
              </li>
              <li>
                <strong className="text-gray-800">Email and password (Firebase Auth):</strong> You can also register with an email address and a password instead of using Google. In that case we process the email address and the first and last name you enter. The password itself is handled by Firebase Authentication and is never visible to us. <em>Legal basis: Art. 6(1)(b) GDPR.</em>
              </li>
              <li>
                <strong className="text-gray-800">Your motivation (optional):</strong> the free-text note you may add when registering. It is voluntary, it has no effect on whether you get access, and one line to <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a> is enough to have it deleted — we do not ask why. <em>Legal basis: Art. 6(1)(a) GDPR — your consent, which you may withdraw at any time with effect for the future.</em>
              </li>
              <li>
                <strong className="text-gray-800">Transactional email (Resend):</strong> we send you the mails the service itself requires — confirming an address, an invitation you asked us to send, a notice about your account. There is no newsletter and no marketing mail. Your address is passed to our mail provider for delivery and for nothing else. <em>Legal basis: Art. 6(1)(b) GDPR for the mails that are part of the service, and Art. 6(1)(f) GDPR for those that keep it secure.</em>
              </li>
              <li>
                <strong className="text-gray-800">Firestore User Profiles:</strong> We store metadata about your platform usage (e.g., number of performed code transformations, system limits, as well as your first and last name) in our secure database. <em>Legal basis: Art. 6(1)(b) GDPR for the counters that make the free quota work, and Art. 6(1)(f) GDPR for operating and securing the platform.</em>
              </li>
              <li>
                <strong className="text-gray-800">Bring Your Own Key (BYOK):</strong> Providing your own key is optional; without it, transformations use a shared community key within your free quota. If you configure your own Google Gemini API key in the settings, this key is encrypted and stored in our secure Firestore instance. It is used exclusively to forward your transformation requests directly via a secure backend proxy to the Gemini API, never exposing your key to the browser. <em>Legal basis: Art. 6(1)(b) GDPR — you supply the key so that we can perform the service with it.</em>
              </li>
              <li>
                <strong className="text-gray-800">Security audit records:</strong> administrative actions on an account — approval, revocation of access, deletion — are recorded with the acting administrator, the affected account and the time, so that privileged actions remain accountable. <em>Legal basis: Art. 6(1)(f) GDPR.</em> Retention: see section 6.
              </li>
              <li>
                <strong className="text-gray-800">Invitations you send:</strong> if you invite someone to read a project, we store the email address you entered in order to send the link and to check it when that person signs in. <em>Legal basis: Art. 6(1)(f) GDPR — operating the sharing feature a user asked for.</em> The invited person is informed about this in the invitation email itself (Art. 14 GDPR); section 8 describes the whole mechanism.
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              <strong>Do you have to provide this data?</strong> There is no legal obligation to give us anything, and no contractual duty to register at all. Our public pages, the documentation and the offline verifier work without an account. But signing in is technically required to use the platform itself: without an email address and a name we cannot create an account, keep your projects apart from other people&apos;s, or enforce the free quota — so if you do not provide them, the platform cannot be used. Everything marked optional above (your motivation, your own API key) can be left out with no consequence other than the loss of that particular feature.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Minimum age:</strong> Clean-Core.io is a tool for professional software work and is not directed at children or young people. You must be at least 18 years old to create an account; the Terms of Service say the same. We do not verify age — asking for proof would mean collecting more personal data than the service needs, not less — but we will delete an account on notice that it belongs to someone younger.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Please do not upload personal data.</strong> ABAP often carries it without anyone meaning to: a developer&apos;s user id, a name in a comment, a real customer number, a test record from production. Strip those before you upload. We do not offer a data processing agreement under Art. 28 GDPR, and the platform is not meant for processing personal data — the Terms of Service put this as an obligation, and section 3 explains what happens to what you do upload. This is a rule we ask you to keep; the platform does not detect or block it.
            </p>
          </section>

          <section id="source-code" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              3. Processing of Source Code &amp; Project Assets
            </h2>
            <p className="text-base mb-3">
              The ABAP source files you upload and the generated modernization artifacts (such as solution designs, TypeScript code, and test cases) are stored in our secure Google Firebase cloud environment in Europe.
            </p>
            <p className="text-base mb-3">
              <strong className="text-gray-800">Who can read your project:</strong> the account that created it, and
              anyone that account invites to read it &mdash; no one else, and since 16&nbsp;September&nbsp;2026 not our
              administrator either. There is one exception, an emergency, and it is described in{' '}
              <a href="#project-access" className="text-green-700 underline underline-offset-2 hover:text-green-800">
                Section 8
              </a>, which also sets out the whole picture and names the rules you can read for yourself.
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl">
              <p className="text-sm text-green-800">
                <strong>Important Security Notice:</strong> We do not sell, rent, or use your uploaded source code for commercial purposes. For AI-driven modernization, source code is transmitted via secure, authenticated channels to the <strong>Google Gemini API</strong> using stateless API requests. Which of Google&apos;s data-use terms apply depends on the key that makes the request. The shared community key is a paid Gemini API key, so the paid Gemini API terms govern every request made with it: Google does not use your code to train its models. When you use your own key (BYOK), the terms of your own Google account apply — a key on Google&apos;s free tier is governed by Google&apos;s free-tier data-use terms, which differ. Which terms apply therefore depends on the key you use, and you can see in the settings which one is in use.
              </p>
            </div>
          </section>

          <section id="hosting" className="scroll-mt-20">
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
              <strong>International transfers:</strong> Google and Resend are US-based providers. Both are certified under the EU-U.S. Data Privacy Framework, so a transfer to them rests on the European Commission&apos;s adequacy decision of 10 July 2023 (Art. 45 GDPR). Where a transfer is not covered by that certification, it is safeguarded by the EU Standard Contractual Clauses (Art. 46 GDPR) together with the providers&apos; data-processing terms. You may request a copy of these safeguards from us at any time (Art. 13(1)(f) GDPR) — write to <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>. Hosting and storage of your projects remain in the EU (europe-west1).
            </p>
          </section>

          <section id="your-rights" className="scroll-mt-20">
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
              <li><strong className="text-gray-800">Right to Object (Art. 21 GDPR)</strong> — see the box below</li>
              <li>Right to Withdraw Consent (Art. 7(3) GDPR)</li>
              <li>Right to Lodge a Complaint with a Supervisory Authority (Art. 77 GDPR)</li>
            </ul>
            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <p className="text-sm text-amber-900 font-black uppercase tracking-wider mb-2">
                Your right to object (Art. 21 GDPR)
              </p>
              <p className="text-sm text-amber-900">
                Where we process your data on the basis of our legitimate interest (Art. 6(1)(f) GDPR — operating and securing the platform, the security audit record, and the invitations you send), <strong>you have the right to object at any time, on grounds relating to your particular situation</strong>. Send the objection to <a href="mailto:info@clean-core.io" className="underline font-semibold">info@clean-core.io</a>; a sentence naming the processing you object to is enough. We will then stop that processing unless we can demonstrate compelling legitimate grounds that override your interests, rights and freedoms, or the processing serves to establish, exercise or defend legal claims. We do not use your data for direct marketing, so the unconditional objection of Art. 21(2) does not arise here.
              </p>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              To exercise these rights, particularly to erase your data, you can trigger account deletion directly in your Profile Settings under the <strong>Danger Zone</strong>, which immediately deletes your live database and authentication entries, including every project and the source code in it. A single project can be deleted on its own at any time from your dashboard. Residual copies in encrypted backups age out within 30 days (see section 6). Alternatively, contact us at <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>What deletion does not reach:</strong> two things outlive it, and saying so is more useful than a clean sentence. The security audit record keeps the administrative actions taken on an account — approval, revocation, deletion — with the affected account, for 24 months from the action; without it, a privileged action could not be traced to anyone, and we may keep it under Art. 17(3)(e) and Art. 6(1)(f) GDPR. And &quot;immediately&quot; means the live database and the sign-in: copies inside encrypted backups age out on their own schedule, within 30 days, and are not restored selectively. Everything else goes at once.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Supervisory authority:</strong> you can complain to any supervisory authority, in particular in the EU member state of your residence, place of work or the place of the alleged infringement. The authority responsible for us is the <a href="https://www.lda.bayern.de" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-semibold">Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)</a>, Promenade 18, 91522 Ansbach, Germany.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              6. Legal Basis &amp; Data Retention
            </h2>
            <p className="text-base mb-3">
              <strong>Legal basis (Art. 6 GDPR):</strong> the basis is stated with each purpose in section 2, because one blanket sentence would not tell you which rule covers which processing. In short: performing the service you request (Art. 6(1)(b)), operating and securing the platform under our legitimate interest (Art. 6(1)(f)), and your consent where something is optional (Art. 6(1)(a)), which you may withdraw at any time with effect for the future. The emergency access described in section 8 rests on Art. 6(1)(f) — keeping the platform and its users safe from malicious content.
            </p>
            <p className="text-base mb-3">
              <strong>Retention:</strong> Personal data is retained for the life of your account and removed on account erasure (Art. 17); residual copies in encrypted backups age out within 30 days. The periods that are not simply &quot;as long as the account exists&quot;:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600 mb-3">
              <li><strong className="text-gray-800">Server and access logs:</strong> 30 days (see section 9).</li>
              <li><strong className="text-gray-800">Encrypted backups:</strong> a daily copy for 7 days and a weekly copy for 28 days, so nothing survives beyond 30.</li>
              <li><strong className="text-gray-800">Security audit record:</strong> 24 months from the recorded action, then deleted. The period covers two annual reviews, which is what makes a privileged action traceable long enough to be accountable without keeping administrator identities indefinitely.</li>
              <li><strong className="text-gray-800">Rate-limit counters:</strong> they expire with their own window, minutes to hours. The key is a salted hash, so no address is stored in readable form.</li>
              <li><strong className="text-gray-800">Your own Gemini key and your Google profile picture:</strong> for as long as you keep them — the key until you delete it in the settings or your account goes, the picture reference until your account goes.</li>
            </ul>
            <p className="text-base mb-3">
              Retention per collection is documented in <a href="https://github.com/sonnyfrenzel-rgb/clean-core.io/blob/main/docs/DATA-RETENTION.md" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-semibold">docs/DATA-RETENTION.md</a> in our public source repository — as additional transparency, not as the place you have to look.
            </p>
            <p className="text-base">
              <strong>No automated decision-making (Art. 22 GDPR):</strong> we use AI models to analyse and transform the code you upload. They produce text, diagrams and code — they make no decision about you. There is no automated decision-making, including profiling, that produces legal effects concerning you or similarly significantly affects you. Whether an account is approved, restricted or deleted is decided by a person.
            </p>
          </section>

          <section id="cookies" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              7. Cookies &amp; Tracking
            </h2>
            <p className="text-base">
              <strong className="text-gray-800">We set no cookies at all.</strong> Visit any page without signing in and your browser is left exactly as it was: no cookie, no local storage, no session storage, and no request to anyone but us. We do not use analytics, advertising, or tracking cookies, and we embed no third-party marketing or profiling trackers — no reCAPTCHA, no App Check, no performance or usage measurement.
            </p>
            <p className="text-base mb-3">
              Signing in adds two things, both on your own device. Google Firebase Authentication keeps your session in your browser&apos;s <strong>IndexedDB</strong> so you stay signed in between visits; without it you would have to sign in on every page. And the interface remembers your own choices, in local storage: which hints you have dismissed (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.workspace.coachMarks.dismissed</code>), whether you have seen the first look (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.workspace.firstLook.seen</code>) and the introduction in the new-project dialog (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.newProject.introSeen</code>), how you left the demo (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cleancore.demo.v1</code>), and which sign-off banner you closed (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">signoff-banner-dismissed-…</code>). In session storage, which your browser drops when you close it: a dismissed pilot banner and a guard that stops a failed page from reloading in a loop.
            </p>
            <p className="text-base">
              None of that second group ever leaves your browser: we do not read it, it is not sent to our server, and it is not shared. In our assessment this is storage that is strictly necessary to provide the service you asked for, so no cookie-consent banner is required (§ 25(2) TDDDG / ePrivacy Directive) — and since there is nothing to track with, there is nothing a banner would be protecting you from.
            </p>
          </section>

          <section id="project-access" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              8. Who Can Open Your Projects
            </h2>
            <p className="text-base mb-3">
              Only the account that created a project can open it, including the ABAP source code in it — and anyone that account has invited to read it. No account you have not invited has standing access, and our administrator account does not either: the security rules that govern every read from the browser — published as <code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">firestore.rules</code> in our public source repository, where you can read them yourself — grant the owner and the accounts the owner invited, and no one else.
            </p>
            <p className="text-base mb-3">
              <strong className="text-gray-800">An invitation is reading only, and you can take it back.</strong> You invite someone by entering their email address, and we send a link to that address. The link opens only for a signed-in account whose own, confirmed email address is the one you invited, so a forwarded link opens nothing for anybody else. What it grants is reading — the whole project, <strong>including the ABAP source code you uploaded</strong> — and nothing beyond that: analysing, confirming, signing and exporting stay with you. An invitation expires by itself — after fourteen days unless you choose otherwise, and after ninety at the latest. A project can have at most three invitations waiting at once, and you can see at any time who has access and withdraw it. A withdrawal takes effect in the security rules themselves, immediately, and not only in what the screen shows. What the other person has already read or downloaded is with them, as it would be with any document you hand to someone.
            </p>
            <p className="text-base mb-3">
              We store the address you entered together with the invitation, because the link has to be checked against it and because you have to be able to see whom you invited. No browser can read it, not even yours — your overview of who has access is answered by our server, and it names only the people who actually accepted. The invitation is deleted with the project, and it is deleted when the person it names erases their Clean-Core.io account. Because we did not get that address from the person it belongs to, the invitation email itself tells them what we hold, why, on what basis and for how long (Art. 14 GDPR), and names the rights in section 5 — including the right to object under Art. 21. We process the address on our legitimate interest in running the sharing feature a user asked for (Art. 6(1)(f) GDPR).
            </p>
            <p className="text-base">
              The one exception is an emergency, such as a credible report that an upload contains malicious code. Reaching a project then is a deliberate act by the operator on the server, not a permission that stands open, and it leaves a record. Administrative actions on an account — approval, revocation of access, and deletion — are likewise recorded in an audit log together with the acting administrator, the affected account and the time. Apart from the people you invite yourself, we do not pass project content to anyone other than the subprocessors named in section 4.
            </p>
          </section>

          <section id="server-logs" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              9. Server Logs
            </h2>
            <p className="text-base mb-3">
              Everything above is about people with an account. This section is about everybody, because a web server cannot answer a request without seeing where to answer to.
            </p>
            <p className="text-base mb-3">
              When you open a page or our server calls a model on your behalf, our hosting records the request: your <strong>IP address</strong>, the date and time, the path requested, the response status, the amount of data sent, the referring page and your browser&apos;s user-agent string. These logs exist to keep the service running and safe — to find an error you ran into, to see that a route is failing, and to recognise abuse. We do not use them to build a profile, and they are not combined with your account to analyse your behaviour. <em>Legal basis: Art. 6(1)(f) GDPR — our legitimate interest in operating and securing the platform.</em>
            </p>
            <p className="text-base mb-3">
              They are kept for <strong>30 days</strong> and then deleted automatically by Google Cloud Logging. The same applies to the error reports our application writes when something goes wrong.
            </p>
            <p className="text-base">
              One related record: to stop a single caller from exhausting the free quota or the mail route, we count requests per caller in a short sliding window. The counter&apos;s identifier is a <strong>salted hash</strong> of the account and the IP address, never the address itself, and the record expires with its own window — minutes to hours. You can object to the processing in this section at any time under Art. 21 GDPR; see section 5.
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
