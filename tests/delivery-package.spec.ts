import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Project } from '../lib/types';
import { sha256Hex } from '../lib/artefact-digest';
import { testingClosureBasis, workflowSteps } from '../lib/workflow-steps';
import { nextTestRunFailure } from '../lib/testing-closure';
import { testRunSubject, TEST_RUN_RECEIPT_VERSION, type TestRunReceipt } from '../lib/test-receipt';
import { validateProjectCommand } from '../lib/project-commands';
import type { HandoverProject } from '../lib/handover';
import type { ProcessStateView } from '../lib/process-states';
import {
  PACKAGE_NODE_MAJOR,
  createDeliveryBundle,
  finishDeliveryPackage,
  suiteRunner,
  type BundleEntry,
  type DeliveryFacts,
} from '../lib/delivery-package';
import { deliveryFactsOf, recordedCostSentence, ruleFactsOf, scoreFactsOf, type ScoreEvidence } from '../lib/delivery-facts';

/**
 * The delivery package tells the truth (owner, 11.10.2026; external review of
 * the FI_Collection_Worklist bundle, F-04, F-05, F-08, F-09, F-10).
 *
 * The fixture has the shape of the reviewed bundle — an Express service on
 * synthetic data with a CDS schema and no @sap/cds, an ABAP publisher, a
 * node:test suite, a package.json whose `test` ran Playwright — with stand-in
 * content: none of the owner's code is in this repository.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = 'REPORT zfi_ar_collection_worklist.\nSELECT * FROM bsid INTO TABLE @DATA(lt).\nWRITE / lines( lt ).\n';

const SERVICE = `import express from 'express';
import pino from 'pino';

export interface ReceivableItem { belnr: string; amount: number; dueDate: string | null }

/** Synthetic items standing in for BSID/BSAD — no SAP system is called. */
export function getSyntheticItems(): ReceivableItem[] {
  return [{ belnr: '1900000001', amount: 100, dueDate: '2026-09-01' }];
}

export class AgingEngine {
  bucket(item: ReceivableItem): string {
    return item.dueDate ? '01-30' : 'UNKNOWN';
  }
}

const app = express();
app.get('/WorklistItems', (_req, res) => res.json(getSyntheticItems()));
export default app;
`;

const MODEL_PACKAGE_JSON = JSON.stringify({
  name: 'ar-collections-worklist-modernized',
  version: '1.0.0',
  main: 'srv/service.ts',
  type: 'module',
  scripts: { start: 'node --loader ts-node/esm srv/service.ts', build: 'tsc', test: 'playwright test' },
  dependencies: {
    express: '^4.19.2',
    pino: '^9.0.0',
    typeorm: '^0.3.20',
    '@sap-cloud-sdk/http-client': '^3.15.0',
    '@sap/xssec': '^3.6.1',
    passport: '^0.7.0',
  },
  devDependencies: {
    '@playwright/test': '^1.44.0',
    '@types/express': '^4.17.21',
    '@types/node': '^20.12.7',
    'ts-node': '^10.9.2',
    typescript: '^5.4.5',
  },
});

const MODEL_DOCKERFILE = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
FROM node:20-alpine AS runner
COPY --from=builder /app /app
CMD ["node", "--loader", "ts-node/esm", "srv/service.ts"]
`;

const PACKAGE = JSON.stringify([
  { path: 'srv/service.ts', content: SERVICE },
  { path: 'db/schema.cds', content: 'namespace fi;\nentity Items { key belnr : String(10); dunningArea : String(2); }\n' },
  { path: 'package.json', content: MODEL_PACKAGE_JSON },
  { path: 'Dockerfile', content: MODEL_DOCKERFILE },
  { path: 'erp-triggers/zcl_core_event_publisher.clas.abap', content: 'CLASS zcl_core_event_publisher DEFINITION PUBLIC.\n  INTERFACES if_oo_adt_classrun.\nENDCLASS.\n' },
]);

const SUITE = "import { test } from 'node:test';\nimport { strict as assert } from 'node:assert';\nimport { AgingEngine } from './srv/service';\ntest('TC_01: bucket', () => { assert.equal(new AgingEngine().bucket({ belnr: '1', amount: 1, dueDate: null }), 'UNKNOWN'); });\n";
const CASES = Array.from({ length: 10 }, (_, i) => ({ id: `TC_${String(i + 1).padStart(2, '0')}`, name: `Case ${i + 1}`, category: 'Unit' }));

function fiProject(extra: Partial<Project> & Record<string, unknown> = {}): HandoverProject {
  return {
    id: 'p-fi',
    name: 'FI_Collection_Worklist',
    userId: 'owner-uid',
    legacyCode: SOURCE,
    activeRunId: 'run-fi-0001',
    extensibilityRoute: 'Side-by-Side (SAP BTP)',
    originalRecommendation: 'cap',
    recommendationJustification: 'The report reads open items and needs no write access to the core.',
    cleanCoreScore: 75,
    s4Deployment: 'private',
    analyzerVersion: 'v3.0.9',
    solutionDesign: '# CAP side-by-side',
    analysis: JSON.stringify({ cleanCoreScore: 75 }),
    generatedCode: PACKAGE,
    testSuite: { code: SUITE },
    testCases: CASES,
    auditMetadata: {
      inputFingerprint: {
        sha256: sha256Hex(SOURCE), fileName: 'zfi_ar_collection_worklist.abap', lineCount: 3, byteSize: SOURCE.length,
        uploadedAt: '2026-10-11T12:00:00.000Z', objectType: 'Report',
      },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: 'v3.0.9', byokUsed: false },
    },
    ...extra,
  } as unknown as HandoverProject;
}

const BUILD_ERROR = 'Compilation failed:\n<sandbox>/test.ts:162:27: ERROR: Expected ")" but found "\'=SUM(A1:B2)\'"';

function withFailure(p: HandoverProject, attempts = 3): HandoverProject {
  let stored: unknown = null;
  for (let i = 0; i < attempts; i++) {
    stored = nextTestRunFailure(stored, { subject: testRunSubject(p), at: '2026-10-11T14:40:00.000Z', by: 'owner-uid', kind: 'build-error', cause: BUILD_ERROR });
  }
  return { ...p, testRunFailure: stored } as HandoverProject;
}

function withReceipt(p: HandoverProject, verdict: 'Passed' | 'Failed'): HandoverProject {
  const s = testRunSubject(p);
  const receipt: TestRunReceipt = {
    v: TEST_RUN_RECEIPT_VERSION,
    runId: s.runId,
    codeDigest: s.codeDigest,
    suiteDigest: s.suiteDigest,
    casesDigest: s.casesDigest,
    environment: 'mock',
    scope: { selected: null, cases: CASES.length },
    stubs: ['express'],
    executedAt: '2026-10-11T15:00:00.000Z',
    executedBy: 'owner-uid',
    exitCode: verdict === 'Passed' ? 0 : 1,
    verdicts: CASES.map((c) => ({ id: c.id, status: verdict })),
  };
  return { ...p, testRunReceipt: receipt } as HandoverProject;
}

/** Twelve rules, none decided — the owner's state of 11.10.2026. */
const RULES_OPEN: ProcessStateView = {
  formatVersion: 1,
  revision: 0,
  baselineRevision: 1,
  subjects: Array.from({ length: 12 }, (_, i) => ({ subject: `BR-${String(i + 1).padStart(3, '0')}`, kind: 'rule' })) as ProcessStateView['subjects'],
  entries: [],
  links: [],
};

const EVIDENCE: ScoreEvidence = {
  findings: [
    { kind: 'standard-table-read', objectName: 'BSID', lineStart: 2 },
    { kind: 'standard-table-read', objectName: 'BSAD', lineStart: 40 },
    { kind: 'rfc-call', objectName: 'FI_TERMS_OF_PAYMENT', lineStart: 560 },
    { kind: 'gui-download', lineStart: 1200 },
  ],
  coverage: { complete: false, gaps: [{ label: 'Dynamic calls', count: 2, firstLine: 900 }] },
};

/** The bundle the page builds for a generated package — the same calls, in the same order. */
function bundleOf(p: HandoverProject): BundleEntry[] {
  const bundle = createDeliveryBundle();
  for (const f of JSON.parse(p.generatedCode as string) as Array<{ path: string; content: string }>) bundle.file(f.path, f.content, 'generated');
  bundle.file('test.ts', (p.testSuite as { code: string }).code, 'generated');
  const docs = bundle.folder('docs');
  docs.file('business-analysis.md', '# Business analysis\n');
  docs.file('solution-design.md', '# Solution design\nCAP, Event Mesh, PostgreSQL.\n');
  docs.file('process-documentation.md', '# Process documentation\n');
  docs.file('developer-guidelines.md', '# Guidelines\n');
  return bundle.entries;
}

function factsOf(p: HandoverProject, rules = ruleFactsOf(RULES_OPEN), evidence: ScoreEvidence | null = EVIDENCE): DeliveryFacts {
  return deliveryFactsOf(p, {
    phases: workflowSteps(p),
    rules,
    score: scoreFactsOf(p, evidence),
    generatedAt: '2026-10-11T16:00:00.000Z',
    appVersion: 'v3.0.10',
    referenceSection: '## Reference patterns\n\nTarget: `cap`\n',
    documentationFromEngine: true,
  });
}

function finished(p: HandoverProject, facts = factsOf(p)) {
  const out = finishDeliveryPackage({ entries: bundleOf(p), facts, layout: 'package' });
  const file = (name: string) => out.files.find((f) => f.path === name)?.content ?? null;
  return { ...out, file, names: out.files.map((f) => f.path) };
}

/** The paths the README's "Files" section lists. */
function filesSection(readme: string): string[] {
  const start = readme.indexOf('## Files');
  const end = readme.indexOf('\n## ', start + 1);
  return [...readme.slice(start, end === -1 ? undefined : end).matchAll(/^- `([^`]+)` — /gm)].map((m) => m[1]);
}

/* ======================================================= README from its files */

test.describe('README.md is written from the files in the archive', () => {
  test('every file it names is in the archive, and every file in the archive is named', () => {
    const pkg = finished(withFailure(fiProject()));
    const readme = pkg.file('README.md')!;
    const listed = filesSection(readme);
    expect(listed.sort()).toEqual([...pkg.names].sort());
    // The names the old README hard-coded and the FI bundle did not carry.
    expect(readme).not.toContain('srv/service.cds');
    expect(readme).not.toContain('Production container deployment setup');
    expect(readme).not.toMatch(/released BAdI/i);
    expect(readme).not.toMatch(/Deploy the ABAP trigger/i);
  });

  test('every script it names is a script of the package.json it ships', () => {
    const pkg = finished(withFailure(fiProject()));
    const readme = pkg.file('README.md')!;
    const scripts = Object.keys(JSON.parse(pkg.file('package.json')!).scripts);
    const named = [...readme.matchAll(/`npm (?:run )?([\w:-]+)`/g)].map((m) => m[1]).filter((s) => s !== 'install' && s !== 'ci');
    expect(named.length).toBeGreaterThan(0);
    for (const s of named) expect(scripts, `README names "npm ${s}", package.json has no such script`).toContain(s);
  });

  test('the ABAP publisher is a sketch, in the README, STATUS and the manifest', () => {
    const pkg = finished(withFailure(fiProject()));
    const sketch = 'publisher sketch — not bound to a BAdI or standard event, not compiled in SAP'.toLowerCase();
    expect(pkg.file('README.md')!.toLowerCase()).toContain(sketch);
    expect(pkg.file('STATUS.md')!.toLowerCase()).toContain(sketch);
    const manifest = JSON.parse(pkg.file('manifest.json')!);
    const pub = manifest.files.find((f: { path: string }) => f.path === 'erp-triggers/zcl_core_event_publisher.clas.abap');
    expect(pub.status).toBe('stub');
    expect(pub.note.toLowerCase()).toContain(sketch);
    for (const f of pkg.files) expect(f.content, `${f.path} calls the publisher a released BAdI`).not.toMatch(/released BAdI/i);
  });

  test('an ABAP Cloud package names its own objects, not a fixed list', () => {
    const p = fiProject({ extensibilityRoute: 'In-App (ABAP Cloud)', generatedCode: 'CLASS zcl_x DEFINITION. ENDCLASS.', testSuite: { code: 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.' } });
    const bundle = createDeliveryBundle();
    bundle.file('.abapgit.xml', '<asx:abap/>');
    bundle.file('src/zcl_demo_rap_behavior.clas.abap', 'CLASS zcl_x DEFINITION. ENDCLASS.', 'generated');
    bundle.file('src/zcl_demo_rap_test.clas.abap', 'CLASS ltc DEFINITION FOR TESTING. ENDCLASS.', 'generated');
    const out = finishDeliveryPackage({ entries: bundle.entries, facts: factsOf(p), layout: 'flat' });
    const readme = out.files.find((f) => f.path === 'README.md')!.content;
    const listed = filesSection(readme);
    expect(listed.sort()).toEqual(out.files.map((f) => f.path).sort());
    expect(readme).not.toContain('z_demo_rap_ddls');
    expect(readme).toContain('ZCL_DEMO_RAP_TEST');
    expect(out.files.map((f) => f.path)).not.toContain('package.json');
  });
});

/* ===================================================== STATUS.md and manifest */

test.describe('STATUS.md and manifest.json say what is decided, tested and only proposed', () => {
  test('the FI shape: open rules, failed run with its cause, synthetic data, CAP proposed, review version', () => {
    const p = withFailure(fiProject());
    const pkg = finished(p);
    const status = pkg.file('STATUS.md')!;
    expect(pkg.names[0]).toBe('STATUS.md');
    expect(status).toContain('**Review version — not approved for production.**');
    expect(status).toContain(sha256Hex(SOURCE));
    expect(status).toContain('`run-fi-0001`');
    expect(status).toContain('0 of 12 rules decided, 12 open');
    expect(status).toMatch(/\| Tests \| Failed — 10 scenarios generated\. The last run on 11 Oct 2026 gave no result \(3 attempts in a row\)/);
    expect(status).toContain("test.ts:162:27: ERROR");
    expect(status).toContain('Synthetic/mock data only — no source file calls an SAP system.');
    expect(status).toContain('CAP architecture proposed; delivered implementation: Express service on synthetic data.');
    expect(status).toContain('Open — no decision on record. The engine recommends Side-by-Side');
    expect(status).toContain('Production use | Blocked');
    // Next steps in the review's order: tests, rules, decision.
    const steps = status.slice(status.indexOf('## Next steps'));
    expect(steps.indexOf('Repair the test project')).toBeGreaterThan(-1);
    expect(steps.indexOf('Repair the test project')).toBeLessThan(steps.indexOf('Decide the 12 open business rules'));
    expect(steps.indexOf('Decide the 12 open business rules')).toBeLessThan(steps.indexOf('Decide the target with an owner'));
    expect(status).toContain('https://clean-core.io/verify-pack');
  });

  test('statuses are read off the files: no @sap/cds means the CDS model is proposed and the service model missing', () => {
    const pkg = finished(withFailure(fiProject()));
    const manifest = JSON.parse(pkg.file('manifest.json')!);
    expect(manifest.approval).toBe('review-version-not-approved-for-production');
    expect(manifest.dataMode).toBe('synthetic');
    const file = (p: string) => manifest.files.find((f: { path: string }) => f.path === p);
    expect(file('db/schema.cds').status).toBe('proposed');
    expect(file('srv/service.ts').status).toBe('implemented');
    expect(file('docs/solution-design.md').status).toBe('proposed');
    const cap = (k: string) => manifest.capabilities.find((c: { key: string }) => c.key === k);
    expect(cap('cap-runtime').status).toBe('proposed');
    expect(cap('service-model').status).toBe('missing');
    expect(cap('persistence').status).toBe('proposed');
    expect(cap('sap-data').status).toBe('missing');
    // Declared, never wired: passport and xssec are dependencies, nothing uses them.
    expect(cap('authentication').status).toBe('proposed');
    expect(cap('lockfile').status).toBe('missing');
    expect(manifest.tests.status).toBe('failed');
    expect(manifest.businessRules).toMatchObject({ state: 'read', total: 12, undecided: 12 });
  });

  // The entry serves CAP itself: the shipped start script runs the entry (normalisedPackageJson), so
  // only the entry can be the evidence that CAP is started.
  const CAP_ENTRY = `import cds from '@sap/cds';
import express from 'express';

const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));
await cds.serve('all').in(app);
app.listen(4004);
export default app;
`;

  test('a CAP runtime with a service model is implemented, and then nothing says "proposed"', () => {
    const pkg = JSON.parse(PACKAGE) as Array<{ path: string; content: string }>;
    const json = JSON.parse(MODEL_PACKAGE_JSON);
    json.dependencies['@sap/cds'] = '^8.0.0';
    const cap = pkg.map((f) =>
      f.path === 'package.json' ? { ...f, content: JSON.stringify(json) } : f.path === 'srv/service.ts' ? { ...f, content: CAP_ENTRY } : f,
    );
    cap.push({ path: 'srv/service.cds', content: 'using fi from \'../db/schema\';\nservice WorklistService { entity Items as projection on fi.Items; }\n' });
    const out = finished(withFailure(fiProject({ generatedCode: JSON.stringify(cap) })));
    const manifest = JSON.parse(out.file('manifest.json')!);
    const capability = (k: string) => manifest.capabilities.find((c: { key: string }) => c.key === k);
    expect(capability('cap-runtime').status).toBe('implemented');
    expect(capability('service-model').status).toBe('implemented');
    expect(manifest.files.find((f: { path: string }) => f.path === 'db/schema.cds').status).toBe('implemented');
    expect(manifest.implementation).not.toContain('proposed');
  });

  test('@sap/cds and a service model with an entry that starts plain Express is not a CAP runtime (QA 186e14f906b2)', () => {
    const pkg = JSON.parse(PACKAGE) as Array<{ path: string; content: string }>;
    const json = JSON.parse(MODEL_PACKAGE_JSON);
    json.dependencies['@sap/cds'] = '^8.0.0';
    const cap = pkg.map((f) => (f.path === 'package.json' ? { ...f, content: JSON.stringify(json) } : f));
    cap.push({ path: 'srv/service.cds', content: 'using fi from \'../db/schema\';\nservice WorklistService { entity Items as projection on fi.Items; }\n' });
    const out = finished(withFailure(fiProject({ generatedCode: JSON.stringify(cap) })));
    const manifest = JSON.parse(out.file('manifest.json')!);
    const capability = (k: string) => manifest.capabilities.find((c: { key: string }) => c.key === k);
    expect(capability('cap-runtime').status).toBe('proposed');
    expect(capability('cap-runtime').evidence).toContain('not verified');
    expect(capability('service-model').status).toBe('proposed');
    expect(capability('http-service').evidence).toContain('Express');
    expect(manifest.implementation).not.toContain('CAP service');
    expect(manifest.implementation).toContain('Express service');
  });

  test('every file is listed with the SHA-256 of what ships, the manifest excepted', () => {
    const pkg = finished(withFailure(fiProject()));
    const manifest = JSON.parse(pkg.file('manifest.json')!);
    const listed = manifest.files.map((f: { path: string }) => f.path).sort();
    expect(listed).toEqual(pkg.names.filter((n) => n !== 'manifest.json').sort());
    for (const f of manifest.files) expect(f.sha256, f.path).toBe(sha256Hex(pkg.file(f.path)!));
    expect(manifest.source.sha256).toBe(sha256Hex(SOURCE));
    expect(manifest.run.id).toBe('run-fi-0001');
  });

  test('tests: a passing receipt, a failing receipt, a closure and nothing are four different statements', () => {
    const passed = finished(withReceipt(fiProject(), 'Passed')).file('STATUS.md')!;
    expect(passed).toMatch(/\| Tests \| Passed — All 10 scenarios passed\./);
    expect(passed).toContain('in the test runner against mocks');

    const failed = finished(withReceipt(fiProject(), 'Failed')).file('STATUS.md')!;
    expect(failed).toMatch(/\| Tests \| Failed — 0 of 10 scenarios passed, 10 failed\./);

    const base = withFailure(fiProject());
    const basis = testingClosureBasis(base as unknown as Project);
    if (!basis.ok) throw new Error(basis.error);
    const result = validateProjectCommand(
      { command: 'close-testing', reason: 'runner-failed', expectedSubject: basis.subjectKey },
      { activeRunId: base.activeRunId, testingClosureBasis: basis, testSubject: testRunSubject(base), testingClosure: null },
      { email: 'owner@example.com', now: '2026-10-11T15:30:00.000Z' },
    );
    if (!result.ok) throw new Error(result.error);
    const closed = finished({ ...base, ...(result.fields as object) } as HandoverProject).file('STATUS.md')!;
    expect(closed).toContain('| Tests | Closed · not verified — Closed without a passing run by owner@example.com on 11 Oct 2026');
    expect(closed).toContain('Not verified — a self-declaration, not a test result.');
    expect(closed).not.toMatch(/\| Tests \| Passed/);

    const none = finished(fiProject()).file('STATUS.md')!;
    expect(none).toContain('| Tests | Not run — 10 scenarios generated. No test run is on record.');
  });

  test('business rules that could not be read are said to be unread, never counted as zero', () => {
    const p = withFailure(fiProject());
    const status = finished(p, factsOf(p, ruleFactsOf(null, 'the source changed since the signed run.'))).file('STATUS.md')!;
    expect(status).toContain('| Business rules | Not read — the source changed since the signed run. |');
    expect(status).not.toMatch(/0 of \d+ rules decided/);
  });

  test('a confirmed decision names the cost revision it was priced on (ADR-092)', () => {
    expect(recordedCostSentence(false, null)).toBe('No decision is confirmed, so no cost revision is recorded.');
    expect(recordedCostSentence(true, null)).toBe('Cost revision not recorded (decision taken before 3.0.10).');
    expect(
      recordedCostSentence(true, {
        format: 1, revision: 'EUR@5y', sequence: 1, at: '2026-10-10T09:00:00.000Z',
        cheapest: { optionId: 'rebuild', label: 'Rebuild', kind: 'rebuild' }, noCheapest: null,
      }),
    ).toMatch(/^Priced on revision 1 \(10 Oct 2026\), on which "Rebuild" was the cheapest option\./);
  });

  test('a target signed off in Design without a decision record is said as such', () => {
    const p = withFailure(fiProject({ approvedByArchitect: true, targetArchitecture: 'cap', approvedBy: 'owner@example.com', architectSignOffAt: '2026-10-11T13:00:00.000Z', architectJustifiedOverride: 'Customers outside the ERP need the list.' }));
    const status = finished(p).file('STATUS.md')!;
    expect(status).toMatch(/\| Target decision \| Side-by-Side .* — target signed off in Design by owner@example\.com on 11 Oct 2026; no decision record confirmed in Management\. \|/);
    expect(status).toContain('Justification given at the sign-off in Design: Customers outside the ERP need the list.');
    expect(status).toContain('- **Rebuild** (chosen)');
  });
});

/* =============================================== docs/decision.md: the score */

test.describe('docs/decision.md makes the score checkable', () => {
  test('the deduction table adds up to the signed score', () => {
    const pkg = finished(withFailure(fiProject({ cleanCoreScore: 74 })));
    const decision = pkg.file('docs/decision.md')!;
    // 2 reads of standard tables (2+1), one RFC (8), one GUI download (5) = 16 → 84; one gap −5 → 79.
    expect(decision).toContain('| Direct reads of SAP standard tables | 2 | 2 | 1 | 5 | −3 | 2, 40 |');
    expect(decision).toContain('| Remote function calls | 1 | 8 | 2 | 12 | −8 | 560 |');
    expect(decision).toContain('100 − 16 = 84 → **84** for what the code does.');
    expect(decision).toContain('−5 → **79**');
    // 79 is not the signed 74: the file says the table is today's and does not explain the signed figure.
    expect(decision).toContain('The findings read today give 79, not the signed 74');
  });

  test('when the findings could not be read the file says so instead of a table', () => {
    const p = withFailure(fiProject());
    const decision = finished(p, factsOf(p, ruleFactsOf(RULES_OPEN), null)).file('docs/decision.md')!;
    expect(decision).toContain('Signed score: **75/100**');
    expect(decision).toContain('The deduction table is not in this file: the findings could not be read');
  });

  test('the decision record lists the four options and the engine recommendation as a recommendation', () => {
    const decision = finished(withFailure(fiProject())).file('docs/decision.md')!;
    for (const o of ['Keep', 'Rebuild', 'Move to SAP standard', 'Retire']) expect(decision).toContain(`| ${o} |`);
    expect(decision).toContain("The engine's recommendation (not a decision): Side-by-Side");
  });
});

/* ================================================== consistent build and test */

test.describe('the build and test files agree with each other and with the suite', () => {
  test('one runner: the node:test suite is run by tsx --test, Playwright and ts-node are gone', () => {
    const pkg = finished(withFailure(fiProject()));
    const json = JSON.parse(pkg.file('package.json')!);
    expect(json.scripts.test).toBe('tsx --test test.ts');
    expect(json.scripts.build).toBe('tsc -p tsconfig.json');
    expect(json.scripts.start).toBe('node --import tsx srv/service.ts');
    expect(json.dependencies.tsx).toBeTruthy();
    expect({ ...json.dependencies, ...json.devDependencies }).not.toHaveProperty('@playwright/test');
    expect({ ...json.dependencies, ...json.devDependencies }).not.toHaveProperty('ts-node');
    expect(json.devDependencies['@types/node']).toMatch(new RegExp(`^\\^${PACKAGE_NODE_MAJOR}\\.`));
    expect(json.engines.node).toBe(`>=${PACKAGE_NODE_MAJOR}`);
    // The model's dependencies are kept.
    expect(json.dependencies.express).toBe('^4.19.2');
    const manifest = JSON.parse(pkg.file('manifest.json')!);
    expect(manifest.files.find((f: { path: string }) => f.path === 'package.json').changes.join(' ')).toMatch(/Removed @playwright\/test/);
  });

  test('build is tsc, so a tsconfig ships, and it covers every TypeScript file', () => {
    const pkg = finished(withFailure(fiProject()));
    expect(pkg.names).toContain('tsconfig.json');
    const tsconfig = JSON.parse(pkg.file('tsconfig.json')!);
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(tsconfig.include).toEqual(['srv/**/*.ts', 'test.ts']);
  });

  test('Dockerfile and CI are on Node 22, and the runtime stage never takes the builder\'s node_modules', () => {
    const pkg = finished(withFailure(fiProject()));
    const docker = pkg.file('Dockerfile')!;
    expect(docker.match(/^FROM node:(\d+)/gm)).toEqual([`FROM node:${PACKAGE_NODE_MAJOR}`, `FROM node:${PACKAGE_NODE_MAJOR}`]);
    expect(docker).not.toMatch(/COPY --from=\w+ \/app \/app/);
    expect(docker).not.toMatch(/node_modules/);
    expect(docker).toContain('COPY --from=build /app/srv ./srv');
    expect(docker).not.toContain('erp-triggers');
    expect(docker).toContain('npm install --omit=dev');
    expect(docker).toContain('CMD ["node", "--import", "tsx", "srv/service.ts"]');
    expect(docker).not.toMatch(/production container/i);
    const ci = pkg.file('.github/workflows/ci.yml')!;
    expect(ci).toContain(`node-version: '${PACKAGE_NODE_MAJOR}'`);
    expect(ci).toContain('if [ -f package-lock.json ]; then npm ci; else npm install; fi');
    expect(ci).toContain('- run: npm test');
    expect(pkg.names).not.toContain('package-lock.json');
  });

  test('a Playwright suite keeps Playwright, with a config that names the suite', () => {
    expect(suiteRunner("import { test } from '@playwright/test';")).toBe('playwright');
    expect(suiteRunner("import { test } from 'node:test';")).toBe('node:test');
    const pw = fiProject({ testSuite: { code: "import { test, expect } from '@playwright/test';\ntest('a', async () => { expect(1).toBe(1); });\n" } });
    const pkg = finished(pw);
    const json = JSON.parse(pkg.file('package.json')!);
    expect(json.scripts.test).toBe('playwright test');
    expect(json.devDependencies['@playwright/test']).toBeTruthy();
    expect(pkg.file('playwright.config.ts')).toContain("testMatch: ['test.ts']");
  });

  test('without a suite there is no test script and CI does not call one', () => {
    const p = fiProject({ testSuite: undefined, testCases: [] });
    const bundle = createDeliveryBundle();
    for (const f of JSON.parse(PACKAGE) as Array<{ path: string; content: string }>) bundle.file(f.path, f.content, 'generated');
    const out = finishDeliveryPackage({ entries: bundle.entries, facts: factsOf(p), layout: 'package' });
    const json = JSON.parse(out.files.find((f) => f.path === 'package.json')!.content);
    expect(json.scripts.test).toBeUndefined();
    expect(out.files.find((f) => f.path === '.github/workflows/ci.yml')!.content).not.toContain('npm test');
  });

  test('the flat layout compiles src/ to dist/ and runs its tests from dist/ (b795a6e204b0)', () => {
    const p = fiProject({ generatedCode: 'export const handler = () => 1;\n', testSuite: { code: SUITE } });
    const bundle = createDeliveryBundle();
    bundle.file('src/app.ts', 'export const handler = () => 1;\n', 'generated');
    bundle.file('src/test.ts', SUITE, 'generated');
    const out = finishDeliveryPackage({ entries: bundle.entries, facts: factsOf(p), layout: 'flat' });
    const get = (n: string) => out.files.find((f) => f.path === n)!.content;
    const tsconfig = JSON.parse(get('tsconfig.json'));
    const json = JSON.parse(get('package.json'));
    expect(tsconfig.compilerOptions.rootDir).toBe('src');
    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(json.main).toBe('dist/app.js');
    expect(json.scripts.test).toBe('node --test dist/test.js');
    expect(json.devDependencies['@types/node']).toMatch(new RegExp(`^\\^${PACKAGE_NODE_MAJOR}\\.`));
    expect(get('.github/workflows/ci.yml')).toContain(`node-version: '${PACKAGE_NODE_MAJOR}'`);
  });
});

/* ========================================================== source guards */

test.describe('the pages build the package through the module', () => {
  test('delivery page: no hard-coded README, Node 20 or "released BAdI" left', () => {
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).toContain('finishDeliveryPackage(');
    expect(page).toContain('createDeliveryBundle()');
    expect(page).not.toContain('zip.file("README.md"');
    expect(page).not.toMatch(/released BAdI/);
    expect(page).not.toContain('Production container deployment setup');
    expect(page).not.toMatch(/node-version: '20'|node:20/);
    expect(page).not.toContain('srv/service.cds');
  });

  test('transformation fallback: the viewer shows the same templates, never Playwright or Node 20', () => {
    const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toContain('normalisedPackageJson(');
    expect(page).toContain('packageDockerfile(');
    expect(page).not.toMatch(/"test": "playwright test"/);
    expect(page).not.toMatch(/FROM node:20/);
  });

  test('the package module and its facts carry no model call', () => {
    for (const rel of ['lib/delivery-package.ts', 'lib/delivery-facts.ts']) {
      const src = read(rel);
      expect(src, `${rel} calls a model`).not.toMatch(/callGemini|\/api\/gemini|openrouter/i);
    }
  });
});
