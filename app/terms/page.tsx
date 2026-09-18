import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { ARCHIVED_TERMS_VERSIONS } from '@/lib/terms-versions';

export const metadata: Metadata = withTwitterCard({
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
});

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
          Consolidated version — effective 18 September 2026 (v2.1.0). This document is the single authoritative version of the
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
            <p className="text-base mb-3">
              The Platform is intended for professional and evaluation use. By participating, you help shape and improve
              this community utility.
            </p>
            <p className="text-base">
              <strong>Minimum age:</strong> You must be at least 18 years old to register for or use the Platform.
              Accepting these Terms means entering into a contract, and under German law a minor has only limited
              capacity to do so (§§ 106 ff. BGB), so an acceptance given without a parent or guardian would remain
              provisionally invalid. The Platform is a tool for professional software work and is not directed at
              children. We do not verify age &mdash; asking for proof would mean collecting more personal data than the
              service needs, not less &mdash; but we will delete an account on notice that it belongs to someone younger.
            </p>
          </section>

          <section id="free-community-edition" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">2. Free Community Edition; No Fee; Term, Availability and Discontinuation</h2>
            <p className="text-base mb-3">
              <strong>2.1</strong> Access to the Platform is provided completely free of charge. No payment, subscription, or consideration is
              required or accepted. Clean-Core.io is a free community project: there is no paid tier, no paid edition and
              no commercial version of the Platform.
            </p>
            <p className="text-base mb-3">
              <strong>2.2</strong> The Platform is operated on a voluntary community basis. The operator does not owe any particular level
              of availability and gives no availability guarantee. Planned maintenance will be announced on the Platform
              where this is reasonably possible.
            </p>
            <p className="text-base mb-3">
              <strong>2.3</strong> The contract is concluded for an indefinite period. You may terminate it at any time and without notice,
              in particular by deleting your account in the profile settings. The operator may terminate the contract, and
              may discontinue the Platform in whole or in part, by giving at least 30 days&apos; notice in text form to the
              e-mail address associated with your account. Until the contract ends you may export your projects;
              thereafter project content is deleted in accordance with the Privacy Policy.
            </p>
            <p className="text-base mb-3">
              <strong>2.4</strong> The operator may restrict or suspend access with immediate effect for good cause, in particular where
              this is required by law or by a binding decision, in order to avert an imminent security risk, or in the
              event of a material breach of section 7. The operator will inform you of the reason without undue delay and
              will lift the measure as soon as the reason ceases to apply. Your right to object to the measure and to have
              it reviewed remains unaffected.
            </p>
            <p className="text-base">
              <strong>2.5</strong> Changes to the Platform that go beyond what is necessary to maintain conformity will be made only for
              one of the valid reasons listed in section 10.4, at no cost to you. Where such a change more than
              negligibly impairs your access to or use of the Platform, the operator will inform you in text form at least
              30 days in advance, and you may terminate the contract free of charge within 30 days of receiving that
              information or of the change taking effect, whichever is later (cf. § 327r BGB).
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
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">4. AI-Generated Output, Agreed Characteristics and Limitation of Liability</h2>
            <p className="text-base mb-3">
              <strong>4.1 Agreed characteristics of the digital product.</strong> Modernization analyses and source code
              are generated automatically by generative AI models. The parties expressly agree that the output owed under
              this contract consists of automatically synthesized draft artifacts which are illustrative only and which
              must be inspected, validated and approved by qualified software architects before any compilation,
              deployment or use in a test, staging or productive environment (section 3). The operator therefore does not
              owe the correctness, completeness, security, compilability, merchantability or fitness for a particular
              purpose of any individual output.
            </p>
            <p className="text-base mb-3">
              <strong>4.2 Consumers.</strong> Where you are a consumer within the meaning of § 13 BGB and provide personal
              data in connection with the use of the Platform, the deviation from the objective requirements set out in
              section 4.1 applies only where you have been specifically informed of it before submitting your contractual
              declaration and have expressly and separately agreed to it at that time (§ 327h BGB). Your statutory rights
              under §§ 327 ff. BGB &mdash; in particular as to conformity, updates and remedies &mdash; otherwise remain
              unaffected; sections 2, 4.1, 4.3 and 6 neither are intended to nor do limit those rights.
            </p>
            <p className="text-base mb-3">
              <strong>4.3 Liability of the operator.</strong>
            </p>
            <p className="text-base mb-3">
              (a) The operator is liable without limitation for damages caused intentionally or by gross negligence, for
              damages arising from injury to life, body or health caused by a breach of duty by the operator, for the
              fraudulent concealment of a defect, where the operator has assumed a guarantee, and under the German
              Product Liability Act (Produkthaftungsgesetz).
            </p>
            <p className="text-base mb-3">
              (b) In the case of slight negligence, the operator is liable only for the breach of an essential contractual
              obligation. An essential contractual obligation is an obligation whose fulfilment makes the proper
              performance of this contract possible in the first place, whose breach jeopardises the achievement of the
              purpose of the contract, and on whose observance you may therefore regularly rely. In such cases, liability
              is limited to the damage that is foreseeable and typical for a contract of this kind.
            </p>
            <p className="text-base mb-3">
              (c) Any further liability of the operator is excluded. In particular, the operator is not liable for
              slightly negligent breaches of obligations that are not essential contractual obligations.
            </p>
            <p className="text-base mb-3">
              (d) Liability for the loss of data is limited to the expense that would have been necessary to restore the
              data had you made backup copies appropriate to the risk. You remain responsible for retaining your own
              copies of the source code you submit and of the output you receive.
            </p>
            <p className="text-base mb-3">
              (e) Sections 4.3(a) to (d) apply equally to the liability of the operator&apos;s legal representatives,
              employees and vicarious agents, and to claims in tort.
            </p>
            <p className="text-base">
              (f) The above provisions do not alter the statutory allocation of the burden of proof. Statutory liability
              privileges applicable to the gratuitous provision of services (in particular §§ 521, 599 BGB) remain
              unaffected where they apply. Nothing in these Terms excludes or limits liability that cannot be excluded or
              limited under applicable mandatory law.
            </p>
          </section>

          <section id="third-party-ai" className="scroll-mt-20">
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
              currently a total of 5 transformations per user account. One transformation is counted when a new ABAP
              source object is submitted for analysis. All subsequent stages of that transformation &mdash; solution
              design, code transformation, documentation, testing, TCO and delivery &mdash; as well as the glossary
              assistant are not counted, and re-analysing the same source object does not count again. The starter
              examples supplied with the Platform are the exception in both directions: each of them may be analysed
              once per user account without being counted, and every further analysis of the same example is counted,
              including where its source is unchanged. An example you have modified is your own source object and is
              counted as one. A transformation is counted only once the analysis has completed; an analysis that is
              aborted or fails is not counted. This is a one-time
              allotment and is not reset on a daily or monthly basis. When you provide your own Google Gemini API key
              (BYOK, see section 5), no quota applies. Fair-use rate limits apply to all accounts. The operator may
              adjust, introduce or remove quotas with effect for the future in order to protect the stability and fair
              use of the Platform. A one-time allotment already granted to your existing account and not yet used will
              not be reduced retroactively. A reduction with effect for the future will be notified in text form at
              least 30 days in advance; section 2.5 applies accordingly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">7. Community Guidelines and Code of Conduct</h2>
            <p className="text-base mb-3">
              As a participant in the Free Community Edition, you agree to constructive and respectful rules of engagement:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
              <li>Do not upload malicious software, illegal scripts, or proprietary source code that violates intellectual property rights or confidentiality obligations.</li>
              <li>Do not upload personal data of third parties &mdash; section 8 says what to strip out of your code before you submit it.</li>
              <li>Maintain a respectful, collaborative, and professional tone in all community spaces.</li>
              <li>Report system hallucinations, security vulnerabilities, or compilation errors to help continuously refine the engine.</li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              The operator may remove content and restrict, suspend or terminate access where there is an objective
              reason for doing so, in particular a breach of these Terms or of the Code of Conduct. Any such measure
              follows section 2.4: the operator will inform you of the reason for it without undue delay in text form,
              you will be given an opportunity to respond, and the measure will be lifted as soon as the reason for it
              ceases to apply. Your statutory rights, and your right to object to the measure and to have it reviewed,
              remain unaffected.
            </p>
          </section>

          <section id="your-content" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">8. Your Content, Intellectual Property, and Responsibility</h2>
            <p className="text-base mb-3">
              You warrant that you are entitled to upload and process any content, code, or data you submit to the Platform,
              and that doing so does not infringe any third-party rights (including intellectual property rights) or breach
              any confidentiality or data-protection obligation.
            </p>
            <p className="text-base mb-3">
              <strong>No personal data of third parties:</strong> that warranty has one consequence worth stating in
              full. ABAP source routinely carries personal data that nobody put there deliberately &mdash; developer
              user IDs in headers and change histories, names of colleagues or customers in comments, real customer,
              vendor or employee numbers in hard-coded literals, and production records pasted in as test data. Strip or
              replace them before you upload. Do not submit personal data of third parties to the Platform in any form.
            </p>
            <p className="text-base mb-3">
              Clean-Core.io does not offer a data processing agreement under Art. 28 GDPR
              (Auftragsverarbeitungsvertrag) and does not conclude one. It is a free community project run by one
              person, it is not intended for the processing of personal data on anyone else&rsquo;s behalf, and there is
              no contract under which the operator could act as your processor. Uploading such data is therefore a
              breach of these Terms whatever the purpose; if the code you want to analyse cannot be stripped, the
              Platform is not the place for it.
            </p>
            <p className="text-base mb-3">
              This is a rule we ask you to keep, not a control we exercise. The Platform does not detect, screen, filter
              or block personal data in an upload, and nothing in it checks whether you have stripped anything: what you
              submit is analysed and forwarded to the Google Gemini API as you gave it (see section 5). Clearing your
              code is something only you can do, and only before you upload it.
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
            <p className="text-base mb-3">
              Personal data is processed in accordance with the EU General Data Protection Regulation (GDPR) and applicable
              German data-protection law. Details on the nature, scope, and purpose of processing are set out in the
              separate <Link href="/datenschutz" className="text-green-600 hover:underline font-semibold">Privacy Policy (Datenschutzerklärung)</Link> available on the Platform at clean-core.io.
            </p>
            <p className="text-base">
              This section is about the personal data we process about you as a user of the Platform. Personal data that
              ends up inside the content you upload is a different question, and section 8 answers it: it does not
              belong on the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">10. Changes to These Terms</h2>
            <p className="text-base mb-3">
              <strong>10.1</strong> These Terms can be amended only by agreement between the parties. The operator will
              notify you of a proposed amendment in text form to the e-mail address associated with your account at least
              six weeks before the date on which it is proposed to take effect. The notice will contain the amended text,
              a clear indication of the provisions that are changing, and the reason for the amendment.
            </p>
            <p className="text-base mb-3">
              <strong>10.2</strong> An amendment becomes binding on you only if you accept it expressly, for example by
              confirming it in the dialogue displayed at your next sign-in. Your silence, and your continued use of the
              Platform, do not constitute acceptance of an amendment.
            </p>
            <p className="text-base mb-3">
              <strong>10.3</strong> If you do not accept a proposed amendment, you may continue to use the Platform on the
              basis of the Terms as they stood before the proposed amendment. Your right to terminate at any time under
              section 2.3 remains unaffected. The operator may in that case terminate the contract in accordance with
              section 2.3 by giving at least 30 days&apos; notice in text form, where continuing the contract on the
              existing Terms cannot reasonably be expected of the operator.
            </p>
            <p className="text-base mb-3">
              <strong>10.4</strong> Valid reasons for proposing an amendment are: (a) changes in the applicable law, or
              binding decisions of a court or a public authority; (b) changes to the third-party services on which the
              Platform depends (section 5), including changes to their terms, their technical interfaces or their
              availability; (c) the introduction of new functions, or the discontinuation of existing functions, of the
              Platform; (d) closing a gap in these Terms which has become apparent after their conclusion and which
              cannot be resolved by interpretation; and (e) amendments which are purely advantageous or neutral for you.
              Amendments affecting the essential content of the contract &mdash; in particular the scope of the service
              owed under sections 1 to 3 and the liability provisions in section 4, to your detriment &mdash; are never
              implemented unilaterally and always require your express acceptance under section 10.2.
            </p>
            <p className="text-base">
              <strong>10.5</strong> The operator publishes the current version of these Terms, together with all previous
              versions and their effective dates, at clean-core.io/terms.
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
              provisions shall not be affected. In place of an invalid or unenforceable provision, the statutory
              provisions apply.
            </p>
          </section>

          <section id="right-of-withdrawal" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">13. Right of Withdrawal for Consumers</h2>
            <p className="text-base mb-3">
              <strong>Right of withdrawal.</strong> You have the right to withdraw from this contract within fourteen days
              without giving any reason. The withdrawal period is fourteen days from the day of the conclusion of the
              contract. To exercise your right of withdrawal, you must inform us &mdash; Felix Frenzel, Hellerstraße 9,
              96047 Bamberg, Germany, phone +49 151 59200157, e-mail info@clean-core.io &mdash; by means of a clear
              statement (for example a letter sent by post or an e-mail) of your decision to withdraw from this contract.
              You may use the model withdrawal form below, but you are not obliged to. To meet the withdrawal deadline,
              it is sufficient for you to send your communication concerning your exercise of the right of withdrawal
              before the withdrawal period has expired.
            </p>
            <p className="text-base mb-3">
              <strong>Effects of withdrawal.</strong> Access to the Platform is provided free of charge and no payment is
              made or accepted, so there are no payments to be reimbursed. On withdrawal the contract ends, your account
              is closed and project content is deleted in accordance with the Privacy Policy. Your right to terminate the
              contract at any time under section 2.3 is additional to this right of withdrawal and is not affected by it.
            </p>
            <p className="text-base mb-3">
              <strong>Early expiry of the right of withdrawal.</strong> Where performance begins before the withdrawal
              period has expired, the right of withdrawal expires if you have expressly requested that performance begin
              during the withdrawal period, have acknowledged that you thereby lose your right of withdrawal, and the
              operator has confirmed the contract in text form (§ 356 (5) BGB).
            </p>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
              <p className="text-sm text-gray-700 mb-2">
                <strong>Model withdrawal form</strong> &mdash; complete and return this form only if you wish to withdraw
                from the contract.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
                <li>To: Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Germany, e-mail: info@clean-core.io</li>
                <li>I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract for the provision of the following service: use of the Clean-Core.io Platform</li>
                <li>Registered on (*) / contract concluded on (*):</li>
                <li>Name of the consumer(s):</li>
                <li>Address of the consumer(s):</li>
                <li>Signature of the consumer(s) (only if this form is notified on paper):</li>
                <li>Date:</li>
              </ul>
              <p className="text-xs text-gray-500 mt-3">(*) Delete as appropriate.</p>
            </div>
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

          {/*
            The archive § 10.5 promises. It lists the superseded versions and links
            to each one; it deliberately does not reproduce them here. An earlier
            text carries clauses this document replaced because they would not
            survive a German court — a consent fiction, moderation with neither
            reason nor notice — and putting them a scroll below the clauses that
            replaced them is how a reader ends up quoting the wrong
            one. `tests/terms-consumer-law-guard.spec.ts` holds that line: none of
            the removed sentences may appear on this rendered page.
          */}
          <section id="previous-versions" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">Previous versions</h2>
            <p className="text-base mb-3">
              The text above is the version in force. Under section 10.5 every earlier version stays
              published with the date on which it took effect, and each is kept here word for word, with
              the SHA-256 digest of its wording, so that the version an account accepted can be shown to
              be the version it accepted.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600" data-terms-archive>
              {ARCHIVED_TERMS_VERSIONS.map((archived) => (
                <li key={archived.version} data-terms-archive-entry={archived.version}>
                  {archived.label} &mdash; effective {archived.effectiveOn} &mdash;{' '}
                  <Link
                    href={`/terms/versions/${archived.version}`}
                    className="text-green-600 hover:underline font-semibold"
                  >
                    read the full text
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="pt-8 border-t border-gray-100 text-center text-[10px] text-gray-400 font-black font-mono uppercase tracking-wider">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </main>
    </div>
  );
}
