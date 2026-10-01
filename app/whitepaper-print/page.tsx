import type { Metadata } from 'next';
import WhitepaperDocument from '@/components/whitepaper/WhitepaperDocument';

/**
 * Paper edition of `/whitepaper` — the same document
 * (`components/whitepaper/WhitepaperDocument.tsx`) with a cover page, one
 * section per page, every FAQ answer open and every link written out, so a
 * forwarded PDF still leads somewhere.
 *
 * `scripts/generate-whitepaper-pdf.ts` (`npm run build:whitepaper-pdf`) renders
 * this route to `public/Clean-Core_S4HANA_Modernization_Whitepaper.pdf`, the
 * file the web page's "Download the PDF" serves. It is outside the `(app)`
 * group so it inherits no shell, and noindex: it would otherwise compete with
 * the canonical page for the same queries.
 */
export const metadata: Metadata = {
  title: 'SAP Clean Core Whitepaper — Clean-Core.io',
  description: 'Printable edition of the Clean-Core.io whitepaper.',
  robots: { index: false, follow: false },
};

export default function WhitepaperPrintPage() {
  return <WhitepaperDocument edition="print" />;
}
