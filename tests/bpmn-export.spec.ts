import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import {
  buildBpmnExport,
  buildBpmnExportFromSource,
  bpmnFileName,
  CC_NAMESPACE,
} from '../lib/bpmn/export';
import { MAX_NODES } from '../lib/bpmn/model';
import { escapeAttribute, escapeText, ncName } from '../lib/bpmn/xml';

/**
 * The BPMN export — roadmap 2.6.
 *
 * Every file here is read back by a real BPMN parser: `bpmn-moddle`, the one
 * bpmn-js itself uses, and then bpmn-js in a browser, which is what roadmap 2.5
 * will show the file with. A string that merely looks like XML proves nothing —
 * the export this replaces looked like XML too, and a project name with an
 * ampersand in it made it unreadable (CR-21).
 *
 * The numbers are counted **out of the parsed XML**, not copied from the
 * skeleton or from the exporter's own statistics; the statistics are then held
 * against the count, so 2.5 can trust them.
 */

const EXAMPLES = join(process.cwd(), 'public/starter-examples');
const read = (name: string) => readFileSync(join(EXAMPLES, name), 'utf8');
const LEGACY = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PO = 'Z_MM_PO_APPROVAL.abap';

/* ------------------------------------------------------------------ *
 * A typed view of what bpmn-moddle returns. The package ships no types
 * for its entry point, so the few members read here are declared here.
 * ------------------------------------------------------------------ */

interface ModdleElement {
  $type: string;
  id?: string;
  name?: string;
  $instanceOf(type: string): boolean;
  [key: string]: unknown;
}

interface ParseResult {
  rootElement: ModdleElement;
  elementsById: Record<string, ModdleElement>;
  warnings: Array<{ message: string }>;
}

interface Moddle {
  fromXML(xml: string): Promise<ParseResult>;
  toXML(element: ModdleElement, options?: { format?: boolean }): Promise<{ xml: string }>;
}

async function moddle(): Promise<Moddle> {
  const loaded = (await import('bpmn-moddle')) as unknown as { BpmnModdle: new () => Moddle };
  return new loaded.BpmnModdle();
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

function allFlowElements(container: ModdleElement): ModdleElement[] {
  const out: ModdleElement[] = [];
  for (const e of list<ModdleElement>(container.flowElements)) {
    out.push(e);
    if (e.$instanceOf('bpmn:SubProcess')) out.push(...allFlowElements(e));
  }
  return out;
}

function allArtifacts(container: ModdleElement): ModdleElement[] {
  const out = list<ModdleElement>(container.artifacts);
  for (const e of list<ModdleElement>(container.flowElements)) {
    if (e.$instanceOf('bpmn:SubProcess')) out.push(...allArtifacts(e));
  }
  return out;
}

function traceOf(element: ModdleElement): Record<string, string> | undefined {
  const ext = element.extensionElements as { values?: Array<Record<string, string>> } | undefined;
  return ext?.values?.find((v) => v.$type === 'cc:trace');
}

interface Counted {
  flowNodes: number;
  sequenceFlows: number;
  subProcesses: number;
  planes: number;
  dataStores: number;
  pools: number;
  messageFlows: number;
}

function countOf(definitions: ModdleElement): Counted & { process: ModdleElement; elements: ModdleElement[] } {
  const roots = list<ModdleElement>(definitions.rootElements);
  const process = roots.find((r) => r.$type === 'bpmn:Process') as ModdleElement;
  const collaboration = roots.find((r) => r.$type === 'bpmn:Collaboration');
  const elements = allFlowElements(process);
  return {
    process,
    elements,
    flowNodes: elements.filter((e) => e.$instanceOf('bpmn:FlowNode')).length,
    sequenceFlows: elements.filter((e) => e.$type === 'bpmn:SequenceFlow').length,
    subProcesses: elements.filter((e) => e.$type === 'bpmn:SubProcess').length,
    planes: list(definitions.diagrams).length,
    dataStores: roots.filter((r) => r.$type === 'bpmn:DataStore').length,
    pools: list<ModdleElement>(collaboration?.participants).filter((p) => !p.processRef).length,
    messageFlows: list(collaboration?.messageFlows).length,
  };
}

/** Every DI element of every plane, by the id of the element it draws. */
function diIndex(definitions: ModdleElement): Map<string, number> {
  const out = new Map<string, number>();
  for (const diagram of list<ModdleElement>(definitions.diagrams)) {
    const plane = diagram.plane as ModdleElement;
    for (const di of list<ModdleElement>(plane.planeElement)) {
      const id = (di.bpmnElement as ModdleElement | undefined)?.id;
      if (id) out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}

const OPTIONS = (file: string) => ({ processName: file.replace(/\.\w+$/, ''), sourceFileName: file });

/* ================================================================== *
 * The eight programs this product ships
 * ================================================================== */

/** file, flow nodes, sequence flows, sub-processes, planes, data stores, pools, message flows — counted from the XML. */
const SHIPPED: Array<[string, number, number, number, number, number, number, number]> = [
  // 76 flows, not 71: five of them go around a folded run switch (decision 7).
  [LEGACY, 65, 76, 7, 8, 8, 1, 1],
  ['Z_BUSINESS_PARTNER_SYNC.txt', 17, 16, 2, 3, 3, 0, 0],
  ['Z_EMPLOYEE_EXPENSE_VAL.txt', 12, 13, 1, 2, 0, 0, 0],
  ['Z_INVOICE_EXTRACTOR.txt', 12, 11, 1, 2, 2, 0, 0],
  ['Z_MATERIAL_STOCK_CALC.txt', 10, 9, 1, 2, 4, 0, 0],
  [PO, 73, 82, 9, 10, 11, 0, 0],
  ['Z_ORDER_INTEGRITY_CHECK.txt', 0, 0, 0, 1, 0, 0, 0],
  ['Z_SALES_ORDER_CREATOR.txt', 12, 12, 1, 2, 0, 0, 0],
];

test.describe('the eight programs this product ships', () => {
  for (const [file, flowNodes, sequenceFlows, subProcesses, planes, dataStores, pools, messageFlows] of SHIPPED) {
    test(`${file} — ${flowNodes} flow nodes, ${sequenceFlows} flows, ${subProcesses} sub-processes, read without a warning`, async () => {
      const exported = buildBpmnExportFromSource(read(file), OPTIONS(file));
      const parser = await moddle();
      const parsed = await parser.fromXML(exported.xml);
      expect(parsed.warnings.map((w) => w.message)).toEqual([]);
      expect(parsed.rootElement.$type).toBe('bpmn:Definitions');

      const counted = countOf(parsed.rootElement);
      expect({
        flowNodes: counted.flowNodes,
        sequenceFlows: counted.sequenceFlows,
        subProcesses: counted.subProcesses,
        planes: counted.planes,
        dataStores: counted.dataStores,
        pools: counted.pools,
        messageFlows: counted.messageFlows,
      }).toEqual({ flowNodes, sequenceFlows, subProcesses, planes, dataStores, pools, messageFlows });

      // What the exporter says about its file is what the file contains.
      expect(exported.stats).toMatchObject({ flowNodes, sequenceFlows, subProcesses, planes, dataStores, pools, messageFlows });
      expect(exported.stats.anchored + exported.stats.unanchored).toBe(flowNodes);
      expect(Object.keys(exported.elementNode)).toHaveLength(flowNodes);

      // Every flow node and every flow is drawn, and drawn exactly once.
      const di = diIndex(parsed.rootElement);
      for (const e of counted.elements) {
        if (!e.$instanceOf('bpmn:FlowNode') && e.$type !== 'bpmn:SequenceFlow') continue;
        expect(di.get(e.id as string), `${e.$type} ${e.id} has ${di.get(e.id as string) ?? 0} DI elements`).toBe(1);
      }
      // One plane per sub-process, and it is the sub-process's own.
      const subPlanes = list<ModdleElement>(parsed.rootElement.diagrams)
        .map((d) => ((d.plane as ModdleElement).bpmnElement as ModdleElement).$type)
        .filter((t) => t === 'bpmn:SubProcess');
      expect(subPlanes).toHaveLength(subProcesses);
    });

    test(`${file} — survives a round trip and is byte-identical when built twice`, async () => {
      const source = read(file);
      const first = buildBpmnExportFromSource(source, OPTIONS(file)).xml;
      // Same source, same bytes — whichever line endings the checkout gave it.
      expect(buildBpmnExportFromSource(source, OPTIONS(file)).xml).toBe(first);
      expect(buildBpmnExportFromSource(source.replace(/\r\n/g, '\n'), OPTIONS(file)).xml).toBe(first);

      const parser = await moddle();
      const parsed = await parser.fromXML(first);
      const { xml: again } = await parser.toXML(parsed.rootElement, { format: true });
      const reparsed = await parser.fromXML(again);
      expect(reparsed.warnings.map((w) => w.message)).toEqual([]);
      expect(Object.keys(reparsed.elementsById).sort()).toEqual(Object.keys(parsed.elementsById).sort());
      const a = countOf(parsed.rootElement);
      const b = countOf(reparsed.rootElement);
      expect([b.flowNodes, b.sequenceFlows, b.subProcesses, b.planes, b.dataStores])
        .toEqual([a.flowNodes, a.sequenceFlows, a.subProcesses, a.planes, a.dataStores]);
      // The trace namespace is kept by a writer that does not know it.
      expect(again).toContain(`xmlns:cc="${CC_NAMESPACE}"`);
      expect(again).toContain('<cc:reconstruction status="reconstructed"');
    });
  }
});

/* ================================================================== *
 * CR-21 — names that broke the old export
 * ================================================================== */

const CR21_SOURCE = [
  'REPORT zcr21.',
  'PARAMETERS p_text TYPE c LENGTH 40 LOWER CASE.',
  'START-OF-SELECTION.',
  `  IF p_text = 'Größe & "Menge" <Grenze> ''x'''.`,
  "    MESSAGE 'Prüfung fehlgeschlagen' TYPE 'E'.",
  '  ENDIF.',
  '  CASE p_text.',
  "    WHEN 'Ä&Ö'.",
  "      UPDATE zlog SET status = 'X'.",
  '    WHEN OTHERS.',
  "      WRITE / 'nichts'.",
  '  ENDCASE.',
].join('\n');
const CR21_NAME = `Prüfung & "Freigabe" <Q3> 'intern'`;

test.describe('CR-21 — umlauts, ampersands and quotes give valid XML', () => {
  test('a project name and conditions with all of them come back exactly as written', async () => {
    const exported = buildBpmnExportFromSource(CR21_SOURCE, { processName: CR21_NAME, sourceFileName: 'z_prüfung&co.abap' });
    const parsed = await (await moddle()).fromXML(exported.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);

    const { process, elements } = countOf(parsed.rootElement);
    expect(process.name).toBe(CR21_NAME);

    const gateway = elements.find((e) => e.$type === 'bpmn:ExclusiveGateway' && String(e.name).startsWith('IF '));
    expect(gateway?.name).toBe(`IF p_text = 'Größe & "Menge" <Grenze> ''x'''`);

    const conditions = elements
      .filter((e) => e.$type === 'bpmn:SequenceFlow' && e.conditionExpression)
      .map((e) => [e.name, (e.conditionExpression as { body: string }).body]);
    expect(conditions).toEqual([
      [`p_text = 'Größe & "Menge" <Grenze> ''x'''`, `p_text = 'Größe & "Menge" <Grenze> ''x'''`],
      [`'Ä&Ö'`, `'Ä&Ö'`],
    ]);
    expect(traceOf(gateway as ModdleElement)?.file).toBe('z_prüfung&co.abap');
  });

  test('a condition over several lines keeps its line breaks, and a character XML cannot hold is replaced, not fatal', async () => {
    const skeleton = buildProcessSkeleton(CR21_SOURCE);
    const multiline = `p_text = 'a'\n  AND\tp_flag = 'b'\r`;
    const edge = skeleton.edges.find((e) => e.condition.startsWith('p_text ='));
    expect(edge).toBeDefined();
    (edge as { condition: string }).condition = multiline;

    const exported = buildBpmnExport(skeleton, { processName: 'x y', sourceFileName: 'z.abap' });
    const parsed = await (await moddle()).fromXML(exported.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);
    const flow = countOf(parsed.rootElement).elements.find((e) => (e.conditionExpression as { body?: string } | undefined)?.body?.startsWith("p_text = 'a'"));
    const expected = `p_text = 'a'\n  AND\tp_flag = 'b'\r�`;
    expect(flow?.name).toBe(expected);
    expect((flow?.conditionExpression as { body: string }).body).toBe(expected);
    expect(countOf(parsed.rootElement).process.name).toBe('x�y');
  });

  test('the two escapers and the id maker', () => {
    expect(escapeText(`<a & "b">`)).toBe('&lt;a &amp; "b"&gt;');
    expect(escapeAttribute(`Größe & "Menge" <x> 'y'\n\t`)).toBe('Größe &amp; &quot;Menge&quot; &lt;x&gt; &apos;y&apos;&#10;&#9;');
    // A lone surrogate is not a character; a pair is.
    expect(escapeText('a\uD800b😀')).toBe('a�b😀');
    expect(ncName('nd-184-0')).toBe('nd-184-0');
    expect(ncName('/SCWM/ORDIM_O')).toBe('_SCWM_ORDIM_O');
    expect(ncName('1abc')).toBe('_1abc');
    expect(bpmnFileName(CR21_NAME)).toBe('Prufung_Freigabe_Q3_intern.bpmn');
    expect(bpmnFileName('***')).toBe('process.bpmn');
  });
});

/* ================================================================== *
 * Phase 2 acceptance: anchored or visibly not, and never more than reconstructed
 * ================================================================== */

const UNTERMINATED = [
  'REPORT zopen.',
  'START-OF-SELECTION.',
  '  PERFORM run.',
  'FORM run.',
  "  SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = '1'.",
  "  UPDATE zlog SET x = 'X'.",
  '  IF sy-subrc <> 0.',
  '    MESSAGE e001(zz).',
  '  ENDIF.',
  "  CALL FUNCTION 'Z_NOTIFY'.",
].join('\n');

test.describe('every task and gateway carries a line anchor, or visibly says it has none', () => {
  for (const [file] of SHIPPED) {
    test(`${file} — every flow node has a line range in its trace`, async () => {
      const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(file), OPTIONS(file)).xml);
      for (const e of countOf(parsed.rootElement).elements) {
        if (!e.$instanceOf('bpmn:FlowNode')) continue;
        const t = traceOf(e);
        expect(t, `${e.$type} ${e.id} has no trace`).toBeDefined();
        expect(t?.status).toBe('reconstructed');
        expect(t?.file).toBe(file);
        expect(Number(t?.lineStart), `${e.id} lineStart`).toBeGreaterThan(0);
        expect(Number(t?.lineEnd)).toBeGreaterThanOrEqual(Number(t?.lineStart));
      }
    });
  }

  test('an element without a line range carries a note a modeller shows', async () => {
    const exported = buildBpmnExportFromSource(UNTERMINATED, { processName: 'open', sourceFileName: 'zopen.abap' });
    expect(exported.stats.unanchored).toBe(1);
    const parsed = await (await moddle()).fromXML(exported.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);

    const { elements, process } = countOf(parsed.rootElement);
    const bare = elements.filter((e) => e.$instanceOf('bpmn:FlowNode') && traceOf(e)?.anchored === 'false');
    expect(bare.map((e) => e.id)).toEqual(['nd-x-1']);
    expect(traceOf(bare[0])?.lineStart).toBeUndefined();

    const artifacts = allArtifacts(process);
    const link = artifacts.find((a) => a.$type === 'bpmn:Association' && (a.sourceRef as ModdleElement).id === 'nd-x-1');
    const note = link?.targetRef as ModdleElement | undefined;
    expect(note?.$type).toBe('bpmn:TextAnnotation');
    expect(String(note?.text)).toMatch(/^Not anchored: FORM RUN is not closed by ENDFORM/);
    // Drawn, not only present: a note nobody sees is not "visibly" anything.
    const di = diIndex(parsed.rootElement);
    expect(di.get(note?.id as string)).toBe(1);
    expect(di.get(link?.id as string)).toBe(1);
  });
});

test.describe('a syntactically valid model is never presented as an evidenced as-is process', () => {
  test('every status in the file is "reconstructed", and the file says what that means', async () => {
    const exported = buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY));
    const statuses = [...exported.xml.matchAll(/\bstatus="([^"]*)"/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(100);
    expect([...new Set(statuses)]).toEqual(['reconstructed']);

    const parsed = await (await moddle()).fromXML(exported.xml);
    const { process } = countOf(parsed.rootElement);
    const documentation = list<{ text: string }>(process.documentation).map((d) => d.text).join('\n');
    expect(documentation).toContain('Status: reconstructed.');
    expect(documentation).toContain('not confirmed by anyone, and not evidence of how the process runs in production');
    // What was read and not drawn is said, not silently left out.
    expect(documentation).toContain('19 routines and screen modules not reached from any entry point (323 lines)');
    expect(documentation).toContain('6 technical helpers folded into their callers');

    // The same sentence on the diagram, where a reader of the picture sees it.
    const note = allArtifacts(process).find((a) => a.id === 'note-reconstruction');
    expect(String(note?.text)).toContain('Not confirmed by anyone, and not evidence of how the process runs in production.');
    expect(String(note?.text)).toContain('65 of 65 elements carry a line anchor.');
    expect(diIndex(parsed.rootElement).get('note-reconstruction')).toBe(1);

    // No promise about a target tool (roadmap 4.3 has not happened).
    expect(exported.xml).not.toMatch(/signavio/i);
    expect(exported.xml).not.toMatch(/\b(?:confirmed|proven|verified)"/);
  });
});

/* ================================================================== *
 * What the file is made of
 * ================================================================== */

test.describe('the palette, as BPMN', () => {
  test(`${LEGACY} — collapsed sub-processes are real sub-processes on planes of their own`, async () => {
    const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY)).xml);
    const { elements } = countOf(parsed.rootElement);
    const phase = elements.find((e) => e.$type === 'bpmn:SubProcess' && e.name === 'PROCESS_ACTIONS') as ModdleElement;
    expect(phase.id).toBe('nd-160-0');
    const inside = list<ModdleElement>(phase.flowElements).filter((e) => e.$instanceOf('bpmn:FlowNode'));
    expect(inside.map((e) => e.name)).toEqual([
      'PROCESS_ACTIONS', 'LOOP AT gt_orders', '<fs_order>-action', 'IF p_upd = abap_true AND p_bdc = abap_true',
      'CHANGE_SALES_ORDER_BDC', 'CREATE_LEGACY_REVIEW_TASK', 'UPDATE_LEGACY_LOG_TASK',
    ]);
    const plane = list<ModdleElement>(parsed.rootElement.diagrams)
      .map((d) => d.plane as ModdleElement)
      .find((p) => (p.bpmnElement as ModdleElement).id === 'nd-160-0');
    expect(plane).toBeDefined();
    const shape = list<ModdleElement>((list<ModdleElement>(parsed.rootElement.diagrams)[0].plane as ModdleElement).planeElement)
      .find((d) => (d.bpmnElement as ModdleElement).id === 'nd-160-0');
    expect(shape?.isExpanded).toBe(false);

    // A small routine stays the one step it is; a scoring routine stays a rule task.
    const byName = (name: string) => elements.find((e) => e.name === name);
    expect(byName('SEND_SUMMARY_MAIL')?.$type).toBe('bpmn:SendTask');
    expect(byName('DISPLAY_ALV')?.$type).toBe('bpmn:UserTask');
    expect(byName('CALCULATE_RISK_SCORES')?.$type).toBe('bpmn:BusinessRuleTask');
    expect(byName('CHANGE_SALES_ORDER_BDC')?.$type).toBe('bpmn:CallActivity');
  });

  test(`${LEGACY} — conditions stand on the flows, and the default flow has none`, async () => {
    const source = read(LEGACY);
    const xml = buildBpmnExportFromSource(source, OPTIONS(LEGACY)).xml;
    const parsed = await (await moddle()).fromXML(xml);
    const { elements } = countOf(parsed.rootElement);

    // QA24-A10: the file is read whole. The export it replaces asked a model
    // about the first 1.000 characters of the source, so a rule further down
    // could not reach the file at all. This one is at line 439, some 16.000
    // characters in, and it is on a flow of the exported model.
    const deep = 'p_upd = abap_true AND p_bdc = abap_true';
    expect(source.indexOf(deep)).toBeGreaterThan(9000);
    expect(xml).toContain(deep);
    const gateway = elements.find((e) => e.name === '<fs_order>-action') as ModdleElement;
    const outgoing = list<ModdleElement>(gateway.outgoing);
    expect(outgoing.map((f) => (f.conditionExpression as { body?: string } | undefined)?.body ?? null))
      .toEqual(["'SET_DELIVERY_BLOCK'", "'CREATE_REVIEW_TASK'", null]);
    const fallback = gateway.default as ModdleElement;
    expect(fallback.id).toBe(outgoing[2].id);
    expect(fallback.conditionExpression).toBeUndefined();

    // The run switch of §5.8 is a conditional flow, not a gateway.
    const toCredit = elements.find((e) => e.$type === 'bpmn:SequenceFlow'
      && (e.targetRef as ModdleElement).$type === 'bpmn:SubProcess'
      && (e.targetRef as ModdleElement).name === 'REMOTE_CREDIT_CHECK');
    expect((toCredit?.conditionExpression as { body: string }).body).toBe('p_rfc = abap_true');

    // Every gateway's default is one of its own outgoing flows and carries no condition.
    for (const g of elements.filter((e) => e.$type === 'bpmn:ExclusiveGateway' && e.default)) {
      const d = g.default as ModdleElement;
      expect(list<ModdleElement>(g.outgoing).map((f) => f.id)).toContain(d.id);
      expect(d.conditionExpression, `default of ${g.id}`).toBeUndefined();
    }
  });

  /* ---------------------------------------------------------------- *
   * The way past a run switch — `model.ts` decision 7
   * ---------------------------------------------------------------- */

  test(`${LEGACY} — every folded run switch has a flow that goes around it`, async () => {
    const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY)).xml);
    const { elements } = countOf(parsed.rootElement);
    const bypasses = elements.filter((e) => e.$type === 'bpmn:SequenceFlow' && traceOf(e)?.reason === 'guard-bypass');

    // Four routines of the example open with a `CHECK` on a selection-screen
    // switch. `SEND_SUMMARY_MAIL` gets two ways past it, because the step before
    // it is guarded too and a reader coming round that one has to be able to
    // skip this one as well.
    expect(bypasses.map((f) => [
      (f.sourceRef as ModdleElement).id,
      (f.targetRef as ModdleElement).id,
      (f.conditionExpression as { body: string }).body,
      traceOf(f)?.bypasses,
    ])).toEqual([
      ['nd-157-0', 'nd-159-0', 'NOT ( p_rfc = abap_true )', 'nd-158-0'],
      ['nd-161-0', 'nd-163-1', 'p_mail = abap_true', 'nd-162-0'],
      ['nd-162-0', 'nd-163-0', 'NOT ( p_mail = abap_true )', 'nd-163-1'],
      ['nd-161-0', 'nd-163-0', 'NOT ( p_mail = abap_true )', 'nd-163-1'],
      ['nd-164-0', 'nd-167-0', 'NOT ( p_alv = abap_true )', 'nd-166-0'],
    ]);

    // Every one of them starts where the guarded flow starts and ends where the
    // guarded step leads: a way round the step, not a way out of the process.
    for (const flow of bypasses) {
      const around = elements.find((e) => e.id === traceOf(flow)?.bypasses) as ModdleElement;
      const source = (flow.sourceRef as ModdleElement).id;
      expect(list<ModdleElement>(around.incoming).map((f) => (f.sourceRef as ModdleElement).id)).toContain(source);
      expect(list<ModdleElement>(around.outgoing).map((f) => (f.targetRef as ModdleElement).id))
        .toContain((flow.targetRef as ModdleElement).id);
      expect(flow.name).toBe((flow.conditionExpression as { body: string }).body);
    }
  });

  test(`${LEGACY} — with a switch off the file still leads to the end, and skips exactly one step`, async () => {
    const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY)).xml);
    const roots = list<ModdleElement>(parsed.rootElement.rootElements);
    const process = roots.find((r) => r.$type === 'bpmn:Process') as ModdleElement;
    const elements = list<ModdleElement>(process.flowElements);
    const nodes = elements.filter((e) => e.$instanceOf('bpmn:FlowNode'));
    const flows = elements.filter((e) => e.$type === 'bpmn:SequenceFlow');

    /**
     * What a reader that has only the file reaches, with these switches off.
     *
     * The rule is the one any modeller applies: a flow whose condition asserts a
     * switch that is off cannot be taken, and the negation of such a condition
     * is the way the run takes instead. Nothing here knows about `CHECK`,
     * guards, or this product's own navigation — the point of the test is that
     * the **file** answers, not that our reader is clever.
     */
    const reached = (off: string[]): Set<string> => {
      const asserts = (body: string, name: string) =>
        new RegExp(`(^|[^\\w/])${name}\\s*=\\s*abap_true`, 'i').test(body);
      const onward = new Map<string, ModdleElement[]>();
      for (const flow of flows) {
        const body = (flow.conditionExpression as { body?: string } | undefined)?.body ?? '';
        const negated = /^NOT\s*\(/i.test(body.trim());
        if (body && !off.every((name) => !asserts(body, name) || negated)) continue;
        const from = (flow.sourceRef as ModdleElement).id as string;
        onward.set(from, [...(onward.get(from) ?? []), flow]);
      }
      const seen = new Set<string>(nodes.filter((e) => e.$type === 'bpmn:StartEvent').map((e) => e.id as string));
      const stack = [...seen];
      while (stack.length) {
        const id = stack.pop() as string;
        for (const flow of onward.get(id) ?? []) {
          const to = (flow.targetRef as ModdleElement).id as string;
          if (seen.has(to)) continue;
          seen.add(to);
          stack.push(to);
        }
      }
      return seen;
    };

    const notReached = (off: string[]) =>
      nodes.filter((n) => !reached(off).has(n.id as string)).map((n) => n.name).sort();

    expect(nodes).toHaveLength(23);
    expect(notReached([]), 'with every switch as the source sets it, the file leads everywhere').toEqual([]);
    // The finding this test exists for: `p_rfc` off used to leave everything
    // after `REMOTE_CREDIT_CHECK` with no way in at all — 31 of the 65 elements
    // of this example, where the program runs 59 of them. One step is skipped.
    expect(notReached(['p_rfc'])).toEqual(['REMOTE_CREDIT_CHECK']);
    expect(notReached(['p_down'])).toEqual(['DOWNLOAD_RESULT_FILE']);
    expect(notReached(['p_alv'])).toEqual(['DISPLAY_ALV']);
    // Two guarded steps in a row, in all four positions of their switches.
    expect(notReached(['p_mail'])).toEqual(['SEND_SUMMARY_MAIL']);
    expect(notReached(['p_down', 'p_mail'])).toEqual(['DOWNLOAD_RESULT_FILE', 'SEND_SUMMARY_MAIL']);
  });

  test('a guarded step at the end of a loop body is skipped back to the loop, not into a dead end', async () => {
    // None of the eight programs has this shape, and it is the one where the
    // way past the switch is a loop-back rather than a forward flow.
    const source = [
      'REPORT zloopguard.',
      "PARAMETERS p_log AS CHECKBOX DEFAULT 'X'.",
      'DATA gt TYPE TABLE OF vbak.',
      'START-OF-SELECTION.',
      '  SELECT * FROM vbak INTO TABLE gt.',
      '  LOOP AT gt INTO vbak.',
      '    PERFORM enrich.',
      '    PERFORM write_log.',
      '  ENDLOOP.',
      '',
      'FORM enrich.',
      '  UPDATE vbak SET erdat = sy-datum.',
      'ENDFORM.',
      '',
      'FORM write_log.',
      '  CHECK p_log = abap_true.',
      '  INSERT zlog FROM vbak.',
      '  UPDATE zlog2 SET a = 1.',
      'ENDFORM.',
    ].join('\n');
    const exported = buildBpmnExportFromSource(source, { processName: 'Loop guard', sourceFileName: 'z.abap' });
    const parsed = await (await moddle()).fromXML(exported.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);
    const { elements } = countOf(parsed.rootElement);

    const guarded = elements.find((e) => e.name === 'WRITE_LOG') as ModdleElement;
    const into = list<ModdleElement>(guarded.incoming)[0];
    expect((into.conditionExpression as { body: string }).body).toBe('p_log = abap_true');
    const loop = (list<ModdleElement>(guarded.outgoing)[0].targetRef as ModdleElement);
    expect(loop.name).toBe('LOOP AT gt');

    const bypass = elements.find((e) => e.$type === 'bpmn:SequenceFlow' && traceOf(e)?.reason === 'guard-bypass') as ModdleElement;
    expect((bypass.sourceRef as ModdleElement).id).toBe((into.sourceRef as ModdleElement).id);
    expect((bypass.targetRef as ModdleElement).id).toBe(loop.id);
    expect((bypass.conditionExpression as { body: string }).body).toBe('NOT ( p_log = abap_true )');
    expect(traceOf(bypass)).toMatchObject({ kind: 'loop-back', bypasses: guarded.id as string });
    expect(exported.stats.guardBypasses).toBe(1);
  });

  /* ---------------------------------------------------------------- *
   * `dataByElement` — the associations, without a second parser
   * ---------------------------------------------------------------- */

  for (const file of [LEGACY, PO]) {
    test(`${file} — dataByElement says exactly what the data associations in the file say`, async () => {
      const exported = buildBpmnExportFromSource(read(file), OPTIONS(file));
      const parsed = await (await moddle()).fromXML(exported.xml);
      const { elements } = countOf(parsed.rootElement);

      /** The table behind a `dataStoreReference`, the way a reader of the XML has to find it. */
      const tableOf = (ref: ModdleElement | undefined) => (ref?.dataStoreRef as ModdleElement | undefined)?.name;
      const fromFile: Record<string, { reads: string[]; writes: string[] }> = {};
      for (const element of elements) {
        const reads = list<ModdleElement>(element.dataInputAssociations)
          .map((a) => tableOf(list<ModdleElement>(a.sourceRef)[0])).filter(Boolean) as string[];
        const writes = list<ModdleElement>(element.dataOutputAssociations)
          .map((a) => tableOf(a.targetRef as ModdleElement)).filter(Boolean) as string[];
        if (reads.length || writes.length) fromFile[element.id as string] = { reads, writes };
      }

      expect(Object.keys(fromFile).length, 'the file has no data association at all').toBeGreaterThan(0);
      expect(exported.dataByElement).toEqual(fromFile);
      // Every id is an element of the file, and every table an exported store.
      const stores = new Set(list<ModdleElement>(parsed.rootElement.rootElements)
        .filter((r) => r.$type === 'bpmn:DataStore').map((r) => r.name as string));
      for (const [id, data] of Object.entries(exported.dataByElement)) {
        expect(exported.elementNode[id], `${id} is not a flow node of the file`).toBeDefined();
        for (const table of [...data.reads, ...data.writes]) expect(stores).toContain(table);
      }
    });
  }

  test(`${LEGACY} — error boundary, loop, data stores and the other system`, async () => {
    const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY)).xml);
    const { elements } = countOf(parsed.rootElement);

    const boundary = elements.find((e) => e.$type === 'bpmn:BoundaryEvent' && (e.attachedToRef as ModdleElement).name === 'Z_CREDIT_EXPOSURE_READ');
    expect((boundary?.attachedToRef as ModdleElement).$type).toBe('bpmn:ServiceTask');
    expect(list<ModdleElement>(boundary?.eventDefinitions).map((d) => d.$type)).toEqual(['bpmn:ErrorEventDefinition']);

    // A loop is a gateway the body returns to.
    const loop = elements.find((e) => e.name === 'LOOP AT gt_orders' && traceOf(e)?.container === 'REMOTE_CREDIT_CHECK') as ModdleElement;
    expect(loop.$type).toBe('bpmn:ExclusiveGateway');
    expect(traceOf(loop)?.loopKind).toBe('multi-instance');
    const backs = list<ModdleElement>(loop.incoming).filter((f) => traceOf(f)?.kind === 'loop-back');
    expect(backs).toHaveLength(3);

    // DESIGN.md §5.8: reads VBAK, VBAP, KNA1, KNB1, MARA, MARD; writes ZSD_ORD_RISK, ZSD_LEGACY_LOG.
    const stores = list<ModdleElement>(parsed.rootElement.rootElements).filter((r) => r.$type === 'bpmn:DataStore');
    expect(stores.map((s) => s.name).sort()).toEqual(['KNA1', 'KNB1', 'MARA', 'MARD', 'VBAK', 'VBAP', 'ZSD_LEGACY_LOG', 'ZSD_ORD_RISK']);
    const selectVbak = elements.find((e) => e.name === 'SELECT_ORDERS') as ModdleElement;
    const reads = list<ModdleElement>(selectVbak.dataInputAssociations);
    expect(reads.map((a) => ((list<ModdleElement>(a.sourceRef)[0]).dataStoreRef as ModdleElement).name)).toEqual(['VBAK']);

    // `CALL FUNCTION … DESTINATION` is another system: a pool, and a message
    // flow from the element on the top plane that contains the call.
    const collaboration = list<ModdleElement>(parsed.rootElement.rootElements).find((r) => r.$type === 'bpmn:Collaboration') as ModdleElement;
    const pool = list<ModdleElement>(collaboration.participants).find((p) => !p.processRef) as ModdleElement;
    expect(pool.name).toBe('c_destination');
    const message = list<ModdleElement>(collaboration.messageFlows)[0];
    expect((message.sourceRef as ModdleElement).name).toBe('REMOTE_CREDIT_CHECK');
    expect(traceOf(message)).toMatchObject({ node: 'nd-332-0', lineStart: '401', lineEnd: '411' });
  });

  test(`${PO} — a routine name is never drawn as a table`, async () => {
    const skeleton = buildProcessSkeleton(read(PO));
    const routines = new Set(skeleton.regions.filter((r) => r.kind === 'sub-process').map((r) => r.label));
    const parsed = await (await moddle()).fromXML(buildBpmnExport(skeleton, OPTIONS(PO)).xml);
    const stores = list<ModdleElement>(parsed.rootElement.rootElements).filter((r) => r.$type === 'bpmn:DataStore').map((s) => String(s.name));
    // `CHECK_VENDOR` is a write because it performs `REJECT`, which performs
    // `LOG_APPROVAL`, which inserts into `ZMM_PO_APPR`. The store is the table.
    expect(stores.filter((s) => routines.has(s))).toEqual([]);
    expect(stores).toContain('ZMM_PO_APPR');
  });

  test('a routine performed twice is expanded twice with unique ids, a recursive one stops, a handler with nothing to sit on says so', async () => {
    const post = [
      "  SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = '1'.",
      "  UPDATE zlog SET x = 'X'.",
      '  IF sy-subrc <> 0.',
      '    MESSAGE e001(zz).',
      '  ENDIF.',
      "  CALL FUNCTION 'Z_NOTIFY'.",
    ];
    const twice = ['REPORT ztwice.', 'START-OF-SELECTION.', '  PERFORM post.', '  PERFORM post.', 'FORM post.', ...post, 'ENDFORM.'].join('\n');
    const recursive = [
      'REPORT zrec.', 'START-OF-SELECTION.', '  PERFORM walk.', 'FORM walk.',
      "  SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = '1'.",
      '  IF sy-subrc = 0.', '    PERFORM walk.', '  ENDIF.',
      "  UPDATE zlog SET x = 'X'.", "  CALL FUNCTION 'Z_NOTIFY'.", 'ENDFORM.',
    ].join('\n');
    const handler = [
      'REPORT zcatch.', 'START-OF-SELECTION.', '  TRY.',
      '      lv_rows = lo_stmt->execute_update( lv_sql ).',
      '    CATCH cx_sql_exception.', "      WRITE / 'DB_ERROR'.", '  ENDTRY.',
    ].join('\n');
    const parser = await moddle();

    const a = await parser.fromXML(buildBpmnExportFromSource(twice, { processName: 't', sourceFileName: 't.abap' }).xml);
    expect(a.warnings.map((w) => w.message)).toEqual([]);
    const subs = countOf(a.rootElement).elements.filter((e) => e.$type === 'bpmn:SubProcess');
    expect(subs.map((s) => s.id)).toEqual(['nd-2-0', 'nd-3-1']);
    const ids = (s: ModdleElement) => list<ModdleElement>(s.flowElements).filter((e) => e.$instanceOf('bpmn:FlowNode')).map((e) => e.id);
    expect(ids(subs[0])).toEqual(['nd-11-0', 'nd-5-0', 'nd-6-0', 'nd-7-0', 'nd-8-0', 'nd-10-0']);
    expect(ids(subs[1])).toEqual(['nd-3-1__nd-11-0', 'nd-3-1__nd-5-0', 'nd-3-1__nd-6-0', 'nd-3-1__nd-7-0', 'nd-3-1__nd-8-0', 'nd-3-1__nd-10-0']);
    // The second copy still names the skeleton node it was drawn from.
    expect(traceOf(list<ModdleElement>(subs[1].flowElements)[0])?.node).toBe('nd-11-0');

    const b = await parser.fromXML(buildBpmnExportFromSource(recursive, { processName: 'r', sourceFileName: 'r.abap' }).xml);
    expect(b.warnings.map((w) => w.message)).toEqual([]);
    const call = countOf(b.rootElement).elements.find((e) => e.id === 'nd-6-0') as ModdleElement;
    expect(call.$type).toBe('bpmn:CallActivity');
    expect(traceOf(call)?.fallback).toBe('recursion');

    const c = await parser.fromXML(buildBpmnExportFromSource(handler, { processName: 'h', sourceFileName: 'h.abap' }).xml);
    expect(c.warnings.map((w) => w.message)).toEqual([]);
    const catcher = countOf(c.rootElement).elements.find((e) => e.name === 'cx_sql_exception') as ModdleElement;
    expect(catcher.$type).toBe('bpmn:IntermediateCatchEvent');
    expect(list<ModdleElement>(catcher.eventDefinitions).map((d) => d.$type)).toEqual(['bpmn:ErrorEventDefinition']);
    expect(traceOf(catcher)?.fallback).toBe('unattached-handler');
  });

  test('a source that performs one routine from everywhere stops expanding at the limit', () => {
    // Ten levels, each routine performing the next twice: 2^10 copies of the
    // last one if nothing stopped it.
    const lines = ['REPORT zfan.', 'START-OF-SELECTION.', '  PERFORM r0.'];
    for (let i = 0; i < 14; i++) {
      lines.push(`FORM r${i}.`, `  PERFORM r${i + 1}.`, `  PERFORM r${i + 1}.`,
        `  SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = '${i}'.`, `  UPDATE zlog${i} SET x = 'X'.`, 'ENDFORM.');
    }
    lines.push('FORM r14.', "  UPDATE zend SET x = 'X'.", "  CALL FUNCTION 'Z_END'.", "  SELECT SINGLE * FROM mara INTO ls_mara WHERE matnr = 'e'.", "  UPDATE zend2 SET x = 'X'.", 'ENDFORM.');
    const exported = buildBpmnExportFromSource(lines.join('\n'), { processName: 'fan', sourceFileName: 'fan.abap' });
    // The limit is checked before each expansion; the routines already open on
    // the way down still finish, which is at most a depth's worth of nodes more.
    expect(exported.stats.flowNodes).toBeGreaterThan(MAX_NODES / 2);
    expect(exported.stats.flowNodes).toBeLessThanOrEqual(MAX_NODES + 100);
    expect(exported.xml).toContain('fallback="expansion-limit"');
    expect(exported.xml).toContain('not expanded because the diagram reached its size limit');
  });
});

/* ================================================================== *
 * The layout
 * ================================================================== */

test.describe('the automatic layout', () => {
  for (const file of [LEGACY, PO, 'Z_BUSINESS_PARTNER_SYNC.txt']) {
    test(`${file} — left to right, loop-backs go back, nothing drawn on top of anything`, async () => {
      const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(file), OPTIONS(file)).xml);
      for (const diagram of list<ModdleElement>(parsed.rootElement.diagrams)) {
        const plane = diagram.plane as ModdleElement;
        const shapes = new Map<string, { x: number; y: number; width: number; height: number }>();
        const nodes: Array<[string, { x: number; y: number; width: number; height: number }]> = [];
        for (const di of list<ModdleElement>(plane.planeElement)) {
          const element = di.bpmnElement as ModdleElement;
          if (di.$type !== 'bpmndi:BPMNShape') continue;
          const b = di.bounds as { x: number; y: number; width: number; height: number };
          shapes.set(element.id as string, b);
          if (element.$instanceOf('bpmn:FlowNode') && element.$type !== 'bpmn:BoundaryEvent') nodes.push([element.id as string, b]);
        }
        for (const di of list<ModdleElement>(plane.planeElement)) {
          const element = di.bpmnElement as ModdleElement;
          if (element.$type !== 'bpmn:SequenceFlow') continue;
          const s = shapes.get((element.sourceRef as ModdleElement).id as string);
          const t = shapes.get((element.targetRef as ModdleElement).id as string);
          expect(s && t, `${element.id} joins shapes on this plane`).toBeTruthy();
          if (!s || !t) continue;
          if (traceOf(element)?.kind === 'loop-back') expect(t.x, `${element.id} runs back`).toBeLessThanOrEqual(s.x);
          else expect(t.x, `${element.id} runs forward`).toBeGreaterThan(s.x);
          expect(list(di.waypoint).length).toBeGreaterThanOrEqual(2);
        }
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const [ia, a] = nodes[i];
            const [ib, b] = nodes[j];
            const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
            expect(apart, `${ia} and ${ib} overlap`).toBe(true);
          }
        }
      }
    });
  }

  test(`${LEGACY} — the entries are stacked in the order ABAP runs them`, async () => {
    const parsed = await (await moddle()).fromXML(buildBpmnExportFromSource(read(LEGACY), OPTIONS(LEGACY)).xml);
    const top = list<ModdleElement>(parsed.rootElement.diagrams)[0].plane as ModdleElement;
    const starts = list<ModdleElement>(top.planeElement)
      .filter((d) => (d.bpmnElement as ModdleElement).$type === 'bpmn:StartEvent')
      .map((d) => [(d.bpmnElement as ModdleElement).name, (d.bounds as { y: number }).y] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([name]) => name);
    expect(starts).toEqual(['INITIALIZATION', 'AT SELECTION-SCREEN', 'START-OF-SELECTION', 'END-OF-SELECTION']);
  });
});

/* ================================================================== *
 * bpmn-js opens it — roadmap 2.5 depends on exactly this
 * ================================================================== */

async function importInBpmnJs(page: Page, xml: string): Promise<{ warnings: string[]; roots: string[] }> {
  return page.evaluate(async (text) => {
    type Viewer = {
      importXML: (x: string) => Promise<{ warnings: Array<{ message: string }> }>;
      get: (name: string) => { getRootElements: () => Array<{ id: string }> };
      destroy: () => void;
    };
    const w = window as unknown as { BpmnJS: new (o: object) => Viewer; current?: Viewer };
    w.current?.destroy();
    const viewer = new w.BpmnJS({ container: '#canvas' });
    w.current = viewer;
    const { warnings } = await viewer.importXML(text);
    return {
      warnings: warnings.map((x) => x.message),
      roots: viewer.get('canvas').getRootElements().map((r) => r.id),
    };
  }, xml);
}

test.describe('bpmn-js imports every export without a warning', () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent('<!doctype html><html><body><div id="canvas" style="width:1200px;height:800px"></div></body></html>');
    await page.addScriptTag({ path: join(process.cwd(), 'node_modules/bpmn-js/dist/bpmn-viewer.production.min.js') });
  });

  for (const [file, , , , planes] of SHIPPED) {
    test(`${file} — ${planes} planes`, async ({ page }) => {
      const exported = buildBpmnExportFromSource(read(file), OPTIONS(file));
      const result = await importInBpmnJs(page, exported.xml);
      expect(result.warnings).toEqual([]);
      expect(result.roots).toHaveLength(planes);
      const missing = await page.evaluate((ids) => {
        const w = window as unknown as { current: { get: (n: string) => { get: (id: string) => unknown } } };
        return ids.filter((id) => !w.current.get('elementRegistry').get(id));
      }, Object.keys(exported.elementNode));
      expect(missing).toEqual([]);
    });
  }

  test('the CR-21 names', async ({ page }) => {
    const exported = buildBpmnExportFromSource(CR21_SOURCE, { processName: CR21_NAME, sourceFileName: 'z_prüfung&co.abap' });
    const result = await importInBpmnJs(page, exported.xml);
    expect(result.warnings).toEqual([]);
  });
});

/* ================================================================== *
 * The documentation stage offers this file, and only this file
 * ================================================================== */

test('the documentation stage exports the skeleton of the signed run, not a model-written flow', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/project/[projectId]/documentation/page.tsx'), 'utf8');
  // The generator that interpolated model output into XML is gone, and nothing
  // on the page writes BPMN markup by hand.
  expect(page).not.toContain('generateBPMN');
  expect(page).not.toMatch(/<bpmn:|<bpmndi:/);
  expect(page).toContain("import('@/lib/bpmn/export')");
  // Built from the source whose digest the active run signed, and from nothing else.
  const handler = page.slice(page.indexOf('const downloadBPMN'), page.indexOf('const downloadConfluenceHTML'));
  expect(handler).toContain('buildBpmnExportFromSource(');
  expect(handler).toContain('signedSource');
  expect(handler).not.toMatch(/parsedDoc|parsedBusinessDoc|l3_flow|sop_details|raci/);
  // The source is only the run's while its digest is the one the run signed.
  const guard = page.slice(page.indexOf('const signedSource'), page.indexOf('const downloadBPMN'));
  expect(guard).toContain('sha256Hex(source) !== signed.sha256');
  expect(guard).toContain('project?.activeRunId');
});
