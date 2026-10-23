import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDeliveryBundle, finishDeliveryPackage, DELIVERY_MANIFEST_FORMAT, DELIVERY_MANIFEST_VERSION } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import type { HandoverProject } from '../lib/handover';
import { canonicalAuditManifest, MANIFEST_VERSION_ED25519, type AuditPackAiGeneration } from '../lib/audit-pack-canonical';
import { buildEvidenceChain, coversOf } from '../lib/evidence-chain';
import { verifyAuditPack } from '../lib/audit-pack-verify';
import { checkDeliveryPackage, deliveryVerdictHeadline, DELIVERY_FORMAT, signedRunFactsOf } from '../lib/delivery-package-verify';
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

/* ===================================================== the offline verifier */

test.describe('the offline verifier: a delivery package against its signed run', () => {
  const LEGACY = 'REPORT zai.\nWRITE / 1.\n';
  const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
  const RECORD = { receipt: 'verified', provider: 'google-gemini', modelId: 'gemini-test', byok: false, generatedAt: '2026-10-20T10:00:00.000Z', appVersion: 'v3.0.21' };

  function project(): HandoverProject {
    return {
      id: 'p-ai', name: 'AI marking', userId: 'owner', legacyCode: LEGACY, activeRunId: 'run-ai',
      extensibilityRoute: 'Side-by-Side (SAP BTP)', solutionDesign: '# Design', analysis: JSON.stringify({ summary: 'x' }),
      generatedCode: JSON.stringify([
        { path: 'srv/service.ts', content: "import express from 'express';\nexport const app = express();\n" },
        { path: 'package.json', content: '{"name":"x","dependencies":{"express":"^4"}}' },
      ]),
      testSuite: { code: "import { test } from 'node:test';\ntest('TC_01', () => {});\n" },
      generationBinding: { generatedAt: '2026-10-20T10:00:00.000Z', model: RECORD },
      auditMetadata: {
        inputFingerprint: { sha256: sha(LEGACY), fileName: 'zai.abap' },
        modelCard: { provider: 'google-gemini', model: 'gemini-analysis', modelParticipation: 'narrative-attested', engineVersion: 'v3.0.21', byokUsed: false, analysisTimestamp: '2026-10-19T08:00:00.000Z' },
      },
    } as unknown as HandoverProject;
  }

  /** The package as the Delivery stage zips it — `finishDeliveryPackage`'s files, one entry each. */
  async function deliveryZip(edit?: (files: Array<{ path: string; content: string }>) => void) {
    const p = project();
    const facts = deliveryFactsOf(p, {
      phases: workflowSteps(p), rules: ruleFactsOf(null as never), score: scoreFactsOf(p, null),
      generatedAt: '2026-10-20T12:00:00.000Z', appVersion: 'v3.0.21', referenceSection: '', documentationFromEngine: true,
    });
    const bundle = createDeliveryBundle();
    for (const f of JSON.parse(p.generatedCode as string) as Array<{ path: string; content: string }>) bundle.file(f.path, f.content, 'generated');
    bundle.folder('docs').file('business-analysis.md', '# Business analysis\n');
    const files = finishDeliveryPackage({ entries: bundle.entries, facts, layout: 'package' }).files.map((f) => ({ ...f }));
    edit?.(files);
    const zip = new JSZip();
    for (const f of files) zip.file(f.path, f.content);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const path = join(mkdtempSync(join(tmpdir(), 'delivery-')), 'package.zip');
    writeFileSync(path, buf);
    return { buf, path, manifest: JSON.parse(files.find((f) => f.path === 'manifest.json')!.content) };
  }

  /** A signed format-5 audit pack of run `run-ai`, with the signed source digest. */
  async function auditPack(opts: { runId?: string; sourceSha256?: string; narrativeModel?: string } = {}) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const raw = der.subarray(der.length - 32);
    const keyId = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const fingerprint = JSON.stringify({ sha256: opts.sourceSha256 ?? sha(LEGACY), fileName: 'zai.abap' }, null, 2);
    const summary = '# Summary';
    const attestation = '# User-attested\nArchitect sign-off: not given.';
    const attested = [{ path: '07-user-attested.md', provenance: 'user-attested' as const, sha256: sha(attestation) }];
    const files = [
      { path: '00-executive-summary.md', sha256: sha(summary), bytes: summary.length },
      { path: '01-input-fingerprint.json', sha256: sha(fingerprint), bytes: fingerprint.length },
    ];
    const ai: AuditPackAiGeneration = {
      artefact: 'analysis-narrative', statement: 'Generated with AI assistance (Google Gemini gemini-analysis) by Clean-Core.io v3.0.21, 2026-10-19',
      provider: 'google-gemini', model: opts.narrativeModel ?? 'gemini-analysis', generatedOn: '2026-10-19', basis: 'EU AI Act, Article 50(2)',
    };
    const runId = opts.runId ?? 'run-ai';
    const bound = { projectId: 'p-ai', runId, runHash: 'h-1', engineVersion: 'v3.0.21', sapApiCatalogVersion: 'c' };
    const covers = coversOf(buildEvidenceChain({ projectId: 'p-ai', runId }));
    const generatedAt = '2026-10-20T12:00:00.000Z';
    const manifestHash = sha(canonicalAuditManifest({ files, attested, covers, ...bound, version: MANIFEST_VERSION_ED25519, generatedAt, aiGeneration: ai }));
    const manifest = {
      version: MANIFEST_VERSION_ED25519, ...bound, generatedAt, files, attested, covers, aiGeneration: ai, manifestHash,
      signed: true, signature: '', signatureEd25519: sign(null, Buffer.from(manifestHash, 'utf8'), privateKey).toString('base64'), signingKeyId: keyId,
    };
    const zip = new JSZip();
    zip.file('00-executive-summary.md', summary);
    zip.file('01-input-fingerprint.json', fingerprint);
    zip.file('07-user-attested.md', attestation);
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const path = join(mkdtempSync(join(tmpdir(), 'pack-')), 'pack.zip');
    writeFileSync(path, buf);
    const publicKeyB64 = raw.toString('base64');
    return { buf, path, publicKey: publicKeyB64, keyDoc: { keys: [{ keyId, algorithm: 'Ed25519', status: 'active', publicKey: publicKeyB64 }] } };
  }

  const cli = (...args: string[]) => {
    const r = spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'verify-pack.mjs'), ...args], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };

  async function web(pkg: Buffer, pack: Awaited<ReturnType<typeof auditPack>> | null) {
    if (!pack) return checkDeliveryPackage(new Uint8Array(pkg));
    const result = await verifyAuditPack(pack.buf as unknown as Blob, { fetchKeyDocument: async () => pack.keyDoc });
    expect(result.success, result.errors.join(' | ')).toBe(true);
    return checkDeliveryPackage(new Uint8Array(pkg), await signedRunFactsOf(new Uint8Array(pack.buf), result));
  }

  test('manifest version 2: every file row names the model-written source it comes from, or null', async () => {
    expect(DELIVERY_FORMAT).toBe(DELIVERY_MANIFEST_FORMAT);
    expect(DELIVERY_MANIFEST_VERSION).toBe(2);
    const { manifest } = await deliveryZip();
    const row = (path: string) => manifest.files.find((f: { path: string }) => f.path === path);
    expect(row('srv/service.ts').ai).toBe('code');
    expect(row('package.json').ai).toBe('code');
    expect(row('docs/business-analysis.md').ai).toBe('analysis');
    expect(row('README.md').ai).toBeNull();
    expect(row('docs/decision.md').ai).toBeNull();
  });

  test('a genuine package against its pack: both verifiers say it comes from the signed run, and name the models', async () => {
    const pkg = await deliveryZip();
    const pack = await auditPack();
    const check = await web(pkg.buf, pack);
    expect(check.verdict, check.problems.join(' | ')).toBe('from-signed-run');
    expect(check.against).toEqual({ packAuthentic: true, runMatches: true, sourceMatches: true, narrativeMatches: true });
    expect(check.models.find((m) => m.source === 'code')).toMatchObject({ provider: 'google-gemini', model: 'gemini-test' });
    expect(deliveryVerdictHeadline(check)).toContain('comes from the signed run');
    expect(deliveryVerdictHeadline(check)).toContain('The package itself is not signed.');
    const out = cli(pack.path, '--key', pack.publicKey, '--package', pkg.path);
    expect(out.out).toContain('The package comes from the signed run');
    expect(out.out).toContain('Generated with AI assistance (Google Gemini gemini-test)');
    expect(out.out).toContain('Generated with AI assistance (Google Gemini gemini-analysis)');
    expect(out.status, out.out).toBe(0);
  });

  test('each way a package can leave its run fails both verifiers alike', async () => {
    const pack = await auditPack();
    const cases: Array<[string, Awaited<ReturnType<typeof deliveryZip>>, Awaited<ReturnType<typeof auditPack>>]> = [
      // A file changed after the manifest was written.
      ['altered file', await deliveryZip((fs) => { fs.find((f) => f.path === 'srv/service.ts')!.content += '// changed\n'; }), pack],
      // The marking stripped from a file and its hash brought along: the file no longer says what the manifest says.
      ['stripped marking', await deliveryZip((fs) => {
        const f = fs.find((x) => x.path === 'srv/service.ts')!;
        f.content = f.content.split('\n').slice(1).join('\n');
        const m = fs.find((x) => x.path === 'manifest.json')!;
        const parsed = JSON.parse(m.content);
        parsed.files.find((r: { path: string }) => r.path === f.path).sha256 = sha(f.content);
        m.content = JSON.stringify(parsed);
      }), pack],
      // A file's origin rewritten in the manifest.
      ['rewritten origin', await deliveryZip((fs) => {
        const m = fs.find((x) => x.path === 'manifest.json')!;
        const parsed = JSON.parse(m.content);
        parsed.files.find((r: { path: string }) => r.path === 'srv/service.ts').ai = null;
        m.content = JSON.stringify(parsed);
      }), pack],
      // A package built from another source than the run signed.
      ['other source', await deliveryZip(), await auditPack({ sourceSha256: sha('another source') })],
      // A package of another run.
      ['other run', await deliveryZip(), await auditPack({ runId: 'run-other' })],
      // The package names another model for the narrative than the pack signed.
      ['other narrative model', await deliveryZip(), await auditPack({ narrativeModel: 'gemini-other' })],
    ];
    for (const [name, pkg, p] of cases) {
      const check = await web(pkg.buf, p);
      expect(check.verdict, name).toBe('failed');
      const out = cli(p.path, '--key', p.publicKey, '--package', pkg.path);
      expect(out.status, `${name}: ${out.out}`).toBe(1);
      expect(out.out, name).toContain('The package does not match its manifest or the signed run.');
    }
  });

  test('a package alone is held to its own manifest and says it was not checked against a signed run', async () => {
    const pkg = await deliveryZip();
    const check = await web(pkg.buf, null);
    expect(check.verdict).toBe('consistent');
    expect(deliveryVerdictHeadline(check)).toContain('has not been checked against a signed audit pack');
    const out = cli(pkg.path);
    expect(out.out).toContain('has not been checked against a signed audit pack');
    expect(out.status).toBe(2);
  });

  test('a version-1 package (before 3.0.21) is read as it is: no ai field, the markings checked from aiGeneration', async () => {
    const pkg = await deliveryZip((fs) => {
      const m = fs.find((x) => x.path === 'manifest.json')!;
      const parsed = JSON.parse(m.content);
      parsed.version = 1;
      for (const r of parsed.files) delete r.ai;
      m.content = JSON.stringify(parsed);
    });
    const pack = await auditPack();
    const check = await web(pkg.buf, pack);
    expect(check.version).toBe(1);
    expect(check.verdict, check.problems.join(' | ')).toBe('from-signed-run');
    expect(cli(pack.path, '--key', pack.publicKey, '--package', pkg.path).status).toBe(0);
  });

  test('an audit pack checked without --package verifies exactly as before', async () => {
    const pack = await auditPack();
    const out = cli(pack.path, '--key', pack.publicKey);
    expect(out.status, out.out).toBe(0);
    expect(out.out).not.toContain('Package ');
  });
});
