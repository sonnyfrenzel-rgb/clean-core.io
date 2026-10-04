'use client';

import React from 'react';
import type { MetaEntry } from '@/lib/workspace-model';
import { META_ABSENT } from '@/lib/workspace-model';
import { wt } from '@/lib/workspace-messages';

/**
 * What this case's evidence rests on — `DESIGN.md` §2.3, roadmap 1.4.
 *
 * Project id, manifest, revision, source state, engine, rule set, catalog, in
 * monospace. Every value comes from the input manifest the signed run carries
 * (roadmap 0.5), which is server-written and outside the client allowlist of
 * `firestore.rules` — the only reason a line like this is worth printing.
 *
 * Behind "Details" in every view (§2.11; IT too since the owner's note of
 * 04.10.2026 on ADR-026): two lines of hashes under the title cost every
 * reader the line that mattered, and one click brings them back unchanged.
 *
 * A value that nothing recorded reads **"not recorded"** rather than an em dash
 * or an empty cell. A run signed before the manifest existed genuinely has none,
 * and the difference between "zero" and "nobody wrote it down" is the whole
 * subject of this product.
 */
export default function WorkspaceMetaLine({ entries }: { entries: MetaEntry[] }) {
  // Before the first signed run nothing but the project id is recorded; six
  // "not recorded" in a row read as a broken line (owner, 02.10.2026). One
  // sentence says the same, and the line appears in full once a run wrote it.
  const recorded = entries.filter((e) => e.value !== null && e.key !== 'project');
  const project = entries.find((e) => e.key === 'project');
  if (recorded.length === 0) {
    return (
      <p data-workspace-meta="" data-recorded="none" className="m-0 cc-text-meta text-cc-ink-muted">
        {project?.value ? (
          <>
            {wt('page.metaProject')} <span className="font-cc-mono font-semibold text-cc-ink">{project.value}</span> ·{' '}
          </>
        ) : null}
        {wt('page.metaNoRun')}
      </p>
    );
  }
  return (
    <dl
      data-workspace-meta=""
      className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-cc-mono text-[11px] leading-5 text-cc-ink-muted"
    >
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-center gap-1">
          <dt className="font-medium">{entry.label}</dt>
          <dd
            data-workspace-meta-value={entry.key}
            data-recorded={entry.value === null ? 'no' : 'yes'}
            className={
              // One click selects the whole value, ready to copy (owner, 04.10.2026).
              entry.value === null ? 'm-0 font-medium text-cc-neutral italic' : 'm-0 font-semibold text-cc-ink select-all break-all'
            }
          >
            {entry.value ?? META_ABSENT}
          </dd>
        </div>
      ))}
    </dl>
  );
}
