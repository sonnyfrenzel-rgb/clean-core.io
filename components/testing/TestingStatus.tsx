'use client';

import React from 'react';
import CcDateText from '@/components/cc/DateText';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { countsLine, scenarios, type LastRun } from './testing-summary';

/**
 * The answer first: one plain sentence under the stage title that says where
 * testing stands, before any tab, list or console.
 *
 * Built only from what the page holds — the case list, the receipt on the
 * project, a run in this session. Where a fact is missing the sentence says so
 * rather than standing in for it.
 */
export interface TestingStatusProps {
  caseCount: number;
  run: LastRun;
  /** A stored suite that could not be read back. */
  rejected: boolean;
  /** The suite or the code under it was built for an earlier source. */
  blocked: boolean;
  /** The testing model stage is on and has a key. */
  canGenerate: boolean;
  isAbapCloud: boolean;
}

export default function TestingStatus({ caseCount, run, rejected, blocked, canGenerate, isAbapCloud }: TestingStatusProps) {
  let sentence: React.ReactNode;
  let chip: React.ReactNode = null;

  if (rejected) {
    sentence = 'The saved scenarios could not be read back — generate them again.';
  } else if (caseCount === 0) {
    sentence = canGenerate
      ? 'No scenarios yet — generate them from the target code, then run them against mocks.'
      : 'No scenarios yet — generating them needs the testing model, which is not available for this account.';
  } else if (run.kind === 'recorded') {
    sentence = (
      <>
        Last run <CcDateText value={run.at} format="datetime" />: {countsLine(run.counts)} — against mocks, of {scenarios(caseCount)}.
      </>
    );
    chip = <CcProvenanceChip value="demonstrated-mock" />;
  } else if (run.kind === 'session') {
    sentence = `Run in this session: ${countsLine(run.counts)} — against mocks, and not recorded as a test run.`;
    chip = <CcProvenanceChip value="demonstrated-mock" />;
  } else if (run.kind === 'earlier') {
    sentence = (
      <>
        {scenarios(caseCount)} written, not run on this version yet — the last recorded run (
        <CcDateText value={run.at} format="datetime" />) was for earlier code or an earlier suite.
      </>
    );
  } else {
    sentence = isAbapCloud
      ? `${scenarios(caseCount)} written as ABAP Unit stubs, not run yet — a run here is simulated; your own system gives them a verdict.`
      : `${scenarios(caseCount)} written, not run yet.`;
  }

  return (
    <div
      data-testing-status={run.kind}
      className="mb-4 flex flex-wrap items-center gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc"
    >
      <p className="m-0 min-w-0 cc-text-body font-semibold text-cc-ink">
        {sentence}
        {blocked && caseCount > 0 && !rejected ? ' Running is off until the suite is regenerated for the current source.' : null}
      </p>
      {chip}
    </div>
  );
}
