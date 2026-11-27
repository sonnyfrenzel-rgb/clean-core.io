'use client';

import React from 'react';
import { Check, Crosshair, Minus } from 'lucide-react';
import FamilyChip from '@/components/family/FamilyChip';
import { CcTag } from '@/components/cc/Tag';
import CcTextarea from '@/components/cc/Textarea';
import StandardNoteBox from '@/components/redesign/StandardNoteBox';
import { DECISION_OPTION_LABELS, DECISION_OPTIONS, type DecisionOption } from '@/lib/decision-options';
import { OPTION_SIGNAL_WORDS, type OptionCard } from '@/lib/decision-option-signals';
import { nothingBuiltFollows, type DecideCostLine, type StandardNote } from '@/lib/decide';
import { REDESIGN_DECIDE_ID } from '@/lib/redesign';
import { cn } from '@/lib/utils';

/**
 * The Decide page's choosing state (ADR-145; mock-up `decision-flow/index.html`, screen 2), drawn from its props alone so
 * the project page and the demo cannot drift apart: the target line, then three numbered cards — what each choice
 * costs (a simulation), the decision (four options as one radio group, nothing pre-selected, the analysis' indication
 * as a tag), what the choice needs (route and business questions for a Rebuild, reason and "what follows" for the
 * others) — and the one bar at the bottom with the one confirmation (`bar`). Writes nothing itself.
 */
export interface DecideViewProps {
  /** "SAP Cloud ERP Private", or `null` when the project states no edition. */
  edition: string | null;
  /** Whether the run carries the edition (a signed run of this source). */
  editionSigned: boolean;
  cost: DecideCostLine;
  /** Economics, for own figures; `null` hides the link (the demo). */
  economicsHref: string | null;
  cards: readonly OptionCard[];
  indicated: DecisionOption | null;
  choice: DecisionOption | null;
  onChoose: ((option: DecisionOption) => void) | null;
  /** Box B, or `null`: no box without signals. */
  note: StandardNote | null;
  checkHref: string | null;
  runDate: string | null;
  /** Route and business questions, shown once Rebuild is chosen. */
  rebuild: React.ReactNode;
  /** The reason field of an option that builds nothing; `null` where nothing can be written (the demo, a reader). */
  reason: { value: string; onChange: (v: string) => void; required: boolean; follows: string | null } | null;
  /** A line above the options: an option chosen earlier and not recorded. */
  earlier?: React.ReactNode;
  bar: React.ReactNode;
}

function StepHead({ n, state, title, children, id }: { n: number; state: 'done' | 'now' | 'wait'; title: string; children?: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        aria-hidden={true}
        className={cn(
          'flex size-[26px] shrink-0 items-center justify-center rounded-full border-2 cc-text-meta font-bold',
          state === 'done'
            ? 'border-cc-success bg-cc-success-bg text-cc-success'
            : state === 'now'
              ? 'border-cc-ink bg-cc-ink text-cc-on-dark'
              : 'border-cc-ink-muted bg-cc-surface text-cc-ink-muted',
        )}
      >
        {state === 'done' ? <Check size={14} /> : n}
      </span>
      <h2 id={id} className="m-0 cc-text-body font-bold text-cc-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}

const CARD = 'min-w-0 scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-4 shadow-cc max-[720px]:px-4';
const BODY = 'mt-3 pl-9 max-[720px]:pl-0';
const LABEL = 'm-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase';

export default function DecideView(props: DecideViewProps) {
  const { cost, cards, indicated, choice, onChoose } = props;
  const rebuild = choice === 'rebuild';
  const radios = React.useRef<Array<HTMLButtonElement | null>>([]);
  // A radio group: the arrows move the choice, as in every radio group (WAI-ARIA), Tab leaves it.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (!onChoose) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + DECISION_OPTIONS.length) % DECISION_OPTIONS.length;
    onChoose(DECISION_OPTIONS[next]);
    radios.current[next]?.focus();
  };
  const tabStop = choice ?? DECISION_OPTIONS[0];

  return (
    <div data-decide="" data-decide-choice={choice ?? 'none'} className="flex flex-col gap-4">
      <div
        data-decide-target=""
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 cc-text-cell text-cc-ink"
      >
        <Crosshair size={16} aria-hidden={true} className="shrink-0 text-cc-information" />
        {props.edition ? (
          <span>
            Target: <b className="font-bold">{props.edition}</b> {props.editionSigned ? <FamilyChip kind="signed" note="with the run" /> : null}
          </span>
        ) : (
          <span>Target edition: not stated for this project.</span>
        )}
        <span className="text-cc-ink-muted">Chosen once, at import. Another target is a new analysis run, not a later step.</span>
      </div>

      <section aria-labelledby="decide-cost-h" data-decide-cost={cost.basis} className={CARD}>
        <StepHead n={1} state={cost.basis === 'none' ? 'wait' : 'done'} title={`What each choice costs${cost.period ? ` over ${cost.period}` : ''}`} id="decide-cost-h">
          <FamilyChip kind="simulation" />
          {props.economicsHref ? (
            <a href={props.economicsHref} data-decide-economics="" className="ml-auto cc-text-cell font-semibold text-cc-ink underline underline-offset-2">
              {cost.basis === 'stored' ? 'Change your figures in Economics' : 'Use your own figures in Economics'}
            </a>
          ) : null}
        </StepHead>
        <div className={BODY}>
          {cost.basis === 'none' ? (
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              Not priced: there is no source to size the options from. Economics prices them on your own figures.
            </p>
          ) : (
            <>
              <ul className="m-0 grid list-none grid-cols-4 gap-3 p-0 max-[1100px]:grid-cols-2">
                {DECISION_OPTIONS.map((o) => (
                  <li key={o} data-decide-cost-option={o} className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-3 py-2">
                    <p className="m-0 cc-text-meta font-semibold text-cc-ink-muted">{DECISION_OPTION_LABELS[o]}</p>
                    <p className="m-0 mt-1 text-[15px] font-extrabold text-cc-ink tabular-nums">{cost.cost[o] ?? 'Not priced'}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={LABEL}>{cost.basis === 'stored' && !cost.typical ? 'Priced on your figures in Economics' : 'Priced on typical assumptions'}</span>
                {cost.chips.map((c) => (
                  <span key={c.label} className="inline-flex items-center gap-2 rounded-cc-row border border-cc-line bg-cc-surface px-2 py-1 cc-text-meta font-semibold text-cc-ink">
                    <span className="font-medium text-cc-ink-muted">{c.label}</span>
                    {c.value}
                  </span>
                ))}
              </div>
              <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted">A simulation, not a quote. Lowest cost is not the decision by itself.</p>
            </>
          )}
        </div>
      </section>

      <section id={REDESIGN_DECIDE_ID} aria-labelledby="decide-choice-h" className={CARD}>
        <StepHead n={2} state={choice ? 'done' : 'now'} title="Your decision" id="decide-choice-h">
          <span className="cc-text-meta text-cc-ink-muted">Nothing is pre-selected.</span>
        </StepHead>
        <div className={cn(BODY, 'flex flex-col gap-3')}>
          {indicated ? (
            <p data-decide-indication="" className="m-0 cc-text-cell text-cc-ink">
              The analysis indicates <span className="font-semibold">{DECISION_OPTION_LABELS[indicated]}</span>: an indication, not a decision.
            </p>
          ) : (
            <p data-decide-indication="" className="m-0 cc-text-cell text-cc-ink">
              The evidence does not point to one option: the choice is yours.
            </p>
          )}
          {props.earlier ? <p data-decide-earlier="" className="m-0 cc-text-cell text-cc-ink-muted">{props.earlier}</p> : null}
          {props.note ? (
            <StandardNoteBox
              note={props.note}
              runDate={props.runDate}
              onChooseStandard={onChoose ? () => onChoose('standard') : null}
              checkHref={props.checkHref}
            />
          ) : null}
          <div role="radiogroup" aria-labelledby="decide-choice-h" className="grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[720px]:grid-cols-1">
            {DECISION_OPTIONS.map((o, i) => {
              const card = cards.find((c) => c.option === o);
              const checked = choice === o;
              return (
                <button
                  key={o}
                  ref={(el) => {
                    radios.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={onChoose ? undefined : true}
                  tabIndex={o === tabStop ? 0 : -1}
                  data-decide-option={o}
                  data-decide-option-indicated={indicated === o ? '' : undefined}
                  onClick={() => onChoose?.(o)}
                  onKeyDown={(e) => onKey(e, i)}
                  className={cn('flex min-h-11 min-w-0 rounded-cc-row text-left text-cc-ink', onChoose ? 'cursor-pointer' : 'cursor-default')}
                >
                  {/* The card's surface on a span, so the radio itself stays a plain control (DESIGN.md §1.5). */}
                  <span
                    className={cn(
                      'flex w-full min-w-0 flex-col gap-2 rounded-cc-row border p-3',
                      // Two pixels of ink when chosen, as in the mock-up, without the card moving: the border plus an inset ring.
                      checked ? 'border-cc-ink bg-cc-surface-muted ring-1 ring-cc-ink ring-inset' : 'border-cc-line bg-cc-surface hover:border-cc-field-border',
                    )}
                  >
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden={true}
                      className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-cc-ink' : 'border-cc-field-border')}
                    >
                      {checked ? <span className="size-2 rounded-full bg-cc-ink" /> : null}
                    </span>
                    <span className="text-[15px] font-bold">{DECISION_OPTION_LABELS[o]}</span>
                    {indicated === o ? <CcTag>Indicated by the analysis</CcTag> : null}
                  </span>
                  <span className="cc-text-meta leading-snug font-medium text-cc-ink-muted">{card?.meaning}</span>
                  {card ? (
                    <span
                      data-decide-option-evidence={card.signal}
                      className={cn(
                        'cc-text-meta leading-snug font-semibold',
                        card.signal === 'for' ? 'text-cc-information' : card.signal === 'against' ? 'text-cc-warning' : 'text-cc-ink',
                      )}
                    >
                      {OPTION_SIGNAL_WORDS[card.signal]}: {card.reason}
                    </span>
                  ) : null}
                  <span className="mt-auto border-t border-cc-line pt-2 text-[13px] font-bold tabular-nums">{cost.cost[o] ?? 'Not priced'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="decide-needs-h" data-decide-needs={choice ? (rebuild ? 'rebuild' : 'nothing-built') : 'none'} className={CARD}>
        <StepHead n={3} state={choice ? 'now' : 'wait'} title="What it needs from you" id="decide-needs-h">
          <span className="cc-text-meta text-cc-ink-muted">
            {!choice ? 'Choose an option first.' : rebuild ? 'The route and the business questions.' : 'Your reason, and what follows.'}
          </span>
        </StepHead>
        {rebuild ? <div className={BODY}>{props.rebuild}</div> : null}
        {choice && !rebuild ? (
          <div className={BODY}>
            <p className={LABEL}>What follows</p>
            <ul data-decide-follows="" className="m-0 mt-2 flex list-none flex-col gap-2 p-0 cc-text-cell text-cc-ink">
              {nothingBuiltFollows(choice).map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Minus size={16} aria-hidden={true} className="mt-1 shrink-0 text-cc-ink-muted" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            {props.reason ? (
              props.reason.follows ? (
                <p data-decide-reason-follows="" className="m-0 mt-3 cc-text-cell text-cc-ink">
                  You follow the analysis&apos; indication, so no reason is asked. Recorded with the decision: <span className="text-cc-ink-muted">{props.reason.follows}</span>
                </p>
              ) : (
                <div className="mt-3 max-w-2xl" data-decide-reason="">
                  <CcTextarea
                    label={props.reason.required && indicated ? `Why this option (required: the analysis indicates ${DECISION_OPTION_LABELS[indicated]})` : 'Why this option (required)'}
                    value={props.reason.value}
                    onChange={props.reason.onChange}
                    rows={3}
                    required={true}
                    maxLength={4000}
                    placeholder="For example: the approval runs in the new procurement tool since Q3."
                    help="Kept with the decision. Not asked when you follow the indication."
                  />
                </div>
              )
            ) : null}
          </div>
        ) : null}
      </section>

      {props.bar}
    </div>
  );
}

/** The one bar at the bottom: what is chosen, and the one confirmation. Sticky at the page's bottom edge. */
export function DecideBar({ summary, sub, action, refusal }: { summary: React.ReactNode; sub: React.ReactNode; action: React.ReactNode; refusal?: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Record the decision"
      data-decide-bar=""
      className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-3 shadow-cc-dialog max-[720px]:-mx-4 max-[720px]:rounded-b-none max-[720px]:px-4 print:static"
    >
      {refusal}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p data-decide-bar-summary="" className="m-0 min-w-0 flex-[1_1_320px] cc-text-cell font-semibold text-cc-ink">
          {summary}
          <span className="mt-1 block cc-text-meta font-medium text-cc-ink-muted">{sub}</span>
        </p>
        <div className="max-[720px]:w-full max-[720px]:[&>*]:w-full">{action}</div>
      </div>
    </div>
  );
}
