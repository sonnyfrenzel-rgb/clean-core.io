import { Suspense } from 'react';
import type { Metadata } from 'next';
import DemoShowcase from '@/components/demo/showcase/DemoShowcase';
import LandingModalsLazy from '@/components/landing/LandingModalsLazy';
import { buildDemoShowcase } from '@/lib/demo-showcase';
import { withTwitterCard } from '@/lib/page-metadata';

/**
 * `/demo` — the public demo showcase (roadmap 3.5.0 item 8, DEMO-1; owner
 * decision 13.11.2026, option B; ADR-142).
 *
 * A click-through of the shipped example in the product's look, built here on
 * the server from the engine of this release (`lib/demo-showcase.ts`) and
 * static between deploys. It stands outside the signed-in shell
 * (`app/(app)/layout.tsx`): its own header, no assistant, no footer, one
 * viewport high. No account, no model, no request to anyone but this site; the
 * sign-in and sign-up dialog is the landing page's own (`LandingModalsLazy`,
 * mounted only when the address asks for it), and it returns to "My workspace"
 * with `?from=demo` or to the own-code start (`lib/return-path.ts`).
 *
 * The demo project behind sign-in stays where it was (`/demo/workspace`,
 * `/demo/analyze`, `/demo/{stage}`, ADR-061); none of its routes can sign,
 * charge, store or call a model, and this page reaches none of them.
 */
export const revalidate = 300;

const TITLE = 'Clean-Core.io demo: one ABAP program, read end to end';
const DESCRIPTION =
  'A four-minute click-through of a sample SAP ABAP program: its process as BPMN, its hidden rules, clean core levels and the decision basis. No account.';

export const metadata: Metadata = withTwitterCard({
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: 'https://clean-core.io/demo' },
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://clean-core.io/demo',
    type: 'website',
    siteName: 'Clean-Core.io',
  },
});

export default function DemoShowcasePage() {
  return (
    <>
      <DemoShowcase data={buildDemoShowcase()} />
      <Suspense fallback={null}>
        <LandingModalsLazy />
      </Suspense>
    </>
  );
}
