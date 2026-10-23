import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { buildBpmnExportFromSource, type BpmnExportOptions } from '../lib/bpmn/export';
import { importBpmn } from '../lib/bpmn/import';
import { parseBpmn } from '../lib/process-map';
import {
  AI_ORIGIN_MARKDOWN_CLOSE,
  aiMarkingOf,
  aiMarkingStatement,
  aiOriginHtmlAttributes,
  aiOriginMarkdownOpen,
  type AiAuthorship,
} from '../lib/ai-marking';
import { buildAnalysisExportHtml } from '../lib/analysis-export';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { processDocumentBlocks } from '../lib/process-document-outline';
import { blocksMarkdown } from '../lib/requirements-export';
import { processStepsOf } from '../lib/business-summary';
import type { Project } from '../lib/types';
import { pinnedExamplePath } from './helpers/starter-example-files';
import { businessLayerFor, engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';

/**
 * The second level of the AI marking — 3.0.21, acceptance test T08.
 *
 * The privacy notice and the trust page promise that in an artefact which
 * mixes the engine's parts with a model's, every model-written element is
 * marked where it stands, not only the file. Each test here builds such an
 * artefact and reads the marks back: present on what a model wrote, with the
 * provider and model that wrote it; absent on everything the engine wrote.
 */

const GEMINI: AiAuthorship = { provider: 'google-gemini', modelId: 'gemini-test', byok: false, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: 'v3.0.21' };
const ORIGIN_HTML = ' data-origin="ai" data-ai-provider="google-gemini" data-ai-model="gemini-test"';

/* ================================================================ BPMN */

interface ModdleElement {
  $type: string;
  id?: string;
  name?: string;
  extensionElements?: { values?: Array<Record<string, string>> };
  [key: string]: unknown;
}

async function readWithModdle(xml: string) {
  const loaded = (await import('bpmn-moddle')) as unknown as {
    BpmnModdle: new () => { fromXML(xml: string): Promise<{ rootElement: ModdleElement; elementsById: Record<string, ModdleElement>; warnings: Array<{ message: string }> }> };
  };
  return new loaded.BpmnModdle().fromXML(xml);
}

const originOf = (e: ModdleElement | undefined) => e?.extensionElements?.values?.find((v) => v.$type === 'cc:origin');

test.describe('BPMN: a name a model wrote is marked on its element', () => {
  const source = readFileSync(pinnedExamplePath('Z_MM_PO_APPROVAL.abap'), 'utf8').replace(/\r\n/g, '\n');
  const options: BpmnExportOptions = { processName: 'PO approval', sourceFileName: 'Z_MM_PO_APPROVAL.abap', names: 'plain', exporterVersion: 'v3.0.21' };
  const base = buildBpmnExportFromSource(source, options);
  const tasks = parseBpmn(base.xml).elements.filter((e) => /task/i.test(e.tag)).slice(0, 2);
  const names = Object.fromEntries(tasks.map((t, i) => [base.elementNode[t.id], i === 0 ? 'Approve the purchase order' : 'Tell the buyer']));
  const marked = buildBpmnExportFromSource(source, { ...options, aiNames: { names, authorship: GEMINI } });

  test('without model names the file is what it was: no mark, no header, byte for byte', () => {
    expect(tasks).toHaveLength(2);
    expect(buildBpmnExportFromSource(source, { ...options, aiNames: { names: {}, authorship: GEMINI } }).xml).toBe(base.xml);
    expect(base.xml).not.toContain('cc:origin');
    expect(base.xml).not.toContain('cc:aiMarking');
    expect(aiMarkingOf(base.xml)).toBeNull();
  });

  test('each model-named element carries cc:origin with provider and model; every other element carries none', async () => {
    const parsed = await readWithModdle(marked.xml);
    expect(parsed.warnings.map((w) => w.message)).toEqual([]);
    for (const [i, t] of tasks.entries()) {
      const e = parsed.elementsById[t.id];
      expect(e.name).toBe(i === 0 ? 'Approve the purchase order' : 'Tell the buyer');
      expect(originOf(e)).toMatchObject({ value: 'ai', ai_provider: 'google-gemini', ai_model: 'gemini-test' });
    }
    const others = parseBpmn(marked.xml).elements.filter((e) => !tasks.some((t) => t.id === e.id));
    expect(others.length).toBeGreaterThan(5);
    for (const e of others) expect(originOf(parsed.elementsById[e.id]), e.id).toBeUndefined();
    expect(marked.xml.match(/<cc:origin /g)).toHaveLength(2);
  });

  test('the file carries the header comment and the metadata field, and says what the model wrote', () => {
    const statement = aiMarkingStatement(GEMINI, 'v3.0.21');
    const lines = marked.xml.split('\n');
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(lines[1]).toBe(`<!-- ${statement} -->`);
    expect(aiMarkingOf(marked.xml)).toBe(statement);
    expect(marked.xml).toMatch(/<cc:aiMarking statement="Generated with AI assistance \(Google Gemini gemini-test\)[^"]*" provider="google-gemini" model="gemini-test" keyOwner="platform" generatedOn="2026-10-20" basis="EU AI Act, Article 50\(2\)" elements="2" ?\/>/);
    expect(marked.xml).toContain('2 element names were written by a language model (Google Gemini gemini-test)');
    // The file no longer says it was made without a language model; the file without model names still does.
    expect(marked.xml).not.toContain(', without a language model.');
    expect(marked.xml).not.toContain('Z_MM_PO_APPROVAL.abap without a language model.');
    expect(base.xml).toContain(', without a language model.');
  });

  test('the marked file stays importable: the import reads it whole and drops the claims it does not believe', async () => {
    const result = await importBpmn(marked.xml, { xml: marked.xml, revision: 1 });
    expect(result.ok, result.ok ? '' : result.message).toBe(true);
    if (!result.ok) return;
    expect(result.summary.outside).toBe(0);
    // Every cc:* claim of an imported file is dropped and rebuilt from the Ist — the origin with it.
    expect(result.xml).not.toMatch(/<cc:origin /);
  });
});

/* ================================================================ HTML */

test.describe('HTML: the findings report and the documentation page mark the model\'s parts', () => {
  test('the analysis report: the narrative carries data-origin, the engine\'s findings and stand-ins do not', () => {
    const project = {
      id: 'p',
      name: 'Probe',
      analysis: JSON.stringify({
        projectTitle: 'Probe',
        summary: 'The model summary.',
        asIsContext: 'The model context.',
        gaps: [{ title: 'Gap', severity: 'High', strategy: 'S', rationale: 'R', complexity: 'Low' }],
        strategicNextSteps: ['Next'],
        recommendations: { keepCoreClean: 'K', decommissioning: 'D', cloudReadiness: 'C' },
        businessValueAnalysis: { technicalDebtLevel: 'High' },
      }),
      auditMetadata: { modelCard: { modelParticipation: 'narrative-attested', provider: 'google-gemini', model: 'gemini-test', analysisTimestamp: '2026-10-20T10:00:00.000Z' } },
    } as unknown as Project;
    const html = buildAnalysisExportHtml({ project, routeReport: null, legacyCode: '', uploadedFileName: 'z.abap', targetDeployment: null })!;
    expect(html).toContain(`<div class="summary-box"${ORIGIN_HTML}>`);
    expect(html).toContain(`<p${ORIGIN_HTML}><strong>Technical Debt Level:</strong>`);
    // No asset score from the model: the "not determined" line is the engine's.
    expect(html).toContain('<p><strong>Legacy Asset Score:</strong> not determined');
    // The engine's stand-in plan is not the model's.
    expect(html).toContain('<ul class="strong">');
    expect(html.match(/data-origin="ai"/g)!.length).toBeGreaterThanOrEqual(8);
    // Nothing after the narrative — scores, inventory, findings, worklist — is marked.
    expect(html.slice(html.indexOf('Detailed Technical Assessment'))).not.toContain('data-origin');
    // A run no model took part in: no narrative mark at all.
    const none = buildAnalysisExportHtml({ project: { ...project, auditMetadata: { modelCard: { modelParticipation: 'none' } } } as unknown as Project, routeReport: null, legacyCode: '', uploadedFileName: 'z.abap', targetDeployment: null })!;
    expect(none).not.toContain('data-origin');
  });

  test('the documentation page: the proposal, the SOP cells and the model\'s RACI carry their writer; an owner-edited RACI does not', async () => {
    const source = fixtureSource();
    const doc = engineDocumentationOf(source);
    const document = processDocumentOf(source);
    document.purpose = { ...document.purpose, proposal: { text: 'The program approves purchase orders.', anchors: [], origin: 'narrative' } };
    const CLAUDE: AiAuthorship = { provider: 'anthropic', modelId: 'claude-test', byok: true, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: null };
    const ai = { sop: CLAUDE, analysis: GEMINI, appVersion: 'v3.0.21' };
    const html = await buildEngineConfluenceHtml(document, businessLayerFor(doc), { processSteps: processStepsOf(doc.steps), ai }).text();
    expect(html).toContain(`<p class="card accent-information"${ORIGIN_HTML}>`);
    const claude = aiOriginHtmlAttributes(CLAUDE);
    expect(html).toContain(`<table${claude}><thead><tr><th>Step</th><th>Responsible (R)</th>`);
    expect(html).toContain(`<td${claude}>`);
    // The engine's tables (steps, rules, the appendix) carry no mark.
    expect(html.slice(html.indexOf('class="appendix"'))).not.toContain('data-origin');
    const edited = await buildEngineConfluenceHtml(document, businessLayerFor(doc), {
      processSteps: processStepsOf(doc.steps), ai, raciEdit: { editedAt: '2026-10-21T08:00:00.000Z' } as never,
    }).text();
    expect(edited).toContain('<table><thead><tr><th>Step</th><th>Responsible (R)</th>');
    // The SOP sentences stay the model's.
    expect(edited).toContain(`<td${claude}>`);
  });
});

/* ============================================================ Markdown */

test.describe('Markdown: the process description marks each model-written block', () => {
  const source = fixtureSource();
  const document = processDocumentOf(source);
  document.purpose = { ...document.purpose, proposal: { text: 'The program approves purchase orders.', anchors: [], origin: 'narrative' } };
  const raci = { title: 'RACI', note: 'Proposed by a language model', head: ['Step', 'R'], rows: [['1', 'Buyer']] };

  test('the proposal and the model\'s RACI open with cc:origin and close after; the engine\'s text has none', () => {
    const md = blocksMarkdown(processDocumentBlocks(document, { raci, ai: { analysis: GEMINI, sop: null } }));
    const open = aiOriginMarkdownOpen(GEMINI);
    expect(open).toBe('<!-- cc:origin value="ai" ai_provider="google-gemini" ai_model="gemini-test" -->');
    const at = md.indexOf(open);
    expect(at).toBeGreaterThan(-1);
    expect(md.slice(at, md.indexOf(AI_ORIGIN_MARKDOWN_CLOSE, at))).toContain('The program approves purchase orders.');
    // The RACI's writer was not recorded: marked all the same, and said.
    const raciOpen = md.indexOf('<!-- cc:origin value="ai" ai_provider="not-recorded" ai_model="not-recorded" -->\n| Step | R |');
    expect(raciOpen).toBeGreaterThan(-1);
    expect(md.slice(raciOpen).indexOf(AI_ORIGIN_MARKDOWN_CLOSE)).toBeGreaterThan(-1);
    // Opens and closes pair up.
    expect(md.split('<!-- cc:origin ').length).toBe(md.split(AI_ORIGIN_MARKDOWN_CLOSE).length);
    const engineOnly = blocksMarkdown(processDocumentBlocks(processDocumentOf(source), {}));
    expect(engineOnly).not.toContain('cc:origin');
  });

  test('an owner-edited RACI is the owner\'s: no mark', () => {
    const md = blocksMarkdown(processDocumentBlocks(document, { raci: { ...raci, note: 'Edited by the owner of the project · 2026-10-21.' }, ai: { analysis: GEMINI } }));
    expect(md).toContain('\n| Step | R |');
    expect(md).not.toContain('not-recorded" -->\n| Step | R |');
  });
});
