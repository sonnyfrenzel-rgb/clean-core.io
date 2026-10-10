'use client';

import React from 'react';
import Link from 'next/link';
import { BUSINESS_MAP_ID } from '@/lib/business-layers';
import { IT_SECTION_IDS } from '@/lib/it-sections';
import { MANAGEMENT_IDS } from '@/lib/management-sections';
import { wt } from '@/lib/workspace-messages';
import type { WorkspaceView } from '@/lib/workspace-model';

/**
 * The quiet row of links out that ends the Management view (owner decision
 * 10.10.2026, ADR-087) — what Management does not answer, and where it is
 * answered: the process and its rules in Business, the objects and their
 * dependencies in IT, the amounts in Economics, the evidence and the audit
 * pack in Delivery. One row, never a second copy of what stands there
 * (`DESIGN.md` §2.11 "one home per view"), as IT ends (ADR-086).
 */
export default function ManagementElsewhere({
  open,
  economicsHref,
  deliveryHref,
}: {
  /** Another view of the workspace, at a place in it. */
  open: (view: WorkspaceView, hash: string) => void;
  economicsHref: string;
  deliveryHref: string;
}) {
  const link =
    'inline-flex min-h-6 items-center text-[12px] font-semibold text-cc-ink underline underline-offset-2 pointer-coarse:min-h-11';
  return (
    <nav
      id={MANAGEMENT_IDS.elsewhere}
      aria-label={wt('mgmt.elsewhereLabel')}
      data-management-elsewhere=""
      className="cc-no-print mt-5 border-t border-cc-line pt-3"
    >
      <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-cc-ink-muted">
        <span>{wt('mgmt.elsewhereLabel')}</span>
        <button
          type="button"
          className={link}
          data-management-elsewhere-link="process"
          onClick={() => open('business', BUSINESS_MAP_ID)}
        >
          {wt('mgmt.elsewhereProcess')}
        </button>
        <button
          type="button"
          className={link}
          data-management-elsewhere-link="objects"
          onClick={() => open('it', IT_SECTION_IDS.objects)}
        >
          {wt('mgmt.elsewhereObjects')}
        </button>
        <Link href={economicsHref} className={link} data-management-elsewhere-link="costs">
          {wt('mgmt.elsewhereCosts')}
        </Link>
        <Link href={deliveryHref} className={link} data-management-elsewhere-link="evidence">
          {wt('mgmt.elsewhereEvidence')}
        </Link>
      </p>
    </nav>
  );
}
