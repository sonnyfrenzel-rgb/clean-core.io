'use client';

import React from 'react';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import { SapCheckedText } from '@/components/SapIdentifierCheck';
import {
  COMPARED_OPTION_LABELS,
  COMPARISON_ASPECTS,
  COMPARISON_ASPECT_LABELS,
  readOptionComparison,
} from '@/lib/design-option-comparison';
import { cn } from '@/lib/utils';
import { KEY_USER_COMPANY_POLICY, keyUserLevelSentence, type KeyUserStepList } from '@/lib/key-user-steps';
import CcMessageStrip from '@/components/cc/MessageStrip';

/**
 * The SAP standard, an in-app RAP extension and a side-by-side CAP application,
 * compared before the design rules the standard out (roadmap 3.0.12; CO review
 * F14, F15). The comparison is the model's, grounded in the engine's option
 * facts, and is marked as a proposal once for the section. A reason that only
 * restates the route ("CAP because the target is CAP") is not shown as a
 * reason: the section says it was refused and why (`readOptionComparison`).
 */
export default function OptionComparison({ design, keyUser = null }: {
  design: unknown;
  /**
   * Roadmap 3.0.19: the engine's key-user step list, where the signed run's
   * engine reads key user — its limits stand beside the fourth option. Null:
   * an engine before 3.0.19, and the section is the one it always was.
   */
  keyUser?: KeyUserStepList | null;
}) {
  const view = readOptionComparison(design);
  const fourOptions = view.state === 'ready' && view.options.some((o) => o.option === 'keyuser');
  return (
    <section
      aria-labelledby="design-options-title"
      data-design-section="options"
      data-option-comparison={view.state}
      className="flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="design-options-title" className="m-0 cc-text-h3 text-cc-ink">{fourOptions || keyUser ? 'Standard, key user, RAP and CAP compared' : 'Standard, RAP and CAP compared'}</h3>
        {/* Only over a comparison the model wrote: an absent or unreadable one proposes nothing (QA 5a559787: 9af97544d758). */}
        {view.state === 'absent' || view.state === 'malformed' ? null : <CcProvenanceChip value="proposed" />}
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
          <p className="m-0 text-[13px] text-cc-ink-muted">
            Each option on target release, fit-gap, effort, running cost and data contract — the model&apos;s comparison on the engine&apos;s facts. Running cost is qualitative: amounts come only from approved cost assumptions in Economics.
          </p>
          <div className={cn('grid min-w-0 grid-cols-1 gap-3', fourOptions ? 'min-[1000px]:grid-cols-2 min-[1400px]:grid-cols-4' : 'min-[1000px]:grid-cols-3')}>
            {view.options.map((o) => (
              <article
                key={o.option}
                data-option={o.option}
                aria-label={COMPARED_OPTION_LABELS[o.option]}
                className={cn(
                  'flex min-w-0 flex-col gap-2 rounded-cc-row border bg-cc-surface p-3',
                  view.recommended === o.option ? 'border-2 border-cc-ink' : 'border-cc-line',
                )}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <b className="text-[14px] font-bold text-cc-ink">{COMPARED_OPTION_LABELS[o.option]}</b>
                  {view.recommended === o.option ? <CcTag>Proposed</CcTag> : null}
                </span>
                <dl className="m-0 grid gap-2">
                  {COMPARISON_ASPECTS.map((a) => (
                    <div key={a} data-option-aspect={a} className="min-w-0">
                      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-cc-ink-muted">{COMPARISON_ASPECT_LABELS[a]}</dt>
                      <dd className="m-0 text-[13px] text-cc-ink [overflow-wrap:anywhere]"><SapCheckedText text={o[a]} /></dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          {view.missing.length ? (
            <p data-option-missing="" className="m-0 text-[13px] text-cc-ink-muted">
              Not compared by the model: {view.missing.map((m) => COMPARED_OPTION_LABELS[m]).join(', ')}.
            </p>
          ) : null}
          {keyUser && view.keyUserNotCompared ? (
            <p data-option-key-user-not-compared="" className="m-0 text-[13px] text-cc-ink-muted">
              Key-user extensibility is not compared in this design — it was written before the engine read key-user candidates, or the model left it out. Regenerate the design to compare it; its engine limits are below.
            </p>
          ) : null}
          {view.reason ? (
            <div data-option-reason="" className="flex min-w-0 flex-col gap-1">
              <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]">
                <b className="font-semibold">Why {COMPARED_OPTION_LABELS[view.recommended]}:</b> <SapCheckedText text={view.reason.text} />
              </p>
              <p className="m-0 text-[14px] text-cc-ink [overflow-wrap:anywhere]">
                <b className="font-semibold">The requirement the other options miss:</b> <SapCheckedText text={view.reason.requirement} />
              </p>
            </div>
          ) : (
            <p data-option-reason-refused="" className="m-0 rounded-cc-row border border-cc-warning-border bg-cc-warning-bg px-3 py-2 text-[13px] font-medium text-cc-ink">
              The model&apos;s reason for {COMPARED_OPTION_LABELS[view.recommended]} is not shown: {view.refused} A decision needs the requirement the other options miss — regenerate, or record the reason in the decision.
            </p>
          )}
        </>
      )}
      {keyUser ? <KeyUserLimits list={keyUser} /> : null}
    </section>
  );
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
        <CcProvenanceChip value="reconstructed" />
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
