'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

interface QuickAnswerProps {
  question: string;
  answer: string;
}

/**
 * GEO/AEO "Quick Answer" block — collapsible on every viewport.
 *
 * SEO-critical: the answer is ALWAYS rendered in the (server-side) DOM. It is only
 * visually collapsed via a CSS grid-rows height animation (0fr → 1fr), NEVER via
 * `display:none` or conditional rendering — so crawlers and AI engines always receive
 * the full answer text (it is also mirrored in the landing FAQPage JSON-LD).
 *
 * Default state: expanded on desktop, collapsed on mobile — but the user can toggle
 * either way. `open === null` is the pre-hydration state; its class list matches what
 * the post-mount effect resolves to, so there is no hydration mismatch and no flash.
 */
export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    // Desktop (md, ≥768px) defaults to expanded; mobile defaults to collapsed.
    setOpen(window.matchMedia('(min-width: 768px)').matches);
  }, []);

  const bodyRows =
    open === null ? 'grid-rows-[0fr] md:grid-rows-[1fr]' : open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]';
  const chevronRot =
    open === null ? 'rotate-0 md:rotate-180' : open ? 'rotate-180' : 'rotate-0';

  return (
    <div className="bg-green-50/50 rounded-3xl p-5 sm:p-6 border border-green-100 shadow-sm max-w-4xl mx-auto text-left md:text-center">
      <span className="text-[10px] sm:text-xs font-black text-green-800 uppercase tracking-widest mb-2 block text-center">
        Quick Answer
      </span>

      {/* Question — always visible; also the expand/collapse control on every viewport. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open ?? true}
        aria-controls="quick-answer-body"
        className="w-full flex items-center justify-between md:justify-center gap-3 text-left"
      >
        <h3 className="text-sm sm:text-base font-bold text-gray-950 leading-tight md:text-center">
          {question}
        </h3>
        <ChevronDown
          aria-hidden="true"
          className={clsx('w-5 h-5 text-green-700 shrink-0 transition-transform duration-300', chevronRot)}
        />
      </button>

      {/* Answer — always in the DOM for crawlers; visually collapsed via CSS height only. */}
      <div
        id="quick-answer-body"
        className={clsx('grid transition-[grid-template-rows] duration-300 ease-in-out mt-2', bodyRows)}
      >
        <div className="overflow-hidden">
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">{answer}</p>
        </div>
      </div>
    </div>
  );
}
