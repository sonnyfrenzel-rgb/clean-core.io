import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  catalogSnapshotKeyFor,
  catalogSnapshotKeyForProject,
  catalogSnapshotRefFor,
} from '../lib/abap/catalog-snapshots';
import { gradeSapObjectUse } from '../lib/abap/catalog-service';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { routeExtensibility } from '../lib/abap/extensibility-router';
import { buildArchitectureContract } from '../lib/architecture-contract';
import { catalogLookupTargetOf } from '../lib/assessment-target';
import { contractOfProject, FIRST_CONTRACT_ID } from '../lib/contract-build';
import { findingsOf } from '../lib/it-findings-build';
import { buildDemoWorkspace } from '../lib/demo-workspace';
import type { ObjectUse } from '../lib/abap/abcd-classification';

/**
 * Owner decision 30.09.2026 on roadmap 7.10 (target profile): **every display
 * derived from a project reads the catalog of the project's target profile.**
 *
 * Until now only the core grading did — the signed run (`/api/runs/create`)
 * and the A–D panel's lookup. The contract, the IT findings, the demo and the
 * client lookups of the management view, the fit panel and the process map's
 * level overlay read the default Public list, so a Private Edition project
 * showed one grade in its run and another beside it.
 *
 * The object that proves it: `I_BILLINGDOCUMENTITEMDEX` is released in the PCE
 * list and not listed in the Public one — level A under the project's target,
 * C under the default. A read of it is no finding under PCE and a standard
 * table read under Public.
 *
 * The grade itself stays out of the signed audit pack (CLAUDE.md); nothing
 * here writes one.
 *
 * Serverless: the builders and the lookups are called directly.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** An import of the snapshot registry, as opposed to a comment naming it. */
const IMPORTS_SNAPSHOTS = /from\s+['"][^'"]*catalog-snapshots['"]/;

const PCE_ONLY = 'I_BILLINGDOCUMENTITEMDEX';
const FILE = 'ZPCE_DERIVED.abap';
const SOURCE = [
  'REPORT zpce_derived.',
  `SELECT * FROM ${PCE_ONLY.toLowerCase()} INTO TABLE @DATA(lt_items).`,
  `UPDATE ${PCE_ONLY.toLowerCase()} SET netamount = 0 WHERE billingdocument = '1'.`,
  'SELECT * FROM vbak INTO TABLE @DATA(lt_orders).',
  '',
].join('\n');

/** A Private Edition project with no release named — the case the demo is too. */
const PCE_PROJECT = {
  s4Deployment: 'private',
  legacyCode: SOURCE,
  activeRunId: 'run-pce-derived',
  auditMetadata: { inputFingerprint: { fileName: FILE } },
};

/** The snapshot the signed run reads for this project — `/api/runs/create`, verbatim. */
const coreKey = catalogSnapshotRefFor('private', '').registryKey;

const accessUseOf = (kind: string): ObjectUse | null =>
  kind.endsWith('-read') ? 'read' : kind.endsWith('-write') ? 'write' : null;

test.describe('the premise', () => {
  test('the core run of a PCE project reads the PCE snapshot, and the object is graded differently there', () => {
    expect(coreKey).toBe('pce-latest');
    expect(gradeSapObjectUse(PCE_ONLY, 'read', coreKey).grade).toBe('A');
    expect(gradeSapObjectUse(PCE_ONLY, 'read').grade, 'the default list must grade it otherwise, or this spec proves nothing').not.toBe('A');
    // A direct write is D under either list (code-engine-05); the object's own level is what the catalog decides.
    expect(gradeSapObjectUse(PCE_ONLY, 'write', coreKey).grade).toBe('D');
  });

  test('the project target every display is given is the one the run reads', () => {
    const target = catalogLookupTargetOf(PCE_PROJECT);
    expect(target).toEqual({ edition: 'private', release: '' });
    // What /api/abcd-classify reads for `profile: target` …
    expect(catalogSnapshotKeyFor(target.edition, target.release)).toBe(coreKey);
    // … and what the server-side builders read for the project.
    expect(catalogSnapshotKeyForProject(PCE_PROJECT)).toBe(coreKey);
    // A named, pinned release is read from its pinned file on both sides.
    const pinned = { ...PCE_PROJECT, assessmentTarget: { release: '2023 FPS03' } };
    const t = catalogLookupTargetOf(pinned);
    expect(catalogSnapshotKeyForProject(pinned)).toBe(catalogSnapshotRefFor('private', '2023 FPS03').registryKey);
    expect(catalogSnapshotKeyFor(t.edition, t.release)).toBe(catalogSnapshotKeyForProject(pinned));
  });

  test('a project that names no edition reads what the run route reads for it: the Public list', () => {
    const none = { legacyCode: SOURCE };
    expect(catalogLookupTargetOf(none).edition).toBe('public');
    expect(catalogSnapshotKeyForProject(none)).toBe(catalogSnapshotRefFor('public', '').registryKey);
  });
});

test.describe('a PCE project gets the same grade in the core result and each derived display', () => {
  const core = buildAbapEvidence(SOURCE, FILE, 'private', coreKey);

  test('IT findings: the same findings as the core result, each at the level the core lookup gives', () => {
    const built = findingsOf(SOURCE, FILE, 'private', catalogSnapshotKeyForProject(PCE_PROJECT));
    expect(built.rows.map((r) => r.id)).toEqual(core.findings.map((f) => f.id));
    expect(built.rows.map((r) => r.kind)).toEqual(core.findings.map((f) => f.kind));
    // The released read is no finding under the PCE snapshot; the write is.
    expect(built.rows.some((r) => r.objectName === PCE_ONLY && r.kind.endsWith('-read'))).toBe(false);
    const write = built.rows.find((r) => r.objectName === PCE_ONLY);
    expect(write, 'the write of the PCE-only object is missing from the IT rows').toBeTruthy();
    expect(write!.level, 'written directly: D whatever the catalog says').toBe('D');
    expect(write!.objectLevel, 'the PCE list still releases the object itself: its own level is A').toBe('A');
    for (const row of built.rows) {
      if (!row.objectName) continue;
      expect(row.level, `${row.id} ${row.objectName}`).toBe(gradeSapObjectUse(row.objectName, accessUseOf(row.kind), coreKey).grade);
    }
  });

  test('IT findings route: it passes the project target, not the default list', () => {
    const route = read('app/api/projects/[projectId]/findings/route.ts');
    expect(route).toMatch(/findingsOf\([^)]*catalogSnapshotKeyForProject\(data\)\)/);
  });

  test('contract: derived from the same evidence as the core result', () => {
    const built = contractOfProject(PCE_PROJECT, null);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const route = routeExtensibility(core, 'private');
    const expected = buildArchitectureContract({
      contractId: FIRST_CONTRACT_ID,
      runId: PCE_PROJECT.activeRunId,
      inputManifest: null,
      evidence: core,
      route,
      deviation: null,
    });
    expect(built.contract.fingerprint).toBe(expected.fingerprint);

    // And it is not the contract the default list would give — otherwise the
    // equality above would hold whichever catalog the builder read.
    const publicEvidence = buildAbapEvidence(SOURCE, FILE, 'private');
    const fromDefault = buildArchitectureContract({
      contractId: FIRST_CONTRACT_ID,
      runId: PCE_PROJECT.activeRunId,
      inputManifest: null,
      evidence: publicEvidence,
      route: routeExtensibility(publicEvidence, 'private'),
      deviation: null,
    });
    expect(fromDefault.fingerprint, 'the contract does not depend on the catalog at all — pick a better fixture').not.toBe(expected.fingerprint);
  });

  test('demo: the Private Edition demo reads the PCE snapshot in its evidence and its IT rows', () => {
    const data = buildDemoWorkspace();
    expect(data.demo.deployment).toBe('private');
    const demoKey = catalogSnapshotKeyForProject(data.project);
    expect(demoKey).toBe(coreKey);
    expect(data.demo.catalogSnapshot).toBe(demoKey);

    const demoCore = buildAbapEvidence(data.source, data.demo.sourceFile, 'private', demoKey);
    expect(data.demo.analyze.findings.map((f) => f.id)).toEqual(demoCore.findings.map((f) => f.id));
    expect(data.itFindings.rows.map((r) => r.id)).toEqual(demoCore.findings.map((f) => f.id));
    for (const row of data.itFindings.rows) {
      if (!row.objectName) continue;
      expect(row.level, `${row.id} ${row.objectName}`).toBe(gradeSapObjectUse(row.objectName, accessUseOf(row.kind), demoKey).grade);
    }
  });

  test('client lookups: every display that asks /api/abcd-classify names the project target', () => {
    // The hook takes the target as a required argument, so the compiler holds
    // the call sites; this holds the values they pass.
    const callers: Array<[string, RegExp]> = [
      // The Management overview and the demo panel share one derivation since the
      // executive rebuild; the lookup lives in that hook now.
      ['hooks/useFitByPlatform.ts', /useAbcdCatalogLookup\(lookupObjects, project \? catalogLookupTargetOf\(project\) : null\)/],
      ['components/workspace/ManagementOverview.tsx', /useFitByPlatform\(findings, project,/],
      ['components/workspace/PublicCloudFitPanel.tsx', /useAbcdCatalogLookup\(lookupObjects, project \? catalogLookupTargetOf\(project\) : null\)/],
      // The print sheet's level column — owner decision 01.10.2026.
      ['components/workspace/WorkspacePrintSheet.tsx', /useAbcdCatalogLookup\(objects, project \? catalogLookupTargetOf\(project\) : null\)/],
      ['hooks/useProcessOverlays.ts', /useAbcdCatalogLookup\(objects, catalogTarget\)/],
      ['components/analyze/UsageRiskMatrix.tsx', /useAbcdCatalogLookup\(lookupObjects, target\)/],
      ['app/(app)/project/[projectId]/documentation/page.tsx', /catalogTarget=\{project \? catalogLookupTargetOf\(project\) : null\}/],
      ['components/demo/DemoWorkspaceShell.tsx', /catalogTarget=\{catalogLookupTargetOf\(project\)\}/],
      ['components/workspace/WorkspaceProcess.tsx', /catalogTarget=\{project \? catalogLookupTargetOf\(project\) : null\}/],
      ['app/(app)/project/[projectId]/analyze/page.tsx', /target=\{project \? catalogLookupTargetOf\(project\) : null\}/],
    ];
    for (const [file, pattern] of callers) expect(read(file), file).toMatch(pattern);

    // The hook sends the target as the route's `profile`, and the route reads it.
    const hook = read('hooks/useAbcdCatalogLookup.ts');
    expect(hook).toContain('profile: { edition, release }');
    expect(read('app/api/abcd-classify/route.ts')).toContain('readKey = catalogSnapshotKeyFor(edition, release);');
  });
});

test.describe('boundaries', () => {
  test('the PCE files stay on the server: no client module imports the snapshot registry', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = read(rel);
          if (/^['"]use client['"]/m.test(src) && IMPORTS_SNAPSHOTS.test(src)) offenders.push(rel);
        }
      }
    };
    for (const dir of ['app', 'components', 'hooks', 'lib']) walk(dir);
    expect(offenders).toEqual([]);
    // The helper the client uses to name the target is pure.
    expect(read('lib/assessment-target.ts')).not.toMatch(IMPORTS_SNAPSHOTS);
  });

  test('the grade stays out of the signed audit pack', () => {
    const pack = read('lib/audit-pack.ts');
    expect(pack).not.toContain('gradeSapObject');
    expect(pack).not.toContain('catalogLookupTargetOf');
  });
});
