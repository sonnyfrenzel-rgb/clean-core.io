import Link from 'next/link';

/**
 * Compliance footer for every public catalog page.
 *
 * Fulfils Apache-2.0 §4 (attribution, license reference, modification notice)
 * and carries the trademark disclaimer (Apache-2.0 §6 licenses no marks —
 * nominative use only, no affiliation implied).
 *
 * Rendered on the index, object and browse pages. Do not remove.
 */
export default function CatalogAttribution() {
  return (
    <footer className="mt-16 border-t border-cc-line pt-6 text-xs text-cc-ink-muted leading-relaxed">
      <p>
        Data derived from the{' '}
        <a
          href="https://github.com/SAP/abap-atc-cr-cv-s4hc"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-cc-ink"
        >
          SAP Cloudification Repository
        </a>
        , © 2020–2026 SAP SE or an SAP affiliate company and contributors. Licensed under{' '}
        <a
          href="https://www.apache.org/licenses/LICENSE-2.0"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-cc-ink"
        >
          Apache-2.0
        </a>
        . Data has been normalized and enriched by Clean-Core.io.
      </p>
      <p className="mt-2 font-medium text-cc-ink">
        Clean-Core.io is not affiliated with, or endorsed by, SAP SE. SAP, S/4HANA and other SAP
        product names are trademarks of SAP SE, used here for identification and reference only.
      </p>
      <p className="mt-2">
        <Link href="/catalog" className="underline underline-offset-2 hover:text-cc-ink">
          Back to catalog
        </Link>
      </p>
    </footer>
  );
}
