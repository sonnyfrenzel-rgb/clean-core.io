'use client';

import { useState } from 'react';

const ANSWERS = ['Keep', 'Change', 'Drop', 'Clarify'] as const;

/**
 * The four answers to a rule, as the product offers them — on the landing page
 * only a picture of that choice: the pressed answer lives in this component's
 * state, is sent nowhere and is gone on reload. In the product an answer is
 * recorded as the signed-in account.
 */
export default function RuleAnswer({ initial }: { initial?: (typeof ANSWERS)[number] }) {
  const [answer, setAnswer] = useState<string | undefined>(initial);
  return (
    <div className="answer" role="group" aria-label="Your answer to this rule">
      {ANSWERS.map((a) => (
        <button key={a} type="button" aria-pressed={answer === a} onClick={() => setAnswer(a)}>
          {a}
        </button>
      ))}
    </div>
  );
}
