import { test, expect } from '@playwright/test';
import { buildNodeScaffold, buildRapScaffold, traceMarkdown, traceOf, withTrace } from '../lib/transformation';
import { fixture, planOf, poDemo } from './helpers/transformation-scaffold';

/**
 * traceability.json and TRACE.md (docs/design/engine-led-transformation.md §12.1): every
 * function of the package maps to ABAP lines and rule ids, or says it is the engine's own
 * library; every unit says who wrote its body. Server-free.
 */

test('every exported function is in the trace; every unit function maps to its ABAP lines and rules', () => {
  const { facts, plan } = planOf(fixture('co-shape'), { decisions: [{ id: 'BR-003', answer: 'change', note: 'Quotas up to 120 are allowed.' }] });
  const scaffold = buildNodeScaffold(plan, facts);
  const trace = traceOf(plan, scaffold, []);
  const exported = scaffold.files.filter((f) => f.path.endsWith('.ts')).flatMap((f) => [...f.content.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => `${f.path}#${m[1]}`));
  expect(trace.functions.map((f) => `${f.file}#${f.name}`).sort()).toEqual(exported.sort());
  for (const u of plan.units) {
    const fn = trace.functions.find((f) => f.file === u.file && f.name === u.fn)!;
    expect(fn, u.fn).toBeTruthy();
    expect(fn).toMatchObject({ owner: 'fill', unitId: u.id, rules: u.rules });
    expect(fn.abap).toEqual(u.abap.map((a) => ({ lineStart: a.lineStart, lineEnd: a.lineEnd })));
  }
  const predicate = trace.functions.find((f) => f.name === 'when_G0061')!;
  expect(predicate).toMatchObject({ owner: 'fill', unitId: 'U02', rules: ['BR-003'], abap: [{ lineStart: 61, lineEnd: 62 }] });
  const wrapper = trace.functions.find((f) => f.name === 'guard_BR_003_G0061')!;
  expect(wrapper.owner).toBe('engine');
  expect(trace.functions.find((f) => f.name === 'createApp')).toMatchObject({ owner: 'engine', unitId: null, abap: [] });
  const u02 = trace.units.find((u) => u.unitId === 'U02')!;
  expect(u02.rules).toEqual([{ id: 'BR-003', decision: 'change', proposal: 'Quotas up to 120 are allowed.' }, { id: 'BR-004', decision: 'open' }]);
  expect(trace.openRules).toEqual(['BR-002', 'BR-004']);
  expect(trace.units.every((u) => u.filledBy === 'not-filled')).toBe(true);
});

test('who wrote each body: model, repair rounds, or a stub', () => {
  const { facts, plan } = planOf(fixture('pp-shape'));
  const scaffold = buildNodeScaffold(plan, facts);
  const regionsOf = (unitId: string) => scaffold.regions.filter((r) => r.unitId === unitId).map((r) => r.regionId);
  const outcomes = [
    ...regionsOf('U01').map((regionId) => ({ regionId, state: 'model' as const })),
    ...regionsOf('U02').map((regionId) => ({ regionId, state: 'model-repair-2' as const })),
    { regionId: regionsOf('U03')[0], state: 'refused' as const },
  ];
  const { trace, files } = withTrace(plan, scaffold, scaffold.files, outcomes, { runId: 'run-123', contextDigest: 'ctx-abc' });
  const by = Object.fromEntries(trace.units.map((u) => [u.unitId, u.filledBy]));
  expect(by).toEqual({ U00: 'not-filled', U01: 'model', U02: 'model-repair-2', U03: 'not-filled' });
  expect(trace).toMatchObject({ runId: 'run-123', contextDigest: 'ctx-abc', scaffoldDigest: scaffold.digest, planDigest: plan.digest, sourceSha256: plan.sourceSha256 });
  expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['traceability.json', 'TRACE.md']));
  const md = files.find((f) => f.path === 'TRACE.md')!.content;
  expect(md).toContain('| U02 | `checkCoverage` (srv/steps/02-check-coverage.ts) |');
  expect(md).toContain('model proposal (repair round 2)');
  expect(md).toContain('Demo data of the original, not carried over in this version: LOAD_DEMO');
  expect(md).not.toMatch(/@cc-fill/);
});

test('the PO demo trace names the 13 routines never reached; the RAP trace maps methods', () => {
  const { facts, plan } = planOf(poDemo());
  const md = traceMarkdown(traceOf(plan, buildNodeScaffold(plan, facts), []));
  expect(md).toContain('Not carried over — never reached in the original:');
  expect((md.match(/never reached in the original: (.*)\./)?.[1] ?? '').split('), ').length).toBe(13);
  const rap = buildRapScaffold(plan, facts);
  const rapTrace = traceOf(plan, rap, []);
  for (const u of plan.units) expect(rapTrace.functions.some((f) => f.name.toLowerCase() === u.rapName && f.unitId === u.id), u.rapName).toBe(true);
});

test('an interface method is never a unit, even when it carries a unit name (access layer, application job)', () => {
  const { facts, plan } = planOf(poDemo());
  const rap = buildRapScaffold(plan, facts);
  const u = plan.units[0];
  const logic = rap.files.find((f) => f.path.endsWith('.abap') && f.content.includes(`METHOD ${u.rapName}.`))!;
  const withSameName = { ...rap, files: rap.files.map((f) => (f === logic ? { ...f, content: `${f.content}\n  METHOD zif_cc_access~${u.rapName}.\n  ENDMETHOD.\n` } : f)) };
  const trace = traceOf(plan, withSameName, []);
  const iface = trace.functions.filter((f) => f.name.toLowerCase() === `zif_cc_access~${u.rapName}`);
  expect(iface.length).toBe(1);
  expect(iface[0].unitId ?? null).toBeNull();
  const before = traceOf(plan, rap, []).functions.filter((f) => f.unitId === u.id).length;
  expect(trace.functions.filter((f) => f.unitId === u.id).length).toBe(before);
});
