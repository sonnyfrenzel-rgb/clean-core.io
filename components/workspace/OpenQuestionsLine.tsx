'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { OPEN_QUESTIONS_ID, openQuestionsLine, type OpenQuestions } from '@/lib/open-questions';
import { wt } from '@/lib/workspace-messages';

/**
 * The one line every place but the list says about the open questions
 * (ADR-081): "7 open questions · 2 block the decision · top: …", and the way
 * to the list. `href` defaults to the list on this page.
 */
export default function OpenQuestionsLine({
  questions,
  href = `#${OPEN_QUESTIONS_ID}`,
  className,
}: {
  questions: OpenQuestions;
  href?: string | null;
  className?: string;
}) {
  /**
   * The height the line had while SAP's catalog was still being read, held
   * once it has answered. The reading sentence makes the line longer than the
   * answer that replaces it a moment later, and on a phone that took a line
   * away under everything below — the demo's Business page jumped about 18 px
   * while the reader was looking at the map (mobile-responsive, 3.0.7
   * follow-up). The space is held at the width it was measured at; a new
   * width measures again.
   */
  const ref = useRef<HTMLParagraphElement>(null);
  const held = useRef<{ width: number; height: number } | null>(null);
  const pending = questions.catalogPending;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    // The width the line may take, not the width it takes: a shorter answer
    // makes the line itself narrower, and that is not a new layout.
    const box = el.parentElement ?? el;
    const apply = () => {
      const width = box.clientWidth;
      if (held.current && held.current.width !== width) {
        held.current = null;
        el.style.minHeight = '';
      }
      if (pending) {
        const height = el.getBoundingClientRect().height;
        if (!held.current || height > held.current.height) held.current = { width, height };
      }
      if (held.current) el.style.minHeight = `${held.current.height}px`;
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === lastWidth) return;
      lastWidth = box.clientWidth;
      apply();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [pending, questions]);
  return (
    <p
      ref={ref}
      data-open-questions-summary={questions.open}
      data-open-questions-blocking={questions.blocking}
      className={['m-0 flex flex-wrap items-baseline gap-x-2 text-[13px] leading-snug font-medium text-cc-ink', className]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{openQuestionsLine(questions)}</span>
      {href && questions.groups.length > 0 ? (
        <a
          href={href}
          data-open-questions-link=""
          className="cc-no-print inline-flex min-h-6 items-center text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11"
        >
          {wt('oq.showList')}
        </a>
      ) : null}
    </p>
  );
}
