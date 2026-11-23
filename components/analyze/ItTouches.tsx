'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CcAnchor from '@/components/cc/Anchor';
import CcDisclosure from '@/components/cc/Disclosure';
import CcSkeleton from '@/components/cc/Skeleton';
import CcTable from '@/components/cc/Table';
import { CcCleanCoreLevelExplained } from '@/components/cc/LevelExplained';
import FamilyChip from '@/components/family/FamilyChip';
import ObjectSection from '@/components/analyze/ObjectSection';
import ItDependencyGraph, { objectKindWord, objectUseWord } from '@/components/workspace/ItDependencyGraph';
import { lineAnchorText } from '@/lib/analyze-it';
import type { ItObjectRow, ItObjects } from '@/lib/it-objects';

/**
 * "What it touches in SAP" — Analyze, IT (AB-9, the family mock-up's `s-touch`): every object the code calls, reads or
 * writes, with how, the statement that touches it and its lines; under it, folded, the program's own parts — its
 * structure. It carries the workspace's *Objects & dependencies* (ADR-086), whose addresses (`#it-objects`,
 * `#architecture`) land here since the workspace page dissolved (AB-11).
 *
 * Read off the findings route's `uses` and the stored inventory (`itObjects`), as the IT view did; the level is SAP's
 * published classification under the project's target profile, never stored and never signed.
 *
 * Above the table, the same rows as a picture (`ItDependencyGraph`, roadmap after 3.0.7, item 3), as the workspace's IT
 * view drew it: a node or an edge label sends the reader to its row (the table opens past its first rows, or the
 * structure fold opens) and moves the focus there; "see the table" reaches the table itself.
 */
const COLUMNS = [
  { key: 'object', label: 'Object' },
  { key: 'how', label: 'How' },
  { key: 'statement', label: 'Statement' },
  { key: 'lines', label: 'Line' },
  { key: 'level', label: 'Level', width: '5rem' },
] as const;

const OWNER_WORDS: Record<ItObjectRow['owner'], string> = { own: 'own', sap: 'SAP', undetermined: 'namespace not determined' };

/** The statement at a line, as one trimmed line of source; empty when the source is not on the page. */
function statementAt(source: string | undefined, line: number | undefined): string {
  if (!source || !line) return '';
  const text = source.split(/\r?\n/)[line - 1] ?? '';
  return text.replace(/".*$/, '').trim();
}

export default function ItTouches({
  objects,
  source,
  onOpenLine,
}: {
  /** `undefined` while the findings route is read; `null` when it could not be. */
  objects: ItObjects | null | undefined;
  source?: string;
  onOpenLine?: (line: number) => void;
}) {
  const deps = useMemo(() => (objects ? objects.rows.filter((r) => r.side === 'dependency') : []), [objects]);
  const own = useMemo(() => (objects ? objects.rows.filter((r) => r.side === 'own-object') : []), [objects]);

  /** The row the graph sent the reader to — marked like a chosen finding, in ink. */
  const [jump, setJump] = useState<{ key: string } | null>(null);
  const [tableJump, setTableJump] = useState(0);
  const [structureOpen, setStructureOpen] = useState(false);
  const open = useCallback(
    (rowKey: string | null) => {
      if (rowKey === null) {
        setTableJump((n) => n + 1);
        return;
      }
      if (own.some((r) => r.key === rowKey)) setStructureOpen(true);
      setJump({ key: rowKey });
    },
    [own],
  );
  // After the table or the fold has shown the row: bring it into view and move the focus to it, so a keyboard reader
  // lands where the graph pointed.
  useEffect(() => {
    if (!jump) return;
    const key = CSS.escape(jump.key);
    const row =
      document.querySelector<HTMLElement>(`[data-it-objects-table] [data-cc-table-row="${key}"]`) ??
      document.querySelector<HTMLElement>(`[data-analyze-structure] [data-it-structure-row="${key}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row?.querySelector<HTMLElement>('[data-it-object-focus]')?.focus({ preventScroll: true });
  }, [jump]);
  useEffect(() => {
    if (tableJump === 0) return;
    const table = document.querySelector<HTMLElement>('[data-it-objects-table]');
    table?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    table?.focus({ preventScroll: true });
  }, [tableJump]);

  const chips = (lines: readonly number[]) =>
    lines.length === 0 ? (
      <span className="cc-text-meta text-cc-ink-muted">—</span>
    ) : (
      <span className="inline-flex flex-wrap items-center gap-1">
        {lines.slice(0, 2).map((l) => (
          <CcAnchor key={l} label={`Source line ${l}${onOpenLine ? ', open the source' : ''}`} onOpen={onOpenLine ? () => onOpenLine(l) : undefined}>
            {lineAnchorText(l)}
          </CcAnchor>
        ))}
        {lines.length > 2 ? <span className="cc-text-meta text-cc-ink-muted">+{lines.length - 2}</span> : null}
      </span>
    );

  return (
    <ObjectSection
      id="analyze-touch"
      data-analyze-touch={objects ? deps.length : objects === null ? 'unread' : 'loading'}
      title="What it touches in SAP"
      right={<FamilyChip kind="engine" />}
      lead="Every object with the statement that touches it. The levels are SAP's published classification, read for the project's target; they are not signed."
    >
      {objects === undefined ? (
        <CcSkeleton shape="table" count={4} label="What it touches in SAP" />
      ) : objects === null ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          What the code uses could not be read just now, so no object is listed. Reload the page to try again.
        </p>
      ) : !objects.recorded || deps.length === 0 ? (
        <p className="m-0 cc-text-cell text-cc-ink-muted">
          The engine found no SAP object the code calls, reads or writes.
        </p>
      ) : (
        <>
          {/* The same rows as a picture — the overview; the table under it stays the whole answer. */}
          <ItDependencyGraph objects={objects} onOpen={open} />
          <div data-it-objects-table="" tabIndex={-1} className="mt-3 scroll-mt-28">
            <CcTable
              caption={`What the code touches: ${deps.length} ${deps.length === 1 ? 'object' : 'objects'}`}
              columns={COLUMNS}
              reveal={jump}
              rows={deps.map((r) => ({
                key: r.key,
                selected: jump?.key === r.key,
                cells: {
                  object: (
                    // The graph moves the focus here when it sends the reader to this row.
                    <span className="block min-w-0" tabIndex={-1} data-it-object-focus="" data-it-object={r.object}>
                      <span className="font-cc-mono font-semibold text-cc-ink break-all">{r.object}</span>
                      <span className="block cc-text-meta font-medium text-cc-ink-muted">
                        {objectKindWord(r.kind)} · {OWNER_WORDS[r.owner]}
                        {r.remote ? ' · in another system' : ''}
                      </span>
                    </span>
                  ),
                  how: <span className="cc-text-cell text-cc-ink">{objectUseWord(r.use, r.batchInput)}</span>,
                  statement: statementAt(source, r.lines[0]) ? (
                    <code className="block max-w-[28rem] truncate font-cc-mono cc-text-meta text-cc-ink" title={statementAt(source, r.lines[0])}>
                      {statementAt(source, r.lines[0])}
                    </code>
                  ) : (
                    <span className="cc-text-meta text-cc-ink-muted">—</span>
                  ),
                  lines: chips(r.lines),
                  // Each level explains itself on hover, tap or focus, as the workspace's IT view did (roadmap 3.0.6).
                  level: r.level ? (
                    <span className="block" data-it-use-level={r.object}>
                      <CcCleanCoreLevelExplained value={r.level} />
                    </span>
                  ) : (
                    <span className="cc-text-meta text-cc-ink-muted">—</span>
                  ),
                },
              }))}
              limit={10}
            />
          </div>
        </>
      )}

      {own.length > 0 ? (
        <div className="mt-3 border-t border-cc-line pt-1" data-analyze-structure={own.length}>
          <CcDisclosure title="Structure: the program's own parts" count={own.length} open={structureOpen} onOpenChange={setStructureOpen}>
            <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
              {own.map((r) => (
                <li
                  key={r.key}
                  data-it-structure-row={r.key}
                  className={`flex min-w-0 flex-wrap items-center gap-2 cc-text-cell text-cc-ink ${jump?.key === r.key ? 'bg-cc-surface-muted' : ''}`}
                >
                  <span className="font-cc-mono font-semibold break-all" tabIndex={-1} data-it-object-focus="">
                    {r.object}
                  </span>
                  <span className="cc-text-meta font-medium text-cc-ink-muted">{objectKindWord(r.kind)}</span>
                  {r.range ? (
                    <CcAnchor
                      label={`Source line ${r.range.start}${onOpenLine ? ', open the source' : ''}`}
                      onOpen={onOpenLine ? () => onOpenLine(r.range!.start) : undefined}
                    >
                      {lineAnchorText(r.range.start, r.range.end)}
                    </CcAnchor>
                  ) : null}
                </li>
              ))}
            </ul>
          </CcDisclosure>
        </div>
      ) : null}
    </ObjectSection>
  );
}
