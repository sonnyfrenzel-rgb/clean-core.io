'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import CcDateText from '@/components/cc/DateText';
import type { RulesStatus } from '@/lib/rules-editor';
import { rulesAllConfirmed, rulesConfirmedBy } from '@/lib/workspace-messages';

/**
 * The calm done state of the rules (owner, 03.10.2026): "All 11 rules are
 * confirmed — by you, 3 Oct 2026". Who and when come from the need revision
 * (`rulesStatus`), the server's account names and the server's clock — never
 * from this browser. A confirmation is a self-declaration of that account,
 * which is why the line names it rather than calling the rules "proven".
 *
 * Rendered only when every rule has a Keep, Change or Drop on record; the
 * caller decides that, this line only says it.
 */
export default function RulesDoneLine({ status, uid }: { status: RulesStatus; uid: string | null }) {
  const you = uid !== null && status.by.some((b) => b.uid === uid);
  const names = status.by.map((b) => b.name);
  return (
    <p
      data-rules-done=""
      data-confirmed={status.confirmed}
      data-total={status.total}
      className="m-0 inline-flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] leading-snug font-semibold text-cc-ink"
    >
      <CheckCircle2 size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
      <span>{rulesAllConfirmed(status.total)}</span>
      {names.length > 0 ? (
        <span data-rules-done-by="" className="font-medium text-cc-ink-muted">
          — {rulesConfirmedBy(names, you)}
          {status.lastAt ? (
            <>
              , <CcDateText value={status.lastAt} format="text" />
            </>
          ) : null}
        </span>
      ) : null}
    </p>
  );
}
