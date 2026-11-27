'use client';

import React, { useId, useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import FamilyChip from '@/components/family/FamilyChip';
import type { StandardNote } from '@/lib/decide';
import { cn } from '@/lib/utils';

/**
 * Box B of the fit-to-standard concept (owner decision 25.11.2026: box B only): "SAP standard may fit better", shown on
 * the Decide page only when the engine has concrete signals for this program (`standardNote`, `lib/decide.ts`). A
 * disclosure: a real button with `aria-expanded`, the region stays in the DOM and prints open. Information blue, never
 * green and never amber: it is an option, not a problem. Nothing here is stored or signed; "Choose Move to SAP standard"
 * only selects the option above, the one confirmation stays the page's.
 */
export default function StandardNoteBox({
  note,
  runDate,
  onChooseStandard,
  checkHref,
}: {
  note: StandardNote;
  runDate: string | null;
  /** Selects Move to SAP standard on the page; `null` where nothing can be chosen (a reader, the demo). */
  onChooseStandard: (() => void) | null;
  /** Where the fit-to-standard check is prepared (Analyze, IT view), or `null`. */
  checkHref: string | null;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  return (
    <div data-standard-note="B" data-standard-note-open={open ? '1' : '0'} className="rounded-cc-row border border-cc-information-border bg-cc-information-bg">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 cursor-pointer items-start gap-2 px-3 py-2 text-left pointer-coarse:min-h-11"
      >
        <Info size={16} aria-hidden={true} className="mt-1 shrink-0 text-cc-information" />
        <span className="min-w-0 flex-1 cc-text-cell text-cc-ink">
          <span className="font-bold">{note.head}</span> <FamilyChip kind="engine" /> <span className="text-cc-ink-muted">{note.sub}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 cc-text-meta font-semibold text-cc-ink">
          {open ? 'Hide' : 'Show'}
          <ChevronRight size={14} aria-hidden={true} className={cn('motion-safe:transition-transform', open && 'rotate-90')} />
        </span>
      </button>
      <div id={bodyId} role="region" aria-label="SAP standard" className={cn('border-t border-cc-information-border px-3 pt-2 pb-3', !open && 'hidden print:block')}>
        <p className="m-0 cc-text-cell text-cc-ink">
          Signs in this code point to SAP standard. They show where the program touches the standard. They do not show whether the standard does
          what the program does.
        </p>
        <h4 className="m-0 mt-3 cc-text-cell font-bold text-cc-ink">What points to standard</h4>
        <ul data-standard-note-signs="" className="m-0 mt-1 list-disc space-y-1 pl-5 cc-text-cell text-cc-ink">
          {note.signs.map((s) => (
            <li key={s.text}>
              {s.text}
              {s.lines.map((l) => (
                <code key={l} className="ml-2 font-cc-mono text-[11px] font-semibold text-cc-ink-muted">
                  {l}
                </code>
              ))}
            </li>
          ))}
          {note.area ? <li>{note.area}</li> : null}
        </ul>
        <h4 className="m-0 mt-3 cc-text-cell font-bold text-cc-ink">Why we cannot tell from here</h4>
        <ul className="m-0 mt-1 list-disc space-y-1 pl-5 cc-text-cell text-cc-ink">
          <li>We read the code. Which SAP scope items your company uses, and which process variants it runs, is not in the code.</li>
          <li>Whether your licences and your SAP edition include the standard function is not known here.</li>
          <li>Only your process owners can say whether the standard way of working is good enough for them.</li>
        </ul>
        <h4 className="m-0 mt-3 cc-text-cell font-bold text-cc-ink">What you can do</h4>
        <ol className="m-0 mt-1 list-decimal space-y-1 pl-5 cc-text-cell text-cc-ink">
          <li>Hold a fit-to-standard workshop with the process owners.</li>
          <li>Compare the process with the scope items that SAP Best Practices describe for it.</li>
          <li>If the standard fits, come back here and choose Move to SAP standard.</li>
        </ol>
        {onChooseStandard || checkHref ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onChooseStandard ? (
              <CcButton variant="secondary" density="compact" onClick={onChooseStandard} data-standard-note-choose="">
                Choose Move to SAP standard
              </CcButton>
            ) : null}
            {checkHref ? (
              <a href={checkHref} data-standard-note-check="" className="cc-text-cell font-semibold text-cc-ink underline underline-offset-2">
                Prepare the fit-to-standard check
              </a>
            ) : null}
          </div>
        ) : null}
        <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
          An indication only, and you decide.{runDate ? ` Read from the signed run of ${runDate}.` : ''} Shown here, not stored and not signed.
        </p>
      </div>
    </div>
  );
}
