'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-6 pt-12 border-t border-gray-100 mt-12">
      {backPath ? (
        <button
          onClick={() => router.push(backPath)}
          className="flex items-center gap-2 text-[#0b1c30]/60 font-bold hover:text-[#0b1c30] px-6 py-3 rounded-xl hover:bg-gray-100 transition-all group"
        >
          <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-1" /> {backLabel || 'Back'}
        </button>
      ) : (
        <div />
      )}
      
      <div className="flex flex-col items-stretch sm:items-end gap-2">
        <button
          onClick={handleProceed}
          disabled={isPending || isDisabled}
          title={isDisabled ? proceedLabel : undefined}
          className={clsx(
            "flex items-center gap-3 px-10 py-4 rounded-2xl font-black min-w-[220px] justify-center transition-all",
            isDisabled
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : incomplete
                ? "bg-white text-[#006b2c] border-2 border-[#00873a]/40 hover:border-[#00873a] hover:bg-green-50 transition-all"
                : "bg-[#00873a] text-white hover:bg-[#006b2c] hover:shadow-xl hover:shadow-green-900/20 shadow-lg shadow-green-900/10 disabled:opacity-70 disabled:cursor-not-allowed",
            isPending && "animate-pulse"
          )}
        >
          {isPending ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {proceedLabel} <ArrowRight size={20} />
            </>
          )}
        </button>
        {incomplete && incompleteReason && !isDisabled && (
          <p className="text-[11px] font-semibold text-amber-700 text-center sm:text-right max-w-[280px] leading-snug">
            Skipping this step &mdash; {incompleteReason}.
          </p>
        )}
      </div>
    </div>
  );
};

export default NavigationButtons;
