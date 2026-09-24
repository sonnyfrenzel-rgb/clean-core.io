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
  expect(body).toContain('recordGenerationBinding');
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

test('the binding is written before the generated code is stored', () => {
  const body = generationBody();
  const bind = body.indexOf('recordGenerationBinding');
  const save = body.indexOf('generatedCode: packaged');
  expect(bind).toBeGreaterThan(-1);
  expect(save).toBeGreaterThan(bind);
});

test('the contract field the server writes is not client-writable', () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  // The binding says which contract a stand followed. A browser that could
  // write it could claim any contract for any code.
  expect(rules).not.toContain('generationBinding');
});
