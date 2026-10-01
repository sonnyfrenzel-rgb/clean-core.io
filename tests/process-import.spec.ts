import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { importBpmn, importSummarySentence, MAX_IMPORT_CHARS } from '../lib/bpmn/import';
import { parseBpmn } from '../lib/process-map';

/**
 * BPMN 2.0 import — the Signavio round trip (owner, 01.10.2026).
 *
 * Measured on the 1.000-line example without a browser: the file the product
 * exports, the same file as SAP Signavio would hand it back (default namespace,
 * `sid-` ids, our extensions gone), forged line anchors, and the files the
 * import must refuse with a sentence rather than read half of.
 */

const EXAMPLE = path.resolve(
  __dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
);

function ist(): string {
  const source = fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');
  return buildReadingExports(source, { processName: 'Order fulfilment audit', sourceFileName: 'Z.abap' }).bpmn.xml;
}

/** As a tool that rewrites ids, drops foreign extensions and uses BPMN as its default namespace would write it. */
function asSignavio(xml: string): string {
  return xml
    .replace(/<cc:trace[^>]*\/>/g, '')
    .replace(/<cc:reconstruction[^>]*\/>/g, '')
    .replace(/"nd-/g, '"sid-nd-')
    .replace(/bpmn:/g, '')
    .replace('xmlns:bpmn=', 'xmlns=');
}

const anchoredIds = (xml: string) =>
  parseBpmn(xml).elements.filter((e) => e.trace?.lineStart != null).map((e) => e.id).sort();

test.describe('BPMN 2.0 import', () => {
  test('our own export comes back whole: every element recognised by id, every anchor kept, nothing changed', async () => {
    const base = ist();
    const before = base.slice();
    const result = await importBpmn(base, { xml: base, revision: 1 });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    const flowNodes = parseBpmn(base).elements.length;
    expect(result.summary.flowNodes).toBe(flowNodes);
    expect(result.summary.matchedById).toBe(flowNodes);
    expect(result.summary.outside).toBe(0);
    expect(result.summary.anchored).toBe(anchoredIds(base).length);
    expect(anchoredIds(result.xml)).toEqual(anchoredIds(base));
    expect(result.summary.diff.identical).toBe(true);
    // The Ist itself is an input, never an output.
    expect(base).toBe(before);
    expect(importSummarySentence(result.summary)).toContain('keep their line anchor');
  });

  test('a Signavio-style file with rewritten ids gets its anchors back by name, and the Ist ids with them', async () => {
    const base = ist();
    const file = asSignavio(base);
    expect(file).not.toContain('cc:trace');
    const result = await importBpmn(file, { xml: base, revision: 1 });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.summary.matchedById).toBe(0);
    // "Start" and "Done" repeat on every level: they are recognised inside a
    // sub-process that was itself recognised. What stays ambiguous even there
    // is left without an anchor rather than guessed — measured: 78 of 82.
    expect(result.summary.matchedByName).toBeGreaterThanOrEqual(75);
    expect(result.summary.outside).toBeLessThanOrEqual(6);
    expect(result.summary.anchored).toBe(result.summary.matchedByName);
    expect(result.summary.outside).toBe(result.summary.flowNodes - result.summary.matchedByName);
    // What the reader of the product sees: an anchored element is one of the Ist's, at the Ist's lines.
    const istTrace = new Map(parseBpmn(base).elements.map((e) => [e.id, e.trace]));
    for (const element of parseBpmn(result.xml).elements) {
      if (element.trace?.lineStart == null) continue;
      expect(element.id.startsWith('nd-'), element.id).toBe(true);
      expect(element.trace.lineStart).toBe(istTrace.get(element.id)?.lineStart);
    }
    expect(result.xml).toContain('<bpmn:definitions');
  });

  test('a line anchor the file claims for itself is not believed', async () => {
    const base = ist();
    const forged = base
      // A new task, claiming lines 1–5 and the strongest status there is.
      .replace(
        '</bpmn:process>',
        '<bpmn:task id="Forged_1" name="Forged step"><bpmn:extensionElements><cc:trace status="proven" lineStart="1" lineEnd="5" /></bpmn:extensionElements></bpmn:task></bpmn:process>',
      )
      .replace(
        '</bpmndi:BPMNPlane>',
        '<bpmndi:BPMNShape id="Forged_1_di" bpmnElement="Forged_1"><dc:Bounds x="10" y="10" width="100" height="80" /></bpmndi:BPMNShape></bpmndi:BPMNPlane>',
      );
    const result = await importBpmn(forged, { xml: base, revision: 1 });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    const element = parseBpmn(result.xml).elements.find((e) => e.id === 'Forged_1');
    expect(element, 'the added task is kept').toBeTruthy();
    expect(element?.trace, 'its claimed anchor and status are gone').toBeNull();
    expect(result.summary.outside).toBe(1);
    expect(result.summary.droppedClaims).toBeGreaterThan(0);
    expect(result.summary.diff.added.map((a) => a.id)).toEqual(['Forged_1']);
    expect(result.summary.diff.added[0].anchor).toBeNull();
  });

  test('an existing element whose anchor was edited in the file keeps the Ist anchor', async () => {
    const base = ist();
    const first = parseBpmn(base).elements.find((e) => e.trace?.lineStart != null && e.tag === 'task');
    expect(first).toBeTruthy();
    const tampered = base.replace(
      new RegExp(`(<bpmn:task id="${first!.id}"[\\s\\S]*?lineStart=")(\\d+)`),
      '$19999',
    );
    expect(tampered).not.toBe(base);
    const result = await importBpmn(tampered, { xml: base, revision: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const back = parseBpmn(result.xml).elements.find((e) => e.id === first!.id);
    expect(back?.trace?.lineStart).toBe(first!.trace?.lineStart);
  });

  test('names are cleaned of invisible characters before anything shows them', async () => {
    const base = ist();
    const sneaky = base.replace(/name="([^"]+)"/, 'name="Approve&#x202E;evorppA"');
    const result = await importBpmn(sneaky, { xml: base, revision: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xml).not.toContain('‮');
    expect(result.summary.cleaned).toBeGreaterThan(0);
  });

  test('refused, each with a sentence: not XML, a DOCTYPE, too large, unknown elements, no diagram, other files', async () => {
    const base = ist();
    const cases: Array<[string, string, RegExp]> = [
      ['', 'empty', /empty/],
      ['<bpmn:definitions', 'not-xml', /not a readable BPMN 2\.0 document/],
      ['<?xml version="1.0"?><!DOCTYPE d [<!ENTITY e SYSTEM "file:///etc/passwd">]><d>&e;</d>', 'doctype', /document type or entities/],
      ['<root xmlns="urn:other"/>', 'not-xml', /./],
      [base.replace('</bpmn:process>', '<bpmn:fooBar id="x" /></bpmn:process>'), 'unsupported', /cannot show: bpmn:FooBar/],
      [base.replace(/<bpmndi:BPMNDiagram[\s\S]*<\/bpmndi:BPMNDiagram>/, ''), 'no-diagram', /no diagram layout/],
      [base.replace('<bpmn:collaboration', '<bpmn:import importType="http://www.omg.org/spec/BPMN/20100524/MODEL" location="http://example.com/other.bpmn" namespace="urn:x" /><bpmn:collaboration'), 'external', /other files/],
      ['x'.repeat(MAX_IMPORT_CHARS + 1), 'too-large', /at most/],
    ];
    for (const [text, code, message] of cases) {
      const result = await importBpmn(text, { xml: base, revision: 1 });
      expect(result.ok, `${code}: was accepted`).toBe(false);
      if (result.ok) continue;
      if (code !== 'not-xml' || text.startsWith('<bpmn')) expect(result.code, text.slice(0, 40)).toBe(code);
      expect(result.message).toMatch(message);
      expect(result.message.length).toBeLessThan(260);
    }
  });

  test('an element without a position is refused rather than silently lost', async () => {
    const base = ist();
    const firstShape = /<bpmndi:BPMNShape id="[^"]+" bpmnElement="(nd-[^"]+)"[\s\S]*?<\/bpmndi:BPMNShape>/.exec(base);
    expect(firstShape).toBeTruthy();
    const result = await importBpmn(base.replace(firstShape![0], ''), { xml: base, revision: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/have no position/);
  });
});
