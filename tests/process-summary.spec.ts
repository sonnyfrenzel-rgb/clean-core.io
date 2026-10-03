import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildReadingExports } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { processSummaryOf } from '../lib/process-summary';
import { readSource } from '../lib/first-look';
import { workspaceLayers } from '../lib/workspace-model';
import type { Project } from '../lib/types';

/**
 * Need & process says what the map holds (owner, 03.10.2026: "the process was
 * reconstructed, but Need & process says something else"). The layer's counts
 * are the map's own — checked here against the overview line the map prints,
 * built the way `hooks/useProcessMap.ts` builds it.
 */

const ROOT = path.resolve(__dirname, '..');
const example = (file: string) => fs.readFileSync(path.join(ROOT, 'public/starter-examples', file), 'utf8');

for (const file of ['Z_SALES_ORDER_CREATOR.txt', 'Z_MM_PO_APPROVAL.abap', 'Z_INVOICE_EXTRACTOR.txt']) {
  test(`${file}: the summary counts what the map's overview line says`, () => {
    const source = example(file);
    const { bpmn, technical } = buildReadingExports(source, { processName: file, sourceFileName: file });
    const model = buildProcessMapModel({ bpmn, technical, named: applyNaming(namingContextOf(source), null), fileName: file });
    const summary = processSummaryOf(source, file);
    expect(summary).not.toBeNull();
    const m = /(\d+) steps?.*?(\d+) decision points?\b/.exec(model.overview);
    expect(m, model.overview).not.toBeNull();
    expect(summary!.steps).toBe(Number(m![1]));
    expect(summary!.decisions).toBe(Number(m![2]));
    expect(summary!.shapes).toBe(model.traceability.flowNodes);
  });
}

test('with the map of a signed source, Need & process is reconstructed — never empty, never not determined', () => {
  const source = example('Z_SALES_ORDER_CREATOR.txt');
  const reading = readSource(source);
  const summary = processSummaryOf(source)!;
  const project = { legacyCode: source } as unknown as Project;
  const need = workspaceLayers(project, reading, summary).find((l) => l.key === 'need')!;
  expect(need.count).not.toBeNull();
  expect(need.count).toContain(`${summary.steps} step`);
  expect(need.provenance).toBe('reconstructed');
  const row = need.rows.find((r) => r.key === 'process');
  expect(row?.value).toBe(
    `Reconstructed: ${summary.steps} ${summary.steps === 1 ? 'step' : 'steps'}, ${summary.decisions} ${summary.decisions === 1 ? 'decision point' : 'decision points'}, ${reading.ruleSet.rules.length} ${reading.ruleSet.rules.length === 1 ? 'rule' : 'rules'} hard-coded`,
  );
  // Without the map (no signed source) the layer says what it said before.
  const without = workspaceLayers(project, reading).find((l) => l.key === 'need')!;
  expect(without.rows.some((r) => r.key === 'process')).toBe(false);
});
