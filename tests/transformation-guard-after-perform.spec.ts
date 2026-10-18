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
