import { test, expect } from '@playwright/test';
import { MAX_RACI_COLUMNS, RACI_LETTERS, processStepsOf, raciMatrix, sopSteps } from '../lib/business-summary';
import { raciGapWord } from '../lib/messages/documentation';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';
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
  // The columns are the roles that carry most: Accountable and Responsible.
  const weight = (r: (typeof matrix.roles)[number]) => r.counts.A + r.counts.R;
  const lightestShown = Math.min(...matrix.roles.map(weight));
  for (const r of matrix.moreRoles) expect(weight(r), r.name).toBeLessThanOrEqual(lightestShown);
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
});

test('the Confluence page carries the six columns, the key and the further roles', async () => {
  const html = await buildEngineConfluenceHtml(processDocumentOf(SOURCE), LAYER, { processSteps: STEPS }).text();
  const matrix = raciMatrix(sopSteps(LAYER, STEPS));
  const section = html.slice(html.indexOf('RACI matrix — Model proposal'));
  for (const r of matrix.roles) expect(section).toContain(`<th>${r.short}`);
  for (const r of matrix.moreRoles) expect(section).toContain(`<li>${r.name}: `);
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
