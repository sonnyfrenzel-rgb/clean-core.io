'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import ObjectSection from '@/components/analyze/ObjectSection';
import FoldedSection, { FoldedPart } from '@/components/analyze/FoldedSection';
import EvidenceFindingsTable, { openSourceLine, type LevelLookup } from '@/components/analyze/EvidenceFindingsTable';
import NotDeterminedSide, { type NotDeterminedSummary, type OpenItem } from '@/components/analyze/NotDeterminedSide';
import ItTouches from '@/components/analyze/ItTouches';
import AskThisCase from '@/components/workspace/AskThisCase';
import { preAnsweredQuestion } from '@/lib/ask-this-case';
import { EditionRule, ScoreDeductions, ScoreScale, type ScoreProvenance } from '@/components/analyze/CleanCoreScoreSection';
import OpenQuestions, { type OpenAnswerOverlay } from '@/components/workspace/OpenQuestions';
import ItRail, { useContract } from '@/components/workspace/ItRail';
import ItRuleRegister from '@/components/workspace/ItRuleRegister';
import StandardTouchCard from '@/components/workspace/StandardTouchCard';
import FitCheckPanel from '@/components/workspace/FitCheckPanel';
import { DdicTypesCard } from '@/components/workspace/ItAnswers';
import { useIsOwner } from '@/components/workspace/BusinessRulesEditor';
import { useItFindings } from '@/hooks/useItFindings';
import { useOpenQuestions } from '@/hooks/useOpenQuestions';
import { useSourceReading } from '@/hooks/useSourceReading';
import { useFitByPlatform } from '@/hooks/useFitByPlatform';
import { useFollowHash } from '@/hooks/useFollowHash';
import { analyzeLinesFromHash } from '@/lib/analyze-entry';
import {
  ANALYZE_IT_DETAIL_PLACES,
  ANALYZE_IT_IDS,
  analyzeItAnchors,
  changeRisks,
  itAnswer,
  lineAnchorText,
  mainSequence,
} from '@/lib/analyze-it';
import { PAGE_ANCHOR_LABELS } from '@/lib/page-anchors';
import { scoreBand, type ScoreBreakdown } from '@/lib/clean-core-score';
import { scoreRuleFor } from '@/lib/score-rule';
import { editionName, otherEditionFigure, scoreHeroModel, type Edition, type HeroFinding, type HeroGap } from '@/lib/score-hero';
import { scoreBandChartColor } from '@/lib/chart-colors';
import { findingRows, lookHereFirst, type ProcessStepBand } from '@/lib/findings-view';
import { itObjects } from '@/lib/it-objects';
import { catalogProfile } from '@/lib/it-view';
import { runTrust } from '@/lib/it-sections';
import { standardTouch } from '@/lib/standard-touch';
import { notDetermined } from '@/lib/workspace-model';
import { recordGaps } from '@/lib/legacy-project';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { engineVersionOfProject } from '@/lib/run-engine-version';
import { humaniseRoutine } from '@/lib/abap/plain-language';
import { wt } from '@/lib/workspace-messages';
import { shortRoute } from './analysis-answer';
import type { LevelFacet, SeverityPart } from './AnalysisAnswer';
import type { EvidenceFinding, EvidenceNote } from '@/lib/abap/evidence-model';
import type { Project } from '@/lib/types';

/**
 * Analyze, IT view — one page, code first (plan `docs/design/analyze-business-first-plan.md` §4.3, AB-9; ROADMAP
 * 3.5.0 item (1); ADR-140; the IT page of `docs/roadmap/analyze-family-mockup.html`).
 *
 *   ┌ answer card: How far is this code from clean core? [From the engine · fixed rules]          ┌ score box ┐
 *   │ <band label>: 40 of 100.      The direct write … carry most of the distance.               │ 40 of 100 │
 *   │ why, with the lines · signed run · Details                                                   │ [Add evidence] [Export]
 *   ├ Findings │ Clean core levels │ Recommended route │ Not determined ─────────────────────────────┘
 *   On this page: Score · First look · Findings · SAP objects · Summary · Detail                 [Export]
 *   ┌ main ──────────────────────────────────────────────┐ ┌ side (340 px, from 1100 px) ──────────┐
 *   │ What moves the score (the score's own table)        │ │ Route (the router's, fixed rules)    │
 *   │ Look here first · Where in the program · Findings   │ │ Not determined + the open questions  │
 *   │ What it touches in SAP · structure (folded)         │ │ Risks for a change                   │
 *   │ Model summary (folded) · Technical detail (folded)  │ │ The main sequence                    │
 *   └─────────────────────────────────────────────────────┘ └──────────────────────────────────────┘
 *
 * It carries what the workspace's IT view held (AB-11): the objects and dependencies (`#it-objects` → *What it
 * touches in SAP*), the open questions (`#not-determined`), and — in *Technical detail*, opened by their addresses —
 * the target profile with *Change target* (`#it-target-profile`), the route contract (`#it-route`), the signed run
 * (`#it-trust`), where it touches SAP standard (`#standard`), the rule register (`#business-rules`) and the DDIC types.
 *
 * Nothing here is a model's but the folded summary, which says so; nothing is stored, and the view is never written
 * anywhere (ADR-018).
 */
export interface AnalyzeItScore {
  breakdown: ScoreBreakdown | null;
  findings: readonly HeroFinding[];
  notAssessed: readonly HeroGap[];
  edition: Edition | null;
  engineVersion: string | null;
  onExplainScore: () => void;
  provenance: ScoreProvenance;
  severities: readonly SeverityPart[];
  findingCount: number;
  levels: LevelFacet;
  decideHref: string | null;
  questionsHref: string | null;
  rerunHref: string | null;
  onOpenLine?: (line: number) => void;
  notice?: React.ReactNode;
  keyUserLevel?: 'A' | null;
}

export default function AnalyzeIt({
  projectId,
  project,
  source,
  score,
  route,
  routeChosenByReader,
  hero,
  findings,
  sourceLines,
  levels,
  steps,
  notAssessed,
  notes,
  pointsOf,
  fileName,
  routeCard,
  openItems,
  notDeterminedSummary,
  summary,
  technicalDetail,
  inShort,
  addEvidence,
  exportMenu,
  missingObjects,
}: {
  projectId: string;
  project: Project;
  /** The program's source as stored — the code beside the findings. */
  source: string;
  /** The signed score, or null when the run computed none. */
  score: number | null;
  route: string | null | undefined;
  routeChosenByReader: boolean;
  hero: AnalyzeItScore;
  findings: readonly EvidenceFinding[];
  sourceLines: number;
  levels: LevelLookup;
  steps: readonly ProcessStepBand[];
  notAssessed: ReadonlyArray<{ label: string; count: number; firstLine: number }>;
  notes: readonly EvidenceNote[];
  pointsOf?: (kind: string) => number;
  fileName: string;
  /** The route card of the side column (`RouteCard`), its line anchors opening the source here. */
  routeCard: React.ReactNode;
  /** What this analysis could not settle in the source — the statements, the missing objects, the check tasks. */
  openItems: readonly OpenItem[];
  notDeterminedSummary: NotDeterminedSummary;
  /** The folded model summary: its body, its chip, and whether one is on record. */
  summary: { onRecord: boolean; body: React.ReactNode; aside?: React.ReactNode; mode: 'model' | 'not-generated' };
  /** The parts of *Technical detail* the page builds: constructs, levels A–D, imports. */
  technicalDetail: React.ReactNode;
  /** One sentence of business context (the engine's "In short"), or null. */
  inShort: React.ReactNode;
  addEvidence: React.ReactNode;
  exportMenu: React.ReactNode;
  /** Objects the code refers to that were not supplied. */
  missingObjects: number;
}) {
  // A link to a place on this page (`#not-determined`, `#it-trust`) waits for it and brings it into view (ADR-085).
  useFollowHash();

  // `#L42` / `#L40-48`: the code at that line, as on the Business page.
  useEffect(() => {
    const lines = analyzeLinesFromHash(window.location.hash);
    if (!lines) return;
    const frame = window.requestAnimationFrame(() => openSourceLine(lines.lineStart));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const hasSource = source.trim().length > 0;
  const engine = engineVersionOfProject(project);
  const reading = useSourceReading(source, hasSource, engine);
  const itSource = useItFindings(projectId, hasSource);

  // ── The answer (ADR-140 A17): the score in one sentence, the two largest deductions as its "why". ──
  const rule = scoreRuleFor(hero.edition ?? 'private', hero.engineVersion);
  const model = useMemo(
    () => (hero.breakdown ? scoreHeroModel(hero.breakdown, hero.findings, hero.notAssessed, rule) : null),
    [hero.breakdown, hero.findings, hero.notAssessed, rule],
  );
  const addsUp = hero.breakdown !== null && score !== null && hero.breakdown.score === score;
  const other = useMemo(
    () => (addsUp && hero.breakdown ? otherEditionFigure(hero.findings, hero.breakdown.unassessedKinds, hero.edition ?? 'private', hero.engineVersion) : null),
    [addsUp, hero.breakdown, hero.findings, hero.edition, hero.engineVersion],
  );
  const answer = useMemo(() => itAnswer({ score, model, findings: hero.findingCount }), [score, model, hero.findingCount]);

  // ── The sections' figures. ──
  const rows = useMemo(() => findingRows(findings), [findings]);
  const picks = useMemo(() => lookHereFirst(rows).length, [rows]);
  const objects = useMemo(
    () =>
      itSource === undefined
        ? undefined
        : itSource === null
          ? null
          : itObjects({
              inventory: project.codeInventory,
              coupling: project.dataCoupling,
              uses: itSource.uses,
              findings: itSource.rows,
              code: project.legacyCode,
            }),
    [itSource, project.codeInventory, project.dataCoupling, project.legacyCode],
  );
  const touches = objects ? objects.rows.filter((r) => r.side === 'dependency').length : null;
  const anchors = useMemo(
    () => analyzeItAnchors({ picks, findings: rows.length, touches, summary: summary.onRecord, score: score !== null }),
    [picks, rows.length, touches, summary.onRecord, score],
  );
  const sequence = useMemo(() => mainSequence(reading?.skeleton ?? null), [reading]);
  const askAnswer = useMemo(
    () => (reading ? preAnsweredQuestion(reading.skeleton, reading.ruleSet, source || undefined) : null),
    [reading, source],
  );
  const risks = useMemo(
    () => changeRisks({ model: addsUp ? model : null, missingObjects, notAssessedPlaces: notDeterminedSummary.places }),
    [addsUp, model, missingObjects, notDeterminedSummary.places],
  );

  // ── The open questions (ADR-081): the project's one list, in the side column. ──
  const open = useMemo(() => notDetermined(project), [project]);
  const [answers, setAnswers] = useState<OpenAnswerOverlay>({});
  const questions = useOpenQuestions(project, projectId, { open, answers });
  const onAnswered = useCallback<NonNullable<React.ComponentProps<typeof OpenQuestions>['onAnswered']>>(
    (action, value) => setAnswers((prev) => ({ ...prev, [action]: value })),
    [],
  );
  const owner = useIsOwner(project);
  const recorded = useMemo(() => recordGaps(project), [project]);
  const hasRun = Boolean(project.activeRunId?.trim()) && project._runLoadFailed !== true;

  // ── What the workspace's IT rail held: target profile, contract, run (AB-11). ──
  const contract = useContract(projectId, hasSource);
  const findingsRead = useMemo(
    () =>
      itSource === undefined
        ? ({ state: 'loading' } as const)
        : itSource === null
          ? ({ state: 'absent', reason: wt('it.noFindingsUnreadable') } as const)
          : ({ state: 'ready', value: itSource } as const),
    [itSource],
  );
  const fit = useFitByPlatform(findingsRead, project, wt('mgmt.lookupFailed'));
  const touch = useMemo(() => (itSource === undefined ? undefined : standardTouch(itSource)), [itSource]);
  const profile = useMemo(
    () => catalogProfile(catalogLookupTargetOf(project), Boolean(project.s4Deployment), itSource?.catalog ?? null),
    [project, itSource],
  );
  const trust = useMemo(() => runTrust(project), [project]);

  const openLine = sourceLines > 0 && hasSource ? openSourceLine : undefined;
  const lineChip = (line: number, end?: number | null, key?: React.Key) => (
    <CcAnchor key={key} label={`Source line ${line}${openLine ? ', open the source' : ''}`} onOpen={openLine ? () => openLine(line) : undefined}>
      {lineAnchorText(line, end)}
    </CcAnchor>
  );

  // ── The four facets (ADR-140): each jumps to its section. ──
  const graded = hero.levels.dist.A + hero.levels.dist.B + hero.levels.dist.C + hero.levels.dist.D;
  const worst = (['D', 'C', 'B', 'A'] as const).find((g) => hero.levels.dist[g] > 0) ?? null;
  const ndPlaces = notAssessed.reduce((n, g) => n + (g.count > 0 ? g.count : 0), 0);
  const facets: FacetProps[] = [
    {
      id: 'findings',
      label: 'Findings',
      value: hero.findingCount,
      unit: hero.findingCount === 1 ? 'finding' : 'findings',
      note: hero.severities.filter((s) => s.count > 0).map((s) => `${s.key} ${s.count}`).join(' · ') || 'none in what the engine checks',
      href: `#${ANALYZE_IT_IDS.kinds}`,
    },
    {
      id: 'levels',
      label: 'Clean core levels',
      value: hero.levels.status !== 'ready' ? '—' : worst ? hero.levels.dist[worst] : 0,
      unit: hero.levels.status === 'ready' && worst ? `Level ${worst}` : undefined,
      note:
        hero.levels.status === 'loading'
          ? 'Looking up the catalog …'
          : hero.levels.status === 'error'
            ? 'The catalog lookup did not answer, so no level is shown.'
            : `${(['C', 'B', 'A'] as const).filter((g) => g !== worst && hero.levels.dist[g] > 0).map((g) => `${hero.levels.dist[g]} ${g}`).join(' · ') || `${graded} graded`}${hero.levels.dist.Unknown ? ` · ${hero.levels.dist.Unknown} unknown` : ''} · from SAP's catalog${hero.edition ? `, for ${editionName(hero.edition)}` : ''}`,
      href: `#${ANALYZE_IT_IDS.touch}`,
    },
    {
      id: 'route',
      label: 'Recommended route',
      value: shortRoute(route) ?? 'Not determined',
      note: routeChosenByReader ? 'stored by an earlier build; the rules recommended the other route' : 'fixed rules · decided in Management',
      href: `#${ANALYZE_IT_IDS.route}`,
    },
    {
      id: 'not-determined',
      label: 'Not determined',
      value: ndPlaces,
      unit: ndPlaces === 1 ? 'place' : 'places',
      note:
        ndPlaces === 0 && missingObjects === 0
          ? 'Every construct read was within the engine’s checks.'
          : `${notAssessed.length ? `${notAssessed.length} ${notAssessed.length === 1 ? 'kind' : 'kinds'}` : 'none assessed out'}${missingObjects ? ` · plus ${missingObjects} ${missingObjects === 1 ? 'part' : 'parts'} not in the upload` : ''}`,
      href: `#${ANALYZE_IT_IDS.notDetermined}`,
    },
  ];

  // ── Where the figure comes from, in one line, and the rest behind "Details" (UX review Q3). ──
  const p = hero.provenance;
  const runLine = p.run ? (
    <>
      From the signed run{' '}
      {p.run.href ? (
        <a href={p.run.href} className="font-cc-mono font-semibold text-cc-ink underline underline-offset-2">
          {p.run.id.slice(0, 8)}
        </a>
      ) : (
        <span className="font-cc-mono text-cc-ink">{p.run.id.slice(0, 8)}</span>
      )}
      {p.run.when ? ` · ${p.run.when}` : ''}
      {p.engine ? (
        <>
          {' · engine '}
          <span className="font-cc-mono">{p.engine}</span>
        </>
      ) : null}
    </>
  ) : (
    'No signed run'
  );
  const provenanceDetails = [
    p.rules ? `rules ${p.rules}` : null,
    p.fileName,
    typeof p.lines === 'number' && p.lines > 0 ? `${p.lines.toLocaleString('en-US')} lines` : null,
    p.catalog ? `catalog ${p.catalog}` : null,
    p.target ?? null,
  ].filter((x): x is string => Boolean(x));

  const why =
    answer.why.length || answer.notAssessedPoints ? (
      <span data-analyze-it-why="">
        {answer.why.map((w, i) => (
          <React.Fragment key={w.text}>
            {i === 0 ? 'The ' : ', the '}
            {w.text} costs {w.points} points{w.line ? <> {lineChip(w.line, w.lineEnd)}</> : null}
          </React.Fragment>
        ))}
        {answer.notAssessedPoints ? `${answer.why.length ? '; ' : ''}${answer.notAssessedPoints} points stand for what could not be assessed` : ''}.
      </span>
    ) : null;

  const scoreBox = (
    <div data-analyze-it-scorebox="" className="rounded-cc-row border border-cc-line bg-cc-surface-muted px-4 py-3">
      <p className="m-0 cc-text-meta text-cc-ink-muted">Clean Core Score of the signed run</p>
      {score !== null ? (
        <>
          <p className="m-0 mt-1 flex items-baseline gap-2">
            <span className="cc-text-hero text-cc-ink" data-analyze-score-value="">
              {score}
            </span>
            <span className="cc-text-body font-semibold text-cc-ink-muted">of 100</span>
          </p>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 cc-text-cell font-semibold text-cc-ink" data-analyze-score-band={scoreBand(score).key}>
            <span aria-hidden={true} className={`h-3 w-3 shrink-0 rounded-[3px] ${scoreBandChartColor(scoreBand(score).key).bg}`} />
            {scoreBand(score).label}
            <span className="cc-text-meta font-medium text-cc-ink-muted">
              · band {scoreBand(score).from}–{scoreBand(score).to}
            </span>
          </p>
          <div className="mt-3">
            <ScoreScale score={score} compact />
          </div>
        </>
      ) : (
        <p className="m-0 mt-1 cc-text-h2 text-cc-ink">Not yet computed</p>
      )}
      <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">
        A grade, not a compliance percentage.{' '}
        <button type="button" onClick={hero.onExplainScore} className="font-semibold text-cc-ink underline underline-offset-2">
          How it is computed
        </button>
      </p>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 font-sans" data-analyze-it="">
      {hero.notice ? <div className="[&_[data-stale-notice]]:mb-0">{hero.notice}</div> : null}

      <div data-analysis-answer="" data-analyze-score={score ?? 'none'}>
        <AnswerCard
          id={ANALYZE_IT_IDS.answer}
          question="How far is this code from clean core?"
          chips={<FamilyChip kind="engine" note="fixed rules" />}
          answer={answer.answer}
          condition={why}
          after={
            <div className="flex flex-col gap-2">
              {inShort ? <div data-analyze-it-in-short="" className="cc-text-cell text-cc-ink">{inShort}</div> : null}
              {hero.keyUserLevel ? (
                <p className="m-0 cc-text-cell text-cc-ink" data-key-user-level={hero.keyUserLevel}>
                  Level {hero.keyUserLevel} by construction as key-user extensibility, once each candidate&rsquo;s limits are checked in the target system.
                </p>
              ) : null}
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1" data-analyze-it-provenance="" data-analysis-meta="">
                <p className="m-0 cc-text-meta font-medium text-cc-ink-muted" data-score-run="">
                  {runLine}
                </p>
                <CcDisclosure title="Details">
                  <div className="flex max-w-[60rem] flex-col gap-2" data-analyze-it-provenance-details="">
                    <p className="m-0 flex flex-wrap items-center gap-2 cc-text-meta font-medium text-cc-ink-muted">
                      <FamilyChip kind="engine" note="fixed rules" />
                      no model involved
                    </p>
                    {provenanceDetails.length ? (
                      <p className="m-0 cc-text-meta font-medium text-cc-ink-muted break-words" data-score-source="">
                        {provenanceDetails.join(' · ')}
                      </p>
                    ) : null}
                    {score !== null ? (
                      <EditionRule
                        score={score}
                        edition={hero.edition}
                        freeWrites={addsUp && hero.breakdown ? hero.breakdown.freeOwnTableWrites : 0}
                        other={other}
                        engine={p.engine}
                      />
                    ) : null}
                    {hero.keyUserLevel ? (
                      <p className="m-0 cc-text-meta font-medium text-cc-ink-muted">
                        The engine read the whole program as key user, and a key-user extension uses released extension points
                        only. The engine does not settle every candidate&rsquo;s release; the score measures the code as it stands.
                      </p>
                    ) : null}
                  </div>
                </CcDisclosure>
              </div>
            </div>
          }
          action={scoreBox}
          moreActions={
            addEvidence || exportMenu ? (
              <>
                {addEvidence}
                {exportMenu}
              </>
            ) : undefined
          }
          facets={facets}
        />
      </div>

      <PageAnchorBar
        anchors={anchors}
        label={PAGE_ANCHOR_LABELS.analyze}
        name="analyze-anchor"
        plural="analyze-anchors"
        action={exportMenu ?? undefined}
      />

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ObjectSection
            id="analyze-moves"
            data-analyze-moves=""
            title="What moves the score"
            right={<FamilyChip kind="engine" note="fixed rules" />}
          >
            <ScoreDeductions
              bare
              score={score}
              breakdown={hero.breakdown}
              model={model}
              edition={hero.edition}
              signedLabel="Clean Core Score of the signed run"
              onOpenLine={openLine}
              questionsHref={hero.questionsHref}
              rerunHref={hero.rerunHref}
            />
          </ObjectSection>

          <EvidenceFindingsTable
            layout="main"
            findings={findings}
            sourceLines={sourceLines}
            source={source}
            levels={levels}
            steps={steps}
            notAssessed={notAssessed}
            notes={notes}
            pointsOf={pointsOf}
            fileName={fileName}
          />

          <ItTouches objects={objects} source={source} onOpenLine={openLine} />

          {/* "Ask this case", one question already answered from the branches of the code: no model call, not counted
              (roadmap 2.7 / 6.8, ADR-103). */}
          {askAnswer ? <AskThisCase answer={askAnswer} /> : null}

          <FoldedSection
            id="analyze-summary"
            data-analysis-summary={summary.mode}
            title="Model summary"
            aside={summary.aside}
          >
            {summary.body}
          </FoldedSection>

          <FoldedSection
            id="analyze-technical-detail"
            data-analysis-technical-detail=""
            title="Technical detail"
            revealOn={ANALYZE_IT_DETAIL_PLACES}
          >
            {technicalDetail}
            {hasSource ? (
              <FoldedPart title="Target, route contract and signed run" data-analyze-it-rail="">
                <ItRail
                  projectId={projectId}
                  project={project}
                  source={itSource ?? null}
                  profile={profile}
                  demo={false}
                  fit={fit}
                  contract={contract}
                  trust={trust}
                  deliveryHref={`/project/${encodeURIComponent(projectId)}/delivery?view=it`}
                />
              </FoldedPart>
            ) : null}
            {itSource ? (
              <FoldedPart title="Where it touches SAP standard" data-analyze-it-standard="">
                <div id="standard" data-it-standard="" className="scroll-mt-32">
                  <StandardTouchCard touch={touch}>
                    {touch ? <FitCheckPanel projectId={projectId} project={project} touch={touch} rows={itSource.rows} demo={false} /> : null}
                  </StandardTouchCard>
                </div>
              </FoldedPart>
            ) : null}
            {itSource?.ddicTypes && itSource.ddicTypes.length > 0 ? (
              <div id="it-types" className="scroll-mt-32">
                <DdicTypesCard groups={itSource.ddicTypes} />
              </div>
            ) : null}
            {hasSource ? (
              <FoldedPart title="Business rules, as the code applies them" data-analyze-it-rules="">
                <ItRuleRegister project={project} projectId={projectId} reading={reading} />
              </FoldedPart>
            ) : null}
          </FoldedSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Route, open questions and the main sequence" data-analyze-it-side="">
          <div id={ANALYZE_IT_IDS.route} className="min-w-0 scroll-mt-32">
            {routeCard}
          </div>

          <div id={ANALYZE_IT_IDS.notDetermined} className="min-w-0 scroll-mt-32">
            <NotDeterminedSide
              items={openItems}
              summary={notDeterminedSummary}
              questions={
                <OpenQuestions
                  questions={questions}
                  projectId={projectId}
                  view="it"
                  owner={owner}
                  hasRun={hasRun}
                  recorded={recorded}
                  onAnswered={onAnswered}
                />
              }
            />
          </div>

          {risks.length ? (
            <ObjectSection
              side
              id={ANALYZE_IT_IDS.risks}
              data-analyze-risks={risks.length}
              title="Risks for a change"
              right={<FamilyChip kind="engine" />}
            >
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {risks.map((r) => (
                  <li key={r.key} data-analyze-risk={r.key} className="cc-text-cell text-cc-ink">
                    {r.text}
                    {r.line ? <> {lineChip(r.line, r.lineEnd)}</> : null}
                  </li>
                ))}
              </ul>
            </ObjectSection>
          ) : null}

          {sequence.rows.length ? (
            <ObjectSection
              side
              id={ANALYZE_IT_IDS.sequence}
              data-analyze-sequence={sequence.rows.length}
              title="The main sequence"
              right={<FamilyChip kind="engine" />}
              lead="What the program's entry calls, in order. Everything else runs from these lines."
            >
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {sequence.rows.map((r) => (
                  <li key={`${r.line}-${r.name}`} className="flex min-w-0 items-start gap-2 cc-text-cell text-cc-ink">
                    <span className="shrink-0">{lineChip(r.line)}</span>
                    <span className="min-w-0">
                      <code className="font-cc-mono cc-text-meta font-semibold break-all">{r.name.toLowerCase()}</code>
                      <span className="text-cc-ink-muted">: {humaniseRoutine(r.name).toLowerCase()}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {sequence.more ? (
                <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">and {sequence.more} more calls</p>
              ) : null}
            </ObjectSection>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
