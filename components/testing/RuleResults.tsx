import React from 'react';
import { ChevronDown } from 'lucide-react';
import FamilyChip from '@/components/family/FamilyChip';
import CcStateText from '@/components/cc/StateText';
import CcTable from '@/components/cc/Table';
import { cn } from '@/lib/utils';
import type { ElementState } from '@/lib/process-states';

/**
 * "What was tested" — the results by business rule (ADR-131 (3), mock-up S4): the business rules of the signed
 * analysis in their plain sentence with the owner's decision on them, the scenarios under each, a rule without a case
 * shown as such, failing rules first and open. Each case says who set its expected result (the engine from the
 * original's checks, or the model's statement) and what its result means (ADR-095, ADR-100), and where it ran.
 *
 * Pure presentation: the page reads verdicts, assessments and results from the receipt, this session's run or the
 * result from your SAP system, and hands rows over. Nothing here decides a verdict.
 */
export type CaseResult = 'held' | 'failed' | 'not-run' | 'no-verdict';

export interface RuleCaseRow {
  id: string;
  name: string;
  /** Given → expected, as the case states it. */
  expected: string;
  result: CaseResult;
  /** One sentence: what the result means (the assessment, or the message from your system). */
  meaning: string;
  /** The expected result was set by the engine from the original, not stated by the model. */
  byEngine: boolean;
}

export interface RuleRow {
  id: string;
  text: string;
  decision: ElementState | null;
  /** "L303–L319" — where the rule stands in the original. */
  lines: string | null;
  cases: RuleCaseRow[];
}

const DECISION_WORD: Readonly<Record<ElementState, string>> = {
  keep: 'keep',
  change: 'change',
  drop: 'drop',
  clarify: 'open',
};

const RESULT_WORD: Readonly<Record<CaseResult, string>> = {
  held: 'As expected',
  failed: 'Failed',
  'not-run': 'Not run',
  'no-verdict': 'Not determined',
};

function ResultWord({ result, children }: { result: CaseResult; children?: React.ReactNode }) {
  // No green for a test result (DESIGN.md §1.8): a pass is `information`, never "proven".
  const state = result === 'held' ? 'information' : result === 'failed' ? 'error' : 'neutral';
  return (
    <CcStateText state={state} hollow={result === 'not-run' || result === 'no-verdict'}>
      {children ?? RESULT_WORD[result]}
    </CcStateText>
  );
}

function ruleSummary(row: RuleRow): { word: React.ReactNode; failed: number } {
  const failed = row.cases.filter((c) => c.result === 'failed').length;
  const passed = row.cases.filter((c) => c.result === 'held').length;
  const notRun = row.cases.length - failed - passed;
  if (row.cases.length === 0) return { word: <CcStateText state="warning" hollow>No case</CcStateText>, failed: 0 };
  const parts: React.ReactNode[] = [];
  if (failed > 0) parts.push(<ResultWord key="f" result="failed">{`${failed} failed`}</ResultWord>);
  if (passed > 0) parts.push(<ResultWord key="p" result="held">{`${passed} as expected`}</ResultWord>);
  if (notRun > 0) parts.push(<ResultWord key="n" result="not-run">{`${notRun} not run`}</ResultWord>);
  return { word: <span className="inline-flex flex-wrap gap-1">{parts}</span>, failed };
}

export default function RuleResults({
  rules,
  untraced,
  placeNote,
  emptyNote,
}: {
  rules: RuleRow[];
  /** Cases that name no business rule of the original. */
  untraced: RuleCaseRow[];
  /** "Results in your SAP system" / "Results here, against SAP mocks" / null before a run. */
  placeNote: string | null;
  /** Said under a rule that has no case, before any scenario is written. */
  emptyNote: string;
}) {
  const anyFailed = rules.some((r) => r.cases.some((c) => c.result === 'failed'));
  const ordered = anyFailed
    ? [...rules].sort((a, b) => Number(b.cases.some((c) => c.result === 'failed')) - Number(a.cases.some((c) => c.result === 'failed')))
    : rules;
  const anyCase = rules.some((r) => r.cases.length > 0) || untraced.length > 0;

  return (
    <div data-rule-results="">
      {placeNote ? <p className="m-0 mb-3 cc-text-cell text-cc-ink-muted">{placeNote}</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {ordered.map((row) => {
          const { word, failed } = ruleSummary(row);
          const engine = row.cases.filter((c) => c.byEngine).length;
          const ai = row.cases.length - engine;
          return (
            <li key={row.id} data-rule-row={row.id} data-rule-failed={failed > 0 ? '' : undefined}>
              <details
                open={failed > 0}
                className={cn(
                  'group rounded-cc-row border bg-cc-surface',
                  failed > 0 ? 'border-cc-error-border' : anyCase && row.cases.length === 0 ? 'border-cc-warning-border' : 'border-cc-line',
                )}
              >
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 px-4 py-3 max-[720px]:grid-cols-[minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-cc-mono cc-text-cell font-bold text-cc-ink">{row.id}</span>
                      <span className="cc-text-cell font-semibold text-cc-ink">{row.text}</span>
                      {row.decision ? (
                        <span data-rule-decision={row.decision} className="cc-text-meta text-cc-ink-muted">
                          {DECISION_WORD[row.decision]}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block cc-text-meta text-cc-ink-muted">
                      {row.lines ? `Original: ${row.lines}` : null}
                      {row.lines && row.cases.length > 0 ? ' · ' : null}
                      {row.cases.length > 0
                        ? `${row.cases.length} ${row.cases.length === 1 ? 'scenario' : 'scenarios'}${engine > 0 || ai > 0 ? ` (${[engine ? `${engine} engine` : '', ai ? `${ai} AI` : ''].filter(Boolean).join(' · ')})` : ''}`
                        : null}
                    </span>
                  </span>
                  <span className="justify-self-end">{word}</span>
                  <ChevronDown size={16} aria-hidden={true} className="text-cc-ink-muted transition-transform group-open:rotate-180 max-[720px]:hidden" />
                </summary>
                <div className="border-t border-cc-line px-4 py-3">
                  {row.cases.length === 0 ? (
                    <p className="m-0 cc-text-cell text-cc-ink-muted">
                      {anyCase ? 'No scenario tests this rule. The testing model was given it and wrote none.' : emptyNote}
                    </p>
                  ) : (
                    <CaseTable cases={row.cases} />
                  )}
                </div>
              </details>
            </li>
          );
        })}
        {untraced.length > 0 ? (
          <li data-rule-row="untraced">
            <details className="group rounded-cc-row border border-cc-line bg-cc-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block cc-text-cell font-semibold text-cc-ink">Scenarios that name no business rule</span>
                  <span className="mt-1 block cc-text-meta text-cc-ink-muted">
                    {untraced.length} {untraced.length === 1 ? 'scenario' : 'scenarios'}: a result there does not say whether the behaviour changed.
                  </span>
                </span>
                <ChevronDown size={16} aria-hidden={true} className="text-cc-ink-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-cc-line px-4 py-3">
                <CaseTable cases={untraced} />
              </div>
            </details>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

const CASE_COLUMNS = [
  { key: 'scenario', label: 'Scenario' },
  { key: 'expected', label: 'Given → expected' },
  { key: 'result', label: 'Result' },
  { key: 'meaning', label: 'What it means' },
] as const;

function CaseTable({ cases }: { cases: RuleCaseRow[] }) {
  return (
    <CcTable
      caption="The scenarios of this rule"
      columns={CASE_COLUMNS}
      rows={cases.map((c) => ({
        key: c.id,
        cells: {
          scenario: (
            <span data-rule-case={c.id} data-case-result={c.result}>
              <span className="font-cc-mono font-bold">{c.id}</span>
              {c.name ? <span className="block text-cc-ink-muted">{c.name}</span> : null}
            </span>
          ),
          expected: (
            <>
              <span className="block">{c.expected || 'Not stated'}</span>
              <span className="mt-1 inline-block">
                <FamilyChip kind={c.byEngine ? 'engine' : 'ai'} note={c.byEngine ? 'expected result' : 'expected result, not verified'} />
              </span>
            </>
          ),
          result: <ResultWord result={c.result} />,
          meaning: <span className="text-cc-ink-muted">{c.meaning}</span>,
        },
      }))}
    />
  );
}
