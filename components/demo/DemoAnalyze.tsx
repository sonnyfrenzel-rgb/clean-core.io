'use client';

import React, { useMemo, useState } from 'react';
import { Cloud } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import AnalysisAnswer from '@/components/analyze/AnalysisAnswer';
import EvidenceFindingsTable, { type LevelLookup } from '@/components/analyze/EvidenceFindingsTable';
import CleanCoreScoreSection from '@/components/analyze/CleanCoreScoreSection';
import CleanCoreScoreDialog from '@/components/analyze/CleanCoreScoreDialog';
import ObjectSection from '@/components/analyze/ObjectSection';
import UnassessedConstructs from '@/components/analyze/UnassessedConstructs';
import MissingDependencyPrompt from '@/components/analyze/MissingDependencyPrompt';
import CoverageVerdict from '@/components/analyze/CoverageVerdict';
import ConstructFindings from '@/components/analyze/ConstructFindings';
import CodeInventoryTable from '@/components/analyze/CodeInventoryTable';
import ModuleHeatmap from '@/components/analyze/ModuleHeatmap';
import DataCouplingTable from '@/components/analyze/DataCouplingTable';
import ReviewTasks, { reviewTasksTitle } from '@/components/ReviewTasks';
import GapsWorklist from '@/components/analyze/GapsWorklist';
import { analysisAnswer, countFindings, groupEvidenceFindings, plainRoute } from '@/components/analyze/analysis-answer';
import { accessUseOfKind, findingRows, SEVERITY_ORDER } from '@/lib/findings-view';
import { gradeKey, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { coverageCaveat } from '@/lib/abap/coverage';
import { deriveReviewTasks } from '@/lib/abap/review-tasks';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import { routeLabel, sapNamesForDisplay } from '@/lib/sap-naming';
import { scoreBand } from '@/lib/clean-core-score';
import { catalogForReader } from '@/lib/messages/demo';
import { APP_VERSION } from '@/lib/version';
import type { DemoProject } from '@/lib/demo-project';
import type { Project, WorklistItem } from '@/lib/types';

/**
 * The demo's Analyze stage — the object page a real project's Analyze stage
 * shows (proposal A, owner decision 01.10.2026), on the same components:
 * the answer and its four facets (`AnalysisAnswer`), the Clean Core Score with
 * Clean-Core.io's bands (`CleanCoreScoreSection`), Look here first, Where in
 * the program with its source panel, Findings by kind (`EvidenceFindingsTable`),
 * the route and what was not determined in the side column, and the folds
 * below. Every figure comes from `lib/demo-project.ts`, which ran the engine of
 * this release over the example on the server, and is derived here exactly as
 * `app/(app)/project/[projectId]/analyze/page.tsx` derives it for a signed run
 * without a narrative.
 *
 * Where the real page shows the model's part — the narrative, the business
 * value assessment, the modernisation strategy — the demo says that it stops
 * where the model begins. It makes no model call and writes no model text.
 */

/** One entry of the "could not determine" list, as the real page builds it. */
interface OpenItem {
  key: string;
  title: string;
  reason: string;
  body?: React.ReactNode;
}

/** Where the demo stops: said in place of what a model writes in a real run. */
function DemoStops({ what }: { what: string }) {
  return (
    <CcMessageStrip state="neutral" headline="The demo stops where the model begins.">
      {what} comes out of a model call in a real run. A demo makes no model call, so there is none here — and
      writing a convincing one by hand is the one thing this product may never do.
    </CcMessageStrip>
  );
}

export default function DemoAnalyze({
  demo,
  worklist,
  onWorklist,
}: {
  demo: DemoProject;
  /** The worklist as this browser holds it; null means as the engine wrote it. */
  worklist: WorklistItem[] | null;
  onWorklist: (worklist: WorklistItem[]) => void;
}) {
  const a = demo.analyze;
  const source = a.source;
  const fileName = demo.sourceFile;
  const route = demo.design.recommendedRoute;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [notDeterminedOpen, setNotDeterminedOpen] = useState(false);

  const findingCounts = useMemo(() => countFindings(groupEvidenceFindings(a.findings)), [a.findings]);
  const rows = useMemo(() => findingRows(a.findings), [a.findings]);
  const sourceLines = source ? source.split('\n').length : 0;

  // The levels the server looked up, read as the real page reads its lookup.
  const levels: LevelLookup = useMemo(
    () => ({
      status: 'ready',
      of: (f: EvidenceFinding): CloudReadinessGrade | null =>
        f.objectName ? (a.levels[gradeKey(f.objectName.trim().toUpperCase(), accessUseOfKind(f.kind))] ?? 'Unknown') : null,
    }),
    [a.levels],
  );
  const levelFacet = useMemo(() => {
    const dist: Record<CloudReadinessGrade, number> = { A: 0, B: 0, C: 0, D: 0, Unknown: 0 };
    let noObject = 0;
    for (const r of rows) {
      if (!r.finding.objectName) {
        noObject++;
        continue;
      }
      const g = levels.of(r.finding);
      if (g) dist[g]++;
    }
    return { status: 'ready' as const, dist, noObject };
  }, [rows, levels]);

  const notAssessedItems = useMemo(
    () => (a.coverage?.gaps ?? []).map((g) => ({ label: g.label, count: g.count, firstLine: g.firstLine })),
    [a.coverage],
  );

  // The same three things the real page reads off the source in the browser.
  const { constructs, constructSummary, missingDeps } = useMemo(() => {
    const sources = [{ file: fileName, content: source }];
    const model = buildClassModel(sources);
    const detected = detectFindings(model, sources);
    return { constructs: detected, constructSummary: summarize(detected, model), missingDeps: model.missing };
  }, [source, fileName]);
  const reviewTasks = useMemo(() => deriveReviewTasks(source), [source]);

  const openItems: OpenItem[] = [];
  if (coverageCaveat(a.coverage)) {
    openItems.push({
      key: 'coverage',
      title: 'Statements outside the engine’s checks',
      reason: 'Nobody has judged these statements either way — they are not defects, and not cleared either.',
      body: <UnassessedConstructs coverage={a.coverage} />,
    });
  }
  if (missingDeps.length > 0) {
    openItems.push({
      key: 'missing-objects',
      title: `${missingDeps.length} ${missingDeps.length === 1 ? 'object' : 'objects'} the code refers to but were not supplied`,
      reason: 'Without their source the engine cannot resolve what this code inherits or calls through them.',
      body: <MissingDependencyPrompt missing={missingDeps} />,
    });
  }
  if (reviewTasks.counts.total > 0) {
    openItems.push({
      key: 'check-tasks',
      title: reviewTasksTitle(reviewTasks.counts.total),
      reason: 'Each one is a question, not a result: it names the line and the one step that would settle it.',
      body: <ReviewTasks result={reviewTasks} />,
    });
  }
  openItems.push(
    {
      key: 'business-value',
      title: 'Business value assessment',
      reason: 'Asset score, value drivers and the plain-English action plan come from the narrative, which a demo does not have.',
      body: <DemoStops what="The business value assessment" />,
    },
    {
      key: 'strategy',
      title: 'Modernisation strategy',
      reason: 'The standardisation fit and the recommendation prose come from the narrative. The route on this page does not.',
      body: <DemoStops what="The modernisation strategy" />,
    },
  );

  const showNotDetermined = () => {
    setNotDeterminedOpen(true);
    window.requestAnimationFrame(() =>
      document.getElementById('analysis-not-determined')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const catalog = catalogForReader(demo.catalogVersion);
  const withSuccessor = rows.filter((r) => r.finding.sapReplacement?.objectName).length;
  const band = scoreBand(a.cleanCoreScore);

  return (
    <div className="space-y-6 font-sans" data-demo-analyze="" data-demo-score-band={band.key}>
      <AnalysisAnswer
        answer={analysisAnswer({
          counts: findingCounts,
          lines: sourceLines,
          route,
          routeChosenByReader: false,
          notDetermined: openItems.length,
        })}
        counts={findingCounts}
        score={a.cleanCoreScore}
        routeChosenByReader={false}
        notDetermined={openItems.length}
        onExplainScore={() => setScoreOpen(true)}
        onShowNotDetermined={showNotDetermined}
        severities={SEVERITY_ORDER.map((key) => ({ key, count: rows.filter((r) => r.finding.severity === key).length }))}
        levels={levelFacet}
        notAssessed={{
          kinds: notAssessedItems.length,
          constructs: notAssessedItems.reduce((n, g) => n + g.count, 0),
          items: notAssessedItems,
        }}
        meta={{
          fileName,
          lines: sourceLines || null,
          catalog: catalog && catalog.includes('@') ? catalog.split(' + ')[0] : catalog,
          engine: APP_VERSION,
        }}
        status={[
          { key: 'evidence', label: 'Evidence', value: 'engine only, no model', dot: 'bg-cc-information' },
          { key: 'narrative', label: 'Summary', value: 'none — a demo calls no model', dot: 'bg-cc-neutral' },
          { key: 'route', label: 'Route', value: plainRoute(route) ?? 'not determined', dot: 'bg-cc-chart-2' },
          { key: 'run', label: 'Run', value: 'demo, never signed', dot: 'bg-cc-neutral' },
          { key: 'successors', label: 'Successors', value: `${withSuccessor} of ${rows.length} named`, dot: 'bg-cc-warning-mark' },
        ]}
      />

      <DemoStops what="The analysis narrative — the summary a model writes beside this evidence —" />

      <EvidenceFindingsTable
        findings={a.findings}
        sourceLines={sourceLines}
        source={source}
        levels={levels}
        steps={a.processSteps}
        notAssessed={notAssessedItems}
        scoreSection={
          <CleanCoreScoreSection score={a.cleanCoreScore} breakdown={a.scoreBreakdown} onExplain={() => setScoreOpen(true)} />
        }
        fileName={fileName}
        sideTop={
          <ObjectSection side title="Extensibility route" right={<CcProvenanceChip value="reconstructed" note="fixed rules" />}>
            <div className="flex items-center gap-3 rounded-cc-card border border-cc-line bg-cc-surface-muted p-3">
              <span aria-hidden={true} className="grid h-10 w-10 shrink-0 place-items-center rounded-cc-card border border-cc-line bg-cc-surface text-cc-ink">
                <Cloud size={20} aria-hidden="true" />
              </span>
              <p className="m-0 cc-text-h3 text-cc-ink">{routeLabel(route)}</p>
            </div>
            {demo.design.rationale ? (
              <p className="m-0 mt-3 cc-text-cell text-cc-ink">{sapNamesForDisplay(demo.design.rationale)}</p>
            ) : null}
            <div className="mt-3">
              <CcLinkButton href="/demo/design" variant="secondary">
                Open Design
              </CcLinkButton>
            </div>
          </ObjectSection>
        }
        sideBottom={
          <ObjectSection side title="Not determined" right={<span className="cc-text-meta text-cc-ink-muted">{openItems.length}</span>}>
            {notAssessedItems.length ? (
              <ul className="m-0 grid list-none gap-2 p-0">
                {notAssessedItems.map((g) => (
                  <li key={g.label} className="flex items-start gap-2 cc-text-cell text-cc-ink">
                    <span aria-hidden={true} className="mt-1 h-3 w-3 shrink-0 rounded-full border border-dashed border-cc-ink-muted" />
                    <span>
                      {g.count} × {g.label.toLowerCase()} — from <CcAnchor label={`Source line ${g.firstLine}`}>{`L${g.firstLine}`}</CcAnchor>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 cc-text-cell text-cc-ink-muted">Every construct read was within the engine’s checks.</p>
            )}
            <p className="m-0 mt-3 cc-text-meta font-medium text-cc-ink-muted">
              A result covers what the engine checks, which is not the whole program.
            </p>
            <div className="mt-2">
              <CcButton variant="ghost" density="compact" onClick={showNotDetermined}>
                All {openItems.length} with their reasons
              </CcButton>
            </div>
          </ObjectSection>
        }
      />

      {/* The worklist a run stores, operable here and kept in this browser only. */}
      <GapsWorklist
        projectId="demo"
        project={{ name: demo.title, legacyCode: source, worklist: worklist ?? a.worklist } as Project}
        findings={constructs}
        analysisGaps={[]}
        showHelpMode={false}
        onUpdateWorklist={async (next) => onWorklist(next)}
      />

      <section
        id="analysis-not-determined"
        data-analysis-not-determined={openItems.length}
        className="scroll-mt-24 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc px-4 py-2 sm:px-6"
      >
        <CcDisclosure
          level={2}
          density="cozy"
          title={`${openItems.length} ${openItems.length === 1 ? 'thing' : 'things'} this analysis could not determine`}
          open={notDeterminedOpen}
          onOpenChange={setNotDeterminedOpen}
        >
          <ul className="m-0 p-0 list-none divide-y divide-cc-line">
            {openItems.map((item) => (
              <li key={item.key} data-not-determined-item={item.key} className="py-4 first:pt-2 last:pb-0">
                <h3 className="m-0 cc-text-h3 text-cc-ink">{item.title}</h3>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted max-w-3xl">{item.reason}</p>
                {item.body ? <div className="mt-3">{item.body}</div> : null}
              </li>
            ))}
          </ul>
        </CcDisclosure>
      </section>

      <Folded title="Language constructs the engine resolved" count={constructs.length}>
        <CoverageVerdict findings={constructs} summary={constructSummary} />
        <ConstructFindings findings={constructs} />
      </Folded>

      <Folded title="Code inventory and data access">
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          Complexity {a.complexityScore}/10 and criticality {a.criticalityScore}/10, both on the engine’s own ten-point
          scale over the same source.
        </p>
        <CodeInventoryTable codeInventory={demo.documentation.inventory} />
        <ModuleHeatmap codeInventory={demo.documentation.inventory} />
        <DataCouplingTable dataCoupling={demo.documentation.coupling} />
      </Folded>

      <CleanCoreScoreDialog open={scoreOpen} onClose={() => setScoreOpen(false)} />
    </div>
  );
}

/** A section folded with its count — the real page's fold (§2.11). */
function Folded({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-cc-card border border-cc-line bg-cc-surface shadow-cc px-4 py-2 sm:px-6">
      <CcDisclosure level={2} density="cozy" title={title} count={count}>
        <div className="space-y-8 pt-2">{children}</div>
      </CcDisclosure>
    </section>
  );
}
