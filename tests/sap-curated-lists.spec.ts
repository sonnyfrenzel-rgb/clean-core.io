import { test, expect } from '@playwright/test';
import { findSapIdentifiers, sapIdMark, sapIdStateWord } from '../lib/sap-reference-check';
import { CURATED_SCENARIO_LIST, CURATED_SCOPE_ITEM_LIST } from '../lib/sap-curated-lists';
import { SAP_SCOPE_ITEMS } from '../lib/sap-scope-items';

/**
 * The owner's hand-curated scope-item and communication-scenario lists
 * (13.10.2026): ID and title only, a name found in a list — never "verified".
 */

const one = (text: string, id: string) => {
  const hit = findSapIdentifiers(text).find((c) => c.id === id);
  expect(hit, `${id} was not found in: ${text}`).toBeTruthy();
  return hit!;
};

test('a scope item only the curated list holds, named rightly, is a name found in the list — not verified', () => {
  const c = one('Returns run through scope item BKP (Accelerated Customer Returns).', 'BKP');
  expect(c.status).toBe('catalog');
  expect(c.curatedList).toBe(true);
  expect(sapIdStateWord(c)).toBe('name found in curated list');
  expect(sapIdMark(c)).toContain('not checked against a SAP page');
  expect(sapIdMark(c)).toContain(CURATED_SCOPE_ITEM_LIST.label);
});

test('a scope item the model gives for another area contradicts the list', () => {
  const c = one('Cost center accounting is covered by scope item BKP (Overhead Cost Accounting).', 'BKP');
  expect(c.status).toBe('mismatch');
  expect(sapIdStateWord(c)).toBe('name does not match the curated list');
  expect(sapIdMark(c)).toContain('“Accelerated Customer Returns”');
  expect(sapIdMark(c)).not.toContain("SAP's");
});

test('a scenario ID with a letter is read, and its list title stands beside it', () => {
  const c = one('Connect via SAP_COM_0A49.', 'SAP_COM_0A49');
  expect(c.kind).toBe('communication-scenario');
  expect(c.status).toBe('catalog');
  expect(c.sapName).toBe('AI-Assisted Situation Handling Integration');
});

test('a scenario the list marks deprecated carries that as a caveat, not in its title', () => {
  const c = one('Campaigns go out through SAP_COM_0227.', 'SAP_COM_0227');
  expect(c.sapName).toBe('Marketing - Campaign Execution - Twitter Integration');
  expect(sapIdMark(c)).toContain('the list marks it deprecated');
});

test('a SAP page wins over the list: J58 stays verified', () => {
  expect(CURATED_SCOPE_ITEM_LIST.entries.some((e) => e.id === 'J58')).toBe(true);
  const c = one('Scope item J58 (Accounting and Financial Close) closes the period.', 'J58');
  expect(c.status).toBe('verified');
  expect(c.curatedList).toBeUndefined();
});

test('the lists hold ID and title only, one row per ID, and agree with every page-held scope item', () => {
  for (const list of [CURATED_SCOPE_ITEM_LIST, CURATED_SCENARIO_LIST]) {
    const ids = list.entries.map((e) => e.id);
    expect(new Set(ids).size, list.label).toBe(ids.length);
    for (const e of list.entries) expect(Object.keys(e).filter((k) => !['id', 'title', 'deprecated'].includes(k))).toEqual([]);
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const s of SAP_SCOPE_ITEMS) {
    const listed = CURATED_SCOPE_ITEM_LIST.entries.find((e) => e.id === s.id);
    if (listed) expect(norm(listed.title), s.id).toBe(norm(s.title));
  }
});
