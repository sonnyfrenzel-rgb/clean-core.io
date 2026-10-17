import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AI_MARKING_BASIS,
  aiMarkingField,
  aiMarkingOf,
  aiMarkingStatement,
  aiModelRecordOf,
  commentSyntaxOf,
  hasAiMarking,
  withAiMarking,
  withAiMarkingHtml,
  withAiMarkings,
  type AiAuthorship,
} from '../lib/ai-marking';
import { blocksMarkdown, nfrDocxParts, nfrHtml, nfrMarkdown, specificationDocxParts, specificationHtml, specificationMarkdown } from '../lib/requirements-export';
import { specConfluenceHtml, specDocxParts, specMarkdown } from '../lib/requirements-spec-export';
import { buildSpecDraft } from '../lib/requirements-spec';
import { buildRequirementSet } from '../lib/functional-requirements';
import { buildNfrSet } from '../lib/non-functional-requirements';
import { aiAuthorshipFactsOf, modelFilledFiles } from '../lib/ai-authorship';
import { issueModelReceipt, verifyModelReceipt, verifyModelReceiptIssuer, MODEL_PROVIDER_ID } from '../lib/model-receipt';
import { RECEIPT_PROVIDER_ID, OWN_CLAUDE_MODEL } from '../lib/model-providers';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import type { HandoverProject } from '../lib/handover';
import { auditPackAiGeneration } from '../lib/audit-pack-build';
import {
  canonicalAuditManifest,
  canonicalManifestDefect,
  MANIFEST_VERSION_ED25519,
  MANIFEST_VERSION_HMAC,
  type AuditPackAiGeneration,
} from '../lib/audit-pack-canonical';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import { buildEvidenceChain, coversOf } from '../lib/evidence-chain';
import { blocksDocxParts } from '../lib/requirements-export';
import { buildDesignExportHtml } from '../lib/design-export';
import type { Project } from '../lib/types';
import { buildEngineConfluenceHtml } from '../lib/documentation-export';
import { processStepsOf } from '../lib/business-summary';
import { businessLayerFor, engineDocumentationOf, fixtureSource, processDocumentOf } from './helpers/business-layer-fixture';

/**
 * Machine-readable marking of model-generated content — AI Act Art. 50(2)
 * (roadmap 3.0.17, legal deadline 02.12.2026).
 *
 * One statement, `Generated with AI assistance (<provider> <model>) by
 * Clean-Core.io <version>, <date>`, in every artefact a model wrote or
 * co-wrote — as a header comment in the artefact's own syntax, and as a
 * metadata field in the exports — with provider and model from the receipt the
 * server verified, never a name written into the code. Files the engine wrote
 * alone, and deterministic findings, carry nothing.
 */

const KEY = 'test-audit-signing-key-for-the-ai-marking-spec-32';
const UID = 'owner-uid';
const ISSUED = Date.UTC(2026, 9, 17, 9, 30, 0);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** A receipt as `/api/gemini` issues it, and the record the store makes of it. */
function recordOf(provider: string, modelId: string, byok: boolean, stage = 'transformation') {
  const receipt = issueModelReceipt({ uid: UID, text: 'any answer', provider, modelId, byok, issuedAt: ISSUED, stage }, KEY);
  const verdict = verifyModelReceiptIssuer(receipt, { uid: UID, key: KEY, stage, now: ISSUED + 60_000 });
  expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
  return aiModelRecordOf((verdict as { ok: true; receipt: typeof receipt }).receipt, 'v3.0.17');
}

const GEMINI = recordOf(MODEL_PROVIDER_ID, 'gemini-test-model', false);
const CLAUDE = recordOf(RECEIPT_PROVIDER_ID.anthropic, OWN_CLAUDE_MODEL, true, 'testing');

/* ============================================================ the statement */

test.describe('the statement', () => {
  test('names provider and model from the receipt, the version and the date of the generation', () => {
    const a: AiAuthorship = { provider: GEMINI.provider, modelId: GEMINI.modelId, byok: false, generatedAt: GEMINI.generatedAt, appVersion: GEMINI.appVersion };
    expect(aiMarkingStatement(a, 'v9.9.9')).toBe('Generated with AI assistance (Google Gemini gemini-test-model) by Clean-Core.io v3.0.17, 2026-10-17');
    // BYOK: the account's own provider, as the receipt names it.
    const c: AiAuthorship = { provider: CLAUDE.provider, modelId: CLAUDE.modelId, byok: true, generatedAt: CLAUDE.generatedAt, appVersion: null };
    expect(aiMarkingStatement(c, 'v3.0.17')).toBe(`Generated with AI assistance (Anthropic Claude ${OWN_CLAUDE_MODEL}) by Clean-Core.io v3.0.17, 2026-10-17`);
    const field = aiMarkingField(c, 'v3.0.17');
    expect(field).toMatchObject({ provider: 'anthropic', model: OWN_CLAUDE_MODEL, keyOwner: 'own', generatedOn: '2026-10-17', basis: AI_MARKING_BASIS });
  });

  test('a model-written artefact whose call was not recorded says so, never a name nobody observed', () => {
    const unknown: AiAuthorship = { provider: null, modelId: null, byok: null, generatedAt: null, appVersion: null };
    expect(aiMarkingStatement(unknown, 'v3.0.17')).toBe('Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.17, date not recorded');
    expect(aiMarkingField(unknown, 'v3.0.17')).toMatchObject({ provider: null, model: null, keyOwner: null, generatedOn: null });
  });

  test('the store verifies the receipt it records: account, stage and MAC, without the text of one answer', () => {
    const receipt = issueModelReceipt({ uid: UID, text: 'a fill', provider: MODEL_PROVIDER_ID, modelId: 'm', byok: false, issuedAt: ISSUED, stage: 'transformation' }, KEY);
    const now = ISSUED + 1000;
    expect(verifyModelReceiptIssuer(receipt, { uid: UID, key: KEY, stage: 'transformation', now }).ok).toBe(true);
    expect(verifyModelReceiptIssuer(receipt, { uid: 'someone-else', key: KEY, stage: 'transformation', now })).toEqual({ ok: false, refusal: 'wrong-account' });
    expect(verifyModelReceiptIssuer(receipt, { uid: UID, key: KEY, stage: 'testing', now })).toEqual({ ok: false, refusal: 'wrong-stage' });
    expect(verifyModelReceiptIssuer({ ...receipt, modelId: 'claimed-model' }, { uid: UID, key: KEY, stage: 'transformation', now })).toEqual({ ok: false, refusal: 'forged' });
    expect(verifyModelReceiptIssuer(null, { uid: UID, key: KEY, stage: 'transformation', now })).toEqual({ ok: false, refusal: 'absent' });
    expect(verifyModelReceiptIssuer(receipt, { uid: UID, key: KEY, stage: 'transformation', now: ISSUED + 25 * 3600_000 })).toEqual({ ok: false, refusal: 'expired' });
    // The text-bound verifier is unchanged: another text is still refused, and ten minutes stay ten minutes.
    expect(verifyModelReceipt(receipt, { uid: UID, text: 'another text', key: KEY, now })).toEqual({ ok: false, refusal: 'text-mismatch' });
    expect(verifyModelReceipt(receipt, { uid: UID, text: 'a fill', key: KEY, now: ISSUED + 11 * 60_000 })).toEqual({ ok: false, refusal: 'expired' });
    expect(verifyModelReceipt(receipt, { uid: UID, text: 'a fill', key: KEY, now }).ok).toBe(true);
  });
});

/* ========================================================= per artefact type */

test.describe('one header comment, in the artefact\'s own syntax', () => {
  const S = 'Generated with AI assistance (Google Gemini gemini-test-model) by Clean-Core.io v3.0.17, 2026-10-17';

  test('ABAP, TypeScript, CDS, Markdown, HTML, XML, YAML — and JSON is left to the metadata field', () => {
    expect(withAiMarking('src/zcl_x_logic.clas.abap', 'CLASS zcl_x_logic DEFINITION PUBLIC.\nENDCLASS.\n', S).split('\n')[0]).toBe(`* ${S}`);
    expect(withAiMarking('srv/service.ts', "import cds from '@sap/cds';\n", S).split('\n')[0]).toBe(`// ${S}`);
    expect(withAiMarking('srv/service.cds', 'service S {}\n', S).split('\n')[0]).toBe(`// ${S}`);
    expect(withAiMarking('src/zi_x.ddls.asddls', '@EndUserText.label: \'x\'\ndefine view entity ZI_X as select from t000 { mandt }\n', S).split('\n')[0]).toBe(`// ${S}`);
    expect(withAiMarking('docs/business-analysis.md', '# Analysis\n', S).split('\n')[0]).toBe(`<!-- ${S} -->`);
    expect(withAiMarking('ci.yml', 'name: ci\n', S).split('\n')[0]).toBe(`# ${S}`);
    const json = '{"name":"x"}\n';
    expect(commentSyntaxOf('package.json')).toBeNull();
    expect(withAiMarking('package.json', json, S)).toBe(json);
  });

  test('a doctype, an XML declaration and a shebang stay first; marking twice replaces, never doubles', () => {
    expect(withAiMarking('a.html', '<!DOCTYPE html>\n<html></html>', S).split('\n')).toEqual(['<!DOCTYPE html>', `<!-- ${S} -->`, '<html></html>']);
    expect(withAiMarking('a.xml', '<?xml version="1.0"?>\n<a/>', S).split('\n')[1]).toBe(`<!-- ${S} -->`);
    expect(withAiMarking('run.mjs', '#!/usr/bin/env node\nconsole.log(1)', S).split('\n').slice(0, 2)).toEqual(['#!/usr/bin/env node', `// ${S}`]);
    const once = withAiMarking('srv/a.ts', 'export const a = 1;\n', S);
    const again = withAiMarking('srv/a.ts', once, S.replace('2026-10-17', '2026-10-18'));
    expect(again.split('\n').filter((l) => l.includes('Generated with AI assistance'))).toHaveLength(1);
    expect(aiMarkingOf(again)).toContain('2026-10-18');
  });

  test('a provider or model name cannot close the comment or break out of the attribute', () => {
    const hostile = aiMarkingStatement({ provider: 'evil', modelId: 'm --> <script>alert(1)</script> */ "x', byok: false, generatedAt: null, appVersion: 'v1' }, 'v1');
    const md = withAiMarking('a.md', '# x\n', hostile);
    expect(md.split('\n')[0]).toMatch(/^<!-- .* -->$/);
    expect(md.split('\n')[0].indexOf('-->')).toBe(md.split('\n')[0].length - 3);
    expect(withAiMarking('a.ts', 'x', hostile).split('\n')[0]).not.toContain('*/');
    const html = withAiMarkingHtml('<!DOCTYPE html>\n<html><head><title>t</title></head><body></body></html>', [hostile]);
    const [doctype, comment, ...rest] = html.split('\n');
    expect(doctype).toBe('<!DOCTYPE html>');
    // Inside the comment the name is inert text, and the comment ends where it should; outside it, nothing of it is markup.
    expect(comment.indexOf('-->')).toBe(comment.length - 3);
    expect(rest.join('\n')).not.toContain('<script>');
    expect(rest.join('\n')).toContain('<meta name="ai-generated" content="Generated with AI assistance (evil m -&gt; &lt;script&gt;');
  });
});

/* ======================================================== the delivery package */

const SERVICE = "import express from 'express';\nexport const app = express();\n";
const SUITE = "import { test } from 'node:test';\ntest('TC_01', () => {});\n";

function project(extra: Record<string, unknown> = {}): HandoverProject {
  return {
    id: 'p-ai',
    name: 'AI marking',
    userId: UID,
    legacyCode: 'REPORT zai.\nWRITE / 1.\n',
    activeRunId: 'run-ai',
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    solutionDesign: '# Design',
    analysis: JSON.stringify({ summary: 'x' }),
    generatedCode: JSON.stringify([
      { path: 'srv/service.ts', content: SERVICE },
      { path: 'db/schema.cds', content: 'entity Items { key id : String; }\n' },
      { path: 'package.json', content: '{"name":"x","dependencies":{"express":"^4"}}' },
    ]),
    testSuite: { code: SUITE },
    generationBinding: { generatedAt: '2026-10-17T09:31:00.000Z', model: GEMINI },
    auditMetadata: {
      modelCard: { provider: 'google-gemini', model: 'gemini-analysis', modelParticipation: 'narrative-attested', engineVersion: 'v3.0.16', byokUsed: false, analysisTimestamp: '2026-10-16T08:00:00.000Z' },
    },
    ...extra,
  } as unknown as HandoverProject;
}

function deliver(p: HandoverProject, files?: Array<{ path: string; content: string }>) {
  const facts = deliveryFactsOf(p, {
    phases: workflowSteps(p),
    rules: ruleFactsOf(null as never),
    score: scoreFactsOf(p, null),
    generatedAt: '2026-10-17T12:00:00.000Z',
    appVersion: 'v3.0.17',
    referenceSection: '',
    documentationFromEngine: true,
  });
  const bundle = createDeliveryBundle();
  for (const f of files ?? (JSON.parse(p.generatedCode as string) as Array<{ path: string; content: string }>)) bundle.file(f.path, f.content, 'generated');
  bundle.file('test.ts', (p.testSuite as { code: string }).code, 'generated', 'tests');
  bundle.folder('docs').file('business-analysis.md', '# Business analysis\n');
  bundle.folder('docs').file('solution-design.md', '# Solution design\n');
  bundle.folder('docs').file('process-documentation.md', '# Process documentation\n');
  const out = finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' });
  const file = (name: string) => out.files.find((f) => f.path === name)?.content ?? null;
  return { ...out, file, manifest: JSON.parse(file('manifest.json')!) };
}

test.describe('the delivery package', () => {
  test('a single-call package: every model-written file carries its statement, provider and model as the receipt named them', () => {
    const pkg = deliver(project());
    const code = 'Generated with AI assistance (Google Gemini gemini-test-model) by Clean-Core.io v3.0.17, 2026-10-17';
    expect(pkg.file('srv/service.ts')!.split('\n')[0]).toBe(`// ${code}`);
    expect(pkg.file('db/schema.cds')!.split('\n')[0]).toBe(`// ${code}`);
    // The single call wrote the suite too, so it carries the package's statement.
    expect(pkg.file('test.ts')!.split('\n')[0]).toBe(`// ${code}`);
    // The narrative's model, from the signed run's card.
    expect(pkg.file('docs/business-analysis.md')!.split('\n')[0]).toBe('<!-- Generated with AI assistance (Google Gemini gemini-analysis) by Clean-Core.io v3.0.16, 2026-10-16 -->');
    // The design's call is not recorded per project: marked, and said.
    expect(pkg.file('docs/solution-design.md')!.split('\n')[0]).toContain('(provider and model not recorded)');
    // What the engine wrote alone carries nothing: records, templates, the engine's process documentation.
    for (const engine of ['README.md', 'STATUS.md', 'docs/decision.md', 'docs/rule-register.md', 'docs/process-documentation.md', 'tsconfig.json', '.github/workflows/ci.yml']) {
      const content = pkg.file(engine);
      if (content !== null) expect(hasAiMarking(content), engine).toBe(false);
    }
    // The manifest says the same in its field, and names the JSON files the comment cannot reach.
    const code$ = pkg.manifest.aiGeneration.statements.find((s: { source: string }) => s.source === 'code');
    expect(code$).toMatchObject({ statement: code, provider: 'google-gemini', model: 'gemini-test-model', keyOwner: 'platform', generatedOn: '2026-10-17', basis: AI_MARKING_BASIS });
    expect(code$.files).toEqual(expect.arrayContaining(['srv/service.ts', 'db/schema.cds', 'package.json']));
    expect(code$.withoutHeader).toContain('package.json');
    // Every hash is of the file as it ships, header included.
    for (const f of pkg.manifest.files) expect(f.sha256, f.path).toBe(sha(pkg.file(f.path)!));
  });

  test('the Testing stage\'s suite carries the Testing model\'s receipt, not the package\'s', () => {
    const pkg = deliver(project({ testSuiteModel: CLAUDE }));
    expect(pkg.file('test.ts')!.split('\n')[0]).toBe(`// Generated with AI assistance (Anthropic Claude ${OWN_CLAUDE_MODEL}) by Clean-Core.io v3.0.17, 2026-10-17`);
    expect(pkg.manifest.aiGeneration.statements.find((s: { source: string }) => s.source === 'tests')).toMatchObject({ provider: 'anthropic', model: OWN_CLAUDE_MODEL, keyOwner: 'own' });
  });

  test('engine-led: a file with a body the model filled carries the line, a file the engine wrote alone does not', () => {
    const filled = 'export function check(x: number): boolean {\n  // @cc-fill BEGIN U01 0a1b2c3d\n  return x > 1000;\n  // @cc-fill END U01\n}\n';
    const stub = "export function other(): void {\n  // @cc-fill BEGIN U02 0a1b2c3e\n  throw new NotImplementedFill('U02', 'other');\n  // @cc-fill END U02\n}\n";
    const frame = 'export const RUN_STORE = new Map<string, number>();\n';
    const trace = {
      format: 'clean-core.traceability/1',
      functions: [
        { name: 'check', file: 'srv/steps/u01.ts', owner: 'fill', unitId: 'U01', abap: [], rules: [] },
        { name: 'other', file: 'srv/steps/u02.ts', owner: 'fill', unitId: 'U02', abap: [], rules: [] },
        { name: 'store', file: 'srv/store.ts', owner: 'engine', unitId: null, abap: [], rules: [] },
      ],
      units: [
        { unitId: 'U01', file: 'srv/steps/u01.ts', filledBy: 'model' },
        { unitId: 'U02', file: 'srv/steps/u02.ts', filledBy: 'not-filled' },
      ],
    };
    const files = [
      { path: 'srv/steps/u01.ts', content: filled },
      { path: 'srv/steps/u02.ts', content: stub },
      { path: 'srv/store.ts', content: frame },
      { path: 'traceability.json', content: JSON.stringify(trace) },
    ];
    expect([...modelFilledFiles(files)]).toEqual(['srv/steps/u01.ts']);
    // Without a trace, the regions themselves: a stub is the engine's.
    expect([...modelFilledFiles(files.filter((f) => f.path !== 'traceability.json'))]).toEqual(['srv/steps/u01.ts']);
    const p = project({
      generatedCode: JSON.stringify(files),
      generationBinding: {
        path: 'engine-led', generatedAt: '2026-10-17T09:31:00.000Z', model: GEMINI,
        engine: { status: 'partial', units: 2, written: 1, repaired: 0, notWritten: [], failing: [], checks: [], notRun: [], scaffoldFindings: [], callsUsed: 1, budget: 4, rounds: 0, stop: 'passed', scaffoldVersion: 14, scaffoldDigest: 'a'.repeat(64), planDigest: 'b'.repeat(64) },
        basis: [], elapsedMs: 1,
      },
    });
    const pkg = deliver(p, files);
    expect(hasAiMarking(pkg.file('srv/steps/u01.ts')!)).toBe(true);
    expect(pkg.file('srv/steps/u01.ts')).toContain('(Google Gemini gemini-test-model)');
    expect(hasAiMarking(pkg.file('srv/steps/u02.ts')!)).toBe(false);
    expect(hasAiMarking(pkg.file('srv/store.ts')!)).toBe(false);
    // The engine-led suite is the engine's own until the Testing stage writes one.
    expect(hasAiMarking(pkg.file('test.ts')!)).toBe(false);
    expect(aiAuthorshipFactsOf(p as never, { documentationFromEngine: true }).tests).toBeNull();
  });

  test('without a recorded receipt the package is still marked — "provider and model not recorded"', () => {
    const pkg = deliver(project({ generationBinding: { generatedAt: '2026-10-15T10:00:00.000Z' } }));
    expect(pkg.file('srv/service.ts')!.split('\n')[0]).toBe('// Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.17, 2026-10-15');
  });
});

/* ================================================================ the exports */

test.describe('the other exports', () => {
  test('a Word export carries the statement in its core properties only when given one', () => {
    const blocks = [{ k: 'p' as const, text: 'x' }];
    const plain = blocksDocxParts(blocks);
    expect(plain['docProps/core.xml']).toBeUndefined();
    expect(plain['[Content_Types].xml']).not.toContain('core-properties');
    const marked = blocksDocxParts(blocks, { aiStatement: 'Generated with AI assistance (A <b>) by Clean-Core.io v1, 2026-10-17' });
    expect(marked['docProps/core.xml']).toContain('<dc:description>Generated with AI assistance (A &lt;b&gt;) by Clean-Core.io v1, 2026-10-17</dc:description>');
    expect(marked['[Content_Types].xml']).toContain('/docProps/core.xml');
    expect(marked['_rels/.rels']).toContain('docProps/core.xml');
  });

  test('the design export is model text and says so', () => {
    const design = JSON.stringify({
      projectName: 'P',
      architectureOverview: { approachDescription: 'An approach.', nodeFramework: 'F', runtimePlatform: 'P' },
      nodeAppBlueprint: { projectStructure: [{ path: 'a', purpose: 'b' }], apiEndpoints: [] },
      cloudServices: [], dataSync: { patternName: 'X', description: 'Y' }, securityHardening: [], roadmap: [],
    });
    const html = buildDesignExportHtml({ id: 'p', name: 'P', solutionDesign: design } as unknown as Project)!;
    expect(html).toMatch(/<!DOCTYPE html>\n<!-- Generated with AI assistance \(provider and model not recorded\)/);
    expect(html).toContain('<meta name="ai-generated" content="Generated with AI assistance (provider and model not recorded)');
  });

  test('the Confluence page of the documentation: marked when it carries the business layer, not when it is the engine\'s alone', async () => {
    const source = fixtureSource();
    const doc = engineDocumentationOf(source);
    const steps = processStepsOf(doc.steps);
    const ai = { sop: { provider: CLAUDE.provider, modelId: CLAUDE.modelId, byok: true, generatedAt: CLAUDE.generatedAt, appVersion: null }, analysis: null, appVersion: 'v3.0.17' };
    const withLayer = await buildEngineConfluenceHtml(processDocumentOf(source), businessLayerFor(doc), { processSteps: steps, ai }).text();
    const statement = `Generated with AI assistance (Anthropic Claude ${OWN_CLAUDE_MODEL}) by Clean-Core.io v3.0.17, 2026-10-17`;
    expect(withLayer.split('\n')[0]).toBe(`<!-- ${statement} -->`);
    expect(withLayer).toContain(`<meta name="ai-generated" content="${statement}">`);
    const engineOnly = await buildEngineConfluenceHtml(processDocumentOf(source), null, { processSteps: steps, ai }).text();
    expect(engineOnly).not.toContain('Generated with AI assistance');
    expect(engineOnly.startsWith('<html>')).toBe(true);
  });

  test('the business layer\'s writer is read from its record, and no layer is no marking', () => {
    const facts = aiAuthorshipFactsOf({ businessDocumentation: '{"roles":[]}', businessDocumentationModel: CLAUDE }, { documentationFromEngine: true });
    expect(facts.sop).toMatchObject({ provider: 'anthropic', modelId: OWN_CLAUDE_MODEL });
    expect(aiAuthorshipFactsOf({}, { documentationFromEngine: true }).sop).toBeNull();
  });
});

/* ================================ several models, and the requirements exports */

test.describe('an export names every model whose text it carries', () => {
  const LAYER = `Generated with AI assistance (Anthropic Claude ${OWN_CLAUDE_MODEL}) by Clean-Core.io v3.0.17, 2026-10-17`;
  const NARRATIVE = 'Generated with AI assistance (Google Gemini gemini-analysis) by Clean-Core.io v3.0.17, 2026-10-16';
  const hostile = aiMarkingStatement({ provider: 'evil', modelId: 'm --> <script>alert(1)</script> */ "x', byok: false, generatedAt: null, appVersion: 'v1' }, 'v1');

  test('the process document with the business layer and the analysis proposal: both statements in Markdown and Word', () => {
    const md = withAiMarkings('Process.md', blocksMarkdown([{ k: 'h', level: 1, text: 'Process' }]), [LAYER, NARRATIVE]);
    expect(md.split('\n').slice(0, 3)).toEqual([`<!-- ${LAYER} -->`, `<!-- ${NARRATIVE} -->`, '# Process']);
    // Marking again replaces both lines, never doubles them.
    expect(withAiMarkings('Process.md', md, [LAYER, NARRATIVE])).toBe(md);
    expect(withAiMarkings('Process.md', '# x\n', [])).toBe('# x\n');
    const core = blocksDocxParts([{ k: 'p', text: 'x' }], { aiStatements: [LAYER, NARRATIVE] })['docProps/core.xml'];
    expect(core).toContain(`<dc:description>${LAYER}; ${NARRATIVE}</dc:description>`);
    // Escaped for XML: a hostile model name is text, the part stays well-formed.
    const hostileCore = blocksDocxParts([{ k: 'p', text: 'x' }], { aiStatements: [LAYER, hostile] })['docProps/core.xml'];
    expect(hostileCore).not.toContain('<script>');
    expect(hostileCore.match(/<dc:description>/g)).toHaveLength(1);
    expect(hostileCore).toMatch(/<dc:description>[^<]*<\/dc:description><\/cp:coreProperties>$/);
    // The page hands every statement on, not the first.
    const page = readFileSync(join(process.cwd(), 'app/(app)/project/[projectId]/documentation/page.tsx'), 'utf8');
    expect(page).not.toMatch(/exportStatements\([^)]*\)\[0\]/);
    expect(page).toContain('withAiMarkings(name, blocksMarkdown(blocks), statements)');
    expect(page).toContain('blocksDocx(blocks, { aiStatements: statements })');
  });

  test('the Confluence page with both: one comment line and one meta element per statement', async () => {
    const source = fixtureSource();
    const doc = engineDocumentationOf(source);
    const document = processDocumentOf(source);
    document.purpose = { ...document.purpose, proposal: { text: 'The program approves purchase orders.', anchors: [], origin: 'narrative' } };
    const ai = {
      sop: { provider: CLAUDE.provider, modelId: CLAUDE.modelId, byok: true, generatedAt: CLAUDE.generatedAt, appVersion: null },
      analysis: { provider: 'google-gemini', modelId: 'gemini-analysis', byok: false, generatedAt: '2026-10-16T08:00:00.000Z', appVersion: 'v3.0.17' },
      appVersion: 'v3.0.17',
    };
    const html = await buildEngineConfluenceHtml(document, businessLayerFor(doc), { processSteps: processStepsOf(doc.steps), ai }).text();
    expect(html.split('\n').slice(0, 2)).toEqual([`<!-- ${LAYER} -->`, `<!-- ${NARRATIVE} -->`]);
    expect(html).toContain(`<meta name="ai-generated" content="${LAYER}"><meta name="ai-generated" content="${NARRATIVE}">`);
  });

  test('an HTML page or fragment with several statements: a comment and a meta element for each, injection-safe', () => {
    const page = withAiMarkingHtml('<!doctype html><html><head><title>t</title></head><body></body></html>', [LAYER, NARRATIVE]);
    expect(page.split('\n').slice(0, 3)).toEqual(['<!doctype html>', `<!-- ${LAYER} -->`, `<!-- ${NARRATIVE} --><html><head><meta name="ai-generated" content="${LAYER}"><meta name="ai-generated" content="${NARRATIVE}"><title>t</title></head><body></body></html>`]);
    const fragment = withAiMarkingHtml('<h1>x</h1>', [hostile]);
    const [comment, rest] = fragment.split('\n');
    expect(comment.indexOf('-->')).toBe(comment.length - 3);
    expect(rest.startsWith('<meta name="ai-generated" content="Generated with AI assistance (evil m -&gt; &lt;script&gt;')).toBe(true);
    expect(rest).not.toContain('<script>');
    expect(rest.endsWith('<h1>x</h1>')).toBe(true);
  });

  const source = fixtureSource();
  const nfr = buildNfrSet({ source });
  const fr = buildRequirementSet({ source });
  const NFR_STATEMENT = 'Generated with AI assistance (provider and model not recorded) by Clean-Core.io v3.0.17, date not recorded';
  const base = { projectName: 'Fixture', fileName: 'fixture.abap', date: '2026-10-17' };
  const named = { retention: { text: 'Keep the rows of ZMM_PO_APPR for ten years.', references: ['ZMM_PO_APPR'] } };
  const generic = { monitoring: { text: 'Use dashboards and alerts.', references: [] } };

  test('the NFR and specification Markdown and HTML with a printed proposal are marked; without one they are not', () => {
    const marked = { ...base, proposals: named, aiStatement: NFR_STATEMENT };
    for (const md of [nfrMarkdown(nfr, marked), specificationMarkdown(fr, nfr, marked)]) {
      expect(md.split('\n')[0]).toBe(`<!-- ${NFR_STATEMENT} -->`);
      expect(md).toContain('Keep the rows of ZMM_PO_APPR');
    }
    for (const html of [nfrHtml(nfr, marked), specificationHtml(fr, nfr, marked)]) {
      expect(html.startsWith(`<!-- ${NFR_STATEMENT} -->\n<meta name="ai-generated" content="${NFR_STATEMENT}">`)).toBe(true);
    }
    expect(nfrDocxParts(nfr, marked)['docProps/core.xml']).toContain(NFR_STATEMENT);
    expect(specificationDocxParts(fr, nfr, marked)['docProps/core.xml']).toContain(NFR_STATEMENT);
    // No proposal, or only generic ones the export leaves out: the engine's text alone, nothing marked.
    for (const proposals of [null, generic]) {
      const meta = { ...base, proposals, aiStatement: NFR_STATEMENT };
      const outputs = [nfrMarkdown(nfr, meta), nfrHtml(nfr, meta), specificationMarkdown(fr, nfr, meta), specificationHtml(fr, nfr, meta)];
      for (const out of outputs) expect(out).not.toContain('Generated with AI assistance');
      expect(nfrDocxParts(nfr, meta)['docProps/core.xml']).toBeUndefined();
      expect(specificationDocxParts(fr, nfr, meta)['docProps/core.xml']).toBeUndefined();
    }
    // A model's wording of a functional requirement is model text of the specification too.
    const worded = { ...base, proposals: null, aiStatement: NFR_STATEMENT, wording: { [fr.requirements[0].id]: 'The model words it.' } };
    expect(specificationMarkdown(fr, nfr, worded).split('\n')[0]).toBe(`<!-- ${NFR_STATEMENT} -->`);
    // Hostile names stay inert in the comment and the attribute.
    const hostileMeta = { ...base, proposals: named, aiStatement: hostile };
    const md = nfrMarkdown(nfr, hostileMeta).split('\n')[0];
    expect(md.indexOf('-->')).toBe(md.length - 3);
    const html = nfrHtml(nfr, hostileMeta);
    // Inside the comment the name is inert text and the comment ends where it should; after it, nothing of it is markup.
    expect(html.split('\n')[0].indexOf('-->')).toBe(html.split('\n')[0].length - 3);
    expect(html.slice(html.indexOf('-->') + 3)).not.toContain('<script>');
  });

  test('the requirements specification\'s Markdown and Confluence page: marked when a proposal is printed beside an open decision', () => {
    const meta = { date: '2026-10-17', fileName: 'Z_MM_PO_APPROVAL.abap', sourceSha256: 'a'.repeat(64), revision: 1, author: 'owner@example.com', history: [], aiStatement: NFR_STATEMENT };
    const withProposal = buildSpecDraft({ projectName: 'Fixture', fr, nfr, proposals: { slaRequirements: 'For TBD-13: business hours, 2 s.' } });
    expect(withProposal.decisions.some((d) => d.proposal !== '')).toBe(true);
    const md = specMarkdown(withProposal, meta);
    expect(md.split('\n')[0]).toBe(`<!-- ${NFR_STATEMENT} -->`);
    expect(md).toContain('Model proposal: For TBD-13');
    const html = specConfluenceHtml(withProposal, meta);
    expect(html.split('\n').slice(0, 2)).toEqual(['<!doctype html>', expect.stringMatching(new RegExp(`^<!-- ${NFR_STATEMENT.replace(/[()]/g, '\\$&')} --><html`))]);
    expect(html).toContain(`<head><meta name="ai-generated" content="${NFR_STATEMENT}">`);
    expect(specDocxParts(withProposal, meta)['docProps/core.xml']).toContain(NFR_STATEMENT);
    const without = buildSpecDraft({ projectName: 'Fixture', fr, nfr });
    expect(specMarkdown(without, meta)).not.toContain('Generated with AI assistance');
    expect(specConfluenceHtml(without, meta)).not.toContain('Generated with AI assistance');
    expect(specConfluenceHtml(without, meta).startsWith('<!doctype html><html')).toBe(true);
    expect(specDocxParts(without, meta)['docProps/core.xml']).toBeUndefined();
    const hostileHtml = specConfluenceHtml(withProposal, { ...meta, aiStatement: hostile });
    expect(hostileHtml.slice(hostileHtml.indexOf('-->') + 3)).not.toContain('<script>');
    expect(hostileHtml).toContain('<meta name="ai-generated" content="Generated with AI assistance (evil m -&gt; &lt;script&gt;');
  });
});

/* ============================================================== the audit pack */

const RUN_ATTESTED = {
  createdAt: '2026-10-16T08:00:00.000Z',
  analyzerVersion: 'v3.0.17',
  modelParticipation: 'narrative-attested',
  model: { provider: 'google-gemini', modelId: 'gemini-analysis', engineVersion: 'v3.0.17', byokUsed: false },
};

test.describe('the audit pack: a new, versioned field', () => {
  test('the field is read from the signed run: the narrative\'s model, or that no model took part', () => {
    expect(auditPackAiGeneration({ run: RUN_ATTESTED })).toEqual({
      artefact: 'analysis-narrative',
      statement: 'Generated with AI assistance (Google Gemini gemini-analysis) by Clean-Core.io v3.0.17, 2026-10-16',
      provider: 'google-gemini',
      model: 'gemini-analysis',
      generatedOn: '2026-10-16',
      basis: AI_MARKING_BASIS,
    });
    expect(auditPackAiGeneration({ run: { ...RUN_ATTESTED, modelParticipation: 'none', model: { provider: null, modelId: null } } }).statement).toBeNull();
    expect(auditPackAiGeneration({ run: { ...RUN_ATTESTED, modelParticipation: 'narrative', model: { provider: null, modelId: null } } }).statement).toContain('(provider and model not recorded)');
  });

  const files = [{ path: '00-executive-summary.md', sha256: sha('# Summary') }];
  const ATTESTATION = '# User-attested\nArchitect sign-off: not given.';
  const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(ATTESTATION) }];
  const bound = { projectId: 'p-1', runId: 'r-1', runHash: 'h-1', engineVersion: 'v3.0.17', sapApiCatalogVersion: '2024.FPS02 + CR:latest@407843e4 (25467 entries, fetched 2026-09-15)' };
  const covers = coversOf(buildEvidenceChain({ projectId: 'p-1', runId: 'r-1' }));
  const generatedAt = '2026-10-17T10:00:00.000Z';
  const ai = auditPackAiGeneration({ run: RUN_ATTESTED });

  test('format 4 signs exactly the bytes it signed before, and refuses a marking it does not bind', () => {
    // The format-4 string, written out: no `ai=` section, the same as before format 5 existed.
    const v4 = canonicalAuditManifest({ files, attested, covers, ...bound, version: '4.1', generatedAt });
    expect(v4).toBe(`00-executive-summary.md:${files[0].sha256};p-1:r-1:h-1:v3.0.17:2024.FPS02 + CR%3Alatest@407843e4 (25467 entries, fetched 2026-09-15);attested=07-user-attested.md:${attested[0].sha256};issued=4.1:${generatedAt};covers=${[...covers].sort((a, b) => a.step.localeCompare(b.step)).map((c) => `${c.step}:${c.coverage}:${c.ref}`).join(',')};`);
    expect(canonicalManifestDefect({ files, attested, covers, ...bound, version: '4.1', generatedAt, aiGeneration: ai })).toContain('does not bind it');
  });

  test('format 5 binds it: a changed statement, a changed model, a removed field or a downgrade all change the hash', () => {
    expect([MANIFEST_VERSION_HMAC, MANIFEST_VERSION_ED25519]).toEqual(['5.0', '5.1']);
    const base = { files, attested, covers, ...bound, version: MANIFEST_VERSION_ED25519, generatedAt };
    const signed = canonicalAuditManifest({ ...base, aiGeneration: ai });
    expect(signed).toContain(';ai=analysis-narrative:Generated with AI assistance (Google Gemini gemini-analysis) by Clean-Core.io v3.0.17, 2026-10-16:google-gemini:gemini-analysis:2026-10-16:EU AI Act, Article 50(2);');
    const variants: AuditPackAiGeneration[] = [
      { ...ai, statement: 'Written by a person' },
      { ...ai, model: 'another-model' },
      { ...ai, statement: null, provider: null, model: null, generatedOn: null },
    ];
    for (const v of variants) expect(canonicalAuditManifest({ ...base, aiGeneration: v })).not.toBe(signed);
    expect(canonicalAuditManifest(base)).not.toBe(signed);
    expect(canonicalManifestDefect({ ...base, aiGeneration: { ...ai, provider: '' } })).toContain('neither a non-empty string nor null');
    expect(canonicalManifestDefect({ ...base, aiGeneration: { ...ai, extra: 'x' } as unknown as AuditPackAiGeneration })).toContain('does not bind');
  });

  async function v5Pack(edit?: (m: Record<string, unknown>) => void) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const raw = der.subarray(der.length - 32);
    const keyId = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const body = '# Summary';
    const list = [{ path: '00-executive-summary.md', sha256: sha(body), bytes: body.length }];
    const manifestHash = sha(canonicalAuditManifest({ files: list, attested, covers, ...bound, version: MANIFEST_VERSION_ED25519, generatedAt, aiGeneration: ai }));
    const manifest: Record<string, unknown> = {
      version: MANIFEST_VERSION_ED25519, ...bound, generatedAt, files: list, attested, covers, aiGeneration: ai, manifestHash,
      signed: true, signature: '', signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), privateKey).toString('base64'), signingKeyId: keyId,
    };
    edit?.(manifest);
    const zip = new JSZip();
    zip.file('00-executive-summary.md', body);
    zip.file('07-user-attested.md', ATTESTATION);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const path = join(mkdtempSync(join(tmpdir(), 'ai-pack-')), 'pack.zip');
    writeFileSync(path, buf);
    return { buf, path, publicKey: raw.toString('base64'), keyId };
  }

  test('both verifiers read a format-5 pack alike: genuine verifies, an edited marking fails', async () => {
    const genuine = await v5Pack();
    const keyDoc = { keys: [{ keyId: genuine.keyId, algorithm: 'Ed25519', status: 'active', publicKey: genuine.publicKey }] };
    const web = await verifyAuditPack(genuine.buf as unknown as Blob, { fetchKeyDocument: async () => keyDoc });
    expect(web.manifestHashValid, web.errors.join(' | ')).toBe(true);
    expect(web.ed25519?.state).toBe('verified');
    const cli = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-pack.mjs'), genuine.path, '--key', genuine.publicKey], { encoding: 'utf8' });
    expect(`${cli.stdout}${cli.stderr}`).toContain('Generated with AI assistance (Google Gemini gemini-analysis)');
    expect(cli.status, `${cli.stdout}${cli.stderr}`).toBe(0);

    const edited = await v5Pack((m) => {
      m.aiGeneration = { ...(m.aiGeneration as object), statement: 'Written without AI' };
    });
    const keyDoc2 = { keys: [{ keyId: edited.keyId, algorithm: 'Ed25519', status: 'active', publicKey: edited.publicKey }] };
    const webEdited = await verifyAuditPack(edited.buf as unknown as Blob, { fetchKeyDocument: async () => keyDoc2 });
    expect(webEdited.manifestHashValid).toBe(false);
    expect(webEdited.status).toBe('failed');
    const cliEdited = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-pack.mjs'), edited.path, '--key', edited.publicKey], { encoding: 'utf8' });
    expect(cliEdited.status).toBe(1);
  });

  test('the issuer writes the field from the run and binds it', () => {
    const route = readFileSync(join(process.cwd(), 'app', 'api', 'audit-pack', 'create', 'route.ts'), 'utf8');
    expect(route).toContain('const aiGeneration = auditPackAiGeneration({ run: runData });');
    expect(route).toMatch(/canonicalAuditManifest\(\{[^}]*aiGeneration,?\s*\}\)/);
    expect(route).toMatch(/covers,\s*aiGeneration,\s*manifestHash,/);
  });
});

/* ===================================================== the record at the store */

test('the stores record provider and model only from a receipt they verified, and the pages send one', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
  const contract = read('app/api/projects/[projectId]/contract/route.ts');
  expect(contract).toContain("verifyModelReceiptIssuer(body.modelReceipt, { uid: auth.uid, key: signingKey, stage: 'transformation' })");
  expect(contract).toContain('aiModelRecordOf(receiptVerdict.receipt, APP_VERSION)');
  const artefacts = read('app/api/projects/[projectId]/artefacts/route.ts');
  expect(artefacts).toContain("'business-layer': 'documentation'");
  expect(artefacts).toContain("'test-suite': 'testing'");
  expect(artefacts).toContain('verifyModelReceiptIssuer(fields.modelReceipt');
  expect(read('app/(app)/project/[projectId]/transformation/page.tsx')).toContain('modelReceipt: generationReceiptRef.current');
  expect(read('hooks/useTestGeneration.ts')).toContain('modelReceipt: answerReceipt');
  expect(read('app/(app)/project/[projectId]/documentation/page.tsx')).toContain('modelReceipt: layerReceipt.current?.key === answersKey');
  // No provider or model name is written into the marking code.
  for (const rel of ['lib/ai-marking.ts', 'lib/ai-authorship.ts']) {
    expect(read(rel), rel).not.toMatch(/['"](google-gemini|anthropic|gemini-[\w.-]+|claude-[\w.-]+)['"]/);
  }
});
