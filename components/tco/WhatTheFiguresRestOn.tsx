'use client';

import React, { useState } from 'react';
import CcButton from '@/components/cc/Button';
import FamilyChip from '@/components/family/FamilyChip';
import { formatLines, formatMoney } from '@/lib/format';
import { formatUplift, type BaselineProposal, type SharedFigure } from '@/lib/cost-assumptions';
import { yearsWords } from '@/lib/economics-answer';

/**
 * "What the figures rest on" (ADR-128, mock-up E10) — the side column that replaced step 1, "Your codebase": what is
 * read from the code (the lines, the score, the route the analysis proposes — each with its source), what
 * Clean-Core.io proposes (the fixed factors), and the reader's own figures. "Model another size" edits the line count
 * the proposals scale with, here and nowhere else.
 */
export default function WhatTheFiguresRestOn({
  loc,
  sourceLoc,
  onLoc,
  editable,
  score,
  scoreStale,
  route,
  baseline,
  factors,
  figures,
  typical = [],
  typicalWords = null,
  saved,
}: {
  loc: number | null;
  sourceLoc: number | null;
  /** "Model another size" — `null` puts it back to the lines of the source. Absent: read-only. */
  onLoc?: (loc: number | null) => void;
  editable: boolean;
  score: number | null;
  /** The source changed after the signed run: the score describes other code. */
  scoreStale: boolean;
  /** The route the analysis proposes, in words, or `null`. */
  route: string | null;
  baseline: BaselineProposal | null;
  /** Where the fixed factors stand: proposals waiting, taken over, or not offered (no lines). */
  factors: 'pending' | 'taken' | 'typical' | 'none';
  figures: { currency: string; dev: number | null; test: number | null; years: number | null; cadence: number | null };
  /** 3.5.1 (ADR-144): the shared figures that are typical values, not the reader's — listed apart, never as "Your figures". */
  typical?: readonly SharedFigure[];
  /** The typical values in use, in words (`typicalInWords`), or `null` when none is. */
  typicalWords?: string | null;
  /** Whether the figures are saved — the last line of the card (one card fewer in the side column, DESIGN.md §5). */
  saved?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const isTypical = (f: SharedFigure) => typical.includes(f);
  const stated =
    figures.currency && !isTypical('currency') && figures.dev !== null && !isTypical('devDayRate') && figures.test !== null && !isTypical('testDayRate');
  const mine = [
    figures.currency && !isTypical('currency') ? figures.currency : null,
    figures.dev !== null && !isTypical('devDayRate') ? `${formatMoney(figures.dev, figures.currency) ?? figures.dev} a developer day` : null,
    figures.test !== null && !isTypical('testDayRate') ? `${formatMoney(figures.test, figures.currency) ?? figures.test} a key-user day` : null,
    figures.years !== null && !isTypical('horizonYears') ? yearsWords(figures.years) : null,
    figures.cadence !== null && !isTypical('releaseCadence') ? `${figures.cadence} release${figures.cadence === 1 ? '' : 's'} a year` : null,
  ].filter(Boolean);
  const group = 'm-0 mt-3 cc-text-meta font-semibold text-cc-ink-muted first:mt-0';
  const row = 'm-0 mt-2 flex flex-col gap-1';
  return (
    <div data-economics-rest-on="" className="flex flex-col">
      <p className={group}>Read from the code</p>
      <div className={row} data-economics-rest="lines">
        <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
          <span data-stage-output="legacyCode">{loc === null ? 'No line count' : `${formatLines(loc)} lines`}</span>
          <FamilyChip kind={sourceLoc !== null && loc === sourceLoc ? 'engine' : 'yours'} />
        </span>
        <span className="cc-text-meta text-cc-ink-muted">
          {sourceLoc === null
            ? 'There is no source to count, so nothing is proposed: every effort is yours.'
            : loc === sourceLoc
              ? 'Counted in the source of the signed run. The proposals scale with it.'
              : `Your size to model; the source has ${formatLines(sourceLoc)} lines. The proposals scale with it.`}
        </span>
        {editable && onLoc && sourceLoc !== null ? (
          editing ? (
            <form
              className="cc-no-print flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(raw);
                if (Number.isInteger(n) && n >= 1 && n <= 10_000_000) {
                  onLoc(n === sourceLoc ? null : n);
                  setEditing(false);
                }
              }}
            >
              <label className="sr-only" htmlFor="economics-model-size">
                Lines to model
              </label>
              <input
                id="economics-model-size"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                data-economics-model-size=""
                className="h-9 w-32 rounded-cc-row border border-cc-field-border bg-cc-surface px-2 cc-text-cell text-cc-ink"
              />
              <CcButton type="submit" variant="secondary">Use this size</CcButton>
              {loc !== sourceLoc ? <CcButton onClick={() => { onLoc(null); setEditing(false); }}>Back to the source</CcButton> : null}
            </form>
          ) : (
            <span className="cc-no-print">
              <CcButton data-economics-model-size-open="" onClick={() => { setRaw(String(loc ?? sourceLoc)); setEditing(true); }}>
                Model another size
              </CcButton>
            </span>
          )
        ) : null}
      </div>
      <div className={row} data-economics-rest="score">
        <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
          {score === null ? 'No Clean Core Score' : `Clean Core Score ${score}`}
          {score !== null ? <FamilyChip kind={scoreStale ? 'not-determined' : 'signed'} /> : null}
        </span>
        <span className="cc-text-meta text-cc-ink-muted">
          {score === null
            ? 'No signed run carries one, so Keep’s upkeep is proposed without an uplift.'
            : scoreStale
              ? 'Of a previous source: the code changed after the signed run.'
              : baseline && baseline.score !== null
                ? `From the signed run. It raises Keep’s upkeep ${formatUplift(baseline.uplift)}: code further from clean core costs more to keep running.`
                : 'From the signed run.'}
        </span>
      </div>
      {route ? (
        <div className={row} data-economics-rest="route">
          <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
            Route the analysis proposes: {route}
            <FamilyChip kind="engine" />
          </span>
          <span className="cc-text-meta text-cc-ink-muted">
            A proposal, not signed off. Rebuild&rsquo;s effort does not depend on it: the proposal per 1,000 lines is the same for every
            route, so there is no range across routes. Design signs the route off later and asks you to re-price if its plan leaves
            the priced range.
          </span>
        </div>
      ) : null}

      <p className={group}>Proposed by Clean-Core.io</p>
      <div className={row} data-economics-rest="factors">
        <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
          Effort factors per 1,000 lines
          {factors === 'pending' ? (
            <FamilyChip kind="engine" note="proposal" />
          ) : factors === 'typical' ? (
            <FamilyChip kind="simulation" note="typical assumption" />
          ) : factors === 'taken' ? (
            <FamilyChip kind="yours" note="taken over" />
          ) : null}
        </span>
        <span className="cc-text-meta text-cc-ink-muted">
          Fixed; nothing measured them.{' '}
          {factors === 'pending'
            ? 'Not counted until you take them over.'
            : factors === 'typical'
              ? 'Used as typical assumptions, not your figures. Change a day under "Effort in days" and it becomes yours.'
              : factors === 'taken'
              ? 'Taken over: your figures now, yours to change.'
              : 'Not offered here: there is no line count to propose from.'}
        </span>
      </div>

      {typicalWords ? (
        <>
          <p className={group}>Typical assumptions</p>
          <div className={row} data-economics-rest="typical">
            <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
              <span>{typicalWords.charAt(0).toUpperCase() + typicalWords.slice(1)}</span>
              <FamilyChip kind="simulation" note="typical assumption" />
            </span>
            <span className="cc-text-meta text-cc-ink-muted">
              Filled in one click, not your figures and not measured. Change any of them in place and it becomes yours.
            </span>
          </div>
        </>
      ) : null}

      <p className={group}>Your figures</p>
      <div className={row} data-economics-rest="yours">
        <span className="flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink">
          {mine.length > 0 ? mine.join(' · ') : 'None yet'}
          <FamilyChip kind={stated ? 'yours' : 'not-determined'} />
        </span>
        <span className="cc-text-meta text-cc-ink-muted">
          Currency, two day rates, period, release cadence. No default for any; typical values only when you ask for them.
        </span>
      </div>

      {/* ECO-N6 (ADR-128 (7)): the AI proposals' group ("AI proposals · model, date") goes here once the lawyer has seen
          the wording. Until then the page uses no language model at all, and says so. */}
      <p className={group}>Not used</p>
      <div className={row} data-economics-rest="no-model">
        <span className="cc-text-cell font-semibold text-cc-ink">No language model</span>
        <span className="cc-text-meta text-cc-ink-muted">No amount and no day on this page comes from a model.</span>
      </div>
      {saved ? (
        <>
          <p className={group}>Saved</p>
          <div className={row} data-economics-rest="saved">
            {saved}
          </div>
        </>
      ) : null}
    </div>
  );
}
