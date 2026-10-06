'use client';

import React, { useCallback, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcMessageBox from '@/components/cc/MessageBox';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcStateText, { type CcStateTextState } from '@/components/cc/StateText';
import CcTextarea from '@/components/cc/Textarea';
import { CcTag } from '@/components/cc/Tag';
import { CommandAnswerLostError, runProjectCommand } from '@/lib/project-command-client';
import { DIRECT_CHOICE_CODE, type DecisionOption } from '@/lib/decision-options';
import {
  OPTION_SIGNAL_WORDS,
  type DecisionOptionsView,
  type OptionCard,
  type OptionFigure,
  type OptionPlace,
  type OptionSignal,
} from '@/lib/decision-option-signals';
import { cn } from '@/lib/utils';
import { decideChooseTitle, wt } from '@/lib/workspace-messages';

/**
 * The four options of the program decision, side by side — ADR-079.
 *
 * Keep · Rebuild · Move to SAP standard · Retire, always in that order, each
 * with what it means for the program, what the evidence says for it (a word and
 * a reason, with its provenance and the place to check it), its effort in days
 * and its cost as a simulation — or *Not determined* with the reason. The one
 * option the evidence proposes carries a tag; the chosen one an ink edge.
 *
 * **Choosing.** Keep, Move to SAP standard and Retire are chosen here, through
 * the same `approve-architecture` command the Design sign-off uses — bound to
 * the run the reader saw, with the reason on the record, by the signed-in
 * account (a self-declaration). Rebuild leads to Design, where the route is
 * signed off. Nothing here confirms the decision: that stays the decision
 * card's, below.
 *
 * Everything said comes out of `lib/decision-option-signals.ts`; the component
 * adds only its frame from the catalogue. Never green: a reading is not a proof.
 */

const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

const SIGNAL_STATE: Record<OptionSignal, CcStateTextState> = {
  for: 'information',
  against: 'warning',
  'not-determined': 'neutral',
};

const PLACE_LABEL: Record<OptionPlace, Parameters<typeof wt>[0]> = {
  design: 'decide.place.design',
  tco: 'decide.place.tco',
  analyze: 'decide.place.analyze',
  business: 'decide.place.business',
  it: 'decide.place.it',
  fit: 'decide.place.fit',
};

export interface DecisionChoiceContext {
  projectId: string;
  runId: string | null;
  evidenceDigest: string | null;
  canDecide: boolean;
  beforeWrite?: () => Promise<boolean>;
  onChanged?: () => void;
}

function Figure({ title, figure, hook }: { title: string; figure: OptionFigure; hook: string }) {
  return (
    <div data-option-figure={hook} data-option-figure-determined={figure.value === null ? 'no' : 'yes'} className="min-w-0">
      <p className={LABEL}>{title}</p>
      {figure.value !== null ? (
        <p className="m-0 mt-1 text-[13px] leading-snug font-semibold text-cc-ink">{figure.value}</p>
      ) : (
        <p className="m-0 mt-1 text-[13px] leading-snug font-semibold text-cc-ink-muted">{OPTION_SIGNAL_WORDS['not-determined']}</p>
      )}
      <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[11px] leading-snug font-medium text-cc-ink-muted">
        <CcProvenanceChip value={figure.provenance} />
        <span className="min-w-0">{figure.value !== null ? figure.note : figure.reason}</span>
      </p>
    </div>
  );
}

function Card({
  card,
  hrefFor,
  action,
}: {
  card: OptionCard;
  hrefFor: (place: OptionPlace) => string;
  action: React.ReactNode;
}) {
  return (
    <li
      data-decision-option={card.option}
      data-option-signal={card.signal}
      data-option-proposed={card.proposed ? '' : undefined}
      data-option-chosen={card.chosen ? '' : undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-cc-row border bg-cc-surface p-3',
        card.chosen ? 'border-l-4 border-cc-line border-l-cc-ink bg-cc-surface-muted' : 'border-cc-line',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="m-0 text-[15px] leading-tight font-bold text-cc-ink">{card.label}</h4>
        {card.chosen ? <CcTag>{wt('decide.chosen')}</CcTag> : null}
        {card.proposed ? <CcTag>{wt('decide.proposed')}</CcTag> : null}
      </div>
      <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">{card.meaning}</p>

      <div className="mt-3" data-option-evidence="">
        <p className={LABEL}>{wt('decide.evidence')}</p>
        <p className="m-0 mt-1 flex flex-wrap items-center gap-2">
          <CcStateText state={SIGNAL_STATE[card.signal]}>{OPTION_SIGNAL_WORDS[card.signal]}</CcStateText>
          <CcProvenanceChip value={card.provenance} />
        </p>
        <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink">{card.reason}</p>
        <a href={hrefFor(card.place)} className="mt-1 inline-block text-[12px] font-semibold text-cc-ink underline underline-offset-2">
          {wt(PLACE_LABEL[card.place])}
        </a>
      </div>

      <div className="mt-3 grid gap-3 border-t border-cc-line pt-3">
        <Figure title={wt('decide.effort')} figure={card.effort} hook="effort" />
        <Figure title={wt('decide.cost')} figure={card.cost} hook="cost" />
        {/* ADR-022: an amount is shown here only as a takeover, with the way to where it arises. */}
        <a
          href={hrefFor('tco')}
          data-option-open-economics=""
          className="text-[12px] font-semibold text-cc-ink underline underline-offset-2"
        >
          {wt('decide.openEconomics')}
        </a>
      </div>

      <div className="mt-auto pt-3">{action}</div>
    </li>
  );
}

export default function DecisionOptions({
  view,
  hrefFor,
  choice,
  mode,
  pending = null,
}: {
  /**
   * Why `choice` is null although the project has a signed run: the decision
   * is still being read, or the read failed. Not "no signed run" (QA review of
   * 1c402c400e05).
   */
  pending?: 'reading' | 'unreadable' | null;
  view: DecisionOptionsView;
  hrefFor: (place: OptionPlace) => string;
  /** `null` on the demo and without a signed run: nothing can be chosen. */
  choice: DecisionChoiceContext | null;
  mode: 'project' | 'demo';
}) {
  const [asking, setAsking] = useState<Exclude<DecisionOption, 'rebuild'> | null>(null);
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const cancel = useCallback(() => {
    setAsking(null);
    setMissing(false);
    // A reason belongs to the option it was written for; a cancelled one is
    // never sent with another choice (QA review of 2f5a8b9fc249).
    setReason('');
  }, []);

  const choose = useCallback(async () => {
    if (!asking || !choice) return;
    const why = reason.trim();
    if (!why) {
      setMissing(true);
      return;
    }
    const option = asking;
    // The reason travels with this one attempt only: refused, lost or stopped by
    // the Stand check, it is never offered again for another option (QA review
    // of 643b3af83e3a).
    setReason('');
    setAsking(null);
    setMissing(false);
    setRefusal(null);
    setBusy(true);
    try {
      // Inside the try: a Stand check that rejects is a refusal the reader sees,
      // not an unhandled rejection (QA review of 1c402c400e05).
      if (choice.beforeWrite && !(await choice.beforeWrite())) return;
      await runProjectCommand(choice.projectId, {
        command: 'approve-architecture',
        targetArchitecture: DIRECT_CHOICE_CODE[option],
        justification: why,
        expectedRunId: choice.runId ?? '',
        expectedEvidenceDigest: choice.evidenceDigest ?? '',
      });
      setReason('');
      choice.onChanged?.();
    } catch (err: unknown) {
      if (err instanceof CommandAnswerLostError) {
        setRefusal(`${wt('decide.answerLost')} ${err.message}`);
        choice.onChanged?.();
        return;
      }
      setRefusal(err instanceof Error ? err.message : wt('decide.refused'));
    } finally {
      setBusy(false);
    }
  }, [asking, choice, reason]);

  const blockedWhy =
    mode === 'demo'
      ? wt('decide.demo')
      : !choice
        ? pending === 'reading'
          ? wt('decide.reading')
          : pending === 'unreadable'
            ? wt('decide.unreadable')
            : wt('decide.noRun')
        : !choice.canDecide
          ? wt('decide.notOwner')
          : null;

  const actionFor = (card: OptionCard): React.ReactNode => {
    if (card.chosen) return null;
    if (card.choice === 'design') {
      return (
        <a
          href={hrefFor('design')}
          data-option-choose-design=""
          className="text-[12px] font-semibold text-cc-ink underline underline-offset-2"
        >
          {wt('decide.chooseInDesign')}
        </a>
      );
    }
    if (blockedWhy) return null;
    return (
      <CcButton
        variant="secondary"
        density="compact"
        disabled={busy}
        onClick={() => {
          setRefusal(null);
          setAsking(card.option as Exclude<DecisionOption, 'rebuild'>);
        }}
        data-option-choose={card.option}
      >
        {wt('decide.choose')}
      </CcButton>
    );
  };

  const asked = asking ? view.cards.find((c) => c.option === asking) ?? null : null;

  return (
    <section id="decision-options" data-decision-options="" data-decision-stage={view.stage} aria-label={wt('decide.optionsLabel')}>
      <p data-decision-proposal="" className="m-0 text-[13px] leading-snug font-semibold text-cc-ink">
        {view.proposal}
      </p>
      <ul className="m-0 mt-3 grid list-none grid-cols-1 gap-3 p-0 min-[560px]:grid-cols-2 xl:grid-cols-4">
        {view.cards.map((card) => (
          <Card key={card.option} card={card} hrefFor={hrefFor} action={actionFor(card)} />
        ))}
      </ul>
      {blockedWhy ? (
        <p data-decision-options-blocked="" className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
          {blockedWhy}
        </p>
      ) : null}
      {refusal ? (
        <div className="mt-3" data-decision-options-refusal="">
          <CcMessageStrip state="error" headline={wt('decide.refused')} announce={true}>
            {refusal}
          </CcMessageStrip>
        </div>
      ) : null}

      <CcMessageBox
        open={asked !== null}
        title={asked ? decideChooseTitle(asked.label) : ''}
        confirmLabel={wt('decide.chooseConfirm')}
        onConfirm={choose}
        onCancel={cancel}
      >
        <ul className="m-0 list-disc space-y-1 pl-5">
          <li>{wt('decide.selfDeclaration')}</li>
          <li>{wt('decide.replaces')}</li>
          <li>{wt('decide.thenConfirm')}</li>
        </ul>
        <div className="mt-3">
          <CcTextarea
            label={wt('decide.reasonLabel')}
            value={reason}
            onChange={(v) => {
              setReason(v);
              if (v.trim()) setMissing(false);
            }}
            rows={3}
            required={true}
            maxLength={4000}
            help={wt('decide.reasonHelp')}
            valueState={missing ? 'error' : undefined}
            message={missing ? wt('decide.reasonMissing') : undefined}
          />
        </div>
      </CcMessageBox>
    </section>
  );
}
