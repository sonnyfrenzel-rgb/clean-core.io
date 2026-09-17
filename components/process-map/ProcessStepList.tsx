'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import type { ProcessMapElement } from '@/lib/process-map';

/**
 * The step list — `DESIGN.md` §5.7, the second half of "Map | Steps".
 *
 * Not a fallback and not a summary: the same elements, in the same order, with
 * the same names, the same anchors and the same provenance as the diagram. A
 * reader who cannot use the map is not reading a lesser version of it. On a
 * phone this is where the process starts.
 *
 * One tab stop, like the map: a listbox with a roving `tabindex`, so a process
 * of ninety elements is not ninety stops on the way to the next control. The
 * arrow keys are the parent's — the same handler the map uses — so the two
 * views navigate identically and a reader who learns one has learnt both.
 */
export interface ProcessStepListProps {
  elements: readonly ProcessMapElement[];
  label: string;
  active: string | null;
  selected: string | null;
  onActivate: (elementId: string) => void;
  onActiveChange: (elementId: string) => void;
  focusToken: number;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export default function ProcessStepList({
  elements,
  label,
  active,
  selected,
  onActivate,
  onActiveChange,
  focusToken,
  onKeyDown,
}: ProcessStepListProps) {
  const options = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (!focusToken || !active) return;
    options.current.get(active)?.focus();
  }, [focusToken, active]);

  const roving = active ?? elements[0]?.id ?? null;

  return (
    <ul
      role="listbox"
      aria-label={label}
      data-process-step-list=""
      onKeyDown={onKeyDown}
      className="max-h-[420px] overflow-y-auto rounded-cc-card border border-cc-line bg-cc-surface md:max-h-[520px]"
    >
      {elements.map((element, index) => {
        const isSelected = element.id === selected;
        return (
          <li
            key={element.id}
            ref={(node) => {
              if (node) options.current.set(element.id, node);
              else options.current.delete(element.id);
            }}
            role="option"
            aria-selected={isSelected}
            aria-label={element.accessibleName}
            data-step-node={element.id}
            tabIndex={element.id === roving ? 0 : -1}
            onClick={() => {
              onActiveChange(element.id);
              onActivate(element.id);
            }}
            onFocus={() => onActiveChange(element.id)}
            className={cn(
              'flex cursor-pointer flex-col gap-1 border-b border-cc-line px-3 py-2 last:border-b-0',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cc-focus',
              isSelected && 'bg-cc-surface-muted',
            )}
          >
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{index + 1}</span>
              <span className="text-[11px] font-semibold tracking-[0.06em] text-cc-ink-muted uppercase">
                {element.kind}
              </span>
              <span className="text-[13px] font-semibold text-cc-ink">{element.label}</span>
            </span>

            {element.businessName ? (
              <span className="text-[12px] font-medium text-cc-ink-muted">
                Technical name: <span className="font-cc-mono">{element.technicalName}</span>
              </span>
            ) : null}

            {/* A decision without its branches is a shrug. Every branch is
                listed, the unconditional one as "otherwise": a reader who sees
                only the conditions cannot tell what happens when none holds. The
                condition is the text of the branch in the code, never a
                paraphrase of it. */}
            {element.branches.length > 1 ? (
              <ul className="ml-3 flex flex-col gap-0.5">
                {element.branches.map((branch, i) => (
                  <li key={`${branch.to}-${i}`} className="text-[12px] font-medium text-cc-ink-muted">
                    {branch.condition ? (
                      <span className="font-cc-mono text-cc-ink">{branch.condition}</span>
                    ) : (
                      <span className="italic">otherwise</span>
                    )}
                    {' → '}
                    {branch.toLabel}
                  </li>
                ))}
              </ul>
            ) : null}

            <span className="flex flex-wrap items-center gap-1.5">
              {element.anchor ? (
                <CcAnchor tone={isSelected ? 'hot' : 'linked'}>
                  {element.anchor.lineStart === element.anchor.lineEnd
                    ? `L${element.anchor.lineStart}`
                    : `L${element.anchor.lineStart}-${element.anchor.lineEnd}`}
                </CcAnchor>
              ) : (
                <CcAnchor tone="unlinked" label={element.unanchoredReason || undefined}>
                  {element.evidenceLabel}
                </CcAnchor>
              )}
              <CcProvenanceChip value={element.status} />
              {element.lane ? <CcTag>{element.lane}</CcTag> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
