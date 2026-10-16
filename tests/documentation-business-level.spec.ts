import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel } from '../lib/process-map';
import { buildProcessDocumentation } from '../lib/process-documentation-build';
import { buildProcessDocument } from '../lib/process-document-build';
import type { ProcessDocumentation } from '../lib/process-documentation';
import { BUSINESS_STEP_LEVEL, businessStepIds, businessStepsOf } from '../lib/business-steps';
import { businessSopPrompt, enrichBusinessLayer, sopStepInfos } from '../lib/business-sop-prompt';
import { writableSteps } from '../lib/business-layer-parts';
import { isBusinessLevelLayer, processStepsOf, raciMatrix, sopSteps, type StoredBusinessLayer } from '../lib/business-summary';
import { raciFileTable } from '../lib/raci-edit';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { businessSopMarkdown } from '../lib/business-sop-markdown';
import { currentAnchorKey, documentationProposalsAnchor, DOCUMENTATION_PROPOSALS_ID } from '../lib/page-anchors';

/**
 * Owner decision 16.10.2026, testing 3.0.14 on dev with the SD reference
 * program (about 1,850 lines): "SOP = 196 steps? not usable", "RACI not
 * usable" — the business SOP listed every element of the process map
 * ("validate_selection", "Demo selected?", "For each raw", "No raw found?"),
 * and the RACI had a row for each. And while the RACI was on screen, the
 * chapter bar marked "Open questions".
 *
 * The SOP and the RACI now stand on the business level: one entry per step
 * the description lists under "How it works", with that step's technical
 * steps (and their lines) folded underneath. These specs hold, without a
 * server, on the PO demo and the 1,000-line example shipped with the app:
 *
 *   1. the business steps are exactly the steps of "How it works", and every
 *      other element of the process is reachable under one of them;
 *   2. the prompt asks for one row per business step and no finer;
 *   3. the stored layer, the screen's data, the RACI, the Confluence page and
 *      the delivery file have one entry per business step, the technical
 *      steps under each;
 *   4. a layer stored before — one row per element — still renders, folded,
 *      with a note that regenerating gives the business-level form;
 *   5. the chapter bar names the proposals card, and a reader in it is never
 *      told they are in "Open questions".
 *
 * Pure: no server, no browser, no model.
 */

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, 'tmp', 'documentation-business-level', String(process.pid));
const example = (file: string) => fs.readFileSync(path.join(ROOT, 'public', 'starter-examples', file), 'utf8').replace(/\r\n/g, '\n');

function read(file: string) {
  const source = example(file);
  const bpmn = buildBpmnExportFromSource(source, { processName: file, sourceFileName: file });
  const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(source), null), fileName: file });
  const doc = buildProcessDocumentation({ source, map });
  const description = buildProcessDocument({ source, map, engine: doc });
  return { source, doc, description };
}

const EVENT = /^(?:start|end)\b|^event$|error boundary/i;

/** The model's answer as the business level asks for it: one row per business step. */
function businessAnswer(doc: ProcessDocumentation) {
  const steps = businessStepsOf(doc);
  return {
    raci_matrix: steps.map((s, i) => ({ stepId: s.id, r: i % 2 ? 'Buyer' : 'Clerk', a: 'Process Owner', c: '', i: 'Requester' })),
    sop_details: steps.map((s) => ({
      stepId: s.id,
      claims: [{ text: `The step ${s.name} is completed for the business case at hand.`, basis: 'proposal', lines: [] }],
      businessException: 'Route the case to manual review.',
    })),
  };
}

/** A layer stored before 16.10.2026: one row per element of the process, no level. */
function technicalLayer(doc: ProcessDocumentation): StoredBusinessLayer {
  const steps = writableSteps(doc);
  return {
    raci_matrix: steps.map((s) => ({ stepId: s.id, r: 'Clerk', a: 'Process Owner', c: '', i: '' })),
    sop_details: steps.map((s) => ({ stepId: s.id, narrative: `The ${s.technicalName} element runs for the business case at hand.`, businessException: 'Review.' })),
  };
}

for (const [file, howItWorks] of [['Z_MM_PO_APPROVAL.abap', 11], ['ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', 15]] as const) {
  test.describe(`${file}: the business level`, () => {
    const { doc, description } = read(file);
    const path_ = description.overview.path.filter((e) => e.kind === 'step');

    test('the business steps are the steps of "How it works", and every other element is under one of them', () => {
      expect(path_).toHaveLength(howItWorks);
      // The rule read from the stored documentation alone agrees with the description's main path.
      expect(businessStepIds(doc)).toEqual(path_.map((s) => s.id));
      const steps = businessStepsOf(doc, path_.map((s) => s.id));
      expect(steps.map((s) => s.id)).toEqual(path_.map((s) => s.id));
      // Complete underneath: every element but the events is a business step or a technical step of exactly one.
      const elements = doc.steps.filter((s) => !EVENT.test(s.kind)).map((s) => s.id).sort();
      const covered = [...steps.map((s) => s.id), ...steps.flatMap((s) => s.technical.map((t) => t.id))];
      expect(new Set(covered).size).toBe(covered.length);
      expect([...covered].sort()).toEqual(elements);
      expect(steps.flatMap((s) => s.technical).length).toBeGreaterThan(howItWorks);
      // A technical step keeps its lines and is named for a reader, never by its id.
      const byId = new Map(doc.steps.map((s) => [s.id, s]));
      for (const t of steps.flatMap((s) => s.technical)) {
        expect(t.anchor).toEqual(byId.get(t.id)!.anchor ? { lineStart: byId.get(t.id)!.anchor!.lineStart, lineEnd: byId.get(t.id)!.anchor!.lineEnd } : null);
        expect(t.name).not.toMatch(/^nd-\d+-\d+$/);
        expect(t.depth).toBeGreaterThanOrEqual(1);
      }
    });

    test('the prompt asks for one row per business step and no finer', () => {
      const prompt = businessSopPrompt(doc);
      expect(prompt).toContain(`The process has ${howItWorks} business steps`);
      expect(prompt).toContain('Write NO row for any other element id.');
      for (const [i, s] of businessStepsOf(doc).entries()) expect(prompt).toContain(`\n${i + 1}. ${s.id} — `);
      // A technical step is named as detail, never listed as a row of its own.
      const technical = businessStepsOf(doc).flatMap((s) => s.technical);
      for (const t of technical) expect(prompt).not.toMatch(new RegExp(`\\n\\d+\\. ${t.id} — `));
    });

    test('the stored layer, the SOP, the RACI and the files: one entry per business step, the technical steps under each', async () => {
      const steps = businessStepsOf(doc);
      const infos = sopStepInfos(doc);
      expect(infos.map((s) => s.id)).toEqual(steps.map((s) => s.id));
      // The model wrote a row for a technical element anyway, and rows out of order: neither survives the store.
      const answer = businessAnswer(doc);
      const stray = steps.find((s) => s.technical.length)!.technical[0].id;
      const sloppy = {
        raci_matrix: [...answer.raci_matrix].reverse().concat([{ stepId: stray, r: 'Clerk', a: 'Clerk', c: '', i: '' }]),
        sop_details: [...answer.sop_details].reverse().concat([{ stepId: stray, claims: [], businessException: '' }]),
        level: 'whatever the model wrote',
      };
      const stored = enrichBusinessLayer(sloppy, infos, doc.facts ?? null) as StoredBusinessLayer & Record<string, unknown>;
      expect(stored.level).toBe(BUSINESS_STEP_LEVEL);
      expect(isBusinessLevelLayer(stored)).toBe(true);
      expect((stored.sop_details as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(steps.map((s) => s.id));
      expect((stored.raci_matrix as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(steps.map((s) => s.id));

      const process = processStepsOf(doc.steps);
      const sop = sopSteps(stored, process, { facts: doc.facts ?? null });
      expect(sop).toHaveLength(howItWorks);
      expect(sop.map((s) => s.stepId)).toEqual(steps.map((s) => s.id));
      // Complete underneath: every technical step is reachable under its business step, with its lines.
      expect(sop.map((s) => s.technical.map((t) => t.id))).toEqual(steps.map((s) => s.technical.map((t) => t.id)));
      expect(sop.flatMap((s) => s.technical).filter((t) => t.anchor).length).toBeGreaterThan(0);
      const matrix = raciMatrix(sop);
      expect(matrix.steps).toHaveLength(howItWorks);
      expect(matrix.totalRoles).toBeLessThanOrEqual(7);
      expect(raciFileTable(stored, process, null)!.rows).toHaveLength(howItWorks);

      const html = await buildEngineConfluenceHtml(description, stored, { processSteps: process }).text();
      expect(html).toContain('data-sop-level="business"');
      expect(html.match(/<td data-sop-technical="\d+">/g)).toHaveLength(howItWorks);
      expect(html.match(/data-sop-technical-step=""/g)?.length).toBe(steps.flatMap((s) => s.technical).length);

      const md = businessSopMarkdown(JSON.stringify(stored), doc);
      const steps_ = md.slice(md.indexOf('## Steps'), md.indexOf('## Who is responsible'));
      expect([...steps_.matchAll(/^### /gm)]).toHaveLength(howItWorks);
      expect(steps_).toContain(`Business level — ${howItWorks} steps, the steps of “How it works”`);
      expect(steps_).toContain('**Technical steps (');
    });

    test('only rows of a business step are stored: a row of any other id is not kept (SEC-2026-842)', () => {
      const steps = businessStepsOf(doc);
      const answer = businessAnswer(doc);
      const extra = (stepId: string) => ({ stepId, r: 'Clerk', a: 'Clerk', c: '', i: '' });
      const stored = enrichBusinessLayer({
        raci_matrix: [...answer.raci_matrix, extra('Task_not_in_process'), extra(''), { r: 'Clerk' }],
        sop_details: [...answer.sop_details, { stepId: 'Task_not_in_process', claims: [], businessException: '' }],
      }, sopStepInfos(doc), doc.facts ?? null);
      expect((stored.raci_matrix as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(steps.map((s) => s.id));
      expect((stored.sop_details as Array<{ stepId: string }>).map((r) => r.stepId)).toEqual(steps.map((s) => s.id));
      expect(raciMatrix(sopSteps(stored, processStepsOf(doc.steps), { facts: doc.facts ?? null })).steps).toHaveLength(howItWorks);
    });

    test('a layer stored before — one row per element — still renders, and says regenerating gives the business level', async () => {
      const old = technicalLayer(doc);
      expect(isBusinessLevelLayer(old)).toBe(false);
      const process = processStepsOf(doc.steps);
      const sop = sopSteps(old, process);
      expect(sop).toHaveLength(writableSteps(doc).length);
      expect(sop.every((s) => s.technical.length === 0)).toBe(true);
      const html = await buildEngineConfluenceHtml(description, old, { processSteps: process }).text();
      expect(html).toContain('data-sop-level="technical"');
      expect(html).toContain('Written per technical step by an earlier version');
      expect(html).not.toContain('<th>Technical steps</th>');
      expect(businessSopMarkdown(JSON.stringify(old), doc)).toContain('Regenerate SOP and RACI for one entry per step of “How it works”');
    });
  });
}

test.describe('the business layer on screen', () => {
  let BusinessLayer: (p: Record<string, unknown>) => React.ReactElement;
  test.beforeAll(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    await build({
      entryPoints: [path.resolve(ROOT, 'components', 'documentation', 'BusinessLayer.tsx')],
      outfile: path.join(OUT, 'BusinessLayer.cjs'),
      bundle: true,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      alias: { '@': ROOT },
      logLevel: 'silent',
    });
    BusinessLayer = require(path.join(OUT, 'BusinessLayer.cjs')).default;
  });

  test('a business-level layer: one card per step of "How it works", each step\'s technical steps folded under it', () => {
    const { doc } = read('Z_MM_PO_APPROVAL.abap');
    const stored = enrichBusinessLayer(businessAnswer(doc), sopStepInfos(doc), doc.facts ?? null);
    const html = renderToStaticMarkup(React.createElement(BusinessLayer, { layer: stored, process: processStepsOf(doc.steps) }));
    expect(html).toContain('data-sop-level="business"');
    expect(html).toContain('Business level — 11 steps, the steps of “How it works”');
    expect(html.match(/data-sop-step="/g)).toHaveLength(11);
    expect(html.match(/data-raci-row="/g)).toHaveLength(11);
    expect(html.match(/data-sop-full-step="/g)).toHaveLength(11);
    const technical = businessStepsOf(doc).flatMap((s) => s.technical);
    expect(html.match(/data-sop-technical-step="/g)).toHaveLength(technical.length);
    expect(html).not.toContain('data-sop-legacy');
  });

  test('a layer stored before renders folded, with the note to regenerate — never a crash', () => {
    const { doc } = read('Z_MM_PO_APPROVAL.abap');
    const html = renderToStaticMarkup(React.createElement(BusinessLayer, { layer: technicalLayer(doc), process: processStepsOf(doc.steps) }));
    expect(html).toContain('data-sop-level="technical"');
    expect(html).toContain('data-sop-legacy=""');
    expect(html).toContain('Written per technical step by an earlier version — 49 rows.');
    expect(html).toContain('Regenerate SOP and RACI for one entry per step of “How it works”');
    // A stored layer of any shape the page accepts renders.
    for (const layer of [{}, { raci_matrix: [], sop_details: [] }, { sop_details: [{ stepId: 'x', stepTechnical: 'not a list' }], level: BUSINESS_STEP_LEVEL }]) {
      expect(() => renderToStaticMarkup(React.createElement(BusinessLayer, { layer, process: processStepsOf(doc.steps) }))).not.toThrow();
    }
  });
});

test.describe('the chapter bar: the RACI is its own section, never "Open questions"', () => {
  test('the page names the proposals card between the open questions and the appendix', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app', '(app)', 'project', '[projectId]', 'documentation', 'page.tsx'), 'utf8');
    expect(page).toContain('beforeAppendix={[proposalsAnchor]}');
    expect(page).toContain('id={DOCUMENTATION_PROPOSALS_ID}');
    const view = fs.readFileSync(path.join(ROOT, 'components', 'documentation', 'ProcessDocumentView.tsx'), 'utf8');
    expect(view).toContain("[...chapters.slice(0, at), ...beforeAppendix, ...chapters.slice(at)]");
    const anchor = documentationProposalsAnchor({ steps: 14 });
    expect(anchor).toMatchObject({ target: DOCUMENTATION_PROPOSALS_ID, label: 'SOP & RACI', count: '14' });
    expect(documentationProposalsAnchor({ steps: null }).count).toBeNull();
    const bar = fs.readFileSync(path.join(ROOT, 'components', 'PageAnchorBar.tsx'), 'utf8');
    expect(bar).toContain('currentAnchorKey(rects, LINE)');
  });

  test('the scroll spy marks the section the reading line is in, the one just passed only across a gap', () => {
    const LINE = 160;
    // The open questions end above the line; the proposals card runs through it.
    const questions = { key: 'questions', top: -900, bottom: -40, left: 24 };
    const proposals = { key: 'proposals', top: -20, bottom: 1400, left: 24 };
    const appendix = { key: 'appendix', top: 4000, bottom: 6000, left: 24 };
    expect(currentAnchorKey([questions, proposals, appendix], LINE)).toBe('proposals');
    // Before 16.10.2026 the card had no anchor and the last section passed stayed marked: "Open questions".
    expect(currentAnchorKey([questions, appendix], LINE)).toBeNull();
    // In the margin between two sections, the one just passed.
    expect(currentAnchorKey([{ ...questions, bottom: 120 }, appendix], LINE)).toBe('questions');
    // Before the first section, none; where two run through the line, the main column's (further left).
    expect(currentAnchorKey([appendix], LINE)).toBeNull();
    expect(currentAnchorKey([{ key: 'side', top: 0, bottom: 900, left: 800 }, { key: 'main', top: 10, bottom: 900, left: 24 }], LINE)).toBe('main');
  });
});
