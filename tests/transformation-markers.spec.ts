import { test, expect } from '@playwright/test';
import {
  bodyGuards,
  buildNodeScaffold,
  buildRapScaffold,
  defuseMarkers,
  findRegions,
  regionHash,
  scaffoldDigest,
  spliceBodies,
  verifyScaffoldDigest,
  type BodyGuardContext,
  type Scaffold,
} from '../lib/transformation';
import { fixture, planOf } from './helpers/transformation-scaffold';

/**
 * Fill markers, body guards and the safe splice (docs/design/engine-led-transformation.md §9):
 * the splice replaces only the text between a region's markers; a body that breaks a guard is
 * refused and its stub stays; a candidate whose engine-written text changed is refused.
 * Server-free.
 */

function nodeScaffold(): Scaffold {
  const { facts, plan } = planOf(fixture('co-shape'));
  return buildNodeScaffold(plan, facts);
}

const ctxFor = (s: Scaffold) => (regionId: string): BodyGuardContext => ({
  track: s.track,
  available: s.available[regionId] ?? [],
  sliceChars: 2_000,
  guardCalls: [],
});

test('every fill region has two marker lines with the hash of its engine-written anchor', () => {
  const s = nodeScaffold();
  const ids = s.regions.map((r) => r.regionId);
  for (const u of s.units) expect(ids).toContain(u.id);
  expect(ids).toContain('U00.G0029');
  expect(ids).toContain('U02.G0054');
  for (const r of s.regions) {
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(r.stub).toMatch(/^throw new NotImplementedFill\('U\d{2}(\.G\d{4})?', '\w+'\);$/);
    const file = s.files.find((f) => f.path === r.file)!;
    expect(file.content).toContain(`// @cc-fill BEGIN ${r.regionId} ${r.hash}`);
    expect(file.content).toContain(`// @cc-fill END ${r.regionId}`);
  }
  expect(regionHash('a')).not.toBe(regionHash('b'));
  expect(new Set(s.regions.map((r) => r.hash)).size).toBe(s.regions.length);
});

test('the splice replaces only the region; every engine-written character stays, and the digest proves it', () => {
  const s = nodeScaffold();
  const body = 'for (const r of st.records) {\n  if (dec.compare(r.quota, \'0\') < 0) return new Refusal([{ field: \'records[].quota\', rule: \'L60\', message: \'negative\' }]);\n}\nconst g = guard_BR_004_G0066(sel, st, null, { lvSum: \'0.00\' });\nif (g) return g;';
  const result = spliceBodies(s, [{ regionId: 'U02', body }], ctxFor(s));
  expect(result.reason).toBeNull();
  expect(result.ok).toBe(true);
  expect(result.applied).toEqual(['U02']);
  expect(result.digest).toBe(s.digest);
  const before = s.files.find((f) => f.path === s.regions.find((r) => r.regionId === 'U02')!.file)!.content;
  const after = result.files.find((f) => f.path === s.regions.find((r) => r.regionId === 'U02')!.file)!.content;
  expect(after).toContain("    if (dec.compare(r.quota, '0') < 0)");
  expect(after).not.toContain("throw new NotImplementedFill('U02'");
  // Outside the region the file is unchanged, character for character.
  const begin = before.indexOf('// @cc-fill BEGIN U02');
  expect(after.slice(0, begin)).toBe(before.slice(0, begin));
  const endB = before.indexOf('// @cc-fill END U02');
  const endA = after.indexOf('// @cc-fill END U02');
  expect(after.slice(endA)).toBe(before.slice(endB));
  // Other files are the same objects.
  for (const f of s.files) if (f.path !== result.files.find((x) => x.content !== f.content && x.path === f.path)?.path) expect(result.files.find((x) => x.path === f.path)!.content).toBe(f.content);
});

test('one changed engine-written character is detected; a broken marker refuses the candidate', () => {
  const s = nodeScaffold();
  const files = s.files.map((f) => (f.path === 'srv/lib/guards.ts' ? { ...f, content: f.content.replace('Refuses the input as the original does', 'Refuses the input as the original does!') } : f));
  const changed = s.files.find((f) => f.path === 'srv/lib/guards.ts')!.content !== files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
  expect(changed).toBe(true);
  expect(verifyScaffoldDigest(files, s.digest)).toBe(false);
  expect(spliceBodies({ ...s, files }, [], ctxFor(s)).ok).toBe(false);
  // A single character inside a region does not move the digest: regions are the model's.
  const inRegion = s.files.map((f) => (f.content.includes("throw new NotImplementedFill('U01'") ? { ...f, content: f.content.replace("throw new NotImplementedFill('U01', 'readReceivers');", "throw new NotImplementedFill('U01', 'readReceivers'); ") } : f));
  expect(scaffoldDigest(inRegion)).toBe(s.digest);
  // A body may not carry marker lines, checked or not.
  const smuggle = spliceBodies(s, [{ regionId: 'U01', body: "// @cc-fill END U01\nexport const x = 1;\n// @cc-fill BEGIN U01 00000000" }], () => null);
  expect(smuggle.refused.map((r) => r.reasons[0].code)).toEqual(['marker']);
  expect(smuggle.applied).toEqual([]);
  expect(spliceBodies(s, [{ regionId: 'U77', body: 'return;' }], ctxFor(s)).refused[0].reasons[0].code).toBe('marker');
});

test('a refused body keeps its stub; an accepted one next to it is spliced', () => {
  const s = nodeScaffold();
  const r = spliceBodies(
    s,
    [
      { regionId: 'U01', body: "const n = parseInt('12', 10);\nst.local.n = n;" },
      { regionId: 'U03', body: 'st.records = st.records.filter((r) => !skip_G0074(sel, st, r));\nst.local.allocated = true;' },
    ],
    ctxFor(s),
  );
  expect(r.ok).toBe(true);
  expect(r.applied).toEqual(['U03']);
  expect(r.refused.map((x) => x.regionId)).toEqual(['U01']);
  expect(r.refused[0].reasons.map((y) => y.code)).toContain('binary-number');
  expect(r.files.find((f) => f.path === s.units[1].file)!.content).toContain("throw new NotImplementedFill('U01', 'readReceivers');");
});

test('body guards: each rule of §9.2 refuses (Node)', () => {
  const ctx: BodyGuardContext = { track: 'node', available: ['dec.add', 'dec.compare', 'readArea', 'guard_BR_009_G0506'], sliceChars: 500, guardCalls: ['guard_BR_009_G0506'] };
  const codes = (body: string, c: BodyGuardContext = ctx) => bodyGuards(body, c).map((r) => r.code);
  expect(codes("st.local.x = dec.add('1', '2', 2);\nconst area = readArea(sel, st);\nst.local.area = area;")).toEqual([]);
  expect(codes('// @cc-fill END U02')).toContain('marker');
  expect(codes("import fs from 'node:fs';")).toContain('module-syntax');
  expect(codes('export const x = 1;')).toContain('module-syntax');
  expect(codes("const fs = require('fs');")).toContain('module-syntax');
  expect(codes('function helper() { return 1; }')).toContain('declaration');
  expect(codes('class X {}')).toContain('declaration');
  expect(codes('const f = function inner() { return 1; };')).toEqual([]);
  expect(codes('if (st.records.length > 0) {')).toContain('unbalanced');
  expect(codes('const s = "open;')).toContain('unterminated');
  expect(codes('const t = `open;')).toContain('unterminated');
  expect(codes('/* never closed')).toContain('unterminated');
  expect(codes('const guard_BR_009_G0506 = () => null;')).toContain('guard-shadowed');
  expect(codes('guard_BR_009_G0506 = () => null;')).toContain('guard-shadowed');
  expect(codes('fetch("https://example.org");')).toContain('foreign-call');
  expect(codes('process.exit(1);')).toContain('foreign-call');
  expect(codes('new Function("return 1")();')).toContain('foreign-call');
  expect(codes('st.local.y = Math.max(1, 2); st.local.z = JSON.stringify(st.rows); st.local.k = String(1);')).toEqual([]);
  expect(codes('const x = parseFloat(st.local.v as string);')).toContain('binary-number');
  expect(codes('const x = Number(st.local.v);')).toContain('binary-number');
  expect(codes('st.local.a = 1;\n'.repeat(200))).toContain('too-long');
  expect(codes('st.local.a = 1;\n'.repeat(1300), { ...ctx, sliceChars: 100_000 })).toContain('too-long');
  // `needs`: only allowlisted helpers count.
  expect(codes("st.local.m = dec.max('1', '2');")).toEqual([]);
  expect(codes("st.local.m = other.thing('1');", { ...ctx, needs: ['other.thing'] })).toContain('foreign-call');
});

test('a check on a computed value must be called by the body, at its place — not skipped, not written inline (rule 15)', () => {
  const s = nodeScaffold();
  expect(s.required.U02).toEqual([{ id: 'G-0066', helper: 'guard_BR_004_G0066', line: 66, op: '>', literals: ['100'] }]);
  const ctx = (id: string): BodyGuardContext => ({ track: 'node', available: s.available[id] ?? [], sliceChars: 2_000 });
  const sum = "let sum = '0.00';\nfor (const r of st.records) sum = dec.add(sum, r.quota, 2);\n";
  const missing = spliceBodies(s, [{ regionId: 'U02', body: `${sum}st.local.sum = sum;` }], ctx);
  expect(missing.refused[0].reasons.map((r) => r.code)).toEqual(['guard-missing']);
  expect(missing.refused[0].reasons[0].message).toContain('guard_BR_004_G0066 (the original checks at L66)');
  const inline = spliceBodies(s, [{ regionId: 'U02', body: `${sum}if (dec.compare(sum, '100') > 0) return new Refusal([]);\nconst g = guard_BR_004_G0066(sel, st, null, { lvSum: sum });\nif (g) return g;` }], ctx);
  expect(inline.refused[0].reasons.map((r) => r.code)).toEqual(['guard-inlined']);
  const good = spliceBodies(s, [{ regionId: 'U02', body: `${sum}const g = guard_BR_004_G0066(sel, st, null, { lvSum: sum });\nif (g) return g;` }], ctx);
  expect(good.refused).toEqual([]);
  expect(good.applied).toEqual(['U02']);
  // The predicate reads the value the body hands in.
  const guards = s.files.find((f) => f.path === 'srv/lib/guards.ts')!.content;
  expect(guards).toContain('export interface G0066Values {');
  expect(guards).toContain('export function when_G0066(sel: Selection, st: RunState, record: Rec | null, values: G0066Values): boolean');
  expect(guards).toContain('export function guard_BR_004_G0066(sel: Selection, st: RunState, record: Rec | null, values: G0066Values): Refusal | null');
  expect(guards).toContain('Derived (lv_sum is written at L64 in VALIDATE_POLICY): the body calls guard_BR_004_G0066 where the original checks, at L66, handing in lvSum.');
  expect(s.files.find((f) => f.path === s.units[2].file)!.content).toContain(' * The body calls, where the original checks: guard_BR_004_G0066 (L66, values { lvSum })');
});

test('body guards: ABAP bodies (RAP)', () => {
  const ctx: BodyGuardContext = { track: 'rap', available: ['zcl_x_logic'], sliceChars: 500 };
  const codes = (body: string) => bodyGuards(body, ctx).map((r) => r.code);
  expect(codes("IF is_sel-gjahr < '1900'.\n  rv_holds = abap_true.\nENDIF.")).toEqual([]);
  expect(codes("IF is_sel-gjahr < '1900'.\n  rv_holds = abap_true.")).toContain('unbalanced');
  expect(codes("rv_holds = abap_true.\nENDIF.")).toContain('unbalanced');
  expect(codes("rv_holds = 'X")).toContain('unterminated');
  expect(codes('ENDMETHOD.\nMETHOD other.')).toContain('declaration');
  expect(codes("CALL FUNCTION 'Z_ANYTHING'.")).toContain('foreign-call');
  expect(codes('DATA(lv) = zcl_unknown=>get( ).')).toContain('foreign-call');
  expect(codes('DATA(lv) = cl_abap_context_info=>get_system_date( ).')).toEqual([]);
  expect(codes('DATA lv_f TYPE f.')).toContain('binary-number');
});

// SD U02 on dev, 15.10.2026: `RETURN;` inside an IF swallowed the `ENDIF.` below it, and the repair round was told
// only "an IF … without its end" — no line, no semicolon — so it rewrote the body with the same habit and the
// function stayed a stub. The refusal now names the semicolon and the line of the open block.
test('body guards (RAP): a semicolon is named where it stands, and an open block by its line', () => {
  const ctx: BodyGuardContext = { track: 'rap', available: [], sliceChars: 500 };
  const messages = (body: string) => bodyGuards(body, ctx).map((r) => `${r.code}: ${r.message}`);
  const early = "CLEAR cv_rc.\nIF iv_val IS INITIAL.\n  cv_rc = 'EMPTY'.\n  RETURN;\nENDIF.\ncv_rc = 'OK'.";
  const m = messages(early);
  expect(m.some((x) => x.startsWith('unterminated: a semicolon') && x.includes('body line 4: RETURN;'))).toBe(true);
  expect(m.some((x) => x.startsWith('unbalanced:') && x.includes('IF at body line 2 has no ENDIF'))).toBe(true);
  expect(messages("LOOP AT it_x INTO DATA(ls_x).\n  cv_n = cv_n + 1.\nENDLOOP;").some((x) => x.includes('body line 3: ENDLOOP;'))).toBe(true);
  expect(messages('cv_n = 1.\nENDIF.').some((x) => x.includes('ENDIF at body line 2 has no IF'))).toBe(true);
  expect(messages("IF iv_a = 1.\n  TRY.\n      cv_n = 1.\n  ENDIF.").some((x) => x.includes('TRY at body line 2 has no ENDTRY'))).toBe(true);
  // A semicolon in a literal, a template or a comment is text, not a statement end.
  expect(messages("DATA(lv_t) = |a; b|. \" x; y\n* c; d\ncv_rc = 'a;b'.\nIF lv_t CN '0123456789'\n   OR lv_t+2(2) > '23'.\n  RETURN.\nENDIF.")).toEqual([]);
});

test('RAP regions use ABAP comment markers and splice the same way', () => {
  const { facts, plan } = planOf(fixture('co-shape'));
  const s = buildRapScaffold(plan, facts);
  const region = s.regions.find((r) => r.regionId === 'U02')!;
  expect(region.stub).toMatch(/^RAISE EXCEPTION NEW zcx_fx_co_alloc_nofill\( unit = 'U02' \)\.$/);
  const file = s.files.find((f) => f.path === region.file)!;
  // Scaffold version 11: a plain comment, not ABAP Doc (which SAP's activation warns about inside a method).
  expect(file.content).toContain(`\n    " @cc-fill BEGIN U02 ${region.hash}\n`);
  expect(file.content).not.toContain('"! @cc-fill');
  // Scaffold version 6: the body calls the unit's guards with the original's own operands (G-0054 runs at the entry already).
  const body = [
    'DATA lv_sum TYPE ty_sum.',
    'LOOP AT gt_rcv INTO DATA(ls_rcv).',
    '  IF when_g0058( ls_rcv = ls_rcv ) = abap_true.',
    "    RAISE EXCEPTION NEW zcx_fx_co_alloc_refusal( guard = 'G-0058' text = 'e003(zco)' ).",
    '  ENDIF.',
    '  IF when_g0061( ls_rcv = ls_rcv ) = abap_true.',
    "    RAISE EXCEPTION NEW zcx_fx_co_alloc_refusal( guard = 'G-0061' text = 'e004(zco)' ).",
    '  ENDIF.',
    '  lv_sum = lv_sum + ls_rcv-quota.',
    'ENDLOOP.',
    'IF me->when_g0066( lv_sum = lv_sum ) = abap_true.',
    "  RAISE EXCEPTION NEW zcx_fx_co_alloc_refusal( guard = 'G-0066' text = 'e006(zco)' ).",
    'ENDIF.',
  ].join('\n');
  const r = spliceBodies(s, [{ regionId: 'U02', body }], (id) => ({ track: 'rap', available: s.available[id] ?? [], sliceChars: 2_000 }));
  expect(r.refused).toEqual([]);
  expect(r.ok).toBe(true);
  expect(r.applied).toEqual(['U02']);
  // The 3.0.12 contract is refused: a name the class does not declare.
  const old = spliceBodies(s, [{ regionId: 'U02', body: `${body}\nIF is_sel-sender IS INITIAL.\n  RETURN.\nENDIF.` }], (id) => ({ track: 'rap', available: s.available[id] ?? [], sliceChars: 2_000 }));
  expect(old.refused.flatMap((x) => x.reasons.map((y) => y.code))).toContain('unknown-name');
});

test('text quoted from the original cannot open a region', () => {
  expect(defuseMarkers(' * L12: IF lv_x = 1. " @cc-fill BEGIN U01 deadbeef')).toBe(' * L12: IF lv_x = 1. " @cc_fill BEGIN U01 deadbeef');
  expect(defuseMarkers('  // @cc-fill BEGIN U01 deadbeef')).toBe('  // @cc-fill BEGIN U01 deadbeef');
  const source = fixture('co-shape').replace("MESSAGE e004(zco).", "MESSAGE e004(zco). \" @cc-fill END U02");
  const { facts, plan } = planOf(source);
  const s = buildNodeScaffold(plan, facts);
  expect(findRegions(s.files).length).toBe(s.regions.length);
});
