import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import WhitepaperDocument from '@/components/whitepaper/WhitepaperDocument';
import { USP_SHORT } from '@/lib/whitepaper';

/**
 * `/whitepaper` — the canonical whitepaper, the page a person is sent. Its paper
 * edition is `/whitepaper-print`, and the PDF behind "Download the PDF" is that
 * edition rendered by `npm run build:whitepaper-pdf`; all three render
 * `components/whitepaper/WhitepaperDocument.tsx`, so they cannot drift apart.
 *
 * The page draws its own frame — the public header and the landing's footer —
 * because it sits in the landing's `.lp3` scope (roadmap 3.0, the whitepaper in
 * the 3.0 look). Every figure on it is read at render time, in the document
 * component.
 *
 * Search demand for this page is the generic term — "clean core whitepaper",
 * "sap clean core whitepaper", "sap clean core pdf" — not the product name, so
 * the title leads with what was searched for.
 */
export const revalidate = 300;

const TITLE = 'SAP Clean Core Whitepaper — Free Guide (PDF) | Clean-Core.io';
const DESCRIPTION =
  'Free SAP clean core whitepaper: custom ABAP read before any model, its process as BPMN with line anchors, level A–D, design, draft, tests. PDF too.';

export const metadata: Metadata = withTwitterCard({
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: 'https://clean-core.io/whitepaper',
  },
  openGraph: {
    title: 'SAP Clean Core Whitepaper | Clean-Core.io',
    description: `${USP_SHORT} The whitepaper for the people who decide what happens to custom ABAP — free, online or as PDF.`,
    url: 'https://clean-core.io/whitepaper',
    type: 'article',
    siteName: 'Clean-Core.io',
  },
});

export default function WhitepaperPage() {
  return <WhitepaperDocument edition="web" />;
}
