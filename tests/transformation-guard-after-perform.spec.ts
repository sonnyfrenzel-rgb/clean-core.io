import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { prepareEngineLed } from '../lib/transformation/engine-led';

// Owner decision 18.10.2026, from the new authorization engine case on the freight example: the frame ran the
// orchestrator's `gt_deliveries IS INITIAL` (L75) at entry, before the original's PERFORM check_authority (L73),
// so an unauthorised run with no deliveries answered ok instead of being refused. A check the original makes
// only after it has performed a routine is called where the original makes it, never at entry.
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_SD_FREIGHT_RATE_CHECK.abap'), 'utf8');

for (const track of ['node', 'rap'] as const) {
  test(`${track}: the freight check after two PERFORMs is no entry check`, () => {
    const p = prepareEngineLed({ source: SOURCE, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
    if (!p.ok) throw new Error(p.reason);
    const g = p.plan.guards.find((x) => x.line === 75);
    expect(g, 'the guard at L75').toBeTruthy();
    expect(g!.placement).toBe('body');
    const orchestrator = p.plan.units.find((u) => u.kind === 'orchestrator')!;
    expect(orchestrator.guardCalls).not.toContain(g!.id);
  });
}

test('a check before any PERFORM of its block stays an entry check', () => {
  const src = [
    'REPORT z_entry.',
    'DATA gt_rows TYPE STANDARD TABLE OF i.',
    'START-OF-SELECTION.',
    '  IF gt_rows IS INITIAL.',
    '    RETURN.',
    '  ENDIF.',
    '  PERFORM work.',
    'FORM work.',
    '  WRITE / 1.',
    'ENDFORM.',
  ].join('\n');
  const p = prepareEngineLed({ source: src, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const g = p.plan.guards.find((x) => x.line === 4);
  if (g) expect(g.placement).not.toBe('body');
});

// 18.10.2026: the model left the freight example's CHECK_AUTHORITY out of its answer twice — a routine whose every
// statement (the AUTHORITY-CHECK and its sy-subrc check) the frame already runs. The engine writes its body.
test('node: a routine the frame runs whole is the engine\'s, and the model is not asked for it', () => {
  const p = prepareEngineLed({ source: SOURCE, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const unit = p.plan.units.find((u) => u.abap.some((r) => r.lineStart <= 90 && r.lineEnd >= 90) && u.kind !== 'orchestrator')!;
  expect(unit, 'the unit of CHECK_AUTHORITY').toBeTruthy();
  expect(p.scaffold.regions.some((r) => r.regionId === unit.id)).toBe(false);
  expect(p.fillUnits.some((f) => f.unitId === unit.id)).toBe(false);
  const file = p.scaffold.files.find((f) => f.path === unit.file)!;
  expect(file.owner).toBe('engine');
  expect(file.content).toContain('authority_L90()');
  expect(file.content).not.toContain('NotImplementedFill(');
});

// QA review of 0a1d2036f5ed: a statement of the original's own inside the sy-subrc block keeps the body the model's.
test('node: a routine with its own statement inside the authorization block is not the engine\'s', () => {
  const src = SOURCE.replace(
    "    MESSAGE 'No authorization for this shipping point' TYPE 'E'.",
    "    gv_denied = 'X'.\n    MESSAGE 'No authorization for this shipping point' TYPE 'E'.",
  ).replace('START-OF-SELECTION.', "DATA gv_denied TYPE c LENGTH 1.\n\nSTART-OF-SELECTION.");
  expect(src).toContain("gv_denied = 'X'.");
  const p = prepareEngineLed({ source: src, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const unit = p.plan.units.find((u) => u.abap.some((r) => r.lineStart <= 91 && r.lineEnd >= 91) && u.kind !== 'orchestrator')!;
  expect(p.scaffold.regions.some((r) => r.regionId === unit.id)).toBe(true);
});

// QA review of 8609f22dee9c: a statement on the same line as the check's IF is no part of the check.
test('node: an assignment on the same line as the authorization IF keeps the body the model\'s', () => {
  const src = SOURCE.replace(/ {2}IF sy-subrc <> 0\.(\r?\n {4}MESSAGE 'No authorization for this shipping point' TYPE 'E'\.)/, "  IF sy-subrc <> 0. gv_denied = 'X'.$1").replace('START-OF-SELECTION.', "DATA gv_denied TYPE c LENGTH 1.\n\nSTART-OF-SELECTION.");
  expect(src).toContain("IF sy-subrc <> 0. gv_denied = 'X'.");
  const p = prepareEngineLed({ source: src, track: 'node', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  const unit = p.plan.units.find((u) => u.abap.some((r) => r.lineStart <= 91 && r.lineEnd >= 91) && u.kind !== 'orchestrator')!;
  expect(p.scaffold.regions.some((r) => r.regionId === unit.id)).toBe(true);
});
