'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcMessageStrip from '@/components/cc/MessageStrip';
import { CcTag } from '@/components/cc/Tag';
import CcTable from '@/components/cc/Table';
import type { KeyUserCodePart, KeyUserStep, KeyUserStepList } from '@/lib/key-user-steps';
import { keyUserEffortLine, stepLines, type KeyUserMode } from '@/lib/key-user-route';

/**
 * The engine's key-user step list on a stage (roadmap 3.0.19, part B).
 *
 *   - `view="steps"` — Transformation: which app, which object and context,
 *     which entries, the ABAP lines each step replaces, its limits, and what
 *     stays code.
 *   - `view="checks"` — Testing: the same steps as acceptance checks a key user
 *     runs in the system (given / when / then, with the lines they re-test).
 *
 * Read by the engine from the signed source, never by a model, and never a
 * promise: each step holds once its limits are checked in the target system
 * (`KEY_USER_STEPS_NOTE`). Nothing on it is stored, and nothing differs by
 * view — Management, Business and IT read the same list.
 */
export default function KeyUserSteps({
  list,
  mode,
  view,
}: {
  list: KeyUserStepList;
  mode: Exclude<KeyUserMode, 'none'>;
  view: 'steps' | 'checks';
}) {
  const title = view === 'steps' ? 'Key-user step list' : 'Acceptance checks for a key user';
  const lead =
    view === 'steps'
      ? mode === 'whole'
        ? 'What a key user configures in the system instead of code — in this order, each step anchored to the ABAP lines it replaces.'
        : 'The parts a key user configures in the system. Code is generated for the parts that stay code only.'
      : mode === 'whole'
        ? 'Run by a key user in the system once the steps are configured. They are derived from the code, not executed here, and their result is not recorded here.'
        : 'For the key-user parts, run by a key user in the system. The test suite below covers the parts that stay code only.';
  return (
    <section
      aria-labelledby={`ku-${view}-title`}
      data-key-user-steps={view}
      data-key-user-mode={mode}
      data-key-user-scope={list.scope}
      className="mb-6 flex min-w-0 flex-col gap-4 rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc md:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`ku-${view}-title`} className="m-0 cc-text-h2 text-cc-ink">{title}</h2>
        <CcProvenanceChip value="reconstructed" />
      </div>
      <p className="m-0 cc-text-body text-cc-ink">{lead}</p>
      <p className="m-0 cc-text-cell text-cc-ink-muted" data-key-user-sentence="">
        {list.sentence} Effort: {keyUserEffortLine(list)} — configuration, not a build.
      </p>
      {list.levelByConstruction ? (
        <p className="m-0 cc-text-cell text-cc-ink" data-key-user-level={list.levelByConstruction}>
          Clean core level {list.levelByConstruction} by construction: key-user extensions use released extension points only.
        </p>
      ) : null}
      <CcMessageStrip state="information">{list.note}</CcMessageStrip>

      {list.steps.length === 0 ? (
        <p className="m-0 rounded-cc-row border border-dashed border-cc-field-border px-3 py-2 cc-text-cell text-cc-ink-muted" data-key-user-empty="">
          The engine read no part of this program that a key-user tool covers. The decision on record names key user; change it in Design to a route this stage builds.
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {list.steps.map((s) => (view === 'steps' ? <StepCard key={s.id} step={s} /> : <CheckCard key={s.id} step={s} />))}
        </ol>
      )}

      {view === 'steps' && list.codeParts.length > 0 ? <CodeParts parts={list.codeParts} mode={mode} /> : null}
    </section>
  );
}

const ROW = 'min-w-0 rounded-cc-row border border-cc-line bg-cc-surface p-3';
const LABEL = 'cc-text-label text-cc-ink-muted';

function StepHead({ step }: { step: KeyUserStep }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <CcTag>{step.id}</CcTag>
      <b className="text-[14px] font-bold text-cc-ink">{step.app}</b>
      <span className="cc-text-cell text-cc-ink [overflow-wrap:anywhere]">— {step.title}</span>
    </span>
  );
}

function StepCard({ step }: { step: KeyUserStep }) {
  const otherLimits = step.limits.filter((l) => l.text !== step.context.text);
  return (
    <li className={ROW} data-key-user-step={step.id} data-key-user-tool={step.tool}>
      <StepHead step={step} />
      <dl className="m-0 mt-2 grid gap-2">
        <div className="min-w-0">
          <dt className={LABEL}>Object</dt>
          <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
            <span className="font-cc-mono text-[12px]">{step.object.name}</span>
            {step.object.releasedViews.length ? <> on {step.object.releasedViews.map((v) => <span key={v} className="font-cc-mono text-[12px]">{v} </span>)}</> : null}
          </dd>
        </div>
        <div className="min-w-0" data-key-user-context={step.context.determined ? 'determined' : 'not-determined'}>
          <dt className={LABEL}>Context</dt>
          <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
            {step.context.text}
            {step.context.check ? <span className="block text-cc-ink-muted">Check: {step.context.check}</span> : null}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={LABEL}>Replaces</dt>
          <dd className="m-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]" data-key-user-anchors={stepLines(step)}>
            {step.anchors.map((a, i) => (
              <span key={`${a.lineStart}-${i}`} className="block">
                <span className="font-cc-mono text-[12px]">{a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`}</span>{' '}
                {a.what}
                {a.role === 'uses' ? ' (relied on)' : ''}
              </span>
            ))}
          </dd>
        </div>
        {step.dependsOn.length ? (
          <div className="min-w-0">
            <dt className={LABEL}>After</dt>
            <dd className="m-0 cc-text-cell text-cc-ink">{step.dependsOn.join(', ')}</dd>
          </div>
        ) : null}
      </dl>
      {step.entries.length ? (
        <div className="mt-2 min-w-0" data-key-user-entries={step.entries.length}>
          <CcTable
            caption={`Entries of ${step.id}`}
            columns={[
              { key: 'entry', label: 'Entry' },
              { key: 'what', label: 'What' },
              { key: 'lines', label: 'Lines', width: '120px' },
            ]}
            rows={step.entries.map((e, i) => ({
              key: `${e.kind}-${e.name}-${i}`,
              cells: {
                entry: <span>{e.kind} · <span className="font-cc-mono">{e.name}</span></span>,
                what: <span className="[overflow-wrap:anywhere]">{e.detail}</span>,
                lines: <span className="font-cc-mono">{e.lines.join(', ')}</span>,
              },
            }))}
          />
        </div>
      ) : null}
      {otherLimits.length ? (
        <div className="mt-2 min-w-0" data-key-user-limits={otherLimits.length}>
          <p className={`m-0 ${LABEL}`}>Limits</p>
          <ul className="m-0 mt-1 flex list-disc flex-col gap-1 pl-5 cc-text-cell text-cc-ink">
            {otherLimits.map((l, i) => (
              <li key={`${l.kind}-${i}`} className="[overflow-wrap:anywhere]">
                {l.text}
                {l.check ? <span className="text-cc-ink-muted"> Check: {l.check}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function CheckCard({ step }: { step: KeyUserStep }) {
  return (
    <li className={ROW} data-key-user-step={step.id}>
      <StepHead step={step} />
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {step.checks.map((c) => (
          <li key={c.id} data-key-user-check={c.id} className="min-w-0 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">
            <CcTag>{c.id}</CcTag> <b className="font-semibold">Given</b> {c.given}, <b className="font-semibold">when</b> {c.when}, <b className="font-semibold">then</b> {c.then}.{' '}
            <span className="text-cc-ink-muted">
              {c.lines.length ? `Re-tests line${c.lines.length > 1 ? 's' : ''} ${c.lines.join(', ')} of the original.` : 'No line of the original named.'}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}

function CodeParts({ parts, mode }: { parts: KeyUserCodePart[]; mode: Exclude<KeyUserMode, 'none'> }) {
  return (
    <div className="min-w-0" data-key-user-code-parts={parts.length}>
      <h3 className="m-0 cc-text-h3 text-cc-ink">What stays code</h3>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        {mode === 'split'
          ? 'Generated in this tool, and only these.'
          : 'Not built while the decision is key user. Where one of them is needed, change the decision in Design to a route that builds it.'}
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
        {parts.map((p) => (
          <li key={p.id} className={ROW} data-key-user-code-part={p.id} data-key-user-verdict={p.verdict}>
            <span className="flex flex-wrap items-center gap-2">
              <CcTag>{p.id}</CcTag>
              <b className="text-[14px] font-bold text-cc-ink [overflow-wrap:anywhere]">{p.part}</b>
              <span className="cc-text-cell text-cc-ink-muted">{p.verdict === 'code' ? 'stays code' : 'not determined'}</span>
              {p.anchors.length ? <span className="font-cc-mono text-[12px] text-cc-ink">{stepLines(p)}</span> : null}
            </span>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink [overflow-wrap:anywhere]">{p.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
