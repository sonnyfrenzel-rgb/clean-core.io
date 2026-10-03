'use client';

import React, { useId, useState, useSyncExternalStore } from 'react';
import { ChevronRight, Copy, Download } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCodeSurface from '@/components/cc/CodeSurface';
import CcDateText from '@/components/cc/DateText';
import CcDialog from '@/components/cc/Dialog';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcStateText from '@/components/cc/StateText';
import { CcTag } from '@/components/cc/Tag';
import { saveAs } from '@/lib/fileSaver';
import { cn } from '@/lib/utils';
import {
  NOT_STATED,
  SCOPE_WORD,
  countScopes,
  derivedFrom,
  scenarioFields,
  scenarioScope,
  scenarioTest,
  scopeSummary,
  textOf,
  type ScenarioScope,
  type ScenarioTest,
  type ScopeReading,
} from './scenario-detail';
import { scenarios } from './testing-summary';

/**
 * The scenarios of the Testing stage — one row each, every row opens its
 * details (owner 03.10.2026).
 *
 * DESIGN.md has no side panel for the rows of an object page's section; the
 * depth of a row lies one action deeper (§2.11), so a row expands in place on
 * every screen from `sm`, and on a phone (§2.9, S) the same details open as a
 * sheet — a modal dialog across the screen that gives the focus back to the row
 * that opened it.
 *
 * Above the rows, before any detail: how many scenarios can be tested where
 * (`scopeSummary`), one line on what to do next, and the test class to take to
 * ADT. The checkboxes exist only where there is a mock run to select for, and
 * say so; on the ABAP Cloud route nothing here runs, so nothing is selected.
 */

/** A phone in the sense of §2.9: narrower than `sm`. */
const PHONE_QUERY = '(max-width: 639.98px)';

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export type ScenarioCase = Record<string, unknown> & { id?: unknown; name?: unknown; category?: unknown; description?: unknown };

/** The last mock-run result of one scenario, from the receipt or this session — never the stored status alone. */
export interface ScenarioRunResult {
  verdict: string | null;
  message: string | null;
}

const LABEL = 'cc-text-label text-cc-ink-muted';

function Missing({ children }: { children?: React.ReactNode }) {
  return (
    <span data-not-stated="" className="cc-text-cell text-cc-ink-muted">
      {NOT_STATED}
      {children}
    </span>
  );
}

function FieldValue({ value, ordered }: { value: string | string[] | null; ordered?: boolean }) {
  if (value === null) return <Missing />;
  if (Array.isArray(value)) {
    const List = ordered ? 'ol' : 'ul';
    return (
      <List className={cn('m-0 flex flex-col gap-1 pl-5 cc-text-cell text-cc-ink', ordered ? 'list-decimal' : 'list-disc')}>
        {value.map((item, i) => (
          <li key={i} className="[overflow-wrap:anywhere]">
            {item}
          </li>
        ))}
      </List>
    );
  }
  return <p className="m-0 cc-text-cell text-cc-ink whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</p>;
}

function VerdictWord({ verdict }: { verdict: string | null }) {
  if (verdict === 'Passed') return <CcProvenanceChip value="demonstrated-mock" />;
  if (verdict === 'Failed') return <CcStateText state="error">Failed</CcStateText>;
  if (verdict) return <CcStateText state="neutral" hollow>{verdict}</CcStateText>;
  return <CcStateText state="neutral" hollow>Not run</CcStateText>;
}

function ScopeWord({ scope }: { scope: ScenarioScope }) {
  return (
    <span data-scenario-scope={scope}>
      <CcStateText state={scope === 'here-mock' ? 'information' : 'neutral'} hollow={scope === 'not-determined'} facet="Where">
        {SCOPE_WORD[scope]}
      </CcStateText>
    </span>
  );
}

/** Everything one scenario holds, in the order a tester reads it. */
export function ScenarioDetails({
  tc,
  isAbapCloud,
  test,
  where,
  run,
  runAt,
  tenantLocked,
  onShowOutput,
}: {
  tc: ScenarioCase;
  isAbapCloud: boolean;
  test: ScenarioTest;
  where: ScopeReading;
  run: ScenarioRunResult;
  /** When the recorded run was, where the result comes from a receipt. */
  runAt: string | null;
  tenantLocked: boolean;
  onShowOutput?: () => void;
}) {
  const fields = scenarioFields(tc);
  const derived = derivedFrom(tc);
  const id = textOf(tc.id) ?? '';
  return (
    <div data-scenario-details="" className="flex min-w-0 flex-col gap-5">
      <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta text-cc-ink-muted">
        <CcProvenanceChip value="proposed" />
        Written by the testing model from the generated code — a proposal nobody has checked.
      </p>

      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.key}
            data-scenario-field={field.key}
            className={cn('min-w-0', (field.key === 'steps' || field.key === 'description') && 'md:col-span-2')}
          >
            <dt className={cn(LABEL, 'mb-1')}>{field.label}</dt>
            <dd className="m-0">
              <FieldValue value={field.value} ordered={field.key === 'steps'} />
            </dd>
          </div>
        ))}
        <div data-scenario-derived="" className="min-w-0 md:col-span-2">
          <dt className={cn(LABEL, 'mb-1')}>Derived from — business rule or finding</dt>
          <dd className="m-0">
            {derived ? (
              <div className="flex flex-col gap-1">
                <p className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{derived.text}</p>
                {derived.anchors.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {derived.anchors.map((a) => (
                      <CcAnchor key={a} tone="unlinked" label={`Source ${a.replace('L', 'line ')}, as the model states it`}>
                        {a}
                      </CcAnchor>
                    ))}
                  </span>
                ) : null}
                <span className="cc-text-meta text-cc-ink-muted">As the model states it — not checked against the source.</span>
              </div>
            ) : (
              <Missing> — the scenario names no business rule, finding or source line.</Missing>
            )}
          </dd>
        </div>
      </dl>

      <div data-scenario-test={test.kind} className="min-w-0">
        <h3 className={cn(LABEL, 'm-0 mb-2')}>{isAbapCloud ? 'Generated test — ABAP Unit method' : 'Generated test — node:test'}</h3>
        {test.kind === 'found' ? (
          <CcCodeSurface
            label={`${test.name}, from line ${test.startLine} of the ${isAbapCloud ? 'test class' : 'test suite'}`}
            lines={test.code.split('\n').map((text, i) => ({ number: test.startLine + i, tokens: [{ kind: 'plain', text: text || ' ' }] }))}
          />
        ) : (
          <p className="m-0 cc-text-cell text-cc-ink-muted">{test.reason}</p>
        )}
      </div>

      <div data-scenario-where="" className="min-w-0">
        <h3 className={cn(LABEL, 'm-0 mb-2')}>Where it can be tested</h3>
        <ScopeWord scope={where.scope} />
        <p className="m-0 mt-1 cc-text-cell text-cc-ink">{where.reason}</p>
        <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
          {tenantLocked ? 'On a tenant: locked until the isolated live runner has passed its review.' : 'On a tenant: open for this release.'}
        </p>
      </div>

      <div data-scenario-last-run="" className="min-w-0">
        <h3 className={cn(LABEL, 'm-0 mb-2')}>Last mock run</h3>
        {isAbapCloud ? (
          <p className="m-0 cc-text-cell text-cc-ink-muted">No run here — ABAP Unit runs in your own SAP system, which gives this scenario its result.</p>
        ) : run.verdict ? (
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <VerdictWord verdict={run.verdict} />
              <span className="cc-text-meta text-cc-ink-muted">
                against mocks{runAt ? <> · recorded <CcDateText value={runAt} format="datetime" /></> : ' · this session, not recorded'}
              </span>
            </span>
            {run.message ? (
              <p className="m-0 font-cc-mono text-[12px] text-cc-ink [overflow-wrap:anywhere]">{run.message}</p>
            ) : null}
            {onShowOutput ? (
              <span>
                <CcButton variant="ghost" onClick={onShowOutput}>
                  Show the full run output
                </CcButton>
              </span>
            ) : null}
          </div>
        ) : (
          <p className="m-0 cc-text-cell text-cc-ink-muted">No mock run of {id || 'this scenario'} is on record yet.</p>
        )}
      </div>
    </div>
  );
}

export default function ScenarioList({
  cases,
  isAbapCloud,
  suiteCode,
  selectable,
  selected,
  onToggle,
  resultOf,
  runAt,
  tenantLocked,
  projectName,
  onShowOutput,
}: {
  cases: ScenarioCase[];
  isAbapCloud: boolean;
  /** The stored suite, or null when there is none to read. */
  suiteCode: string | null;
  /** Whether there is a mock run to select scenarios for. */
  selectable: boolean;
  selected: number[];
  onToggle: (index: number) => void;
  resultOf: (tc: ScenarioCase) => ScenarioRunResult;
  runAt: string | null;
  tenantLocked: boolean;
  projectName?: string;
  onShowOutput?: () => void;
}) {
  const isPhone = useIsPhone();
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [sheet, setSheet] = useState<number | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const baseId = useId();

  const readings = cases.map((tc) => {
    const test = scenarioTest(suiteCode, tc.id, isAbapCloud);
    return { test, where: scenarioScope(test, isAbapCloud) };
  });
  const summary = scopeSummary(countScopes(readings.map((r) => r.where.scope)));
  const classWord = isAbapCloud ? 'test class' : 'test suite';

  const toggleOpen = (i: number) => {
    if (isPhone) {
      setSheet(i);
      return;
    }
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const copySuite = async () => {
    if (!suiteCode) return;
    try {
      await navigator.clipboard.writeText(suiteCode);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const downloadSuite = async () => {
    if (!suiteCode) return;
    const slug = (projectName || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'project';
    const name = isAbapCloud ? `${slug}.testclasses.abap` : `${slug}.test.ts`;
    try {
      await saveAs(new Blob([suiteCode], { type: 'text/plain;charset=utf-8' }), name);
    } catch {
      setCopyState('failed');
    }
  };

  const details = (i: number) => (
    <ScenarioDetails
      tc={cases[i]}
      isAbapCloud={isAbapCloud}
      test={readings[i].test}
      where={readings[i].where}
      run={resultOf(cases[i])}
      runAt={runAt}
      tenantLocked={tenantLocked}
      onShowOutput={onShowOutput}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <p data-scope-summary="" data-stage-output="testCases" className="m-0 cc-text-cell font-semibold text-cc-ink">
          {`${scenarios(cases.length)}: ${summary}`}
          {tenantLocked ? ' · tenant runs locked' : ''}
          {' · '}
          <a href="#testing-scope" className="font-semibold text-cc-information hover:underline">
            What can be tested where
          </a>
        </p>
        <p data-testing-next="" className="m-0 cc-text-cell text-cc-ink">
          {isAbapCloud
            ? 'Next: copy the test class into ADT — into the local test classes of the class it tests — and run ABAP Unit on your development system. Nothing here runs it.'
            : 'Next: tick the scenarios to include and run them against mocks in step 2; then take the test suite into your own project to test against your SAP system.'}
        </p>
        {suiteCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <CcButton variant="secondary" onClick={copySuite} icon={<Copy size={14} aria-hidden={true} />}>
              {isAbapCloud ? 'Copy test class' : 'Copy test suite'}
            </CcButton>
            <CcButton variant="ghost" onClick={downloadSuite} icon={<Download size={14} aria-hidden={true} />}>
              {isAbapCloud ? 'Download for ADT' : 'Download test suite'}
            </CcButton>
            <span role="status" className={cn('cc-text-meta', copyState === 'failed' ? 'text-cc-error' : 'text-cc-ink-muted')}>
              {copyState === 'copied'
                ? `The ${classWord} is on the clipboard.`
                : copyState === 'failed'
                  ? `The ${classWord} could not be copied or saved here — open "Run output and module code" below and copy it from there.`
                  : ''}
            </span>
          </div>
        ) : null}
      </div>

      {selectable ? (
        <p data-selection-for="" className={cn(LABEL, 'm-0')}>
          Ticked scenarios go into the next mock run · {selected.length} of {cases.length} selected
        </p>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {cases.map((tc, i) => {
          const id = textOf(tc.id) ?? '';
          const name = textOf(tc.name);
          const description = textOf(tc.description);
          const category = textOf(tc.category);
          const isOpen = !isPhone && open.has(i);
          const detailsId = `${baseId}-details-${i}`;
          const result = resultOf(tc);
          const isSelected = selected.includes(i);
          return (
            <li
              key={i}
              data-scenario-row=""
              data-scenario-id={id}
              className={cn(
                'min-w-0 rounded-cc-row border bg-cc-surface',
                selectable && isSelected ? 'border-cc-ink' : 'border-cc-line',
              )}
            >
              <div className="flex min-w-0 items-start gap-2 p-3">
                {selectable ? (
                  <label className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center pointer-coarse:size-11">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(i)}
                      aria-label={`Include ${id || `scenario ${i + 1}`} in the next mock run`}
                      className="size-4 cursor-pointer rounded border-cc-field-border accent-cc-ink"
                    />
                  </label>
                ) : null}
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    data-scenario-toggle=""
                    aria-expanded={isPhone ? undefined : isOpen}
                    aria-controls={isPhone ? undefined : detailsId}
                    aria-haspopup={isPhone ? 'dialog' : undefined}
                    onClick={() => toggleOpen(i)}
                    className="flex w-full min-w-0 items-start gap-2 rounded-cc-row text-left"
                  >
                    <ChevronRight
                      size={16}
                      aria-hidden={true}
                      className={cn('mt-1 shrink-0 text-cc-ink-muted transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-cc-mono text-[12px] font-semibold text-cc-ink">{id}</span>
                        {category ? <CcTag>{category}</CcTag> : null}
                      </span>
                      <span className="cc-text-cell font-semibold text-cc-ink [overflow-wrap:anywhere]">{name || description || NOT_STATED}</span>
                      {name && description ? (
                        <span className="cc-text-meta font-medium text-cc-ink-muted [overflow-wrap:anywhere]">{description}</span>
                      ) : null}
                      <span className="cc-text-meta font-semibold text-cc-information">{isOpen ? 'Hide details' : 'Show details'}</span>
                    </span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6">
                    <ScopeWord scope={readings[i].where.scope} />
                    {/* The last verdict, from the receipt or this session — never the status string stored on the case. */}
                    <span data-scenario-verdict={result.verdict === 'Passed' ? 'pass' : result.verdict === 'Failed' ? 'fail' : result.verdict ? 'none' : 'not-run'}>
                      <VerdictWord verdict={result.verdict} />
                    </span>
                  </div>
                </div>
              </div>
              {isOpen ? (
                <div id={detailsId} className="border-t border-cc-line px-3 pt-4 pb-5 sm:px-5">
                  {details(i)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {sheet !== null && cases[sheet] ? (
        <CcDialog
          open={isPhone && sheet !== null}
          title={`${textOf(cases[sheet].id) ?? ''} ${textOf(cases[sheet].name) ?? ''}`.trim() || 'Scenario'}
          onClose={() => setSheet(null)}
          size="wide"
          data-scenario-sheet=""
          actions={
            <CcButton variant="ghost" density="cozy" onClick={() => setSheet(null)}>
              Close
            </CcButton>
          }
        >
          {details(sheet)}
        </CcDialog>
      ) : null}
    </div>
  );
}
