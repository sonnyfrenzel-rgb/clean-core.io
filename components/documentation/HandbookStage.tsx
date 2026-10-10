'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Database,
  PenLine,
  PhoneCall,
  TriangleAlert,
  User,
} from 'lucide-react';
import CcAnchor from '@/components/cc/Anchor';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcTabs from '@/components/cc/Tabs';
import { CcTag } from '@/components/cc/Tag';
import ProcessCodeCard from '@/components/process-map/ProcessCodeCard';
import { MAP_REVEAL_EVENT } from '@/components/process-map/bpmn-view';
import type { ProcessMapElement, ProcessMapModel } from '@/lib/process-map';
import type {
  HandbookAnchor,
  HandbookChapter,
  HandbookObject,
  ProcessHandbook,
} from '@/lib/process-handbook';
import { cn } from '@/lib/utils';
import './handbook.css';

/**
 * The Documentation stage as a canvas — proposal B, chosen by the owner on
 * 01.10.2026 ("not enterprise-worthy, and practically prepared for the end
 * user").
 *
 * The process map is the stage. Beside it stands one chapter of the handbook:
 * the step the reader selected on the map, or the first one until they do.
 * Everything in a chapter comes out of `lib/process-handbook.ts`, which picks it
 * out of what the engine already read from the signed source — nothing here is
 * written by a model, and roles appear only where a stored model proposal names
 * one, under its own chip.
 *
 * The map itself is the product's `ProcessMap` in its `stage` layout, handed in
 * as `map`: same renderer, same keys, same address, same editor. This file only
 * arranges the room around it.
 *
 * Roadmap 3.0.7 ("Documentation lean"): the row of four key figures above the
 * map and the inputs and outputs under it are gone — the description above
 * the map carries its own six key figures, and its sections 2 and 6 the
 * selection screen, the tables read and every effect, each once.
 */

/** `L95` / `L95–114`. */
export function anchorText(anchor: HandbookAnchor): string {
  return anchor.lineStart === anchor.lineEnd ? `L${anchor.lineStart}` : `L${anchor.lineStart}–${anchor.lineEnd}`;
}

export function anchorLabel(anchor: HandbookAnchor): string {
  return anchor.lineStart === anchor.lineEnd
    ? `Source line ${anchor.lineStart}`
    : `Source lines ${anchor.lineStart} to ${anchor.lineEnd}`;
}

export function LineAnchor({ anchor, hot = false }: { anchor: HandbookAnchor | null; hot?: boolean }) {
  if (!anchor) return <CcAnchor tone="unlinked" label="No line range">no lines</CcAnchor>;
  return (
    <CcAnchor tone={hot ? 'hot' : 'linked'} label={anchorLabel(anchor)}>
      {anchorText(anchor)}
    </CcAnchor>
  );
}

export interface HandbookStageProps {
  handbook: ProcessHandbook | null;
  /** True while the handbook is still being read out of the source. */
  reading: boolean;
  model: ProcessMapModel | null;
  /** `<ProcessMap layout="stage" … />`, or a sentence saying why there is none. */
  map: React.ReactNode;
  /** The selected element (any level), from the page's address. */
  selected: string | null;
  onSelect: (elementId: string | null) => void;
  /** The signed source — the code card shows its lines and nothing else. */
  source: string | null;
}

export default function HandbookStage({
  handbook,
  reading,
  model,
  map,
  selected,
  onSelect,
  source,
}: HandbookStageProps) {
  const byId = useMemo(() => new Map((model?.elements ?? []).map((e) => [e.id, e])), [model]);
  const chapters = handbook?.chapters ?? [];
  const selectedElement = selected ? (byId.get(selected) ?? null) : null;
  const chapterId = selected ? (handbook?.chapterOf.get(selected) ?? null) : null;
  const chapter = chapterId
    ? (chapters.find((c) => c.id === chapterId) ?? null)
    : selected
      ? null
      : (chapters[0] ?? null);

  /**
   * A step chosen on the map in full screen closes full screen (`BpmnCanvas`)
   * and the chapter it belongs to is brought on screen — beside the map from
   * L, under it below.
   */
  const stageRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reveal = () => {
      stage.querySelector<HTMLElement>('[data-handbook-panel]')?.scrollIntoView({ block: 'nearest' });
    };
    stage.addEventListener(MAP_REVEAL_EVENT, reveal);
    return () => stage.removeEventListener(MAP_REVEAL_EVENT, reveal);
  }, []);

  return (
    <section
      ref={stageRef}
      data-handbook-stage=""
      aria-label="Process map and handbook"
      className={cn(
        'overflow-hidden rounded-cc-card border border-cc-line',
        'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]',
        // Editing takes the whole width — the modeller has its own panel.
        'has-[[data-process-editor]]:lg:grid-cols-1 has-[[data-process-editor]]:xl:grid-cols-1',
      )}
    >
      <div className="cc-doc-canvas min-w-0 p-3 md:p-6">
        <div data-handbook-board="" className="min-w-0 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc md:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 flex flex-wrap items-center gap-2 cc-text-h2 text-cc-ink">
              Process as the code runs it <CcProvenanceChip value="reconstructed" note="code reading" />
            </h2>
            <span className="cc-text-meta text-cc-ink-muted">Select a step to read its chapter</span>
          </div>
          {map}
        </div>
      </div>

      <ChapterPanel
        chapter={chapter}
        chapters={chapters}
        reading={reading}
        selected={selected}
        selectedElement={selectedElement}
        onSelect={onSelect}
        source={source}
        fileName={model?.fileName ?? ''}
        namingState={model?.naming.state ?? 'not-named'}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ names */

function objectName(o: HandbookObject): React.ReactNode {
  return o.plain ? (
    <>
      <b className="font-semibold text-cc-ink">{o.plain}</b>{' '}
      <span className="font-cc-mono text-cc-ink-muted">{o.name}</span>
    </>
  ) : (
    <b className="font-cc-mono font-semibold text-cc-ink">{o.name}</b>
  );
}

/* ------------------------------------------------------------------ the chapter */

type PanelTab = 'chapter' | 'rules' | 'exceptions' | 'data';

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 cc-text-label text-cc-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function RuleList({ chapter, limit }: { chapter: HandbookChapter; limit?: number }) {
  const shown = limit ? chapter.rules.slice(0, limit) : chapter.rules;
  if (chapter.rules.length === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">No business rule decides in this chapter.</p>;
  }
  return (
    <ul className="m-0 list-none p-0">
      {shown.map((rule) => (
        <li
          key={rule.id}
          data-handbook-rule={rule.id}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-t border-cc-line py-2 first:border-t-0"
        >
          <CcAnchor label={`Business rule ${rule.id}`}>{rule.id}</CcAnchor>
          <span className="min-w-0 cc-text-cell text-cc-ink">
            {rule.plain ?? rule.text}
            {rule.plain && !limit ? <span className="mt-1 block text-[12px] text-cc-ink-muted">{rule.text}</span> : null}
          </span>
          <LineAnchor anchor={rule.anchor} />
        </li>
      ))}
      {limit && chapter.rules.length > limit ? (
        <li className="pt-1 cc-text-meta text-cc-ink-muted">and {chapter.rules.length - limit} more under Rules</li>
      ) : null}
    </ul>
  );
}

function ExceptionList({ chapter, limit }: { chapter: HandbookChapter; limit?: number }) {
  const shown = limit ? chapter.exceptions.slice(0, limit) : chapter.exceptions;
  if (chapter.exceptions.length === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">This chapter does not end the process early.</p>;
  }
  return (
    <ul className="m-0 list-none p-0">
      {shown.map((exception) => (
        <li
          key={exception.id}
          data-handbook-exception={exception.id}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 border-t border-cc-line py-2 first:border-t-0"
        >
          <TriangleAlert size={14} aria-hidden={true} className="text-cc-warning" />
          <span className="min-w-0 cc-text-cell text-cc-ink">{exception.label}</span>
          <LineAnchor anchor={exception.anchor} />
        </li>
      ))}
      {limit && chapter.exceptions.length > limit ? (
        <li className="pt-1 cc-text-meta text-cc-ink-muted">and {chapter.exceptions.length - limit} more under Exceptions</li>
      ) : null}
    </ul>
  );
}

function ObjectRows({ icon, objects, write = false }: { icon: React.ReactNode; objects: HandbookObject[]; write?: boolean }) {
  return (
    <ul className="m-0 list-none p-0">
      {objects.map((o) => (
        <li
          key={o.name}
          className={cn('flex flex-wrap items-center gap-2 py-1 cc-text-cell', write ? 'text-cc-error' : 'text-cc-ink')}
        >
          {icon}
          <span className="min-w-0 break-words">{objectName(o)}</span>
          <LineAnchor anchor={{ lineStart: o.line, lineEnd: o.line }} />
        </li>
      ))}
    </ul>
  );
}

function DataBlock({ chapter }: { chapter: HandbookChapter }) {
  if (chapter.reads.length + chapter.writes.length + chapter.calls.length === 0) {
    return <p className="m-0 cc-text-cell text-cc-ink-muted">The code of this chapter reads and writes no table by name.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {chapter.reads.length ? (
        <ObjectRows icon={<Database size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />} objects={chapter.reads} />
      ) : null}
      {chapter.writes.length ? (
        <ObjectRows icon={<PenLine size={14} aria-hidden={true} className="shrink-0" />} objects={chapter.writes} write />
      ) : null}
      {chapter.calls.length ? (
        <ObjectRows icon={<PhoneCall size={14} aria-hidden={true} className="shrink-0 text-cc-ink-muted" />} objects={chapter.calls} />
      ) : null}
    </div>
  );
}

function Roles({ chapter, namingState }: { chapter: HandbookChapter; namingState: string }) {
  return (
    <Block label="Roles · model proposal only">
      {chapter.proposedRoles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chapter.proposedRoles.map((role) => (
            <span key={role} className="inline-flex items-center gap-1 cc-text-cell text-cc-ink">
              <User size={14} aria-hidden={true} className="text-cc-ink-muted" />
              {role}
            </span>
          ))}
          <CcProvenanceChip value="proposed" />
        </div>
      ) : (
        <p className="m-0 cc-text-meta text-cc-ink-muted">
          {namingState === 'named'
            ? 'The stored model proposal names no role for this chapter.'
            : 'No model proposal for roles exists for this run. The code names authorizations, not people.'}
        </p>
      )}
    </Block>
  );
}

function ChapterPanel({
  chapter,
  chapters,
  reading,
  selected,
  selectedElement,
  onSelect,
  source,
  fileName,
  namingState,
}: {
  chapter: HandbookChapter | null;
  chapters: HandbookChapter[];
  reading: boolean;
  selected: string | null;
  selectedElement: ProcessMapElement | null;
  onSelect: (id: string | null) => void;
  source: string | null;
  fileName: string;
  namingState: string;
}) {
  const [tab, setTab] = useState<PanelTab>('chapter');
  const index = chapter ? chapters.findIndex((c) => c.id === chapter.id) : -1;
  const previous = index > 0 ? chapters[index - 1] : null;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : null;
  const selectedInside = !!(chapter && selected && selected !== chapter.id);

  const codeCard = selectedElement && source ? (
    <div className="border-t border-cc-line px-4 py-4 md:px-5">
      <p className="m-0 mb-2 cc-text-label text-cc-ink-muted">Where in the code</p>
      <ProcessCodeCard
        element={selectedElement}
        source={source}
        fileName={fileName}
        onClose={() => {
          // Back to the node it was opened from, as the map's own card does —
          // not to the top of the page (`DESIGN.md` §5.7).
          const id = selectedElement.id;
          onSelect(null);
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-map-node="${CSS.escape(id)}"]`)?.focus();
          });
        }}
      />
    </div>
  ) : null;

  return (
    <aside
      data-handbook-panel={chapter ? chapter.id : 'none'}
      aria-label="Handbook chapter"
      className="flex min-w-0 flex-col border-t border-cc-line bg-cc-surface lg:border-t-0 lg:border-l has-[[data-process-editor]]:hidden"
    >
      {chapter ? (
        <>
          <div className="px-4 pt-4 md:px-5">
            <p className="m-0 cc-text-label text-cc-ink-muted">
              Chapter {index + 1} of {chapters.length}
              {selected ? '' : ' · select a step to change it'}
            </p>
            <h2 data-handbook-chapter-title="" className="m-0 mt-1 cc-text-h2 text-cc-ink">{chapter.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{chapter.technicalName}</span>
              <LineAnchor anchor={chapter.anchor} />
              <CcProvenanceChip value="reconstructed" />
            </div>
          </div>

          <div className="mt-3 px-2 md:px-3">
            <CcTabs<PanelTab>
              label="Chapter details"
              value={tab}
              onChange={setTab}
              density="cozy"
              tabs={[
                {
                  value: 'chapter',
                  label: 'Chapter',
                  content: (
                    <div className="flex flex-col gap-4 px-2 pb-4">
                      {chapter.summary ? (
                        <p data-handbook-summary="" className="m-0 cc-text-body text-cc-ink">{chapter.summary}</p>
                      ) : null}
                      {selectedInside && selectedElement ? (
                        <p className="m-0 flex flex-wrap items-center gap-2 rounded-cc-row border border-cc-information-border bg-cc-information-bg px-3 py-2 cc-text-cell text-cc-ink">
                          Selected: <b className="font-semibold">{selectedElement.label}</b>
                          <LineAnchor anchor={selectedElement.anchor} hot />
                        </p>
                      ) : null}
                      <Block label="Business rules">
                        <RuleList chapter={chapter} limit={3} />
                      </Block>
                      <Roles chapter={chapter} namingState={namingState} />
                      <Block label="Reads · writes">
                        <DataBlock chapter={chapter} />
                      </Block>
                      <Block label={chapter.exceptions.length === 1 ? 'Exception' : 'Exceptions'}>
                        <ExceptionList chapter={chapter} limit={3} />
                      </Block>
                      {chapter.steps.length > 0 ? (
                        <Block label="Steps in this chapter">
                          <ol className="m-0 list-none p-0">
                            {chapter.steps.map((step) => (
                              <li
                                key={step.id}
                                className={cn(
                                  'flex items-start justify-between gap-2 border-t border-cc-line py-1 first:border-t-0',
                                  step.depth > 1 && 'pl-4',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => onSelect(step.id)}
                                  aria-current={selected === step.id ? 'step' : undefined}
                                  className={cn(
                                    'inline-flex min-w-0 items-start gap-2 rounded-cc-row text-left cc-text-cell hover:underline',
                                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cc-focus focus-visible:outline-solid',
                                    selected === step.id ? 'font-semibold text-cc-information' : 'text-cc-ink',
                                  )}
                                >
                                  <span className="font-cc-mono text-cc-ink-muted">{step.outline}</span>
                                  <span>{step.label}</span>
                                </button>
                                <LineAnchor anchor={step.anchor} hot={selected === step.id} />
                              </li>
                            ))}
                          </ol>
                        </Block>
                      ) : null}
                      {chapter.description.length > 0 ? (
                        <Block label="What the code says">
                          <ul className="m-0 list-none p-0">
                            {chapter.description.map((sentence, i) => (
                              <li key={i} className="flex flex-wrap items-start gap-2 border-t border-cc-line py-2 first:border-t-0 cc-text-cell text-cc-ink">
                                <span className="min-w-0 flex-1">{sentence.text}</span>
                                {sentence.anchors[0] ? <LineAnchor anchor={sentence.anchors[0]} /> : null}
                              </li>
                            ))}
                          </ul>
                        </Block>
                      ) : null}
                    </div>
                  ),
                },
                {
                  value: 'rules',
                  label: 'Rules',
                  count: chapter.rules.length,
                  content: <div className="px-2 pb-4"><RuleList chapter={chapter} /></div>,
                },
                {
                  value: 'exceptions',
                  label: 'Exceptions',
                  count: chapter.exceptions.length,
                  content: <div className="px-2 pb-4"><ExceptionList chapter={chapter} /></div>,
                },
                {
                  value: 'data',
                  label: 'Data',
                  content: <div className="px-2 pb-4"><DataBlock chapter={chapter} /></div>,
                },
              ]}
            />
          </div>

          {codeCard}

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-cc-line px-4 py-3 md:px-5">
            {previous ? (
              <CcButton
                onClick={() => onSelect(previous.id)}
                icon={<ArrowLeft size={14} aria-hidden={true} />}
                aria-label={`Previous chapter: ${previous.title}`}
              >
                {previous.number}
              </CcButton>
            ) : <span />}
            {next ? (
              <CcButton onClick={() => onSelect(next.id)} aria-label={`Next chapter: ${next.title}`}>
                {next.number} <ArrowRight size={14} aria-hidden={true} />
              </CcButton>
            ) : <span />}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 md:px-5">
          {selectedElement ? (
            <>
              <p className="m-0 cc-text-label text-cc-ink-muted">{selectedElement.kind}</p>
              <h2 className="m-0 cc-text-h2 text-cc-ink">{selectedElement.label}</h2>
              {selectedElement.branches.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {selectedElement.branches.map((branch, i) => (
                    <li key={`${branch.to}-${i}`} className="flex flex-wrap items-center gap-2 border-t border-cc-line py-1 first:border-t-0 cc-text-cell text-cc-ink">
                      {branch.label ? <CcTag>{branch.label}</CcTag> : null}
                      <ArrowRight size={12} aria-hidden={true} className="text-cc-ink-muted" />
                      {branch.toLabel}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="m-0 cc-text-cell text-cc-ink-muted">
              {reading ? 'Reading the chapters out of the code…' : 'The handbook has no chapters for this process yet.'}
            </p>
          )}
        </div>
      )}
      {chapter ? null : codeCard}
    </aside>
  );
}
