import { test, expect } from '@playwright/test';
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
