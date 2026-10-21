'use client';

import React, { useState } from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import FitToStandardView from './FitToStandardView';
import { useFitToStandard } from '@/hooks/useFitToStandard';
import { postFitToStandard } from '@/lib/fit-to-standard-client';
import type { FitChoice } from '@/lib/fit-to-standard-store';
import type { Project } from '@/lib/types';
import { callGeminiWithReceipt } from '@/lib/gemini';
import { PRODUCT_GEMINI_MODEL } from '@/lib/constants';
import { fitProposalPrompt } from '@/lib/fit-to-standard-proposal';

/**
 * The Design tool's "Fit to standard" mode (roadmap 3.0.20, F4): reads the gate
 * and the design from the server and writes "make" and "confirm" through it.
 * A project without a signed run shows nothing here — the gate needs one.
 */
export default function FitToStandardPanel({
  projectId,
  project,
  isOwner,
  modelAvailable = false,
}: {
  projectId: string;
  project: Project | null;
  isOwner: boolean;
  /** The Design stage's model can be called for this account (its switch on, a key in reach). */
  modelAvailable?: boolean;
}) {
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
      onPropose={
        modelAvailable && fit.value.design
          ? (baseRevision: number) => {
              const design = fit.value.design!;
              void (async () => {
                setBusy(true);
                setError(null);
                try {
                  // F5: the model sees the open steps only and answers in the proposal schema; the
                  // server checks every identifier against SAP data before anything is stored.
                  const prompt = fitProposalPrompt({ programName: project?.name ?? 'the program', edition: design.edition, entries: design.entries });
                  const answer = await callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, 'design', undefined, { responseShape: 'design-fit-proposal' });
                  setBusy(false);
                  if (!answer.receipt) {
                    setError('The model call returned no receipt, so its answer cannot be stored as a model proposal.');
                    return;
                  }
                  await write({ action: 'propose', baseRevision, text: answer.text, receipt: answer.receipt });
                } catch (err) {
                  setBusy(false);
                  setError(err instanceof Error ? err.message : 'The model could not be asked.');
                }
              })();
            }
          : undefined
      }
    />
  );
}
