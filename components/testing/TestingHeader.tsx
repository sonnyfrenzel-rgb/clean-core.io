'use client';

import React from 'react';
import { Lock, LockOpen } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcDateText from '@/components/cc/DateText';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcWhyPopover from '@/components/cc/WhyPopover';
import type { ProvenanceValue } from '@/lib/provenance';
import { countsLine, type LastRun } from './testing-summary';

/**
 * The head of the Testing tool — proposal A (Fiori object page), owner decision
 * 01.10.2026: a mono meta line, four facet tiles and a status line, between the
 * stage title and the tabs.
 *
 *   Scenarios · Last run · Check by hand · Tenant tests
 *
 * The answer first: before any tab the reader knows how many scenarios exist
 * and whose they are, whether anything ran (and where), what no generated test
 * can cover, and that a tenant does not run them. Every tile is built from
 * what the page already holds — the case list, the receipt or this session's
 * run (`lastRun`), the engine's coverage report and the documented lock — and
 * where one of those is missing the tile says so instead of standing in for it.
 * There is no pass rate over nothing.
 *
 * `data-testing-status` keeps the name the one-sentence status line had; its
 * value is still the kind of the last run.
 */

export interface MetaPart {
  /** "catalog", "engine" — muted. */
  label?: string;
  value: string;
  /** The full value, where `value` is a shortened reading of it. */
  title?: string;
}

export interface ScenarioFacet {
  count: number;
  /** A stored suite that could not be read back. */
  rejected: boolean;
  /** Why there are none, when there are none. */
  emptyReason: string;
}

export interface HandCheckFacet {
  /** Null when there is no source to read. */
  count: number | null;
  lines: number[];
}

export interface StatusEntry {
  label: string;
  value: string;
  /** The dot: a proposal (warning mark) or a plain fact (neutral). */
  tone: 'proposal' | 'plain';
}

export function TestingMetaLine({ parts }: { parts: MetaPart[] }) {
  if (parts.length === 0) return null;
  return (
    <p data-testing-meta="" className="m-0 -mt-6 mb-4 font-cc-mono text-[12px] leading-relaxed font-medium text-cc-ink-muted break-words">
      {parts.map((p, i) => (
        <React.Fragment key={`${p.label ?? ''}${p.value}`}>
          {i > 0 ? ' · ' : null}
          {p.label ? `${p.label} ` : null}
          <span title={p.title} className="font-semibold text-cc-ink">
            {p.value}
          </span>
        </React.Fragment>
      ))}
    </p>
  );
}

function Facet({
  id,
  label,
  why,
  children,
  sub,
}: {
  id: string;
  label: string;
  why: { provenance: ProvenanceValue; basis: React.ReactNode; evidence?: React.ReactNode };
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <li
      data-testing-facet={id}
      className="flex min-w-0 flex-col rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="cc-text-label text-cc-ink-muted">{label}</span>
        <CcWhyPopover subject={label} provenance={why.provenance} basis={why.basis} evidence={why.evidence} />
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-2">{children}</div>
      {sub ? <div className="mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">{sub}</div> : null}
    </li>
  );
}

const FIGURE = 'cc-text-figure text-cc-ink';
/** A word in the figure's place ("None", "Locked") — one step smaller, as in the proposal. */
const WORD = 'inline-flex items-center gap-2 text-[22px] font-extrabold leading-tight tracking-tight text-cc-ink';
const UNIT = 'cc-text-cell text-cc-ink-muted';

export default function TestingHeader({
  scenarios,
  run,
  blocked,
  isAbapCloud,
  handChecks,
  tenantLocked,
  status,
}: {
  scenarios: ScenarioFacet;
  run: LastRun;
  /** Running is off: the suite or its code was built for an earlier source. */
  blocked: boolean;
  isAbapCloud: boolean;
  handChecks: HandCheckFacet;
  tenantLocked: boolean;
  status: StatusEntry[];
}) {
  const { count } = scenarios;

  let runFigure: React.ReactNode;
  let runSub: React.ReactNode;
  let runProvenance: ProvenanceValue = 'not-determined';
  if (run.kind === 'recorded') {
    runFigure = (
      <>
        <span className={FIGURE}>{run.counts.passed}</span>
        <span className={UNIT}>of {run.counts.total} passed</span>
      </>
    );
    runSub = (
      <>
        <CcDateText value={run.at} format="datetime" /> · {countsLine(run.counts)} — against mocks
        <span className="mt-1 block">
          <CcProvenanceChip value="demonstrated-mock" />
        </span>
      </>
    );
    runProvenance = 'demonstrated-mock';
  } else if (run.kind === 'session') {
    runFigure = (
      <>
        <span className={FIGURE}>{run.counts.passed}</span>
        <span className={UNIT}>of {run.counts.total} passed</span>
      </>
    );
    runSub = (
      <>
        This session, against mocks — not recorded as a test run · {countsLine(run.counts)}
        <span className="mt-1 block">
          <CcProvenanceChip value="demonstrated-mock" />
        </span>
      </>
    );
    runProvenance = 'demonstrated-mock';
  } else if (run.kind === 'earlier') {
    runFigure = <span className={WORD}>Earlier</span>;
    runSub = (
      <>
        Recorded <CcDateText value={run.at} format="datetime" /> for earlier code or an earlier suite — this version has not
        run yet
      </>
    );
  } else {
    runFigure = <span className={WORD}>None</span>;
    runSub = isAbapCloud
      ? 'No run on record — a run here is simulated; your own system gives the ABAP Unit stubs a verdict'
      : 'No run on record yet — no pass rate, because a rate over nothing is not a number';
  }

  return (
    <div data-testing-head="" className="mb-6">
      <ul
        data-testing-status={run.kind}
        aria-label="Where testing stands"
        className="m-0 grid list-none grid-cols-2 gap-2 p-0 lg:grid-cols-4 lg:gap-3"
      >
        <Facet
          id="scenarios"
          label="Scenarios"
          why={{
            provenance: count > 0 && !scenarios.rejected ? 'proposed' : 'not-determined',
            basis: 'The testing model writes the scenarios from the generated code. They are its proposal until a run gives them a verdict.',
          }}
          sub={
            scenarios.rejected ? (
              'The saved scenarios could not be read back — generate them again'
            ) : count > 0 ? (
              <CcProvenanceChip value="proposed" />
            ) : (
              scenarios.emptyReason
            )
          }
        >
          {scenarios.rejected ? (
            <span className={WORD}>Unreadable</span>
          ) : count > 0 ? (
            <>
              <span className={FIGURE}>{count}</span>
              <span className={UNIT}>written</span>
            </>
          ) : (
            <span className={WORD}>None</span>
          )}
        </Facet>

        <Facet
          id="last-run"
          label="Last run"
          why={{
            provenance: runProvenance,
            basis:
              'A run counts as recorded only when the server’s receipt still covers this code, suite and case list. A verdict stored on a case is not a run.',
          }}
          sub={
            <>
              {runSub}
              {blocked && count > 0 && !scenarios.rejected ? (
                <span data-stale-run-facet="" className="mt-1 block">
                  Running is off until the suite is regenerated for the current source.
                </span>
              ) : null}
            </>
          }
        >
          {runFigure}
        </Facet>

        <Facet
          id="hand-checks"
          label="Check by hand"
          why={{
            provenance: handChecks.count === null ? 'not-determined' : 'reconstructed',
            basis: 'The engine’s coverage report: every construct in the source that its detectors do not judge.',
          }}
          sub={
            handChecks.count === null ? (
              'No source on the project to read'
            ) : handChecks.count === 0 ? (
              'Every construct falls inside what the engine’s detectors judge'
            ) : (
              <span className="flex flex-wrap gap-1">
                {handChecks.lines.map((ln) => (
                  <CcAnchor key={ln} label={`Source line ${ln}`}>{`L${ln}`}</CcAnchor>
                ))}
              </span>
            )
          }
        >
          {handChecks.count === null ? (
            <span className={WORD}>—</span>
          ) : (
            <>
              <span className={FIGURE}>{handChecks.count}</span>
              <span className={UNIT}>{handChecks.count === 1 ? 'area the engine did not judge' : 'areas the engine did not judge'}</span>
            </>
          )}
        </Facet>

        <Facet
          id="tenant-tests"
          label="Tenant tests"
          why={{
            provenance: 'not-determined',
            basis: 'Running generated tests against a connected tenant is a locked path (G0:R0). A tenant is only checked for its connection.',
          }}
          sub={tenantLocked ? 'until the isolated live runner has passed its review' : 'open for this release'}
        >
          <span className={WORD}>
            {tenantLocked ? <Lock size={18} aria-hidden={true} /> : <LockOpen size={18} aria-hidden={true} />}
            {tenantLocked ? 'Locked' : 'Open'}
          </span>
        </Facet>
      </ul>

      <ul data-testing-status-line="" aria-label="Status" className="m-0 mt-3 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[12px]">
        {status.map((s) => (
          <li key={s.label} className="inline-flex items-center gap-2">
            <span
              aria-hidden={true}
              className={s.tone === 'proposal' ? 'h-2 w-2 shrink-0 rounded-full bg-cc-warning-mark' : 'h-2 w-2 shrink-0 rounded-full bg-cc-neutral'}
            />
            <span className="cc-text-label text-cc-ink-muted">{s.label}</span>
            <span className="font-medium text-cc-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
