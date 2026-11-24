'use client';

import React, { useMemo, useState } from 'react';
import { Boxes, Braces, Check, ChevronRight, CircleDashed, Code2, Container, FileCode2, FileText, FlaskConical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcTable from '@/components/cc/Table';
import { CcSeverity } from '@/components/cc/Identifier';
import AnswerCard, { type FacetProps } from '@/components/family/AnswerCard';
import FamilyChip from '@/components/family/FamilyChip';
import PageAnchorBar from '@/components/PageAnchorBar';
import { PAGE_ANCHOR_LABELS, transformationAnchors } from '@/lib/page-anchors';
import { successorSourceNote } from '@/lib/successor-source';
import { BTP } from '@/lib/sap-naming';
import type { EvidenceFinding } from '@/lib/abap/evidence-model';
import type { CoverageReport } from '@/lib/abap/coverage';
import { readinessFailures, type ChecksTable as ChecksTableModel } from '@/lib/transformation/checks-table';
import { traceOfFiles } from '@/lib/transformation/trace-view';
import {
  codeGeneratedStep,
  formatBytes,
  functionLines,
  functionsByObject,
  notGeneratedReasons,
  objectFlow,
  openItems,
  packageGroups,
  releasedTargets,
  sourceExcerpt,
  traceRows,
  transformationFigures,
  transformationFlow,
  type FileType,
  type GeneratedFile,
  type OpenItemAction,
  type PackageFunction,
  type ProjectTrack,
  type TargetKind,
} from '@/lib/transformation-view';
import TransformationFlowChart, { TARGET_COLOUR } from './TransformationFlow';
import OpenItems from './OpenItems';
import ChecksTable from './ChecksTable';
import CodeDrawer, { type CodeDrawerContent } from './CodeDrawer';

/**
 * The Transformation tool — one page for every reader (ADR-129, `docs/roadmap/transformation-next-mockup.html`).
 *
 *   the answer      what the program became, into which target, how many findings have a *released* target and how
 *                   many wait for a decision; the next step beside it; four facets: Target, Released target, Code
 *                   written, Checks (`AnswerCard`)
 *   On this page    Findings · Open · Package · Checks · Trace (`PageAnchorBar`)
 *   the main column one flow finding → target → object; "Still open" as one list; the package by object with each
 *                   function's code in a drawer; one table of checks; the trace from `traceability.json`, folded
 *   the side        Status of the code, Built on, Not carried over and why
 *
 * Shared by a real project (`app/(app)/project/[projectId]/transformation`) and the demo
 * (`components/demo/DemoWorkspace.tsx`). The demo passes `files={null}`: it makes no model call, so the package and
 * the checks say where the demo stops — never a made-up file. While the code is written (`generation`) the same page
 * answers "Writing the code" and the generation's own screen stands in its main column (ADR-129 (5)).
 *
 * Every figure comes from `lib/transformation-view.ts` and `lib/transformation/checks-table.ts`, which count what the
 * engine, the stored package and its record hold. This component adds no number.
 */

export interface TransformationObjectPageProps {
  findings: readonly EvidenceFinding[];
  coverage: CoverageReport | null;
  track: ProjectTrack;
  /** "Node.js (TypeScript)" or "ABAP Cloud (RAP)" — the track's words. */
  codeKind: string;
  /** The stored package, or null where no model can have run (the demo). */
  files: readonly GeneratedFile[] | null;
  /** The program's technical name, for the question "What became of …?". */
  program?: string | null;
  /** The original source — the old side of the code drawer. */
  legacySource?: string | null;
  /**
   * Places the engine asks a person to look at, not yet ticked on the personal checklist (kept in this browser only,
   * not a sign-off); null when there is no audit (demo). A row of Checks, never a facet.
   */
  openSignOffs: number | null;
  onOpenAudit?: () => void;
  /** The checks of the stored package (`checksTable`); null in the demo. */
  checks?: ChecksTableModel | null;
  /** Rules without a decision (the trace's `openRules`), for "Still open". */
  openRules?: readonly string[] | null;
  /** Where "Still open"'s actions lead; absent: no links (the item says where instead). */
  hrefOf?: ((action: OpenItemAction) => string) | null;
  /** The next step: the one primary action of the answer, its note, and the actions under it. */
  action?: React.ReactNode;
  actionNote?: React.ReactNode;
  moreActions?: React.ReactNode;
  /** The code is being written now: functions written so far, of how many (null before the scaffold). */
  generation?: { written: number | null; total: number | null; remaining?: string | null } | null;
  /** Buttons in the package section's header: all code side by side, download. */
  packageActions?: React.ReactNode;
  /** Shown in the package section when `files` is an empty list. */
  emptyPackage?: React.ReactNode;
  /** The first section of the main column while the code is written: the generation's own screen. */
  running?: React.ReactNode;
  /** Under the checks table: the lists behind a failed row (the hard-coded values, the code lints, file by file). */
  checkDetails?: React.ReactNode;
  /** The side column's "Built on" (the stored package's basis), drawn by the page. */
  builtOn?: React.ReactNode;
  /** Under the two columns: "Generate again", the all-code viewer. */
  after?: React.ReactNode;
  /**
   * The Transformation phase as the tool bar reads it (`workflowSteps`): its state, badge and detail. "Status of
   * the code" ticks "Code generated" only when it is done (3.0.23). Absent in the demo.
   */
  codePhase?: { state: string; badge: string; detail: string } | null;
}

const sectionCls = 'min-w-0 scroll-mt-28 rounded-cc-card border border-cc-line bg-cc-surface shadow-cc';

function Section({ id, title, chip, right, lead, children }: { id: string; title: React.ReactNode; chip?: React.ReactNode; right?: React.ReactNode; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn(sectionCls, 'px-5 py-4 max-[720px]:px-4')} data-transformation-section={id}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} tabIndex={-1} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
            {title}
            {chip}
          </h2>
          {lead ? <p className="m-0 mt-1 max-w-[860px] cc-text-cell text-cc-ink-muted">{lead}</p> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
      </header>
      {children}
    </section>
  );
}

function Line({ n }: { n: number }) {
  return <CcAnchor label={`Source line ${n}`}>{`L${n}`}</CcAnchor>;
}

const FILE_ICON: Record<FileType, React.ReactNode> = {
  code: <FileCode2 size={22} aria-hidden={true} />,
  config: <Braces size={22} aria-hidden={true} />,
  container: <Container size={22} aria-hidden={true} />,
  model: <Boxes size={22} aria-hidden={true} />,
  test: <FlaskConical size={22} aria-hidden={true} />,
  other: <FileText size={22} aria-hidden={true} />,
};

const FILE_TONE: Record<FileType, string> = {
  code: 'bg-cc-information-bg border-cc-information-border text-cc-information',
  config: 'bg-cc-surface-muted border-cc-line text-cc-ink-muted',
  container: 'bg-cc-surface border-cc-chart-3 text-cc-chart-3',
  model: 'bg-cc-surface border-cc-seq-2 text-cc-seq-4',
  test: 'bg-cc-surface-muted border-cc-line text-cc-ink-muted',
  other: 'bg-cc-surface-muted border-cc-line text-cc-ink-muted',
};

/** What the program becomes, in a business reader's words (mock-up T2, T13: it *aims at* a level, never *is* one). */
function targetWords(track: ProjectTrack): { sentence: string; facet: string; note: string } {
  return track === 'in-app'
    ? {
        sentence: 'a RAP business object in ABAP Cloud: developer extensibility inside your SAP system',
        facet: 'ABAP Cloud',
        note: 'A RAP business object: developer extensibility, in-app. Aims at clean core level A, reached only once every call is released.',
      }
    : {
        sentence: `a CAP service on ${BTP}: side-by-side extensibility outside your SAP system`,
        facet: 'CAP',
        note: `A Node.js service, side-by-side on ${BTP}. Aims at clean core level A, reached only once every call is released.`,
      };
}

type PageState = 'demo' | 'running' | 'none' | 'stored';

/** Who wrote a function's body, as a chip. */
function BodyChip({ fn }: { fn: PackageFunction }) {
  if (fn.owner === 'engine') return <FamilyChip kind="engine" />;
  if (fn.filledBy === 'not-filled') return <FamilyChip kind="not-determined" note="not written" />;
  if (fn.filledBy === 'empty') return <FamilyChip kind="not-determined" note="left empty" />;
  return <FamilyChip kind="ai" note={fn.filledBy && fn.filledBy !== 'model' ? 'body, repaired' : 'body'} />;
}

export default function TransformationObjectPage({
  findings,
  coverage,
  track,
  codeKind,
  files,
  program,
  legacySource,
  onOpenAudit,
  checks,
  openRules,
  hrefOf,
  action,
  actionNote,
  moreActions,
  generation,
  packageActions,
  emptyPackage,
  running,
  checkDetails,
  builtOn,
  after,
  codePhase,
}: TransformationObjectPageProps) {
  const [drawer, setDrawer] = useState<CodeDrawerContent | null>(null);
  const figures = useMemo(() => transformationFigures(findings), [findings]);
  const released = useMemo(() => releasedTargets(findings, track), [findings, track]);
  const flow = useMemo(() => transformationFlow(findings, track), [findings, track]);
  // While the code is written the stored package (if any) is about to be replaced: nothing is read from it.
  const trace = useMemo(() => (files && files.length > 0 && !generation ? traceOfFiles(files) : null), [files, generation]);
  const objects = useMemo(() => (files && trace ? objectFlow(findings, track, trace, files) : null), [findings, track, trace, files]);
  const rows = useMemo(() => traceRows(findings, track, trace), [findings, track, trace]);
  const reasons = useMemo(() => notGeneratedReasons(findings, coverage), [findings, coverage]);
  const open = useMemo(() => openItems(findings, coverage, track, openRules ?? trace?.openRules ?? null), [findings, coverage, track, openRules, trace]);
  const groups = useMemo(() => packageGroups(files ?? []), [files]);
  const fnsByObject = useMemo(() => functionsByObject(trace), [trace]);
  // Engine-led: the engine built the frame, the model wrote function bodies into it.
  const engineLed = groups.some((g) => g.author !== 'whole-model');
  const generated = files !== null && files.length > 0;
  const state: PageState = files === null ? 'demo' : generation ? 'running' : generated ? 'stored' : 'none';
  const abap = track === 'in-app';
  const target = targetWords(track);
  const name = program?.trim() || 'the program';
  const fnTotal = trace ? trace.functions.length : null;

  // The answer (mock-up T2): each state writes its own.
  const { hard, soft } = readinessFailures(checks);
  const notReady = state === 'stored' && (hard.length > 0 || codePhase?.state === 'partial');
  const releasedSentence =
    released.findings === 0
      ? 'The engine reported no finding for this source.'
      : `${released.released} of its ${released.findings} findings ${released.released === 1 ? 'has' : 'have'} a released target`;
  const failures = (list: typeof hard) => list.map((r) => r.failure ?? r.check.toLowerCase()).join(', ');
  let answer: React.ReactNode;
  let condition: React.ReactNode;
  let chips: React.ReactNode;
  if (state === 'demo') {
    chips = <FamilyChip kind="engine" note="plan" />;
    answer = `The demo stops where the model begins. The plan is real: ${name} would become ${target.sentence}${released.findings > 0 ? `; ${releasedSentence.charAt(0).toLowerCase()}${releasedSentence.slice(1)}${released.open > 0 ? `, ${released.open} need a decision` : ''}` : ''}.`;
    condition = 'In your own project a model writes the function bodies into the engine’s frame. The demo never fakes them, so it shows no code.';
  } else if (state === 'running') {
    chips = <FamilyChip kind="ai" note="writing" />;
    answer = generation?.written !== null && generation?.written !== undefined && generation?.total ? `Writing the code: ${generation.written} of ${generation.total} functions done.` : 'Writing the code.';
    condition = `The engine writes the frame first. The model then fills the function bodies; each body is checked against the frame before it is kept.${generation?.remaining ? ` ${generation.remaining.charAt(0).toUpperCase()}${generation.remaining.slice(1)}.` : ''}`;
  } else if (state === 'none') {
    chips = <FamilyChip kind="engine" note="plan" />;
    answer =
      released.findings > 0
        ? `Nothing generated yet. The plan is ready: ${name} becomes ${target.sentence}. ${releasedSentence}${released.open > 0 ? `; ${released.open} need your decision. You can generate now, and they stay marked open` : ''}.`
        : `Nothing generated yet. The plan is ready: ${name} becomes ${target.sentence}.`;
    condition = `The engine writes the frame: ${abap ? 'the business object, its checks' : 'the service, its checks'}, one function per routine. A model writes only the function bodies.`;
  } else if (notReady) {
    chips = <FamilyChip kind="ai" note="code" />;
    answer = `The code was written but is not ready yet: ${failures(hard.length > 0 ? hard : soft) || (codePhase?.badge ?? 'see Checks').toLowerCase()}.`;
    condition = `The target is unchanged: ${target.sentence}. ${released.findings > 0 ? `${releasedSentence}. ` : ''}Generating again writes the code anew; the stored package is replaced only when the new one is stored.`;
  } else {
    chips = <FamilyChip kind="ai" note="code" />;
    const head = soft.length > 0 ? `${name} is now ${target.sentence}, but ${failures(soft)}.` : `${name} is now ${target.sentence}.`;
    answer =
      released.findings > 0
        ? `${head} ${releasedSentence}${released.open > 0 ? `; ${released.open} wait for your decision and are marked open in the code` : ''}.`
        : head;
    const writers = engineLed
      ? `The engine wrote the frame of ${groups.length} ${groups.length === 1 ? 'object' : 'objects'}; a model wrote the function bodies.`
      : `A model wrote the package in one call.`;
    condition = `${writers} Nothing has been ${abap ? 'activated or tested in an SAP system: that happens in yours' : 'started or run here: Testing runs it against mocks'}.`;
  }

  // The four facets (mock-up T2): Target · Released target · Code written · Checks.
  const stack = flow.targets.map((t) => ({ kind: t.kind, count: t.count, label: t.label }));
  const leftEmpty = [...fnsByObject.values()].flat().filter((f) => f.filledBy === 'not-filled' || f.filledBy === 'empty').length;
  const codeFacet: FacetProps =
    state === 'demo'
      ? { id: 'code', label: 'Code written', value: 'None', note: 'None in a demo: the demo makes no model call.' }
      : state === 'running'
        ? {
            id: 'code',
            label: 'Code written',
            value: generation?.written ?? '—',
            unit: generation?.total ? `of ${generation.total} functions` : 'functions',
            note: 'Frame by the engine · bodies in progress, by the model',
            chip: <FamilyChip kind="ai" />,
          }
        : state === 'none'
          ? { id: 'code', label: 'Code written', value: 'Not yet', note: 'The engine writes the frame and a model the function bodies when you generate.' }
          : {
              id: 'code',
              label: 'Code written',
              value: fnTotal !== null ? fnTotal - leftEmpty : files!.length,
              unit: fnTotal !== null ? `of ${fnTotal} functions` : files!.length === 1 ? 'file' : 'files',
              note: engineLed
                ? `Frame by the engine, bodies by the model · ${groups.length} ${groups.length === 1 ? 'object' : 'objects'}, ${files!.length} files`
                : `Written by a model in one call · ${groups.length} ${groups.length === 1 ? 'object' : 'objects'}`,
              chip: <FamilyChip kind="ai" />,
              href: '#tf-package',
            };
  const checksFacet: FacetProps =
    state === 'demo'
      ? { id: 'checks', label: 'Checks', value: 'None', note: 'None in a demo: they check generated code, and a demo has none.' }
      : state === 'running'
        ? { id: 'checks', label: 'Checks', value: 'Not run yet', note: 'They run when the last function is written, before anything is stored.', href: '#tf-checks' }
        : state === 'none' || !checks
          ? { id: 'checks', label: 'Checks', value: 'None yet', note: `${abap ? 'abaplint' : 'The type check'}, body guards, lints and file formats run on the generated code.`, href: '#tf-checks' }
          : {
              id: 'checks',
              label: 'Checks',
              value: checks.failed > 0 ? checks.failed : checks.passed,
              unit: checks.failed > 0 ? `checks failed · ${checks.passed} passed` : 'checks passed · 0 failed',
              note: `${checks.notRun} not run here: ${abap ? 'activation and ABAP Unit happen in your SAP system' : 'the service starts and runs in your environment'}.`,
              href: '#tf-checks',
            };
  const facets: FacetProps[] = [
    { id: 'target', label: 'Target', value: target.facet, note: target.note },
    {
      id: 'released',
      label: 'Released target',
      value: released.released,
      unit: `of ${released.findings} ${released.findings === 1 ? 'finding' : 'findings'}`,
      href: '#tf-flow',
      note:
        released.findings > 0 ? (
          <span className="block" data-transformation-places={figures.places}>
            <span className="mt-1 flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={stack.map((s) => `${s.count} ${s.label}`).join(', ')}>
              {stack.map((s) => (
                <span key={s.kind} className="block h-full" style={{ flexGrow: s.count, background: TARGET_COLOUR[s.kind as TargetKind] }} />
              ))}
            </span>
            <span className="mt-1 block">
              {released.open > 0 ? `${released.open} open: no released successor or no decided home` : 'every finding has a released target'}
            </span>
          </span>
        ) : (
          'No finding, so nothing to target.'
        ),
    },
    codeFacet,
    checksFacet,
  ];

  // "On this page" (ADR-126 (3), mock-up T10).
  const anchors = transformationAnchors({
    findings: figures.findings,
    open: open.length,
    objects: state === 'stored' ? groups.length : null,
    checksFailed: state === 'stored' && checks ? checks.failed : 0,
  });

  /** Opens one function of the package in the drawer: the old ABAP beside it, every new line marked. */
  const openFunction = (fn: PackageFunction) => {
    const file = files?.find((f) => f.path === fn.file);
    if (!file) return;
    const lines = functionLines(file.content, { name: fn.name, unitId: fn.unitId }, !engineLed);
    const tfn = trace?.functions.find((f) => f.name === fn.name && f.file === fn.file);
    const carried = rows.find((r) => r.where?.fn === fn.name && r.where.file === fn.file);
    setDrawer({
      title: fn.name,
      oldHead: legacySource && tfn && tfn.abap.length > 0 ? `${name} · ABAP · ${fn.abap}` : null,
      oldLines: legacySource && tfn ? sourceExcerpt(legacySource, tfn.abap) : [],
      newHead: `${groupLabel(fn.file)} · ${codeKind}`,
      newLines: lines ?? [],
      trail: [
        ...(carried ? [`Finding · ${carried.title}`, `Target · ${carried.target.label}`] : []),
        `${groupLabel(fn.file)} · ${fn.name}`,
        ...(fn.rules.length > 0 ? [`Rule ${fn.rules.join(' · ')}`] : []),
      ],
      empty: fn.filledBy === 'not-filled' ? 'not written' : fn.filledBy === 'empty' ? 'left empty' : null,
      wholeModel: !engineLed,
    });
  };
  const groupLabel = (path: string) => groups.find((g) => g.files.some((f) => f.path === path))?.name ?? path;

  const steps = [
    { done: findings.length > 0, text: 'Plan written by the engine', note: `${figures.findings} findings${figures.places !== figures.findings ? ` at ${figures.places} places in the code` : ''}` },
    state === 'running'
      ? { done: false, text: 'Code being written', note: generation?.total ? `${generation.written ?? 0} of ${generation.total} functions` : 'the frame first, then the bodies' }
      : // 3.0.23: no done tick while the tool bar says the stored package is not activatable (or not runnable, or
        // partial) — the step says what the tool bar says.
        codeGeneratedStep({
          generated,
          packageNote: !generated ? '' : engineLed ? `${groups.length} objects: frame by the engine, function bodies by the model` : `${files!.length} files, AI-generated`,
          emptyNote: files === null ? 'not in a demo' : 'not yet',
          phase: codePhase ?? null,
        }),
    {
      done: state === 'stored' && !!checks && checks.failed === 0,
      text: 'Checked here',
      note: state === 'stored' && checks ? `${checks.passed} passed, ${checks.failed} failed` : 'after the code is written',
    },
    {
      done: false,
      text: abap ? 'Activated and tested' : 'Started and run',
      note: abap ? 'only in your own SAP system, after the abapGit import; Testing writes the ABAP Unit cases' : 'not here; mocks only in Testing',
    },
  ];

  return (
    <div className="cc-transformation-page flex flex-col" data-transformation-object-page="" data-transformation-state={notReady ? 'not-ready' : state}>
      <AnswerCard
        id="tf-answer"
        question={<span data-transformation-question="">What became of {name}?</span>}
        chips={chips}
        answer={answer}
        condition={condition}
        action={action}
        actionNote={actionNote}
        moreActions={moreActions}
        facets={facets}
      />

      <PageAnchorBar anchors={anchors} label={PAGE_ANCHOR_LABELS.transformation} name="tf-anchor" plural="tf-anchors" />

      <div className="grid grid-cols-1 items-start gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {running}

          <Section
            id="tf-flow"
            title="Where each finding went"
            right={<FamilyChip kind="engine" />}
            lead="Left, what the old code does that does not fit a clean core; middle, its target; right, the object of the new package that now carries it. Band width is the number of findings. Choose a target to see its findings."
          >
            <div className="mt-3">
              <TransformationFlowChart
                flow={flow}
                objects={objects}
                rows={rows}
                findings={figures.findings}
                places={figures.places}
                empty={
                  state === 'demo'
                    ? { head: 'WHERE IT WOULD GO', title: 'The demo stops here', sub: 'no model call, so no objects' }
                    : state === 'running'
                      ? { head: 'WHERE IT WILL GO', title: 'Being written', sub: 'the objects follow once the package is stored' }
                      : generated
                        ? { head: 'WHERE IT IS NOW', title: 'Not recorded', sub: 'this package carries no trace of its functions' }
                        : { head: 'WHERE IT WILL GO', title: 'No code generated yet', sub: 'generate to write the objects' }
                }
              />
            </div>
          </Section>

          <Section
            id="tf-open"
            title="Still open"
            lead={
              generated
                ? 'What the code carries over as the original did, or not at all, until someone decides. Each is marked in the code and listed in STATUS.md.'
                : 'What a generation would carry over as the original did, or not at all, until someone decides. You can generate before deciding; these stay marked open.'
            }
          >
            <OpenItems items={open} hrefOf={hrefOf ?? null} />
          </Section>

          <section id="tf-package" aria-labelledby="tf-package-title" className={cn(sectionCls, 'px-5 py-4 max-[720px]:px-4')} data-transformation-section="tf-package">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="tf-package-title" tabIndex={-1} className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
                  The package
                  {generated ? <FamilyChip kind="ai" /> : null}
                </h2>
                <p className="m-0 mt-1 max-w-[860px] cc-text-cell text-cc-ink-muted">
                  {files === null
                    ? 'In a real project the engine writes the frame and a model fills the function bodies. The demo makes no model call, so it has none.'
                    : state === 'running'
                      ? 'The engine writes every object’s frame; the model fills the function bodies. The package is stored when the last check ran.'
                      : track === 'in-app'
                        // ABAP Unit does not run here at all: the Testing tool writes the class and says your own system
                        // gives the verdict (the browser-side "simulated run" is gone since 02.10.2026).
                        ? `${engineLed ? 'The engine built the frame of every object; the model wrote the function bodies. Open an object for its functions; Code shows the old ABAP beside the new function.' : 'Written by the model against the plan.'} Not compiled and not run here; the Testing tool writes ABAP Unit scenarios for it, which run only in your own system.`
                        : `${engineLed ? 'The engine built the frame of every module; the model wrote the function bodies. Open a folder for its functions; Code shows the old ABAP beside the new function.' : 'Written by the model against the plan.'} Not compiled and not run here; the Testing tool runs it against mocks.`}
                </p>
              </div>
              {generated && packageActions ? <div className="flex flex-wrap items-center gap-2">{packageActions}</div> : null}
            </header>
            {files === null ? (
              <div className="mt-3 rounded-cc-row border border-dashed border-cc-line bg-cc-surface px-4 py-4" data-demo-package="">
                <p className="m-0 cc-text-h3 text-cc-ink">The demo stops where the model begins.</p>
                <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
                  The code comes from a model call against your source, and the demo never fakes it. What you see above is
                  the engine&apos;s.
                </p>
              </div>
            ) : state === 'running' ? null : files.length === 0 ? (
              <div className="mt-3">{emptyPackage}</div>
            ) : (
              // By object, not file by file (dev acceptance 14.10.2026): a class with its local classes and metadata is
              // one row; open it for its functions and its files.
              <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0" data-package-files="" data-package-groups={groups.length}>
                {groups.map((g) => {
                  const fns = fnsByObject.get(g.key) ?? [];
                  const needsWork = fns.some((f) => f.filledBy === 'not-filled' || f.filledBy === 'empty');
                  return (
                    <li key={g.key} className="min-w-0 rounded-cc-row border border-cc-line bg-cc-surface" data-package-group={g.key}>
                      <details className="group">
                        <summary className="grid cursor-pointer list-none grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[36px_minmax(0,1fr)_auto] [&::-webkit-details-marker]:hidden">
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-row border [&_svg]:h-[18px] [&_svg]:w-[18px]', FILE_TONE[g.type])}>
                            {FILE_ICON[g.type]}
                          </span>
                          <span className="min-w-0">
                            <span className="block break-all cc-text-identifier font-cc-mono text-cc-ink">{g.name}</span>
                            <span className="block cc-text-meta font-medium text-cc-ink-muted">
                              {g.kind} · {fns.length > 0 ? `${fns.length} ${fns.length === 1 ? 'function' : 'functions'} · ` : ''}
                              {g.files.length} {g.files.length === 1 ? 'file' : 'files'} · {g.lines} {g.lines === 1 ? 'line' : 'lines'}
                            </span>
                          </span>
                          <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:col-start-auto" data-package-author={g.author}>
                            {needsWork ? <FamilyChip kind="not-determined" note="needs work" /> : null}
                            {g.author === 'engine' ? (
                              <FamilyChip kind="engine" />
                            ) : g.author === 'model' ? (
                              <>
                                <FamilyChip kind="engine" note="frame" />
                                <FamilyChip kind="ai" note="bodies" />
                              </>
                            ) : (
                              <FamilyChip kind="ai" />
                            )}
                            {/* The row's disclosure cue (3.0.18): the native marker is hidden, so the chevron says the row opens, and turns with it. */}
                            <ChevronRight size={16} aria-hidden={true} className="ml-auto shrink-0 text-cc-ink-muted transition-transform group-open:rotate-90" data-package-disclosure="" />
                          </span>
                        </summary>
                        <div className="border-t border-cc-line px-3 py-2">
                          {fns.length > 0 ? (
                            <ul className="m-0 list-none p-0" data-package-functions={fns.length}>
                              {fns.map((fn) => (
                                <li
                                  key={`${fn.file}:${fn.name}`}
                                  data-package-function={fn.name}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-cc-line py-2 last:border-b-0 cc-text-cell md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto]"
                                >
                                  <span className="min-w-0">
                                    <span className="block break-all font-cc-mono text-[13px] font-semibold text-cc-ink">{fn.name}</span>
                                    {fn.title ? <span className="block cc-text-meta text-cc-ink-muted">{fn.title}</span> : null}
                                  </span>
                                  <span className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1 cc-text-meta text-cc-ink-muted md:col-span-1 md:row-start-auto">
                                    {fn.abap ? <>ABAP {fn.abap}</> : 'no ABAP lines: written by the engine'}
                                    {fn.rules.slice(0, 3).map((r) => (
                                      <CcAnchor key={r}>{r}</CcAnchor>
                                    ))}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-1">
                                    <BodyChip fn={fn} />
                                  </span>
                                  <span>
                                    <CcButton density="compact" icon={<Code2 size={14} aria-hidden={true} />} onClick={() => openFunction(fn)} data-open-function-code={fn.name}>
                                      Code
                                    </CcButton>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <ul className="m-0 list-none p-0 pt-1">
                            {g.files.map((c) => (
                              <li key={c.path} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 py-1 cc-text-cell" data-package-file={c.path}>
                                <span className="min-w-0 break-all font-cc-mono text-[12px] text-cc-ink">{c.path}</span>
                                <span className="cc-text-meta font-medium text-cc-ink-muted">
                                  {c.role} · {c.lines} {c.lines === 1 ? 'line' : 'lines'} · {formatBytes(c.bytes)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Section id="tf-checks" title="Checks" lead="Three outcomes, never two: passed, failed, or not run. Each row says who ran the check.">
            {state === 'demo' || !checks ? (
              <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted" data-checks-none="">
                {state === 'demo' ? 'None in a demo: the checks read generated code, and a demo has none.' : 'Nothing to check yet: the checks read the generated code.'}
              </p>
            ) : (
              <ChecksTable
                table={checks}
                onOpenChecklist={onOpenAudit}
                footNote={
                  state === 'stored'
                    ? `Every check except ${abap ? 'abaplint' : 'the type check'} is the report of the browser that generated the package: Clean-Core.io's server stored it as sent and did not run those checks again. A check passes only when it ran; nothing on this page says the code is tested or deployable.`
                    : null
                }
              />
            )}
            {checkDetails}
          </Section>

          <details id="tf-trace" className={cn(sectionCls, 'group')} data-transformation-section="tf-trace">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 [&::-webkit-details-marker]:hidden max-[720px]:px-4">
              <ChevronRight size={16} aria-hidden={true} className="shrink-0 text-cc-ink-muted transition-transform group-open:rotate-90" />
              <h2 id="tf-trace-title" className="m-0 cc-text-h2 text-cc-ink">
                Finding by finding
              </h2>
              <span className="cc-text-meta text-cc-ink-muted min-[721px]:ml-auto">
                all {rows.length} · old lines → target → new code · for developers
              </span>
            </summary>
            <div className="px-5 pb-4 max-[720px]:px-4">
              <p className="m-0 mb-2 cc-text-cell text-cc-ink-muted">
                One row per finding (pattern and object), with every place in the old code. Where in the new code comes from the
                package’s traceability.json, where the engine wrote each function’s ABAP lines, not from a text search.
              </p>
              <div data-trace-rows={rows.length}>
                <CcTable
                  caption="Finding by finding: old lines, target, new code"
                  columns={[
                    { key: 'finding', label: 'Finding', width: '28%' },
                    { key: 'old', label: 'Old code', width: '14%' },
                    { key: 'target', label: 'Target', width: '20%' },
                    { key: 'sure', label: 'How sure', width: '16%' },
                    { key: 'where', label: 'Where in the new code' },
                  ]}
                  rows={rows.map((r) => ({
                    key: r.id,
                    cells: {
                      finding: (
                        <span className={cn('block', r.open && 'border-l-[3px] border-cc-warning-mark pl-2')} data-trace-row={r.id} data-trace-open={r.open ? '' : undefined}>
                          <span className="flex flex-wrap items-center gap-2">
                            <CcSeverity value={r.severity} />
                            <span className="text-cc-ink">{r.title}</span>
                          </span>
                          {r.object ? <span className="block font-cc-mono text-cc-ink-muted">{r.object}</span> : null}
                        </span>
                      ),
                      old: (
                        <span className="flex flex-wrap gap-1">
                          {r.lines.slice(0, 4).map((n) => (
                            <Line key={n} n={n} />
                          ))}
                          {r.lines.length > 4 ? <span className="text-cc-ink-muted">+{r.lines.length - 4}</span> : null}
                        </span>
                      ),
                      target: (
                        <span className="block">
                          <span className={cn('block text-cc-ink', r.target.kind === 'successor' && 'font-cc-mono font-semibold')} data-finding-target={r.target.kind}>
                            {r.target.label}
                          </span>
                          {r.target.successorType ? <span className="block text-cc-ink-muted">{r.target.successorType}</span> : null}
                        </span>
                      ),
                      sure:
                        r.target.kind === 'successor' ? (
                          successorSourceNote(r.target.successorConfidence)
                        ) : r.target.kind === 'route' ? (
                          'Project route'
                        ) : (
                          <span className="text-cc-ink-muted">Not determined</span>
                        ),
                      where:
                        state === 'demo' ? (
                          <span className="text-cc-ink-muted">none in a demo</span>
                        ) : r.where ? (
                          <span className="block">
                            <span className="block font-cc-mono text-cc-ink">{r.where.object}</span>
                            <span className="block text-cc-ink-muted">{r.where.fn}</span>
                          </span>
                        ) : (
                          <span className="text-cc-ink-muted">{generated ? (trace ? 'not in the package' : 'not recorded: no trace') : 'nothing written yet'}</span>
                        ),
                    },
                  }))}
                />
              </div>
            </div>
          </details>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 min-[1101px]:sticky min-[1101px]:top-24" aria-label="Status and limits">
          <section aria-labelledby="tf-status-title" className={cn(sectionCls, 'px-4 py-3')}>
            <h2 id="tf-status-title" className="m-0 cc-text-h3 text-cc-ink">
              Status of the code
            </h2>
            <ol className="m-0 mt-2 flex list-none flex-col gap-2 p-0" data-code-status="">
              {steps.map((s, i) => {
                const failed = s.text.startsWith('Generated ·');
                return (
                  <li key={s.text} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 cc-text-cell text-cc-ink">
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                        s.done ? 'border-cc-success bg-cc-success text-cc-on-dark' : failed ? 'border-cc-error bg-cc-error text-cc-on-dark' : 'border-cc-line bg-cc-surface text-cc-ink-muted',
                      )}
                    >
                      {s.done ? <Check size={12} aria-hidden={true} /> : failed ? <X size={12} aria-hidden={true} /> : i + 1}
                    </span>
                    <span>
                      {s.text}
                      <span className="block cc-text-meta text-cc-ink-muted">{s.note}</span>
                      <span className="sr-only">{s.done ? ' (done)' : ' (open)'}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {builtOn}

          <section aria-labelledby="tf-not-generated-title" className={cn(sectionCls, 'px-4 py-3')}>
            <h2 id="tf-not-generated-title" className="m-0 flex flex-wrap items-center gap-2 cc-text-h3 text-cc-ink">
              Not carried over, and why <FamilyChip kind="engine" />
            </h2>
            {reasons.length === 0 ? (
              <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">The engine names no gap a generation cannot carry over.</p>
            ) : (
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0" data-not-generated="">
                {reasons.map((r) => (
                  <li key={r.key} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 cc-text-cell text-cc-ink">
                    <CircleDashed size={15} aria-hidden={true} className="mt-0.5 shrink-0 text-cc-ink-muted" />
                    <span>
                      {r.text}{' '}
                      {r.lines.map((l) => (
                        <React.Fragment key={l}>
                          <Line n={l} />{' '}
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {after ? <div className="mt-6 flex flex-col gap-4">{after}</div> : null}
      <CodeDrawer content={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}

export type { TargetKind };
