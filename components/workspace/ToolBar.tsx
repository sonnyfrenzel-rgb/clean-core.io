'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import type { PhaseKey } from '@/lib/workflow-steps';

export interface WorkspaceTool {
  key: PhaseKey;
  label: string;
  path: string;
}

/**
 * The seven stages as tools under the header — `DESIGN.md` §2.3 item 3.
 *
 * Two things this bar is not, and both were true of the old stepper:
 *
 *   - **It is not a progress indicator** (ADR-018). A tool opens a stage as its
 *     own page; how far that stage has got is said once, in the status line
 *     above, and repeating it here in a second colour is how two surfaces end up
 *     disagreeing about the same phase (roadmap 1.7). So nothing here carries a
 *     state colour — every tool is the same ghost link, including the one whose
 *     page the reader came from, which is marked with `aria-current` and no hue.
 *   - **It is not a waterfall.** Every stage is reachable at any time, which is
 *     what `lib/workflow-steps.ts` has always said and what a row of seven
 *     equally available links shows without a sentence.
 *
 * Open in IT; a "Tools" menu in Business and Management (§2.11, ADR-026),
 * because seven exits over the answer is six offers competing with the one next
 * action a first-time reader should take.
 */
export default function WorkspaceToolBar({
  tools,
  projectId,
  open,
}: {
  tools: WorkspaceTool[];
  projectId: string;
  /** IT lays them out; Business and Management fold them into a menu. */
  open: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Escape closes the panel and hands the focus back to "Tools" (roadmap
  // 3.0.4). It is a disclosure, not an ARIA `menu`: a `role="menu"` promises
  // arrow-key navigation over `menuitem`s, and seven plain links under it were
  // announced as a menu that then did not behave like one.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuRef.current?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const links = tools.map((tool) => (
    <CcLinkButton key={tool.key} href={`/project/${projectId}/${tool.path}`}>
      {tool.label}
    </CcLinkButton>
  ));

  const menu = (
    <div
      ref={menuRef}
      data-workspace-tools="menu"
      // In IT the bar is open — except on a phone, where §2.9 folds the toolbar
      // into this menu in every view. Hidden by width, so the open bar and the
      // menu are never both reachable at once.
      className={open ? 'relative cc-no-print min-[601px]:hidden' : 'relative cc-no-print'}
    >
      <CcButton
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? panelId : undefined}
        icon={<Wrench size={16} aria-hidden={true} />}
      >
        Tools
        <ChevronDown size={14} aria-hidden={true} />
      </CcButton>
      {menuOpen && (
        <div
          id={panelId}
          data-workspace-tools-panel=""
          className="absolute left-0 z-20 mt-1 flex w-64 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-1.5 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
        >
          {links}
        </div>
      )}
    </div>
  );

  if (open) {
    return (
      <>
        <div
          data-workspace-tools="open"
          className="cc-no-print flex flex-wrap items-center gap-1.5 max-[600px]:hidden"
        >
          <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
            Tools
          </span>
          {links}
        </div>
        {menu}
      </>
    );
  }

  return menu;
}
