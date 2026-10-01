import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { deriveBusinessRules, type BusinessRule } from '../lib/abap/business-rule-set';
import { heroRulePhrase, pickHeroRules, ruleImpact } from '../lib/landing-hero';

/**
 * The hero's "found in the code" sentence names rules by business impact
 * (landing mockup s0/s1: "tolerance 5 %, plant 1000, …"), not by the length of
 * their text. `pickHeroRules` is pure; these are its rules.
 */

const demo = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');

type R = Pick<BusinessRule, 'id' | 'typeBasis' | 'classes' | 'processElements'>;
const el = { nodeId: 'n', kind: 'gateway', label: '', region: '', relation: 'condition', lineStart: 1, lineEnd: 1, statementIndex: 0, tokenOffset: 0 } as unknown as BusinessRule['processElements'][number];
const rule = (id: string, classes: string[], basis: string, drawn = true): R => ({
  id,
  classes: classes as BusinessRule['classes'],
  typeBasis: [{ basis: basis as BusinessRule['typeBasis'][number]['basis'], anchors: [] }],
  processElements: drawn ? [el] : [],
});

test('the demo names the tolerance that holds the requisition, then the plant, then the amount limit', () => {
  const picked = pickHeroRules(deriveBusinessRules(demo).rules);
  expect(picked.map((r) => r.label)).toEqual([
    'lv_dev_pct > 5',
    "gs_eban-werks = '1000'",
    "gv_emergency = abap_true AND gv_amount <= '50000.00'",
  ]);
  // The mockup's anchors for the first two are lines the engine finds: L412, L87.
  expect(picked.map((r) => r.processElements[0].lineStart).slice(0, 2)).toEqual([412, 87]);
});

test('a rule that changes the outcome outranks one that does not; an undrawn rule is never named', () => {
  const picked = pickHeroRules([
    rule('BR-1', ['sonstiges'], 'flow-continues'),
    rule('BR-2', ['organisationseinheit'], 'declaration-only', false),
    rule('BR-3', ['sonstiges'], 'ends-flow'),
    rule('BR-4', ['toleranz'], 'flow-continues'),
  ]);
  expect(picked.map((r) => r.id)).toEqual(['BR-3', 'BR-4', 'BR-1']);
  expect(ruleImpact(rule('x', ['toleranz'], 'ends-flow'))).toBeGreaterThan(ruleImpact(rule('y', ['toleranz'], 'flow-continues')));
});

test('among equals, a different kind of value comes before a second of the same kind', () => {
  const picked = pickHeroRules([
    rule('BR-1', ['toleranz'], 'flow-continues'),
    rule('BR-2', ['toleranz'], 'flow-continues'),
    rule('BR-3', ['organisationseinheit'], 'flow-continues'),
  ], 2);
  expect(picked.map((r) => r.id)).toEqual(['BR-1', 'BR-3']);
});

test('deterministic: the same rules give the same three, in the same order', () => {
  const rules = deriveBusinessRules(demo).rules;
  expect(pickHeroRules(rules).map((r) => r.id)).toEqual(pickHeroRules([...rules]).map((r) => r.id));
});

test('a tolerance on a percentage reads as a tolerance; every other rule keeps its plain phrase', () => {
  const [tolerance, plant] = pickHeroRules(deriveBusinessRules(demo).rules);
  expect(heroRulePhrase(tolerance, 'deviation percent above 5')).toBe('tolerance 5 %');
  expect(heroRulePhrase(plant, 'plant 1000')).toBe('plant 1000');
});
