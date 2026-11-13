import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ThinkingLevel } from '@google/genai';
import {
  REWORDING_MAX_LENGTH,
  STATEMENTS_REWORDING_ENV,
  STATEMENT_REWORDING_SHAPE,
  buildStatementRewordingPrompt,
  factsOf,
  mergeStatementRewording,
  rewordingProblem,
  statementsRewordingOn,
  type RewordableStatement,
} from '../lib/statement-rewording';
import { buildStatementContext, validateStatementAnswer } from '../lib/business-statement-prompt';
import { RESPONSE_SHAPE_STAGE, isResponseShape, responseSchemaForStage } from '../lib/model-response-schema';
import { thinkingConfigFor } from '../lib/model-thinking';
import { planModelCall, LARGE_PROMPT_MODEL_ENV, FALLBACK_MODEL_ENV } from '../lib/model-combination';
import {
  STATEMENT_COST_LINE,
  STATEMENT_COST_LINE_BYOK,
  STATEMENT_COST_LINE_REWORDED,
  STATEMENT_COST_LINE_REWORDED_BYOK,
  isStatementProposalRecord,
  runStatementRequest,
  statementCostLine,
  statementProposalContextOf,
  type StatementProposalRecord,
} from '../lib/statement-proposal';
import { provenanceTitle } from '../components/cc/ProvenanceChip';

/**
 * The business statements reworded for a business reader — strategy c of the
 * model-combination study, owner decision 13.11.2026
 * (docs/design/model-combination.md §3.6, lib/statement-rewording.ts).
 *
 * Measured blind on 150 learn cases: the draft reworded scored 87.8 % equal
 * against 85.2 % for the draft alone, with a fifth as many technical
 * sentences — and one wrong sentence more, where a rewording turned "start-of-
 * selection is left" into "processing ends". The guard here is what keeps the
 * draft's words wherever a rewording moves, drops or changes what it said.
 *
 * Server-free: every function is pure; the routes and the client are read in
 * their source.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');

const SOURCE = [
  'REPORT zsd_open_orders.',
  'PARAMETERS p_vkorg TYPE vkorg OBLIGATORY.',
  'START-OF-SELECTION.',
  '  SELECT * FROM vbak INTO TABLE @DATA(lt_vbak) WHERE vkorg = @p_vkorg.',
  '  IF lt_vbak IS INITIAL.',
  '    MESSAGE s001(zsd).',
  '    RETURN.',
  '  ENDIF.',
  '  LOOP AT lt_vbak INTO DATA(ls_vbak).',
  '    IF ls_vbak-netwr > 100.',
  '      WRITE: / ls_vbak-vbeln, ls_vbak-netwr.',
  '    ENDIF.',
  '  ENDLOOP.',
  'END-OF-SELECTION.',
  '  WRITE: / \'Done\'.',
].join('\n');

const context = buildStatementContext([{ name: 'source.abap', code: SOURCE }]);

const draft: RewordableStatement[] = [
  { text: 'All fields are read from table VBAK where the sales organization (VKORG) equals the selection.', anchors: [{ file: 'source.abap', lineStart: 4 }], element: null },
  { text: 'If no sales document header (VBAK) is found, message S001 is issued and start-of-selection is left.', anchors: [{ file: 'source.abap', lineStart: 5 }, { file: 'source.abap', lineStart: 7 }], element: null },
  { text: "If the net value (NETWR) is greater than 100, the document number and the net value are written; otherwise the line is skipped.", anchors: [{ file: 'source.abap', lineStart: 10 }, { file: 'source.abap', lineStart: 11 }], element: null },
];

const reworded = (texts: Array<string | null>, patch: Array<Record<string, unknown>> = []) =>
  JSON.stringify({
    statements: draft.map((d, i) => ({
      text: texts[i] ?? d.text,
      anchors: d.anchors.map((a) => `${a.file}:${a.lineStart}`),
      element: d.element?.id ?? null,
      uncertainty: null,
      ...(patch[i] ?? {}),
    })),
  });

test.describe('the prompt', () => {
  test('orders a rewording for a business reader, keeps every fact, and hands over the statements with their anchors and the source', () => {
    const prompt = buildStatementRewordingPrompt(context, draft);
    expect(prompt).toContain('reword business statements about a piece of ABAP code for a business reader');
    expect(prompt).toContain('Keep every fact: every literal value, number, comparison boundary, condition and outcome, every "not", "only", "unless".');
    expect(prompt).toContain('Keep "anchors", "element" and "uncertainty" exactly as given, in the same order');
    expect(prompt).toContain('"anchors":["source.abap:5","source.abap:7"]');
    expect(prompt).toContain('"uncertainty":null');
    expect(prompt).toContain('Source source.abap, with line numbers');
    expect(prompt).toContain('   4  ' + '  SELECT * FROM vbak');
  });
});

test.describe('the guard', () => {
  test('a rewording that says the same for a business reader stands', () => {
    const text = 'If no sales document header is found, message S001 is issued and the selection step is left.';
    expect(rewordingProblem(draft[1], { text, anchors: ['source.abap:7', 'source.abap:5'], element: null, uncertainty: null })).toBeNull();
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBeNull();
  });

  test('BM-076-B05: a rewording that changes the control flow keeps the draft — "is left" is not "ends"', () => {
    // The one wrong sentence the measured rewording added: the draft said start-of-selection is left
    // (and END-OF-SELECTION still writes); the rewording said processing ends. Flow changed, draft stands.
    expect(rewordingProblem(draft[1], { text: 'If no sales document header is found, message S001 is issued and processing ends.', anchors: ['source.abap:5', 'source.abap:7'], element: null, uncertainty: null })).toBe('control-flow');
    // The same in every family: a stop that was not there, a skip that was dropped, a continue that was added.
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read and processing stops.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('control-flow');
    expect(rewordingProblem(draft[2], { text: 'If the net value is greater than 100, the document number and the net value are written.', anchors: ['source.abap:10', 'source.abap:11'], element: null, uncertainty: null })).toBe('control-flow');
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read and processing continues.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('control-flow');
    // "return code" is data, not flow.
    const data: RewordableStatement = { text: 'If sy-subrc is not 0, message E002 is issued.', anchors: [{ file: 'source.abap', lineStart: 6 }], element: null };
    expect(rewordingProblem(data, { text: 'If the return code is not 0, message E002 is issued.', anchors: ['source.abap:6'], element: null, uncertainty: null })).toBeNull();
  });

  test('a lost or added negation or limit keeps the draft', () => {
    expect(rewordingProblem(draft[1], { text: 'If a sales document header is found, message S001 is issued and start-of-selection is left.', anchors: ['source.abap:5', 'source.abap:7'], element: null, uncertainty: null })).toBe('negation-changed');
    expect(rewordingProblem(draft[0], { text: 'Only the sales document headers of the selected sales organization are read.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('negation-changed');
  });

  test('a lost number or literal, an identifier the draft never named, a moved anchor, another element, an uncertainty of its own', () => {
    expect(rewordingProblem(draft[2], { text: 'If the net value is greater than the limit, the document number and the net value are written; otherwise the line is skipped.', anchors: ['source.abap:10', 'source.abap:11'], element: null, uncertainty: null })).toBe('fact-lost');
    expect(factsOf("Status 'C' or \"D\", 1,000 and 2.5 are kept")).toEqual(["'C'", "'D'", '1,000', '2.5']);
    expect(rewordingProblem(draft[0], { text: 'All sales document headers (VBAK, KUNNR) of the selected sales organization are read.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('identifier-added');
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read.', anchors: ['source.abap:9'], element: null, uncertainty: null })).toBe('anchors-changed');
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read.', anchors: ['source.abap:4'], element: 'nd-1-0', uncertainty: null })).toBe('element-changed');
    expect(rewordingProblem(draft[0], { text: 'All sales document headers of the selected sales organization are read.', anchors: ['source.abap:4'], element: null, uncertainty: 'maybe' })).toBe('uncertainty-added');
  });

  test('empty, too long, Markdown, missing, malformed, unchanged', () => {
    expect(rewordingProblem(draft[0], { text: '   ', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('empty');
    expect(rewordingProblem(draft[0], { text: 'x'.repeat(REWORDING_MAX_LENGTH + 1), anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('too-long');
    expect(rewordingProblem(draft[0], { text: 'All **sales document headers** are read.', anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('markup');
    expect(rewordingProblem(draft[0], undefined)).toBe('missing');
    expect(rewordingProblem(draft[0], { anchors: ['source.abap:4'] })).toBe('malformed');
    expect(rewordingProblem(draft[0], { text: draft[0].text, anchors: ['source.abap:4'], element: null, uncertainty: null })).toBe('unchanged');
  });

  test('the merge keeps the draft sentence for every rejected rewording, counts why, and yields an answer the stage validates whole', () => {
    const answer = reworded([
      'All sales document headers of the selected sales organization are read.',
      'If no sales document header is found, message S001 is issued and processing ends.',
      null,
    ]);
    const merge = mergeStatementRewording(draft, answer);
    expect(merge.reworded).toBe(1);
    expect(merge.kept).toBe(2);
    expect(merge.rejected).toEqual({ 'control-flow': 1, unchanged: 1 });
    expect(merge.wordedByModel).toEqual([true, false, false]);
    const validated = validateStatementAnswer(context, merge.text);
    expect(validated.statements.map((s) => s.text)).toEqual([
      'All sales document headers of the selected sales organization are read.',
      draft[1].text,
      draft[2].text,
    ]);
    expect(validated.discarded.total).toBe(0);
    // Not JSON, not an object, too short: every draft sentence stands.
    for (const bad of ['', 'not json', '[]', '{"statements":[{"text":"x"}]}']) {
      const m = mergeStatementRewording(draft, bad);
      expect(m.reworded, bad).toBe(0);
      expect(validateStatementAnswer(context, m.text).statements.map((s) => s.text)).toEqual(draft.map((d) => d.text));
    }
  });
});

test.describe('the call: a shape of the statements stage, low thinking, no schema, never routed', () => {
  test('the shape', () => {
    expect(STATEMENT_REWORDING_SHAPE).toBe('statements-rewording');
    expect(isResponseShape(STATEMENT_REWORDING_SHAPE)).toBe(true);
    expect(RESPONSE_SHAPE_STAGE[STATEMENT_REWORDING_SHAPE]).toBe('statements');
    // Measured in JSON mode without a schema, like the draft; the guard is the defence.
    expect(responseSchemaForStage('statements', STATEMENT_REWORDING_SHAPE)).toBeUndefined();
    expect(thinkingConfigFor(STATEMENT_REWORDING_SHAPE)).toEqual({ thinkingLevel: ThinkingLevel.LOW });
    // The stage's model rules do not touch it: with the statements on another model, the rewording stays on the product model.
    const env = { [LARGE_PROMPT_MODEL_ENV]: 'gemini-4-hydrogen', [FALLBACK_MODEL_ENV]: 'gemini-4-hydrogen', GEMINI_LARGE_PROMPT_CHARS: '0' };
    const register = new Set(['gemini-3.8-flash', 'gemini-4-hydrogen']);
    expect(planModelCall({ stage: 'statements', shape: STATEMENT_REWORDING_SHAPE, promptLength: 50_000, model: 'gemini-3.8-flash', platformKey: true, env, register }))
      .toEqual({ model: 'gemini-3.8-flash', routed: false, fallback: null });
    expect(planModelCall({ stage: 'statements', promptLength: 50_000, model: 'gemini-3.8-flash', platformKey: true, env, register })).toMatchObject({ model: 'gemini-4-hydrogen' });
  });

  test('the deployment switch: on only when set to on', () => {
    expect(statementsRewordingOn({})).toBe(false);
    expect(statementsRewordingOn({ [STATEMENTS_REWORDING_ENV]: 'ON ' })).toBe(true);
    expect(statementsRewordingOn({ [STATEMENTS_REWORDING_ENV]: 'true' })).toBe(false);
    const route = read('app/api/model-stages/route.ts');
    expect(route).toContain('const statementsRewording = statementsRewordingOn(process.env);');
    expect(route.match(/statementsRewording \};/g) ?? []).toHaveLength(2);
    expect(read('hooks/useModelAvailability.ts')).toContain("setStatementsRewording(data.statementsRewording === true);");
  });

  test('the browser makes the second call under the statements stage in the rewording shape, and only when the deployment rewords', async () => {
    const client = read('lib/statement-proposal-client.ts');
    expect(client).toContain("callGeminiWithReceipt(prompt, PRODUCT_GEMINI_MODEL, true, STATEMENT_STAGE, signal, { responseShape: STATEMENT_REWORDING_SHAPE })");
    const ctx = statementProposalContextOf(SOURCE);
    const record = { formatVersion: 1, digest: ctx.digest, statements: [], discarded: { total: 0, byRule: {} }, origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'm', byok: false, issuedAt: 1, textSha256: 'x' }, proposedAt: 't' } as unknown as StatementProposalRecord;
    const draftAnswer = JSON.stringify({ statements: [{ text: 'All sales document headers of the selected sales organization are read.', anchors: ['source.abap:4'], element: null, uncertainty: null }] });
    let posted: unknown = null;
    let rewordPrompts = 0;
    const deps = {
      callModel: async () => ({ text: draftAnswer, receipt: { r: 1 } }),
      rewordModel: async (prompt: string) => { rewordPrompts += 1; expect(prompt).toContain('"anchors":["source.abap:4"]'); return { text: '{"statements":[]}', receipt: { r: 2 } }; },
      store: async (submission: unknown) => { posted = submission; return { ok: true as const, record }; },
    };
    // Off: one call, the submission as before.
    await runStatementRequest(ctx, deps, { known: true, keyAvailable: true, stages: {} });
    expect(rewordPrompts).toBe(0);
    expect(posted).toEqual({ digest: ctx.digest, text: draftAnswer, receipt: { r: 1 } });
    // On: the second call, its answer posted as it came back with its receipt.
    await runStatementRequest(ctx, deps, { known: true, keyAvailable: true, stages: {}, rewording: true });
    expect(rewordPrompts).toBe(1);
    expect(posted).toEqual({ digest: ctx.digest, text: draftAnswer, receipt: { r: 1 }, rewording: { text: '{"statements":[]}', receipt: { r: 2 } } });
    // A rewording call that fails costs the rewording and nothing else.
    await runStatementRequest(ctx, { ...deps, rewordModel: async () => { throw new Error('refused'); } }, { known: true, keyAvailable: true, stages: {}, rewording: true });
    expect(posted).toEqual({ digest: ctx.digest, text: draftAnswer, receipt: { r: 1 } });
    // A draft without a usable sentence is not reworded.
    await runStatementRequest(ctx, { ...deps, callModel: async () => ({ text: '{"statements":[]}', receipt: { r: 1 } }) }, { known: true, keyAvailable: true, stages: {}, rewording: true });
    expect(rewordPrompts).toBe(1);
  });
});

test.describe('the store, the origin, the chip, the cost line', () => {
  test('the route verifies the second receipt under the statements stage, merges with the guard, validates the merge and records the draft as origin.draft', () => {
    const route = read('app/api/projects/[projectId]/statement-proposal/route.ts');
    expect(route).toContain("const second = verifyModelReceipt(rewordingBody.receipt, { uid: gate.uid, text: rewordingBody.text, key, stage: STATEMENT_STAGE });");
    expect(route).toContain('const merge = mergeStatementRewording(validated.statements, rewordingBody.text);');
    expect(route).toContain('const merged = validateStatementAnswer(context.statementContext, merge.text);');
    expect(route).toContain('draft: draftOrigin,');
    // Without a verifying second receipt the draft is stored as it came, and nothing claims a second model.
    expect(route).toContain("logger.warn('statement-proposal rewording receipt refused; the draft is stored as it came'");
    expect(route.indexOf('mergeStatementRewording(')).toBeGreaterThan(route.indexOf('if (second.ok) {'));
  });

  test('a record with a draft origin is a record; a draft origin missing a field is not', () => {
    const ctx = statementProposalContextOf(SOURCE);
    const base = { formatVersion: 1, digest: ctx.digest, statements: [], discarded: { total: 0, byRule: {} }, proposedAt: 't' };
    const origin = { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, issuedAt: 2, textSha256: 'y' };
    const draftOrigin = { provider: 'google-gemini', modelId: 'gemini-4-hydrogen', byok: false, issuedAt: 1, textSha256: 'x' };
    expect(isStatementProposalRecord({ ...base, origin })).toBe(true);
    expect(isStatementProposalRecord({ ...base, origin: { ...origin, draft: draftOrigin }, rewording: { reworded: 3, kept: 1, rejected: { 'control-flow': 1 } } })).toBe(true);
    expect(isStatementProposalRecord({ ...base, origin: { ...origin, draft: { ...draftOrigin, modelId: 7 } } })).toBe(false);
    expect(isStatementProposalRecord({ ...base, origin: { ...origin, draft: 'gemini-4-hydrogen' } })).toBe(false);
  });

  test('the chip names the writer and the model whose draft it reworded', () => {
    expect(provenanceTitle('proposed', { provider: 'google-gemini', modelId: 'gemini-3.8-flash' })).toContain('Written by Google Gemini · gemini-3.8-flash.');
    expect(provenanceTitle('proposed', { provider: 'google-gemini', modelId: 'gemini-3.8-flash', draft: { provider: 'google-gemini', modelId: 'gemini-4-hydrogen' } }))
      .toContain('Written by Google Gemini · gemini-3.8-flash, from a draft by Google Gemini · gemini-4-hydrogen.');
    expect(provenanceTitle('proposed', { provider: 'google-gemini', modelId: 'gemini-3.8-flash', draft: null })).toContain('Written by Google Gemini · gemini-3.8-flash.');
    expect(provenanceTitle('reconstructed', { provider: 'google-gemini', modelId: 'x' })).not.toContain('Written by');
    const panel = read('components/documentation/StatementProposal.tsx');
    expect(panel).toContain('<CcProvenanceChip value={proposal.provenance} origin={chipOriginOf(origin)} />');
    expect(panel).toContain('from a draft by ${view.origin.draft.modelId}');
  });

  test('the cost line says two calls where the deployment rewords', () => {
    expect(statementCostLine(false, false)).toBe(STATEMENT_COST_LINE);
    expect(statementCostLine(true, false)).toBe(STATEMENT_COST_LINE_BYOK);
    expect(statementCostLine(false, true)).toBe(STATEMENT_COST_LINE_REWORDED);
    expect(statementCostLine(true, true)).toBe(STATEMENT_COST_LINE_REWORDED_BYOK);
    for (const line of [STATEMENT_COST_LINE_REWORDED, STATEMENT_COST_LINE_REWORDED_BYOK]) {
      expect(line).toMatch(/^Two model calls/);
      expect(line).toMatch(/not counted against your analysis runs/i);
      expect(line).toMatch(/hourly limit on model calls/);
    }
    expect(STATEMENT_COST_LINE_REWORDED_BYOK).toMatch(/own Gemini key/);
    expect(read('components/documentation/StatementProposal.tsx')).toContain('{statementCostLine(byok, rewording)}');
  });
});
