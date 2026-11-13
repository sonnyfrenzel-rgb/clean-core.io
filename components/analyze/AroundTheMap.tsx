'use client';

import React from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { CcTag } from '@/components/cc/Tag';
import AskOnClick from '@/components/workspace/AskOnClick';
import { RuleBasketLineView } from '@/components/workspace/RuleBasketLine';
import { AsReadFromCode, WordedChip } from '@/components/workspace/WordedText';
import { runAt, WHO_CAUTION, WHY_CAUTION, type AroundSentence, type AroundTheMapText } from '@/lib/around-the-map';
import { AUTHOR_CLAIM_LABEL } from '@/lib/program-summary-check';
import { plainRangeOf, type PlainRange, type WordedSentence } from '@/lib/plain-wording';
import { aroundMoreQuestions, bizStoryWithin, wt } from '@/lib/workspace-messages';

/**
 * The text around the map — Analyze, Business view (plan `docs/design/analyze-business-first-plan.md` §4.2, AB-6;
 * mockup `docs/roadmap/analyze-business-first-mockup.html`, states 3, 5 and 9; ADR-116). It replaces the interim
 * First insights blocks (`BusinessOpening`, `ProgramInShort`) that stood below the map in v3.1.0.
 *
 * Two parts, one text (`lib/around-the-map.ts`, read by `hooks/useAroundTheMap.ts`):
 *
 *   - `WhatThisProgramDoes` — above the map: two sentences, the engine's or a checked model wording, with the page's
 *     invitation beside them; hidden while the walk-through runs (`hidden`, mockup state 5);
 *   - `AroundTheMap` — below the map: *How it runs* (with "you are here" for the tour, `here`), *Why it exists* with
 *     the fixed caution, *Who is involved* (*Reconstructed*), and *Questions to settle with the business*.
 *
 * **Every sentence carries its line**, a button that opens the code beside the map where the page has that panel
 * (`onAnchor`). **The AI chip stands only on a block a model wrote**: the summary when the model's wording passed
 * the check, *How it runs* when a step is reworded; the engine's blocks carry *Reconstructed*. While the text is
 * read, each block stands as a placeholder that says what it is reading (`DESIGN.md` §5.2).
 *
 * Only layout: the sentences come in ready.
 */

type OnAnchor = ((lineStart: number, lineEnd: number) => void) | undefined;

const CARD = 'flex min-w-0 flex-col gap-2 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-4 shadow-cc';
const TITLE = 'm-0 flex flex-wrap items-center gap-2 text-[14px] leading-snug font-bold text-cc-ink';
const WAITING = 'm-0 text-[13px] leading-snug font-medium text-cc-ink-muted';

/** A line anchor: a button into the code panel where the page has one, a reference otherwise. */
export function Line({ anchor, onAnchor }: { anchor: string; onAnchor?: OnAnchor }) {
  const range = plainRangeOf(anchor);
  return (
    <CcAnchor
      label={`${wt('firstLook.sourceLine')} ${anchor}`}
      onOpen={range && onAnchor ? () => onAnchor(range.lineStart, range.lineEnd) : undefined}
    >
      {anchor}
    </CcAnchor>
  );
}

/** One sentence, then its line. */
function Said({ sentence, text, onAnchor }: { sentence: AroundSentence; text?: string; onAnchor?: OnAnchor }) {
  return (
    <>
      <span className="break-words">{text ?? sentence.text}</span> <Line anchor={sentence.anchor} onAnchor={onAnchor} />
    </>
  );
}

type Say = (text: string, anchor: PlainRange | null) => WordedSentence;
const AS_IS: Say = (text) => ({ text, engine: text, worded: false });

/**
 * "What this program does" — the first block of the page, above the map (mockup state 3). `actions` is the page's
 * invitation; `hidden` takes the block away while the walk-through runs (mockup state 5).
 */
export function WhatThisProgramDoes({
  text,
  state,
  say = AS_IS,
  actions = null,
  hidden = false,
  onAnchor,
}: {
  text: AroundTheMapText | null;
  state: 'reading' | 'ready' | 'failed';
  say?: Say;
  actions?: React.ReactNode;
  /** True while the walk-through runs: the tour card says it, the block steps aside (AB-4 drives it). */
  hidden?: boolean;
  onAnchor?: OnAnchor;
}) {
  if (hidden) return null;
  const does = text?.does ?? null;
  const said = does && does.by === 'engine' ? does.sentences.map((s) => say(s.text, plainRangeOf(s.anchor))) : [];
  const worded = said.find((s) => s.worded) ?? null;
  return (
    <section
      data-analyze-summary=""
      data-around-does={does ? does.by : state}
      data-layout-item=""
      aria-labelledby="analyze-summary-title"
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-4 shadow-cc"
    >
      <div className="min-w-0 flex-1 basis-80">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="analyze-summary-title" className="m-0 text-[15px] leading-snug font-bold text-cc-ink">
            {wt('abiz.summaryTitle')}
          </h2>
          {does && does.sentences.length > 0 ? (
            does.by === 'model' ? (
              <CcProvenanceChip value="proposed" note={wt('around.modelNote')} />
            ) : worded ? (
              <WordedChip said={worded} />
            ) : (
              <CcProvenanceChip value="reconstructed" />
            )
          ) : null}
        </div>
        <p data-analyze-summary-text="" className="m-0 mt-1 max-w-[60rem] text-[14px] leading-relaxed font-medium text-cc-ink">
          {state === 'reading' ? (
            <span data-around-waiting="" className="text-cc-ink-muted">{wt('around.summaryWriting')}</span>
          ) : does && does.sentences.length > 0 ? (
            does.sentences.map((s, i) => (
              <React.Fragment key={`${s.anchor}-${i}`}>
                <span data-around-sentence="" data-anchor={s.anchor}>
                  <Said sentence={s} text={said[i]?.text} onAnchor={onAnchor} />
                </span>
                {i < does.sentences.length - 1 ? ' ' : null}
              </React.Fragment>
            ))
          ) : (
            wt('abiz.summaryNone')
          )}
        </p>
        {worded ? <AsReadFromCode said={said} /> : null}
      </div>
      {actions}
    </section>
  );
}

/** The blocks below the map (mockup states 3 and 9). */
export default function AroundTheMap({
  text,
  state,
  say = AS_IS,
  askNow = null,
  here = null,
  designHref = null,
  onAnchor,
}: {
  text: AroundTheMapText | null;
  state: 'reading' | 'ready' | 'failed';
  say?: Say;
  /** The owner's click for the rewording, when the account's automatic steps are off. */
  askNow?: (() => void) | null;
  /**
   * Where the walk-through stands — the hook AB-4's inline tour drives: the node its station shows, or a line of
   * it. The paragraph of "How it runs" that holds it says "you are here".
   */
  here?: { nodeId?: string | null; line?: number | null } | null;
  /** Where the basket line leads into Design; null where the page answers the rules itself (the demo's rules card). */
  designHref?: string | null;
  onAnchor?: OnAnchor;
}) {
  if (state === 'failed') {
    return (
      <section data-around-the-map="failed" aria-label={wt('around.title')}>
        <p role="status" className={WAITING}>
          {wt('around.failed')}
        </p>
      </section>
    );
  }
  const reading = state === 'reading' || !text;
  const at = text ? runAt(text.runs, here) : null;
  const stepSaid: WordedSentence[][] = text ? text.runs.map((r) => r.steps.map((s) => say(s.step.text, plainRangeOf(s.step.anchor)))) : [];
  const flat = stepSaid.flat();
  const worded = flat.find((s) => s.worded) ?? null;

  return (
    <section
      data-around-the-map={reading ? 'reading' : 'ready'}
      aria-label={wt('around.title')}
      className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      {/* How it runs — the story in at most four paragraphs, "you are here" during the tour. */}
      <section data-around-runs={text ? text.runs.length : 0} aria-labelledby="around-runs-title" className={`${CARD} md:col-span-2 xl:col-span-1`}>
        <h3 id="around-runs-title" className={TITLE}>
          {wt('around.runsTitle')}
          {worded ? <WordedChip said={worded} /> : reading ? null : <CcProvenanceChip value="reconstructed" />}
        </h3>
        <AskOnClick askNow={askNow} step="plain" />
        {reading ? (
          <p data-around-waiting="" className={WAITING}>{wt('around.runsWaiting')}</p>
        ) : text.runs.length === 0 ? (
          <p className={WAITING}>{wt('around.runsNone')}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {text.runs.map((run, i) => (
              <li
                key={`${run.title}-${i}`}
                data-around-run={i + 1}
                {...(at === i ? { 'data-around-run-here': '', 'aria-current': 'step' as const } : {})}
                className={
                  at === i
                    ? '-ml-3 rounded-r-cc-row border-l-[3px] border-cc-ink bg-cc-information-bg py-2 pl-3'
                    : '-ml-3 border-l-[3px] border-transparent py-2 pl-3'
                }
              >
                <p className="m-0 text-[13px] leading-snug font-bold text-cc-ink">
                  {`${i + 1}. ${run.title}`}
                  {at === i ? <span className="font-semibold text-cc-ink-muted">{` · ${wt('around.youAreHere')}`}</span> : null}
                </p>
                <p className="m-0 mt-1 text-[14px] leading-relaxed font-medium text-cc-ink">
                  {run.steps.map((s, k) => (
                    <React.Fragment key={`${s.step.anchor}-${k}`}>
                      <span data-around-sentence="" data-anchor={s.step.anchor}>
                        {s.within ? `${bizStoryWithin(s.within)} ` : null}
                        <Said sentence={s.step} text={stepSaid[i]?.[k]?.text} onAnchor={onAnchor} />
                      </span>{' '}
                      {s.more.map((m, j) => (
                        <React.Fragment key={`${m.anchor}-${j}`}>
                          <span data-around-sentence="" data-anchor={m.anchor} className="text-cc-ink-muted">
                            {m.text}
                          </span>{' '}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </p>
              </li>
            ))}
          </ol>
        )}
        {!reading && text.testData ? (
          <p data-around-sentence="" data-anchor={text.testData.anchor} data-around-test-data="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
            <Said sentence={text.testData} onAnchor={onAnchor} />
          </p>
        ) : null}
        {worded ? <AsReadFromCode said={flat} /> : null}
      </section>

      {/* Why it exists, and who is involved — the engine's only. */}
      <section data-around-why-who="" aria-labelledby="around-why-title" className={CARD}>
        <h3 id="around-why-title" className={TITLE}>
          {wt('around.whyTitle')}
          {reading ? null : <CcProvenanceChip value="reconstructed" />}
        </h3>
        {reading ? (
          <p data-around-waiting="" className={WAITING}>{wt('around.whyWaiting')}</p>
        ) : (
          <div data-around-why="" className="flex flex-col gap-1">
            {text.why.sentences.length === 0 && !text.why.authorClaim ? (
              <p className={WAITING}>{wt('around.whyNone')}</p>
            ) : null}
            {text.why.sentences.map((s, i) => (
              <p key={`${s.anchor}-${i}`} data-around-sentence="" data-anchor={s.anchor} className="m-0 text-[14px] leading-relaxed font-medium text-cc-ink">
                <Said sentence={s} onAnchor={onAnchor} />
              </p>
            ))}
            {text.why.authorClaim ? (
              <p data-around-sentence="" data-anchor={text.why.authorClaim.anchor} data-around-author-claim="" className="m-0 flex flex-wrap items-center gap-x-2 text-[14px] leading-relaxed font-medium text-cc-ink">
                <span className="text-cc-ink-muted">{wt('around.whyAuthor')}</span>
                <span className="break-words">{`“${text.why.authorClaim.text}”`}</span>
                <Line anchor={text.why.authorClaim.anchor} onAnchor={onAnchor} />
                <CcTag>{AUTHOR_CLAIM_LABEL}</CcTag>
              </p>
            ) : null}
            {text.why.sentences.length > 0 || text.why.authorClaim ? (
              <p data-around-caution="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {WHY_CAUTION}
              </p>
            ) : null}
          </div>
        )}

        <h3 id="around-who-title" className={`${TITLE} mt-3`}>
          {wt('around.whoTitle')}
          {reading ? null : <CcProvenanceChip value="reconstructed" />}
        </h3>
        {reading ? (
          <p data-around-waiting="" className={WAITING}>{wt('around.whoWaiting')}</p>
        ) : text.who.length === 0 ? (
          <p className={WAITING}>{wt('around.whoNone')}</p>
        ) : (
          <>
            <ul data-around-who={text.who.length} aria-labelledby="around-who-title" className="m-0 flex list-none flex-col p-0">
              {text.who.map((w, i) => (
                <li
                  key={`${w.role}-${w.anchor}-${i}`}
                  data-around-sentence=""
                  data-anchor={w.anchor}
                  className="border-t border-cc-line py-2 text-[14px] leading-normal font-medium text-cc-ink first:border-t-0"
                >
                  <b className="font-bold">{w.role}</b>
                  {': '}
                  <Said sentence={{ text: w.text, anchor: w.anchor }} onAnchor={onAnchor} />
                </li>
              ))}
            </ul>
            <p data-around-who-caution="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{WHO_CAUTION}</p>
          </>
        )}
      </section>

      {/* Questions to settle with the business — each with its line; IT's stay in IT. */}
      <section data-around-questions={text ? text.questions.length : 0} aria-labelledby="around-questions-title" className={CARD}>
        <h3 id="around-questions-title" className={TITLE}>
          {wt('around.questionsTitle')}
          {reading ? null : <CcProvenanceChip value="reconstructed" />}
        </h3>
        {reading ? (
          <p data-around-waiting="" className={WAITING}>{wt('around.questionsWaiting')}</p>
        ) : text.questions.length === 0 ? (
          <p className={WAITING}>{wt('around.questionsNone')}</p>
        ) : (
          <>
            <ol className="m-0 flex list-none flex-col p-0">
              {text.questions.map((q, i) => (
                <li
                  key={q.id}
                  data-around-question={q.from}
                  data-around-sentence=""
                  data-anchor={q.anchor}
                  className="flex gap-2 border-t border-cc-line py-2 text-[14px] leading-normal font-medium text-cc-ink first:border-t-0"
                >
                  <span
                    aria-hidden={true}
                    className="mt-px inline-flex size-5 flex-none items-center justify-center rounded-full border border-cc-field-border text-[11px] font-bold"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <Said sentence={{ text: q.text, anchor: q.anchor }} onAnchor={onAnchor} />
                  </span>
                </li>
              ))}
            </ol>
            {text.questionsMore > 0 ? (
              <p data-around-questions-more={text.questionsMore} className="m-0 text-[12px] font-semibold text-cc-ink-muted">
                {aroundMoreQuestions(text.questionsMore)}
              </p>
            ) : null}
            <p className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('around.questionsFor')}</p>
          </>
        )}
        {/* The rules in one quiet line and the way into Design (owner decision 21.10.2026: no rule decision here). */}
        {!reading && text.basket ? <RuleBasketLineView {...text.basket} designHref={designHref} /> : null}
      </section>
    </section>
  );
}
