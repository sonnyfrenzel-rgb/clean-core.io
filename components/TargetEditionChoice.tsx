'use client';

import { useId } from 'react';
import { Cloud, Shield } from 'lucide-react';

export type TargetEdition = 'public' | 'private';

/**
 * The target edition, asked on every screen that starts a project — the
 * example cards and the own-code import. The start signs the first run at once
 * in the workspace (ADR-072), and the edition is part of what that run is
 * assessed against: the same level-B object is Keep in the Private Edition and
 * Rebuild in the Public Edition (`lib/assessment-profile.ts`). From 03.10. to
 * 06.10.2026 the start signed every new project as Private without asking, and
 * routing, score, design and the management overview followed that silent
 * choice. Private stays preselected, visibly, so a one-click start still works.
 *
 * Native radios in a named group, the card around each one is its label —
 * the same pattern as the start choice of "New project" (D.10b).
 */
export const TARGET_EDITION_OPTIONS: readonly { value: TargetEdition; title: string; text: string }[] = [
  {
    value: 'private',
    title: 'Private Cloud / RISE',
    text: 'SAP S/4HANA Cloud, Private Edition or on-premise. Custom code can stay behind upgrade-safe wrappers.',
  },
  {
    value: 'public',
    title: 'Public Cloud',
    text: 'SAP S/4HANA Cloud, Public Edition. Released APIs only; no modification of the core.',
  },
];

const CARD = 'block cursor-pointer rounded-cc-card border p-3 text-left';
const CARD_ON = 'border-cc-ink bg-cc-surface-muted ring-1 ring-cc-ink';
const CARD_OFF = 'border-cc-field-border bg-cc-surface hover:border-cc-ink-muted';

export default function TargetEditionChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: TargetEdition;
  onChange: (value: TargetEdition) => void;
  disabled?: boolean;
}) {
  const titleId = useId();
  const name = useId();
  return (
    <div data-target-edition-choice="" data-target-edition={value} className="flex flex-col gap-2">
      <div>
        <p id={titleId} className="m-0 cc-text-label text-cc-ink">
          Target system
        </p>
        <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
          The first run is assessed against it — routing, score, design and the management overview follow it.
          Changing it later takes a new run.
        </p>
      </div>
      <div role="radiogroup" aria-labelledby={titleId} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {TARGET_EDITION_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              data-target-edition-option={option.value}
              data-selected={selected ? 'true' : 'false'}
              className={`${CARD} ${selected ? CARD_ON : CARD_OFF}`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(option.value)}
                  className="size-4 shrink-0 cursor-pointer accent-cc-ink"
                />
                {option.value === 'public' ? (
                  <Cloud size={16} aria-hidden="true" className="shrink-0 text-cc-ink-muted" />
                ) : (
                  <Shield size={16} aria-hidden="true" className="shrink-0 text-cc-ink-muted" />
                )}
                <b className="text-[13px] font-bold text-cc-ink">{option.title}</b>
              </span>
              <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">{option.text}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
