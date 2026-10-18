import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import {
  GUI_FILE_NO_ROUTE_DRIVER_FROM,
  guiFileDirection,
  routeDrivers,
  routeExtensibility,
} from '../lib/abap/extensibility-router';
import { IN_APP_ROUTE, SIDE_BY_SIDE_ROUTE } from '../lib/sap-naming';
import {
  COMPARED_OPTIONS,
  OPTION_COMPARISON_PROMPT_RULE,
  OPTION_COMPARISON_SCHEMA,
  circularReason,
  dataContractRows,
  engineOptionFacts,
  readOptionComparison,
} from '../lib/design-option-comparison';
import { engineDesignContext } from '../lib/design-engine-context';
import { decisionOnRecord, rebuildWarning, standardFitAssessed } from '../lib/standard-fit-gate';
import { deriveDecisionDraft, type DecisionDraftFacts } from '../lib/decision-draft';
import { SELF_DECLARATION } from '../lib/project-decision';
import { buildTransformationContext, type TransformationContextInput } from '../lib/transformation-context';
import {
  COST_REVISION_PATH,
  buildCostRevision,
  buildDecisionRecord,
  finishDeliveryPackage,
  type DeliveryFacts,
  type DecisionFacts,
} from '../lib/delivery-package';
import { costRevisionFactsOf } from '../lib/delivery-facts';
import type { DecisionCostBasis } from '../lib/decision-cost';
import type { EconomicsRecord } from '../lib/economics-record';
import type { HandoverProject } from '../lib/handover';

/**
 * Roadmap 3.0.13, moved into 3.0.12 by the owner on 12.10.2026 — "Design
 * reasons with SAP's standard, not past it" (CO review F14/F15/F17, PP F11,
 * SD R12). Server-free: every check here runs on the libraries.
 */

const ROOT = path.resolve(__dirname, '..');
const NEW = GUI_FILE_NO_ROUTE_DRIVER_FROM;
const OLD = 'v3.0.11';

const DOWNLOAD_ONLY = `REPORT zco_list.
DATA lt_out TYPE STANDARD TABLE OF string.
SELECT * FROM coep INTO TABLE @DATA(lt_coep) WHERE kokrs = '1000'.
CALL FUNCTION 'GUI_DOWNLOAD'
  EXPORTING filename = 'C:\\temp\\co.txt'
  TABLES data_tab = lt_out.
`;

const UPLOAD_ONLY = `REPORT zpp_load.
DATA lt_in TYPE STANDARD TABLE OF string.
CALL FUNCTION 'GUI_UPLOAD'
  EXPORTING filename = 'C:\\temp\\in.txt'
  TABLES data_tab = lt_in.
LOOP AT lt_in INTO DATA(ls_in).
  WRITE / ls_in.
ENDLOOP.
`;

const WS_BOTH = `REPORT zsd_old.
DATA lt_x TYPE STANDARD TABLE OF string.
CALL FUNCTION 'WS_UPLOAD' EXPORTING filename = 'a.txt' TABLES data_tab = lt_x.
CALL FUNCTION 'WS_DOWNLOAD' EXPORTING filename = 'b.txt' TABLES data_tab = lt_x.
`;

const route = (code: string, deployment: 'public' | 'private', engine: string) =>
  routeExtensibility(buildAbapEvidence(code, 'zx.abap', deployment, undefined, engine), deployment, engine);

/* ------------------------------------------------------------- the router */

test.describe('the route: a frontend file feature never forces side-by-side (F14, PP F11, SD R12)', () => {
  for (const deployment of ['private', 'public'] as const) {
    test(`a GUI download alone stays on-stack — ${deployment}`, () => {
      const r = route(DOWNLOAD_ONLY, deployment, NEW);
      expect(r.recommendedRoute).toBe(IN_APP_ROUTE);
      expect(r.targetArtifact).toBe('RAP Business Object');
      expect(r.rationale).not.toContain('Decoupled web client uploads');
      expect(r.rationale).toContain('frontend file download (GUI_DOWNLOAD, from line 4)');
      expect(r.rationale).toContain('list report exports it to a spreadsheet on-stack');
      expect(r.rationale).not.toMatch(/side-by-side (?:is|are) required|required on SAP BTP/i);
      expect(routeDrivers(buildAbapEvidence(DOWNLOAD_ONLY, 'zx.abap', deployment), deployment, NEW)).toEqual([]);
    });

    test(`a GUI upload alone stays on-stack, and names what would justify a split — ${deployment}`, () => {
      const r = route(UPLOAD_ONLY, deployment, NEW);
      expect(r.recommendedRoute).toBe(IN_APP_ROUTE);
      expect(r.rationale).toContain('frontend file upload (GUI_UPLOAD, from line 3)');
      expect(r.rationale).toContain('large object (attachment) field from S/4HANA 2022 on');
      expect(r.rationale).toContain('the upload alone forces no side-by-side split');
      expect(r.rationale).toMatch(/requirement the code does not show, such as external users/);
      // On-stack rework, not "highly compatible": SAP GUI's file services do not run in ABAP Cloud.
      expect(r.comparativeAnalysis.inAppABAPCloud.technicalFeasibility).toBe('Partially Compatible');
      expect(r.checkpoints[3].evaluation).toMatch(/^Optional\. Nothing found requires a separate/);
    });
  }

  test('a run signed before 3.0.12 keeps the rule it was signed with', () => {
    const r = route(DOWNLOAD_ONLY, 'private', OLD);
    expect(r.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
    expect(r.rationale).toBe('Frontend GUI file services are used. Decoupled web client uploads on SAP BTP are required.');
    expect(routeDrivers(buildAbapEvidence(DOWNLOAD_ONLY, 'zx.abap', 'private', undefined, OLD), 'private', OLD).map((d) => d.kind)).toEqual(['gui-download']);
  });

  test('with another driver the route names that driver, not the file feature', () => {
    const code = `${UPLOAD_ONLY}CALL FUNCTION 'Z_REMOTE' DESTINATION 'ERP'.\n`;
    const r = route(code, 'private', NEW);
    expect(r.recommendedRoute).toBe(SIDE_BY_SIDE_ROUTE);
    expect(r.rationale).toMatch(/^RFC integrations are present\./);
    expect(r.rationale).toContain('the upload alone forces no side-by-side split');
  });

  test('WS_DOWNLOAD and WS_UPLOAD are frontend file transfers, upload and download apart', () => {
    const findings = buildAbapEvidence(WS_BOTH, 'zx.abap').findings.filter((f) => f.kind === 'gui-download');
    expect(findings.map((f) => f.objectName)).toEqual(['WS_UPLOAD', 'WS_DOWNLOAD']);
    expect(findings.map((f) => guiFileDirection(f))).toEqual(['upload', 'download']);
    expect(findings[1].targetOptions).toEqual(['Developer Extensibility / RAP']);
    expect(findings[1].recommendation).toContain('list report');
    expect(findings[0].recommendation).toContain('RAP large object');
  });

  test('the router\'s rationale is never circular — over the 300 benchmark cases, both editions', () => {
    const dir = path.join(ROOT, 'tests/prozess-benchmark/cases');
    const offenders: string[] = [];
    // From 3.0.12 two rules move routes: a frontend file feature
    // (`GUI_FILE_NO_ROUTE_DRIVER_FROM`) and BDC, native SQL, a local RFC and
    // Public Edition table writes (`ON_STACK_CONSTRUCTS_FROM`). Every move goes
    // off-stack -> on-stack, and only where every driver it had is one of those.
    const DROPPED = new Set(['gui-download', 'bdc', 'native-sql', 'custom-table-write', 'standard-table-write', 'rfc-call']);
    let changedOtherwise = 0;
    let moved = 0;
    for (const id of fs.readdirSync(dir).filter((n) => /^BM-\d{3}$/.test(n))) {
      const files = fs.readdirSync(path.join(dir, id)).filter((n) => n.endsWith('.abap')).sort();
      if (!files.length) continue;
      const code = files.map((f) => fs.readFileSync(path.join(dir, id, f), 'utf8')).join('\n');
      for (const deployment of ['private', 'public'] as const) {
        // Each side with its own engine's evidence, as a run of it signs:
        // since 3.0.12 the evidence is version-gated too (the RFC detector).
        const evidenceBefore = buildAbapEvidence(code, files[0], deployment, undefined, OLD);
        const evidence = buildAbapEvidence(code, files[0], deployment, undefined, NEW);
        const now = routeExtensibility(evidence, deployment, NEW);
        const before = routeExtensibility(evidenceBefore, deployment, OLD);
        const why = circularReason(now.rationale);
        if (why) offenders.push(`${id}/${deployment}: ${why}`);
        if (now.recommendedRoute !== before.recommendedRoute) {
          moved += 1;
          const old = routeDrivers(evidenceBefore, deployment, OLD).map((d) => d.kind);
          const left = routeDrivers(evidence, deployment, NEW);
          const allDropped = old.length > 0 && old.every((k) => DROPPED.has(k));
          if (before.recommendedRoute !== SIDE_BY_SIDE_ROUTE || now.recommendedRoute !== IN_APP_ROUTE || left.length > 0 || !allDropped) {
            changedOtherwise += 1;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(changedOtherwise).toBe(0);
    // Measured 13.10.2026: 28 Private and 133 Public Edition routes move on-stack.
    expect(moved).toBe(161);
  });
});

/* ------------------------------------------------------- circular reasons */

test.describe('a decision reason names the requirement the other options miss', () => {
  for (const circular of [
    'CAP because the target architecture is CAP.',
    'We choose side-by-side since the chosen route is side-by-side.',
    'RAP, as RAP is the recommended target.',
    'The target is CAP, so CAP.',
    'Side-by-side CAP on SAP BTP is the best fit.',
  ]) {
    test(`refused: "${circular}"`, () => {
      expect(circularReason(circular)).not.toBeNull();
    });
  }
  test('a reason with a requirement passes', () => {
    expect(circularReason('External dealers without an SAP user upload price lists; an in-app extension cannot authenticate them and the standard has no dealer portal.')).toBeNull();
  });
});

/* ------------------------------------------------- the design's comparison */

/** A model answer to the comparison schema, for the reading and the gate. */
const answer = (over: Record<string, unknown> = {}) => ({
  optionComparison: {
    options: [
      { option: 'cap', targetRelease: 'S/4HANA 2023', fitGap: 'Covers all.', effort: 'High', runningCost: 'Own runtime', dataContract: 'ACDOCA via API' },
      { option: 'standard', targetRelease: 'S/4HANA 2023', fitGap: 'SAP allocation (KSU5) covers the cycle; the gap is the custom key.', effort: 'Low', runningCost: 'None beyond licence', dataContract: 'ACDOCA' },
      { option: 'rap', targetRelease: 'S/4HANA 2023', fitGap: 'Rebuilds the key on-stack.', effort: 'Medium', runningCost: 'Costs about 12.000 EUR a year', dataContract: 'ACDOCA, plan ACDOCP' },
    ],
    recommended: 'rap',
    decisionReason: 'The custom allocation key per plant is not configurable in SAP allocation, and no external user needs the result, so no separate runtime is warranted.',
    requirementOthersMiss: 'An allocation key per plant that the standard cycle cannot express.',
    ...over,
  },
});

test.describe('the design compares standard, RAP and CAP before ruling the standard out (F14, F15)', () => {
  test('the design prompt carries the comparison schema and rule, on both tracks', () => {
    const page = fs.readFileSync(path.join(ROOT, 'app/(app)/project/[projectId]/design/page.tsx'), 'utf8');
    expect(page.match(/\$\{OPTION_COMPARISON_SCHEMA\}/g)?.length).toBe(2);
    expect(page.match(/OPTIONS: \$\{OPTION_COMPARISON_RULE\} \$\{OPTION_COMPARISON_PROMPT_RULE\}/g)?.length).toBe(2);
    for (const key of ['targetRelease', 'fitGap', 'effort', 'runningCost', 'dataContract', 'decisionReason', 'requirementOthersMiss']) {
      expect(OPTION_COMPARISON_SCHEMA).toContain(`${key}:`);
    }
    // 3.0.19: key-user extensibility is the second option (tests/key-user-3019.spec.ts).
    expect(OPTION_COMPARISON_SCHEMA).toContain("'standard' | 'keyuser' | 'rap' | 'cap'");
    expect(OPTION_COMPARISON_SCHEMA).toContain('NEVER an amount of money');
    expect(OPTION_COMPARISON_PROMPT_RULE).toContain('A frontend file upload or download alone never justifies side-by-side');
    expect(OPTION_COMPARISON_PROMPT_RULE).toContain('Plan and actual are never both read from ACDOCA');
    expect(OPTION_COMPARISON_PROMPT_RULE).toContain('("CAP because the target architecture is CAP") is refused');
  });

  test('the data contract is release-bound: actuals ACDOCA, plan not ACDOCA, SKF apart, the currency named', () => {
    const rows = dataContractRows(['COSP', 'COEP', 'COSR', 'KNA1']);
    const by = Object.fromEntries(rows.map((r) => [r.measure, r]));
    expect(Object.keys(by)).toEqual(['actual', 'plan', 'statistical-key-figures', 'currency']);
    expect(by.actual.source).toMatch(/^ACDOCA/);
    expect(by.plan.source).toMatch(/^Not ACDOCA\. ACDOCP .* or the planning source the customer runs \(BW\/BPC, SAP Analytics Cloud\) — as configured/);
    expect(by['statistical-key-figures'].source).toContain('FINSSKF');
    expect(by['statistical-key-figures'].source).toContain('apart from plan and from ACDOCA');
    expect(by.currency.source).toContain('controlling area');
    expect(dataContractRows(['KNA1', 'VBAK'])).toEqual([]);
  });

  test('the engine context carries the option facts per option, grounded in the findings', () => {
    const evidence = buildAbapEvidence(DOWNLOAD_ONLY, 'zx.abap', 'private');
    const rows = evidence.findings.map((f) => ({
      id: f.id, kind: f.kind, title: f.title, severity: f.severity, objectName: f.objectName ?? null, objectType: f.objectType ?? null,
      lineStart: f.lineStart, lineEnd: null, routine: null, level: null, successor: f.objectName === 'COEP' ? 'I_JOURNALENTRYITEM' : null,
    }));
    const text = engineDesignContext({ requirements: null, contract: null, findings: rows as never, deployment: 'private', engineVersion: NEW });
    const ctx = JSON.parse(text) as { optionFacts: ReturnType<typeof engineOptionFacts> };
    expect(Object.keys(ctx.optionFacts.options)).toEqual([...COMPARED_OPTIONS]);
    expect(ctx.optionFacts.options.standard.join(' ')).toContain('COEP → I_JOURNALENTRYITEM (line 3)');
    expect(ctx.optionFacts.options.cap.join(' ')).toContain('No construct in the code forces a split');
    expect(ctx.optionFacts.options.rap.join(' ')).toContain('a download to a list report export');
    expect(ctx.optionFacts.dataContract.map((r) => r.measure)).toEqual(['actual', 'currency']);
    expect(ctx.optionFacts.targetRelease).toContain('Not recorded on the project');
  });

  test('the comparison is read standard first, an amount refused, a good reason kept', () => {
    const view = readOptionComparison(answer());
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.options.map((o) => o.option)).toEqual(['standard', 'rap', 'cap']);
    expect(view.options[1].runningCost).toMatch(/^Not stated here — an amount needs approved cost assumptions/);
    expect(view.reason?.requirement).toContain('allocation key per plant');
    expect(view.refused).toBeNull();
  });

  test('a circular reason is refused and said to be refused', () => {
    const view = readOptionComparison(answer({ recommended: 'cap', decisionReason: 'CAP because the target architecture is CAP.' }));
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.reason).toBeNull();
    expect(view.refused).toContain('restates the route or the target');
    const noRequirement = readOptionComparison(answer({ requirementOthersMiss: 'CAP.' }));
    expect(noRequirement.state === 'ready' && noRequirement.refused).toMatch(/requirement the other options miss is not named/);
  });

  test('the Design document and its export render the comparison', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'components/design/DesignDocument.tsx'), 'utf8');
    expect(doc).toContain('<OptionComparison design={design} />');
    const exp = fs.readFileSync(path.join(ROOT, 'lib/design-export.ts'), 'utf8');
    expect(exp).toContain('readOptionComparison(data)');
  });
});

/* ------------------------------------------ standard fit and the decision */

const RUN_ID = 'run-1';
const draftFacts = (architecture: string): DecisionDraftFacts => ({
  runId: RUN_ID,
  evidenceDigest: 'd'.repeat(64),
  runSignedAt: '2026-10-01T08:00:00.000Z',
  contract: null,
  signedOffArchitecture: architecture,
  signOff: { by: 'owner@example.invalid', at: '2026-10-02T08:00:00.000Z', reason: 'The standard allocation covers the cycle.', notCurrent: null },
  need: { revision: 1, confirmedDrops: 0, undecided: 0 },
  handedOver: false,
  stored: undefined,
  now: '2026-10-03T10:00:00.000Z',
});
const confirmed = (architecture: string, costBasis: DecisionCostBasis | null = null) => ({
  ...deriveDecisionDraft(draftFacts(architecture)).draft,
  status: 'confirmed',
  confirmation: { account: 'owner@example.invalid', at: '2026-10-03T11:00:00.000Z', selfDeclaration: SELF_DECLARATION },
  ...(costBasis ? { costBasis } : {}),
});

test.describe('standardFitAssessed and decisionOnRecord — one reading for the warning tip and the prompt', () => {
  test('nothing on record: not assessed, no decision, and the warning applies with open rules', () => {
    const p = { activeRunId: RUN_ID };
    expect(standardFitAssessed(p)).toMatchObject({ assessed: false, basis: null });
    expect(decisionOnRecord(p)).toMatchObject({ onRecord: false, confirmed: false });
    expect(rebuildWarning(p, 3).warn).toBe(true);
    expect(rebuildWarning(p, 0).warn).toBe(false);
    expect(rebuildWarning(p, null).warn).toBe(false);
  });

  test('a confirmed decision to move to SAP standard is the assessment', () => {
    const p = { activeRunId: RUN_ID, decision: confirmed('standard') };
    expect(decisionOnRecord(p)).toMatchObject({ onRecord: true, confirmed: true, option: 'standard' });
    expect(standardFitAssessed(p)).toMatchObject({ assessed: true, basis: 'decision-standard' });
  });

  test('a confirmed rebuild is on record — no warning — but it is not a standard assessment', () => {
    const p = { activeRunId: RUN_ID, decision: confirmed('cap') };
    expect(decisionOnRecord(p)).toMatchObject({ confirmed: true, option: 'rebuild' });
    expect(standardFitAssessed(p).assessed).toBe(false);
    expect(rebuildWarning(p, 5).warn).toBe(false);
    // On another run it is history, and the warning is back.
    const later = { ...p, activeRunId: 'run-2' };
    expect(decisionOnRecord(later)).toMatchObject({ confirmed: false, confirmedEarlierRun: true });
    expect(rebuildWarning(later, 5).warn).toBe(true);
  });

  test('a design that compared the standard on facts counts; a circular one does not', () => {
    const good = { activeRunId: RUN_ID, solutionDesign: JSON.stringify(answer()) };
    expect(standardFitAssessed(good)).toMatchObject({ assessed: true, basis: 'design-comparison' });
    const circular = { activeRunId: RUN_ID, solutionDesign: JSON.stringify(answer({ decisionReason: 'CAP because the target architecture is CAP.' })) };
    const read = standardFitAssessed(circular);
    expect(read.assessed).toBe(false);
    expect(read.sentence).toContain('gives no usable reason');
  });

  test('the context pack says the standard was not weighed, from the same function', () => {
    const base: TransformationContextInput = {
      track: 'node',
      rules: { basis: 'source', revision: null, items: [] },
      decision: {
        route: { chosen: 'side-by-side-cap', recommended: 'side-by-side-cap', deviationReason: null },
        record: null,
        signedOff: null,
        reference: null,
        standardFit: standardFitAssessed({ activeRunId: RUN_ID }),
      },
      summary: null,
      objects: [],
      nfr: null,
      accepted: null,
      dataMode: null,
      originalFactsBelow: false,
    };
    expect(buildTransformationContext(base).text).toContain('Standard fit: NOT ASSESSED');
    const weighed = { ...base, decision: { ...base.decision, standardFit: standardFitAssessed({ activeRunId: RUN_ID, decision: confirmed('standard') }) } };
    const text = buildTransformationContext(weighed).text;
    expect(text).not.toContain('NOT ASSESSED');
    expect(text).toContain('Standard fit: The confirmed decision moves the program to SAP standard.');
    const build = fs.readFileSync(path.join(ROOT, 'lib/transformation-context-build.ts'), 'utf8');
    expect(build).toContain('standardFitAssessed(project)');
  });
});

/* ------------------------------------- F17: decision and cost revision together */

test.describe('the delivery package exports the cost revision the decision names (F17)', () => {
  const BASIS: DecisionCostBasis = {
    format: 1, revision: 'rev-key-7', sequence: 3, at: '2026-10-10T09:00:00.000Z',
    cheapest: { optionId: 'o2', label: 'Rebuild in RAP', kind: 'rebuild' }, noCheapest: null,
  };
  const ECONOMICS = (revision: string, sequence: number): EconomicsRecord => ({
    formatVersion: 1,
    revision,
    sequence,
    revisionAt: '2026-10-10T09:00:00.000Z',
    savedAt: '2026-10-11T09:00:00.000Z',
    basis: { runId: RUN_ID, score: 70 },
    assumptions: {
      version: 1, currency: 'EUR', devDayRate: 900, testDayRate: 700, horizonYears: 5,
      releaseCadence: { perYear: 4, confirmed: true },
      options: [
        { id: 'o1', kind: 'do-nothing', label: 'Do nothing', oneOff: { low: { devDays: 0, testDays: 0 }, high: { devDays: 0, testDays: 0 } }, perRelease: { devDays: 2, testDays: 1 }, maintenanceBaselinePerYear: { devDays: 10, testDays: 5 }, upgradeDelay: null, effortSource: 'stated' },
        { id: 'o2', kind: 'rebuild', label: 'Rebuild in RAP', oneOff: { low: { devDays: 20, testDays: 8 }, high: { devDays: 30, testDays: 12 } }, perRelease: { devDays: 1, testDays: 1 }, maintenanceBaselinePerYear: null, upgradeDelay: null, effortSource: 'stated' },
      ],
    },
    inputs: {} as EconomicsRecord['inputs'],
  });

  const factsWith = (decision: DecisionFacts): DeliveryFacts => ({
    projectId: 'p1', projectName: 'ZCO_ALLOC', route: 'abap-cloud', appVersion: 'v3.0.12', generatedAt: '2026-10-12T10:00:00.000Z',
    source: { fileName: 'zco.abap', sha256: 'a'.repeat(64), lines: 10, matchesSignedRun: true },
    run: { id: RUN_ID, engineVersion: 'v3.0.12', auditPackExportedAt: null },
    decision,
    rules: { state: 'not-detected', reason: 'no rules' },
    tests: { status: 'not-run', scenarios: 0, sentence: 'No test run is on record.', detail: [] },
    score: { signed: null, edition: 'private', rule: 'own-custom-writes-free', engineVersion: 'v3.0.12', model: null, unread: null },
    documentationFromEngine: true,
    referenceSection: '',
  });
  const decisionWith = (costRevision: DecisionFacts['costRevision']): DecisionFacts => ({
    state: 'confirmed', option: 'In-App ABAP Cloud (RAP)', optionKey: 'rebuild', targetCode: 'rap', by: 'owner@example.invalid',
    at: '2026-10-11T10:00:00.000Z', identity: 'DEC-1 · revision 2', reasons: [], recommendation: null,
    cost: 'Priced on revision 3 (10 Oct 2026).', costRevision, conditions: [], bindings: [], reversibility: null,
  });

  test('the revision Economics still holds travels with its figures, read-only', () => {
    const project = { _economics: ECONOMICS('rev-key-7', 3) } as unknown as HandoverProject;
    const r = costRevisionFactsOf(project, BASIS, 'DEC-1 · revision 2')!;
    expect(r).toMatchObject({ sequence: 3, at: '2026-10-10T09:00:00.000Z', cheapest: 'Rebuild in RAP', decision: 'DEC-1 · revision 2' });
    expect(r.figures?.options.map((o) => o.label)).toEqual(['Do nothing', 'Rebuild in RAP']);
    const pkg = finishDeliveryPackage({ entries: [], facts: factsWith(decisionWith(r)), layout: 'package' });
    const file = pkg.files.find((f) => f.path === COST_REVISION_PATH)?.content ?? '';
    expect(file).toContain('- Decision record: DEC-1 · revision 2');
    expect(file).toContain('- Revision number: 3');
    expect(file).toContain('- Saved: 10 Oct 2026 (2026-10-10T09:00:00.000Z)');
    expect(file).toContain('| Rebuild in RAP | rebuild | 20 dev + 8 test days | 30 dev + 12 test days | 1 dev + 1 test days | — | stated |');
    expect(file).not.toContain('rev-key-7');
    const decisionMd = pkg.files.find((f) => f.path === 'docs/decision.md')?.content ?? '';
    expect(decisionMd).toContain(`The revision itself: \`${COST_REVISION_PATH}\`.`);
    const manifest = JSON.parse(pkg.files.find((f) => f.path === 'manifest.json')!.content);
    expect(manifest.decision.costRevision).toEqual({ file: COST_REVISION_PATH, revision: 3, at: '2026-10-10T09:00:00.000Z', figuresIncluded: true });
    expect(manifest.files.find((f: { path: string }) => f.path === COST_REVISION_PATH)).toMatchObject({ kind: 'cost-revision', origin: 'engine' });
  });

  test('a later revision in Economics is never passed off as the one the decision was priced on', () => {
    const project = { _economics: ECONOMICS('rev-key-9', 5) } as unknown as HandoverProject;
    const r = costRevisionFactsOf(project, BASIS, 'DEC-1 · revision 2')!;
    expect(r.figures).toBeNull();
    expect(r.figuresNote).toContain('Economics holds a later revision now (revision 5');
    const file = buildCostRevision(factsWith(decisionWith(r)));
    expect(file).toContain('- Revision number: 3');
    expect(file).not.toContain('Rebuild in RAP |');
  });

  test('no confirmed decision with a cost basis: no file, and decision.md says what it says today', () => {
    const pkg = finishDeliveryPackage({ entries: [], facts: factsWith(decisionWith(null)), layout: 'package' });
    expect(pkg.files.some((f) => f.path === COST_REVISION_PATH)).toBe(false);
    expect(buildDecisionRecord(factsWith(decisionWith(null)))).not.toContain(COST_REVISION_PATH);
    expect(costRevisionFactsOf({} as HandoverProject, null, null)).toBeNull();
  });
});
