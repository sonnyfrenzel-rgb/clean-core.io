'use client';

import React from 'react';
import { wt } from '@/lib/workspace-messages';

/**
 * The one sentence a reader sees where an owner-only control stands (ADR-083):
 * the control disabled or absent, and this beside it — never a button the
 * server then refuses with "Project not found."
 */
export default function OwnerOnlyNote({ className, id }: { className?: string; id?: string }) {
  return (
    <p id={id} data-owner-only="" className={className ?? 'm-0 cc-text-cell text-cc-ink-muted'}>
      {wt('input.ownerOnly')}
    </p>
  );
}
