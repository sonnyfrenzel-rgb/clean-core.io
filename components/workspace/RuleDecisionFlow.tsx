'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ArrowDown, Check, CircleHelp, Cog, PenLine, Repeat2, Trash2, Building2 } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcDateText from '@/components/cc/DateText';
import CcTextarea from '@/components/cc/Textarea';
import CcSelect from '@/components/cc/Select';
import { CC_SEGMENTED_GROUP, ccSegmentClass } from '@/components/cc/SegmentedControl';
import { CcTag } from '@/components/cc/Tag';
import { cn } from '@/lib/utils';
import { anchorLabel, type SourceReading } from '@/lib/first-look';
import { buildProcessFacts } from '@/lib/abap/process-facts';
import {
  explainBusinessRules,
  RULE_PROPOSAL_LABELS,
  type ExplainedSentence,
  type ImpactLevel,
  type RuleExplanation,
} from '@/lib/abap/business-rule-set-explain';
import {
  RULE_DECISION_KINDS,
  RULE_DECISION_LABELS,
  RULE_DECISION_MEANINGS,
  choiceOf,
  decisionKindOf,
  decisionNeedsNote,
  decisionNeedsSource,
  ruleFlow,
  shownNote,
  startingNote,
  type RuleDecisionKind,
} from '@/lib/rule-decision-flow';
import { MAX_STATE_NOTE, VALUE_SOURCE_KINDS, type ProcessStateView, type StateChoiceInput, type StateEntry, type ValueSourceKind } from '@/lib/process-states';
import { confirmOutcomeSentence, confirmProcessStates, readProcessStatesOutcome, type StatesReadOutcome } from '@/lib/process-states-client';
import { ensureProcessBaseline } from '@/lib/process-revisions-client';
import { publishProcessStates } from '@/hooks/useProcessStates';
import { ruleEntries, type EditorRule } from '@/lib/rules-editor';
import { AsReadFromCode, WordedChip } from './WordedText';
import { usePlainWording } from '@/hooks/usePlainWording';
import AskOnClick from './AskOnClick';
import { PLAIN_ON_CLICK_LABEL } from '@/lib/auto-steps';
import { ARCHITECTURE_OPTIONS_ID, architectureChoice, architectureOptions, technicalKeepChoices } from '@/lib/rule-questions';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { plainModelEnabled, rulePlainSentences, type PlainWordingRecord, type WordedSentence } from '@/lib/plain-wording';
import {
  wt,
  rulesDecidedOf,
  technicalStayAsCoded,
  rulesReadRefusal,
  rulesRecordDecision,
  rulesTakeOver,
  rulesValueSourceLabel,
  rulesWhyEarly,
} from '@/lib/workspace-messages';

/**
 * The business rules as a guided decision — roadmap 3.0.20 "with it", part (2).
 *
 * Owner report 21.10.2026: a flat list of 67 rows with the ABAP beside it and
 * "No answer yet" does not take the business user by the hand. This is the
 * reading mode of the rules card instead: the rules grouped by business topic
 * and ordered by impact, each explained by the engine in plain words — what it
 * protects, an example with values from the code, what happens on either side
 * of its limit, where it applies with the conditions around it — and a
 * proposal with its reason. The answer is one click: *Take over* records the
 * proposal, or one of the other answers is recorded on its own click
 * (ADR-083 (c): rule answers are given per rule and saved at once); an answer
 * that needs words opens its field first. Technical settings are set apart and
 * answered together. (A workshop view beside it was built in 3.0.20 and
 * removed again by owner decision 21.10.2026.)
 *
 * What is stored is unchanged: one need revision per answer through
 * `POST /api/projects/{id}/process-states`, Admin SDK only, with the four
 * states and the value source it already accepts (`lib/rule-decision-flow.ts`).
 * The code stays one fold down on every rule.
 *
 * 3.0.20, owner decisions of 21.10.2026: the card is simple on top — what the
 * rule protects, the example, the proposal and the answers — and complete one
 * fold down: either side of the limit and where it applies, then the code (3).
 * Every sentence is shown in plain business words when a model's rewording of
 * it held the guard, the engine's sentence one fold down (2).
 */

export interface RuleDecisionFlowProps {
  projectId: string;
  source: string;
  reading: SourceReading;
  /** The engine `reading` was made for (`engineVersionOfProject`) — the explanation is read for it too (3.0.20). */
  engineVersion: string | null;
  /** The rules as the editor words them — titles and the code. */
  rules: readonly EditorRule[];
  outcome: StatesReadOutcome | null;
  view: ProcessStateView | null;
  owner: boolean;
  reload: () => Promise<void> | void;
  /** Shown instead when the explanation cannot be written — the plain list of rules. */
  fallback?: React.ReactNode;
  /** A stored plain wording handed in without a fetch (a rendered test). */
  plainWording?: PlainWordingRecord | null;
  /**
   * Show the architecture options for IT under the rules — where a value the
   * business answered lives in the new solution (owner decision 22.10.2026:
   * taken here, in the rule register of the IT view, not in Design).
   */
  withArchitectureOptions?: boolean;
}

const DECISION_ICON: Record<RuleDecisionKind, React.ReactNode> = {
  keep: <Check size={14} aria-hidden={true} />,
  configure: <Cog size={14} aria-hidden={true} />,
  standard: <Building2 size={14} aria-hidden={true} />,
  'change-value': <Repeat2 size={14} aria-hidden={true} />,
  drop: <Trash2 size={14} aria-hidden={true} />,
  clarify: <CircleHelp size={14} aria-hidden={true} />,
};

const IMPACT_WORD: Record<ImpactLevel, 'rules.impactHigh' | 'rules.impactMedium' | 'rules.impactLow'> = {
  high: 'rules.impactHigh',
  medium: 'rules.impactMedium',
  low: 'rules.impactLow',
};

type Say = (text: string, anchor: { lineStart: number; lineEnd: number } | null) => WordedSentence;

/** One sentence — in plain words when a rewording held — and the first of its lines. */
function Said({ sentence, mark, say }: { sentence: ExplainedSentence; mark: string; say: Say }) {
  const first = sentence.anchors[0];
  const said = say(sentence.text, first ?? null);
  return (
    <p data-rule-said={mark} data-rule-worded={said.worded ? 'yes' : 'no'} className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
      {said.text}{' '}
      {first ? (
        <CcAnchor tone="unlinked" label={`${wt('rules.sourceLine')} ${anchorLabel(first.lineStart, first.lineEnd)}`}>
          {anchorLabel(first.lineStart, first.lineEnd)}
        </CcAnchor>
      ) : null}
      <WordedChip said={said} />
    </p>
  );
}

function Part({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{label}</span>
      {children}
    </div>
  );
}

interface CardProps {
  rule: EditorRule;
  explanation: RuleExplanation;
  entry: StateEntry | undefined;
  owner: boolean;
  busy: boolean;
  error: string | null;
  onRecord: (choices: StateChoiceInput[]) => void;
  say: Say;
}

/** One rule: explained, proposed, answered. */
function RuleCard({ rule, explanation: e, entry, owner, busy, error, onRecord, say }: CardProps) {
  const decided = decisionKindOf(entry);
  const [chosen, setChosen] = useState<RuleDecisionKind | null>(null);
  const [note, setNote] = useState('');
  const [sourceKind, setSourceKind] = useState<ValueSourceKind | ''>('business-requirement');
  const proposalLabel = RULE_PROPOSAL_LABELS[e.proposal.kind];
  const title = e.headline ?? rule.title;
  const open = decided === null || decided === 'clarify';

  const pick = (kind: RuleDecisionKind) => {
    if (decisionNeedsNote(kind)) {
      setChosen(kind);
      setNote(startingNote(kind, e));
      return;
    }
    setChosen(null);
    onRecord([choiceOf(rule.id, kind, '')]);
  };
  const takeOver = () => {
    const kind = e.proposal.kind;
    const starting = startingNote(kind, e);
    if (decisionNeedsNote(kind) && !starting) {
      setChosen(kind);
      setNote('');
      return;
    }
    onRecord([choiceOf(rule.id, kind, starting)]);
  };
  const missing = chosen !== null && decisionNeedsNote(chosen) && note.trim() === '';

  return (
    <li
      id={`rule-${rule.id}`}
      data-rule={rule.id}
      data-rule-answered={open ? 'no' : 'yes'}
      data-rule-impact={e.impact.level}
      data-rule-proposal={e.proposal.kind}
      className={cn(
        'flex min-w-0 scroll-mt-24 flex-col gap-3 rounded-cc-card border bg-cc-surface p-3 sm:p-4',
        open ? 'border-cc-line border-l-4 border-l-cc-warning-line' : 'border-cc-line',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span data-rule-title="" className="text-[14px] font-bold break-words text-cc-ink">
            {title}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{rule.id}</code>
            <CcTag>{e.basket.kind === 'undetermined' ? wt('questions.undeterminedTag') : e.technical || e.basket.kind === 'technical' ? wt('rules.technicalNote') : wt(IMPACT_WORD[e.impact.level])}</CcTag>
            {e.impact.reasons.length && !e.technical && e.basket.kind === 'business' ? (
              <span className="text-[12px] font-medium text-cc-ink-muted">{rulesWhyEarly(e.impact.reasons)}</span>
            ) : null}
          </span>
        </div>
        {decided ? (
          <span data-rule-record={decided} className="flex flex-col items-start gap-1 sm:items-end">
            <span className="flex flex-wrap items-center gap-2">
              {decided === 'clarify' ? <CcProvenanceChip value="not-determined" /> : <CcProvenanceChip value="confirmed" note={entry?.account.name} />}
              <span className="text-[12px] font-semibold text-cc-ink">{RULE_DECISION_LABELS[decided]}</span>
              {entry ? (
                <span className="text-[12px] font-medium text-cc-ink-muted">
                  <CcDateText value={entry.confirmedAt} format="text" />
                </span>
              ) : null}
            </span>
            {shownNote(entry?.note) ? <span className="max-w-md text-[12px] leading-snug font-medium text-cc-ink">{shownNote(entry?.note)}</span> : null}
          </span>
        ) : (
          <span data-rule-record="none" className="flex flex-wrap items-center gap-2">
            <CcProvenanceChip value="reconstructed" />
            <span className="text-[12px] font-semibold text-cc-ink">{wt('rules.noAnswer')}</span>
          </span>
        )}
      </div>

      {e.technical ? <Said sentence={e.technical} mark="technical" say={say} /> : e.basket.kind !== 'business' ? <Said sentence={e.basket.reason} mark="basket" say={say} /> : null}
      <Part label={wt('rules.protects')}>
        <Said sentence={e.protects} mark="protects" say={say} />
      </Part>
      {e.example ? (
        <Part label={wt('rules.example')}>
          <Said sentence={e.example} mark="example" say={say} />
        </Part>
      ) : null}

      <div data-rule-proposal-box="" className="flex min-w-0 flex-col gap-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('rules.proposal')}</span>
          <CcProvenanceChip value="reconstructed" />
          <span className="text-[13px] font-bold text-cc-ink">{proposalLabel}</span>
        </span>
        <Said sentence={e.proposal.reason} mark="proposal" say={say} />
        {owner ? (
          <div className="flex flex-col gap-2">
            {decided !== e.proposal.kind ? (
              <span>
                <CcButton
                  variant="secondary"
                  icon={DECISION_ICON[e.proposal.kind]}
                  busy={busy}
                  onClick={takeOver}
                  data-rule-take-over={rule.id}
                >
                  {rulesTakeOver(proposalLabel)}
                </CcButton>
              </span>
            ) : null}
            <span className="text-[12px] font-semibold text-cc-ink">{wt('rules.otherAnswer')}</span>
            <span role="radiogroup" aria-label={`${wt('rules.decisionFor')} ${title}`} className={`${CC_SEGMENTED_GROUP} flex-wrap self-start`}>
              {RULE_DECISION_KINDS.map((kind) => {
                const selected = (chosen ?? decided) === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={RULE_DECISION_MEANINGS[kind]}
                    disabled={busy}
                    data-rule-decide={kind}
                    data-rule-decide-proposed={kind === e.proposal.kind ? 'yes' : 'no'}
                    onClick={() => pick(kind)}
                    className={ccSegmentClass(selected)}
                  >
                    {DECISION_ICON[kind]}
                    {RULE_DECISION_LABELS[kind]}
                    {kind === e.proposal.kind ? <span className="font-medium opacity-80">· {wt('rules.proposed')}</span> : null}
                  </button>
                );
              })}
            </span>
            {chosen ? (
              <div data-rule-answer-form={chosen} className="flex flex-col gap-2">
                <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{RULE_DECISION_MEANINGS[chosen]}</p>
                <CcTextarea
                  label={
                    chosen === 'change-value'
                      ? wt('rules.newValue')
                      : chosen === 'drop'
                        ? wt('rules.dropReason')
                        : chosen === 'clarify'
                          ? wt('rules.question')
                          : wt('rules.noteOptional')
                  }
                  required={decisionNeedsNote(chosen)}
                  rows={2}
                  maxLength={MAX_STATE_NOTE}
                  value={note}
                  onChange={setNote}
                  help={chosen === 'change-value' ? wt('rules.newValueHelp') : undefined}
                  valueState={missing ? 'information' : undefined}
                />
                {decisionNeedsSource(chosen) ? (
                  <CcSelect<ValueSourceKind>
                    label={wt('rules.sourceNew')}
                    required={true}
                    placeholder={wt('rules.sourcePlaceholder')}
                    value={sourceKind}
                    onChange={setSourceKind}
                    options={VALUE_SOURCE_KINDS.map((kind) => ({ value: kind, label: rulesValueSourceLabel(kind) }))}
                  />
                ) : null}
                <span className="flex flex-wrap gap-2">
                  <CcButton
                    variant="secondary"
                    busy={busy}
                    disabled={missing || (decisionNeedsSource(chosen) && !sourceKind)}
                    onClick={() => onRecord([choiceOf(rule.id, chosen, note, sourceKind || null)])}
                    data-rule-record-answer={chosen}
                  >
                    {rulesRecordDecision(RULE_DECISION_LABELS[chosen])}
                  </CcButton>
                  <CcButton variant="ghost" onClick={() => setChosen(null)}>
                    {wt('rules.discard')}
                  </CcButton>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <CcMessageStrip state="error" announce={true}>
            {error}
          </CcMessageStrip>
        ) : null}
      </div>

      {/* Complete underneath: either side of the limit and where it applies, one fold down. */}
      <div data-rule-more="">
        <CcDisclosure title={wt('rules.sidesAndWhere')}>
          <div className="flex min-w-0 flex-col gap-2">
            {e.sides ? (
              <Part label={wt('rules.sides')}>
                <div className="grid min-w-0 grid-cols-1 gap-1 md:grid-cols-2 md:gap-4">
                  <Said sentence={e.sides.holds} mark="holds" say={say} />
                  <Said sentence={e.sides.otherwise} mark="otherwise" say={say} />
                </div>
              </Part>
            ) : null}
            <Part label={wt('rules.where')}>
              <Said sentence={e.where} mark="where" say={say} />
            </Part>
          </div>
        </CcDisclosure>
      </div>
      <AsReadFromCode
        said={[
          ...(e.technical ? [e.technical] : []),
          e.protects,
          ...(e.example ? [e.example] : []),
          e.proposal.reason,
          ...(e.sides ? [e.sides.holds, e.sides.otherwise] : []),
          e.where,
        ].map((x) => say(x.text, x.anchors[0] ?? null))}
      />

      <CcDisclosure title={wt('rules.theCode')}>
        <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <code className="min-w-0 font-cc-mono text-[12px] font-medium break-all text-cc-ink-muted">{rule.code}</code>
          {rule.anchors.slice(0, 3).map((anchor) => (
            <CcAnchor key={anchor} tone="unlinked" label={`${wt('rules.sourceLine')} ${anchor}`}>
              {anchor}
            </CcAnchor>
          ))}
        </p>
      </CcDisclosure>
    </li>
  );
}

export default function RuleDecisionFlow({
  projectId,
  source,
  reading,
  engineVersion,
  rules,
  outcome,
  view,
  owner,
  reload,
  fallback = null,
  plainWording,
  withArchitectureOptions = false,
}: RuleDecisionFlowProps) {
  const explanation = useMemo(() => {
    try {
      return explainBusinessRules(source, reading.ruleSet, buildProcessFacts(source), engineVersion);
    } catch {
      return null;
    }
  }, [source, reading, engineVersion]);
  const entries = useMemo(() => ruleEntries(view), [view]);
  const flow = useMemo(() => (explanation ? ruleFlow(explanation, entries) : null), [explanation, entries]);
  const options = useMemo(() => (explanation && withArchitectureOptions ? architectureOptions(explanation, entries) : []), [explanation, entries, withArchitectureOptions]);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [recorded, setRecorded] = useState(false);
  const [openTopics, setOpenTopics] = useState<ReadonlySet<string> | null>(null);
  const availability = useModelAvailability();
  const ruleSentences = useMemo(() => (explanation ? rulePlainSentences(explanation) : null), [explanation]);
  const wording = usePlainWording({
    projectId,
    scope: 'rules',
    source,
    sentences: ruleSentences,
    owner,
    active: explanation !== null,
    modelEnabled: plainModelEnabled(availability),
    autoAllowed: availability.autoSteps,
    initial: plainWording ?? null,
  });
  const say: Say = wording.say;

  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const explained = useMemo(() => new Map((explanation?.rules ?? []).map((r) => [r.id, r])), [explanation]);

  const record = useCallback(
    async (choices: StateChoiceInput[]) => {
      const ids = choices.map((c) => c.subject);
      setBusy(new Set(ids));
      setRecorded(false);
      setErrors((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      const fail = (text: string) => setErrors((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, text])) }));
      try {
        let revision = view?.revision ?? null;
        if (revision === null) {
          // Revision 1 — the reconstructed process — exists only once the server
          // has rebuilt it from the signed run; asking for it is the same call the
          // process map makes on open, and it never rebuilds an existing one.
          if (!outcome || outcome.ok || outcome.code !== 'no-baseline') {
            fail(rulesReadRefusal(outcome && !outcome.ok ? outcome.code : 'unreachable') || wt('rules.noBaseline'));
            return;
          }
          const built = await ensureProcessBaseline(projectId);
          const fresh = built.ok ? await readProcessStatesOutcome(projectId) : null;
          if (!fresh || !fresh.ok) {
            fail(wt('rules.noBaseline'));
            return;
          }
          publishProcessStates(projectId, fresh.view);
          revision = fresh.view.revision;
        }
        const result = await confirmProcessStates(projectId, revision, choices);
        if (result.ok) {
          publishProcessStates(projectId, result.view);
          setRecorded(true);
        } else {
          fail(confirmOutcomeSentence(result));
          if (result.code === 'revision-moved') void reload();
        }
      } finally {
        setBusy(new Set());
      }
    },
    [outcome, projectId, reload, view],
  );

  if (!explanation || !flow) return <>{fallback}</>;

  const isOpen = (topic: string) =>
    openTopics ? openTopics.has(topic) : flow.topics.find((t) => t.rules.some((r) => r.id === flow.next))?.topic === topic;
  const toggle = (topic: string, next: boolean) => {
    const current = new Set<string>(flow.topics.filter((t) => isOpen(t.topic)).map((t) => t.topic));
    if (next) current.add(topic);
    else current.delete(topic);
    setOpenTopics(current);
  };
  const goNext = () => {
    if (!flow.next) return;
    const topic = flow.topics.find((t) => t.rules.some((r) => r.id === flow.next))?.topic;
    if (topic && !isOpen(topic)) toggle(topic, true);
    window.requestAnimationFrame(() => document.getElementById(`rule-${flow.next}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };
  const percent = flow.total ? Math.round((flow.decided / flow.total) * 100) : 0;

  return (
    <div data-rule-flow="" data-decided={flow.decided} data-total={flow.total} className="flex min-w-0 flex-col gap-3">
      <AskOnClick askNow={wording.askNow} label={PLAIN_ON_CLICK_LABEL} />
      <p className="m-0 max-w-3xl text-[13px] leading-snug font-medium text-cc-ink-muted">
        {owner ? wt('rules.flowLead') : wt('rules.flowLeadReader')}
      </p>
      {!owner ? <p className="m-0 text-[12px] font-medium text-cc-ink-muted">{wt('rules.ownerOnly')}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex min-w-[160px] flex-1 items-center gap-2">
          <span
            role="progressbar"
            aria-label={rulesDecidedOf(flow.decided, flow.total)}
            aria-valuemin={0}
            aria-valuemax={flow.total}
            aria-valuenow={flow.decided}
            className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full border border-cc-line bg-cc-surface-muted"
          >
            <span className="block h-full rounded-full bg-cc-ink motion-safe:transition-[width] motion-safe:duration-200" style={{ width: `${percent}%` }} />
          </span>
          <span data-rule-flow-progress="" className="text-[13px] font-bold whitespace-nowrap text-cc-ink">
            {rulesDecidedOf(flow.decided, flow.total)}
          </span>
        </span>
        {flow.next ? (
          <CcButton variant="ghost" icon={<ArrowDown size={16} aria-hidden={true} />} onClick={goNext} data-rule-flow-next="">
            {wt('rules.nextOpen')}
          </CcButton>
        ) : null}
      </div>
      {recorded ? (
        <CcMessageStrip state="success" announce={true}>
          {flow.next ? wt('rules.recorded') : wt('rules.allDecided')}
        </CcMessageStrip>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">
        {flow.topics.map((topic) => (
          <section key={topic.topic} data-rule-topic={topic.topic} data-decided={topic.decided} data-total={topic.total} className="flex min-w-0 flex-col gap-2 border-t border-cc-line pt-3">
            {/* Only the technical rules are "not business decisions"; an undetermined rule may be one — nobody knows yet. */}
            {topic.apart && topic.topic === 'technical' ? (
              <p className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">{wt('rules.apart')}</p>
            ) : null}
            <CcDisclosure
              title={topic.label}
              count={topic.total}
              level={3}
              summary={
                <>
                  {rulesDecidedOf(topic.decided, topic.total)} · {topic.decided === topic.total ? wt('rules.topicDone') : topic.lead}
                </>
              }
              open={isOpen(topic.topic)}
              onOpenChange={(next) => toggle(topic.topic, next)}
            >
              {topic.topic === 'technical' && owner && flow.openTechnical.length > 0 ? (
                <div className="mb-2">
                  <CcButton
                    variant="secondary"
                    icon={<Check size={16} aria-hidden={true} />}
                    busy={flow.openTechnical.some((id) => busy.has(id))}
                    onClick={() => void record(technicalKeepChoices(explanation, entries))}
                    data-rule-keep-technical=""
                  >
                    {technicalStayAsCoded(flow.openTechnical.length)}
                  </CcButton>
                  <p className="m-0 mt-1 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('questions.technicalNote')}</p>
                </div>
              ) : null}
              <ol data-rules-list="" className="m-0 flex list-none flex-col gap-3 p-0">
                {topic.rules.map((r) => {
                  const rule = byId.get(r.id);
                  const e = explained.get(r.id);
                  if (!rule || !e) return null;
                  return (
                    <RuleCard
                      key={r.id}
                      rule={rule}
                      explanation={e}
                      entry={entries[r.id]}
                      owner={owner}
                      busy={busy.has(r.id)}
                      error={errors[r.id] ?? null}
                      onRecord={(choices) => void record(choices)}
                      say={say}
                    />
                  );
                })}
              </ol>
            </CcDisclosure>
          </section>
        ))}
      </div>
      {recorded && flow.next ? (
        <span>
          <CcButton variant="ghost" icon={<PenLine size={16} aria-hidden={true} />} onClick={goNext}>
            {wt('rules.goNext')}
          </CcButton>
        </span>
      ) : null}
      {options.length > 0 ? (
        <section id={ARCHITECTURE_OPTIONS_ID} data-architecture-options="" className="flex min-w-0 scroll-mt-28 flex-col gap-2 border-t border-cc-line pt-3">
          <h3 className="m-0 text-[14px] font-bold text-cc-ink">{wt('questions.architecture')}</h3>
          <p className="m-0 max-w-3xl text-[12px] leading-snug font-medium text-cc-ink-muted">{wt('questions.architectureLead')}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {options.map((o) => {
              const rule = byId.get(o.ruleId);
              return (
                <li key={`${o.ruleId}-${o.kind}`} data-architecture-option={o.kind} data-architecture-rule={o.ruleId} data-architecture-taken={o.taken ? 'yes' : 'no'} className="flex min-w-0 flex-col gap-1 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3">
                  <span className="flex flex-wrap items-center gap-2">
                    {o.kind === 'standard' ? <Building2 size={14} aria-hidden={true} /> : <Cog size={14} aria-hidden={true} />}
                    <span className="text-[13px] font-bold text-cc-ink">{wt(o.kind === 'standard' ? 'questions.optionStandard' : 'questions.optionConfigure')}</span>
                    <span className="text-[12px] font-medium text-cc-ink-muted">{explained.get(o.ruleId)?.headline ?? rule?.title ?? o.ruleId}</span>
                    <CcProvenanceChip value="reconstructed" />
                  </span>
                  <Said sentence={o.reason} say={say} mark="option" />
                  {o.taken ? (
                    <span className="text-[12px] font-semibold text-cc-ink">{wt('questions.optionTaken')}</span>
                  ) : owner ? (
                    <span>
                      <CcButton variant="ghost" busy={busy.has(o.ruleId)} onClick={() => void record([architectureChoice(o, entries[o.ruleId])])} data-architecture-take={o.ruleId}>
                        {wt('questions.takeOption')}
                      </CcButton>
                    </span>
                  ) : null}
                  {errors[o.ruleId] ? (
                    <CcMessageStrip state="error" announce={true}>
                      {errors[o.ruleId]}
                    </CcMessageStrip>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
