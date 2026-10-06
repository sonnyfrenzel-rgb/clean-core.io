import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';
import { adminSetDoc, adminSetCustomClaim } from './helpers/admin-seed';
import firebaseConfig from '../firebase-config.json';
import { managementAnswers, runHistoryEntry, type RunHistoryEntry } from '../lib/management-answers';
import { itFindingsView, type ItFindingRow, type ItFindingsSource } from '../lib/it-findings';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { buildArchitectureContract } from '../lib/architecture-contract';
import { analysisRunInputs, buildInputManifest } from '../lib/input-manifest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { evidenceDigest } from '../lib/run-evidence-digest';
import { sha256Hex } from '../lib/artefact-digest';
import { containsAmount } from '../lib/money-honesty';
import { isProvenanceValue } from '../lib/provenance';
import type { ProjectDecision } from '../lib/project-decision';
import type { NotDetermined } from '../lib/workspace-model';
import type { Project } from '../lib/types';
import {
  steeringOnePager,
  STEERING_FIGURES_MAX,
  STEERING_RISKS_MAX,
  STEERING_STEPS_MAX,
  type SteeringSource,
} from '../lib/steering-one-pager';
import { decisionManagerView } from '../lib/decision-manager';
import type { StandardFit } from '../lib/standard-fit';
import { ECONOMICS_RECORD_FORMAT, ECONOMICS_START_INPUTS, pricedOptions, serializeEconomics, validateEconomicsPayload, type EconomicsRecord } from '../lib/economics-record';
import { costAssumptionsRevision, type CostAssumptions } from '../lib/cost-assumptions';
import { initialCostAssumptions } from '../components/tco/OptionComparison';
import { signInViaLanding } from './helpers/sign-in';

/**
 * Roadmap 8.6 — the steering one-pager.
 *
 * *"One page (PDF) with nothing but numbers that lead to the evidence by link,
 * each with its coverage, and the column 'not determined'."*
 *
 * Every clause is a way to lie on one page, so each has its own check:
 *   - **only numbers that exist elsewhere** — each figure on the page is one a
 *     workspace model already derived, with the same value;
 *   - **each with its coverage and a link** — no figure without either;
 *   - **„nicht bestimmt"** — a figure a model could not give moves into its own
 *     column with the reason in words, never as a zero;
 *   - **costs** — never an amount, and not determined while the decision binds
 *     no cost revision (8.4: costs are never bound until 7.4's assumptions are
 *     stored).
 *
 * The first five blocks are pure and need no server. The last one renders the
 * page and needs the emulators and a dev server.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------------------- fixtures */

const SOURCE = 'REPORT z_mm_po_approval.\nWRITE 1.\n';

const signed: Project = {
  name: 'Emergency purchase approval',
  legacyCode: SOURCE,
  activeRunId: 'run-1',
  cleanCoreScore: 62,
  auditMetadata: {
    inputFingerprint: {
      sha256: sha256Hex(SOURCE),
      fileName: 'Z_MM_PO_APPROVAL.abap',
      lineCount: 640,
      byteSize: 21_400,
      uploadedAt: '2026-09-01T09:00:00.000Z',
      objectType: 'Report',
    },
  },
};

const run = (over: Record<string, unknown> = {}): RunHistoryEntry => {
  const parsed = runHistoryEntry({
    runId: 'run-1',
    createdAt: '2026-09-01T10:00:00.000Z',
    cleanCoreScore: 62,
    rulesetVersion: 'rules-v1.0',
    analyzerVersion: '2.9.0',
    sapApiCatalogVersion: 'cat-2026-08',
    ...over,
  });
  if (!parsed) throw new Error('fixture is not a run');
  return parsed;
};

const open: NotDetermined = {
  items: [
    { label: 'Dynamic call', why: 'the target is read at runtime', anchor: 'L502' },
    { label: 'Macro', why: 'macros are not expanded', anchor: 'L88' },
  ],
  count: 2,
  noSource: false,
};

const row = (over: Partial<ItFindingRow> = {}): ItFindingRow => ({
  id: 'CC-001',
  kind: 'standard-table-read',
  title: 'Direct read of an SAP table',
  severity: 'Medium',
  objectName: 'VBAK',
  objectType: 'Database Table',
  lineStart: 228,
  lineEnd: null,
  routine: 'READ_ORDERS',
  level: 'C',
  releaseView: 'Not to be released',
  classificationView: 'Not listed',
  successor: 'API_SALES_ORDER_SRV',
  targetOptions: ['Developer Extensibility / RAP'],
  rulesCoveringLine: ['BR-001'],
  rulesInRoutine: ['BR-001'],
  ...over,
});

const findings: ItFindingsSource = {
  rows: [row(), row({ id: 'CC-002', level: 'A' }), row({ id: 'CC-003', objectName: null, level: null })],
  sourceSha256: sha256Hex(SOURCE),
  rulesDerived: 3,
};

const CONTRACT_SOURCE = 'REPORT z_mm_report.\nDATA: lv_c TYPE i.\nSELECT COUNT(*) FROM ekpo INTO lv_c.\nWRITE lv_c.\n';

function decisionFixture(): ProjectDecision {
  const evidence = buildAbapEvidence(CONTRACT_SOURCE, 'Z_TEST.abap', 'public');
  const route = routeExtensibility(evidence, 'public');
  const contract = buildArchitectureContract({
    contractId: 'AC-1',
    runId: 'run-1',
    inputManifest: buildInputManifest(
      analysisRunInputs({
        sourceSha256: 'a'.repeat(64),
        deploymentTarget: 'public',
        catalogVersion: '2026.FPS01',
        rulesetVersion: 'rules-v1.0',
        engineVersion: '2.15.0',
        model: null,
      }),
      null,
    ),
    evidence,
    route,
  });
  const digest = evidenceDigest({
    inputFingerprint: { sha256: 'a'.repeat(64), lineCount: 4 },
    evidenceReport: [{ id: 'f1' }],
    originalRecommendation: 'In-App (ABAP Cloud)',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: 'catalog-1',
    analyzerVersion: 'engine-1',
    runHash: 'b'.repeat(64),
  });
  const facts: DecisionDraftFacts = {
    runId: 'run-1',
    evidenceDigest: digest,
    runSignedAt: '2026-09-20T08:00:00.000Z',
    contract,
    signedOffArchitecture: 'rap',
    signOff: { by: 'owner@example.invalid', at: '2026-09-21T08:00:00.000Z', reason: '', notCurrent: null },
    need: { revision: 4, confirmedDrops: 0, undecided: 0 },
    handedOver: false,
    stored: undefined,
    now: '2026-09-24T10:00:00.000Z',
  };
  return deriveDecisionDraft(facts).draft;
}

/** Fit to standard as the Management card computes it — a fixed reading for the pure tests. */
const FIT_READY: StandardFit = {
  state: 'ready',
  basis: 'signed-run',
  platform: 'public',
  platformLabel: 'Public Edition',
  fits: 1,
  counted: 3,
  percent: 33,
  released: 1,
  successor: 0,
  blocking: 2,
  notSorted: 0,
  retire: 0,
  sentence: '1 of 3 SAP objects this code uses have a released path on Public Edition.',
  coverage: '',
  blockers: [
    { objectName: 'VBAK', bucket: 'no-catalogued-path', level: 'C', line: 228, why: 'No path is named.', provenance: 'imported', use: 'object' },
    { objectName: 'EKPO', bucket: 'rebuild', level: 'D', line: 40, why: 'The code writes directly to this SAP table.', provenance: 'reconstructed', use: 'object' },
  ],
  clear: [],
  groups: [],
};

const full = (over: Partial<SteeringSource> = {}): SteeringSource => ({
  mode: 'project',
  base: '/project/p-1',
  program: 'Emergency purchase approval',
  date: '2026-10-03',
  project: signed,
  hasRun: true,
  history: [run()],
  open,
  findings,
  fit: FIT_READY,
  decision: decisionFixture(),
  process: { steps: 8, decisions: 2 },
  ...over,
});

/** Every visible string of the page, for the text checks. */
function textOf(page: ReturnType<typeof steeringOnePager>): string[] {
  const d = page.decision;
  return [
    page.title,
    page.question,
    page.distance.title,
    page.distance.state === 'ready' ? `${page.distance.sentence} ${page.distance.other ?? ''}` : page.distance.state === 'none-used' ? page.distance.sentence : page.distance.reason,
    page.header.program,
    page.header.purpose,
    page.header.status,
    ...(d.state === 'ready'
      ? [
          d.answer,
          d.who ?? '',
          d.proposal,
          d.readiness,
          ...d.pillars.map((p) => p.title),
          ...d.options.flatMap((o) => [o.label, o.signalWord, o.reason, o.effort.value ?? o.effort.reason ?? '', o.cost.reason ?? '']),
        ]
      : [d.reason]),
    ...page.figures.flatMap((f) => [f.label, f.value ?? '', f.absentReason ?? '', f.meaning, f.evidence.place]),
    ...page.risks.flatMap((r) => [r.object, r.why]),
    page.risksNote ?? '',
    ...page.nextSteps.flatMap((s) => [s.owner, s.text, s.link?.place ?? '']),
    page.footnote.legend,
    page.footnote.scope,
    page.footnote.versions ?? '',
  ];
}

/* ---------------------------------------- 1. only numbers that exist elsewhere */

test.describe('8.6 one-pager — every value comes from a workspace model', () => {
  test('at most four key figures, in a fixed order, and no phase count', () => {
    const page = steeringOnePager(full());
    expect(page.figures.length).toBeLessThanOrEqual(STEERING_FIGURES_MAX);
    // ADR-079: fit to standard is the distance block now, not a figure.
    expect(page.figures.map((f) => f.key)).toEqual(['levels', 'score', 'costs']);
    for (const line of textOf(page)) expect(line, 'a phase count on the steering page').not.toMatch(/of 7\b|phases?\b/i);
  });

  test('the score is the Management view’s, the levels are the IT view’s', () => {
    const src = full();
    const page = steeringOnePager(src);
    const score = managementAnswers(src.project, src.history, src.open).answers
      .flatMap((a) => a.figures)
      .find((f) => f.key === 'clean-core-score');
    expect(page.figures.find((f) => f.key === 'score')?.value).toBe(score?.value);
    const levels = page.figures.find((f) => f.key === 'levels');
    expect(levels?.value).toBe('A 1 · B 0 · C 1 · D 0 · Unknown 0');
    expect(levels?.value).toBe(itFindingsView(src.findings).distribution.slices.map((s) => `${s.grade} ${s.count}`).join(' · '));
    expect(levels?.meaning).toContain('2 of 3 places in the code in this run');
  });

  test('with no finding graded, the levels are the SAP objects the risks name — never "no finding" beside a level-C risk', () => {
    // Seen on Z_SALES_ORDER_CREATOR (03.10.2026): the levels said "the engine
    // raised no finding to grade" while the risks beside it listed two level-C BAPIs.
    const page = steeringOnePager(full({ findings: { ...findings, rows: [] } }));
    const levels = page.figures.find((f) => f.key === 'levels');
    expect(levels?.value).toBe('C 1 · D 1');
    expect(levels?.absentReason).toBeNull();
    expect(levels?.provenance).toBe('imported');
    for (const r of page.risks) expect(levels?.value).toContain(`${r.level} `);
    // Without a fit to read either, it stays not determined, with its reason.
    const none = steeringOnePager(full({ findings: { ...findings, rows: [] }, fit: { state: 'not-determined', why: 'no-run', reason: 'No signed run.', platform: null } as StandardFit }));
    expect(none.figures.find((f) => f.key === 'levels')?.absentReason).toBe('the engine raised no finding to grade');
  });

  test('a cost scenario stored on Economics prices the costs figure and the pillar, never as an amount', () => {
    const seed = initialCostAssumptions();
    const assumptions: CostAssumptions = {
      ...seed,
      currency: 'EUR',
      devDayRate: 820,
      testDayRate: 640,
      horizonYears: 5,
      releaseCadence: { perYear: 2, confirmed: true },
      options: seed.options.map((o) => ({
        ...o,
        oneOff: { low: { devDays: 1, testDays: 0.5 }, high: { devDays: 3, testDays: 1 } },
        perRelease: { devDays: 1.7, testDays: 1.2 },
        maintenanceBaselinePerYear: o.kind === 'do-nothing' ? { devDays: 3, testDays: 1 } : null,
        upgradeDelay: o.kind === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
        effortSource: 'proposal-confirmed' as const,
        ...(o.kind === 'do-nothing' ? { baselineSource: 'proposal-confirmed' as const } : {}),
      })),
    };
    const checked = validateEconomicsPayload(JSON.parse(serializeEconomics({ assumptions, inputs: { ...ECONOMICS_START_INPUTS } })));
    if (!checked.ok) throw new Error(checked.error);
    const econ: EconomicsRecord = {
      formatVersion: ECONOMICS_RECORD_FORMAT,
      ...checked.value,
      revision: costAssumptionsRevision(checked.value.assumptions),
      basis: { runId: 'run-1', score: null },
      savedAt: '2026-10-03T12:00:00.000Z',
    };
    const { priced, total } = pricedOptions(econ);
    expect(priced).toBeGreaterThan(0);
    const page = steeringOnePager(full({ project: { ...signed, _economics: econ } as Project }));
    const costs = page.figures.find((f) => f.key === 'costs');
    expect(costs?.value).toBe(`${priced} of ${total} priced`);
    expect(costs?.provenance).toBe('simulation');
    expect(containsAmount(costs?.value ?? '')).toBe(false);
    expect(page.nextSteps.map((s) => s.key)).not.toContain('costs');
    const d = page.decision;
    if (d.state === 'ready') expect(d.pillars.find((p) => p.key === 'cost')?.provenance).not.toBe('proven');
  });

  test('the distance to SAP standard is the card’s reading, and its blockers are the risks (ADR-079)', () => {
    const page = steeringOnePager(full({ otherEdition: 'On Private Edition: 2 of 3 SAP objects have a path to SAP standard, 1 stands in the way.' }));
    expect(page.distance).toMatchObject({
      state: 'ready',
      title: 'Distance to SAP standard on Public Edition',
      percent: 33,
      sentence: '1 of 3 SAP objects this program uses has a path to SAP standard; 2 stand in the way.',
      other: 'On Private Edition: 2 of 3 SAP objects have a path to SAP standard, 1 stands in the way.',
    });
    expect(page.risks.length).toBeLessThanOrEqual(STEERING_RISKS_MAX);
    expect(page.risks.map((r) => r.object)).toEqual(['VBAK', 'EKPO']);
    expect(page.risks[0]).toMatchObject({ level: 'C', line: 228 });
  });

  test('the decision block equals the decision card’s headline and status', () => {
    const decision = decisionFixture();
    const page = steeringOnePager(full({ decision }));
    const card = decisionManagerView(decision);
    expect(page.decision.state).toBe('ready');
    if (page.decision.state !== 'ready') return;
    expect(page.decision.headline).toBe(card.headline);
    expect(page.decision.headline).toBe('Rebuild as In-App ABAP Cloud (RAP)');
    expect(page.decision.status).toBe(decision.status);
    expect(page.decision.pillars.map((p) => [p.key, p.provenance])).toEqual(card.pillars.map((p) => [p.key, p.provenance]));
  });
});

/* ------------------------------------------ 2. provenance and links on every figure */

test.describe('8.6 one-pager — provenance and evidence', () => {
  test('every figure has a meaning, a provenance and a link into this project', () => {
    const page = steeringOnePager(full());
    for (const f of page.figures) {
      expect(f.meaning.trim(), `${f.key} has no meaning`).not.toBe('');
      expect(isProvenanceValue(f.provenance), `${f.key}: ${f.provenance}`).toBe(true);
      expect(f.evidence.href.startsWith('/project/p-1'), `${f.key} links outside the project`).toBe(true);
      expect(f.evidence.place.trim()).not.toBe('');
    }
  });

  test('no visible line is an address: links are links', () => {
    for (const page of [steeringOnePager(full()), steeringOnePager(full({ decision: null, hasRun: false }))]) {
      for (const line of textOf(page)) expect(line).not.toMatch(/https?:\/\/|\/project\//);
    }
  });

  test('at most four next steps, each with who acts', () => {
    const page = steeringOnePager(full());
    expect(page.nextSteps.length).toBeGreaterThan(0);
    expect(page.nextSteps.length).toBeLessThanOrEqual(STEERING_STEPS_MAX);
    for (const s of page.nextSteps) expect(['Business', 'IT', 'Decision maker']).toContain(s.owner);
  });

  test('the versions stand in the footnote, not as a figure', () => {
    const page = steeringOnePager(full());
    expect(page.footnote.versions).toBe('rules rules-v1.0 · analyzer 2.9.0 · catalog cat-2026-08');
    for (const f of page.figures) expect(f.value ?? '').not.toContain('rules-v1.0');
  });
});

/* ------------------------------------------------ 3. not determined, in place */

test.describe('8.6 one-pager — not determined is said in place', () => {
  test('a project with nothing readable has no zero anywhere, only reasons', () => {
    const page = steeringOnePager({
      mode: 'project',
      base: '/project/p-2',
      program: 'Nothing analysed yet',
      date: '2026-10-03',
      project: { name: 'Nothing analysed yet', legacyCode: 'REPORT z.\n' },
      hasRun: false,
      history: null,
      open: null,
      findings: null,
      fit: { state: 'not-determined', why: 'no-run', reason: 'No signed run yet — this figure is computed only from a signed run.', platform: null },
      decision: null,
      decisionUnreadable: 'The decision of this project could not be derived (404).',
      process: null,
    });
    for (const f of page.figures) {
      expect(f.value, `${f.key} carries a value without a run`).toBeNull();
      expect(f.absentReason?.trim(), `${f.key} has no reason`).toBeTruthy();
      expect(f.provenance).toBe('not-determined');
    }
    expect(page.decision).toMatchObject({ state: 'not-determined' });
    if (page.decision.state === 'not-determined') expect(page.decision.reason).toContain('404');
    expect(page.header.purpose).toMatch(/^Not determined — /);
    expect(page.risksNote).toMatch(/^Not determined — /);
    expect(page.nextSteps[0]).toMatchObject({ owner: 'IT', key: 'run' });
  });

  test('no SAP dependency is an answer on the page, not a gap', () => {
    const page = steeringOnePager(
      full({
        fit: {
          state: 'none-used',
          basis: 'signed-run',
          platform: 'private',
          sentence: 'This code reads, writes and calls no SAP object, so nothing in it blocks the standard path.',
        },
      }),
    );
    expect(page.distance).toMatchObject({ state: 'none-used' });
    expect(page.risksNote).toContain('calls no SAP object');
  });
});

/* -------------------------------------------------------------- 4. costs */

test.describe('8.6 one-pager — costs', () => {
  test('while the decision binds no cost revision, the options are not priced yet', () => {
    const decision = decisionFixture();
    expect(decision.bindings.find((b) => b.key === 'cost')?.revision, 'the fixture now binds a cost revision — the premise moved').toBeNull();
    const page = steeringOnePager(full({ decision }));
    const cost = page.figures.find((f) => f.key === 'costs');
    expect(cost).toMatchObject({ value: null, absentReason: 'not priced yet', provenance: 'not-determined' });
    expect(cost?.evidence.href).toBe('/project/p-1/tco');
  });

  test('a bound cost revision is a word, never an amount', () => {
    const decision = decisionFixture();
    const withCost: ProjectDecision = {
      ...decision,
      bindings: decision.bindings.map((b) =>
        b.key === 'cost' ? { ...b, revision: 'CS-2', notDeterminedReason: null, note: null, provenance: 'simulation' } : b,
      ),
    };
    const page = steeringOnePager(full({ decision: withCost }));
    expect(page.figures.find((f) => f.key === 'costs')?.value).toBe('Simulation');
  });

  test('no line of the page carries an amount of money', () => {
    for (const page of [steeringOnePager(full()), steeringOnePager(full({ decision: null }))]) {
      for (const line of textOf(page)) expect(containsAmount(line), line).toBe(false);
    }
  });
});

/* ------------------------------------------------- 4b. the four options (ADR-079) */

test.describe('ADR-079 one-pager — the question and the four options', () => {
  test('the question names the program, and the four options stand in their fixed order', () => {
    const page = steeringOnePager(full({ subject: 'Z_MM_PO_APPROVAL' }));
    expect(page.question).toBe('Keep, rebuild, move to SAP standard or retire Z_MM_PO_APPROVAL?');
    expect(page.decision.state).toBe('ready');
    if (page.decision.state !== 'ready') return;
    expect(page.decision.options.map((o) => o.label)).toEqual(['Keep', 'Rebuild', 'Move to SAP standard', 'Retire']);
    // The fixture's sign-off is rap: Rebuild is the chosen option, by the account.
    expect(page.decision.options.find((o) => o.chosen)?.option).toBe('rebuild');
    expect(page.decision.stage).toBe('chosen');
    // Two objects stand in the way on Public Edition: Keep speaks against it.
    expect(page.decision.options.find((o) => o.option === 'keep')?.signal).toBe('against');
    // Standard is never read from code, and Retire not without a usage import.
    expect(page.decision.options.find((o) => o.option === 'standard')?.signal).toBe('not-determined');
    expect(page.decision.options.find((o) => o.option === 'retire')?.signal).toBe('not-determined');
  });

  test('who chose it is the signed-in account, said as such', () => {
    const page = steeringOnePager(full({ signOff: { code: 'rap', by: 'owner@example.invalid', at: '2026-09-21T08:00:00.000Z' } }));
    if (page.decision.state !== 'ready') throw new Error('not ready');
    expect(page.decision.who).toBe('Chosen by owner@example.invalid on 2026-09-21.');
  });

  test('with no option chosen, the next step is to choose one of the four', () => {
    const facts = decisionFixture();
    const none: ProjectDecision = {
      ...facts,
      bindings: facts.bindings.map((b) => (b.key === 'option' ? { ...b, revision: null, notDeterminedReason: 'none', provenance: 'not-determined' } : b)),
    };
    const page = steeringOnePager(full({ decision: none }));
    const step = page.nextSteps.find((x) => x.key === 'option');
    expect(step?.owner).toBe('Decision maker');
    expect(step?.text).toMatch(/^Choose one of the four options/);
    expect(step?.link?.href).toBe('/project/p-1?view=management#decision-options');
  });

  test('effort and cost per option come only from Economics, the cost as a simulation with its revision', () => {
    const seed = initialCostAssumptions();
    expect(seed.options.map((o) => o.label)).toEqual(['Keep', 'Rebuild', 'Move to SAP standard', 'Retire']);
    const assumptions: CostAssumptions = {
      ...seed,
      currency: 'EUR',
      devDayRate: 800,
      testDayRate: 600,
      horizonYears: 5,
      releaseCadence: { perYear: 2, confirmed: true },
      options: seed.options.map((o) => ({
        ...o,
        oneOff: { low: { devDays: 10, testDays: 5 }, high: { devDays: 20, testDays: 10 } },
        perRelease: { devDays: 1, testDays: 1 },
        maintenanceBaselinePerYear: o.kind === 'do-nothing' ? { devDays: 3, testDays: 1 } : null,
        upgradeDelay: o.kind === 'do-nothing' ? { state: 'stated' as const, value: { releasesDeferred: 2 } } : null,
        effortSource: o.kind === 'retire' ? ('proposal-unconfirmed' as const) : ('stated' as const),
      })),
    };
    const checked = validateEconomicsPayload(JSON.parse(serializeEconomics({ assumptions, inputs: { ...ECONOMICS_START_INPUTS } })));
    if (!checked.ok) throw new Error(checked.error);
    const econ: EconomicsRecord = {
      formatVersion: ECONOMICS_RECORD_FORMAT,
      ...checked.value,
      revision: costAssumptionsRevision(checked.value.assumptions),
      basis: { runId: 'run-1', score: null },
      savedAt: '2026-10-06T12:00:00.000Z',
    };
    const page = steeringOnePager(full({ project: { ...signed, _economics: econ } as Project }));
    if (page.decision.state !== 'ready') throw new Error('not ready');
    const rebuild = page.decision.options.find((o) => o.option === 'rebuild')!;
    expect(rebuild.effort).toMatchObject({ value: '15–30 days once · 2 per release', provenance: 'confirmed' });
    // An unconfirmed size proposal is no figure of the account.
    const retire = page.decision.options.find((o) => o.option === 'retire')!;
    expect(retire.effort).toMatchObject({ value: null, provenance: 'not-determined' });
    expect(retire.cost).toMatchObject({ value: null, provenance: 'not-determined' });
    // A priced option carries its amount only as a simulation, with the revision it comes from.
    expect(rebuild.cost.provenance).toBe('simulation');
    expect(rebuild.cost.value).toMatch(/over 5 years$/);
    expect(rebuild.cost.note).toContain(econ.revision);
    // Every other line of the page stays without an amount.
    for (const line of textOf(page)) expect(containsAmount(line), line).toBe(false);
  });
});

/* ------------------------------------------------------ 5. shape of the thing */

test.describe('8.6 one-pager — a view, not a record', () => {
  test('the module is pure and the component adds no number of its own', () => {
    const lib = read('lib/steering-one-pager.ts');
    expect(lib).not.toMatch(/from ['"]react['"]|firebase|fetch\(/);
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toContain('steeringOnePager(');
    // No write: the one-pager is never stored.
    expect(component).not.toMatch(/setDoc|updateDoc|addDoc|runProjectCommand|method:\s*['"]POST/);
  });

  test('the scope sentence says it is derived, not stored and not in the audit pack', () => {
    const page = steeringOnePager(full());
    expect(page.footnote.scope).toBe('Derived when opened; not stored; not part of the signed audit pack.');
  });

  test('every opening reads anew: an earlier read is dropped before the page or Print can show it', () => {
    // QA review of 4b4586aff273: reopening kept the previous read, so the
    // page (and Print) showed stale figures while the new reads were pending.
    const component = read('components/workspace/SteeringOnePager.tsx');
    expect(component).toMatch(
      /const openFresh = \(\) => \{\s*setHistory\(undefined\);\s*setFindings\(undefined\);\s*setDecision\(undefined\);\s*setProcess\(undefined\);\s*setOpen\(true\);/,
    );
    expect(component).toContain('onClick={openFresh}');
  });

  test('it is not part of the signed audit pack', () => {
    for (const rel of ['lib/audit-pack.ts', 'lib/audit-pack-build.ts', 'lib/audit-pack-canonical.ts']) {
      expect(read(rel), `${rel} reaches the one-pager`).not.toContain('steering');
    }
  });

  test('it prints through the browser on one landscape page, and no PDF package was added', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(/body:has\(\[data-steering-print\]\)/);
    expect(css).toMatch(/@page steering \{\s*size: A4 landscape;/);
    expect(css).toMatch(/\[data-steering-print\] a\[href\]::after \{\s*content: none !important;/);
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      expect(name, 'a PDF package crept in for 8.6').not.toMatch(/pdf/i);
    }
  });
});

/* -------------------------------------------------------- 6. on the screen */
/* Needs the emulators and a dev server (`npx playwright test` as in CI). */

const firebaseApp = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
const clientAuth = getAuth(firebaseApp);
try {
  connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
} catch {
  /* already connected */
}

const PASSWORD = 'SteeringPage123!';
const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function signIn(page: Page, email: string): Promise<void> {
  await signInViaLanding(page, email, PASSWORD);
}

test.describe('8.6 rendered — the one-pager in the Management view', () => {
  const OWNER = `${unique('steering-owner')}@cleancore-test.io`;
  const PROJECT_ID = unique('steering');

  test.beforeAll(async () => {
    test.setTimeout(180 * 1000);
    const cred = await createUserWithEmailAndPassword(clientAuth, OWNER, PASSWORD);
    await adminSetCustomClaim(cred.user.uid, { admin: true });
    await adminSetDoc('users', cred.user.uid, {
      firstName: 'Steering', lastName: 'Owner', email: OWNER,
      tier: 'pilot', status: 'approved', isAdmin: true,
      transformationsUsed: 1, transformationsLimit: 5, createdAt: new Date(),
    });
    await adminSetDoc('projects', PROJECT_ID, {
      name: 'Nothing analysed yet', userId: cred.user.uid,
      createdAt: new Date(), status: 'created',
      legacyCode: 'REPORT z_bare.\nWRITE 1.\n',
    });
  });

  test('opens as one page: the decision, four figures, reasons in place, links without addresses', async ({ page }) => {
    test.setTimeout(240 * 1000);
    await signIn(page, OWNER);
    await page.goto(`/project/${PROJECT_ID}?view=management`, { waitUntil: 'domcontentloaded' });

    const button = page.locator('[data-steering-one-pager="closed"] button');
    await expect(button).toBeVisible({ timeout: 60000 });
    await button.click();

    const pager = page.locator('[data-steering-one-pager="open"]');
    await expect(pager.locator('[data-steering-summary]')).toBeVisible({ timeout: 60000 });

    // No signed run: the score says so in place, with its reason, not a zero.
    await expect(pager.locator('[data-steering-figure="score"] [data-figure-absent-reason]')).toContainText('no signed run');
    // At most four key figures, each with a link into this project.
    const figures = pager.locator('[data-steering-figure]');
    expect(await figures.count()).toBeLessThanOrEqual(4);
    for (const href of await pager.locator('[data-steering-evidence]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') ?? ''),
    )) {
      expect(href.startsWith(`/project/${PROJECT_ID}`)).toBe(true);
    }
    // No address is printed as text.
    expect(await pager.innerText()).not.toMatch(/https?:\/\//);
    await expect(pager.locator('[data-steering-scope]')).toHaveText('Derived when opened; not stored; not part of the signed audit pack.');

    // A phone: it stacks, and nothing runs off the side.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the one-pager runs off a 390 px screen').toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 1000 });

    // On paper, nothing but the one-pager, no buttons, and one page.
    await page.emulateMedia({ media: 'print' });
    await expect(pager).toBeVisible();
    await expect(page.locator('[data-management-view=""]')).toBeHidden();
    for (const b of await pager.locator('button').all()) await expect(b).toBeHidden();
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages, 'the one-pager prints on more than one page').toBe(1);
  });
});
