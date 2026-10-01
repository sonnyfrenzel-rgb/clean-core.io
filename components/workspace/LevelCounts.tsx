'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { STATE_CLASSES } from '@/components/cc/state';
import type { SemanticState } from '@/lib/provenance';
import type { CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import { ROW_LEVELS, type RowLevels } from '@/lib/workspace-row-facts';
import { levelCountLabel } from '@/lib/workspace-messages';

/**
 * The clean core levels of one project as four small counts — mockup s7's
 * *Levels* column: `A 13 · B 11 · C 12 · D 6`.
 *
 * The same colour mapping as the IT view's level column (`ItAnswers.tsx`) and
 * the Management level marks, for the same reason: A is information and B
 * neutral, never green — the level is imported from SAP's classification file,
 * not proven. A level with no finding is left out rather than printed as a
 * zero chip, and the letter is always there, so the count never depends on
 * colour (§1.1). Unknown is not drawn here; it is in the IT view with its
 * sentence, and a fifth chip in a table cell would be noise.
 */
function gradeState(grade: CloudReadinessGrade): SemanticState {
  switch (grade) {
    case 'A':
      return 'information';
    case 'B':
      return 'neutral';
    case 'C':
      return 'warning';
    case 'D':
      return 'error';
    default:
      return 'neutral';
  }
}

export default function LevelCounts({ levels }: { levels: RowLevels }) {
  const shown = ROW_LEVELS.filter((grade) => (levels.counts[grade] ?? 0) > 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-workspace-levels="">
      {shown.map((grade) => {
        const count = levels.counts[grade] ?? 0;
        const state = STATE_CLASSES[gradeState(grade)];
        return (
          <span
            key={grade}
            data-workspace-level={grade}
            className={cn(
              'inline-flex min-w-11 items-center justify-center gap-1 rounded-cc-row border px-2 text-[12px] font-semibold tabular-nums',
              state.bg,
              state.border,
              state.text,
            )}
          >
            <span aria-hidden={true}>{grade}</span>
            <span aria-hidden={true}>{count}</span>
            <span className="sr-only">{levelCountLabel(grade, count)}</span>
          </span>
        );
      })}
    </span>
  );
}
