'use client';

import React from 'react';
import CcButton from '@/components/cc/Button';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcStateText from '@/components/cc/StateText';
import { assessmentSummary, ruleCoverageSentence, type AssessmentCounts, type RuleCoverage } from '@/lib/testing-rule-trace';
import type { InvariantPlan } from '@/lib/testing-invariants';
import { operatorWord, type MutationProbeReport } from '@/lib/testing-mutation';

/**
 * What the suite is worth, under the run (3.0.10, owner 11.10.2026, external
 * review F-01/F-02/F-05) — three questions the review asked and the run's
 * pass count does not answer:
 *
 *   1. Does every business rule of the original have a case with an expected
 *      result taken from the original? (rule coverage, and old against new)
 *   2. Do list, totals and export agree for one selection? (the invariant, or
 *      why it does not apply)
 *   3. Would the tests notice a defect? (the mutation probe: k of n mutants
 *      caught, the survivors named, and a flag when none is caught)
 *
 * Presentational: the page computes every reading and hands it in.
 */
export interface ProbeState {
  state: 'idle' | 'running' | 'done' | 'error';
  error: string | null;
}

export default function TestEvidenceCard({
  coverage,
  coverageNote,
  assessments,
  invariant,
  mutation,
  probe,
  probeBasis,
  canProbe,
  onProbe,
}: {
  /** Null while the rules are read, or when there is no signed source (then `coverageNote` says why). */
  coverage: RuleCoverage | null;
  coverageNote: string;
  assessments: AssessmentCounts | null;
  invariant: InvariantPlan;
  /** The probe on the covering receipt, or this session's. */
  mutation: MutationProbeReport | null;
  probe: ProbeState;
  /** Why the probe cannot run, or null when it can. */
  probeBasis: string | null;
  /** The reader may start a probe (owner, a runnable route). */
  canProbe: boolean;
  onProbe?: () => void;
}) {
  const survivors = mutation ? mutation.mutants.filter((m) => m.outcome === 'survived') : [];
  return (
    <section data-test-evidence="" aria-labelledby="test-evidence-title" className="mt-5 border-t border-cc-line pt-4">
      <h3 id="test-evidence-title" className="m-0 cc-text-h3 text-cc-ink">
        What the tests prove about the original
      </h3>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        A pass says the target did what the test expected. These three lines say whether the expectation came from the original, whether one selection gives one population, and whether the tests would notice a defect at all.
      </p>

      <dl className="m-0 mt-3 flex flex-col gap-3">
        <div data-test-evidence-rules="" className="min-w-0">
          <dt className="cc-text-label text-cc-ink-muted">Business rules of the original</dt>
          <dd className="m-0 mt-1 cc-text-cell text-cc-ink">
            {coverage ? ruleCoverageSentence(coverage) : coverageNote}
            {assessments ? (
              <span data-test-evidence-assessments="" className="block mt-1 text-cc-ink">
                {assessmentSummary(assessments)}
              </span>
            ) : null}
          </dd>
        </div>

        <div data-test-evidence-invariant={invariant.applicable ? 'applicable' : 'not-applicable'} className="min-w-0">
          <dt className="cc-text-label text-cc-ink-muted">One selection, one population</dt>
          <dd className="m-0 mt-1 cc-text-cell text-cc-ink">
            {invariant.applicable ? (
              <>
                {invariant.sentence}
                <span className="block mt-1 cc-text-meta text-cc-ink-muted">Written by Clean-Core.io from the generated routes, not by the testing model.</span>
              </>
            ) : (
              <>
                <CcStateText state="neutral" hollow>
                  Not applicable
                </CcStateText>{' '}
                {invariant.reason}
              </>
            )}
          </dd>
        </div>

        <div data-test-evidence-mutation={mutation ? mutation.verdict : probe.state} className="min-w-0">
          <dt className="cc-text-label text-cc-ink-muted">Would the tests notice a defect?</dt>
          <dd className="m-0 mt-1 flex flex-col gap-2 cc-text-cell text-cc-ink">
            {mutation ? (
              <>
                {mutation.verdict === 'does-not-constrain' ? (
                  <CcMessageStrip state="error" headline="The tests do not constrain the behaviour">
                    {mutation.sentence}
                  </CcMessageStrip>
                ) : (
                  <p className="m-0">{mutation.sentence}</p>
                )}
                {survivors.length > 0 ? (
                  <ul data-test-evidence-survivors="" className="m-0 flex list-disc flex-col gap-1 pl-5">
                    {survivors.map((m) => (
                      <li key={m.id} className="[overflow-wrap:anywhere]">
                        <span className="font-cc-mono text-[12px] font-semibold">{m.id}</span> {operatorWord(m.operator)} — {m.description}{' '}
                        <span className="text-cc-ink-muted">
                          ({m.file}:{m.line})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : probe.state === 'running' ? (
              <p className="m-0">The suite is running against mutants of the generated code…</p>
            ) : (
              <p className="m-0">
                Not probed yet.{' '}
                {probeBasis
                  ? probeBasis
                  : 'After a passing run of the whole suite, the suite runs again against a few deliberate defects of the generated code — a dropped filter, a flipped comparison, a fixed lookup — and this says how many it catches.'}
              </p>
            )}
            {probe.state === 'error' && probe.error ? (
              <CcMessageStrip state="warning" headline="The probe gave no result">
                {probe.error}
              </CcMessageStrip>
            ) : null}
            {!mutation && canProbe && !probeBasis && onProbe ? (
              <span>
                <CcButton variant="secondary" onClick={onProbe} disabled={probe.state === 'running'}>
                  {probe.state === 'running' ? 'Probing…' : 'Probe the suite with mutants'}
                </CcButton>
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}
