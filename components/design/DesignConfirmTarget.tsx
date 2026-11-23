'use client';

import React, { useRef, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcMessageBox from '@/components/cc/MessageBox';

/**
 * "Confirm target" as the Management view's one primary action (ADR-130 (1), G8): the same command and the same run
 * binding as before (`approve-architecture`, roadmap 0.7 and 8.8), the same question first (owner 02.10.2026:
 * otherwise it is easy to misclick), and "Choose another target…" into the full sign-off (`ArchitectSignOff`, handed
 * in). Once confirmed, the button becomes "Change target" and opens the full sign-off with its record.
 */
const SELF_DECLARATION = 'A self-declaration by the signed-in account, bound to the run this page shows. Not an organisational mandate.';

export default function DesignConfirmTarget({
  label,
  onConfirm,
  signOffPanel,
  locked,
  disabled,
  describedBy,
  dialogLead = SELF_DECLARATION,
  chooseOther = true,
}: {
  /** The target the question names: the contract's recommendation. */
  label: string;
  onConfirm: () => Promise<void> | void;
  signOffPanel: React.ReactNode | null;
  locked: boolean;
  disabled: boolean;
  describedBy?: string;
  /** What the confirmation is, where it is not a real project's: the demo's is a switch in the browser. */
  dialogLead?: string;
  /** "Choose another target…" into the full sign-off. The demo has one target. */
  chooseOther?: boolean;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const [signOffOpen, setSignOffOpen] = useState(false);
  // A successful confirmation closes the full sign-off (owner decision 01.10.2026); a withdrawal keeps it open on
  // the form, where the next decision is made. As the canvas's panel did before ADR-130 moved the action here.
  const [lockedBefore, setLockedBefore] = useState(locked);
  if (lockedBefore !== locked) {
    setLockedBefore(locked);
    if (locked) setSignOffOpen(false);
  }
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const busy = useRef(false);

  const close = () => {
    if (busy.current) return;
    setAskOpen(false);
    setRefusal(null);
  };
  const confirmTarget = async () => {
    if (busy.current) return;
    busy.current = true;
    setConfirming(true);
    setRefusal(null);
    try {
      await onConfirm();
      setAskOpen(false);
    } catch (err: unknown) {
      setRefusal(err instanceof Error ? err.message : 'The confirmation was refused.');
    } finally {
      busy.current = false;
      setConfirming(false);
    }
  };

  return (
    <>
      <CcButton
        variant={locked ? 'secondary' : 'primary'}
        density="cozy"
        disabled={disabled}
        aria-describedby={describedBy}
        aria-haspopup="dialog"
        data-design-confirm=""
        onClick={() => (locked ? setSignOffOpen(true) : setAskOpen(true))}
      >
        {locked ? 'Change target' : 'Confirm target'}
      </CcButton>

      <CcMessageBox
        open={askOpen}
        title="Confirm the target?"
        confirmLabel={confirming ? 'Confirming…' : 'Confirm target'}
        onConfirm={() => void confirmTarget()}
        onCancel={close}
      >
        <div data-design-confirm-ask="" className="flex flex-col gap-2">
          <p className="m-0">
            You confirm <b>{label}</b> as the target architecture for this code.
          </p>
          <p className="m-0 text-cc-ink-muted">{dialogLead}</p>
          {refusal ? (
            <p data-signoff-refusal="" role="alert" className="m-0 rounded-cc-row border-l-4 border-cc-error bg-cc-error-bg px-3 py-2 text-cc-ink">
              {refusal}
            </p>
          ) : null}
          {signOffPanel && chooseOther ? (
            <p className="m-0">
              <button
                type="button"
                data-design-confirm-other=""
                disabled={confirming}
                onClick={() => {
                  setAskOpen(false);
                  setRefusal(null);
                  setSignOffOpen(true);
                }}
                className="cursor-pointer rounded-cc-row cc-text-cell font-semibold text-cc-information underline-offset-2 hover:underline disabled:cursor-not-allowed"
              >
                Choose another target…
              </button>
            </p>
          ) : null}
        </div>
      </CcMessageBox>

      <CcDialog
        open={signOffOpen && Boolean(signOffPanel)}
        onClose={() => setSignOffOpen(false)}
        title={locked ? 'Target architecture sign-off' : 'Confirm the target architecture'}
        lead={dialogLead}
        size="wide"
        data-design-signoff-dialog=""
      >
        {signOffPanel}
      </CcDialog>
    </>
  );
}
