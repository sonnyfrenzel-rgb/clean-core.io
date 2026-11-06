import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AI_ORIGIN_MARKDOWN_CLOSE,
  aiOriginDocxTag,
  aiOriginHtmlAttributes,
  aiOriginMarkdownOpen,
  aiOriginMarksIn,
  aiMarkingOf,
  type AiAuthorship,
} from '../lib/ai-marking';
import {
  blocksDocxParts,
  blocksHtml,
  blocksMarkdown,
  nfrDocxParts,
  nfrHtml,
  nfrMarkdown,
  requirementsDocxParts,
  requirementsHtml,
  requirementsMarkdown,
  specificationDocxParts,
  specificationHtml,
  specificationMarkdown,
} from '../lib/requirements-export';
import { specConfluenceHtml, specDocxParts, specMarkdown } from '../lib/requirements-spec-export';
import { buildSpecDraft } from '../lib/requirements-spec';
import { buildRequirementSet } from '../lib/functional-requirements';
import { buildNfrSet } from '../lib/non-functional-requirements';
import { processDocumentBlocks, stepSummaryModelNames } from '../lib/process-document-outline';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { processDocumentationToMarkdown } from '../lib/process-documentation';
import { businessSopMarkdown } from '../lib/business-sop-markdown';
import { processStepsOf } from '../lib/business-summary';
import { dashboardDeliverableAuthorship, testCaseOrigin, UNRECORDED_AUTHORSHIP } from '../lib/ai-authorship';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import type { HandoverProject } from '../lib/handover';
import { checkDeliveryPackage } from '../lib/delivery-package-verify';
import type { PdStep } from '../lib/process-document';
import { businessLayerFor, engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';

/**
 * Acceptance test T08, "including mixed artefacts" (the legal review of 05.11.2026) — 3.0.21.
 *
 * In every file that mixes the engine's parts with a model's, each model-written
 * element carries its origin with provider and model, in the format's own
 * spelling — the cc:origin comment pair in Markdown, data-origin in HTML, a
 * tagged content control in Word, a column per row in Excel — and nothing the
 * engine wrote carries one. Every Word file is parsed back from its zip.
 */

const GEMINI: AiAuthorship = { provider: 'google-gemini', modelId: 'gemini-test', byok: false, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: 'v3.0.21' };
const CLAUDE: AiAuthorship = { provider: 'anthropic', modelId: 'claude-test', byok: true, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: null };
const GEMINI_MARK = { provider: 'google-gemini', model: 'gemini-test' };
const CLAUDE_MARK = { provider: 'anthropic', model: 'claude-test' };
const UNRECORDED_MARK = { provider: 'not-recorded', model: 'not-recorded' };

/** The parts zipped as Word would receive them, unzipped again, and `word/document.xml` read back. */
async function docxBack(parts: Record<string, string>): Promise<{ xml: string; core: string | null }> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  const back = await JSZip.loadAsync(await zip.generateAsync({ type: 'nodebuffer' }));
  return {
    xml: await back.file('word/document.xml')!.async('string'),
    core: back.file('docProps/core.xml') ? await back.file('docProps/core.xml')!.async('string') : null,
  };
}

/** The text of every content control's content, in order. */
function sdtTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:sdt>[\s\S]*?<w:sdtContent>([\s\S]*?)<\/w:sdtContent><\/w:sdt>/g)].map((m) => [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(''));
}

/** The text of the Markdown between each cc:origin pair. */
function markdownMarked(md: string): string[] {
  return [...md.matchAll(/<!-- cc:origin [^>]*-->([\s\S]*?)<!-- \/cc:origin -->/g)].map((m) => m[1]);
}

/** Every tag a well-formed WordprocessingML body of ours opens is closed, content controls included. */
function balanced(xml: string) {
  for (const tag of ['w:sdt', 'w:sdtContent', 'w:sdtPr', 'w:p', 'w:tbl', 'w:tr', 'w:tc']) {
    const open = (xml.match(new RegExp(`<${tag}(?=[ >])`, 'g')) ?? []).length;
    const close = (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
    expect(open, tag).toBe(close);
  }
  // A content control sits in the body or a paragraph, never straight in a row.
  expect(xml).not.toMatch(/<w:tr>(?:<w:trPr>.*?<\/w:trPr>)?<w:sdt>/);
}

const source = fixtureSource();
const fr = buildRequirementSet({ source });
const nfr = buildNfrSet({ source });
const base = { projectName: 'Fixture', fileName: 'fixture.abap', date: '2026-11-05' };

/* ===================================================== the marker itself */

test('one reader for the four spellings: Markdown, HTML, BPMN and Word all give provider and model back', () => {
  const text = [
    aiOriginMarkdownOpen(GEMINI),
    `<p${aiOriginHtmlAttributes(CLAUDE)}>x</p>`,
    '<cc:origin value="ai" ai_provider="google-gemini" ai_model="gemini-test"/>',
    `<w:tag w:val="${aiOriginDocxTag({ provider: null, modelId: null })}"/>`,
  ].join('\n');
  expect(aiOriginMarksIn(text)).toEqual([GEMINI_MARK, CLAUDE_MARK, GEMINI_MARK, UNRECORDED_MARK]);
  expect(aiOriginDocxTag(GEMINI)).toBe('cc:origin=ai;ai_provider=google-gemini;ai_model=gemini-test');
  expect(aiOriginMarksIn('# The engine wrote this\n\n| a | b |')).toEqual([]);
});

/* ========================================== functional requirements export */

test.describe('functional requirements: a sentence the model worded is marked in Markdown, HTML and Word', () => {
  const worded = fr.requirements[0];
  const engine = fr.requirements[1];
  const meta = { ...base, wording: { [worded.id]: 'The model words it.' }, ai: GEMINI, aiStatement: 'Generated with AI assistance (Google Gemini gemini-test) by Clean-Core.io v3.0.21, 2026-10-20' };

  test('Markdown: the overview cell and the statement carry the pair with provider and model; the engine\'s requirement none', () => {
    expect(fr.requirements.length).toBeGreaterThan(1);
    const md = requirementsMarkdown(fr, meta);
    expect(aiOriginMarksIn(md)).toEqual([GEMINI_MARK, GEMINI_MARK]);
    const marked = markdownMarked(md);
    expect(marked[0]).toBe('The model words it. *(AI-generated)*');
    expect(marked[1]).toContain('**The model words it.**');
    for (const m of marked) expect(m).not.toContain(engine.statement);
    expect(md.split('<!-- cc:origin ').length).toBe(md.split(AI_ORIGIN_MARKDOWN_CLOSE).length);
    // The engine's wording beside the proposal is the engine's, outside the pair.
    expect(md).toContain(`AI-generated. Engine wording: ${worded.statement}`);
    expect(marked.join('')).not.toContain('Engine wording');
  });

  test('HTML: the cell and the paragraph carry data-origin', () => {
    const html = requirementsHtml(fr, meta);
    const attrs = aiOriginHtmlAttributes(GEMINI);
    expect(html).toContain(`${attrs}>The model words it. (AI-generated)</td>`);
    expect(html).toContain(`<p${attrs}><strong>The model words it.</strong></p>`);
    expect(aiOriginMarksIn(html)).toHaveLength(2);
  });

  test('Word, parsed back: two content controls tagged with the origin, the engine\'s sentences outside them', async () => {
    const { xml, core } = await docxBack(requirementsDocxParts(fr, meta));
    balanced(xml);
    expect(aiOriginMarksIn(xml)).toEqual([GEMINI_MARK, GEMINI_MARK]);
    expect(xml).toContain('<w:alias w:val="AI-generated (Google Gemini gemini-test)"/><w:tag w:val="cc:origin=ai;ai_provider=google-gemini;ai_model=gemini-test"/><w:lock w:val="sdtLocked"/>');
    expect(sdtTexts(xml)).toEqual(['The model words it. (AI-generated)', 'The model words it.']);
    for (const t of sdtTexts(xml)) expect(t).not.toContain(engine.statement);
    expect(core).toContain('Generated with AI assistance (Google Gemini gemini-test)');
  });

  test('a writer nobody recorded is marked "not-recorded"; no wording, no mark at all', async () => {
    const unrecorded = { ...meta, ai: null };
    expect(aiOriginMarksIn(requirementsMarkdown(fr, unrecorded))).toEqual([UNRECORDED_MARK, UNRECORDED_MARK]);
    const plain = { ...base };
    expect(requirementsMarkdown(fr, plain)).not.toContain('cc:origin');
    expect(requirementsHtml(fr, plain)).not.toContain('data-origin');
    const { xml } = await docxBack(requirementsDocxParts(fr, plain));
    expect(xml).not.toContain('<w:sdt>');
  });
});

/* ===================================== non-functional and the specification */

test.describe('NFR and specification exports: proposals and worded sentences marked per element', () => {
  const named = { retention: { text: 'Keep the rows of ZMM_PO_APPR for ten years.', references: ['ZMM_PO_APPR'] } };

  test('NFR: the proposal cell is the model\'s in all three formats; the category and names are not', async () => {
    const meta = { ...base, proposals: named, proposalsAi: GEMINI, aiStatement: 'Generated with AI assistance (Google Gemini gemini-test) by Clean-Core.io v3.0.21, 2026-10-20' };
    const md = nfrMarkdown(nfr, meta);
    expect(aiOriginMarksIn(md)).toEqual([GEMINI_MARK]);
    expect(md).toMatch(/\| Data retention[^|]* \| <!-- cc:origin value="ai" ai_provider="google-gemini" ai_model="gemini-test" -->Keep the rows of ZMM_PO_APPR for ten years\.<!-- \/cc:origin --> \| ZMM_PO_APPR \|/);
    const html = nfrHtml(nfr, meta);
    expect(html).toContain(`${aiOriginHtmlAttributes(GEMINI)}>Keep the rows of ZMM_PO_APPR for ten years.</td>`);
    expect(aiOriginMarksIn(html)).toEqual([GEMINI_MARK]);
    const { xml } = await docxBack(nfrDocxParts(nfr, meta));
    balanced(xml);
    expect(sdtTexts(xml)).toEqual(['Keep the rows of ZMM_PO_APPR for ten years.']);
    // Without a writer handed in: not recorded. Without a printed proposal: nothing.
    expect(aiOriginMarksIn(nfrMarkdown(nfr, { ...meta, proposalsAi: undefined }))).toEqual([UNRECORDED_MARK]);
    expect(nfrMarkdown(nfr, { ...base, proposals: null })).not.toContain('cc:origin');
  });

  test('specification: the worded functional sentence twice and the NFR proposal once, each with its own writer', async () => {
    const meta = { ...base, proposals: named, proposalsAi: CLAUDE, wording: { [fr.requirements[0].id]: 'The model words it.' }, ai: GEMINI };
    expect(aiOriginMarksIn(specificationMarkdown(fr, nfr, meta))).toEqual([GEMINI_MARK, GEMINI_MARK, CLAUDE_MARK]);
    expect(aiOriginMarksIn(specificationHtml(fr, nfr, meta))).toEqual([GEMINI_MARK, GEMINI_MARK, CLAUDE_MARK]);
    const { xml } = await docxBack(specificationDocxParts(fr, nfr, meta));
    balanced(xml);
    expect(aiOriginMarksIn(xml)).toEqual([GEMINI_MARK, GEMINI_MARK, CLAUDE_MARK]);
  });

  test('requirements specification: only the proposal after an open decision\'s answer is marked, not the answer', async () => {
    const meta = { date: '2026-11-05', fileName: 'Z_MM_PO_APPROVAL.abap', sourceSha256: 'a'.repeat(64), revision: 1, author: 'owner@example.com', history: [], proposalsAi: GEMINI };
    const spec = buildSpecDraft({ projectName: 'Fixture', fr, nfr, proposals: { slaRequirements: 'For TBD-13: business hours, 2 s.' } });
    const proposals = spec.decisions.filter((d) => d.proposal.trim() !== '').length;
    expect(proposals).toBeGreaterThan(0);
    const md = specMarkdown(spec, meta);
    expect(md).toContain('Open · <!-- cc:origin value="ai" ai_provider="google-gemini" ai_model="gemini-test" -->AI-generated: For TBD-13: business hours, 2 s.<!-- /cc:origin -->');
    expect(aiOriginMarksIn(md)).toHaveLength(proposals);
    const html = specConfluenceHtml(spec, meta);
    expect(html).toContain(`>Open · <span${aiOriginHtmlAttributes(GEMINI)}>AI-generated: For TBD-13: business hours, 2 s.</span></td>`);
    const { xml } = await docxBack(specDocxParts(spec, meta));
    balanced(xml);
    expect(sdtTexts(xml)).toContain('AI-generated: For TBD-13: business hours, 2 s.');
    // The answer ("Open · ") stays outside the control.
    expect(xml).toMatch(/<w:t xml:space="preserve">Open · <\/w:t><\/w:r><w:sdt>/);
    expect(aiOriginMarksIn(specMarkdown(spec, { ...meta, proposalsAi: undefined }))[0]).toEqual(UNRECORDED_MARK);
    const without = buildSpecDraft({ projectName: 'Fixture', fr, nfr });
    expect(specMarkdown(without, meta)).not.toContain('cc:origin');
    expect((await docxBack(specDocxParts(without, meta))).xml).not.toContain('<w:sdt>');
  });
});

/* ============================================ the process description */

test.describe('process description: Word marks what Markdown marks; business names are the naming model\'s', () => {
  const raci = { title: 'RACI', note: 'Proposed by a language model', head: ['Step', 'R'], rows: [['1', 'Buyer']] };

  function withProposalAndName() {
    const document = processDocumentOf(source);
    document.purpose = { ...document.purpose, proposal: { text: 'The program approves purchase orders.', anchors: [], origin: 'narrative' } };
    const step = document.overview.path.find((e): e is PdStep => e.kind === 'step')!;
    step.businessName = 'Approve the order';
    return { document, step };
  }

  test('Markdown and Word carry the same marks: proposal, step table, step summary, step heading and RACI', async () => {
    const { document } = withProposalAndName();
    const blocks = processDocumentBlocks(document, { raci, ai: { analysis: GEMINI, sop: CLAUDE } });
    const md = blocksMarkdown(blocks);
    const marks = aiOriginMarksIn(md);
    expect(marks[0]).toEqual(GEMINI_MARK);
    expect(marks.filter((m) => m.provider === 'not-recorded').length).toBeGreaterThanOrEqual(3);
    expect(marks).toContainEqual(CLAUDE_MARK);
    expect(markdownMarked(md)).toContain('Approve the order (AI-generated)');
    expect(md).toMatch(/#### \d+[a-z.\d]*\. <!-- cc:origin value="ai" ai_provider="not-recorded" ai_model="not-recorded" -->Approve the order<!-- \/cc:origin -->/);
    const { xml } = await docxBack(blocksDocxParts(blocks, { aiStatements: ['Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.21, date not recorded'] }));
    balanced(xml);
    expect(aiOriginMarksIn(xml)).toEqual(marks);
    // The RACI the SOP model proposed is one control around the whole table.
    expect(xml).toMatch(/<w:sdt><w:sdtPr><w:alias w:val="AI-generated \(Anthropic Claude claude-test\)"\/><w:tag w:val="cc:origin=ai;ai_provider=anthropic;ai_model=claude-test"\/><w:lock w:val="sdtLocked"\/><\/w:sdtPr><w:sdtContent><w:tbl>/);
    expect(sdtTexts(xml)).toContain('Approve the order');
    // The HTML speller of the same blocks marks the same elements.
    expect(aiOriginMarksIn(blocksHtml(blocks))).toEqual(marks);
  });

  test('without model text the files carry no mark at all', async () => {
    const blocks = processDocumentBlocks(processDocumentOf(source), {});
    expect(blocksMarkdown(blocks)).not.toContain('cc:origin');
    expect((await docxBack(blocksDocxParts(blocks))).xml).not.toContain('<w:sdt>');
  });

  test('the Confluence page marks the business name in the step table, the summary and the heading, and names the naming model in its header', async () => {
    const { document } = withProposalAndName();
    expect(stepSummaryModelNames(document).filter(Boolean)).toHaveLength(1);
    const doc = engineDocumentationOf(source);
    const html = await buildEngineConfluenceHtml(document, null, { processSteps: processStepsOf(doc.steps), ai: { sop: null, analysis: GEMINI, appVersion: 'v3.0.21' } }).text();
    const unrecorded = aiOriginHtmlAttributes({ provider: null, modelId: null });
    expect(html).toContain(`<td${unrecorded}>Approve the order (AI-generated)</td>`);
    expect(html).toContain(`<td${unrecorded}>Approve the order</td>`);
    expect(html).toMatch(new RegExp(`<h4 data-doc-step="">\\d+[a-z.\\d]*\\. <span${unrecorded.replace(/[()]/g, '\\$&')}>Approve the order</span></h4>`));
    expect(html).toContain('<!-- Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.21, date not recorded -->');
    // The engine's own page: no name, no naming statement.
    const engine = await buildEngineConfluenceHtml(processDocumentOf(source), null, { processSteps: processStepsOf(doc.steps), ai: { sop: null, analysis: GEMINI, appVersion: 'v3.0.21' } }).text();
    expect(engine).not.toContain('data-origin');
    expect(engine).not.toContain('Generated with AI assistance');
  });
});

/* =========================== the process documentation and the business SOP */

test.describe('the delivery package\'s Markdown files mark the naming and SOP models\' elements', () => {
  function namedDocumentation() {
    const doc = engineDocumentationOf(source);
    const step = doc.steps.find((s) => s.statementId) ?? doc.steps[0];
    step.businessName = 'Approve the order';
    step.lane = 'Purchasing';
    doc.proposedLanes = [{ name: 'Buyer', authorityObject: null, anchor: null, undetermined: { reason: 'from naming alone' } as never, provenance: 'proposed', statement: 'Buyer' }];
    return doc;
  }

  test('process-documentation.md: every business name and lane in the pair; the engine\'s file without names has none', () => {
    const md = processDocumentationToMarkdown(namedDocumentation());
    const marked = markdownMarked(md);
    expect(marked).toContain('Buyer');
    expect(marked).toContain('Purchasing');
    expect(marked.filter((m) => m.includes('Approve the order')).length).toBeGreaterThanOrEqual(2);
    for (const m of aiOriginMarksIn(md)) expect(m).toEqual(UNRECORDED_MARK);
    expect(processDocumentationToMarkdown(engineDocumentationOf(source))).not.toContain('cc:origin');
    // The SOP prompt reads the file as context: unchanged, no marks.
    expect(processDocumentationToMarkdown(namedDocumentation(), { originMarks: false })).not.toContain('cc:origin');
  });

  test('the provenance legends call names and lanes AI-generated only when the file shows one (names paused in 3.0.21)', () => {
    const plain = processDocumentationToMarkdown(engineDocumentationOf(source));
    expect(plain).not.toContain('Business names and lanes are AI-generated');
    expect(plain).not.toContain('Business names from the naming stage are AI-generated');
    expect(plain).toContain('Provenance: Reconstructed.');
    expect(plain).not.toContain('The one exception is marked where it appears');
    expect(plain).toContain('> Read by the engine out of the whole source the signed run analysed.');
    const named = processDocumentationToMarkdown(namedDocumentation());
    expect(named).toContain('The one exception is marked where it appears: business names and lanes from the naming stage are AI-generated.');
    expect(named).toContain('Provenance: Reconstructed, unless a column says otherwise. Business names and lanes are AI-generated.');
    expect(named).toContain('Business names from the naming stage are AI-generated.');
    // A lane alone, no business name: the table's legend names it, the main path's does not.
    const laneOnly = engineDocumentationOf(source);
    laneOnly.steps[0].lane = 'Purchasing';
    const laneMd = processDocumentationToMarkdown(laneOnly);
    expect(laneMd).toContain('Business names and lanes are AI-generated.');
    expect(laneMd).not.toContain('Business names from the naming stage are AI-generated');
  });

  test('business-documentation.md: statements, exceptions and the RACI marked with the SOP model; the engine\'s lists not', () => {
    const doc = engineDocumentationOf(source);
    const md = businessSopMarkdown(JSON.stringify(businessLayerFor(doc)), doc, { ai: CLAUDE });
    const marks = aiOriginMarksIn(md);
    expect(marks.length).toBeGreaterThan(3);
    for (const m of marks) expect(m).toEqual(CLAUDE_MARK);
    expect(md.split('<!-- cc:origin ').length).toBe(md.split(AI_ORIGIN_MARKDOWN_CLOSE).length);
    // The engine's "what the program does not do" and the technical steps stay outside every pair.
    const outside = md.replace(/<!-- cc:origin [^>]*-->[\s\S]*?<!-- \/cc:origin -->/g, '');
    expect(outside).toContain('## Steps');
    for (const m of markdownMarked(md)) expect(m).not.toContain('**Technical steps');
    expect(markdownMarked(md).some((m) => m.includes('| No. | Step |'))).toBe(true);
  });

  /* ---------------------------------------------- the offline verifier */

  const LEGACY = 'REPORT zai.\nWRITE / 1.\n';
  function project(solutionDesign = '# Design'): HandoverProject {
    return {
      id: 'p-ai', name: 'AI marking', userId: 'owner', legacyCode: LEGACY, activeRunId: 'run-ai',
      extensibilityRoute: 'Side-by-Side (SAP BTP)', solutionDesign, analysis: JSON.stringify({ summary: 'x' }),
      generatedCode: JSON.stringify([{ path: 'srv/service.ts', content: "export const x = 1;\n" }]),
      generationBinding: { generatedAt: '2026-10-20T10:00:00.000Z', model: { receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-test', byok: false, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: 'v3.0.21' } },
      businessDocumentation: '{}',
      businessDocumentationModel: { receipt: 'verified', provider: 'anthropic', modelId: 'claude-test', byok: true, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: 'v3.0.21' },
      auditMetadata: { inputFingerprint: { sha256: 'f'.repeat(64), fileName: 'zai.abap' }, modelCard: { provider: 'google-gemini', model: 'gemini-analysis', modelParticipation: 'narrative-attested', engineVersion: 'v3.0.21' } },
    } as unknown as HandoverProject;
  }

  async function packageWith(edit?: (files: Array<{ path: string; content: string }>) => void, solutionDesign?: string) {
    const p = project(solutionDesign);
    const facts = deliveryFactsOf(p, {
      phases: workflowSteps(p), rules: ruleFactsOf(null as never), score: scoreFactsOf(p, null),
      generatedAt: '2026-10-20T12:00:00.000Z', appVersion: 'v3.0.21', referenceSection: '', documentationFromEngine: true,
    });
    const bundle = createDeliveryBundle();
    bundle.file('srv/service.ts', "export const x = 1;\n", 'generated');
    const docs = bundle.folder('docs');
    docs.file('process-documentation.md', processDocumentationToMarkdown(namedDocumentation()));
    const doc = engineDocumentationOf(source);
    docs.file('business-documentation.md', businessSopMarkdown(JSON.stringify(businessLayerFor(doc)), doc, { ai: CLAUDE }));
    const files = finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' }).files.map((f) => ({ ...f }));
    edit?.(files);
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const path = join(mkdtempSync(join(tmpdir(), 'delivery-t08-')), 'package.zip');
    writeFileSync(path, buf);
    return { buf, path, files, manifest: JSON.parse(files.find((f) => f.path === 'manifest.json')!.content) };
  }

  const cli = (...args: string[]) => {
    const r = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-pack.mjs'), ...args], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };

  test('the engine documentation with names is co-written: header, manifest row, and both verifiers list its elements', async () => {
    const pkg = await packageWith();
    const doc = pkg.files.find((f) => f.path === 'docs/process-documentation.md')!;
    expect(aiMarkingOf(doc.content)).toBe('Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.21, date not recorded');
    expect(pkg.manifest.files.find((f: { path: string }) => f.path === 'docs/process-documentation.md').ai).toBe('documentation');
    const check = await checkDeliveryPackage(new Uint8Array(pkg.buf));
    expect(check.verdict, check.problems.join(' | ')).toBe('consistent');
    const processDoc = check.elements.find((e) => e.path === 'docs/process-documentation.md')!;
    expect(processDoc.source).toBe('documentation');
    expect(processDoc.marks).toEqual([{ ...UNRECORDED_MARK, count: aiOriginMarksIn(doc.content).length }]);
    const sop = check.elements.find((e) => e.path === 'docs/business-documentation.md')!;
    expect(sop.source).toBe('sop');
    expect(sop.marks.map((m) => `${m.provider} ${m.model}`)).toEqual(['anthropic claude-test']);
    const out = cli(pkg.path);
    expect(out.out).toContain('docs/process-documentation.md');
    expect(out.out).toContain('model-written elements marked where they stand');
    expect(out.out).toContain('by anthropic claude-test');
    expect(out.status, out.out).toBe(2);
  });

  /** A design whose option comparison the decision record's weighing shows as the design's proposal (model text). */
  const DESIGN_WITH_COMPARISON = JSON.stringify({
    architectureOverview: { approachDescription: 'CAP.', nodeFramework: 'SAP CAP', runtimePlatform: 'SAP BTP' },
    optionComparison: {
      options: [
        { option: 'standard', fitGap: 'No SAP standard process covers | the reconciliation.' },
        { option: 'keyuser', fitGap: 'Key-user extensibility is not feasible: the logic comprises 496 executable statements.' },
        { option: 'rap', fitGap: 'An in-app RAP object would fit the posting logic.' },
        { option: 'cap', fitGap: 'A side-by-side CAP service decouples the report.' },
      ],
      recommended: 'cap',
      decisionReason: 'The report reads only released APIs.',
    },
  });

  test('decision.md: each cell of the design\'s comparison in the pair, header, manifest row "design", both verifiers list it', async () => {
    const pkg = await packageWith(undefined, DESIGN_WITH_COMPARISON);
    const decision = pkg.files.find((f) => f.path === 'docs/decision.md')!;
    const marked = markdownMarked(decision.content);
    expect(marked.length).toBeGreaterThanOrEqual(3);
    expect(marked.some((m) => m.includes('A side-by-side CAP service decouples the report.'))).toBe(true);
    // The pipe inside a proposal stays escaped inside the pair, so the table keeps its four columns.
    expect(marked.some((m) => m.includes('covers \\| the reconciliation'))).toBe(true);
    for (const m of aiOriginMarksIn(decision.content)) expect(m).toEqual(UNRECORDED_MARK);
    expect(decision.content.split('<!-- cc:origin ').length).toBe(decision.content.split(AI_ORIGIN_MARKDOWN_CLOSE).length);
    // The engine's reading and its "why" stay outside every pair.
    for (const m of marked) expect(m).not.toMatch(/Speaks for it|Speaks against it|The engine routes/);
    expect(aiMarkingOf(decision.content)).toMatch(/^Generated with AI assistance \(provider and model not recorded\) by Clean-Core\.io v3\.0\.21, /);
    expect(decision.content).toContain("except the design's comparison in the weighing, which is model text");
    expect(pkg.manifest.files.find((f: { path: string }) => f.path === 'docs/decision.md').ai).toBe('design');
    const design = pkg.manifest.aiGeneration.statements.find((st: { source: string }) => st.source === 'design');
    expect(design.files).toContain('docs/decision.md');
    expect(design.statement).toBe(aiMarkingOf(decision.content));
    const check = await checkDeliveryPackage(new Uint8Array(pkg.buf));
    expect(check.verdict, check.problems.join(' | ')).toBe('consistent');
    expect(check.unstatedElements).toEqual([]);
    expect(check.headerMismatch).toEqual([]);
    const row = check.elements.find((e) => e.path === 'docs/decision.md')!;
    expect(row.source).toBe('design');
    expect(row.marks).toEqual([{ ...UNRECORDED_MARK, count: marked.length }]);
    const out = cli(pkg.path);
    expect(out.out).toMatch(/element.*docs\/decision\.md/);
    expect(out.out).not.toContain('marks model-written elements, but the manifest names it as written by no model');
    expect(out.status, out.out).toBe(2);
  });

  test('decision.md without a design comparison is the engine\'s alone: no pair, no header, manifest row null', async () => {
    const pkg = await packageWith();
    const decision = pkg.files.find((f) => f.path === 'docs/decision.md')!;
    expect(decision.content).not.toContain('cc:origin');
    expect(aiMarkingOf(decision.content)).toBeNull();
    expect(decision.content).toContain('Written by Clean-Core.io from the records of the project, without a model. Not signed');
    expect(pkg.manifest.files.find((f: { path: string }) => f.path === 'docs/decision.md').ai).toBeNull();
    const check = await checkDeliveryPackage(new Uint8Array(pkg.buf));
    expect(check.elements.find((e) => e.path === 'docs/decision.md')).toBeUndefined();
  });

  test('a file that marks model-written elements while the manifest names no model for it fails both verifiers', async () => {
    const pkg = await packageWith((fs) => {
      const m = fs.find((x) => x.path === 'manifest.json')!;
      const parsed = JSON.parse(m.content);
      parsed.files.find((r: { path: string }) => r.path === 'docs/process-documentation.md').ai = null;
      for (const st of parsed.aiGeneration.statements) st.files = st.files.filter((f: string) => f !== 'docs/process-documentation.md');
      m.content = JSON.stringify(parsed);
    });
    const check = await checkDeliveryPackage(new Uint8Array(pkg.buf));
    expect(check.verdict).toBe('failed');
    expect(check.unstatedElements).toEqual(['docs/process-documentation.md']);
    const out = cli(pkg.path);
    expect(out.out).toContain('marks model-written elements, but the manifest names it as written by no model');
    expect(out.status).toBe(1);
  });
});

/* ===================================================== Excel and the dashboard */

test('Excel test cases: a model\'s scenario carries origin, provider and model; an engine case none', () => {
  expect(testCaseOrigin({ id: 'TC_01' }, GEMINI)).toEqual({ origin: 'ai', provider: 'google-gemini', model: 'gemini-test' });
  expect(testCaseOrigin({ id: 'EC_01', origin: 'engine' }, GEMINI)).toBeNull();
  expect(testCaseOrigin({ id: 'TC_01' }, UNRECORDED_AUTHORSHIP.tests)).toEqual({ origin: 'ai', provider: 'not-recorded', model: 'not-recorded' });
  expect(testCaseOrigin({ id: 'TC_01' }, null)).toBeNull();
});

test('dashboard downloads: each model-written deliverable has a writer for its header; the engine\'s none', () => {
  const facts = { ...UNRECORDED_AUTHORSHIP, analysis: GEMINI, documentation: null };
  const engineOpts = { testsAreSuite: true, documentationFromEngine: true };
  expect(dashboardDeliverableAuthorship('analysis', '# A', facts, engineOpts)).toBe(GEMINI);
  expect(dashboardDeliverableAuthorship('legacy', 'REPORT z.', facts, engineOpts)).toBeNull();
  expect(dashboardDeliverableAuthorship('test_report', '## Test status', facts, engineOpts)).toBeNull();
  expect(dashboardDeliverableAuthorship('docs', '# Process documentation', facts, engineOpts)).toBeNull();
  expect(dashboardDeliverableAuthorship('docs', processDocumentationToMarkdown(engineDocumentationOf(source)), facts, engineOpts)).toBeNull();
  const named = engineDocumentationOf(source);
  named.steps[0].businessName = 'Approve the order';
  expect(dashboardDeliverableAuthorship('docs', processDocumentationToMarkdown(named), facts, engineOpts)).toEqual(UNRECORDED_AUTHORSHIP.documentation);
  expect(dashboardDeliverableAuthorship('docs', '# Legacy', facts, { ...engineOpts, documentationFromEngine: false })).toEqual(UNRECORDED_AUTHORSHIP.documentation);
  expect(dashboardDeliverableAuthorship('tests', '[]', facts, { ...engineOpts, testsAreSuite: false })).toBeNull();
  expect(dashboardDeliverableAuthorship('presentation', '# Deck', facts, engineOpts)).not.toBeNull();
});
