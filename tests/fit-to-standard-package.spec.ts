/**
 * Roadmap 3.0.20, step F7 — the delivery package without code
 * (`docs/design/fit-to-standard-concept.md` §4.6, §5.5, §8 F7).
 *
 * Acceptance: the package holds the files of §5.5 and no code; the BPMN files
 * are well-formed and re-importable by our own importer; the wording promises
 * nothing about Signavio, coverage or verification.
 *
 * Server-free: the package builder over the engine's real design of the
 * shipped key-user example, and the delivery package around it.
 */
import { test, expect } from '@playwright/test';
import { readFitToStandard, designFromReading } from '../lib/fit-to-standard-read';
import { buildFitPackage, fitConditionLines, toBeSkeleton, FIT_PACKAGE_PATHS } from '../lib/fit-to-standard-package';
import { applyFitChoices, type FitToStandardRevision } from '../lib/fit-to-standard-store';
import { countEntries, fitDesignSummary } from '../lib/fit-to-standard-design';
import { buildKeyUserSteps } from '../lib/key-user-steps';
import { importBpmn } from '../lib/bpmn/import';
import { catalogSnapshotKeyForProject } from '../lib/abap/catalog-snapshots';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { workflowSteps } from '../lib/workflow-steps';
import { sha256Hex } from '../lib/artefact-digest';
import type { HandoverProject } from '../lib/handover';
import { readExample } from './helpers/starter-example-files';

const FILE = 'Z_SD_DELIVERY_PRIORITY.abap';
const SOURCE = readExample(FILE);

function packageInput() {
  const r = readFitToStandard({
    source: SOURCE,
    fileName: FILE,
    edition: 'public',
    catalogSnapshot: catalogSnapshotKeyForProject({ s4Deployment: 'public' }),
    engineVersion: 'v3.0.19',
    mode: 'demo',
    hasRun: true,
    analyzeState: 'done',
    signedSourceSha256: null,
  });
  const design = designFromReading(r, false)!;
  // The owner's answers after the workshop: the totals list is given up, the key-user gap stays.
  const write = design.entries.find((e) => e.plainLabel === 'Write totals')!;
  const entries = applyFitChoices(design.entries, [{ elementId: write.elementId, disposition: 'given-up' }]);
  const revision: FitToStandardRevision = {
    formatVersion: 1, revision: 2, kind: 'confirmation', runId: 'run-1', sourceSha256: r.sourceSha256, edition: 'public',
    engineVersion: 'v3.0.19', gateClasses: design.gateClasses, againstGate: null, entries, counts: countEntries(entries),
    createdBy: { uid: 'u1', name: 'Owner' }, createdAt: '2026-10-21T10:00:00.000Z',
  };
  return { r, revision, input: { projectName: 'Z_SD_DELIVERY_PRIORITY', sourceFileName: FILE, source: SOURCE, skeleton: r.skeleton, revision, keyUserSteps: buildKeyUserSteps(r.evidence.keyUser) } };
}

const CODE = /\.(abap|ts|js|cds|asddls|asbdef|xml)$/i;
const OVERPROMISE = [/covered by SAP/i, /fit-to-standard verified/i, /Signavio-ready/i, /importable into SAP Signavio/i, /\bproven\b/i];

test('the package without code: the files of §5.5, every one, and no code file', () => {
  const files = buildFitPackage(packageInput().input);
  expect(files.map((f) => f.path)).toEqual(Object.values(FIT_PACKAGE_PATHS));
  expect(files.some((f) => CODE.test(f.path))).toBe(false);
  for (const f of files) for (const p of OVERPROMISE) expect(f.content, `${f.path} says ${p}`).not.toMatch(p);
  const design = files.find((f) => f.path === FIT_PACKAGE_PATHS.design)!.content;
  expect(design).toContain('## What you give up');
  expect(design).toContain('## What SAP standard may do instead');
  expect(design).toContain('## What remains a gap');
  expect(design).toContain("API_SALES_ORDER_SRV — from SAP's catalog — to verify");
  expect(design).toContain('L49–L81');
  const csv = files.find((f) => f.path === FIT_PACKAGE_PATHS.gapCsv)!.content;
  expect(csv.split('\r\n')[0]).toBe('element_id,step,line_start,line_end,disposition,reference,check,evidence_level,provenance,note');
  expect(csv).toContain('deviation-L49,');
  // The key-user backlog carries the 3.0.19 step list.
  const ku = files.find((f) => f.path === FIT_PACKAGE_PATHS.keyUser)!.content;
  expect(ku).toContain('## The key-user step list');
  expect(ku).toContain('Custom Logic');
  expect(files.find((f) => f.path === FIT_PACKAGE_PATHS.workshop)!.content).toMatch(/1\. \*\*/);
  expect(files.find((f) => f.path === FIT_PACKAGE_PATHS.decommissioning)!.content).toContain('Write totals (L96) — given up');
});

test('the BPMN files are well-formed and re-importable by our own importer; the to-be names what stays given up', async () => {
  const files = buildFitPackage(packageInput().input);
  const asIs = files.find((f) => f.path === FIT_PACKAGE_PATHS.asIs)!.content;
  const toBe = files.find((f) => f.path === FIT_PACKAGE_PATHS.toBe)!.content;
  for (const xml of [asIs, toBe]) {
    const out = await importBpmn(xml, { xml: asIs, revision: 1 });
    expect(out.ok, out.ok ? '' : `${out.code}: ${out.message}`).toBe(true);
  }
  expect(toBe).toContain('fit-to-standard design');
  expect(toBe).toMatch(/name="(?:Given up — standard behaviour: |SAP standard candidate API_SALES_ORDER_SRV \(to verify\): )/);
});

test('a given-up step with one flow in and one out is removed and the flow bridged; others stay', () => {
  const { r, revision } = packageInput();
  const before = r.skeleton;
  const after = toBeSkeleton(before, revision.entries);
  const gone = before.nodes.filter((n) => !after.nodes.some((m) => m.id === n.id));
  for (const n of gone) {
    expect(revision.entries.find((e) => e.elementId === n.id)?.disposition).toBe('given-up');
    expect(after.edges.some((e) => e.from === n.id || e.to === n.id)).toBe(false);
  }
  expect(after.edges.length).toBe(before.edges.length - gone.length);
});

test('the delivery package on the standard path ships no generated code, and docs/decision.md lists the conditions', () => {
  const { input, revision } = packageInput();
  const project = {
    id: 'p1', name: 'Z_SD_DELIVERY_PRIORITY', userId: 'u1', legacyCode: SOURCE, activeRunId: 'run-1',
    extensibilityRoute: 'ABAP Cloud (on-stack)', cleanCoreScore: 80, s4Deployment: 'public', analyzerVersion: 'v3.0.19',
    generatedCode: JSON.stringify([{ path: 'src/zcl_x.clas.abap', content: 'CLASS zcl_x DEFINITION. ENDCLASS.' }]),
    documentation: '# Doc',
    auditMetadata: { inputFingerprint: { sha256: sha256Hex(SOURCE), fileName: FILE, lineCount: 132, byteSize: SOURCE.length, uploadedAt: '2026-10-11T12:00:00.000Z', objectType: 'Report' } },
  } as unknown as HandoverProject;
  const facts = deliveryFactsOf(project, {
    phases: workflowSteps(project),
    rules: ruleFactsOf(null, 'not read in this spec.'),
    score: scoreFactsOf(project, null),
    generatedAt: '2026-10-21T16:00:00.000Z',
    appVersion: 'v3.0.19',
    referenceSection: '## Reference patterns\n',
    documentationFromEngine: true,
  });
  const bundle = createDeliveryBundle();
  bundle.file('src/zcl_x.clas.abap', 'CLASS zcl_x DEFINITION. ENDCLASS.', 'generated');
  bundle.file('.abapgit.xml', '<x/>');
  bundle.folder('docs').file('process-documentation.md', '# Doc\n');
  const standard = { files: buildFitPackage(input), conditions: fitConditionLines(revision), summary: fitDesignSummary(revision.counts) };
  const out = finishDeliveryPackage({ entries: bundle.entries, facts: { ...facts, standard }, layout: 'package' });
  const names = out.files.map((f) => f.path);
  expect(names).not.toContain('src/zcl_x.clas.abap');
  expect(names).not.toContain('.abapgit.xml');
  for (const p of Object.values(FIT_PACKAGE_PATHS)) expect(names).toContain(p);
  expect(names).toContain('docs/process-documentation.md');
  expect(out.reading.kind).toBe('documents-only');
  const decision = out.files.find((f) => f.path === 'docs/decision.md')!.content;
  expect(decision).toContain('### Conditions — from the fit-to-standard design');
  expect(decision).toContain('Key-user extension for');
  const readme = out.files.find((f) => f.path === 'README.md')!.content;
  expect(readme).toContain('delivery package (move to SAP standard, no code)');
  const status = out.files.find((f) => f.path === 'STATUS.md')!.content;
  expect(status).toContain('No code: the decision is to move to SAP standard');
  expect(status).toContain('docs/workshop-questions.md');
  const manifest = JSON.parse(out.files.find((f) => f.path === 'manifest.json')!.content) as { files: Array<{ path: string; status: string; note: string | null }> };
  expect(manifest.files.find((f) => f.path === FIT_PACKAGE_PATHS.toBe)).toMatchObject({ status: 'proposed' });
});
