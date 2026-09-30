'use client';

import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL_LABEL, type SupportLevel } from '@/lib/abap/support-matrix';
import { SUPPORT_LEVEL, type SupportLevelIcon } from '@/lib/support-level';
import { STATE_CLASSES } from '@/components/cc/state';

const ICONS: Record<SupportLevelIcon, typeof CircleCheck> = {
  'circle-check': CircleCheck,
  'circle-alert': CircleAlert,
  'circle-x': CircleX,
};

/**
 * A support level as a word with an icon in the level's state colour — the one
 * way it is drawn, read from the fixed list in `lib/support-level.ts`. Shared by
 * the coverage verdict, the construct list, the pre-analysis preview, the
 * design and transformation stages and the "How it works" matrix, so all of
 * them agree.
 *
 * `label` replaces the word where the caller counts ("3 fully"); an empty
 * `label` leaves the icon alone beside text the caller already wrote.
 */
export default function SupportLevelMark({ level, label }: { level: SupportLevel; label?: string }) {
  const entry = SUPPORT_LEVEL[level];
  const Icon = ICONS[entry.icon];
  return (
    <span
      data-support-level={level}
      className={cn('inline-flex items-center gap-1 cc-text-meta whitespace-nowrap', STATE_CLASSES[entry.state].text)}
    >
      <Icon size={14} aria-hidden="true" />
      {label ?? LEVEL_LABEL[level]}
    </span>
  );
}
