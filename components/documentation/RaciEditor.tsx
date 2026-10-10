'use client';

import React, { useId, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import CcButton from '@/components/cc/Button';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import type { SopStep } from '@/lib/business-summary';
import {
  RACI_CELLS,
  RACI_EDIT_LIMITS,
  cleanRoleName,
  roleNameProblem,
  type RaciCell,
  type RaciEditRow,
} from '@/lib/raci-edit';
import { raciCellLabel, raciLetterWord, wt } from '@/lib/workspace-messages';
import { cn } from '@/lib/utils';

/** What the editor hands back on Save: the roles and one row per step. */
export interface RaciDraft {
  roles: string[];
  steps: RaciEditRow[];
}

const FIELD =
  'h-8 min-w-0 rounded-cc-row border border-cc-field-border bg-cc-surface px-2 cc-text-cell text-cc-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cc-focus pointer-coarse:min-h-11';

/**
 * The owner's RACI editor (owner request 10.10.2026, ADR-084 amended) — the
 * *Enter* pattern of ADR-083 with an explicit submit: the roles as fields
 * (rename, add, remove), one choice per step and role — Responsible,
 * Accountable, Consulted, Informed or none — and "Save RACI" / "Cancel". The
 * server checks and stores it (`POST /api/projects/{id}/raci`); nothing is
 * written from the browser. In the demo the same editor keeps its result in
 * the page only.
 *
 * A native `<select>` per cell, as `CcSelect` is (the phone's own wheel, a
 * screen reader's own list), without a visible label of its own: the column
 * head names the role and the row the step, and the accessible name says both.
 * On a narrow screen the matrix scrolls inside its own frame; the page does not.
 */
export default function RaciEditor({
  steps,
  initial,
  saving = false,
  error = null,
  note,
  onSave,
  onCancel,
}: {
  /** The steps of the process, in order — the rows. */
  steps: readonly SopStep[];
  initial: RaciDraft;
  saving?: boolean;
  /** Why the last save failed, in one sentence. */
  error?: string | null;
  /** A line under the buttons — the demo says it keeps the result in this browser. */
  note?: React.ReactNode;
  onSave: (draft: RaciDraft) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [roles, setRoles] = useState<string[]>(initial.roles);
  const [cells, setCells] = useState<Record<string, RaciCell[]>>(() =>
    Object.fromEntries(steps.map((s) => [s.stepId, initial.steps.find((r) => r.stepId === s.stepId)?.cells.slice() ?? initial.roles.map(() => '' as RaciCell)])),
  );

  const problems = useMemo(
    () => roles.map((r, i) => roleNameProblem(r, roles.filter((_, j) => j !== i))),
    [roles],
  );
  const invalid = problems.some(Boolean);

  const rename = (i: number, value: string) => setRoles((rs) => rs.map((r, j) => (j === i ? value : r)));
  const addRole = () => {
    if (roles.length >= RACI_EDIT_LIMITS.maxRoles) return;
    setRoles((rs) => [...rs, '']);
    setCells((cs) => Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, [...v, '' as RaciCell]])));
  };
  const removeRole = (i: number) => {
    setRoles((rs) => rs.filter((_, j) => j !== i));
    setCells((cs) => Object.fromEntries(Object.entries(cs).map(([k, v]) => [k, v.filter((_, j) => j !== i)])));
  };
  const setCell = (stepId: string, i: number, value: RaciCell) =>
    setCells((cs) => ({ ...cs, [stepId]: (cs[stepId] ?? []).map((c, j) => (j === i ? value : c)) }));

  const save = () => {
    if (invalid) return;
    onSave({
      roles: roles.map(cleanRoleName),
      steps: steps.map((s) => ({ stepId: s.stepId, cells: (cells[s.stepId] ?? roles.map(() => '' as RaciCell)).slice(0, roles.length) })),
    });
  };

  const letterLabel = (c: RaciCell) => (c ? `${c} — ${raciLetterWord(c)}` : wt('doc.raciCellNone'));

  return (
    <div data-raci-editor="" className="flex min-w-0 flex-col gap-3">
      <div>
        <h4 className="m-0 cc-text-h3 text-cc-ink">{wt('doc.raciEditTitle')}</h4>
        <p className="m-0 mt-1 max-w-3xl cc-text-cell text-cc-ink-muted">{wt('doc.raciEditLead')}</p>
      </div>

      {/* The roles: rename, remove, add. */}
      <ul data-raci-editor-roles={roles.length} className="m-0 flex list-none flex-wrap items-start gap-2 p-0">
        {roles.map((role, i) => (
          <li key={i} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1">
              <label htmlFor={`${id}-role-${i}`} className="sr-only">{`${wt('doc.raciRoleName')} ${i + 1}`}</label>
              <input
                id={`${id}-role-${i}`}
                data-raci-editor-role={i}
                value={role}
                maxLength={RACI_EDIT_LIMITS.maxRoleChars + 10}
                placeholder={wt('doc.raciNewRole')}
                onChange={(e) => rename(i, e.target.value)}
                aria-invalid={problems[i] ? true : undefined}
                aria-describedby={problems[i] ? `${id}-role-${i}-problem` : undefined}
                className={cn(FIELD, 'w-44', problems[i] && 'border-cc-error')}
              />
              <CcIconButton
                label={`${wt('doc.raciRemoveRole')}: ${role || wt('doc.raciNewRole')}`}
                onClick={() => removeRole(i)}
                data-raci-editor-remove={i}
              >
                <X size={16} aria-hidden={true} />
              </CcIconButton>
            </span>
            {problems[i] ? <span id={`${id}-role-${i}-problem`} className="cc-text-meta font-medium text-cc-error">{problems[i]}</span> : null}
          </li>
        ))}
        <li>
          <CcButton
            variant="ghost"
            density="compact"
            icon={<Plus size={16} aria-hidden={true} />}
            onClick={addRole}
            disabled={roles.length >= RACI_EDIT_LIMITS.maxRoles}
            data-raci-editor-add=""
          >
            {wt('doc.raciAddRole')}
          </CcButton>
        </li>
      </ul>

      <div data-raci-editor-matrix="" className="min-w-0">
        <CcTable
          caption={wt('doc.raciEditTitle')}
          columns={[
            { key: 'step', label: wt('doc.sopStepColumn'), width: '220px' },
            ...roles.map((role, i) => ({ key: `r${i}`, label: cleanRoleName(role) || wt('doc.raciNewRole') })),
          ]}
          rows={steps.map((step) => ({
            key: step.stepId,
            cells: {
              step: (
                <span className="flex min-w-0 items-start gap-2">
                  <span aria-hidden={true} className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-cc-ink px-1 text-[12px] font-semibold text-cc-on-dark">{step.number}</span>
                  <span className="min-w-0 break-words">{step.step?.name ?? step.stepId}</span>
                </span>
              ),
              ...Object.fromEntries(roles.map((role, i) => [
                `r${i}`,
                <select
                  key={`${step.stepId}-${i}`}
                  aria-label={raciCellLabel(cleanRoleName(role), step.number, step.step?.name ?? step.stepId)}
                  data-raci-editor-cell={`${step.stepId}:${i}`}
                  value={cells[step.stepId]?.[i] ?? ''}
                  onChange={(e) => setCell(step.stepId, i, e.target.value as RaciCell)}
                  className={cn(FIELD, 'w-20 font-cc-mono font-semibold')}
                >
                  {RACI_CELLS.map((c) => <option key={c || 'none'} value={c}>{c ? c : wt('doc.raciCellNone')}</option>)}
                </select>,
              ])),
            },
          }))}
        />
        <p className="m-0 mt-2 cc-text-meta font-medium text-cc-ink-muted">{RACI_CELLS.filter(Boolean).map((c) => letterLabel(c)).join(' · ')}</p>
      </div>

      {error ? <CcMessageStrip state="error" headline={wt('doc.raciNotSaved')}>{error}</CcMessageStrip> : null}

      <div className="flex flex-wrap items-center gap-3">
        <CcButton variant="primary" density="cozy" onClick={save} disabled={invalid || saving} busy={saving} data-raci-editor-save="">
          {wt('doc.raciSave')}
        </CcButton>
        <CcButton variant="ghost" density="cozy" onClick={onCancel} disabled={saving} data-raci-editor-cancel="">
          {wt('doc.raciCancel')}
        </CcButton>
        {note ? <span className="cc-text-meta font-medium text-cc-ink-muted">{note}</span> : null}
      </div>
    </div>
  );
}
