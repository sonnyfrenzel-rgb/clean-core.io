'use client';

import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { wt } from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';

/**
 * The provenance line of a stage — file, lines, catalog, engine in monospace —
 * behind a small "Details" button, collapsed until the reader asks for it.
 *
 * `DESIGN.md` §2.11 ("Metadata on demand") already put the workspace's meta
 * line behind "Details" in Business and Management; the owner extended it to
 * every stage on 02.10.2026: "can always be hidden behind 'Details'". A
 * process owner reading "catalog 2024.FPS02, SAP release list of …, engine
 * v2.20.0" learns nothing from it, and the line that mattered moves down. The
 * line is not removed and not changed — opened, it is exactly the line the
 * stage hands in, with its own `data-*` hooks.
 *
 * The button is the workspace's (`WorkspaceShell`): `CcButton`, the
 * catalogue's "Details", a chevron that turns, `aria-expanded` and
 * `aria-controls`. Native button, so Enter and Space toggle it.
 *
 * `inline` draws every element as a `span`, so the component can stand inside
 * a lead paragraph (Delivery puts its line there) without a `div` in a `p`.
 * The toggle does not print; the line prints only when it is open.
 */
export default function StageMetaDetails({
  children,
  className,
  inline = false,
}: {
  /** The meta line, unchanged. */
  children: React.ReactNode;
  /** Placement only — margins against the stage header. */
  className?: string;
  /** Inside phrasing content (a lead paragraph): spans instead of divs. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Box = inline ? 'span' : 'div';
  return (
    <Box data-stage-meta-details={open ? 'open' : 'closed'} className={cn('block', className)}>
      <Box className="cc-no-print flex">
        <CcButton
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          data-stage-meta-toggle=""
        >
          {wt('page.details')}
          <ChevronDown size={14} aria-hidden={true} className={open ? 'rotate-180' : undefined} />
        </CcButton>
      </Box>
      <Box id={id} data-stage-meta-body="" className="mt-2 block" hidden={!open}>
        {open ? children : null}
      </Box>
    </Box>
  );
}
