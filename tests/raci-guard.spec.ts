import { test, expect } from '@playwright/test';
import { MAX_RACI_COLUMNS, RACI_LETTERS, isThinNarrative, processStepsOf, raciMatrix, sopSteps, stepsNotInProcess } from '../lib/business-summary';
import {
  RACI_EDIT_LIMITS,
  layerWithRaciEdit,
  raciDraftOf,
  raciEditApplies,
  raciFileTable,
  readRaciEditRecord,
  roleNameProblem,
  validateRaciEditPayload,
  type RaciEditRecord,
} from '../lib/raci-edit';
import { raciGapWord } from '../lib/messages/documentation';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { UNKNOWN_STEP_ID, businessLayerFor, engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';
import { OVERLOAD_ROLES, STEP_WITHOUT_ACCOUNTABLE, overloadedLayerFor } from './helpers/raci-overload-fixture';
import fs from 'fs';
import path from 'path';

/**
 * Owner, 04.10.2026, on the RACI of Z_MM_PO_APPROVAL: "unrealistically many
 * roles in the RACI" — fourteen job titles of a large corporation, a matrix
 * that scrolled sideways at 1440 px, and a step without an Accountable under a
 * line that said every step had one.
 *
 * Held here, over that layer (`tests/helpers/raci-overload-fixture.ts`):
 *   - the matrix draws at most six role columns, the ones that carry most, and
 *     lists every other role under it with its letters — nothing is dropped,
 *     nothing merged, nothing invented;
 *   - a step without an Accountable is named as such, and the matrix never says
 *     every step has one while one does not;
 *   - the same layer gives the same matrix;
 *   - the Confluence page carries the shown roles, the key to short heads and
 *     the further roles;
 *   - the prompt asks for a small, realistic set with one Accountable per step.
 */

const SOURCE = fixtureSource();
const DOC = engineDocumentationOf(SOURCE);
const STEPS = processStepsOf(DOC.steps);
const LAYER = overloadedLayerFor(DOC);

test('fourteen roles: six columns, the other eight listed under the matrix, none lost', () => {
  const matrix = raciMatrix(sopSteps(LAYER, STEPS));
  expect(matrix.roles.length).toBe(MAX_RACI_COLUMNS);
  expect(matrix.moreRoles.length).toBe(OVERLOAD_ROLES.length - MAX_RACI_COLUMNS);
  const all = [...matrix.roles, ...matrix.moreRoles].map((r) => r.name).sort();
  expect(all).toEqual([...OVERLOAD_ROLES].sort());
  // Every letter the layer gives stands in a column or in the step's "more".
  for (const step of matrix.steps) {
    const given = RACI_LETTERS.reduce((n, l) => n + step.roles[l].length, 0);
    const shown = matrix.roles.reduce((n, r) => n + RACI_LETTERS.filter((l) => step.roles[l].some((x) => x.toLowerCase() === r.name.toLowerCase())).length, 0);
    const more = step.more.reduce((n, m) => n + m.letters.length, 0);
    expect(shown + more, step.stepId).toBe(given);
  }
  // The columns are chosen for the Accountables first (coordinator 04.10.2026):
  // every step shows its Accountable — in a column, or named in the row.
  for (const step of matrix.steps) {
    for (const a of step.roles.A) {
      const inColumn = matrix.roles.some((r) => r.name.toLowerCase() === a.toLowerCase());
      expect(inColumn || step.hiddenAccountable.includes(a), `${step.stepId}: ${a}`).toBe(true);
      expect(inColumn && step.hiddenAccountable.includes(a)).toBe(false);
    }
  }
  // Six columns, all of them Accountable somewhere: the cover goes before the fill.
  expect(matrix.roles.every((r) => r.counts.A > 0)).toBe(true);
  expect(matrix.totalRoles).toBe(14);
  // A long name gets a short head; the full name stays the role's name.
  for (const r of matrix.roles) expect(r.short.length, r.name).toBeLessThanOrEqual(16);
  expect(new Set(matrix.roles.map((r) => r.short)).size).toBe(matrix.roles.length);
});

test('a step without an Accountable says so, and the matrix does not claim every step has one', () => {
  const matrix = raciMatrix(sopSteps(LAYER, STEPS));
  const step = matrix.steps[STEP_WITHOUT_ACCOUNTABLE];
  expect(step.roles.A).toEqual([]);
  expect(step.gaps).toContain('no-accountable');
  expect(raciGapWord('no-accountable')).toBe('No Accountable named — to clarify');
  expect(matrix.gapCount).toBeGreaterThan(0);
  // None is invented for it.
  expect(matrix.steps.filter((s) => s.roles.A.length === 0).map((s) => s.stepId)).toEqual([step.stepId]);
});

test('the same layer gives the same matrix', () => {
  const a = raciMatrix(sopSteps(LAYER, STEPS));
  const b = raciMatrix(sopSteps(JSON.parse(JSON.stringify(LAYER)), STEPS));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('a small layer is drawn whole, with its names as heads', () => {
  const small = {
    raci_matrix: [{ stepId: STEPS[0].id, r: 'Buyer', a: 'Purchasing Lead', c: 'Approver', i: 'Requester' }],
    sop_details: [{ stepId: STEPS[0].id, narrative: 'Checks the requisition.' }],
  };
  const matrix = raciMatrix(sopSteps(small, STEPS));
  expect(matrix.roles.map((r) => r.name)).toEqual(['Buyer', 'Purchasing Lead', 'Approver', 'Requester']);
  expect(matrix.roles.every((r) => r.short === r.name)).toBe(true);
  expect(matrix.moreRoles).toEqual([]);
  expect(matrix.gapCount).toBe(0);
  expect(matrix.steps[0].hiddenAccountable).toEqual([]);
});

test('when the Accountables fit the columns, every row shows its A in a column', () => {
  // Seven roles, three of them Accountable: all three become columns.
  const rows = STEPS.slice(0, 6).map((st, i) => ({
    stepId: st.id, r: ['Buyer', 'Requester', 'Approver', 'Finance', 'IT support', 'Buyer'][i], a: ['Purchasing Lead', 'Process Owner', 'Controller'][i % 3], c: 'Auditor', i: 'Requester',
  }));
  const matrix = raciMatrix(sopSteps({ raci_matrix: rows, sop_details: [] }, STEPS));
  for (const a of ['Purchasing Lead', 'Process Owner', 'Controller']) expect(matrix.roles.map((r) => r.name)).toContain(a);
  for (const st of matrix.steps) expect(st.hiddenAccountable).toEqual([]);
});

test('the Confluence page carries the six columns, the key and the further roles', async () => {
  const html = await buildEngineConfluenceHtml(processDocumentOf(SOURCE), LAYER, { processSteps: STEPS }).text();
  const matrix = raciMatrix(sopSteps(LAYER, STEPS));
  const section = html.slice(html.indexOf('RACI matrix — Model proposal'));
  for (const r of matrix.roles) expect(section).toContain(`<th>${r.short}`);
  for (const r of matrix.moreRoles) expect(section).toContain(`<li>${r.name}: `);
  for (const st of matrix.steps) for (const a of st.hiddenAccountable) expect(section).toContain(`A: ${a}`);
  for (const r of matrix.roles.filter((x) => x.short !== x.name)) expect(section).toContain(`${r.short} = ${r.name}`);
  expect(html).toContain('No Accountable named — to clarify');
});

test('the prompt asks for a small, realistic set of roles and one Accountable per step', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
  expect(page).toContain('typically 4 to 6 roles, never more than 7');
  expect(page).toContain('EXACTLY ONE Accountable');
  expect(page).toContain('The roles are a proposal the business will confirm');
  // An owner can ask for a new proposal; the transaction replaces only the layer it was asked to replace.
  expect(page).toContain('data-regenerate-business-layer');
  expect(page).toContain('current.businessDocumentation !== replacing');
});

/* ------------------------------------------------------------------------ *
 * Owner review and request of 10.10.2026.
 * ------------------------------------------------------------------------ */

test('a row for a step the process does not have is never drawn, and said once', async () => {
  const layer = businessLayerFor(DOC);
  const steps = sopSteps(layer, STEPS);
  expect(steps.some((s) => s.stepId === UNKNOWN_STEP_ID)).toBe(false);
  expect(steps.every((s) => s.step !== null)).toBe(true);
  expect(stepsNotInProcess(layer, STEPS)).toBe(1);
  expect(raciMatrix(steps).steps.some((s) => s.stepId === UNKNOWN_STEP_ID)).toBe(false);
  const html = await buildEngineConfluenceHtml(processDocumentOf(SOURCE), layer, { processSteps: STEPS }).text();
  expect(html).not.toContain(UNKNOWN_STEP_ID);
});

test('thin SOP text is flagged, never hidden', () => {
  expect(isThinNarrative(null)).toBe(true);
  expect(isThinNarrative('The check authority step is carried out by the responsible role.')).toBe(true);
  expect(isThinNarrative('Done.')).toBe(true);
  expect(isThinNarrative('The buyer checks the requisition against the budget and asks the requester when a field is missing.')).toBe(false);
  const steps = sopSteps(businessLayerFor(DOC), STEPS);
  expect(steps.filter((s) => s.thin).length).toBe(steps.length);
});

const SHA = 'a'.repeat(64);
const STEP_IDS = STEPS.slice(0, 3).map((s) => s.id);
const payload = (over: Record<string, unknown> = {}) => ({
  baseRevision: 0,
  layerSha256: SHA,
  roles: ['Buyer', 'Approver'],
  steps: STEP_IDS.map((stepId, i) => ({ stepId, cells: [i === 0 ? 'A' : 'R', i === 0 ? 'R' : 'A'] })),
  ...over,
});

test('the server reads a RACI edit by known keys and bounded sizes only', () => {
  expect(validateRaciEditPayload(payload()).ok).toBe(true);
  const refused = (body: unknown, field: string) => {
    const r = validateRaciEditPayload(body);
    expect(r.ok, JSON.stringify(body).slice(0, 80)).toBe(false);
    if (!r.ok) expect(r.field).toContain(field);
  };
  refused(payload({ extra: 1 }), 'extra');
  refused(payload({ baseRevision: -1 }), 'baseRevision');
  refused(payload({ layerSha256: 'nope' }), 'layerSha256');
  refused(payload({ roles: Array.from({ length: RACI_EDIT_LIMITS.maxRoles + 1 }, (_, i) => `Role ${i}`) }), 'roles');
  refused(payload({ roles: ['Buyer', 'buyer'] }), 'roles[1]');
  refused(payload({ roles: ['Buyer, Approver', 'X'] }), 'roles[0]');
  refused(payload({ roles: ['<b>', 'X'] }), 'roles[0]');
  refused(payload({ steps: [] }), 'steps');
  refused(payload({ steps: [{ stepId: STEP_IDS[0], cells: ['X', ''] }] }), 'cells[0]');
  refused(payload({ steps: [{ stepId: STEP_IDS[0], cells: ['R'] }] }), 'cells');
  refused(payload({ steps: [{ stepId: 'a b', cells: ['R', ''] }] }), 'stepId');
  refused(payload({ steps: [{ stepId: STEP_IDS[0], cells: ['R', ''] }, { stepId: STEP_IDS[0], cells: ['', 'A'] }] }), 'stepId');
  refused(payload({ steps: [{ stepId: STEP_IDS[0], cells: ['R', ''], note: 'x' }] }), 'note');
  expect(roleNameProblem('  Process   Owner ')).toBeNull();
  expect(roleNameProblem('')).not.toBeNull();
});

test('the owner RACI replaces the model RACI in the matrix and in every file, and goes with the proposal it was made on', async () => {
  const checked = validateRaciEditPayload(payload());
  if (!checked.ok) throw new Error(checked.error);
  const record: RaciEditRecord = { formatVersion: 1, revision: 1, ...checked.value, editedBy: 'Mara Weber', editedAt: '2026-10-10T09:00:00.000Z' };
  const { baseRevision: _base, ...stored } = record as RaciEditRecord & { baseRevision?: number };
  void _base;
  expect(readRaciEditRecord(stored)).toEqual(stored);
  expect(readRaciEditRecord({ ...stored, formatVersion: 2 })).toBeNull();
  expect(raciEditApplies(record, SHA)).toBe(true);
  expect(raciEditApplies(record, 'b'.repeat(64))).toBe(false);
  const merged = layerWithRaciEdit(LAYER, record);
  const matrix = raciMatrix(sopSteps(merged, STEPS));
  expect(matrix.roles.map((r) => r.name).sort()).toEqual(['Approver', 'Buyer']);
  expect(matrix.steps.length).toBe(3);
  expect(matrix.steps[0].roles.A).toEqual(['Buyer']);
  // The SOP stays the model's.
  expect(merged.sop_details).toBe(LAYER.sop_details);
  // A file names no account: "Edited by the owner of the project · date".
  const file = raciFileTable(merged, STEPS, record)!;
  expect(file.note).toContain('Edited by the owner of the project · 2026-10-10');
  expect(file.note).not.toContain('Mara Weber');
  expect(file.head).toEqual(['No.', 'Step', ...matrix.roles.map((r) => r.name), 'Check']);
  const proposal = raciFileTable(LAYER, STEPS, null)!;
  expect(proposal.note).toMatch(/^Model proposal/);
  const html = await buildEngineConfluenceHtml(processDocumentOf(SOURCE), merged, { processSteps: STEPS, raciEdit: record }).text();
  expect(html).toContain('RACI matrix — Edited by the owner');
  expect(html).toContain('data-raci-edited=""');
  expect(html).not.toContain('Mara Weber');
  // The draft the editor opens with: one letter per cell, the stronger one kept.
  const draft = raciDraftOf(sopSteps(LAYER, STEPS), raciMatrix(sopSteps(LAYER, STEPS)).roles.map((r) => r.name));
  for (const row of draft.steps) expect(row.cells.length).toBe(draft.roles.length);
});

test('the RACI is written by the server only — a route behind the owner, no client rule', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', 'raci', 'route.ts'), 'utf8');
  for (const gate of ['verifyRequestAuth', 'assertMfaSatisfied', 'assertRateLimit', 'assertAccountActive', 'mayReadProject', 'project.userId !== decodedToken.uid', 'validateRaciEditPayload', 'revision-moved', 'layer-changed', 'unknown-step', 'readBoundedBody']) {
    expect(route, gate).toContain(gate);
  }
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  expect(rules).not.toContain('business_layer');
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
  expect(page).toContain("import('@/lib/raci-edit-client')");
  // Regenerating asks first and names the edits that go with it.
  expect(page).toContain('replaceSopBody(!!raciEdit)');
  expect(page).toContain('replaceDocBody(!!raciEdit)');
});

test('an export started before the saved RACI is read waits for it (QA 66e772bd346f)', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
  // The read is kept as a promise the exports await …
  expect(page).toContain("raciReadRef.current = import('@/lib/raci-edit-client')");
  const exporter = page.slice(page.indexOf('const exportRaci = async'), page.indexOf('/** A blueprint stored before 3.0.5'));
  expect(exporter).toContain('await raciReadRef.current;');
  // … and every file — Confluence, Markdown, Word — takes the RACI from it, not from the render state.
  expect(exporter.match(/await exportRaci\(\)/g)?.length).toBe(2);
  expect(exporter).not.toMatch(/raciFileTable\(businessLayer|buildEngineConfluenceHtml\([^)]*businessLayer|\braciEdit,/);
});
