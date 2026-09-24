import { test, expect } from '@playwright/test';
import {
  ALTERNATIVES,
  CONTRACT_FIELDS,
  CONTRACT_INPUT_ID,
  CONTRACT_VERSION,
  buildArchitectureContract,
  canonicalArchitectureContract,
  contractBindable,
  contractCoverage,
  contractFingerprint,
  contractManifestInput,
  contractRevision,
  type ArchitectureContract,
} from '../lib/architecture-contract';
import {
  INPUT_IDS,
  analysisRunInputs,
  buildInputManifest,
  invalidatingInputs,
  unverifiedInputs,
  type InputManifest,
} from '../lib/input-manifest';
import { PROVENANCE_VALUES } from '../lib/provenance';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeDrivers, routeExtensibility } from '../lib/abap/extensibility-router';
import type { AbapEvidenceReport, EvidenceFinding } from '../lib/abap/evidence-model';

/**
 * Roadmap 8.2 — "Architekturvertrag als Dokument: Zielkontext, Laufzeit,
 * Persistenz, APIs, gebundene Eingaben — **und warum die Alternativen verworfen
 * wurden**."
 *
 * Pure: no browser, no emulator, no server. The module is a plain function set
 * so that exactly this suite can drive every branch of it.
 */

/* ---------- fixtures ---------- */

const SOURCE_OFF_STACK = `REPORT z_mm_po_f01.
DATA: lv_x TYPE i.
CALL FUNCTION 'Z_REMOTE_CHECK'
  DESTINATION 'PRD100'
  EXPORTING iv_id = lv_x.
CALL METHOD cl_gui_frontend_services=>gui_download
  EXPORTING filename = '/tmp/out.csv'.
`;

/**
 * The CR-04 asymmetry, and the reason this fixture exists: both writes are
 * side-by-side triggers in the Public Edition and neither is one in the
 * Private Edition. A contract that read the deployment model from anywhere but
 * the run's manifest would reject the on-stack track for the wrong edition, and
 * a fixture without a deployment-dependent construct cannot see the difference.
 */
const SOURCE_WRITES = `REPORT z_mm_write.
DATA: ls_ekpo TYPE ekpo.
UPDATE ekpo SET netpr = '1.00' WHERE ebeln = '4500000001'.
INSERT zmm_limits FROM ls_ekpo.
`;

const SOURCE_ON_STACK = `REPORT z_mm_report.
DATA: lv_c TYPE i.
SELECT COUNT(*) FROM ekpo INTO lv_c.
WRITE lv_c.
`;

function manifestFor(deployment: 'public' | 'private' | null): InputManifest {
  const inputs = analysisRunInputs({
    sourceSha256: 'a'.repeat(64),
    deploymentTarget: deployment || 'public',
    catalogVersion: '2026.FPS01',
    rulesetVersion: 'rules-v1.0',
    engineVersion: '2.15.0',
    model: null,
  });
  const kept = deployment ? inputs : inputs.filter((i) => i.id !== INPUT_IDS.deployment);
  return buildInputManifest(kept, null);
}

function contractFor(
  source: string,
  deployment: 'public' | 'private' | null,
  extra?: Partial<Parameters<typeof buildArchitectureContract>[0]>,
) {
  const evidence = buildAbapEvidence(source, 'Z_TEST.abap', deployment || undefined);
  const route = routeExtensibility(evidence, deployment === 'private' ? 'private' : 'public');
  return buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: manifestFor(deployment),
    evidence,
    route,
    ...extra,
  });
}

const field = (c: ArchitectureContract, key: string) => c.fields.find((f) => f.key === key)!;
const alt = (c: ArchitectureContract, id: string) => c.alternatives.find((a) => a.id === id)!;

/* ---------- the document ---------- */

test.describe('8.2 — the contract is a document', () => {
  test('it has all seven fields and all four alternatives, always', () => {
    for (const source of [SOURCE_OFF_STACK, SOURCE_ON_STACK]) {
      for (const deployment of ['public', 'private'] as const) {
        const c = contractFor(source, deployment);
        expect(c.contractVersion).toBe(CONTRACT_VERSION);
        expect(c.fields.map((f) => f.key)).toEqual([...CONTRACT_FIELDS]);
        expect(c.alternatives.map((a) => a.id)).toEqual([...ALTERNATIVES]);
        expect(c.summary.length).toBeGreaterThan(20);
      }
    }
  });

  test('"not determined" is a statement with a reason — never a null, never a blank', () => {
    for (const source of [SOURCE_OFF_STACK, SOURCE_ON_STACK]) {
      for (const deployment of ['public', 'private', null] as const) {
        const c = contractFor(source, deployment);
        for (const f of c.fields) {
          // Exactly one of the two, and the one that is there is not empty.
          const hasStatement = typeof f.statement === 'string' && f.statement.trim().length > 0;
          const hasReason =
            typeof f.notDeterminedReason === 'string' && f.notDeterminedReason.trim().length > 0;
          expect(hasStatement !== hasReason, `${f.key} must state or explain, not both and not neither`).toBe(true);
          if (hasReason) expect(f.basis).toBe('not-determined');
          if (f.basis === 'not-determined') expect(hasReason).toBe(true);
          // Provenance is one of the nine of `lib/provenance.ts`, nothing else.
          expect(PROVENANCE_VALUES).toContain(f.provenance);
        }
        for (const a of c.alternatives) {
          expect(a.reason.trim().length, `${a.id} needs a reason`).toBeGreaterThan(20);
        }
      }
    }
  });

  test('every limit carries a sentence, and a blocking limit blocks', () => {
    const c = contractFor(SOURCE_OFF_STACK, null);
    const cov = contractCoverage(c);
    expect(cov.state).toBe('blocked');
    expect(cov.limits.some((l) => l.code === 'target-not-bound' && l.severity === 'blocks')).toBe(true);
    for (const l of cov.limits) expect(l.sentence.trim().length).toBeGreaterThan(20);
    expect(contractBindable(c)).toBe(false);
  });
});

/* ---------- the target context is bound, never inferred ---------- */

test.describe('8.2 — the target context comes out of the signed input manifest', () => {
  test('a run that bound no target deployment gets no target context', () => {
    const c = contractFor(SOURCE_OFF_STACK, null);
    const tc = field(c, 'target-context');
    expect(tc.statement).toBeNull();
    expect(tc.notDeterminedReason).toContain('bound no target deployment');
    // The most permissive answer is exactly the one that must not be guessed.
    expect(JSON.stringify(c)).not.toContain('Public Edition');
    expect(() => contractManifestInput(c)).toThrow(/must not become a signed input/);
  });

  test('the bound target is cited by its manifest id and revision', () => {
    for (const deployment of ['public', 'private'] as const) {
      const c = contractFor(SOURCE_OFF_STACK, deployment);
      const tc = field(c, 'target-context');
      expect(tc.basis).toBe('bound-input');
      expect(tc.statement).toContain(INPUT_IDS.deployment);
      expect(tc.statement).toContain(deployment);
      expect(tc.citations).toContainEqual({ kind: 'input', ref: INPUT_IDS.deployment });
      // A self-declaration of the account, not a proof: no system was asked.
      expect(tc.provenance).toBe('confirmed');
    }
  });

  test('no contract claims the target context is corroborated by a catalog for that edition', () => {
    for (const deployment of ['public', 'private'] as const) {
      const c = contractFor(SOURCE_OFF_STACK, deployment);
      const tc = field(c, 'target-context');
      const l = tc.limits.find((x) => x.code === 'catalog-not-edition-specific');
      expect(l, `${deployment} must carry the catalog limit`).toBeTruthy();
      expect(l!.severity).toBe('qualifies');
      expect(l!.sentence).toContain('Public Cloud release list');
      // …which makes every contract qualified, never clear, today.
      expect(contractCoverage(c).state).toBe('qualified');
      expect(contractRevision(c).startsWith('qualified:')).toBe(true);
    }
  });
});

/* ---------- why the alternatives were rejected ---------- */

test.describe('8.2 — a rejected alternative carries its reason at the evidence', () => {
  test('the off-stack route rejects on-stack with the same constructs the router routed on', () => {
    const evidence = buildAbapEvidence(SOURCE_OFF_STACK, 'Z_TEST.abap', 'public');
    const drivers = routeDrivers(evidence, 'public');
    expect(drivers.length).toBeGreaterThan(0);

    const c = contractFor(SOURCE_OFF_STACK, 'public');
    expect(c.route.recommended).toBe('side-by-side-cap');
    const rejected = alt(c, 'in-app-rap');
    expect(rejected.verdict).toBe('rejected');
    expect(rejected.basis).toBe('evidence');

    // The same rule, named the same way, at the same lines — not a second copy.
    for (const d of drivers) {
      expect(rejected.reason, `reason must name ${d.kind}`).toContain(d.label);
      expect(rejected.reason).toContain(String(d.firstLine));
      expect(rejected.citations.some((cit) => d.findingIds.includes(cit.ref))).toBe(true);
    }
    for (const cit of rejected.citations) {
      expect(evidence.findings.some((f) => f.id === cit.ref)).toBe(true);
    }
  });

  test('the same writes reject the on-stack track in one edition and not in the other', () => {
    // Public: both writes drive the route off the stack (CR-04).
    const pub = contractFor(SOURCE_WRITES, 'public');
    expect(pub.route.chosen).toBe('side-by-side-cap');
    const rejectedOnStack = alt(pub, 'in-app-rap');
    expect(rejectedOnStack.verdict).toBe('rejected');
    expect(rejectedOnStack.basis).toBe('evidence');
    expect(rejectedOnStack.reason).toContain('writes to custom persistence');
    expect(rejectedOnStack.reason).toContain('direct writes to SAP standard tables');

    // Private: the identical source rejects nothing on the stack. A contract
    // that took the deployment from anywhere but the manifest would print the
    // public answer here.
    const priv = contractFor(SOURCE_WRITES, 'private');
    expect(priv.route.chosen).toBe('in-app-rap');
    expect(alt(priv, 'in-app-rap').verdict).toBe('chosen');
    expect(alt(priv, 'side-by-side-cap').verdict).toBe('rejected');
    expect(alt(priv, 'side-by-side-cap').basis).toBe('stipulation');
  });

  test('rejecting BTP is a setting and says so — nothing in the code rules it out', () => {
    const c = contractFor(SOURCE_ON_STACK, 'private');
    expect(c.route.chosen).toBe('in-app-rap');
    const rejected = alt(c, 'side-by-side-cap');
    expect(rejected.verdict).toBe('rejected');
    // The honest half: no finding rejects BTP, so this may not read as evidence.
    expect(rejected.basis).toBe('stipulation');
    expect(rejected.reason).toContain('setting, not on evidence');
    expect(rejected.citations.every((cit) => cit.kind === 'router')).toBe(true);
  });

  test('"cover it with SAP standard" is never rejected here — it is not assessed here', () => {
    for (const source of [SOURCE_OFF_STACK, SOURCE_ON_STACK]) {
      for (const deployment of ['public', 'private'] as const) {
        const standard = alt(contractFor(source, deployment), 'standard');
        expect(standard.verdict).toBe('not-determined');
        expect(standard.reason).toContain('not the business capability');
      }
    }
  });
});

/* ---------- persistence and APIs do not answer from silence ---------- */

test.describe('8.2 — an absence of findings is not a cleared field', () => {
  function fabricatedEvidence(complete: boolean): AbapEvidenceReport {
    return {
      findings: [] as EvidenceFinding[],
      coverage: complete
        ? { unassessed: [], complete: true, gaps: [] }
        : {
            unassessed: [],
            complete: false,
            gaps: [{ gap: 'dataset-io' as never, label: 'Application server file I/O', count: 4, firstLine: 22 }],
          },
      summary: { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, infoCount: 0 },
    };
  }

  test('no write found in a partly unread source is not "no persistence"', () => {
    const evidence = fabricatedEvidence(false);
    const c = buildArchitectureContract({
      contractId: 'AC-1',
      runId: 'run-1',
      inputManifest: manifestFor('private'),
      evidence,
      route: routeExtensibility(evidence, 'private'),
    });
    const p = field(c, 'persistence');
    expect(p.statement).toBeNull();
    expect(p.notDeterminedReason).toContain('did not assess');
    expect(p.limits.some((l) => l.code === 'coverage-incomplete')).toBe(true);
  });

  test('a fully read source with no write may say so', () => {
    const evidence = fabricatedEvidence(true);
    const c = buildArchitectureContract({
      contractId: 'AC-1',
      runId: 'run-1',
      inputManifest: manifestFor('private'),
      evidence,
      route: routeExtensibility(evidence, 'private'),
    });
    const p = field(c, 'persistence');
    expect(p.statement).toContain('No database write in the assessed source');
    expect(p.basis).toBe('evidence');
  });

  test('no catalog match means the API field is not determined, not empty', () => {
    const c = contractFor(SOURCE_ON_STACK, 'private');
    const a = field(c, 'apis');
    if (a.statement === null) {
      expect(a.notDeterminedReason!.length).toBeGreaterThan(30);
      expect(a.provenance).toBe('not-determined');
    } else {
      expect(a.basis).toBe('evidence');
    }
  });
});

/* ---------- the deviation of 8.3 ---------- */

test.describe('8.3 — a deviation is recorded and applied', () => {
  test('a deviation without a reason is refused', () => {
    const evidence = buildAbapEvidence(SOURCE_OFF_STACK, 'Z_TEST.abap', 'public');
    expect(() =>
      buildArchitectureContract({
        contractId: 'AC-1',
        runId: 'run-1',
        inputManifest: manifestFor('public'),
        evidence,
        route: routeExtensibility(evidence, 'public'),
        deviation: { chosen: 'in-app-rap', reason: '   ' },
      }),
    ).toThrow(/must carry a reason/);
  });

  test('a declared deviation moves the chosen route and is visible in the revision', () => {
    const c = contractFor(SOURCE_OFF_STACK, 'public', {
      deviation: { chosen: 'in-app-rap', reason: 'The RFC target is retired this quarter.' },
    });
    expect(c.route.recommended).toBe('side-by-side-cap');
    expect(c.route.chosen).toBe('in-app-rap');
    expect(c.summary).toContain('Declared deviation');
    expect(contractRevision(c)).toContain('+deviation');
    // The chosen route is now a setting, not the evidence's answer.
    expect(alt(c, 'in-app-rap').verdict).toBe('chosen');
    expect(alt(c, 'in-app-rap').basis).toBe('stipulation');
    expect(alt(c, 'in-app-rap').reason).toContain('against the recommendation');
  });

  // QA review of 4b4586aff273: the runtime field named the router's artifact,
  // which belongs to the recommended route, and the headline called the other
  // route rejected whatever its alternative said.
  test('a deviation names the chosen route\'s artifact, not the recommended one\'s', () => {
    const toRap = contractFor(SOURCE_OFF_STACK, 'public', {
      deviation: { chosen: 'in-app-rap', reason: 'The RFC target is retired this quarter.' },
    });
    expect(field(toRap, 'runtime').statement).toContain('Target artifact: RAP Business Object.');
    expect(field(toRap, 'runtime').statement).not.toContain('CAP Node.js');

    const toCap = contractFor(SOURCE_ON_STACK, 'public', {
      deviation: { chosen: 'side-by-side-cap', reason: 'The team runs everything on BTP.' },
    });
    expect(toCap.route.recommended).toBe('in-app-rap');
    expect(field(toCap, 'runtime').statement).toContain('Target artifact: CAP Node.js / Java Application.');
    expect(field(toCap, 'runtime').statement).not.toContain('RAP Business Object');

    // Without a deviation the router's own artifact is what is named and cited.
    const plain = contractFor(SOURCE_ON_STACK, 'public');
    expect(field(plain, 'runtime').statement).toContain('Target artifact: RAP Business Object.');
    expect(field(plain, 'runtime').citations).toEqual([{ kind: 'router', ref: 'targetArtifact' }]);
  });

  test('the headline does not call a route rejected that its alternative leaves open', () => {
    const toCap = contractFor(SOURCE_ON_STACK, 'public', {
      deviation: { chosen: 'side-by-side-cap', reason: 'The team runs everything on BTP.' },
    });
    expect(alt(toCap, 'in-app-rap').verdict).toBe('not-determined');
    expect(toCap.summary).not.toContain('rejected');
    expect(toCap.summary).toContain('On-stack ABAP Cloud with RAP not determined.');

    // Where the alternative does reject, the headline still says so.
    const recommended = contractFor(SOURCE_OFF_STACK, 'public');
    expect(alt(recommended, 'in-app-rap').verdict).toBe('rejected');
    expect(recommended.summary).toContain('On-stack ABAP Cloud with RAP rejected.');
  });
});

/* ---------- canonical form, fingerprint, seam ---------- */

test.describe('8.2/8.4 — the contract is bindable', () => {
  test('the fingerprint covers what the contract says and ignores its lifecycle', () => {
    const a = contractFor(SOURCE_OFF_STACK, 'public');
    const b = contractFor(SOURCE_OFF_STACK, 'public');
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    // Confirming the document must not change the value the decision binds.
    const confirmed: ArchitectureContract = { ...a, status: 'confirmed' };
    expect(contractFingerprint(confirmed)).toBe(a.fingerprint);
    expect(canonicalArchitectureContract(confirmed)).not.toContain('status');

    // Anything the document actually says does change it.
    const edited: ArchitectureContract = {
      ...a,
      fields: a.fields.map((f) =>
        f.key === 'runtime' ? { ...f, statement: `${f.statement} And one more sentence.` } : f,
      ),
    };
    expect(contractFingerprint(edited)).not.toBe(a.fingerprint);

    const deviated = contractFor(SOURCE_OFF_STACK, 'public', {
      deviation: { chosen: 'in-app-rap', reason: 'The RFC target is retired this quarter.' },
    });
    expect(deviated.fingerprint).not.toBe(a.fingerprint);
  });

  test('a different target context is a different contract', () => {
    expect(contractFor(SOURCE_OFF_STACK, 'public').fingerprint).not.toBe(
      contractFor(SOURCE_OFF_STACK, 'private').fingerprint,
    );
  });

  test('the manifest entry makes a contract change invalidate what was built on it', () => {
    const c = contractFor(SOURCE_OFF_STACK, 'public');
    const entry = contractManifestInput(c);
    expect(entry.id).toBe(CONTRACT_INPUT_ID);
    // Computed *against* the contract — so `invalidatingInputs` must keep it.
    expect(entry.dataClass).toBe('source-artefact');
    // Held by name and revision; the document was not read byte for byte.
    expect(entry.binding).toBe('reference');
    expect(entry.revision).toContain(c.fingerprint.slice(0, 12));

    const manifest = buildInputManifest([entry], null);
    const changed = contractFor(SOURCE_OFF_STACK, 'public', {
      deviation: { chosen: 'in-app-rap', reason: 'The RFC target is retired this quarter.' },
    });
    const unverified = unverifiedInputs(manifest, {
      [CONTRACT_INPUT_ID]: contractManifestInput(changed).sha256,
    });
    expect(unverified.map((u) => u.reason)).toEqual(['differs']);
    expect(invalidatingInputs(unverified)).toHaveLength(1);
  });

  test('the canonical form is a line format, not JSON, and hashes its prose', () => {
    const c = contractFor(SOURCE_OFF_STACK, 'public');
    const canonical = canonicalArchitectureContract(c);
    expect(canonical.split('\n')[0]).toBe(`v${CONTRACT_VERSION}`);
    // Prose enters as a digest, so a separator inside a table name cannot break it.
    expect(canonical).not.toContain(c.summary);
    for (const key of CONTRACT_FIELDS) expect(canonical).toContain(`field=${key};`);
    for (const id of ALTERNATIVES) expect(canonical).toContain(`alt=${id};`);
  });
});

/* ---------- the run's signature boundary is not moved ---------- */

test('the contract is not folded into the run signature', () => {
  const routeSrc = require('fs').readFileSync('app/api/runs/create/route.ts', 'utf8') as string;
  // A run signs what it read. The contract is written afterwards and may carry
  // a declared deviation, so a run hash that depended on it would be a
  // signature over past facts that changes when a future document changes.
  expect(routeSrc).not.toContain('architecture-contract');
  expect(routeSrc).toContain("Omit<AnalysisRun, 'runHash' | 'signature' | 'analysis'>");
});
