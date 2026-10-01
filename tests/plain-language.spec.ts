import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildProcessSkeleton, type ProcessSkeleton, type SkeletonNode } from '../lib/abap/process-skeleton';
import { FIELD_TERMS, TABLE_TERMS } from '../lib/abap/business-glossary';
import { FIELD_TERMS_EN, TABLE_TERMS_EN } from '../lib/abap/plain-glossary';
import {
  conditionToPhrase,
  conditionToQuestion,
  humaniseField,
  humaniseRoutine,
  outcomeName,
  plainContext,
  plainLabels,
  ruleToSentence,
  stepName,
  PLAIN_LABEL_PROVENANCE,
} from '../lib/abap/plain-language';

/**
 * Plain-language labels for the process map — deterministic, no model.
 *
 * Pure: no browser, no server. The fixtures are the starter examples the
 * product ships; the owner's own examples are pinned word for word, and where
 * this module deliberately says something else the test says so and why.
 */

const EXAMPLES = join(__dirname, '..', 'public', 'starter-examples');

function readExample(name: string): string {
  return readFileSync(join(EXAMPLES, name), 'utf8').replace(/\r\n/g, '\n');
}

const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

function labelled(name: string) {
  const source = readExample(name);
  const skeleton = buildProcessSkeleton(source);
  return { source, skeleton, labels: plainLabels(skeleton, source) };
}

function nodesIn(skeleton: ProcessSkeleton, region: string): SkeletonNode[] {
  return skeleton.nodes.filter((n) => n.region === region);
}

function labelsOf(skeleton: ProcessSkeleton, labels: ReturnType<typeof plainLabels>, region: string, kind?: string) {
  return nodesIn(skeleton, region)
    .filter((n) => !kind || n.kind === kind)
    .map((n) => labels.nodes.get(n.id));
}

test.describe('plain-language wording — the owner\'s examples', () => {
  test('IF s_vkorg[] IS INITIAL reads "Sales organization given?" with No on the TRUE branch', () => {
    const ctx = plainContext(readExample(LEGACY));
    const q = conditionToQuestion('s_vkorg[] IS INITIAL', ctx);
    expect(q.question).toBe('Sales organization given?');
    expect(q.trueBranch).toBe('No');
    expect(q.falseBranch).toBe('Yes');
    const notInitial = conditionToQuestion('s_vkorg[] IS NOT INITIAL', ctx);
    expect(notInitial.question).toBe('Sales organization given?');
    expect(notInitial.trueBranch).toBe('Yes');
  });

  test('a compound on one field names it once', () => {
    // The owner wrote "Limit missing or above maximum?". With the source the
    // constant c_max_items has a literal value, and the spec asks for it then;
    // without the source the constant's name is humanised instead.
    const ctx = plainContext(readExample(LEGACY));
    expect(conditionToQuestion('p_lim IS INITIAL OR p_lim GT c_max_items', ctx).question)
      .toBe('Limit missing or above 999999?');
    expect(conditionToQuestion('p_lim IS INITIAL OR p_lim GT c_max_items').question)
      .toBe('Limit missing or above maximum items?');
  });

  test('comparisons with literals', () => {
    const ctx = plainContext(readExample(PO));
    expect(conditionToQuestion("gs_eban-werks = '1000'", ctx).question).toBe('Plant 1000?');
    expect(conditionToQuestion("gs_eban-waers <> 'EUR'", ctx).question).toBe('Currency not EUR?');
    expect(conditionToPhrase("gs_eban-waers <> 'EUR'", ctx)).toBe('Currency not EUR');
    expect(conditionToQuestion("gs_eban-bednr CP 'EMERG*'", ctx).question)
      .toBe('Requirement tracking number matches EMERG*?');
    expect(conditionToPhrase('p_days LT 0')).toBe('Days negative');
    expect(conditionToPhrase('lv_dev_pct > 5')).toBe('Deviation percent above 5');
    expect(conditionToPhrase('lv_amount GE 100')).toBe('Amount at least 100');
    expect(conditionToPhrase('lv_amount LE 100')).toBe('Amount at most 100');
    expect(conditionToPhrase('<fs_order>-netwr > gs_customer-credit_limit')).toBe('Net value above credit limit');
    expect(conditionToPhrase('gv_commit_counter MOD 50 = 0')).toBe('Commit counter multiple of 50');
  });

  test('flags and selection switches', () => {
    const ctx = plainContext(readExample(LEGACY));
    expect(conditionToPhrase('p_down = abap_true', ctx)).toBe('Download selected');
    expect(conditionToPhrase('p_rfc = abap_true', ctx)).toBe('Remote call selected');
    expect(conditionToPhrase('NOT ( p_rfc = abap_true )', ctx)).toBe('Remote call not selected');
    expect(conditionToQuestion('p_upd = abap_true AND p_bdc = abap_true', ctx).question)
      .toBe('Update and batch input selected?');
    expect(conditionToQuestion('gv_rejected = abap_false').question).toBe('Not rejected?');
    expect(conditionToQuestion('gv_approved = abap_true').question).toBe('Approved?');
    expect(conditionToQuestion("gs_eban-frgkz = 'X'").question).toBe('Release indicator set?');
  });

  test('sy-subrc is read off the statement that set it', () => {
    const source = [
      'FORM x.',
      '  SELECT SINGLE * FROM eban INTO gs_eban WHERE banfn = p_banfn.',
      '  IF sy-subrc <> 0.',
      '  ENDIF.',
      "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
      '  IF sy-subrc <> 0.',
      '  ENDIF.',
      "  CALL FUNCTION 'Z_ANYTHING'.",
      '  IF sy-subrc = 0.',
      '  ENDIF.',
      '  READ TABLE gt_customers INTO gs_customer INDEX 1.',
      '  IF sy-subrc = 0.',
      '  ENDIF.',
      'ENDFORM.',
    ].join('\r\n');
    const ctx = plainContext(source);
    expect(conditionToQuestion('sy-subrc <> 0', ctx, 3).question).toBe('No purchase requisition found?');
    expect(conditionToQuestion('sy-subrc <> 0', ctx, 6).question).toBe('Not authorized?');
    expect(conditionToQuestion('sy-subrc = 0', ctx, 9).question).toBe('Call successful?');
    expect(conditionToQuestion('sy-subrc = 0', ctx, 12).question).toBe('Customer found?');
    // Without a line nothing is known about the setter: neutral words.
    expect(conditionToQuestion('sy-subrc <> 0').question).toBe('Failed?');
  });

  test('error ends: "Stop: no sales organization (E001)"', () => {
    const { skeleton, labels } = labelled(LEGACY);
    expect(labelsOf(skeleton, labels, 'form:VALIDATE_SELECTION', 'end-error'))
      .toEqual(['Stop: no sales organization (E001)', 'Stop: days negative (E001)']);
    expect(labelsOf(skeleton, labels, 'form:VALIDATE_SELECTION', 'gateway')).toEqual([
      'Sales organization given?',
      'Limit missing or above 999999?',
      'Days negative?',
      'File given?',
    ]);
    expect(labelsOf(skeleton, labels, 'form:VALIDATE_SELECTION', 'start')).toEqual(['Start']);
    expect(labelsOf(skeleton, labels, 'form:VALIDATE_SELECTION', 'end')).toEqual(['Done']);
  });

  test('early ends say why: "Rejected: no material"', () => {
    // The owner wrote "Rejected – no material" and "Rejected – not released".
    // The colon matches "Stop:" and "Stopped:". FRGKZ = 'X' is the release
    // indicator being set; "not released" would be a reading the code does
    // not state, so the label says what the condition says.
    const { skeleton, labels } = labelled(PO);
    expect(labelsOf(skeleton, labels, 'form:CHECK_REQUISITION')).toEqual([
      'Start',
      'Done',
      'Material given?',
      'Reject',
      'Rejected: no material',
      'Release indicator set?',
      'Reject',
      'Rejected: release indicator set',
      'Plant 1000?',
    ]);
    expect(labelsOf(skeleton, labels, 'form:READ_REQUISITION')).toEqual([
      'Start',
      'Done',
      'Read purchase requisition',
      'No purchase requisition found',
      'Stop: no purchase requisition found (E001)',
      'Currency not EUR?',
      'Convert to EUR',
      'MRP controller EMG or tracking number EMERG*?',
    ]);
    expect(labelsOf(skeleton, labels, 'form:READ_VENDOR', 'end')).toEqual(['Done', 'Rejected: no supplier found']);
    expect(labelsOf(skeleton, labels, 'form:REQUEST_APPROVAL', 'end')).toEqual(['Done', 'Stopped: test run selected']);
  });

  test('the branches of a decision are labelled', () => {
    const { skeleton, labels } = labelled(LEGACY);
    const gateway = skeleton.nodes.find((n) => n.kind === 'gateway' && n.label === 'IF s_vkorg[] IS INITIAL');
    expect(gateway).toBeTruthy();
    const out = skeleton.edges.filter((e) => e.from === gateway?.id);
    expect(out.map((e) => [e.kind, labels.flow(e)])).toEqual([['conditional', 'No'], ['default', 'Yes']]);
    expect(labels.technical(gateway?.id ?? '')).toBe('IF s_vkorg[] IS INITIAL');

    // An ELSEIF chain on one field: the question names the field, each arm its value.
    const risk = skeleton.nodes.find((n) => n.kind === 'gateway' && n.label === "IF gs_customer-risk_class = 'BLOCKED'");
    expect(labels.nodes.get(risk?.id ?? '')).toBe('Risk class?');
    expect(skeleton.edges.filter((e) => e.from === risk?.id).map((e) => labels.flow(e)))
      .toEqual(['BLOCKED', 'EXPORT', 'Otherwise']);

    // Several fields: the neutral question, each arm its own phrase.
    const customer = skeleton.nodes.find((n) => n.kind === 'gateway' && n.label === "IF cs_customer-sperr = 'X'");
    expect(labels.nodes.get(customer?.id ?? '')).toBe('Which case applies?');
    expect(skeleton.edges.filter((e) => e.from === customer?.id).map((e) => labels.flow(e)))
      .toEqual(['Central block set', 'Country not DE, AT or CH', 'Account group ZINT', 'Otherwise']);

    // CASE: the subject, the values unquoted, a SCREAMING_SNAKE value as words.
    const action = skeleton.nodes.find((n) => n.kind === 'gateway' && n.detail?.branchKind === 'case');
    expect(labels.nodes.get(action?.id ?? '')).toBe('Action?');
    expect(skeleton.edges.filter((e) => e.from === action?.id).map((e) => labels.flow(e)))
      .toEqual(['Set delivery block', 'Create review task', 'Other']);

    // A folded run switch on the way into a step, and model.ts' synthetic bypass.
    const guarded = skeleton.edges.find((e) => e.condition === 'p_rfc = abap_true');
    expect(guarded && labels.flow(guarded)).toBe('Remote call selected');
    expect(labels.flow({
      from: guarded?.from ?? '',
      to: 'not-in-the-skeleton',
      kind: 'conditional',
      condition: 'NOT ( p_rfc = abap_true )',
    })).toBe('Remote call not selected');
    expect(labels.flow({ from: guarded?.from ?? '', to: 'x', kind: 'sequence', condition: '' })).toBe('');
  });

  test('CHECK: the kept way is Yes, the NOT way is No', () => {
    const { skeleton, labels } = labelled(PO);
    const check = skeleton.nodes.find((n) => n.label === 'CHECK gv_on_hold = abap_false');
    expect(labels.nodes.get(check?.id ?? '')).toBe('Not on hold?');
    const flows = skeleton.edges.filter((e) => e.from === check?.id)
      .map((e) => [e.condition, labels.flow(e)]);
    expect(flows).toEqual([
      ['NOT ( gv_on_hold = abap_false )', 'No'],
      ['gv_on_hold = abap_false', 'Yes'],
    ]);
  });

  test('steps', () => {
    expect(humaniseRoutine('READ_REQUISITION')).toBe('Read requisition');
    expect(humaniseRoutine('CHECK_AUTHORITY')).toBe('Check authority');
    expect(humaniseRoutine('DERIVE_CUSTOMER_RISK')).toBe('Derive customer risk');
    expect(humaniseRoutine('Z_CREDIT_EXPOSURE_READ')).toBe('Credit exposure read');

    const { skeleton, labels } = labelled(LEGACY);
    const byTechnical = (text: string) => labels.nodes.get(
      skeleton.nodes.find((n) => labels.technical(n.id) === text)?.id ?? '');
    expect(byTechnical('SELECT VBAK')).toBe('Read sales orders');
    expect(byTechnical('GUID_CREATE')).toBe('Create ID');
    expect(byTechnical('GUI_DOWNLOAD')).toBe('Download file');
    expect(byTechnical('SO_NEW_DOCUMENT_SEND_API1')).toBe('Send mail');
    expect(byTechnical('REUSE_ALV_GRID_DISPLAY')).toBe('Show result list');
    expect(byTechnical('VA02')).toBe('Change sales order');
    expect(byTechnical('LOOP AT gt_orders')).toBe('For each order');
    expect(byTechnical('INSERT ZSD_ORD_RISK')).toBe('Create entry in ZSD_ORD_RISK');
    expect(byTechnical('INITIALIZATION')).toBe('Program starts');

    const node = (kind: SkeletonNode['kind'], label: string, detail?: SkeletonNode['detail']): SkeletonNode => ({
      id: 'n', kind, label, anchor: null, region: 'r', container: null, detail,
    });
    expect(stepName(node('read', 'EBAN', { tables: ['EBAN'], single: false }))).toBe('Read purchase requisitions');
    expect(stepName(node('read', 'ZMM_X', { tables: ['ZMM_X'], single: true }))).toBe('Read ZMM_X');
    expect(stepName(node('write', 'GT_ITEMS', { operation: 'MODIFY' }))).toBe('Update items list');
    expect(stepName(node('service-task', 'BAPI_PO_CREATE1'))).toBe('Create purchase order');
    expect(stepName(node('service-task', 'LV_FM', { dynamic: true }))).toBe('Call function (dynamic)');
    expect(stepName(node('transaction', 'ZXY1'))).toBe('Run transaction ZXY1');
    expect(stepName(node('output', 'WRITE', { target: 'list' }))).toBe('Write list');
    expect(stepName(node('user-task', 'MESSAGE', { message: 'I' }))).toBe('Show message');
    expect(stepName(node('call-activity', 'ZREPORT'))).toBe('Run program ZREPORT');
    expect(stepName(node('parallel-gateway', 'FORK'))).toBe('');
    expect(stepName(node('start', 'AT LINE-SELECTION', { origin: 'event' }))).toBe('Line selected');
    expect(stepName(node('error-boundary', 'CX_SY_ZERODIVIDE', { attachedTo: '' }))).toBe('Error caught');
    expect(outcomeName(node('end-error', 'E001'), null)).toBe('Error E001');
    expect(outcomeName(node('end', 'RETURN', { early: true }), null)).toBe('Ends early');
  });

  test('loops drawn as a cycle ask for the next item', () => {
    const source = [
      'REPORT zloop.',
      'DATA: gt_orders TYPE STANDARD TABLE OF vbak,',
      '      gs_order TYPE vbak,',
      '      lv_count TYPE i.',
      'START-OF-SELECTION.',
      '  SELECT * FROM vbak INTO TABLE gt_orders UP TO 10 ROWS.',
      '  LOOP AT gt_orders INTO gs_order.',
      '    IF gs_order-netwr > 1000.',
      '      EXIT.',
      '    ENDIF.',
      "    UPDATE vbak SET lifsk = 'Z1' WHERE vbeln = gs_order-vbeln.",
      '  ENDLOOP.',
      '  WHILE lv_count < 3.',
      '    lv_count = lv_count + 1.',
      "    CALL FUNCTION 'Z_DO_SOMETHING'.",
      '  ENDWHILE.',
    ].join('\n');
    const skeleton = buildProcessSkeleton(source);
    const labels = plainLabels(skeleton, source);
    const loops = skeleton.nodes.filter((n) => n.kind === 'loop');
    expect(loops.map((n) => labels.nodes.get(n.id))).toEqual(['More orders?', 'Count below 3?']);
    for (const loop of loops) {
      expect(skeleton.edges.filter((e) => e.from === loop.id).map((e) => labels.flow(e))).toEqual(['Next', 'Done']);
    }
  });

  test('rules in one sentence', () => {
    expect(ruleToSentence({ constant: { name: 'c_doc_type', value: "'NB'" } })).toBe('Only document type NB is processed');
    expect(ruleToSentence({ condition: "gs_eban-waers <> 'EUR'" })).toBe('Currency other than EUR');
    expect(ruleToSentence({ field: 'gs_eban-werks' })).toBe('Plant');
  });

  test('identifiers', () => {
    const legacy = plainContext(readExample(LEGACY));
    const po = plainContext(readExample(PO));
    expect(humaniseField('gs_eban-werks')).toBe('Plant');
    expect(humaniseField('s_vkorg', legacy)).toBe('Sales organization');
    expect(humaniseField('p_days', legacy)).toBe('Days');
    expect(humaniseField('p_lim', legacy)).toBe('Limit');
    expect(humaniseField('c_max_items', legacy)).toBe('999999');
    expect(humaniseField('c_max_items')).toBe('Maximum items');
    expect(humaniseField('<fs_order>-netwr')).toBe('Net value');
    expect(humaniseField('gs_customer-credit_limit')).toBe('Credit limit');
    expect(humaniseField('gs_eban-dispo', po)).toBe('MRP controller');
    expect(humaniseField('gs_eban-zzurg', po)).toBe('ZZURG of purchase requisition');
    expect(humaniseField('p_banfn', po)).toBe('Purchase requisition number');
  });

  test('the English glossary covers every key of the German one', () => {
    expect(Object.keys(FIELD_TERMS).filter((k) => !FIELD_TERMS_EN[k])).toEqual([]);
    expect(Object.keys(TABLE_TERMS).filter((k) => !TABLE_TERMS_EN[k])).toEqual([]);
    expect(PLAIN_LABEL_PROVENANCE).toBe('reconstructed');
  });

  test('total: odd input never throws', () => {
    expect(() => conditionToQuestion('')).not.toThrow();
    expect(conditionToQuestion('IF ( ( (').question).toBe('Condition met?');
    expect(conditionToPhrase(undefined as unknown as string)).toBe('Condition met');
    expect(() => plainContext(undefined as unknown as string)).not.toThrow();
    expect(humaniseField('')).toBe('');
    expect(() => plainLabels({ nodes: [], edges: [] } as unknown as ProcessSkeleton)).not.toThrow();
  });
});

test.describe('plain-language wording — every starter example', () => {
  const files = readdirSync(EXAMPLES).filter((f) => /\.(abap|txt)$/i.test(f)).sort();

  test('there are eight fixtures', () => {
    expect(files).toHaveLength(8);
  });

  for (const file of files) {
    test(`${file}: every node and every branch is labelled in plain words`, () => {
      const { source, skeleton, labels } = labelled(file);
      const routineOf = new Map(skeleton.regions.map((r) => [r.key, r.label.toUpperCase()]));
      const humanisedRoutine = new Map(skeleton.regions.map((r) => [r.key, humaniseRoutine(r.label)]));

      for (const node of skeleton.nodes) {
        const label = labels.nodes.get(node.id);
        expect(label, `${node.id} ${node.kind} ${node.label}`).toBeDefined();
        if (node.kind === 'parallel-gateway') {
          expect(label).toBe('');
          continue;
        }
        const text = label ?? '';
        expect(text.length, `${node.id} ${node.label}`).toBeGreaterThan(0);
        expect(text.length, text).toBeLessThanOrEqual(48);
        expect(text, node.label).not.toMatch(/^(IF|CHECK|SELECT|CASE) /);
        for (const forbidden of ['sy-subrc', 'abap_true', 'abap_false', 'gs_', 'lv_', 'gv_', '[]']) {
          expect(text, `${node.label} → ${text}`).not.toContain(forbidden);
        }
        if (node.kind === 'start' || node.kind === 'end') {
          const routine = routineOf.get(node.region) ?? '';
          expect(text.toUpperCase()).not.toBe(routine);
          expect(text).not.toBe(humanisedRoutine.get(node.region));
        }
      }

      const decisions = new Set(skeleton.nodes
        .filter((n) => n.kind === 'gateway' || (n.kind === 'loop' && n.detail?.multiInstance !== true))
        .map((n) => n.id));
      for (const edge of skeleton.edges) {
        const flow = labels.flow(edge);
        expect(flow.length).toBeLessThanOrEqual(48);
        if (decisions.has(edge.from) && edge.kind !== 'boundary') {
          expect(flow, `${edge.from} → ${edge.to} ${edge.condition}`).not.toBe('');
          for (const forbidden of ['sy-subrc', 'abap_true', 'gs_', 'lv_', '[]']) {
            expect(flow).not.toContain(forbidden);
          }
        }
        if (edge.kind === 'sequence' && !edge.condition) expect(flow).toBe('');
      }

      // Deterministic: a second run gives the same words.
      const again = plainLabels(buildProcessSkeleton(source), source);
      expect([...again.nodes.entries()]).toEqual([...labels.nodes.entries()]);
      expect(skeleton.edges.map((e) => again.flow(e))).toEqual(skeleton.edges.map((e) => labels.flow(e)));
    });
  }
});
