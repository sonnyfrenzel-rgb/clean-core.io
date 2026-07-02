/**
 * Diagnostic: run the full Analyze → Design generation pipeline against every
 * legacy ABAP example in abap-test-files/, using the REAL prompts and the REAL
 * deterministic engine, and validate that the Design output parses into the
 * shape the Design page renderer expects.
 *
 * This isolates whether "Solution Design does not render" is a generation
 * problem (AI/prompt/model) or a client data-flow problem.
 *
 *   Run:  npx tsx scripts/diagnose-design-pipeline.ts
 *         npx tsx scripts/diagnose-design-pipeline.ts gemini-3.5-flash   (override model)
 */
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';

const MODEL = process.argv[2] || 'gemini-3-flash-preview';
const EXAMPLES_DIR = path.join(process.cwd(), 'abap-test-files');

// --- load GEMINI_API_KEY from .env.local / .env (no dotenv dep) ---
function loadKey(): string {
  for (const f of ['.env.local', '.env']) {
    try {
      const line = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
        .split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
      if (line) return line.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
    } catch { /* ignore */ }
  }
  return process.env.GEMINI_API_KEY || '';
}

const ai = new GoogleGenAI({ apiKey: loadKey() });

// Mirror of the Design page's cleanAndParseJSON (design/page.tsx)
function cleanAndParseJSON(str: string): any {
  let c = str.trim();
  const a = c.indexOf('{'), b = c.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) c = c.slice(a, b + 1);
  c = c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(c);
}

async function gen(prompt: string): Promise<string> {
  const r = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });
  if (!r.text) throw new Error('empty .text from Gemini');
  return r.text;
}

function analysisPrompt(evidence: unknown, route: any, code: string): string {
  return `You are analyzing a legacy SAP ABAP custom codebase for modernization. Target: SAP S/4HANA Cloud, Public Edition.
Deterministic Evidence Report (ground-truth, do not invent findings):
${JSON.stringify(evidence)}
Return STRICT JSON matching: { projectTitle: string; cleanCoreScore: number; summary: string; asIsContext: string; gaps: Array<{title:string;severity:string;strategy:string;rationale:string;complexity:string}>; recommendations: {keepCoreClean:string;decommissioning:string;cloudReadiness:string}; strategicNextSteps: string[]; extensibilityRouting: { recommendedRoute: "${route.recommendedRoute}"; confidenceScore: ${route.confidenceScore} }; businessValueAnalysis: { legacyAssetScore:number; technicalDebtLevel:string; valueDrivers:string[]; cloudRoiSummary:string; plainEnglishActionPlan:string[] } }
Use cleanCoreScore=${route.cleanCoreScore}.
Legacy Code:
${code}`;
}

// Mirror of design page prepareAnalysisContext
function prepareAnalysisContext(analysisText: string): string {
  try {
    const p = JSON.parse(analysisText);
    return JSON.stringify({
      summary: p.summary, recommendations: p.recommendations, businessProcess: p.businessProcess,
      gaps: Array.isArray(p.gaps) ? p.gaps.slice(0, 10) : p.gaps,
      strategicNextSteps: p.strategicNextSteps, extensibilityRouting: p.extensibilityRouting,
      businessValueAnalysis: p.businessValueAnalysis,
    }).slice(0, 15000);
  } catch { return analysisText.slice(0, 15000); }
}

function designPrompt(ctx: string, isAbapCloud: boolean): string {
  const framework = isAbapCloud ? 'SAP RAP (RESTful Application Programming)' : 'SAP CAP (Cloud Application Programming model)';
  const platform = isAbapCloud ? 'SAP S/4HANA Core (Developer Extensibility)' : 'SAP BTP (Business Technology Platform)';
  return `Act as a Senior SAP ${isAbapCloud ? 'Enterprise' : 'Cloud Solutions'} Architect. Design a modern target architecture.
Return STRICT JSON matching this schema (no markdown):
interface DesignData {
  projectName: string;
  architectureOverview: { approachDescription: string; nodeFramework: string; runtimePlatform: string; };
  nodeAppBlueprint: { projectStructure: Array<{ path: string; purpose: string }>; apiEndpoints: Array<{ path: string; method: 'GET'|'POST'|'PUT'|'DELETE'; description: string }>; };
  cloudServices: Array<{ serviceName: string; purpose: string; npmPackages: string[] }>;
  dataSync: { patternName: string; description: string };
  securityHardening: Array<{ category: string; requirement: string; packageOrConfig: string }>;
  roadmap: Array<{ phase: string; title: string; deliverables: string[] }>;
}
nodeFramework MUST be "${framework}". runtimePlatform MUST be "${platform}".
Analysis Context:
${ctx}`;
}

// The fields the Design renderer actually reads (design/page.tsx renderDesignContent)
function validateDesignShape(d: any): string[] {
  const problems: string[] = [];
  if (!d || typeof d !== 'object') return ['not an object'];
  if (!d.architectureOverview?.nodeFramework) problems.push('architectureOverview.nodeFramework missing');
  if (!Array.isArray(d.nodeAppBlueprint?.projectStructure)) problems.push('nodeAppBlueprint.projectStructure not array');
  if (!Array.isArray(d.nodeAppBlueprint?.apiEndpoints)) problems.push('nodeAppBlueprint.apiEndpoints not array');
  if (!Array.isArray(d.cloudServices)) problems.push('cloudServices not array');
  if (!Array.isArray(d.securityHardening)) problems.push('securityHardening not array');
  if (!Array.isArray(d.roadmap)) problems.push('roadmap not array');
  if (!d.dataSync?.patternName) problems.push('dataSync.patternName missing');
  return problems;
}

async function main() {
  const files = fs.readdirSync(EXAMPLES_DIR).filter((f) => /\.(abap|txt)$/i.test(f)).sort();
  console.log(`\nModel: ${MODEL}   |   ${files.length} examples\n${'='.repeat(72)}`);
  const results: { file: string; route: string; ok: boolean; note: string }[] = [];

  for (const file of files) {
    const code = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
    let route = 'n/a';
    try {
      const evidence = buildAbapEvidence(code, file, 'public');
      const rep: any = routeExtensibility(evidence, 'public');
      route = rep.recommendedRoute;
      const isAbapCloud = !String(route).includes('BTP');

      const analysisText = await gen(analysisPrompt(evidence, rep, code));
      const ctx = prepareAnalysisContext(analysisText);
      const designText = await gen(designPrompt(ctx, isAbapCloud));

      let parsed: any;
      try { parsed = cleanAndParseJSON(designText); }
      catch (e: any) { results.push({ file, route, ok: false, note: `design JSON parse FAILED: ${e.message}` }); console.log(`✗ ${file.padEnd(42)} parse failed`); continue; }

      const problems = validateDesignShape(parsed);
      const ok = problems.length === 0;
      results.push({ file, route, ok, note: ok ? `${designText.length} chars, renders` : problems.join('; ') });
      console.log(`${ok ? '✓' : '⚠'} ${file.padEnd(42)} ${route.padEnd(24)} ${ok ? 'OK' : problems.join('; ')}`);
    } catch (e: any) {
      results.push({ file, route, ok: false, note: `pipeline error: ${e.message}` });
      console.log(`✗ ${file.padEnd(42)} ERROR: ${e.message}`);
    }
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`${'='.repeat(72)}\nRESULT: ${pass}/${results.length} examples produced a renderable Solution Design.`);
  if (pass === results.length) {
    console.log('→ Generation + shape are healthy for ALL examples. A "No Solution Design" screen');
    console.log('  is therefore a client data-flow issue (analysis not reaching the Design page),');
    console.log('  NOT a model/prompt problem. Switching model would not fix it.');
  }
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
