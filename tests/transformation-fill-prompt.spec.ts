import { test, expect } from '@playwright/test';
import {
  FILL_CONTEXT_MAX_CHARS,
  FILL_PROMPT_MAX_CHARS,
  LEASED_PROMPT_MAX_CHARS,
  FILL_RULE_NUMBERS,
  FILL_UNITS_PER_CALL,
  bundleFills,
  cutContext,
  fillPrompt,
  fillRulesText,
  parseFillAnswer,
} from '../lib/transformation/fill-prompt';
import type { FillRepair, FillRequestUnit } from '../lib/transformation/types';
import { TRANSFORMATION_FILL_SCHEMA, TRANSFORMATION_RESPONSE_SCHEMA, responseSchemaForStage } from '../lib/model-response-schema';
import { GEMINI_TEST_STUB_FILL_BODY, geminiTestStubAnswer, geminiTestStubFillText, GEMINI_TEST_STUB_TEXT } from '../lib/gemini-test-stub';

/**
 * The fill prompt of the engine-led transformation (design §8.2, Track C).
 * Server-free: synthetic units in the shape Track B's slices produce, from a
 * few lines to past the hard slice budget (12,000 characters).
 */

const abapText = (start: number, lines: number, width = 60) =>
  Array.from({ length: lines }, (_, i) => `${String(start + i).padStart(4, '0')}   ${'x'.repeat(Math.max(0, width - 7))}`).join('\n');

function unit(n: number, lines: number, over: Partial<FillRequestUnit> = {}): FillRequestUnit {
  const id = `U${String(n).padStart(2, '0')}`;
  return {
    unitId: id,
    function: {
      name: `step${n}`,
      file: `srv/steps/${String(n).padStart(2, '0')}-step.ts`,
      signature: `export function step${n}(sel: Selection, st: RunState): StepResult`,
      returns: 'StepResult — { ok: true } | Refusal',
    },
    abap: { ranges: [{ lineStart: 100 * n, lineEnd: 100 * n + lines - 1, routine: `STEP_${n}` }], text: abapText(100 * n, lines) },
    rules: [
      { id: `BR-${String(n).padStart(3, '0')}`, decision: 'keep', text: 'The quota of a receiver must not exceed 100 %.' },
      { id: `BR-${String(n + 50).padStart(3, '0')}`, decision: 'change', text: 'A missing segment stops the run.', proposal: 'Skip the item and report it.' },
    ],
    guards: [{ id: `G-${100 * n + 6}`, rule: `BR-${String(n).padStart(3, '0')}`, helper: `guard_BR_${n}_G${100 * n + 6}`, condition: 'gv_quota > 100', effect: 'error-message' }],
    facts: { decimals: [{ name: 'GV_QUOTA', digits: 7, decimals: 4, type: "Dec<'GV_QUOTA',7,4>" }] },
    available: { helpers: ['dec.add', 'dec.roundCommercial'], callees: [] },
    ...over,
  };
}

const CONTEXT = Array.from({ length: 80 }, (_, i) => `Context line ${i}: the route is side-by-side (CAP), decided by the owner.`).join('\n');
const OPTS = { track: 'node' as const, program: 'Z_CO_CASE', context: CONTEXT };

test.describe('the rules a body follows', () => {
  test('only the body rules, by number and word for word; the scaffold-owned rules are not asked for', () => {
    const text = fillRulesText();
    for (const n of FILL_RULE_NUMBERS) expect(text, `rule ${n}`).toMatch(new RegExp(`^${n}\\. `, 'm'));
    for (const n of [16, 18, 20, 22, 24]) expect(text, `rule ${n} is engine-written in the scaffold`).not.toMatch(new RegExp(`^${n}\\. `, 'm'));
    expect(text).toContain('15. GUARDS FIRST');
    expect(text).toContain('17. PRECISION AS DECLARED');
  });
});

test.describe('bundles: ≤ 4 units and ≤ 14,000 characters per call', () => {
  const sizes = [3, 12, 40, 75, 118, 151, 20, 9, 60, 33, 300, 18, 2, 45];
  const units = sizes.map((s, i) => unit(i + 1, s));

  test('every prompt fits, every unit is asked exactly once and in the given order', () => {
    const bundles = bundleFills(units, OPTS);
    for (const b of bundles) {
      // Several units share at most 14,000 characters; one unit alone may use up to 28,000 (13.10.2026).
      expect(b.prompt.length, b.unitIds.join(',')).toBeLessThanOrEqual(b.unitIds.length > 1 ? FILL_PROMPT_MAX_CHARS : LEASED_PROMPT_MAX_CHARS);
      expect(b.unitIds.length).toBeGreaterThanOrEqual(1);
      expect(b.unitIds.length).toBeLessThanOrEqual(FILL_UNITS_PER_CALL);
      expect(b.request.context.length).toBeLessThanOrEqual(FILL_CONTEXT_MAX_CHARS);
    }
    expect(bundles.flatMap((b) => b.unitIds)).toEqual(units.map((u) => u.unitId));
  });

  test('a unit between 14,000 and 28,000 characters goes alone and uncut (13.10.2026)', () => {
    // Cut to 14,000, a unit lost 108 of its ABAP lines and the model declined it every time.
    const big = unit(1, 220, { abap: { ranges: [{ lineStart: 1, lineEnd: 220, routine: 'LOAD' }], text: abapText(1, 220, 70) } });
    const [b, ...rest] = bundleFills([big, unit(2, 3), unit(3, 3)], OPTS);
    expect(b.unitIds).toEqual(['U01']);
    expect(b.prompt.length).toBeGreaterThan(FILL_PROMPT_MAX_CHARS);
    expect(b.prompt.length).toBeLessThanOrEqual(LEASED_PROMPT_MAX_CHARS);
    expect(b.trimmed).toEqual([]);
    expect(b.request.units[0].abap.text).toBe(big.abap.text);
    expect(b.prompt).not.toContain('cut to fit the prompt budget');
    // The units after it still share a call of at most 14,000.
    expect(rest.map((r) => r.unitIds)).toEqual([['U02', 'U03']]);
    expect(rest[0].prompt.length).toBeLessThanOrEqual(FILL_PROMPT_MAX_CHARS);
  });

  test('a unit past the leased cap gives up context lines, each named — never its ABAP (3.0.13, B7)', () => {
    const huge = unit(1, 440, { abap: { ranges: [{ lineStart: 1, lineEnd: 440, routine: 'LOAD' }], text: abapText(1, 440, 70) } });
    expect(huge.abap.text.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    const [b] = bundleFills([huge], OPTS);
    // The whole slice travels: a body written from part of a routine reads as the whole routine.
    expect(b.request.units[0].abap.text).toBe(huge.abap.text);
    expect(b.prompt).not.toContain('cut to fit the prompt budget');
    // So the call is over the cap — the orchestrator does not send it and says why (orchestrator spec).
    expect(b.prompt.length).toBeGreaterThan(LEASED_PROMPT_MAX_CHARS);
    expect(b.trimmed.map((t) => t.what)).toEqual(['context']);
    expect(b.trimmed[0].dropped?.length).toBeGreaterThan(0);
  });

  test('the context pack is cut to 3,000 characters at a line end, saying how many lines went and naming them', () => {
    const cut = cutContext(CONTEXT, FILL_CONTEXT_MAX_CHARS);
    expect(cut.text.length).toBeLessThanOrEqual(FILL_CONTEXT_MAX_CHARS);
    expect(cut.text).toMatch(/\[\d+ context lines dropped to fit the prompt budget: "[^"]+"(?:; "[^"]+")*(?: and \d+ more)?\]$/);
    // The first dropped line is named by its first words.
    const firstDropped = CONTEXT.split('\n')[cut.text.split('\n').length - 1];
    expect(cut.dropped?.length).toBe(CONTEXT.split('\n').length - (cut.text.split('\n').length - 1));
    expect(firstDropped).toContain(cut.dropped![0].replace(/…$/, ''));
    expect(cut.text).toContain(`"${cut.dropped![0]}"`);
    expect(cutContext('short', 3000)).toEqual({ text: 'short', cut: 0 });
  });

  test('rules carry their decision; a change carries the owner\'s proposal; a repair carries failure and previous body, cut', () => {
    const repair = new Map<string, FillRepair>([
      ['U02', { unitId: 'U02', round: 1, failure: 'f'.repeat(5000), previousBody: 'return x;' }],
    ]);
    // Since scaffold version 7 the header names the helpers' signatures: the two units and the 2,000-character repair
    // (26 characters under the cap before) may now travel in two calls — each is read from the call that carries it.
    const bundles = bundleFills([unit(1, 10), unit(2, 10)], { ...OPTS, repair });
    expect(bundles.flatMap((x) => x.unitIds)).toEqual(['U01', 'U02']);
    const u1 = bundles.find((x) => x.unitIds.includes('U01'))!.request.units.find((x) => x.unitId === 'U01')!;
    const b = bundles.find((x) => x.unitIds.includes('U02'))!;
    expect(u1.rules.map((r) => r.decision)).toEqual(['keep', 'change']);
    expect(u1.rules[1].proposal).toBe('Skip the item and report it.');
    expect(b.request.repair).toHaveLength(1);
    expect(b.request.repair![0].unitId).toBe('U02');
    expect(b.request.repair![0].failure.length).toBeLessThanOrEqual(2000);
    expect(b.request.repair![0].previousBody).toBe('return x;');
    // The prompt is the fixed header and the request, serialised.
    expect(b.prompt).toBe(fillPrompt(b.request));
    expect(b.prompt).toContain('REQUEST (JSON):\n{"schema":"cc.fill.v1"');
  });
});

test.describe('the answer is checked before any body is used', () => {
  const asked = ['U01', 'U02', 'U03'];

  test('answers for the units asked, once each; strangers dropped; the unanswered named', () => {
    const text = JSON.stringify({
      units: [
        { unitId: 'U01', body: 'return a;', needs: ['csv.row', 7], refused: null },
        { unitId: 'U01', body: 'return b;', needs: [] },
        { unitId: 'U09', body: 'return c;' },
        { unitId: 'U02', body: '', refused: { reason: 'The slice reads a table the design drops.' } },
        { unitId: 'U03', body: '   ' },
      ],
    });
    const r = parseFillAnswer(text, asked);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.units.map((u) => u.unitId)).toEqual(['U01', 'U02']);
    expect(r.units[0]).toEqual({ unitId: 'U01', body: 'return a;', needs: ['csv.row'], refused: null });
    expect(r.units[1].refused).toEqual({ reason: 'The slice reads a table the design drops.' });
    expect(r.missing).toEqual(['U03']);
  });

  test('no JSON, or no units list, is unusable — fenced JSON is read as JSON', () => {
    expect(parseFillAnswer('the bodies follow', asked).ok).toBe(false);
    expect(parseFillAnswer('{"bodies": []}', asked)).toEqual({ ok: false, reason: 'The answer has no "units" list.' });
    const fenced = '```json\n{"units":[{"unitId":"U01","body":"return 1;"}]}\n```';
    const r = parseFillAnswer(fenced, asked);
    expect(r.ok && r.units.map((u) => u.unitId)).toEqual(['U01']);
  });
});

test.describe('schema and test stub', () => {
  test('the fill shape has its own schema under the transformation stage; the stage default is unchanged', () => {
    expect(responseSchemaForStage('transformation', 'transformation-fill')).toBe(TRANSFORMATION_FILL_SCHEMA);
    expect(responseSchemaForStage('transformation')).toBe(TRANSFORMATION_RESPONSE_SCHEMA);
    expect(responseSchemaForStage('testing', 'transformation-fill')).not.toBe(TRANSFORMATION_FILL_SCHEMA);
    expect(TRANSFORMATION_FILL_SCHEMA.required).toEqual(['units']);
    expect(TRANSFORMATION_FILL_SCHEMA.properties.units.items.required).toEqual(['unitId', 'body']);
  });

  test('the test stub answers a fill prompt with one usable body per unit, and every other call as before', () => {
    const [b] = bundleFills([unit(1, 5), unit(2, 5), unit(3, 5)], OPTS);
    const r = parseFillAnswer(geminiTestStubFillText(b.prompt), b.unitIds);
    expect(r.ok && r.units.map((u) => [u.unitId, u.body])).toEqual(b.unitIds.map((id) => [id, GEMINI_TEST_STUB_FILL_BODY.node]));
    expect(geminiTestStubAnswer(null).text).toBe(GEMINI_TEST_STUB_TEXT);
    expect(JSON.parse(geminiTestStubAnswer(null, 'no request here').text).units).toEqual([]);
    // A cut-off answer under the finish header stays cut off for fills too.
    const cut = geminiTestStubAnswer('MAX_TOKENS', b.prompt);
    expect(cut.finishReason).toBe('MAX_TOKENS');
    expect(parseFillAnswer(cut.text, b.unitIds).ok).toBe(false);
  });
});
