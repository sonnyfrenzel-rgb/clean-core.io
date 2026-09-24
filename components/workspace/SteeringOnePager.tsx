'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import CcButton from '@/components/cc/Button';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import { getAuth, getDb } from '@/lib/firebase';
import { isProjectOwner } from '@/lib/project-readers';
import { runHistoryEntry, type RunHistoryEntry } from '@/lib/management-answers';
import type { ItFindingsSource } from '@/lib/it-findings';
import type { ProjectDecision } from '@/lib/project-decision';
import { notDetermined } from '@/lib/workspace-model';
import {
  STEERING_GROUP_LABELS,
  STEERING_TITLE,
  steeringOnePager,
  type SteeringLink,
} from '@/lib/steering-one-pager';
import type { Project } from '@/lib/types';

/**
 * The steering one-pager — roadmap step 8.6, mockup screen 5.
 *
 * Everything it prints is sorted in `lib/steering-one-pager.ts`, which in turn
 * only re-reads figures the Management answers, the IT findings and the
 * decision record already derive. This component adds no number of its own.
 *
 * **The PDF is the browser's.** "Print / Save as PDF" calls `window.print()`,
 * and the print rule in `app/globals.css` keeps nothing on paper but the
 * element marked `data-steering-print` — so the one page is this page, with no
 * PDF library in the bundle and no second rendering that could drift from it.
 *
 * **Read when opened.** The three reads (runs, findings, decision) run only
 * after the reader asks for the page, so the Management view costs nothing
 * extra for a reader who never opens it. Each read has three states, as in
 * `ManagementAnswers`: in flight, failed (`null`, reported as such), answered.
 *
 * A view, not a record: nothing here is written, and nothing here is part of
 * the signed audit pack.
 */
export default function SteeringOnePager({
  project,
  projectId,
}: {
  project: Project | null;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<RunHistoryEntry[] | null | undefined>(undefined);
  const [findings, setFindings] = useState<ItFindingsSource | null | undefined>(undefined);
  const [decision, setDecision] = useState<
    { record: ProjectDecision | null; unreadable: string | null } | undefined
  >(undefined);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;

    (async () => {
      const user = getAuth().currentUser;
      const uid = user?.uid ?? null;

      // Runs: owner-only, and a non-owner is never asked (see ManagementAnswers).
      const runs = (async (): Promise<RunHistoryEntry[] | null> => {
        if (!uid || !isProjectOwner(project, uid)) return null;
        try {
          const snap = await getDocs(
            query(collection(getDb(), 'projects', projectId, 'runs'), where('userId', '==', uid)),
          );
          return snap.docs
            .map((d) => runHistoryEntry({ runId: d.id, ...d.data() }))
            .filter((e): e is RunHistoryEntry => e !== null);
        } catch {
          return null;
        }
      })();

      const token = await user?.getIdToken().catch(() => null);
      const read = async <T,>(path: string): Promise<{ ok: boolean; status: number; json: T | null }> => {
        if (!token) return { ok: false, status: 401, json: null };
        try {
          const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/${path}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { ok: res.ok, status: res.status, json: (await res.json().catch(() => null)) as T | null };
        } catch {
          return { ok: false, status: 0, json: null };
        }
      };

      const [h, f, d] = await Promise.all([
        runs,
        read<ItFindingsSource>('findings'),
        read<{
          draft?: ProjectDecision;
          stored?: ProjectDecision | null;
          error?: string;
        }>('decision'),
      ]);
      if (cancelled) return;

      setHistory(h);
      setFindings(f.ok && f.json ? f.json : null);
      if (d.ok && d.json?.draft) {
        // The card's rule: a confirmed record is the decision until withdrawn.
        const record = d.json.stored && d.json.stored.status === 'confirmed' ? d.json.stored : d.json.draft;
        setDecision({ record, unreadable: null });
      } else {
        setDecision({
          record: null,
          unreadable: d.json?.error?.trim() || 'the decision of this project could not be read',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectId, project]);

  const ready = history !== undefined && findings !== undefined && decision !== undefined;
  const pager = useMemo(
    () =>
      ready
        ? steeringOnePager({
            projectId,
            project,
            history,
            open: notDetermined(project),
            findings,
            decision: decision.record,
            decisionUnreadable: decision.unreadable,
          })
        : null,
    [ready, projectId, project, history, findings, decision],
  );

  if (!open) {
    return (
      <div data-steering-one-pager="closed" className="cc-no-print">
        <CcButton variant="ghost" density="compact" icon={<FileText size={14} />} onClick={() => setOpen(true)}>
          {STEERING_TITLE}
        </CcButton>
      </div>
    );
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const projectName = project?.name?.trim() || projectId;

  return (
    <section
      data-steering-one-pager="open"
      data-steering-print=""
      aria-labelledby="steering-one-pager-heading"
      className="cc rounded-cc-row border border-cc-line bg-cc-surface px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="steering-one-pager-heading" className="m-0 text-[16px] leading-snug font-bold text-cc-ink">
            {STEERING_TITLE} · {projectName}
          </h2>
          <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {pager?.scope}
          </p>
          {pager ? (
            <p data-steering-summary="" className="m-0 mt-1 text-[12px] leading-snug font-semibold text-cc-ink">
              {pager.summary} · {new Date().toISOString().slice(0, 10)}
            </p>
          ) : null}
        </div>
        <div className="cc-no-print flex flex-wrap gap-2">
          <CcButton
            variant="secondary"
            density="compact"
            icon={<Printer size={14} />}
            disabled={!pager}
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </CcButton>
          <CcButton variant="ghost" density="compact" onClick={() => setOpen(false)}>
            Close
          </CcButton>
        </div>
      </div>

      {!pager ? (
        <div data-steering-one-pager-state="loading" role="status" className="py-6">
          <span className="sr-only">Reading the figures of this project…</span>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[3fr_2fr]">
          <div>
            <h3 className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              Figures
            </h3>
            <ul className="m-0 mt-2 list-none space-y-2 p-0">
              {pager.figures.map((f) => (
                <li
                  key={f.key}
                  data-steering-figure={f.key}
                  className="break-inside-avoid rounded-cc-row border border-cc-line px-3 py-2"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span data-figure-value="" className="text-[16px] leading-none font-bold text-cc-ink">
                      {f.value}
                    </span>
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {STEERING_GROUP_LABELS[f.group]} · {f.label}
                    </span>
                    <CcProvenanceChip value={f.provenance} />
                  </div>
                  <p data-figure-coverage="" className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
                    {f.coverage}
                  </p>
                  <Evidence link={f.evidence} origin={origin} anchors={f.anchors} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="m-0 text-[11px] font-semibold tracking-[0.08em] text-cc-ink-muted uppercase">
              Not determined
            </h3>
            {pager.notDetermined.length === 0 ? (
              <p className="m-0 mt-2 text-[12px] leading-snug font-medium text-cc-ink-muted">
                Every figure on this page could be read.
              </p>
            ) : (
              <ul className="m-0 mt-2 list-none space-y-2 p-0">
                {pager.notDetermined.map((g) => (
                  <li
                    key={g.key}
                    data-steering-not-determined={g.key}
                    className="break-inside-avoid rounded-cc-row border border-dashed border-cc-line px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[12px] font-semibold text-cc-ink">
                        {STEERING_GROUP_LABELS[g.group]} · {g.label}
                      </span>
                      <CcProvenanceChip value="not-determined" />
                    </div>
                    <p data-figure-absent-reason="" className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
                      {g.reason}
                    </p>
                    {g.evidence ? <Evidence link={g.evidence} origin={origin} anchors={[]} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The link to the evidence. On paper the target is printed in brackets
 * (`DESIGN.md` §7.1: links with their target where it is not an anchor), and
 * line anchors are printed as text.
 */
function Evidence({ link, origin, anchors }: { link: SteeringLink; origin: string; anchors: string[] }) {
  return (
    <p className="m-0 mt-1 text-[11px] leading-snug font-medium text-cc-ink-muted">
      <a data-steering-evidence="" href={link.href} className="font-semibold text-cc-ink underline">
        {link.place}
      </a>
      <span className="font-cc-mono"> ({origin}{link.href})</span>
      {anchors.length > 0 ? (
        <span data-steering-anchors="" className="font-cc-mono"> · {anchors.join(' ')}</span>
      ) : null}
    </p>
  );
}
