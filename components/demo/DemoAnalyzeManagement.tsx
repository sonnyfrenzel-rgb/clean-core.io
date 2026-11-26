'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar, { type PageAnchor } from '@/components/PageAnchorBar';
import CcLinkButton from '@/components/cc/LinkButton';
import CcTable from '@/components/cc/Table';
import { FlowItem, LevelMix, NumberedItem, Section } from '@/components/analyze/ManagementParts';
import { scoreBand } from '@/lib/clean-core-score';
import { programSummaryFactsOf } from '@/lib/program-summary-facts';
import { APP_VERSION } from '@/lib/version';
import { managementInShort, programSummary } from '@/lib/program-summary-text';
import { anchorLabel } from '@/lib/first-look';
import { decisionOptionsView, OPTION_SIGNAL_WORDS } from '@/lib/decision-option-signals';
import { standardFit } from '@/lib/standard-fit';
import { executiveSubject } from '@/lib/management-executive';
import { managementLevelMix, managementRisks, MANAGEMENT_PAGE_IDS } from '@/lib/analyze-management';
import { demoRedesignHref, REDESIGN_LABEL } from '@/lib/redesign';
import { DEMO_ANALYZE_ROUTE, DEMO_OBJECT_NAME, DEMO_UNSIGNED_NOTICE } from '@/lib/demo-marks';
import type { DemoProject } from '@/lib/demo-project';
import type { ItFindingsSource } from '@/lib/it-findings';

/** The header's lead in the demo's Management view — the project's own words (`AnalyzeManagement`). */
export const DEMO_MANAGEMENT_LEAD = 'What this program is for, what it risks, and what needs deciding.';

/**
 * The demo's Analyze in the Management view (owner go 26.11.2026, Q8): the management answer a project's Analyze
 * shows in that view (`components/analyze/AnalyzeManagement.tsx`, ADR-143), built from the demo's own data — the
 * example's source, the engine's findings that arrive with the page — instead of a copy of the IT view.
 *
 * What a demo has not: a signed run and a decision record. So the four options carry the demo's own "not determined"
 * reason (`decisionOptionsView`, mode `demo`), nothing is priced, nothing is indicated, and nothing is written. No
 * Firestore, no model, no route that signs, charges or stores: everything below is computed in the browser from props.
 */
export default function DemoAnalyzeManagement({
  demo,
  source,
  itFindings,
}: {
  demo: DemoProject;
  source: string;
  itFindings: ItFindingsSource;
}) {
  const inShort = useMemo(() => {
    if (!source.trim()) return null;
    try {
      const facts = programSummaryFactsOf(source, { engineVersion: APP_VERSION });
      const summary = programSummary(facts);
      const purpose = summary.lines.find((l) => l.key === 'purpose')?.text ?? '';
      const full = managementInShort(summary, facts, { level: false });
      const decision = full.startsWith(purpose) ? full.slice(purpose.length).trim() : full;
      return { purpose, decision: decision.replace(/^For the decision:\s*/, '') };
    } catch {
      return null;
    }
  }, [source]);

  const rows = itFindings.rows;
  const levels = useMemo(() => managementLevelMix(rows), [rows]);
  const risks = useMemo(() => managementRisks(rows), [rows]);

  const options = useMemo(() => {
    const fit = standardFit({
      mode: 'demo',
      hasRun: false,
      analyzeState: demo.rail.find((r) => r.key === 'analyze')?.state ?? 'empty',
      signedSourceSha256: null,
      findings: { state: 'ready', value: itFindings },
      fit: { state: 'absent', reason: 'A demo is never signed.' },
    });
    return decisionOptionsView({
      subject: executiveSubject(source, DEMO_OBJECT_NAME),
      mode: 'demo',
      hasRun: false,
      fit,
      decision: null,
      status: null,
      confirmation: null,
      signOff: null,
      engineRoute: null,
      usage: null,
      economics: null,
    });
  }, [demo.rail, itFindings, source]);

  const score = typeof demo.economics.scoreBefore === 'number' ? demo.economics.scoreBefore : null;
  const band = score !== null ? scoreBand(score) : null;
  const redesign = demoRedesignHref();
  const facets: FacetProps[] = [
    {
      id: 'distance',
      label: 'Distance to clean core',
      value: score !== null ? String(score) : 'Not measured',
      unit: band ? `of 100 · ${band.label.toLowerCase()}` : undefined,
      note: <LevelMix mix={levels} />,
    },
    {
      id: 'cost',
      label: 'Cost',
      value: 'Step 1',
      unit: 'of Re-design',
      note: 'Economics prices the options with your figures. Analyze computes no amount.',
      href: `#${MANAGEMENT_PAGE_IDS.options}`,
    },
    {
      id: 'risk',
      label: 'Risk if nothing changes',
      value: String(risks.total),
      unit: risks.total === 1 ? 'serious finding' : 'serious findings',
      note: risks.worst ? `worst: ${risks.worst}` : 'No critical or high finding.',
      href: `#${MANAGEMENT_PAGE_IDS.risk}`,
    },
    {
      id: 'needs',
      label: 'What we need from you',
      value: '1',
      unit: 'action',
      note: 'decision not taken',
      href: `#${MANAGEMENT_PAGE_IDS.needs}`,
    },
  ];
  const anchors: PageAnchor[] = [
    { key: 'options', target: MANAGEMENT_PAGE_IDS.options, label: 'Options' },
    { key: 'risk', target: MANAGEMENT_PAGE_IDS.risk, label: 'Risk' },
    { key: 'needs', target: MANAGEMENT_PAGE_IDS.needs, label: 'What we need from you', count: '1', tone: 'open' },
  ];

  return (
    <div data-demo-analyze-management="" className="flex flex-col gap-6">
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
            Re-design this program
            <ArrowRight size={16} aria-hidden={true} />
          </CcLinkButton>
        }
        actionNote="Step 1 of 7: price the options. In the demo, nothing is kept."
        after={
          <div data-analyze-indication="" className="mt-2 max-w-[640px] rounded-cc-card border border-cc-ink bg-cc-surface px-4 py-3">
            <p className="m-0 cc-text-label text-cc-ink-muted">Indication from the analysis</p>
            <p className="m-0 mt-1 cc-text-body font-bold text-cc-ink">No option is indicated in a demo.</p>
            <p className="m-0 mt-1 cc-text-cell text-cc-ink">{DEMO_UNSIGNED_NOTICE} The indication rests on a signed run of your own program.</p>
            <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
              An indication is never a decision. You decide in {REDESIGN_LABEL}, after the options are priced.
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
                ]}
                rows={options.cards.map((c) => ({
                  key: c.option,
                  cells: {
                    option: (
                      <span data-management-option={c.option} className="font-semibold">
                        {c.label}
                      </span>
                    ),
                    means: c.meaning,
                    evidence: (
                      <span>
                        <span className="font-semibold">{OPTION_SIGNAL_WORDS[c.signal]}</span>: {c.reason}
                      </span>
                    ),
                  },
                }))}
              />
            </div>
            <p data-management-not-priced="" className="m-0 mt-3 cc-text-cell text-cc-ink-muted">
              Not priced yet: all four options are priced together in step 1 of Re-design. Analyze computes no amount.
            </p>
          </Section>

          <Section id={MANAGEMENT_PAGE_IDS.risk} title="Risk if nothing changes" lead="The serious findings of the engine's reading, grouped by what they are.">
            {risks.groups.length === 0 ? (
              <p className="m-0 mt-3 cc-text-cell text-cc-ink">No critical or high finding in the engine&apos;s reading.</p>
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
                        // The line opens beside the map in the Business view, as in a project (`#L42`).
                        <Link
                          key={`${l.start}-${l.end ?? ''}`}
                          href={`${DEMO_ANALYZE_ROUTE}#${anchorLabel(l.start, l.end)}`}
                          aria-label={`Source line ${anchorLabel(l.start, l.end).slice(1)}`}
                          className="font-cc-mono cc-text-meta text-cc-information underline-offset-2 hover:underline"
                        >
                          {anchorLabel(l.start, l.end)}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id={MANAGEMENT_PAGE_IDS.needs} title="What we need from you" lead="One action. Nothing needs a tool before Re-design starts.">
            <ol data-management-needs="" className="m-0 mt-3 list-none p-0">
              <NumberedItem n={1}>
                <span className="font-semibold">Start the re-design.</span> The options get priced, then you take the decision: keep, rebuild, move to
                SAP standard or retire.
              </NumberedItem>
            </ol>
          </Section>
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
              Decision: <span className="font-semibold text-cc-ink">not taken</span>. A demo records none.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CcLinkButton href={redesign} variant="ghost" data-management-open-redesign="">
                Open {REDESIGN_LABEL}
              </CcLinkButton>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
