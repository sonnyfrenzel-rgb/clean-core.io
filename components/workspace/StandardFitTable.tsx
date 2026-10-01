'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, CircleHelp, FileText, ListChecks, Users } from 'lucide-react';
import CcCard from '@/components/cc/Card';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcTable, { type CcTableColumn, type CcTableRowSpec } from '@/components/cc/Table';
import CcProvenanceChip from '@/components/cc/ProvenanceChip';
import CcObjectStatus from '@/components/cc/ObjectStatus';
import CcDisclosure from '@/components/cc/Disclosure';
import { CcEvidenceLevel } from '@/components/cc/Identifier';
import { EVIDENCE_LEVEL_VALUES, evidenceLevel, evidenceLevelRank } from '@/lib/evidence-level';
import { CONCERN_COPY, type ComplianceConcern } from '@/lib/compliance-review-hints';
import { groupOpen } from '@/lib/business-card';
import { notDetermined } from '@/lib/workspace-model';
import { fetchStandardFit, type StandardFitOutcome } from '@/lib/standard-fit-client';
import type { FitRow } from '@/lib/standard-fit-view';
import { ruleEntries } from '@/lib/rules-editor';
import { useProcessStates } from '@/hooks/useProcessStates';
import type { Project } from '@/lib/types';
import {
  wt,
  fitCandidateLine,
  fitCountsLine,
  fitDroppedLine,
  fitNextShort,
  fitNotDeterminedShort,
  fitReadRefusal,
  fitScenariosSummary,
  fitUsersSummary,
  fitTasksCount,
} from '@/lib/workspace-messages';

/**
 * *Standard fit* — mockup screen `s3`, roadmap 7.2.
 *
 * The table first: one row per capability (the rules that decide the same
 * subject), what SAP standard the product can point to, how strong that pointer
 * is (E0–E4), the fit, and the next task. Legend and details on request (§2.11).
 *
 * **Only data the product has.** The rows come from `GET …/standard-fit`, which
 * runs `deriveStandardCoverage` against SAP's cloudification catalogue on the
 * server. A catalogue successor is at most E1 and its fit is *Not determined* —
 * "a catalog hit is not a fit". No scope item is shown, because none has been
 * supplied and none is invented; the table says so in a sentence instead of
 * leaving a column that looks filled.
 *
 * The rail on the right turns what is open into tasks (`notDetermined`, the
 * same list the Business card counts) and names the compliance hints the tables
 * read suggest — each an instruction to check, never a classification.
 */

function shortName(row: FitRow): string {
  return row.name ?? row.technical;
}

export default function StandardFitTable({
  project,
  projectId,
}: {
  project: Project | null;
  projectId: string;
}) {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  const [outcome, setOutcome] = useState<StandardFitOutcome | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [byLevel, setByLevel] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const states = useProcessStates(projectId, source.trim().length > 0);
  const entries = useMemo(
    () => ruleEntries(states.outcome?.ok ? states.outcome.view : null),
    [states.outcome],
  );

  useEffect(() => {
    if (!source.trim()) return;
    let cancelled = false;
    void fetchStandardFit(projectId).then((next) => {
      if (!cancelled) setOutcome(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, source]);

  const open = useMemo(() => notDetermined(project), [project]);
  const tasks = useMemo(() => groupOpen(open.items), [open]);

  if (!source.trim()) return null;
  if (outcome === null) {
    return (
      <p data-standard-fit="reading" className="m-0 text-[13px] font-medium text-cc-ink-muted">
        {wt('fit.reading')}
      </p>
    );
  }
  if (!outcome.ok) {
    return (
      <p data-standard-fit="unavailable" className="m-0 text-[13px] font-medium text-cc-ink-muted">
        {fitReadRefusal(outcome.code)}
      </p>
    );
  }

  const view = outcome.view;
  const rows = byLevel
    ? [...view.rows].sort((a, b) => evidenceLevelRank(b.level) - evidenceLevelRank(a.level) || a.id.localeCompare(b.id))
    : view.rows;
  const dropped = Object.values(entries)
    .filter((e) => e.state === 'drop')
    .map((e) => e.subject);

  const columns: CcTableColumn[] = [
    { key: 'capability', label: wt('fit.colCapability'), width: '22%' },
    { key: 'rules', label: wt('fit.colRules'), width: '10%' },
    { key: 'candidate', label: wt('fit.colCandidate') },
    { key: 'evidence', label: wt('fit.colEvidence'), width: '15%' },
    { key: 'fit', label: wt('fit.colFit'), width: '16%' },
    { key: 'next', label: wt('fit.colNext'), width: '16%' },
  ];

  const tableRows: CcTableRowSpec[] = rows.map((row) => ({
    key: row.id,
    selected: selected === row.id,
    onOpen: () => setSelected((s) => (s === row.id ? null : row.id)),
    cells: {
      capability: (
        <span data-fit-row={row.id} className="flex flex-col gap-1">
          <span className="font-bold text-cc-ink">{shortName(row)}</span>
          <code className="font-cc-mono text-[11px] font-semibold text-cc-ink-muted">{row.id}</code>
        </span>
      ),
      rules: (
        <span className="flex flex-col gap-1">
          {row.ruleIds.map((id) => {
            const state = entries[id]?.state ?? null;
            return (
              <span key={id} className="flex flex-col">
                <code className="font-cc-mono text-[12px] font-semibold text-cc-ink">{id}</code>
                {state === 'change' ? (
                  <span className="text-[12px] font-medium text-cc-ink-muted">{wt('fit.ruleChanged')}</span>
                ) : state === 'drop' ? (
                  <span className="text-[12px] font-medium text-cc-ink-muted">{wt('fit.ruleDropped')}</span>
                ) : null}
              </span>
            );
          })}
        </span>
      ),
      candidate: (
        <span className="flex flex-col gap-1">
          {row.candidates.length === 0 && row.scopeItems.length === 0 ? (
            <span className="font-medium text-cc-ink-muted">{wt('fit.noCatalogHit')}</span>
          ) : null}
          {row.candidates.slice(0, 2).map((c) => (
            <span key={`${c.object}-${c.successor}`} className="flex flex-wrap items-center gap-1">
              <span>{fitCandidateLine(c.object, c.successor)}</span>
              <CcAnchor tone="unlinked">{c.anchor}</CcAnchor>
            </span>
          ))}
          {row.scopeItems.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      ),
      evidence: <CcEvidenceLevel value={row.level} />,
      fit:
        row.fit === null ? (
          <span className="flex flex-col items-start gap-1">
            <CcProvenanceChip value="not-determined" />
            <span className="text-[12px] font-medium text-cc-ink-muted">
              {fitNotDeterminedShort(row.notDetermined)}
            </span>
          </span>
        ) : (
          <CcObjectStatus value={row.fit} />
        ),
      next: <span className="text-[12px] font-medium text-cc-ink">{fitNextShort(row.level)}</span>,
    },
    note:
      selected === row.id ? (
        <div data-fit-detail={row.id} className="flex flex-col gap-2 text-[12px] font-medium text-cc-ink">
          <span>
            <span className="font-semibold">{wt('fit.detailSubject')}</span>{' '}
            <code className="font-cc-mono">{row.technical}</code>
          </span>
          {row.objects.length > 0 ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{wt('fit.detailObjects')}</span>
              {row.objects.slice(0, 8).map((o) => (
                <span key={`${o.name}-${o.anchor}-${o.access}`} className="inline-flex items-center gap-1">
                  <code className="font-cc-mono">{o.name}</code>
                  <CcAnchor tone="unlinked">{o.anchor}</CcAnchor>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-cc-ink-muted">{wt('fit.detailNoObjects')}</span>
          )}
          {row.next ? (
            <span>
              <span className="font-semibold">{wt('fit.detailNext')}</span> {row.next}
            </span>
          ) : null}
        </div>
      ) : undefined,
  }));

  return (
    <div data-standard-fit="" className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <CcCard
          title={wt('fit.title')}
          count={view.rows.length}
          meta={<span className="text-[12px] font-medium text-cc-ink-muted">{wt('fit.titleNote')}</span>}
          actions={
            <>
              <CcButton
                variant="ghost"
                aria-expanded={legendOpen}
                onClick={() => setLegendOpen((v) => !v)}
                data-fit-legend-toggle=""
              >
                {wt('fit.legend')}
              </CcButton>
              <CcButton
                variant="ghost"
                icon={<ArrowUpDown size={16} aria-hidden={true} />}
                aria-pressed={byLevel}
                onClick={() => setByLevel((v) => !v)}
                data-fit-sort=""
              >
                {byLevel ? wt('fit.sortByOrder') : wt('fit.sortByLevel')}
              </CcButton>
            </>
          }
        >
          {legendOpen ? (
            <dl data-fit-legend="" className="m-0 mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-cc-row border border-cc-line bg-cc-surface-muted p-3 text-[12px]">
              {EVIDENCE_LEVEL_VALUES.map((level) => (
                <React.Fragment key={level}>
                  <dt>
                    <CcEvidenceLevel value={level} />
                  </dt>
                  <dd className="m-0 font-medium text-cc-ink">{evidenceLevel(level).meaning}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : null}
          {view.rows.length === 0 ? (
            <p data-fit-empty="" className="m-0 text-[13px] font-medium text-cc-ink-muted">
              {wt('fit.noCapabilities')}
            </p>
          ) : (
            <CcTable caption={wt('fit.title')} columns={columns} rows={tableRows} limit={12} />
          )}
          <p data-fit-footer="" className="m-0 mt-3 text-[12px] leading-snug font-medium text-cc-ink-muted">
            {dropped.length > 0 ? `${fitDroppedLine(dropped)} ` : null}
            {fitCountsLine(view.counts.withCandidate, view.counts.notDetermined, view.catalogConsulted)}{' '}
            {wt('fit.scopeItemsNotDetermined')}
          </p>
          {view.unassigned.length > 0 ? (
            <p className="m-0 mt-1 text-[12px] leading-snug font-medium text-cc-ink-muted">
              {view.unassigned.map((u) => u.ruleId).join(', ')} · {wt('fit.unassigned')}
            </p>
          ) : null}
        </CcCard>

        <div className="rounded-cc-card border border-cc-line bg-cc-surface px-4 py-1 shadow-cc">
          <CcDisclosure title={wt('fit.usersTitle')} count={view.users.total} level={3}>
            <p className="m-0 mb-2 text-[13px] font-medium text-cc-ink-muted">
              {fitUsersSummary(view.users.total, view.users.pointers, view.users.trainingHints)}
            </p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {view.users.items.map((u) => (
                <li key={u.id} className="flex flex-col gap-1 text-[13px] font-medium text-cc-ink">
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="font-cc-mono text-[12px] font-semibold">{u.subject}</code>
                    {u.anchor ? <CcAnchor tone="unlinked">{u.anchor}</CcAnchor> : null}
                  </span>
                  {u.today ? <span>{u.today}</span> : null}
                  <span className="text-[12px] text-cc-ink-muted">{u.future ?? wt('fit.futureNotDetermined')}</span>
                </li>
              ))}
            </ul>
          </CcDisclosure>
          <div className="border-t border-cc-line">
            <CcDisclosure title={wt('fit.scenariosTitle')} count={view.scenarios.total} level={3}>
              <p className="m-0 mb-2 text-[13px] font-medium text-cc-ink-muted">
                {fitScenariosSummary(view.scenarios.total, view.scenarios.runnable, view.scenarios.blocked)}
              </p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {view.scenarios.items.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-cc-ink">
                    <code className="font-cc-mono text-[12px] font-semibold text-cc-ink-muted">{s.ruleId}</code>
                    <code className="font-cc-mono text-[12px]">{s.title}</code>
                    <CcObjectStatus value={s.blocked ? 'open' : 'not-started'} />
                  </li>
                ))}
              </ul>
            </CcDisclosure>
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-4">
        <CcCard title={wt('fit.tasksTitle')} count={tasks.length}>
          <p className="m-0 mb-2 text-[12px] font-medium text-cc-ink-muted">{wt('fit.tasksLead')}</p>
          {tasks.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('fit.tasksNone')}</p>
          ) : (
            <ul data-fit-tasks="" className="m-0 flex list-none flex-col gap-2 p-0">
              {tasks.slice(0, 6).map((task) => (
                <li key={task.label} className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-cc-ink-muted">
                    <CircleHelp size={16} aria-hidden={true} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13px] font-semibold text-cc-ink">{fitTasksCount(task.label, task.count)}</span>
                    <span className="flex flex-wrap gap-1">
                      {task.anchors.map((a) => (
                        <CcAnchor key={a} tone="unlinked">
                          {a}
                        </CcAnchor>
                      ))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CcCard>
        <CcCard
          title={wt('fit.complianceTitle')}
          meta={<CcProvenanceChip value="reconstructed" note={wt('fit.complianceNote')} />}
        >
          {view.compliance.hints.length === 0 ? (
            <p className="m-0 text-[13px] font-medium text-cc-ink-muted">{wt('fit.complianceNone')}</p>
          ) : (
            <ul data-fit-compliance="" className="m-0 flex list-none flex-col gap-2 p-0">
              {view.compliance.hints.map((hint) => (
                <li key={hint.title} className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-cc-ink-muted">
                    {hint.concerns.includes('personal-data') ? (
                      <Users size={16} aria-hidden={true} />
                    ) : (
                      <FileText size={16} aria-hidden={true} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-[13px] font-semibold text-cc-ink">
                      {hint.concerns
                        .map((c) => CONCERN_COPY[c as ComplianceConcern]?.label ?? c)
                        .join(' · ')}
                    </span>
                    <span className="text-[12px] font-medium text-cc-ink-muted">
                      {hint.title} · <code className="font-cc-mono">{hint.tables.join(', ')}</code>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 mt-2 flex items-center gap-1 text-[12px] font-medium text-cc-ink-muted">
            <ListChecks size={14} aria-hidden={true} />
            {wt('fit.complianceLead')}
          </p>
        </CcCard>
      </aside>
    </div>
  );
}
