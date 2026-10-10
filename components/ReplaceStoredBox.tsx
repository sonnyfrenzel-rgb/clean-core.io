'use client';

import React from 'react';
import CcMessageBox from '@/components/cc/MessageBox';
import { CcRunCost } from '@/components/cc/RunIndicator';
import { describeRunCost } from '@/lib/run-cost';
import { wt } from '@/lib/workspace-messages';

/**
 * The question before a regenerate or re-read replaces work on record —
 * ADR-083, decision-input audit item 3 (10.10.2026).
 *
 * "Read again from the code" used to empty the SOP and RACI without a word, and
 * every regenerate (design, code, test suite, SOP and RACI) replaced the stored
 * version on one click. Each now asks in the same words: "Replace … ?", what
 * goes, that it cannot be brought back, the cost line (`describeRunCost`,
 * §2.8) — the model call where one follows — and "Replace" / "Keep mine".
 *
 * Replacing is not a decision, so the confirm is the ghost in error text §1.5
 * gives destructive acts, not the `dark` of the binding confirmation.
 */
export default function ReplaceStoredBox({
  open,
  title,
  body,
  callsModel,
  onReplace,
  onKeep,
}: {
  open: boolean;
  title: string;
  /** What the replacement does and what goes with it. */
  body: string;
  /** Whether a model call follows the click — named in the cost line. */
  callsModel: boolean;
  onReplace: () => void;
  onKeep: () => void;
}) {
  // Downstream of the analysis nothing is metered (`lib/constants.ts`), so no
  // profile is needed for the quota half of the line.
  const cost = describeRunCost({ profile: null, metered: false, callsModel });
  return (
    <CcMessageBox
      open={open}
      title={title}
      confirmLabel={wt('input.replace')}
      cancelLabel={wt('input.keepMine')}
      confirmVariant="danger"
      onConfirm={onReplace}
      onCancel={onKeep}
    >
      <div data-replace-stored="" className="flex flex-col gap-2">
        <p className="m-0">{body}</p>
        <p className="m-0">{wt('input.replaceGone')}</p>
        <p className="m-0">
          <CcRunCost cost={cost} />
        </p>
      </div>
    </CcMessageBox>
  );
}
