'use client';

import React, { useMemo, useState } from 'react';
import { TriangleAlert, User } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcStateText from '@/components/cc/StateText';
import CcTable from '@/components/cc/Table';
import {
  MANY_RACI_ROLES,
  RACI_LETTERS,
  lettersOf,
  raciMatrix,
  sopSteps,
  type GlanceAnchor,
  type ProcessStepRef,
  type RaciLetter,
  type SopStep,
  type StoredBusinessLayer,
} from '@/lib/business-summary';
import { NOT_DETERMINED_LABEL } from '@/lib/process-documentation';
import {
  raciGapLines,
  raciGapWord,
  raciLetterWord,
  sopStepsCount,
  stepNumberLabel,
  wt,
} from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';
import { showAllLabel, showFirstLabel } from '@/lib/cc-messages';

/**
 * The business layer of the Documentation stage, drawn for a business reader —
 * owner, 03.10.2026: "clearly more visual, with less text, and to the point".
 *
 * Three things, in the order a reader asks for them:
 *
 *   1. **the SOP as a step strip** — every step in the order of the process,
 *      who is Responsible, the outcome in one line, the step's lines and its
 *      provenance chip: *Reconstructed* or *Confirmed* for a step of the
 *      process read from the code, *Model proposal* for one the model named and
 *      the code does not have;
 *   2. **the RACI as a matrix** — steps × roles, a coloured letter per cell, a
 *      legend, and the gaps said in words: a step with no Accountable or with
 *      several, a step with no Responsible, a role Responsible almost
 *      everywhere. On a phone it is a list per step (`DESIGN.md` §2.9);
 *   3. **the full text, folded** — narrative and exception handling, every
 *      field as stored, a missing one as *Not determined*. Since roadmap 3.0.7
 *      ("Documentation lean") the model proposes no KPI targets and no control
 *      checkpoints — the controls are the code reading's, section 8 of the
 *      description — and a layer stored before keeps them in its data, not on
 *      the screen.
 *
 * The layer is a model proposal from end to end and says so on the section,
 * on the matrix and in the fold. Nothing is added to it here: the data is
 * `lib/business-summary.ts` over the stored JSON.
 */

const SECTION = 'rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-6';

/** The four letters — categorical colours (§1.8), never a state colour: a RACI letter proves nothing. */
const LETTER_CLASSES: Record<RaciLetter, string> = {
  R: 'border-cc-chart-2 bg-cc-chart-2 text-cc-on-dark',
  A: 'border-cc-chart-1 bg-cc-chart-1 text-cc-on-dark',
  C: 'border-cc-chart-2 bg-cc-surface text-cc-chart-2',
  I: 'border-dashed border-cc-field-border bg-cc-surface text-cc-ink-muted',
};

export function RaciChip({ letter }: { letter: RaciLetter }) {
  return (
    <span
      data-raci-letter={letter}
      title={raciLetterWord(letter)}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border font-cc-mono text-[12px] font-semibold',
        LETTER_CLASSES[letter],
      )}
    >
      <span aria-hidden={true}>{letter}</span>
      <span className="sr-only">{raciLetterWord(letter)}</span>
    </span>
  );
}

const anchorText = (a: GlanceAnchor) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`);
const anchorLabel = (a: GlanceAnchor) =>
  a.lineStart === a.lineEnd ? `Source line ${a.lineStart}` : `Source lines ${a.lineStart} to ${a.lineEnd}`;

function StepAnchor({ step }: { step: SopStep }) {
  const anchor = step.step?.anchor ?? null;
  return anchor ? (
    <CcAnchor label={anchorLabel(anchor)}>{anchorText(anchor)}</CcAnchor>
  ) : (
    <CcAnchor tone="unlinked" label="No line range">no lines</CcAnchor>
  );
}

/** The step's own provenance; a step the code does not have is the model's. */
function StepChip({ step }: { step: SopStep }) {
  return <CcProvenanceChip value={step.step ? step.step.provenance : 'proposed'} />;
}

function stepName(step: SopStep): string {
  return step.step?.name ?? step.stepId;
}

function NumberDisc({ n }: { n: number }) {
  return (
    <span
      aria-hidden={true}
      className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cc-ink px-1 text-[12px] font-semibold text-cc-on-dark"
    >
      {n}
    </span>
  );
}

function Missing() {
  return <span className="cc-text-cell text-cc-ink-muted">{NOT_DETERMINED_LABEL}</span>;
}

/* ------------------------------------------------------------- the strip */

/** On a phone a list shows its first five and "Show all" (`DESIGN.md` §2.11). */
const PHONE_ROWS = 5;
/** From S upwards the strip shows its first row of four and "Show all" (owner 04.10.2026: nothing at full length by default). */
const STRIP_ROWS = 4;

function SopStrip({ steps }: { steps: SopStep[] }) {
  const [all, setAll] = useState(false);
  return (
    <>
    <ol data-sop-strip="" className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, i) => (
        <li
          key={step.stepId}
          data-sop-step={step.stepId}
          data-sop-in-process={step.step ? 'true' : 'false'}
          aria-label={stepNumberLabel(step.number, stepName(step))}
          className={cn(
            'min-w-0 flex-col gap-2 rounded-cc-row border bg-cc-surface p-3',
            step.step ? 'border-cc-line' : 'border-dashed border-cc-field-border',
            all ? 'flex' : i >= STRIP_ROWS ? 'hidden print:flex' : 'flex',
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <NumberDisc n={step.number} />
            <p className="m-0 min-w-0 cc-text-identifier text-cc-ink break-words">{stepName(step)}</p>
          </div>
          <p data-sop-outcome="" className={cn('m-0 cc-text-cell', step.outcome ? 'text-cc-ink' : 'text-cc-ink-muted')}>
            {step.outcome ?? wt('doc.sopOutcomeMissing')}
          </p>
          {step.step ? null : <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">{wt('doc.sopNotInProcess')}</p>}
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex min-w-0 items-center gap-1 cc-text-meta text-cc-ink">
              <User size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />
              <span className="sr-only">{wt('doc.sopResponsible')}:</span>
              {step.roles.R.length ? <span className="break-words">{step.roles.R.join(', ')}</span> : <Missing />}
            </span>
            <StepAnchor step={step} />
            <StepChip step={step} />
          </div>
        </li>
      ))}
    </ol>
    {steps.length > STRIP_ROWS ? (
      <div className="mt-2">
        <CcButton variant="ghost" aria-expanded={all} onClick={() => setAll((v) => !v)} data-sop-strip-all="">
          {all ? showFirstLabel(STRIP_ROWS) : showAllLabel(steps.length)}
        </CcButton>
      </div>
    ) : null}
    </>
  );
}

/* ------------------------------------------------------------- the matrix */

function Legend() {
  return (
    <ul data-raci-legend="" aria-label={wt('doc.raciLegend')} className="m-0 flex list-none flex-wrap items-center gap-3 p-0">
      {RACI_LETTERS.map((letter) => (
        <li key={letter} className="inline-flex items-center gap-1 cc-text-meta font-medium text-cc-ink-muted">
          <RaciChip letter={letter} />
          <span aria-hidden={true}>{raciLetterWord(letter)}</span>
        </li>
      ))}
    </ul>
  );
}

function GapWords({ gaps }: { gaps: Array<Parameters<typeof raciGapWord>[0]> }) {
  if (gaps.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-2">
      {gaps.map((gap) => (
        <span key={gap} data-raci-gap={gap}>
          <CcStateText state="warning">{raciGapWord(gap)}</CcStateText>
        </span>
      ))}
    </span>
  );
}

function RaciSection({ steps, action }: { steps: SopStep[]; action?: React.ReactNode }) {
  const matrix = useMemo(() => raciMatrix(steps), [steps]);
  const overloaded = matrix.roles.filter((r) => r.overloaded);
  const gapLines = raciGapLines(
    matrix.gapCount,
    overloaded.map((r) => ({ name: r.name, r: r.counts.R })),
    matrix.steps.length,
  );
  const [allOnPhone, setAllOnPhone] = useState(false);

  return (
    <div data-raci-section="" className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
          {wt('doc.raciTitle')} <CcProvenanceChip value="proposed" />
          <span className="cc-text-meta font-medium text-cc-ink-muted">{wt('doc.raciProposalNote')}</span>
        </h3>
        <Legend />
      </div>
      {matrix.totalRoles > MANY_RACI_ROLES ? (
        <div data-raci-too-many={matrix.totalRoles} className="flex flex-col gap-2 rounded-cc-row border border-cc-warning-border bg-cc-warning-bg p-3">
          <p className="m-0 flex items-start gap-2 cc-text-cell text-cc-ink">
            <TriangleAlert size={16} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-warning" />
            <span>
              This proposal names {matrix.totalRoles} roles — more than a process of this size needs.
              {action ? ' Regenerate SOP and RACI for a smaller set.' : ' The owner can regenerate it for a smaller set.'}
            </span>
          </p>
          {action}
        </div>
      ) : null}
      {matrix.steps.length === 0 ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">{wt('doc.raciNoRows')}</p>
      ) : (
        <>
          {gapLines.length ? (
            <ul data-raci-gaps={gapLines.length} className="m-0 flex list-none flex-col gap-1 p-0 sm:flex-row sm:flex-wrap sm:gap-4">
              {gapLines.map((line) => (
                <li key={line} className="flex min-w-0 items-start gap-1 cc-text-meta text-cc-warning">
                  <TriangleAlert size={14} aria-hidden={true} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">{line}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-raci-gaps="0" className="m-0 cc-text-cell text-cc-ink-muted">{wt('doc.raciNoGaps')}</p>
          )}

          {/* From S upwards: the matrix. Steps down, roles across. */}
          <div data-raci-matrix="" className="hidden sm:block">
            <CcTable
              caption={wt('doc.raciCaption')}
              columns={[
                { key: 'step', label: wt('doc.sopStepColumn'), width: '220px' },
                ...matrix.roles.map((role) => ({
                  key: `role-${role.name}`,
                  // A long role name is shortened in the head; the key under the
                  // matrix names it in full — read, not hovered (owner 04.10.2026).
                  label: role.short === role.name ? role.name : `${role.short}`,
                })),
                { key: 'check', label: wt('doc.raciGapCheck') },
              ]}
              rows={matrix.steps.map((step) => ({
                key: step.stepId,
                cells: {
                  step: (
                    <span data-raci-row={step.stepId} className="flex min-w-0 items-start gap-2">
                      <NumberDisc n={step.number} />
                      <span className="min-w-0 break-words">{stepName(step)}</span>
                    </span>
                  ),
                  ...Object.fromEntries(
                    matrix.roles.map((role) => {
                      const letters = lettersOf(step, role.name);
                      return [
                        `role-${role.name}`,
                        letters.length ? (
                          <span data-raci-cell={letters.join('')} className="inline-flex gap-1">
                            {letters.map((l) => <RaciChip key={l} letter={l} />)}
                          </span>
                        ) : null,
                      ];
                    }),
                  ),
                  check: (
                    <span className="inline-flex flex-col gap-1">
                      <GapWords gaps={step.gaps} />
                      {/* An Accountable whose role is not a column is named here — never hidden. */}
                      {step.hiddenAccountable.length ? (
                        <span data-raci-hidden-accountable="" className="inline-flex items-center gap-1 cc-text-meta text-cc-ink">
                          <RaciChip letter="A" /> {step.hiddenAccountable.join(', ')}
                        </span>
                      ) : null}
                    </span>
                  ),
                },
              }))}
            />
            {matrix.roles.some((r) => r.short !== r.name) ? (
              <p data-raci-key="" className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">
                <span className="text-cc-ink">{wt('doc.raciKey')}:</span>{' '}
                {matrix.roles.filter((r) => r.short !== r.name).map((r) => `${r.short} = ${r.name}`).join(' · ')}
              </p>
            ) : null}
          </div>
          {matrix.moreRoles.length ? (
            <div data-raci-more-roles={matrix.moreRoles.length}>
              <CcDisclosure title={wt('doc.raciMoreRoles')} count={matrix.moreRoles.length} density="compact"
                summary={matrix.moreRoles.slice(0, 3).map((r) => r.name).join(' · ')}>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {matrix.moreRoles.map((role) => (
                    <li key={role.name} className="min-w-0 cc-text-cell text-cc-ink">
                      <span className="font-semibold">{role.name}</span>{' '}
                      <span className="text-cc-ink-muted">
                        {matrix.steps
                          .map((s) => ({ s, letters: lettersOf(s, role.name) }))
                          .filter((x) => x.letters.length)
                          .map((x) => `${x.letters.join('')} on ${x.s.number}`)
                          .join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </CcDisclosure>
            </div>
          ) : null}

          {/* On a phone: one entry per step, the roles under it — no sideways scroll. */}
          <ol data-raci-list="" className="m-0 flex list-none flex-col gap-2 p-0 sm:hidden">
            {matrix.steps.map((step, i) => (
              <li
                key={step.stepId}
                data-raci-list-step={step.stepId}
                className={cn('rounded-cc-row border border-cc-line p-3', !allOnPhone && i >= PHONE_ROWS && 'hidden print:block')}
              >
                <p className="m-0 flex items-start gap-2 cc-text-identifier text-cc-ink">
                  <NumberDisc n={step.number} />
                  <span className="min-w-0 break-words">{stepName(step)}</span>
                </p>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {RACI_LETTERS.filter((l) => step.roles[l].length > 0).map((letter) => (
                    <li key={letter} className="flex min-w-0 items-center gap-2 cc-text-cell text-cc-ink">
                      <RaciChip letter={letter} />
                      <span className="min-w-0 break-words">{step.roles[letter].join(', ')}</span>
                    </li>
                  ))}
                </ul>
                {step.gaps.length ? <div className="mt-2"><GapWords gaps={step.gaps} /></div> : null}
              </li>
            ))}
          </ol>
          {matrix.steps.length > PHONE_ROWS + 1 ? (
            <div className="sm:hidden">
              <CcButton variant="ghost" aria-expanded={allOnPhone} onClick={() => setAllOnPhone((v) => !v)}>
                {allOnPhone ? showFirstLabel(PHONE_ROWS) : showAllLabel(matrix.steps.length)}
              </CcButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- the full text */

function FullSop({ steps }: { steps: SopStep[] }) {
  return (
    <div data-sop-full="" className="mt-6 border-t border-cc-line pt-3">
      <CcDisclosure title={wt('doc.sopFull')} count={steps.length} summary={wt('doc.sopFullSummary')} level={3}>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {steps.map((step) => (
            <li key={step.stepId} data-sop-full-step={step.stepId} className="rounded-cc-row border border-cc-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <NumberDisc n={step.number} />
                <h4 className="m-0 cc-text-identifier text-cc-ink">{stepName(step)}</h4>
                <span className="font-cc-mono text-[11px] text-cc-ink-muted">{step.stepId}</span>
                <StepAnchor step={step} />
              </div>
              <dl className="m-0 mt-2 grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)]">
                <dt className="cc-text-label text-cc-ink-muted">{wt('doc.sopNarrative')}</dt>
                <dd className="m-0 cc-text-cell text-cc-ink">{step.narrative ?? <Missing />}</dd>
                <dt className="cc-text-label text-cc-ink-muted">{wt('doc.sopException')}</dt>
                <dd className="m-0 cc-text-cell text-cc-ink">{step.exception ?? <Missing />}</dd>
              </dl>
            </li>
          ))}
        </ol>
        <p data-sop-controls-from-code="" className="m-0 mt-4 cc-text-cell text-cc-ink-muted">
          <a href="#pd-controls" className="text-cc-ink underline underline-offset-2">{wt('doc.sopControlsFromCode')}</a>
        </p>
      </CcDisclosure>
    </div>
  );
}

/* ------------------------------------------------------------- the section */

export default function BusinessLayer({
  layer,
  process,
  action,
  embedded = false,
}: {
  layer: StoredBusinessLayer;
  /** The steps of the process read from the code, in flow order. */
  process: ProcessStepRef[];
  /** The owner's "Regenerate SOP and RACI" — absent for a reader. */
  action?: React.ReactNode;
  /** Inside the stage's one card of model proposals (roadmap 3.0.7): no card of its own, a heading one level down. */
  embedded?: boolean;
}) {
  const steps = useMemo(() => sopSteps(layer, process), [layer, process]);
  // Too many roles: the regenerate action stands in the notice above the matrix, not twice.
  const tooMany = useMemo(() => raciMatrix(steps).totalRoles > MANY_RACI_ROLES, [steps]);
  return (
    <section
      data-stage-output="businessDocumentation"
      data-business-sop=""
      aria-labelledby="business-sop-title"
      className={embedded ? 'min-w-0' : cn(SECTION, 'mb-6')}
    >
      <div className="flex flex-wrap items-center gap-2">
        {embedded
          ? <h3 id="business-sop-title" className="m-0 cc-text-h3 text-cc-ink">{wt('doc.sopTitle')}</h3>
          : <h2 id="business-sop-title" className="m-0 cc-text-h2 text-cc-ink">{wt('doc.sopTitle')}</h2>}
        <CcProvenanceChip value="proposed" />
        <span className="cc-text-meta font-medium text-cc-ink-muted">{sopStepsCount(steps.length)}</span>
      </div>
      <p className="m-0 mt-1 mb-4 cc-text-cell text-cc-ink-muted">{wt('doc.sopLead')}</p>
      {action && !tooMany ? <div data-business-layer-action="" className="mb-4">{action}</div> : null}
      <SopStrip steps={steps} />
      <RaciSection steps={steps} action={tooMany ? action : undefined} />
      <FullSop steps={steps} />
    </section>
  );
}
