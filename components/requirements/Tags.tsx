'use client';

import React from 'react';
import { CircleDashed, CircleHelp, CircleSlash, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIORITY_LABEL, type RequirementPriority } from '@/lib/functional-requirements';
import { REQUIREMENT_STATUS_LABEL, type RequirementStatus } from '@/lib/requirement-status';

/**
 * The two fixed lists a requirement of the specification carries, each in its
 * own shape (DESIGN.md §4.1):
 *
 *   - **priority** (ADR-070): Must filled ink, Should outlined ink, Could dashed
 *     muted — never a state colour, a priority is not a verdict;
 *   - **status** (ADR-078): an identifier with icon and word in the colour of
 *     what it says — Accepted in the information blue of a self-declaration
 *     (never the green of proven), Needs clarification in warning, Rejected
 *     in error, Draft neutral.
 */
export function PriorityTag({ value }: { value: RequirementPriority }) {
  return (
    <span
      data-spec-priority={value}
      className={cn(
        'inline-flex items-center rounded-[4px] border px-2 text-[12px] font-semibold leading-[18px] whitespace-nowrap',
        value === 'must' && 'border-cc-ink bg-cc-ink text-cc-surface',
        value === 'should' && 'border-cc-ink bg-cc-surface text-cc-ink',
        value === 'could' && 'border-dashed border-cc-field-border bg-cc-surface text-cc-ink-muted',
      )}
    >
      {PRIORITY_LABEL[value]}
    </span>
  );
}

const STATUS_ICON: Record<RequirementStatus, React.ReactNode> = {
  draft: <CircleDashed size={12} aria-hidden={true} />,
  accepted: <UserCheck size={12} aria-hidden={true} />,
  clarify: <CircleHelp size={12} aria-hidden={true} />,
  rejected: <CircleSlash size={12} aria-hidden={true} />,
};

export function StatusTag({ value }: { value: RequirementStatus }) {
  return (
    <span
      data-spec-status={value}
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] border bg-cc-surface px-2 text-[12px] font-semibold leading-[18px] whitespace-nowrap',
        value === 'draft' && 'border-cc-field-border text-cc-neutral',
        value === 'accepted' && 'border-cc-information text-cc-information',
        value === 'clarify' && 'border-cc-warning-line text-cc-warning',
        value === 'rejected' && 'border-cc-error text-cc-error',
      )}
    >
      {STATUS_ICON[value]}
      {REQUIREMENT_STATUS_LABEL[value]}
    </span>
  );
}
