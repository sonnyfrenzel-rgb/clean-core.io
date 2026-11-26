'use client';

import React, { useState } from 'react';
import FamilyChip from '@/components/family/FamilyChip';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcTable from '@/components/cc/Table';
import { SapCheckedText } from '@/components/SapIdentifierCheck';
import {
  COMPARED_OPTION_LABELS,
  MATRIX_ASPECTS,
  MATRIX_ASPECT_LABELS,
  RATING_WORDS,
  readOptionComparison,
  type ComparedOption,
  type ComparisonAspect,
  type OptionComparisonView,
  type RatingLevel,
} from '@/lib/design-option-comparison';
import { cn } from '@/lib/utils';
import { KEY_USER_COMPANY_POLICY, keyUserLevelSentence, type KeyUserStepList } from '@/lib/key-user-steps';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * The SAP standard, key-user extensibility, an in-app RAP extension and a
 * side-by-side CAP application, compared before the design rules the standard
 * out (roadmap 3.0.12; CO review F14, F15). The comparison is the model's,
 * grounded in the engine's option facts, and is marked as a proposal once for
 * the section. A reason that only restates the route ("CAP because the target
 * is CAP") is not shown as a reason: the section says it was refused and why
 * (`readOptionComparison`).
 *
 * Owner 26.11.2026 (mock-up "Design IT: option comparison", accepted): it was one
 * of the weakest parts — four cards of five paragraphs each. Now the answer
 * first (the proposed option and what the others miss), then a matrix with a
 * level and one short line per option and aspect, and each option's full text
 * in a details panel beside the page, as "Cloud service integrations" does.
 */
export default function OptionComparison({ design, keyUser = null, keyUserChosen = false }: {
  design: unknown;
  /**
   * Roadmap 3.0.19: the engine's key-user step list, where the signed run's
   * engine reads key user — its limits stand beside the fourth option. Null:
   * an engine before 3.0.19, and the section is the one it always was.
   */
  keyUser?: KeyUserStepList | null;
  /**
   * Key user is the engine's recommendation or the target the owner confirmed
   * (the page knows both). With the comparison's own proposal, the one reason
   * the key-user limits are shown (`keyUserLimitsShown`).
   */
  keyUserChosen?: boolean;
}) {
  const view = readOptionComparison(design);
  const [detail, setDetail] = useState<ComparedOption | null>(null);
  const fourOptions = view.state === 'ready' && view.options.some((o) => o.option === 'keyuser');
  const limitsShown = keyUserLimitsShown({ view, keyUser, chosen: keyUserChosen });
  const title = fourOptions || keyUser ? 'Which way fits: SAP standard, key user, RAP or CAP?' : 'Which way fits: SAP standard, RAP or CAP?';
  const open = view.state === 'ready' && detail ? view.options.find((o) => o.option === detail) ?? null : null;
  const recommended = view.state === 'ready' ? view.recommended : null;
  return (
    <section
      aria-labelledby="design-options-title"
      data-design-section="options"
      data-option-comparison={view.state}
      className="flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="design-options-title" className="m-0 cc-text-h3 text-cc-ink">{title}</h3>
        {/* Only over a comparison the model wrote: an absent or unreadable one proposes nothing (QA 5a559787: 9af97544d758). */}
        {view.state === 'absent' || view.state === 'malformed' ? null : <FamilyChip value="proposed" />}
      </div>
      {view.state === 'absent' ? (
        <p data-design-not-written="Options compared" className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
          Options compared: no comparison of the SAP standard, RAP and CAP is present in this design. Regenerate to have the model compare them on the engine&apos;s facts.
        </p>
      ) : view.state === 'malformed' ? (
        <p data-option-comparison-malformed="" className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 text-[13px] text-cc-ink-muted">
          The model&apos;s comparison could not be read: {view.why} Regenerate to have it written again.
        </p>
      ) : (
        <>
          {/* The answer first: the proposed option with its reason, beside what the others miss. */}
          {view.reason ? (
            <div data-option-reason="" className="grid min-w-0 grid-cols-1 gap-3 min-[900px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-1 rounded-cc-row border-2 border-cc-ink px-4 py-3">
                <span className="cc-text-label text-cc-ink-muted">Proposed</span>
                <b className="text-[15px] font-bold leading-snug text-cc-ink">{COMPARED_OPTION_LABELS[view.recommended]}</b>
                <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]"><SapCheckedText text={view.reason.text} /></p>
              </div>
              <div className="flex min-w-0 flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted px-4 py-3">
                <span className="cc-text-label text-cc-ink-muted">What the others miss</span>
                <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]"><SapCheckedText text={view.reason.requirement} /></p>
              </div>
            </div>
          ) : (
            <p data-option-reason-refused="" className="m-0 rounded-cc-row border border-cc-warning-border bg-cc-warning-bg px-3 py-2 text-[13px] font-medium text-cc-ink">
              The model&apos;s reason for {COMPARED_OPTION_LABELS[view.recommended]} is not shown: {view.refused} A decision needs the requirement the other options miss — regenerate, or record the reason in the decision.
            </p>
          )}

          {/* The matrix: each option on each aspect, a level and one short line; the full text one click away. The
              family's table (DESIGN.md §2.4): on a phone each aspect becomes a card with the options as labelled lines. */}
          <div className="min-w-0" data-option-matrix="">
            <CcTable
              caption={title}
              columns={[
                { key: 'aspect', label: 'Aspect', width: '150px' },
                ...view.options.map((o) => ({ key: o.option, label: recommended === o.option ? `${SHORT_LABELS[o.option]} · proposed` : SHORT_LABELS[o.option] })),
              ]}
              rows={[
                ...MATRIX_ASPECTS.map((a) => ({
                  key: a,
                  cells: {
                    aspect: <b className="font-semibold text-cc-ink">{MATRIX_ASPECT_LABELS[a]}</b>,
                    ...Object.fromEntries(
                      view.options.map((o) => {
                        const cell = o.cells[a];
                        return [
                          o.option,
                          <span key={o.option} data-option-aspect={a} data-option-of={o.option} className="block">
                            {cell.level ? (
                              <span data-cc-value-state={VALUE_STATE[cell.level]} data-option-level={cell.level} className={cn('block font-bold', LEVEL_CLASS[cell.level])}>
                                <span aria-hidden={true}>{LEVEL_MARK[cell.level]} </span>
                                {RATING_WORDS[a][cell.level]}
                              </span>
                            ) : null}
                            <span className="block text-cc-ink-muted [overflow-wrap:anywhere]">
                              <SapCheckedText text={cell.short} />
                            </span>
                          </span>,
                        ];
                      }),
                    ),
                  },
                })),
                {
                  key: 'details',
                  cells: {
                    aspect: <span className="sr-only">Details</span>,
                    ...Object.fromEntries(
                      view.options.map((o) => [
                        o.option,
                        <span key={o.option} data-option={o.option}>
                          <button
                            type="button"
                            data-option-details={o.option}
                            aria-haspopup="dialog"
                            onClick={() => setDetail(o.option)}
                            className="min-h-11 cursor-pointer border-0 bg-transparent p-0 text-left text-[14px] font-semibold text-cc-information underline underline-offset-2"
                          >
                            Details
                            <span className="sr-only"> of {COMPARED_OPTION_LABELS[o.option]}</span>
                          </button>
                        </span>,
                      ]),
                    ),
                  },
                },
              ]}
            />
          </div>
          <p data-option-legend="" className="m-0 text-[13px] text-cc-ink-muted">
            {LEVEL_MARK.good} fits · {LEVEL_MARK.partial} partly · {LEVEL_MARK.poor} does not fit · {LEVEL_MARK.open} not determined — the
            model&apos;s reading of the engine&apos;s facts. Running cost in words only; amounts are in Economics.
          </p>

          {view.missing.length ? (
            <p data-option-missing="" className="m-0 text-[13px] text-cc-ink-muted">
              Not compared by the model: {view.missing.map((m) => COMPARED_OPTION_LABELS[m]).join(', ')}.
            </p>
          ) : null}
          {keyUser && view.keyUserNotCompared ? (
            <p data-option-key-user-not-compared="" className="m-0 text-[13px] text-cc-ink-muted">
              Key-user extensibility is not compared in this design — it was written before the engine read key-user candidates, or the model left it out. Regenerate the design to compare it{limitsShown ? '; its engine limits are below' : ''}.
            </p>
          ) : null}
          {/* Key user is the way in question (proposed, recommended or chosen): its engine limits stand under the matrix. */}
          {keyUser && limitsShown ? <KeyUserLimits list={keyUser} /> : null}
        </>
      )}
      {keyUser && limitsShown && view.state !== 'ready' ? <KeyUserLimits list={keyUser} /> : null}

      <CcDialog
        open={Boolean(open)}
        title={open ? COMPARED_OPTION_LABELS[open.option] : ''}
        lead={open && recommended === open.option ? 'Proposed · the option in detail' : 'The option in detail'}
        size="wide"
        placement="side"
        onClose={() => setDetail(null)}
        actions={
          <CcButton variant="ghost" onClick={() => setDetail(null)}>
            Close
          </CcButton>
        }
      >
        {open ? (
          <div data-option-detail={open.option} className="flex flex-col gap-5">
            <span className="self-start">
              <FamilyChip value="proposed" />
            </span>
            <dl className="m-0 grid grid-cols-2 gap-2">
              {MATRIX_ASPECTS.filter((a) => a !== 'targetRelease').map((a) => {
                const cell = open.cells[a];
                return (
                  <div key={a} className="rounded-cc-row border border-cc-line px-3 py-2">
                    <dt className="text-[12px] text-cc-ink-muted">{MATRIX_ASPECT_LABELS[a]}</dt>
                    <dd
                      className={cn('m-0 font-bold', cell.level ? LEVEL_CLASS[cell.level] : 'text-cc-ink')}
                      data-cc-value-state={cell.level ? VALUE_STATE[cell.level] : undefined}
                    >
                      {cell.level ? `${LEVEL_MARK[cell.level]} ${RATING_WORDS[a][cell.level]}` : 'Not rated'}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {DETAIL_ASPECTS.map(([a, heading]) => (
              <section key={a} data-option-detail-aspect={a} className="flex flex-col gap-1">
                <h4 className="m-0 cc-text-label text-cc-ink-muted">{heading}</h4>
                <p className="m-0 text-[14px] leading-[21px] text-cc-ink [overflow-wrap:anywhere]">
                  <SapCheckedText text={open[a]} />
                </p>
              </section>
            ))}
            <p className="m-0 border-t border-cc-line pt-3 text-[13px] text-cc-ink-muted">
              The words and levels are the model&apos;s, written on the engine&apos;s facts. Amounts are only in Economics.
            </p>
          </div>
        ) : null}
      </CcDialog>
    </section>
  );
}

/** The column heads, short; the full names stand in the details panel and for screen readers. */
const SHORT_LABELS: Readonly<Record<ComparedOption, string>> = {
  standard: 'SAP standard',
  keyuser: 'Key user',
  rap: 'In-app RAP',
  cap: 'Side-by-side CAP',
};

const LEVEL_MARK: Readonly<Record<RatingLevel, string>> = { good: '●', partial: '◐', poor: '○', open: '?' };

/** A level is a value state (SAP Fiori semantics, DESIGN.md §1.1): green here says "a good value", never "proven". */
const VALUE_STATE: Readonly<Record<RatingLevel, string>> = { good: 'success', partial: 'warning', poor: 'error', open: 'none' };

const LEVEL_CLASS: Readonly<Record<RatingLevel, string>> = {
  good: 'text-cc-success',
  partial: 'text-cc-warning',
  poor: 'text-cc-error',
  open: 'text-cc-ink-muted',
};

/** The details panel's sections, each the model's full sentence. */
const DETAIL_ASPECTS: ReadonlyArray<readonly [ComparisonAspect, string]> = [
  ['fitGap', 'What it covers, and the gap'],
  ['effort', 'What is built or configured'],
  ['dataContract', 'Where each figure comes from'],
  ['runningCost', 'Running cost'],
  ['targetRelease', 'Target release'],
];

/**
 * Whether the key-user limits stand under the comparison (owner decision
 * 22.10.2026): only where key-user extensibility is the option in question —
 * the comparison proposes it, the engine recommends it, or the owner chose it
 * as the target. Otherwise the block and its company-policy note are left out;
 * the key-user option's details keep its own sentences.
 */
export function keyUserLimitsShown({ view, keyUser, chosen }: {
  view: OptionComparisonView;
  keyUser: KeyUserStepList | null;
  chosen: boolean;
}): boolean {
  if (!keyUser) return false;
  if (chosen) return true;
  return view.state === 'ready' && view.recommended === 'keyuser';
}

/**
 * The key-user option's limits as the engine read them — never the model's:
 * each candidate with what decides whether it holds, and each part that stays
 * code with why (roadmap 3.0.19).
 */
function KeyUserLimits({ list }: { list: KeyUserStepList }) {
  return (
    <div data-option-key-user-limits={list.scope} className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
      <span className="flex flex-wrap items-center gap-2">
        <b className="text-[14px] font-bold text-cc-ink">{COMPARED_OPTION_LABELS.keyuser} — the engine&apos;s reading and its limits</b>
        <FamilyChip value="reconstructed" />
      </span>
      <p className="m-0 text-[13px] text-cc-ink [overflow-wrap:anywhere]">{list.sentence}</p>
      {list.levelByConstruction ? (
        <p className="m-0 text-[13px] text-cc-ink" data-key-user-level={list.levelByConstruction}>{keyUserLevelSentence(list.levelByConstruction)}</p>
      ) : null}
      {list.steps.length ? (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-cc-ink">
          {list.steps.map((s) => (
            <li key={s.id} data-option-key-user-step={s.id} className="[overflow-wrap:anywhere]">
              <b className="font-semibold">{s.app}</b> — {s.title}.{' '}
              {s.limits.length ? s.limits.map((l) => l.text).join(' ') : 'No limit named.'}
            </li>
          ))}
        </ul>
      ) : null}
      {list.codeParts.length ? (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13px] text-cc-ink-muted">
          {list.codeParts.map((p) => (
            <li key={p.id} data-option-key-user-code-part={p.id} className="[overflow-wrap:anywhere]">
              {p.part} ({p.verdict === 'code' ? 'stays code' : 'not determined'}): {p.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="m-0 text-[13px] text-cc-ink-muted">{list.note}</p>
      <div data-option-key-user-policy="">
        <CcMessageStrip state="warning" headline="Your company may draw its own line.">
          {KEY_USER_COMPANY_POLICY}
        </CcMessageStrip>
      </div>
    </div>
  );
}
