'use client';

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import { CcTag } from '@/components/cc/Tag';
import { useProjectEvidence } from '@/hooks/useProjectEvidence';
import { saveAs } from '@/lib/fileSaver';
import {
  LEVEL_D_APPROVAL_NOTE,
  LEVEL_D_ATTRIBUTION,
  LEVEL_D_NONE,
  levelDRegister,
  levelDRegisterFileName,
  levelDRegisterMarkdown,
} from '@/lib/level-d-register';

/**
 * The level D register of the Documentation tool (DSAG guideline review B7):
 * every modification and level D enhancement the engine found, each with the
 * guideline's three points as open questions, and the register as a file.
 *
 * Shows and exports only (owner rule: the Documentation tool has no inputs
 * and no sign-off) — the answers belong in the company's own documentation.
 * The findings are read from the server with the run's inputs
 * (`useProjectEvidence`), the same evidence Analyze shows.
 */
export default function LevelDRegister({
  projectId,
  source,
  runId,
  projectName,
}: {
  projectId: string;
  /** The stored source; without one there is nothing to read. */
  source: string;
  runId: string;
  projectName?: string;
}) {
  const evidence = useProjectEvidence(projectId, Boolean(source), runId);
  const entries = useMemo(
    () => (evidence.state === 'ready' ? levelDRegister(evidence.value.evidence.findings) : []),
    [evidence],
  );
  if (!source) return null;

  const download = () => {
    const md = levelDRegisterMarkdown(entries, { projectName: projectName || 'Project', date: new Date().toISOString().slice(0, 10) });
    saveAs(new Blob([md], { type: 'text/markdown;charset=utf-8' }), levelDRegisterFileName(projectName));
  };

  return (
    <section
      aria-labelledby="level-d-register-title"
      data-level-d-register={evidence.state === 'ready' ? String(entries.length) : evidence.state}
      className="rounded-cc-card border border-cc-line bg-cc-surface p-4 shadow-cc"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="level-d-register-title" className="m-0 cc-text-h2 text-cc-ink">
            Level D register
          </h2>
          <CcTag>open questions</CcTag>
        </div>
        {evidence.state === 'ready' ? (
          <CcButton variant="ghost" icon={<Download size={16} aria-hidden={true} />} onClick={download} data-level-d-export="">
            Export register (.md)
          </CcButton>
        ) : null}
      </div>
      <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
        Every change to SAP code the engine found — modifications and enhancement implementations, points and
        sections. Each one should be documented with its purpose, its effect on upgrades and the scenarios it was
        tested with; the questions stay open here and are answered in your own documentation.
      </p>
      {evidence.state === 'loading' ? (
        <p className="m-0 mt-3 cc-text-cell text-cc-ink-muted">Reading the engine&apos;s findings…</p>
      ) : evidence.state === 'failed' ? (
        <p data-level-d-unread="" className="m-0 mt-3 cc-text-cell text-cc-ink-muted">{evidence.reason}</p>
      ) : entries.length === 0 ? (
        <p data-level-d-none="" className="m-0 mt-3 cc-text-cell text-cc-ink">{LEVEL_D_NONE}</p>
      ) : (
        <ol className="m-0 mt-3 grid list-none gap-2 p-0">
          {entries.map((e) => (
            <li key={e.findingId} data-level-d-entry={e.kind} className="rounded-cc-row border border-cc-line p-3">
              <p className="m-0 cc-text-cell text-cc-ink">
                <b className="font-semibold">{e.title}</b>{' '}
                <span className="text-cc-ink-muted">(line <span className="font-cc-mono">{e.line}</span>)</span>
              </p>
              <ul className="m-0 mt-2 list-disc pl-5 cc-text-cell text-cc-ink-muted">
                {e.questions.map((q) => (
                  <li key={q.key} data-level-d-question={q.key}>{q.question}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="m-0 mt-3 cc-text-meta text-cc-ink-muted">
        {LEVEL_D_APPROVAL_NOTE} {LEVEL_D_ATTRIBUTION}
      </p>
    </section>
  );
}
