'use client';

import React, { useMemo } from 'react';
import CcDateText from '@/components/cc/DateText';
import { CcTag } from '@/components/cc/Tag';
import { RULE_PROPOSAL_LABELS, type RuleSetExplanation } from '@/lib/abap/business-rule-set-explain';
import { RULE_DECISION_LABELS, workshopView, type WorkshopDecision } from '@/lib/rule-decision-flow';
import type { StateEntry } from '@/lib/process-states';
import {
  wt,
  rulesAskedBy,
  rulesDecisionCount,
  rulesProposalWas,
  rulesSessionAnswers,
  rulesSincePrevious,
} from '@/lib/workspace-messages';

/**
 * The rules for a workshop — roadmap 3.0.20 "with it", part (2): a discussion
 * view with the open points, what was decided differently from the engine's
 * proposal, what the latest session recorded, and who decided what.
 *
 * Read from the latest need revision alone (`workshopView`): every entry there
 * carries its account, the server time and the revision that set it. What an
 * answer replaced lives in the earlier revision and is not read here, so the
 * latest session says "answered or changed", never what it was before.
 * Nothing on this view writes.
 */
export default function RuleWorkshop({
  explanation,
  entries,
  titleOf,
}: {
  explanation: RuleSetExplanation;
  entries: Readonly<Record<string, StateEntry>>;
  titleOf: (id: string) => string;
}) {
  const view = useMemo(() => workshopView(explanation, entries), [explanation, entries]);

  const line = (d: WorkshopDecision, extra?: React.ReactNode) => (
    <li key={`${d.id}-${d.at}`} data-workshop-decision={d.id} className="flex min-w-0 flex-col gap-1 border-t border-cc-line py-2">
      <span className="flex flex-wrap items-center gap-2">
        <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{d.id}</code>
        <span className="text-[13px] font-semibold text-cc-ink">{titleOf(d.id)}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted">
        <CcTag>{RULE_DECISION_LABELS[d.kind]}</CcTag>
        <span>{d.by}</span>
        <CcDateText value={d.at} format="text" />
        {extra}
      </span>
      {d.note ? <span className="text-[12px] leading-snug font-medium text-cc-ink">{d.note}</span> : null}
    </li>
  );

  return (
    <div data-rules-workshop="" className="flex min-w-0 flex-col gap-4">
      <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink-muted">{wt('rules.workshopLead')}</p>

      <section data-workshop-part="open" className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">
          {wt('rules.workshopOpen')} <span className="font-medium text-cc-ink-muted">({view.open.length})</span>
        </h3>
        {view.open.length === 0 ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.workshopNoOpen')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {view.open.map((o) => (
              <li key={o.id} data-workshop-open={o.id} className="flex min-w-0 flex-col gap-1 border-t border-cc-line py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{o.id}</code>
                  <span className="text-[13px] font-semibold text-cc-ink">{titleOf(o.id)}</span>
                  <CcTag>{wt(o.impact === 'high' ? 'rules.impactHigh' : o.impact === 'medium' ? 'rules.impactMedium' : 'rules.impactLow')}</CcTag>
                </span>
                {o.question ? (
                  <span className="text-[12px] leading-snug font-medium text-cc-ink">
                    {o.question}
                    {o.askedBy ? <span className="text-cc-ink-muted"> · {rulesAskedBy(o.askedBy)}</span> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-workshop-part="deviations" className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">
          {wt('rules.workshopDeviations')} <span className="font-medium text-cc-ink-muted">({view.deviations.length})</span>
        </h3>
        {view.deviations.length === 0 ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.workshopNoDeviation')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {view.deviations.map((d) => line(d, <span>· {rulesProposalWas(RULE_PROPOSAL_LABELS[d.proposal])}</span>))}
          </ul>
        )}
      </section>

      <section data-workshop-part="latest" className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">{wt('rules.workshopLatest')}</h3>
        {view.latest ? (
          <>
            <p className="m-0 flex flex-wrap items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
              <CcDateText value={`${view.latest.day}T12:00:00Z`} format="text" />
              <span>· {rulesSessionAnswers(view.latest.decisions.length)} ·</span>
              <span>{rulesSincePrevious(view.previousDay !== null)}</span>
              {view.previousDay ? <CcDateText value={`${view.previousDay}T12:00:00Z`} format="text" /> : null}
            </p>
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.workshopEarlier')}</p>
            <ul className="m-0 flex list-none flex-col p-0">{view.latest.decisions.map((d) => line(d))}</ul>
          </>
        ) : (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.workshopNothing')}</p>
        )}
      </section>

      <section data-workshop-part="who" className="flex min-w-0 flex-col gap-1">
        <h3 className="m-0 text-[13px] font-bold text-cc-ink">{wt('rules.workshopWho')}</h3>
        {view.byAccount.length === 0 ? (
          <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.workshopNothing')}</p>
        ) : (
          view.byAccount.map((a) => (
            <div key={a.uid} data-workshop-account="" className="flex min-w-0 flex-col">
              <span className="text-[12px] font-semibold text-cc-ink">
                {a.name} <span className="font-medium text-cc-ink-muted">· {rulesDecisionCount(a.decisions.length)}</span>
              </span>
              <ul className="m-0 flex list-none flex-col p-0">{a.decisions.map((d) => line(d))}</ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
