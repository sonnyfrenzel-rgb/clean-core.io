'use client';

import React, { useState } from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import FitToStandardView from './FitToStandardView';
import { useFitToStandard } from '@/hooks/useFitToStandard';
import { postFitToStandard } from '@/lib/fit-to-standard-client';
import type { FitChoice } from '@/lib/fit-to-standard-store';
import type { Project } from '@/lib/types';

/**
 * The Design tool's "Fit to standard" mode (roadmap 3.0.20, F4): reads the gate
 * and the design from the server and writes "make" and "confirm" through it.
 * A project without a signed run shows nothing here — the gate needs one.
 */
export default function FitToStandardPanel({ projectId, project, isOwner }: { projectId: string; project: Project | null; isOwner: boolean }) {
  const { fit, reload } = useFitToStandard(projectId, project);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  if (fit.phase === 'off') return null;
  if (fit.phase === 'loading') {
    return (
      <p role="status" data-fit-loading="" className="m-0 text-[13px] text-cc-ink-muted">
        Reading whether this program is worth examining against SAP standard…
      </p>
    );
  }
  if (fit.phase === 'failed') {
    return (
      <CcMessageStrip state="information">
        <span data-fit-unavailable={fit.code}>
          {fit.code === 'source-too-large'
            ? 'This source is larger than one request compares, so no fit-to-standard design is read here.'
            : 'The fit-to-standard reading could not be loaded. Reload the page to try again.'}
        </span>
      </CcMessageStrip>
    );
  }

  const write = async (body: Parameters<typeof postFitToStandard>[1]) => {
    setBusy(true);
    setError(null);
    const out = await postFitToStandard(projectId, body);
    setBusy(false);
    if (!out.ok) {
      setError(out.error);
      return;
    }
    setRound((r) => r + 1);
    reload();
  };

  return (
    <FitToStandardView
      key={`${fit.value.stored?.revision ?? 0}:${round}`}
      gate={fit.value.gate}
      design={fit.value.design}
      stored={fit.value.stored}
      isOwner={isOwner}
      busy={busy}
      error={error}
      onMake={(againstGate) => void write({ action: 'make', againstGate })}
      onConfirm={(baseRevision: number, choices: FitChoice[]) => void write({ action: 'confirm', baseRevision, choices })}
    />
  );
}
