'use client';

import React, { useMemo, useState } from 'react';
import { ChevronRight, Pencil, Printer } from 'lucide-react';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import { useRevealOnHash } from '@/hooks/useRevealOnHash';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import { cn } from '@/lib/utils';
import {
  PROPOSED_DAYS_BY_KIND,
  effortProposalFor,
  type CostAssumptions,
  type CostComparison,
  type CostOption,
} from '@/lib/cost-assumptions';
import { formatLines, formatMoney, formatMoneyRangeOutward, formatNumber, formatDays } from '@/lib/format';
import { RATES_HELP } from '@/lib/economics-help';
import {
  OPTION_CONDITION,
  answerSentence,
  differenceToKeeping,
  economicsAnswer,
  howFirm,
  notPricedSentence,
  overlapWords,
  yearsWords,
} from '@/lib/economics-answer';
import { economicsAnchors, PAGE_ANCHOR_IDS, PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import OptionComparison, { pendingProposals, takeOverPatch, type OptionProposals } from '@/components/tco/OptionComparison';
import { CadenceField, CurrencyField, FigureField } from '@/components/tco/EconomicsChecklist';
import CostRangeChart, { proposedDaysOf } from '@/components/tco/CostRangeChart';
import OptionsTable from '@/components/tco/OptionsTable';
import HowFirm from '@/components/tco/HowFirm';
import WhatTheFiguresRestOn from '@/components/tco/WhatTheFiguresRestOn';
import {
  SHARED_FIGURES,
  TYPICAL_SHARED,
  typicalFill,
  typicalInWords,
  typicalPatch,
  usesTypical,
  withReaderOptionPatch,
  withReaderPatch,
} from '@/lib/typical-assumptions';

/**
 * Economics as one object page for every reader (ADR-128, mock-up `docs/roadmap/economics-next-mockup.html`; ADR-126
 * (1): no view switch, the header's note in its place). Shared by the project's tool and the demo, so the demo cannot
 * show a page the product does not have.
 *
 *   1. **The answer first** (`AnswerCard`): the question, one or two sentences — the cost of keeping, the cheapest
 *      change that keeps the function, the lowest overall, each with its condition — the next step, and four facets;
 *      the last facet is the assumptions as chips, edited **in place** in the card, every figure moving as they type
 *      (E1, E3, E5). Until every option is priced, the one primary action is **Use typical assumptions** (3.5.1,
 *      ADR-144, `lib/typical-assumptions.ts`): one click fills what is missing with typical values, each marked as a
 *      typical assumption wherever it shows, and never over a figure the reader stated.
 *   2. **"On this page"** (`PageAnchorBar`, E6).
 *   3. **The range chart**, Keep as the reference (E4), and **Options compared** with the difference to keeping (E2):
 *      the answer and the comparison, nothing else open.
 *   4. Below, folded and closed until asked for (3.5.1, owner 24.11.2026: the tool was still too complex): **How firm
 *      is the answer?** in plain words (E7), **Effort in days**, editable, **How it is calculated** and **the model's
 *      view** (E9). The side column holds two cards (DESIGN.md §5): what the figures rest on, with whether they are
 *      saved (E10), and where this goes.
 *
 * Every amount comes from `lib/cost-assumptions.ts` through `lib/economics-answer.ts`; nothing here prices anything.
 */
export interface EconomicsObjectPageProps {
  assumptions: CostAssumptions;
  comparison: CostComparison;
  proposals: OptionProposals;
  /** The lines the proposals scale with, and the lines of the source (`null`: none). */
  loc: number | null;
  sourceLoc: number | null;
  onLoc?: (loc: number | null) => void;
  score: number | null;
  scoreStale: boolean;
  /** The route the analysis proposes, in words. */
  route: string | null;
  /** The owner may change figures; an invited reader reads them. */
  editable: boolean;
  onPatch: (patch: Partial<CostAssumptions>) => void;
  onPatchOption: (id: string, patch: Partial<CostOption>) => void;
  /** Where the decision is taken (Re-design, its decision step, ADR-143); `null` hides the link (the demo). */
  managementHref: string | null;
  /** The Design tool, the step after the decision; `null` or absent hides the link (the demo). */
  designHref?: string | null;
  /** "Decision: not taken yet", or the option on record. */
  decisionWords: string;
  /** The side column's "Saved" line. */
  saved: React.ReactNode;
  /** Whether the shared figures are saved — beside them, in the editor. */
  ratesSave?: React.ReactNode;
  /** Whether the effort is saved — in the fold's head. */
  effortSave?: React.ReactNode;
  /** Strips above the answer: a failed save, figures stored against another score. */
  strips?: React.ReactNode;
  optionSaveStatus?: (optionId: string) => React.ReactNode;
  /** The key-user configuration effort, where the run read a key-user part. */
  keyUserEffort?: React.ReactNode;
  /** The model's business value and action plan (`BusinessValuePlan`), or `null` where the analysis wrote none. */
  modelView?: React.ReactNode;
  /**
   * ECO-N6 (ADR-128 (7)) — *Fill with AI proposals*, the second path of the first visit. Not built in 3.5.0: its AI
   * and privacy wording goes to the lawyer first. Nothing passes it yet; the place is kept so the first visit's two
   * paths stand side by side once it is.
   */
  aiProposals?: React.ReactNode;
  /** A footer for print: the inputs every amount was priced with. */
  printFooter?: React.ReactNode;
}

const SECTION = 'scroll-mt-32 min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-4 shadow-cc max-[720px]:px-4';
const SIDE = 'min-w-0 rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc';

export default function EconomicsObjectPage(props: EconomicsObjectPageProps) {
  const {
    assumptions: a,
    comparison,
    proposals,
    loc,
    sourceLoc,
    editable,
    onPatch,
    onPatchOption,
  } = props;
  const ids = PAGE_ANCHOR_IDS.economics;
  const [editOpen, setEditOpen] = useState(false);
  // A choice's address (`#economics-assumptions`, `lib/choice-addresses.ts`) lands on the editor open, so the place
  // that asked can be answered here; an editable page only.
  useRevealOnHash(
    (id) => editable && id === 'economics-assumptions',
    () => setEditOpen(true),
  );
  const [editingOptions, setEditingOptions] = useState<ReadonlySet<string>>(() => new Set());
  const [folds, setFolds] = useState<{ firm: boolean; effort: boolean; how: boolean; model: boolean }>({
    firm: false,
    effort: false,
    how: false,
    model: false,
  });
  // A facet's link (`#economics-firm`, `#economics-effort`) lands on its fold open.
  useRevealOnHash(
    (id) => id === 'economics-firm' || id === 'economics-effort' || id === 'economics-how',
    (id) => setFolds((f) => ({ ...f, [id.replace('economics-', '')]: true })),
  );

  const pending = pendingProposals(a.options, proposals);
  const ans = useMemo(() => economicsAnswer(a, comparison, pending.length), [a, comparison, pending.length]);
  const firmness = useMemo(() => howFirm(a, ans), [a, ans]);
  const priced = ans.state === 'priced';
  const cur = a.currency;
  const years = yearsWords(a.horizonYears);
  const anyProposalTaken = a.options.some((o) => o.effortSource === 'proposal-confirmed');
  // 3.5.1 (ADR-144): what one click would fill, and what is a typical value now.
  const fill = typicalFill(a, proposals);
  const canFill = editable && (fill.shared.length > 0 || Object.keys(fill.options).length > 0);
  const typicalNow = usesTypical(a);
  const typicalWords = typicalInWords(a);
  const typicalShared = new Set(a.typical ?? []);
  const allTypical = SHARED_FIGURES.every((f) => typicalShared.has(f));
  // A change the reader makes in place is theirs: the field it touches loses its typical mark.
  const patchShared = (p: Partial<CostAssumptions>) => onPatch(withReaderPatch(a, p));
  const patchOptionAsReader = (id: string, p: Partial<CostOption>) =>
    onPatchOption(id, withReaderOptionPatch(a.options.find((o) => o.id === id), p));
  const useTypical = () => onPatch(typicalPatch(a, proposals));

  const toggleOption = (id: string) =>
    setEditingOptions((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const focusField = (field: string) =>
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-cost-field="${field}"]`);
      const control = el?.matches('input') ? (el as HTMLInputElement) : el?.querySelector<HTMLInputElement>('input');
      el?.scrollIntoView({ block: 'center' });
      control?.focus({ preventScroll: true });
    }, 0);
  const openEdit = () => {
    setEditOpen(true);
    window.setTimeout(() => {
      const box = document.getElementById('economics-assumptions');
      const empty = Array.from(box?.querySelectorAll<HTMLInputElement>('input:not([type=checkbox])') ?? []).find((i) => i.value === '');
      (empty ?? box?.querySelector<HTMLInputElement>('input'))?.focus();
    }, 0);
  };
  // One patch for every option: a caller that patches from the value it was handed (the demo) would otherwise keep
  // only the last option of a loop of single patches.
  const takeOverAll = () => {
    const open = new Set(pending.map((o) => o.id));
    onPatch({ options: a.options.map((o) => (open.has(o.id) ? { ...o, ...takeOverPatch(o, proposals) } : o)) });
  };
  const openFold = (key: 'firm' | 'effort' | 'how' | 'model') => setFolds((f) => ({ ...f, [key]: true }));

  /* ------------------------------------------------------------ the answer */
  const fromLines = loc !== null ? ` proposed from the ${formatLines(loc)} lines` : '';
  const answer = priced ? answerSentence(ans) : notPricedSentence(ans, pending.length > 0 ? loc : null);
  const condition = priced
    ? typicalNow
      ? `A simulation ${allTypical ? 'on typical assumptions' : 'partly on typical assumptions'}, not your own figures. Change any of them in place. Lowest cost is not the decision by itself.`
      : `A simulation on your figures${anyProposalTaken ? ` and on the effort${fromLines}` : ''}. Lowest cost is not the decision by itself; that is taken in Re-design.`
    : ans.state === 'first-visit'
      ? 'Nothing has a default. Use typical assumptions to see the options priced now, or state your own figures.'
      : 'Nothing has a default. Every amount is priced from figures you state, take over or fill with typical assumptions.';

  const typicalButton = (variant: 'primary' | 'secondary') => (
    <CcButton variant={variant} data-economics-use-typical="" data-economics-next-action="" onClick={useTypical}>
      Use typical assumptions
    </CcButton>
  );
  const takeOverButton = (variant: 'primary' | 'secondary') => (
    <CcButton variant={variant} data-economics-next-action="" data-economics-take-over-all="" onClick={takeOverAll}>
      {pending.length > 1 ? `Take over all ${pending.length} proposals` : 'Take over the proposal'}
    </CcButton>
  );
  const ownFiguresButton = (
    <CcButton data-economics-own-figures="" onClick={openEdit}>
      Enter my own figures
    </CcButton>
  );
  const typicalNote = 'Fills only what is missing, with typical values marked as such. Change any of them in place.';

  let action: React.ReactNode = null;
  let actionNote: React.ReactNode = null;
  let moreActions: React.ReactNode = null;
  if (priced) {
    action = props.managementHref ? (
      <CcLinkButton href={props.managementHref} variant="primary" data-economics-decide="">
        Decide in Re-design
      </CcLinkButton>
    ) : null;
    actionNote = (
      <>
        Then{' '}
        {props.designHref ? (
          <a href={props.designHref} data-economics-design-link="" className="font-semibold text-cc-ink underline underline-offset-2">
            Design
          </a>
        ) : (
          'Design'
        )}
        , for whichever option is decided.
      </>
    );
    moreActions = editable ? (
      <CcButton data-economics-change-figures="" onClick={openEdit}>
        {typicalNow ? 'Change the assumptions' : 'Change your figures'}
      </CcButton>
    ) : null;
  } else if (editable) {
    if (fill.shared.length > 0) {
      // Shared figures missing: one click fills them and every open effort.
      action = typicalButton('primary');
      actionNote = typicalNote;
      moreActions = ownFiguresButton;
    } else if (ans.missing.length > 0) {
      // Only a cadence typed and not confirmed: the reader's own figure, confirmed by them.
      action = (
        <CcButton variant="primary" data-economics-next-action="" onClick={openEdit}>
          State your figures
        </CcButton>
      );
    } else if (pending.length > 0) {
      action = takeOverButton('primary');
      moreActions = canFill ? typicalButton('secondary') : null;
    } else {
      action = (
        <CcButton variant="primary" data-economics-next-action="" onClick={() => openFold('effort')}>
          Fill in the effort
        </CcButton>
      );
      moreActions = canFill ? typicalButton('secondary') : null;
    }
  }

  // ECO-N6 (ADR-128 (7)): "Fill with AI proposals" stands here once its wording has passed the lawyer.
  const after = ans.state === 'first-visit' && editable && props.aiProposals ? <div className="mt-2">{props.aiProposals}</div> : null;

  /* ------------------------------------------------------------ the facets */
  const keepTotal = ans.keep?.total ?? null;
  // A facet's figure does not wrap (the family's rule); a money range on a phone's two columns would run out of its
  // column, so it may break after the currency code — and only there or at a space.
  const fig = (text: string | null | undefined) => <span className="whitespace-normal">{text}</span>;
  const nd = (why: string): Pick<FacetProps, 'value' | 'note'> => ({ value: fig('Not determined'), note: why });
  const optionFacet = (c: CostComparison, refusalWord: string): Pick<FacetProps, 'value' | 'note' | 'label'> => {
    const w = c.winner ? c.costs.find((x) => x.optionId === c.winner) : null;
    if (w && w.total) {
      const cond = OPTION_CONDITION[w.kind];
      const isKeep = w.kind === 'do-nothing' || w.kind === 'keep';
      const diff = !isKeep && keepTotal ? differenceToKeeping(keepTotal, w.total) : null;
      return {
        label: w.label,
        value: fig(formatMoneyRangeOutward(w.total, cur)),
        note: [
          diff && diff.kind === 'less' ? `${formatMoneyRangeOutward({ low: diff.low, high: diff.high }, cur)?.replace(/^about /, '')} less than keeping.` : null,
          cond ? `Only ${cond}.` : null,
        ]
          .filter(Boolean)
          .join(' '),
      };
    }
    return { label: null, value: fig(refusalWord), note: `${overlapWords(c, cur)}.` };
  };
  const keepsFacet = priced ? optionFacet(ans.keeps, 'No cheapest one') : null;
  const allFacet = priced ? optionFacet(ans.all, 'No cheapest option') : null;

  const chips: Array<{ key: string; ok: boolean; text: string; missing: string; typical: boolean }> = [
    { key: 'currency', ok: Boolean(cur), text: cur, missing: 'Currency', typical: typicalShared.has('currency') },
    {
      key: 'dev-day-rate',
      ok: a.devDayRate !== null,
      text: `Developer ${cur ? formatMoney(a.devDayRate, cur) : formatNumber(a.devDayRate)}`,
      missing: 'Developer day',
      typical: typicalShared.has('devDayRate'),
    },
    {
      key: 'test-day-rate',
      ok: a.testDayRate !== null,
      text: `Key user ${cur ? formatMoney(a.testDayRate, cur) : formatNumber(a.testDayRate)}`,
      missing: 'Key-user day',
      typical: typicalShared.has('testDayRate'),
    },
    { key: 'horizon-years', ok: a.horizonYears !== null, text: years, missing: 'Period', typical: typicalShared.has('horizonYears') },
    {
      key: 'release-cadence',
      ok: Boolean(a.releaseCadence),
      text: a.releaseCadence
        ? `${formatNumber(a.releaseCadence.perYear, { maximumFractionDigits: 2 })} release${a.releaseCadence.perYear === 1 ? '' : 's'} a year${a.releaseCadence.confirmed ? '' : ' (confirm)'}`
        : '',
      missing: 'Releases a year',
      typical: typicalShared.has('releaseCadence'),
    },
  ];
  const chipRow = (
    <span className="mt-1 flex flex-wrap gap-2 whitespace-normal" data-economics-assumption-chips="">
      {chips.map((c) => (
        <span
          key={c.key}
          data-economics-assumption={c.key}
          data-economics-assumption-state={c.ok ? (c.typical ? 'typical' : 'stated') : 'missing'}
          title={c.ok && c.typical ? 'A typical assumption, not your figure' : undefined}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] leading-5 font-semibold tracking-normal',
            c.ok && !c.typical
              ? 'border-cc-line bg-cc-surface text-cc-ink'
              : c.ok
                ? 'border-dashed border-cc-warning bg-cc-surface text-cc-ink'
                : 'border-dashed border-cc-field-border bg-cc-surface text-cc-ink-muted',
          )}
        >
          {c.ok ? c.text : c.missing}
          {c.ok && c.typical ? <span className="sr-only"> (typical assumption)</span> : null}
          {editable ? <Pencil size={12} aria-hidden={true} className="shrink-0 text-cc-ink-muted" /> : null}
        </span>
      ))}
    </span>
  );

  const facets: FacetProps[] = [
    {
      id: 'keep',
      label: 'Cost of keeping it',
      ...(priced && keepTotal
        ? {
            value: fig(formatMoneyRangeOutward(keepTotal, cur)?.replace(/^about /, '')),
            note: `over ${years} · ${formatNumber(ans.keep?.releasesInHorizon ?? null, { maximumFractionDigits: 1 })} releases and yearly upkeep. A deferred upgrade is not priced.`,
          }
        : nd(ans.missing.length > 0 ? 'Needs your rates.' : 'Needs your go on the proposal.')),
      href: `#${ids.range}`,
    },
    {
      id: 'keeps',
      label: (
        <>
          Cheapest that keeps what it does
          {keepsFacet?.label ? <b className="basis-full font-semibold text-cc-ink">{keepsFacet.label}</b> : null}
        </>
      ),
      ...(keepsFacet ? { value: keepsFacet.value, note: keepsFacet.note } : nd('Needs the same figures.')),
      href: `#${ids.options}`,
    },
    {
      id: 'lowest',
      label: (
        <>
          Lowest overall
          {allFacet?.label ? <b className="basis-full font-semibold text-cc-ink">{allFacet.label}</b> : null}
        </>
      ),
      ...(allFacet
        ? {
            value: allFacet.value,
            note: [
              allFacet.note,
              ans.all.winner
                ? firmness.tone === 'firm'
                  ? 'Holds at any day rate, period or cadence.'
                  : firmness.rows.some((r) => r.edge && (r.field === 'devDayRate' || r.field === 'testDayRate'))
                    ? 'See \u201cHow firm is the answer?\u201d.'
                    : 'Holds at any day rate; see \u201cHow firm is the answer?\u201d.'
                : null,
            ]
              .filter(Boolean)
              .join(' '),
          }
        : nd('Needs the same figures.')),
      href: `#${ids.firm}`,
    },
    {
      id: 'assumptions',
      label: typicalNow ? 'Assumptions' : 'Your assumptions',
      value: chipRow,
      note: typicalNow
        ? editable
          ? 'Dashed: a typical assumption, not your figure. Click to change one; every figure moves.'
          : 'Dashed: a typical assumption, not the owner’s figure. Read-only.'
        : priced
          ? editable
            ? 'Your figures. Click to change one; every figure moves.'
            : 'The owner’s figures, read-only.'
          : 'Nothing has a default.',
      ...(editable ? { onClick: openEdit } : {}),
    },
  ];

  /* ------------------------------------------------------------ the in-place editor */
  // In the page while closed (hidden), so a figure half-typed is not thrown away and a field can be reached by name.
  const editor = editable ? (
      <div
        id="economics-assumptions"
        data-economics-assumptions={editOpen ? 'open' : 'closed'}
        data-economics-checklist=""
        hidden={!editOpen}
        className="-mx-5 border-t border-cc-line bg-cc-surface-muted px-5 py-4 max-[720px]:-mx-4 max-[720px]:px-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <TypicalMark on={typicalShared.has('currency')} why={TYPICAL_SHARED.currency.why}>
            <CurrencyField currency={cur} onChange={(c) => patchShared({ currency: c })} />
          </TypicalMark>
          <TypicalMark on={typicalShared.has('devDayRate')} why={TYPICAL_SHARED.devDayRate.why}>
            <FigureField
              label="Developer day"
              hint={RATES_HELP.devRate}
              kind="rate"
              value={a.devDayRate}
              onChange={(v) => patchShared({ devDayRate: v })}
              prefix={cur || undefined}
              suffix="/ day"
              data={{ 'data-cost-field': 'dev-day-rate' }}
            />
          </TypicalMark>
          <TypicalMark on={typicalShared.has('testDayRate')} why={TYPICAL_SHARED.testDayRate.why}>
            <FigureField
              label="Key-user day"
              hint={RATES_HELP.testRate}
              kind="rate"
              value={a.testDayRate}
              onChange={(v) => patchShared({ testDayRate: v })}
              prefix={cur || undefined}
              suffix="/ day"
              data={{ 'data-cost-field': 'test-day-rate' }}
            />
          </TypicalMark>
          <TypicalMark on={typicalShared.has('horizonYears')} why={TYPICAL_SHARED.horizonYears.why}>
            <FigureField
              label="Compare over"
              hint={RATES_HELP.horizon}
              kind="horizon"
              value={a.horizonYears}
              onChange={(v) => patchShared({ horizonYears: v })}
              suffix="years"
              data={{ 'data-cost-field': 'horizon-years' }}
            />
          </TypicalMark>
          <TypicalMark on={typicalShared.has('releaseCadence')} why={TYPICAL_SHARED.releasesPerYear.why}>
            <CadenceField
              perYear={a.releaseCadence?.perYear ?? null}
              confirmed={a.releaseCadence?.confirmed ?? false}
              onPerYear={(v) => patchShared({ releaseCadence: v === null ? null : { perYear: v, confirmed: false } })}
              onConfirmed={(checked) => (a.releaseCadence ? patchShared({ releaseCadence: { ...a.releaseCadence, confirmed: checked } }) : undefined)}
            />
          </TypicalMark>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 cc-text-meta text-cc-ink-muted">
          <span className="flex flex-wrap items-center gap-2">
            {typicalNow
              ? 'A figure marked typical is not yours until you change it. Every figure on the page moves as you type.'
              : 'Every figure on the page moves as you type. Saved with the project, never part of the signed run.'}
            {props.ratesSave ?? null}
          </span>
          <CcButton data-economics-assumptions-done="" onClick={() => setEditOpen(false)}>
            Done
          </CcButton>
        </div>
      </div>
    ) : null;

  /* ------------------------------------------------------------ the page */
  const anchors = economicsAnchors({ model: Boolean(props.modelView) });
  const proposalFor = (o: CostOption) => (o.kind === 'keyuser' ? null : effortProposalFor(proposals.effort, o.kind));
  const proposed = proposedDaysOf(a.options, proposalFor, proposals.baseline?.perYear ?? null);
  const effortSummary =
    pending.length > 0
      ? 'Proposals waiting for your go'
      : a.options.some((o) => (o.typical ?? []).length > 0)
        ? 'Typical assumptions, yours to change'
        : a.options.every((o) => o.oneOff || o.perRelease)
          ? 'Yours to change'
          : 'Not every option has its effort yet';

  return (
    <div data-economics-page={ans.state} className="flex min-w-0 flex-col">
      {props.strips ? <div className="mb-4 flex flex-col gap-3">{props.strips}</div> : null}

      <AnswerCard
        id="economics-answer"
        question={`What would each choice cost over ${years}?`}
        chips={priced ? <FamilyChip kind="simulation" title="Computed on assumptions you entered." /> : null}
        answer={<span data-economics-answer="">{answer}</span>}
        condition={condition}
        after={after}
        action={action}
        actionNote={actionNote}
        moreActions={moreActions}
        facets={facets}
      >
        {editor}
      </AnswerCard>

      <PageAnchorBar
        anchors={anchors}
        label={PAGE_ANCHOR_LABELS.economics}
        name="economics-anchor"
        plural="economics-anchors"
        onJump={(_e, anchor) => {
          if (anchor.key === 'firm' || anchor.key === 'effort' || anchor.key === 'how' || anchor.key === 'model') openFold(anchor.key);
        }}
      />

      <section id="economics-range" aria-labelledby="economics-range-title" className={SECTION}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="economics-range-title" className="m-0 cc-text-h3 text-cc-ink">
            Cost of each choice over {years}, as a range
          </h2>
          <span className="cc-text-meta text-cc-ink-muted">
            The width of a bar is the uncertainty of the one-off effort. Keep has no one-off effort, so it is a point.
          </span>
        </div>
        <CostRangeChart
          comparison={comparison}
          options={a.options}
          currency={cur}
          years={a.horizonYears}
          priced={priced}
          proposed={proposed}
          lines={loc}
        />
      </section>

      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" data-economics-body="">
        <div className="flex min-w-0 flex-col gap-6">
          <section id="economics-compare" aria-labelledby="economics-compare-title" className={SECTION}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="economics-compare-title" className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
                  Options compared <FamilyChip kind="simulation" />
                </h2>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  The four answers to the program decision, priced from one set of {typicalNow ? 'assumptions' : 'your figures'}. The days
                  behind every amount are under &ldquo;Effort in days&rdquo; further down.
                </p>
              </div>
              <span className="cc-no-print">
                <CcButton icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
                  Print the comparison
                </CcButton>
              </span>
            </div>
            <OptionsTable answer={ans} options={a.options} />
          </section>

          <SectionFold
            id="economics-firm"
            title="How firm is the answer?"
            summary={!priced ? 'Once every option is priced' : firmness.tone === 'firm' ? 'Firm at any value' : firmness.tone === 'edge' ? 'Firm, with one limit' : 'No option is clearly ahead'}
            open={folds.firm}
            onOpenChange={(open) => setFolds((f) => ({ ...f, firm: open }))}
            data={{ 'data-economics-firm': '' }}
          >
            <p className="m-0 mb-3 cc-text-cell text-cc-ink-muted">
              {typicalNow ? 'The assumptions are estimates, some of them typical values.' : 'Your figures are estimates.'} This shows which of
              them could change the order of the options if they were wrong, and how wrong they would have to be.
            </p>
            <HowFirm firmness={firmness} priced={priced} />
          </SectionFold>

          <SectionFold
            id="economics-effort"
            title="Effort in days"
            summary={effortSummary}
            open={folds.effort}
            onOpenChange={(open) => setFolds((f) => ({ ...f, effort: open }))}
            data={{ 'data-economics-effort': '' }}
          >
              <div className="flex flex-col gap-3 pt-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="m-0 max-w-[60rem] cc-text-cell text-cc-ink-muted">
                    {loc !== null
                      ? `Proposed from the ${formatLines(loc)} lines with fixed factors per 1,000 lines that nothing measured. A proposal counts only once you take it over. Change any figure here and it becomes yours; every amount above moves with it.`
                      : 'There is no line count to propose from: every figure here is yours. Every amount above moves with it.'}
                  </p>
                  {props.effortSave ? <span className="cc-no-print">{props.effortSave}</span> : null}
                  {editable && pending.length > 1 ? (
                    <span className="cc-no-print">
                      <CcButton variant="secondary" data-economics-take-over-all="" onClick={takeOverAll}>
                        Take over all {pending.length} proposals
                      </CcButton>
                    </span>
                  ) : null}
                </div>
                {props.keyUserEffort ?? null}
                <fieldset disabled={!editable} className="m-0 min-w-0 border-0 p-0" data-economics-editable={editable ? 'true' : 'false'}>
                  <OptionComparison
                    assumptions={a}
                    comparison={comparison}
                    proposal={proposals.effort}
                    baselineProposal={proposals.baseline}
                    onPatchOption={patchOptionAsReader}
                    editing={editingOptions}
                    onToggleEdit={toggleOption}
                    onOpenEdit={(id, field) => {
                      setEditingOptions((s) => (s.has(id) ? s : new Set(s).add(id)));
                      focusField(field);
                    }}
                    onGoToField={(field) => {
                      setEditOpen(true);
                      focusField(field);
                    }}
                    loc={loc ?? undefined}
                    sourceLoc={sourceLoc}
                    saveStatus={props.optionSaveStatus}
                  />
                </fieldset>
              </div>
          </SectionFold>

          <SectionFold
            id="economics-how"
            title="How it is calculated"
            summary="Factors, formula, what is not priced"
            open={folds.how}
            onOpenChange={(open) => setFolds((f) => ({ ...f, how: open }))}
            data={{ 'data-economics-how': '' }}
          >
            <Method loc={loc} proposals={proposals} revision={comparison.revision} />
          </SectionFold>

          {props.modelView ? (
            <SectionFold
              id="economics-model"
              title="The model's view: business value and action plan"
              chip={<FamilyChip kind="ai" />}
              summary="Written by a language model at the analysis, unchecked. It prices nothing; the costs on this page are yours."
              open={folds.model}
              onOpenChange={(open) => setFolds((f) => ({ ...f, model: open }))}
              data={{ 'data-economics-model': '' }}
            >
              {props.modelView}
            </SectionFold>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="What the figures rest on, and where they go">
          <div className={SIDE}>
            <h2 className="m-0 cc-text-h3 text-cc-ink">What the figures rest on</h2>
            <div className="mt-2">
              <WhatTheFiguresRestOn
                loc={loc}
                sourceLoc={sourceLoc}
                onLoc={props.onLoc}
                editable={editable}
                score={props.score}
                scoreStale={props.scoreStale}
                route={props.route}
                baseline={proposals.baseline}
                factors={
                  pending.length > 0
                    ? 'pending'
                    : a.options.some((o) => (o.typical ?? []).includes('effort'))
                      ? 'typical'
                      : anyProposalTaken
                        ? 'taken'
                        : loc === null
                          ? 'none'
                          : 'taken'
                }
                typical={a.typical ?? []}
                typicalWords={typicalWords}
                saved={props.saved}
                figures={{
                  currency: cur,
                  dev: a.devDayRate,
                  test: a.testDayRate,
                  years: a.horizonYears,
                  cadence: a.releaseCadence?.perYear ?? null,
                }}
              />
            </div>
          </div>
          <div className={SIDE} data-economics-where-next="">
            <h2 className="m-0 cc-text-h3 text-cc-ink">Where this goes</h2>
            <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 cc-text-cell text-cc-ink">
              <li>
                <b className="font-semibold">The decision in Re-design</b>: Keep, Rebuild, Move to SAP standard or Retire. It shows these
                amounts as a simulation and records the assumptions it was priced on, typical ones marked as such.
              </li>
              <li>
                <b className="font-semibold">Next tool: Design</b>, for every option. Design checks its plan against the range priced here
                and says &ldquo;outside the priced range&rdquo; when it leaves it; your figures do not change by themselves.
              </li>
            </ol>
            <p className="m-0 mt-2 cc-text-meta text-cc-ink-muted" data-economics-decision="">
              {props.decisionWords}
            </p>
            {/* Priced, the answer's primary action is this link already; once is enough. */}
            {props.managementHref && !priced ? (
              <div className="mt-2 cc-no-print">
                <CcLinkButton href={props.managementHref}>Open the decision in Re-design</CcLinkButton>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {props.printFooter ?? null}
    </div>
  );
}

/**
 * A shared figure filled by "Use typical assumptions" (3.5.1, ADR-144): the field as always, and under it what the
 * value is and why it is typical. Gone as soon as the reader changes the figure.
 */
function TypicalMark({ on, why, children }: { on: boolean; why: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-economics-typical-field={on ? 'typical' : undefined}>
      {children}
      {on ? (
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 cc-text-meta text-cc-ink-muted">
          <FamilyChip kind="simulation" note="typical assumption" />
          <span>{why}</span>
        </p>
      ) : null}
    </div>
  );
}

/** "How it is calculated" — the formula, the ranges rule, the proposal factors, what is not priced, the revision. */
function Method({ loc, proposals, revision }: { loc: number | null; proposals: OptionProposals; revision: string }) {
  const n = (v: number) => formatDays(v) ?? String(v);
  const kinds: Array<[string, keyof typeof PROPOSED_DAYS_BY_KIND]> = [
    ['Keep', 'do-nothing'],
    ['Rebuild', 'rebuild'],
    ['Move to SAP standard', 'standard'],
    ['Retire', 'retire'],
  ];
  const b = proposals.baseline;
  return (
    <div className="flex flex-col gap-3 pt-2 cc-text-cell text-cc-ink">
      <p className="m-0">
        <b className="font-semibold">The cost of an option</b> is the one-off effort (low and high), plus the effort per release times
        the releases in the period, plus the yearly upkeep for Keep times the years. Every developer day is priced at your developer day
        rate, every test and key-user day at your key-user day rate. Rounded only where it is shown.
      </p>
      <p className="m-0">
        <b className="font-semibold">Ranges stay ranges.</b> An option is the lowest only when its upper bound is below every other
        option&rsquo;s lower bound. In the answer and the chart, amounts are rounded outward to two significant figures (the lower bound
        down, the upper bound up), so a rounded range is never narrower than the computed one; the table shows whole units.
      </p>
      <div>
        <p className="m-0">
          <b className="font-semibold">The proposal</b>: days per 1,000 lines
          {loc !== null ? `, taken from ${formatLines(loc)} lines` : ''}.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="doc-table w-full border-collapse" data-economics-factors="">
            <thead className="border-b border-cc-line">
              <tr className="cc-text-meta font-semibold text-cc-ink-muted">
                <th scope="col" className="px-2 py-1 text-left">Option</th>
                <th scope="col" className="px-2 py-1 text-left">Once, developer</th>
                <th scope="col" className="px-2 py-1 text-left">Once, test</th>
                <th scope="col" className="px-2 py-1 text-left">Per release, developer</th>
                <th scope="col" className="px-2 py-1 text-left">Per release, test</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cc-line tabular-nums">
              {kinds.map(([label, kind]) => {
                const f = PROPOSED_DAYS_BY_KIND[kind];
                const range = (lo: number, hi: number) => (lo === hi ? n(lo) : `${n(lo)}–${n(hi)}`);
                return (
                  <tr key={kind} data-economics-factor={kind}>
                    <th scope="row" className="px-2 py-1 text-left font-normal">{label}</th>
                    <td data-label="Once, developer" className="px-2 py-1">{range(f.oneOffDevLow, f.oneOffDevHigh)}</td>
                    <td data-label="Once, test" className="px-2 py-1">{range(f.oneOffTestLow, f.oneOffTestHigh)}</td>
                    <td data-label="Per release, developer" className="px-2 py-1">{n(f.perReleaseDev)}</td>
                    <td data-label="Per release, test" className="px-2 py-1">{n(f.perReleaseTest)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="m-0">
        <b className="font-semibold">Rebuild and the route.</b> No design is needed to price Rebuild. The proposal is one factor set for
        Rebuild, whatever the route; the route the analysis proposes is shown beside it until Design signs one off. The analysis compares
        the routes in words, not in days, so nothing here prices one route against another.
      </p>
      {b ? (
        <p className="m-0" data-economics-baseline-formula="">
          <b className="font-semibold">Keep&rsquo;s upkeep</b>: {n(b.perYear.devDays)} developer and {n(b.perYear.testDays)} test days a
          year proposed for these lines
          {b.score === null ? ', with no uplift: no Clean Core Score from the signed run' : `, raised for the Clean Core Score of ${b.score} from the signed run: code further from clean core costs more to keep running`}
          .
        </p>
      ) : null}
      <p className="m-0">
        <b className="font-semibold">Not priced:</b> what a deferred upgrade costs Keep (stated, not priced: nothing here knows it),
        licences and run cost of SAP standard or SAP BTP, data migration and archiving unless you put them into the one-off effort, and
        whether SAP standard covers what the program does (functional fit is not measured).
      </p>
      <p className="m-0 cc-text-meta text-cc-ink-muted">
        Assumption revision{' '}
        <code data-cost-revision="" className="font-cc-mono break-all text-cc-ink">
          {revision}
        </code>
        , the technical name the decision records.
      </p>
    </div>
  );
}

/**
 * A section of the page folded under its heading (mock-up: "Effort in days", "How it is calculated", "The model's
 * view"): the heading is the toggle, the line beside it says what is inside while it is closed. The body stays in the
 * page while closed (hidden, printed), so a figure typed in it is never lost and the anchor bar can open it.
 */
function SectionFold({
  id,
  title,
  chip,
  summary,
  open,
  onOpenChange,
  data,
  children,
}: {
  id: string;
  title: string;
  chip?: React.ReactNode;
  summary: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data?: Record<`data-${string}`, string>;
  children: React.ReactNode;
}) {
  const region = `${id}-region`;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={SECTION} data-economics-fold={open ? 'open' : 'closed'} {...data}>
      <h2 id={`${id}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={region}
          data-economics-fold-toggle=""
          onClick={() => onOpenChange(!open)}
          className="flex w-full min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-cc-row text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus"
        >
          <ChevronRight
            size={18}
            aria-hidden={true}
            className={cn('shrink-0 text-cc-ink-muted motion-safe:transition-transform', open && 'rotate-90')}
          />
          <span className="cc-text-h3 text-cc-ink">{title}</span>
          {chip}
          <span className="ml-auto cc-text-meta font-medium text-cc-ink-muted max-[720px]:ml-7 max-[720px]:basis-full">{summary}</span>
        </button>
      </h2>
      <div id={region} role="region" aria-labelledby={`${id}-title`} className={cn('pt-3', !open && 'hidden print:block')}>
        {children}
      </div>
    </section>
  );
}
