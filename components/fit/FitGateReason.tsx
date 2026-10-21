'use client';

import React from 'react';
import Link from 'next/link';
import { FIT_GATE_CLASS_LABELS, fitGateReasonLine, type FitToStandardGate } from '@/lib/fit-to-standard-gate';
import { useFitToStandard } from '@/hooks/useFitToStandard';
import type { Project } from '@/lib/types';

/**
 * The fit-to-standard gate as the IT view says it (roadmap 3.0.20, owner
 * decision 2): where the gate does not offer, the reason with its lines; where
 * it offers, the class and its signals. Business and Management say nothing
 * when it does not offer — this is the one place that does. From here an
 * account may still ask for a design against the gate (owner decision 3), in
 * the Design tool.
 */
export function FitGateReasonLine({ gate, designHref }: { gate: FitToStandardGate; designHref: string }) {
  return (
    <div data-fit-gate={gate.outcome} className="flex flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2">
      <p className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">Fit to standard — the gate</p>
      {gate.outcome === 'offered' ? (
        <>
          <p className="m-0 text-[13px] font-semibold text-cc-ink">
            Offered: {gate.classes.map((c) => `${c} — ${FIT_GATE_CLASS_LABELS[c]}`).join('; ')}.
          </p>
          <ul className="m-0 list-disc pl-5 text-[12px] text-cc-ink-muted">
            {gate.signals.slice(0, 8).map((s, i) => (
              <li key={`${s.kind}-${s.lineStart ?? 'x'}-${i}`}>{s.sentence}</li>
            ))}
          </ul>
        </>
      ) : (
        <p data-fit-gate-reason="" className="m-0 text-[13px] text-cc-ink">
          {gate.outcome === 'not-offered' ? 'Not offered. ' : 'Not determined. '}
          {fitGateReasonLine(gate)}
        </p>
      )}
      <p className="m-0 text-[12px] text-cc-ink-muted">
        A reading of the signed run by program kind, never the score.{' '}
        <Link href={designHref} className="font-semibold text-cc-ink underline">
          {gate.outcome === 'offered' ? 'Open the fit-to-standard design' : 'Ask for a design anyway in Design'}
        </Link>
      </p>
    </div>
  );
}

export default function FitGateReason({ project, projectId }: { project: Project | null; projectId: string }) {
  const { fit } = useFitToStandard(projectId, project);
  if (fit.phase !== 'ready') return null;
  return <FitGateReasonLine gate={fit.value.gate} designHref={`/project/${encodeURIComponent(projectId)}/design#fit-to-standard`} />;
}
