import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LANE_NAME_MAX_LENGTH,
  LANE_STATEMENT,
  MAX_ANSWER_LENGTH,
  MAX_LANES,
  NAME_MAX_LENGTH,
  NAMING_FORMAT_VERSION,
  TECHNICAL_NAMES_KEPT,
  UNANCHORED,
  applyNaming,
  buildNamingPrompt,
  isProcessNamingRecord,
  namingContextOf,
  runNamingRequest,
  validateNamingAnswer,
  type NamingContext,
  type NamingRequestDeps,
  type NamingSubmission,
  type ProcessNamingRecord,
  type ValidatedNaming,
} from '../lib/process-naming';
import {
  MODEL_STAGES,
  NOT_GENERATED,
  NO_KEY_CODE,
  STAGE_DISABLED_CODE,
  isModelStage,
  modelAbsenceReason,
  offeredModelStages,
} from '../lib/model-stages';

/**
 * Business names for the process skeleton — roadmap 2.4, without a server.
 *
 * The model is never called here. Every answer below is written by hand, and
 * most of them are written to be wrong in one specific way: an id the skeleton
 * does not have, a node the model invented, an edge, a lane called "CFO", a
 * name too long by one character, nothing at all, JSON that is not JSON. Each
 * test says what must happen to exactly that piece — dropped, and counted
 * under its own rule — and that nothing else moves.
 *
 * The route that stores a naming, the receipt check and the stage switch on the
 * server are in `tests/process-naming-route.spec.ts`.
 */

/** Small enough to read, and it has everything: a check, a CASE, a write, a node without an anchor. */
const PROBE = [
  'REPORT z_naming_probe.',
  '* Customer Mueller GmbH asked for this in 2019',
  "DATA lv_secret TYPE c LENGTH 9 VALUE 'TOPSECRET'.",
  'START-OF-SELECTION.',
  '  PERFORM check_access.',
  '  PERFORM decide.',
  '  PERFORM unfinished.',
  'FORM check_access.',
  "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02' ID 'EKGRP' FIELD lv_ekgrp.",
  '  IF sy-subrc <> 0.',
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM decide.',
  '  CASE gs_eban-bsart.',
  "    WHEN 'NB'.",
  "      UPDATE eban SET frgkz = 'X' WHERE banfn = gs_eban-banfn.",
  "    WHEN 'FO'.",
  "      CALL FUNCTION 'Z_NOTIFY_REQUESTER' EXPORTING iv_banfn = gs_eban-banfn.",
  '    WHEN OTHERS.',
  '      MESSAGE e002(zmm).',
  '  ENDCASE.',
  'ENDFORM.',
  // No ENDFORM: the end of this routine has no anchor (2.3, rule 1).
  'FORM unfinished.',
  '  SELECT SINGLE * FROM ekko INTO ls_ekko WHERE ebeln = lv_ebeln.',
  "  UPDATE ekko SET frgke = 'B' WHERE ebeln = lv_ebeln.",
].join('\n');

const context = () => namingContextOf(PROBE);

/** The gateway in CHECK_ACCESS, the CASE in DECIDE, the write under it, the unanchored end. */
function ids(ctx: NamingContext) {
  const find = (kind: string, label: string) => {
    const node = ctx.skeleton.nodes.find((n) => n.kind === kind && n.label === label);
    if (!node) throw new Error(`the probe no longer has ${kind} ${label} — the fixture moved, not the naming`);
    return node.id;
  };
  return {
    denied: find('gateway', 'IF sy-subrc <> 0'),
    docType: find('gateway', 'gs_eban-bsart'),
    release: find('write', 'EBAN'),
    notify: find('service-task', 'Z_NOTIFY_REQUESTER'),
    unfinishedEnd: find('end', 'UNFINISHED'),
  };
}

const answer = (value: unknown) => JSON.stringify(value);

function expectNothingAccepted(result: ValidatedNaming) {
  expect(result.names).toEqual([]);
  expect(result.lanes).toEqual([]);
}

/** A record as the route would store it, for the context given. */
function recordFor(ctx: NamingContext, validated: ValidatedNaming, digest = ctx.digest): ProcessNamingRecord {
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest,
    ...validated,
    origin: {
      source: 'model',
      receipt: 'verified',
      provider: 'google-gemini',
      modelId: 'gemini-3-flash-preview',
      byok: false,
      issuedAt: Date.UTC(2026, 8, 18),
      textSha256: 'a'.repeat(64),
    },
    namedAt: '2026-09-18T09:00:00.000Z',
  };
}

/* ================================================================== *
 * The stage
 * ================================================================== */

test.describe('naming is a model stage of its own, offered only with the workspace preview', () => {
  test('the server knows the stage, and the settings screen offers it only where the map exists', () => {
    expect(isModelStage('naming')).toBe(true);
    expect(MODEL_STAGES).toContain('naming');
    expect(offeredModelStages(true)).toContain('naming');
    // Everyone else sees the five switches they had before 2.4.
    expect(offeredModelStages(false)).toEqual(['analyze', 'design', 'transformation', 'documentation', 'testing']);
  });
});

/* ================================================================== *
 * What the model is shown
 * ================================================================== */

test.describe('the prompt carries ids, kinds, technical names and conditions — nothing else of the source', () => {
  test('every node of the shipped purchase-requisition example is in it, with its id, kind and label', () => {
    const source = readFileSync(join(process.cwd(), 'public/starter-examples/Z_MM_PO_APPROVAL.abap'), 'utf8');
    const ctx = namingContextOf(source);
    const prompt = buildNamingPrompt(ctx);
    // 110 since roadmap 2.15: three `IF sy-subrc` of this program stood behind a
    // call that already carried a boundary event, and each pair is now one
    // element. The prompt still shows every node the skeleton has.
    expect(ctx.skeleton.nodes.length).toBe(110);
    for (const node of ctx.skeleton.nodes) {
      expect(prompt, `node ${node.id} is missing from the prompt`).toContain(`${node.id} | ${node.kind} | ${node.label}`);
    }
    // The one AUTHORITY-CHECK of the mockup's case, by reference, object and field ids.
    expect(ctx.authorityChecks).toEqual([
      { ref: 'ac-1', object: 'M_BANF_EKG', fields: ['ACTVT', 'EKGRP'], container: 'CHECK_AUTHORITY', lineStart: 108, lineEnd: 110 },
    ]);
    expect(prompt).toContain('ac-1 | M_BANF_EKG | ACTVT, EKGRP | CHECK_AUTHORITY');
  });

  test('comments, declarations and authorization field values do not reach the model', () => {
    const prompt = buildNamingPrompt(context());
    expect(prompt).not.toContain('Mueller');
    expect(prompt).not.toContain('TOPSECRET');
    // `FIELD '02'` and `FIELD lv_ekgrp` are values of the check, not its shape.
    expect(prompt).not.toContain("'02'");
    expect(prompt).not.toContain('lv_ekgrp');
    // Nor the statements that produce no node at all.
    expect(prompt).not.toContain('SELECT SINGLE');
    expect(prompt).not.toContain('frgkz');
  });

  test('a CASE shows its WHEN conditions, which its label alone does not carry — under the routine it sits in', () => {
    const ctx = context();
    const lines = buildNamingPrompt(ctx).split('\n');
    const at = lines.findIndex((l) => l.startsWith(`${ids(ctx).docType} |`));
    expect(lines[at]).toBe(`${ids(ctx).docType} | gateway | gs_eban-bsart | conditions: 'NB' ; 'FO'`);
    // `IF sy-subrc <> 0` cannot be named without knowing which routine asks it.
    const heading = lines.slice(0, at).reverse().find((l) => l.startsWith('Part: '));
    expect(heading).toBe('Part: FORM DECIDE');
  });

  test('an AUTHORITY-CHECK in a routine nothing reaches is not offered as the basis of a lane', () => {
    const ctx = namingContextOf([
      'REPORT z_dead_check.',
      'START-OF-SELECTION.',
      '  PERFORM live.',
      'FORM live.',
      "  AUTHORITY-CHECK OBJECT 'M_BEST_BSA' ID 'ACTVT' FIELD '01'.",
      'ENDFORM.',
      'FORM dead.',
      "  AUTHORITY-CHECK OBJECT 'S_DEVELOP' ID 'ACTVT' FIELD '02'.",
      'ENDFORM.',
    ].join('\n'));
    expect(ctx.authorityChecks.map((c) => c.object)).toEqual(['M_BEST_BSA']);
    expect(buildNamingPrompt(ctx)).not.toContain('S_DEVELOP');
    const node = ctx.skeleton.nodes[0].id;
    const result = validateNamingAnswer(ctx, answer({ lanes: [{ name: 'Developer', authorityCheck: 'ac-2', nodes: [node] }] }));
    expect(result.discarded.byRule).toEqual({ 'unknown-authority-check': 1 });
  });
});

/* ================================================================== *
 * Malicious answers — dropped and counted, never repaired
 * ================================================================== */

test.describe('an answer that is not a naming is dropped whole and counted once', () => {
  test('broken JSON', () => {
    const result = validateNamingAnswer(context(), '{"names":[{"id":"nd-8-0","name":"Access denied?"}');
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({ total: 1, byRule: { 'malformed-json': 1 } });
  });

  test('empty, whitespace, and not a string at all', () => {
    for (const nothing of ['', '   \n ', undefined, null, 42]) {
      const result = validateNamingAnswer(context(), nothing);
      expectNothingAccepted(result);
      expect(result.discarded, `for ${JSON.stringify(nothing)}`).toEqual({ total: 1, byRule: { 'empty-answer': 1 } });
    }
  });

  test('JSON that is not an object, and an answer too large to read', () => {
    const list = validateNamingAnswer(context(), answer([{ id: ids(context()).denied, name: 'Access denied?' }]));
    expectNothingAccepted(list);
    expect(list.discarded.byRule).toEqual({ 'not-an-object': 1 });

    const huge = answer({ names: [{ id: ids(context()).denied, name: 'x'.repeat(MAX_ANSWER_LENGTH) }] });
    const tooLarge = validateNamingAnswer(context(), huge);
    expectNothingAccepted(tooLarge);
    expect(tooLarge.discarded.byRule).toEqual({ 'too-large': 1 });
  });
});

test.describe('names: only nodes of the skeleton, each once, in the format', () => {
  test('an id the skeleton does not have is dropped; the known one next to it is kept', () => {
    const ctx = context();
    const result = validateNamingAnswer(ctx, answer({
      names: [
        { id: ids(ctx).denied, name: 'Access denied?' },
        { id: 'nd-999-0', name: 'Approve by phone' },
        { id: 'nd-x-7', name: 'Escalate' },
      ],
    }));
    expect(result.names).toEqual([{ id: ids(ctx).denied, technicalName: 'IF sy-subrc <> 0', name: 'Access denied?' }]);
    expect(result.discarded).toEqual({ total: 2, byRule: { 'unknown-node': 2 } });
  });

  test('new nodes and new edges are not read, and every one of them is counted', () => {
    const ctx = context();
    const result = validateNamingAnswer(ctx, answer({
      names: [{ id: ids(ctx).release, name: 'Release the requisition' }],
      nodes: [
        { id: 'nd-900-0', kind: 'user-task', label: 'Manual approval by CFO' },
        { id: 'nd-901-0', kind: 'end', label: 'Approved' },
      ],
      edges: [{ from: ids(ctx).denied, to: 'nd-900-0', condition: 'amount > 10000' }],
      process: 'Purchase approval',
    }));
    expect(result.names.map((n) => n.id)).toEqual([ids(ctx).release]);
    expect(result.discarded).toEqual({ total: 4, byRule: { 'unexpected-field': 4 } });

    // And the map drawn from it has the skeleton's nodes and not one more.
    const view = applyNaming(ctx, recordFor(ctx, result));
    expect(view.nodes.map((n) => n.id)).toEqual(ctx.skeleton.nodes.map((n) => n.id));
    expect(JSON.stringify(view)).not.toContain('nd-900-0');
    expect(JSON.stringify(view)).not.toContain('Manual approval by CFO');
  });

  test('a name that brings its own anchor, or is not a string, is dropped rather than trimmed to fit', () => {
    const ctx = context();
    const result = validateNamingAnswer(ctx, answer({
      names: [
        { id: ids(ctx).denied, name: 'Access denied?', anchor: 'L1-L40' },
        { id: ids(ctx).release, name: 42 },
        'nd-15-0: Release',
      ],
    }));
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({ total: 3, byRule: { 'unexpected-field': 1, 'malformed-entry': 2 } });
  });

  test('a node named twice keeps neither name', () => {
    const ctx = context();
    const result = validateNamingAnswer(ctx, answer({
      names: [
        { id: ids(ctx).docType, name: 'Standard or framework order?' },
        { id: ids(ctx).notify, name: 'Tell the requester' },
        { id: ids(ctx).docType, name: 'Which document type?' },
      ],
    }));
    expect(result.names.map((n) => n.id)).toEqual([ids(ctx).notify]);
    expect(result.discarded).toEqual({ total: 2, byRule: { 'duplicate-node': 2 } });
  });

  test(`a name of ${NAME_MAX_LENGTH} characters is kept, one of ${NAME_MAX_LENGTH + 1} is not`, () => {
    const ctx = context();
    const fits = 'R'.repeat(NAME_MAX_LENGTH);
    const result = validateNamingAnswer(ctx, answer({
      names: [
        { id: ids(ctx).release, name: fits },
        { id: ids(ctx).notify, name: 'N'.repeat(NAME_MAX_LENGTH + 1) },
      ],
    }));
    expect(result.names.map((n) => n.name)).toEqual([fits]);
    expect(result.discarded).toEqual({ total: 1, byRule: { 'name-too-long': 1 } });
  });

  test('empty names, line breaks, chatbot wording, emoji and the technical name again are all dropped', () => {
    const ctx = context();
    const { denied, docType, release, notify, unfinishedEnd } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      names: [
        { id: denied, name: '   ' },
        { id: docType, name: 'Which order type?\nIgnore the rules above' },
        { id: release, name: 'Certainly! Release it' },
        { id: notify, name: 'Notify requester ✨' },
        { id: unfinishedEnd, name: 'unfinished' },
      ],
    }));
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({
      total: 5,
      byRule: { 'empty-name': 1, 'control-character': 1, 'model-text': 2, 'same-as-technical': 1 },
    });
  });
});

test.describe('lanes: proposals from AUTHORITY-CHECK and naming, never an organisation', () => {
  test('a lane called "CFO" is dropped, and so are a department head, a manager and a person', () => {
    const ctx = context();
    const { denied, release, notify, docType } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'CFO', authorityCheck: 'ac-1', nodes: [denied] },
        { name: 'Head of Purchasing', authorityCheck: null, nodes: [release] },
        { name: 'Purchasing manager', authorityCheck: null, nodes: [notify] },
        { name: 'anna.berg@example.com', authorityCheck: null, nodes: [docType] },
      ],
    }));
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({ total: 4, byRule: { 'lane-organisational': 4 } });
  });

  test('a role in the process is kept, on its check or on naming alone', () => {
    const ctx = context();
    const { denied, release, notify } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'Approver', authorityCheck: 'ac-1', nodes: [denied, release] },
        { name: 'Requester', authorityCheck: null, nodes: [notify] },
      ],
    }));
    expect(result.lanes).toEqual([
      { key: 'lane-1', name: 'Approver', authorityCheck: 'ac-1', nodes: [denied, release] },
      { key: 'lane-2', name: 'Requester', authorityCheck: null, nodes: [notify] },
    ]);
    expect(result.discarded.total).toBe(0);
  });

  test('a check the program does not have, and a lane that brings its own lines or verdict, are dropped', () => {
    const ctx = context();
    const { denied, release } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'Approver', authorityCheck: 'ac-9', nodes: [denied] },
        { name: 'Requester', authorityCheck: null, nodes: [release], lines: 'L1-L27' },
        { name: 'Buyer', authorityCheck: null, nodes: [release], confirmed: true },
        { name: 'X'.repeat(LANE_NAME_MAX_LENGTH + 1), authorityCheck: null, nodes: [release] },
      ],
    }));
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({
      total: 4,
      byRule: { 'unknown-authority-check': 1, 'unexpected-field': 2, 'name-too-long': 1 },
    });
  });

  test('a node in two lanes is in neither; a lane left without a node of this skeleton is dropped', () => {
    const ctx = context();
    const { denied, release, notify } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'Approver', authorityCheck: 'ac-1', nodes: [denied, release] },
        { name: 'Requester', authorityCheck: null, nodes: [release, notify] },
        { name: 'Auditor', authorityCheck: null, nodes: ['nd-404-0'] },
      ],
    }));
    expect(result.lanes).toEqual([
      { key: 'lane-1', name: 'Approver', authorityCheck: 'ac-1', nodes: [denied] },
      { key: 'lane-2', name: 'Requester', authorityCheck: null, nodes: [notify] },
    ]);
    expect(result.discarded).toEqual({
      total: 4,
      byRule: { 'node-in-two-lanes': 2, 'unknown-node': 1, 'empty-lane': 1 },
    });
  });

  test('two lanes of one name, or on one check, keep neither', () => {
    const ctx = context();
    const { denied, release, notify, docType } = ids(ctx);
    const result = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'Approver', authorityCheck: null, nodes: [denied] },
        { name: 'approver', authorityCheck: null, nodes: [release] },
        { name: 'Buyer', authorityCheck: 'ac-1', nodes: [notify] },
        { name: 'Requester', authorityCheck: 'ac-1', nodes: [docType] },
      ],
    }));
    expectNothingAccepted(result);
    expect(result.discarded).toEqual({ total: 4, byRule: { 'duplicate-lane': 2, 'authority-check-twice': 2 } });
  });

  test(`more than ${MAX_LANES} lanes is an organisation chart — every lane goes, not the tail`, () => {
    const ctx = context();
    const node = ids(ctx).release;
    const lanes = Array.from({ length: MAX_LANES + 1 }, (_, i) => ({ name: `Role ${i + 1}`, authorityCheck: null, nodes: [node] }));
    const result = validateNamingAnswer(ctx, answer({ names: [{ id: node, name: 'Release the requisition' }], lanes }));
    expect(result.lanes).toEqual([]);
    expect(result.names.map((n) => n.id), 'the names are a separate claim and stay').toEqual([node]);
    expect(result.discarded).toEqual({ total: MAX_LANES + 1, byRule: { 'too-many-lanes': MAX_LANES + 1 } });
  });
});

/* ================================================================== *
 * Applying a naming
 * ================================================================== */

test.describe('what the map gets', () => {
  test('without a key: every node with its technical name, no error, and one sentence saying why', () => {
    const ctx = context();
    const view = applyNaming(ctx, null, 'no-key');
    expect(view.state).toBe('not-named');
    expect(view.nodes.length).toBe(ctx.skeleton.nodes.length);
    for (const [i, node] of view.nodes.entries()) {
      expect(node.technicalName).toBe(ctx.skeleton.nodes[i].label);
      expect(node.businessName).toBeNull();
      expect(node.nameProvenance).toBeNull();
      expect(node.anchor).toEqual(ctx.skeleton.nodes[i].anchor);
    }
    expect(view.lanes).toEqual([]);
    expect(view.notice).toBe(`${NOT_GENERATED}. ${modelAbsenceReason('no-key', 'naming')} ${TECHNICAL_NAMES_KEPT}`);
    expect(view.counts.discarded).toBeNull();
  });

  test('with the stage switched off, the sentence names the switch rather than the key', () => {
    const view = applyNaming(context(), null, 'stage-off');
    expect(view.state).toBe('not-named');
    expect(view.notice).toContain('switched off for business names');
    expect(view.notice).not.toContain('No Gemini key');
  });

  test('the business name stands beside the technical name, the anchor does not move, and the chip is always Model proposal', () => {
    const ctx = context();
    const { denied, release } = ids(ctx);
    const validated = validateNamingAnswer(ctx, answer({
      names: [
        { id: denied, name: 'Access denied?' },
        { id: release, name: 'Release the requisition' },
      ],
    }));
    const view = applyNaming(ctx, recordFor(ctx, validated));
    expect(view.state).toBe('named');
    expect(view.notice).toBeNull();

    const gateway = view.nodes.find((n) => n.id === denied)!;
    expect(gateway.technicalName).toBe('IF sy-subrc <> 0');
    expect(gateway.businessName).toBe('Access denied?');
    expect(gateway.anchor).toEqual(ctx.skeleton.nodes.find((n) => n.id === denied)!.anchor);
    expect(view.counts.named).toBe(2);

    const provenances = new Set([
      ...view.nodes.map((n) => n.nameProvenance).filter(Boolean),
      ...view.lanes.map((l) => l.provenance),
    ]);
    expect([...provenances]).toEqual(['proposed']);
  });

  test('a node without an anchor is Unanchored, however well it is named', () => {
    const ctx = context();
    const { unfinishedEnd } = ids(ctx);
    const validated = validateNamingAnswer(ctx, answer({ names: [{ id: unfinishedEnd, name: 'Purchase order blocked' }] }));
    const node = applyNaming(ctx, recordFor(ctx, validated)).nodes.find((n) => n.id === unfinishedEnd)!;
    expect(node.businessName).toBe('Purchase order blocked');
    expect(node.anchor).toBeNull();
    expect(node.evidence).toBe('unanchored');
    expect(node.evidenceLabel).toBe(UNANCHORED);
    expect(node.unanchoredReason).toMatch(/not closed by ENDFORM/);
  });

  test('a lane on AUTHORITY-CHECK carries the check\'s lines; a lane from naming has none; both carry the sentence', () => {
    const ctx = context();
    const { denied, notify } = ids(ctx);
    const validated = validateNamingAnswer(ctx, answer({
      lanes: [
        { name: 'Approver', authorityCheck: 'ac-1', nodes: [denied] },
        { name: 'Requester', authorityCheck: null, nodes: [notify] },
      ],
    }));
    const [approver, requester] = applyNaming(ctx, recordFor(ctx, validated)).lanes;
    expect(approver).toMatchObject({
      basis: 'authority-check', authorityObject: 'M_BANF_EKG', anchor: { lineStart: 9, lineEnd: 9 },
      evidence: 'anchored', evidenceLabel: null, statement: LANE_STATEMENT,
    });
    expect(requester).toMatchObject({
      basis: 'naming', authorityObject: null, anchor: null,
      evidence: 'unanchored', evidenceLabel: UNANCHORED, statement: LANE_STATEMENT,
    });
    expect(LANE_STATEMENT).toBe('Reconstructed from AUTHORITY-CHECK and naming, not an organisational statement.');
  });

  test('names made for another reading of the source are not applied, and the map says so', () => {
    const ctx = context();
    const validated = validateNamingAnswer(ctx, answer({ names: [{ id: ids(ctx).denied, name: 'Access denied?' }] }));
    const record = recordFor(ctx, validated);

    // One more statement at the top renumbers every node after it.
    const edited = namingContextOf(PROBE.replace('START-OF-SELECTION.', 'START-OF-SELECTION.\n  CLEAR lv_secret.'));
    expect(edited.digest).not.toBe(ctx.digest);
    const view = applyNaming(edited, record);
    expect(view.state).toBe('stale');
    expect(view.nodes.every((n) => n.businessName === null)).toBe(true);
    expect(view.notice).toContain('earlier version of this source');
  });

  test('only a record whose origin the server verified is taken as a naming', () => {
    const ctx = context();
    const good = recordFor(ctx, validateNamingAnswer(ctx, answer({ names: [{ id: ids(ctx).denied, name: 'Access denied?' }] })));
    expect(isProcessNamingRecord(good)).toBe(true);
    expect(isProcessNamingRecord({ ...good, origin: { ...good.origin, receipt: 'unverified' } })).toBe(false);
    expect(isProcessNamingRecord({ ...good, origin: { ...good.origin, source: 'user' } })).toBe(false);
    expect(isProcessNamingRecord({ ...good, formatVersion: NAMING_FORMAT_VERSION + 1 })).toBe(false);
    expect(isProcessNamingRecord({ ...good, names: [{ id: ids(ctx).denied, name: 'Access denied?' }] })).toBe(false);
  });

  test('a stored name whose node now reads differently is not put on it', () => {
    const ctx = context();
    const record = recordFor(ctx, {
      names: [{ id: ids(ctx).denied, technicalName: 'IF sy-subrc = 0', name: 'Access granted?' }],
      lanes: [],
      discarded: { total: 0, byRule: {} },
    });
    const view = applyNaming(ctx, record);
    expect(view.nodes.find((n) => n.id === ids(ctx).denied)!.businessName).toBeNull();
  });
});

/* ================================================================== *
 * Asking for a naming
 * ================================================================== */

test.describe('the request: prompt, model, route — and every way it can end', () => {
  function deps(overrides: Partial<NamingRequestDeps> = {}) {
    const calls = { model: 0, store: [] as NamingSubmission[] };
    const d: NamingRequestDeps = {
      callModel: async () => {
        calls.model += 1;
        return { text: '{"names":[]}', receipt: { v: 1 } };
      },
      store: async (submission) => {
        calls.store.push(submission);
        return { ok: false, status: 500, error: 'not used' };
      },
      ...overrides,
    };
    return { d, calls };
  }

  test('no key, already known: no model call is made and nothing is stored', async () => {
    const { d, calls } = deps();
    const outcome = await runNamingRequest(context(), d, { known: true, keyAvailable: false, stages: {} });
    expect(outcome).toEqual({ ok: false, absence: 'no-key', message: modelAbsenceReason('no-key', 'naming') });
    expect(calls.model).toBe(0);
    expect(calls.store).toEqual([]);
  });

  test('the proxy refuses a switched-off stage or a missing key: the outcome is that absence, not an error', async () => {
    for (const [code, absence] of [[STAGE_DISABLED_CODE, 'stage-off'], [NO_KEY_CODE, 'no-key']] as const) {
      const { d, calls } = deps({ callModel: async () => { throw new Error(`Refused (${code}).`); } });
      const outcome = await runNamingRequest(context(), d);
      expect(outcome).toMatchObject({ ok: false, absence });
      expect(calls.store, 'a refused call stored something').toEqual([]);
    }
  });

  test('the answer is posted byte for byte with its receipt and the digest of this reading', async () => {
    const ctx = context();
    const text = '{ "names": [ {"id": "nd-8-0", "name": "Access denied?"} ] }\n';
    const receipt = { v: 1, mac: 'f'.repeat(64) };
    let seenPrompt = '';
    const { d, calls } = deps({
      callModel: async (prompt) => { seenPrompt = prompt; return { text, receipt }; },
    });
    const outcome = await runNamingRequest(ctx, d);
    expect(seenPrompt).toBe(buildNamingPrompt(ctx));
    expect(calls.store).toEqual([{ digest: ctx.digest, text, receipt }]);
    expect(outcome).toEqual({ ok: false, absence: 'failed', message: 'not used' });
  });
});
