'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import CcDialog from '@/components/cc/Dialog';
import CcButton from '@/components/cc/Button';
import FamilyChip from '@/components/family/FamilyChip';
import { cn } from '@/lib/utils';
import { tokenizeAbapLine } from '@/lib/process-map';
import type { AuthoredLine } from '@/lib/transformation-view';

/**
 * The code of one function in a drawer (ADR-129 (4), mock-up T7): the old ABAP beside the new function, every new
 * line marked in the gutter as the engine's or the model's. Opened from a function of the package, never at the foot
 * of the page. What the lines are and who wrote each is read from the stored file (`functionLines`, `authoredFile`);
 * nothing here is reformatted or written by hand.
 */
export interface CodeDrawerContent {
  /** The function's name, or the file's path when a whole file is shown. */
  title: string;
  /** "Z_MM_PO_APPROVAL · ABAP · L303–L319". */
  oldHead: string | null;
  oldLines: Array<{ number: number; text: string } | null>;
  /** "ZCL_POAPPR_LOGIC · ABAP Cloud". */
  newHead: string;
  newLines: AuthoredLine[];
  /** The trail above the code: finding → target → object → rule, as short labels. */
  trail: string[];
  /** Body left empty or not written: said beside the title. */
  empty: string | null;
  /** The package came from one model call: every line is the model's. */
  wholeModel: boolean;
}

const TOKEN: Record<string, string> = {
  keyword: 'text-cc-code-keyword',
  literal: 'text-cc-code-literal',
  name: 'text-cc-code-name',
  comment: 'text-cc-code-muted',
  plain: 'text-cc-code-ink',
};

function Line({ number, text, mark }: { number: number | null; text: string; mark?: 'engine' | 'model' }) {
  return (
    <span
      data-code-line-author={mark}
      className={cn(
        'block pr-3 whitespace-pre',
        mark === 'engine' && 'shadow-[inset_3px_0_0_var(--cc-code-name)]',
        mark === 'model' && 'bg-cc-warning-mark/15 shadow-[inset_3px_0_0_var(--cc-warning-mark)]',
      )}
    >
      <span className="mr-3 inline-block w-11 text-right text-cc-code-muted select-none">{number ?? ''}</span>
      {tokenizeAbapLine(text).map((t, i) => (
        <span key={i} className={TOKEN[t.kind] ?? TOKEN.plain}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

const PRE = 'cc-code-surface m-0 max-h-[70vh] overflow-auto rounded-cc-card bg-cc-code-bg py-2 font-cc-mono text-[12px] leading-5 text-cc-code-ink';

export default function CodeDrawer({ content, onClose }: { content: CodeDrawerContent | null; onClose: () => void }) {
  return (
    <CcDialog
      open={content !== null}
      onClose={onClose}
      title={content?.title ?? 'Code'}
      placement="side"
      size="wide"
      data-code-drawer=""
      actions={<CcButton onClick={onClose}>Close</CcButton>}
    >
      {content ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 flex flex-wrap items-center gap-2">
            {content.wholeModel ? <FamilyChip kind="ai" note="whole file" /> : (
              <>
                <FamilyChip kind="engine" note="frame" />
                {content.empty ? <FamilyChip kind="not-determined" note={content.empty} /> : <FamilyChip kind="ai" note="body" />}
              </>
            )}
          </p>
          {content.trail.length > 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta font-semibold text-cc-ink-muted" data-code-trail="">
              {content.trail.map((t, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? <ArrowRight size={14} aria-hidden={true} /> : null}
                  <span className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-2 py-1 text-cc-ink [overflow-wrap:anywhere]">{t}</span>
                </React.Fragment>
              ))}
            </p>
          ) : null}
          <div className={cn('grid grid-cols-1 gap-3', content.oldHead && 'lg:grid-cols-2')}>
            {content.oldHead ? (
              <div className="min-w-0">
                <p className="m-0 mb-1 cc-text-meta font-semibold text-cc-ink-muted">Old · {content.oldHead}</p>
                <pre className={PRE} aria-label={`Old code, ${content.oldHead}`} tabIndex={0}>
                  <code>
                    {content.oldLines.map((l, i) => (l ? <Line key={i} number={l.number} text={l.text} /> : <Line key={i} number={null} text="…" />))}
                  </code>
                </pre>
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="m-0 mb-1 cc-text-meta font-semibold text-cc-ink-muted">New · {content.newHead}</p>
              <pre className={PRE} aria-label={`New code, ${content.newHead}`} tabIndex={0} data-code-new="">
                <code>
                  {content.newLines.map((l) => (
                    <Line key={l.number} number={l.number} text={l.text} mark={l.author} />
                  ))}
                </code>
              </pre>
              <p className="m-0 mt-2 flex flex-wrap gap-4 cc-text-meta text-cc-ink-muted">
                <span className="inline-flex items-center gap-1">
                  <i aria-hidden={true} className="inline-block h-2.5 w-2.5 bg-cc-code-bg shadow-[inset_3px_0_0_var(--cc-code-name)]" /> written by the engine
                </span>
                <span className="inline-flex items-center gap-1">
                  <i aria-hidden={true} className="inline-block h-2.5 w-2.5 bg-cc-warning-mark/30 shadow-[inset_3px_0_0_var(--cc-warning-mark)]" /> written by the model
                </span>
              </p>
            </div>
          </div>
          <p className="m-0 cc-text-meta text-cc-ink-muted">
            Not compiled in an SAP system and not run here.{' '}
            {content.wholeModel
              ? 'This package came from one model call: every line is the model’s.'
              : 'The header, the signature, the guards and the markers are the engine’s; between the markers is the model’s.'}
          </p>
        </div>
      ) : null}
    </CcDialog>
  );
}
