'use client';

import React from 'react';
import Link from 'next/link';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import ProgramInShort from './ProgramInShort';
import { AsReadFromCode, WordedChip } from './WordedText';
import { plainRangeOf, type PlainRange, type WordedSentence } from '@/lib/plain-wording';
import type { SummaryLine } from '@/lib/program-summary-text';
import type { AuthorClaim } from '@/lib/program-summary-check';
import type { ProcessStory, StoryChange } from '@/lib/process-story';
import type { BriefLine, FirstLookBrief } from '@/lib/first-look-brief';
import type { AskWho, CodeGivesAway } from '@/lib/first-look-findings';
import {
  bizMoreItems,
  bizStoryChecks,
  bizStoryStops,
  bizStoryTechnical,
  bizStoryUnsaid,
  bizStoryWithin,
  bizTestData,
  givesMore,
  wt,
} from '@/lib/workspace-messages';

export interface OpeningRule {
  id: string;
  text: string;
  anchor: string | null;
}

const ASK_KEY: Record<AskWho, 'gives.askIt' | 'gives.askUsers' | 'gives.askBusiness'> = {
  it: 'gives.askIt',
  users: 'gives.askUsers',
  business: 'gives.askBusiness',
};

const BLOCK_TITLE = 'm-0 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase';

function Line({ anchor }: { anchor: string | null }) {
  return anchor ? <CcAnchor label={`${wt('firstLook.sourceLine')} ${anchor}`}>{anchor}</CcAnchor> : null;
}

/**
 * The opening of the Business view — First insights, the page a new user
 * meets first (owner, 22.10.2026: *"First insights muss definitiv die stärkste
 * page der app werden"*; *"der first look muss perfekt sein, das hält neue
 * user auf der plattform"*).
 *
 * At most five blocks on top, in about one screen, for a process owner who
 * does not read ABAP — roadmap 3.0.21, the analysis's proposal with the
 * owner's decisions of 22.10.2026:
 *
 *   1. **In short** — one sentence, what the program is for;
 *   2. **Started by · Goes in · Comes out** — three short rows;
 *   3. **Step by step** — one line per step. What a step checks and where it
 *      can end moved into the walk-through and into "How this was read";
 *   4. **What the code gives away** — at most three things a business reader
 *      would not expect, each with its line and who to ask; the test-data
 *      switch is one line here;
 *   5. **What it decides** (the weightiest questions for the business, as
 *      statements, and the one quiet line into Design) beside **What it
 *      changes** (kept by owner decision).
 *
 * Everything else is one fold down ("How this was read") — never removed
 * (§2.11). The open questions stand once on the page, under their own block.
 * No decision is asked here.
 *
 * Nothing here is computed: the caller hands in what the first look already
 * read, and this component only lays it out.
 */
export default function BusinessOpening({
  name,
  nameIsProposed,
  programName,
  nameReason,
  brief = null,
  story,
  rules,
  rulesMore,
  rulesNone,
  changes,
  changesMore,
  changesNone,
  changesAll = [],
  givesAway = null,
  elsewhere = null,
  details,
  inShort = null,
  rulesLine,
  say,
}: {
  /**
   * The rules in one quiet line — how many questions the business has, how
   * many technical rules stay as coded — with the way into Design (owner
   * decision 21.10.2026: no rule decision in the first insights).
   */
  rulesLine?: React.ReactNode;
  /**
   * Roadmap 3.0.20: the plain wording of the engine's sentences (`usePlainWording`,
   * scope `firstlook`), when a rewording is on record. A reworded sentence stands
   * in place; the engine's own sentences stay one fold down, under the chip
   * *Model proposal · worded*.
   */
  say?: (text: string, anchor: PlainRange | null) => WordedSentence;
  /** The title: a proposed business name, or the program's name, or the sentence that there is none. */
  name: string;
  /** The title is a model's proposal — chip *Model proposal · name*, program name under it. */
  nameIsProposed: boolean;
  programName: string | null;
  nameReason: string | null;
  /** The top blocks out of the shared summary (`lib/first-look-brief.ts`); null while it is not read. */
  brief?: FirstLookBrief | null;
  story: ProcessStory;
  /** At most three statements of what the code decides. */
  rules: OpeningRule[];
  rulesMore: number;
  /** Said under "What it decides" when no statement is listed. */
  rulesNone: string;
  changes: StoryChange[];
  changesMore: number;
  /** Said under "What it changes" when the code shows no change — what the program does work on. */
  changesNone: string;
  /** Every change with its line — listed one fold down when more stand than on top (3.0.21). */
  changesAll?: StoryChange[];
  /** "What the code gives away" (`lib/first-look-findings.ts`); null while it is not read. */
  givesAway?: CodeGivesAway | null;
  /** Where "+ N more" leads: the Documentation tool and the IT view. */
  elsewhere?: { documentation: string; it: string } | null;
  /** "How this was read": the code, the tables, the figures and the stages. */
  details: React.ReactNode;
  /**
   * What the program is for (owner, 12.10.2026) — the shared summary's lines,
   * a checked model purpose and the header's author's claim; null while it is
   * not read. On top only the brief's one sentence stands; the full summary is
   * one fold down.
   */
  inShort?: { lines: readonly SummaryLine[]; level: SummaryLine; proposal?: string | null; authorClaim?: AuthorClaim | null } | null;
}) {
  const said: WordedSentence[] = [];
  const word = (text: string, anchor: PlainRange | null): string => {
    if (!say) return text;
    const s = say(text, anchor);
    if (s.worded) said.push(s);
    return s.text;
  };
  // The one sentence on top is a summary line, cut at the summary's own seam —
  // reworded where the whole line is, otherwise the engine's.
  const shortLine: SummaryLine | null = inShort
    ? brief?.inShort
      ? { key: 'purpose', text: brief.inShort.text, anchors: inShort.lines.find((l) => l.key === 'purpose')?.anchors ?? [], basis: 'reconstructed' }
      : inShort.lines[0] ?? null
    : null;
  const shortText = shortLine ? word(shortLine.text, shortLine.anchors[0] ?? null) : null;
  const stepTexts = story.steps.map((s) => word(s.text, plainRangeOf(s.anchor)));
  const ruleTexts = rules.map((r) => word(r.text, plainRangeOf(r.anchor)));
  const changeTexts = changes.map((c) => word(c.text, plainRangeOf(c.anchor)));
  const rows: Array<{ key: string; label: string; line: BriefLine }> = brief
    ? [
        brief.startedBy ? { key: 'started-by', label: wt('biz.startedBy'), line: brief.startedBy } : null,
        brief.goesIn ? { key: 'goes-in', label: wt('biz.goesIn'), line: brief.goesIn } : null,
        brief.comesOut ? { key: 'comes-out', label: wt('biz.comesOut'), line: brief.comesOut } : null,
      ].filter((r): r is { key: string; label: string; line: BriefLine } => r !== null)
    : [];
  const testSwitchShown = !!givesAway?.testSwitch && !givesAway.findings.some((f) => f.reader === 'test-switch');

  return (
    <div data-first-look-result="" data-first-look-business="" className="flex flex-col gap-5">
      {/* 1 — the name and what the program is for, in one sentence. */}
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
        {inShort && shortLine && shortText ? (
          <div className="mt-2">
            <ProgramInShort
              compact
              lines={[{ ...shortLine, text: shortText }]}
              level={inShort.level}
              proposal={inShort.proposal ?? null}
              authorClaim={inShort.authorClaim ?? null}
            />
          </div>
        ) : null}
      </div>

      {/* 2 — who starts it, what goes in, what comes out. */}
      {rows.length > 0 ? (
        <dl
          data-first-look-who-in-out={rows.length}
          className="m-0 grid grid-cols-1 gap-x-4 gap-y-1 rounded-cc-row bg-cc-surface-muted px-3 py-2 sm:grid-cols-[minmax(0,104px)_minmax(0,1fr)]"
        >
          {rows.map((row) => (
            <React.Fragment key={row.key}>
              <dt className="pt-1 text-[12px] font-semibold tracking-[0.04em] text-cc-ink-muted uppercase">{row.label}</dt>
              <dd data-first-look-row={row.key} className="m-0 flex flex-wrap items-center gap-x-2 text-[14px] leading-snug font-medium text-cc-ink max-sm:mb-1">
                <span className="min-w-0 break-words">{word(row.line.text, plainRangeOf(row.line.anchor))}</span>
                <Line anchor={row.line.anchor} />
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}

      {/* 3 — the process, one line per step. */}
      <section aria-labelledby="story-steps-title" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 id="story-steps-title" className={BLOCK_TITLE}>
            {wt('biz.stepsTitle')}
          </h4>
          {story.proposedNames ? <CcProvenanceChip value="proposed" note={wt('biz.storyNamesNote')} /> : null}
          {said.length > 0 ? <WordedChip said={said[0]} /> : null}
        </div>
        {story.steps.length > 0 ? (
          <ol data-process-story="" data-steps={story.steps.length} className="m-0 flex list-none flex-col p-0">
            {story.steps.map((step, i) => (
              <li
                key={`${step.nodeId}-${i}`}
                data-process-story-step={i + 1}
                className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 border-b border-cc-line py-2 last:border-b-0"
              >
                <span
                  aria-hidden={true}
                  className="mt-px inline-flex size-6 items-center justify-center rounded-full bg-cc-surface-muted text-[12px] font-bold text-cc-ink"
                >
                  {i + 1}
                </span>
                <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 text-[15px] leading-snug font-semibold text-cc-ink">
                  <span className="min-w-0 break-words">
                    {step.within ? `${bizStoryWithin(step.within)} ` : null}
                    {stepTexts[i]}
                  </span>
                  <Line anchor={step.anchor} />
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p data-process-story="none" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            {wt('biz.storyNone')}
          </p>
        )}
      </section>

      {/* 4 — what the code gives away: the surprise, read from the code alone. */}
      {givesAway ? (
        <section
          data-code-gives-away={givesAway.findings.length}
          aria-labelledby="code-gives-away-title"
          className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-l-4 border-cc-line border-l-cc-ink px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 id="code-gives-away-title" className={BLOCK_TITLE}>
              {wt('gives.title')}
            </h4>
            <CcTag>{wt('gives.chip')}</CcTag>
          </div>
          {givesAway.findings.length === 0 && !testSwitchShown ? (
            <p data-code-gives-away-none="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
              {wt('gives.none')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {givesAway.findings.map((finding, k) => (
                <li
                  key={`${finding.reader}-${finding.anchor}-${k}`}
                  data-code-finding={finding.reader}
                  data-code-finding-anchor={finding.anchor}
                  className="flex min-w-0 flex-col gap-1"
                >
                  <p className="m-0 flex flex-wrap items-center gap-x-2 text-[14px] leading-snug font-semibold text-cc-ink">
                    <span className="min-w-0 break-words">{finding.text}</span>
                    <Line anchor={finding.anchor} />
                  </p>
                  <p data-code-finding-ask={finding.ask} className="m-0 text-[12px] font-medium text-cc-ink-muted">
                    {wt(ASK_KEY[finding.ask])}
                  </p>
                </li>
              ))}
              {testSwitchShown && givesAway.testSwitch ? (
                <li data-code-finding="test-switch" data-process-story-test-data="" className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 flex flex-wrap items-center gap-x-2 text-[14px] leading-snug font-semibold text-cc-ink">
                    <span className="min-w-0 break-words">{givesAway.testSwitch.sentence}</span>
                    <Line anchor={givesAway.testSwitch.anchor} />
                  </p>
                </li>
              ) : null}
            </ul>
          )}
          {givesAway.more > 0 && elsewhere ? (
            <p data-code-gives-away-more={givesAway.more} className="cc-no-print m-0 flex flex-wrap items-center gap-x-3 text-[12px] font-semibold text-cc-ink-muted">
              <span>{givesMore(givesAway.more)}</span>
              <Link href={elsewhere.documentation} className="text-cc-ink underline underline-offset-2">
                {wt('biz.toDocumentation')}
              </Link>
              <Link href={elsewhere.it} className="text-cc-ink underline underline-offset-2">
                {wt('biz.toItView')}
              </Link>
            </p>
          ) : givesAway.more > 0 ? (
            <p data-code-gives-away-more={givesAway.more} className="m-0 text-[12px] font-semibold text-cc-ink-muted">
              {givesMore(givesAway.more)}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* 5 — what it decides, beside what it changes. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section
          data-story-decides=""
          aria-labelledby="story-decides-title"
          className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line px-4 py-3"
        >
          <h4 id="story-decides-title" className={BLOCK_TITLE}>
            {wt('biz.decidesTitle')}
          </h4>
          {rules.length === 0 ? (
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{rulesNone}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rules.map((rule, k) => (
                <li key={rule.id} data-story-rule={rule.id} className="flex flex-wrap items-center gap-x-2 text-[13px] leading-snug font-semibold text-cc-ink">
                  <span className="min-w-0 break-words">{ruleTexts[k]}</span>
                  <Line anchor={rule.anchor} />
                </li>
              ))}
            </ul>
          )}
          {rulesMore > 0 ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{bizMoreItems(rulesMore)}</p> : null}
          {rulesLine ?? null}
        </section>

        <section
          data-story-changes=""
          aria-labelledby="story-changes-title"
          className="flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line px-4 py-3"
        >
          <h4 id="story-changes-title" className={BLOCK_TITLE}>
            {wt('biz.changesTitle')}
          </h4>
          {changes.length === 0 ? (
            <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink">{changesNone}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {changes.map((change, k) => (
                <li key={change.text} className="flex flex-wrap items-center gap-x-2 text-[13px] leading-snug font-semibold text-cc-ink">
                  <span className="min-w-0 break-words">{changeTexts[k]}</span>
                  <Line anchor={change.anchor} />
                </li>
              ))}
            </ul>
          )}
          {changesMore > 0 ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{bizMoreItems(changesMore)}</p> : null}
        </section>
      </div>

      <AsReadFromCode said={said} />

      <div className="border-t border-cc-line pt-2">
        <CcDisclosure title={wt('biz.howRead')} level={3}>
          <div data-first-look-details="" className="flex flex-col gap-4">
            {inShort ? (
              <ProgramInShort
                id="program-in-short-detail-title"
                lines={inShort.lines}
                level={inShort.level}
                proposal={null}
                authorClaim={null}
              />
            ) : null}
            <StepDetails story={story} />
            {changesMore > 0 && changesAll.length > changes.length ? (
              <section data-story-changes-all={changesAll.length} aria-labelledby="story-changes-all-title" className="flex min-w-0 flex-col gap-2">
                <h4 id="story-changes-all-title" className={BLOCK_TITLE}>
                  {wt('biz.changesAllTitle')}
                </h4>
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {changesAll.map((change) => (
                    <li key={`${change.text}-${change.anchor ?? ''}`} className="flex flex-wrap items-center gap-x-2 text-[12px] leading-snug font-medium text-cc-ink">
                      <span className="min-w-0 break-words">{change.text}</span>
                      <Line anchor={change.anchor} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {details}
          </div>
        </CcDisclosure>
      </div>
    </div>
  );
}

/**
 * What each step checks and where it can end — one fold down since 3.0.21
 * (owner decision 22.10.2026: on top one line per step; the checks and stops
 * belong to the walk-through, and stay here for a project that has no map to
 * walk yet). The test-data switch is said here in full as well.
 */
function StepDetails({ story }: { story: ProcessStory }) {
  const withDetail = story.steps
    .map((step, i) => ({ step, n: i + 1 }))
    .filter(({ step }) => step.checks.length > 0 || step.stops.length > 0 || (step.technical ?? 0) > 0 || (step.unsaid ?? 0) > 0);
  return (
    <section data-process-story-detail={withDetail.length} aria-labelledby="story-detail-title" className="flex min-w-0 flex-col gap-2">
      <h4 id="story-detail-title" className={BLOCK_TITLE}>
        {wt('biz.stepsDetailTitle')}
      </h4>
      {withDetail.length === 0 ? (
        <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('biz.stepsDetailNone')}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {withDetail.map(({ step, n }) => (
            <li key={`${step.nodeId}-${n}`} data-process-story-detail-step={n} className="flex min-w-0 flex-col gap-1">
              <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] leading-snug font-semibold text-cc-ink">
                <span className="min-w-0 break-words">{`${n}. ${step.text}`}</span>
                <Line anchor={step.anchor} />
              </p>
              {step.checks.length > 0 ? (
                <p data-process-story-checks="" className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                  {bizStoryChecks(step.checks, 0)}
                </p>
              ) : null}
              {step.technical ? (
                <p data-process-story-technical={step.technical} className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                  {bizStoryTechnical(step.technical, step.checks.length === 0)}
                </p>
              ) : null}
              {step.unsaid ? (
                <p data-process-story-unsaid={step.unsaid} className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                  {bizStoryUnsaid(step.unsaid)}
                </p>
              ) : null}
              {step.stops.length > 0 ? (
                <p data-process-story-stops="" className="m-0 text-[12px] leading-snug font-medium break-words text-cc-ink-muted">
                  {bizStoryStops(step.stops)}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {story.testData ? (
        <p data-process-story-test-data-detail="" className="m-0 flex flex-wrap items-center gap-x-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
          <span className="min-w-0 break-words">{bizTestData(story.testData.cases)}</span>
          <Line anchor={story.testData.anchor} />
        </p>
      ) : null}
    </section>
  );
}
