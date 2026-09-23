import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessMapModel, type ProcessMapModel } from '../lib/process-map';
import { buildNavigation, type ProcessNavigation } from '../lib/process-navigation';
import { readTableDependencies } from '../lib/abap/table-dependencies';
import { readCallGraph } from '../lib/abap/call-graph';
import { buildAbapEvidence, type EvidenceFinding } from '../lib/abap/evidence-model';
import type { GradedObject } from '../lib/abap/abcd-classification';
import type { UsageReport } from '../lib/abap/usage-model';
import {
  buildFindingsOverlay,
  buildLevelOverlay,
  buildUsageOverlay,
  lookupObjects,
  objectSites,
  sitesByElement,
  elementRanges,
  LEVEL_OVERLAY_NOTE,
  type ObjectSite,
} from '../lib/process-overlays';
import { buildAuditPackContents, attestationsOf } from '../lib/audit-pack-build';

/**
 * Roadmap 6.3 — overlays on the process model, and the line they may not cross.
 *
 * The step adds three marks to the map: the clean core level of the code behind
 * a task, the findings at its lines, and the usage an import measured for the
 * objects it calls. All three are **display**. `CLAUDE.md`: *"The grade is
 * never part of the signed audit pack."*
 *
 * So this file has two halves.
 *
 * **The join.** Every mark is produced by a line anchor and nothing else, the
 * innermost element owns a statement, and an unknown stays unknown: no grades
 * yet means no level overlay rather than a level overlay counting zero, and no
 * usage import means no usage overlay rather than one reporting that every step
 * is unused. That distinction is the whole reason `usage-model.ts` keeps
 * `callCount: null` apart from `0`.
 *
 * **The line.** An overlay that is switched on may not move a signed byte. Two
 * checks hold it: a run carrying level data produces the same signed files
 * byte-for-byte, and no chain of imports leads from a pack builder to the
 * overlay module or to `abcd-classification.ts`. Both are green today and are
 * here to stay green; the counter-check below changes a real run field and
 * shows the comparison is not vacuous.
 */

const EXAMPLE = path.resolve(
  __dirname, '..', 'public', 'starter-examples', 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap',
);
const FILE_NAME = 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap';
const PROCESS_NAME = 'Order fulfilment audit';

/** Line feeds only — the same bytes here and in CI (`CLAUDE.md`, gotchas). */
function exampleSource(): string {
  return fs.readFileSync(EXAMPLE, 'utf8').replace(/\r\n/g, '\n');
}

let cached: { source: string; model: ProcessMapModel; nav: ProcessNavigation } | null = null;
function fixture() {
  if (cached) return cached;
  const source = exampleSource();
  const bpmn = buildBpmnExportFromSource(source, { processName: PROCESS_NAME, sourceFileName: FILE_NAME });
  const named = applyNaming(namingContextOf(source), null, 'no-key');
  const model = buildProcessMapModel({ bpmn, named, fileName: FILE_NAME });
  cached = { source, model, nav: buildNavigation(model) };
  return cached;
}

let callsCache: ReturnType<typeof readCallGraph> | null = null;
function calls() {
  if (!callsCache) callsCache = readCallGraph(fixture().source);
  return callsCache;
}

function sites(): ObjectSite[] {
  return objectSites(readTableDependencies(fixture().source), calls());
}

let findingsCache: EvidenceFinding[] | null = null;
function findings(): EvidenceFinding[] {
  if (!findingsCache) findingsCache = buildAbapEvidence(fixture().source, FILE_NAME).findings;
  return findingsCache;
}

const spanOf = (model: ProcessMapModel, id: string) =>
  model.elements.find((element) => element.id === id)?.anchor ?? null;

/* ------------------------------------------------------------------ *
 * The join.
 * ------------------------------------------------------------------ */

test.describe('object sites', () => {
  test('the example has named objects, each with a line inside the file', () => {
    const lines = fixture().source.split('\n').length;
    const found = sites();
    expect(found.length, 'the 1.000-line example touches no named object').toBeGreaterThan(20);
    for (const site of found) {
      expect(site.line, `${site.name} is anchored outside the file`).toBeGreaterThan(0);
      expect(site.line).toBeLessThanOrEqual(lines);
      expect(site.name, 'a site carries an unnormalised name').toBe(site.name.toUpperCase());
    }
    // Both readers contributed; a regression that silently loses one half of
    // the join would otherwise still pass the count above.
    const kinds = new Set(found.map((site) => site.kind));
    expect(kinds.has('table')).toBe(true);
    expect(kinds.has('function-module')).toBe(true);
  });

  test('a table read and the same table written are two lookups, not one', () => {
    const objects = lookupObjects([
      { name: 'KNA1', kind: 'table', use: 'read', line: 10 },
      { name: 'KNA1', kind: 'table', use: 'write', line: 20 },
      { name: 'KNA1', kind: 'table', use: 'read', line: 30 },
    ]);
    expect(objects).toEqual([
      { name: 'KNA1', use: 'read' },
      { name: 'KNA1', use: 'write' },
    ]);
  });

  test('a possible target of an unresolved dynamic name is not a site (R26)', () => {
    const { source } = fixture();
    const report = readTableDependencies(source);
    const possible = report.dependencies.filter((dependency) => dependency.possibleTargetOf);
    test.skip(possible.length === 0, 'this example shows no possible target for a dynamic name');
    const found = sites();
    for (const dependency of possible) {
      const leaked = found.some(
        (site) => site.line === dependency.line && site.name === dependency.table.toUpperCase(),
      );
      expect(leaked, `${dependency.table} leaked into the overlay as a real access`).toBe(false);
    }
  });
});

test.describe('the code behind a task', () => {
  /**
   * The measurement this rule exists for, kept as an assertion.
   *
   * On the 1.000-line example the 77 elements are anchored to the statement
   * that drew them — median width **one line** — so joining on the anchor
   * alone placed 8 of 102 object sites: the line that calls a routine, not the
   * code behind it. With the performed `FORM` bodies it is 23 on 17 elements.
   * The floor below is the earlier number, so losing the body join again is
   * red rather than merely thinner.
   */
  test('a performed routine belongs to the step that performs it', () => {
    const { model, nav } = fixture();
    const anchorsOnly = sitesByElement(model, nav, sites(), null);
    const withBodies = sitesByElement(model, nav, sites(), calls());

    const count = (placed: Map<string, ObjectSite[]>) =>
      [...placed.values()].reduce((sum, owned) => sum + owned.length, 0);

    expect(count(anchorsOnly), 'the anchors alone stopped placing anything').toBeGreaterThan(0);
    expect(count(withBodies), 'the performed bodies added nothing').toBeGreaterThan(count(anchorsOnly));
    expect(withBodies.size).toBeGreaterThan(anchorsOnly.size);

    const ranges = elementRanges(model, nav, calls());
    expect(ranges.filter((range) => range.of === 'body').length).toBeGreaterThan(0);
    // The median anchor really is one line — the number the rule rests on.
    const widths = model.elements
      .filter((element) => element.anchor !== null)
      .map((element) => {
        const span = element.anchor as { lineStart: number; lineEnd: number };
        return span.lineEnd - span.lineStart + 1;
      })
      .sort((a, b) => a - b);
    expect(widths[Math.floor(widths.length / 2)]).toBe(1);
  });

  test('a body is taken one level, not through the routines it performs in turn', () => {
    const { model, nav } = fixture();
    const graph = calls();
    const bodies = elementRanges(model, nav, graph).filter((range) => range.of === 'body');
    const forms = new Map(graph.forms.map((form) => [form.name.toUpperCase(), form]));
    for (const body of bodies) {
      const form = graph.forms.find(
        (candidate) => candidate.lineStart === body.lineStart && candidate.lineEnd === body.lineEnd,
      );
      expect(form, 'a body range matches no FORM of this source').toBeTruthy();
      // The routine this one performs is a range of its own only if some
      // element's own anchor sits on that PERFORM — never inherited upwards.
      const inner = graph.performs.filter(
        (perform) => perform.lineStart >= body.lineStart
          && perform.lineStart <= body.lineEnd
          && perform.target
          && forms.has(perform.target.toUpperCase()),
      );
      for (const perform of inner) {
        const nested = forms.get((perform.target as string).toUpperCase());
        const inheritedByTheSameElement = bodies.some(
          (other) => other.id === body.id
            && other.lineStart === (nested as { lineStart: number }).lineStart
            && other.lineEnd === (nested as { lineEnd: number }).lineEnd,
        );
        const elementSitsOnThatPerform = model.elements.some((element) => {
          const span = element.anchor;
          return span !== null && perform.lineStart >= span.lineStart && perform.lineStart <= span.lineEnd;
        });
        if (!elementSitsOnThatPerform) {
          expect(inheritedByTheSameElement, `${perform.target} was inherited upwards into ${body.id}`).toBe(false);
        }
      }
    }
  });
});

test.describe('the innermost element owns a statement', () => {
  test('every placed site sits in a range of its element, and in no narrower one', () => {
    const { model, nav } = fixture();
    const placed = sitesByElement(model, nav, sites(), calls());
    expect(placed.size, 'no element carries any object').toBeGreaterThan(0);

    const ranges = elementRanges(model, nav, calls());
    const containing = (line: number) =>
      ranges.filter((range) => line >= range.lineStart && line <= range.lineEnd);

    for (const [id, owned] of placed) {
      expect(spanOf(model, id), `${id} carries objects but has no anchor`).not.toBeNull();
      for (const site of owned) {
        const here = containing(site.line);
        const mine = here.filter((range) => range.id === id);
        expect(mine.length, `${site.name} at line ${site.line} was placed on ${id}, which does not cover it`).toBeGreaterThan(0);
        const width = Math.min(...mine.map((range) => range.lineEnd - range.lineStart));
        const narrower = here.some((range) => range.id !== id && range.lineEnd - range.lineStart < width);
        expect(narrower, `${site.name} at line ${site.line} was placed on a wider range than the one containing it`).toBe(false);
      }
    }
  });

  test('a site is placed once, never on a step and its phase both', () => {
    const { model, nav } = fixture();
    const placed = sitesByElement(model, nav, sites(), calls());
    const ranges = elementRanges(model, nav, calls());
    const coverable = sites().filter(
      (site) => ranges.some((range) => site.line >= range.lineStart && site.line <= range.lineEnd),
    ).length;
    const counted = [...placed.values()].reduce((sum, owned) => sum + owned.length, 0);
    // A sub-process body contains the elements drawn inside it, so a statement
    // is inside several ranges. It may still appear on exactly one element.
    expect(counted, 'a statement was counted on more than one element').toBe(coverable);
    expect(coverable, 'nothing was coverable, so the equality above is vacuous').toBeGreaterThan(0);
  });

  test('an unanchored element carries nothing', () => {
    const { model, nav } = fixture();
    const placed = sitesByElement(model, nav, sites(), calls());
    for (const element of model.elements) {
      if (element.anchor !== null) continue;
      expect(placed.has(element.id), `${element.id} has no line anchor but was given objects`).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Level A–D.
 * ------------------------------------------------------------------ */

test.describe('the level overlay', () => {
  const graded = (grade: GradedObject['grade']): GradedObject => ({ grade, provenance: 'catalog' });

  test('no answer yet is no overlay, not an overlay counting zero', () => {
    const { model, nav } = fixture();
    const placed = sitesByElement(model, nav, sites(), calls());
    expect(buildLevelOverlay(placed, {}, nav)).toBeNull();
  });

  test('the mark is the worst level of the objects behind the element, and names it', () => {
    const nav = { order: ['e1'] } as unknown as ProcessNavigation;
    const placed = new Map<string, ObjectSite[]>([['e1', [
      { name: 'VBAK', kind: 'table', use: 'read', line: 10 },
      { name: 'ZSD_LOG', kind: 'table', use: 'write', line: 11 },
      { name: 'BAPI_SALESORDER_CREATE', kind: 'function-module', use: null, line: 12 },
    ]]]);
    const overlay = buildLevelOverlay(placed, {
      'VBAK@read': graded('C'),
      'ZSD_LOG@write': graded('D'),
      BAPI_SALESORDER_CREATE: graded('A'),
    }, nav);
    expect(overlay).not.toBeNull();
    expect(overlay?.ids).toEqual(['e1']);
    // Worst first, the object that carries it named, the other two counted.
    expect(overlay?.marks.get('e1')).toBe('D · ZSD_LOG (write) +2');
  });

  test('the note says which snapshot answered, and that there is only one', () => {
    const nav = { order: ['e1'] } as unknown as ProcessNavigation;
    const placed = new Map<string, ObjectSite[]>([['e1', [{ name: 'VBAK', kind: 'table', use: 'read', line: 10 }]]]);
    const overlay = buildLevelOverlay(placed, { 'VBAK@read': graded('C') }, nav);
    expect(overlay?.note).toBe(LEVEL_OVERLAY_NOTE);
    expect(LEVEL_OVERLAY_NOTE).toContain('abap-atc-cr-cv-s4hc');
    expect(LEVEL_OVERLAY_NOTE).toContain('Public Edition');
    expect(LEVEL_OVERLAY_NOTE).toContain('no second snapshot');
  });

  test('an object the lookup did not answer for does not become a level', () => {
    const nav = { order: ['e1'] } as unknown as ProcessNavigation;
    const placed = new Map<string, ObjectSite[]>([['e1', [
      { name: 'VBAK', kind: 'table', use: 'read', line: 10 },
      { name: 'NOT_IN_THE_ANSWER', kind: 'function-module', use: null, line: 11 },
    ]]]);
    const overlay = buildLevelOverlay(placed, { 'VBAK@read': graded('C') }, nav);
    expect(overlay?.marks.get('e1')).toBe('C · VBAK (read)');
  });
});

/* ------------------------------------------------------------------ *
 * Findings.
 * ------------------------------------------------------------------ */

test.describe('the findings overlay', () => {
  test('the example marks elements, and every mark names a finding of the run', () => {
    const { model, nav } = fixture();
    const overlay = buildFindingsOverlay(model, nav, findings(), calls());
    expect(findings().length, 'the example produced no findings to join').toBeGreaterThan(0);
    expect(overlay.ids.length, 'no element carries a finding').toBeGreaterThan(0);
    const ids = new Set(findings().map((finding) => finding.id));
    for (const id of overlay.ids) {
      const mark = overlay.marks.get(id) as string;
      const [names] = mark.split(' · ');
      for (const name of names.replace(/ \+\d+$/, '').split(', ')) {
        expect(ids.has(name), `${name} is not a finding of this run`).toBe(true);
      }
    }
  });

  test('a marked element covers the line of the finding it is marked with', () => {
    const { model, nav } = fixture();
    const overlay = buildFindingsOverlay(model, nav, findings(), calls());
    const byId = new Map(findings().map((finding) => [finding.id, finding]));
    const ranges = elementRanges(model, nav, calls());
    for (const id of overlay.ids) {
      const first = (overlay.marks.get(id) as string).split(' · ')[0].replace(/ \+\d+$/, '').split(', ')[0];
      const finding = byId.get(first) as EvidenceFinding;
      const covered = ranges.some((range) => range.id === id
        && finding.lineStart >= range.lineStart && finding.lineStart <= range.lineEnd);
      expect(covered, `${finding.id} at line ${finding.lineStart} is marked on ${id}, which does not cover it`).toBe(true);
    }
  });

  test('a finding no element covers is marked nowhere, rather than on the nearest one', () => {
    const { model, nav } = fixture();
    const beyond = { ...findings()[0], id: 'CC-999', lineStart: 10 ** 6 } as EvidenceFinding;
    const overlay = buildFindingsOverlay(model, nav, [beyond], calls());
    expect(overlay.ids).toEqual([]);
    expect(overlay.marks.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * Usage.
 * ------------------------------------------------------------------ */

test.describe('the usage overlay', () => {
  const report = (records: UsageReport['records']): UsageReport =>
    ({ records, source: 'scmon' } as UsageReport);
  const nav = { order: ['e1'] } as unknown as ProcessNavigation;
  const placed = new Map<string, ObjectSite[]>([['e1', [
    { name: 'Z_CREDIT_CHECK', kind: 'function-module', use: null, line: 10 },
    { name: 'VBAK', kind: 'table', use: 'read', line: 11 },
  ]]]);

  test('no import is no overlay — never an overlay saying every step is unused', () => {
    expect(buildUsageOverlay(placed, nav, null)).toBeNull();
    expect(buildUsageOverlay(placed, nav, undefined)).toBeNull();
    expect(buildUsageOverlay(placed, nav, report([]))).toBeNull();
  });

  test('a measured count is printed as the export recorded it', () => {
    const overlay = buildUsageOverlay(placed, nav, report([
      { objectName: 'Z_CREDIT_CHECK', callCount: 1204, lastUsed: '2026-03-04', source: 'scmon' },
    ]));
    expect(overlay?.ids).toEqual(['e1']);
    expect(overlay?.marks.get('e1')).toBe('Z_CREDIT_CHECK · 1204 calls · last used 2026-03-04');
    expect(overlay?.note).toContain('not a judgement of use');
  });

  test('an export without a count says so, and never says zero', () => {
    const overlay = buildUsageOverlay(placed, nav, report([
      { objectName: 'Z_CREDIT_CHECK', callCount: null, source: 'scmon' },
    ]));
    const mark = overlay?.marks.get('e1') as string;
    expect(mark).toContain('no count in the export');
    expect(mark).not.toContain('0 calls');
    expect(mark).toContain('no last-use date');
  });

  test('a table is never matched against a usage export', () => {
    const overlay = buildUsageOverlay(placed, nav, report([
      { objectName: 'VBAK', callCount: 99, source: 'scmon' },
    ]));
    expect(overlay?.ids, 'a table name was read as an executed object').toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The line the overlay may not cross.
 * ------------------------------------------------------------------ */

test.describe('an overlay is display, not content', () => {
  const run = {
    runId: 'run-1',
    projectId: 'proj-1',
    userId: 'u-1',
    createdAt: '2026-09-16T08:00:00.000Z',
    status: 'completed',
    inputFingerprint: { sha256: 'a'.repeat(64), fileName: FILE_NAME, lineCount: 1000, byteSize: 40960, objectType: 'Report' },
    analyzerVersion: '2.10.8',
    rulesetVersion: 'rules-v1.0',
    sapApiCatalogVersion: '2026.09',
    model: { provider: 'google-gemini', modelId: 'gemini-3-flash-preview', engineVersion: '2.10.8', byokUsed: false },
    extensibilityRoute: 'rap',
    cleanCoreScore: 71,
    complexityScore: 40,
    criticalityScore: 55,
    evidenceReport: [],
    dataCoupling: [{ table: 'VBAK', accessType: 'read', lineNumber: 12 }],
    codeInventory: [],
    worklist: [],
    originalRecommendation: 'rap',
    recommendationConfidence: 82,
    recommendationJustification: 'Released CDS views cover every read.',
    runHash: 'b'.repeat(64),
    signature: 'c'.repeat(64),
  };
  const auditMetadata = {
    inputFingerprint: { ...run.inputFingerprint, uploadedAt: '2026-09-16T08:00:00.000Z' },
    modelCard: { provider: 'google-gemini', model: 'gemini-3-flash-preview', engineVersion: '2.10.8', catalogVersion: '2026.09', byokUsed: false, analysisTimestamp: '2026-09-16T08:00:00.000Z' },
  };
  const stable = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, '<ts>');

  const build = (extra: Record<string, unknown>) => buildAuditPackContents({
    projectId: 'proj-1',
    runId: 'run-1',
    run: { ...run, ...extra },
    auditMetadata,
    attested: attestationsOf({ name: 'Order intake', status: 'analyzed' } as never),
  });

  test('a run carrying level and overlay data produces the same signed bytes', () => {
    const { model, nav } = fixture();
    const placed = sitesByElement(model, nav, sites(), calls());
    const overlay = buildLevelOverlay(placed, {
      'VBAK@read': { grade: 'D', provenance: 'catalog' },
    }, nav);

    const plain = build({});
    const withLevel = build({
      // Exactly the shape a future mistake would take: the overlay's own output
      // written onto the run and handed to the pack builder.
      cleanCoreLevels: Object.fromEntries(overlay?.marks ?? []),
      processOverlays: ['level', 'findings', 'usage'],
      abcdGrade: 'D',
    });

    expect(Object.keys(withLevel.signed).sort()).toEqual(Object.keys(plain.signed).sort());
    for (const file of Object.keys(plain.signed)) {
      expect(stable(withLevel.signed[file]), `${file} moved when a level reached the run`).toBe(stable(plain.signed[file]));
    }
  });

  test('the comparison above is sensitive — a real run field does move the bytes', () => {
    const a = build({});
    const b = build({ cleanCoreScore: 12 });
    expect(stable(b.signed['00-executive-summary.md'])).not.toBe(stable(a.signed['00-executive-summary.md']));
  });

  /**
   * The imports that survive to runtime, and only those.
   *
   * `import type` is erased, and so is `import('./abap/usage-model').UsageReport`
   * in a type position — `lib/types.ts` is full of the latter, and following
   * them makes the closure of every file the whole repository, which proves
   * nothing. What this guard is about is code that *runs*: a pack builder that
   * can call `gradeSapObject` is a pack builder one line away from signing a
   * level. So: comments stripped, `import type`/`export type` skipped, and a
   * bare `import('x')` counted only where it is not immediately dereferenced.
   */
  const valueImports = (text: string): string[] => {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    const out: string[] = [];
    for (const match of code.matchAll(/^[ \t]*(?:import|export)\s+(?!type\b)[^;'"]*from\s*['"]([^'"]+)['"]/gm)) {
      out.push(match[1]);
    }
    for (const match of code.matchAll(/^[ \t]*import\s*['"]([^'"]+)['"]/gm)) out.push(match[1]);
    for (const match of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)(?!\s*\.)/g)) out.push(match[1]);
    return out;
  };

  test('no chain of imports leads from a pack builder to the overlays or the grade', () => {
    const ROOT = path.resolve(__dirname, '..');
    const resolve = (spec: string, from: string): string | null => {
      const base = spec.startsWith('@/')
        ? path.resolve(ROOT, spec.slice(2))
        : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
      if (!base) return null;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      }
      return null;
    };

    const forbidden = [
      path.resolve(ROOT, 'lib/process-overlays.ts'),
      path.resolve(ROOT, 'hooks/useProcessOverlays.ts'),
      path.resolve(ROOT, 'lib/abap/abcd-classification.ts'),
    ];
    const roots = [
      'lib/audit-pack.ts',
      'lib/audit-pack-build.ts',
      'lib/audit-pack-canonical.ts',
    ].map((rel) => path.resolve(ROOT, rel));

    for (const root of roots) {
      const seen = new Set<string>();
      const queue = [root];
      const via = new Map<string, string>();
      while (queue.length > 0) {
        const file = queue.shift() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const spec of valueImports(fs.readFileSync(file, 'utf8'))) {
          const next = resolve(spec, file);
          if (!next || seen.has(next)) continue;
          via.set(next, file);
          queue.push(next);
        }
      }
      for (const bad of forbidden) {
        expect(seen.has(bad), `${path.relative(ROOT, root)} reaches ${path.relative(ROOT, bad)} via ${path.relative(ROOT, via.get(bad) ?? '')}`).toBe(false);
      }
    }
  });

  /**
   * The run route is checked by symbol, not by closure, and the reason is a
   * measurement: `app/api/runs/create/route.ts` **does** reach
   * `abcd-classification.ts`, through `getMergedCatalogVersion` in
   * `catalog-service.ts`. That is the catalog *version string* the run records
   * as `sapApiCatalogVersion`, not a level, and forbidding the module would
   * forbid the version. So the assertion is the narrow one that is actually
   * true: the route takes nothing grade-shaped out of that module, and writes
   * no grade onto the run.
   */
  test('the run route takes a catalog version out of the catalog, never a level', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/runs/create/route.ts'), 'utf8');
    const imported = [...route.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/abap\/catalog-service['"]/g)]
      .flatMap((match) => match[1].split(',').map((name) => name.trim()))
      .filter(Boolean);
    expect(imported).toEqual(['getMergedCatalogVersion']);
    for (const symbol of ['gradeSapObject', 'gradeSapObjectUse', 'CloudReadinessGrade', 'cleanCoreLevel', 'abcdGrade']) {
      expect(route, `the run route names ${symbol}`).not.toContain(symbol);
    }
  });
});
