import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import { APP_VERSION, APP_RELEASE_DATE } from '@/lib/version';
import { BTP_FIRST } from '@/lib/sap-naming';

export const metadata: Metadata = withTwitterCard({
  title: 'Impressum – Legal Notice | Clean-Core.io',
  description: 'Legal notice (Impressum) for Clean-Core.io according to § 5 DDG. Contact information, responsible person, and disclaimer.',
  alternates: {
    canonical: 'https://clean-core.io/impressum',
  },
  openGraph: {
    title: 'Impressum – Legal Notice | Clean-Core.io',
    description: 'Legal notice (Impressum) for Clean-Core.io according to § 5 DDG.',
    url: 'https://clean-core.io/impressum',
    type: 'website',
  },
});

export default function ImpressumPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-cc-ink mb-12">
          Legal Notice <span className="text-cc-ink-muted font-medium text-2xl md:text-3xl">(Impressum)</span>
        </h1>

        <div className="space-y-10 text-cc-ink leading-relaxed">
          <section>
            <h2 className="text-xl font-bold tracking-tight text-cc-ink mb-3">
              Information according to § 5 DDG (Digitale-Dienste-Gesetz)
            </h2>
            <p className="text-base">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold tracking-tight text-cc-ink mb-3">
              Contact
            </h2>
            <p className="text-base">
              Phone: +49 151 59200157<br />
              E-Mail: <a href="mailto:info@clean-core.io" className="font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline">info@clean-core.io</a><br />
              Website: <a href="https://www.clean-core.io" className="font-semibold text-cc-brand-strong underline-offset-4 hover:text-cc-brand-deep hover:underline">www.clean-core.io</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold tracking-tight text-cc-ink mb-3">
              Responsible for Content under § 18 Abs. 2 MStV
            </h2>
            <p className="text-base">
              Felix Frenzel<br />
              Hellerstraße 9<br />
              96047 Bamberg<br />
              Germany
            </p>
          </section>

          <hr className="border-cc-line" />

          <section>
            <h2 className="text-xl font-bold tracking-tight text-cc-ink mb-3">
              Disclaimer
            </h2>
            <div className="space-y-4 text-sm text-cc-ink-muted">
              <p>
                <strong className="text-cc-ink">Liability for Content:</strong> The contents of our pages were created with the greatest care. This is a free community application (Free Community Edition): a deterministic analysis engine reads the code, and a language model writes only drafts on top of it — such as the code proposal, the documentation and the test suite. We therefore cannot assume any guarantee for the accuracy, completeness, error-free code transformation, or continuous availability of the provided modernization results.
              </p>
              <p>
                <strong className="text-cc-ink">Copyright:</strong> The content and works created by the site operator on these pages are subject to German copyright law. Contributions from third parties are marked as such. Reproduction, editing, and distribution require written consent.
              </p>
            </div>
          </section>

          <div className="p-5 bg-cc-warning-bg border border-cc-warning-border rounded-2xl">
            <p className="text-sm text-cc-warning font-bold">
              Important Note: Clean-Core.io is a free community tool for assessing and modernizing legacy SAP code. Generated outputs are drafts and must be reviewed, tested and approved by qualified architects before any productive use.
            </p>
          </div>

          <div className="p-5 bg-cc-surface-muted border border-cc-line rounded-2xl">
            <p className="text-xs text-cc-ink-muted leading-relaxed">
              <strong className="text-cc-ink">Trademark Notice:</strong> SAP, S/4HANA, ABAP, {BTP_FIRST}, SAP Signavio, SAP Build, and SAP Cloud ALM are trademarks or registered trademarks of SAP SE or its affiliates. Clean-Core.io is an independent project and is not endorsed, certified, or sponsored by SAP SE unless explicitly stated.
            </p>
          </div>

          <div className="pt-8 border-t border-cc-line text-center cc-text-label font-cc-mono text-cc-ink-muted">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE})
          </div>
        </div>
      </main>
  );
}
