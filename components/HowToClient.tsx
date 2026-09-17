'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, HelpCircle, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { howToSteps } from '@/lib/how-to-content';

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
        <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 shadow-xl border border-gray-100 flex flex-col gap-6">
          <div className="space-y-1 border-b border-gray-100 pb-5">
            <h2 className="text-2xl font-black text-gray-950 flex items-center gap-3">
              <BookOpen className="text-green-600" /> Walkthrough
            </h2>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">
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
            className={`border border-slate-200 bg-white flex flex-col justify-between shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 ${isFullscreen ? 'fixed inset-0 z-[100] w-screen h-screen overflow-y-auto' : 'rounded-[2rem]'}`}
          >
            <div data-how-to-slide={step.key} aria-live="polite" className="flex-grow p-6 sm:p-10 space-y-6">
              <div className="space-y-2">
                <span className="inline-block bg-green-50 border border-green-200 text-green-700 rounded-lg font-black uppercase tracking-wider px-2 py-0.5 text-xs">
                  Phase {step.n} of {steps.length}
                </span>
                <h3 data-how-to-slide-title className={`font-black text-slate-900 leading-tight ${isFullscreen ? 'text-4xl' : 'text-2xl sm:text-3xl'}`}>
                  {step.title}
                </h3>
                <p className="text-base text-slate-700 font-medium leading-relaxed">{step.summary}</p>
              </div>

              <ul className="space-y-2">
                {step.details.map((detail) => (
                  <li key={detail} className="text-sm text-slate-600 leading-relaxed pl-3 border-l-2 border-green-200">
                    {detail}
                  </li>
                ))}
              </ul>

              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <HelpCircle size={14} /> Questions
                </h4>
                <div className="space-y-2.5">
                  {step.questions.map((q) => (
                    <details key={q.question} className="group border border-slate-200 rounded-xl bg-slate-50 open:bg-white">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden p-3 flex items-center justify-between gap-2 font-bold text-slate-800 text-sm leading-snug">
                        {q.question}
                        <ChevronRight size={14} className="text-slate-500 shrink-0 transition-transform duration-200 group-open:rotate-90" />
                      </summary>
                      <p className="px-3 pb-3 text-sm text-slate-600 font-medium leading-relaxed">{q.answer}</p>
                    </details>
                  ))}
                </div>
              </div>

              <Link
                href={step.demoHref}
                className="inline-flex items-center gap-2 text-sm font-bold text-green-700 hover:text-green-800 underline underline-offset-2"
              >
                See {step.title} in the demo project <ArrowRight size={14} />
              </Link>
            </div>

            <div className="bg-white border-t border-slate-200 p-4 flex items-center justify-between gap-4 select-none shrink-0 rounded-b-[2rem]">
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Show the walkthrough fullscreen'}
                className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-black uppercase tracking-wider"
              >
                {isFullscreen ? <Minimize2 size={14} strokeWidth={2.5} /> : <Maximize2 size={14} strokeWidth={2.5} />}
                <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => go(current - 1)}
                  disabled={current === 0}
                  aria-label="Previous phase"
                  className="p-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-300 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <ChevronLeft size={16} strokeWidth={2.5} />
                </button>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {step.n} / {steps.length}
                </span>
                <button
                  type="button"
                  onClick={() => go(current + 1)}
                  disabled={current === last}
                  aria-label="Next phase"
                  className="p-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-slate-300 hover:bg-slate-200 text-slate-600 disabled:opacity-30 disabled:hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <ChevronRight size={16} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Phases" className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 space-y-6 self-start">
        <h3 className="text-xl font-black text-gray-950">The phases</h3>
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                data-how-to-phase-index={s.key}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => setCurrent(i)}
                className={`w-full text-left flex items-center gap-3 rounded-xl px-2 py-2 transition-all cursor-pointer ${i === current ? 'bg-green-50' : 'hover:bg-slate-50'}`}
              >
                <span className="w-6 h-6 rounded-full bg-green-100 border border-green-200 text-green-700 flex items-center justify-center text-xs font-black shrink-0">
                  {s.n}
                </span>
                <span className="font-black text-sm text-gray-900">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="border-t border-gray-100 pt-6">
          <Link
            href="/dashboard"
            className="flex items-center justify-between bg-green-600 hover:bg-green-700 text-white rounded-2xl p-4 font-black text-sm transition-all shadow-xl shadow-green-100 group"
          >
            <span>Try it now</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </nav>
    </div>
  );
}
