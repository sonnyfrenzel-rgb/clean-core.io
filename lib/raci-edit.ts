import {
  RACI_LETTERS,
  lettersOf,
  raciMatrix,
  sopSteps,
  type ProcessStepRef,
  type RaciLetter,
  type SopStep,
  type StoredBusinessLayer,
} from '@/lib/business-summary';
import { raciGapWord, raciLetterWord } from '@/lib/messages/documentation';
import type { PdRaciTable } from '@/lib/process-document-outline';

/**
 * The owner's own RACI — owner request of 10.10.2026, an exception to "the
 * Documentation tool takes no input" (ADR-084 amended, see
 * `docs/design/decisions.md`).
 *
 * The model proposes who is Responsible, Accountable, Consulted and Informed
 * at each step (ADR-068). The owner can now change every cell, rename, add and
 * remove roles. What the owner saves is the owner's (*Enter*, ADR-083): it is
 * written by `POST /api/projects/{projectId}/raci` through the Admin SDK only
 * — never from the browser — with a revision check, and read back by every
 * reader of the project through `GET` on the same route.
 *
 * The edit is bound to the proposal it was made on (`layerSha256`, the digest
 * of the stored `businessDocumentation`). When the proposal is regenerated, or
 * removed with the description it was written for, the digest no longer
 * matches and the edit stops applying — the stage asks before that happens
 * ("Replace …?", ADR-083) and says the edits are lost. No client write has to
 * clear a server-only field for that.
 *
 * Pure: no React, no Firebase, no clock. The route and the stage read the same
 * validation.
 */

export const RACI_EDIT_COLLECTION = 'business_layer';
export const RACI_EDIT_DOC = 'raci';
export const RACI_EDIT_FORMAT = 1;

export const RACI_EDIT_LIMITS = Object.freeze({
  /** A realistic process has four to six roles; twelve leaves room and keeps the matrix readable. */
  maxRoles: 12,
  maxRoleChars: 60,
  maxSteps: 200,
  maxStepIdChars: 120,
  /** The whole request body, in characters. */
  maxBodyChars: 64_000,
});

/** One cell of the matrix: one letter, or none. */
export type RaciCell = RaciLetter | '';
export const RACI_CELLS: readonly RaciCell[] = ['', 'R', 'A', 'C', 'I'];

export interface RaciEditRow {
  stepId: string;
  /** One cell per role, in the order of `roles`. */
  cells: RaciCell[];
}

/** What the stage sends. */
export interface RaciEditPayload {
  /** The revision this edit was made on; 0 when none is stored. */
  baseRevision: number;
  /** SHA-256 of the stored proposal (`businessDocumentation`) the edit was made on. */
  layerSha256: string;
  roles: string[];
  steps: RaciEditRow[];
}

/** What is stored and read back. */
export interface RaciEditRecord {
  formatVersion: typeof RACI_EDIT_FORMAT;
  revision: number;
  layerSha256: string;
  roles: string[];
  steps: RaciEditRow[];
  /** The account's name, else its e-mail (ADR-083 b) — shown on the stage, never written into a file. */
  editedBy: string;
  /** ISO time from the server. */
  editedAt: string;
}

const PAYLOAD_KEYS = ['baseRevision', 'layerSha256', 'roles', 'steps'] as const;
const ROW_KEYS = ['stepId', 'cells'] as const;
const STEP_ID = /^[A-Za-z0-9_.:-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type RaciEditCheck =
  | { ok: true; value: Omit<RaciEditPayload, 'baseRevision'> & { baseRevision: number } }
  | { ok: false; error: string; field: string };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A role name as the owner typed it, trimmed and with its inner spaces folded. */
export const cleanRoleName = (name: string): string => name.replace(/\s+/g, ' ').trim();

/**
 * Why a role name cannot be stored, or null when it can. A comma, semicolon or
 * slash would split it into two roles when the matrix reads it back
 * (`splitRoles`), so they are refused rather than silently changed.
 */
export function roleNameProblem(name: string, others: readonly string[] = []): string | null {
  const clean = cleanRoleName(name);
  if (!clean) return 'Name the role.';
  if (clean.length > RACI_EDIT_LIMITS.maxRoleChars) return `At most ${RACI_EDIT_LIMITS.maxRoleChars} characters.`;
  if (/[,;/\u0000-\u001f\u007f<>]/.test(clean)) return 'No comma, semicolon, slash or angle bracket in a role name.';
  if (others.some((o) => cleanRoleName(o).toLowerCase() === clean.toLowerCase())) return 'Another role has this name.';
  return null;
}

/**
 * The server's check of a payload: known keys only, bounded sizes, one letter
 * or none per cell, one row per step, every role name storable. A refusal
 * names the field.
 */
export function validateRaciEditPayload(body: unknown): RaciEditCheck {
  if (!isPlainObject(body)) return { ok: false, error: 'Expected { baseRevision, layerSha256, roles, steps }.', field: 'body' };
  const unknown = Object.keys(body).filter((k) => !(PAYLOAD_KEYS as readonly string[]).includes(k));
  if (unknown.length) return { ok: false, error: `Unknown field ${unknown[0]}.`, field: unknown[0] };
  const { baseRevision, layerSha256, roles, steps } = body;
  if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0 || baseRevision > 1_000_000) {
    return { ok: false, error: 'baseRevision must be a whole number from 0.', field: 'baseRevision' };
  }
  if (typeof layerSha256 !== 'string' || !SHA256.test(layerSha256)) {
    return { ok: false, error: 'layerSha256 must be a SHA-256 in hex.', field: 'layerSha256' };
  }
  if (!Array.isArray(roles) || roles.length > RACI_EDIT_LIMITS.maxRoles) {
    return { ok: false, error: `roles must be a list of at most ${RACI_EDIT_LIMITS.maxRoles} names.`, field: 'roles' };
  }
  const cleanRoles: string[] = [];
  for (let i = 0; i < roles.length; i += 1) {
    const r = roles[i];
    if (typeof r !== 'string') return { ok: false, error: 'A role name must be text.', field: `roles[${i}]` };
    const problem = roleNameProblem(r, cleanRoles);
    if (problem) return { ok: false, error: problem, field: `roles[${i}]` };
    cleanRoles.push(cleanRoleName(r));
  }
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > RACI_EDIT_LIMITS.maxSteps) {
    return { ok: false, error: `steps must be a list of 1 to ${RACI_EDIT_LIMITS.maxSteps} rows.`, field: 'steps' };
  }
  const seen = new Set<string>();
  const rows: RaciEditRow[] = [];
  for (let i = 0; i < steps.length; i += 1) {
    const row = steps[i];
    if (!isPlainObject(row)) return { ok: false, error: 'A row must be { stepId, cells }.', field: `steps[${i}]` };
    const extra = Object.keys(row).filter((k) => !(ROW_KEYS as readonly string[]).includes(k));
    if (extra.length) return { ok: false, error: `Unknown field ${extra[0]}.`, field: `steps[${i}].${extra[0]}` };
    const { stepId, cells } = row;
    if (typeof stepId !== 'string' || !stepId || stepId.length > RACI_EDIT_LIMITS.maxStepIdChars || !STEP_ID.test(stepId)) {
      return { ok: false, error: 'stepId must be a process element id.', field: `steps[${i}].stepId` };
    }
    if (seen.has(stepId)) return { ok: false, error: `Step ${stepId} is listed twice.`, field: `steps[${i}].stepId` };
    seen.add(stepId);
    if (!Array.isArray(cells) || cells.length !== cleanRoles.length) {
      return { ok: false, error: 'Each row needs one cell per role.', field: `steps[${i}].cells` };
    }
    for (let c = 0; c < cells.length; c += 1) {
      if (!(RACI_CELLS as readonly unknown[]).includes(cells[c])) {
        return { ok: false, error: 'A cell is R, A, C, I or empty.', field: `steps[${i}].cells[${c}]` };
      }
    }
    rows.push({ stepId, cells: cells as RaciCell[] });
  }
  return { ok: true, value: { baseRevision, layerSha256, roles: cleanRoles, steps: rows } };
}

/** A stored record read back defensively; null when it is not one. */
export function readRaciEditRecord(data: unknown): RaciEditRecord | null {
  if (!isPlainObject(data) || data.formatVersion !== RACI_EDIT_FORMAT) return null;
  const checked = validateRaciEditPayload({ baseRevision: 0, layerSha256: data.layerSha256, roles: data.roles, steps: data.steps });
  if (!checked.ok) return null;
  if (typeof data.revision !== 'number' || !Number.isInteger(data.revision) || data.revision < 1) return null;
  if (typeof data.editedAt !== 'string' || typeof data.editedBy !== 'string') return null;
  return {
    formatVersion: RACI_EDIT_FORMAT,
    revision: data.revision,
    layerSha256: checked.value.layerSha256,
    roles: checked.value.roles,
    steps: checked.value.steps,
    editedBy: data.editedBy.slice(0, 200),
    editedAt: data.editedAt,
  };
}

/** Whether a stored edit belongs to the proposal on record — a regenerated proposal leaves it behind. */
export const raciEditApplies = (record: RaciEditRecord | null, layerSha256: string | null): record is RaciEditRecord =>
  !!record && !!layerSha256 && record.layerSha256 === layerSha256;

/**
 * The proposal with the owner's RACI in place of the model's: the SOP stays
 * the model's, the RACI rows are the edit's — in the shape the matrix, the
 * strip and the exports already read (`raci_matrix` of `r`/`a`/`c`/`i`).
 */
export function layerWithRaciEdit(layer: StoredBusinessLayer, record: RaciEditRecord): StoredBusinessLayer {
  const raci_matrix = record.steps.map((row) => {
    const of = (letter: RaciLetter) => record.roles.filter((_, i) => row.cells[i] === letter).join(', ');
    return { stepId: row.stepId, r: of('R'), a: of('A'), c: of('C'), i: of('I') };
  });
  return { ...layer, raci_matrix };
}

/**
 * The draft the editor opens with: the roles of the matrix on screen (columns
 * first, then the further roles) and one row per step of the process. Where
 * the proposal gives one role two letters on a step, the stronger one is kept
 * (A before R before C before I) — a cell holds one letter.
 */
export function raciDraftOf(steps: readonly SopStep[], roleNames: readonly string[]): { roles: string[]; steps: RaciEditRow[] } {
  const roles = roleNames.slice(0, RACI_EDIT_LIMITS.maxRoles).map(cleanRoleName);
  const rank: RaciLetter[] = ['A', 'R', 'C', 'I'];
  return {
    roles,
    steps: steps.map((s) => ({
      stepId: s.stepId,
      cells: roles.map((role) => {
        const key = role.toLowerCase();
        return rank.find((l) => s.roles[l].some((r) => r.toLowerCase() === key)) ?? '';
      }),
    })),
  };
}

/** "Edited by Mara Weber · 10 Oct 2026" is the stage's line; a file says this — never an account's address. */
export const RACI_EDITED_IN_FILE = 'Edited by the owner of the project';

/**
 * The RACI as a file prints it (Word, Markdown, Confluence): every role the
 * rows name — the drawn columns, then the further ones — steps × roles, the
 * gaps in words, and one line that says whose RACI it is. The owner's edit
 * names no account and no address: a file leaves the product.
 */
export function raciFileTable(
  layer: StoredBusinessLayer,
  process: ProcessStepRef[],
  edit: RaciEditRecord | null,
): PdRaciTable | null {
  const matrix = raciMatrix(sopSteps(layer, process));
  if (matrix.steps.length === 0) return null;
  const roles = [...matrix.roles, ...matrix.moreRoles];
  const legend = RACI_LETTERS.map((l) => `${l} ${raciLetterWord(l)}`).join(' · ');
  return {
    title: RACI_FILE_TITLE,
    note: edit
      ? `${RACI_EDITED_IN_FILE} · ${edit.editedAt.slice(0, 10)}. ${legend}.`
      : `${RACI_PROPOSAL_IN_FILE} ${legend}.`,
    head: ['No.', 'Step', ...roles.map((r) => r.name), 'Check'],
    rows: matrix.steps.map((s) => [
      String(s.number),
      s.step?.name ?? s.stepId,
      ...roles.map((r) => lettersOf(s, r.name).join(' ')),
      s.gaps.map(raciGapWord).join(', '),
    ]),
  };
}

/** The heading of the RACI in a file. */
export const RACI_FILE_TITLE = 'Who is responsible (RACI)';
/** The provenance line of the model's RACI in a file. */
export const RACI_PROPOSAL_IN_FILE = 'Model proposal — the roles are a proposal for the business to confirm.';
