'use client';

import React from 'react';
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
  return (
    <p
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
