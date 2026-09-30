'use client';

import { useState, useEffect, useId } from 'react';
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
 *
 * Block D, D.8 (`DESIGN.md` §1.1, ADR-051): tokens instead of the green panel —
 * green means proven, and a quick answer is not a proof. The heading holds the
 * button rather than the other way round (a disclosure: `h3 > button`, since a
 * heading is not allowed inside a button), and the body id comes from `useId`, so
 * two of these on one page do not share an id.
 */
export default function QuickAnswer({ question, answer }: QuickAnswerProps) {
  const [open, setOpen] = useState<boolean | null>(null);
  const bodyId = useId();

  useEffect(() => {
    // Desktop (md, ≥768px) defaults to expanded; mobile defaults to collapsed.
    setOpen(window.matchMedia('(min-width: 768px)').matches);
  }, []);

  const bodyRows =
    open === null ? 'grid-rows-[0fr] md:grid-rows-[1fr]' : open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]';
  const chevronRot =
    open === null ? 'rotate-0 md:rotate-180' : open ? 'rotate-180' : 'rotate-0';

  return (
    <div className="bg-cc-surface rounded-cc-card p-5 sm:p-6 border border-cc-line shadow-cc max-w-4xl mx-auto text-left md:text-center">
      <span className="cc-text-label text-cc-ink-muted mb-2 block text-center">
        Quick Answer
      </span>

      {/* Question — always visible; also the expand/collapse control on every viewport. */}
      <h3 className="m-0 text-[15px] font-bold text-cc-ink leading-tight md:text-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          // UX-058: before hydration the state is not known (collapsed on a phone,
          // open on a desktop), so no state is claimed rather than "open".
          aria-expanded={open === null ? undefined : open}
          aria-controls={bodyId}
          className="w-full flex items-center justify-between md:justify-center gap-3 text-left md:text-center rounded-cc-row bg-transparent p-0 font-[inherit] text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
        >
          <span>{question}</span>
          <ChevronDown
            aria-hidden="true"
            className={clsx('w-5 h-5 text-cc-ink-muted shrink-0 transition-transform duration-300 motion-reduce:transition-none', chevronRot)}
          />
        </button>
      </h3>

      {/* Answer — always in the DOM for crawlers; visually collapsed via CSS height only. */}
      <div
        id={bodyId}
        // Collapsed means collapsed for a screen reader too; crawlers still get
        // the text, because aria-hidden removes nothing from the DOM.
        aria-hidden={open === false ? true : undefined}
        className={clsx('grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none mt-2', bodyRows)}
      >
        <div className="overflow-hidden">
          <p className="text-[14px] sm:text-[15px] text-cc-ink leading-relaxed font-medium">{answer}</p>
        </div>
      </div>
    </div>
  );
}
