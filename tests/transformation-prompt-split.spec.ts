import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LEASED_PROMPT_MAX_CHARS, bundleFills, fillPrompt } from '../lib/transformation/fill-prompt';
import { prepareEngineLed, preflightFactsOf, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { preflight } from '../lib/transformation/preflight';
import { sliceFor } from '../lib/transformation/abap-slice';
import { estimateFillPrompt, planUnits, readEngineFacts } from '../lib/transformation/unit-plan';
import { HARD_SLICE_CHARS, HARD_SLICE_LINES, type FillRequestUnit } from '../lib/transformation/types';
import { promptSplitSource } from './helpers/prompt-split-source';

/**
 * Owner decision 17.10.2026 (roadmap 3.0.17): a fill prompt must fit the cap. A routine used to be split into parts
 * only by the lines and characters of its ABAP; the checks and rules that travel with a unit were not counted, so a
 * routine of about 290 lines with 67 checks and 51 rules stayed one unit and its prompt reached 68,000 characters
 * against the leased cap of 28,000. The plan now estimates each unit's prompt (`estimateFillPrompt`) and splits at
 * the same top-level statements until every part fits with its whole ABAP and the whole platform context; a single
 * statement that cannot fit is said in the plan with its reason, never sent over the cap.
 *
 * Server-free. The ABAP is synthetic (`tests/helpers/prompt-split-source.ts`), written for this spec.
 */

/** A platform context of the full 3,000 characters the prompt carries, with line breaks and quotes to escape. */
const PLATFORM = Array.from({ length: 80 }, (_, i) => `- platform fact ${i}: "${'k'.repeat(46)}"`).join('\n').slice(0, 3_000);
const TRACKS = ['node', 'rap'] as const;

function prepared(source: string, track: 'node' | 'rap'): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track, program: null, decisions: [], contextText: PLATFORM });
  if (!prep.ok) throw new Error(`${track}: ${prep.reason}`);
  return prep;
}

/** The prompt of one fill unit alone, as `fillPrompt` serialises it, with the whole platform context. */
const promptOf = (u: FillRequestUnit, track: 'node' | 'rap', briefRules = false) =>
  fillPrompt({ schema: 'cc.fill.v1', track, program: null, context: PLATFORM, rules: 'See CODE-DRAFT RULES in the header.', units: [u], repair: null }, { briefRules }).length;

test.describe('a routine with many checks goes in parts that each fit one fill call (3.0.17)', () => {
  const source = promptSplitSource(70);
  const facts = readEngineFacts(source);
  const plan = planUnits(source, {}, facts);
  const parent = plan.units.find((u) => u.routine === 'VALIDATE_CLAIM' && !u.part)!;
  const parts = plan.units.filter((u) => u.part?.parent === parent.id);
  const form = parent.abap[0];

  test('the routine is within the hard budget, so its ABAP alone never split it — and as one unit its prompt was far over the cap', () => {
    const ownLines = form.lineEnd - form.lineStart + 1;
    const ownChars = facts.lines.slice(form.lineStart - 1, form.lineEnd).join('\n').length;
    expect(ownLines).toBeGreaterThanOrEqual(280);
    expect(ownLines).toBeLessThanOrEqual(HARD_SLICE_LINES);
    expect(ownChars).toBeLessThanOrEqual(HARD_SLICE_CHARS);
    expect(plan.guards.filter((g) => g.line > form.lineStart && g.line < form.lineEnd)).toHaveLength(70);
    expect(parent.rules).toHaveLength(70);
    for (const track of TRACKS) {
      const prep = prepared(source, track);
      const units = prep.fillUnits.filter((u) => parts.some((p) => p.id === u.unitId));
      // The routine as the one unit the plan made before 17.10.2026: its whole slice with every check and rule its
      // parts carry now (the class text of its largest part only — a lower bound of what it carried).
      const slice = sliceFor(parent, plan, facts);
      const whole: FillRequestUnit = {
        ...units[0],
        unitId: parent.id,
        abap: { ranges: slice.ranges, text: slice.text, declarations: slice.declarations, callSites: slice.callSites },
        rules: units.flatMap((u) => u.rules),
        guards: units.flatMap((u) => u.guards),
        types: units.map((u) => u.types ?? '').sort((a, b) => b.length - a.length)[0],
      };
      const [b] = bundleFills([whole], { track, program: null, context: PLATFORM });
      expect(b.prompt.length, track).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS * 1.5);
      // The estimate of the whole routine says the same before any part exists.
      expect(estimateFillPrompt({ ...parent, guards: parts.flatMap((p) => p.guards) }, plan, facts).chars).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS * 1.5);
    }
  });

  test('the parts: ids, parent, order, and lines that cover the routine body without a gap', () => {
    expect(plan.stats.split).toEqual(['VALIDATE_CLAIM']);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.map((p) => p.id)).toEqual(parts.map((_, i) => `${parent.id}P${i + 1}`));
    expect(parts.map((p) => p.fn)).toEqual(parts.map((_, i) => `${parent.fn}Part${i + 1}`));
    for (const [i, p] of parts.entries()) expect(p.part).toEqual({ index: i + 1, of: parts.length, parent: parent.id });
    expect(parts[0].abap[0].lineStart).toBe(form.lineStart + 1);
    expect(parts[parts.length - 1].abap[0].lineEnd).toBe(form.lineEnd - 1);
    for (let i = 1; i < parts.length; i++) expect(parts[i].abap[0].lineStart).toBe(parts[i - 1].abap[0].lineEnd + 1);
    // A part begins at a top-level statement: the cut never falls inside an IF … ENDIF.
    for (const p of parts) expect(facts.lines[p.abap[0].lineStart - 1]).toMatch(/^\s{2}IF\b/);
    expect(plan.stats.promptOverCap).toEqual([]);
  });

  test('each check and each rule goes with the part whose lines hold it', () => {
    const routineGuards = plan.guards.filter((g) => g.line > form.lineStart && g.line < form.lineEnd);
    for (const g of routineGuards) {
      const holder = parts.filter((p) => p.abap[0].lineStart <= g.line && g.line <= p.abap[0].lineEnd);
      expect(holder.map((p) => p.id), g.id).toHaveLength(1);
      expect(holder[0].guards, g.id).toContain(g.id);
      expect(g.unitId).toBe(holder[0].id);
      expect(g.regionId).toBe(`${holder[0].id}.${g.id.replace('-', '')}`);
    }
    expect(parts.flatMap((p) => p.guards).sort()).toEqual(routineGuards.map((g) => g.id).sort());
    for (const id of parent.rules) {
      const r = plan.rules.find((x) => x.id === id)!;
      const holder = parts.find((p) => p.abap[0].lineStart <= r.ranges[0].lineStart && r.ranges[0].lineStart <= p.abap[0].lineEnd)!;
      expect(holder.rules, id).toContain(id);
    }
  });

  for (const track of TRACKS) {
    test(`${track}: every part's prompt is within the cap with the whole platform context, and carries its whole ABAP`, () => {
      const prep = prepared(source, track);
      const partUnits = prep.fillUnits.filter((u) => parts.some((p) => p.id === u.unitId));
      expect(partUnits.map((u) => u.unitId)).toEqual(parts.map((p) => p.id));
      // The parent has no region: the engine writes it.
      expect(prep.fillUnits.some((u) => u.unitId === parent.id)).toBe(false);
      const seen = new Set<number>();
      for (const b of bundleFills(prep.fillUnits, { track, program: prep.plan.program, context: PLATFORM, unitsPerCall: prep.plan.stats.unitsPerCall })) {
        expect(b.prompt.length, b.unitIds.join(',')).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
        expect(b.trimmed.filter((t) => t.what === 'context'), b.unitIds.join(',')).toEqual([]);
        for (const u of b.request.units) {
          const part = prep.plan.units.find((x) => x.id === u.unitId)!;
          expect(u.abap.text, u.unitId).toBe(sliceFor(part, prep.plan, readEngineFacts(source)).text);
          if (part.part) for (const m of u.abap.text.matchAll(/^(\d{4}) /gm)) seen.add(Number(m[1]));
        }
      }
      // Every line of the routine body travels, in exactly one part.
      for (let line = form.lineStart + 1; line < form.lineEnd; line++) expect(seen.has(line), `L${line}`).toBe(true);
      // The plan's estimate stays above the real prompt of every unit (rules by title, the whole context).
      for (const u of prep.fillUnits) {
        const unit = prep.plan.units.find((x) => x.id === u.unitId)!;
        expect(estimateFillPrompt(unit, prep.plan, readEngineFacts(source)).chars, u.unitId).toBeGreaterThanOrEqual(promptOf(u, track, true));
      }
    });
  }

  test('the parent is engine-written and calls its parts in order with one shared local state (Node)', () => {
    const prep = prepared(source, 'node');
    const file = prep.scaffold.files.find((f) => f.path === parent.file)!;
    expect(file.owner).toBe('engine');
    const calls = [...file.content.matchAll(new RegExp(`= (${parent.fn}Part\\d+)\\(sel, st, local\\);`, 'g'))].map((m) => m[1]);
    expect(calls).toEqual(parts.map((p) => p.fn));
  });
});

test('a small routine is unchanged: one unit, no parts, nothing over the cap', () => {
  const source = promptSplitSource(5);
  const facts = readEngineFacts(source);
  const plan = planUnits(source, {}, facts);
  expect(plan.units.map((u) => u.id)).toEqual(['U00', 'U01', 'U02']);
  expect(plan.units.some((u) => u.part)).toBe(false);
  expect(plan.stats.split).toEqual([]);
  expect(plan.stats.promptOverCap).toEqual([]);
  for (const u of plan.units) expect(estimateFillPrompt(u, plan, facts).chars).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
});

test.describe('one statement too large for a call: said in the plan with its reason, never cut, never sent over the cap', () => {
  // The same 70 checks inside one LOOP: one top-level statement, which the engine does not cut.
  const source = promptSplitSource(70, { loop: true });
  const facts = readEngineFacts(source);
  const plan = planUnits(source, {}, facts);
  const unit = plan.units.find((u) => u.routine === 'VALIDATE_CLAIM')!;

  test('the plan names the function, the statement and the numbers', () => {
    expect(plan.stats.split).toEqual([]);
    expect(unit.part).toBeNull();
    expect(plan.stats.promptOverCap.map((o) => o.unitId)).toEqual([unit.id]);
    const over = plan.stats.promptOverCap[0];
    expect(over.chars).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    expect(unit.promptOverCap).toEqual({ chars: over.chars, reason: over.reason });
    const loopEnd = facts.lines.findIndex((l) => /^\s*ENDLOOP\./.test(l)) + 1;
    expect(over.reason).toContain(`VALIDATE_CLAIM is one statement — LOOP with its block, L${unit.abap[0].lineStart + 1}–L${loopEnd} —`);
    expect(over.reason).toContain('carries 70 checks and 70 rules');
    expect(over.reason).toContain(`above the ${LEASED_PROMPT_MAX_CHARS.toLocaleString('en-US')} one fill call may carry`);
    expect(over.reason).toContain('never cuts a statement or its ABAP');
    // Every other function fits and says nothing.
    for (const u of plan.units.filter((x) => x.id !== unit.id)) expect(u.promptOverCap, u.id).toBeUndefined();
  });

  for (const track of TRACKS) {
    test(`${track}: the call keeps the whole ABAP, is over the cap, and the pre-flight names the plan's reason`, () => {
      const prep = prepared(source, track);
      const fill = prep.fillUnits.find((u) => u.unitId === unit.id)!;
      const [b] = bundleFills([fill], { track, program: prep.plan.program, context: PLATFORM });
      expect(b.request.units[0].abap.text).toBe(sliceFor(unit, plan, facts).text);
      expect(b.prompt.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
      const factsOf = preflightFactsOf(prep, PLATFORM);
      const oversize = factsOf.oversize.find((o) => o.unitIds.includes(unit.id))!;
      expect(oversize.reason).toBe(unit.promptOverCap!.reason);
      const pf = preflight({ ...factsOf, window: null });
      const issue = pf.notWritten.find((n) => n.unitId === unit.id)!.issue;
      expect(issue.code).toBe('lease-prompt-too-large');
      expect(issue.detail).toContain(unit.promptOverCap!.reason);
    });
  }
});

test('the shipped starter examples keep their units, split nothing, and every call fits the cap on both tracks', () => {
  const dir = path.join(__dirname, '..', 'public', 'starter-examples');
  // Measured 17.10.2026 before and after the prompt split: no starter routine is above the hard budget or the cap.
  const UNITS: Record<string, number> = {
    'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap': 20,
    'Z_BUSINESS_PARTNER_SYNC.txt': 4,
    'Z_EMPLOYEE_EXPENSE_VAL.txt': 3,
    'Z_INVOICE_EXTRACTOR.txt': 3,
    'Z_MATERIAL_STOCK_CALC.txt': 3,
    'Z_MM_PO_APPROVAL.abap': 20,
    // 8 since scaffold 17: six methods of three local classes (three were lost by name) and the FORM the process begins at.
    'Z_ORDER_INTEGRITY_CHECK.txt': 8,
    'Z_SALES_ORDER_CREATOR.txt': 3,
    'Z_SD_FREIGHT_RATE_CHECK.abap': 12,
  };
  expect(fs.readdirSync(dir).sort()).toEqual(Object.keys(UNITS).sort());
  for (const [file, count] of Object.entries(UNITS)) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const plan = planUnits(source);
    expect(plan.units.length, file).toBe(count);
    expect(plan.stats.split, file).toEqual([]);
    expect(plan.stats.promptOverCap, file).toEqual([]);
    for (const track of TRACKS) {
      const prep = prepared(source, track);
      for (const b of bundleFills(prep.fillUnits, { track, program: prep.plan.program, context: PLATFORM, unitsPerCall: prep.plan.stats.unitsPerCall })) {
        expect(b.prompt.length, `${file}/${track} ${b.unitIds.join(',')}`).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
      }
    }
  }
});
