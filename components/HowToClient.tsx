'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, HelpCircle, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { howToSteps } from '@/lib/how-to-content';
import { publicButton } from '@/components/landing/public-button';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';

/**
 * The walkthrough on /how-to: one slide per phase, in the product's order.
 *
 * Roadmap 0.2, UX-102. This component used to carry its own list of the phases —
 * an introduction plus six phases, Testing before Documentation, no Economics —
 * with a narration script, hotspot answers pinned to screenshots, and three
 * "Designed for IT Professionals" cards under a "SAP Verified Strategy" badge.
 * What went, and why:
 *
 *   - The list. Slides, titles and order come from `howToSteps()`, which reads
 *     `PHASES`; the words come from `lib/how-to-content.ts`.
 *   - The screenshots. All six showed the stepper of July — Upload as a step of
 *     its own, no Economics, Testing before Documentation — and badges the
 *     product has since removed ("AI Verified", "Strict Legacy Mode", "SAP
 *     Build-Compatible", "Ready for deployment"). A corrected sentence beside a
 *     picture that contradicts it is still a page that contradicts itself. Each
 *     slide links the same phase in the demo project instead, which is the
 *     product itself and needs no account. The hotspots were positioned on those
 *     pictures and went with them; their questions are a list now.
 *   - The narration. A third telling of every phase, for a video that does not
 *     exist, and one more place for a claim to drift.
 *   - The three concept cards (CAP and CDS, BTP destinations, XSUAA). They
 *     described the CAP track as if it were the product, and configuration the
 *     product never performs; nothing true was left to say about them that holds
 *     for both tracks.
 *
 * The arrow keys move the deck only while it has focus. The listener used to sit
 * on `window` and took the arrow keys away from the whole page (UX-008).
 */
const steps = howToSteps();

export default function HowToClient() {
  const [current, setCurrent] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  const step = steps[current];
  const last = steps.length - 1;
  const go = (index: number) => setCurrent(Math.max(0, Math.min(last, index)));

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(current + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(current - 1);
    }
  };

  const toggleFullscreen = () => {
    if (!deckRef.current) return;
    if (!document.fullscreenElement) {
      deckRef.current.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <div className="lg:col-span-3">
        <div className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line flex flex-col gap-6">
          <div className="space-y-1 border-b border-cc-line pb-5">
            <h2 className="text-2xl font-extrabold text-cc-ink flex items-center gap-3">
              <BookOpen className="text-cc-brand-strong" aria-hidden="true" /> Walkthrough
            </h2>
            <p className="text-xs text-cc-ink-muted font-bold uppercase tracking-wider">
              The phases of a project, in the order the product shows them
            </p>
          </div>

          <div
            ref={deckRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Walkthrough of the phases"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className={`border border-cc-line bg-cc-surface flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus ${isFullscreen ? 'w-screen h-screen overflow-y-auto' : 'rounded-3xl'}`}
          >
            <div data-how-to-slide={step.key} aria-live="polite" className="flex-grow p-6 sm:p-10 space-y-6">
              <div className="space-y-2">
                <span className="cc-text-label text-cc-brand-strong">
                  Phase {step.n} of {steps.length}
                </span>
                <h3 data-how-to-slide-title className={`font-extrabold text-cc-ink leading-tight ${isFullscreen ? 'text-4xl' : 'text-2xl sm:text-3xl'}`}>
                  {step.title}
                </h3>
                <p className="text-base text-cc-ink font-medium leading-relaxed">{step.summary}</p>
              </div>

              <ul className="space-y-2">
                {step.details.map((detail) => (
                  <li key={detail} className="text-sm text-cc-ink-muted leading-relaxed pl-3 border-l-2 border-cc-brand">
                    {detail}
                  </li>
                ))}
              </ul>

              <div className="space-y-3">
                <h4 className="cc-text-label text-cc-ink-muted flex items-center gap-2">
                  <HelpCircle size={14} aria-hidden="true" /> Questions
                </h4>
                <div className="space-y-2">
                  {step.questions.map((q) => (
                    <details key={q.question} className="group border border-cc-line rounded-xl bg-cc-surface-muted open:bg-cc-surface">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden p-3 flex items-center justify-between gap-2 font-bold text-cc-ink text-sm leading-snug">
                        {q.question}
                        <ChevronRight size={14} aria-hidden="true" className="text-cc-ink-muted shrink-0 transition-transform duration-200 group-open:rotate-90" />
                      </summary>
                      <p className="px-3 pb-3 text-sm text-cc-ink-muted font-medium leading-relaxed">{q.answer}</p>
                    </details>
                  ))}
                </div>
              </div>

              <Link
                href={step.demoHref}
                className="inline-flex items-center gap-2 text-sm font-bold text-cc-brand-strong hover:text-cc-brand-deep underline underline-offset-2"
              >
                See {step.title} in the demo project <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>

            <div className="bg-cc-surface border-t border-cc-line p-4 flex items-center justify-between gap-4 select-none shrink-0 rounded-b-3xl">
              <CcButton
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Show the walkthrough fullscreen'}
                icon={isFullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
              >
                <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
              </CcButton>

              <div className="flex items-center gap-3">
                <CcIconButton label="Previous phase" onClick={() => go(current - 1)} disabled={current === 0}>
                  <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" />
                </CcIconButton>
                <span className="text-xs font-cc-mono font-bold text-cc-ink-muted" aria-hidden>
                  {step.n} / {steps.length}
                </span>
                <CcIconButton label="Next phase" onClick={() => go(current + 1)} disabled={current === last}>
                  <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                </CcIconButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Phases" className="bg-cc-surface rounded-3xl p-6 sm:p-8 border border-cc-line space-y-6 self-start">
        <h3 className="text-xl font-extrabold text-cc-ink">The phases</h3>
        <ol className="space-y-1">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                data-how-to-phase-index={s.key}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => setCurrent(i)}
                className={`w-full text-left flex items-center gap-3 rounded-xl border px-2 py-2 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus ${i === current ? 'border-cc-brand' : 'border-transparent hover:border-cc-line'}`}
              >
                <span className="w-6 h-6 rounded-full bg-cc-brand-surface border border-cc-brand text-cc-brand-strong flex items-center justify-center text-xs font-bold shrink-0">
                  {s.n}
                </span>
                <span className="font-bold text-sm text-cc-ink">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="border-t border-cc-line pt-6">
          <Link
            href="/dashboard"
            className={`${publicButton('primary')} w-full justify-between group`}
          >
            <span>Try it now</span>
            <ArrowRight size={16} aria-hidden="true" className="motion-safe:group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
