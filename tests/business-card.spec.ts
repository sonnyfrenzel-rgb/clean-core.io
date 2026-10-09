import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildBusinessCard,
  openGroupsOf,
  headlineLead,
  joinList,
  NO_WORDING,
  plainWordingFor,
  summaryOf,
  type PlainWording,
} from '../lib/business-card';
import { readSource, readTableAccess, traceabilityOf } from '../lib/first-look';
import { applyNaming } from '../lib/process-naming';
import { notDetermined } from '../lib/workspace-model';
import type { Project } from '../lib/types';

/**
 * The Business card in plain language — "simple on top, complete underneath".
 *
 * Pure checks of `lib/business-card.ts` against the demo program: the card
 * re-cuts the first look's reading and adds nothing to it, every figure has an
 * origin, and where the wording has no plain words the code stands instead —
 * never a guessed sentence.
 */

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'),
  'utf8',
);

function card(wording: PlainWording = NO_WORDING) {
  const reading = readSource(SOURCE);
  const named = applyNaming(reading.context, null);
  return {
    reading,
    card: buildBusinessCard({
      skeleton: reading.skeleton,
      ruleSet: reading.ruleSet,
      dependencies: readTableAccess(SOURCE),
      traceability: traceabilityOf(named),
      open: notDetermined({ legacyCode: SOURCE } as Project),
      wording,
    }),
  };
}

test.describe('the Business card (lib/business-card.ts)', () => {
  test('the figures are the reading’s own — rules, decisions, open points, traceability', () => {
    const { reading, card: c } = card();
    const fact = (key: string) => c.facts.find((f) => f.key === key)!;
    expect(fact('rules').value).toBe(String(reading.ruleSet.rules.length));
    expect(fact('decisions').value).toBe(
      String(reading.skeleton.nodes.filter((n) => n.kind === 'gateway').length),
    );
    expect(fact('not-determined').value).toBe(String(c.open.count));
    for (const f of c.facts) expect(['engine', 'run', 'absent']).toContain(f.origin);
    expect(c.rules).toHaveLength(reading.ruleSet.rules.length);
    expect(c.decisions.length).toBeGreaterThan(0);
  });

  test('traceability is floored, never rounded up to 100 %', () => {
    const reading = readSource(SOURCE);
    const c = buildBusinessCard({
      skeleton: reading.skeleton,
      ruleSet: reading.ruleSet,
      dependencies: [],
      traceability: { anchored: 199, nodes: 200, sentence: '' },
      open: { items: [], count: 0, noSource: false },
    });
    expect(c.facts.find((f) => f.key === 'traceability')!.value).toBe('99 %');
  });

  test('without plain wording every plain field is null and the code is kept', () => {
    const { card: c } = card();
    for (const r of c.rules) {
      expect(r.sentence).toBeNull();
      expect(r.phrase).toBeNull();
      expect(r.code.length).toBeGreaterThan(0);
    }
    for (const d of c.decisions) {
      expect(d.question).toBeNull();
      expect(d.outcomes).toEqual([]);
      expect(d.code.length).toBeGreaterThan(0);
    }
  });

  test('the headline names at most three rules, controls first, and each carries an anchor', () => {
    const { card: c, reading } = card();
    expect(c.featured.length).toBe(Math.min(3, reading.ruleSet.rules.length));
    for (const r of c.featured) expect(r.anchors.length).toBeGreaterThan(0);
    const controls = c.rules.filter((r) => r.control).length;
    if (controls > 0) expect(c.featured[0].control).toBe(true);
  });

  test('a rule with plain words is preferred for the headline, and the wording is used verbatim', () => {
    const wording: PlainWording = {
      ...NO_WORDING,
      rulePhrase: (rule) => (rule.label.includes("'1000'") ? 'plant or org 1000' : null),
      ruleSentence: (rule) => (rule.label.includes("'1000'") ? 'Only 1000 is handled.' : null),
    };
    const { card: c } = card(wording);
    expect(c.featured[0].phrase).toBe('plant or org 1000');
    expect(c.rules.filter((r) => r.sentence === 'Only 1000 is handled.').length).toBeGreaterThan(0);
  });

  test('the summary says what the program touches, and names tables it has no word for as they are', () => {
    const { card: c } = card();
    expect(c.summary.kind).toBe('touches');
    // Without wording, the first two tables are named as the code names them.
    expect(c.summary.sentence).toMatch(/^Reads EBAN and LFA1, plus \d+ more tables\./);
    expect(c.summary.technical).toMatch(/^reads EBAN, LFA1, /);
    const worded = summaryOf(
      [
        { table: 'EBAN', access: 'read' },
        { table: 'ZMM_X', access: 'write' },
      ],
      { ...NO_WORDING, table: (t) => (t === 'EBAN' ? 'purchase requisitions' : null) },
    );
    expect(worded.sentence).toBe('Reads purchase requisitions. Changes ZMM_X.');
    expect(worded.technical).toBe('reads EBAN · changes ZMM_X');
    expect(summaryOf([], NO_WORDING).kind).toBe('none');
  });

  test('open points are grouped by kind, first occurrence first', () => {
    const groups = openGroupsOf([
      { label: 'A', why: '', anchor: 'L1' },
      { label: 'B', why: '', anchor: 'L2' },
      { label: 'A', why: '', anchor: 'L3' },
      { label: 'A', why: '', anchor: 'L4' },
    ]);
    expect(groups).toEqual([
      { label: 'A', count: 3, anchors: ['L1', 'L3'] },
      { label: 'B', count: 1, anchors: ['L2'] },
    ]);
  });

  test('nothing staged is absent, not zero', () => {
    const reading = readSource(SOURCE);
    const c = buildBusinessCard({
      skeleton: reading.skeleton,
      ruleSet: reading.ruleSet,
      dependencies: [],
      traceability: { anchored: 0, nodes: 0, sentence: '' },
      open: { items: [], count: 0, noSource: true },
    });
    expect(c.facts.find((f) => f.key === 'not-determined')).toMatchObject({ value: null, origin: 'absent' });
    expect(c.facts.find((f) => f.key === 'traceability')).toMatchObject({ value: null, origin: 'absent' });
  });

  test('with the plain-language module, the demo reads like a process, not like code', () => {
    const reading = readSource(SOURCE);
    const { card: c } = card(plainWordingFor(SOURCE, reading.skeleton));
    expect(c.summary.sentence).toContain('purchase requisitions');
    expect(c.summary.sentence).not.toMatch(/\bEBAN\b/);
    expect(c.rules.find((r) => r.code === "c_doc_type VALUE 'NB'")?.sentence).toBe('Only document type NB is processed');
    // Every featured rule has plain words, and none of them is ABAP.
    for (const r of c.featured) {
      expect(r.phrase).not.toBeNull();
      expect(r.phrase).not.toMatch(/\b(?:gs|lv|gv)_|<>|IF /);
    }
    const decision = c.decisions.find((d) => d.code === 'IF gv_approved = abap_true');
    expect(decision?.question).toBe('Approved?');
    expect(decision?.outcomes.length).toBeGreaterThan(0);
    // A question whose every answer reaches only the routine's end shows no outcomes.
    for (const d of c.decisions) for (const o of d.outcomes) expect(o).toContain(' → ');
  });

  test('small helpers', () => {
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
    expect(headlineLead(1)).toBe('1 business rule hard-coded in the program');
    expect(headlineLead(0)).toMatch(/^No hard-coded business rule/);
  });
});
