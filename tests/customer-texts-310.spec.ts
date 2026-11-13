import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, test } from './helpers/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { buildExportModel } from '../lib/bpmn/model';
import { buildBpmnExport, businessLevelOf } from '../lib/bpmn/export';
import { plainLabels } from '../lib/abap/plain-language';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { CUSTOMER_TEXT_LABEL, isCustomerTexts, readCustomerTexts, type CustomerTexts } from '../lib/abap/customer-texts';
import { readZipSources } from '../lib/own-code-zip';
import { mergeCustomerTexts } from '../lib/customer-texts-client';
import { identifierSegments, rawWords } from './helpers/business-readability';

/**
 * The customer's own dictionary texts from an abapGit upload (concept "Business-Lesbarkeit" H5(b), owner decision
 * 06.11.2026): `lib/abap/customer-texts.ts`, read by the ZIP import, stored with the project
 * (`app/api/projects/[projectId]/customer-texts/route.ts`), the first source of words from engine 3.1.0.
 *
 * No case of the process benchmark comes with abapGit XML files, so this is a synthetic package written for this
 * spec: a program, one table, one data element with its domain and the program's selection texts.
 */

const NEW = ENGINE_READS_310_FROM;

const PROGRAM = [
  'REPORT zsd_check_minimum.',
  'PARAMETERS p_kdgrp TYPE c LENGTH 2.',
  'DATA: lt_min TYPE STANDARD TABLE OF zsd_minmenge, ls_min TYPE zsd_minmenge.',
  'START-OF-SELECTION.',
  '  SELECT * FROM zsd_minmenge INTO TABLE lt_min WHERE kdgrp = p_kdgrp.',
  '  LOOP AT lt_min INTO ls_min.',
  '    IF ls_min-zzqx IS NOT INITIAL.',
  "      WRITE / 'held'.",
  '    ENDIF.',
  "    IF ls_min-zzart = 'B'.",
  "      WRITE / 'blocked'.",
  '    ENDIF.',
  '  ENDLOOP.',
].join('\n');

const xml = (body: string) => `<?xml version="1.0" encoding="utf-8"?>\n<abapGit version="v1.0.0"><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values>${body}</asx:values></asx:abap></abapGit>`;
const FILES = [
  { name: 'src/zsd_minmenge.tabl.xml', text: xml('<DD02V><TABNAME>ZSD_MINMENGE</TABNAME><DDTEXT>Minimum quantities per customer group</DDTEXT></DD02V><DD03P_TABLE><DD03P><FIELDNAME>ZZQX</FIELDNAME><ROLLNAME>ZQX_HOLD</ROLLNAME></DD03P><DD03P><FIELDNAME>ZZART</FIELDNAME><ROLLNAME>ZMIN_ART</ROLLNAME></DD03P></DD03P_TABLE>') },
  { name: 'src/zqx_hold.dtel.xml', text: xml('<DD04V><ROLLNAME>ZQX_HOLD</ROLLNAME><DDTEXT>Quality hold</DDTEXT><SCRTEXT_L>Quality hold for the customer group</SCRTEXT_L></DD04V>') },
  { name: 'src/zmin_art.dtel.xml', text: xml('<DD04V><ROLLNAME>ZMIN_ART</ROLLNAME><DOMNAME>ZMIN_ART</DOMNAME><SCRTEXT_L>Minimum type</SCRTEXT_L></DD04V>') },
  { name: 'src/zmin_art.doma.xml', text: xml('<DD01V><DOMNAME>ZMIN_ART</DOMNAME></DD01V><DD07V_TAB><DD07V><DOMVALUE_L>A</DOMVALUE_L><DDTEXT>Advisory</DDTEXT></DD07V><DD07V><DOMVALUE_L>B</DOMVALUE_L><DDTEXT>Blocking</DDTEXT></DD07V></DD07V_TAB>') },
  { name: 'src/zsd_check_minimum.prog.xml', text: xml('<TPOOL><item><ID>R</ID><ENTRY>Check minimum quantities</ENTRY></item><item><ID>S</ID><KEY>P_KDGRP</KEY><ENTRY>        Customer group</ENTRY></item><item><ID>I</ID><KEY>001</KEY><ENTRY>Held &amp; blocked</ENTRY></item></TPOOL>') },
];

function labels(engine: string, texts: CustomerTexts | null): string[] {
  const skeleton = buildProcessSkeleton(PROGRAM, { engineVersion: engine });
  return buildExportModel(skeleton, businessLevelOf(skeleton, PROGRAM, engine, texts)).containers.flatMap((c) => c.nodes)
    .filter((n) => /Task$|^task$|callActivity|subProcess|exclusiveGateway/.test(n.tag)).map((n) => n.name);
}

test('the abapGit XML files give the customer\'s texts: table, data element through the table field, domain values, selection and text symbols', () => {
  const t = readCustomerTexts(FILES)!;
  expect(isCustomerTexts(t)).toBe(true);
  expect(t.tables.zsd_minmenge).toBe('Minimum quantities per customer group');
  expect(t.fields.zqx_hold).toBe('Quality hold for the customer group');
  expect(t.fields.zzqx).toBe('Quality hold for the customer group');
  expect(t.values.zzart).toEqual({ A: 'Advisory', B: 'Blocking' });
  expect(t.selections.p_kdgrp).toBe('Customer group');
  expect(t.textSymbols['001']).toBe('Held & blocked');
  expect(readCustomerTexts([{ name: 'x.prog.xml', text: '<not xml' }])).toBeNull();
  expect(isCustomerTexts({ ...t, fields: { 'bad key!': 'x' } })).toBe(false);
});

test('a value map that is an array is not customer texts (QA review 268ed7624e53)', () => {
  const t = readCustomerTexts(FILES)!;
  // An array would pass as an object and read its index `0` as a domain value code.
  expect(isCustomerTexts({ ...t, values: { status: ['Approved'] } })).toBe(false);
  expect(isCustomerTexts({ ...t, values: { status: { A: 'Approved' } } })).toBe(true);
});

test('the ZIP import reads them beside the sources, and several files merge', async () => {
  const zip = new JSZip();
  zip.file('src/zsd_check_minimum.prog.abap', PROGRAM);
  for (const f of FILES) zip.file(f.name, f.text);
  const read = await readZipSources(await zip.generateAsync({ type: 'uint8array' }));
  expect(read.sources).toHaveLength(1);
  expect(read.customerTexts?.tables.zsd_minmenge).toBe('Minimum quantities per customer group');
  expect(mergeCustomerTexts([read.customerTexts, null])?.selections.p_kdgrp).toBe('Customer group');
});

test('from 3.1.0 the customer\'s words come first and are marked; a 3.0.22 hotfix and no package read as before', () => {
  const texts = readCustomerTexts(FILES);
  const now = labels(NEW, texts);
  // Too long for a label with its code beside it: the code stays in the documentation ("Customer text: ZSD_MINMENGE …").
  expect(now).toContain('Read minimum quantities per customer group');
  expect(now.some((n) => /^Quality hold/.test(n))).toBe(true);
  expect(now.some((n) => /B \(Blocking\)/.test(n))).toBe(true);
  expect(labels('3.0.22', texts)).toEqual(labels('3.0.22', null));
  const xmlFile = buildBpmnExport(buildProcessSkeleton(PROGRAM, { engineVersion: NEW }), {
    processName: 't', sourceFileName: 't.abap', source: PROGRAM, names: 'plain', exporterVersion: NEW, customerTexts: texts,
  }).xml;
  expect(xmlFile).toContain(`${CUSTOMER_TEXT_LABEL}: ZSD_MINMENGE “Minimum quantities per customer group”`);
});

test('a decision whose question says a customer text is marked as one (QA review 268ed7624e53)', () => {
  const skeleton = buildProcessSkeleton(PROGRAM, { engineVersion: NEW });
  const plain = plainLabels(skeleton, PROGRAM, { engineVersion: NEW, customerTexts: readCustomerTexts(FILES) });
  const hold = skeleton.nodes.find((n) => n.kind === 'gateway' && /^Quality hold/.test(plain.nodes.get(n.id) ?? ''));
  expect(hold, 'the decision on ZZQX says the customer word').toBeTruthy();
  expect(plain.detail?.(hold!.id)).toContain(`${CUSTOMER_TEXT_LABEL}: ZZQX “Quality hold for the customer group”`);
});

test('measured on this package: the raw identifiers of the Business view with and without the customer texts', () => {
  const segments = identifierSegments(PROGRAM);
  const raw = (names: string[]) => names.filter((n) => rawWords(n, segments).length > 0).length;
  const without = labels(NEW, null);
  const withTexts = labels(NEW, readCustomerTexts(FILES));
  test.info().annotations.push({ type: 'raw identifiers', description: `${raw(without)}/${without.length} -> ${raw(withTexts)}/${withTexts.length}` });
  expect(raw(withTexts)).toBeLessThan(raw(without));
  expect(raw(withTexts)).toBe(0);
});

test('the texts stay with the project: the route is owner-written through the Admin SDK and no rule opens the path', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', 'customer-texts', 'route.ts'), 'utf8');
  expect(route).toContain("const COLLECTION = 'customer_texts'");
  expect(route).toMatch(/project\.userId !== decodedToken\.uid/);
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  expect(rules).not.toMatch(/customer_texts/);
});
