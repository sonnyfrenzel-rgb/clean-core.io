'use client';

import React, { useMemo, useState } from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import AnalysisAnswer from '@/components/analyze/AnalysisAnswer';
import EvidenceFindingsTable, { type LevelLookup } from '@/components/analyze/EvidenceFindingsTable';
import CleanCoreScoreSection from '@/components/analyze/CleanCoreScoreSection';
import CleanCoreScoreDialog from '@/components/analyze/CleanCoreScoreDialog';
import RouteCard from '@/components/analyze/RouteCard';
import FoldedSection, { FoldedPart } from '@/components/analyze/FoldedSection';
import NotDeterminedSide, { type OpenItem } from '@/components/analyze/NotDeterminedSide';
import UnassessedConstructs from '@/components/analyze/UnassessedConstructs';
import MissingDependencyPrompt from '@/components/analyze/MissingDependencyPrompt';
import CoverageVerdict from '@/components/analyze/CoverageVerdict';
import ConstructFindings from '@/components/analyze/ConstructFindings';
import CodeInventoryTable from '@/components/analyze/CodeInventoryTable';
import ModuleHeatmap from '@/components/analyze/ModuleHeatmap';
import DataCouplingTable from '@/components/analyze/DataCouplingTable';
import ReviewTasks, { reviewTasksTitle } from '@/components/ReviewTasks';
import { analysisAnswer, countFindings, dataEffect, groupEvidenceFindings } from '@/components/analyze/analysis-answer';
import { accessUseOfKind, findingRows, SEVERITY_ORDER, withSuccessor } from '@/lib/findings-view';
import { routeDrivers } from '@/lib/abap/extensibility-router';
import { gradeKey, type CloudReadinessGrade } from '@/lib/abap/abcd-classification';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import { coverageCaveat } from '@/lib/abap/coverage';
import { deriveReviewTasks } from '@/lib/abap/review-tasks';
import { buildClassModel } from '@/lib/abap/class-model-resolver';
import { detectFindings, summarize } from '@/lib/abap/findings-detector';
import { sapNamesForDisplay } from '@/lib/sap-naming';
import { scoreBand } from '@/lib/clean-core-score';
import { catalogForReader } from '@/lib/messages/demo';
import { APP_VERSION } from '@/lib/version';
import type { DemoProject } from '@/lib/demo-project';
import { countSourceLines } from '@/lib/source-lines';

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

/** Where the demo stops: said in place of what a model writes in a real run. */
function DemoStops({ what }: { what: string }) {
  return (
    <CcMessageStrip state="neutral" headline="The demo stops where the model begins.">
      {what} comes out of a model call in a real run. A demo makes no model call, so there is none here — and
      writing a convincing one by hand is the one thing this product may never do.
    </CcMessageStrip>
  );
}

export default function DemoAnalyze({ demo }: { demo: DemoProject }) {
  const a = demo.analyze;
  const source = a.source;
  const fileName = demo.sourceFile;
  const route = demo.design.recommendedRoute;
  const [scoreOpen, setScoreOpen] = useState(false);

  const findingCounts = useMemo(() => countFindings(groupEvidenceFindings(a.findings)), [a.findings]);
  const rows = useMemo(() => findingRows(a.findings), [a.findings]);
  const sourceLines = countSourceLines(source ?? '');

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
  // The business value assessment is not an Analyze answer since 02.10.2026;
  // a real project shows it on Economics.
  openItems.push({
    key: 'strategy',
    title: 'Modernisation strategy',
    reason: 'The standardisation fit and the recommendation prose come from the narrative. The route on this page does not.',
    body: <DemoStops what="The modernisation strategy" />,
  });

  const catalog = catalogForReader(demo.catalogVersion);
  const band = scoreBand(a.cleanCoreScore);

  return (
    <div className="space-y-6 font-sans" data-demo-analyze="" data-demo-score-band={band.key}>
      <AnalysisAnswer
        answer={analysisAnswer({
          counts: findingCounts,
          lines: sourceLines,
          route,
          routeChosenByReader: false,
        })}
        effect={dataEffect(a.findings)}
        counts={findingCounts}
        score={a.cleanCoreScore}
        onExplainScore={() => setScoreOpen(true)}
        severities={SEVERITY_ORDER.map((key) => ({ key, count: rows.filter((r) => r.finding.severity === key).length }))}
        levels={levelFacet}
        meta={{
          fileName,
          lines: sourceLines || null,
          catalog: catalog && catalog.includes('@') ? catalog.split(' + ')[0] : catalog,
          engine: APP_VERSION,
        }}
        status={[
          { key: 'evidence', label: 'Evidence', value: 'engine only, no model', dot: 'bg-cc-information' },
          { key: 'run', label: 'Run', value: 'demo, never signed', dot: 'bg-cc-neutral' },
          { key: 'target', label: 'Target', value: `${demo.deployment === 'public' ? 'Public Edition' : 'Private Edition'} · assumed for the demo`, dot: 'bg-cc-chart-2' },
          { key: 'successors', label: 'Successors', value: rows.length ? `${withSuccessor(rows)} of ${rows.length} named` : 'no finding', dot: 'bg-cc-chart-3' },
        ]}
      />

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
        sideTop={({ openLine }) => (
          // The same card as a signed project's, from the router's report the
          // demo computed on the server — drivers, assumptions, confidence.
          <RouteCard
            route={route}
            overridden={false}
            targetArtifact={demo.design.targetArtifact}
            confidence={demo.design.confidenceScore}
            rationale={demo.design.rationale ? sapNamesForDisplay(demo.design.rationale) : null}
            deployment={demo.deployment}
            derived={{ drivers: routeDrivers({ findings: a.findings }, demo.deployment), assumptions: demo.design.assumptions }}
            notRecorded={[]}
            decideHref="/demo/workspace?view=management"
            openLine={openLine}
          />
        )}
        sideBottom={<NotDeterminedSide items={openItems} />}
      />

      {/* Where a real run's model summary stands: folded, saying the demo has none. */}
      <FoldedSection id="analyze-summary" data-analysis-summary="demo" title="Model summary">
        <DemoStops what="The analysis narrative — the summary a model writes beside this evidence —" />
      </FoldedSection>

      {/* One section of technical detail, folded — as the real page draws it. */}
      <FoldedSection id="analyze-technical-detail" data-analysis-technical-detail="" title="Technical detail">
        <FoldedPart title="Complexity and criticality">
          <p className="m-0 cc-text-cell text-cc-ink-muted">
            Complexity {a.complexityScore}/10 and criticality {a.criticalityScore}/10, both on the engine’s own ten-point
            scale over the same source.
          </p>
        </FoldedPart>
        <FoldedPart title="Language constructs the engine resolved" data-analysis-constructs={constructs.length}>
          <CoverageVerdict findings={constructs} summary={constructSummary} />
          <ConstructFindings findings={constructs} />
        </FoldedPart>
        <FoldedPart title="Code inventory and data access">
          <CodeInventoryTable codeInventory={demo.documentation.inventory} />
          <ModuleHeatmap codeInventory={demo.documentation.inventory} />
          <DataCouplingTable dataCoupling={demo.documentation.coupling} />
        </FoldedPart>
      </FoldedSection>

      <CleanCoreScoreDialog open={scoreOpen} onClose={() => setScoreOpen(false)} />
    </div>
  );
}
