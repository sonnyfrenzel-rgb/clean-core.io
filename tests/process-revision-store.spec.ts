import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBpmnExportFromSource } from '@/lib/bpmn/export';
import {
  MAX_STORED_REVISION_BYTES,
  PLAIN_REVISION_XML_BYTES,
  revisionDocData,
  storedRevisionXml,
} from '@/lib/process-revision-store';

/**
 * A reconstruction larger than one Firestore document (1 MiB) used to fail the
 * write with INVALID_ARGUMENT, and the rules card then told the reader to run an
 * analysis that had already run (dev, 22.10.2026: a 937-line program, 3.3 MB of BPMN).
 */

// A model the size of the one that failed: many branches, each with its diagram shape and edge.
function bigModel(): string {
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?><bpmn:definitions>'];
  for (let i = 0; parts.join('').length < 3_300_000; i++) {
    parts.push(
      `<bpmn:exclusiveGateway id="Gateway_${i}" name="Check ${i}"><bpmn:incoming>Flow_${i}</bpmn:incoming></bpmn:exclusiveGateway>`
        + `<bpmndi:BPMNShape id="Gateway_${i}_di" bpmnElement="Gateway_${i}"><dc:Bounds x="${100 + i * 3}" y="${200 + (i % 40) * 90}" width="50" height="50" /></bpmndi:BPMNShape>`
        + `<bpmndi:BPMNEdge id="Flow_${i}_di" bpmnElement="Flow_${i}"><di:waypoint x="${i}" y="${i % 97}" /><di:waypoint x="${i + 50}" y="${i % 89}" /></bpmndi:BPMNEdge>`,
    );
  }
  parts.push('</bpmn:definitions>');
  return parts.join('');
}

test.describe('process revision store', () => {
  test('a model larger than one Firestore document is stored compressed and reads back byte for byte', () => {
    const xml = bigModel();
    expect(Buffer.byteLength(xml)).toBeGreaterThan(1_048_576);
    const stored = storedRevisionXml(xml);
    expect(stored).not.toBeNull();
    expect(stored!.xml).toBe('');
    expect('xmlGzip' in stored! && stored!.xmlGzip.length).toBeLessThanOrEqual(MAX_STORED_REVISION_BYTES);
    const back = revisionDocData({ revision: 1, ...stored });
    expect(back.xml).toBe(xml);
    expect(back).not.toHaveProperty('xmlGzip');
  });

  test('a small model stays plain text, so documents written before keep reading as they did', () => {
    const xml = '<bpmn:definitions><bpmn:task id="Task_1" /></bpmn:definitions>';
    expect(storedRevisionXml(xml)).toEqual({ xml });
    expect(revisionDocData({ revision: 2, xml }).xml).toBe(xml);
    expect(Buffer.byteLength(xml)).toBeLessThan(PLAIN_REVISION_XML_BYTES);
  });

  test('the reconstruction of every starter example fits a revision document', () => {
    const dir = join(process.cwd(), 'public', 'starter-examples');
    for (const file of ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 'Z_MM_PO_APPROVAL.abap']) {
      const { xml } = buildBpmnExportFromSource(readFileSync(join(dir, file), 'utf8'), { processName: file, sourceFileName: file });
      const stored = storedRevisionXml(xml);
      expect(stored, file).not.toBeNull();
      expect(revisionDocData({ ...stored }).xml, file).toBe(xml);
    }
  });

  test('every reader of a revision document goes through revisionDocData', () => {
    for (const file of [
      'app/api/projects/[projectId]/process-revisions/route.ts',
      'app/api/projects/[projectId]/process-states/route.ts',
      'app/api/projects/[projectId]/commands/route.ts',
      'lib/decision-facts.ts',
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).toContain('revisionDocData(');
    }
  });

  test('a refused baseline is not reported as a missing analysis', () => {
    const client = readFileSync(join(process.cwd(), 'lib', 'rule-record-client.ts'), 'utf8');
    expect(client).toContain("built.code === 'too-large' ? 'rules.baselineTooLarge' : 'rules.baselineFailed'");
  });
});
