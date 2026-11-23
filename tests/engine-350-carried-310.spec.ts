import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { customerTextProvenance, emptyCustomerTexts } from '../lib/abap/customer-texts';
import { buildReadingExports } from '../lib/bpmn/export';
import { readingExportsKey } from '../lib/bpmn/reading-key';
import { withinDeadline, CUSTOMER_TEXTS_DEADLINE_MS } from '../lib/customer-texts-client';
import { namingFactsApply } from '../lib/process-naming';
import { processStory } from '../lib/process-story';
import { processSummaryOf } from '../lib/process-summary';
import { APP_VERSION } from '../lib/version';

/**
 * Roadmap row "3.5.0 — with it: engine and benchmark", item (4): the three items carried from the 3.1.0 QA review.
 * Server-free.
 */
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', ...p.split('/')), 'utf8');

test.describe('a run without an engine stamp reads as the oldest engine everywhere', () => {
  // A report whose map the engines draw differently: 3.1.0 adds a start event per loop level, 3.0.21 the business
  // level, so the oldest engine's file is not this release's.
  const source = `REPORT zstamp.
PARAMETERS p_werks TYPE werks_d.
START-OF-SELECTION.
  SELECT * FROM marc INTO TABLE @DATA(lt_marc) WHERE werks = @p_werks.
  LOOP AT lt_marc INTO DATA(ls_marc).
    IF ls_marc-mmsta = '01'.
      UPDATE zstock SET menge = 0 WHERE matnr = ls_marc-matnr.
    ENDIF.
  ENDLOOP.
`;
  const options = { processName: 'Stamp', sourceFileName: 'zstamp.abap' };

  test('the reading of a run without a stamp is the oldest engine\'s, not this release\'s', () => {
    const unstamped = buildReadingExports(source, { ...options, exporterVersion: null });
    const oldest = buildReadingExports(source, { ...options, exporterVersion: 'v1.0.0' });
    const current = buildReadingExports(source, options);
    const body = (xml: string) => xml.replace(/(engine|exporterVersion)="[^"]*"/g, '').replace(/by Clean-Core\.io v?[\d.]*\d/g, '');
    expect(body(unstamped.bpmn.xml)).toBe(body(oldest.bpmn.xml));
    expect(body(unstamped.bpmn.xml)).not.toBe(body(current.bpmn.xml));
    // The file says it does not know the engine instead of naming this release.
    expect(unstamped.bpmn.xml).toContain('engine="unstamped"');
    expect(current.bpmn.xml).toContain(`engine="${APP_VERSION}"`);
  });

  test('absent and null are two readings in the cache key', () => {
    expect(readingExportsKey(source, { ...options, exporterVersion: null })).not.toBe(readingExportsKey(source, options));
    // Absent keeps the key it had, so a reading cached for this release is still found.
    expect(readingExportsKey(source, options)).toBe(JSON.stringify([options.processName, options.sourceFileName, null, source]));
  });

  test('the naming facts and the process summary read a run without a stamp as the oldest engine', () => {
    expect(namingFactsApply(null)).toBe(false);
    expect(namingFactsApply()).toBe(namingFactsApply(APP_VERSION));
    const summary = (engine: string | null) => JSON.stringify(processSummaryOf(source, 'zstamp.abap', 'Stamp', engine));
    expect(summary(null)).toBe(summary('v1.0.0'));
  });

  test('the naming route, the map, the summary tile and every export pass the run\'s engine on, null included', () => {
    const route = read('app/api/projects/[projectId]/process-naming/route.ts');
    expect(route).toMatch(/namingContextOf\(gate\.legacyCode, \{ engineVersion: gate\.engineVersion \}\)/);
    const map = read('hooks/useProcessMap.ts');
    expect(map).not.toMatch(/engineVersion \? \{/);
    expect(read('hooks/useAutoProcessNaming.ts')).not.toMatch(/engineVersion \? \{/);
    expect(read('lib/project-summary-server.ts')).toMatch(/exporterVersion: input\.engineVersion,/);
    for (const file of [
      'components/workspace/FitCheckPanel.tsx',
      'app/(app)/project/[projectId]/delivery/page.tsx',
      'app/(app)/project/[projectId]/documentation/page.tsx',
    ]) expect(read(file), file).toMatch(/exporterVersion: engineVersionOfProject\(project\)/);
    for (const file of ['app/api/projects/[projectId]/process-map/route.ts', 'app/api/projects/[projectId]/process-revisions/route.ts']) {
      expect(read(file), file).toMatch(/exporterVersion: engineVersionOfProject\(gate\.project\)/);
    }
    expect(read('lib/process-summary.ts')).toMatch(/exporterVersion: engineVersion \}/);
  });
});

test.describe('the process map draws without customer texts after a deadline', () => {
  test('a request that never answers gives up at the deadline and abandons the request', async () => {
    let aborted = false;
    const started = Date.now();
    const out = await withinDeadline((signal) => new Promise<string>(() => {
      signal?.addEventListener('abort', () => { aborted = true; });
    }), 150, 'without');
    expect(out).toBe('without');
    expect(aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('an answer before the deadline is taken, and a failure reads as none', async () => {
    expect(await withinDeadline(async () => 'texts', 1000, null)).toBe('texts');
    expect(await withinDeadline(async () => { throw new Error('offline'); }, 1000, null)).toBeNull();
  });

  test('the map and every other reader fetch with the deadline', () => {
    expect(CUSTOMER_TEXTS_DEADLINE_MS).toBeGreaterThan(0);
    expect(CUSTOMER_TEXTS_DEADLINE_MS).toBeLessThanOrEqual(5000);
    const client = read('lib/customer-texts-client.ts');
    expect(client).toMatch(/deadlineMs: number = CUSTOMER_TEXTS_DEADLINE_MS/);
    expect(read('hooks/useProcessMap.ts')).toMatch(/customer\.fetchCustomerTexts\(projectId\)/);
  });
});

test.describe('customer-text provenance is kept at the point of use', () => {
  const source = `REPORT zstock.
PARAMETERS p_werks TYPE werks_d.
START-OF-SELECTION.
  SELECT * FROM marc INTO TABLE @DATA(lt_marc) WHERE werks = @p_werks.
  LOOP AT lt_marc INTO DATA(ls_marc).
    UPDATE zstock SET menge = 0 WHERE matnr = ls_marc-matnr.
  ENDLOOP.
`;
  const texts = emptyCustomerTexts();
  // A one-word text of a field this source never names, and a table text the source does use.
  texts.fields.zzwerk = 'Plant';
  texts.tables.zstock = 'Stock per plant';

  test('the sentence matcher alone credits a one-word text to a phrase the engine took from SAP', () => {
    expect(customerTextProvenance('Read material plant data', texts)).toBe('Customer text: ZZWERK “Plant”.');
    expect(customerTextProvenance('Read material plant data', texts, [])).toBe('');
    expect(customerTextProvenance('Update stock per plant', texts, ['ZSTOCK'])).toBe('Customer text: ZSTOCK “Stock per plant”.');
  });

  test('the story credits only the texts its labels were built from', () => {
    for (const engine of ['v3.1.0', APP_VERSION]) {
      const story = processStory(buildProcessSkeleton(source, { engineVersion: engine }), source, null, engine, texts);
      const read = story.steps.find((s) => /plant data/i.test(s.text));
      const update = story.steps.find((s) => /stock per plant/i.test(s.text));
      expect(read, engine).toBeDefined();
      expect(read?.customerText, engine).toBeUndefined();
      expect(update?.customerText, engine).toBe('Customer text: ZSTOCK “Stock per plant”.');
    }
  });
});
