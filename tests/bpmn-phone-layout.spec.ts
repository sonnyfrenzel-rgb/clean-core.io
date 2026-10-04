import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  buildBpmnExportFromSource,
  buildPhoneReadingXml,
  buildReadingExports,
  PHONE_MIN_WRAP,
  READING_WRAP,
} from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { phoneFitWidth } from '../components/process-map/bpmn-view';

/**
 * The phone's narrow layout is a view, never a file (ADR-072, amended 04.10.2026).
 *
 * On a phone the map is drawn from the same process laid out with fewer
 * columns per row (`buildPhoneReadingXml`), so a wide main path fits the card
 * at the 40 % floor. The BPMN 2.0 file that is downloaded, opened in the
 * editor, saved as a revision, compared, imported back from Signavio and
 * counted in the demo record is `buildReadingExports` — and it must be byte
 * for byte what it was. This holds both halves: the file is unchanged with and
 * without the phone layout, and the phone layout changes nothing but the
 * diagram interchange.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const BIG = 'Z_MM_PO_APPROVAL.abap';
const SMALL = 'Z_SALES_ORDER_CREATOR.txt';
/** The narrowest phone card measured (Documentation, 390 px): 306 px. */
const FIT = phoneFitWidth(306);

/** Everything before the diagram interchange: the process itself. */
const processPart = (xml: string) => xml.slice(0, xml.indexOf('<bpmndi:BPMNDiagram'));
/** Everything from the diagram interchange on. */
const diPart = (xml: string) => xml.slice(xml.indexOf('<bpmndi:BPMNDiagram'));
const diIds = (xml: string) => [...diPart(xml).matchAll(/bpmnElement="([^"]+)"/g)].map((m) => m[1]).sort();

function planeWidths(xml: string): number[] {
  return xml.split('<bpmndi:BPMNPlane').slice(1).map((part) => {
    const body = part.slice(0, part.indexOf('</bpmndi:BPMNPlane>'));
    const xs: number[] = [];
    for (const m of body.matchAll(/<dc:Bounds x="(-?[\d.]+)" y="-?[\d.]+" width="([\d.]+)"/g)) xs.push(Number(m[1]), Number(m[1]) + Number(m[2]));
    for (const m of body.matchAll(/<di:waypoint x="(-?[\d.]+)"/g)) xs.push(Number(m[1]));
    return Math.max(...xs) - Math.min(...xs);
  });
}

for (const file of [BIG, SMALL]) {
  test.describe(file, () => {
    const source = read(file);
    const options = { processName: file.replace(/\.\w+$/, ''), sourceFileName: file };

    test('the exported and stored file is byte-identical with and without the phone layout', () => {
      const before = buildReadingExports(source, options);
      const download = buildBpmnExportFromSource(source, { ...options, names: 'plain', wrap: READING_WRAP });
      const phone = buildPhoneReadingXml(source, options, { readingXml: before.bpmn.xml, technical: false, fitWidth: FIT });
      const phoneTechnical = buildPhoneReadingXml(source, options, { readingXml: before.technical.xml, technical: true, fitWidth: FIT });
      expect(phone, 'this example is too wide for a phone card').not.toBeNull();
      expect(phoneTechnical).not.toBeNull();
      const after = buildReadingExports(source, options);
      // The reading file (map, editor base, revisions, Signavio exchange) and the download.
      expect(sha(after.bpmn.xml)).toBe(sha(before.bpmn.xml));
      expect(sha(after.technical.xml)).toBe(sha(before.technical.xml));
      expect(sha(download.xml)).toBe(sha(before.bpmn.xml));
      // The map model built from it — what the demo record digests — has no trace of the phone.
      const named = applyNaming(namingContextOf(source), null);
      const model = buildProcessMapModel({ bpmn: after.bpmn, technical: after.technical, named, fileName: file });
      expect(JSON.stringify(model)).toBe(JSON.stringify(buildProcessMapModel({ bpmn: before.bpmn, technical: before.technical, named, fileName: file })));
      expect(JSON.stringify(model)).not.toContain(phone!.slice(phone!.indexOf('<bpmndi:BPMNDiagram'), phone!.indexOf('<bpmndi:BPMNDiagram') + 2000));
    });

    test('the phone layout is the same process: only the diagram interchange differs, and every level fits the card', () => {
      const { bpmn, technical } = buildReadingExports(source, options);
      for (const [xml, isTechnical] of [[bpmn.xml, false], [technical.xml, true]] as const) {
        const phone = buildPhoneReadingXml(source, options, { readingXml: xml, technical: isTechnical, fitWidth: FIT })!;
        // Elements, names, flows, `cc:trace` line anchors, documentation: identical.
        expect(processPart(phone)).toBe(processPart(xml));
        // Every element drawn on the same planes, by the same ids.
        expect(diIds(phone)).toEqual(diIds(xml));
        expect(diPart(phone)).not.toBe(diPart(xml));
        // And it fits: every level no wider than the card shows at 40 %.
        const desk = Math.max(...planeWidths(xml));
        expect(desk, 'the premise: the reading layout does not fit').toBeGreaterThan(FIT);
        for (const w of planeWidths(phone)) expect(w).toBeLessThanOrEqual(FIT);
      }
    });
  });
}

test('the big example: its main path was some 1,350 units wide and now fits a phone card at 40 %', () => {
  const source = read(BIG);
  const options = { processName: 'Z_MM_PO_APPROVAL', sourceFileName: BIG };
  const { bpmn } = buildReadingExports(source, options);
  expect(planeWidths(bpmn.xml)[0]).toBeGreaterThan(1300);
  const phone = buildPhoneReadingXml(source, options, { readingXml: bpmn.xml, technical: false, fitWidth: FIT })!;
  expect(planeWidths(phone)[0]).toBeLessThanOrEqual(FIT);
  expect(PHONE_MIN_WRAP).toBe(2);
});

test('a process that already fits keeps its reading layout; a file that is not this source is never redrawn', () => {
  const source = read('Z_BUSINESS_PARTNER_SYNC.txt');
  const options = { processName: 'Z_BUSINESS_PARTNER_SYNC', sourceFileName: 'Z_BUSINESS_PARTNER_SYNC.txt' };
  const { bpmn } = buildReadingExports(source, options);
  expect(buildPhoneReadingXml(source, options, { readingXml: bpmn.xml, technical: false, fitWidth: FIT })).toBeNull();
  // The big example's file with another source (a revision, a renamed process): null, so the canvas draws the file.
  const big = buildReadingExports(read(BIG), { processName: 'Z_MM_PO_APPROVAL', sourceFileName: BIG });
  expect(buildPhoneReadingXml(source, options, { readingXml: big.bpmn.xml, technical: false, fitWidth: FIT })).toBeNull();
  expect(buildPhoneReadingXml(read(BIG), { processName: 'Another name', sourceFileName: BIG }, { readingXml: big.bpmn.xml, technical: false, fitWidth: FIT })).toBeNull();
});

test('only the read-only canvas draws the phone layout: no export, editor, draft, revision, import or record reaches it', () => {
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8');
        if (/buildPhoneReadingXml|phoneLayout\b|phone-layout'|wrapOf|noteWidth/.test(text)) users.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  };
  for (const dir of ['app', 'components', 'hooks', 'lib', 'scripts']) walk(path.join(ROOT, dir));
  expect(users.sort()).toEqual([
    'components/demo/DemoDocumentation.tsx',
    'components/process-map/BpmnCanvas.tsx',
    'components/process-map/ProcessMap.tsx',
    'components/process-map/phone-layout.ts',
    'lib/bpmn/export.ts',
    'lib/bpmn/layout.ts',
  ]);
  // The reading exports never pass the phone's options.
  const exporter = fs.readFileSync(path.join(ROOT, 'lib', 'bpmn', 'export.ts'), 'utf8');
  const reading = exporter.slice(exporter.indexOf('export function buildReadingExports'), exporter.indexOf('/** Columns per row of a level the phone'));
  expect(reading).not.toMatch(/wrapOf|noteWidth/);
  // The editor and the draft are handed `model.xml`, never the canvas's drawing.
  const map = fs.readFileSync(path.join(ROOT, 'components', 'process-map', 'ProcessMap.tsx'), 'utf8');
  expect(map).toMatch(/baseXml=\{modelProp\.technicalXml \?\? modelProp\.xml\}/);
  expect(map).toMatch(/istXml=\{modelProp\.xml\}/);
});
