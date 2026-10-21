'use client';

import React from 'react';
import CcLinkButton from '@/components/cc/LinkButton';
import { ArrowRight } from 'lucide-react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { FIT_GATE_CLASS_LABELS, FIT_GATE_CLASS_MEANING, type FitToStandardGate } from '@/lib/fit-to-standard-gate';
import { fitDesignSummary } from '@/lib/fit-to-standard-design';
import { confirmedFitDesign } from '@/lib/fit-to-standard-store';
import { useFitToStandard } from '@/hooks/useFitToStandard';
import type { Project } from '@/lib/types';

/**
 * The fit-to-standard offer under "Next step" in the Business and Management
 * views (roadmap 3.0.20, F4; concept §2): shown only where the gate offers —
 * where it does not, Business and Management show nothing and the IT view
 * names the reason (owner decision 2). Once a design is confirmed on the
 * current run the card says what it gives up and what remains a gap.
 */
export function FitOfferCard({
  gate,
  href,
  confirmed,
}: {
  gate: FitToStandardGate;
  href: string;
  confirmed: { summary: string } | null;
}) {
  if (gate.outcome !== 'offered' && !confirmed) return null;
  return (
    <div
      data-fit-offer-card={confirmed ? 'confirmed' : 'offered'}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <div className="min-w-0 flex-1 basis-72">
        <h2 className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">Fit to standard</h2>
        {confirmed ? (
          <p className="m-0 mt-1 text-[14px] leading-snug font-semibold text-cc-ink">
            Move to SAP standard — fit-to-standard design confirmed: {confirmed.summary}.
          </p>
        ) : gate.outcome === 'offered' ? (
          <>
            <p className="m-0 mt-1 text-[14px] leading-snug font-semibold text-cc-ink">
              This program may be able to live with SAP standard instead of being rebuilt.
            </p>
            <p className="m-0 mt-1 text-[12px] leading-snug text-cc-ink-muted">
              {FIT_GATE_CLASS_LABELS[gate.primary]}: {FIT_GATE_CLASS_MEANING[gate.primary]} A fit-to-standard design shows what you would give up — the code cannot show that the standard covers it.
            </p>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <CcProvenanceChip value={confirmed ? 'confirmed' : 'reconstructed'} />
        <CcLinkButton href={href} variant="secondary" data-fit-offer-link="">
          {confirmed ? 'Open the design' : 'Have a fit-to-standard design made'}
          <ArrowRight size={16} aria-hidden={true} />
        </CcLinkButton>
      </div>
    </div>
  );
}

export default function FitToStandardOffer({ project, projectId }: { project: Project | null; projectId: string }) {
  const { fit } = useFitToStandard(projectId, project);
  if (!project || fit.phase !== 'ready') return null;
  const confirmed = confirmedFitDesign(project);
  return (
    <FitOfferCard
      gate={fit.value.gate}
      href={`/project/${encodeURIComponent(projectId)}/design#fit-to-standard`}
      confirmed={confirmed ? { summary: fitDesignSummary(confirmed.counts) } : null}
    />
  );
}
