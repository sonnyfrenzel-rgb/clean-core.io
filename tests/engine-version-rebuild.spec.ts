import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { GUIDELINE_CHECKS_FROM } from '../lib/abap/guideline-checks-gate';
import { targetRouteOf } from '../lib/architecture-contract';
import { contractOfProject, recommendationOfProject } from '../lib/contract-build';
import { findingsOf } from '../lib/it-findings-build';
import { buildProjectEvidence, buildRunEvidence } from '../lib/project-evidence-build';
import { engineVersionOfProject } from '../lib/run-engine-version';
import { APP_VERSION } from '../lib/version';

/**
 * Roadmap 3.0.12 — a signed run re-renders what it signed.
 *
 * 3.0.12 changes signed engine output (the DSAG guideline checks,
 * `GUIDELINE_CHECKS_FROM`; the route rules `ON_STACK_CONSTRUCTS_FROM` and
 * `GUI_FILE_NO_ROUTE_DRIVER_FROM`), each gated on the engine version. The
 * screens that rebuild the evidence of an existing project — the contract, the
 * IT findings, the evidence route — used to pass no version and so got the
 * current engine's findings for a run made by an older one. Here an old run
 * (v3.0.11 stamp) and a new one (v3.0.12) are rebuilt through each builder, and
 * each must answer byte for byte what the engine of that run answers — whatever
 * `APP_VERSION` is when the spec runs.
 *
 * Server-free.
 */

const OLD = 'v3.0.11';
const NEW = `v${GUIDELINE_CHECKS_FROM}`;
const FILE = 'zco_list.abap';

/**
 * Two 3.0.12 changes in one program: an AUTHORITY-CHECK whose result nobody
 * reads (a security review task from 3.0.12), and a GUI download, which drove
 * the route side-by-side before 3.0.12 and no longer does.
 */
const SOURCE = `REPORT zco_list.
DATA lt_out TYPE STANDARD TABLE OF string.
DATA lv_bukrs TYPE bukrs.
AUTHORITY-CHECK OBJECT 'F_BKPF_BUK' ID 'BUKRS' FIELD lv_bukrs ID 'ACTVT' FIELD '03'.
SELECT * FROM coep INTO TABLE @DATA(lt_coep) WHERE kokrs = '1000'.
CALL FUNCTION 'GUI_DOWNLOAD'
  EXPORTING filename = 'C:\\temp\\co.txt'
  TABLES data_tab = lt_out.
`;

const SNAPSHOT = catalogSnapshotKeyForProject({ s4Deployment: 'private' });
const reference = (engine: string) => buildAbapEvidence(SOURCE, FILE, 'private', SNAPSHOT, engine);

/** The project document as `/api/runs/create` leaves it: the stamp on the model card, the active run named. */
function projectOf(engine: string | null): Record<string, unknown> {
  return {
    legacyCode: SOURCE,
    s4Deployment: 'private',
    activeRunId: 'run-1',
    auditMetadata: {
      inputFingerprint: { fileName: FILE },
      modelCard: engine === null ? { provider: null } : { engineVersion: engine },
    },
  };
}

test.describe('the fixture', () => {
  test('the two engines answer this source differently — findings and route', () => {
    const oldEvidence = reference(OLD);
    const newEvidence = reference(NEW);
    expect(oldEvidence.findings.some((f) => f.kind === 'security-review')).toBe(false);
    expect(newEvidence.findings.some((f) => f.kind === 'security-review')).toBe(true);
    expect(targetRouteOf(routeExtensibility(oldEvidence, 'private', OLD))).toBe('side-by-side-cap');
    expect(targetRouteOf(routeExtensibility(newEvidence, 'private', NEW))).toBe('in-app-rap');
  });
});

test.describe('engineVersionOfProject', () => {
  test('the stamp of the run; null for a run without one; this engine for a project with no run', () => {
    expect(engineVersionOfProject(projectOf(OLD))).toBe(OLD);
    expect(engineVersionOfProject({ analyzerVersion: NEW, auditMetadata: { modelCard: { engineVersion: OLD } } })).toBe(NEW);
    expect(engineVersionOfProject(projectOf(null))).toBeNull();
    expect(engineVersionOfProject({ activeRunId: 'run-1' })).toBeNull();
    expect(engineVersionOfProject({ legacyCode: SOURCE })).toBe(APP_VERSION);
    expect(engineVersionOfProject(null)).toBe(APP_VERSION);
  });
});

for (const engine of [OLD, NEW]) {
  test.describe(`a run signed by ${engine}, rebuilt`, () => {
    const expected = reference(engine);
    const expectedJson = JSON.stringify(expected);
    const expectedRoute = targetRouteOf(routeExtensibility(expected, 'private', engine));

    test('contract-build: the evidence and the route of that engine', () => {
      const built = contractOfProject(projectOf(engine) as never, null);
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(JSON.stringify(built.evidence)).toBe(expectedJson);
      expect(built.contract.route.recommended).toBe(expectedRoute);
      expect(recommendationOfProject(projectOf(engine) as never)).toBe(expectedRoute === 'side-by-side-cap' ? 'cap' : 'rap');
    });

    test('project-evidence-build: the evidence of that engine', () => {
      const built = buildProjectEvidence(projectOf(engine), SOURCE);
      expect(built.catalog.registryKey).toBe(SNAPSHOT);
      expect(JSON.stringify(built.evidence)).toBe(expectedJson);
    });

    test('it-findings-build: the rows of that engine', () => {
      const project = projectOf(engine);
      const rows = findingsOf(SOURCE, FILE, 'private', SNAPSHOT, engineVersionOfProject(project)).rows;
      expect(rows.map((r) => [r.id, r.kind, r.title, r.severity, r.lineStart])).toEqual(
        expected.findings.map((f) => [f.id, f.kind, f.title, f.severity, f.lineStart]),
      );
    });
  });
}

test('a run signed before the stamp existed gets the oldest engine, not this one', () => {
  const built = contractOfProject(projectOf(null) as never, null);
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  expect(JSON.stringify(built.evidence)).toBe(JSON.stringify(buildAbapEvidence(SOURCE, FILE, 'private', SNAPSHOT, null)));
  expect(built.evidence.findings.some((f) => f.kind === 'security-review')).toBe(false);
});

test('a run about to be made is read by this engine', () => {
  const built = buildRunEvidence(projectOf(OLD), { source: SOURCE, fileName: FILE, deployment: 'private' });
  expect(JSON.stringify(built.evidence)).toBe(JSON.stringify(buildAbapEvidence(SOURCE, FILE, 'private', built.catalog.registryKey, APP_VERSION)));
});

/**
 * The tests above take the current engine called with the old version as their
 * oracle, so a change that leaks past the gate moves the expectation with it
 * (QA review of 03501b79fb3d, af7fd81f9cc2). This one does not: the digests in
 * `tests/fixtures/engine-v3.0.11-frozen.json` are what the deployed v3.0.11
 * engine itself answered — evidence and route — for the 300 benchmark programs
 * and five probes, in both editions. Without the gates of 3.0.12 on the GUI
 * file finding and the AUFK context successor, 30 of them differ.
 */
test.describe('a run signed by v3.0.11, against what that engine answered', () => {
  const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/engine-v3.0.11-frozen.json'), 'utf8')) as {
    probes: Record<string, string>;
    digests: Record<string, string>;
  };
  const digest = (evidence: unknown, route: unknown) => createHash('sha256').update(JSON.stringify({ evidence, route })).digest('hex');
  const answer = (code: string, file: string, deployment: 'private' | 'public', snapshot?: string) => {
    const evidence = buildAbapEvidence(code, file, deployment, snapshot, OLD);
    return digest(evidence, routeExtensibility(evidence, deployment, OLD));
  };

  test('every benchmark program and probe, both editions, byte for byte', () => {
    test.setTimeout(180_000);
    const casesDir = path.join(__dirname, 'prozess-benchmark/cases');
    const moved: string[] = [];
    let compared = 0;
    for (const [key, expected] of Object.entries(frozen.digests)) {
      const [scope, name, deployment] = key.startsWith('probe:') ? key.split(':') : ['case', ...key.split(':')];
      let code: string;
      let file: string;
      if (scope === 'probe') {
        code = frozen.probes[name];
        file = `${name}.abap`;
      } else {
        const abap = fs.readdirSync(path.join(casesDir, name)).filter((n) => n.endsWith('.abap')).sort();
        code = abap.map((f) => fs.readFileSync(path.join(casesDir, name, f), 'utf8')).join('\n');
        file = abap[0];
      }
      compared++;
      if (answer(code, file, deployment as 'private' | 'public') !== expected) moved.push(key);
    }
    expect(compared).toBe(610);
    expect(moved).toEqual([]);
  });

  test('the builders rebuild the old run to that answer', () => {
    const code = frozen.probes['gui-download-and-authority'];
    const project = { ...projectOf(OLD), legacyCode: code, auditMetadata: { inputFingerprint: { fileName: 'gui-download-and-authority.abap' }, modelCard: { engineVersion: OLD } } };
    const expected = frozen.digests['probe:gui-download-and-authority:private'];
    const built = buildProjectEvidence(project, code);
    expect(digest(built.evidence, routeExtensibility(built.evidence, 'private', OLD))).toBe(expected);
    const contract = contractOfProject(project as never, null);
    expect(contract.ok).toBe(true);
    if (!contract.ok) return;
    expect(digest(contract.evidence, routeExtensibility(contract.evidence, 'private', OLD))).toBe(expected);
  });
});

/**
 * The same oracle one release on: `tests/fixtures/engine-v3.0.12-frozen.json`
 * holds what the v3.0.12 engine answered (dev at 5a559787, before any 3.0.13
 * engine change) for the benchmark programs, the five probes above and three
 * probes of the 3.0.13 changes (`PRECISION_FIXES_FROM`): RFC destinations
 * spelled like 'NONE', an outbound RFC beside a standard-table write, and a
 * file-name validation whose result nobody reads. A 3.0.13 change that leaks
 * past its gate moves one of these digests.
 */
test.describe('a run signed by v3.0.12, against what that engine answered', () => {
  const V3012 = 'v3.0.12';
  const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/engine-v3.0.12-frozen.json'), 'utf8')) as {
    probes: Record<string, string>;
    digests: Record<string, string>;
  };
  const digest = (evidence: unknown, route: unknown) => createHash('sha256').update(JSON.stringify({ evidence, route })).digest('hex');

  test('every benchmark program and probe, both editions, byte for byte', () => {
    test.setTimeout(180_000);
    const casesDir = path.join(__dirname, 'prozess-benchmark/cases');
    const moved: string[] = [];
    let compared = 0;
    for (const [key, expected] of Object.entries(frozen.digests)) {
      const [scope, name, deployment] = key.startsWith('probe:') ? key.split(':') : ['case', ...key.split(':')];
      let code: string;
      let file: string;
      if (scope === 'probe') {
        code = frozen.probes[name];
        file = `${name}.abap`;
      } else {
        const abap = fs.readdirSync(path.join(casesDir, name)).filter((n) => n.endsWith('.abap')).sort();
        code = abap.map((f) => fs.readFileSync(path.join(casesDir, name, f), 'utf8')).join('\n');
        file = abap[0];
      }
      compared++;
      const evidence = buildAbapEvidence(code, file, deployment as 'private' | 'public', undefined, V3012);
      if (digest(evidence, routeExtensibility(evidence, deployment as 'private' | 'public', V3012)) !== expected) moved.push(key);
    }
    expect(compared).toBe(616);
    expect(moved).toEqual([]);
  });
});

/**
 * SAP's product names (owner decision 13.10.2026): from 3.0.12 the engine says
 * "SAP Cloud ERP Private" and "SAP S/4HANA Cloud Public Edition"; a run signed
 * by v3.0.11 keeps "Private Edition", "Private Cloud" and "Public Cloud", byte
 * for byte, through every builder above.
 */
test.describe('the renamed editions, by engine', () => {
  const OWN_WRITE = `REPORT zco_own.
DATA ls_log TYPE zco_log.
INSERT zco_log FROM ls_log.
SELECT SINGLE * FROM vbak INTO @DATA(ls_vbak) WHERE vbeln = '1'.
`;

  test('the route rationale of a private own-table write', () => {
    const rationaleOf = (engine: string) =>
      routeExtensibility(buildAbapEvidence(OWN_WRITE, 'zco_own.abap', 'private', SNAPSHOT, engine), 'private', engine).rationale;
    expect(rationaleOf(OLD)).toContain('In Private Edition / RISE this is on-stack developer extensibility');
    expect(rationaleOf(NEW)).toContain('In SAP Cloud ERP Private this is on-stack developer extensibility');
    expect(rationaleOf(NEW)).not.toMatch(/Private Edition|RISE/);
  });

  test('the standard-table read of a public target', () => {
    const readOf = (engine: string) =>
      buildAbapEvidence(OWN_WRITE, 'zco_own.abap', 'public', undefined, engine).findings.find((f) => f.kind === 'standard-table-read');
    const old = readOf(OLD);
    const now = readOf(NEW);
    expect(old?.technicalDetail).toContain(' In Public Cloud this is a hard break');
    expect(old?.cleanCoreImpact).toContain('In SAP S/4HANA Public Cloud, direct reads');
    expect(now?.technicalDetail).toContain(' In SAP S/4HANA Cloud Public Edition this is a hard break');
    expect(now?.cleanCoreImpact).toContain('In SAP S/4HANA Cloud Public Edition, direct reads');
  });

  test('the old run rebuilt through the contract keeps the old words', () => {
    const project = { ...projectOf(OLD), legacyCode: OWN_WRITE, auditMetadata: { inputFingerprint: { fileName: 'zco_own.abap' }, modelCard: { engineVersion: OLD } } };
    const built = contractOfProject(project as never, null);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(JSON.stringify(built.evidence)).toBe(JSON.stringify(buildAbapEvidence(OWN_WRITE, 'zco_own.abap', 'private', SNAPSHOT, OLD)));
    expect(JSON.stringify(built.contract)).toContain('S/4HANA Private Cloud deployment model selected');
    expect(JSON.stringify(built.contract)).not.toContain('SAP Cloud ERP Private');
  });
});
