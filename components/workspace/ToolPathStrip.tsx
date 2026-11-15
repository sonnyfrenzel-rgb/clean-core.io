import React from 'react';
import { PHASES } from '@/lib/workflow-steps';
import { wt } from '@/lib/workspace-messages';

/**
 * The seven tools in one quiet line — the home page's first view (AB-14a,
 * home mockup v2.1, state 1). Analyze stands alone and outlined under "A
 * complete result on its own"; the six after it are dashed under "Optional, if
 * you want to re-design it", because an analysis alone is a finished result and
 * re-design is never the next step the home page offers (H-O3).
 *
 * The names and their order are `PHASES` of `lib/workflow-steps.ts` — the tool
 * bar's own — and are never written here. Only the one-line purpose for this
 * strip is copy (`home.path.<key>`). A picture of the path, not a control: no
 * link, no state, the same for every account.
 *
 * At 1100 px and below Analyze stands above a 3 × 2 grid; on a phone the grid
 * has two columns, and the strip moves below the start (`HomeFirstView`).
 */
export default function ToolPathStrip() {
  const [first, ...rest] = PHASES;
  return (
    <section aria-labelledby="home-path-title" data-home-path="" className="grid grid-cols-1 gap-4 min-[1101px]:grid-cols-[minmax(0,1.35fr)_minmax(0,6fr)]">
      <h2 id="home-path-title" className="sr-only">
        {wt('home.pathTitle')}
      </h2>
      <div>
        <span className="mb-2 block text-[11px] font-semibold tracking-[0.08em] text-cc-ink uppercase">{wt('home.pathComplete')}</span>
        <div
          data-home-path-step={first.key}
          className="flex min-w-0 items-start gap-2 rounded-cc-card border-[1.5px] border-cc-ink bg-cc-surface px-3 py-3 min-[1101px]:h-[calc(100%-24px)]"
        >
          <StepNumber n={first.n} on />
          <div className="min-w-0">
            <b className="block text-[13px] leading-snug font-bold text-cc-ink">{first.label}</b>
            <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">{wt(`home.path.${first.key}`)}</span>
          </div>
        </div>
      </div>
      <div>
        <span className="mb-2 block text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('home.pathOptional')}</span>
        <ol className="m-0 grid list-none grid-cols-2 gap-y-3 rounded-cc-card border border-dashed border-cc-field-border bg-cc-surface-muted px-2 py-3 min-[601px]:grid-cols-3 min-[1101px]:grid-cols-6 min-[1101px]:gap-y-0">
          {rest.map((phase, i) => (
            <li
              key={phase.key}
              data-home-path-step={phase.key}
              className={
                'flex min-w-0 items-start gap-2 px-2 ' +
                // The dividers between neighbours of one row, for each grid.
                (i % 2 === 1 ? 'border-l border-cc-line ' : '') +
                (i % 3 === 0 ? 'min-[601px]:border-l-0 ' : 'min-[601px]:border-l min-[601px]:border-cc-line ') +
                (i === 0 ? 'min-[1101px]:border-l-0' : 'min-[1101px]:border-l min-[1101px]:border-cc-line')
              }
            >
              <StepNumber n={phase.n} />
              <div className="min-w-0">
                <b className="block text-[13px] leading-snug font-bold text-cc-ink">{phase.label}</b>
                <span className="mt-1 block text-[12px] leading-snug font-medium text-cc-ink-muted">{wt(`home.path.${phase.key}`)}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepNumber({ n, on = false }: { n: number; on?: boolean }) {
  return (
    <span
      aria-hidden={true}
      className={
        'mt-px flex size-5 flex-none items-center justify-center rounded-full border text-[11px] font-bold ' +
        (on ? 'border-cc-ink bg-cc-ink text-cc-on-dark' : 'border-cc-field-border bg-cc-surface text-cc-ink-muted')
      }
    >
      {n}
    </span>
  );
}
