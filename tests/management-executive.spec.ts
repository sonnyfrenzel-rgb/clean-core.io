import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { managementOverview, type FitByPlatform, type FitResult, type Loaded, type OverviewSource } from '../lib/management-overview';
import { managementAnswers, runHistoryEntry, type RunHistoryEntry } from '../lib/management-answers';
import {
  costsFromDecision,
  executiveQuestion,
  executiveSubject,
  managementExecutive,
  type ExecutiveSource,
} from '../lib/management-executive';
import {
  assignPublicCloudFit,
  summarizePublicCloudFit,
  type PublicCloudFitObjectInput,
  type TargetPlatform,
} from '../lib/abap/public-cloud-fit';
import { emptyProjectDecision } from '../lib/project-decision';
import { workflowSteps } from '../lib/workflow-steps';
import type { ItFindingsSource } from '../lib/it-findings';
import type { Project } from '../lib/types';

/**
 * The decision panel on top of the Management view (`lib/management-executive.ts`).
 *
 * It only picks and words what the overview cards already derived, so these
 * tests hold the four promises it adds: the question and where the decision
 * stands come first; an unread project leads with what to do first and not
 * with a wall of negatives; a figure nobody measured is a word, never a 0; and
 * no amount of money appears anywhere.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

const obj = (over: Partial<PublicCloudFitObjectInput> & { objectName: string }): PublicCloudFitObjectInput => ({
  level: 'A',
  levelProvenance: 'catalog',
  dropDecision: null,
  usage: null,
  catalog: { pathEvidence: 'successor-named' },
  hasModification: false,
  hasOwnWriteAccess: false,
  ...over,
});

const OBJECTS: PublicCloudFitObjectInput[] = [
  obj({ objectName: 'I_PURCHASEORDERAPI01', level: 'A' }),
  obj({ objectName: 'BAPI_PO_CREATE1', level: 'B' }),
  obj({ objectName: 'T16FS', level: 'C', catalog: { pathEvidence: 'none-named' } }),
  obj({ objectName: 'ZZ_UNKNOWN', level: 'Unknown', levelProvenance: 'heuristic', catalog: null }),
];

function fitFor(platform: TargetPlatform): FitResult {
  const assignments = OBJECTS.map((o) => assignPublicCloudFit(o, platform));
  return { assignments, summary: summarizePublicCloudFit(assignments, { targetPlatform: platform, usageImported: false }) };
}
const FIT = (target: TargetPlatform | null): FitByPlatform => ({ target, private: fitFor('private'), public: fitFor('public') });
const ready = <T,>(value: T): Loaded<T> => ({ state: 'ready', value });

const FINDINGS: ItFindingsSource = { rows: [], sourceSha256: 'a'.repeat(64), rulesDerived: 0 };
const V1 = { rulesetVersion: 'rules-v1.0', analyzerVersion: '2.9.0', sapApiCatalogVersion: 'cat-2026-08' };
const entry = (over: Record<string, unknown>): RunHistoryEntry => {
  const e = runHistoryEntry({ runId: 'run-1', createdAt: '2026-09-01T10:00:00.000Z', cleanCoreScore: 42, ...V1, ...over });
  if (!e) throw new Error('fixture is not a run');
  return e;
};

const project = (over: Partial<Project> = {}): Project => ({
  name: 'Emergency purchase approval',
  legacyCode: 'REPORT z_mm_po_approval.\nWRITE 1.\n',
  s4Deployment: 'private',
  activeRunId: 'run-2',
  ...over,
});

function exec(p: Project, over: Partial<OverviewSource> = {}, src: Partial<ExecutiveSource> = {}) {
  const hasRun = Boolean(p.activeRunId);
  const decision = over.decision ?? ready({ draft: emptyProjectDecision(), stored: null });
  const ov: OverviewSource = {
    view: managementAnswers(p, hasRun ? [entry({ runId: 'run-2' })] : [], null),
    fit: ready(FIT(p.s4Deployment ?? null)),
    findings: ready(FINDINGS),
    decision,
    ...over,
  };
  return managementExecutive({
    subject: executiveSubject(p.legacyCode, p.name ?? 'this program'),
    mode: 'project',
    hasSource: Boolean(p.legacyCode),
    hasRun,
    steps: workflowSteps(p),
    overview: managementOverview(ov, { hasSource: Boolean(p.legacyCode), hasRun }),
    fit: ov.fit,
    costs: costsFromDecision(decision),
    ...src,
  });
}

test.describe('the decision panel', () => {
  test('the question names the program the source names', () => {
    expect(executiveSubject('  REPORT z_mm_po_approval.\n', 'x')).toBe('Z_MM_PO_APPROVAL');
    expect(executiveSubject('WRITE 1.', 'Fallback')).toBe('Fallback');
    expect(exec(project()).question).toBe(executiveQuestion('Z_MM_PO_APPROVAL'));
  });

  test('without a signed run it leads with what to do first, and says the decision is not started, not bad', () => {
    const e = exec(project({ activeRunId: undefined }));
    expect(e.answer).toContain('No signed run');
    expect(e.status).toBe('not-started');
    expect(e.blockers[0].key).toBe('view-no-run');
    expect(e.next?.target).toEqual({ kind: 'stage', path: 'analyze' });
    expect(e.next?.label).toBe('Run the analysis');
  });

  test('an open draft says how many things block it and sends the reader to the first', () => {
    const e = exec(project());
    expect(e.status).toBe('draft');
    expect(e.answer).toMatch(/^Decision DEC-1 is open\. \d+ things? blocks? confirming it\.$/);
    expect(e.blockerCount).toBe(e.blockers.length + e.moreBlockers);
    expect(e.next?.target).toEqual({ kind: 'anchor', id: 'decision-card' });
  });

  test('objects without a catalogued path on the target platform are counted as blockers', () => {
    const general = exec(project(), {}, {}).blockerCount ?? 0;
    const noPathPrivate = fitFor('private').summary.counts['no-catalogued-path'];
    expect(noPathPrivate).toBeGreaterThan(0);
    const withoutTarget = exec(project({ s4Deployment: undefined })).blockerCount ?? 0;
    expect(general - withoutTarget).toBe(noPathPrivate);
  });

  test('four figures, and a figure nobody measured is a word with its reason — never a 0', () => {
    const e = exec(project(), { fit: { state: 'absent', reason: 'The lookup failed.' } });
    expect(e.figures.map((f) => f.key)).toEqual(['objects', 'no-path', 'costs', 'evidence']);
    for (const key of ['objects', 'no-path'] as const) {
      const f = e.figures.find((x) => x.key === key)!;
      expect(f.value).toBeNull();
      expect(f.absentWord).toBe('Not determined');
      expect(f.coverage).toBe('The lookup failed.');
    }
    expect(e.buckets).toBeNull();
    expect(e.bucketsAbsent).toBe('The lookup failed.');
  });

  test('costs: "Not entered" with the way to Economics, and no amount of money anywhere', () => {
    const e = exec(project());
    const costs = e.figures.find((f) => f.key === 'costs')!;
    expect(costs.value).toBeNull();
    expect(costs.absentWord).toBe('Not entered');
    expect(costs.action?.target).toEqual({ kind: 'stage', path: 'tco' });
    const bound = exec(project(), {}, { costs: { state: 'bound', revision: 'CS-2', provenance: 'simulation', note: null } });
    expect(bound.figures.find((f) => f.key === 'costs')!.value).toBe('Simulation');
    for (const text of [JSON.stringify(e), JSON.stringify(bound)]) {
      expect(text).not.toMatch(/€|\$\s?\d|\bEUR\b|\bUSD\b|currency/i);
    }
    for (const rel of ['lib/management-executive.ts', 'components/workspace/ManagementExecutive.tsx']) {
      expect(read(rel), `${rel} formats money`).not.toMatch(/style:\s*'currency'|€/);
    }
  });

  test('the bucket chart is the target platform, not assigned is its own segment, and no segment is a state colour', () => {
    const e = exec(project());
    expect(e.buckets?.platformLabel).toBe('Private Edition');
    expect(e.buckets?.isTarget).toBe(true);
    const nd = e.buckets!.segments.find((s) => s.notDetermined)!;
    expect(nd.tone).toBe('not-determined');
    for (const s of e.buckets!.segments) expect(s.tone).toMatch(/^chart-\d$|^not-determined$/);
  });

  test('a phase is green only when something other than the account checked it', () => {
    const e = exec(project({ activeRunId: undefined }));
    expect(e.phases).toHaveLength(7);
    expect(e.phases.filter((p) => p.tone === 'proven')).toHaveLength(0);
    for (const p of e.phases) expect(p.word.length).toBeGreaterThan(3);
  });

  test('a confirmed decision reads as a self-declaration', () => {
    const draft = emptyProjectDecision();
    const e = exec(project(), {
      decision: ready({ draft, stored: { ...draft, status: 'confirmed' } }),
    });
    expect(e.status).toBe('confirmed');
    expect(e.answer).toContain('self-declaration');
  });

  test('in the demo the step is your own code, and the proposal is named as one', () => {
    const e = exec(project({ activeRunId: undefined }), {}, { mode: 'demo', proposal: 'Side-by-Side (SAP BTP)' });
    expect(e.next?.target).toEqual({ kind: 'new-project' });
    expect(e.answer).toContain('The evidence proposes Side-by-Side (SAP BTP).');
  });

  test('the module is pure and the panel fetches nothing', () => {
    const src = read('lib/management-executive.ts');
    for (const line of src.split('\n').filter((l) => /^\s*import\b/.test(l))) {
      expect(line).not.toMatch(/react|firebase|firestore|gemini/i);
    }
    expect(src).not.toContain('fetch(');
    const component = read('components/workspace/ManagementExecutive.tsx');
    expect(component).not.toContain('fetch(');
    expect(component).not.toMatch(/setDoc|updateDoc|addDoc/);
  });
});
