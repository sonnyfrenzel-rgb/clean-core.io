'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import CcButton from '@/components/cc/Button';

interface NavigationButtonsProps {
  backPath?: string;
  backLabel?: string;
  proceedPath?: string;
  proceedLabel: string;
  onProceed?: () => Promise<void> | void;
  /**
   * Set when the step has produced nothing yet.
   *
   * The forward button used to be solid emerald on every step regardless —
   * "Proceed to Documentation" over an empty test suite, "Proceed to Delivery"
   * over an empty blueprint. Green means "done and evidenced" everywhere else in
   * this product; here it also meant "the way onwards exists". The route stays
   * open — skipping a step is a legitimate choice — but it stops looking like
   * the recommended one, and says what is being left behind.
   *
   * Since Block D (D.9) that is the difference between the `primary` and the
   * `secondary` of the four buttons (`DESIGN.md` §1.5), with the reason in the
   * `warning` ink underneath.
   */
  incomplete?: boolean;
  /** What has not happened yet, e.g. "no tests have been generated". */
  incompleteReason?: string;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  backPath,
  backLabel,
  proceedPath,
  proceedLabel,
  onProceed,
  incomplete = false,
  incompleteReason,
}) => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const isDisabled = !proceedPath;

  const handleProceed = async () => {
    if (isDisabled) return;
    setIsPending(true);
    try {
      if (onProceed) {
        await onProceed();
      }
      router.push(proceedPath!);
    } catch (error) {
      console.error("Navigation error:", error);
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-8 border-t border-cc-line mt-12">
      {backPath ? (
        <CcButton
          variant="ghost"
          density="cozy"
          icon={<ArrowLeft size={16} aria-hidden="true" />}
          onClick={() => router.push(backPath)}
        >
          {backLabel || 'Back'}
        </CcButton>
      ) : (
        <div />
      )}

      <div className="flex flex-col items-stretch sm:items-end gap-2">
        <CcButton
          variant={incomplete ? 'secondary' : 'primary'}
          density="cozy"
          onClick={handleProceed}
          disabled={isPending || isDisabled}
          aria-busy={isPending || undefined}
          title={isDisabled ? proceedLabel : undefined}
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden="true" />
              Processing...
            </>
          ) : (
            <>
              {proceedLabel} <ArrowRight size={16} aria-hidden="true" />
            </>
          )}
        </CcButton>
        {incomplete && incompleteReason && !isDisabled && (
          <p className="m-0 cc-text-meta text-cc-warning text-center sm:text-right max-w-[280px]">
            Skipping this step &mdash; {incompleteReason}.
          </p>
        )}
      </div>
    </div>
  );
};

export default NavigationButtons;
