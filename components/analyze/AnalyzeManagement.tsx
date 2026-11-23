'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import StageFrame from '@/components/StageFrame';
import StageHeader from '@/components/StageHeader';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar, { type PageAnchor } from '@/components/PageAnchorBar';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import ProjectNoAccess from '@/components/ProjectNoAccess';
import { useProgramDecision } from '@/hooks/useProgramDecision';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useCustomerTexts } from '@/hooks/useCustomerTexts';
import { loadProjectAndHydrate } from '@/lib/project-loader';
import { workflowSteps } from '@/lib/workflow-steps';
import { pricedOptions } from '@/lib/economics-record';
import { scoreBand } from '@/lib/clean-core-score';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { managementInShort, programSummary } from '@/lib/program-summary-text';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { anchorLabel } from '@/lib/first-look';
import { DECISION_OPTION_LABELS } from '@/lib/decision-options';
import { OPTION_SIGNAL_WORDS } from '@/lib/decision-option-signals';
import { REDESIGN_LABEL, redesignHref, redesignModel } from '@/lib/redesign';
import { STEERING_ANCHOR } from '@/lib/steering-open';
import { managementRisks, managementLevelMix, MANAGEMENT_PAGE_IDS } from '@/lib/analyze-management';
import { cn } from '@/lib/utils';
import type { Project } from '@/lib/types';

/**
 * Analyze in the Management view — a page of its own (roadmap 3.5.0 item (2), plan AB-10; owner request 23.11.2026,
 * ADR-143; mock-up `mgmt-view.html`, screen 1; the family frame of ADR-140).
 *
 * The decision is the page's subject and Re-design is its one way on (UX review 22.11.2026, Q7):
 *
 *   - **The answer card**: "Keep, rebuild or retire: what does this program need?", what the program is for in one
 *     sentence (`managementInShort`), what needs a decision, the analysis' *indication* worded "an indication, not a
 *     decision" (plan N1), and **one primary action, "Re-design this program"** → `/project/[id]/redesign`. Four
 *     facets: distance to clean core with the Level A–D mix (UI only, never in the signed pack), cost (Economics'
 *     stored figures read as stored, else "Not priced yet, step 1 of Re-design"; Analyze computes no amount), risk if
 *     nothing changes, what we need from you.
 *   - **"On this page"**: Options · Risk · What we need from you · Still open.
 *   - **The four options** without a tool link; the cost is said once for all four when nothing is priced.
 *   - **The side column**: the way on (Analyze → Re-design), accountability.
 *
 * The decision itself is shown read-only here: it is taken on Re-design, as its step 2, after Economics has priced the
 * options. Nothing is written on this page, and the view is never stored (CLAUDE.md).
 */
export default function AnalyzeManagement({ projectId, fallback }: { projectId: string; fallback: React.ReactNode }) {
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadProjectAndHydrate(projectId);
        if (cancelled) return;
        setProject(loaded);
        setState(loaded ? 'ready' : 'missing');
      } catch (err) {
        if (cancelled) return;
        const code = (err as { code?: unknown } | null)?.code;
        setState(code === 'permission-denied' ? 'missing' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const router = useRouter();
  const program = useProgramDecision(project, projectId);
  const steps = useMemo(() => workflowSteps(project), [project]);
  const way = useMemo(() => redesignModel(steps, program.state), [steps, program.state]);
  const questions = useOpenQuestions(project, projectId);
  const customerTexts = useCustomerTexts(projectId || null);
  const legacyCode = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const engineVersion = engineVersionOfProject(project);

  /** What it is for, and what a decision has to settle — the same words as the workspace's Management view. */
  const inShort = useMemo(() => {
    if (!legacyCode.trim()) return null;
    try {
      const facts = programSummaryFactsOf(legacyCode, { engineVersion, customerTexts });
      const summary = programSummary(facts);
      const purpose = summary.lines.find((l) => l.key === 'purpose')?.text ?? '';
      const full = managementInShort(summary, facts, { level: false });
      const decision = full.startsWith(purpose) ? full.slice(purpose.length).trim() : full;
      return { purpose, decision: decision.replace(/^For the decision:\s*/, '') };
    } catch {
      return null;
    }
  }, [legacyCode, engineVersion, customerTexts]);

  const findingRows = program.findings.state === 'ready' ? program.findings.value.rows : null;
  const levels = useMemo(() => (findingRows ? managementLevelMix(findingRows) : null), [findingRows]);
  const risks = useMemo(() => (findingRows ? managementRisks(findingRows) : null), [findingRows]);

  if (state === 'missing') return <ProjectNoAccess />;
  if (state === 'failed') {
    return (
      <div data-analyze-management="failed" className="max-w-xl py-16">
        <CcMessageStrip
          state="error"
          headline="The project could not be read"
          actions={<CcButton onClick={() => window.location.reload()}>Try again</CcButton>}
        >
          Nothing was changed. Reload the page to read it again.
        </CcMessageStrip>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div data-analyze-management="loading" role="status" className="py-16">
        <CcSkeleton shape="text" count={4} label="Reading the project" />
      </div>
    );
  }
  // No signed run: nothing to decide on yet; today's start path stands (as in the Business view).
  if (!project?.activeRunId) return <>{fallback}</>;

  const base = `/project/${encodeURIComponent(projectId)}`;
  const options = program.options;
  const indicated = options.proposed ? options.cards.find((c) => c.option === options.proposed) ?? null : null;
  const chosen = options.cards.find((c) => c.chosen) ?? null;
  const score = typeof project.cleanCoreScore === 'number' ? project.cleanCoreScore : null;
  const band = score !== null ? scoreBand(score) : null;
  const econ = project._economics ?? null;
  const priced = econ ? pricedOptions(econ) : null;
  const focus = chosen ?? indicated;
  const focusCost = focus && focus.cost.value ? focus.cost.value : null;
  const anyCost = options.cards.some((c) => c.cost.value !== null);

  const needs = questions.groups.filter((g) => g.end === 'open' && g.owner !== 'IT');
  const stillOpen = questions.groups.filter((g) => g.end === 'open' && g.owner === 'IT');
  const decided = chosen !== null && options.stage !== 'not-decided';
  const needCount = needs.length + (decided ? 0 : 1);

  const redesign = redesignHref(projectId);
  const continueLabel =
    way.next && way.next.key !== 'tco' && way.next.key !== 'analyze'
      ? `Continue the re-design: ${way.next.key === 'decide' ? 'decide' : way.steps.find((s) => s.key === way.next?.key)?.label ?? ''}`
      : 'Re-design this program';
  const actionNote =
    way.next && way.next.key === 'tco' ? 'Step 1 of 7: price the options. Not counted against your runs.' : way.next?.note ?? 'Every step of Re-design is on record.';

  const facets: FacetProps[] = [
    {
      id: 'distance',
      label: 'Distance to clean core',
      value: score !== null ? String(score) : 'Not measured',
      unit: band ? `of 100 · ${band.label.toLowerCase()}` : undefined,
      note: levels ? <LevelMix mix={levels} /> : 'Levels A to D are read with the findings.',
      href: `#${MANAGEMENT_PAGE_IDS.options}`,
    },
    focusCost
      ? {
          id: 'cost',
          label: 'Cost',
          chip: <FamilyChip kind="simulation" />,
          value: DECISION_OPTION_LABELS[focus!.option],
          note: focusCost,
          href: `#${MANAGEMENT_PAGE_IDS.options}`,
        }
      : priced
        ? {
            id: 'cost',
            label: 'Cost',
            value: `${priced.priced} of ${priced.total}`,
            unit: 'options priced',
            note: 'In Economics, step 1 of Re-design.',
            href: `#${MANAGEMENT_PAGE_IDS.options}`,
          }
        : {
            id: 'cost',
            label: 'Cost',
            value: 'Not priced yet',
            note: 'Step 1 of Re-design. Analyze computes no amount.',
            href: `#${MANAGEMENT_PAGE_IDS.options}`,
          },
    {
      id: 'risk',
      label: 'Risk if nothing changes',
      value: risks ? String(risks.total) : '…',
      unit: risks ? (risks.total === 1 ? 'serious finding' : 'serious findings') : undefined,
      note: risks?.worst ? `worst: ${risks.worst}` : risks ? 'No critical or high finding.' : 'Reading the findings.',
      href: `#${MANAGEMENT_PAGE_IDS.risk}`,
    },
    {
      id: 'needs',
      label: 'What we need from you',
      value: String(needCount),
      unit: needCount === 1 ? 'action' : 'actions',
      note: decided ? `decided: ${DECISION_OPTION_LABELS[chosen!.option]}` : 'decision not taken',
      href: `#${MANAGEMENT_PAGE_IDS.needs}`,
    },
  ];

  const anchors: PageAnchor[] = [
    { key: 'options', target: MANAGEMENT_PAGE_IDS.options, label: 'Options' },
    { key: 'risk', target: MANAGEMENT_PAGE_IDS.risk, label: 'Risk' },
    { key: 'needs', target: MANAGEMENT_PAGE_IDS.needs, label: 'What we need from you', count: String(needCount), tone: 'open' },
    ...(stillOpen.length > 0
      ? [{ key: 'open', target: MANAGEMENT_PAGE_IDS.open, label: 'Still open', count: String(stillOpen.length), tone: 'open' as const }]
      : []),
  ];

  return (
    <StageFrame stage="analyze" data-analyze-management="ready">
      <StageHeader tools={{ steps, current: 'analyze' }} project={project} stage="analyze">
        What this program is for, what it risks, and what needs deciding.
      </StageHeader>

      <AnswerCard
        id="management-answer"
        question="Keep, rebuild or retire: what does this program need?"
        chips={<FamilyChip kind="engine" />}
        answer={inShort?.purpose || 'What the program is for could not be read from its code.'}
        condition={
          inShort?.decision ? (
            <>
              <span className="font-semibold text-cc-ink">What needs a decision: </span>
              {inShort.decision}
            </>
          ) : null
        }
        action={
          <CcLinkButton href={redesign} variant="primary" data-analyze-management-redesign="">
            {continueLabel}
            <ArrowRight size={16} aria-hidden={true} />
          </CcLinkButton>
        }
        actionNote={actionNote}
        after={
          <div data-analyze-indication="" className="mt-2 max-w-[640px] rounded-cc-card border border-cc-ink bg-cc-surface px-4 py-3">
            <p className="m-0 cc-text-label text-cc-ink-muted">{chosen && decided ? 'Decision' : 'Indication from the analysis'}</p>
            <p className="m-0 mt-1 cc-text-body font-bold text-cc-ink">
              {chosen && decided
                ? options.answer
                : indicated
                  ? indicated.label
                  : 'The evidence does not point to one option yet.'}
            </p>
            {!decided && indicated ? <p className="m-0 mt-1 cc-text-cell text-cc-ink">{indicated.reason}</p> : null}
            <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
              {chosen && decided
                ? options.who ?? 'Recorded by the signed-in account: a self-declaration, not a mandate.'
                : `An indication, not a decision. You decide in ${REDESIGN_LABEL}, after the options are priced.`}
            </p>
          </div>
        }
        facets={facets}
      />

      <PageAnchorBar anchors={anchors} label="On this page" name="management-anchor" plural="management-anchors" />

      <div className="grid grid-cols-1 items-start gap-6 min-[1101px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section id={MANAGEMENT_PAGE_IDS.options} title="The four options" lead="What each one means for this program, and what the evidence says.">
            <div className="mt-3">
              <CcTable
                caption="The four options"
                columns={[
                  { key: 'option', label: 'Option', width: '180px' },
                  { key: 'means', label: 'What it means' },
                  { key: 'evidence', label: 'What the evidence says' },
                  ...(anyCost ? [{ key: 'cost', label: 'Cost, from Economics' }] : []),
                ]}
                rows={options.cards.map((c) => ({
                  key: c.option,
                  emphasis: c.option === options.proposed || c.chosen,
                  cells: {
                    option: (
                      <span data-management-option={c.option} className="flex flex-col">
                        <span className="font-semibold">{c.label}</span>
                        {c.chosen ? (
                          <span className="cc-text-meta text-cc-ink-muted">chosen</span>
                        ) : c.option === options.proposed ? (
                          <span className="cc-text-meta text-cc-ink-muted">indicated</span>
                        ) : null}
                      </span>
                    ),
                    means: c.meaning,
                    evidence: (
                      <span>
                        <span className="font-semibold">{OPTION_SIGNAL_WORDS[c.signal]}</span>: {c.reason}
                      </span>
                    ),
                    ...(anyCost ? { cost: c.cost.value ?? <span className="text-cc-ink-muted">not priced</span> } : {}),
                  },
                }))}
              />
            </div>
            <p data-management-not-priced="" className="m-0 mt-3 cc-text-cell text-cc-ink-muted">
              {anyCost
                ? 'Simulations on your own figures from Economics, not a quote. Analyze computes no amount.'
                : 'Not priced yet: all four options are priced together in step 1 of Re-design. Analyze computes no amount.'}
            </p>
          </Section>

          <Section id={MANAGEMENT_PAGE_IDS.risk} title="Risk if nothing changes" lead="The serious findings of the signed run, grouped by what they are.">
            {risks === null ? (
              <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">{program.findings.state === 'absent' ? program.findings.reason : 'Reading the findings.'}</p>
            ) : risks.groups.length === 0 ? (
              <p className="m-0 mt-3 cc-text-cell text-cc-ink">No critical or high finding in the signed run.</p>
            ) : (
              <ul data-management-risks="" className="m-0 mt-3 list-none p-0">
                {risks.groups.map((g) => (
                  <li key={g.kind} className="border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0 first:pt-0">
                    <span className="font-semibold">{g.label}</span>
                    <span className="text-cc-ink-muted">
                      {' '}
                      · {g.count} {g.count === 1 ? 'place' : 'places'}, {g.severity.toLowerCase()}
                    </span>
                    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                      {g.lines.map((l) => (
                        // The line opens beside the map in the Business view (`#L42`, `lib/analyze-entry.ts`).
                        <CcAnchor
                          key={`${l.start}-${l.end ?? ''}`}
                          label={`Source line ${anchorLabel(l.start, l.end).slice(1)}`}
                          onOpen={() => router.push(`${base}/analyze#${anchorLabel(l.start, l.end)}`)}
                        >
                          {anchorLabel(l.start, l.end)}
                        </CcAnchor>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id={MANAGEMENT_PAGE_IDS.needs} title="What we need from you" lead="Business actions, in order. None of them needs a tool before Re-design starts.">
            <ol data-management-needs="" className="m-0 mt-3 list-none p-0">
              {needs.map((g, i) => (
                <NumberedItem key={g.action} n={i + 1}>
                  <span className="font-semibold">{g.title}</span>. {g.resolves}
                </NumberedItem>
              ))}
              {decided ? null : (
                <NumberedItem n={needs.length + 1}>
                  <span className="font-semibold">Start the re-design.</span> The options get priced, then you take the decision: keep, rebuild, move
                  to SAP standard or retire.
                </NumberedItem>
              )}
              {decided && needs.length === 0 ? (
                <li className="cc-text-cell text-cc-ink">Nothing is waiting for you here. The re-design goes on in its own steps.</li>
              ) : null}
            </ol>
          </Section>

          {stillOpen.length > 0 ? (
            <Section id={MANAGEMENT_PAGE_IDS.open} title="Still open" lead="What IT settles; none of it stops the decision.">
              <ul className="m-0 mt-3 list-none p-0">
                {stillOpen.map((g) => (
                  <li key={g.action} className="border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0 first:pt-0">
                    <span className="font-semibold">{g.title}</span>
                    <span className="text-cc-ink-muted"> · {g.count === 1 ? '1 question' : `${g.count} questions`}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </div>

        <aside aria-label="Beside the page" className="flex min-w-0 flex-col gap-6 min-[1101px]:sticky min-[1101px]:top-24">
          <div data-management-way-on="" className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
            <h2 className="m-0 cc-text-body font-bold text-cc-ink">The way on</h2>
            <ol className="m-0 mt-2 list-none p-0">
              <FlowItem on>
                <span className="font-semibold">Analyze</span>: done, what it does and how far it is from clean core.
              </FlowItem>
              <FlowItem>
                <span className="font-semibold">{REDESIGN_LABEL}</span>: price the options, decide, then build the decided option in six tools.
              </FlowItem>
            </ol>
            <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
              Decision: <span className="font-semibold text-cc-ink">{decided && chosen ? `${chosen.label} (${options.stage === 'confirmed' ? 'confirmed' : 'not confirmed'})` : 'not taken yet'}</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CcLinkButton href={redesign} variant="ghost" data-management-open-redesign="">
                Open {REDESIGN_LABEL}
              </CcLinkButton>
              <CcLinkButton href={`${base}?view=management#${STEERING_ANCHOR}`} variant="ghost" data-management-one-pager="">
                One page for the steering committee
              </CcLinkButton>
            </div>
          </div>
          <div className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-3 shadow-cc">
            <h2 className="m-0 cc-text-body font-bold text-cc-ink">Accountability</h2>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink">
              A decision is recorded by the signed-in account: a self-declaration, not a mandate. The view you read it in is never stored.
            </p>
          </div>
        </aside>
      </div>
    </StageFrame>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="min-w-0 scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface px-5 py-4 shadow-cc max-[720px]:px-4"
    >
      <h2 id={`${id}-h`} tabIndex={-1} className="m-0 cc-text-h2 text-cc-ink">
        {title}
      </h2>
      {lead ? <p className="m-0 mt-1 max-w-[860px] cc-text-cell text-cc-ink-muted">{lead}</p> : null}
      {children}
    </section>
  );
}

function NumberedItem({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-t border-cc-line py-2 cc-text-cell text-cc-ink first:border-t-0 first:pt-0">
      <span aria-hidden={true} className="flex size-6 items-center justify-center rounded-full bg-cc-ink cc-text-meta font-bold text-cc-on-dark">
        {n}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function FlowItem({ on = false, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 py-1 cc-text-cell text-cc-ink">
      <span aria-hidden={true} className={cn('mt-1 size-3 rounded-full border-2', on ? 'border-cc-ink bg-cc-ink' : 'border-cc-ink-muted bg-cc-surface')} />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

const LEVEL_CLASS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'border-cc-success-border bg-cc-success-bg text-cc-success',
  B: 'border-cc-information-border bg-cc-information-bg text-cc-information',
  C: 'border-cc-warning-border bg-cc-warning-bg text-cc-warning',
  D: 'border-cc-error-border bg-cc-error-bg text-cc-error',
};

/** The Level A–D mix of the findings, as four small marks — a reading of SAP's lists, never part of the signed pack. */
function LevelMix({ mix }: { mix: Record<'A' | 'B' | 'C' | 'D', number> }) {
  return (
    <span data-management-levels="" className="flex flex-wrap items-center gap-1" title="Clean core levels A to D of the objects the findings name. Not part of the signed run.">
      {(['A', 'B', 'C', 'D'] as const).map((k) => (
        <span key={k} className={cn('inline-flex items-center rounded-cc-row border px-1 cc-text-meta font-bold', LEVEL_CLASS[k])}>
          {k} {mix[k]}
        </span>
      ))}
    </span>
  );
}
