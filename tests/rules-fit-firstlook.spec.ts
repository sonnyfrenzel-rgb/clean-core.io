import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { readSource, readTableAccess } from '../lib/first-look';
import { plainWordingFor } from '../lib/business-card';
import {
  draftChecks,
  draftChoices,
  draftFrom,
  draftProblems,
  draftSummary,
  editorRules,
  ruleEntries,
  rulesConfirmed,
  stepStrip,
  type RuleDraft,
} from '../lib/rules-editor';
import { buildUpEvents, buildUpFrame, codeWindow, BUILD_UP_BUDGET } from '../lib/first-look-buildup';
import { buildStandardFitView } from '../lib/standard-fit-view';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { deriveStandardCoverageFrom, type CatalogLookup } from '../lib/abap/standard-coverage';
import { deriveCounterCheckScenariosFrom } from '../lib/abap/counter-check';
import { deriveUserChangeFrom } from '../lib/abap/user-change';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { complianceReviewHints, examinedTablesFromDependencies } from '../lib/compliance-review-hints';
import { workspaceLayers } from '../lib/workspace-model';
import { applyStateChoices, checkStateChoices, sameAnswer, type ProcessStateView, type StateEntry } from '../lib/process-states';
import type { Project } from '../lib/types';

/**
 * Mockup screens s0, s2 and s3 — the three pieces that were missing from the
 * Business view (gap audit 01.10.2026, rows 9 and "not built").
 *
 * Pure: the shipped purchase-requisition example goes through the same lib
 * functions the screens call, and each claim below is a rule the screens rely
 * on for their honesty — no pre-selected answer, a check that never blocks, a
 * counter that only rises with a lit line, no scope item that nobody supplied.
 */

const ROOT = path.resolve(__dirname, '..');
const SRC = fs
  .readFileSync(path.join(ROOT, 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8')
  .replace(/\r\n/g, '\n');
const reading = readSource(SRC);
const rules = editorRules(reading.ruleSet, plainWordingFor(SRC, reading.skeleton));

function viewWith(entries: StateEntry[]): ProcessStateView {
  return {
    formatVersion: 1,
    revision: entries.length ? Math.max(...entries.map((e) => e.revision)) : 0,
    baselineRevision: 1,
    subjects: [
      ...rules.map((r) => ({ subject: r.id, kind: 'rule' as const, label: r.code, detail: '', anchor: null })),
      { subject: 'Task_1', kind: 'element' as const, label: 'Check approval limit', detail: 'Task', anchor: null },
    ],
    entries,
    links: rules.map((r, i) => ({ rule: r.id, elements: i === 1 ? ['Task_1'] : [] })),
  };
}

const entry = (subject: string, state: StateEntry['state'], note: string | null = null, revision = 1): StateEntry => ({
  subject,
  kind: 'rule',
  state,
  note,
  account: { uid: 'u1', name: 'Mara Weber' },
  confirmedAt: '2026-10-01T08:00:00.000Z',
  revision,
});

test.describe('s2 — the rule-editing mode', () => {
  test('every rule of the source is listed, named in words where the wording can, with its lines', () => {
    expect(rules.length).toBe(reading.ruleSet.rules.length);
    expect(rules.length).toBeGreaterThan(3);
    for (const rule of rules) {
      expect(rule.anchors.length, `${rule.id} has no line`).toBeGreaterThan(0);
      expect(rule.title.trim().length).toBeGreaterThan(0);
      // A title made of values only ("1000 1000") is not a name.
      if (!rule.titleIsCode) expect(rule.title).toMatch(/[A-Za-z]{2,}/);
    }
  });

  test('nothing is pre-selected: a rule nobody answered is untouched, not kept', () => {
    const draft = draftFrom(rules, ruleEntries(viewWith([])));
    expect(Object.values(draft).every((d) => d.state === null)).toBe(true);
    expect(draftSummary(rules, draft).untouched.length).toBe(rules.length);
    expect(draftChoices(draft, {})).toEqual([]);
  });

  test('only Change and Drop without a reason block a save; Keep and Clarify never do', () => {
    const [a, b, c, d] = rules.map((r) => r.id);
    const draft: RuleDraft = {
      ...draftFrom(rules, {}),
      [a]: { state: 'keep', note: '' },
      [b]: { state: 'change', note: '', sourceKind: 'customizing' },
      [c]: { state: 'drop', note: '   ' },
      [d]: { state: 'clarify', note: '' },
    };
    expect(draftProblems(draft).map((p) => p.ruleId)).toEqual([b, c].sort());
    expect(draftSummary(rules, draft).missing.sort()).toEqual([b, c].sort());
  });

  test('a Change with a reason but no value source is summarised as a missing source, not a missing reason', () => {
    const [a] = rules.map((r) => r.id);
    const draft: RuleDraft = { ...draftFrom(rules, {}), [a]: { state: 'change', note: 'New tolerance from Q3' } };
    expect(draftProblems(draft)).toEqual([{ ruleId: a, kind: 'source-missing' }]);
    const summary = draftSummary(rules, draft);
    expect(summary.missing).toEqual([]);
    expect(summary.sourceMissing).toEqual([a]);
  });

  test('a save sends only what differs from the record, and a repeated answer sends nothing', () => {
    const [a, b] = rules.map((r) => r.id);
    const held = ruleEntries(viewWith([entry(a, 'keep')]));
    const draft = { ...draftFrom(rules, held), [b]: { state: 'drop' as const, note: 'Plant closed' } };
    expect(draftChoices(draft, held)).toEqual([{ subject: b, kind: 'rule', state: 'drop', note: 'Plant closed', valueSource: null, appliesTo: [] }]);
  });

  test('the checks are hints that name a real element, and Keep raises none', () => {
    const [a, b, c] = rules.map((r) => r.id);
    const view = viewWith([]);
    const name = (id: string) => view.subjects.find((s) => s.subject === id)?.label ?? null;
    const draft: RuleDraft = {
      ...draftFrom(rules, {}),
      [a]: { state: 'keep', note: '' },
      [b]: { state: 'change', note: 'Tolerance per material group', sourceKind: 'customizing' },
      [c]: { state: 'clarify', note: '' },
    };
    const checks = draftChecks(rules, draft, view.links, name);
    expect(checks.find((x) => x.ruleId === a)).toBeUndefined();
    const changed = checks.find((x) => x.ruleId === b)!;
    expect(changed.state).toBe('warning');
    expect(changed.text).toContain('“Check approval limit”');
    expect(checks.find((x) => x.ruleId === c)?.state).toBe('information');
  });

  test('"Rules confirmed" counts Keep, Change and Drop — a Clarify is an open question', () => {
    const [a, b, c] = rules.map((r) => r.id);
    const view = viewWith([entry(a, 'keep'), entry(b, 'change', 'x'), entry(c, 'clarify', 'q')]);
    expect(rulesConfirmed(view)).toEqual({ confirmed: 2, total: rules.length });
    expect(rulesConfirmed(null)).toBeNull();
  });
});

test.describe('s3 — the standard-fit table', () => {
  const ruleSet = deriveBusinessRules(SRC);
  const catalog: CatalogLookup = { successorFor: (o) => (o === 'EBAN' ? 'I_PURCHASEREQUISITIONITEM' : null) };
  const view = buildStandardFitView({
    coverage: deriveStandardCoverageFrom(SRC, ruleSet, { catalog }),
    scenarios: deriveCounterCheckScenariosFrom(ruleSet),
    users: deriveUserChangeFrom(SRC, ruleSet, { catalog }),
    compliance: complianceReviewHints(examinedTablesFromDependencies(readTableDependencies(SRC).dependencies)),
    name: () => null,
  });

  test('one row per capability, and every rule is in a row or named as unassigned', () => {
    expect(view.rows.length).toBeGreaterThan(0);
    const placed = new Set([...view.rows.flatMap((r) => r.ruleIds), ...view.unassigned.map((u) => u.ruleId)]);
    for (const rule of ruleSet.rules) expect(placed.has(rule.id), `${rule.id} is in no row`).toBe(true);
  });

  test('no scope item is invented and nothing reaches above E1 without supplied evidence', () => {
    for (const row of view.rows) {
      expect(row.scopeItems).toEqual([]);
      expect(['E0', 'E1']).toContain(row.level);
      // E0 and E1 carry no fit — only "not determined", with its reason.
      expect(row.fit).toBeNull();
      expect(row.fitProvenance).toBe('not-determined');
      expect(row.notDetermined).not.toBeNull();
    }
  });

  test('a catalogue hit is a pointer (E1), never a fit', () => {
    const hit = view.rows.find((r) => r.candidates.length > 0);
    if (hit) {
      expect(hit.level).toBe('E1');
      expect(hit.notDetermined).toBe('pointer-only');
    }
  });
});

test.describe('s0 — the first look builds up out of lit lines', () => {
  const events = buildUpEvents(readTableAccess(SRC), reading.skeleton);
  const lines = SRC.split('\n');

  test('every event is a real line of the source, in source order', () => {
    expect(events.length).toBeGreaterThan(10);
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i];
      expect(e.line).toBeGreaterThanOrEqual(1);
      expect(e.line).toBeLessThanOrEqual(lines.length);
      if (i > 0) expect(e.line).toBeGreaterThanOrEqual(events[i - 1].line);
    }
  });

  test('a counter only rises with a lit line, and never falls', () => {
    let last = { line: 0, tables: 0, nodes: 0, decisions: 0 };
    for (let t = 0; t <= BUILD_UP_BUDGET.endAt; t += 50) {
      const frame = buildUpFrame(events, t);
      const lit = events.slice(0, frame.shown);
      expect(frame.counters.nodes).toBe(lit.filter((e) => e.kind === 'node').length);
      expect(frame.counters.line).toBeGreaterThanOrEqual(last.line);
      expect(frame.counters.tables).toBeGreaterThanOrEqual(last.tables);
      expect(frame.counters.nodes).toBeGreaterThanOrEqual(last.nodes);
      last = frame.counters;
    }
    expect(buildUpFrame(events, BUILD_UP_BUDGET.namesFrom).shown).toBe(events.length);
  });

  test('the stages follow the budget of s0: code read, process recognised, names', () => {
    expect(buildUpFrame(events, 100).stage).toBe('code-read');
    expect(buildUpFrame(events, 1000).stage).toBe('process-recognised');
    expect(buildUpFrame(events, 2000).stage).toBe('business-language');
    expect(buildUpFrame(events, 2000).named).toBe(true);
    expect(BUILD_UP_BUDGET.endAt).toBeLessThanOrEqual(3000);
  });

  test('the code window stays inside the source', () => {
    expect(codeWindow(669, 1)).toEqual({ from: 1, to: 12 });
    expect(codeWindow(669, 669)).toEqual({ from: 658, to: 669 });
    expect(codeWindow(5, 3)).toEqual({ from: 1, to: 5 });
  });

  test('the step strip of the end state is plain words with lines, and says when there is more', () => {
    const strip = stepStrip(reading.skeleton, SRC);
    expect(strip.steps.length).toBeGreaterThan(0);
    expect(strip.steps.length).toBeLessThanOrEqual(5);
    for (const step of strip.steps) expect(step.label.trim().length).toBeGreaterThan(0);
  });
});

test.describe('the anchor bar counts what the editor and the table show', () => {
  test('rules on Need & process and capabilities on Standard fit, from the reading', () => {
    const project = { legacyCode: SRC } as unknown as Project;
    const without = workspaceLayers(project);
    expect(without.find((l) => l.key === 'standard')!.count).toBeNull();
    const layers = workspaceLayers(project, reading);
    const need = layers.find((l) => l.key === 'need')!;
    const standard = layers.find((l) => l.key === 'standard')!;
    expect(need.count).toBe(`${reading.ruleSet.rules.length} rules`);
    expect(standard.count).toMatch(/^\d+ capabilit(y|ies)$/);
    // The invariant of the bar: a count exactly when there are rows.
    for (const layer of layers) expect(layer.count === null).toBe(layer.rows.length === 0);
  });
});

test.describe('s2 — where the value comes from (owner decision 01.10.2026)', () => {
  const ids = { elements: [], rules: rules.map((r) => r.id) };

  test('a change needs a value source; a drop may not carry one; Keep may', () => {
    const [a, b] = rules.map((r) => r.id);
    const missing = checkStateChoices([{ subject: a, kind: 'rule', state: 'change', note: 'x' }], ids);
    expect(missing.ok ? null : missing.code).toBe('source-required');
    const onDrop = checkStateChoices(
      [{ subject: a, kind: 'rule', state: 'drop', note: 'x', valueSource: { kind: 'unknown', note: null } }],
      ids,
    );
    expect(onDrop.ok ? null : onDrop.code).toBe('source-invalid');
    const keep = checkStateChoices(
      [{ subject: b, kind: 'rule', state: 'keep', valueSource: { kind: 'legal-regulatory', note: '  §14 UStG  ' } }],
      ids,
    );
    expect(keep.ok).toBe(true);
    if (keep.ok) expect(keep.choices[0].valueSource).toEqual({ kind: 'legal-regulatory', note: '§14 UStG' });
  });

  test('"Also applies to" names only other rules of the process', () => {
    const [a, b] = rules.map((r) => r.id);
    const self = checkStateChoices([{ subject: a, kind: 'rule', state: 'keep', appliesTo: [a] }], ids);
    expect(self.ok).toBe(false);
    const stranger = checkStateChoices([{ subject: a, kind: 'rule', state: 'keep', appliesTo: ['Task_9'] }], ids);
    expect(stranger.ok).toBe(false);
    const fine = checkStateChoices([{ subject: a, kind: 'rule', state: 'keep', appliesTo: [b, b] }], ids);
    expect(fine.ok && fine.choices[0].appliesTo).toEqual([b]);
  });

  test('the source is stored with the answer, and a changed source alone is a new answer', () => {
    const [a] = rules.map((r) => r.id);
    const checked = checkStateChoices(
      [{ subject: a, kind: 'rule', state: 'keep', valueSource: { kind: 'customizing', note: 'T16FS' } }],
      ids,
    );
    if (!checked.ok) throw new Error(checked.error);
    const [stored] = applyStateChoices([], checked.choices, {
      account: { uid: 'u', name: 'Mara Weber' },
      confirmedAt: '2026-10-01T00:00:00.000Z',
      revision: 1,
    });
    expect(stored.valueSource).toEqual({ kind: 'customizing', note: 'T16FS' });
    expect(sameAnswer(stored, checked.choices[0])).toBe(true);
    expect(sameAnswer(stored, { ...checked.choices[0], valueSource: { kind: 'unknown', note: null } })).toBe(false);
  });

  test('the draft blocks a change without a source and sends the source it holds', () => {
    const [a] = rules.map((r) => r.id);
    const draft: RuleDraft = { ...draftFrom(rules, {}), [a]: { state: 'change', note: 'New text' } };
    expect(draftProblems(draft)).toEqual([{ ruleId: a, kind: 'source-missing' }]);
    const fixed: RuleDraft = { ...draft, [a]: { ...draft[a], sourceKind: 'business-requirement', sourceNote: 'Policy 7' } };
    expect(draftProblems(fixed)).toEqual([]);
    expect(draftChoices(fixed, {})[0].valueSource).toEqual({ kind: 'business-requirement', note: 'Policy 7' });
  });

  test('siblings are the other rules of the same subject, never the rule itself', () => {
    for (const rule of rules) {
      expect(rule.siblings).not.toContain(rule.id);
      for (const id of rule.siblings) expect(rules.find((r) => r.id === id)?.siblings).toContain(rule.id);
    }
  });
});
