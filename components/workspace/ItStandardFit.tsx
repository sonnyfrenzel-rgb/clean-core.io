'use client';

import React from 'react';
import CcCard from '@/components/cc/Card';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import type { WorkspaceLayer } from '@/lib/workspace-model';
import type { Project } from '@/lib/types';
import { layerSectionShowing } from '@/lib/workspace-messages';
import StandardFitTable from './StandardFitTable';

/**
 * *Standard fit* as one of the IT view's own sections (owner, 12.10.2026,
 * ADR-096). It was a Business layer; for a Z program without catalog
 * successors every row read "No catalog hit · E0 none · Not determined", and
 * its capabilities are rule conditions and rule ids — an IT reading. Until
 * roadmap 3.0.13 (F14) brings the real standard comparison it stands here.
 *
 * With the project's capabilities it is the table of mockup `s3`, read from
 * the server as before (`StandardFitTable`). Without a project the route could
 * read — the demo — the layer's own rows. With nothing to read it says so in
 * the layer's own sentence, as Objects & dependencies does; the anchor bar
 * then offers no anchor for it (ADR-086: never an "empty" chip).
 */
export default function ItStandardFit({
  layer,
  project,
  projectId,
  live,
}: {
  layer: WorkspaceLayer;
  project: Project | null;
  projectId: string;
  /** A project the standard-fit route can read — false in the demo. */
  live: boolean;
}) {
  const empty = layer.rows.length === 0;
  if (!empty && live && projectId !== '') {
    return <StandardFitTable project={project} projectId={projectId} />;
  }
  return (
    <CcCard
      title={layer.label}
      count={empty ? undefined : layer.total}
      meta={<CcProvenanceChip value={layer.provenance} />}
    >
      {empty ? (
        <p data-it-standard-state="empty" className="m-0 text-[13px] leading-snug font-medium text-cc-ink">
          {layer.missing}
        </p>
      ) : (
        <>
          <ul data-it-standard-rows="" className="m-0 list-none space-y-2 p-0">
            {layer.rows.map((row) => (
              <li
                key={row.key}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-cc-row border border-cc-line bg-cc-surface px-3 py-2"
              >
                <span className="text-[13px] font-bold text-cc-ink">{row.label}</span>
                <span className="text-[13px] font-medium text-cc-ink-muted">{row.value}</span>
              </li>
            ))}
          </ul>
          {layer.total > layer.rows.length ? (
            <p className="m-0 mt-2 text-[12px] font-medium text-cc-ink-muted">
              {layerSectionShowing(layer.rows.length, layer.total)}
            </p>
          ) : null}
        </>
      )}
    </CcCard>
  );
}

