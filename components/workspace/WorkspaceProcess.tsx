'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileCode2 } from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcCodeSurface, { type CcCodeLine } from '@/components/cc/CodeSurface';
import CcLinkButton from '@/components/cc/LinkButton';
import CcTabs from '@/components/cc/Tabs';
import { CcEmptyState } from '@/components/cc/EmptyState';
import CcSkeleton from '@/components/cc/Skeleton';
import type { SaveProcessModelInput, SaveProcessModelResult } from '@/components/process-map/BpmnEditor';
import { useBreakpointS } from '@/hooks/useBreakpointS';
import { useModelAvailability } from '@/hooks/useModelAvailability';
import { useProcessMap } from '@/hooks/useProcessMap';
import { catalogLookupTargetOf } from '@/lib/assessment-target';
import { codeCardLabel, codeCardLines, tokenizeAbapLine, type ProcessMapElement } from '@/lib/process-map';
import { ensureProcessBaseline, fetchLatestRevision, revisionOutcomeSentence, saveProcessRevision } from '@/lib/process-revisions-client';
import { revisionLine } from '@/lib/process-revisions';
import type { OpenedRevision } from '@/components/process-map/BpmnEditor';
import { signedSourceAbsence, signedSourceOf } from '@/lib/signed-source';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import type { NotDetermined, WorkspaceView } from '@/lib/workspace-model';
import { bizLinesLabel, bizShowingLines, wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/**
 * Client only and on demand, as on the Documentation stage: the map pulls
 * bpmn-js, and a reader who never reaches the Business view should not pay
 * for it.
 */
const ProcessMap = dynamic(() => import('@/components/process-map/ProcessMap'), { ssr: false });

/** Lines of context above and below a marked range in the source column. */
const SOURCE_CONTEXT = 6;

type Range = { lineStart: number; lineEnd: number };

/**
 * The process map and its source column in the Business view of a real
 * project — mockup s1, `DESIGN.md` §5.5 and §5.7.
 *
 * **Same data path as the Documentation stage and the demo, no new engine.**
 * The source is the one the active run signed (`lib/signed-source.ts`), the
 * model comes from `useProcessMap` — the hook the Documentation stage uses —
 * and `ProcessMap` is mounted as it is. Nothing here reads the code a second
 * way.
 *
 * **Linked both ways.** Selecting a step on the map (or in the step list, or
 * the outline) marks its lines in the source column; selecting a line range in
 * the column — a step under "Steps by line", or the line of a point that is
 * not determined — selects that step on the map. The selection is held here
 * and handed to the map as a controlled prop, so the two can never disagree.
 *
 * **No map is a state, never a blank.** Loading says what is being read; a
 * project without source, without a signed run, or whose source no longer
 * matches the run says which of the three it is and offers the one action
 * that would change it.
 */
export default function WorkspaceProcess({
  project,
  projectId,
  view,
  notDetermined,
  beforeWrite,
  onWritten,
}: {
  project: Project | null;
  projectId: string;
  view: WorkspaceView;
  /**
   * The Stand check of roadmap 6.9 (CR-15). Saving the map writes a process
   * revision — the very thing the Stand counts — so a save from a screen that
   * has been overtaken stops before it is sent and the notice says why.
   */
  beforeWrite?: () => Promise<boolean>;
  /** A revision this screen wrote, so the Stand holds it and never reports it as somebody else's. */
  onWritten?: (revision: number) => void;
  /**
   * The engine's own list — the second tab of the source column, where each
   * line opens in the first. The full card, with what the record does not
   * carry, stays in the collapsed row of the page (`#not-determined`).
   */
  notDetermined: NotDetermined;
}) {
  const signed = useMemo(() => signedSourceOf(project), [project]);
  const absence = useMemo(() => signedSourceAbsence(project), [project]);
  const availability = useModelAvailability();
  // Read only: opening the workspace writes nothing (roadmap 3.0.2), so a
  // missing traceability quote is not measured from here — the map is drawn
  // from the file either way, and the Documentation stage stores the quote.
  const map = useProcessMap(projectId || null, signed, project?.name || '', availability, { measure: false });
  const isS = useBreakpointS();

  const [plane, setPlane] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /** A range opened from the column itself (a not-determined line) rather than from a step. */
  const [looseRange, setLooseRange] = useState<Range | null>(null);
  const [fullSource, setFullSource] = useState(false);
  const [tab, setTab] = useState<'source' | 'open' | 'steps'>('source');
  const columnRef = useRef<HTMLDivElement>(null);

  const model = map.model;
  const byId = useMemo(() => {
    const out = new Map<string, ProcessMapElement>();
    for (const element of model?.elements ?? []) out.set(element.id, element);
    return out;
  }, [model]);
  const selectedElement = selected ? byId.get(selected) ?? null : null;

  /** Every anchored step, in the order of the code — the column's way back to the map. */
  const stepsByLine = useMemo(
    () =>
      (model?.elements ?? [])
        .filter((e): e is ProcessMapElement & { anchor: Range } => e.anchor !== null)
        .sort((a, b) => a.anchor.lineStart - b.anchor.lineStart || a.anchor.lineEnd - b.anchor.lineEnd),
    [model],
  );

  const selectStep = useCallback((id: string | null) => {
    setSelected(id);
    setLooseRange(null);
    if (id) setTab('source');
  }, []);

  /** From a line in the column to the step it belongs to, when there is one. */
  const openRange = useCallback(
    (range: Range) => {
      const owner = stepsByLine
        .filter((e) => e.anchor.lineStart <= range.lineStart && e.anchor.lineEnd >= range.lineEnd)
        .sort((a, b) => a.anchor.lineEnd - a.anchor.lineStart - (b.anchor.lineEnd - b.anchor.lineStart))[0];
      if (owner) {
        setPlane(owner.plane);
        setSelected(owner.id);
      }
      setLooseRange(owner ? null : range);
      setTab('source');
      columnRef.current?.scrollIntoView({ block: 'nearest' });
    },
    [stepsByLine],
  );

  const marked: Range | null = selectedElement?.anchor ?? looseRange;

  const lines: CcCodeLine[] = useMemo(() => {
    if (!signed) return [];
    if (fullSource) {
      return signed.source.split(/\r\n|\r|\n/).map((text, i) => {
        const number = i + 1;
        const highlighted = !!marked && number >= marked.lineStart && number <= marked.lineEnd;
        return { number, tokens: tokenizeAbapLine(text), ...(highlighted ? { highlighted: true } : {}) };
      });
    }
    return marked ? codeCardLines(signed.source, marked, SOURCE_CONTEXT) : [];
  }, [signed, fullSource, marked]);

  // In the full listing the marked lines are scrolled into view, not left
  // somewhere in a 700-line file.
  useEffect(() => {
    if (!fullSource || !marked) return;
    const node = columnRef.current?.querySelector('[data-cc-code-line="highlighted"]');
    node?.scrollIntoView({ block: 'center' });
  }, [fullSource, marked]);

  /**
   * Keep the draft as a revision — the same two calls the Documentation stage
   * makes, so editing here and there writes the one history (roadmap 3.2).
   */
  const baseRevision = useRef<number | null>(null);
  const save = useCallback(
    async ({ xml }: SaveProcessModelInput): Promise<SaveProcessModelResult> => {
      if (!projectId) return { ok: false, message: wt('biz.saveNoProject') };
      if (beforeWrite && !(await beforeWrite())) return { ok: false, message: wt('biz.saveOvertaken') };
      if (baseRevision.current === null) {
        const baseline = await ensureProcessBaseline(projectId);
        if (!baseline.ok) return { ok: false, message: revisionOutcomeSentence(baseline) };
        if (baseline.created) onWritten?.(baseline.record.revision);
        baseRevision.current = baseline.record.revision;
      }
      const outcome = await saveProcessRevision(projectId, xml, baseRevision.current);
      if (outcome.ok) {
        baseRevision.current = outcome.record.revision;
        onWritten?.(outcome.record.revision);
        return { ok: true, message: revisionOutcomeSentence(outcome), revisionId: String(outcome.record.revision) };
      }
      return { ok: false, message: revisionOutcomeSentence(outcome) };
    },
    [projectId, beforeWrite, onWritten],
  );

  /**
   * The newest revision, whichever screen saved it — and from now on the base
   * the next save is written against, so a save made on the Documentation stage
   * is continued here rather than refused as "moved".
   */
  const openLatest = useCallback(async (): Promise<OpenedRevision | null> => {
    if (!projectId) return null;
    const record = await fetchLatestRevision(projectId);
    if (!record) return null;
    baseRevision.current = record.revision;
    return { revision: record.revision, xml: record.xml, line: revisionLine(record), origin: record.origin };
  }, [projectId]);

  const analyzeHref = stageHref({ base: `/project/${projectId}`, path: 'analyze', view, from: WORKSPACE_RETURN.tools });

  /* ------------------------------------------------------------ no map */

  if (!signed) {
    // No source at all: the answer card, "Next step" (Open Analyze) and the
    // empty Need & process layer below already say so — a fourth box saying
    // it again would only push the one action further down.
    if (absence === 'no-source') return <div data-workspace-process="absent" data-absence="no-source" hidden />;
    const reason =
      absence === 'no-run' ? wt('biz.mapNoRun') : wt('biz.mapChanged');
    return (
      <section data-workspace-process="absent" data-absence={absence ?? 'unknown'} aria-labelledby="workspace-process-title">
        <h2 id="workspace-process-title" className="sr-only">
          {wt('biz.mapTitle')}
        </h2>
        <CcEmptyState
          illustration={<FileCode2 size={28} aria-hidden={true} className="text-cc-ink-muted" />}
          title={wt('biz.mapAbsentTitle')}
          action={
            <CcLinkButton href={analyzeHref} variant="ghost">
              {wt('biz.openAnalyze')}
            </CcLinkButton>
          }
        >
          {reason}
        </CcEmptyState>
      </section>
    );
  }

  /* --------------------------------------------------------- the column */

  const column = (
    <div
      ref={columnRef}
      data-workspace-source-column=""
      className="flex min-w-0 flex-col gap-3 rounded-cc-card border border-cc-line bg-cc-surface p-4"
    >
      <CcTabs
        label={wt('biz.columnLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'source',
            label: wt('biz.tabSource'),
            content: (
              <div data-workspace-source="" className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-cc-mono text-[13px] font-semibold text-cc-ink">{signed.fileName}</span>
                  {marked ? (
                    <CcAnchor label={bizLinesLabel(marked.lineStart, marked.lineEnd)}>
                      {marked.lineStart === marked.lineEnd ? `L${marked.lineStart}` : `L${marked.lineStart}-${marked.lineEnd}`}
                    </CcAnchor>
                  ) : null}
                  {selectedElement ? (
                    <span data-workspace-source-step="" className="text-[13px] font-medium text-cc-ink-muted">
                      {selectedElement.label}
                    </span>
                  ) : null}
                </div>
                {lines.length > 0 ? (
                  <div className={fullSource ? 'max-h-[28rem] overflow-y-auto' : undefined}>
                    <CcCodeSurface
                      lines={lines}
                      label={marked ? codeCardLabel(signed.fileName, marked) : signed.fileName}
                    />
                  </div>
                ) : (
                  <p data-workspace-source-hint="" className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
                    {wt('biz.sourceHint')}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <CcButton onClick={() => setFullSource((v) => !v)} aria-pressed={fullSource} data-workspace-source-full="">
                    {fullSource ? wt('biz.showMarkedOnly') : wt('biz.showFullSource')}
                  </CcButton>
                  {marked && !fullSource ? (
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {bizShowingLines(lines[0]?.number ?? marked.lineStart, lines[lines.length - 1]?.number ?? marked.lineEnd)}
                    </span>
                  ) : null}
                </div>
              </div>
            ),
          },
          {
            value: 'open',
            label: wt('biz.tabNotDetermined'),
            count: notDetermined.noSource ? undefined : notDetermined.count,
            content: (
              <div data-workspace-source-open="" className="flex flex-col gap-3">
                {notDetermined.items.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {notDetermined.items.map((item, i) => {
                      const range = rangeOf(item.anchor);
                      return (
                        <li key={`${item.anchor}-${i}`} data-workspace-source-open-item="" className="flex flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-cc-ink">{item.label}</span>
                            {range ? (
                              <CcAnchor onOpen={() => openRange(range)} label={bizLinesLabel(range.lineStart, range.lineEnd)}>
                                {item.anchor}
                              </CcAnchor>
                            ) : (
                              <CcAnchor tone="unlinked">{item.anchor}</CcAnchor>
                            )}
                          </span>
                          <span className="text-[12px] leading-snug font-medium text-cc-ink-muted">{item.why}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="m-0 text-[13px] leading-snug font-medium text-cc-ink-muted">
                    {notDetermined.noSource ? wt('notDetermined.noSource') : wt('notDetermined.none')}
                  </p>
                )}
              </div>
            ),
          },
          {
            value: 'steps',
            label: wt('biz.tabStepsByLine'),
            count: stepsByLine.length,
            content: (
              <ol data-workspace-steps-by-line="" className="m-0 flex max-h-[28rem] list-none flex-col gap-1 overflow-y-auto p-0">
                {stepsByLine.map((element) => (
                  <li key={element.id} className="flex items-center gap-2">
                    <CcAnchor
                      onOpen={() => {
                        setPlane(element.plane);
                        selectStep(element.id);
                      }}
                      tone={element.id === selected ? 'hot' : 'linked'}
                      label={`${element.label}, ${bizLinesLabel(element.anchor.lineStart, element.anchor.lineEnd)}`}
                    >
                      {element.anchor.lineStart === element.anchor.lineEnd
                        ? `L${element.anchor.lineStart}`
                        : `L${element.anchor.lineStart}-${element.anchor.lineEnd}`}
                    </CcAnchor>
                    <span className="min-w-0 truncate text-[13px] font-medium text-cc-ink">{element.label}</span>
                  </li>
                ))}
              </ol>
            ),
          },
        ]}
      />
    </div>
  );

  /* ------------------------------------------------------------ the map */

  return (
    <div data-workspace-process={model ? 'ready' : map.status} className="flex flex-col gap-4">
      {/* The eyebrow of mockup s1. The map names itself (its own title,
          legend and provenance counts), so the card around it carries none. */}
      <h2
        id="workspace-process-title"
        className="m-0 text-[12px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase"
      >
        {wt('biz.needAndProcess')}
      </h2>
      <div data-coach-target="decision">
        <CcCard>
          {model ? (
            <ProcessMap
              key={isS ? 'steps' : 'map'}
              model={model}
              source={signed.source}
              measuredAt={map.measuredAt}
              usage={project?.usageReport ?? null}
              catalogTarget={project ? catalogLookupTargetOf(project) : null}
              plane={plane}
              onPlaneChange={setPlane}
              selected={selected}
              onSelectedChange={selectStep}
              defaultView={isS ? 'steps' : 'map'}
              save={save}
              openLatest={openLatest}
            />
          ) : map.status === 'failed' ? (
            <p data-workspace-process-failed="" className="m-0 text-[13px] font-medium text-cc-ink-muted">
              {map.reason}
            </p>
          ) : (
            <div data-workspace-process-loading="" className="flex flex-col gap-2">
              <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('biz.mapReading')}</p>
              <CcSkeleton shape="text" count={6} label={wt('biz.mapLoadingLabel')} />
            </div>
          )}
        </CcCard>
      </div>
      {model ? column : null}
    </div>
  );
}

/** `L412` or `L380-412` (also with an en dash) to a line range; null for anything else. */
function rangeOf(anchor: string): Range | null {
  const m = /^L?(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(anchor.trim());
  if (!m) return null;
  const lineStart = Number(m[1]);
  const lineEnd = m[2] ? Number(m[2]) : lineStart;
  return lineEnd >= lineStart ? { lineStart, lineEnd } : null;
}
