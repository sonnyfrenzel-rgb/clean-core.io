'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { t } from '@/lib/cc-messages';
import type { ProvenanceValue } from '@/lib/provenance';
import CcProvenanceChip from './ProvenanceChip';

/**
 * "Why?" — `DESIGN.md` §1.5, §2.10.
 *
 * Every number and every status on a management or business screen has one of
 * these next to it. It is the product's answer to the only question that
 * matters to a sceptical reader: *says who?*
 *
 * The order inside is fixed and is not a layout preference. Provenance first —
 * whether this is a proof, a reading or a guess — then what it rests on, then
 * the evidence as an anchor, then the date in ISO. Someone who stops after the
 * first line has still learned the most important thing.
 *
 * Mechanics that §2.10 asks for and that are easy to leave out: Escape closes
 * it and the focus goes back to the "?" that opened it, the target is at least
 * 24×24px even though the glyph is 16px (§2.9 target size), and its accessible
 * name is "Why: <what>" rather than a lone question mark repeated eleven times
 * down a screen reader's element list.
 */
export interface CcWhyPopoverProps {
  /** What the question is about — "Traceability 92%". Goes into the name. */
  subject: string;
  provenance: ProvenanceValue;
  /** Rule and rule version, engine, import or account — what it rests on. */
  basis: React.ReactNode;
  /** The anchor: `CcAnchor`, a line range, a finding ID. */
  evidence?: React.ReactNode;
  /** ISO 8601, `2026-09-15` — §3 wants the machine form in metadata. */
  recorded?: string;
}

export default function CcWhyPopover({
  subject,
  provenance,
  basis,
  evidence,
  recorded,
}: CcWhyPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={triggerRef}
        type="button"
        data-cc-why=""
        aria-label={`${t('why.label')}: ${subject}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className={
          // The target and the glyph are two sizes (WG-03, roadmap 3.0.4). The
          // ring stays 24px everywhere; the button around it grows to 44×44 on
          // a phone (breakpoint S, §2.9) and under a coarse pointer, because
          // there the "?" is the one thing a thumb has to hit (§2.10). Negative
          // margins keep the row from growing by the difference.
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-transparent p-0 ' +
          'max-[600px]:-m-2.5 max-[600px]:h-11 max-[600px]:w-11 pointer-coarse:-m-2.5 pointer-coarse:h-11 pointer-coarse:w-11'
        }
      >
        <span
          aria-hidden={true}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-cc-ink-muted text-[11px] leading-none font-bold text-cc-ink-muted"
        >
          ?
        </span>
      </button>

      {open ? (
        <div
          ref={popoverRef}
          id={id}
          role="dialog"
          aria-label={`${t('why.label')}: ${subject}`}
          data-cc-why-popover=""
          className="absolute top-full left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-cc-card border border-cc-line bg-cc-surface p-3.5 text-left shadow-cc-dialog"
        >
          <CcProvenanceChip value={provenance} />
          <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12px] leading-snug">
            <dt className="font-semibold text-cc-ink-muted">{t('why.basis')}</dt>
            <dd className="m-0 font-medium text-cc-ink">{basis}</dd>
            {evidence ? (
              <>
                <dt className="font-semibold text-cc-ink-muted">{t('why.evidence')}</dt>
                <dd className="m-0 font-medium text-cc-ink">{evidence}</dd>
              </>
            ) : null}
            {recorded ? (
              <>
                <dt className="font-semibold text-cc-ink-muted">{t('why.recorded')}</dt>
                <dd className="m-0 font-cc-mono text-[11px] font-medium text-cc-ink">{recorded}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </span>
  );
}
