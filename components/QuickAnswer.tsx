'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

interface QuickAnswerProps {
  question: string;
  answer: string;
}

/**
 * GEO/AEO "Quick Answer" block.
 *
 * SEO-critical: the answer is ALWAYS rendered in the (server-side) DOM. On mobile it
 * is visually collapsed via a CSS grid-rows height animation (0fr → 1fr), NOT via
 * `display:none` or conditional rendering — so crawlers and AI engines always receive
 * the full answer text in the HTML. On desktop (md+) it is always expanded.
 */
export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  const [open, setOpen] = useState(false); // mobile default: collapsed

  return (
    <div className="bg-green-50/50 rounded-3xl p-5 sm:p-6 border border-green-100 shadow-sm max-w-4xl mx-auto text-left md:text-center">
      <span className="text-[10px] sm:text-xs font-black text-green-800 uppercase tracking-widest mb-2 block text-center">
        Quick Answer
      </span>

      {/* Question — always visible. On mobile it doubles as the expand/collapse control. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="quick-answer-body"
        className="w-full flex items-center justify-between gap-3 text-left md:justify-center md:cursor-default"
      >
        <h3 className="text-sm sm:text-base font-bold text-gray-950 leading-tight md:text-center">
          {question}
        </h3>
        <ChevronDown
          aria-hidden="true"
          className={clsx(
            'w-5 h-5 text-green-700 shrink-0 transition-transform duration-300 md:hidden',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Answer — always in the DOM for crawlers; collapsed on mobile unless expanded, always open on desktop. */}
      <div
        id="quick-answer-body"
        className={clsx(
          'grid transition-[grid-template-rows] duration-300 ease-in-out md:grid-rows-[1fr] md:mt-2',
          open ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <p className="text-xs sm:text-sm text-gray-700 leading-relaxed font-medium">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
