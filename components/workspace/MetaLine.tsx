'use client';

import React from 'react';
import type { MetaEntry } from '@/lib/workspace-model';
import { META_ABSENT } from '@/lib/workspace-model';

/**
 * What this case's evidence rests on — `DESIGN.md` §2.3, roadmap 1.4.
 *
 * Project id, manifest, revision, source state, engine, rule set, catalog, in
 * monospace. Every value comes from the input manifest the signed run carries
 * (roadmap 0.5), which is server-written and outside the client allowlist of
 * `firestore.rules` — the only reason a line like this is worth printing.
 *
 * Open in IT; behind "Details" in Business and Management (§2.11), because a
 * process owner reading "catalog releaseInfo fb0df9f2" learns nothing and loses
 * the line that mattered.
 *
 * A value that nothing recorded reads **"not recorded"** rather than an em dash
 * or an empty cell. A run signed before the manifest existed genuinely has none,
 * and the difference between "zero" and "nobody wrote it down" is the whole
 * subject of this product.
 */
export default function WorkspaceMetaLine({ entries }: { entries: MetaEntry[] }) {
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
              entry.value === null ? 'm-0 font-medium text-cc-neutral italic' : 'm-0 font-semibold text-cc-ink'
            }
          >
            {entry.value ?? META_ABSENT}
          </dd>
        </div>
      ))}
    </dl>
  );
}
