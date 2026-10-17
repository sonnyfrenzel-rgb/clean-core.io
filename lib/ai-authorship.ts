/**
 * Which of a project's artefacts a model wrote, and who that model was —
 * read from the project's own records for the AI marking (roadmap 3.0.17, AI
 * Act Art. 50(2); `lib/ai-marking.ts` builds the statement).
 *
 * For each artefact the answer is `null` — no model wrote it, nothing is
 * marked — or an authorship, whose provider and model are known only where
 * the server recorded them from a verified receipt:
 *
 *   - `code`: the generated package. Its record is `generationBinding.model`
 *     (`/api/projects/{id}/contract`). Which *files* of an engine-led package a
 *     model co-wrote is decided per file from its trace (`modelFilledFiles`).
 *   - `tests`: the suite. Written by the Testing stage's model when the stage
 *     stored it for the package on the project (`testSuiteModel`, or a
 *     `testSuiteBasis` naming this package); otherwise it came with the
 *     package — the engine's own suite on the engine-led path (not marked),
 *     the model's on the single call.
 *   - `analysis`: the narrative of the signed run — its model card, which a
 *     verified receipt filled. A run no model took part in wrote none.
 *   - `design`, `documentation`: model text whose call is not recorded per
 *     project; marked, with "provider and model not recorded".
 *   - `sop`: the business layer (`businessDocumentationModel`).
 *
 * Deterministic findings are never part of this: nothing here marks the
 * engine's evidence (G05).
 *
 * Pure.
 */

import { authorshipOfRecord, storedAiModelRecord, type AiAuthorship } from './ai-marking';
import { packageDigest, testSuiteBasisOf } from './test-suite-basis';

export type AiSource = 'code' | 'tests' | 'analysis' | 'design' | 'sop' | 'documentation';

export type AiAuthorshipFacts = Readonly<Record<AiSource, AiAuthorship | null>>;

const UNKNOWN: AiAuthorship = Object.freeze({ provider: null, modelId: null, byok: null, generatedAt: null, appVersion: null });

/** Every source model-written, nothing recorded — what a package says when no facts were read. */
export const UNRECORDED_AUTHORSHIP: AiAuthorshipFacts = Object.freeze({
  code: UNKNOWN,
  tests: UNKNOWN,
  analysis: UNKNOWN,
  design: UNKNOWN,
  sop: UNKNOWN,
  documentation: UNKNOWN,
});

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

interface AuthorshipProject {
  generatedCode?: unknown;
  generationBinding?: unknown;
  testSuite?: unknown;
  testSuiteModel?: unknown;
  testSuiteBasis?: unknown;
  analysis?: unknown;
  solutionDesign?: unknown;
  businessDocumentation?: unknown;
  businessDocumentationModel?: unknown;
  auditMetadata?: {
    modelCard?: {
      provider?: string | null;
      model?: string | null;
      modelParticipation?: string;
      engineVersion?: string;
      byokUsed?: boolean;
      analysisTimestamp?: string;
      designTimestamp?: string;
    };
  };
}

/** The package's authorship: the binding's record, else unknown with the binding's own date. */
export function codeAuthorshipOf(project: AuthorshipProject): AiAuthorship | null {
  if (!text(project.generatedCode)) return null;
  const binding = project.generationBinding && typeof project.generationBinding === 'object' ? (project.generationBinding as Record<string, unknown>) : null;
  const record = storedAiModelRecord(binding?.model);
  if (record) return authorshipOfRecord(record);
  return { ...UNKNOWN, generatedAt: text(binding?.generatedAt) };
}

/** The narrative's authorship, from the signed run's model card; null when no model wrote one. */
export function analysisAuthorshipOf(project: AuthorshipProject): AiAuthorship | null {
  if (!text(project.analysis)) return null;
  const mc = project.auditMetadata?.modelCard;
  if (mc?.modelParticipation === 'none') return null;
  const attested = mc?.modelParticipation === 'narrative-attested' && text(mc.provider) && text(mc.model);
  return {
    provider: attested ? (mc!.provider as string) : null,
    modelId: attested ? (mc!.model as string) : null,
    byok: attested ? mc!.byokUsed === true : null,
    generatedAt: text(mc?.analysisTimestamp),
    appVersion: text(mc?.engineVersion),
  };
}

export function aiAuthorshipFactsOf(project: AuthorshipProject, opts: { documentationFromEngine: boolean }): AiAuthorshipFacts {
  const code = codeAuthorshipOf(project);
  const binding = project.generationBinding && typeof project.generationBinding === 'object' ? (project.generationBinding as Record<string, unknown>) : null;
  const engineLed = binding?.path === 'engine-led';
  const suiteRecord = storedAiModelRecord(project.testSuiteModel);
  const basis = testSuiteBasisOf(project);
  const writtenByTesting = suiteRecord !== null || (basis !== null && basis.codeSha256 !== null && basis.codeSha256 === packageDigest(project.generatedCode));
  const hasSuite = Boolean(project.testSuite && typeof project.testSuite === 'object' && text((project.testSuite as { code?: unknown }).code));
  const tests: AiAuthorship | null = !hasSuite
    ? null
    : writtenByTesting
      ? suiteRecord
        ? authorshipOfRecord(suiteRecord)
        : { ...UNKNOWN, generatedAt: basis?.recordedAt || null }
      : engineLed
        ? null
        : code;
  const mc = project.auditMetadata?.modelCard;
  return {
    code,
    tests,
    analysis: analysisAuthorshipOf(project),
    design: text(project.solutionDesign) ? { ...UNKNOWN, generatedAt: text(mc?.designTimestamp) } : null,
    sop: text(project.businessDocumentation) ? authorshipOfRecord(storedAiModelRecord(project.businessDocumentationModel)) : null,
    documentation: opts.documentationFromEngine ? null : UNKNOWN,
  };
}

const REGION = /^[ \t]*(?:\/\/|"!?)[ \t]*@cc-fill BEGIN ([A-Za-z0-9.]+) [0-9a-f]{8}[ \t]*\r?\n([\s\S]*?)^[ \t]*(?:\/\/|"!?)[ \t]*@cc-fill END \1[ \t]*$/gm;
/** The engine's stub of a region nobody filled: the Node and the ABAP form (`lib/transformation/markers.ts`). */
const STUB = /NotImplementedFill\(|_not_filled\(|_nofill\b/;

/** Files with a fill region whose body is not the engine's stub — the reading when no trace can be read. */
function filesWithFilledRegions(files: ReadonlyArray<{ path: string; content: string }>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    REGION.lastIndex = 0;
    for (let m = REGION.exec(f.content); m !== null; m = REGION.exec(f.content)) {
      if (m[2].trim() && !STUB.test(m[2])) {
        out.add(f.path);
        break;
      }
    }
  }
  return out;
}

/**
 * The test scenarios' authorship: the Testing stage's model wrote them beside
 * the engine's cases, so a list with any scenario is co-written. From the
 * suite's record when there is one; null for no scenarios.
 */
export function testCasesAuthorshipOf(project: AuthorshipProject & { testCases?: unknown }): AiAuthorship | null {
  if (!Array.isArray(project.testCases) || project.testCases.length === 0) return null;
  const record = storedAiModelRecord(project.testSuiteModel);
  if (record) return authorshipOfRecord(record);
  return { ...UNKNOWN, generatedAt: testSuiteBasisOf(project)?.recordedAt || null };
}

/**
 * The files of an engine-led package a model co-wrote: those whose trace names
 * a function with a fill region the model filled (`traceability.json`, design
 * §12.1). An engine-written frame alone is not marked. Without a readable
 * trace, the files whose fill regions hold anything but the engine's stub.
 */
export function modelFilledFiles(files: ReadonlyArray<{ path: string; content: string }>): ReadonlySet<string> {
  const trace = files.find((f) => f.path === 'traceability.json');
  if (!trace) return filesWithFilledRegions(files);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trace.content);
  } catch {
    return filesWithFilledRegions(files);
  }
  const t = parsed as {
    functions?: Array<{ file?: unknown; owner?: unknown; unitId?: unknown }>;
    units?: Array<{ unitId?: unknown; file?: unknown; filledBy?: unknown }>;
  };
  if (!Array.isArray(t.functions) || !Array.isArray(t.units)) return filesWithFilledRegions(files);
  const byModel = (filledBy: unknown) => typeof filledBy === 'string' && filledBy.startsWith('model');
  const modelUnits = new Set(t.units.filter((u) => byModel(u.filledBy) && typeof u.unitId === 'string').map((u) => u.unitId as string));
  const out = new Set<string>();
  for (const u of t.units) if (byModel(u.filledBy) && typeof u.file === 'string') out.add(u.file);
  for (const f of t.functions) {
    if (f.owner === 'fill' && typeof f.file === 'string' && typeof f.unitId === 'string' && modelUnits.has(f.unitId)) out.add(f.file);
  }
  return out;
}
