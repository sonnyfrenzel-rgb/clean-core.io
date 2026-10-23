import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { aiNamesOfNaming, buildBpmnExportFromSource, buildReadingExports, type BpmnExportOptions } from '../lib/bpmn/export';
import { readingExportsKey } from '../lib/bpmn/reading-key';
import { parseBpmn } from '../lib/process-map';
import { aiMarkingOf } from '../lib/ai-marking';
import { NAMING_FORMAT_VERSION, namingContextOf, type ProcessNamingRecord } from '../lib/process-naming';
import { pinnedExamplePath } from './helpers/starter-example-files';

/**
 * The BPMN download carries the model's business names — 3.0.21, owner decision 23.10.2026.
 *
 * A project whose element names came from a model call with a verified receipt (`process-naming` route) downloads a
 * BPMN file in which exactly those elements carry `cc:origin value="ai"` with the provider and model the stored
 * receipt names — read from the record, never written in the code. Without a record, or with one made for another
 * reading of the source, the file is byte for byte the engine's.
 */

const ROOT = path.resolve(__dirname, '..');
const FILE = 'Z_MM_PO_APPROVAL.abap';
const source = fs.readFileSync(pinnedExamplePath(FILE), 'utf8').replace(/\r\n/g, '\n');
const options: BpmnExportOptions = { processName: 'PO approval', sourceFileName: FILE, exporterVersion: 'v3.0.21' };
const context = namingContextOf(source);

const engineOnly = buildBpmnExportFromSource(source, options);
const tasks = parseBpmn(engineOnly.xml).elements.filter((e) => /task/i.test(e.tag)).slice(0, 2);
const skeletonIds = tasks.map((t) => engineOnly.elementNode[t.id]);
const NAMES = ['Approve the purchase order', 'Tell the buyer'];

function record(provider: string, modelId: string, digest = context.digest): ProcessNamingRecord {
  return {
    formatVersion: NAMING_FORMAT_VERSION,
    digest,
    names: skeletonIds.map((id, i) => ({ id, technicalName: context.skeleton.nodes.find((n) => n.id === id)!.label, name: NAMES[i] })),
    lanes: [],
    discarded: { total: 0, byRule: {} },
    origin: {
      source: 'model',
      receipt: 'verified',
      provider,
      modelId,
      byok: true,
      issuedAt: Date.parse('2026-10-22T09:30:00.000Z'),
      textSha256: 'a'.repeat(64),
    },
    namedAt: '2026-10-22T09:30:05.000Z',
  };
}

const originsOf = (xml: string) => [...xml.matchAll(/<cc:origin value="ai" ai_provider="([^"]*)" ai_model="([^"]*)" ?\/>/g)].map((m) => [m[1], m[2]]);

test.describe('BPMN download: model names marked from the stored receipt', () => {
  test('the fixture names two tasks of the skeleton', () => {
    expect(tasks).toHaveLength(2);
    expect(skeletonIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  test('without a stored naming the download is the engine file, byte for byte, and unmarked', () => {
    expect(buildBpmnExportFromSource(source, { ...options, naming: null }).xml).toBe(engineOnly.xml);
    expect(engineOnly.xml).not.toContain('cc:origin');
    expect(aiMarkingOf(engineOnly.xml)).toBeNull();
  });

  test('with a receipt the named elements carry provider and model of the record, nothing else is marked', () => {
    const { xml } = buildBpmnExportFromSource(source, { ...options, naming: record('anthropic', 'claude-receipt-model') });
    expect(originsOf(xml)).toEqual([['anthropic', 'claude-receipt-model'], ['anthropic', 'claude-receipt-model']]);
    const elements = parseBpmn(xml).elements;
    for (const [i, t] of tasks.entries()) expect(elements.find((e) => e.id === t.id)?.name).toBe(NAMES[i]);
    expect(aiMarkingOf(xml)).toContain('claude-receipt-model');
    // The same file with another receipt names the other model: the name comes from the record, not from the code.
    const other = buildBpmnExportFromSource(source, { ...options, naming: record('google-gemini', 'gemini-receipt-model') }).xml;
    expect(originsOf(other)).toEqual([['google-gemini', 'gemini-receipt-model'], ['google-gemini', 'gemini-receipt-model']]);
  });

  test('a naming made for another reading of the source marks nothing', () => {
    const stale = record('anthropic', 'claude-receipt-model', 'nm1-another-reading');
    expect(aiNamesOfNaming(context, stale)).toBeUndefined();
    expect(buildBpmnExportFromSource(source, { ...options, naming: stale }).xml).toBe(engineOnly.xml);
  });

  test('the reading download (Documentation) marks the plain file; the technical file and the map stay the engine\'s', () => {
    const plain = buildReadingExports(source, options);
    const named = buildReadingExports(source, { ...options, naming: record('anthropic', 'claude-receipt-model') });
    expect(plain.bpmn.xml).not.toContain('cc:origin');
    expect(originsOf(named.bpmn.xml)).toHaveLength(2);
    expect(named.technical.xml).toBe(plain.technical.xml);
    expect(readingExportsKey(source, options)).toBe(JSON.stringify(['PO approval', FILE, 'v3.0.21', source]));
    expect(readingExportsKey(source, { ...options, naming: record('anthropic', 'm') })).not.toBe(readingExportsKey(source, options));
  });

  test('every BPMN download path passes the stored naming and names no model itself', () => {
    for (const file of [
      'components/workspace/HeadActions.tsx',
      'app/(app)/project/[projectId]/delivery/page.tsx',
      'app/(app)/project/[projectId]/documentation/page.tsx',
      'components/workspace/FitCheckPanel.tsx',
    ]) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(text, file).toContain('fetchProcessNaming');
      expect(text, file).toMatch(/\bnaming\b[,}\s]/);
      expect(text, file).not.toMatch(/ai_provider|ai_model|aiNames/);
    }
  });
});
