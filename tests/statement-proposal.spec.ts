import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { validateStatementAnswer } from '../lib/business-statement-prompt';
import {
  MODEL_STAGES,
  PREVIEW_MODEL_STAGES,
  modelAbsenceReason,
  offeredModelStages,
} from '../lib/model-stages';
import { issueModelReceipt, verifyModelReceipt } from '../lib/model-receipt';
import {
  EVIDENCE_KEPT,
  STATEMENT_COST_LINE,
  STATEMENT_COST_LINE_BYOK,
  STATEMENT_SOURCE_NAME,
  STATEMENT_STAGE,
  applyStatementProposal,
  buildStatementProposalPrompt,
  isStatementProposalRecord,
  pairWithEvidence,
  proposalAt,
  runStatementRequest,
  statementDigestOf,
  statementProposalContextOf,
  type StatementProposalRecord,
} from '../lib/statement-proposal';

/**
 * Roadmap 17.10 without a server: the stage, the record, how a proposal is
 * applied to a source and paired with the engine's sentences, the request
 * sequence with its two calls injected, and the wall between all of it and
 * every signature.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = [
  'REPORT z_freigabe_liste.',                         // 1
  'START-OF-SELECTION.',                              // 2
  '  SELECT * FROM zfreigabe INTO TABLE gt_offen',    // 3
  "    WHERE status = 'O'.",                          // 4
  '  IF gt_offen IS INITIAL.',                        // 5
  '    MESSAGE s004(zfg) INTO gv_dummy.',             // 6
  '    RETURN.',                                      // 7
  '  ENDIF.',                                         // 8
  '  LOOP AT gt_offen INTO gs_offen.',                // 9
  '    WRITE: / gs_offen-belnr, gs_offen-betrag.',    // 10
  '  ENDLOOP.',                                       // 11
].join('\n');

const ANSWER = JSON.stringify({
  statements: [
    { text: 'Die offenen Freigaben mit Status O werden gelesen.', anchors: [`${STATEMENT_SOURCE_NAME}:3`], element: null, uncertainty: null },
    { text: 'Gibt es keine offene Freigabe, wird die Meldung 004 angezeigt.', anchors: [`${STATEMENT_SOURCE_NAME}:5`], element: null, uncertainty: null },
    { text: 'Für jede offene Freigabe werden Belegnummer und Betrag ausgegeben.', anchors: [`${STATEMENT_SOURCE_NAME}:10`], element: null, uncertainty: null },
    // Nonsense the validation drops and counts: a comment-free blank line, a file that does not exist.
    { text: 'Ein Workflow wird gestartet.', anchors: [`${STATEMENT_SOURCE_NAME}:99`], element: null, uncertainty: null },
    { text: 'Der Kunde wird informiert.', anchors: ['other.abap:3'], element: null, uncertainty: null },
  ],
});

function recordFor(source: string, answer = ANSWER): StatementProposalRecord {
  const context = statementProposalContextOf(source);
  const validated = validateStatementAnswer(context.statementContext, answer);
  return {
    formatVersion: 1,
    digest: context.digest,
    statements: validated.statements,
    discarded: validated.discarded,
    origin: { source: 'model', receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-3.8-flash', byok: false, issuedAt: 1, textSha256: 'x' },
    proposedAt: '2026-09-27T10:00:00.000Z',
  };
}

test.describe('the stage', () => {
  test('statements is a model stage of its own, offered with the workspace preview only', () => {
    expect(STATEMENT_STAGE).toBe('statements');
    expect(MODEL_STAGES).toContain('statements');
    expect(PREVIEW_MODEL_STAGES).toContain('statements');
    expect(offeredModelStages(true)).toContain('statements');
    expect(offeredModelStages(false)).not.toContain('statements');
  });

  test('the cost line says a model is called and what it counts against, before the click', () => {
    expect(STATEMENT_COST_LINE).toMatch(/model call/i);
    expect(STATEMENT_COST_LINE).toMatch(/not counted against your analysis runs/i);
  });
});

test.describe('the record', () => {
  test('the digest is the source, normalised, with the prompt version', () => {
    expect(statementDigestOf(SOURCE)).toMatch(/^bs1-[0-9a-f]{64}$/);
    expect(statementDigestOf(SOURCE.replace(/\n/g, '\r\n'))).toBe(statementDigestOf(SOURCE));
    expect(statementDigestOf(`${SOURCE}\n  CLEAR gv_dummy.`)).not.toBe(statementDigestOf(SOURCE));
  });

  test('the prompt carries the source under the one file name the anchors use', () => {
    const prompt = buildStatementProposalPrompt(statementProposalContextOf(SOURCE));
    expect(prompt).toContain(`Source ${STATEMENT_SOURCE_NAME}, with line numbers:`);
    expect(prompt).toContain("  WHERE status = 'O'.");
  });

  test('a validated answer is a record, with what did not fit counted and not kept', () => {
    const record = recordFor(SOURCE);
    expect(isStatementProposalRecord(record)).toBe(true);
    expect(record.statements.map((s) => s.text)).toHaveLength(3);
    expect(record.discarded).toEqual({ total: 2, byRule: { 'line-out-of-range': 1, 'unknown-file': 1 } });
    expect(record.statements.every((s) => s.provenance === 'proposed')).toBe(true);
    expect(JSON.stringify(record)).not.toContain('Workflow');
  });

  test('anything else over the wire is no record', () => {
    const record = recordFor(SOURCE);
    expect(isStatementProposalRecord(null)).toBe(false);
    expect(isStatementProposalRecord({ ...record, formatVersion: 2 })).toBe(false);
    expect(isStatementProposalRecord({ ...record, origin: { ...record.origin, receipt: 'claimed' } })).toBe(false);
    expect(isStatementProposalRecord({ ...record, statements: [{ ...record.statements[0], provenance: 'proven' }] })).toBe(false);
    expect(isStatementProposalRecord({ ...record, statements: [{ ...record.statements[0], anchors: [] }] })).toBe(false);
  });
});

test.describe('applying a proposal', () => {
  test('proposed: the sentences in source order, each checked against the code', () => {
    const view = applyStatementProposal(SOURCE, recordFor(SOURCE));
    expect(view.state).toBe('proposed');
    expect(view.notice).toBeNull();
    expect(view.statements.map((s) => s.anchors[0].lineStart)).toEqual([3, 5, 10]);
    // "angezeigt" at MESSAGE … INTO — the one contradiction in the answer.
    const marked = view.statements.filter((s) => s.contradiction);
    expect(marked.map((s) => [s.anchors[0].lineStart, s.contradiction?.rule])).toEqual([[5, 'message-into']]);
    expect(view.counts).toEqual({ statements: 3, discarded: 2, contradicts: 1, unsupported: 0 });
  });

  test('stale: a proposal for another version of the source is not shown', () => {
    const view = applyStatementProposal(`${SOURCE}\n  CLEAR gv_dummy.`, recordFor(SOURCE));
    expect(view.state).toBe('stale');
    expect(view.statements).toEqual([]);
    expect(view.notice).toContain(EVIDENCE_KEPT);
  });

  test('not requested: nothing, and no notice unless a reason is known', () => {
    expect(applyStatementProposal(SOURCE, null)).toMatchObject({ state: 'not-requested', statements: [], notice: null });
    expect(applyStatementProposal(SOURCE, null, 'no-key').notice).toContain(modelAbsenceReason('no-key', 'statements'));
  });

  test('the element takes the proposal that stands on its first line', () => {
    const { statements } = applyStatementProposal(SOURCE, recordFor(SOURCE));
    expect(proposalAt(statements, { lineStart: 5, lineEnd: 8 })?.anchors[0].lineStart).toBe(5);
    expect(proposalAt(statements, { lineStart: 9, lineEnd: 11 })?.anchors[0].lineStart).toBe(10);
    expect(proposalAt(statements, null)).toBeNull();
    expect(proposalAt(statements, { lineStart: 1, lineEnd: 2 })).toBeNull();
  });

  test('the whole-program list keeps every sentence of both sides, evidence beneath proposal', () => {
    const { statements } = applyStatementProposal(SOURCE, recordFor(SOURCE));
    const evidence = [
      { id: 'A1', anchors: [{ lineStart: 3, lineEnd: 4 }] },
      { id: 'A2', anchors: [{ lineStart: 5, lineEnd: 7 }] },
      { id: 'A3', anchors: [{ lineStart: 1, lineEnd: 1 }] },
    ];
    const rows = pairWithEvidence(evidence, statements);
    expect(rows.map((r) => [r.evidence?.id ?? null, r.proposals.map((p) => p.anchors[0].lineStart)])).toEqual([
      ['A3', []],
      ['A1', [3]],
      ['A2', [5]],
      [null, [10]],
    ]);
  });
});

test.describe('asking for a proposal', () => {
  const context = statementProposalContextOf(SOURCE);
  const record = recordFor(SOURCE);

  test('no call at all when the account is known to have no key, or the stage is off', async () => {
    let calls = 0;
    const deps = {
      callModel: async () => { calls += 1; return { text: '', receipt: null }; },
      store: async () => ({ ok: true as const, record }),
    };
    expect(await runStatementRequest(context, deps, { known: true, keyAvailable: false, stages: {} }))
      .toEqual({ ok: false, absence: 'no-key', message: modelAbsenceReason('no-key', 'statements') });
    expect(await runStatementRequest(context, deps, { known: true, keyAvailable: true, stages: { statements: false } }))
      .toMatchObject({ ok: false, absence: 'stage-off' });
    expect(calls).toBe(0);
  });

  test('the answer is posted as it came back, with the digest of this source', async () => {
    let posted: unknown = null;
    const outcome = await runStatementRequest(context, {
      callModel: async (prompt) => {
        expect(prompt).toContain(`Source ${STATEMENT_SOURCE_NAME}`);
        return { text: ` ${ANSWER}\n`, receipt: { r: 1 } };
      },
      store: async (submission) => { posted = submission; return { ok: true, record }; },
    });
    expect(outcome).toEqual({ ok: true, record });
    expect(posted).toEqual({ digest: context.digest, text: ` ${ANSWER}\n`, receipt: { r: 1 } });
  });

  test('a refusal from the proxy or the route is an outcome, never a throw', async () => {
    const refused = await runStatementRequest(context, {
      callModel: async () => { throw new Error('Business sentences is switched off (model-stage-disabled).'); },
      store: async () => ({ ok: true, record }),
    });
    expect(refused).toMatchObject({ ok: false, absence: 'stage-off' });
    const stored = await runStatementRequest(context, {
      callModel: async () => ({ text: ANSWER, receipt: null }),
      store: async () => ({ ok: false, status: 422, error: 'no receipt' }),
    });
    expect(stored).toEqual({ ok: false, absence: 'failed', message: 'no receipt' });
  });
});

test.describe('outside every signature', () => {
  test('no signed path imports the proposal, the prompt or the contradiction check', () => {
    const signed = [
      'app/api/runs/create/route.ts',
      'app/api/audit-pack/create/route.ts',
      'app/api/export/sign/route.ts',
      'lib/audit-pack.ts',
    ];
    for (const rel of signed) {
      const src = read(rel);
      expect(src, `${rel} reaches the business sentences`).not.toMatch(/statement-proposal|statement-contradiction|business-statement-prompt|statement_proposal/);
    }
  });

  test('the route writes one Admin-SDK document under the project and nothing else', () => {
    const src = read('app/api/projects/[projectId]/statement-proposal/route.ts');
    expect(src).toContain("const COLLECTION = 'statement_proposal';");
    // Code, not the header comment, which says where the sentences do not go.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/'runs'|auditMetadata|signature|audit-pack|signRun/i);
    // The model is not called here — `/api/gemini` is the only way out.
    expect(src).not.toMatch(/@google\/genai|GEMINI_API_KEY|generateContent/);
    expect(src).toContain('verifyModelReceipt(');
    expect(src).toContain('validateStatementAnswer(');
  });

  test('firestore.rules has no match for the path, so no client reads or writes it', () => {
    expect(read('firestore.rules')).not.toContain('statement_proposal');
  });

  test('the browser half goes through /api/gemini under its own stage', () => {
    const src = read('lib/statement-proposal-client.ts');
    expect(src).toMatch(/callGeminiWithReceipt\(prompt, PRODUCT_GEMINI_MODEL, true, STATEMENT_STAGE, signal\)/);
    expect(src).not.toMatch(/@google\/genai|GEMINI_API_KEY/);
  });
});

test.describe('QA review of 8f9ea35a000e', () => {
  const KEY = 'test-key-for-the-stage-binding-of-model-receipts';
  const uid = 'u-1';
  const text = '{"statements":[]}';

  test('33a42c475f1a: a receipt is bound to its model stage, and the statements store asks for its own', () => {
    const fromNaming = issueModelReceipt({ uid, text, modelId: 'gemini-3.8-flash', byok: false, stage: 'naming' }, KEY);
    const fromStatements = issueModelReceipt({ uid, text, modelId: 'gemini-3.8-flash', byok: false, stage: 'statements' }, KEY);
    const withoutStage = issueModelReceipt({ uid, text, modelId: 'gemini-3.8-flash', byok: false }, KEY);

    expect(verifyModelReceipt(fromNaming, { uid, text, key: KEY, stage: 'statements' })).toEqual({ ok: false, refusal: 'wrong-stage' });
    expect(verifyModelReceipt(withoutStage, { uid, text, key: KEY, stage: 'statements' })).toEqual({ ok: false, refusal: 'wrong-stage' });
    expect(verifyModelReceipt(fromStatements, { uid, text, key: KEY, stage: 'statements' }).ok).toBe(true);
    // The stage is signed: rewriting it breaks the MAC.
    expect(verifyModelReceipt({ ...fromNaming, stage: 'statements' }, { uid, text, key: KEY, stage: 'statements' }))
      .toEqual({ ok: false, refusal: 'forged' });
  });

  test('33a42c475f1a: callers that do not ask for a stage verify as before — runs/create and naming keep their behaviour', () => {
    const withoutStage = issueModelReceipt({ uid, text, modelId: 'gemini-3.8-flash', byok: false, issuedAt: 1_000 }, KEY);
    expect(Object.keys(withoutStage)).not.toContain('stage');
    expect(verifyModelReceipt(withoutStage, { uid, text, key: KEY, now: 2_000 }).ok).toBe(true);
    const analyze = issueModelReceipt({ uid, text, modelId: 'gemini-3.8-flash', byok: false, stage: 'analyze' }, KEY);
    expect(verifyModelReceipt(analyze, { uid, text, key: KEY }).ok).toBe(true);
  });

  test('33a42c475f1a: the route asks for the statements stage, and the proxy signs the stage it was called under', () => {
    expect(read('app/api/projects/[projectId]/statement-proposal/route.ts')).toMatch(/stage: STATEMENT_STAGE,/);
    expect(read('app/api/projects/[projectId]/process-naming/route.ts'), 'the naming store takes any stage').toMatch(/stage: NAMING_STAGE,/);
    // runs/create asks for none, and says why where it does not.
    const runs = read('app/api/runs/create/route.ts');
    expect(runs.slice(runs.indexOf('verifyModelReceipt(body.modelReceipt'), runs.indexOf('const attested'))).not.toMatch(/stage:/);
    expect(runs).toMatch(/No `stage` asked for, deliberately/);
    expect(read('app/api/gemini/route.ts')).toMatch(/\.\.\.\(stage !== undefined \? \{ stage \} : \{\}\)/);
  });

  test('bf2518569d73: the line for an account with its own key names the hourly limit as well', () => {
    expect(STATEMENT_COST_LINE_BYOK).toMatch(/own Gemini key/);
    expect(STATEMENT_COST_LINE_BYOK).toMatch(/hourly limit on model calls/);
  });
});
