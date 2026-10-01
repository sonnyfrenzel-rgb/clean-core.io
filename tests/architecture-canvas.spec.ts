import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { architectureCanvasModel, findingIdsOfKey } from '../lib/architecture-canvas';
import { findingsOf } from '../lib/it-findings-build';
import { contractOfProject } from '../lib/contract-build';

/**
 * The Design canvas (proposal B "Canvas first", owner decision 01.10.2026) is
 * drawn from the contract and the engine's findings and nothing else. Pure:
 * no browser, no server — the same functions the two routes run.
 */

const EXAMPLE = fs.readFileSync(path.join(__dirname, '..', 'public', 'starter-examples', 'Z_MM_PO_APPROVAL.abap'), 'utf8');

function canvasOf(source: string, deployment: 'public' | 'private') {
  const built = contractOfProject({ legacyCode: source, s4Deployment: deployment, activeRunId: 'run-1' }, null);
  if (!built.ok) throw new Error('no contract');
  const { rows } = findingsOf(source, 'main.abap', deployment);
  return { contract: built.contract, rows, model: architectureCanvasModel({ contract: built.contract, findings: rows, deployment }) };
}

test.describe('the architecture canvas is derived, not drawn freehand', () => {
  test('the shipped example: route, successors, gaps and custom tables come from the findings', () => {
    const { contract, rows, model } = canvasOf(EXAMPLE, 'private');
    expect(model.route).toBe(contract.route.chosen);
    expect(model.route).toBe('side-by-side-cap');

    // Every successor box is a successor the catalog named on a finding, with its lines.
    const named = rows.filter((r) => r.successor);
    expect(model.successorUses).toBe(named.length);
    expect(model.successors.map((s) => s.name).sort()).toEqual([...new Set(named.map((r) => r.successor!))].sort());
    for (const s of model.successors) {
      const own = rows.filter((r) => r.successor === s.name);
      expect(s.lines).toEqual([...new Set(own.map((r) => r.lineStart))].sort((a, b) => a - b));
      // The tag is the catalog's object type, never a guess from the name.
      expect(s.type).toBe(own[0].successorType ?? null);
    }
    // OData before CDS.
    const tags = model.successors.map((s) => s.tag);
    expect(tags.indexOf('cds')).toBeGreaterThan(tags.lastIndexOf('odata'));

    // Gaps: SAP objects with no successor; the screen automation first.
    expect(model.gaps[0].object).toBe('ME21N');
    for (const g of model.gaps) {
      expect(rows.filter((r) => r.objectName === g.object).every((r) => !r.successor)).toBe(true);
    }

    // Custom tables: writes first, and a write is a write.
    const writes = model.customTables.filter((t) => t.use === 'write').map((t) => t.name);
    expect(writes.length).toBeGreaterThan(0);
    expect(model.customTables.slice(0, writes.length).every((t) => t.use === 'write')).toBe(true);
    for (const name of writes) {
      expect(rows.some((r) => r.objectName === name && r.kind === 'custom-table-write')).toBe(true);
    }

    // The reason under the runtime is the router's own rule, with its lines.
    expect(model.driverPhrases.map((d) => d.text)).toContain('BDC ME21N');
    expect(model.targetArtifact).toBe('CAP Node.js / Java Application');

    // A click on a box lists exactly the findings behind it.
    const first = model.successors[0];
    expect(findingIdsOfKey(model, first.key)).toEqual(first.findingIds);
  });

  test('code that stays on the stack is drawn as the in-app route', () => {
    const { model } = canvasOf(`REPORT z_mm_report.\nDATA: lv_c TYPE i.\nSELECT COUNT(*) FROM ekpo INTO lv_c.\nWRITE lv_c.\n`, 'public');
    expect(model.route).toBe('in-app-rap');
    expect(model.drivers).toEqual([]);
    expect(model.fileTransfers).toEqual([]);
  });

  test('without a contract there is no route to draw', () => {
    const model = architectureCanvasModel({ contract: null, findings: [] });
    expect(model.route).toBeNull();
    expect(model.runtime).toBeNull();
  });
});

test('the canvas does not pull the catalog into the browser', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  // The design stage is a client page: it reads the findings and the contract
  // from their routes, and its own modules reach neither the catalog nor the
  // engine that loads it — only types from the evidence model.
  for (const rel of [
    'lib/architecture-canvas.ts',
    'components/design/ArchitectureCanvas.tsx',
    'components/design/DesignCanvasStage.tsx',
    'hooks/useDesignEvidence.ts',
  ]) {
    const src = read(rel);
    expect(src, rel).not.toMatch(/from ['"][^'"]*(catalog-service|it-findings-build|contract-build)['"]/);
    expect(src, rel).not.toMatch(/^import (?!type)[^;]*from ['"][^'"]*evidence-model['"]/m);
  }
  // `routeDrivers` is the router's rule; the router takes nothing but types from the engine.
  const router = read('lib/abap/extensibility-router.ts');
  const engineImports = [...router.matchAll(/^import ([^;]*) from ['"]\.\/evidence-model['"]/gm)].map((m) => m[1]);
  expect(engineImports).toEqual(['{ AbapEvidenceReport, EvidenceKind }']);
});

test('the canvas hands the router its findings as they are, not cast into a report', () => {
  // Carried QA finding 596831bd53a3: `{ findings } as unknown as
  // AbapEvidenceReport` would have hidden any field the router started to read.
  const canvas = fs.readFileSync(path.join(__dirname, '..', 'lib/architecture-canvas.ts'), 'utf8');
  expect(canvas).not.toMatch(/as unknown as AbapEvidenceReport/);
  expect(canvas).toContain('routeDrivers({ findings },');
});
