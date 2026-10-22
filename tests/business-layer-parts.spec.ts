import { test, expect } from '@playwright/test';
import { skipWithoutReference, OWNER_SOURCES } from './helpers/reference-sources';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import type { ProcessDocumentation } from '../lib/process-documentation';
import { businessSopPrompt } from '../lib/business-sop-prompt';
import {
  BUSINESS_LAYER_PART_LIMITS,
  businessLayerPartPrompt,
  businessLayerWaves,
  expectedBusinessLayerWords,
  keepPartRows,
  mergeBusinessLayerParts,
  planBusinessLayerParts,
  rolesOfLayer,
  routineRanges,
  statementsByPart,
  writableSteps,
  documentationPart,
} from '../lib/business-layer-parts';
import { BUSINESS_LAYER_CEILING_MS } from '../lib/documentation-generation-lease';
import { businessStepIds, businessStepsOf } from '../lib/business-steps';
import { CLOUD_RUN_REQUEST_TIMEOUT_MS, MODEL_CALL_DEADLINE_MS } from '../lib/model-deadline';
import { DOCUMENTATION_BUSINESS_THINKING_ENV, thinkingConfigFor } from '../lib/model-thinking';
import { RESPONSE_SHAPE_STAGE, isResponseShape, responseSchemaForStage } from '../lib/model-response-schema';
import { pinnedExamplePath } from './helpers/starter-example-files';

/**
 * Roadmap 3.0.13 — the business layer (SOP and RACI) of a program too large
 * for one model answer is written in parts (`lib/business-layer-parts.ts`),
 * and the wait for each answer follows the model-call deadline instead of the
 * 90 s that stopped the SD example (owner, dev acceptance 14.10.2026).
 *
 * The large program here is generated (120 routines, one step each): the SD
 * reference and the PM holdout are not in the repository. Their sizes are the
 * reference for the limits, read below only where the files exist on this
 * machine — nothing in the split knows either of them.
 *
 * Pure: no server, no browser, no model.
 */

const ROOT = path.resolve(__dirname, '..');

function documentationOf(source: string, file: string): ProcessDocumentation {
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
  return buildProcessDocumentation({ source, map });
}

/** A report that performs `n` routines in turn, each with one decision and one message — `n` steps of the process. */
function largeProgram(n: number): string {
  const name = (i: number) => `check_${String(i).padStart(3, '0')}`;
  const out = ['REPORT zbig_synthetic.', 'DATA gv_total TYPE p DECIMALS 2.', 'DATA gv_count TYPE i.', 'PARAMETERS p_limit TYPE i DEFAULT 10.', '', 'START-OF-SELECTION.'];
  // An assignment between the calls, so the engine does not read them as one sentence naming every routine.
  for (let i = 1; i <= n; i++) out.push(`  PERFORM ${name(i)}.`, `  gv_count = gv_count + ${i}.`);
  out.push('');
  for (let i = 1; i <= n; i++) {
    out.push(`FORM ${name(i)}.`, '  IF gv_count > p_limit.', `    gv_total = gv_total + ${i}.`, `    MESSAGE 'Limit ${i} reached' TYPE 'I'.`, '  ELSE.', '    gv_count = gv_count + 1.', '  ENDIF.', 'ENDFORM.');
  }
  return out.join('\n');
}

const example = (file: string) => fs.readFileSync(pinnedExamplePath(file), 'utf8').replace(/\r\n/g, '\n');

test.describe('a program that fits is written in one call, as before', () => {
  test('the shipped examples: one part, every business step, the prompt it always had', () => {
    // Owner 16.10.2026: the rows are the business steps ("How it works"), not every element.
    for (const [file, steps] of [['Z_MM_PO_APPROVAL.abap', 11], ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 15]] as const) {
      const source = example(file);
      const doc = documentationOf(source, file);
      const plan = planBusinessLayerParts(doc);
      expect(plan.whole, file).toBe(true);
      expect(plan.parts).toHaveLength(1);
      expect(plan.parts[0].stepIds).toEqual(businessStepIds(doc));
      expect(plan.steps, file).toBe(steps);
      expect(plan.steps, file).toBeLessThan(writableSteps(doc).length);
      expect(businessLayerPartPrompt(doc, plan, 0, [], source)).toBe(businessSopPrompt(doc));
      expect(businessSopPrompt(doc)).not.toContain('THIS IS PART');
    }
  });
});

test.describe('a large program is written in parts', () => {
  const source = largeProgram(120);
  const doc = documentationOf(source, 'zbig_synthetic.abap');
  const plan = planBusinessLayerParts(doc);

  test('it is too large for one answer: more steps than one part holds', () => {
    expect(plan.steps).toBe(120);
    expect(plan.steps).toBeGreaterThan(BUSINESS_LAYER_PART_LIMITS.maxStepsPerPart);
    expect(plan.whole).toBe(false);
    expect(plan.parts.length).toBe(2);
  });

  test('every step is in exactly one part, in process order, no part over the limit', () => {
    const all = plan.parts.flatMap((p) => p.stepIds);
    // Each routine the report performs is a step of its main path: 120 business steps.
    expect(all).toEqual(businessStepIds(doc));
    expect(all).toHaveLength(120);
    expect(new Set(all).size).toBe(all.length);
    for (const part of plan.parts) expect(part.stepIds.length).toBeLessThanOrEqual(BUSINESS_LAYER_PART_LIMITS.maxStepsPerPart);
    expect(plan.parts.map((p) => p.index)).toEqual(plan.parts.map((_, i) => i));
  });

  test('each part asks for exactly its own elements, reads its own routines, and stays under the prompt limit', () => {
    const statements = statementsByPart(doc, plan, source);
    const routines = routineRanges(source);
    expect(routines.get('CHECK_001')).toBeTruthy();
    plan.parts.forEach((part, i) => {
      const prompt = businessLayerPartPrompt(doc, plan, i, ['Process Owner', 'Clerk'], source);
      expect(prompt).toContain(`THIS IS PART ${i + 1} OF ${plan.parts.length}`);
      expect(prompt).toContain(`for EXACTLY these business step ids, and for no other: ${part.stepIds.join(', ')}.`);
      expect(prompt.length).toBeLessThan(BUSINESS_LAYER_PART_LIMITS.maxPromptChars);
      expect(prompt.length).toBeLessThan(businessSopPrompt(doc).length);
      // The first part names the roles; the others are asked to reuse them.
      if (i === 0) expect(prompt).not.toContain('Roles the earlier part already uses');
      else expect(prompt).toContain('Roles the earlier part already uses: Process Owner, Clerk. REUSE them');
      // The statements of the routine a step calls are in its part (the first routine of each part).
      const firstRoutine = routines.get(doc.steps.find((s) => s.id === part.stepIds[0])!.technicalName.toUpperCase())!;
      expect(statements[i].some((st) => st.anchors.some((a) => a.lineStart >= firstRoutine.lineStart && a.lineEnd <= firstRoutine.lineEnd))).toBe(true);
    });
    // Nothing of the program is lost from every prompt.
    const covered = new Set(statements.flat().map((s) => s.id));
    expect(doc.statements.filter((s) => !covered.has(s.id))).toEqual([]);
  });

  test('never more parts than the limit allows: a larger program gets larger parts', () => {
    const tight = planBusinessLayerParts(doc, { ...BUSINESS_LAYER_PART_LIMITS, maxStepsPerPart: 5, maxParts: 8 });
    expect(tight.parts.length).toBeLessThanOrEqual(8);
    expect(tight.parts.flatMap((p) => p.stepIds)).toHaveLength(120);
  });

  test('a long prompt alone splits a program with few steps', () => {
    const small = documentationOf(example('Z_MM_PO_APPROVAL.abap'), 'Z_MM_PO_APPROVAL.abap');
    const byPrompt = planBusinessLayerParts(small, { ...BUSINESS_LAYER_PART_LIMITS, maxPromptChars: 10_000, maxStepsPerPart: 30 });
    expect(byPrompt.whole).toBe(false);
  });

  test('a business step is never torn apart: its part reads every element under it', () => {
    const source1000 = example('ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const doc1000 = documentationOf(source1000, 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap');
    const limits = { ...BUSINESS_LAYER_PART_LIMITS, maxStepsPerPart: 5 };
    const cut = planBusinessLayerParts(doc1000, limits);
    expect(cut.whole).toBe(false);
    expect(cut.parts.flatMap((p) => p.stepIds)).toEqual(businessStepIds(doc1000));
    const steps = new Map(businessStepsOf(doc1000).map((s) => [s.id, s]));
    for (const [i, part] of cut.parts.entries()) {
      const slice = new Set(documentationPart(doc1000, cut, i, source1000).steps.map((s) => s.id));
      for (const id of part.stepIds) {
        expect(slice.has(id), `${id} in part ${i}`).toBe(true);
        for (const t of steps.get(id)!.technical) expect(slice.has(t.id), `${t.id} under ${id} in part ${i}`).toBe(true);
      }
      // Each part's documentation renders on its own (no flow into another part breaks it).
      expect(businessLayerPartPrompt(doc1000, cut, i, [], source1000)).toContain('Process documentation');
      expect(part.stepIds.length).toBeLessThanOrEqual(limits.maxStepsPerPart);
    }
  });
});

test.describe('the parts are joined into one layer', () => {
  test('a part keeps only its own rows; the first row of an element wins; the roles are read in order', () => {
    const one = keepPartRows({
      raci_matrix: [{ stepId: 'a', r: 'Clerk', a: 'Process Owner' }, { stepId: 'x', r: 'Stray' }],
      sop_details: [{ stepId: 'a', claims: [{ text: 'A.', basis: 'proposal', lines: [] }] }, { stepId: 'x' }],
    }, ['a', 'b']);
    expect(one.raci_matrix).toEqual([{ stepId: 'a', r: 'Clerk', a: 'Process Owner' }]);
    expect((one.sop_details as unknown[]).length).toBe(1);
    expect(rolesOfLayer(one)).toEqual(['Clerk', 'Process Owner']);
    const two = { raci_matrix: [{ stepId: 'c', r: 'Clerk; Finance', a: 'Process Owner' }, { stepId: 'a', r: 'Late' }], sop_details: [{ stepId: 'c' }] };
    const joined = mergeBusinessLayerParts([one, two]);
    expect((joined.raci_matrix as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(['a', 'c']);
    expect((joined.raci_matrix as Array<{ r: string }>)[0].r).toBe('Clerk');
    expect((joined.sop_details as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(['a', 'c']);
    expect(rolesOfLayer(joined)).toEqual(['Clerk', 'Process Owner', 'Finance']);
  });
});

test.describe('the wait follows the model-call deadline, and the thinking is configurable', () => {
  test('the ceiling is the route deadline and a margin, inside the service limit — not 90 s', () => {
    expect(BUSINESS_LAYER_CEILING_MS).toBeGreaterThan(MODEL_CALL_DEADLINE_MS);
    expect(BUSINESS_LAYER_CEILING_MS).toBeLessThan(CLOUD_RUN_REQUEST_TIMEOUT_MS);
    expect(BUSINESS_LAYER_CEILING_MS).not.toBe(90_000);
  });

  test('the business layer is an answer shape of Documentation; its thinking is the default unless configured', () => {
    expect(isResponseShape('documentation-business')).toBe(true);
    expect(RESPONSE_SHAPE_STAGE['documentation-business']).toBe('documentation');
    expect(responseSchemaForStage('documentation', 'documentation-business')).toBeUndefined();
    expect(thinkingConfigFor('documentation-business', {})).toBeUndefined();
    expect(thinkingConfigFor('documentation-business', { [DOCUMENTATION_BUSINESS_THINKING_ENV]: 'nonsense' })).toBeUndefined();
    expect(thinkingConfigFor('documentation-business', { [DOCUMENTATION_BUSINESS_THINKING_ENV]: ' Low ' })).toEqual({ thinkingLevel: 'LOW' });
    expect(thinkingConfigFor('documentation-business', { [DOCUMENTATION_BUSINESS_THINKING_ENV]: 'high' })).toEqual({ thinkingLevel: 'HIGH' });
    // The setting reaches nothing else.
    expect(thinkingConfigFor('documentation', { [DOCUMENTATION_BUSINESS_THINKING_ENV]: 'low' })).toBeUndefined();
    expect(thinkingConfigFor('transformation-fill', {})).toEqual({ thinkingLevel: 'LOW' });
  });

  test('the page names the shape on its call and waits per part', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
    const gen = page.slice(page.indexOf('async function runBusinessGeneration'), page.indexOf('const generateBusinessDocumentation'));
    // The call's options name the shape (and, since 3.0.17, take the model receipt for the AI marking).
    expect(gen).toMatch(/callGemini\([\s\S]*?ceiling\.signal,\s*\{\s*responseShape: 'documentation-business',/);
    expect(gen).toContain('setTimeout(() => ceiling.abort(), BUSINESS_LAYER_CEILING_MS)');
    expect(gen).toContain('planBusinessLayerParts(engineDoc, undefined, businessSteps)');
    expect(gen).toContain('businessStepsOf(engineDoc, sopInputs.current.path)');
    expect(gen).toContain('mergeBusinessLayerParts(');
  });

  test('the expected time is said in minutes, by rounds of calls', () => {
    expect(businessLayerWaves(1)).toBe(1);
    expect(businessLayerWaves(4, 2)).toBe(3);
    expect(expectedBusinessLayerWords(1)).toBe('about 1–3 minutes (estimate)');
    expect(expectedBusinessLayerWords(4, 2)).toBe('about 3–9 minutes (estimate)');
  });
});

/* The size references (owner, 14.10.2026) — only where the files are on this machine; never committed. */
const DESKTOP = OWNER_SOURCES;
for (const [file, expectWhole] of [['SD_LE_Legacy_ABAP.txt', false], ['PM_Legacy_ABAP.txt', null]] as const) {
  test(`size reference ${file}`, () => {
    const full = path.join(DESKTOP, file);
    skipWithoutReference(!fs.existsSync(full), 'the reference is not on this machine');
    const source = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
    const doc = documentationOf(source, file);
    const plan = planBusinessLayerParts(doc);
    if (expectWhole !== null) expect(plan.whole).toBe(expectWhole);
    // Owner 16.10.2026: the SD reference's 196 elements are 14 business steps, written in two parts, not four.
    if (file === 'SD_LE_Legacy_ABAP.txt') {
      expect(plan.steps).toBe(14);
      expect(plan.parts.length).toBe(2);
    }
    for (const [i, part] of plan.parts.entries()) {
      expect(part.stepIds.length).toBeLessThanOrEqual(BUSINESS_LAYER_PART_LIMITS.maxStepsPerPart);
      expect(businessLayerPartPrompt(doc, plan, i, [], source).length).toBeLessThan(BUSINESS_LAYER_PART_LIMITS.maxPromptChars);
    }
  });
}
