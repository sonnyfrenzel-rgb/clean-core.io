'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { ProcessStory, StoryChange } from '@/lib/process-story';
import {
  bizMoreItems,
  bizOpenLine,
  bizStoryChecks,
  bizStoryStops,
  bizStoryWithin,
  wt,
} from '@/lib/workspace-messages';

/** At most this many checks are named under a step; the rest are counted. */
const CHECKS_SHOWN = 4;

export interface OpeningRule {
  id: string;
  text: string;
  anchor: string | null;
}

/**
 * The opening of the Business view — the old process as a business reader asks
 * about it (owner, 03.10.2026: *"The start is far too technical for a business
 * user; he just wants to know more about his old process."*).
 *
 * Top to bottom: the program's name, the process as five to eight numbered
 * steps in plain words (`lib/process-story.ts`), what it decides (the rules
 * the code hard-codes, in the plain wording of `lib/business-card.ts`), what
 * it changes, and one calm line about what the code alone cannot settle. No
 * ABAP on this level: every step and every rule carries its line as a small
 * chip, and the code, the table list, the figures and the receipt of how this
 * was read are one fold down ("How this was read") — for the IT reader, never
 * removed (§2.11).
 *
 * Nothing here is computed: the caller hands in what the first look already
 * read, and this component only lays it out.
 */
export default function BusinessOpening({
  name,
  nameIsProposed,
  programName,
  nameReason,
  story,
  rules,
  rulesMore,
  changes,
  changesMore,
  changesNone,
  open,
  onDecideRules,
  details,
}: {
  /** The title: a proposed business name, or the program's name, or the sentence that there is none. */
  name: string;
  /** The title is a model's proposal — chip *Model proposal · name*, program name under it. */
  nameIsProposed: boolean;
  programName: string | null;
  nameReason: string | null;
  story: ProcessStory;
  rules: OpeningRule[];
  rulesMore: number;
  changes: StoryChange[];
  changesMore: number;
  /** Said under "What it changes" when the code shows no change — what the program does work on. */
  changesNone: string;
  open: { count: number; noSource: boolean; example: string | null };
  /** Where "Decide on rules" leads; absent where the page offers no rule action (a reader, the demo). */
  onDecideRules?: () => void;
  /** "How this was read": the code, the tables, the figures and the stages. */
  details: React.ReactNode;
}) {
  return (
    <div data-first-look-result="" data-first-look-business="" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            data-first-look-process-name={programName ? 'named' : 'unnamed'}
            className="m-0 text-[22px] leading-tight font-extrabold tracking-[-0.02em] break-words text-cc-ink"
          >
            {name}
          </h3>
          {nameIsProposed ? <CcProvenanceChip value="proposed" note={wt('firstLook.nameNote')} /> : null}
        </div>
        {nameIsProposed && programName ? (
          <p className="m-0 font-cc-mono text-[12px] font-medium text-cc-ink-muted">{programName}</p>
        ) : null}
        {nameReason ? <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{nameReason}</p> : null}
        <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {wt('biz.storyLead')}
          {story.proposedNames ? <CcProvenanceChip value="proposed" note={wt('biz.storyNamesNote')} /> : null}
        </p>
      </div>

      {story.steps.length > 0 ? (
        <ol data-process-story="" data-steps={story.steps.length} className="m-0 flex list-none flex-col gap-2 p-0">
          {story.steps.map((step, i) => {
            const checks = step.checks.slice(0, CHECKS_SHOWN);
            return (
              <li
                key={`${step.nodeId}-${i}`}
                data-process-story-step={i + 1}
                className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
              >
                <span
                  aria-hidden={true}
                  className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full bg-cc-surface-muted text-[13px] font-bold text-cc-ink"
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] leading-snug font-semibold text-cc-ink">
                    <span className="min-w-0 break-words">
                      {step.within ? `${bizStoryWithin(step.within)} ` : null}
                      {step.text}
                    </span>
                    {step.anchor ? (
                      <CcAnchor label={`${wt('firstLook.sourceLine')} ${step.anchor}`}>{step.anchor}</CcAnchor>
                    ) : null}
                  </p>
                  {checks.length > 0 ? (
                    <p data-process-story-checks="" className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                      {bizStoryChecks(checks, step.checks.length - checks.length)}
                    </p>
                  ) : null}
                  {step.stops.length > 0 ? (
                    <p data-process-story-stops="" className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                      {bizStoryStops(step.stops)}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p data-process-story="none" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
          {wt('biz.storyNone')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section
          data-story-decides=""
          aria-labelledby="story-decides-title"
          className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line px-4 py-3"
        >
          <h4 id="story-decides-title" className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
            {wt('biz.decidesTitle')}
          </h4>
          {rules.length === 0 ? (
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{wt('biz.decidesNone')}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {rules.map((rule) => (
                <li key={rule.id} data-story-rule={rule.id} className="flex flex-wrap items-center gap-2 text-[13px] leading-snug font-semibold text-cc-ink">
                  <span className="min-w-0 break-words">{rule.text}</span>
                  {rule.anchor ? (
                    <CcAnchor label={`${wt('firstLook.sourceLine')} ${rule.anchor}`}>{rule.anchor}</CcAnchor>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {rulesMore > 0 ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{bizMoreItems(rulesMore)}</p>
          ) : null}
          {onDecideRules && rules.length + rulesMore > 0 ? (
            <span className="cc-no-print">
              <CcButton variant="ghost" onClick={onDecideRules} data-story-decide-rules="">
                {wt('rules.edit')}
              </CcButton>
            </span>
          ) : null}
        </section>

        <section
          data-story-changes=""
          aria-labelledby="story-changes-title"
          className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line px-4 py-3"
        >
          <h4 id="story-changes-title" className="m-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">
            {wt('biz.changesTitle')}
          </h4>
          {changes.length === 0 ? (
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{changesNone}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {changes.map((change) => (
                <li key={change.text} className="flex flex-wrap items-center gap-2 text-[13px] leading-snug font-semibold text-cc-ink">
                  <span className="min-w-0 break-words">{change.text}</span>
                  {change.anchor ? (
                    <CcAnchor label={`${wt('firstLook.sourceLine')} ${change.anchor}`}>{change.anchor}</CcAnchor>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {changesMore > 0 ? (
            <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{bizMoreItems(changesMore)}</p>
          ) : null}
        </section>
      </div>

      {open.noSource ? null : (
        <p data-story-open={open.count} className="m-0 flex flex-wrap items-center gap-2 text-[13px] leading-snug font-medium text-cc-ink-muted">
          <CcProvenanceChip value="not-determined" />
          <span className="min-w-0">{bizOpenLine(open.count, open.example)}</span>
        </p>
      )}

      <div className="border-t border-cc-line pt-2">
        <CcDisclosure title={wt('biz.howRead')} level={3}>
          <div data-first-look-details="" className="flex flex-col gap-4">
            {details}
          </div>
        </CcDisclosure>
      </div>
    </div>
  );
}
