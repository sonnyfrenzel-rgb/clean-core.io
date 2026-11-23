import React from 'react';
import { formatAmount, type AmountRange, type CostComparison, type CostOption } from '@/lib/cost-assumptions';
import { formatNumber } from '@/lib/format';
import { DECISION_OPTION_MEANINGS, optionOfCostKind } from '@/lib/decision-options';
import {
  OPTION_CONDITION,
  differenceExact,
  differenceToKeeping,
  isKeep,
  overlapWords,
  yearsWords,
  type EconomicsAnswer,
} from '@/lib/economics-answer';
import { deferralWords } from '@/components/tco/OptionComparison';
import FamilyChip from '@/components/family/FamilyChip';

/**
 * "Options compared" (ADR-128 (1)–(2), mock-up E2): the four answers to the program decision, priced from one set of
 * figures, in whole units — once, per release over the period, Keep's upkeep, the total, and the **difference to
 * keeping**, which answers what the demonstration forecast used to ("what does changing save?") from the same figures
 * as everything else. Under it the verdict: the lowest overall and the cheapest that keeps the function by the one
 * rule — an option is lowest only when its upper bound is below every other option's lower bound — or why none is.
 */
const TH = 'px-3 py-2 text-left cc-text-meta font-semibold text-cc-ink-muted';
const TD = 'px-3 py-3 align-top cc-text-cell text-cc-ink tabular-nums';
const COL = 'max-[720px]:hidden';

/** Whole units, the currency once: "EUR 1,485 – 3,780"; a point as one amount. */
function exactRange(r: AmountRange | null, currency: string): string {
  if (!r) return 'Not determined';
  if (r.low === r.high) return formatAmount(r.low, currency);
  return `${formatAmount(r.low, currency)} – ${formatAmount(r.high, currency).replace(`${currency} `, '')}`;
}

export default function OptionsTable({ answer, options }: { answer: EconomicsAnswer; options: readonly CostOption[] }) {
  const { all, keeps, currency, keep } = answer;
  const releases = keep?.releasesInHorizon ?? all.costs.find((c) => c.releasesInHorizon !== null)?.releasesInHorizon ?? null;
  const label = (c: CostComparison, id: string | null) => (id ? c.costs.find((x) => x.optionId === id)?.label ?? id : '');
  return (
    <div data-cost-result="">
      <div className="-mx-1 overflow-x-auto">
        <table className="doc-table w-full min-w-0 border-collapse" data-cost-totals="">
          <thead className="border-b border-cc-line">
            <tr>
              <th scope="col" className={TH}>Option</th>
              <th scope="col" className={`${TH} ${COL}`}>Once</th>
              <th scope="col" className={`${TH} ${COL}`}>
                Per release × {releases === null ? 'n' : formatNumber(releases, { maximumFractionDigits: 1 })}
              </th>
              <th scope="col" className={`${TH} ${COL}`}>Upkeep</th>
              <th scope="col" className={TH}>Total, {yearsWords(answer.years)}</th>
              <th scope="col" className={`${TH} ${COL}`}>Difference to keeping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cc-line">
            {options.map((o) => {
              const c = all.costs.find((x) => x.optionId === o.id);
              const cond = OPTION_CONDITION[o.kind];
              const lowest = all.winner === o.id;
              const keepsLowest = keeps.winner === o.id && !lowest;
              const deferral = isKeep(o) ? deferralWords(o.upgradeDelay) : null;
              const meaning = o.kind === 'keyuser' ? 'Configured with SAP key-user tools; no code is built.' : DECISION_OPTION_MEANINGS[optionOfCostKind(o.kind)];
              return (
                <tr key={o.id} data-cost-option-row={o.id}>
                  <th scope="row" className={`${TD} max-w-[28rem] text-left font-normal`}>
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="font-semibold">{o.label}</b>
                      {lowest ? <span data-cost-tag="lowest" className="rounded-full bg-cc-surface-muted px-2 cc-text-meta font-semibold ring-1 ring-cc-line ring-inset">lowest overall</span> : null}
                      {keepsLowest ? (
                        <span data-cost-tag="keeps" className="rounded-full bg-cc-surface-muted px-2 cc-text-meta font-semibold ring-1 ring-cc-line ring-inset">
                          cheapest that keeps it
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block cc-text-meta text-cc-ink-muted">
                      {cond ? <b className="font-semibold text-cc-ink">Only {cond}. </b> : null}
                      {meaning}
                      {deferral ? ` Upgrade deferral: ${deferral}, your figure, not priced.` : ''}
                    </span>
                  </th>
                  {c && c.total ? (
                    <>
                      <td data-label="Once" className={`${TD} ${COL} whitespace-nowrap`}>
                        {c.oneOff && c.oneOff.low === 0 && c.oneOff.high === 0 ? 'none' : exactRange(c.oneOff, currency)}
                      </td>
                      <td data-label="Per release" className={`${TD} ${COL} whitespace-nowrap`}>{c.runningTotal ? formatAmount(c.runningTotal, currency) : 'none'}</td>
                      <td data-label="Upkeep" className={`${TD} ${COL} whitespace-nowrap`}>{isKeep(o) ? formatAmount(c.baselineTotal, currency) : '—'}</td>
                      <td data-label="Total" className={`${TD} font-semibold whitespace-nowrap`} data-cost-option-total={o.id}>
                        {exactRange(c.total, currency)}
                      </td>
                      <td data-label="Difference to keeping" className={`${TD} ${COL}`} data-cost-option-difference={o.id}>
                        {isKeep(o) ? 'the reference' : keep?.total ? differenceExact(differenceToKeeping(keep.total, c.total), currency) : '—'}
                      </td>
                    </>
                  ) : (
                    <>
                      <td data-label="Once" className={`${TD} ${COL}`}>—</td>
                      <td data-label="Per release" className={`${TD} ${COL}`}>—</td>
                      <td data-label="Upkeep" className={`${TD} ${COL}`}>—</td>
                      <td data-label="Total" className={TD} data-cost-option-not-determined={o.id}>
                        <FamilyChip kind="not-determined" />
                      </td>
                      <td data-label="Difference to keeping" className={`${TD} ${COL}`}>—</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-cc-card bg-cc-surface-muted px-4 py-3" data-cost-verdict="">
        {all.winner ? (
          <p className="m-0 cc-text-cell text-cc-ink" data-cost-winner={all.winner}>
            <b className="font-semibold">{label(all, all.winner)}</b> has the lowest cost: its upper bound is below every other option&rsquo;s
            lower bound, so where inside its one-off range the effort lands does not matter.
            {keeps.winner && keeps.winner !== all.winner ? (
              <>
                {' '}Among the options that keep the function, <b className="font-semibold">{label(keeps, keeps.winner)}</b> by the same rule.
              </>
            ) : null}{' '}
            Lowest cost is not the same as the best decision.
          </p>
        ) : answer.state !== 'priced' ? (
          <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink" data-cost-no-winner={all.refusal?.code || 'unknown'}>
            <FamilyChip kind="not-determined" />
            <span>
              No cheapest option yet:{' '}
              {answer.missing.length > 0 ? `the shared figures are missing (${answer.missing.join(', ')})` : 'not every option is priced from your figures'}. A
              comparison that leaves an option out compares what is left.
            </span>
          </p>
        ) : (
          <p className="m-0 flex flex-wrap items-center gap-2 cc-text-cell text-cc-ink" data-cost-no-winner={all.refusal?.code || 'unknown'}>
            <FamilyChip kind="not-determined" />
            <span>
              <b className="font-semibold">No cheapest option.</b>{' '}
              {all.refusal?.code === 'ranges-overlap'
                ? `${overlapWords(all, currency)}: the difference lies inside the one-off range, so which is cheaper is not established.`
                : all.refusal?.sentence ?? ''}
              {keeps.winner ? (
                <>
                  {' '}Among the options that keep the function, <b className="font-semibold">{label(keeps, keeps.winner)}</b> is cheapest by the same rule.
                </>
              ) : null}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
