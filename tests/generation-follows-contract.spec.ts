import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import {
  buildArchitectureContract,
  contractCoverage,
  type ArchitectureContract,
} from '../lib/architecture-contract';
import {
  bindingMatchesContract,
  generationBinding,
  generationDirection,
  offTrackRefusal,
} from '../lib/generation-direction';
import { contractOfProject, declaredDeviation } from '../lib/contract-build';
import { INPUT_IDS, analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';

/**
 * Roadmap 8.3 — *"Generierung folgt dem Vertrag; eine Abweichung von der
 * Empfehlung wird festgehalten und angewendet."*
 *
 * Pure: no browser, no emulator, no server. The judgement is a plain function
 * set so that exactly this suite can drive every branch of it, and the two
 * source guards at the end hold the seam the page must not step around.
 */

const SOURCE_OFF_STACK = `REPORT z_mm_po_f01.
DATA: lt_bseg TYPE TABLE OF bseg.
SELECT * FROM bseg INTO TABLE lt_bseg.
CALL FUNCTION 'Z_LEGACY_RFC' DESTINATION 'PRD'.
CALL TRANSACTION 'VA01' USING lt_bdc MODE 'N'.
EXEC SQL.
  SELECT * FROM kna1
ENDEXEC.
`;

/** With `null`, the deployment entry is absent — the contract is then blocked. */
function manifestFor(deployment: 'public' | 'private' | null) {
  const inputs = analysisRunInputs({
    sourceSha256: 'a'.repeat(64),
    deploymentTarget: deployment || 'public',
    catalogVersion: '2026.FPS01',
    rulesetVersion: 'rules-v1.0',
    engineVersion: '2.15.0',
    model: null,
  });
  return buildInputManifest(deployment ? inputs : inputs.filter((i) => i.id !== INPUT_IDS.deployment), null);
}

function contractFor(
  deployment: 'public' | 'private' | null,
  deviation?: { chosen: 'in-app-rap' | 'side-by-side-cap'; reason: string } | null,
): ArchitectureContract {
  const evidence = buildAbapEvidence(SOURCE_OFF_STACK, 'z_mm_po_f01.abap', deployment || undefined);
  const route = routeExtensibility(evidence, deployment || 'private');
  return buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: manifestFor(deployment),
    evidence,
    route,
    deviation: deviation ?? null,
  });
}

/* ---------- the deviation is applied, not only recorded ---------- */

test('the generation takes the chosen route, not the recommended one', () => {
  const recommended = contractFor('public');
  expect(recommended.route.recommended).toBe('side-by-side-cap');
  const straight = generationDirection(recommended);
  expect(straight.ok).toBe(true);
  if (!straight.ok) return;
  expect(straight.track).toBe('side-by-side-cap');
  expect(straight.isAbapCloud).toBe(false);
  expect(straight.followsRecommendation).toBe(true);

  const deviated = contractFor('public', {
    chosen: 'in-app-rap',
    reason: 'The BTP subaccount is not funded in this budget year.',
  });
  const applied = generationDirection(deviated);
  expect(applied.ok).toBe(true);
  if (!applied.ok) return;
  // This is the whole step. A contract that says in-app while the generator
  // writes CAP asserts a binding that does not exist.
  expect(applied.track).toBe('in-app-rap');
  expect(applied.isAbapCloud).toBe(true);
  expect(applied.followsRecommendation).toBe(false);
  expect(applied.deviation?.reason).toContain('not funded');
  // Held, not only applied: the reason is in the sentence the stage prints.
  expect(applied.sentence).toContain('not funded');
  expect(applied.sentence).toContain('deviation');
});

test('an unexplained deviation never becomes a contract at all', () => {
  expect(() => contractFor('public', { chosen: 'in-app-rap', reason: '   ' })).toThrow(/reason/i);
});

/* ---------- qualified generates, blocked does not ---------- */

test('every contract of this build is qualified, and qualified generates', () => {
  const c = contractFor('public');
  // The catalog knows no edition, so `catalog-not-edition-specific` qualifies
  // every contract. If qualified stopped the generation, nothing would ever
  // generate.
  expect(contractCoverage(c).state).toBe('qualified');
  const d = generationDirection(c);
  expect(d.ok).toBe(true);
  if (d.ok) expect(d.state).toBe('qualified');
});

test('a blocked contract generates nothing, and the reader is told which sentence stopped it', () => {
  const blocked = contractFor(null);
  expect(contractCoverage(blocked).state).toBe('blocked');
  const d = generationDirection(blocked);
  expect(d.ok).toBe(false);
  if (d.ok) return;
  expect(d.code).toBe('contract-blocked');
  // Not an empty stage: the contract's own sentence, and what ends it.
  expect(d.sentence).toContain(INPUT_IDS.deployment);
  expect(d.remedy.trim().length).toBeGreaterThan(0);
});

test('no contract is refused rather than defaulted to the permissive track', () => {
  const d = generationDirection(null);
  expect(d.ok).toBe(false);
  if (d.ok) return;
  expect(d.code).toBe('no-contract');
  expect(d.sentence).not.toContain('Side-by-Side (SAP BTP)');
});

test('a decision off both tracks is named, not overruled', () => {
  const r = offTrackRefusal('retire');
  expect(r.ok).toBe(false);
  expect(r.code).toBe('decision-off-track');
  expect(r.sentence).toContain('retire');
});

/* ---------- the stand names its contract ---------- */

test('the binding names the contract and calls the code proposed, never proven', () => {
  const c = contractFor('public', {
    chosen: 'in-app-rap',
    reason: 'The BTP subaccount is not funded in this budget year.',
  });
  const b = generationBinding(c, { codeSha256: 'b'.repeat(64) });
  expect(b.contractFingerprint).toBe(c.fingerprint);
  expect(b.boundRunId).toBe('run-1');
  expect(b.boundInputManifestHash).toBe(c.boundInputManifestHash);
  expect(b.route).toEqual({ recommended: 'side-by-side-cap', chosen: 'in-app-rap' });
  expect(b.deviation?.chosen).toBe('in-app-rap');
  // The code came from a model. Whatever else is bound, it is not evidence.
  expect(b.provenance).toBe('proposed');
  expect(b.contractInput.id).toBe('contract:architecture');
  expect(b.contractInput.dataClass).toBe('source-artefact');
  expect(b.contractInput.revision).toContain('+deviation');

  expect(bindingMatchesContract(b, c)).toBe(true);
  expect(bindingMatchesContract(b, contractFor('public'))).toBe(false);
  expect(bindingMatchesContract(null, c)).toBe(false);
});

test('a blocked contract cannot be bound even by the binding builder', () => {
  expect(() => generationBinding(contractFor(null))).toThrow(/must not become a signed input/i);
});

/* ---------- the deviation comes off the decision, not off the toggle ---------- */

test('the declared deviation is read from the signed-off decision', () => {
  // `extensibilityRoute` says in-app; the decision says nothing. No deviation:
  // a browser-writable field does not move the generation.
  expect(
    declaredDeviation({ extensibilityRoute: 'In-App (ABAP Cloud)' }, 'side-by-side-cap'),
  ).toEqual({ kind: 'none', deviation: null });

  const declared = declaredDeviation(
    { targetArchitecture: 'rap', architectJustifiedOverride: 'No BTP budget this year.' },
    'side-by-side-cap',
  );
  expect(declared.kind).toBe('declared');
  if (declared.kind !== 'declared') return;
  expect(declared.deviation.chosen).toBe('in-app-rap');
  expect(declared.deviation.reason).toBe('No BTP budget this year.');

  // Confirming the recommendation is not a deviation.
  expect(
    declaredDeviation({ targetArchitecture: 'cap', architectJustifiedOverride: '' }, 'side-by-side-cap').kind,
  ).toBe('none');

  // A departure whose reason is missing from the record is applied and *said*
  // to be missing — never silently filled in, and never silently dropped.
  const bare = declaredDeviation({ targetArchitecture: 'rap' }, 'side-by-side-cap');
  expect(bare.kind).toBe('declared');
  if (bare.kind !== 'declared') return;
  expect(bare.deviation.reason).toContain('architectJustifiedOverride');

  expect(declaredDeviation({ targetArchitecture: 'retire' }, 'side-by-side-cap').kind).toBe('off-track');
});

test('the project build derives the same contract the direction is taken from', () => {
  const built = contractOfProject(
    {
      activeRunId: 'run-1',
      legacyCode: SOURCE_OFF_STACK,
      s4Deployment: 'public',
      auditMetadata: { inputFingerprint: { fileName: 'z_mm_po_f01.abap' } },
      targetArchitecture: 'rap',
      architectJustifiedOverride: 'No BTP budget this year.',
      // The toggle says the opposite of the decision. The decision wins.
      extensibilityRoute: 'Side-by-Side (SAP BTP)',
    },
    manifestFor('public'),
  );
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  expect(built.contract.route.recommended).toBe('side-by-side-cap');
  expect(built.contract.route.chosen).toBe('in-app-rap');
  const d = generationDirection(built.contract);
  expect(d.ok && d.track).toBe('in-app-rap');

  expect(contractOfProject({ legacyCode: '   ' }, null)).toEqual({ ok: false, code: 'no-source' });
});

/* ---------- the seam the page must not step around ---------- */

const PAGE = 'app/(app)/project/[projectId]/transformation/page.tsx';

function generationBody(): string {
  const src = readFileSync(PAGE, 'utf8');
  const start = src.indexOf('const generateTransformation =');
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('useEffect(() => {', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

test('the generation does not take its direction from the project document', () => {
  const body = generationBody();
  // `extensibilityRoute` is on the client-writable allowlist of
  // `firestore.rules`, and the Analyze stage flips it from the browser with no
  // reason. A generator that reads it follows the last person who pressed the
  // toggle, not the contract.
  expect(body).not.toContain('extensibilityRoute');
  expect(body).not.toContain('isAbapCloudTrack');
  expect(body).not.toContain("'Side-by-Side (SAP BTP)'");
  // It asks the contract instead, and it records what it followed.
  expect(body).toContain('fetchGenerationDecision');
  expect(body).toContain('decision.isAbapCloud');
  expect(body).toContain('storeGeneration(');
});

test('a refused contract stops the generation before the model is called', () => {
  const body = generationBody();
  const refusal = body.indexOf('if (!decision.ok)');
  const modelCall = body.indexOf('callGemini(');
  expect(refusal).toBeGreaterThan(-1);
  // A stage that calls the model and then discards the answer has still spent
  // the call and still told the reader nothing.
  expect(refusal).toBeLessThan(modelCall);
  expect(readFileSync(PAGE, 'utf8')).toContain('data-contract-refusal');
});

test('the page never writes the stand itself — binding and code are one server write', () => {
  // Roadmap 3.0.11 (e649177b3894): the binding used to be written first and the
  // code afterwards from the browser, so two tabs could interleave between the
  // two writes. No Firestore write is left in the page at all.
  const src = readFileSync(PAGE, 'utf8');
  expect(src).not.toMatch(/\bupdateDoc\(/);
  expect(src).not.toMatch(/\bsetDoc\(/);
  expect(src).not.toContain("from 'firebase/firestore'");
  const body = generationBody();
  expect(body).toContain('generatedCode: packaged');
  expect(body.indexOf('generatedCode: packaged')).toBeGreaterThan(body.indexOf('storeGeneration('));
});

// QA review of 4b4586aff273: the binding named whatever contract the server
// rebuilt when the model was done, not the one the code was generated from.
test('the binding names the contract the code was generated from, or nothing is bound', () => {
  const body = generationBody();
  expect(body).toContain('const { contract, decision, generation } = await fetchGenerationDecision(');
  expect(body).toContain('const generatedAgainst = contract.fingerprint;');
  expect(body).toContain('expectedContractFingerprint: generatedAgainst,');
  // Read before the model is asked, not after.
  expect(body.indexOf('const generatedAgainst')).toBeLessThan(body.indexOf('callGemini('));

  const route = readFileSync('app/api/projects/[projectId]/contract/route.ts', 'utf8');
  const post = route.slice(route.indexOf('export async function POST'));
  const compare = post.indexOf('built.contract.fingerprint !== expectedFingerprint');
  expect(compare, 'the POST binds whatever contract it rebuilds').toBeGreaterThan(-1);
  expect(post).toContain("code: 'contract-moved'");
  expect(post).toContain("code: 'no-contract-named'");
  expect(compare, 'the comparison comes after the write').toBeLessThan(post.indexOf('[GENERATION_BINDING_FIELD]: binding'));
});

test('the binding is written only if the project has not been written since the comparison', () => {
  // QA review of 8adfa0e6db63: the fingerprint comparison and the write were two
  // steps, so a run or source that moved between them got the old binding.
  const route = readFileSync('app/api/projects/[projectId]/contract/route.ts', 'utf8');
  expect(route).toContain('const readAt: Timestamp | undefined = snap.updateTime;');
  const post = route.slice(route.indexOf('export async function POST'));
  const compare = post.indexOf('built.contract.fingerprint !== expectedFingerprint');
  const tx = post.indexOf('db.runTransaction(');
  expect(tx, 'the binding is not written in a transaction').toBeGreaterThan(compare);
  const body = post.slice(tx);
  expect(body.indexOf('await tx.get(projectRef)')).toBeGreaterThan(-1);
  expect(body.indexOf('fresh.updateTime.isEqual(readAt)')).toBeGreaterThan(body.indexOf('await tx.get(projectRef)'));
  expect(body.indexOf('tx.set(projectRef, fields, { merge: true })')).toBeGreaterThan(
    body.indexOf('fresh.updateTime.isEqual(readAt)'),
  );
  expect(post, 'a write outside the transaction').not.toMatch(/await db\.collection\('projects'\)\.doc\(projectId\)\.set\(/);
  expect(post).toContain("code: 'project-moved'");
});

test('the contract field the server writes is not client-writable', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  // The binding says which contract a stand followed. A browser that could
  // write it could claim any contract for any code.
  expect(rules).not.toContain('generationBinding');
});

/* ---------- roadmap 3.0.11: the token read before the model call ---------- */

test('the prompt is built from the inputs the token covers, not from what the page loaded', () => {
  // c42de15e9c75: the prompt used to take legacyCode, design and analysis from
  // load-time state, so a design replaced since then was invisible to any check.
  const body = generationBody();
  expect(body).toContain('const generateTransformation = useCallback(async () => {');
  expect(body).toContain('const generationToken = generation.token;');
  expect(body).toContain('const { legacyCode, solutionDesign: design, analysis } = generation.inputs;');
  expect(body.indexOf('generation.inputs')).toBeLessThan(body.indexOf('callGemini('));
  expect(body).toContain('generationToken,');
  const src = readFileSync(PAGE, 'utf8');
  expect(src).not.toMatch(/generateTransformation\([^)]/);
});

test('the store compares the token, then writes all four fields in the transaction', () => {
  const route = readFileSync('app/api/projects/[projectId]/contract/route.ts', 'utf8');
  const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
  expect(get).toContain('generationRevision(data, built.contract.fingerprint)');
  expect(get).toContain('generationInputsOf(data)');
  const post = route.slice(route.indexOf('export async function POST'));
  const token = post.indexOf('generationRevision(data, built.contract.fingerprint) !== generationToken');
  expect(token, 'the POST does not compare the token').toBeGreaterThan(-1);
  expect(post).toContain("code: 'generation-stale'");
  expect(post).toContain("code: 'no-generation-token'");
  expect(token).toBeLessThan(post.indexOf('db.runTransaction('));
  const fields = post.slice(post.indexOf('const fields = {'), post.indexOf('db.runTransaction('));
  for (const f of ['generatedCode: code', 'testSuite: checked.testSuite', "status: 'transformed'", '[GENERATION_BINDING_FIELD]: binding']) {
    expect(fields).toContain(f);
  }
});

test('the design is compared beside the contract fingerprint, not inside it', () => {
  // Deliberate (roadmap 3.0.11): the fingerprint is bound by stored generation
  // bindings and by the project decision's manifest; moving the design into it
  // would turn every one of them into "moved". The token carries it instead.
  const contract = readFileSync('lib/architecture-contract.ts', 'utf8');
  const canonical = contract.slice(contract.indexOf('export function canonicalArchitectureContract'));
  expect(canonical.slice(0, canonical.indexOf('\n}\n'))).not.toContain('solutionDesign');
  const revision = readFileSync('lib/generation-revision.ts', 'utf8');
  expect(revision).toContain('`design=${digestOf(state.solutionDesign)}`');
});
