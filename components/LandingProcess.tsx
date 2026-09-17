import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { howToSteps } from '@/lib/how-to-content';

/**
 * The seven phases, on the public landing page.
 *
 * Roadmap 0.2, UX-102 (the follow-up on the landing page). What stood here was
 * `LandingSlideshow`: six auto-advancing slides, each one a screenshot taken in
 * July under `public/screenshots/step-1…6.jpg`. Every picture showed the stepper
 * of that month — "Upload" as a phase of its own, no Economics, Testing before
 * Documentation — and the badges the product has since taken off its own screens:
 * "AI Verified", "Strict Legacy Mode", "SAP Build-Compatible", "92 % Estimated
 * Coverage", "Ready for Deployment" (`tests/claims-honesty-guard.spec.ts` forbids
 * the last four inside the product; they were still being advertised outside it).
 * The six captions promised a matching six-step lifecycle, "Node.js & TypeScript"
 * on both tracks, and a Confluence integration.
 *
 * Three ways to fix that, and why this one:
 *
 *   - Reword the captions. That leaves a corrected sentence beside a picture that
 *     contradicts it, which is the reasoning Strang H used to remove the same six
 *     screenshots from /how-to today rather than re-caption them.
 *   - Re-photograph the product. `tests/capture-screens.spec.ts` can seed a
 *     project and shoot every screen, but it shoots full-page design captures of a
 *     signed-in emulator session — banner, header, footer — for a model to read,
 *     not marketing crops, and nothing re-runs it on release. Hand-picked stills
 *     committed today are July's pictures again in January. Roadmap 3.0.6 already
 *     owns that decision and ties it to the release, which is where it belongs.
 *   - Say the seven phases, from the one place that knows them. This.
 *
 * So the order, the count, the titles and the words are `howToSteps()` — `PHASES`
 * in `lib/workflow-steps.ts` plus the text in `lib/how-to-content.ts`, the same
 * pair /how-to renders. The landing page can no longer describe a different
 * workflow from the walkthrough, because there is no second copy to drift.
 *
 * Each card links the phase in the demo project rather than showing a picture of
 * it: the demo is the product, it needs no account, and it cannot go stale.
 *
 * A server component on purpose. The slideshow was `'use client'`, so the text of
 * the product's central section reached a crawler only after hydration.
 */
export default function LandingProcess() {
  const steps = howToSteps();

  return (
    <div className="w-full max-w-6xl mx-auto mt-12 px-4 sm:px-6">
      <ol data-landing-process className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {steps.map((step) => (
          <li
            key={step.key}
            data-landing-phase={step.key}
            className="flex flex-col gap-3 rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="w-8 h-8 shrink-0 rounded-full bg-green-50 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black"
              >
                {step.n}
              </span>
              <h3 data-landing-phase-title className="text-lg font-black text-gray-900 tracking-tight">
                {step.title}
              </h3>
            </div>

            <p className="text-sm text-gray-600 font-medium leading-relaxed flex-grow">{step.summary}</p>

            <Link
              href={step.demoHref}
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-green-700 hover:text-green-800"
            >
              See it in the demo
              <ArrowRight size={13} className="shrink-0" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
