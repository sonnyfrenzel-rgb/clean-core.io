import { test, expect } from '@playwright/test';
import { prepareEngineLed, guardBodyOf, candidateFiles, assembleEngineLed, emptyBodyComment, fillCountsLine, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { runGeneration, type FillModel, type GenerationRunResult } from '../lib/transformation/orchestrator';
import { createRunnerVerifier } from '../lib/transformation/verify';
import { generatedCodeLints } from '../lib/generated-code-lints';
import { geminiTestStubFillText } from '../lib/gemini-test-stub';
import { generationRecordOf, type GenerationRecord } from '../lib/transformation/generation-record';
import { howBuiltLines } from '../lib/delivery-package';
import { modelFilledFiles } from '../lib/ai-authorship';
import { fixture } from './helpers/transformation-scaffold';

/**
 * Roadmap 3.0.23 (c), server-free: one status per fill unit. STATUS.md (the
 * summary), TRACE.md, traceability.json and the page's progress line read the
 * same per-unit decision of `assembleEngineLed`:
 *   - a unit whose body was written but whose guard predicate was not is
 *     "written, a check still fails" everywhere — never a stub in TRACE.md
 *     while STATUS.md counts it written;
 *   - a body with no statement (only the model's comment) is neither counted
 *     nor marked as model-written.
 * The fixture is the hand-written CO-shaped program under tests/fixtures.
 */

const stubModel: FillModel = async (prompt) => geminiTestStubFillText(prompt);

function prepared(source: string, track: 'node' | 'rap' = 'node'): EngineLedPrepared {
  const prep = prepareEngineLed({ source, track, program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!prep.ok) throw new Error(prep.reason);
  return prep;
}

async function generate(prep: EngineLedPrepared): Promise<GenerationRunResult> {
  const verify = createRunnerVerifier({
    candidate: (bodies) => candidateFiles(prep, bodies),
    units: prep.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id) })),
    lint: (files) => generatedCodeLints(files, {}).map((f) => ({ path: f.file, line: f.line, message: f.message })),
  });
  return runGeneration({
    units: prep.fillUnits,
    plan: prep.plan.units,
    bundleOptions: { track: prep.scaffold.track, program: prep.plan.program, context: 'PLATFORM KNOWLEDGE (test)' },
    model: stubModel,
    guardBody: guardBodyOf(prep),
    verify,
    budget: 48,
    sleep: async () => {},
  });
}

const traceOf = (files: Array<{ path: string; content: string }>) =>
  JSON.parse(files.find((f) => f.path === 'traceability.json')!.content) as { units: Array<{ unitId: string; filledBy: string; note?: string | null }> };
const traceMd = (files: Array<{ path: string; content: string }>) => files.find((f) => f.path === 'TRACE.md')!.content;
const statusMd = (summary: unknown) => {
  const record = generationRecordOf({ path: 'engine-led', engine: summary, basis: [] });
  if (!record || 'error' in record) throw new Error('record refused');
  return howBuiltLines({ ...(record as GenerationRecord), contextDigest: null }).join('\n');
};

test.describe('one status per fill unit (3.0.23 c)', () => {
  test('a written body whose predicate was not written is "written, a check still fails" in STATUS.md, TRACE.md and the page alike', async () => {
    const prep = prepared(fixture('co-shape'));
    const withPredicate = prep.fillUnits.find((u) => u.guards.some((g) => g.regionId));
    expect(withPredicate, 'the CO-shaped fixture has a unit with a predicate region').toBeTruthy();
    const result = await generate(prep);
    expect(result.units.every((u) => u.state === 'written')).toBe(true);
    // The model wrote the body but not the predicate: the orchestrator keeps the body and reports the gap as a failure.
    const guard = withPredicate!.guards.find((g) => g.regionId)!;
    const gap = `body guards: the predicate of ${guard.id} (${guard.helper}) was not written`;
    const units = result.units.map((u) => (u.unitId === withPredicate!.unitId ? { ...u, predicates: {}, failures: [gap] } : u));
    const pkg = assembleEngineLed(prep, { ...result, units, status: 'partial' }, { checks: [], budget: 48 });

    const total = prep.fillUnits.length;
    expect(pkg.summary.units).toBe(total);
    expect(pkg.summary.written).toBe(total);
    expect(pkg.summary.notWritten).toEqual([]);
    expect(pkg.summary.failing.map((f) => f.unitId)).toEqual([withPredicate!.unitId]);

    // traceability.json: the unit is the model's, with the failing check as its note — not a stub.
    const unit = traceOf(pkg.files).units.find((u) => u.unitId === withPredicate!.unitId)!;
    expect(unit.filledBy).toBe('model');
    expect(unit.note).toContain('checks still failing');

    // TRACE.md: the header's counts are the summary's counts, and the row says AI-generated, never "not written — stub".
    const md = traceMd(pkg.files);
    expect(md).toContain(`(${total} written by the model, 0 left as stubs)`);
    expect(md).toContain(`${total} of ${total} functions written`);
    const row = md.split('\n').find((l) => l.startsWith(`| ${withPredicate!.unitId} |`))!;
    expect(row).toContain('AI-generated — checks still failing');
    expect(row).not.toContain('not written — stub');

    // STATUS.md and the page's progress line say the same.
    const status = statusMd(pkg.summary);
    expect(status).toContain(`- Functions: ${total} — ${total} written`);
    expect(status).toContain(`, 0 left as stubs.`);
    expect(status).toContain(`- Written, a check still fails: \`${withPredicate!.unitId}\``);
    expect(fillCountsLine(pkg.summary)).toBe(`${total} of ${total} functions written`);
  });

  test('a body with no statement is neither counted nor marked as model-written, in every file', async () => {
    const prep = prepared(fixture('co-shape'));
    const result = await generate(prep);
    const target = result.units.find((u) => u.unitId !== result.units[0].unitId && Object.keys(u.predicates).length === 0) ?? result.units[1];
    const units = result.units.map((u) => (u.unitId === target.unitId ? { ...u, body: '// Demo runner routine: omitted' } : u));
    const pkg = assembleEngineLed(prep, { ...result, units }, { checks: [], budget: 48 });

    const total = prep.fillUnits.length;
    expect(pkg.summary.written).toBe(total - 1);
    expect(pkg.summary.empty).toEqual([{ unitId: target.unitId, title: expect.any(String), comment: 'Demo runner routine: omitted' }]);
    expect(pkg.summary.notWritten).toEqual([]);

    const unit = traceOf(pkg.files).units.find((u) => u.unitId === target.unitId)!;
    expect(unit.filledBy).toBe('empty');
    const md = traceMd(pkg.files);
    const row = md.split('\n').find((l) => l.startsWith(`| ${target.unitId} |`))!;
    expect(row).not.toContain('AI-generated');
    expect(row).toContain('left empty — the model wrote no statement');
    expect(row).toContain('Demo runner routine: omitted');
    expect(md).toContain(`(${total - 1} written by the model, 1 left empty by the model, 0 left as stubs)`);
    expect(md).toContain(`${total - 1} of ${total} functions written`);

    const status = statusMd(pkg.summary);
    expect(status).toContain(`- Functions: ${total} — ${total - 1} written`);
    expect(status).toContain('1 left empty by the model, 0 left as stubs.');
    expect(status).toContain(`- Left empty by the model (no statement, not counted as written): \`${target.unitId}\``);
    expect(fillCountsLine(pkg.summary)).toBe(`${total - 1} of ${total} functions written; 1 left empty by the model`);
    // The file still holds the model's comment, so it keeps its AI-generated mark.
    expect(modelFilledFiles(pkg.files).has(prep.fillUnits.find((u) => u.unitId === target.unitId)!.function.file)).toBe(true);
  });

  test('emptyBodyComment: comments and blank lines are no statement, on both routes', () => {
    expect(emptyBodyComment('// Demo runner routine: omitted', 'node')).toBe('Demo runner routine: omitted');
    expect(emptyBodyComment('/* nothing\n * to do */\n', 'node')).toBe('nothing to do');
    expect(emptyBodyComment('   \n', 'node')).toBe('');
    expect(emptyBodyComment('return x; // the value', 'node')).toBeNull();
    expect(emptyBodyComment('" Demo runner routine: omitted\n* second line', 'rap')).toBe('Demo runner routine: omitted second line');
    expect(emptyBodyComment('rv_ok = abap_true. " set', 'rap')).toBeNull();
    expect(emptyBodyComment("lv_text = 'a \" b'.", 'rap')).toBeNull();
  });
});
