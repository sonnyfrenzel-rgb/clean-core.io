'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download, Mail } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcLinkButton from '@/components/cc/LinkButton';
import InviteReaderDialog from '@/components/InviteReaderDialog';
import { getAuth } from '@/lib/firebase';
import { saveAs } from '@/lib/fileSaver';
import { loadProjectAccess, type ProjectAccessList } from '@/lib/project-readers-client';
import { signedSourceOf } from '@/lib/signed-source';
import { openSteeringOnePager } from '@/lib/steering-open';
import { stageHref, WORKSPACE_RETURN } from '@/lib/workspace-back-href';
import { HEAD_INITIALS, readerInitials } from '@/lib/workspace-head';
import type { WorkspaceView } from '@/lib/workspace-model';
import { bizMoreReaders, bizReadAccess, wt } from '@/lib/workspace-messages';
import type { Project } from '@/lib/types';

/**
 * Who can read this project — "Read access: only you" and the initials of
 * mockup s1 and s9. The owner's own line: `/api/projects/{id}/readers` answers
 * nobody else, so for an invited reader nothing is rendered rather than a
 * guess. The full list with "Revoke" stays where it was (`AccessList.tsx`).
 */
export function ReadAccessLine({ projectId, refreshKey = 0 }: { projectId: string; refreshKey?: number }) {
  const [access, setAccess] = useState<ProjectAccessList | null>(null);

  useEffect(() => {
    let alive = true;
    loadProjectAccess(projectId)
      .then((list) => {
        if (alive) setAccess(list);
      })
      .catch(() => {
        if (alive) setAccess(null);
      });
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey]);

  if (access === null) return null;
  const shown = access.entries.slice(0, HEAD_INITIALS);
  const more = access.entries.length - shown.length;

  return (
    <p
      data-workspace-read-access={access.entries.length}
      className="m-0 flex flex-wrap items-center gap-2 text-[12px] font-medium text-cc-ink-muted"
    >
      <span>{bizReadAccess(access.entries.length)}</span>
      {shown.length > 0 ? (
        <span className="inline-flex items-center gap-1" aria-hidden={true}>
          {shown.map((entry) => (
            <span
              key={entry.uid}
              title={entry.email}
              data-workspace-reader-initials=""
              className="inline-flex h-6 w-6 items-center justify-center rounded-cc-row bg-cc-ink text-[11px] font-semibold text-cc-on-dark"
            >
              {readerInitials(entry.email)}
            </span>
          ))}
          {more > 0 ? <span>{bizMoreReaders(more)}</span> : null}
        </span>
      ) : null}
      {shown.length > 0 ? (
        <a href="#workspace-access" className="font-semibold text-cc-ink underline underline-offset-2">
          {wt('biz.manageAccess')}
        </a>
      ) : null}
    </p>
  );
}

/**
 * Export and "Invite to view" in the head of the object page — mockup s1.
 *
 * Both wire to what already exists; nothing is built twice:
 *
 *   - **Export** opens a short menu: the process as BPMN 2.0 (the same export
 *     the Documentation stage writes, from the source the active run signed —
 *     offered only when there is one), printing this view, in Management the
 *     steering one-pager (one A4 page, saved as PDF by the browser), and the Delivery
 *     stage, where the signed delivery package and the audit pack are made.
 *   - **Invite to view** opens the invitation dialog the dashboard uses
 *     (`InviteReaderDialog`), and only for the owner: an invited reader cannot
 *     invite, and a button that the server would refuse is not offered.
 */
export default function WorkspaceHeadActions({
  project,
  projectId,
  view,
  onInvited,
}: {
  project: Project | null;
  projectId: string;
  view: WorkspaceView;
  /** After the dialog closes — the read-access line rereads. */
  onInvited?: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const isOwner = !!project?.userId && getAuth().currentUser?.uid === project.userId;
  const signed = signedSourceOf(project);

  useEffect(() => {
    if (!exportOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExportOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('button[aria-controls]')?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [exportOpen]);

  const downloadBpmn = async () => {
    if (!signed) return;
    setExportError(null);
    try {
      // Loaded on the click, as on the Documentation stage.
      const { buildBpmnExportFromSource, bpmnFileName } = await import('@/lib/bpmn/export');
      const { xml } = buildBpmnExportFromSource(signed.source, {
        processName: project?.name || signed.fileName,
        sourceFileName: signed.fileName,
      });
      saveAs(new Blob([xml], { type: 'application/xml;charset=utf-8' }), bpmnFileName(`${project?.name || 'Project'}_Process`));
      setExportOpen(false);
    } catch {
      setExportError(wt('biz.exportFailed'));
    }
  };

  return (
    <div className="cc-no-print flex flex-wrap items-center gap-2" data-workspace-head-actions="">
      <div ref={rootRef} className="relative">
        <CcButton
          onClick={() => setExportOpen((v) => !v)}
          aria-expanded={exportOpen}
          aria-controls={exportOpen ? panelId : undefined}
          icon={<Download size={16} aria-hidden={true} />}
          data-workspace-export=""
        >
          {wt('biz.export')}
          <ChevronDown size={14} aria-hidden={true} />
        </CcButton>
        {exportOpen ? (
          <div
            id={panelId}
            data-workspace-export-panel=""
            className="absolute right-0 z-20 mt-1 flex w-72 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2 rounded-cc-card border border-cc-line bg-cc-surface p-3 shadow-cc-dialog"
          >
            {signed ? (
              <CcButton onClick={() => void downloadBpmn()} data-workspace-export-bpmn="">
                {wt('biz.exportBpmn')}
              </CcButton>
            ) : (
              <p data-workspace-export-bpmn-absent="" className="m-0 text-[12px] leading-snug font-medium text-cc-ink-muted">
                {wt('biz.exportBpmnAbsent')}
              </p>
            )}
            <CcButton
              onClick={() => {
                setExportOpen(false);
                window.print();
              }}
              data-workspace-export-print=""
            >
              {wt('biz.exportPrint')}
            </CcButton>
            {/* The steering one-pager where a manager exports things (owner,
                04.10.2026: "hardly findable"). It stands under the decision in
                Management, so the entry is offered there. */}
            {view === 'management' ? (
              <CcButton
                onClick={() => {
                  setExportOpen(false);
                  openSteeringOnePager();
                }}
                data-workspace-export-one-pager=""
              >
                {wt('biz.exportOnePager')}
              </CcButton>
            ) : null}
            <CcLinkButton
              href={stageHref({ base: `/project/${projectId}`, path: 'delivery', view, from: WORKSPACE_RETURN.tools })}
              data-workspace-export-delivery=""
            >
              {wt('biz.exportDelivery')}
            </CcLinkButton>
            {exportError ? (
              <p role="alert" className="m-0 text-[12px] font-medium text-cc-ink">
                {exportError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {isOwner ? (
        <CcButton
          variant="secondary"
          onClick={() => setInviting(true)}
          icon={<Mail size={16} aria-hidden={true} />}
          data-workspace-invite=""
        >
          {wt('biz.invite')}
        </CcButton>
      ) : null}

      {inviting ? (
        <InviteReaderDialog
          projectId={projectId}
          projectName={project?.name || projectId}
          onClose={() => {
            setInviting(false);
            onInvited?.();
          }}
        />
      ) : null}
    </div>
  );
}
