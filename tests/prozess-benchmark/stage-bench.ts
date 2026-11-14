/**
 * Per-stage model measurement on benchmark cases and starter examples — the product's own prompt builders and
 * validators, a selectable model and thinking level, a spend ledger (study of 13.11.2026, owner decision: every
 * model stage measured on Hydrogen MEDIUM against today's product model before any stage moves).
 *
 *   npx tsx tests/prozess-benchmark/stage-bench.ts --stage <analyze|documentation|testing|wording|design>
 *       --ids <file> --model <id> [--thinking none|low|medium|high] --out <folder>
 *       [--parallel 3] [--ledger <file>] [--cap-usd N]
 *
 * An id is a benchmark case (`BM-nnn`, joined as `evaluate.ts` joins it) or a starter example
 * (`starter:<file>` under `public/starter-examples/`). Per stage the call is the product's:
 *
 *   - analyze:       `buildAnalysisPrompt` over the engine's evidence, route and program facts; JSON mode, no schema,
 *                    bound of the stage. Valid: a JSON object with an `extensibilityRouting` object (what the page reads).
 *   - documentation: `businessLayerPartPrompt` of the engine document's first part (the whole prompt when it fits), shape
 *                    `documentation-business` (text mode, as the page calls it). Valid: `checkBusinessDocShape`.
 *   - testing:       the hook's ABAP Cloud prompt with the engine's rule trace and engine cases; no generated package,
 *                    so the class under test is named as a stand-in (the hook's access-seam and input-contract rules
 *                    need a package and are left out). Schema of the stage. Valid: `checkTestSuiteShape`.
 *   - wording:       `plainWordingPrompt('walk', …)` over the walk guide's sentences, shape `plain-wording` (LOW by rule).
 *                    Valid: `validatePlainWording` — the share of sentences whose rewording held.
 *   - design:        the Design page's CAP prompt (its text as of 3.0.23, with the engine-only analysis context) and
 *                    `checkDesignResponse`. The page's text lives in a client component, so it is repeated here; a change
 *                    there is a new measurement.
 *
 * Nothing here reads an expected answer. Every call goes to the ledger with its tokens and list-price cost, and the
 * run stops before a call once the ledger reaches `--cap-usd`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { APP_VERSION } from '../../lib/version';
import { PRODUCT_GEMINI_MODEL } from '../../lib/constants';
import { STAGE_MAX_OUTPUT_TOKENS } from '../../lib/model-call-stage';
import { PLAIN_WORDING_SCHEMA, TESTING_RESPONSE_SCHEMA } from '../../lib/model-response-schema';
import { thinkingConfigFor } from '../../lib/model-thinking';
import { buildAbapEvidence } from '../../lib/abap/evidence-model';
import { routeExtensibility } from '../../lib/abap/extensibility-router';
import { programSummaryFactsOf } from '../../lib/program-summary-facts';
import { buildAnalysisPrompt } from '../../lib/analysis-prompt';
import { buildReadingExports } from '../../lib/bpmn/export';
import { buildProcessMapModel } from '../../lib/process-map';
import { applyNaming, namingContextOf } from '../../lib/process-naming';
import { buildProcessDocumentation } from '../../lib/process-documentation-build';
import { businessLayerPartPrompt, planBusinessLayerParts } from '../../lib/business-layer-parts';
import { checkBusinessDocShape } from '../../app/(app)/project/[projectId]/documentation/blueprint-schema';
import { checkTestSuiteShape } from '../../app/(app)/project/[projectId]/testing/test-suite-schema';
import { walkOrder } from '../../lib/process-walk';
import { buildWalkGuide } from '../../lib/process-walk-guide';
import { plainItemsOf, plainWordingPrompt, validatePlainWording, walkPlainSentences } from '../../lib/plain-wording';
import { numberedSource, originPromptSection } from '../../lib/scenario-origin';
import { deriveBusinessRules } from '../../lib/abap/business-rule-set';
import { materialRules, materialTables, ruleTracePromptSection } from '../../lib/testing-rule-trace';
import { deriveEngineCases, engineCasePromptSection } from '../../lib/testing-engine-cases';
import { checkDesignResponse } from '../../lib/design-response';
import { buildRequirementSet } from '../../lib/functional-requirements';
import { engineDesignContext } from '../../lib/design-engine-context';
import { ANSWERS_READING, businessAnswersSection } from '../../lib/design-business-answers';
import { OPTION_COMPARISON_PROMPT_RULE, OPTION_COMPARISON_SCHEMA } from '../../lib/design-option-comparison';
import { DESIGN_CONSISTENCY_PROMPT_RULE, prePostingPromptRule } from '../../lib/design-post-checks';
import { OPTION_COMPARISON_RULE, SAP_REFERENCE_PROMPT_RULES } from '../../lib/sap-reference-check';
import { BTP, BTP_FIRST } from '../../lib/sap-naming';

type Stage = 'analyze' | 'documentation' | 'testing' | 'wording' | 'design';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const STAGE = arg('--stage', 'analyze') as Stage;
const IDS = arg('--ids', '');
const MODEL = arg('--model', PRODUCT_GEMINI_MODEL);
const THINKING_ARG = arg('--thinking', 'none').toLowerCase();
const OUT = arg('--out', `tmp/stage-bench-${STAGE}`);
const PARALLEL = Number(arg('--parallel', '3'));
const LEDGER = arg('--ledger', '');
const CAP_USD = Number(arg('--cap-usd', '0'));
const ROOT = process.cwd();
const CASES = join(ROOT, 'tests/prozess-benchmark/cases');
const STARTERS = join(ROOT, 'public/starter-examples');

const LEVELS: Record<string, ThinkingLevel> = { minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };
if (THINKING_ARG !== 'none' && !LEVELS[THINKING_ARG]) throw new Error(`unknown thinking level: ${THINKING_ARG}`);
/** `none` keeps the product's rule for the call (a shape's level, or the provider's default). */
const THINKING_OVERRIDE: ThinkingConfig | undefined = LEVELS[THINKING_ARG] ? { thinkingLevel: LEVELS[THINKING_ARG] } : undefined;

const PRICES: Record<string, [number, number]> = { 'gemini-3.8-flash': [0.75, 3.75], 'gemini-3.6-flash': [0.75, 3.75], 'gemini-4-hydrogen': [1.5, 7.5] };

function apiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
  const value = line?.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!value) throw new Error('GEMINI_API_KEY is missing');
  return value;
}

/** A benchmark case joined as `evaluate.ts` joins it, or a starter example's file. */
function sourceOf(id: string): { name: string; code: string } {
  if (id.startsWith('starter:')) {
    const file = id.slice('starter:'.length);
    return { name: file, code: readFileSync(join(STARTERS, file), 'utf8').replace(/\r\n/g, '\n') };
  }
  const dir = join(CASES, id);
  const files = readdirSync(dir).filter((f) => f.endsWith('.abap')).sort();
  const read = files.map((name) => ({ name, code: readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') }));
  if (read.length === 1) return { name: 'source.abap', code: read[0].code };
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  read.sort((a, b) => Number(head(b.code)) - Number(head(a.code)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const lines: string[] = [];
  for (const file of read) {
    const own = file.code.split('\n');
    if (own[own.length - 1] === '') own.pop();
    lines.push(...own);
  }
  return { name: 'source.abap', code: lines.join('\n') + '\n' };
}

function spent(): number {
  if (!LEDGER || !existsSync(LEDGER)) return 0;
  return readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter(Boolean).reduce((s, l) => s + (Number((JSON.parse(l) as { costUsd?: number }).costUsd) || 0), 0);
}
function costOf(usage: Record<string, unknown>): number {
  const [pi, po] = PRICES[MODEL] ?? [1.5, 7.5];
  return (Number(usage.promptTokenCount ?? 0) * pi + (Number(usage.candidatesTokenCount ?? 0) + Number(usage.thoughtsTokenCount ?? 0)) * po) / 1e6;
}
function record(entry: Record<string, unknown>): void {
  if (LEDGER) appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
}

/* ------------------------------------------------------------------ the calls, per stage */

interface Call {
  prompt: string;
  jsonResponse: boolean;
  schema?: object;
  shape?: string;
  stage: 'analyze' | 'documentation' | 'testing' | 'statements' | 'design';
  /** The product's check of the answer: usable or not, and a word on why. */
  validate: (text: string) => { ok: boolean; detail: string };
}

function processMapOf(source: string, fileName: string) {
  const { bpmn, technical } = buildReadingExports(source, { processName: fileName, sourceFileName: fileName });
  const named = applyNaming(namingContextOf(source), null);
  return buildProcessMapModel({ bpmn, technical, named, fileName });
}

function stripFences(text: string): string {
  return text.replace(/^```json\n?/gm, '').replace(/^```\n?/gm, '').trim();
}

/** The Documentation page's JSON reader, as it stands in the page. */
function extractJSON(text: string): unknown {
  try {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonString = match ? match[1] : text;
    const cleaned = jsonString.trim().replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function callFor(stage: Stage, source: string, fileName: string): Call {
  if (stage === 'analyze') {
    const evidenceReport = buildAbapEvidence(source, fileName, 'private', undefined, APP_VERSION);
    const routeReport = routeExtensibility(evidenceReport, 'private', APP_VERSION);
    let programFacts = null;
    try {
      programFacts = programSummaryFactsOf(source, { engineVersion: APP_VERSION });
    } catch {
      programFacts = null;
    }
    return {
      stage: 'analyze',
      jsonResponse: true,
      prompt: buildAnalysisPrompt({ targetDeployment: 'private', evidenceReport, routeReport, code: source, programFacts }),
      validate: (text) => {
        try {
          const parsed: unknown = JSON.parse(stripFences(text));
          const obj = Array.isArray(parsed) ? parsed[0] : parsed;
          const ok = !!obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>).extensibilityRouting === 'object';
          return { ok, detail: ok ? 'object with extensibilityRouting' : 'no extensibilityRouting object' };
        } catch {
          return { ok: false, detail: 'not JSON' };
        }
      },
    };
  }
  if (stage === 'documentation') {
    const map = processMapOf(source, fileName);
    const doc = buildProcessDocumentation({ source, map, engineVersion: APP_VERSION });
    const plan = planBusinessLayerParts(doc);
    return {
      stage: 'documentation',
      jsonResponse: false,
      shape: 'documentation-business',
      prompt: businessLayerPartPrompt(doc, plan, 0, [], source),
      validate: (text) => {
        const check = checkBusinessDocShape(extractJSON(text));
        return { ok: check.ok, detail: check.ok ? `${plan.whole ? 'whole' : `part 1 of ${plan.parts.length}`}` : check.problems.slice(0, 3).join('; ') };
      },
    };
  }
  if (stage === 'testing') {
    const set = deriveBusinessRules(source, APP_VERSION);
    const ruleAsk = ruleTracePromptSection(materialRules(set), materialTables(set));
    let engineAsk = '';
    try {
      engineAsk = engineCasePromptSection(deriveEngineCases(source, set.rules).cases, 'abap-unit');
    } catch {
      engineAsk = '';
    }
    const originAsk = originPromptSection(null);
    const prompt = `Given the following context:
        Legacy Code (numbered lines):
${numberedSource(source)}
        Design: The legacy program is rebuilt as an ABAP Cloud class zcl_legacy_logic with one public method run( ) that takes the selection values as importing parameters and returns the result table; database reads go through a released interface zif_legacy_access with one method per table read.
        Generated ABAP Cloud RAP Code:
(not yet generated — the class under test is zcl_legacy_logic as described in the design; test every business rule of the legacy code against it)

        Generate:
        1. ABAP Unit test cases designed for Developer Extensibility: at least one per business rule listed under RULE-TRACED TEST CASES (and at least 10 overall), each with its expected result from the ORIGINAL ABAP.
        2. A complete ABAP Unit test class definition and implementation verifying the behavior implementation class (e.g. \`BP_...\`) using \`cl_abap_unit_assert\` only (\`cl_abap_unit_assert=>assert_equals( act = … exp = … msg = … )\`, \`=>fail( msg = … )\`, \`=>skip( msg = … )\`). \`cl_aunit_assert\` is obsolete and not released for ABAP Cloud, and there is no class \`cl_abap_unit_test\`: either fails activation.
        3. A list of areas that could not be fully unit-tested (e.g. real external service integrations, async queues, standard authority checks) and must be verified via "human-in-the-loop" testing.
        4. A coverageEstimate object with { percentage: number (0-100), explanation: string, missingCoverage: string }.

        CRITICAL GUIDELINES FOR ABAP UNIT:
        - The test class MUST use clean ABAP Cloud syntax: \`CLASS ltcl_test DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.\`
        - It is a LOCAL test class (never PUBLIC): it goes into the test include of the class under test. Do not name a class ltd_access, ltc_engine_cases or ltc_golden_master — the product writes those itself.
        - Call ONLY methods the classes and interfaces shown above declare, with ONLY the parameter names they declare. A method that does not exist does not activate — the product checks every call against the declarations and refuses the class otherwise.
        - Every class and method name has at most 30 characters.
        - Use local test doubles and stubs to mock standard released table/view accesses.
        - TEST CASE ID NAMING CONVENTION (CRITICAL): The test method name in the local test class MUST incorporate or refer to the test case ID (e.g. \`methods tc_01_create_sales_order for testing.\`) so they can be mapped programmatically.
        - Use \`cl_abap_unit_assert=>assert_equals( ... )\`, \`cl_abap_unit_assert=>assert_initial( ... )\` or \`cl_abap_unit_assert=>fail( ... )\` for assertion checking — never \`cl_aunit_assert\` or \`cl_abap_unit_test\`.

        Format the output as a JSON object with:
        - testCases: An array of test case objects (id, name, category, description, preconditions, steps, expectedResult, priority, testData, validationPoints, derivedFrom, ruleTrace)
        - testSuite: An object with the 'code' representing the complete ABAP Unit local test class code.
        - manualTestingRequirements: An array of objects (area, reason, verificationSteps)
        - coverageEstimate: { percentage: number, explanation: string, missingCoverage: string }.
        ${ruleAsk}
        ${engineAsk}
        ${originAsk}
        `;
    return {
      stage: 'testing',
      jsonResponse: true,
      schema: TESTING_RESPONSE_SCHEMA,
      prompt,
      validate: (text) => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(stripFences(text));
        } catch {
          return { ok: false, detail: 'not JSON' };
        }
        const check = checkTestSuiteShape(parsed);
        const cases = Array.isArray((parsed as { testCases?: unknown })?.testCases) ? ((parsed as { testCases: unknown[] }).testCases.length) : 0;
        return { ok: check.ok, detail: check.ok ? `${cases} test cases` : String((check as { reason?: string }).reason ?? 'shape refused') };
      },
    };
  }
  if (stage === 'wording') {
    const map = processMapOf(source, fileName);
    const guide = buildWalkGuide(source, map, walkOrder(map, null));
    const items = plainItemsOf(walkPlainSentences(guide));
    return {
      stage: 'statements',
      jsonResponse: true,
      shape: 'plain-wording',
      schema: PLAIN_WORDING_SCHEMA,
      prompt: plainWordingPrompt('walk', items),
      validate: (text) => {
        const v = validatePlainWording(items, text);
        const held = Object.keys(v.wording).length;
        return { ok: items.length > 0 && held > 0, detail: `${held} of ${items.length} rewordings held; dropped ${JSON.stringify(v.discarded.byReason)}` };
      },
    };
  }
  // design — the page's CAP prompt (3.0.23), engine-only analysis context
  const evidenceReport = buildAbapEvidence(source, fileName, 'private', undefined, APP_VERSION);
  let requirements: ReturnType<typeof buildRequirementSet> | null = null;
  try {
    requirements = buildRequirementSet({ source, levels: evidenceReport.findings as never, engineVersion: APP_VERSION });
  } catch {
    requirements = null;
  }
  const engine = engineDesignContext({ requirements, contract: null, findings: evidenceReport.findings as never, deployment: 'private', engineVersion: APP_VERSION, keyUser: null });
  const answersPart = businessAnswersSection(ANSWERS_READING);
  const designContext = `Analysis Context: none. The signed run was made without a model narrative; design from the engine evidence below.

Engine Evidence (the signed run, read from the code without a model):
${engine}${answersPart ? `

${answersPart}` : ''}`;
  const DESIGN_ANSWER_REMINDER =
    'Answer with the DesignData JSON object only. The evidence above is input, not the answer format: do not echo its keys. ' +
    'Every top-level key of DesignData must be present, each with the type the schema gives: projectName, architectureOverview, ' +
    'nodeAppBlueprint (an object with projectStructure and apiEndpoints), cloudServices, dataSync, securityHardening, roadmap (at least one named phase) ' +
    'and optionComparison (the SAP standard, RAP and CAP compared on the OPTION FACTS, with the requirement the other options miss).';
  const prompt = `Act as a Senior SAP Cloud Solutions Architect. Analyze the engine evidence (and the analysis narrative, where there is one) and design a modern, highly professional modular SAP CAP (Cloud Application Programming) side-by-side transformed cloud architecture. Name the platform "${BTP_FIRST}" at its first mention and "${BTP}" after that; keep the names of SAP services exactly as SAP names them.
You must return your output strictly in JSON format. Do not include any markdown formatting, HTML, or explanations outside the JSON object. The JSON must exactly match this TypeScript schema:

interface DesignData {
  projectName: string; // The name of this modernization project
  architectureOverview: {
    approachDescription: string; // A concise 2-4 sentence overview of the transformed architectural approach. Focus on loose coupling, exposing legacy core through standard versioned APIs, and deploying side-by-side. Say why a side-by-side CAP application over adopting the SAP standard and over an in-app RAP extension — the need for external users, several systems, own orchestration or scale that justifies the extra operation — and what is not known that could change it (see OPTIONS below).
    nodeFramework: string; // Value MUST be: "SAP CAP (Cloud Application Programming model)" with a brief justification
    runtimePlatform: string; // Value MUST be: "${BTP_FIRST}"
  };
  nodeAppBlueprint: {
    projectStructure: Array<{ path: string; purpose: string }>; // Recommended modular CAP layout: db/schema.cds (CDS schema), srv/service.cds (service definitions), srv/service.ts (business handlers), package.json, Dockerfile.
    apiEndpoints: Array<{ path: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; description: string }>; // REST or OData service endpoints designed to handle the legacy business capability
  };
  cloudServices: Array<{
    serviceName: string; // Name of the cloud service on ${BTP} (e.g. XSUAA Identity Provider, Destination service, Event Mesh, PostgreSQL on ${BTP})
    purpose: string; // Concrete usage in this ${BTP} extension
    npmPackages: string[]; // Actual npm packages used in CAP/Node.js to integrate with it (e.g. ['@sap/xssec', '@sap/cds'], ['@sap-cloud-sdk/connectivity'], ['pg'], ['@sap/cds-dk'])
  }>;
  dataSync: {
    patternName: string; // E.g. "Event-Driven via SAP Event Mesh", "Transactional SAP Destination service routing"
    description: string; // Technical description of how data stays consistent between the CAP service and the legacy core.
  };
  sapStandardApiMapping?: Array<{
    legacyTableOrFunction: string; // Legacy database table (e.g., KNA1, BSEG, LFA1, VBAK) or BAPI being integrated
    sapStandardApiName: string; // The technical name of a released SAP API you are certain exists (e.g. API_BUSINESS_PARTNER, API_SALES_ORDER_SRV, API_OUTBOUND_DELIVERY_SRV)
    apiHubUrl: string; // Reference link to api.sap.com (e.g. https://api.sap.com/api/API_BUSINESS_PARTNER/overview)
    apiId: string; // The API's ID on api.sap.com — for most APIs the same as sapStandardApiName. Never a communication scenario (SAP_COM_...) here; an empty string when you are not certain.
    description: string; // How this API replaces the direct DB access, and what it does NOT cover (fields, views, edition restrictions). Never a general replacement for several tables without that.
  }>;
  securityHardening: Array<{
    category: string; // e.g. Authentication, Network, Coding, Audit
    requirement: string; // Node.js / CAP / ${BTP} security rule ONLY. MUST use only ${BTP}-native and Node.js concepts. NEVER reference ABAP, AUTHORITY-CHECK, or any ABAP-native constructs. Example: 'XSUAA JWT Validation via @sap/xssec'
    packageOrConfig: string; // Node.js/${BTP} implementation ONLY. Examples: 'app.use(passport.authenticate("JWT", { session: false }))', 'app.use(helmet())', 'npm audit --audit-level=high', '@sap/xssec'. NEVER use ABAP code or syntax.
  }>;
  roadmap: Array<{
    phase: string; // Phase index (e.g. Phase 0, Phase 1, Phase 2, Phase 3)
    title: string; // Title of the phase (e.g. Foundation, CAP Service exposure, ${BTP} Event Integration, Production Hardening)
    deliverables: string[]; // 3-4 concrete, down-to-earth engineering deliverables for this phase
  }>;
${OPTION_COMPARISON_SCHEMA}
}

${SAP_REFERENCE_PROMPT_RULES}

OPTIONS: ${OPTION_COMPARISON_RULE} ${OPTION_COMPARISON_PROMPT_RULE}

${DESIGN_CONSISTENCY_PROMPT_RULE} ${prePostingPromptRule(source, 'cap')}

${designContext}

${DESIGN_ANSWER_REMINDER}`;
  return {
    stage: 'design',
    jsonResponse: true,
    prompt,
    validate: (text) => {
      const check = checkDesignResponse(text);
      return { ok: check.ok, detail: check.ok ? 'usable design' : String((check as { reason?: string }).reason ?? 'refused') };
    },
  };
}

/* ------------------------------------------------------------------ run */

const ai = new GoogleGenAI({ apiKey: apiKey() });
mkdirSync(OUT, { recursive: true });
const ids = readFileSync(IDS, 'utf8').split(/\s+/).filter(Boolean).filter((id) => !existsSync(join(OUT, `${id.replace(/[:/]/g, '_')}.json`)));
let done = 0;
let stopped = false;

async function one(id: string): Promise<void> {
  if (CAP_USD > 0 && spent() >= CAP_USD) {
    if (!stopped) console.error(`spend cap reached (${spent().toFixed(2)} USD >= ${CAP_USD}); no further calls`);
    stopped = true;
    return;
  }
  const src = sourceOf(id);
  let call: Call;
  try {
    call = callFor(STAGE, src.code, src.name);
  } catch (e) {
    writeFileSync(join(OUT, `${id.replace(/[:/]/g, '_')}.json`), JSON.stringify({ id, stage: STAGE, model: MODEL, error: `prompt could not be built: ${String((e as Error).message ?? e).slice(0, 200)}` }, null, 1));
    console.log(`${id} ${STAGE}: prompt could not be built`);
    return;
  }
  const thinking = THINKING_OVERRIDE ?? thinkingConfigFor(call.shape, process.env, { model: MODEL, stage: call.stage });
  const maxOutputTokens = STAGE_MAX_OUTPUT_TOKENS[call.stage];
  let text = '';
  let usage: Record<string, unknown> = {};
  let error: string | null = null;
  let finishReason: string | null = null;
  let modelVersion: string | null = null;
  let latencyMs: number | null = null;
  // A rate limit (429) is the key's per-minute quota, not the model: waited out in minutes, not seconds, and
  // never counted as an answer.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const t0 = Date.now();
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents: call.prompt,
        config: call.jsonResponse
          ? { responseMimeType: 'application/json', ...(call.schema ? { responseJsonSchema: call.schema } : {}), ...(thinking ? { thinkingConfig: thinking } : {}), maxOutputTokens }
          : { ...(thinking ? { thinkingConfig: thinking } : {}), maxOutputTokens },
      });
      latencyMs = Date.now() - t0;
      text = result.text ?? '';
      usage = (result.usageMetadata ?? {}) as Record<string, unknown>;
      finishReason = (result.candidates?.[0]?.finishReason as string | undefined) ?? null;
      modelVersion = (result as { modelVersion?: string }).modelVersion ?? null;
      record({ at: new Date().toISOString(), kind: STAGE, id, model: MODEL, modelVersion, thinking: thinking?.thinkingLevel ?? 'default', maxOut: maxOutputTokens, finishReason, latencyMs,
        promptTokenCount: usage.promptTokenCount ?? null, candidatesTokenCount: usage.candidatesTokenCount ?? null, thoughtsTokenCount: usage.thoughtsTokenCount ?? null, costUsd: costOf(usage) });
      error = null;
      break;
    } catch (e) {
      error = String((e as Error).message ?? e).slice(0, 300);
      record({ at: new Date().toISOString(), kind: STAGE, id, model: MODEL, failed: true, error: error.slice(0, 120), costUsd: 0 });
      const rateLimited = /429|RESOURCE_EXHAUSTED/i.test(error);
      const transient = rateLimited || /503|500|UNAVAILABLE|overloaded|fetch failed|ECONNRESET/i.test(error);
      if (!transient && attempt >= 2) break;
      await new Promise((r) => setTimeout(r, rateLimited ? 45_000 * attempt : Math.min(60_000, 5_000 * 2 ** (attempt - 1))));
    }
  }
  const complete = finishReason === 'STOP' && !!text;
  const valid = complete ? call.validate(text) : { ok: false, detail: error ? `call failed: ${error.slice(0, 80)}` : `incomplete: ${finishReason}` };
  writeFileSync(
    join(OUT, `${id.replace(/[:/]/g, '_')}.json`),
    JSON.stringify({ id, stage: STAGE, callStage: call.stage, shape: call.shape ?? null, model: MODEL, modelVersion, thinking: thinking?.thinkingLevel ?? 'default', maxOut: maxOutputTokens,
      finishReason, complete, valid: valid.ok, validDetail: valid.detail, latencyMs, promptChars: call.prompt.length, error, usage, costUsd: costOf(usage), raw: text }, null, 1),
  );
  done += 1;
  console.log(`${id} ${STAGE} ${MODEL}/${thinking?.thinkingLevel ?? 'default'} ${latencyMs}ms ${finishReason} think=${usage.thoughtsTokenCount ?? 0} out=${usage.candidatesTokenCount ?? 0} valid=${valid.ok} (${valid.detail.slice(0, 60)}) (${done}/${ids.length}, spent ${spent().toFixed(2)} USD)`);
}

(async () => {
  const queue = [...ids];
  await Promise.all(Array.from({ length: PARALLEL }, async () => { while (queue.length && !stopped) await one(queue.shift() as string); }));
  console.log(`done ${done}/${ids.length}; ledger total ${spent().toFixed(2)} USD`);
})();
